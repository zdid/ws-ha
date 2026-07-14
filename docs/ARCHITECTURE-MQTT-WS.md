# Architecture MQTT et WebSocket - Documentation Technique

## Sommaire

1. [Introduction](#introduction)
2. [Architecture en 5 Couches](#architecture-en-5-couches)
3. [Gestion MQTT Automatique](#gestion-mqtt-automatique)
4. [Gestion WebSocket Automatique](#gestion-websocket-automatique)
5. [Configuration RFXCOM](#configuration-rfxcom)
6. [Points d'Attention](#points-dattention)

---

## Introduction

Ce document décrit l'architecture et les mécanismes de gestion automatique des connexions MQTT et WebSocket dans le socle HA-MQTT. Il explique comment les modules s'intègrent avec Home Assistant via MQTT et/ou WebSocket.

### Version
**v1.0** - 12 juillet 2026

---

## Architecture en 5 Couches

L'application suit une architecture en 5 couches strictement séparées :

```
┌─────────────────────────────────────────┐
│            5. Présentation                 │  (UI Web)
├─────────────────────────────────────────┤
│            4. Application                  │  (Orchestration)
├─────────────────────────────────────────┤
│            3. Domaine                       │  (Métier - RFXCOM)
├─────────────────────────────────────────┤
│            2. Infrastructure                │  (Config, Logger, EventBus)
├─────────────────────────────────────────┤
│            1. Intégration HA               │  (MQTT, WebSocket)
└─────────────────────────────────────────┘
```

### Rôle de chaque couche :

- **Intégration HA (Couche 1)** : Communication avec Home Assistant via MQTT et WebSocket
  - `HaMqttIntegrationService` : Service MQTT pour l'intégration HA
  - `HaWsClient` : Client WebSocket pour HA
  - `IntegrationBridge` : Pont entre les modules domaine et HA

- **Infrastructure (Couche 2)** : Services transverses
  - `ConfigService` : Gestion centralisée de la configuration
  - `EventBus` : Bus d'événements pour la communication inter-couches
  - `Logger` : Journalisation
  - `AppConfigProvider` : Fournisseur de configuration par application

- **Domaine (Couche 3)** : Logique métier spécifique à chaque application
  - `RfxComService` : Service métier pour RFXCOM
  - `RfxComConfigService` : Configuration spécifique RFXCOM

- **Application (Couche 4)** : Orchestration
  - `AppService` : Détection des modules, gestion du cycle de vie
  - `SocketBridge` : Communication avec l'UI
  - `RestartManager` : Gestion des redémarrages

- **Présentation (Couche 5)** : Interface utilisateur
  - Pages HTML et composants Alpine.js

---

## Gestion MQTT Automatique

### Principe

Le service MQTT **démarre et s'arrête automatiquement** en fonction de la configuration `mqtt_enable`. Cette fonctionnalité est implémentée dans `IntegrationBridge`.

### Configuration

```yaml
# Dans config.yaml
ha:
  mqtt_enable: true  # Active/désactive MQTT
  mqtt:
    host: "192.168.1.100"
    port: 1883
    client_id: "ha-integration-bridge"
    username: "user"  # Optionnel
    password: "pass"  # Optionnel
    keepalive: 60
    reconnect_delay: 5
```

### Mécanisme

1. **Au démarrage** : `IntegrationBridge` vérifie `mqttEnable` dans sa configuration
   - Si `true` → crée `HaMqttIntegrationService`
   - Si `false` → ne crée pas le service (aucune tentative de connexion)

2. **Sur changement de configuration** : `IntegrationBridge` écoute les événements `config:save:result`
   - Si `mqttEnable` passe de `false` → `true` :
     - Crée le service MQTT
     - Tente de se connecter avec les informations sauvegardées
   - Si `mqttEnable` passe de `true` → `false` :
     - Détruit le service MQTT
     - Se déconnecte proprement

3. **Reconnexion automatique** : Les informations de connexion (host, port, credentials) sont sauvegardées et réutilisées lors de l'activation.

### Code Clé

```typescript
// IntegrationBridge.ts

// Initialisation
if (this.mqttEnabled) {
  this.createMqttService();
  this.logger.info('bridge', 'MQTT est ACTIF (mqttEnable: true)');
} else {
  this.logger.info('bridge', 'MQTT est DESACTIVE (mqttEnable: false)');
}

// Sur changement de config
private handleConfigSaveResult(result: ConfigSaveResult): void {
  if (!result.success) return;
  
  if (this.configService) {
    const currentConfig = this.configService.getConfig();
    const newMqttEnable = currentConfig?.mqttEnable ?? this.config.mqttEnable;
    
    if (newMqttEnable !== this.mqttEnabled) {
      this.logger.info('bridge', `mqttEnable a changé: ${this.mqttEnabled} -> ${newMqttEnable}`);
      this.toggleMqtt(newMqttEnable);
    }
  }
}

// Activation/Désactivation dynamique
private toggleMqtt(enable: boolean): void {
  if (enable === this.mqttEnabled) return;
  
  this.mqttEnabled = enable;
  
  if (enable) {
    this.logger.info('bridge', 'Activation de MQTT...');
    this.createMqttService();
    
    // Reconnexion automatique si infos disponibles
    if (this.mqttConnectionInfo) {
      this.connect(
        this.mqttConnectionInfo.host,
        this.mqttConnectionInfo.port,
        this.mqttConnectionInfo.username,
        this.mqttConnectionInfo.password
      ).catch(error => {
        this.logger.error('bridge', `Erreur de reconnexion MQTT: ${error}`);
      });
    }
  } else {
    this.logger.info('bridge', 'Désactivation de MQTT...');
    this.destroyMqttService();
  }
}
```

### États Possibles

| État | `mqttEnable` | Service Créé | Connecté | Description |
|------|--------------|---------------|----------|-------------|
| Désactivé | `false` | ❌ Non | ❌ Non | MQTT complètement désactivé |
| Prêt | `true` | ✅ Oui | ❌ Non | Service créé, attente de connexion |
| Connecté | `true` | ✅ Oui | ✅ Oui | Fonctionnel |
| Erreur | `true` | ✅ Oui | ❌ Non | Tentative de reconnexion |

---

## Gestion WebSocket Automatique

### Principe

De manière similaire à MQTT, le client WebSocket **démarre et s'arrête automatiquement** en fonction de la configuration `ws_enable`. Cette fonctionnalité est implémentée dans `AppService`.

### Configuration

```yaml
# Dans config.yaml
ha:
  ws_enable: true  # Active/désactive WebSocket
  ws:
    host: "192.168.1.100"
    port: 8123
    token: "eyJ0eXAiOiJKV1Qi..."  # Long-Lived Access Token
    reconnect_delay: 5
```

### Mécanisme

1. **Au démarrage** : `AppService` vérifie `ws_enable` dans la configuration
   - Si `true` → démarre `HaWsClient` (si disponible)
   - Si `false` → ne démarre pas le client

2. **Sur changement de configuration** : `AppService` écoute les événements `config:save:result`
   - Si `ws_enable` passe de `false` → `true` :
     - Active le flag `wsEnabled`
     - Démarre le client (si disponible)
   - Si `ws_enable` passe de `true` → `false` :
     - Désactive le flag `wsEnabled`
     - Détruit le client

3. **Note importante** : Le client `HaWsClient` est injecté via le constructeur d'`AppService`. Une modification de la configuration WS nécessite un **restart de l'application** pour recréer le client avec la nouvelle configuration.

### Code Clé

```typescript
// AppService.ts

// Initialisation
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

// Sur changement de config
private handleConfigSaveResultForWs(result: ConfigSaveResult): void {
  if (!result.success) return;
  
  const currentConfig = this.configService.getConfig();
  const newWsEnable = currentConfig.ha?.ws_enable === true;
  const newWsConfig = currentConfig.ha?.ws;
  
  if (newWsEnable !== this.wsEnabled) {
    this.logger.info('AppService', `ws_enable a changé: ${this.wsEnabled} -> ${newWsEnable}`);
    this.toggleHaWs(newWsEnable, newWsConfig);
  } else if (newWsEnable && newWsConfig !== this.wsConfig) {
    // Config WS modifiée - restart nécessaire
    this.logger.info('AppService', 'Configuration WS mise à jour - Restart nécessaire');
    this.wsConfig = newWsConfig;
    this.restartManager.scheduleRestart();
  }
}

// Activation/Désactivation dynamique
private toggleHaWs(enable: boolean, config?: HaWsConfig): void {
  if (enable === this.wsEnabled) return;
  
  this.wsEnabled = enable;
  
  if (enable) {
    this.logger.info('AppService', 'Activation de HA WebSocket...');
    if (config) this.wsConfig = config;
    if (this.haWsClient) this.startHaWsClient();
  } else {
    this.logger.info('AppService', 'Désactivation de HA WebSocket...');
    this.destroyHaWsClient();
  }
}
```

---

## Configuration RFXCOM

### Module RFXCOM

Le module RFXCOM est une **intégration** qui utilise **uniquement MQTT** pour communiquer avec Home Assistant.

### Déclaration du Module

```typescript
// src/applications/rfxcom/domain/index.ts

export const RFXCOM_APP: ApplicationModule = {
  id: 'rfxcom',
  name: 'RFXCOM',
  description: 'Intégration des devices RF433 (récepteurs 433 MHz)',
  icon: '📡',
  type: 'integration',
  configurable: true,
  socketEvents: RFXCOM_SOCKET_EVENTS,
  requiredMqtt: true,   // ⚠️ Nécessite MQTT
  requiredHaWs: false, // ❌ Ne nécessite PAS WebSocket
};
```

### Points Importants

| Propriété | Valeur | Explication |
|-----------|--------|-------------|
| `type` | `'integration'` | Module d'intégration HA |
| `requiredMqtt` | `true` | **Doit** avoir MQTT configuré |
| `requiredHaWs` | `false` | **N'utilise pas** WebSocket |
| `configurable` | `true` | A une configuration spécifique |

### ⚠️ Correction Importante (v4.3)

**Avant (ERREUR)** :
```typescript
requiredHaWs: true  // ❌ Incorrect - RFXCOM n'utilise pas WS
```

**Après (CORRIGÉ)** :
```typescript
requiredHaWs: false  // ✅ Correct - RFXCOM utilise MQTT uniquement
```

Cette correction empêche le module RFXCOM d'être marqué comme nécessitant WebSocket alors qu'il n'en a pas besoin.

### Intégration avec l'Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AppService (Couche 4)                         │
│                                                                  │
│  ┌─────────────────────┐         ┌─────────────────────┐    │
│  │   IntegrationBridge   │         │    HaWsClient        │    │
│  │   (Couche 1)         │         │    (Désactivé)        │    │
│  │  ┌───────────────┐   │         │                     │    │
│  │  │ HaMqttService  │◄──┼─────────┼  requiredMqtt: true │    │
│  │  │ (ACTIF)        │   │         │  requiredHaWs: false│    │
│  │  └───────────────┘   │         │                     │    │
│  └─────────────────────┘         └─────────────────────┘    │
│          ▲                                                     │
│          │                                                     │
│  ┌──────┴──────┐                                              │
│  │ RfxComService │ (Couche 3)                                 │
│  │   (MQTT)     │◄────────── Émet des événements MQTT         │
│  └─────────────┘                                                    │
└─────────────────────────────────────────────────────────────┘
```

### Configuration Spécifique RFXCOM

```yaml
# Dans config.yaml
rfxcom:
  # Configuration des récepteurs RF433
  receivers:
    - id: "rfxcom_001"
      name: "Récepteur RFXCOM Principal"
      protocol: "rfxcom"
      # ...
  
  # Configuration des devices
  devices:
    - id: "temp_001"
      name: "Capteur Température Salon"
      receiver_id: "rfxcom_001"
      # ...
  
  # Configuration des scènes
  scenes:
    - id: "scene_soir"
      name: "Ambiance Soir"
      # ...
```

---

## Points d'Attention

### 1. Séparation MQTT / WebSocket

| Application | Type | MQTT | WebSocket | Utilisation |
|------------|------|------|-----------|-------------|
| RFXCOM | `integration` | ✅ **Oui** | ❌ Non | Intégration MQTT uniquement |
| Future App | `?` | ? | ? | À définir |

**Règle** : Une application doit utiliser **soit MQTT, soit WebSocket**, mais pas les deux simultanément pour la même fonctionnalité.

### 2. Restart Automatique

- **MQTT** : Le service peut être recréé dynamiquement sans restart de l'application
- **WebSocket** : Une modification de la configuration nécessite un **restart** de l'application

### 3. Validation de Configuration

`AppService` valide la configuration au démarrage et émet des événements :
- `config:current` : Configuration actuelle
- `config:validation:result` : Résultat de validation (erreurs, warnings)

### 4. Détection des Modules

`AppService` détecte automatiquement les modules dans `src/applications/` ou `dist/applications/` :
- Recherche les répertoires avec `domain/index.ts` ou `domain/index.js`
- Charge le module et cherche la constante `*APP` (ex: `RFXCOM_APP`)
- Vérifie les prérequis (`requiredMqtt`, `requiredHaWs`)

### 5. Gestion des Erreurs

- Les erreurs de connexion MQTT/WS sont loggées et gérées avec des tentatives de reconnexion
- Les modules sont marqués avec un statut : `configured`, `partial`, `missing`, `error`
- L'UI affiche ces statuts visuellement

---

## Diagramme de Flux

### MQTT Auto Start/Stop

```
┌─────────────┐    mqtt_enable    ┌──────────────┐
│   Config     │─────────────────►│ Integration   │
│   modifié    │    (change)      │   Bridge      │
└─────────────┘                  └──────┬───────┘
                                     │
                  ┌──────────────────┴──────────────────┐
                  │                                     │
                  ▼                                     ▼
         ┌──────────────────┐              ┌──────────────────┐
         │ toggleMqtt(true)  │              │ toggleMqtt(false)│
         │                  │              │                  │
         │ - createService() │              │ - destroyService()
         │ - connect()       │              │ - disconnect()   │
         └──────────────────┘              └──────────────────┘
                  │                                     │
                  ▼                                     ▼
         ┌──────────────────┐              ┌──────────────────┐
         │ Service MQTT     │              │ Service MQTT     │
         │ CRÉÉ + CONNECTÉ  │              │ DÉTRUIT          │
         └──────────────────┘              └──────────────────┘
```

### WS Auto Start/Stop

```
┌─────────────┐    ws_enable     ┌──────────────┐
│   Config     │─────────────────►│   AppService   │
│   modifié    │    (change)      │              │
└─────────────┘                  └──────┬───────┘
                                     │
                  ┌──────────────────┴──────────────────┐
                  │                                     │
                  ▼                                     ▼
         ┌──────────────────┐              ┌──────────────────┐
         │ toggleHaWs(true)  │              │ toggleHaWs(false)│
         │                  │              │                  │
         │ - startClient()  │              │ - destroyClient()│
         │   (si client     │              │   (si connecté)  │
         │    disponible)   │              │                  │
         └──────────────────┘              └──────────────────┘
                  │                                     │
                  ▼                                     ▼
         ┌──────────────────┐              ┌──────────────────┐
         │ HaWsClient       │              │ HaWsClient       │
         │ CONNECTÉ         │              │ DÉCONNECTÉ       │
         └──────────────────┘              └──────────────────┘
```

---

## Références

- [Spécifications Techniques Socle HA-MQTT v4.3](../specs/current/specs-techniques-socle-ha-mqtt-v4.3.md)
- [Spécifications Présentation v2.0](../specs/current/specs-presentation-v1.0.md)
- [Implémentation MQTT Auto](../specs/current/specs-integrationbridge-mqtt-auto-v1.0.md)
- [Patterns Architecturaux](../specs/current/specs-architectural-patterns-v1.0.md)

---

*Document généré le 12 juillet 2026 - Compatible avec socle HA-MQTT v4.3*
