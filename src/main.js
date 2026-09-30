import './style.css'
import { initPwa } from './pwa.js'
import { initDebits } from './tabs/debits.js'
import { initExpenses } from './tabs/expenses.js'
import { initOptions } from './tabs/options.js'

const navButtons = document.querySelectorAll('[data-tab]')
const panels = document.querySelectorAll('[data-tab-panel]')

function showTab(name) {
  panels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.tabPanel !== name)
  })
  navButtons.forEach((button) => {
    if (button.dataset.tab === name) {
      button.setAttribute('aria-current', 'page')
    } else {
      button.removeAttribute('aria-current')
    }
  })
  window.scrollTo(0, 0)
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => showTab(button.dataset.tab))
})

initExpenses(document.querySelector('#tab-expenses'))
initDebits(document.querySelector('#tab-debits'))
initOptions(document.querySelector('#tab-options'))
initPwa()

showTab('expenses')
