# Spécifications — Démarrage/Arrêt Automatique MQTT et HA-WS
**Version : 1.0**
**Date : 12 Juillet 2026**
**Statut : Implémenté**
**Conformité : specs-techniques-socle-ha-mqtt-v4.3.md (architecture 5 couches)**

---

## 1. Introduction

Ce document décrit l'implémentation du **démarrage et arrêt automatique** de **MQTT** et **HA WebSocket (WS)** en fonction des flags `mqttEnable` et `ws_enable` de la configuration.

**Objectif principal** : Permettre à MQTT et HA-WS de démarrer ou de s'arrêter automatiquement selon la configuration, avec redémarrage dynamique lors des changements de configuration.

**Règle absolue** (conforme specs-architectural-patterns-v1.0.md §1.1) :
> Un module utilise **UN SEUL** de ces patterns. **Aucun module ne doit utiliser les deux simultanément**.

---

## 2. Contexte

### 2.1 Problématique
Auparavant, `IntegrationBridge` créait toujours un `HaMqttIntegrationService` au démarrage, indépendamment de la configuration. Cela posait plusieurs problèmes :
- **Ressources inutiles** : Le service MQTT était instancié même quand `mqttEnable: false`
- **Pas de redémarrage dynamique** : Modifier `mqttEnable` nécessitait un redémarrage manuel de l'application
- **Erreurs potentielles** : Appels à des méthodes MQTT alors que le service n'était pas disponible

### 2.2 Solution Implémentée
- **Création conditionnelle** : `haMqttService` n'est créé que si `mqttEnable: true`
- **Gestion dynamique** : Écoute de `config:save:result` pour redémarrer/arrêter MQTT
- **Reconnexion automatique** : Conservation des infos de connexion pour reconnexion
- **Sécurité** : Guards sur toutes les méthodes utilisant `haMqttService`

---

## 3. Modifications Architecturales

### 3.0 Résumé des Composants

| Composant | Fichier | Flag | Gestion dynamique |
|-----------|--------|------|-------------------|
| **MQTT** | IntegrationBridge | `mqttEnable` | ✅ Toggle + Reconnect |
| **HA-WS** | AppService | `ws_enable` | ✅ Toggle + Disconnect |

### 3.1 IntegrationBridge (`src/ha/integration/IntegrationBridge.ts`) - MQTT

#### 3.1.1 Interface de Configuration
```typescript
export interface IntegrationBridgeConfig {
  haMqtt: HaMqttModuleConfig;
  mqttEnable: boolean;        // Flag pour activer/désactiver MQTT
  modules: DomainModuleConfig[];
  configService?: ConfigService; // Optionnel : pour accéder à la config dynamiquement
}
```

#### 3.1.2 Propriétés Ajoutées
```typescript
private config: IntegrationBridgeConfig;
private configService?: ConfigService;
private mqttEnabled: boolean;
private isMqttConnected: boolean = false;
private mqttConnectionInfo?: {
  host: string;
  port: number;
  username?: string;
  password?: string;
};
```

#### 3.1.3 Comportement du Constructeur
```typescript
constructor(config: IntegrationBridgeConfig, eventBus?: EventBus, logger?: Logger) {
  // Initialisation
  this.config = config;
  this.mqttEnabled = config.mqttEnable;
  
  // Création conditionnelle du service MQTT
  if (this.mqttEnabled) {
    this.createMqttService();
    this.logger.info('bridge', 'MQTT est ACTIF (mqttEnable: true)');
  } else {
    this.logger.info('bridge', 'MQTT est DESACTIVE (mqttEnable: false)');
  }
  
  // Configuration des listeners
  this.setupConfigListeners();
}
```

#### 3.1.4 Méthodes Clés

**`createMqttService()`**
- Crée une nouvelle instance de `HaMqttIntegrationService`
- Réinitialise `isMqttConnected` à `false`

**`destroyMqttService()`**
- Déconnecte le service si connecté
- Détruit la référence au service

**`toggleMqtt(enable: boolean)`**
- Active/désactive MQTT dynamiquement
- Si activation : crée le service et reconnecte avec les infos sauvegardées
- Si désactivation : détruit le service

**`connect(host, port, username?, password?)`**
- Vérifie que `mqttEnabled === true` (sinon throw Error)
- Vérifie que `haMqttService` existe (sinon throw Error)
- Sauvegarde les infos de connexion dans `mqttConnectionInfo`
- Établit la connexion MQTT
- Met à jour `isMqttConnected`

**`disconnect()`**
- Vérifie que `haMqttService` existe avant de déconnecter
- Met à jour `isMqttConnected`

**`isMqttEnabled()`**
- Retourne l'état actuel de `mqttEnabled`

**`isConnected()`**
- Retourne `false` si MQTT est désactivé ou service non initialisé
- Retourne l'état de connexion réel sinon

**`getHaMqttService()`**
- Retourne `HaMqttIntegrationService | undefined` (optionnel)

#### 3.1.5 Gestion des Événements

**`setupConfigListeners()`**
```typescript
this.eventBus.onAll((event: any) => {
  if (event?.type === 'config:save:result') {
    this.handleConfigSaveResult(event.data as ConfigSaveResult);
  }
});
```

**`handleConfigSaveResult(result: ConfigSaveResult)`**
- Vérifie si la sauvegarde a réussi
- Si ConfigService est disponible, vérifie la nouvelle valeur de `mqttEnable`
- Si `mqttEnable` a changé, appelle `toggleMqtt(newValue)`

#### 3.1.6 Guards sur les Handlers
Tous les handlers qui utilisent `haMqttService` vérifient d'abord :
```typescript
if (!this.haMqttService || !this.mqttEnabled) {
  this.logger.debug('bridge', `MQTT désactivé - Ignore événement`);
  return;
}
```

Handlers concernés :
- `handleEntityDiscovered()`
- `handleEntityStateChanged()`
- `handleEntityRemoved()`
- `setupHaCommandListeners()`

### 3.2 EventBus (`src/infrastructure/EventBus.ts`)

Ajout du type `ConfigSaveEvent` pour supporter les événements de configuration :
```typescript
export interface ConfigSaveEvent {
  type: 'config:save:result';
  source: 'app';
  timestamp: Date;
  data: ConfigSaveResult;
}

export type EventBusEvent = 
  | EntityDiscoveryEvent
  | EntityStateChangeEvent
  | EntityRemovedEvent
  | DeviceConnectionEvent
  | CommandReceivedEvent
  | ConfigSaveEvent;
```

### 3.2 AppService (`src/application/AppService.ts`) - HA WebSocket

AppService gère maintenant le **démarrage/arrêt automatique de HA-WS** selon `ws_enable`.

#### 3.2.1 Propriétés Ajoutées
```typescript
private wsEnabled: boolean = false;        // Flag pour gérer l'état WS
private _isWsConnected: boolean = false;    // État de connexion WS
private wsConfig?: HaWsConfig;             // Configuration WS sauvegardée
```

#### 3.2.2 Initialisation
Dans le constructeur, AppService initialise l'état WS depuis la config :
```typescript
private initializeWsState(): void {
  const config = this.configService.getConfig();
  this.wsEnabled = config.ha?.ws_enable === true;
  this.wsConfig = config.ha?.ws;
  
  if (this.wsEnabled) {
    this.logger.info('AppService', 'HA WebSocket est ACTIF (ws_enable: true)');
  } else {
    this.logger.info('AppService', 'HA WebSocket est DESACTIVE (ws_enable: false)');
  }
}
```

#### 3.2.3 Méthodes Clés

**`toggleHaWs(enable: boolean, config?: HaWsConfig)`**
- Active/désactive HA WebSocket dynamiquement
- Si activation : démarre la connexion si le client existe
- Si désactivation : détruit le client proprement

**`destroyHaWsClient()`**
- Déconnecte le client si connecté
- Met à jour les états de connexion
- Supprime la référence au client

**`handleConfigSaveResultForWs(result: ConfigSaveResult)`**
- Écoute `config:save:result` via `eventBus.onGeneric`
- Vérifie si `ws_enable` a changé
- Appelle `toggleHaWs()` si changement détecté
- Pour les changements de config WS (host, port, token), un restart est nécessaire

#### 3.2.4 Intégration avec le Démarrage
Dans `start()` :
```typescript
// 4. Démarrer HA WebSocket (si configuré)
if (this.wsEnabled && this.haWsClient) {
  this.startHaWsClient();
}
```

#### 3.2.5 Gestion des Callback de Connexion
Dans `startHaWsClient()` :
```typescript
this.haWsClient.onConnect(() => {
  this.haConnected = true;
  this._isWsConnected = true;
  this.logger.info('AppService', 'Connecté à Home Assistant WebSocket');
  this.eventBus.emitGeneric('ha:connected', undefined);
});

this.haWsClient.onDisconnect((reason?: string) => {
  this.haConnected = false;
  this._isWsConnected = false;
  this.logger.warn('AppService', `Déconnecté de HA WebSocket: ${reason || 'inconnu'}`);
  this.eventBus.emitGeneric('ha:disconnected', undefined);
});
```

#### 3.2.6 Getters Publics
```typescript
isWsEnabled(): boolean        // Retourne l'état de ws_enable
isWsConnected(): boolean      // Retourne l'état de connexion
getHaWsClient(): HaWsClient | undefined  // Retourne le client
```

---

## 4. Correction de `requiredHaWs`

### 4.1 Problème
Le module RFXCOM avait `requiredHaWs: true` alors qu'il n'utilise que MQTT (pas WebSocket).

### 4.2 Correction
Dans `applications/rfxcom/domain/index.ts` :
```typescript
export const RFXCOM_APP: ApplicationModule = {
  id: 'rfxcom',
  name: 'RFXCOM',
  description: 'Intégration des devices RF433 (récepteurs 433 MHz)',
  icon: '📡',
  type: 'integration',
  configurable: true,
  socketEvents: RFXCOM_SOCKET_EVENTS,
  requiredMqtt: true,   // ✅ Nécessite MQTT
  requiredHaWs: false,  // ✅ Ne nécessite PAS HA WebSocket (corrigé)
};
```

### 4.3 Conformité
Conforme à `specs-architectural-patterns-v1.0.md` §6.1 :
- **Type** : `'integration'`
- **Technologie** : MQTT uniquement
- **`requiredMqtt`** : `true`
- **`requiredHaWs`** : `false`

---

## 5. Intégration avec le Socle

### 5.1 Architecture 5 Couches
L'implémentation respecte l'architecture :
- **Infrastructure** : EventBus, ConfigService
- **HA** : IntegrationBridge, HaMqttIntegrationService
- **Domain** : Modules (RFXCOM, etc.)

### 5.2 Flux de Données
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AppService    │────▶│  EventBus       │────▶│ IntegrationBridge │
│   (Application)  │     │  (Infrastructure)│     │      (HA)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ HaMqttIntegrationService│
                     │     (HA - Optionnel)   │
                     └───────────────────────┘
```

### 5.3 Décisions Automatiques
- **Au démarrage** : MQTT est activé/désactivé selon `config.mqttEnable`
- **Sur changement** : `config:save:result` déclenche `toggleMqtt()` si nécessaire
- **Reconnexion** : Les infos de connexion sont conservées pour reconnexion automatique

---

## 6. Scénarios d'Utilisation

### 6.1 Démarrage avec MQTT Activé
```typescript
const bridge = new IntegrationBridge({
  haMqtt: {
    moduleName: 'integration',
    clientId: 'ha-integration-bridge',
    cleanSession: false,
    keepalive: 60,
    reconnectPeriod: 5000
  },
  mqttEnable: true,  // ✅ MQTT activé
  modules: [{ moduleName: 'rfxcom' }],
  configService: new ConfigService()
});

bridge.initialize();

// Le service MQTT est déjà créé
console.log(bridge.isMqttEnabled()); // true
console.log(bridge.getHaMqttService()); // HaMqttIntegrationService

// Connexion
await bridge.connect('192.168.1.100', 1883);
console.log(bridge.isConnected()); // true
```

### 6.2 Démarrage avec MQTT Désactivé
```typescript
const bridge = new IntegrationBridge({
  haMqtt: {...},
  mqttEnable: false,  // ❌ MQTT désactivé
  modules: [{ moduleName: 'rfxcom' }]
});

bridge.initialize();

console.log(bridge.isMqttEnabled()); // false
console.log(bridge.getHaMqttService()); // undefined

// ❌ Impossible de se connecter
try {
  await bridge.connect('192.168.1.100', 1883);
} catch (error) {
  console.error(error.message); // "MQTT est désactivé (mqttEnable: false)"
}
```

### 6.3 Activation Dynamique de MQTT
```typescript
const bridge = new IntegrationBridge({
  haMqtt: {...},
  mqttEnable: false,
  modules: [{ moduleName: 'rfxcom' }],
  configService: new ConfigService()
});

// Plus tard, après un changement de config...
// AppService émet 'config:save:result' avec { success: true }
// IntegrationBridge écoute et détecte que mqttEnable est maintenant true

// Le bridge active MQTT automatiquement et se reconnecte
// avec les dernières infos de connexion sauvegardées
```

### 6.4 Désactivation Dynamique de MQTT
```typescript
// MQTT était activé et connecté...

// Après un changement de config où mqttEnable passe à false
// IntegrationBridge écoute 'config:save:result'
// et appelle toggleMqtt(false)

// Résultat :
// - Le service MQTT est détruit
// - La connexion est fermée proprement
// - Toutes les opérations MQTT sont ignorées
```

---

## 7. Journalisation (Logging)

Les événements clés sont journalisés avec le tag `'bridge'` :

| Niveau | Message | Condition |
|--------|---------|-----------|
| INFO | `MQTT est ACTIF (mqttEnable: true) - Service MQTT créé` | Démarrage avec mqttEnable: true |
| INFO | `MQTT est DESACTIVE (mqttEnable: false) - Service MQTT non créé` | Démarrage avec mqttEnable: false |
| INFO | `Activation de MQTT...` | toggleMqtt(true) |
| INFO | `Désactivation de MQTT...` | toggleMqtt(false) |
| INFO | `MQTT ACTIF` / `MQTT DESACTIVE` | État final après toggle |
| INFO | `Reconnexion MQTT avec les infos sauvegardées...` | Reconnection après activation |
| ERROR | `Erreur de reconnexion MQTT: {error}` | Échec de reconnexion |
| DEBUG | `MQTT désactivé - Ignore {événement}` | Événement ignoré |
| DEBUG | `Configuration sauvegardée - Vérification de mqttEnable...` | Réception config:saved |
| INFO | `mqttEnable a changé: false -> true` | Changement détecté |
| INFO | `HA WebSocket est ACTIF (ws_enable: true)` | Démarrage avec ws_enable: true |
| INFO | `HA WebSocket est DESACTIVE (ws_enable: false)` | Démarrage avec ws_enable: false |
| INFO | `Activation de HA WebSocket...` | toggleHaWs(true) |
| INFO | `Désactivation de HA WebSocket...` | toggleHaWs(false) |
| INFO | `HA WebSocket ACTIF` / `HA WebSocket DESACTIVE` | État final après toggle |
| DEBUG | `Configuration sauvegardée - Vérification de ws_enable...` | Réception config:saved |
| INFO | `ws_enable a changé: false -> true` | Changement détecté |

---

## 8. Tests et Vérification

### 8.1 Vérification TypeScript
```bash
npx tsc --noEmit --skipLibCheck
# Doit retourner 0 erreurs
```

### 8.2 Scénarios à Tester

| Scénario | mqttEnable | Action | Résultat Attendu |
|----------|------------|--------|------------------|
| 1 | true | `new IntegrationBridge()` | Service MQTT créé |
| 2 | false | `new IntegrationBridge()` | Service MQTT non créé |
| 3 | true | `bridge.connect()` | Connexion établie |
| 4 | false | `bridge.connect()` | Erreur throw |
| 5 | false→true | config changed | Service créé + reconnexion |
| 6 | true→false | config changed | Service détruit + déconnexion |
| 7 | true | Événement entité | Traité par MQTT |
| 8 | false | Événement entité | Ignoré (log debug) |

### 8.3 Backups Créés
- `/backups/src/ha/integration/IntegrationBridge.ts_backup_2026-07-12-v2.ts`
- `/backups/src/ha/integration/IntegrationBridge.ts_backup_2026-07-12.ts`
- `/backups/src/infrastructure/EventBus.ts_backup_2026-07-12.ts`
- `/backups/src/application/AppService.ts_backup_2026-07-12.ts`
- `/backups/src/application/AppService.ts_backup_2026-07-12-v2.ts`

---

## 9. Notes d'Implémentation

### 9.1 Décisions Techniques

1. **Utilisation de `onGeneric`** : AppService utilise `src/application/EventBus.ts` (basé sur EventEmitter) qui n'a pas de méthode `onAll`. Donc on utilise `onGeneric('config:save:result', ...)` pour écouter les changements de configuration.

2. **Reconnexion Automatique (MQTT)** : Les infos de connexion (host, port, credentials) sont conservées dans `mqttConnectionInfo` pour permettre une reconnexion automatique quand MQTT est réactivé.

3. **Sécurité des Guards** : Toutes les méthodes utilisant `haMqttService` (MQTT) ou `haWsClient` (WS) vérifient d'abord qu'ils sont disponibles.

4. **État de Connexion** : `isMqttConnected` et `_isWsConnected` sont gérés séparément des flags `mqttEnabled` et `wsEnabled` pour distinguer "activé mais non connecté" de "désactivé".

5. **Différence MQTT vs WS** :
   - **MQTT** (IntegrationBridge) : Géré au niveau du pont d'intégration, peut être recréé dynamiquement
   - **WS** (AppService) : Géré au niveau de l'application, nécessite un restart pour les changements de config (host/port/token) car le client est injecté via le constructeur

### 9.2 Limitations Connues

1. **ConfigService Optionnel** (MQTT) : Sans `configService` dans la config, IntegrationBridge ne peut pas vérifier dynamiquement les changements de `mqttEnable`. Il dépend de l'événement `config:save:result`.

2. **AppService Émission** : AppService utilise `emit('config:save:result', data)` au lieu de `emit({type: 'config:save:result', ...})`. Une future amélioration serait de standardiser l'émission des événements.

3. **Changement de config WS** : Les changements de `ha.ws.host`, `ha.ws.port`, ou `ha.ws.token` nécessitent un **restart de l'application** pour être pris en compte, car HaWsClient est injecté via le constructeur d'AppService et ne peut pas être recréé dynamiquement.

4. **Deux EventBus** : Il existe deux implémentations d'EventBus dans le codebase :
   - `src/application/EventBus.ts` (basé sur EventEmitter, utilisé par AppService)
   - `src/infrastructure/EventBus.ts` (typé fort, avec onAll, utilisé par IntegrationBridge)
   Cette dualité pourrait être simplifiée à l'avenir.

### 9.3 Améliorations Futures

1. **Événement Typé** : Modifier AppService pour émettre des `EventBusEvent` complets.
2. **ConfigService Obligatoire** : Rendre `configService` obligatoire dans `IntegrationBridgeConfig` pour une détection fiable des changements.
3. **Événement Spécifique** : Créer un événement dédié `mqtt:toggle` au lieu d'utiliser `config:save:result`.

---

## 10. Historique des Versions

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| 1.0 | 12/07/2026 | Mistral Vibe | Implémentation initiale |

---

*Ce document doit être lu avec `specs-architectural-patterns-v1.0.md` et `specs-techniques-socle-ha-mqtt-v4.3.md`.*
