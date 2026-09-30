import Dexie from 'dexie'

export const db = new Dexie('budget-app')

db.version(1).stores({
  months: '++id, name, startDate, endDate, dailyAllowance, isActive, isArchived',
  daily_records: '++id, monthId, date, expense', // Le report et le J sont calculés dynamiquement
  direct_debits: '++id, dayOfMonth, label, amount, isPaid',
})
