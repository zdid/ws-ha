# Spécifications Techniques d'Implémentation - Module RFXCOM

*Version 1.2 - 17 Juillet 2026*
*Intègre la bibliothèque npm `rfxcom` v2.6.2 pour la communication avec le transceiver RFXtrx433*
*Démarrage automatique via AppService avec reconnexion sur changement de configuration, injection unifiée d'IAppConfigProvider, et traces détaillées*

---

## 📌 Table des Matières
1. [Introduction](#1-introduction)
2. [Architecture de l'Implémentation](#2-architecture-de-limplémentation)
3. [Intégration de la Bibliothèque rfxcom](#3-intégration-de-la-bibliothèque-rfxcom)
4. [Gestion du Transceiver RFXCOM](#4-gestion-du-transceiver-rfxcom)
5. [Détection et Classification des Devices](#5-détection-et-classification-des-devices)
6. [Exécution des Commandes](#6-exécution-des-commandes)
7. [Mappage des Protocoles](#7-mappage-des-protocoles)
8. [Gestion des Événements](#8-gestion-des-événements)
9. [Configuration Requise](#9-configuration-requise)
10. [Gestion des Erreurs](#10-gestion-des-erreurs)
11. [Séquence de Démarrage/Arrêt](#11-séquence-de-démarragearrêt)
12. [Tests et Validation](#12-tests-et-validation)
13. [Limites et Contraintes](#13-limites-et-contraintes)
14. [Annexes](#14-annexes)

---

## 1. Introduction

### 1.1 Objectif
Ce document décrit l'implémentation technique du module RFXCOM utilisant la bibliothèque npm `rfxcom` pour communiquer avec le transceiver RFXtrx433.

### 1.2 Périmètre
- **Inclus** :
  - Intégration de la bibliothèque `rfxcom` npm
  - Initialisation du transceiver RFXCOM
  - Détection et classification des devices RF433
  - Exécution des commandes via les transmitters
  - Mappage entre les événements rfxcom et le modèle interne
  
- **Exclus** :
  - Configuration matérielle du transceiver
  - Gestion du port série au niveau OS
  - Configuration MQTT et HA WebSocket (décrites dans [specs-techniques-socle-ha-mqtt-v4.3.md](specs-techniques-socle-ha-mqtt-v4.3.md))

### 1.3 Prérequis
- Node.js >= 14.21.2 (requis par rfxcom)
- NPM package `rfxcom` v2.6.2 installé
- NPM package `serialport` v11.0.0+ (dépendance de rfxcom)
- Transceiver RFXtrx433 connecté via port série (ex: `/dev/ttyACM0`)

### 1.4 Référentiels
- **⭐ [specs-fonctionnelles-rfxcom-v5.0.md](specs-fonctionnelles-rfxcom-v5.0.md)** - Spécifications fonctionnelles principales
- **⭐ [specs-techniques-socle-ha-mqtt-v4.3.md](specs-techniques-socle-ha-mqtt-v4.3.md)** - Socle technique
- **⭐ [spec-nommage-v1.0.md](spec-nommage-v1.0.md)** - Règles de nommage
- **⭐ [specs-recepteurs-emetteurs-rfxcom-v5.0.md](specs-recepteurs-emetteurs-rfxcom-v5.0.md)** - Récepteurs et émetteurs

---

## 2. Architecture de l'Implémentation

### 2.1 Diagramme d'Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    RfxComService                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  - devices: Map<string, RfxComDevice>                     │ │
│  │  - receivers: Map<string, RfxComReceiver>                │ │
│  │  - scenes: Map<string, RfxComScene>                       │ │
│  │  - transceiver?: RfxCom                                  │ │
│  │  - isConnected: boolean                                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Utilise
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Bibliothèque rfxcom                          │
│  (npm package v2.6.2)                                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  RfxCom Class                                             │ │
│  │  - new RfxCom(port, options)                            │ │
│  │  - initialise(callback)                                  │ │
│  │  - close()                                               │ │
│  │  - EventEmitter: device, receive, connect, disconnect    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Transmitter Classes (Lighting1, Lighting2, ...)         │ │
│  │  - switchOn(deviceId, ...)                              │ │
│  │  - switchOff(deviceId, ...)                             │ │
│  │  - setLevel(deviceId, level)                            │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────────┬───────────────────┐
              ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   EventBus      │ │ ConfigService   │ │    Logger       │
│   - emit()      │ │   - getConfig() │ │   - info()     │
│   - on()        │ │   - saveConfig()│ │   - error()    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 2.2 Composants Principaux

| Composant | Fichier | Responsabilité |
|-----------|---------|----------------|
| `RfxComService` | `applications/rfxcom/domain/RfxComService.ts` | Orchestration principale |
| `RfxComConfigService` | `applications/rfxcom/domain/RfxComConfigService.ts` | Gestion de la configuration RFXCOM |
| `rfxcom.d.ts` | `src/types/rfxcom.d.ts` | Déclarations TypeScript pour la bibliothèque |

### 2.3 Flux de Données

```
Transceiver RFXCOM
        │
        ▼
┌───────────────────────┐
│   Événements rfxcom     │◄───┐
│   - device              │   │
│   - receive            │   │
│   - connect/disconnect  │   │
└───────────────────────┘   │
        │                   │
        ▼                   │
┌───────────────────────┐   │
│ RfxComService          │   │
│ - handleRfxComDeviceEvent()│───┘
│ - mapRfxComProtocolToDeviceType()
│ - handleDeviceDetected()
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│   EventBus             │
│   - DEVICE_DETECTED    │
│   - DEVICES_LIST        │
│   - STATUS             │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│   UI / Socket.io        │
└───────────────────────┘
```

---

## 3. Intégration de la Bibliothèque rfxcom

### 3.1 Installation

```bash
# Installer la bibliothèque et ses dépendances
npm install rfxcom
# serialport est installé automatiquement comme dépendance
```

### 3.2 Import et Typage

**Fichier**: `applications/rfxcom/domain/RfxComService.ts`

```typescript
// Import de la bibliothèque
import * as rfxcom from 'rfxcom';

// Import des types personnalisés
import type { RfxCom as RfxComType, RfxComDeviceEvent } from '../../../types/rfxcom';
```

### 3.3 Déclarations TypeScript

**Fichier**: `src/types/rfxcom.d.ts`

Ce fichier contient toutes les déclarations TypeScript pour la bibliothèque `rfxcom` :

- Classe `RfxCom` avec constructeur, méthodes et propriétés
- Classe `Transmitter` et toutes ses sous-classes (Lighting1, Lighting2, Blinds1, etc.)
- Interfaces pour les événements (RfxComDeviceEvent, TemperatureEvent, etc.)
- Constantes des subtypes (lighting1, lighting2, security1, etc.)
- Constantes des protocoles et codes de réponse

---

## 4. Gestion du Transceiver RFXCOM

### 4.1 Propriété du Transceiver

```typescript
private transceiver?: RfxComType;
```

Le transceiver est optionnel et n'est instancié qu'après appel à `initializeTransceiver()`.

### 4.2 Initialisation

**Méthode**: `initializeTransceiver()`

```typescript
private async initializeTransceiver(): Promise<void> {
  const config = this.configService.getConfig();
  const rfxcomConfig = config.rfxcom as RfxComConfig;
  
  if (!rfxcomConfig) {
    throw new Error('Configuration RFXCOM non trouvée');
  }

  // Création de l'instance
  this.transceiver = new rfxcom.RfxCom(rfxcomConfig.serialPort, {
    debug: this.logger.getLevel() === 'debug',
    deviceParameters: rfxcomConfig.deviceParameters || {},
    concurrency: 3,
    timeout: 12000,
  });

  // Configuration des écouteurs d'événements
  this.setupTransceiverEventListeners();

  // Initialisation avec callback
  await new Promise<void>((resolve, reject) => {
    this.transceiver!.initialise((error?: Error) => {
      if (error) {
        this.logger.error('RfxComService', `Erreur: ${error.message}`);
        this.isConnected = false;
        reject(error);
      } else {
        this.logger.info('RfxComService', `Transceiver initialisé sur ${rfxcomConfig.serialPort}`);
        this.isConnected = true;
        this.emitStatus();
        resolve();
      }
    });
  });
}
```

**Paramètres d'initialisation** :

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `device` | string | - | Chemin du port série (ex: `/dev/ttyACM0`) |
| `options.debug` | boolean | false | Activer les logs de débogage |
| `options.deviceParameters` | object | {} | Paramètres spécifiques au device |
| `options.concurrency` | number | 3 | Nombre de commandes simultanées |
| `options.timeout` | number | 12000 | Timeout de transmission (ms) |

### 4.3 Configuration des Écouteurs

**Méthode**: `setupTransceiverEventListeners()`

```typescript
private setupTransceiverEventListeners(): void {
  if (!this.transceiver) return;

  // Réception de messages bruts
  this.transceiver.on('receive', (data: Buffer | number[]) => {
    this.logger.debug('RfxComService', `Message reçu: ${rfxcom.RfxCom.dumpHex(data as number[])}`);
  });

  // Détection de devices
  this.transceiver.on('device', (event: RfxComDeviceEvent) => {
    this.logger.debug('RfxComService', `Événement device: ${JSON.stringify(event)}`);
    this.handleRfxComDeviceEvent(event);
  });

  // Connexion
  this.transceiver.on('connect', () => {
    this.logger.info('RfxComService', 'Transceiver connecté');
    this.isConnected = true;
    this.emitStatus();
  });

  // Déconnexion
  this.transceiver.on('disconnect', (error?: Error) => {
    this.logger.warn('RfxComService', `Transceiver déconnecté: ${error?.message || 'inconnu'}`);
    this.isConnected = false;
    this.emitStatus();
  });

  // Erreurs
  this.transceiver.on('error', (error: Error) => {
    this.logger.error('RfxComService', `Erreur: ${error.message}`);
    this.emitError(createRfxComError(
      'RFXCOM_CONNECTION_ERROR',
      error.message,
      'rfxcom:transceiver',
      { error: error.message }
    ));
  });

  // Statut
  this.transceiver.on('status', (status: unknown) => {
    this.logger.debug('RfxComService', `Statut: ${JSON.stringify(status)}`);
  });

  // Prêt à recevoir/émettre
  this.transceiver.on('ready', () => {
    this.logger.info('RfxComService', 'Transceiver prêt');
    this.isConnected = true;
    this.emitStatus();
  });

  // Réponses aux commandes
  this.transceiver.on('response', (response: string, seqnbr: number, code: number) => {
    this.logger.debug('RfxComService', `Réponse: ${response}, seq=${seqnbr}, code=${code}`);
  });
}
```

**Événements rfxcom** :

| Événement | Description | Payload |
|-----------|-------------|---------|
| `receive` | Message RFXCOM brut reçu | `Buffer \| number[]` |
| `device` | Device détecté | `RfxComDeviceEvent` |
| `connect` | Connexion établie | - |
| `disconnect` | Connexion perdue | `Error?` |
| `error` | Erreur matérielle | `Error` |
| `status` | Statut du transceiver | `StatusMessageEvent` |
| `ready` | Prêt à transmettre | - |
| `response` | Réponse à une commande | `string, number, number` |

### 4.4 Fermeture

**Méthode**: `stop()`

```typescript
async stop(): Promise<void> {
  this.logger.info('RfxComService', 'Arrêt du service RFXCOM...');
  
  if (this.transceiver) {
    try {
      this.transceiver.close();
      this.logger.info('RfxComService', 'Transceiver déconnecté');
    } catch (error) {
      this.logger.error('RfxComService', `Erreur: ${error}`);
    }
    this.transceiver = undefined;
  }
  
  this.isConnected = false;
  this.emitStatus();
  this.logger.info('RfxComService', 'Service RFXCOM arrêté');
}
```

---

## 5. Détection et Classification des Devices

### 5.1 Flux de Détection

```
Transceiver RFXCOM
        │
        ▼ (événement 'device')
┌───────────────────────┐
│   RfxComDeviceEvent     │
│   - id: string          │
│   - subtype: number      │
│   - packetType: number   │
│   - deviceStatus?: number│
│   - rssi?: number       │
│   - battery?: number     │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│ handleRfxComDeviceEvent()│
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│   Mapping vers         │
│   RfxComDevice         │
│   - id: rfxcom_<id>    │
│   - deviceId: <id>     │
│   - type:DeviceType    │
│   - protocol:Protocol  │
│   - state:DeviceState  │
│   - rssi: number       │
│   - lastSeen: ISO8601  │
│   - quoi: string       │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│ handleDeviceDetected()  │
│ - Vérification existence│
│ - Mise à jour ou ajout  │
│ - Émission DEVICE_DETECTED│
└───────────────────────┘
```

### 5.2 Mappage des Protocoles

**Méthode**: `mapRfxComProtocolToDeviceType(packetType: number): RfxComDeviceType`

```typescript
private mapRfxComProtocolToDeviceType(packetType: number): RfxComDeviceType {
  const lightingTypes = [0x10, 0x11, 0x13, 0x14, 0x15, 0x16];
  const switchTypes = [0x12];
  const blindTypes = [0x19, 0x31];
  const sensorTypes = [0x50, 0x51, 0x52, 0x54, 0x55, 0x56, 0x57, 0x40, 0x42];
  const thermostatTypes = [0x40, 0x42, 0x4e, 0x4f];

  if (lightingTypes.includes(packetType)) return 'light';
  if (switchTypes.includes(packetType)) return 'switch';
  if (blindTypes.includes(packetType)) return 'cover';
  if (sensorTypes.includes(packetType)) return 'sensor';
  if (thermostatTypes.includes(packetType)) return 'thermostat';

  return 'sensor';
}
```

**Mappage Packet Type → Protocol** :

| Packet Type (hex) | Protocol | Device Type |
|-------------------|----------|-------------|
| 0x10 | lighting1 | light |
| 0x11 | lighting2 | light |
| 0x12 | switch1 | switch |
| 0x13 | lighting4 | light |
| 0x14 | lighting5 | light |
| 0x15 | lighting6 | light |
| 0x19 | blinds1 | cover |
| 0x30 | blinds3 | cover |
| 0x31 | blinds2 | cover |
| 0x40 | thermostat1 | thermostat |
| 0x42 | thermostat3 | thermostat |
| 0x50 | sensor1 | sensor |
| 0x51 | sensor1 | sensor |
| 0x52 | sensor1 | sensor |

### 5.3 Enrichissement des Métadonnées

**Méthode**: `enrichDeviceFromPacketType(device: Partial<RfxComDevice>, event: RfxComDeviceEvent)`

```typescript
private enrichDeviceFromPacketType(device: Partial<RfxComDevice>, event: RfxComDeviceEvent): void {
  switch (event.packetType) {
    case 0x50: // Temperature sensor
      device.quoi = 'Température';
      break;
    case 0x51: // Humidity sensor
      device.quoi = 'Humidité';
      break;
    case 0x52: // Temperature + Humidity
      device.quoi = 'Température/Humidité';
      break;
    case 0x10: // Lighting1
    case 0x11: // Lighting2
    case 0x14: // Lighting5
      device.quoi = 'Lumière';
      break;
    case 0x12: // Switch1
      device.quoi = 'Interrupteur';
      break;
    case 0x19: // Blinds1
      device.quoi = 'Volet';
      break;
    default:
      device.quoi = 'Appareil RF433';
  }
}
```

### 5.4 Détection Continue

**Méthode**: `startDiscovery()`

```typescript
private startDiscovery(): void {
  if (this.discoveryInProgress) {
    return;
  }

  this.discoveryInProgress = true;
  this.logger.info('RfxComService', 'Détection des devices RFXCOM démarrée...');

  // Les écouteurs sont déjà configurés dans setupTransceiverEventListeners()
  // Le transceiver écoute en continu les événements 'device'

  setTimeout(() => {
    this.discoveryInProgress = false;
    this.lastDiscovery = new Date().toISOString();
    this.emitStatus();
    this.logger.info('RfxComService', 'Détection en cours (écoute continue)...');
  }, 2000);
}
```

> **Note**: La détection est **continue** une fois le transceiver initialisé. Les devices sont détectés en temps réel via les événements 'device' du transceiver.

---

## 6. Exécution des Commandes

### 6.1 Flux d'Exécution

```
UI / Socket.io
        │
        ▼ (COMMAND)
┌───────────────────────┐
│   handleCommand()       │
│   - Validation commande │
│   - Vérification récepteur│
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│   executeCommand()      │
│   - Vérification transceiver│
│   - Création transmitter │
│   - Envoi commande       │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│   Transmitter          │
│   - Lighting1/2/5      │
│   - Blinds1/2          │
│   - Security1          │
│   - etc.               │
└───────────────────────┘
        │
        ▼
   Transceiver RFXCOM
```

### 6.2 Création du Transmitter

**Méthode**: `createTransmitterForReceiver(receiver: RfxComReceiver): Transmitter`

```typescript
private createTransmitterForReceiver(receiver: RfxComReceiver): unknown {
  if (!this.transceiver) {
    throw new Error('Transceiver non initialisé');
  }

  const protocol = receiver.protocol.toLowerCase();

  switch (protocol) {
    case 'lighting1':
      return new rfxcom.Lighting1(this.transceiver, rfxcom.lighting1[receiver.deviceId]);
    case 'lighting2':
      return new rfxcom.Lighting2(this.transceiver, rfxcom.lighting2[receiver.houseCode || 'X10']);
    case 'lighting4':
      return new rfxcom.Lighting4(this.transceiver, rfxcom.lighting4.PT2262);
    case 'lighting5':
      return new rfxcom.Lighting5(this.transceiver, rfxcom.lighting5.LIGHTWAVERF);
    case 'lighting6':
      return new rfxcom.Lighting6(this.transceiver, rfxcom.lighting6.BLYSS);
    case 'switch1':
      return new rfxcom.Lighting1(this.transceiver, rfxcom.lighting1.IMPULS);
    case 'blinds1':
      return new rfxcom.Blinds1(this.transceiver, rfxcom.blinds1.LINCONL);
    case 'blinds2':
      return new rfxcom.Blinds2(this.transceiver, rfxcom.blinds2.SIMU);
    case 'blinds3':
      return new rfxcom.Blinds1(this.transceiver, rfxcom.blinds1.ROSSI);
    case 'security1':
      return new rfxcom.Security1(this.transceiver, rfxcom.security1.X10);
    default:
      this.logger.warn('RfxComService', `Protocole non mappé: ${protocol}`);
      return new rfxcom.Lighting1(this.transceiver, rfxcom.lighting1.IMPULS);
  }
}
```

### 6.3 Commandes par Action

#### Commande ON

**Méthode**: `sendOnCommand(transmitter: Transmitter, receiver: RfxComReceiver)`

```typescript
private sendOnCommand(transmitter: unknown, receiver: RfxComReceiver): void {
  const deviceId = receiver.deviceId;
  const houseCode = receiver.houseCode || 'A';
  const unitCode = receiver.unitCode || 1;

  if (transmitter instanceof rfxcom.Lighting1) {
    transmitter.switchOn(deviceId, 0, unitCode);
  } else if (transmitter instanceof rfxcom.Lighting2) {
    transmitter.switchOn(deviceId, houseCode, unitCode, 100);
  } else if (transmitter instanceof rfxcom.Lighting5) {
    transmitter.switchOn(deviceId);
  } else if (transmitter instanceof rfxcom.Blinds1) {
    transmitter.open(deviceId);
  } else if (transmitter instanceof rfxcom.Security1) {
    transmitter.switchOnLight(deviceId, houseCode, unitCode);
  } else {
    transmitter.switchOn(deviceId, houseCode, unitCode);
  }
}
```

#### Commande OFF

**Méthode**: `sendOffCommand(transmitter: Transmitter, receiver: RfxComReceiver)`

```typescript
private sendOffCommand(transmitter: unknown, receiver: RfxComReceiver): void {
  const deviceId = receiver.deviceId;
  const houseCode = receiver.houseCode || 'A';
  const unitCode = receiver.unitCode || 1;

  if (transmitter instanceof rfxcom.Lighting1) {
    transmitter.switchOff(deviceId, 0, unitCode);
  } else if (transmitter instanceof rfxcom.Lighting2) {
    transmitter.switchOff(deviceId, houseCode, unitCode);
  } else if (transmitter instanceof rfxcom.Lighting5) {
    transmitter.switchOff(deviceId);
  } else if (transmitter instanceof rfxcom.Blinds1) {
    transmitter.close(deviceId);
  } else if (transmitter instanceof rfxcom.Security1) {
    transmitter.switchOffLight(deviceId, houseCode, unitCode);
  } else {
    transmitter.switchOff(deviceId, houseCode, unitCode);
  }
}
```

#### Commande DIM

**Méthode**: `sendDimCommand(transmitter: Transmitter, receiver: RfxComReceiver, level: number)`

```typescript
private sendDimCommand(transmitter: unknown, receiver: RfxComReceiver, level: number): void {
  const deviceId = receiver.deviceId;
  const houseCode = receiver.houseCode || 'A';
  const unitCode = receiver.unitCode || 1;
  const normalizedLevel = Math.max(0, Math.min(100, Math.round(level)));

  if (transmitter instanceof rfxcom.Lighting2) {
    transmitter.setLevel(deviceId, houseCode, unitCode, normalizedLevel);
  } else if (transmitter instanceof rfxcom.Lighting5) {
    transmitter.setLevel(deviceId, normalizedLevel);
  } else if (transmitter instanceof rfxcom.Lighting1) {
    // Lighting1 ne supporte pas le dim directement
    transmitter.switchOn(deviceId, 0, unitCode);
  }
}
```

#### Commandes pour Covers

```typescript
// UP (Ouvrir)
private sendUpCommand(transmitter: unknown, receiver: RfxComReceiver): void {
  if (transmitter instanceof rfxcom.Blinds1) {
    transmitter.open(receiver.deviceId);
  }
}

// DOWN (Fermer)
private sendDownCommand(transmitter: unknown, receiver: RfxComReceiver): void {
  if (transmitter instanceof rfxcom.Blinds1) {
    transmitter.close(receiver.deviceId);
  }
}

// STOP
private sendStopCommand(transmitter: unknown, receiver: RfxComReceiver): void {
  if (transmitter instanceof rfxcom.Blinds1) {
    transmitter.stop(receiver.deviceId);
  }
}
```

### 6.4 Mappage des Actions

| Action HA | Méthode RFXCOM | Protocoles Supportés |
|-----------|-----------------|---------------------|
| `turn_on` | `switchOn()` | lighting1, lighting2, lighting5, blinds1, security1 |
| `turn_off` | `switchOff()` | lighting1, lighting2, lighting5, blinds1, security1 |
| `toggle` | `sendToggleCommand()` | lighting1, lighting2, lighting5 |
| `set_level` / `set_brightness` | `setLevel()` | lighting2, lighting5 |
| `brighten` | `sendBrightenCommand()` | lighting5 |
| `open_cover` | `open()` | blinds1, blinds2 |
| `close_cover` | `close()` | blinds1, blinds2 |
| `stop_cover` | `stop()` | blinds1, blinds2 |

---

## 7. Mappage des Protocoles

### 7.1 Protocoles → Classes Transmitter

| Protocole | Classe Transmitter | Subtype Constant |
|-----------|-------------------|-----------------|
| lighting1 | `rfxcom.Lighting1` | `rfxcom.lighting1.<SUBTYPE>` |
| lighting2 | `rfxcom.Lighting2` | `rfxcom.lighting2.<SUBTYPE>` |
| lighting3 | `rfxcom.Lighting3` | `rfxcom.lighting3.KOPPO` |
| lighting4 | `rfxcom.Lighting4` | `rfxcom.lighting4.PT2262` |
| lighting5 | `rfxcom.Lighting5` | `rfxcom.lighting5.LIGHTWAVERF` |
| lighting6 | `rfxcom.Lighting6` | `rfxcom.lighting6.BLYSS` |
| switch1 | `rfxcom.Lighting1` | `rfxcom.lighting1.IMPULS` |
| blinds1 | `rfxcom.Blinds1` | `rfxcom.blinds1.LINCONL` |
| blinds2 | `rfxcom.Blinds2` | `rfxcom.blinds2.SIMU` |
| blinds3 | `rfxcom.Blinds1` | `rfxcom.blinds1.ROSSI` |
| security1 | `rfxcom.Security1` | `rfxcom.security1.X10` |

### 7.2 Subtypes par Protocole

**Lighting1** :
- IMPULS, RISING_SUN, PHILIPS, KAMERAFLASH, ELRO, BRENENSTUHL, DIMSUND, IKEA, ALL_BASE_STATION

**Lighting2** :
- X10, ARC, AC, HOMEEASY_EU, HOMEEASY_US, MEIANTECH, IMPULS, RISING_SUN, PHILIPS, AD, LIGHTWAVERF, EMW100, EMW200, DIMSUND

**Lighting5** :
- LIGHTWAVERF, PROGUARD, ENERGENIE5, SCODE, LEардIS, ONMERK, COCO, SELECTPLUS, SEABYRES, TEN

**Security1** :
- X10, KEELOQ, HOMEEASY, MEIANTECH, OREGON, VISONIC, MOTION, NOMOTION, X10_SECURITY

---

## 8. Gestion des Événements

### 8.1 Événements Internes

| Événement | Description | Payload | Émetteur |
|-----------|-------------|---------|----------|
| `DEVICE_DETECTED` | Nouveau device détecté | `{ device, timestamp }` | RfxComService |
| `DEVICES_LIST` | Liste complète des devices | `{ devices, timestamp }` | RfxComService |
| `STATUS` | Statut du service RFXCOM | `{ connected, devicesCount, receiversCount, lastDiscovery }` | RfxComService |
| `COMMAND` | Résultat d'une commande | `{ command, success, error?, timestamp }` | RfxComService |

### 8.2 Événements Transceiver

| Événement | Description | Action |
|-----------|-------------|--------|
| `device` | Device RF433 détecté | `handleRfxComDeviceEvent()` → `DEVICE_DETECTED` |
| `receive` | Message brut reçu | Log en debug |
| `connect` | Transceiver connecté | `isConnected = true`, `emitStatus()` |
| `disconnect` | Transceiver déconnecté | `isConnected = false`, `emitStatus()` |
| `error` | Erreur matérielle | `emitError()`, log |
| `ready` | Prêt à transmettre | `isConnected = true`, `emitStatus()` |
| `response` | Réponse à une commande | Log en debug |
| `status` | Statut du transceiver | Log en debug |

---

## 9. Configuration Requise

### 9.1 Configuration Technique (core)

Pour que le module RFXCOM apparaisse dans le menu latéral, les configurations suivantes sont **obligatoires** :

**Fichier**: `config/technical-config.yaml`

```yaml
rfxcom:
  enabled: true
  # Paramètres du transceiver
  transceiverType: rfxtrx433e  # rfxtrx433e | rfxtrx433xl | rfxcom433e
  serialPort: /dev/ttyACM0     # Chemin du port série
  baudRate: 38400             # Vitesse de communication (38400 par défaut)
  serialTimeoutMs: 1000       # Timeout lecture série (ms)
  
  # Paramètres de détection
  autoDiscovery: true         # Détection automatique des devices
  discoveryIntervalMs: 60000  # Intervalle entre les scans (ms)
  
  # Récepteurs (configurés via UI ou fichier centralisé)
  receivers: []
  scenes: []
  appairages: []
```

### 9.2 Récepteur RFXCOM

**Exemple de configuration d'un récepteur** :

```typescript
{
  id: "recepteur_001",
  name: "Lumière Salon",
  deviceId: "0x02b3",
  type: "light",
  deviceClass: "rf433",
  protocol: "lighting1",
  subunitCode: 0,
  unitCode: 1,
  groupCode: "A",
  houseCode: "A",
  enabled: true,
  inverted: false,
  quoi: "Lumière",
  ou: "Salon",
  haExposed: true,
  emitters: ["0x02b3/1"],
  primaryEmitter: "0x02b3/1"
}
```

### 9.3 Champ `rfxcom` dans la Configuration Globale

Le module RFXCOM nécessite que le champ `rfxcom` soit présent dans la configuration technique pour apparaître dans le menu.

---

## 10. Gestion des Erreurs

### 10.1 Codes d'Erreur Spécifiques RFXCOM

| Code | Description | Sévérité |
|------|-------------|-----------|
| `RFXCOM_CONNECTION_ERROR` | Erreur de connexion au transceiver | error |
| `RFXCOM_TRANSCEIVER_NOT_INITIALIZED` | Transceiver non initialisé | error |
| `RFXCOM_TRANSCEIVER_NOT_CONNECTED` | Transceiver non connecté | error |
| `RFXCOM_UNSUPPORTED_PROTOCOL` | Protocole non supporté | error |
| `RFXCOM_UNSUPPORTED_ACTION` | Action non supportée | error |
| `RFXCOM_COMMAND_FAILED` | Échec de l'exécution d'une commande | error |
| `RFXCOM_DEVICE_NOT_FOUND` | Device introuvable | error |

### 10.2 Format des Erreurs

```typescript
{
  code: AppErrorCode;
  message: string;
  module: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  details: Record<string, unknown>;
  timestamp: string;
}
```

---

## 11. Séquence de Démarrage/Arrêt

### 11.1 Démarrage

**Démarrage automatique via AppService :**
- AppService détecte les modules dans `applications/` et `dist/applications/`
- Pour chaque module activé, AppService:
  1. Charge le module dynamiquement
  2. Cherche une factory de service (`createRfxComService` ou `createRfxComServiceWithConfig`)
  3. Instancie le service avec les dépendances (eventBus, logger, configProvider ou configService)
  4. Appelle automatiquement `.start()` sur le service
  
  > **Note sur l'injection** : AppService crée et passe toujours un `IAppConfigProvider<RfxComConfig>` (créé via `new AppConfigProvider(moduleId, configService)`) à la factory. Les factories comme `createRfxComService` attendent ce provider typé. La factory `createRfxComServiceWithConfig` est toujours disponible pour simplifier l'instanciation manuelle.

**Séquence détaillée :**

```
AppService.start()
    │
    ▼
Détection des modules (detectApplicationModules)
    │
    ▼
Module RFXCOM détecté (si présent dans applications/)
    │
    ▼
AppService.startApplicationServices()
    │
    ▼
startApplicationService("rfxcom")
    │
    ▼
Chargement du module rfxcom/domain/index.ts
    │
    ▼
Détection de la factory: createRfxComServiceWithConfig
    │
    ▼
RfxComService.constructor(eventBus, logger, configService)
    │
    ▼
loadConfig() - Chargement de la configuration RFXCOM
    │
    ▼
setupEventListeners() - Configuration des listeners EventBus
    │
    ▼
RfxComService.start()  [Appelé automatiquement par AppService]
    │
    ▼
Log INFO: "Démarrage du service RFXCOM..."
    │
    ▼
initializeTransceiver()
    │
    ▼
Log INFO: "Tentative de connexion au transceiver RFXCOM sur {serialPort}..."
    │
    ▼
new rfxcom.RfxCom(serialPort, options)
    │
    ▼
setupTransceiverEventListeners()
    │
    ▼
transceiver.initialise(callback)
    │
    ▼ (asynchrone)
    [Si succès:]
    ▼
Log INFO: "Transceiver RFXCOM initialisé avec succès sur {serialPort}"
    │
    ▼
startDiscovery()
    │
    ▼
Écoute continue des devices
    │
    [Si échec:]
    ▼
Log WARNING: "Tentative de connexion RFXCOM échouée - Motif: [erreur]"
    │
    ▼
isConnected = false
    │
    ▼
Application continue (échec normal si matériel absent ou config incorrecte)
```

**Comportement en cas d'échec :**
- Si la connexion au transceiver échoue (port série invalide, matériel absent, etc.), un **WARNING** est loggé (pas une ERROR)
- Le service RFXCOM reste dans l'état `isConnected = false`
- L'application principale **ne crash pas** et continue de fonctionner
- L'indicateur de connexion dans l'UI affiche "Déconnecté"

### 11.2 Arrêt

```
RfxComService.stop()
    │
    ▼
transceiver.close()
    │
    ▼
this.transceiver = undefined
    │
    ▼
isConnected = false
    │
    ▼
emitStatus()
```

### 11.3 Reconnexion Automatique

**Mécanisme :**
- AppService écoute l'événement `app:module:config:saved` émis quand la configuration d'un module est sauvegardée
- Quand la configuration RFXCOM est modifiée (ex: changement de `serialPort`, `baudRate`), AppService:
  1. Arrête le service RFXCOM existant (si démarré)
  2. Instancie un nouveau service avec la nouvelle configuration
  3. Démarre le nouveau service

**Séquence de reconnexion :**

```
Utilisateur modifie config RFXCOM
    │
    ▼
Sauvegarde via UI (app:modules:config:save)
    │
    ▼
AppService reçoit app:module:config:saved
    │
    ▼
AppService.restartApplicationService("rfxcom")
    │
    ▼
AppService.stopApplicationService("rfxcom")
    │
    ▼
RfxComService.stop() [si existe]
    │
    ▼
AppService.startApplicationService("rfxcom")
    │
    ▼
Nouvelle instance RfxComService avec nouvelle config
    │
    ▼
RfxComService.start()
    │
    ▼
Nouvelle tentative de connexion avec les nouveaux paramètres
```

**Points clés :**
- La reconnexion est **automatique** et **transparente**
- Pas besoin de redémarrer l'application complète
- Les anciennes erreurs de connexion sont oubliées, une nouvelle tentative est effectuée
- Si la nouvelle connexion échoue aussi, un nouveau WARNING est loggé

---

## 12. Tests et Validation

### 12.1 Scénarios de Test

| ID | Description | Critère de Succès |
|----|-------------|------------------|
| RFX-T-001 | Initialisation du transceiver | Transceiver initialisé, `isConnected = true` |
| RFX-T-002 | Détection d'un device | Événement `DEVICE_DETECTED` émis |
| RFX-T-003 | Exécution commande ON | Commande envoyée au transceiver |
| RFX-T-004 | Exécution commande OFF | Commande envoyée au transceiver |
| RFX-T-005 | Exécution commande DIM | Niveau normalisé et envoyé |
| RFX-T-006 | Déconnexion du transceiver | `isConnected = false`, `emitStatus()` |
| RFX-T-007 | Protocole non mappé | Utilisation de Lighting1 par défaut |
| RFX-T-008 | Device existant | Mise à jour au lieu de création |

### 12.2 Validation de la Configuration

**Méthode**: `validateRfxComConfig(config: unknown)` dans `config-schema.ts`

Vérifie que :
- `serialPort` est présent et non vide
- `baudRate` est un entier positif
- `transceiverType` est dans la liste autorisée
- `receivers` est un tableau valide
- `scenes` est un tableau valide
- `appairages` est un tableau valide

---

## 13. Limites et Contraintes

### 13.1 Limites de la Bibliothèque rfxcom

| Limite | Impact | Solution |
|--------|--------|----------|
| Timeout de transmission (12s) | Délai pour certaines commandes | Configurable via `options.timeout` |
| Concurrence limitée (3) | Commandes en file d'attente | Configurable via `options.concurrency` |
| Pas de support pour tous les packet types | Certains devices non détectables | Voir [DeviceCommands.md](DeviceCommands.md) dans rfxcom |
| Dépendance sur serialport | Nécessite des permissions | `sudo usermod -aG dialout $USER` |

### 13.2 Protocoles Non Supportés

Les protocoles suivants ne sont **PAS** supportés par la bibliothèque rfxcom v2.6.2 :
- Security2 (0x21)
- ASYNC port configuration (0x61) - RFXtrx433XL uniquement
- ASYNC port data (0x62) - RFXtrx433XL uniquement
- FS20 (0x72) - 868 MHz uniquement

### 13.3 Contraintes Matérielles

- Le transceiver RFXtrx433 doit être connecté **avant** le démarrage de l'application
- Le port série doit avoir les **permissions appropriées**
- Le **baud rate** doit correspondre à la configuration matérielle (généralement 38400)

---

## 14. Annexes

### 14.1 Références

- **[Bibliothèque rfxcom npm](https://www.npmjs.com/package/rfxcom)**
- **[Documentation officielle rfxcom](https://github.com/maxhadley/rfxcom)**
- **[Device Commands Reference](DeviceCommands.md)** (dans le package npm)
- **[Spécifications Fonctionnelles RFXCOM v5.0](specs-fonctionnelles-rfxcom-v5.0.md)** ⭐
- **[Spécifications Techniques Socle HA-MQTT v4.3](specs-techniques-socle-ha-mqtt-v4.3.md)** ⭐

### 14.2 Glossaire

| Terme | Définition |
|-------|------------|
| Transceiver | Appareil RFXtrx433 qui émet/réçoit les signaux RF433 |
| Transmitter | Classe qui permet d'envoyer des commandes pour un protocole spécifique |
| Packet Type | Identifiant du type de message RFXCOM (1 byte) |
| Subtype | Sous-type de device dans un protocole (1 byte) |
| Device ID | Identifiant unique du device RF433 |
| House Code | Code maison (généralement A-P) |
| Unit Code | Code unité (généralement 1-16) |

### 14.3 Exemple Complet

**Initialisation et utilisation du service RFXCOM** :

```typescript
// Import des dépendances
import { RfxComService } from './applications/rfxcom/domain/RfxComService';
import { EventBus } from './application/EventBus';
import { Logger } from './infrastructure/logger';
import { ConfigService } from './infrastructure/config/ConfigService';

// Création des services
const eventBus = new EventBus();
const logger = new Logger();
const configService = new ConfigService();

// Création du service RFXCOM
const rfxComService = new RfxComService(eventBus, logger, configService);

// Démarrage
async function start() {
  try {
    await rfxComService.start();
    console.log('RFXCOM démarré avec succès');
  } catch (error) {
    console.error('Échec du démarrage RFXCOM:', error);
  }
}

// Écouter les événements
rfxComService.onDeviceDetected((event) => {
  console.log('Device détecté:', event.device);
});

rfxComService.onStatus((status) => {
  console.log('Statut RFXCOM:', status);
});

// Exécuter une commande
const command: RfxComCommand = {
  receiverId: 'recepteur_001',
  action: 'on',
  timestamp: new Date().toISOString(),
};

rfxComService.executeCommand(command)
  .then(result => console.log('Résultat:', result))
  .catch(error => console.error('Erreur:', error));

// Arrêt
async function stop() {
  await rfxComService.stop();
  console.log('RFXCOM arrêté');
}
```

### 14.4 Historique

| Version | Date | Auteur | Changements |
|---------|------|--------|------------|
| 1.0 | 2026-07-11 | Mistral Vibe | Version initiale - Intégration de la bibliothèque rfxcom npm v2.6.2 |

---

*Conforme à [specs-fonctionnelles-rfxcom-v5.0.md](specs-fonctionnelles-rfxcom-v5.0.md), [specs-techniques-socle-ha-mqtt-v4.3.md](specs-techniques-socle-ha-mqtt-v4.3.md) et [spec-nommage-v1.0.md](spec-nommage-v1.0.md)*
