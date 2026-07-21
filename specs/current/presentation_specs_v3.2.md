# Spécifications - Couche de Présentation Multi-Applications

**Version :** 3.2  
**Date :** 16 Juillet 2026  
**Conformité :** specs-techniques-socle-ha-mqtt-v4.4.md  
**Statut :** Document de référence pour toutes les applications du socle HA-MQTT

> **📌 v3.2** : **Comportement accordéon strict (1 seul menu déplié) et effacement systématique de la zone de données au clic**. Correction du double déclenchement des écouteurs, utilisation de classes CSS `.visible` au lieu de `style.setProperty()`.
> **📌 v3.1** : **Structure de menu accordéon et affichage conditionnel**. Menu "Paramètres Techniques" avec sous-menus déployables. Affichage du contenu uniquement au clic sur un menu.
> **📌 v3.0** : **Migration complète vers TypeScript pur**. Suppression de Alpine.js. Architecture basée sur **TypeScript + Web Components natifs + Socket.io**. Toute la réactivité est gérée via Custom Elements et événements DOM natifs.

---

## 📌 1. Introduction

### 1.1 Objectif
Définir l'architecture de la **couche Présentation** pour les applications du socle HA-MQTT, permettant :
1. L'affichage et l'édition des **paramètres techniques** communs (MQTT, HA WS, Web, Logging)
2. L'intégration **modulaire** des paramétrages **spécifiques à chaque application** (RFXCOM, etc.)
3. Un **menu dynamique** basé sur les applications présentes
4. Un **affichage prioritaire** des paramètres non configurés (visible immédiatement)
5. **L'ajout ou la suppression d'applications SANS MODIFIER LE CŒUR**

### 1.2 Périmètre

| Inclus | Exclus |
|--------|--------|
| Structure de la couche Présentation | Logique métier |
| Communication Socket.io (UI ↔ Serveur) | Accès direct à HA, MQTT, fichiers |
| Affichage des configurations | Validation métier |
| Menu dynamique par application | Persistance |
| Détection des paramètres manquants | Orchestration |
| **Architecture TypeScript pure** | **Frameworks UI (Alpine.js, React, Vue, etc.)** |

### 1.3 Public Cible
- Développeurs d'applications dérivées du socle
- Intégrateurs UI/UX
- Mainteneurs du socle technique

### 1.4 Documents Conformes
- [specs-techniques-socle-ha-mqtt-v4.4.md](specs-techniques-socle-ha-mqtt-v4.4.md) (Architecture 5 couches)
- [specs-fonctionnelles-rfxcom-v5.0.md](specs-fonctionnelles-rfxcom-v5.0.md) (Spécificités RFXCOM)

---

## 🏗️ 2. Architecture Générale

### 2.1 Rappel des 5 Couches (Conforme §3 specs-techniques-socle-ha-mqtt-v4.4)

```
┌─────────────────────────────────────────────────────────────┐
│              COUCHE PRÉSENTATION (ce document)              │
│  UI Web (HTML/CSS/TypeScript)                              │
│  Serveur Express + Socket.io                                 │
│  → Émet et reçoit UNIQUEMENT des événements Socket.io       │
│  → Seul /health reste en HTTP pur                            │
├─────────────────────────────────────────────────────────────┤
│              COUCHE APPLICATION                               │
│  AppService · EventBus · SocketBridge · RestartManager        │
│  → SocketBridge : relaie EventBus ↔ Socket.io                │
├─────────────────────────────────────────────────────────────┤
│                    COUCHE MÉTIER                             │
│  Logique pure (RFXCOM, Zigbee2MQTT, etc.)                     │
│  → Consomme référentiel via couche HA                        │
│  → Envoie commandes via couche HA                           │
├─────────────────────────────────────────────────────────────┤
│                     COUCHE HA                                │
│  Synchronisation référentiel (WS) + Intégrations (MQTT)        │
├─────────────────────────────────────────────────────────────┤
│               COUCHE INFRASTRUCTURE                           │
│  ConfigService · Logger · HaWsTransport · MqttTransport       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Règles Strictes Applicables

**❌ INTERDIT dans la couche Présentation :**
- Importer des modules de la **couche Métier** (RFXCOM, etc.)
- Accéder directement à `config.yaml` ou tout fichier de configuration
- Accéder directement à MQTT ou au WebSocket HA
- Appeler `ConfigService` directement (tout passe par Socket.io)
- Contenir de la logique métier
- Utiliser des frameworks UI (React, Vue, Angular, **Alpine.js**, etc.)
- **Avoir des références hardcodées à des applications spécifiques (RFXCOM, etc.)**

**✅ AUTORISÉ dans la couche Présentation :**
- Utiliser **Socket.io** pour communiquer avec le serveur
- Afficher des données reçues via Socket.io
- Envoyer des commandes via Socket.io
- Servir des fichiers statiques (HTML, CSS, JS)
- Gérer la route `/health` (HTTP)
- Utiliser **TypeScript ES2020+** pour la réactivité UI
- Utiliser **Web Components natifs** pour les composants UI
- **Générer dynamiquement le menu et les écrans à partir des modules détectés**

### 2.3 Principe de Communication (Conforme §5 specs-techniques-socle-ha-mqtt-v4.4)

```
UI (app.ts)  ←──── Socket.io ────→  server.ts
                                         │
                                ┌────┴────┐
                                ▼         ▼
                          EventBus   ConfigService
```

**Flux de données :**
1. L'UI écoute les événements Socket.io (`config:current`, `app:modules:list`, etc.)
2. L'UI émet des commandes via Socket.io (`config:save:requested`, etc.)
3. **AUCUN** appel direct entre UI et couches Métier/HA/Infrastructure

#### 2.3.1 Événements persistants (v3.1)

Le `SocketBridge` supporte les **événements persistants** qui sont automatiquement envoyés à l'UI lors de la connexion Socket.io, sans nécessiter d'interrogation explicite.

**Comportement :**
- Lorsqu'une application déclare un événement comme persistant, le `SocketBridge` stocke sa dernière valeur
- À chaque nouvelle connexion client, le `SocketBridge` envoie automatiquement tous les événements persistants avec leur dernière valeur
- L'UI reçoit ainsi immédiatement l'état courant (ex: statut de connexion d'une application)

**Exemple d'utilisation côté UI :**
```typescript
// L'UI se connecte et reçoit automatiquement :
// - Événements du core :
//   * config:current (configuration actuelle)
//   * app:status (statut de l'application)
//   * app:modules:list (liste des modules)
//   * mqtt:connected (statut MQTT)
//   * ha:status (statut HA)
// - Événements des applications :
//   * rfxcom:status (dernier statut connu)
//   * rfxcom:devices:list (dernière liste connue)
// etc...
// TOUT CES ÉVÉNEMENTS SONT REÇUS AUTOMATIQUEMENT SANS INTERROGATION

// Exemple : réception du statut MQTT
socket.on('mqtt:connected', (status: boolean) => {
  updateMqttStatus(status);
});

// Exemple : réception de la configuration
socket.on('config:current', (config: TechnicalConfig) => {
  populateConfigForm(config);
});

// Exemple : réception du statut RFXCOM
socket.on('rfxcom:status', (status: { connected: boolean; devicesCount: number }) => {
  updateRfxcomStatus(status.connected);
});
```

**Avantages :**
- ✅ Meilleure UX (affichage immédiat du statut)
- ✅ Réduction du trafic réseau
- ✅ Robustesse aux reconnexions

---

## 📁 3. Structure des Répertoires

### 3.1 Structure Complète

```
src/
├── presentation/
│   └── ui/
│       ├── ts/
│       │   ├── config/                  # Managers de configuration
│       │   │   ├── TechnicalConfigManager.ts
│       │   │   ├── ModuleManager.ts
│       │   │   └── ApplicationManager.ts
│       │   ├── components/              # Web Components
│       │   │   ├── Sidebar.ts
│       │   │   ├── ConfigForm.ts
│       │   │   ├── ModuleCard.ts
│       │   │   └── LogsModal.ts
│       │   ├── services/               # Services partagés
│       │   │   ├── SocketService.ts
│       │   │   └── EventBus.ts
│       │   ├── utils/                  # Utilitaires
│       │   │   ├── DomUtils.ts
│       │   │   ├── DateUtils.ts
│       │   │   └── ValidationUtils.ts
│       │   └── app.ts                  # Point d'entrée
│       ├── index.html                 # Page principale
│       └── styles/                    # Styles CSS
│           ├── general.css
│           ├── config-form.css
│           └── alert-banner.css
│
└── applications/
    └── <app-name>/
        └── presentation/
            ├── index.html              # UI spécifique application
            ├── components/             # Composants spécifiques
            └── styles/                 # Styles spécifiques
```

### 3.2 Rôle de chaque Répertoire

| Répertoire | Rôle | Technologie |
|------------|------|-------------|
| `ts/config/` | Gestion de l'état de configuration | TypeScript + Custom Events |
| `ts/components/` | Composants UI réutilisables | Web Components natifs |
| `ts/services/` | Services de communication | Socket.io |
| `ts/utils/` | Fonctions utilitaires | TypeScript pur |
| `ui/` | Point d'entrée et HTML | HTML5 + CSS3 |

---

## 🧩 4. Composants UI (Web Components)

### 4.1 Principe des Web Components

Tous les composants UI sont implémentés comme **Custom Elements natifs** :

```typescript
// Définition d'un Web Component
customElements.define('app-sidebar',
  class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }
    
    connectedCallback() {
      this.render();
      this.setupEventListeners();
    }
    
    private render(): void {
      this.shadowRoot!.innerHTML = `<aside>...</aside>`;
    }
  }
);
```

**Avantages :**
- ✅ Natif, pas de dépendance externe
- ✅ Encapsulation du style (Shadow DOM)
- ✅ Réutilisabilité
- ✅ Intégration avec le DOM standard

### 4.2 Composants Principaux

#### 4.2.1 `app-sidebar` (Barre latérale)
**Fichier :** `ts/components/Sidebar.ts`

**Responsabilités :**
- Afficher la liste des applications
- Gérer le module actif
- Afficher les statuts des modules

**Événements :**
- `module:activated` - Émis quand un module est sélectionné

#### 4.2.2 `config-form` (Formulaire de configuration)
**Fichier :** `ts/components/ConfigForm.ts`

**Responsabilités :**
- Générer dynamiquement les champs de configuration
- Valider les entrées
- Sauvegarder via Socket.io

**Événements :**
- `config:saved` - Émis après sauvegarde réussie

#### 4.2.3 `module-card` (Carte de module)
**Fichier :** `ts/components/ModuleCard.ts`

**Responsabilités :**
- Afficher les informations d'un module
- Permettre l'activation/désactivation

#### 4.2.4 `logs-modal` (Modale des logs)
**Fichier :** `ts/components/LogsModal.ts`

**Responsabilités :**
- Afficher les logs en temps réel
- Gestion de l'ouverture/fermeture

### 4.3 Génération Dynamique des Composants

Les composants sont **chargés dynamiquement** en fonction des applications disponibles :

```typescript
// Dans app.ts
window.addEventListener('modules:loaded', (e: CustomEvent) => {
  e.detail.modules.forEach((module: Module) => {
    // Charger le composant spécifique si nécessaire
    if (module.customElementName) {
      import(`./applications/${module.id}/presentation/${module.customElementName}.js`);
    }
  });
});
```

---

## 📑 4.5 Structure des Menus et Navigation

### 4.5.1 Menu Principal - Structure

La barre latérale (`app-sidebar`) contient deux sections principales :

1. **Paramètres Techniques** (menu accordéon)
   - Menu parent cliquable qui se déploie/réduit
   - Contient les sous-menus **communs** :
     - Web-services (section: `ha`)
     - MQTT (Broker externe) (section: `mqtt`)
     - Serveur Web (section: `web`)
     - Journalisation (section: `logging`)
     - Gestion des applications (section: `applications-manager`)
   - **Contient aussi les sous-menus générés pour les paramètres techniques de chaque application**
     - Un sous-menu est automatiquement créé pour chaque application détectée
     - Exemple : si application "RFXCOM" est active, un sous-menu "RFXCOM" apparaît
     - Ces sous-menus permettent d'accéder aux paramètres **spécifiques à l'application**
     - Ils sont générés dynamiquement à partir de la liste des modules (`app:modules:list`)

2. **Applications** (menu dynamique)
   - Généré automatiquement à partir de la liste des modules reçus via Socket.io
   - Chaque application a son propre item de menu
   - Le menu "core" (Paramètres Techniques) est traité séparément et n'apparaît pas dans cette liste

### 4.5.2 Comportement du Menu Accordéon

**NOUVEAU v3.2 - Comportement accordéon stricte :**
- **Un seul menu principal peut être déplié à la fois** (comportement accordéon)
- Quand un menu est déplié, **tous les autres menus principaux sont automatiquement repliés**

**Comportement de "Paramètres Techniques" et "Applications" :**
- Au clic sur l'en-tête :
  - Si déployé → se réduit (icône change de ▼ à ▲)
  - Si réduit → se déploie (icône change de ▲ à ▼)
- Les sous-menus ne sont visibles que lorsque la section est déployée
- **État initial** : Tous les menus sont **repliés** au chargement (`collapsed`)

**Gestion technique :**
- Utilisation de la **classe CSS `.visible`** sur `.nav-section-collapse` pour contrôler l'affichage
- Méthode `classList.toggle('visible', ...)` au lieu de `style.setProperty()` pour éviter les conflits
- Un double clic sur un menu replie/déplie correctement (pas de double déclenchement)

**CSS utilisé :**
```css
.nav-section-collapse {
  display: none;
}
.nav-section-collapse.visible {
  display: block !important;
}
.nav-section-header.expanded .toggle-icon {
  transform: rotate(90deg);
}
```

### 4.5.3 Affichage du Contenu

**NOUVEAU v3.2 - Effacement systématique de la zone de données :**
- **Dès le clic sur un menu principal**, la zone de données est **immédiatement effacée**
- Cela garantit qu'aucun ancien contenu ne persiste pendant le chargement du nouveau contenu

**Règles strictes :**
- **Aucun contenu n'est affiché dans la fenêtre principale au chargement initial**
- Le contenu s'affiche UNIQUEMENT quand l'utilisateur clique sur un item de menu
- Un seul contenu est affiché à la fois (les autres sont masqués)

**Mécanisme :**
1. **Première action dans `toggleSection()`** : Appel à `hideAllContentSections()` pour effacer la zone
2. Tous les `.content-section` dans `<main>` ont `style="display: none;"` par défaut
3. Au clic sur un menu principal :
   - `hideAllContentSections()` est appelé **immédiatement** (avant tout autre traitement)
   - Si dépliage d'un menu : les autres menus sont repliés (`collapseAllOtherSections()`)
   - Puis la section correspondante est affichée si elle existe dans le mapping
   - Pour les modules dynamiques : active le module et affiche le conteneur

**Mapping des sections :**
```typescript
const sectionMappings: Record<string, string> = {
  'ha': 'section-ha',
  'mqtt': 'section-mqtt', 
  'web': 'section-web',
  'logging': 'section-logging',
  'applications-manager': 'section-applications-manager'
};
```

### 4.5.4 Gestion des Modules Dynamiques

**Pour les applications (modules dynamiques) :**
- Si `sectionId` correspond à un `module.id` (via `this.modules.some(m => m.id === sectionId)`)
- Le conteneur `<app-module-container>` est affiché
- L'événement `module:activated` est émis avec le `moduleId`
- `ModuleContainer` charge alors le contenu du module depuis `/applications/${moduleId}/presentation/index.html`

**Exception importante :**
- Le module `core` (Paramètres Techniques) **n'a pas** de fichier de présentation HTML
- Il est géré entièrement par `<app-config-form>` avec ses sections internes
- `ModuleContainer` ignore explicitement le module `core` pour éviter les erreurs 404

---

## 🔌 5. Intégration avec Socket.io

### 5.1 Service Socket

**Fichier :** `ts/services/SocketService.ts`

```typescript
export class SocketService {
  private socket: Socket;
  
  connect(url: string): Socket {
    this.socket = io(url, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    
    this.setupGlobalListeners();
    return this.socket;
  }
  
  private setupGlobalListeners(): void {
    this.socket.on('connect', () => {
      window.dispatchEvent(new CustomEvent('socket:connected'));
    });
    
    this.socket.on('disconnect', () => {
      window.dispatchEvent(new CustomEvent('socket:disconnected'));
    });
  }
  
  emit(event: string, data?: any): void {
    this.socket.emit(event, data);
  }
  
  on(event: string, callback: (data: any) => void): void {
    this.socket.on(event, callback);
  }
}
```

### 5.2 Managers de Configuration

#### TechnicalConfigManager
**Fichier :** `ts/config/TechnicalConfigManager.ts`

```typescript
interface TechnicalConfig {
  ha: {
    ws_enable: boolean;
    mqtt_enable: boolean;
    ws: { host: string; port: number; token: string; reconnect_delay: number };
    mqtt: { host: string; port: number; client_id: string; username: string; password: string; keepalive: number; reconnect_delay: number };
  };
  web: { port: number; host: string };
  logging: { level: string; rotate: { max_size_mb: number; max_files: number } };
}

export class TechnicalConfigManager {
  private config: TechnicalConfig;
  private socket: Socket;
  
  constructor(socket: Socket) {
    this.socket = socket;
    this.config = this.getDefaultConfig();
    this.setupListeners();
  }
  
  private setupListeners(): void {
    this.socket.on('config:current', (partial: Partial<TechnicalConfig>) => {
      this.config = { ...this.config, ...partial };
      this.notifyUpdate();
    });
    
    this.socket.on('config:validation:result', (result: ValidationResult) => {
      this.validationResult = result;
      this.notifyValidation();
    });
  }
  
  getConfig(): TechnicalConfig {
    return { ...this.config };
  }
  
  saveConfig(config: Partial<TechnicalConfig>): void {
    this.config = { ...this.config, ...config };
    this.socket.emit('config:save:requested', this.config);
  }
  
  private notifyUpdate(): void {
    window.dispatchEvent(new CustomEvent('config:updated', {
      detail: this.config
    }));
  }
}
```

#### ModuleManager
**Fichier :** `ts/config/ModuleManager.ts`

```typescript
interface Module {
  id: string;
  name: string;
  icon: string;
  status: 'configured' | 'partial' | 'missing' | 'error';
  configUi?: ModuleUiMetadata;
}

export class ModuleManager {
  private modules: Module[] = [];
  private socket: Socket;
  
  constructor(socket: Socket) {
    this.socket = socket;
    this.setupListeners();
  }
  
  private setupListeners(): void {
    this.socket.on('app:modules:list', (data: { modules: Module[] }) => {
      this.modules = data.modules;
      this.notifyModulesLoaded();
    });
    
    this.socket.on('app:module:ui:register', (data: { moduleId: string; metadata: ModuleUiMetadata }) => {
      const module = this.modules.find(m => m.id === data.moduleId);
      if (module) {
        module.configUi = data.metadata;
        this.notifyModuleUpdated(module.id);
      }
    });
  }
  
  getModules(): Module[] {
    return [...this.modules];
  }
  
  getModule(id: string): Module | undefined {
    return this.modules.find(m => m.id === id);
  }
  
  private notifyModulesLoaded(): void {
    window.dispatchEvent(new CustomEvent('modules:loaded', {
      detail: { modules: this.modules }
    }));
  }
}
```

#### ApplicationManager
**Fichier :** `ts/config/ApplicationManager.ts`

```typescript
interface ApplicationStatus {
  activated: string[];
  disabled: string[];
}

export class ApplicationManager {
  private applications: ApplicationStatus = { activated: [], disabled: [] };
  private socket: Socket;
  
  constructor(socket: Socket) {
    this.socket = socket;
    this.setupListeners();
  }
  
  private setupListeners(): void {
    this.socket.on('app:applications:list:result', (data: ApplicationStatus) => {
      this.applications = data;
      this.notifyApplicationsLoaded();
    });
    
    this.socket.on('app:applications:enable:result', (data: { appId: string; success: boolean }) => {
      if (data.success) {
        this.socket.emit('app:applications:list');
      }
    });
    
    this.socket.on('app:applications:disable:result', (data: { appId: string; success: boolean }) => {
      if (data.success) {
        this.socket.emit('app:applications:list');
      }
    });
  }
  
  enableApplication(appId: string): void {
    this.socket.emit('app:applications:enable', { appId });
  }
  
  disableApplication(appId: string): void {
    this.socket.emit('app:applications:disable', { appId });
  }
  
  getApplications(): ApplicationStatus {
    return { ...this.applications };
  }
  
  private notifyApplicationsLoaded(): void {
    window.dispatchEvent(new CustomEvent('applications:loaded', {
      detail: this.applications
    }));
  }
}
```

### 5.3 EventBus (Gestion des événements)

**Fichier :** `ts/services/EventBus.ts`

```typescript
export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, Function[]> = new Map();
  
  private constructor() {}
  
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
  
  subscribe(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }
  
  unsubscribe(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
  
  emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }
}
```

---

## 📄 6. Structure HTML

### 6.1 index.html (Point d'entrée)

**Fichier :** `ui/index.html`

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="HA WS/MQTT Application - Configuration Interface">
  <title>HA WS/MQTT</title>
  <link rel="icon" type="image/png" href="/images/maisonsouriante.png">
  
  <!-- Styles -->
  <link rel="stylesheet" href="/styles/general.css">
  <link rel="stylesheet" href="/styles/alert-banner.css">
  <link rel="stylesheet" href="/styles/config-form.css">
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <!-- Barre latérale -->
  <app-sidebar></app-sidebar>
  
  <!-- Contenu principal -->
  <main class="main-content">
    <app-config-form></app-config-form>
    <app-module-container></app-module-container>
  </main>
  
  <!-- Modale des logs -->
  <app-logs-modal></app-logs-modal>

  <!-- Socket.io -->
  <script defer src="/js/lib/socket.io.min.js"></script>
  
  <!-- Application TypeScript compilée -->
  <script defer src="/js/app.bundle.js"></script>
</body>
</html>
```

### 6.2 Points Clés

- **AUCUN** script Alpine.js
- **AUCUN** `deferAlpineStart`
- **Web Components natifs** (`<app-sidebar>`, `<app-config-form>`, etc.)
- **Socket.io** chargé avant le bundle TS
- **Bundle TypeScript** généré par la compilation

---

## ⚙️ 7. Compilation et Build

### 7.1 Configuration TypeScript

**Fichier :** `tsconfig.ui.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "outDir": "../../../dist/presentation/ui/js",
    "rootDir": "./src/presentation/ui/ts",
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "allowJs": false,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 7.2 Scripts npm

**Dans package.json :**

```json
{
  "scripts": {
    "build:ui": "tsc -p tsconfig.ui.json",
    "build:ui:watch": "tsc -p tsconfig.ui.json --watch",
    "build": "tsc && npm run build:ui && node scripts/copy-assets.js"
  }
}
```

### 7.3 Script copy-assets.js (mis à jour)

**Fichier :** `scripts/copy-assets.js`

```javascript
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();

const srcPaths = [
  'src/presentation/general',
  'src/presentation/server',
  'applications'
];

const extensions = ['.html', '.css', '.js', '.png', '.jpg'];

function copyAssets() {
  srcPaths.forEach(srcBase => {
    const fullSrcPath = path.join(projectRoot, srcBase);
    
    if (!fs.existsSync(fullSrcPath)) {
      return;
    }
    
    function walkDir(dir, relPath = '') {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const destRelPath = path.join(srcBase.replace(/^src\//, ''), relPath, item.name);
        const destFullPath = path.join(projectRoot, 'dist', destRelPath);
        
        if (item.isDirectory()) {
          fs.mkdirSync(destFullPath, { recursive: true });
          walkDir(fullPath, path.join(relPath, item.name));
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (extensions.includes(ext)) {
            fs.copyFileSync(fullPath, destFullPath);
            console.log(`Copié: ${fullPath} -> ${destFullPath}`);
          }
        }
      }
    }
    
    walkDir(fullSrcPath);
  });
  
  console.log('Copie des assets terminée!');
}

try {
  copyAssets();
} catch (error) {
  console.error('Erreur:', error.message);
  process.exit(1);
}
```

---

## 🎯 8. Exemples de Code

### 8.1 Initialisation de l'application

**Fichier :** `ts/app.ts`

```typescript
import { SocketService } from './services/SocketService';
import { TechnicalConfigManager } from './config/TechnicalConfigManager';
import { ModuleManager } from './config/ModuleManager';
import { ApplicationManager } from './config/ApplicationManager';
import { EventBus } from './services/EventBus';

// Initialiser le socket
const socketService = new SocketService(window.location.origin);
const socket = socketService.connect();

// Initialiser les managers
const configManager = new TechnicalConfigManager(socket);
const moduleManager = new ModuleManager(socket);
const appManager = new ApplicationManager(socket);

// Rendre les managers accessibles globalement (pour les composants)
(window as any).app = {
  configManager,
  moduleManager,
  appManager,
  socketService,
  eventBus: EventBus.getInstance()
};

// Écouter les événements globaux
window.addEventListener('DOMContentLoaded', () => {
  console.log('[App] DOM chargé, initialisation des composants...');
  
  // Les Web Components s'initialisent automatiquement
  // via customElements.define()
});

// Écouter les erreurs Socket.io
socket.on('connect_error', (error: Error) => {
  console.error('[Socket] Erreur de connexion:', error.message);
  window.dispatchEvent(new CustomEvent('socket:error', {
    detail: { message: error.message }
  }));
});
```

### 8.2 Composant Sidebar complet

**Fichier :** `ts/components/Sidebar.ts`

```typescript
interface Module {
  id: string;
  name: string;
  icon: string;
  status: 'configured' | 'partial' | 'missing' | 'error';
}

const template = document.createElement('template');
template.innerHTML = `
  <style>
    .sidebar {
      width: 250px;
      height: 100vh;
      background: #2c3e50;
      color: white;
      position: fixed;
      left: 0;
      top: 0;
    }
    .nav-item {
      padding: 10px 15px;
      cursor: pointer;
    }
    .nav-item:hover {
      background: #34495e;
    }
    .nav-item.active {
      background: #3498db;
    }
    .status-icon {
      margin-left: 10px;
    }
  </style>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>HA/MQTT</h1>
      <p>Configuration Interface</p>
    </div>
    <nav class="sidebar-nav">
      <h2>Applications</h2>
      <div id="modules-container"></div>
    </nav>
    <div class="sidebar-footer">
      <div class="status-indicator">
        <span class="status-dot"></span>
        <span>Web-Services</span>
      </div>
    </div>
  </aside>
`;

export class Sidebar extends HTMLElement {
  private modules: Module[] = [];
  private activeModule: string | null = null;
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot?.appendChild(template.content.cloneNode(true));
    
    this.setupEventListeners();
  }
  
  connectedCallback() {
    this.render();
    
    // Écouter les modules chargés
    window.addEventListener('modules:loaded', (e: CustomEvent) => {
      this.modules = e.detail.modules;
      if (this.modules.length > 0) {
        this.activeModule = this.modules[0].id;
      }
      this.render();
    });
    
    // Écouter les changements de module actif
    window.addEventListener('module:activated', (e: CustomEvent) => {
      this.activeModule = e.detail.moduleId;
      this.render();
    });
  }
  
  private render(): void {
    const container = this.shadowRoot?.getElementById('modules-container');
    if (!container) return;
    
    const statusIcons: Record<string, string> = {
      configured: '✓',
      partial: '⚠',
      missing: '✗',
      error: '✘'
    };
    
    container.innerHTML = this.modules.map(module => `
      <div class="nav-item ${this.activeModule === module.id ? 'active' : ''}"
           data-module-id="${module.id}">
        <span>${module.icon} ${module.name}</span>
        <span class="status-icon">${statusIcons[module.status] || ''}</span>
      </div>
    `).join('');
    
    // Ajouter les écouteurs de clic
    this.modules.forEach(module => {
      const element = this.shadowRoot?.querySelector(`.nav-item[data-module-id="${module.id}"]`);
      element?.addEventListener('click', () => {
        this.setActiveModule(module.id);
      });
    });
  }
  
  private setActiveModule(id: string): void {
    this.activeModule = id;
    window.dispatchEvent(new CustomEvent('module:activated', {
      detail: { moduleId: id }
    }));
    this.render();
  }
  
  private setupEventListeners(): void {
    // Écouter les changements de connexion
    window.addEventListener('socket:connected', () => {
      const dot = this.shadowRoot?.querySelector('.status-dot');
      if (dot) {
        dot.classList.add('connected');
      }
    });
    
    window.addEventListener('socket:disconnected', () => {
      const dot = this.shadowRoot?.querySelector('.status-dot');
      if (dot) {
        dot.classList.remove('connected');
      }
    });
  }
}

customElements.define('app-sidebar', Sidebar);
```

### 8.3 Composant ConfigForm

**Fichier :** `ts/components/ConfigForm.ts`

```typescript
interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'password';
  default?: any;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  hint?: string;
}

interface ConfigSection {
  id: string;
  title: string;
  icon: string;
  description: string;
  fields: ConfigField[];
}

export class ConfigForm extends HTMLElement {
  private config: any = {};
  private sections: ConfigSection[] = [];
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  
  connectedCallback() {
    this.setupEventListeners();
    this.render();
  }
  
  private setupEventListeners(): void {
    window.addEventListener('config:updated', (e: CustomEvent) => {
      this.config = { ...e.detail };
      this.render();
    });
    
    // Écouter les changements de module
    window.addEventListener('module:activated', (e: CustomEvent) => {
      const moduleId = e.detail.moduleId;
      // Charger la configuration spécifique du module si nécessaire
    });
  }
  
  private render(): void {
    // Construction dynamique du formulaire
    // Ce code serait généré en fonction de la configuration reçue
    this.shadowRoot!.innerHTML = `
      <form class="config-form">
        ${this.buildFormSections()}
        <button type="button" id="save-btn" class="btn btn-primary">
          Sauvegarder
        </button>
      </form>
    `;
    
    this.setupFormListeners();
  }
  
  private buildFormSections(): string {
    // Construction basée sur this.config
    // Exemple simplifié - à adapter selon votre structure
    return `
      <div class="config-section">
        <h3>⚙️ Web-Services</h3>
        ${this.buildField('ha.ws_enable', 'Activer Web-Services', 'boolean')}
        ${this.buildField('ha.ws.host', 'Hôte', 'text', true)}
        ${this.buildField('ha.ws.port', 'Port', 'number')}
        ${this.buildField('ha.ws.token', 'Long-Lived Access Token', 'password', true)}
      </div>
      <div class="config-section">
        <h3>🌐 Serveur Web</h3>
        ${this.buildField('web.port', 'Port', 'number')}
        ${this.buildField('web.host', 'Hôte', 'text')}
      </div>
    `;
  }
  
  private buildField(name: string, label: string, type: string, required?: boolean): string {
    const value = this.getFieldValue(name);
    const fieldId = `field-${name.replace('.', '-')}`;
    
    return `
      <div class="form-group" id="${fieldId}">
        <label for="${fieldId}">
          ${label}
          ${required ? '<span class="required-badge">Requis</span>' : ''}
        </label>
        ${this.buildInput(name, type, value, fieldId)}
      </div>
    `;
  }
  
  private buildInput(name: string, type: string, value: any, fieldId: string): string {
    switch (type) {
      case 'text':
      case 'password':
        return `<input type="${type}" id="${fieldId}" value="${value || ''}" data-field="${name}" />`;
      case 'number':
        return `<input type="number" id="${fieldId}" value="${value || ''}" data-field="${name}" />`;
      case 'boolean':
        return `<input type="checkbox" id="${fieldId}" ${value ? 'checked' : ''} data-field="${name}" />`;
      default:
        return `<input type="text" id="${fieldId}" value="${value || ''}" data-field="${name}" />`;
    }
  }
  
  private getFieldValue(name: string): any {
    const parts = name.split('.');
    let current = this.config;
    for (const part of parts) {
      if (current && current[part] !== undefined) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  }
  
  private setupFormListeners(): void {
    const saveBtn = this.shadowRoot?.getElementById('save-btn');
    saveBtn?.addEventListener('click', () => {
      this.saveConfig();
    });
    
    // Écouter les changements sur tous les inputs
    this.shadowRoot?.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', (e) => {
        const field = (e.target as HTMLElement).dataset.field;
        if (field) {
          this.updateField(field, (e.target as HTMLInputElement).value);
        }
      });
    });
  }
  
  private updateField(name: string, value: any): void {
    // Mise à jour de la configuration locale
    const parts = name.split('.');
    let current = this.config;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    
    current[parts[parts.length - 1]] = this.parseValue(value, parts[parts.length - 1]);
  }
  
  private parseValue(value: string, fieldName: string): any {
    if (value === 'true' || value === 'false') {
      return value === 'true';
    }
    const num = Number(value);
    if (!isNaN(num)) {
      return num;
    }
    return value;
  }
  
  private saveConfig(): void {
    (window as any).app.configManager.saveConfig(this.config);
  }
}

customElements.define('app-config-form', ConfigForm);
```

---

## 📋 9. Contraintes Techniques

### 9.1 Contraintes Générales

| Contrainte | Description | Statut |
|------------|-------------|--------|
| Pas de frameworks UI | Utilisation exclusive de TypeScript + Web Components | ✅ |
| Communication Socket.io uniquement | Toute communication passe par Socket.io | ✅ |
| Pas d'accès direct au métier | Pas d'import depuis les couches Métier/HA | ✅ |
| Modularité | Ajout/suppression d'applications sans modifier le cœur | ✅ |
| TypeScript strict | Mode strict activé | ✅ |

### 9.2 Bonnes Pratiques

**✅ DOIT :**
- Utiliser des **interfaces TypeScript** pour typer toutes les données
- Utiliser des **Custom Events** pour la communication entre composants
- **Gérer les erreurs** Socket.io et les afficher à l'utilisateur
- **Valider** les entrées utilisateur avant envoi
- Utiliser des **noms de classes** clairs et descriptifs

**❌ NE DOIT PAS :**
- Utiliser `any` sauf si absolument nécessaire
- Manipuler directement le DOM depuis les services (utiliser les composants)
- Stocker l'état global dans des variables globales (utiliser les managers)
- Faire des appels synchrones bloquants

---

## 🔍 10. Vérification de Conformité

### 10.1 Checklist

- [ ] Pas de mention d'Alpine.js dans le code
- [ ] Tous les composants sont des Web Components natifs
- [ ] La communication passe uniquement par Socket.io
- [ ] TypeScript est utilisé avec typage strict
- [ ] Les managers gèrent l'état via Custom Events
- [ ] Pas de dépendance externe pour l'UI (sauf Socket.io)
- [ ] Le build TypeScript fonctionne sans erreur

### 10.2 Tests

```bash
# Vérifier qu'il n'y a pas de référence à Alpine.js
! grep -r "Alpine" src/presentation/ui/ || echo "✓ Pas de référence à Alpine.js"

# Vérifier que les Web Components sont définis
grep -r "customElements.define" src/presentation/ui/ts/components/ | wc -l
# → Doit retourner > 0

# Vérifier que Socket.io est utilisé
grep -r "SocketService" src/presentation/ui/ts/ | wc -l
# → Doit retourner > 0
```

---

## 📜 11. Historique

| Version | Date | Auteur | Modifications |
|---------|------|--------|---------------|
| 3.2 | 16/07/2026 | Mistral Vibe | **Comportement accordéon strict et effacement de zone**. Un seul menu déplié à la fois. Effacement systématique de la zone de données dès le clic sur un menu principal. Correction du double déclenchement des écouteurs. Utilisation de classes CSS `.visible` au lieu de `style.setProperty()`. |
| 3.1 | 15/07/2026 | Mistral Vibe | **Structure de menu accordéon**. Menu "Paramètres Techniques" avec sous-menus déployables (Web-services, MQTT, Serveur Web, Journalisation, Gestion des applications). Affichage conditionnel du contenu au clic. Module core géré par ConfigForm, pas de chargement HTML. |
| 3.0 | 15/07/2026 | Mistral Vibe | **Migration complète vers TypeScript pur**. Suppression d'Alpine.js. Architecture basée sur Web Components natifs + Socket.io + TypeScript. |
| 2.3 | 14/07/2026 | Mistral Vibe | Ajout de la gestion dynamique d'activation/désactivation des applications. |
| 2.2 | 12/07/2026 | Mistral Vibe | Clarification de la dynamique d'ajout/suppression des applications. |
| 2.1 | 10/07/2026 | Mistral Vibe | Génération dynamique des formulaires de configuration. |
| 2.0 | 08/07/2026 | Mistral Vibe | Migration vers Alpine.js + TypeScript, restructuration des répertoires. |

---

*Ce document doit être respecté pour toute implémentation de la couche Présentation dans le socle HA-MQTT.*
