# Instructions Système pour Claude (CLAUDE.md)

## Contexte du Projet
Développement d'une application de gestion budgétaire sous forme de PWA (Progressive Web App). L'application est destinée à un usage mobile, 100% hors-ligne, avec persistance des données dans le navigateur.

## Stack Technique
*   **Build Tool** : Vite.
*   **Langage** : HTML5 et JavaScript (Vanilla JS, sans framework).
*   **CSS** : Tailwind CSS v4 (utilisation des variables sémantiques pour le Dark Mode).
*   **Base de données locale** : Dexie.js (wrapper IndexedDB).
*   **PWA** : vite-plugin-pwa (pour la génération du Service Worker et du manifest).

## Architecture & Structure des Fichiers
Respecter une architecture modulaire pour le Vanilla JS :
*   `index.html` : Structure de base avec une Bottom Navigation Bar pour gérer les 3 onglets.
*   `src/main.js` : Point d'entrée, gestion du basculement des onglets et initialisation.
*   `src/db.js` : Configuration du schéma Dexie.
*   `src/tabs/expenses.js` : Logique de l'onglet Dépenses.
*   `src/tabs/debits.js` : Logique de l'onglet Prélèvements.
*   `src/tabs/options.js` : Logique des paramètres et du thème.

## Schéma de Base de Données (Dexie.js)
```javascript
db.version(1).stores({
  months: '++id, name, startDate, endDate, dailyAllowance, isActive, isArchived',
  daily_records: '++id, monthId, date, expense', // Le report et le J sont calculés dynamiquement
  direct_debits: '++id, dayOfMonth, label, amount, isPaid'
});
```

## Formules du tableau Dépenses (calcul en cascade, jour n)
*   **€/JOURS(n)** = `dailyAllowance` du mois (fixe).
*   **J(n)** = €/JOURS(n) + Report(n−1) — montant disponible pour le jour. Pour le premier jour, Report(n−1) = 0.
*   **Report(n)** = J(n) − Dépense(n) — reporté sur le jour suivant (peut être négatif).
