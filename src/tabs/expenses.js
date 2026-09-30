import { liveQuery } from 'dexie'
import { db } from '../db.js'

const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const number = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatCents = (cents) => currency.format(cents / 100)
const dayLabel = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
})

const MAX_DAYS = 366

// Tous les calculs se font en centimes pour éviter les erreurs d'arrondi des flottants
const toCents = (amount) => Math.round(Number(amount) * 100)
// Accepte aussi une valeur déjà formatée ("1 234,50 €") : espaces et symbole retirés
const parseAmount = (value) => Number(String(value).replace(/[\s€]/g, '').replace(',', '.'))

// Dates manipulées en 'YYYY-MM-DD' et en UTC pour ne pas subir les changements d'heure
function eachDate(startDate, endDate) {
  const dates = []
  const cursor = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  while (cursor <= end && dates.length < MAX_DAYS) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function localToday() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function addMonths(isoDate, months) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().slice(0, 10)
}

function monthName(isoDate) {
  const name = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  )
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Tableau en cascade (montants en centimes) :
 *   €/JOURS(n)     = dailyAllowance
 *   Disponible(n)  = €/JOURS(n) + Report(n-1)   (Report(0) = 0)
 *   Report(n)      = Disponible(n) - Dépense(n)
 *   J(n)           = nombre de jours sans dépense pour revenir à l'équilibre, c.-à-d. le plus petit
 *                    k >= 0 tel que Report(n) + k × €/JOURS >= 0 (0 si Report(n) >= 0)
 */
export function computeSchedule(month, records) {
  const expenses = new Map()
  for (const record of records) {
    expenses.set(record.date, (expenses.get(record.date) ?? 0) + toCents(record.expense))
  }

  const allowance = toCents(month.dailyAllowance)
  let previousReport = 0

  return eachDate(month.startDate, month.endDate).map((date) => {
    const expense = expenses.get(date) ?? 0
    const available = allowance + previousReport
    const report = available - expense
    const j = report >= 0 ? 0 : Math.ceil(-report / allowance)
    previousReport = report
    return { date, allowance, expense, hasExpense: expenses.has(date), available, report, j }
  })
}

function buildRow(date) {
  const tr = document.createElement('tr')
  tr.dataset.date = date
  tr.innerHTML = `
    <th scope="row" class="px-2 py-1.5 text-left whitespace-nowrap"></th>
    <td data-col="allowance" class="px-2 py-1.5 text-right whitespace-nowrap tabular-nums"></td>
    <td class="px-1 py-1">
      <input
        data-col="expense"
        type="text"
        inputmode="decimal"
        placeholder="0,00 €"
        class="w-full min-w-20 rounded-md border border-border bg-surface-muted px-2 py-1 text-right tabular-nums"
      />
    </td>
    <td data-col="report" class="px-2 py-1.5 text-right whitespace-nowrap tabular-nums"></td>
    <td data-col="j" class="px-2 py-1.5 text-right tabular-nums"></td>
  `
  tr.querySelector('th').textContent = dayLabel.format(new Date(`${date}T00:00:00Z`))
  tr.querySelector('[data-col="expense"]').setAttribute('aria-label', `Dépense du ${date}`)
  return tr
}

function updateRow(tr, row, isToday) {
  // Ligne du jour : surbrillance + gras (l'input hérite de la graisse via le preflight Tailwind)
  tr.classList.toggle('bg-primary/10', isToday)
  tr.classList.toggle('font-bold', isToday)
  tr.querySelector('th').classList.toggle('text-fg-muted', !isToday)
  tr.querySelector('[data-col="allowance"]').textContent = formatCents(row.allowance)

  const input = tr.querySelector('[data-col="expense"]')
  // Ne pas écraser la saisie en cours
  if (document.activeElement !== input) {
    input.value = row.hasExpense ? formatCents(row.expense) : ''
  }

  const report = tr.querySelector('[data-col="report"]')
  report.textContent = formatCents(row.report)
  report.classList.toggle('text-danger', row.report < 0)

  const j = tr.querySelector('[data-col="j"]')
  j.textContent = String(row.j)
  j.classList.toggle('text-danger', row.j > 0)
  j.classList.toggle('text-fg-muted', row.j === 0)
}

// Fond du cadre « Disponible aujourd'hui » selon le signe du montant
const TODAY_CARD_CLASSES = {
  positive: ['bg-success-solid', 'text-white'],
  zero: ['bg-primary', 'text-primary-fg'],
  negative: ['bg-danger-solid', 'text-white'],
}

function updateTodayCard(card, amount, cents) {
  const tone = cents === null || cents === 0 ? 'zero' : cents > 0 ? 'positive' : 'negative'
  card.classList.remove(...Object.values(TODAY_CARD_CLASSES).flat())
  card.classList.add(...TODAY_CARD_CLASSES[tone])
  amount.textContent = cents === null ? '—' : formatCents(cents)
}

async function getActiveMonth() {
  // Les booléens ne sont pas des clés IndexedDB valides : filtrage en JS
  return (await db.months.filter((month) => month.isActive === true).first()) ?? null
}

async function saveExpense(monthId, date, rawValue) {
  const existing = await db.daily_records.where('monthId').equals(monthId).filter((r) => r.date === date).toArray()
  const value = String(rawValue).trim()

  if (value === '') {
    await db.daily_records.bulkDelete(existing.map((r) => r.id))
    return true
  }

  const expense = parseAmount(value)
  if (!Number.isFinite(expense) || expense < 0) return false

  await db.transaction('rw', db.daily_records, async () => {
    const [first, ...duplicates] = existing
    if (first) {
      await db.daily_records.update(first.id, { expense })
      await db.daily_records.bulkDelete(duplicates.map((r) => r.id))
    } else {
      await db.daily_records.add({ monthId, date, expense })
    }
  })
  return true
}

async function createMonth({ name, startDate, endDate, dailyAllowance }) {
  await db.transaction('rw', db.months, async () => {
    await db.months.toCollection().modify({ isActive: false })
    await db.months.add({ name, startDate, endDate, dailyAllowance, isActive: true, isArchived: false })
  })
}

function initModal(panel) {
  const dialog = panel.querySelector('[data-month-dialog]')
  const form = dialog.querySelector('form')
  const error = dialog.querySelector('[data-month-error]')
  const { name, startDate, endDate, dailyAllowance } = form.elements
  let nameEdited = false

  function open() {
    const start = localToday()
    form.reset()
    nameEdited = false
    error.hidden = true
    startDate.value = start
    endDate.value = addDays(addMonths(start, 1), -1)
    name.value = monthName(start)
    dialog.showModal()
  }

  name.addEventListener('input', () => {
    nameEdited = true
  })

  startDate.addEventListener('change', () => {
    if (!startDate.value) return
    if (!nameEdited) name.value = monthName(startDate.value)
    endDate.value = addDays(addMonths(startDate.value, 1), -1)
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const allowance = parseAmount(dailyAllowance.value)
    const days = eachDate(startDate.value, endDate.value).length

    let message = ''
    if (!name.value.trim()) message = 'Le nom est obligatoire.'
    else if (!startDate.value || !endDate.value) message = 'Les dates sont obligatoires.'
    else if (endDate.value < startDate.value) message = 'La date de fin doit suivre la date de début.'
    else if (days >= MAX_DAYS) message = `La période ne peut pas dépasser ${MAX_DAYS - 1} jours.`
    else if (!Number.isFinite(allowance) || allowance <= 0) message = 'Le montant par jour doit être positif.'

    if (message) {
      error.textContent = message
      error.hidden = false
      return
    }

    await createMonth({
      name: name.value.trim(),
      startDate: startDate.value,
      endDate: endDate.value,
      dailyAllowance: allowance,
    })
    dialog.close()
  })

  dialog.querySelector('[data-month-cancel]').addEventListener('click', () => dialog.close())
  panel.querySelectorAll('[data-month-open]').forEach((button) => button.addEventListener('click', open))
}

export function initExpenses(panel) {
  const empty = panel.querySelector('[data-expenses-empty]')
  const content = panel.querySelector('[data-expenses-content]')
  const title = panel.querySelector('[data-month-title]')
  const period = panel.querySelector('[data-month-period]')
  const todayCard = panel.querySelector('[data-today-card]')
  const todayAmount = panel.querySelector('[data-today-amount]')
  const tbody = panel.querySelector('[data-expenses-body]')

  let currentMonthId = null
  let rowsKey = ''

  initModal(panel)

  liveQuery(async () => {
    const month = await getActiveMonth()
    const records = month ? await db.daily_records.where('monthId').equals(month.id).toArray() : []
    return { month, records }
  }).subscribe({
    next: ({ month, records }) => {
      empty.hidden = Boolean(month)
      content.hidden = !month
      currentMonthId = month?.id ?? null
      if (!month) return

      const schedule = computeSchedule(month, records)
      const today = localToday()

      title.textContent = month.name
      period.textContent = `${dayLabel.format(new Date(`${month.startDate}T00:00:00Z`))} → ${dayLabel.format(
        new Date(`${month.endDate}T00:00:00Z`),
      )} · ${currency.format(month.dailyAllowance)} / jour`

      const todayRow = schedule.find((row) => row.date === today)
      // Disponible aujourd'hui = Report du jour : vaut Report de la veille + €/JOURS tant qu'aucune
      // dépense n'est saisie (ou si elle est vidée / mise à 0), puis déduit la dépense une fois saisie
      updateTodayCard(todayCard, todayAmount, todayRow ? todayRow.report : null)

      // Les lignes ne sont reconstruites que si la période change, pour garder le focus pendant la saisie
      const key = `${month.id}:${month.startDate}:${month.endDate}`
      if (key !== rowsKey) {
        tbody.replaceChildren(...schedule.map((row) => buildRow(row.date)))
        rowsKey = key
      }
      schedule.forEach((row, index) => updateRow(tbody.children[index], row, row.date === today))
    },
    error: (err) => console.error('Lecture du mois impossible', err),
  })

  tbody.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-col="expense"]')
    if (!input || currentMonthId === null) return
    const saved = await saveExpense(currentMonthId, input.closest('tr').dataset.date, input.value)
    input.classList.toggle('border-danger', !saved)
    input.setAttribute('aria-invalid', String(!saved))
  })

  // Pendant l'édition, retirer le symbole € pour ne garder que le nombre
  tbody.addEventListener('focusin', (event) => {
    const input = event.target.closest('[data-col="expense"]')
    if (!input || input.value === '') return
    const value = parseAmount(input.value)
    if (Number.isFinite(value)) input.value = number.format(value)
  })

  tbody.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('[data-col="expense"]')) event.target.blur()
  })
}
