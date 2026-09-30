// Préférence de thème : 'light', 'dark' ou 'system' (suit l'appareil).
// Stockée dans localStorage (lecture synchrone) pour que le script inline de index.html
// puisse appliquer le thème avant le premier rendu, sans flash de la mauvaise couleur.
const STORAGE_KEY = 'theme'
const THEMES = ['light', 'dark', 'system']

// Couleur de la barre d'état Android = fond de page (--app-bg)
const THEME_COLORS = { light: '#f8fafc', dark: '#020617' }

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

function getPreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

function savePreference(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Stockage indisponible (navigation privée) : le choix vaut pour la session en cours
  }
}

function applyTheme(preference) {
  const isDark = preference === 'dark' || (preference === 'system' && systemDark.matches)
  document.documentElement.classList.toggle('dark', isDark)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? THEME_COLORS.dark : THEME_COLORS.light)
}

export function initOptions(panel) {
  const form = panel.querySelector('[data-theme-form]')
  let preference = getPreference()

  form.elements.theme.value = preference
  applyTheme(preference)

  form.addEventListener('change', () => {
    preference = form.elements.theme.value
    savePreference(preference)
    applyTheme(preference)
  })

  // Bascule automatique de l'appareil (ex. Android « du coucher au lever du soleil »)
  systemDark.addEventListener('change', () => {
    if (preference === 'system') applyTheme(preference)
  })

  // Certaines WebView/PWA installées ne notifient pas le changement pendant que l'app
  // est en arrière-plan : on revérifie au retour au premier plan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applyTheme(preference)
  })
}
