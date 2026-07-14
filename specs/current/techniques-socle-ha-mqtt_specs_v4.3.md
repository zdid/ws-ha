# Spécifications Techniques — Socle Commun Applications HA/MQTT

**Version :** 4.3  
**Date :** 10 Juillet 2026  
**Statut :** Document de référence projet — sert de prompt de base pour la génération de chaque application

> **v4.3** : Restructuration de la configuration HA avec flags d'activation (`ws_enable`, `mqtt_enable`) et regroupement MQTT sous HA.
> **v4.2** : Ajout du support **Alpine.js** pour la couche Présentation, tout en conservant TypeScript comme langage principal.

---

## 1. Contexte & Périmètre

Ce document définit le socle technique commun à toutes les applications du projet.
Chaque application hérite de l'intégralité de ces spécifications et les complète uniquement
avec ses propres règles métier, sa configuration spécifique, et les événements Socket.io
qu'elle choisit d'exposer à l'UI.

**Invariants communs à toutes les applications :**
- Écrites en **TypeScript 5.x** strict
- Communication avec **Home Assistant** via **MQTT** (broker Mosquitto standalone externe)
- **Synchronisation du référentiel HA** en mémoire (totale ou filtrée)
- Interface web embarquée communiquant exclusivement via **Socket.io** (sauf `/health`)
- Déployées dans un **conteneur Docker** avec `restart: unless-stopped`
- Configuration, données et logs **persistés sur l'hôte** dans `data/` et `logs/`

---

## 2. Stack Technique

| Composant | Technologie | Version |
|---|---|---|
| Langage | TypeScript | 5.x — mode strict |
| Runtime | Node.js (Alpine) | 20 LTS |
| Protocole IoT | MQTT | 3.1.1 / 5.0 |
| Broker MQTT | Mosquitto standalone | Externe au conteneur |
| Serveur HTTP/WS | Express.js + Socket.io | 4.x / 4.x |
| **Frontend** | **HTML + CSS + Alpine.js** | **3.x** |
| Containerisation | Docker + Docker Compose | — |
| Paquets | pnpm | lockfile strict |
| Validation | Zod | 3.x |
| Logging | Winston + daily-rotate-file | 3.x / 5.x |
| Tests | Vitest | 1.x |

---

## 3. Architecture en Couches

Règle absolue : **les dépendances ne vont que vers le bas**.
Une couche ne connaît jamais l'existence d'une couche supérieure.

Le projet compte **cinq couches**, dont une couche **HA** dédiée, intercalée entre
la couche Métier et la couche Infrastructure.

```
┌──────────────────────────────────────────────────────────┐
│                    COUCHE PRÉSENTATION                    │
│   UI Web (HTML/CSS/Alpine.js + TypeScript)               │
│   Serveur Express + Socket.io                            │
│   → Émet et reçoit uniquement des événements Socket.io   │
│   → Seul /health reste en HTTP pur                       │
├──────────────────────────────────────────────────────────┤
│                    COUCHE APPLICATION                     │
│   AppService · EventBus · SocketBridge · RestartManager  │
│   → SocketBridge : relaie EventBus ↔ Socket.io            │
├──────────────────────────────────────────────────────────┤
│                    COUCHE MÉTIER                         │
│   Logique pure spécifique à chaque application           │
│   Pas d'accès direct à HA, MQTT, fichiers, ou sockets    │
│   Consomme le référentiel structuré exposé par la        │
│   couche HA, et envoie ses commandes via cette couche     │
├──────────────────────────────────────────────────────────┤
│                     COUCHE HA                            │
│   Couche dédiée à toute la relation avec Home Assistant  │
│                                                            │
│   ┌──────────────────────────────────────────────────┐   │
│   │  A) Synchronisation référentiel — Web Service (WS) │   │
│   │     HaWsClient · HaStateRegistry                  │   │
│   │     HaStructureRegistry (area → QUOI → entités)   │   │
│   │     HaClassifier (module à venir, injecté ici)    │   │
│   │     HaCommandService (envoi commandes vers HA)    │   │
│   ├──────────────────────────────────────────────────┤   │
│   │  B) Modules d'intégration — MQTT                  │   │
│   │     Utilisés uniquement par les applications de    │   │
│   │     type "intégration" (passerelles, capteurs      │   │
│   │     tiers, etc.)                                   │   │
│   └──────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│               COUCHE INFRASTRUCTURE                    │
│   ConfigLoader · ConfigWriter · Logger                   │
│   (transport bas niveau : client WS, client MQTT)         │
└──────────────────────────────────────────────────────────┘
```

**Règles strictes :**
- La couche **métier** ne connaît ni HA, ni MQTT, ni Express, ni Socket.io, ni le filesystem —
  elle consomme exclusivement le référentiel structuré et les services exposés par la **couche HA**
- La couche **HA** est le seul point d'entrée/sortie vers Home Assistant pour toute l'application
- À l'intérieur de la couche HA, **deux modes de communication coexistent** sans se mélanger :
  - **Web Service (WebSocket HA native, port 8123)** : synchronisation du référentiel
    (entités, areas, devices) et envoi de commandes — utilisé par toute application
  - **MQTT** : réservé exclusivement aux applications de type **intégration**
    (modules qui font le pont entre HA et un système tiers)
- La **présentation** ne contient aucune logique métier
- Les modules métier communiquent vers l'UI **uniquement via EventBus**
- Le **SocketBridge** (couche application) est le seul composant qui traduit EventBus → Socket.io
- L'accès à `config.yaml` est réservé à `ConfigLoader` et `ConfigWriter`

---

## 4. Structure des Répertoires

### 4.1 Sur l'hôte (à côté de `compose.yaml`)

```
projet/
├── compose.yaml
├── .env                   # Secrets — non versionné
├── .env.example           # Modèle versionné sans valeurs sensibles
├── data/
│   └── config.yaml        # Configuration complète de l'application
└── logs/
    └── app.log            # Logs rotatifs
```

### 4.2 Sources TypeScript

```
src/
├── index.ts                          # Bootstrap : instancie et câble toutes les couches
│
├── types/                            # Interfaces partagées — accessibles par toutes les couches
│   ├── config.ts                     # AppConfig, MqttConfig, HaSyncConfig, WebConfig
│   ├── ha.ts                         # HaEntity, HaDomain, HaState
│   └── events.ts                     # AppEvent, SocketEvent, EventPayloads
│
├── infrastructure/
│   ├── config/
│   │   ├── schema.ts                 # Schéma Zod — source de vérité de la config
│   │   ├── loader.ts                 # Lecture + validation Zod de config.yaml
│   │   ├── writer.ts                 # Écriture atomique (tmp → rename) de config.yaml
│   │   └── ConfigService.ts          # Service centralisé d'accès à la config (injection de dépendances)
│   ├── transport/
│   │   ├── HaWsTransport.ts          # Client WebSocket bas niveau (connexion HA port 8123)
│   │   └── MqttTransport.ts          # Client MQTT bas niveau (utilisé par la couche HA, mode intégration)
│   └── logger/
│       └── index.ts                  # Winston : console + fichier rotatif
│
├── ha/                                # COUCHE HA — seul point de contact avec Home Assistant
│   ├── sync/                         # A) Synchronisation référentiel — via Web Service (WS)
│   │   ├── HaWsClient.ts             # Auth, souscriptions, routage des messages WS HA
│   │   ├── HaStateRegistry.ts        # États bruts des entités (Map<entity_id, HaRawEntity>)
│   │   ├── HaStructureRegistry.ts    # Référentiel structuré area → QUOI → entités
│   │   └── HaClassifier.ts           # Interface IHaClassifier — implémentation à venir (module dédié)
│   ├── command/
│   │   └── HaCommandService.ts       # Envoi de commandes vers HA (call_service via WS)
│   ├── integration/                  # B) Modules d'intégration — via MQTT
│   │   └── [module]/                 # Un sous-dossier par module d'intégration MQTT spécifique
│   └── types/
│       ├── ha-ws.ts                  # Types protocole WebSocket HA (messages, events)
│       ├── ha-entity.ts              # HaRawEntity, HaEntityState, HaDeviceClass
│       ├── ha-structure.ts           # HaArea, HaDevice, HaQuoi, HaStructuredRegistry
│       └── ha-command.ts             # HaCommand, HaServiceCall, HaCommandResult
│
├── application/
│   ├── AppService.ts                 # Cycle de vie, coordination des modules
│   ├── EventBus.ts                   # EventEmitter typé — canal inter-couches
│   ├── SocketBridge.ts               # Traduit EventBus → émissions Socket.io
│   └── RestartManager.ts             # process.exit(0) différé après sauvegarde config
│
├── applications/                     # Toutes les applications — chacune dans son répertoire
│   └── [app-name]/                  # Ex: rfxcom, zigbee2mqtt
│       ├── domain/                 # Couche Métier de l'application
│       │   └── [feature]/
│       │       ├── [Feature]Service.ts       # Logique métier — consomme HaStructureRegistry via EventBus
│       │       └── [Feature]Rules.ts         # Transformations et règles pures
│       └── presentation/            # Couche Présentation de l'application
│
└── presentation/
    ├── server.ts                     # Création Express + attache Socket.io + /health
    ├── socket/
    │   ├── handlers.ts               # Listeners des événements Socket.io entrants (client → serveur)
    │   └── events.ts                 # Constantes des noms d'événements Socket.io
    └── ui/                           # Servi statiquement par Express
        ├── index.html                # Page principale avec Alpine.js
        ├── style.css                 # Charte graphique commune (variables CSS)
        └── app.ts                    # Logique UI TypeScript — Socket.io client + Alpine.js
```

---

## 5. Communication Socket.io

### 5.1 Principe général

Socket.io est **l'unique canal** de communication entre l'UI et le serveur.
L'API REST est supprimée. Seul `/health` reste en HTTP pour le healthcheck Docker.

```
UI (app.ts + Alpine.js)  ←──── Socket.io ────→  server.ts
                                         │
                                    SocketBridge
                                         │
                                      EventBus
                                    ↙    ↓    ↘
                             MqttClient  HaSync  [Domain]
```

### 5.2 Événements Socket.io — Socle (server → client)

Ces événements sont émis par toutes les applications sans exception.

| Événement | Payload | Description |
|---|---|---|
| `app:status` | `{ mqtt: boolean, haEntities: number, uptime: number }` | État global — émis à la connexion et sur changement |
| `app:log` | `{ level: string, module: string, message: string, ts: string }` | Chaque ligne de log en temps réel |
| `ha:entity:updated` | `HaEntity` | Mise à jour d'une entité HA |
| `ha:sync:ready` | `{ entityCount: number }` | Référentiel HA initialisé |
| `config:current` | `AppConfig` | Config actuelle — émise sur demande ou après sauvegarde |
| `config:saved` | `{ success: boolean, error?: string }` | Résultat de la sauvegarde |
| `mqtt:connected` | `void` | Connexion MQTT établie |
| `mqtt:disconnected` | `{ reason: string }` | Perte de connexion MQTT |

### 5.3 Événements Socket.io — Socle (client → server)

| Événement | Payload | Description |
|---|---|---|
| `config:get` | `void` | Demande la config actuelle |
| `config:save` | `AppConfig` | Soumet une nouvelle configuration |
| `logs:get` | `{ lines: number }` | Demande les N dernières lignes de log |

### 5.4 Événements Socket.io — Extension par application

Chaque application déclare ses propres événements dans `src/presentation/socket/events.ts`.
Elle les émet exclusivement via l'EventBus (jamais en appelant Socket.io directement depuis le domaine).

**Concernant MQTT :** chaque application décide librement quels messages MQTT elle relaie à l'UI.
Le `SocketBridge` s'abonne aux événements EventBus que le domaine choisit d'émettre,
et les retransmet au(x) client(s) Socket.io connectés.

Exemple de déclaration dans une application dérivée :
```typescript
// src/presentation/socket/events.ts (application spécifique)
export const SOCKET_EVENTS = {
  // Hérités du socle
  ...SOCLE_SOCKET_EVENTS,
  // Spécifiques à cette application
  MQTT_RAW_MESSAGE: 'mqtt:raw',          // Remontée brute d'un topic MQTT vers l'UI
  AUTOMATION_TRIGGERED: 'automation:triggered',
} as const;
```

### 5.5 Flux de sauvegarde de la configuration

```
UI                        SocketBridge / handlers.ts         ConfigWriter / RestartManager
 │                                   │                                   │
 │  emit('config:save', newConfig)   │                                   │
 │──────────────────────────────────>│                                   │
 │                                   │  Validation Zod                   │
 │                                   │  → emit('config:saved', {         │
 │                                   │      success: false, error })      │
 │                                   │  si invalide                      │
 │                                   │                                   │
 │                                   │  Écriture atomique config.yaml ──>│
 │                                   │                                   │
 │  emit('config:saved', {           │                                   │
 │    success: true })               │<──────────────────────────────────│
 │<──────────────────────────────────│                                   │
 │                                   │  setTimeout(500ms)                │
 │                                   │  → process.exit(0) ──────────────>│
 │                                   │                        Docker restart: unless-stopped
 │                                   │                        → nouvelle config chargée
```

---

## 6. Couche Présentation avec Alpine.js

### 6.1 Choix de Alpine.js

**Pourquoi Alpine.js ?**

| Critère | Alpine.js | Vanilla JS | React/Vue |
|---------|-----------|------------|-----------|
| Taille | ~7 KB | 0 KB | 40+ KB |
| Courbe d'apprentissage | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Lisibilité | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Maintenance | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| Réactivité | ⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐ |
| Intégration TypeScript | ✅ Oui | ✅ Oui | ✅ Oui |

**Avantages pour ce projet :**
- **Pas de build step** requis (peut être utilisé via CDN ou import ES module)
- **Syntaxe HTML-native** : la logique reste dans le HTML, facile à comprendre
- **Progressif** : peut être ajouté petit à petit
- **Compatibilité TypeScript** : typage disponible via `@types/alpinejs`
- **Léger et performant** : impact minimal sur les ressources

### 6.2 Intégration Alpine.js + TypeScript

**Option 1 : Via CDN (le plus simple, pas de build)**
```html
<!-- Dans index.html -->
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
<script type="module" src="/app.js"></script>
```

**Option 2 : Via npm (recommandé pour le typage)**
```bash
npm install alpinejs @types/alpinejs
```

```typescript
// src/presentation/ui/app.ts
import Alpine from 'alpinejs';

// Initialisation Alpine
Alpine.start();

// Extension des types Alpine (optionnel)
declare module 'alpinejs' {
  interface Alpine {
    // Ajouter vos propres propriétés/méthodes
  }
}
```

### 6.3 Exemples d'utilisation Alpine.js

**Composant simple avec état :**
```html
<div x-data="{ count: 0 }">
  <button @click="count++">Increment</button>
  <span x-text="count"></span>
</div>
```

**Liste dynamique :**
```html
<div x-data="{ 
  devices: [], 
  async loadDevices() { 
    const response = await fetch('/api/rfxcom/devices'); 
    this.devices = await response.json(); 
  } 
}" x-init="loadDevices()">
  <template x-for="device in devices" :key="device.sensorId">
    <div class="device-card">
      <h3 x-text="device.name"></h3>
      <span x-text="device.sensorId"></span>
    </div>
  </template>
</div>
```

**Formulaire réactif :**
```html
<form x-data="{ 
  receiver: { 
    name: '', 
    type: 'light', 
    primaryEmitter: '' 
  } 
}" @submit.prevent="$socket.emit('rfxcom:receiver:create', receiver)">
  <input x-model="receiver.name" type="text" placeholder="Nom">
  <select x-model="receiver.type">
    <option value="light">Lumière</option>
    <option value="switch">Interrupteur</option>
    <option value="cover">Volet</option>
    <option value="scene">Scène</option>
  </select>
  <button type="submit">Créer</button>
</form>
```

**Intégration avec Socket.io :**
```html
<div x-data="{ 
  devices: [], 
  init() { 
    // Accéder au socket (disponible globalement ou via import)
    socket.on('rfxcom:devices:list', (data) => { 
      this.devices = data.devices; 
    }); 
    socket.on('rfxcom:device:detected', (device) => { 
      this.devices.push(device); 
    }); 
  } 
}" x-init="init()">
  <!-- Contenu -->
</div>
```

**Affichage conditionnel :**
```html
<div x-data="{ status: 'loading' }">
  <div x-show="status === 'loading'">Chargement...</div>
  <div x-show="status === 'error'" class="error">
    <span x-text="errorMessage"></span>
  </div>
  <div x-show="status === 'ready'">
    <!-- Contenu principal -->
  </div>
</div>
```

---

## 7. Configuration (`data/config.yaml`)

### 7.1 Structure complète de référence

```yaml
ha:
  # Flags d'activation pour HA WebSocket et MQTT
  ws_enable: false                 # Activer la connexion WebSocket HA
  mqtt_enable: false               # Activer la connexion MQTT HA
  
  # Configuration WebSocket HA (requis si ws_enable: true)
  ws:
    host: "192.168.1.x"           # Adresse IP de Home Assistant
    port: 8123                    # Port WebSocket HA (par défaut 8123)
    token: ""                    # Long-Lived Access Token HA — via .env de préférence
    reconnect_delay: 5            # Secondes, backoff exponentiel plafonné à 60s
  
  # Configuration MQTT HA (requis si mqtt_enable: true)
  mqtt:
    host: "192.168.1.x"           # Adresse IP du broker MQTT
    port: 1883                    # Port MQTT (par défaut 1883)
    client_id: "app-nom-unique"    # Doit être unique par application
    username: ""                 # Optionnel
    password: ""                 # Optionnel
    keepalive: 60                # Secondes
    reconnect_delay: 5           # Secondes
  
  # Configuration de structuration HA
  structure:
    include_unassigned: false     # Inclure les entités sans area
    unassigned_label: "Non assigné" # Label de la zone virtuelle si include_unassigned: true

web:
  port: 8080
  host: "0.0.0.0"

logging:
  level: "info"                  # "debug" | "info" | "warn" | "error"
  rotate:
    max_size_mb: 10
    max_files: 5

# Les sections métier spécifiques à chaque application sont ajoutées ici
# et intégrées au schéma Zod de l'application dérivée
```

### 7.2 Règles

- Lecture **au démarrage uniquement** via `ConfigLoader` — erreur fatale si invalide
- Écriture **uniquement via `ConfigWriter`** déclenché par Socket.io — jamais depuis le domaine
- Écriture **atomique** : écriture dans `.config.yaml.tmp` puis renommage en `config.yaml`
- Le schéma **Zod** dans `schema.ts` est la source de vérité — il documente types, optionnalité et valeurs par défaut
- Les applications dérivées **étendent** le schéma Zod de base sans le modifier
- **HA WS et MQTT** : La section `mqtt` a été **déplacée sous `ha`** et est activée via le flag `ha.mqtt_enable`. De même, `ha.ws` est activé via `ha.ws_enable`. Les deux peuvent coexister ou être désactivés indépendamment.
- **Compatibilité** : Les sections `ha.ws` et `ha.mqtt` peuvent être présentes dans la configuration même si leurs flags respectifs (`ws_enable`, `mqtt_enable`) sont à `false` — elles ne seront simplement pas initialisées.

### 7.3 Changements v4.3 — Activation conditionnelle HA WS/MQTT

**Nouveauté v4.3** : La configuration HA a été restructurée pour permettre une activation conditionnelle et indépendante des connecteurs WebSocket et MQTT.

**Structure précédente (v4.2) :**
```yaml
# au niveau racine
mqtt: { ... }  # optionnel, uniquement pour les apps "integration"

# dans ha
hat:
  ws: { host, port, token, reconnect_delay }
  structure: { ... }
```

**Nouvelle structure (v4.3) :**
```yaml
hat:
  # Flags d'activation
  ws_enable: false      # Désactivé par défaut
  mqtt_enable: false   # Désactivé par défaut
  
  # Configurations (peuvent être présentes même si désactivées)
  ws: { host, port, token, reconnect_delay }
  mqtt: { host, port, client_id, username, password, keepalive, reconnect_delay }
  structure: { ... }
```

**Règles d'activation :**
- HA WebSocket est initialisé **uniquement si** : `ha.ws_enable === true` **ET** `ha.ws.host` **ET** `ha.ws.token` sont présents
- HA MQTT est initialisé **uniquement si** : `ha.mqtt_enable === true` **ET** `ha.mqtt` est présent et valide
- Les deux connecteurs peuvent être **activés indépendamment** ou **désactivés simultanément**
- Les sections `ha.ws` et `ha.mqtt` peuvent **rester dans le fichier** même si désactivées (pour conservation de la configuration)

**Avantages :**
- Activation/désactivation **sans supprimer** les paramètres de configuration
- **Indépendance** totale entre WS et MQTT
- **Clarté** : les flags `*_enable` rendent l'état explicite
- **Flexibilité** : permet de tester différentes combinaisons sans modifier la structure

---

### 7.4 Accès à la configuration — ConfigService

Le **`ConfigService`** est le **point d'accès centralisé** à la configuration pour toutes les couches.
Il est instancié **une seule fois** dans `index.ts` (bootstrap) et **injecté** dans les services qui en ont besoin.

**Règles strictes :**
- **Une seule instance** : `ConfigService` est instancié une fois au démarrage et injecté via les constructeurs
- **Pas de singleton global** : Aucune méthode statique, pas de `getInstance()`
- **Pas d'accès direct** : Les couches ne lisent pas `config.yaml` directement — tout passe par `ConfigService`
- **Immuabilité** : La configuration retournée par `ConfigService` ne doit pas être modifiée directement

**Responsabilités :**
- Charger la configuration via `ConfigLoader` au démarrage
- Fournir un accès typé à la configuration complète ou à ses sections
- Centraliser la validation et les valeurs par défaut

**Exemple d'utilisation :**
```typescript
// index.ts (bootstrap)
const configService = new ConfigService(new ConfigLoader());
const haWsClient = new HaWsClient(configService.getHaConfig().ws);

// Dans un service (couche HA ou Application)
class MyService {
  constructor(private configService: ConfigService) {} 
  
  doSomething() {
    const mqttConfig = this.configService.getMqttConfig();
    // ...
  }
}
```

---

## 8. Couche HA

La couche HA est le **seul point de contact** entre l'application et Home Assistant.
Elle se décline en deux modes de communication distincts, qui ne se mélangent jamais :

- **A) Synchronisation du référentiel** — via le **Web Service** (WebSocket natif HA, port 8123)
- **B) Modules d'intégration** — via **MQTT**, uniquement pour les applications qui en ont besoin

### 8.1 Mode A — Synchronisation du référentiel (Web Service)

#### 8.1.1 Protocole de connexion

L'API WebSocket native de HA est utilisée sur `ws://<ha-host>:8123/api/websocket`.
Authentification par **Long-Lived Access Token**.

```
1. Connexion WS → HA envoie { type: "auth_required" }
2. Client envoie { type: "auth", access_token: "..." }
3. HA répond { type: "auth_ok" } ou { type: "auth_invalid" } → exit(1)
4. Chargement initial (voir 8.1.2)
5. Souscription aux événements temps réel (voir 8.1.3)
```

#### 8.1.2 Chargement initial

Au démarrage, après authentification, trois appels en parallèle :

```typescript
{ id: 1, type: "get_states" }                  // Toutes les entités + états
{ id: 2, type: "config/area_registry/list" }   // Toutes les areas
{ id: 3, type: "config/device_registry/list" } // Tous les devices
```

Une fois les trois réponses reçues :
1. Peuplement de `HaStateRegistry`
2. Peuplement de `HaStructureRegistry` (classification + structuration via `HaClassifier`)
3. `EventBus.emit('ha:ready', { entityCount, areaCount, deviceCount })`

#### 8.1.3 Souscriptions temps réel

```typescript
{ id: 10, type: "subscribe_events", event_type: "state_changed" }
{ id: 11, type: "subscribe_events", event_type: "area_registry_updated" }
{ id: 12, type: "subscribe_events", event_type: "device_registry_updated" }
{ id: 13, type: "subscribe_events", event_type: "entity_registry_updated" }
```

Sur réception de chaque événement : mise à jour du registre concerné, recalcul partiel
de `HaStructureRegistry` si nécessaire, puis émission EventBus correspondante.

#### 8.1.4 Reconnexion

- Reconnexion automatique, backoff exponentiel plafonné à 60s
- À chaque reconnexion : rechargement initial complet (8.1.2)
- Pendant la déconnexion : les registres conservent leur dernier état connu
- `EventBus.emit('ha:disconnected')` / `EventBus.emit('ha:reconnected')` aux transitions

### 8.2 Référentiel Structuré `area → QUOI → entités`

```typescript
// Une area HA enrichie
interface HaArea {
  area_id: string;
  name: string;
  quoiMap: Map<string, HaQuoi>;        // clé = quoi_id
}

// Un concept métier (le "QUOI")
interface HaQuoi {
  quoi_id: string;                     // ex: "eclairage", "climat", "securite"
  label: string;                       // ex: "Éclairage"
  entities: HaStructuredEntity[];
}

// Une entité dans le référentiel structuré
interface HaStructuredEntity {
  entity_id: string;
  friendly_name: string;
  domain: string;
  device_class?: string;
  state: string;
  attributes: Record<string, unknown>;
  device_id?: string;
  area_id?: string;
  quoi_ids: string[];                  // Une entité peut appartenir à plusieurs QUOI
  last_updated: Date;
  // Références complètes (peuplées par HaStructureRegistry)
  device?: HaDevice;                   // Référence au device parent
  area?: HaArea;                     // Référence à l'area parente
}

// Racine du référentiel structuré
interface HaStructuredRegistry {
  areas: Map<string, HaArea>;
  unassigned?: HaArea;                 // Présent si ha.structure.include_unassigned = true
  lastFullSync: Date;
}
```

**Règles de structuration :**

- **Attribution area** : via `device_id` → `device.area_id`, ou directement `entity.area_id`
  (priorité à `entity.area_id` si les deux sont définis). Sans area : placée dans `unassigned`
  selon `ha.structure.include_unassigned`.
- **Attribution QUOI** : entièrement déléguée au `HaClassifier` (voir 8.3). Une entité peut
  recevoir **plusieurs QUOI**. Si aucun QUOI ne correspond, l'entité est placée dans le
  QUOI système `"non_classifie"`.

### 8.3 HaClassifier — Module de Classification

La détermination du QUOI est assurée par le module `HaClassifier` qui implémente l'interface `IHaClassifier`.

**Document de référence pour RFXCOM** : Pour les règles spécifiques aux devices RFXCOM (notamment la priorité du champ `subType`),
voir [`specs-classification-rfxcom-v1.0.md`](specs-classification-rfxcom-v1.0.md).

#### 8.3.0 Priorités de Classification (Générique)
Pour toutes les entités, l'ordre de priorité est :
1. `device_class` HA (le plus précis pour les entités standard)
2. `domain` HA
3. Dernier segment de `entity_id` après `--`
4. `non_classifie` (fallback)

> **⚠️ Pour les entités RFXCOM** : L'ordre est **différent** (voir §8.3.1).

#### 8.3.1 Priorités de Classification pour RFXCOM
Pour les entités issues de devices RFXCOM (détectées par leur `entity_id`, `attributes.subType`, ou `device_id`),
l'ordre de priorité est **modifié** pour tenir compte des champs spécifiques RFXCOM :

1. **`subType` RFXCOM** (le plus précis, ex: `Temperature` → `température`)
2. `type` RFXCOM (ex: `RFXSensor` → `capteurs`)
3. `device_class` HA (générique)
4. `domain` HA (générique)
5. Dernier segment de `entity_id` après `--`
6. `non_classifie` (fallback)

> **Exemple** : Une entité avec `attributes.subType = "Temperature"` et `device_class = "humidity"` sera classée comme `température` (priorité à `subType`).

Voir [`specs-classification-rfxcom-v1.0.md`](specs-classification-rfxcom-v1.0.md) pour le **mapping complet** `subType`/`type` → QUOI.

```typescript
interface IHaClassifier {
  /**
   * Retourne les quoi_ids applicables à une entité.
   * Retourne [] si aucun QUOI ne correspond.
   * 
   * @param entity - Entité à classer (avec domain, device_class, entity_id, et attributs RFXCOM)
   * @returns Tableau de quoi_ids (au moins un, jamais vide)
   */
  classify(entity: HaStructuredEntity): string[];

  /**
   * Retourne le catalogue des QUOI disponibles dans cette implémentation.
   */
  getQuoiCatalog(): HaQuoiDefinition[];

  /**
   * Retourne la définition d'un QUOI par son ID.
   */
  getQuoiDefinition(quoiId: string): HaQuoiDefinition | undefined;

  /**
   * Classifie une entité avec métadonnées sur la méthode utilisée (pour le debug).
   */
  classifyWithDetails(entity: HaStructuredEntity): ClassificationResult;
}

interface HaQuoiDefinition {
  quoi_id: string;
  label: string;
  description?: string;
}

interface ClassificationResult {
  entity_id: string;
  quoi_ids: string[];
  matchedBy: 'subType' | 'type' | 'device_class' | 'domain' | 'entity_id' | 'fallback';
}
```

### 8.3.1 Méthodes d'accès de HaStructureRegistry

Le `HaStructureRegistry` expose les méthodes suivantes pour l'accès par la couche Métier.
**Toutes les entités retournées incluent :** `quoi_ids[]` (liste des QUOI) et `area`/`device` (références complètes).

```typescript
// Accès par identifiant
getEntity(entityId: string): HaStructuredEntity | undefined
getAllEntities(): HaStructuredEntity[]

// Accès par QUOI
getEntitiesByQuoi(quoiId: string): HaStructuredEntity[]

// Accès par Area
getEntitiesByArea(areaId: string): HaStructuredEntity[]

// Accès par Area + QUOI
getEntitiesByAreaAndQuoi(areaId: string, quoiId: string): HaStructuredEntity[]

// Accès aux structures
getAreas(): Map<string, HaArea>
getArea(areaId: string): HaArea | undefined
getDevices(): Map<string, HaDevice>
getDevice(deviceId: string): HaDevice | undefined
getQuoiCatalog(): HaQuoiDefinition[]

// Métadonnées
getEntityCount(): number
getLastFullSync(): Date | null
getRegistry(): HaStructuredRegistry
```

**Règles :**
- Chaque `HaStructuredEntity` retournée contient **toujours** :
  - `quoi_ids: string[]` — Liste de tous les QUOI auxquels l'entité appartient
  - `area?: HaArea` — Référence complète à l'area parente (si définie)
  - `device?: HaDevice` — Référence complète au device parent (si défini)
- Les références `area` et `device` sont peuplées par `HaStructureRegistry` pendant l'initialisation
- Priorité pour `area_id` : `entity.area_id` > `device.area_id`

`HaStructureRegistry` reçoit son implémentation de `IHaClassifier` par injection de
dépendance au bootstrap (`index.ts`).

### 8.4 Envoi de Commandes — HaCommandService

```typescript
interface HaCommand {
  entity_id: string | string[];
  domain: string;                      // Ex: "light", "switch", "climate"
  service: string;                     // Ex: "turn_on", "turn_off", "set_temperature"
  service_data?: Record<string, unknown>;
}

interface HaCommandResult {
  success: boolean;
  command: HaCommand;
  error?: string;
}
```

Les commandes sont envoyées via le message WebSocket HA `call_service` :

```json
{
  "id": 42,
  "type": "call_service",
  "domain": "light",
  "service": "turn_on",
  "target": { "entity_id": "light.salon" },
  "service_data": { "brightness": 128 }
}
```

Le résultat est émis sur `EventBus.emit('ha:command:result', HaCommandResult)`.
La couche métier envoie ses commandes via `EventBus.emit('ha:command:send', HaCommand)` —
jamais d'appel direct à `HaWsClient`.

### 8.5 Mode B — Modules d'intégration (MQTT)

Le mode MQTT de la couche HA est **réservé exclusivement** aux applications de type
**intégration** : celles dont la fonction est de faire le pont entre Home Assistant
et un système tiers (capteur externe, passerelle, service cloud, etc.).

#### 8.5.1 HaMqttIntegrationService — Service MQTT Générique

Le service `HaMqttIntegrationService` fournit une **abstraction générique** pour la communication
MQTT avec Home Assistant, utilisable par tous les modules d'intégration.

```typescript
// Configuration d'un module d'intégration
interface HaMqttModuleConfig {
  moduleName: string;        // Nom unique du module (ex: "rfxcom", "zigbee2mqtt")
  clientId: string;         // Client ID MQTT
  cleanSession: boolean;   // Nettoyer la session (default: false)
  keepalive: number;       // Keepalive en secondes (default: 60)
  reconnectPeriod: number; // Délai de reconnexion en ms (default: 5000)
}

// Service MQTT générique
class HaMqttIntegrationService {
  // Connexion
  connect(host: string, port: number, username?: string, password?: string): Promise<void>
  disconnect(): void
  isConnectedToMqtt(): boolean
  
  // Publication HA
  publishDiscovery(component: string, objectId: string, entity: HaMqttDiscoveryEntity, retain?: boolean, qos?: 0|1|2): void
  publishState(component: string, objectId: string, state: HaMqttStateMessage, retain?: boolean, qos?: 0|1|2): void
  
  // Abonnements
  subscribeToCommands(component: string, objectId: string, qos?: 0|1|2): void
  subscribeToAllModuleCommands(qos?: 0|1|2): void
  unsubscribeFromCommands(component: string, objectId: string): void
  
  // Callbacks
  onCommand(callback: (event: IntegrationCommandEvent) => void): void
  onConnectionChange(callback: (module: string, connected: boolean) => void): void
}
```

**Règles pour HaMqttIntegrationService :**
- **LWT** : Topic `ha-integration/{module}/status` avec payload `online`/`offline`, QoS 1, retain true
- **QoS par défaut** : Discovery/State = QoS 1 + retain true, Commands = QoS 1 + retain false
- **Reconnexion automatique** avec backoff configurable
- **Gestion des erreurs** : Logging + reconnexion automatique

#### 8.5.2 Structure des modules d'intégration

Chaque module d'intégration suit cette structure :

```bash
src/ha/integration/
└── [module-name]/
    ├── [ModuleName]Service.ts    # Service métier (couche HA)
    └── types.ts                 # Types spécifiques
```

**Communication entre les couches :**
```
[ModuleName]Service (HA) 
  ↔ EventBus emit('integration:{module}:discovery')
     ↔ HaMqttIntegrationService (HA) 
        ↔ MQTT Broker
           ↔ Home Assistant
```

**Règles d'implémentation d'un module :**
1. **Pas d'accès direct** à MQTT dans le service métier (utiliser EventBus)
2. **Découverte HA** : Le service métier émet `integration:discovery`, HaMqttIntegrationService publie sur MQTT
3. **État** : Le service métier émet `integration:state`, HaMqttIntegrationService publie sur MQTT
4. **Commandes** : HaMqttIntegrationService reçoit de MQTT, émet sur EventBus, service métier écoute et exécute

#### 8.5.3 Format des messages MQTT

**Discovery (homeassistant/{component}/{object_id}/config) :**
```json
{
  "name": "Température Salon",
  "unique_id": "rfxcom_temperature_001",
  "device_class": "temperature",
  "state_topic": "homeassistant/sensor/rfxcom_temperature_001/state",
  "unit_of_measurement": "°C",
  "device": {
    "identifiers": ["rfxcom_001"],
    "name": "RFXCOM Transceiver",
    "manufacturer": "RFXCOM",
    "model": "RFXtrx433E"
  }
}
```

**State (homeassistant/{component}/{object_id}/state) :**
```json
{
  "state": "22.5",
  "attributes": {
    "unit_of_measurement": "°C",
    "friendly_name": "Température Salon"
  }
}
```

**Command (homeassistant/{component}/{object_id}/set) :**
```json
{
  "state": "on"
}
```

#### 8.5.4 Événements EventBus pour les modules

**Modules → HaMqttIntegrationService :**
- `integration:{module}:discovery` → Découverte d'une entité à publier vers HA
- `integration:{module}:state` → Changement d'état à publier vers HA

**HaMqttIntegrationService → Modules :**
- `integration:{module}:command` → Commande reçue de HA à exécuter

**HaMqttIntegrationService → Application :**
- `ha:integration:connected` → Module MQTT connecté
- `ha:integration:disconnected` → Module MQTT déconnecté

> - **v4.3** : Les applications activent HA WS via `ha.ws_enable` et MQTT via `ha.mqtt_enable`. 
>   Les applications qui ne sont pas des intégrations n'active **pas** ces flags 
>   dans leur configuration, et n'instancient aucun module sous `src/ha/integration/`
> - Chaque module d'intégration vit dans son propre sous-dossier `src/ha/integration/[module]/`
>   et reste indépendant des autres modules d'intégration
> - Le module d'intégration peut publier vers HA (topics `homeassistant/+/+/set`) ou consommer
>   un flux MQTT externe au broker Mosquitto partagé avec HA — son périmètre exact est défini
>   dans les spécifications propres à l'application concernée
> - Topics HA standards utilisables par un module d'intégration :
>
> | Direction | Topic | Description |
> |---|---|---|
> | HA → App | `homeassistant/+/+/config` | Discovery des entités |
> | HA → App | `homeassistant/+/+/state` | États des entités |
> | App → HA | `homeassistant/+/+/set` | Commande vers une entité |
> | App → HA | `homeassistant/+/+/attributes` | Attributs additionnels |
>
> - Connexion MQTT : reconnexion automatique (backoff plafonné à 60s), LWT sur
>   `app/<client_id>/status` avec `retain: true`, QoS 1 pour états/commandes, QoS 0 pour heartbeats

### 8.6 Événements EventBus — Couche HA

```typescript
type AppEvents = {
  // ... événements socle (application, présentation) ...

  // Couche HA → Application (mode A — Web Service)
  'ha:ready':                  { entityCount: number; areaCount: number; deviceCount: number };
  'ha:disconnected':           void;
  'ha:reconnected':            void;
  'ha:entity:state_changed':   HaStructuredEntity;
  'ha:area:updated':           HaArea;
  'ha:structure:rebuilt':      HaStructuredRegistry;
  'ha:command:result':         HaCommandResult;

  // Application → Couche HA (commandes)
  'ha:command:send':           HaCommand;

  // Couche HA → Application (mode B — intégration MQTT, propre à chaque module)
  // Ex: 'ha:integration:[module]:event': <payload spécifique au module>
};
```

### 8.7 Événements Socket.io — Couche HA

Ajouts au catalogue Socket.io (server → client) :

| Événement | Payload | Description |
|---|---|---|
| `ha:ready` | `{ entityCount, areaCount, deviceCount }` | Référentiel initial prêt |
| `ha:status` | `{ connected: boolean }` | Statut connexion WS HA |
| `ha:entity:changed` | `HaStructuredEntity` | Changement d'état d'une entité |
| `ha:structure` | `HaStructuredRegistry` | Référentiel complet (sur demande) |
| `ha:area:updated` | `HaArea` | Mise à jour d'une area |
| `ha:command:result` | `HaCommandResult` | Résultat d'une commande |

Ajouts (client → server) :

| Événement | Payload | Description |
|---|---|---|
| `ha:structure:get` | `void` | Demande le référentiel complet |
| `ha:command:send` | `HaCommand` | Envoie une commande à HA |

> Pour le mode B (intégration), chaque application décide librement quels événements
> MQTT elle relaie à l'UI via Socket.io — voir §5.4.

---

## 9. EventBus Typé

Canal de communication interne entre toutes les couches. Aucun module ne dépend directement
d'un autre — tout passe par l'EventBus. Le détail des événements `ha:*` est défini en §8.6 ;
cette section rassemble le socle commun.

```typescript
type AppEvents = {
  // Couche HA → Application (voir §8.6 pour le détail complet)
  'ha:ready':               { entityCount: number; areaCount: number; deviceCount: number };
  'ha:disconnected':        void;
  'ha:reconnected':         void;
  'ha:entity:state_changed': HaStructuredEntity;
  'ha:command:result':      HaCommandResult;

  // Application → Couche HA
  'ha:command:send':        HaCommand;

  // Application → Présentation (via SocketBridge)
  'app:status:changed':     { ha: boolean; haEntities: number; uptime: number };

  // Présentation → Application
  'config:save:requested':  AppConfig;
  'config:saved':           { success: boolean; error?: string };

  // Extension libre par le domaine de chaque application
  // Ex: 'automation:triggered': { id: string; entity: HaStructuredEntity }
  // Pour les applications d'intégration, extension libre par module MQTT (voir §8.6)
};
```

Le `SocketBridge` s'abonne aux événements EventBus et les retransmet à Socket.io.
Il est le **seul point de contact** entre EventBus et Socket.io.

---

## 10. Cycle de Vie

### 10.1 Démarrage (`index.ts`)

```
1. Initialisation Logger (en premier absolu)
2. Chargement + validation config.yaml → exit(1) si invalide
3. Démarrage Express + Socket.io  ← UI accessible immédiatement
4. Connexion couche HA — Web Service (retry infini en arrière-plan)
5. Synchronisation référentiel HA (HaStateRegistry + HaStructureRegistry)
6. [Si application d'intégration] Connexion MQTT des modules concernés
7. Démarrage modules métier (après événement 'ha:ready')
8. Log INFO "Application démarrée — UI : http://localhost:<port>"
```

> Express et Socket.io démarrent **avant** la couche HA : l'UI reste accessible même si la
> configuration HA est incorrecte, permettant de la corriger sans accès shell au conteneur.

### 10.2 Arrêt propre (SIGTERM / SIGINT)

```
1. Arrêt des modules métier
2. [Si application d'intégration] Publication LWT offline MQTT, déconnexion propre
3. Fermeture propre de la connexion WS HA
4. Fermeture Socket.io + Express
5. Flush logs
6. exit(0)
```

### 10.3 Codes de sortie

| Code | Signification |
|---|---|
| `0` | Arrêt propre (normal ou après sauvegarde config) |
| `1` | Erreur fatale au démarrage |

---

## 11. Docker

### 11.1 `Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
COPY src/presentation/ui/ ./ui/
RUN pnpm build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/ui   ./ui
RUN mkdir -p /app/data /app/logs

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
```

### 11.2 `compose.yaml`

```yaml
services:
  app:
    build: .
    container_name: ha-app-nom        # Adapter par application
    restart: unless-stopped           # Obligatoire — permet le redémarrage après config:save
    environment:
      - NODE_ENV=production
      - TZ=Europe/Paris
    ports:
      - "8080:8080"                   # Port UI — adapter par application
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    networks:
      - ha_network

networks:
  ha_network:
    external: true
    name: ha_network
```

---

## 12. Logging

Format : `[ISO8601] [LEVEL] [couche:module] message`

```
[2026-06-29T10:23:45.123Z] [INFO]  [ha:sync] Référentiel initialisé : 142 entités
[2026-06-29T10:23:46.001Z] [DEBUG] [mqtt:client] Message reçu : homeassistant/light/salon/state
[2026-06-29T10:23:50.001Z] [ERROR] [mqtt:client] Connexion perdue. Reconnexion dans 5s...
```

Chaque ligne de log est également émise vers l'UI via Socket.io (`app:log`).
Rotation quotidienne · 10 Mo max par fichier · 5 fichiers conservés.

---

## 13. Charte Graphique UI

Interface minimaliste et fonctionnelle. Fichier `ui/style.css` partagé entre toutes les applications.

```css
:root {
  --color-bg:           #1a1a2e;
  --color-surface:      #16213e;
  --color-primary:      #0f3460;
  --color-accent:       #e94560;
  --color-text:         #eaeaea;
  --color-text-muted:   #8892a4;
  --color-success:      #4caf50;
  --color-warning:      #ff9800;
  --color-error:        #f44336;
  --radius:             8px;
  --font:               'Segoe UI', system-ui, sans-serif;
}
```

**Pages minimales obligatoires :**

| Page | Contenu |
|---|---|
| `/` — Dashboard | Statut MQTT · nb entités HA · uptime · derniers logs |
| `/config` | Formulaire de configuration complet — soumis via `config:save` |
| `/logs` | Flux de logs en temps réel via `app:log` |

Les applications dérivées ajoutent leurs propres pages dans l'UI sans modifier les pages du socle.

---

## 14. Dépendances NPM

```json
{
  "dependencies": {
    "ws":                        "^8.x",
    "express":                   "^4.x",
    "socket.io":                 "^4.x",
    "js-yaml":                   "^4.x",
    "zod":                       "^3.x",
    "winston":                   "^3.x",
    "winston-daily-rotate-file": "^5.x",
    "alpinejs":                  "^3.x"
  },
  "devDependencies": {
    "typescript":       "^5.x",
    "@types/node":      "^20.x",
    "@types/express":   "^4.x",
    "@types/ws":        "^8.x",
    "@types/js-yaml":   "^4.x",
    "@types/alpinejs":  "^3.x",
    "tsx":              "^4.x",
    "vitest":           "^1.x"
  }
}
```

> `ws` est requis dans **toutes** les applications (couche HA, mode A).
> `mqtt` (`^5.x` + dépendance directe, pas de `@types` requis) n'est ajouté
> que dans les applications de type **intégration** (couche HA, mode B).

---

## 15. Conventions de Développement

- **TypeScript strict** — `any` interdit
- **SRP** — un fichier, une responsabilité
- **Injection de dépendances** — les services reçoivent leurs dépendances en constructeur
- **Pas de couplage inter-couches** — tout passe par EventBus ou injection
- **Pas d'accès direct** à HA, MQTT, ou Socket.io depuis le domaine — uniquement via
  EventBus ↔ couche HA et EventBus ↔ SocketBridge
- **Nommage** : camelCase variables/fonctions · PascalCase types/classes · UPPER_SNAKE constantes
- **Git** : conventional commits (`feat:` `fix:` `refactor:` `chore:` `docs:`)

---

## 16. Checklist Nouvelle Application

- [ ] Copier la structure du socle
- [ ] Définir `ha.ws.host/port/token` et `web.port` uniques dans `config.yaml`
- [ ] Décider de `ha.structure.include_unassigned`
- [ ] Instancier `ConfigService` une seule fois dans `index.ts` et l'injecter dans les couches
- [ ] Fournir une implémentation de `IHaClassifier` (module dédié à venir) et l'injecter
      dans `HaStructureRegistry` au bootstrap
- [ ] **v4.3** Si l'application est une **intégration** : activer `ha.mqtt_enable: true` et configurer `ha.mqtt`,
      créer `src/ha/integration/[module]/`, et documenter ses topics spécifiques
- [ ] Étendre le schéma Zod avec les sections config métier supplémentaires
- [ ] Créer `src/applications/[app-name]/domain/[feature]/` — logique métier pure, consommant `HaStructureRegistry`
      et envoyant ses commandes via `EventBus.emit('ha:command:send', ...)`
- [ ] Déclarer les événements Socket.io spécifiques dans `src/presentation/socket/events.ts`
- [ ] Configurer le `SocketBridge` pour relayer les événements EventBus souhaités (métier et,
      le cas échéant, événements d'intégration MQTT — au choix de l'application)
- [ ] Ajouter les pages UI spécifiques sans modifier les pages du socle
- [ ] Mettre à jour `container_name` et `ports` dans `compose.yaml`
- [ ] Ajouter le token HA dans `.env` (jamais dans `config.yaml` versionné)
- [ ] Fournir `.env.example`
- [ ] Vérifier que `data/` et `logs/` sont dans `.gitignore`

---

*Spécifications v4.2 — Ajout Alpine.js pour la couche Présentation. Document à utiliser comme prompt de base pour la génération de chaque application du projet.*
