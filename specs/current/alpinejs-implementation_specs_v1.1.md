# Spécifications - Implémentation Alpine.js dans la couche Présentation

**Version :** 1.1
**Date :** 24 Juillet 2026
**Conformité :** presentation_specs_v4.0.md, techniques-socle-ha-mqtt_specs_v4.14.md
**Statut :** Document de référence pour toute utilisation d'Alpine.js dans ce projet

> **📌 v1.0** : Création. Réintroduit Alpine.js dans la couche Présentation, retiré depuis `presentation_specs` v3.0 (16/07/2026). Ce document existe spécifiquement pour éviter de reproduire l'échec qui avait motivé ce retrait — voir §1.

---

## 1. Contexte et objectif

Alpine.js avait été utilisé une première fois dans ce projet, puis **entièrement retiré** (`presentation_specs` v3.0, 16/07/2026, "Migration complète vers TypeScript pur") au profit de TypeScript pur + Web Components natifs + Socket.io. La raison, précisée par l'utilisateur le 22/07/2026 : l'assistant IA de l'époque **ne respectait pas le véritable cycle de vie d'Alpine**. Résultat concret : après une prise en compte forcée par l'utilisateur, chaque modification ultérieure du code provoquait des régressions (double initialisation, état dupliqué, écouteurs non nettoyés) — jusqu'à l'abandon complet du framework.

Alpine.js est réintroduit le 22/07/2026 après une démonstration interactive construite spécifiquement pour reproduire l'architecture réelle du socle (composant à Shadow DOM comme `ModuleContainer.ts`, store partagé traversant cette frontière, composant récursif) et valider empiriquement, un par un, les points qui avaient posé problème. **Ce document liste exhaustivement ce qui doit et ne doit pas être fait.** Toute implémentation Alpine dans ce projet doit s'y conformer strictement.

### 1.1 Périmètre

| Inclus | Exclus |
|--------|--------|
| Règles de chargement et de cycle de vie d'Alpine.js | Le détail fichier par fichier de la migration (traité au fil des sessions) |
| Patterns validés (store partagé, Shadow DOM, composants récursifs) | La charte graphique partagée entre applications (spec séparée à venir) |
| Ce qu'il ne faut jamais faire, avec la raison précise | Les autres frameworks (React, Vue — non retenus) |

---

## 2. Chargement de la bibliothèque

- Ce projet n'utilise pas de bundler (ES modules natifs, servis tels quels — voir `presentation_specs` §2.2). Alpine est chargé comme un **script classique** (`<script defer src="...">`), **jamais** en `type="module"`.
- Version figée pour la reproductibilité (pas de `@3.x.x` flottant en production). Validée : **Alpine.js 3.15.12** (core, sans plugin).
- Auto-hébergement recommandé (fichier servi par `core`, comme les autres assets statiques) plutôt qu'un CDN externe : ce socle pilote potentiellement des installations sur réseau local sans accès internet garanti — une dépendance à un CDN externe pour une brique aussi centrale que l'UI serait un point de fragilité évitable. Décision finale et emplacement exact du fichier à trancher à l'implémentation (hors périmètre de ce document).

---

## 3. Règles impératives de cycle de vie (validées empiriquement)

### 3.1 Ne jamais appeler `Alpine.start()` manuellement

Le build utilisé démarre lui-même, **inconditionnellement**, via `queueMicrotask(() => Alpine.start())` exécuté en toute fin de son propre code — vérifié en lisant directement le code source minifié. `window.deferLoadingAlpine` **n'est pas respecté par ce build** (contrairement à ce que suggère la documentation générique d'Alpine, écrite pour un comportement de build différent) — ne pas s'y fier, ne pas l'utiliser.

Appeler `Alpine.start()` soi-même déclenche l'avertissement interne d'Alpine *"Alpine has already been initialized on this page. Calling Alpine.start() more than once can cause problems."* et peut causer une double initialisation (double `x-init`, écouteurs dupliqués).

### 3.2 Toute déclaration (stores, data, directives) passe par l'événement `alpine:init`

```js
document.addEventListener('alpine:init', () => {
  Alpine.store('ws', { connected: false });
  Alpine.data('moduleForm', () => ({ /* ... */ }));
});
```

C'est le hook officiel qu'Alpine déclenche lui-même, en tout premier (avant tout scan du DOM), au moment où sa micro-tâche de démarrage s'exécute — vérifié dans le code source : `Alpine.start()` fait `dispatchEvent('alpine:init')` avant d'appeler `querySelectorAll(...).forEach(scan)`.

### 3.3 Piège critique : l'écouteur `alpine:init` doit être posé dans le MÊME bloc d'exécution synchrone que le chargement de la bibliothèque

Alpine démarre via une micro-tâche (§3.1). Les micro-tâches se déclenchent **entre deux exécutions synchrones de `<script>` séparées** (comportement standard du moteur JS, pas une particularité d'Alpine) :

- ❌ **Interdit** : charger Alpine dans une balise `<script>`, puis enregistrer `alpine:init` dans une balise `<script>` **suivante**. La micro-tâche de démarrage s'intercale entre les deux — l'écouteur est posé trop tard, le premier scan du DOM tourne sans aucun store enregistré (`$store.xxx` vaut `undefined` → erreurs `Cannot read properties of undefined`, contenu inerte, échec silencieux).
- ✅ **Obligatoire** : le chargement d'Alpine et l'enregistrement `alpine:init` doivent être dans la **même** balise `<script>` (le second directement à la suite du premier dans le même fichier), OU l'application est livrée comme un seul module/script compilé (cas normal pour ce projet : une seule balise `<script type="module">` par page, tout le code applicatif dans le même graphe d'imports).

### 3.4 Contenu injecté dans un Shadow DOM : `Alpine.initTree()` obligatoire

Le scan automatique d'Alpine (au démarrage, et son `MutationObserver` pour le contenu ajouté après coup) **ne traverse jamais une frontière Shadow DOM**. Concerne directement `ModuleContainer.ts` (et tout composant du socle utilisant `attachShadow`) : après tout `container.innerHTML = ...` injectant du contenu portant des directives Alpine, appeler explicitement :

```js
Alpine.initTree(container);
```

Sans cet appel : le contenu s'affiche (le HTML brut est bien là), mais reste **totalement inerte** — aucune directive n'est jamais évaluée, aucun `@click` n'est jamais attaché. Aucune erreur visible, échec silencieux et complet.

### 3.5 Composants récursifs (arbres) : pas de primitive Alpine dédiée

Alpine n'a pas d'équivalent au "composant qui se référence lui-même" d'un framework à composants (Vue/React). Pattern validé : un Web Component qui s'auto-imbrique, chaque instance ayant son propre Shadow DOM et son propre appel à `initTree()` (règle 3.4, à chaque niveau) :

```js
class TreeNode extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }

  setData(node) {
    this._node = node;
    this.shadowRoot.innerHTML = `<div x-data="{ open: ... }"> ... <div class="children"></div></div>`;
    Alpine.initTree(this.shadowRoot);
    (node.children || []).forEach(child => {
      const el = document.createElement('tree-node');   // récursion : même balise
      this.shadowRoot.querySelector('.children').appendChild(el);
      el.setData(child);                                  // récursion : rappel sur l'enfant
    });
  }
}
customElements.define('tree-node', TreeNode);
```

Concerne directement l'arbre OU/QUOI d'ArbreOuQuoi (aujourd'hui construit par des fonctions récursives générant des chaînes HTML — `renderOuNode()`/`renderQuoiFirstTree()` dans `app.ts`). Validé jusqu'à 4 niveaux de lieux imbriqués (grand_père → père → lieu → précis, cohérent avec `lieu_grand_pere`/`lieu_pere`/`lieu_principal`/`lieu_precis` de la taxonomie réelle — voir `taxonomy.ts` de rfxcom/evoo7) dans une démonstration interactive dédiée.

### 3.6 Nettoyage à la suppression d'un nœud

Alpine détecte automatiquement (même mécanisme de scan/`MutationObserver`) la suppression d'un nœud portant `x-data` et désabonne proprement ses effets réactifs — **aucun appel manuel requis dans le cas général**, y compris quand un conteneur remplace son propre contenu (`container.innerHTML = nouveauContenu` détruit et nettoie l'ancien automatiquement).

Vigilance à conserver : même limite Shadow DOM qu'en §3.4 si un composant socle retire dynamiquement un Shadow DOM enfant entier (plutôt que de le laisser au ramasse-miettes normal) — à vérifier au cas par cas si ce scénario se présente.

### 3.7 État partagé entre composants : `Alpine.store()`

Un store global, déclaré une fois via `alpine:init` (§3.2), est accessible depuis **n'importe quel** composant Alpine (`$store.nomDuStore`), **y compris à travers une frontière Shadow DOM** — un Proxy JS n'est pas cloisonné par le DOM, seul le DOM lui-même l'est. Validé : un store `ws.connected` modifié depuis un bouton du DOM principal se reflète instantanément dans un composant vivant à l'intérieur d'un Shadow DOM, sans aucun événement DOM personnalisé.

Cas d'usage prévu pour ce projet : remplacer une partie de la ménagerie actuelle d'événements DOM personnalisés (`module:activated`, `config:updated`, `module:config:loaded`, etc. — plusieurs sont aujourd'hui émis mais jamais écoutés, voir `TODO.md`) par des stores partagés directement observés par les composants concernés, réduisant le risque de ce même genre de bug (émission sans écoute correspondante).

---

## 4. Ce qu'il ne faut JAMAIS faire (résumé)

- Appeler `Alpine.start()` manuellement (§3.1).
- Enregistrer un store/`alpine:init` dans une balise `<script>` séparée de celle qui charge Alpine (§3.3).
- Se fier à `window.deferLoadingAlpine` avec le build utilisé (§3.1) — ignoré, faux sentiment de sécurité.
- Injecter du contenu portant des directives Alpine dans un Shadow DOM sans appeler `Alpine.initTree()` ensuite (§3.4).
- Utiliser l'index de boucle comme `:key` dans un `x-for` sur une liste dont des éléments peuvent être retirés en tête de liste (dérive de rendu — préférer un identifiant stable, ex: un id métier).
- Piloter la **même** donnée réactive à la fois par Alpine (store/`x-data`) et par du DOM manipulé à la main (`document.getElementById(...).textContent = ...`) en parallèle — source de désynchronisation silencieuse. Une donnée réactive doit être pilotée par Alpine de bout en bout.

---

## 5. Portée de la migration (décidé avec l'utilisateur le 22/07/2026)

Migration en plusieurs phases, une à la fois :

1. `applications/core` (`Sidebar.ts`, `ConfigForm.ts`, `ModuleManager.ts`, `ModuleContainer.ts`) — remplace la manipulation DOM manuelle actuelle par des directives Alpine, en respectant strictement les règles du §3.
2. Chaque application métier (`arbreouquoi`, `evoo7`, `nommage`, `rfxcom`), une à la fois.

Le détail fichier par fichier de cette migration est hors périmètre de ce document — à planifier au fil des sessions suivantes.

---

## 6. Checklist avant de considérer un composant Alpine "terminé"

- [ ] Aucun appel à `Alpine.start()` dans le code applicatif.
- [ ] Toute déclaration de store/data passe par `document.addEventListener('alpine:init', ...)`.
- [ ] Cet écouteur est posé dans le même bloc d'exécution synchrone que le chargement de la bibliothèque (vérifier qu'aucune balise `<script>` séparée ne s'intercale).
- [ ] Tout composant vivant dans un Shadow DOM est initialisé via `Alpine.initTree()` après injection de son contenu.
- [ ] Testé après un cycle complet retrait/réaffichage (changement d'onglet/app puis retour) : pas d'état dupliqué, pas de double écouteur.
- [ ] Aucune donnée réactive n'est également modifiée par du DOM manuel en parallèle (§4).

---

## 7. Historique

| Version | Date | Auteur | Changements |
|---|---|---|---|
| 1.1 | 24/07/2026 | Claude | Correction de référence croisée uniquement : `techniques-socle-ha-mqtt_specs` v4.13→v4.14 (restructuration `data/`, sans impact sur le contenu de ce document). |
| 1.0 | 22/07/2026 | Claude | Création. Réintroduction d'Alpine.js après retrait en v3.0 de `presentation_specs` — cette fois avec des règles de cycle de vie précises, vérifiées empiriquement via une démonstration interactive dédiée, documentant la cause racine des régressions passées. |
