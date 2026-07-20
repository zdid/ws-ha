# Spécifications d'Implémentation - Application NOMMAGE

**Version :** 1.0.0  
**Date :** 19 Juillet 2026  
**Auteur :** Mistral Vibe  
**Statut :** Document technique pour les développeurs  
**Document parent :** [fonctionnelles-nommage_specs_v1.0.md](./fonctionnelles-nommage_specs_v1.0.md)

---

## 📚 Table des Matières

1. [Introduction](#1-introduction)
2. [Architecture Technique](#2-architecture-technique)
3. [Structure des Répertoires](#3-structure-des-répertoires)
4. [Détails d'Implémentation](#4-détails-dimplémentation)
5. [Intégration avec le Socle](#5-intégration-avec-le-socle)
6. [Configuration Technique](#6-configuration-technique)
7. [Tests et Validation](#7-tests-et-validation)
8. [Dépannage](#8-dépannage)

---

## 1. Introduction

Ce document détaille l'**implémentation technique** de l'application NOMMAGE, en complément des [spécifications fonctionnelles](./fonctionnelles-nommage_specs_v1.0.md).

**Public cible :**
- Développeurs souhaitant étendre ou maintenir l'application
- Intégrateurs souhaitant comprendre le code source
- Contributeurs au projet

---

## 2. Architecture Technique

### 2.1 Couches logicielles (5 couches)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PRÉSENTATION                                   │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  presentation/index.html                              │ │
│  │  presentation/ts/app.ts                               │ │
│  │  - Affichage du statut                              │ │
│  │  - Émission/réception Socket.io                      │ │
│  │  - Interface utilisateur (HTML/CSS/TypeScript)      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         APPLICATION                                    │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  AppService (core) - Cycle de vie                  │ │
│  │  - Détection automatique du module                  │ │
│  │  - Instanciation: createNommageService()            │ │
│  │  - Appel automatique: .start()                      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         DOMAINE (MÉTIER)                              │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  domain/NommageService.ts                          │ │
│  │  - Parsing QUOI/OÙ                                 │ │
│  │  - Génération des structures taxonomiques         │ │
│  │  - Transmission au core                            │ │
│  │  ❌ NE CONNAÎT PAS: MQTT, HA, Socket.io, filesystem  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  domain/index.ts                                   │
│  - Déclaration du module (NOMMAGE_APP)               │
│  - Factory (createNommageService)                   │
│                                                                     │
│  domain/config-schema.ts                           │
│  - Schéma Zod de la configuration                   │
│                                                                     │
│  domain/socket-events.ts                           │
│  - Déclaration des événements Socket.io             │
│                                                                     │
│  domain/types.ts                                   │
│  - Types TypeScript spécifiques                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         COUCHE HA (INTÉGRATION)                        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  ha/integration/nommage/NommageMqttIntegrationService.ts     │ │
│  │  - Client MQTT (mqtt@5.x)                           │ │
│  │  - Connexion/déconnexion automatique                │ │
│  │  - Abonnements aux topics de découverte             │ │
│  │  - Réception et forwarding des messages            │ │
│  │  ❌ NE MODIFIE PAS: Les messages (seulement écoute)│ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        INFRASTRUCTURE                                  │
│  Utilisée depuis le core (applications/core/src/infrastructure/)       │
│  - ConfigService / ConfigLoader / ConfigWriter                       │
│  - Logger (Winston)                                                │
│  - IAppConfigProvider                                             │
│  - EventBus                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Flux de données interne

```
┌─────────────────────────┐     ┌─────────────────────────┐
│  NommageMqttIntegration  │────▶│      EventBus           │
│  Service                 │     │                         │
│  (ha/integration/nommage)│     │  Événement:              │
└─────────────────────────┘     │  nommage:discovery:raw   │
                                         │                         │
                                         ▼                         │
┌─────────────────────────┐     ┌─────────────────────────┐
│  NommageService         │◀────│  SocketBridge           │
│  (domain/NommageService) │     │  (core)                 │
│                         │     │  - Traduit EventBus →    │
│  - Parse QUOI/OÙ         │     │    Socket.io            │
│  - Génère structures     │     │  - Gère les clients     │
│  - Émet vers UI/core     │     └─────────────────────────┘
└─────────────────────────┘              │
                                          ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│  UI (presentation/ts/app.ts)│◀────│  Socket.io             │
│  - Affiche le statut         │     │  (server.ts)           │
│  - Gère les interactions   │     └─────────────────────────┘
└─────────────────────────┘
```

### 2.3 Relations entre composants

```
┌─────────────────────────────────────────────────────────────────────┐
│  Composant                     │  Dépendances  │  Responsabilités     │
├─────────────────────────────────────────────────────────────────────┤
│  NommageMqttIntegrationService │ mqtt@5.x     │ Client MQTT         │
│  NommageService                │ EventBus     │ Parsing, logique    │
│  createNommageService          │ (factory)    │ Instanciation       │
│  NOMMAGE_APP                   │ -            │ Métadonnées module │
│  SocketService                 │ socket.io    │ Client Socket.io    │
│  AppService (core)             │ -            │ Cycle de vie        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Structure des Répertoires

```bash
applications/nommage/
├── package.json                    # Dépendances NPM (mqtt@5.x)
├── tsconfig.json                  # Configuration TypeScript
├── README.md                      # Documentation utilisateur
│
├── domain/                        # Couche Métier
│   ├── index.ts                   # ⭐ OBLIGATOIRE : Module + Factory
│   ├── NommageService.ts          # ⭐ OBLIGATOIRE : Service principal
│   ├── config-schema.ts           # Schéma Zod de configuration
│   ├── socket-events.ts           # Événements Socket.io
│   └── types.ts                   # Types TypeScript
│
├── ha/                           # Couche HA (Intégration)
│   └── integration/
│       └── nommage/
│           └── NommageMqttIntegrationService.ts  # Client MQTT
│
└── presentation/                  # Couche Présentation
    ├── index.html                 # ⭐ OBLIGATOIRE : UI
    └── ts/
        └── app.ts                 # Logique frontend
```

**Fichiers obligatoires (selon [guide-nouvelle-application_specs_v1.0.md](./guide-nouvelle-application_specs_v1.0.md)) :**
- ✅ `domain/index.ts`
- ✅ `domain/NommageService.ts`
- ✅ `presentation/index.html`

---

## 4. Détails d'Implémentation

### 4.1 NommageMqttIntegrationService

**Fichier :** `ha/integration/nommage/NommageMqttIntegrationService.ts`

**Rôle :** Client MQTT pour écouter les messages de découverte.

**Fonctionnalités :**
- Connexion/déconnexion au broker MQTT
- Abonnements aux topics de découverte
- Réception et validation des messages
- Forwarding vers EventBus

**Code clé :**
```typescript
// Connexion MQTT
const options: mqtt.IClientOptions = {
  clientId: config.mqtt.clientId,
  keepalive: config.mqtt.keepalive,
  reconnectPeriod: config.mqtt.reconnectPeriod,
  clean: config.mqtt.cleanSession,
  username: config.mqtt.username,
  password: config.mqtt.password
};

this.client = mqtt.connect(brokerUrl, options);

// Gestion des messages
this.client.on('message', (topic, payload) => {
  if (this.isDiscoveryTopic(topic)) {
    this.processDiscoveryMessage(topic, payload);
  }
});

// Validation du topic
private isDiscoveryTopic(topic: string): boolean {
  const { topicPrefix, discoveryTopics } = this.config.mqtt;
  
  if (topicPrefix && !topic.startsWith(topicPrefix)) {
    return false;
  }
  
  return discoveryTopics.some(pattern => 
    this.topicMatchesPattern(topic, pattern)
  );
}

// Extraction du nom
private processDiscoveryMessage(topic: string, payload: Buffer): void {
  const message = JSON.parse(payload.toString());
  let rawName = message.name || message.raw_name || 
               message.device?.name || JSON.stringify(message);
  
  this.eventBus.emit('nommage:discovery:raw', {
    rawName,
    topic,
    payload: message,
    timestamp: new Date()
  });
}
```

**Dépendances :**
- `mqtt@5.x` (runtime)
- `@types/mqtt` (dev, optionnel)

### 4.2 NommageService

**Fichier :** `domain/NommageService.ts`

**Rôle :** Service métier - Parsing des noms et transmission au core.

**Fonctionnalités :**
- Écoute des messages bruts via EventBus
- Parsing selon QUOI---OÙ
- Génération des structures taxonomiques
- Transmission au core pour envoi à HA

**Code clé :**
```typescript
// Parsing QUOI/OÙ (basé sur nommage_specs_v1.0.md)
private parseDiscoveryName(rawName: string): ParsedTaxonomy | null {
  const separatorIndex = rawName.indexOf('---');
  
  const rawQuoi = separatorIndex === -1 
    ? rawName.trim() 
    : rawName.substring(0, separatorIndex).trim();
  
  const rawLieux = separatorIndex === -1 
    ? '' 
    : rawName.substring(separatorIndex + 3).trim();
  
  const slugQuoi = this.slugify(rawQuoi);
  const lieuxSegments = rawLieux ? rawLieux.split('--').map(s => s.trim()) : [];
  const N = lieuxSegments.length;
  
  // Distribution selon la matrice
  let nomPrecis, nomLieu, nomPere, nomGrandPere;
  
  if (N === 0) {
    nomLieu = undefined;
  } else if (N === 1) {
    nomLieu = { raw: lieuxSegments[0], slug: this.slugify(lieuxSegments[0]) };
  } else if (N === 2) {
    nomPrecis = { raw: lieuxSegments[0], slug: this.slugify(lieuxSegments[0]) };
    nomLieu = { raw: lieuxSegments[1], slug: this.slugify(lieuxSegments[1]) };
  } else if (N === 3) {
    nomPrecis = { raw: lieuxSegments[0], slug: this.slugify(lieuxSegments[0]) };
    nomLieu = { raw: lieuxSegments[1], slug: this.slugify(lieuxSegments[1]) };
    nomPere = { raw: lieuxSegments[2], slug: this.slugify(lieuxSegments[2]) };
  } else if (N >= 4) {
    nomPrecis = { raw: lieuxSegments[0], slug: this.slugify(lieuxSegments[0]) };
    nomLieu = { raw: lieuxSegments[1], slug: this.slugify(lieuxSegments[1]) };
    nomPere = { raw: lieuxSegments[2], slug: this.slugify(lieuxSegments[2]) };
    nomGrandPere = { raw: lieuxSegments[3], slug: this.slugify(lieuxSegments[3]) };
  }
  
  return {
    quoi: { raw: rawQuoi, slug: slugQuoi },
    ou: { precis: nomPrecis, lieu: nomLieu, pere: nomPere, grandPere: nomGrandPere },
    haAreaId: nomLieu?.slug,
    haAreaName: nomLieu?.raw,
    haEntityId: nomLieu 
      ? `${this.config.ha.objectIdPrefix}${slugQuoi}_${nomLieu.slug}`
      : `${this.config.ha.objectIdPrefix}${slugQuoi}`,
    haAttributes: {
      attributs_taxonomie: {
        quoi: rawQuoi,
        slug_quoi: slugQuoi,
        lieu_precis: nomPrecis?.raw,
        slug_precis: nomPrecis?.slug,
        lieu_principal: nomLieu?.raw,
        slug_lieu: nomLieu?.slug,
        lieu_pere: nomPere?.raw,
        slug_pere: nomPere?.slug,
        lieu_grand_pere: nomGrandPere?.raw,
        slug_grand_pere: nomGrandPere?.slug
      },
      ...otherAttributes
    }
  };
}

// Normalisation slugify
private slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

// Transmission au core
private transmitToCore(discoveryMessage: DiscoveryMessage, parsed: ParsedTaxonomy): void {
  if (!this.config.ha.autoTransmit) return;
  
  this.eventBus.emit('nommage:transmit:to-core', {
    type: 'nommage:discovery:parsed',
    discoveryMessage,
    parsedTaxonomy: parsed,
    timestamp: new Date()
  });
}
```

**Événements EventBus écoutés :**
- `nommage:discovery:raw` → Traitement des messages bruts
- `nommage:mqtt:status` → Mise à jour du statut MQTT
- `nommage:status:get` → Demande de statut depuis l'UI
- `nommage:taxonomy:get` → Demande de structure taxonomique
- `nommage:config:save` → Sauvegarde de la configuration

**Événements EventBus émis :**
- `nommage:discovery:parsed` → Message parsé avec succès
- `nommage:taxonomy:structure` → Structure taxonomique complète
- `nommage:status` → Statut actuel
- `nommage:error` → Erreur interne
- `nommage:transmit:to-core` → Transmission au core pour HA

### 4.3 Déclaration du Module

**Fichier :** `domain/index.ts`

**Rôle :** Point d'entrée pour la détection automatique par AppService.

**Contenu obligatoire :**
```typescript
// 1. Déclaration du module
export const NOMMAGE_APP: ApplicationModule = {
  id: 'nommage',              // ⭐ Doit correspondre au nom du répertoire
  name: 'NOMMAGE',
  description: '...',
  icon: '🏷️',
  type: 'integration',        // ⭐ Application d'intégration
  configurable: true,
  requiredMqtt: true,        // ⭐ Nécessite MQTT
  requiredHaWs: false,
  configSection: 'nommage',
  socketEvents: NOMMAGE_SOCKET_EVENTS
};

// 2. Factory du service
export function createNommageService(
  eventBus: IEventBus,
  logger: Logger,
  configProvider: IAppConfigProvider<NommageConfig>
): INommageService {
  const mqttService = NommageMqttIntegrationService.create(
    eventBus, logger, configProvider
  );
  
  return NommageService.create(
    eventBus, logger, configProvider, mqttService
  );
}

// 3. Ré-export des composants
export * from './NommageService';
export * from './config-schema';
export * from './socket-events';
export * from './types';
export * from '../ha/integration/nommage/NommageMqttIntegrationService';
```

### 4.4 UI (Présentation)

**Fichier :** `presentation/index.html` et `presentation/ts/app.ts`

**Rôle :** Interface utilisateur minimale pour visualiser le statut.

**Fonctionnalités :**
- Connexion Socket.io au serveur
- Affichage du statut (Application + MQTT)
- Liste des topics de découverte
- Compteur des messages parsés
- Date du dernier parsing
- Boutons d'action (rafraîchir, tester)

**Code clé (app.ts) :**
```typescript
// Initialisation
function init(): void {
  socket = SocketService.getInstance();
  setupEventListeners();
  requestInitialStatus();
  hideLoading();
}

// Événements Socket.io
socket.on('nommage:status', updateStatusDisplay);
socket.on('nommage:discovery:parsed', (data) => {
  updateParsedMessagesCounter();
  updateLastParsedDisplay(data.timestamp);
});
socket.on('nommage:error', showError);
```

---

## 5. Intégration avec le Socle

### 5.1 Détection Automatique

**Processus (AppService dans le core) :**
1. Scan des répertoires `applications/` et `dist/applications/`
2. Détection de `applications/nommage/domain/index.ts`
3. Vérification de l'export `NOMMAGE_APP`
4. Vérification de l'export `createNommageService`
5. Instanciation via la factory
6. Appel automatique de `.start()`

**Condition pour être détectée :**
- ✅ Répertoire dans `applications/`
- ✅ Contient `domain/index.ts`
- ✅ Exporte `NOMMAGE_APP: ApplicationModule`
- ✅ Exporte `createNommageService` (factory)
- ✅ `id` correspond au nom du répertoire

### 5.2 Cycle de Vie

```
AppService.detectApplicationModules()
    │
    ▼
Module "nommage" détecté
    │
    ▼
Recherche factory: createNommageService
    │
    ▼
Instanciation: new NommageService(eventBus, logger, configProvider)
    │
    ▼
Connexion MQTT (NommageMqttIntegrationService)
    │
    ▼
Abonnement aux topics de découverte
    │
    ▼
Appel: .start()
    │
    ▼
✅ Service démarré - Prêt à écouter
```

### 5.3 Communication avec le Core

**Événement pour transmission à HA :**
```typescript
// Émis par NOMMAGE
type TransmitToCoreEvent = {
  type: 'nommage:discovery:parsed';
  discoveryMessage: DiscoveryMessage;
  parsedTaxonomy: ParsedTaxonomy;
  timestamp: Date;
};

// À implémenter dans le core (ex: AppService ou HaMqttIntegrationService)
this.eventBus.on('nommage:transmit:to-core', (data: TransmitToCoreEvent) => {
  const { parsedTaxonomy } = data;
  
  // 1. Créer les Areas si nécessaire
  if (parsedTaxonomy.ou.lieu && this.config.ha.autoCreateAreas) {
    await this.haWsClient.createArea({
      name: parsedTaxonomy.ou.lieu.raw
    });
  }
  
  // 2. Publier la découverte MQTT vers HA
  await this.haMqttIntegrationService.publishDiscovery(
    parsedTaxonomy.haAttributes.device_class || 'sensor',
    parsedTaxonomy.haEntityId,
    {
      name: parsedTaxonomy.quoi.raw,
      unique_id: parsedTaxonomy.haEntityId,
      device_class: parsedTaxonomy.haAttributes.device_class,
      ...parsedTaxonomy.haAttributes
    }
  );
  
  // 3. Ajouter au référentiel structuré
  this.haStructureRegistry.addEntity({
    entity_id: parsedTaxonomy.haEntityId,
    domain: this.config.ha.defaultDomain,
    area_id: parsedTaxonomy.haAreaId,
    quoi_ids: [parsedTaxonomy.quoi.slug],
    attributes: parsedTaxonomy.haAttributes
  });
});
```

### 5.4 Enregistrement des Événements Persistants

**À appeler lors du démarrage :**
```typescript
// Dans createNommageService
registerPersistentEvents(eventBus);

// Fonction d'enregistrement
export function registerPersistentEvents(eventBus: IEventBus): void {
  eventBus.emit('app:socket-events:registered', {
    appId: 'nommage',
    socketEvents: NOMMAGE_SOCKET_EVENTS,
    persistentEvents: NOMMAGE_PERSISTENT_EVENTS
  });
}
```

**Événements persistants (envoyés automatiquement aux nouveaux clients) :**
- `nommage:status` - Statut actuel de l'application
- `nommage:taxonomy:structure` - Structure taxonomique complète

---

## 6. Configuration Technique

### 6.1 package.json

```json
{
  "name": "nommage",
  "version": "1.0.0",
  "description": "Application de gestion des conventions de nommage...",
  "main": "dist/domain/index.js",
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w"
  },
  "dependencies": {
    "mqtt": "^5.0.0"
  },
  "devDependencies": {
    "@types/mqtt": "^2.0.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 6.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "../../dist/applications/nommage",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "../../../../*": ["../../core/src/*"],
      "../../../../types/*": ["../../core/src/types/*"],
      "../../../../application/*": ["../../core/src/application/*"],
      "../../../../infrastructure/*": ["../../core/src/infrastructure/*"],
      "../../../../ha/*": ["../../core/src/ha/*"]
    },
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": [
    "domain/**/*",
    "ha/**/*",
    "presentation/ts/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

**Points clés :**
- `outDir` pointe vers `../../dist/applications/nommage` (structure du core)
- `paths` permet de résoudre les imports vers le core
- `strict: true` pour le typage fort

### 6.3 Configuration YAML

**Fichier :** `data/config.yaml`

```yaml
# Configuration NOMMAGE
nommage:
  enabled: true
  
  mqtt:
    host: "localhost"
    port: 1883
    clientId: "nommage-app"
    discoveryTopics:
      - "ha/+/+/config"
      - "homeassistant/+/+/config"
    topicPrefix: "ha/"
    qos: 1
    retain: true
    
  ha:
    autoTransmit: true
    defaultComponent: "sensor"
    defaultDomain: "sensor"
    objectIdPrefix: "nommage_"
    autoCreateAreas: true
    injectTaxonomyAttributes: true
    
  logging:
    level: "info"
    showRawMessages: false
    showParsedMessages: false
```

---

## 7. Tests et Validation

### 7.1 Validation du Code

```bash
# Vérifier la compilation TypeScript
cd /chemin/vers/ws-ha
npm run build

# Vérifier les erreurs TypeScript
npx tsc --noEmit --project applications/nommage/tsconfig.json

# Lancer en mode développement (watch)
cd applications/nommage
npm run watch
```

### 7.2 Tests Manuels

**Test 1 : Démarrage de l'application**
```bash
# Déplacer l'application vers activées
mv applications_desactivees/nommage applications/

# Redémarrer l'application
docker-compose restart

# Vérifier les logs
tail -f logs/app.log | grep -i nommage
```

**Attendu :**
```
[INFO] [AppService] Détection du module "nommage"
[INFO] [NommageMqttIntegrationService] Tentative de connexion MQTT...
[INFO] [NommageMqttIntegrationService] Connecté au broker MQTT
[INFO] [NommageService] Service démarré avec succès
[INFO] [NommageService] Topics de découverte: ha/+/+/config,homeassistant/+/+/config
```

**Test 2 : Parsing d'un message**
```bash
# Publier un message de test sur MQTT
mosquitto_pub -h localhost -t "ha/sensor/temperature/config" -m '{
  "name": "Température---Capteur Fenêtre--Salon--Rez-de-Chaussée",
  "unique_id": "test_temperature_001",
  "device_class": "temperature"
}'
```

**Attendu (dans les logs) :**
```
[DEBUG] [NommageMqttIntegrationService] Message MQTT reçu - Topic: ha/sensor/temperature/config
[INFO] [NommageService] Message parsed: QUOI="Température" | LIEU="Salon"
```

**Test 3 : Vérification de l'UI**
```bash
# Ouvrir l'UI dans un navigateur
firefox http://localhost:8080/applications/nommage/presentation/index.html
```

**Attendu :**
- Statut : Application = Connecté, MQTT = Connecté
- Topics de découverte affichés
- Compteur de messages parsés incrémenté

### 7.3 Checklist avant déploiement

- [ ] `npm run build` passe sans erreur
- [ ] Tous les fichiers obligatoires sont présents
- [ ] `NOMMAGE_APP.id === 'nommage'` (correspond au répertoire)
- [ ] Configuration MQTT valide dans `data/config.yaml`
- [ ] Le broker MQTT est accessible
- [ ] Le core écoute `nommage:transmit:to-core`
- [ ] Les dépendances (`mqtt@5.x`) sont installées
- [ ] L'UI est accessible via `/applications/nommage/presentation/index.html`

---

## 8. Dépannage

### 8.1 Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `Module not found: mqtt` | Dépendance manquante | `pnpm add mqtt@5.x` |
| `Cannot find name 'mqtt'` | @types/mqtt manquant | `pnpm add -D @types/mqtt` |
| `No connection to MQTT broker` | Broker inaccessible | Vérifier host/port/firewall |
| `Invalid topic pattern` | Pattern MQTT invalide | Utiliser `+` ou `#` correctement |
| `Parsing failed: no '---'` | Format de nom invalide | Vérifier le format des messages |

### 8.2 Logs de Débogage

**Activer le mode debug :**
```yaml
nommage:
  logging:
    level: debug
    showRawMessages: true
    showParsedMessages: true
```

**Exemple de logs :**
```
[DEBUG] [NommageMqttIntegrationService] Message MQTT reçu - Topic: ha/sensor/temp/config
[DEBUG] [NommageMqttIntegrationService] Message de découverte brut: Température---Salon
[DEBUG] [NommageService] Message brut reçu: Température---Salon
[INFO] [NommageService] Message parsed: QUOI="Température" | LIEU="Salon"
[DEBUG] [NommageService] Parsed: {"quoi":{"raw":"Température","slug":"temperature"},"ou":{"lieu":{"raw":"Salon","slug":"salon"}}}
```

### 8.3 Vérification de la Connexion MQTT

```bash
# Vérifier que le client MQTT est connecté
mosquitto_sub -h localhost -t "#" -v

# Vérifier les abonnements
mosquitto_sub -h localhost -t "$SYS/broker/subscriptions" -v
```

---

## 📚 Références

- [fonctionnelles-nommage_specs_v1.0.md](./fonctionnelles-nommage_specs_v1.0.md) - Spécifications fonctionnelles
- [techniques-socle-ha-mqtt_specs_v4.6.md](./techniques-socle-ha-mqtt_specs_v4.6.md) - Socle technique
- [guide-nouvelle-application_specs_v1.0.md](./guide-nouvelle-application_specs_v1.0.md) - Guide de création
- [nommage_specs_v1.0.md](./nommage_specs_v1.0.md) - Protocole de nommage
- [PROMPT_PROJET.md](../PROMPT_PROJET.md) - Règles générales

---

## 📅 Historique des Versions

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| **1.0.0** | 19/07/2026 | Mistral Vibe | Version initiale : Implémentation complète selon specs |

---

*Document généré par Mistral Vibe*
*Co-Authored-By: Mistral Vibe <vibe@mistral.ai>*
