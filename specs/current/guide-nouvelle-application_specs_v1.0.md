# Guide Rapide — Création d'une Nouvelle Application

**Version :** 1.3  
**Date :** 19 Juillet 2026  
**Statut :** Document pratique pour les développeurs  
**Public cible :** Développeurs créant une nouvelle application sans modifier le socle  

> **⚠️ IMPORTANT :** Ce guide suppose que vous avez lu et compris [techniques-socle-ha-mqtt_specs_v4.6.md](techniques-socle-ha-mqtt_specs_v4.6.md) (architecture 5 couches, EventBus, cycle de vie, nouvelle arborescence applications/).
> 
> **Note v1.1 :** Migration vers **TypeScript pur + Web Components natifs** (remplace Alpine.js comme indiqué dans [presentation_specs_v3.0.md](presentation_specs_v3.0.md) §v3.0).

---

## 📌 Table des Matières

1. [Prérequis](#1-prérequis)
2. [Structure Minimale d'une Application](#2-structure-minimale-dune-application)
3. [Étapes Clés de Création](#3-étapes-clés-de-création)
4. [Accès au Référentiel Home Assistant](#4-accès-au-référentiel-home-assistant)
5. [Intégration Automatique avec le Socle](#5-intégration-automatique-avec-le-socle)
6. [Configuration d'une Application](#6-configuration-dune-application)
7. [Gestion des Événements Socket.io](#7-gestion-des-événements-socketio)
8. [Tests et Validation](#8-tests-et-validation)
9. [Checklist Avant Déploiement](#9-checklist-avant-déploiement)
10. [Exemple Complet](#10-exemple-complet)

---

## 1. Prérequis

### 1.1 Environnement
- Node.js 20+ (LTS)
- TypeScript 5.x (mode strict)
- pnpm (recommandé)
- Comprendre l'[architecture 5 couches](techniques-socle-ha-mqtt_specs_v4.5.md#3-architecture-en-couches)

### 1.2 Connaissances requises
- EventBus Typé (voir §9 specs-techniques-socle-ha-mqtt-v4.5.md)
- Socket.io (unique canal UI ↔ Serveur)
- TypeScript pur + Web Components natifs (pour la couche Présentation)
- Convention de nommage ([nommage_specs_v1.0.md](nommage_specs_v1.0.md))

### 1.3 Outils
- Un éditeur avec support TypeScript (VSCode recommandé)
- Docker (pour les tests d'intégration)

---

## 2. Structure Minimale d'une Application

```bash
applications/
└── {nom-app}/                    # ⚠️ Nom en minuscules, sans espaces
    ├── domain/
    │   ├── index.ts               # ⭐ OBLIGATOIRE : Module + Factory
    │   ├── {NomApp}Service.ts     # ⭐ OBLIGATOIRE : Service métier
    │   ├── socket-events.ts        # Événements Socket.io spécifiques
    │   ├── config-schema.ts       # Schema de configuration (Zod)
    │   └── types.ts               # Types spécifiques
    │
    └── presentation/
        ├── index.html             # ⭐ OBLIGATOIRE : UI de l'application
        ├── styles/
        │   └── {nom-app}.css       # Styles spécifiques
        └── ts/
            └── app.ts              # Logique frontend (TypeScript)
```

**Fichiers obligatoires** :
- `domain/index.ts` — Déclaration du module
- `domain/{NomApp}Service.ts` — Service avec méthodes `start()` et optionnellement `stop()`
- `presentation/index.html` — Interface utilisateur

---

## 3. Étapes Clés de Création

### 3.1 Créer le répertoire de l'application

```bash
cd /chemin/vers/ws-ha
mkdir -p applications/{nom-app}/domain
mkdir -p applications/{nom-app}/presentation/styles
mkdir -p applications/{nom-app}/presentation/ts
```

### 3.2 Définir le module

**Fichier : `applications/{nom-app}/domain/index.ts`**

```typescript
import type { ApplicationModule, ModuleUiMetadata } from '../../../../types/config';
import { {NOM_APP}_SOCKET_EVENTS } from './socket-events';

// Métadonnées UI (optionnel, pour la génération automatique)
export const {NOM_APP}_UI_METADATA: ModuleUiMetadata = {
  title: 'Configuration {Nom App}',
  description: 'Description de l\'application',
  icon: '🎯',
  fields: [
    // Définir les champs de configuration ici
  ]
};

// Déclaration du module
export const {NOM_APP}_APP: ApplicationModule = {
  id: '{nom-app}',           // ⚠️ Doit correspondre au nom du répertoire
  name: '{Nom App}',
  description: 'Description de l\'application',
  icon: '🎯',
  type: 'integration',       // 'integration' | 'standalone' | 'core'
  configurable: true,        // Peut être configuré via UI
  requiredMqtt: true,       // true si MQTT nécessaire
  requiredHaWs: false,      // true si HA WebSocket nécessaire
  socketEvents: {NOM_APP}_SOCKET_EVENTS,
  configUi: {NOM_APP}_UI_METADATA,
  configSection: '{nom-app}' // Nom de la section dans config.yaml
};

// Exporter les composants
export * from './{NomApp}Service';
export * from './socket-events';
export * from './config-schema';
export * from './types';
```

### 3.3 Implémenter le service métier

**Fichier : `applications/{nom-app}/domain/{NomApp}Service.ts`**

```typescript
import type { IEventBus } from '../../../../application/IEventBus';
import type { Logger } from '../../../../infrastructure/logger/index';
import type { IAppConfigProvider } from '../../../../infrastructure/config/IAppConfigProvider';
import type { {NomApp}Config } from './config-schema';

export class {NomApp}Service {
  constructor(
    private eventBus: IEventBus,
    private logger: Logger,
    private configService: IAppConfigProvider<{NomApp}Config>
  ) {
    this.setupEventListeners();
  }

  // ⭐ OBLIGATOIRE : Méthode start() asynchrone
  async start(): Promise<void> {
    this.logger.info('{NomApp}Service', 'Démarrage du service...');
    
    // Charger la configuration
    const config = this.configService.getAppConfig();
    
    // Initialiser votre logique métier ici
    
    this.logger.info('{NomApp}Service', 'Service démarré avec succès');
  }

  // OPTIONNEL : Méthode stop() pour un arrêt propre
  async stop(): Promise<void> {
    this.logger.info('{NomApp}Service', 'Arrêt du service...');
    // Libérer les ressources
    this.logger.info('{NomApp}Service', 'Service arrêté');
  }

  private setupEventListeners(): void {
    // Écouter les événements spécifiques
    this.eventBus.onGeneric('{nom-app}:action', (data) => {
      this.handleAction(data);
    });
  }

  private handleAction(data: unknown): void {
    // Logique de traitement
  }
}
```

### 3.4 Définir les événements Socket.io

**Fichier : `applications/{nom-app}/domain/socket-events.ts`**

```typescript
import type { SocketEventsMap } from '../../../../types/config';

export const {NOM_APP}_SOCKET_EVENTS = {
  // Server → Client
  DATA_LIST: '{nom-app}:data:list',
  DATA_UPDATED: '{nom-app}:data:updated',
  STATUS: '{nom-app}:status',
  ERROR: '{nom-app}:error',
  
  // Client → Server
  DATA_GET: '{nom-app}:data:get',
  DATA_SAVE: '{nom-app}:data:save',
  ACTION_REQUEST: '{nom-app}:action:request',
} as const;

export type {NomApp}SocketEvents = typeof {NOM_APP}_SOCKET_EVENTS;
```

### 3.5 Définir le schema de configuration

**Fichier : `applications/{nom-app}/domain/config-schema.ts`**

```typescript
import { z } from 'zod';

export const {nomApp}ConfigSchema = z.object({
  enabled: z.boolean().default(true),
  // Ajouter vos champs de configuration ici
  apiKey: z.string().optional(),
  pollInterval: z.number().min(1000).max(300000).default(60000),
});

export type {NomApp}Config = z.infer<typeof {nomApp}ConfigSchema>;
```

### 3.6 Créer la factory de service

**À ajouter dans `applications/{nom-app}/domain/index.ts`**

```typescript
import type { IEventBus } from '../../../../application/IEventBus';
import type { Logger } from '../../../../infrastructure/logger/index';
import type { IAppConfigProvider } from '../../../../infrastructure/config/IAppConfigProvider';
import { {NomApp}Service } from './{NomApp}Service';
import { {NomApp}Config } from './config-schema';
import { AppConfigProvider } from '../../../../infrastructure/config/AppConfigProvider';
import type { ConfigService } from '../../../../infrastructure/config/ConfigService';

/**
 * Factory recommandée : utilise IAppConfigProvider
 * Conforme à l'architecture 5 couches (injection d'interfaces)
 */
export function create{NomApp}Service(
  eventBus: IEventBus,
  logger: Logger,
  configProvider: IAppConfigProvider<{NomApp}Config>
): {NomApp}Service {
  return new {NomApp}Service(eventBus, logger, configProvider);
}

/**
 * Factory alternative : crée automatiquement le provider
 * Utile si votre service attend ConfigService directement
 */
export function create{NomApp}ServiceWithConfig(
  eventBus: IEventBus,
  logger: Logger,
  configService: ConfigService
): {NomApp}Service {
  const configProvider = new AppConfigProvider<{NomApp}Config>('{nom-app}', configService);
  return create{NomApp}Service(eventBus, logger, configProvider);
}
```

> **⚠️ Note** : `AppService` essaiera d'abord avec `configProvider`, puis basculera sur `configService` si nécessaire.

### 3.7 Créer l'interface utilisateur

**Fichier : `applications/{nom-app}/presentation/index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{Nom App} - HA App</title>
  <link rel="stylesheet" href="/styles/main.css">
  <link rel="stylesheet" href="/applications/{nom-app}/styles/{nom-app}.css">
</head>
<body>
  <div class="app-container">
    <h1>{Nom App}</h1>
    <div id="app-container">
      <div id="loading" class="status">Chargement en cours...</div>
      <div id="data-container" class="data-container" style="display: none;"></div>
      <div id="error" class="error" style="display: none;"></div>
    </div>
  </div>
  <script src="/applications/{nom-app}/ts/app.js"></script>
</body>
</html>
```

### 3.8 Initialiser le client Socket.io

**Fichier : `applications/{nom-app}/presentation/ts/app.ts`**

```typescript
import { SocketService } from '../../../../ui/ts/services/SocketService';

// Initialisation
const socket = SocketService.getInstance();

// Émettre des événements vers le serveur
function loadData() {
  socket.emit('{nom-app}:data:get');
}

// Écouter les événements du serveur
socket.on('{nom-app}:data:list', (data: unknown) => {
  console.log('Données reçues:', data);
});

socket.on('{nom-app}:status', (status: unknown) => {
  console.log('Statut:', status);
});

// Exporter pour TypeScript si nécessaire
declare global {
  interface Window {
    {nomApp}App: {
      loadData: () => void;
    };
  }
}

window.{nomApp}App = { loadData };
```

---

## 4. Accès au Référentiel Home Assistant

> **🎯 Cette section est cruciale pour les applications qui interagissent avec les entités HA**

Le socle fournit un **référentiel structuré** des entités Home Assistant organisé par :
**Area (Lieu/Pièce) → QUOI (Type) → Entités**

### 4.1 Concepts clés

| Concept | Description | Exemple |
|---------|-------------|---------|
| **Area** | Pièce ou zone dans HA | `Salon`, `Cuisine`, `Chambre` |
| **QUOI** | Classification fonctionnelle | `température`, `lumière`, `interrupteur` |
| **Device** | Appareil physique ou logique | `RFXtrx433E`, `Zigbee Coordinator` |
| **Entity** | Composant contrôlable/mesurable | `sensor.temperature_salon`, `light.lampe_salon` |

### 4.2 Structure des données

```typescript
// HaStructuredRegistry (référentiel complet)
interface HaStructuredRegistry {
  areas: Map<string, HaArea>;           // Toutes les pièces
  devices: Map<string, HaDevice>;       // Tous les appareils
  entities: Map<string, HaStructuredEntity>; // Toutes les entités
  unassigned?: HaArea;                  // Area pour les entités non assignées
}

// HaArea (Lieu/Pièce)
interface HaArea {
  area_id: string;
  name: string;
  picture?: string;
  quoiMap: Map<string, Set<string>>;   // QUOI → ensemble d'entités
}

// HaStructuredEntity (Entité enrichie)
interface HaStructuredEntity {
  entity_id: string;
  domain: string;                       // Ex: 'light', 'sensor', 'switch'
  device_class?: string;                // Ex: 'temperature', 'light'
  area?: HaArea;                        // Référence complète à la pièce
  device?: HaDevice;                    // Référence complète au device
  quoi_ids: string[];                  // Liste de tous les QUOI de cette entité
  // ... autres champs standard HA (state, attributes, etc.)
}
```

### 4.3 Accès côté Serveur (Service Métier)

#### Injection de HaStructureRegistry

Le service métier peut recevoir `HaStructureRegistry` par injection :

```typescript
import type { HaStructureRegistry } from '../../../ha/sync/HaStructureRegistry';

export class MyAppService {
  constructor(
    private eventBus: IEventBus,
    private logger: Logger,
    private configService: IAppConfigProvider<MyAppConfig>,
    private haStructureRegistry: HaStructureRegistry  // ← Injected
  ) {}
}
```

#### Méthodes disponibles

| Méthode | Retourne | Cas d'usage |
|---------|----------|-------------|
| `getEntity(entityId)` | `HaStructuredEntity \| undefined` | Récupérer une entité spécifique |
| `getAllEntities()` | `HaStructuredEntity[]` | Toutes les entités |
| `getEntitiesByQuoi(quoiId)` | `HaStructuredEntity[]` | Entités d'un type (ex: toutes les températures) |
| `getEntitiesByArea(areaId)` | `HaStructuredEntity[]` | Entités d'une pièce |
| `getEntitiesByAreaAndQuoi(areaId, quoiId)` | `HaStructuredEntity[]` | **⭐ Entités d'une pièce ET d'un type** |
| `getAreas()` | `Map<string, HaArea>` | Toutes les pièces |
| `getArea(areaId)` | `HaArea \| undefined` | Une pièce spécifique |
| `getDevices()` | `Map<string, HaDevice>` | Tous les appareils |
| `getDevice(deviceId)` | `HaDevice \| undefined` | Un appareil spécifique |
| `getQuoiCatalog()` | `HaQuoiDefinition[]` | Catalogue des QUOI |

#### Exemple : Récupérer les capteurs de température du salon

```typescript
// Dans votre service
function getTemperatureSensorsInLivingRoom(): HaStructuredEntity[] {
  const livingRoomId = 'area.living_room';
  const temperatureQuoiId = 'temperature';
  
  return this.haStructureRegistry.getEntitiesByAreaAndQuoi(
    livingRoomId,
    temperatureQuoiId
  );
}
```

#### Événements EventBus pour les mises à jour

```typescript
// Écouter la reconstruction complète du référentiel
this.eventBus.on('ha:structure:rebuilt', (registry: HaStructuredRegistry) => {
  this.localRegistry = registry;
  this.refreshDisplay();
});

// Écouter les mises à jour d'entités individuelles
this.eventBus.on('ha:entity:updated', (entity: HaStructuredEntity) => {
  this.handleEntityUpdate(entity);
});

// Écouter les mises à jour d'areas
this.eventBus.on('ha:area:updated', (area: HaArea) => {
  this.handleAreaUpdate(area);
});
```

### 4.4 Accès côté Client (TypeScript)

#### Récupérer le référentiel complet

```javascript
// Demander la structure complète
socket.emit('ha:structure:get');

// Recevoir et traiter
socket.on('ha:structure', (registry) => {
  // registry contient : areas, devices, entities
  
  // Exemple : Afficher les capteurs par pièce
  const sensorsByRoom = {};
  
  for (const [areaId, area] of Object.entries(registry.areas)) {
    const sensors = Object.values(registry.entities)
      .filter(e => e.area?.area_id === areaId)
      .filter(e => e.quoi_ids.includes('temperature') || 
                   e.quoi_ids.includes('humidity'));
    
    if (sensors.length > 0) {
      sensorsByRoom[area.name] = sensors.map(s => ({
        id: s.entity_id,
        name: s.entity_id.split('.').pop().replace('_', ' '),
        type: s.quoi_ids[0]
      }));
    }
  }
  
  $data.sensorsByRoom = sensorsByRoom;
});
```

#### Filtrer par Area + QUOI côté client

```javascript
// Après avoir reçu la structure
socket.on('ha:structure', (registry) => {
  const areaId = 'area.cuisine';
  const quoiId = 'temperature';
  
  const temperatureSensors = Object.values(registry.entities)
    .filter(e => e.area?.area_id === areaId)
    .filter(e => e.quoi_ids.includes(quoiId));
  
  console.log('Capteurs de température dans la cuisine:', temperatureSensors);
});
```

#### Mises à jour en temps réel

```javascript
// Écouter les changements d'entités
socket.on('ha:entity:updated', (entity) => {
  if (entity.quoi_ids.includes('temperature')) {
    // Rafraîchir l'affichage du capteur de température
    updateTemperatureDisplay(entity);
  }
});

// Écouter la reconstruction complète
socket.on('ha:structure:rebuilt', (registry) => {
  // Recharger toute la structure
  reloadFullStructure(registry);
});
```

### 4.5 Arborescence complète des lieux avec entités

**Côté Serveur** :
```typescript
function getFullStructure(): {
  areas: HaArea[];
  entitiesByArea: Map<string, HaStructuredEntity[]>;
} {
  const areas = Array.from(this.haStructureRegistry.getAreas().values());
  const entitiesByArea = new Map(
    areas.map(area => [
      area.area_id,
      this.haStructureRegistry.getEntitiesByArea(area.area_id)
    ])
  );
  
  return { areas, entitiesByArea };
}
```

**Côté Client** :
```javascript
socket.on('ha:structure', (registry) => {
  const tree = {};
  
  for (const [areaId, area] of Object.entries(registry.areas)) {
    tree[area.name] = Object.values(registry.entities)
      .filter(e => e.area?.area_id === areaId)
      .map(e => ({
        entity_id: e.entity_id,
        name: e.entity_id,
        types: e.quoi_ids,
        domain: e.domain
      }));
  }
  
  $data.areaTree = tree;
});
```

### 4.6 Scénarios avancés

#### Scénario 1 : Trouver tous les interrupteurs d'une pièce
```typescript
// Serveur
const switches = haStructureRegistry.getEntitiesByAreaAndQuoi(
  'area.salon',
  'interrupteur'
);

// Client
socket.on('ha:structure', (registry) => {
  const switches = Object.values(registry.entities)
    .filter(e => e.area?.area_id === 'area.salon')
    .filter(e => e.quoi_ids.includes('interrupteur'));
});
```

#### Scénario 2 : Obtenir toutes les entités non assignées
```typescript
// Serveur
const unassigned = haStructureRegistry.getEntitiesByArea(
  'unassigned'  // Area spéciale si include_unassigned = true
);

// Client
socket.on('ha:structure', (registry) => {
  const unassigned = Object.values(registry.entities)
    .filter(e => !e.area || e.area.area_id === 'unassigned');
});
```

#### Scénario 3 : Vérifier si une entité existe dans une pièce
```typescript
// Serveur
function isEntityInArea(entityId: string, areaId: string): boolean {
  const entity = this.haStructureRegistry.getEntity(entityId);
  return entity?.area?.area_id === areaId;
}

// Client
socket.on('ha:structure', (registry) => {
  const entity = registry.entities['sensor.temperature_salon'];
  const isInLivingRoom = entity?.area?.area_id === 'area.salon';
});
```

---

## 5. Intégration Automatique avec le Socle

Le socle **détecte et démarre automatiquement** votre application.

### 5.1 Convention de détection

`AppService` scanne automatiquement :
- `applications/{nom-app}/`
- `dist/applications/{nom-app}/`

**Conditions pour être détectée** :
1. Répertoire doit contenir `domain/index.ts`
2. Ce fichier doit exporter une constante `{NOM_APP}_APP` de type `ApplicationModule`
3. Une factory de service doit être exportée (`create{NomApp}Service` ou `{NomApp}ServiceFACTORY`)

### 5.2 Cycle de vie automatique

```
Démarrage AppService
    │
    ▼
Détection des modules (detectApplicationModules)
    │
    ▼
Module "{nom-app}" détecté
    │
    ▼
Recherche factory: create{NomApp}Service
    │
    ▼
Instanciation: new {NomApp}Service(eventBus, logger, configProvider)
    │
    ▼
Appel automatique: .start()
    │
    ▼
✅ Service démarré
```

### 5.3 Gestion des erreurs

Si le démarrage échoue (mauvaise config, matériel absent) :
- Un **warning** est loggé (pas une erreur)
- L'application **continue de fonctionner**
- Le service peut être redémarré automatiquement plus tard

### 5.4 Redémarrage automatique

Le service est **automatiquement redémarré** quand :
- La configuration de l'application est sauvegardée (`app:module:config:saved`)
- L'application est réactivée (déplacement depuis `applications_desactivees/`)

```typescript
// Dans AppService (déjà implémenté)
eventBus.onGeneric('app:module:config:saved', (data) => {
  if (data.success) {
    restartApplicationService(data.moduleId);
  }
});
```

---

## 6. Configuration d'une Application

### 6.1 Définir le schema

**Fichier : `config-schema.ts`**

```typescript
import { z } from 'zod';

export const myAppConfigSchema = z.object({
  // Champs obligatoires
  enabled: z.boolean().default(true),
  apiEndpoint: z.string().url(),
  
  // Champs optionnels
  pollInterval: z.number().min(1000).max(300000).default(60000),
  maxRetries: z.number().min(0).max(10).default(3),
  
  // Tableaux
  monitoredEntities: z.array(z.string()).default([]),
  
  // Objets imbriqués
  auth: z.object({
    token: z.string().min(32),
    expiresIn: z.number().optional()
  }).optional()
});

export type MyAppConfig = z.infer<typeof myAppConfigSchema>;
```

### 6.2 Utiliser IAppConfigProvider

**Dans votre service** :

```typescript
import type { IAppConfigProvider } from '../../../../infrastructure/config/IAppConfigProvider';
import type { MyAppConfig } from './config-schema';

export class MyAppService {
  private config: MyAppConfig;
  
  constructor(
    private eventBus: IEventBus,
    private logger: Logger,
    private configService: IAppConfigProvider<MyAppConfig>
  ) {
    this.config = this.configService.getAppConfig();
  }
  
  getConfig(): MyAppConfig {
    return this.configService.getAppConfig();
  }
  
  reloadConfig(): void {
    this.config = this.configService.getAppConfig();
    this.logger.info('MyAppService', 'Configuration rechargée');
  }
}
```

### 6.3 Configuration dans config.yaml

```yaml
# Fichier : data/config.yaml

# Configuration du socle (existante)
ha:
  ws:
    host: ha2.local
    port: 8123
    token: "..."

mqtt:
  host: localhost
  port: 1883

# Configuration de votre application
myapp:
  enabled: true
  apiEndpoint: "https://api.example.com"
  pollInterval: 30000
  monitoredEntities:
    - sensor.temperature_salon
    - sensor.humidity_cuisine
  auth:
    token: "my-secret-token"
```

### 6.4 Sauvegarde de la configuration

**Côté Serveur** :
```typescript
// Le service peut sauvegarder sa propre configuration
this.configService.savePartialConfig({
  pollInterval: 45000,
  monitoredEntities: ['sensor.temperature_salon', 'sensor.temperature_chambre']
});

// Cela déclenchera automatiquement :
// 1. Sauvegarde dans config.yaml
// 2. Émission de 'app:module:config:saved' sur EventBus
// 3. Redémarrage automatique du service (si nécessaire)
```

**Côté Client** :
```javascript
// Envoyer la configuration à sauvegarder
socket.emit('app:modules:config:save', {
  moduleId: 'myapp',
  config: {
    pollInterval: 45000,
    monitoredEntities: ['sensor.temperature_salon']
  }
});

// Recevoir la confirmation
socket.on('app:module:config:saved', (result) => {
  if (result.success) {
    console.log('Configuration sauvegardée');
  } else {
    console.error('Erreur:', result.error);
  }
});
```

---

## 7. Gestion des Événements Socket.io

### 7.1 Événements Socle disponibles

**Serveur → Client** :

| Événement | Payload | Description |
|-----------|---------|-------------|
| `app:status` | `{ mqtt: boolean, haEntities: number, uptime: number }` | Statut global |
| `app:log` | `{ level, module, message, ts }` | Ligne de log |
| `ha:sync:ready` | `{ entityCount: number }` | Référentiel HA initialisé |
| `ha:status` | `{ connected: boolean }` | Statut connexion WS HA |
| `ha:entity:updated` | `HaStructuredEntity` | Entité mise à jour |
| `ha:structure` | `HaStructuredRegistry` | **Référentiel complet** |
| `ha:structure:rebuilt` | `HaStructuredRegistry` | Référentiel reconstruit |
| `ha:area:updated` | `HaArea` | Area mise à jour |
| `ha:command:result` | `HaCommandResult` | Résultat d'une commande |
| `mqtt:connected` | `void` | MQTT connecté |
| `mqtt:disconnected` | `{ reason: string }` | MQTT déconnecté |

**Client → Serveur** :

| Événement | Payload | Description |
|-----------|---------|-------------|
| `config:get` | `void` | Demander la config |
| `config:save` | `TechnicalConfig` | Sauvegarder la config |
| `config:validate` | `Partial<TechnicalConfig>` | Valider la config |
| `ha:structure:get` | `void` | **Demander le référentiel HA** |
| `ha:command:send` | `HaCommand` | Envoyer une commande à HA |
| `app:modules:config:get` | `{ moduleId: string }` | Demander config d'un module |
| `app:modules:config:save` | `{ moduleId, config }` | Sauvegarder config d'un module |

#### 7.1.1 Événements Persistants — Reçu automatiquement à la connexion

> **✅ NOUVEAU v1.2** : Certains événements du socle et des applications sont **persistants** et envoyés automatiquement aux nouveaux clients Socket.io.

**Événements persistants du socle (core) :**
- `app:status` — Statut global de l'application
- `config:current` — Configuration actuelle complète
- `mqtt:connected` — Statut de connexion MQTT
- `mqtt:disconnected` — Statut de déconnexion MQTT
- `app:modules:list` — Liste des modules disponibles
- `ha:status` — Statut de connexion HA

**Pour votre application :**
Déclarez vos événements persistants lors de l'enregistrement :

```typescript
// Dans votre service, lors de l'initialisation
this.eventBus.emit('app:socket-events:registered', {
  appId: '{nom-app}',
  socketEvents: {
    STATUS: '{nom-app}:status',
    DATA_LIST: '{nom-app}:data:list'
  },
  persistentEvents: ['{nom-app}:status']  // ✅ Ces événements seront envoyés automatiquement
});
```

**Avantages :**
- ✅ **Pas besoin** de `socket.emit('config:get')` — reçu automatiquement
- ✅ Meilleure UX — état affiché immédiatement à la connexion
- ✅ Robuste aux reconnexions

**À éviter :**
- ❌ Ne pas émettre de demande explicite pour un événement persistant
- ❌ Exemple : `socket.emit('config:get')` n'est plus nécessaire (supprimé du code client)

### 7.2 Événements MQTT (pour les intégrations)

> **Rappel** : Les services métiers **n'accèdent pas directement** à MQTT. Ils utilisent EventBus.

**Flux MQTT** :
```
Service Métier
  │ EventBus.emit('integration:{module}:discovery')
  ▼
HaMqttIntegrationService (socle)
  │ Publie sur MQTT → Home Assistant
  ▼
MQTT Broker
```

**Événements pour MQTT** :

| Action | Événement à émettre | Description |
|--------|---------------------|-------------|
| Découverte | `integration:{module}:discovery` | Publier la découverte d'une entité |
| État | `integration:{module}:state` | Publier l'état d'une entité |
| Commande | Écouter `integration:{module}:command` | Recevoir une commande de HA |

**Exemple** :
```typescript
// Publier la découverte d'un capteur de température
this.eventBus.emit('integration:myapp:discovery', {
  component: 'sensor',
  objectId: 'myapp_temperature_001',
  entity: {
    name: 'Température Salon',
    unique_id: 'myapp_temperature_001',
    device_class: 'temperature',
    state_topic: 'homeassistant/sensor/myapp_temperature_001/state',
    unit_of_measurement: '°C'
  }
});

// Écouter les commandes
this.eventBus.onGeneric('integration:myapp:command', (command) => {
  // Traiter la commande reçue de HA
  console.log('Commande reçue:', command);
});
```

### 7.3 Événements WebSocket (HA API)

**Envoi de commandes à HA** :

```typescript
// Côté Serveur (via HaCommandService)
this.eventBus.emit('ha:command:send', {
  entity_id: 'light.salon',
  domain: 'light',
  service: 'turn_on',
  data: { brightness: 200 }
});

// Côté Client (via Socket.io)
socket.emit('ha:command:send', {
  entity_id: 'light.salon',
  domain: 'light',
  service: 'turn_on'
});

// Recevoir le résultat
socket.on('ha:command:result', (result) => {
  console.log('Commande exécutée:', result.success);
});
```

### 7.4 Bonnes pratiques

1. **Préfixer vos événements** : Utiliser le nom de votre application comme préfixe
   - ✅ `{nom-app}:data:list`
   - ❌ `data:list` (risque de conflit)

2. **Typage des payloads** : Toujours typer les données échangées

3. **Gestion des erreurs** : Toujours émettre un événement d'erreur
   ```typescript
   try {
     // logique
     socket.emit('{nom-app}:success', result);
   } catch (error) {
     socket.emit('{nom-app}:error', { message: error.message });
   }
   ```

4. **Documenter vos événements** : Dans `socket-events.ts` avec des commentaires

---

## 8. Tests et Validation

### 8.1 Vérifications de base

```bash
# Vérifier que le build passe
npm run build

# Vérifier qu'il n'y a pas d'erreurs TypeScript
npx tsc --noEmit

# Lancer en développement
npm run dev
```

### 8.2 Checklist de validation

- [ ] Le module apparaît dans la liste des modules détectés (logs au démarrage)
- [ ] Le service démarre sans erreur (vérifier les logs `AppService`)
- [ ] Le service émet bien ses événements Socket.io
- [ ] L'UI de l'application est accessible via `/applications/{nom-app}/presentation/index.html`
- [ ] La configuration du module est visible dans les paramètres techniques
- [ ] Les modifications de configuration déclenchent bien un redémarrage du service

### 8.3 Tests avec TypeScript

```html
<!-- Dans votre index.html -->
<div id="app-test">
  <div id="status" style="display: none;">Déconnecté de Socket.io...</div>
  <div id="error-container" class="error" style="display: none;"></div>
  <div id="data-container" style="display: none;">
    <!-- Affichage des données -->
  </div>
</div>

<script>
// Dans votre app.ts
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error-container');
const dataEl = document.getElementById('data-container');

socket.on('connect', () => {
  if (statusEl) statusEl.style.display = 'none';
});

socket.on('disconnect', () => {
  if (statusEl) statusEl.style.display = 'block';
});

socket.on('{nom-app}:data:list', (d) => {
  if (dataEl) {
    dataEl.style.display = 'block';
    dataEl.innerHTML = '<p>Données reçues: ' + JSON.stringify(d) + '</p>';
  }
});

socket.on('{nom-app}:error', (e) => {
  if (errorEl) {
    errorEl.style.display = 'block';
    errorEl.textContent = e.message || String(e);
  }
});

socket.emit('{nom-app}:data:get');
</script>
```

---

## 9. Checklist Avant Déploiement

### 9.1 Validation du code

- [ ] **Aucune modification** dans `src/application/` ou `src/infrastructure/` (socle)
- [ ] Respect des [conventions de nommage](nommage_specs_v1.0.md)
- [ ] Tous les fichiers obligatoires sont présents
- [ ] `npm run build` passe sans erreur
- [ ] Pas de `console.log` dans le code de production (utiliser `logger`)

### 9.2 Validation fonctionnelle

- [ ] Le module apparaît dans l'UI après démarrage
- [ ] Le service démarre automatiquement (logs `AppService`)
- [ ] La configuration du module est chargeable/sauvegardable
- [ ] Les événements Socket.io sont bien émis/reçus
- [ ] L'application gère les erreurs graceusement
- [ ] L'application respecte la [charte graphique](techniques-socle-ha-mqtt_specs_v4.5.md#13-charte-graphique-ui)

### 9.3 Validation de l'intégration

- [ ] `requiredMqtt: true` si l'application utilise MQTT
- [ ] `requiredHaWs: true` si l'application utilise HA WebSocket
- [ ] L'application n'accède pas directement à `ConfigService` (utiliser `IAppConfigProvider`)
- [ ] L'application n'accède pas directement à `HaMqttIntegrationService` ou `HaWsClient`
- [ ] Toutes les communications avec HA passent par EventBus

### 9.4 Documentation

- [ ] Spécifications fonctionnelles créées (`fonctionnelles-{nom-app}_specs_vX.X.md`)
- [ ] Spécifications d'implémentation créées (`implementation-{nom-app}_specs_vX.X.md`)
- [ ] Documentation des événements Socket.io dans `socket-events.ts`
- [ ] README.md optionnel dans le répertoire de l'application

---

## 10. Exemple Complet

### 10.1 Application "Moniteur de Température"

**Structure** :
```bash
applications/temperature-monitor/
├── domain/
│   ├── index.ts
│   ├── TemperatureMonitorService.ts
│   ├── socket-events.ts
│   ├── config-schema.ts
│   └── types.ts
└── presentation/
    ├── index.html
    └── ts/
        └── app.ts
```

**domain/index.ts** :
```typescript
import { TemperatureMonitorService } from './TemperatureMonitorService';
import { TEMPERATURE_MONITOR_SOCKET_EVENTS } from './socket-events';

export const TEMPERATURE_MONITOR_APP: ApplicationModule = {
  id: 'temperature-monitor',
  name: 'Moniteur Température',
  description: 'Surveille les capteurs de température HA',
  icon: '🌡️',
  type: 'integration',
  configurable: true,
  requiredMqtt: false,
  requiredHaWs: true,
  socketEvents: TEMPERATURE_MONITOR_SOCKET_EVENTS,
  configSection: 'temperature_monitor'
};

export function createTemperatureMonitorService(eventBus, logger, configProvider) {
  return new TemperatureMonitorService(eventBus, logger, configProvider);
}

export * from './TemperatureMonitorService';
export * from './socket-events';
export * from './config-schema';
```

**domain/TemperatureMonitorService.ts** :
```typescript
import type { IEventBus } from '../../../../application/IEventBus';
import type { Logger } from '../../../../infrastructure/logger/index';
import type { IAppConfigProvider } from '../../../../infrastructure/config/IAppConfigProvider';
import type { HaStructureRegistry, HaStructuredEntity } from '../../../../ha/types/ha-structure';
import type { TemperatureMonitorConfig } from './config-schema';

export class TemperatureMonitorService {
  private monitoredSensors: Map<string, HaStructuredEntity> = new Map();
  
  constructor(
    private eventBus: IEventBus,
    private logger: Logger,
    private configService: IAppConfigProvider<TemperatureMonitorConfig>,
    private haStructureRegistry: HaStructureRegistry
  ) {
    this.setupEventListeners();
  }

  async start(): Promise<void> {
    this.logger.info('TemperatureMonitorService', 'Démarrage...');
    
    const config = this.configService.getAppConfig();
    
    // Charger les capteurs de température
    this.loadTemperatureSensors();
    
    this.logger.info('TemperatureMonitorService', 'Service démarré');
  }

  private setupEventListeners(): void {
    // Écouter les mises à jour du référentiel
    this.eventBus.on('ha:structure:rebuilt', () => {
      this.loadTemperatureSensors();
    });
    
    // Écouter les mises à jour d'entités
    this.eventBus.on('ha:entity:updated', (entity: HaStructuredEntity) => {
      if (entity.quoi_ids.includes('temperature')) {
        this.handleTemperatureUpdate(entity);
      }
    });
  }

  private loadTemperatureSensors(): void {
    const sensors = this.haStructureRegistry.getAllEntities()
      .filter(e => e.quoi_ids.includes('temperature'));
    
    this.monitoredSensors.clear();
    for (const sensor of sensors) {
      this.monitoredSensors.set(sensor.entity_id, sensor);
    }
    
    // Émettre vers l'UI
    this.eventBus.emit('temperature-monitor:sensors:list', {
      sensors: Array.from(this.monitoredSensors.values())
    });
  }

  private handleTemperatureUpdate(entity: HaStructuredEntity): void {
    this.monitoredSensors.set(entity.entity_id, entity);
    this.eventBus.emit('temperature-monitor:sensor:updated', entity);
  }
}
```

**presentation/index.html** :
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Moniteur Température</title>
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <h1>🌡️ Moniteur de Température</h1>
  <div id="sensors-container">
    <div id="loading">Chargement des capteurs...</div>
    <div id="error" class="error" style="display: none;"></div>
    <div id="no-sensors" style="display: none;">Aucun capteur de température trouvé.</div>
    <div id="sensors-list" style="display: none;">
      <h2>Capteurs de température</h2>
      <div id="sensors-grid" class="sensors-grid"></div>
    </div>
  </div>
  <script src="/applications/temperature-monitor/ts/app.js"></script>
</body>
</html>
```

---

## 📚 Ressources Complémentaires

- [Spécifications Techniques Socle v4.5](techniques-socle-ha-mqtt_specs_v4.5.md) — Architecture complète
- [Conventions de Nommage](nommage_specs_v1.0.md) — Nommage des classes, fichiers, événements
- [Spécifications Présentation v3.0](presentation_specs_v3.0.md) — TypeScript, Socket.io, Web Components, UI
- [Architectural Patterns](architectural-patterns_specs-v1.0.md) — Patterns de conception
- [Gestion des Erreurs](erreurs_specs_v1.0.md) — Codes d'erreur, format

---

## 📅 Historique des Versions

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| **1.1** | 17/07/2026 | Mistral Vibe | Correction : Suppression des références à Alpine.js (migration vers TypeScript pur + Web Components natifs) |
| **1.0** | 17/07/2026 | Mistral Vibe | Version initiale : Guide complet avec accès au référentiel HA |

---

**Document généré par Mistral Vibe**  
**Co-Authored-By: Mistral Vibe <vibe@mistral.ai>**
