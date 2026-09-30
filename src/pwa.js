import { registerSW } from 'virtual:pwa-register'

// Une PWA installée peut rester ouverte des jours : le navigateur ne cherche une mise à jour
// du Service Worker qu'à la navigation, on force donc une vérification régulière.
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000

function watchForUpdates(swUrl, registration) {
  if (!registration) return

  const check = async () => {
    if (registration.installing || !navigator.onLine) return
    // Évite de lever une erreur si le serveur est injoignable (réseau capricieux)
    const response = await fetch(swUrl, { cache: 'no-store' }).catch(() => null)
    if (response?.ok) await registration.update()
  }

  setInterval(check, UPDATE_CHECK_INTERVAL)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}

export function initPwa() {
  const toast = document.querySelector('[data-update-toast]')
  const updateButton = toast.querySelector('[data-update-accept]')
  const dismissButton = toast.querySelector('[data-update-dismiss]')

  const updateSW = registerSW({
    // Nouveau Service Worker installé et en attente : on laisse l'utilisateur choisir le moment
    onNeedRefresh() {
      toast.hidden = false
    },
    onRegisteredSW: watchForUpdates,
    onRegisterError: (err) => console.error('Enregistrement du Service Worker impossible', err),
  })

  updateButton.addEventListener('click', () => {
    updateButton.disabled = true
    // Active le nouveau Service Worker (skipWaiting) puis recharge la page
    updateSW(true)
  })

  dismissButton.addEventListener('click', () => {
    toast.hidden = true
  })
}
