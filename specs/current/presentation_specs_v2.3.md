# Spécifications - Couche de Présentation Multi-Applications

**Version :** 2.3  
**Date :** 14 Juillet 2026  
**Conformité :** specs-techniques-socle-ha-mqtt-v4.4.md  
**Statut :** Document de référence pour toutes les applications du socle HA-MQTT

> **v2.3** : Ajout de la **gestion dynamique d'activation/désactivation** des applications. Ajout de la section §4.7 "Activation/Désactivation Dynamique des Applications". Mise à jour de la structure du menu avec gestion des applications au niveau 1.
> **v2.2** : **Clarification explicite** de la dynamique d'ajout/suppression des applications ( menu, écrans, paramétrage technique) **sans modification du cœur**. Ajout de la section §4.6 "Ajout/Suppression Dynamique d'Applications".
> **v2.1** : Ajout de la **génération dynamique des formulaires de configuration des modules** via métadonnées UI (`configUi`, `ModuleUiMetadata`).
> **v2.0** : Migration vers **Alpine.js** pour la couche UI, mise à jour structure répertoires pour regroupement des applications sous `src/applications/`.

---

## 📌 1. Introduction

### 1.1 Objectif
Définir l'architecture de la **couche Présentation** pour les applications du socle HA-MQTT, permettant :
1. L'affichage et l'édition des **paramètres techniques** communs (MQTT, HA WS, Web, Logging)
2. L'intégration **modulaire** des paramétrages **spécifiques à chaque application** (RFXCOM, etc.)
3. Un **menu dynamique** basé sur les applications présentes
4. Un **affichage prioritaire** des paramètres non configurés (visible immédiatement)
5. **L'ajout ou la suppression d'applications SANS MODIFIER LE CŒUR** (nouveau en v2.2)

### 1.2 Périmètre

| Inclus | Exclus |
|--------|--------|
| Structure de la couche Présentation | Logique métier |
| Communication Socket.io (UI ↔ Serveur) | Accès direct à HA, MQTT, fichiers |
| Affichage des configurations | Validation métier |
| Menu dynamique par application | Persistance |
| Détection des paramètres manquants | Orchestration |
| **Dynamique d'ajout/suppression d'applications** | **Modification du cœur** |

### 1.3 Public Cible
- Développeurs d'applications dérivées du socle
- Intégrateurs UI/UX
- Mainteneurs du socle technique

### 1.4 Documents Conformes
- [specs-techniques-socle-ha-mqtt-v4.3.md](specs-techniques-socle-ha-mqtt-v4.3.md) (Architecture 5 couches)
- [specs-fonctionnelles-rfxcom-v5.0.md](specs-fonctionnelles-rfxcom-v5.0.md) (Spécificités RFXCOM)

---

## 🏗️ 2. Architecture Générale

### 2.1 Rappel des 5 Couches (Conforme §3 specs-techniques-socle-ha-mqtt-v4.3)

```
┌─────────────────────────────────────────────────────────────┐
│              COUCHE PRÉSENTATION (ce document)              │
│  UI Web (HTML/CSS/JS vanilla)                                │
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
- Utiliser des frameworks lourds (React, Vue, Angular, etc.)
- **Avoir des références hardcodées à des applications spécifiques (RFXCOM, etc.)** (nouveau v2.2)

**✅ AUTORISÉ dans la couche Présentation :**
- Utiliser **Socket.io** pour communiquer avec le serveur
- Afficher des données reçues via Socket.io
- Envoyer des commandes via Socket.io
- Servir des fichiers statiques (HTML, CSS, JS)
- Gérer la route `/health` (HTTP)
- Utiliser **Alpine.js 3.x** + TypeScript pour la réactivité UI
- **Générer dynamiquement le menu et les écrans à partir des modules détectés** (nouveau v2.2)

### 2.3 Principe de Communication (Conforme §5 specs-techniques-socle-ha-mqtt-v4.3)

```
UI (app.js)  ←──── Socket.io ────→  server.ts
                                         │
                                    SocketBridge
                                         │
                                      EventBus
                                    ↙    ↓    ↘
                             MqttClient  HaSync  [Domain Modules]
```

**Règle absolue :** La communication entre l'UI et le serveur passe **uniquement** par Socket.io.

---

## 📁 3. Structure des Répertoires

**Conforme §4.2 specs-techniques-socle-ha-mqtt-v4.2**

### 3.1 Structure Globale

```
src/
├── presentation/                     # COUCHE PRÉSENTATION (socle commun)
│   ├── server/                      # Serveur Express + Socket.io
│   │   ├── index.ts                 # Bootstrap Express + Socket.io
│   │   └── health.ts                # Route /health (HTTP)
│   │
│   └── ui/                          # NOUVEAU v2.2 : Regroupement des fichiers UI
│       ├── index.html              # Page principale GÉNÉRIQUE (AUCUNE référence RFXCOM)
│       ├── app.ts                  # Initialisation Alpine.js + Socket.io
│       └── styles/                  # Styles communs
│           └── general.css          # Styles partagés
│
└── applications/                    # TOUTES LES APPLICATIONS - UN SEUL ENDROIT PAR APP
    ├── rfxcom/                      # Module RFXCOM (EXEMPLE)
    │   ├── domain/                  # Couche Métier (RFXCOM)
    │   │   ├── index.ts             # Déclaration du module (export RFXCOM_APP)
    │   │   ├── socket-events.ts     # Événements Socket.io spécifiques
    │   │   ├── config-schema.ts     # Schéma Zod de configuration
    │   │   ├── RfxComService.ts      # Service principal
    │   │   └── ...
    │   │
    │   └── presentation/            # Couche Présentation (RFXCOM)
    │       ├── index.html          # UI spécifique RFXCOM
    │       ├── components/          # Composants Alpine.js
    │       └── styles/               # Styles spécifiques
    │           └── rfxcom.css
    │
    └── zigbee2mqtt/                 # AUTRE EXEMPLE - Ajout futur
        ├── domain/
        │   └── index.ts             # export ZIGBEE2MQTT_APP
        └── presentation/
            └── index.html
```

### 3.2 Règles de Structure

| Élément | Emplacement | Justification |
|---------|-------------|---------------|
| **Applications spécifiques** | `src/applications/[app-name]/` | Tous les modules sous un même répertoire |
| **Métier d'une application** | `src/applications/[app-name]/domain/` | Couche Métier de l'application |
| **Présentation d'une application** | `src/applications/[app-name]/presentation/` | Couche Présentation de l'application |
| **Socle commun Présentation** | `src/presentation/` | Éléments partagés par toutes les applications |
| **Page principale** | `src/presentation/ui/index.html` | **GÉNÉRIQUE - AUCUNE référence à une application spécifique** |
| **Serveur** | `src/presentation/server/` | Serveur Express + Socket.io |
| **Paramètres généraux** | `src/presentation/ui/` | Composants et styles communs |

### 3.3 Avantages de cette Structure

✅ **Unicité** : Une seule racine par application sous `src/applications/` (ex: `src/applications/rfxcom/`)
✅ **Séparation claire** : `domain/` pour le Métier, `presentation/` pour l'UI
✅ **Extensibilité** : Ajout d'une nouvelle application = création de `src/applications/[new-app]/`
✅ **Partage** : Le socle commun reste dans `src/presentation/`
✅ **Conformité** : Respecte strictement les 5 couches du socle technique
✅ **Index.html générique** : Aucune référence hardcodée à une application (nouveau v2.2)

---

## 🔧 4. Mécanisme d'Agrégation Applications

### 4.1 Principe Fondamental

> **La couche Présentation ne connaît PAS les applications (RFXCOM, Zigbee2MQTT, etc.).**
> Elle reçoit toutes les informations **dynamiquement** via Socket.io.

**Garantie v2.2 :** 
> **Il est possible d'ajouter ou de supprimer une application (ex: RFXCOM) SANS MODIFIER AUCUN FICHIER DU CŒUR** 
> (index.html, AppService.ts, EventBus.ts, etc.).

### 4.2 Rôle de chaque couche

| Couche | Responsabilité |
|--------|----------------|
| **Infrastructure** | `ConfigService` gère la configuration technique (MQTT, HA, Web, Logging) |
| **Application** | `AppService` expose la liste des applications disponibles via EventBus |
| **Application** | `SocketBridge` relaie les infos applications vers Socket.io |
| **Présentation** | Affiche dynamiquement les applications et leurs paramètres **SANS les connaître à l'avance** |

### 4.3 Flux de Détection des Applications

```
Couche Infrastructure
    │
    ▼
ConfigService ──────────┐
    │                   │
    ▼                   ▼
Couche Application        Couche Métier
    │                   │
AppService ──► EventBus ──► [RFXCOM]/domain/index.ts
    │                              │
    ▼                              ▼
SocketBridge ─────────────────────┘
    │
    ▼
Couche Présentation
Socket.io Server + UI
    │
    ▼
UI (app.js) + [RFXCOM]/presentation/
```

**Processus :**
1. Au démarrage, `AppService` (couche Application) **scanne automatiquement** les répertoires dans `src/applications/` (ou `dist/applications/` en production) qui contiennent un fichier `domain/index.ts` exportant une constante `*_APP`
2. Il trouve `src/applications/rfxcom/domain/index.ts` qui exporte `RFXCOM_APP`
3. Pour chaque module trouvé, il extrait :
   - Nom de l'application (`RFXCOM_APP.name`)
   - Description (`RFXCOM_APP.description`)
   - Icône (`RFXCOM_APP.icon`)
   - Type (`RFXCOM_APP.type` : 'integration' ou 'standalone')
   - Statut (calculé dynamiquement : 'configured', 'partial', 'missing', 'error')
4. `AppService` émet un événement `app:modules:registered` via EventBus avec la liste des modules
5. `SocketBridge` capture cet événement et émet `app:modules:list` vers l'UI
6. L'UI affiche dynamiquement le menu et charge les composants spécifiques depuis `src/applications/[app-name]/presentation/`

### 4.4 Structure d'un Module d'Application

**Fichier :** `src/applications/[app-name]/domain/index.ts`

Chaque application est organisée sous **un seul répertoire racine** avec deux sous-répertoires :
- `domain/` : Contient le code **métier** (couche Métier)
- `presentation/` : Contient l' **UI** (couche Présentation)

```typescript
// src/applications/rfxcom/domain/index.ts
import { z } from 'zod';
import type { ApplicationModule } from '../../../../application/types.js';
import { RFXCOM_SOCKET_EVENTS } from './socket-events.js';
import { RFXCOM_UI_METADATA } from './ui-metadata.js';

// Schéma de configuration spécifique
const rfxcomConfigSchema = z.object({
  enabled: z.boolean().default(true),
  serialPort: z.string().default('/dev/ttyACM0'),
  baudRate: z.number().default(38400),
});

// Déclaration du module
// ⭐ NOUVEAU v2.2 : Aucune référence à RFXCOM dans le cœur, tout est déclaré ici
export const RFXCOM_APP: ApplicationModule = {
  id: 'rfxcom',                    // Identifiant unique (utilisé dans les URLs : #rfxcom)
  name: 'RFXCOM',                 // Nom affiché dans le menu
  description: 'Intégration des devices RF433',
  icon: '📡',                      // Icône emoji
  type: 'integration',             // 'integration' (utilise MQTT) ou 'standalone'
  configurable: true,              // A des paramètres à configurer
  configSchema: rfxcomConfigSchema,
  socketEvents: RFXCOM_SOCKET_EVENTS,
  requiredMqtt: true,              // Ce module nécessite MQTT
  requiredHaWs: false,             // Ne nécessite PAS HA WebSocket
  // ⭐ NOUVEAU v2.1 : Métadonnées pour générer automatiquement le formulaire UI
  configUi: RFXCOM_UI_METADATA,
  configSection: 'rfxcom',        // Nom de la section dans la config
};
```

**Organisation complète d'une application (ex: RFXCOM) :**
```
src/applications/rfxcom/
├── domain/                          # Couche Métier
│   ├── index.ts                     # Export du module (RFXCOM_APP)
│   ├── socket-events.ts             # Événements Socket.io spécifiques
│   ├── config-schema.ts             # Schéma Zod de configuration
│   ├── RfxComService.ts              # Service principal
│   ├── RfxComConfigService.ts       # Service de configuration
│   ├── ui-metadata.ts               # NOUVEAU v2.1 : Métadonnées UI
│   └── types.ts                     # Types TypeScript
│
└── presentation/                    # Couche Présentation
    ├── index.html                   # UI spécifique (chargée dynamiquement)
    ├── components/                   # Composants Alpine.js
    │   ├── DevicesList.ts           # Liste des devices
    │   └── ...
    └── styles/                       # Styles spécifiques
        └── rfxcom.css
```

### 4.5 Génération Dynamique des Formulaires de Configuration (v2.1)

**Nouveauté v2.1 :** Chaque module d'application peut **déclarer ses propres métadonnées UI** pour permettre la **génération automatique des formulaires de configuration** dans l'interface web.

#### 4.5.1 Types Disponibles

**Fichier :** `src/types/config.ts`

```typescript
// Métadonnées pour un champ de configuration
export interface ConfigField {
  name: string;                    // Nom du champ (ex: 'serialPort')
  label: string;                   // Label à afficher
  type: 'text' | 'number' | 'boolean' | 'select' | 'password';
  placeholder?: string;
  hint?: string;                   // Texte d'aide
  required?: boolean;
  options?: { value: string; label: string }[]; // Pour les selects
  min?: number;                   // Pour number
  max?: number;
  step?: number;
}

// Métadonnées UI pour un module d'application
export interface ModuleUiMetadata {
  title: string;                  // Titre de la section
  description: string;            // Description
  icon?: string;                  // Icône (optionnel)
  fields: ConfigField[];          // Liste des champs à afficher
}

// Extension de ApplicationModule
export interface ApplicationModule {
  // ... champs existants ...
  configUi?: ModuleUiMetadata;    // Métadonnées pour l'interface utilisateur
  configSection?: string;         // Nom de la section dans la config (par défaut = id)
}
```

#### 4.5.2 Implémentation par un Module (Exemple : RFXCOM)

**Fichier :** `src/applications/rfxcom/domain/ui-metadata.ts`

```typescript
import type { ModuleUiMetadata, ConfigField } from '../../../types/config';

export const RFXCOM_UI_METADATA: ModuleUiMetadata = {
  title: 'Configuration RFXCOM',
  description: 'Paramètres techniques pour l\'intégration RFXCOM (433 MHz)',
  icon: '📡',
  fields: [
    {
      name: 'enabled',
      label: 'Activer RFXCOM',
      type: 'boolean',
      hint: 'Active ou désactive complètement le module RFXCOM',
      required: false,
    },
    {
      name: 'serialPort',
      label: 'Port Série',
      type: 'text',
      placeholder: '/dev/ttyACM0',
      hint: 'Chemin vers le port série où est connecté le transceiver RFXCOM',
      required: true,
    },
    {
      name: 'baudRate',
      label: 'Baud Rate',
      type: 'number',
      placeholder: '38400',
      hint: 'Vitesse de communication série en bauds',
      required: true,
      min: 1,
      max: 115200,
    },
    {
      name: 'transceiverType',
      label: 'Type de Transceiver',
      type: 'select',
      hint: 'Modèle du transceiver RFXCOM utilisé',
      required: true,
      options: [
        { value: 'rfxtrx433e', label: 'RFXtrx433E (433 MHz Europe)' },
        { value: 'rfxtrx433xl', label: 'RFXtrx433XL (433 MHz Long Range)' },
      ],
    },
  ],
};
```

#### 4.5.3 Flux de Génération Dynamique

```
┌─────────────────┐     ┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Module        │     │ AppService  │     │ SocketBridge    │     │    UI       │
│   (RFXCOM)     │     │             │     │                 │     │ (Alpine.js)│
└────────┬────────┘     └──────┬──────┘     └─────────┬───────┘     └──────┬──────┘
         │                    │                    │                     │
         │  Déclare configUi  │                    │                     │
         │──────────────────>│                    │                     │
         │                    │                    │                     │
         │                    │  Détecte module   │                     │
         │                    │  + emit UI meta  │                     │
         │                    │────────────────>│                     │
         │                    │                    │  Relay UI meta   │
         │                    │                    │────────────────>│
         │                    │                    │                     │
         │                    │  ConfigService    │                     │
         │                    │  auto-init sections│                     │
         │                    │<────────────────┘                     │
         │                    │                    │                     │
         │                    │  module:{id}:config│                     │
         │                    │──────────────────────────────────────>│
         │                    │                    │                     │
         │                    │  app:module:ui:register                 │
         │                    │──────────────────────────────────────>│
         └───────────────────────────────────────────────────────────────┘
                              
                          [UI génère formulaire dynamique]
```

**Étape par étape :**

1. **Couche Métier (Module)** : Le module déclare ses métadonnées UI (`configUi`) et sa section de config (`configSection`)
2. **AppService** : 
   - Détecte automatiquement les modules dans `src/applications/`
   - Appelle `ConfigService.ensureModuleSections()` pour initialiser les sections manquantes
   - Émet `app:module:ui:register` pour chaque module avec `configUi`
3. **SocketBridge** : Relay l'événement vers l'UI via Socket.io
4. **UI** : 
   - Reçoit les métadonnées UI via `app:module:ui:register`
   - Demande la configuration actuelle via `app:modules:config:get`
   - Génère dynamiquement le formulaire HTML via `generateModuleConfigForm()`
   - Affiche le formulaire avec Alpine.js `x-html`

#### 4.5.4 Événements Socket.io Spécifiques

| Événement | Direction | Payload | Description |
|-----------|-----------|---------|-------------|
| `app:module:ui:register` | Server → UI | `{ moduleId, metadata: ModuleUiMetadata }` | Métadonnées UI d'un module |
| `app:modules:config:get` | UI → Server | `{ moduleId }` | Demande la config d'un module |
| `app:modules:config:save` | UI → Server | `{ moduleId, config }` | Sauvegarde la config d'un module |

#### 4.5.5 Avantages de cette Approche

✅ **Respect de l'architecture 5 couches** : Chaque couche a une responsabilité claire
- **Métier** : Déclare ses besoins UI
- **Application** : Orchestre la détection et l'émission
- **Infrastructure** : Gère la persistance des configurations
- **Présentation** : Affiche les formulaires sans connaître le domaine

✅ **Extensibilité** : Ajouter un nouveau module = déclarer `configUi` dans son `index.ts`
✅ **Maintenabilité** : Pas de modification du cœur pour ajouter des paramètres
✅ **Typage fort** : TypeScript garantit la cohérence des données
✅ **Génération automatique** : Pas de code UI à écrire pour les formulaires

---

## 🔄 4.6 Ajout/Suppression Dynamique d'Applications (NOUVEAU v2.2)

### 4.6.1 Principe Fondamental

> **⭐ RÈGLE ABSOLUE (v2.2) :**
> **Il est possible d'ajouter ou de supprimer une application (ex: RFXCOM, Zigbee2MQTT) 
> SANS MODIFIER AUCUN FICHIER DU CŒUR (index.html, AppService.ts, EventBus.ts, etc.).**

Ce principe repose sur **4 piliers** :
1. **Index.html générique** : Aucune référence hardcodée à une application spécifique
2. **Convention de structure** : Chaque application suit la même organisation
3. **Détection automatique** : Le cœur scanne et charge dynamiquement les applications
4. **Chargement dynamique** : Menu, écrans et formulaires sont générés à la volée

### 4.6.2 Garantie : Index.html Sans Référence Hardcodée

**Fichier :** `src/presentation/ui/index.html`

✅ **Aucune référence** à une application spécifique (RFXCOM, Zigbee2MQTT, etc.) dans le code HTML statique.

**Preuves :**
- Le **menu** est généré dynamiquement via :
  ```html
  <template x-for="module in $store.sidebarStore.modules" :key="module.id">
    <li class="nav-item" :class="{ 'nav-item-active': activeModule === module.id }">
      <a :href="`'#' + module.id`" @click.prevent="setActiveModule(module.id)">
        <span class="nav-icon" x-text="module.icon"></span>
        <span class="nav-label" x-text="module.name"></span>
      </a>
    </li>
  </template>
  ```

- Les **écrans** sont chargés dynamiquement via :
  ```html
  <template x-for="module in $store.sidebarStore.modules" :key="module.id">
    <section :id="module.id" x-show="activeModule === module.id">
      <div x-init="loadModuleContent(module.id, $refs.moduleContainer)"></div>
    </section>
  </template>
  ```

- Les **formulaires de configuration** sont générés dynamiquement via :
  ```html
  <template x-for="module in $store.sidebarStore.modules" :key="module.id">
    <template x-if="module.configUi && module.id !== 'core'">
      <div x-html="$store.appStore.generateModuleConfigForm(module.id)"></div>
    </template>
  </template>
  ```

### 4.6.3 Convention de Structure pour les Applications

Pour qu'une application soit **automatiquement détectée et intégrée**, elle doit respecter la convention suivante :

```
src/applications/
└── [app-name]/                    # ⭐ Nom unique de l'application (ex: rfxcom, zigbee2mqtt)
    ├── domain/                    # ⭐ OBLIGATOIRE : Couche Métier
    │   └── index.ts               # ⭐ OBLIGATOIRE : Export *APP (ex: RFXCOM_APP)
    └── presentation/              # ⭐ OPTIONNEL : Couche Présentation
        └── index.html             # ⭐ OPTIONNEL : UI spécifique (chargée dynamiquement)
```

**Exigences pour le fichier `domain/index.ts` :**
```typescript
// Structure minimale requise
export const [APP_NAME]_APP: ApplicationModule = {
  id: '[app-name]',          // ⭐ Doit correspondre au nom du répertoire
  name: '[Nom Affiché]',     // ⭐ Affiché dans le menu
  description: '[...]',      // Description
  icon: '[emoji]',           // Icône (emoji)
  type: 'integration' | 'standalone', // Type de module
  configurable: true | false, // A des paramètres à configurer
  // ... autres propriétés optionnelles
};
```

### 4.6.4 Exemple : Ajout de Zigbee2MQTT

**Étape 1 : Créer la structure de fichiers**
```bash
mkdir -p src/applications/zigbee2mqtt/domain
mkdir -p src/applications/zigbee2mqtt/presentation
```

**Étape 2 : Déclarer le module**
```typescript
// src/applications/zigbee2mqtt/domain/index.ts
import type { ApplicationModule } from '../../../../application/types.js';

export const ZIGBEE2MQTT_APP: ApplicationModule = {
  id: 'zigbee2mqtt',
  name: 'Zigbee2MQTT',
  description: 'Intégration des devices Zigbee',
  icon: '🐝',
  type: 'integration',
  configurable: true,
  requiredMqtt: true,
  requiredHaWs: false,
};
```

**Étape 3 : Créer l'UI (optionnel)**
```html
<!-- src/applications/zigbee2mqtt/presentation/index.html -->
<div x-data="zigbeeStore()">
  <h2>Zigbee2MQTT</h2>
  <p>Configuration des devices Zigbee...</p>
</div>
```

**Étape 4 : Redémarrer l'application**
```bash
# Le module Zigbee2MQTT apparaît automatiquement dans le menu
# Son écran est accessible via l'URL : #zigbee2mqtt
# Aucun fichier du cœur n'a été modifié
```

### 4.6.5 Exemple : Suppression de RFXCOM

**Étape 1 : Supprimer le répertoire**
```bash
rm -rf src/applications/rfxcom/
```

**Étape 2 : Redémarrer l'application**
```bash
# RFXCOM disparaît automatiquement du menu
# Ses écrans ne sont plus accessibles
# Aucun fichier du cœur n'a été modifié
```

### 4.6.6 Flux Complet d'Ajout/Suppression

```
┌─────────────────────────────────────────────────────────────────┐
│                        AJOUT D'UNE APPLICATION                     │
├─────────────────────────────────────────────────────────────────┤
│  1. Développeur crée :                                            │
│     src/applications/zigbee2mqtt/domain/index.ts                  │
│     (avec export ZIGBEE2MQTT_APP)                                │
│                                                                  │
│  2. Développeur crée (optionnel) :                                │
│     src/applications/zigbee2mqtt/presentation/index.html          │
│                                                                  │
│  3. Redémarrage de l'application                                   │
│     └── AppService.detectApplicationModules()                    │
│         └── Scanne src/applications/                              │
│         └── Trouve zigbee2mqtt/                                    │
│         └── Charge ZIGBEE2MQTT_APP                               │
│         └── Émet app:modules:registered                            │
│                                                                  │
│  4. SocketBridge relaie vers UI                                    │
│     └── Émet app:modules:list vers Socket.io                     │
│                                                                  │
│  5. UI affiche :                                                  │
│     └── Menu : +入 Zigbee2MQTT 🐝                                  │
│     └── Écran : Chargement dynamique via fetch()                 │
│     └── Paramètres : Génération automatique si configUi         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      SUPPRESSION D'UNE APPLICATION                 │
├─────────────────────────────────────────────────────────────────┤
│  1. Développeur supprime :                                         │
│     rm -rf src/applications/rfxcom/                               │
│                                                                  │
│  2. Redémarrage de l'application                                   │
│     └── AppService.detectApplicationModules()                    │
│         └── Scanne src/applications/                              │
│         └── Ne trouve plus rfxcom/                                 │
│         └── Émet app:modules:registered (sans RFXCOM)             │
│                                                                  │
│  3. SocketBridge relaie vers UI                                    │
│     └── Émet app:modules:list vers Socket.io                     │
│                                                                  │
│  4. UI met à jour :                                               │
│     └── Menu : - RFXCOM 📡                                         │
│     └── Écran : Plus accessible                                   │
│     └── Paramètres : Plus affichés                                │
└─────────────────────────────────────────────────────────────────┘
```

### 4.6.7 Garanties et Contraintes

| **Garantie** | **Mécanisme** | **Preuve** |
|--------------|---------------|------------|
| Index.html générique | Aucune référence hardcodée | `src/presentation/ui/index.html` (lignes 58-71, 407-419) |
| Menu dynamique | `x-for` sur les modules | `index.html` (lignes 58-71) |
| Écrans dynamiques | Chargement via `fetch()` | `index.html` (lignes 407-419) |
| Paramètres dynamiques | Génération via `configUi` | `index.html` (lignes 385-396) |
| Détection automatique | Scan de `src/applications/` | `AppService.ts` (lignes 160-279) |
| Pas de modification cœur | Convention + détection automatique | Aucune référence à RFXCOM dans le cœur |

**⚠️ Contraintes à respecter :**
1. **Nom du répertoire = `id` du module** : `src/applications/rfxcom/` ↔ `id: 'rfxcom'`
2. **Fichier obligatoire** : `domain/index.ts` exportant `*_APP`
3. **Structure fixe** : `domain/` et `presentation/` (ce dernier optionnel)
4. **Redémarrage requis** : Les changements sont pris en compte après redémarrage

---

## 🔄 4.7 Activation/Désactivation Dynamique des Applications (NOUVEAU v2.3)

### 4.7.1 Principe
Une application peut être **activée** ou **désactivée** sans modification du cœur, par simple déplacement de son répertoire entre :
- `src/applications/` → **Applications activées** (chargées au démarrage)
- `src/applications_desactivees/` → **Applications désactivées** (ignorées)

**Mécanisme :**
- La détection dynamique (`AppService.scanApplications()`) **ignore** le répertoire `applications_desactivees/`
- Seul le contenu de `applications/` est chargé et affiché dans le menu

### 4.7.2 Processus d'Activation/Désactivation
1. **Via l'UI (recommandé) :**
   - L'utilisateur clique sur **[Désactiver]** dans le menu "Gestion des applications > Activées"
   - L'UI envoie une commande au backend : `POST /api/applications/{id}/disable`
   - Le backend déplace le répertoire : `applications/{id}/` → `applications_desactivees/{id}/`
   - Un **restart** est déclenché automatiquement (ou message d'alerte si manuel)

2. **Manuellement (filesystem) :**
   - Déplacement manuel du répertoire entre les deux dossiers
   - **Restart obligatoire** pour prise en compte

### 4.7.3 Impact sur la Présentation

**Structure du menu (voir §6.1) :**
```
Paramètres Techniques
├── Commun
│   ├── MQTT
│   ├── Home Assistant WS
│   ├── Web
│   └── Logging
├── Gestion des applications
│   ├── ✅ Activées
│   │   ├── RFXCOM [Désactiver]
│   │   ├── ZIGBEE [Désactiver]
│   │   └── tartenpion [Désactiver]  (dynamique)
│   └── ❌ Désactivées
│       └── (liste) [Activer]
├── RFXCOM (menu dédié - niveau 1)
│   └── Paramètres techniques RFXCOM
├── ZIGBEE (menu dédié - niveau 1)
│   └── Paramètres techniques ZIGBEE
└── tartenpion (menu dédié - niveau 1, dynamique)
    └── Paramètres techniques tartenpion
```

**Comportement dynamique :**
- Une application **activée** apparaît :
  - ✅ Dans `Gestion des applications > Activées` (avec bouton [Désactiver])
  - ✅ Comme **entrée de niveau 1** dans le menu principal (avec ses paramètres techniques)
- Une application **désactivée** disparaît :
  - ❌ Du menu principal de niveau 1
  - ✅ Reste visible dans `Gestion des applications > Désactivées` (avec bouton [Activer])

### 4.7.4 Exemple : Activation de tartenpion

**Avant activation :**
```
src/
├── applications/
│   ├── rfxcom/
│   └── zigbee2mqtt/
└── applications_desactivees/
    └── tartenpion/
```
→ Menu : Pas d'entrée "tartenpion" au niveau 1, visible dans "Gestion > Désactivées"

**Après activation :**
```
src/
├── applications/
│   ├── rfxcom/
│   ├── zigbee2mqtt/
│   └── tartenpion/  ← déplacé
└── applications_desactivees/
```
→ Menu : "tartenpion" apparaît au niveau 1 + visible dans "Gestion > Activées"

### 4.7.5 Flux Complet

```mermaid
graph TD
    A[Utilisateur clique [Activer]] --> B[Backend : déplace tartenpion/]
    B --> C[applications_desactivees/ → applications/]
    C --> D[Backend déclenche restart]
    D --> E[Redémarrage]
    E --> F[AppService rescan applications/]
    F --> G[UI reçoit nouvelle liste]
    G --> H[Menu mis à jour]
```

### 4.7.6 Garanties

| **Garantie** | **Mécanisme** | **Preuve** |
|--------------|---------------|------------|
| Pas de modification cœur | Déplacement de répertoires uniquement | Convention filesystem |
| Menu dynamique | Génération via `x-for` sur modules détectés | `index.html` (lignes 58-71) |
| Données conservées | `data/{app}/` non supprimé | Persistance indépendante |
| Activation réversible | Répertoire simplement déplacé | Pas de suppression |

---

## ⚡ 5. Paramètres Techniques (Socle)

### 5.1 Définition

Les paramètres techniques sont **communs à toutes les applications** et définis dans le socle :

- **HA WebSocket** : host, port, token, reconnect_delay
- **MQTT** : host, port, client_id, username, password, keepalive, reconnect_delay *(présent uniquement pour les applications de type "intégration")*
- **Web** : port, host
- **Logging** : level, rotate (max_size_mb, max_files)

**Source de vérité :** `src/infrastructure/config/schema.ts`

### 5.2 Affichage Prioritaire (Paramètres Non Configurés)

**Règle :** Si un paramètre **requis** n'est pas configuré, il doit être **immédiatement visible** à l'utilisateur au chargement de la page.

**Mécanisme :**
1. Au démarrage, `ConfigService` valide la configuration complète
2. `ConfigService` identifie les champs **requis** manquants via Zod
3. `AppService` émet `config:validation:result` via EventBus avec le résultat de validation
4. `SocketBridge` relaie `config:validation:result` vers l'UI
5. L'UI affiche une **bannière d'alerte non fermable** en haut de la page avec la liste des paramètres manquants

### 5.3 Composant TechnicalParams

**Fichier :** `src/presentation/ui/components/TechnicalParams.js`

**Responsabilités :**
- Afficher les paramètres techniques du socle
- Afficher conditionnellement la section MQTT (uniquement pour les applications de type "intégration")
- Valider visuellement les champs requis
- Envoyer les modifications via Socket.io

### 5.4 Schéma de Données et Validation

**Interface TypeScript complète :**

```typescript
// src/types/config.ts

// Statut de validation d'un champ
interface ValidationStatus {
  isValid: boolean;
  isRequired: boolean;
  errorMessage?: string;
  warningMessage?: string;
  section: 'ha' | 'mqtt' | 'web' | 'logging' | string;
}

// Structure complète des paramètres techniques
interface TechnicalConfig {
  ha: {
    ws: {
      host: string;              // Required
      port: number;              // Default: 8123
      token: string;             // Required (Long-Lived Access Token)
      reconnect_delay: number;   // Default: 5 (secondes)
    };
    structure: {
      include_unassigned: boolean;   // Default: false
      unassigned_label: string;      // Default: "Non assigné"
    };
  };
  mqtt?: {                       // Présent UNIQUEMENT pour applications type "integration"
    host: string;              // Required
    port: number;              // Default: 1883
    client_id: string;         // Required (unique par application)
    username?: string;
    password?: string;
    keepalive: number;         // Default: 60
    reconnect_delay: number;   // Default: 5
  };
  web: {
    port: number;              // Default: 8080
    host: string;              // Default: "0.0.0.0"
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';  // Default: "info"
    rotate: {
      max_size_mb: number;     // Default: 10
      max_files: number;       // Default: 5
    };
  };
}
```

### 5.5 Flux Complet de Gestion des Paramètres Techniques

```
Sequence Diagram : Chargement et Validation

┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    UI        │     │  Socket.io Server │     │ ConfigService   │
│ (Alpine.js)  │     │                 │     │                 │
└──────┬──────┘     └─────────┬───────┘     └─────────┬───────┘
       │                     │                         │
       │  config:get()       │                         │
       │────────────────────>│                         │
       │                     │  getConfig()           │
       │                     │──────────────────────>│
       │                     │                         │
       │                     │  config + validation    │
       │                     │<──────────────────────│
       │                     │                         │
       │  config:current      │                         │
       │  config:validation:result                          │
       │<────────────────────│                         │
       │                     │                         │
       │  [Affiche formulaire]│                         │
       │  [Affiche bannière si erreurs]                    │
```

```
Sequence Diagram : Sauvegarde

┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    UI        │     │  Socket.io Server │     │ ConfigService   │
│ (Alpine.js)  │     │                 │     │                 │
└──────┬──────┘     └─────────┬───────┘     └─────────┬───────┘
       │                     │                         │
       │  config:save(newConfig)│                         │
       │────────────────────>│                         │
       │                     │  validate(newConfig)     │
       │                     │──────────────────────>│
       │                     │                         │
       │                     │  [Si invalide]          │
       │                     │  config:saved {success: false, error}│
       │                     │──────────────────────>│
       │  config:saved        │                         │
       │<────────────────────│                         │
       │                     │                         │
       │  [Si valide]        │                         │
       │                     │  writeConfig(newConfig) │
       │                     │──────────────────────>│
       │                     │                         │
       │                     │  RestartManager         │
       │                     │  → process.exit(0)     │
       │  config:saved {success: true}                     │
       │<────────────────────│                         │
```

**Événements Socket.io spécifiques aux paramètres techniques :**

| Direction | Événement | Payload | Description |
|-----------|-----------|---------|-------------|
| Server → Client | `config:current` | `TechnicalConfig` | Configuration technique actuelle |
| Server → Client | `config:validation:result` | `ConfigValidationResult` | Résultat de validation (erreurs + warnings) |
| Server → Client | `config:saved` | `{ success: boolean, error?: string }` | Résultat de la sauvegarde |
| Client → Server | `config:get` | `void` | Demande la configuration actuelle |
| Client → Server | `config:save` | `TechnicalConfig` | Soumet une nouvelle configuration |

### 5.6 Intégration avec Alpine.js

**Initialisation Alpine avec Socket.io :**

```typescript
// src/presentation/ui/app.ts
import Alpine from 'alpinejs';
import { io, Socket } from 'socket.io-client';

// Connexion Socket.io
await Alpine.start();
const socket = io();

// Initialisation Alpine
Alpine.store('technicalConfigStore', () => ({
  socket: socket,
  technicalConfig: getDefaultConfig(),
  validationResult: { valid: false, errors: [], warnings: [], requiredMissing: [] },
  
  init() {
    this.socket.emit('config:get');
    this.socket.on('config:current', (config) => { this.technicalConfig = config; });
    this.socket.on('config:validation:result', (result) => { this.validationResult = result; });
  },
  
  saveConfig() {
    this.socket.emit('config:save', this.technicalConfig);
  },
  
  validateField(path) { /* ... */ },
  getFieldStatusClass(path) { /* ... */ },
}));
```

### 5.7 Composant AlertBanner (Affichage Prioritaire)

**Objectif :** Afficher immédiatement les paramètres techniques manquants ou invalides au chargement de la page.

**Règles d'affichage :**
- **Toujours visible** si au moins 1 champ requis est manquant
- **Non fermable** tant que des erreurs (non des warnings) sont présentes
- **Position :** En haut de la page, au-dessus de tout autre contenu
- **Style :** Fond rouge pour les erreurs, jaune pour les warnings uniquement

---

## 🗂️ 6. Menu Dynamique par Application

### 6.1 Génération du Menu

**Source des données :** Événement Socket.io `app:modules:list` émis au chargement de la page et après toute modification.

**Payload Socket.io :**
```json
{
  "event": "app:modules:list",
  "data": {
    "modules": [
      {
        "id": "core",
        "name": "Paramètres Techniques",
        "description": "Configuration globale de l'application",
        "icon": "⚙️",
        "configurable": true,
        "status": "configured"
      },
      {
        "id": "rfxcom",
        "name": "RFXCOM",
        "description": "Intégration RF433",
        "icon": "📡",
        "type": "integration",
        "configurable": true,
        "status": "partial"
      },
      {
        "id": "zigbee2mqtt",
        "name": "Zigbee2MQTT",
        "description": "Intégration Zigbee",
        "icon": "🐝",
        "type": "integration",
        "configurable": true,
        "status": "configured"
      }
    ]
  }
}
```

### 6.2 Statut de Configuration

Chaque module a un statut calculé par la **couche Application** :

| Statut | Critère | Affichage |
|--------|---------|-----------|
| `configured` | Tous les paramètres requis sont présents et valides | ✓ Vert |
| `partial` | Certains paramètres requis manquent | ⚠ Jaune |
| `missing` | Aucun paramètre configuré | ❌ Rouge |
| `error` | Erreur de validation ou de connexion | ❌ Rouge + message |

### 6.3 Affichage du Menu

Le menu est généré dynamiquement dans `index.html` via Alpine.js :

```html
<aside class="sidebar" x-data="$store.sidebarStore">
  <nav class="sidebar-nav">
    <h2 class="nav-title">Applications</h2>
    <ul class="nav-list">
      <!-- Module Core (toujours présent) -->
      <li class="nav-item" :class="{ 'active': activeModule === 'core' }">
        <a href="#core" @click.prevent="setActiveModule('core')">
          <span class="nav-icon">⚙️</span>
          <span class="nav-label">Paramètres Techniques</span>
          <span class="nav-status" :class="getModuleStatusClass('core')">
            <span x-text="getModuleStatusIcon('core')"></span>
          </span>
        </a>
      </li>
      
      <!-- Modules dynamiques (toutes les applications détectées) -->
      <template x-for="module in modules" :key="module.id">
        <li class="nav-item" :class="{ 'active': activeModule === module.id }" x-show="module.id !== 'core'">
          <a :href="`'#' + module.id`" @click.prevent="setActiveModule(module.id)">
            <span class="nav-icon" x-text="module.icon"></span>
            <span class="nav-label" x-text="module.name"></span>
            <span class="nav-status" :class="getModuleStatusClass(module.id)">
              <span x-text="getModuleStatusIcon(module.id)"></span>
            </span>
          </a>
        </li>
      </template>
    </ul>
  </nav>
</aside>
```

---

## 📡 7. Communication Socket.io

### 7.1 Événements Socle (Hérités)

Conformes §5.2 et §5.3 specs-techniques-socle-ha-mqtt-v4.2

**Server → Client :**
| Événement | Payload | Description |
|-----------|---------|-------------|
| `app:status` | `{ mqtt: boolean, haEntities: number, uptime: number }` | État global |
| `app:log` | `{ level: string, module: string, message: string, ts: string }` | Log en temps réel |
| `ha:entity:updated` | `HaEntity` | Mise à jour d'une entité HA |
| `ha:sync:ready` | `{ entityCount: number }` | Référentiel HA initialisé |
| `config:current` | `AppConfig` | Config actuelle |
| `config:saved` | `{ success: boolean, error?: string }` | Résultat sauvegarde config |
| `mqtt:connected` | `void` | Connexion MQTT établie |
| `mqtt:disconnected` | `{ reason: string }` | Perte de connexion MQTT |

**Client → Server :**
| Événement | Payload | Description |
|-----------|---------|-------------|
| `config:get` | `void` | Demande la config actuelle |
| `config:save` | `AppConfig` | Soumet une nouvelle configuration |
| `logs:get` | `{ lines: number }` | Demande les N dernières lignes de log |

### 7.2 NOUVEAU : Événements Présentation (v2.1)

**Server → Client :**
| Événement | Payload | Description |
|-----------|---------|-------------|
| `app:modules:list` | `{ modules: ApplicationModule[] }` | Liste des applications disponibles |
| `app:modules:config` | `{ moduleId: string, config: object }` | Configuration d'une application spécifique |
| `app:module:ui:register` | `{ moduleId: string, metadata: ModuleUiMetadata }` | Métadonnées UI d'un module (v2.1) |
| `config:validation:result` | `{ valid: boolean, errors: ValidationError[], warnings: ValidationWarning[] }` | Résultat de validation |

**Client → Server :**
| Événement | Payload | Description |
|-----------|---------|-------------|
| `app:modules:config:get` | `{ moduleId: string }` | Demande config d'une application |
| `app:modules:config:save` | `{ moduleId: string, config: object }` | Sauve config d'une application |

### 7.3 Événements Spécifiques Applications

**⚠️ IMPORTANT :** Les événements spécifiques aux applications (comme `rfxcom:*`) **ne sont pas définis dans la couche Présentation**. Ils sont :

1. **Déclarés** dans la **couche Métier** (ex: `src/applications/rfxcom/domain/socket-events.ts`)
2. **Enregistrés** dans la **couche Application** (`AppService`)
3. **Relayés** par `SocketBridge`
4. **Découverts dynamiquement** par la Présentation via `app:modules:list`

La Présentation **ne connaît pas** ces événements à l'avance, elle les reçoit dynamiquement via la liste des modules.

**Exemple pour RFXCOM :**
- Les événements sont définis dans `src/applications/rfxcom/domain/socket-events.ts`
- Les composants UI qui les utilisent sont dans `src/applications/rfxcom/presentation/components/`
- Le serveur les relaie via Socket.io sans connaître leur existence à la compilation

---

## 📊 8. Exemples Concrets

### 8.1 Scénario : Première Connexion (Paramètres Manquants)

**État initial :**
- `config.yaml` contient seulement `web.port: 8080`
- MQTT et HA WS ne sont pas configurés

**Flux :**
1. Serveur démarre
2. `ConfigService` valide la config
3. `ConfigService` détecte : `ha.ws.token` manquant, `mqtt.host` manquant
4. `AppService` émet `config:validation:result` avec erreurs
5. `SocketBridge` émet vers UI : `config:validation:result`
6. UI affiche bannière d'alerte :
   ```
   ⚠️ CONFIGURATION REQUISE
   └── HA Connection : Token manquant
   └── MQTT : Host manquant
   ```
7. Menu latéral :
   ```
   ⚙️ Paramètres Techniques [⚠️]
   ```

### 8.2 Scénario : RFXCOM Activé et Configuré

**État :**
- MQTT et HA configurés
- RFXCOM installé et configuré

**Flux :**
1. `AppService` détecte le module RFXCOM
2. `SocketBridge` émet `app:modules:list` avec RFXCOM dans la liste
3. UI affiche :
   ```
   Menu :
   ├── ⚙️ Paramètres Techniques [✓]
   └── 📡 RFXCOM [✓]
   ```
4. L'utilisateur clique sur RFXCOM pour voir :
   - Liste des devices détectés
   - Liste des récepteurs
   - Boutons pour créer/modifier/supprimer des récepteurs

### 8.3 Scénario : RFXCOM Installé mais Non Configuré

**État :**
- MQTT et HA configurés
- RFXCOM installé mais `serialPort` non défini

**Flux :**
1. `AppService` détecte RFXCOM avec statut `partial`
2. Menu affiche : `📡 RFXCOM [⚠️]`
3. L'utilisateur voit un message : "Configuration RFXCOM incomplète"
4. L'onglet RFXCOM montre les paramètres manquants en évidence

### 8.4 Scénario : Ajout de Zigbee2MQTT (NOUVEAU v2.2)

**Étape 1 : Création de la structure**
```bash
mkdir -p src/applications/zigbee2mqtt/domain
mkdir -p src/applications/zigbee2mqtt/presentation
```

**Étape 2 : Déclaration du module**
```typescript
// src/applications/zigbee2mqtt/domain/index.ts
export const ZIGBEE2MQTT_APP: ApplicationModule = {
  id: 'zigbee2mqtt',
  name: 'Zigbee2MQTT',
  description: 'Intégration Zigbee',
  icon: '🐝',
  type: 'integration',
  configurable: true,
  requiredMqtt: true,
  requiredHaWs: false,
};
```

**Étape 3 : Redémarrage**
```bash
# Zigbee2MQTT apparaît dans le menu
# Son écran est accessible via #zigbee2mqtt
# AUCUN fichier du cœur n'a été modifié
```

### 8.5 Scénario : Suppression de RFXCOM (NOUVEAU v2.2)

**Étape 1 : Suppression**
```bash
rm -rf src/applications/rfxcom/
```

**Étape 2 : Redémarrage**
```bash
# RFXCOM disparaît du menu
# Ses écrans ne sont plus accessibles
# AUCUN fichier du cœur n'a été modifié
```

---

## 🎯 9. Règles de Conception à Respecter

### 9.1 Respect des Couches (Conforme §3.1 specs-techniques-socle-ha-mqtt-v4.2)

| Règle | Application |
|-------|-------------|
| ✅ Présentation → ne connaît pas le Métier | Utiliser uniquement Socket.io |
| ✅ Présentation → ne lit pas config.yaml | Passer par Socket.io |
| ✅ Métier → ne connaît pas Présentation | Émettre via EventBus uniquement |
| ✅ Communication → toujours via EventBus | SocketBridge fait le lien |
| ✅ Pas de frameworks | HTML/CSS/JS vanilla + Alpine.js |
| ✅ **Pas de références hardcodées** | Menu et écrans dynamiques |

### 9.2 Principes UI

1. **Single Page Application** : Une seule page HTML, navigation via ancres (`#core`, `#rfxcom`, etc.)
2. **Framework UI** : **Alpine.js 3.x** + TypeScript pour la réactivité
3. **Socket.io obligatoire** : Toute communication passe par Socket.io
4. **Responsive** : Adapté mobile et desktop
5. **Accessible** : Respect des standards WCAG 2.1 AA minimum

### 9.3 Gestion de la Configuration

1. **Lecture** : Toujours via `config:get` → Socket.io → ConfigService
2. **Écriture** : Toujours via `config:save` → Socket.io → ConfigWriter → RestartManager
3. **Validation** : Toujours côté serveur (Zod)
4. **Feedback** : Toujours un accusé de réception (`config:saved`)
5. **Persistance** : Atomique (écriture dans `.tmp` puis rename)

---

## ✅ 10. Validation de Conformité

| Contrainte Socle (§ specs-techniques-v4.2) | Statut | Implémentation |
|--------------------------------------------|--------|----------------|
| 5 couches strictes | ✅ | Architecture respectée |
| Dépendances vers le bas uniquement | ✅ | Présentation → Socket.io → EventBus → Métier |
| Communication UI via Socket.io uniquement | ✅ | Pas de REST, pas d'accès direct aux fichiers |
| EventBus comme canal inter-couches | ✅ | SocketBridge fait le lien |
| ConfigService centralisé | ✅ | Utilisé via Socket.io |
| Validation Zod | ✅ | Côté serveur uniquement |
| Single Page App | ✅ | Une page HTML |
| Framework UI | ✅ | Alpine.js 3.x + TypeScript |
| /health en HTTP | ✅ | Géré par Express |
| **Index.html générique** | ✅ | **AUCUNE référence hardcodée à une application** |
| **Menu dynamique** | ✅ | **Généré via x-for sur les modules détectés** |
| **Écrans dynamiques** | ✅ | **Chargés via fetch()** |
| **Ajout/suppression sans modification cœur** | ✅ | **Détection automatique + convention** |

---

## 📅 11. Historique des Versions

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| **2.3** | 14/07/2026 | Mistral Vibe | Ajout de la **gestion dynamique d'activation/désactivation** des applications. Ajout §4.7 "Activation/Désactivation Dynamique" avec répertoires `applications_desactivees/`. Mise à jour structure menu : gestion des apps au niveau 1 + menus dédiés par application. |
| **2.2** | 14/07/2026 | Mistral Vibe | **Clarification explicite** de la dynamique d'ajout/suppression des applications. Ajout de §4.6 "Ajout/Suppression Dynamique d'Applications" avec exemples concrets et garanties. Mise à jour de la structure des répertoires UI. |
| 2.1 | 13/07/2026 | Mistral Vibe | Ajout de la **génération dynamique des formulaires de configuration des modules** via métadonnées UI (`configUi`, `ModuleUiMetadata`). |
| 2.0 | 12/07/2026 | Mistral Vibe | Migration vers **Alpine.js** pour la couche UI, mise à jour structure répertoires pour regroupement des applications sous `src/applications/`. |

---

## 📚 Annexes

### A.1 Types TypeScript

**Fichier :** `src/application/types.ts`

```typescript
// Type pour un module d'application
export interface ApplicationModule {
  id: string;                    // Identifiant unique (ex: 'rfxcom')
  name: string;                  // Nom affiché (ex: 'RFXCOM')
  description: string;           // Description
  icon: string;                 // Icône (emoji) (ex: '📡')
  type: 'core' | 'integration' | 'standalone';  // Type de module
  configurable: boolean;         // Peut être configuré via UI
  configSchema: any;            // Schéma Zod (pour validation côté serveur)
  socketEvents?: Record<string, string>;  // Événements Socket.io spécifiques
  requiredMqtt?: boolean;       // Nécessite MQTT
  requiredHaWs?: boolean;       // Nécessite HA WebSocket
  status?: 'configured' | 'partial' | 'missing' | 'error';  // Statut calculé
  // NOUVEAU v2.1 :
  configUi?: ModuleUiMetadata;    // Métadonnées pour générer le formulaire UI
  configSection?: string;         // Nom de la section dans la config
}

// Type pour un résultat de validation
export interface ValidationError {
  path: string;                  // Chemin du champ en erreur (ex: 'ha.ws.token')
  message: string;               // Message d'erreur
  severity: 'error' | 'warning'; // Gravité
  section: string;              // Section concernée (ex: 'ha')
  required: boolean;            // Champ requis
}

// Type pour la configuration technique
export type TechnicalConfig = {
  ha: {
    ws: {
      host: string;
      port: number;
      token: string;
      reconnect_delay: number;
    };
    structure: {
      include_unassigned: boolean;
      unassigned_label: string;
    };
  };
  mqtt?: {
    host: string;
    port: number;
    client_id: string;
    username?: string;
    password?: string;
    keepalive: number;
    reconnect_delay: number;
  };
  web: {
    port: number;
    host: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    rotate: {
      max_size_mb: number;
      max_files: number;
    };
  };
};
```

### A.2 Références

- [specs-techniques-socle-ha-mqtt-v4.3.md](specs-techniques-socle-ha-mqtt-v4.3.md) - Socle technique commun
- [specs-fonctionnelles-rfxcom-v5.0.md](specs-fonctionnelles-rfxcom-v5.0.md) - Spécifications fonctionnelles RFXCOM
- [specs-recepteurs-emetteurs-rfxcom-v5.0.md](specs-recepteurs-emetteurs-rfxcom-v5.0.md) - Récepteurs et émetteurs RFXCOM

---

*Document **v2.2** généré le **14 Juillet 2026** - Conforme aux spécifications du socle HA-MQTT v4.3*
*Migration vers Alpine.js + TypeScript, restructuration des répertoires sous `src/applications/`, 
 génération dynamique des formulaires de configuration des modules, **et clarification explicite de la dynamique d'ajout/suppression d'applications**.
