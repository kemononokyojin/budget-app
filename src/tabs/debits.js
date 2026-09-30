import { liveQuery } from 'dexie'
import { db } from '../db.js'

const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

// Somme en centimes pour éviter les erreurs d'arrondi des flottants (0.1 + 0.2)
const toCents = (amount) => Math.round(Number(amount) * 100)

function sortDebits(debits) {
  return debits.sort(
    (a, b) => a.dayOfMonth - b.dayOfMonth || a.label.localeCompare(b.label, 'fr'),
  )
}

function computeRemaining(debits) {
  const cents = debits
    .filter((debit) => !debit.isPaid)
    .reduce((sum, debit) => sum + toCents(debit.amount), 0)
  return cents / 100
}

function renderItem(debit) {
  const li = document.createElement('li')
  li.className = 'flex items-center gap-3 px-4 py-3'
  li.dataset.id = debit.id

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = Boolean(debit.isPaid)
  checkbox.className = 'size-5 shrink-0 accent-primary'
  checkbox.dataset.action = 'toggle'
  checkbox.id = `debit-${debit.id}`

  const label = document.createElement('label')
  label.htmlFor = checkbox.id
  label.className = 'flex min-w-0 flex-1 items-baseline gap-3'

  const day = document.createElement('span')
  day.className = 'w-10 shrink-0 text-sm text-fg-muted tabular-nums'
  day.textContent = `J${debit.dayOfMonth}`

  const text = document.createElement('span')
  text.className = 'truncate'
  text.textContent = debit.label

  const amount = document.createElement('span')
  amount.className = 'ml-auto shrink-0 font-medium tabular-nums'
  amount.textContent = currency.format(debit.amount)

  if (debit.isPaid) {
    text.classList.add('line-through', 'text-fg-muted')
    amount.classList.add('line-through', 'text-fg-muted')
  }

  label.append(day, text, amount)

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.dataset.action = 'delete'
  remove.className = 'shrink-0 rounded p-1 text-fg-muted hover:text-danger'
  remove.setAttribute('aria-label', `Supprimer ${debit.label}`)
  remove.innerHTML =
    '<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'

  li.append(checkbox, label, remove)
  return li
}

function render(panel, debits) {
  const list = panel.querySelector('[data-debits-list]')
  const empty = panel.querySelector('[data-debits-empty]')
  const remaining = panel.querySelector('[data-debits-remaining]')

  list.replaceChildren(...sortDebits(debits).map(renderItem))
  list.classList.toggle('hidden', debits.length === 0)
  empty.classList.toggle('hidden', debits.length > 0)
  remaining.textContent = currency.format(computeRemaining(debits))
}

export function initDebits(panel) {
  const form = panel.querySelector('[data-debits-form]')
  const list = panel.querySelector('[data-debits-list]')

  // liveQuery ré-exécute la requête à chaque écriture dans direct_debits
  liveQuery(() => db.direct_debits.toArray()).subscribe({
    next: (debits) => render(panel, debits),
    error: (err) => console.error('Lecture des prélèvements impossible', err),
  })

  list.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-action="toggle"]')
    if (!checkbox) return
    const id = Number(checkbox.closest('li').dataset.id)
    db.direct_debits.update(id, { isPaid: checkbox.checked })
  })

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="delete"]')
    if (!button) return
    const id = Number(button.closest('li').dataset.id)
    db.direct_debits.delete(id)
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const label = String(data.get('label')).trim()
    const dayOfMonth = Number(data.get('dayOfMonth'))
    const amount = Number(String(data.get('amount')).replace(',', '.'))

    if (!label || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return
    if (!Number.isFinite(amount) || amount <= 0) return

    await db.direct_debits.add({ label, dayOfMonth, amount, isPaid: false })
    form.reset()
    form.elements.label.focus()
  })
}
