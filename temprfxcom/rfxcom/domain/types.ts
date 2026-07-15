// src/applications/rfxcom/domain/types.ts
// Types spécifiques à RFXCOM
// Conforme à specs-fonctionnelles-rfxcom-v5.0.md

import type { RfxComReceiver, RfxComScene, RfxComAssociation } from './config-schema';

// ============================================================================
// TYPES DES DEVICES DÉTECTÉS
// ============================================================================

/** Device RFXCOM détecté (depuis le transceiver) */
export interface RfxComDevice {
  id: string;                // Identifiant unique du device
  name: string;              // Nom du device
  deviceId: string;          // ID matériel (pour le protocole)
  sensorId?: string;         // ID du capteur (optionnel)
  type: RfxComDeviceType;    // Type de device
  protocol: RfxComProtocol;  // Protocole RF
  subunitCode?: number;      // Code sous-unité (0-255)
  unitCode?: number;         // Code unité (0-255) - optionnel
  groupCode?: string;        // Code de groupe
  houseCode?: string;        // Code maison
  state?: RfxComDeviceState;  // État actuel (optionnel)
  signalStrength?: number;   // Force du signal (0-100) - optionnel
  batteryLevel?: number;     // Niveau de batterie (0-100)
  lastSeen?: string;         // ISO8601 - Dernière fois vu (optionnel)
  rssi?: number;             // RSSI (dBm) - optionnel
  // Champs pour l'UI et l'intégration HA
  quoi?: string;              // QUOI - Type fonctionnel (ex: "Température", "Lumière")
  ou?: string;                // OÙ - Localisation (ex: "Salon", "Cuisine")
  haExposed?: boolean;       // Exposé à Home Assistant (default: true)
}

/** Type de device RFXCOM */
export type RfxComDeviceType = 
  | 'light'
  | 'switch'
  | 'cover'
  | 'sensor'
  | 'scene'
  | 'thermostat';

/** Protocole RFXCOM */
export type RfxComProtocol = 
  | 'lighting1'
  | 'lighting2'
  | 'lighting3'
  | 'lighting4'
  | 'lighting5'
  | 'lighting6'
  | 'switch1'
  | 'switch2'
  | 'blinds1'
  | 'blinds2'
  | 'blinds3'
  | 'sensor1';

/** État d'un device RFXCOM */
export interface RfxComDeviceState {
  on: boolean;
  brightness?: number;      // 0-100 (pour les lumières dimmables)
  temperature?: number;     // °C (pour les capteurs de température)
  humidity?: number;        // % (pour les capteurs d'humidité)
  position?: number;       // 0-100 (pour les volets)
  rawValue?: number;       // Valeur brute du protocole
}

// ============================================================================
// TYPES POUR LES ÉVÉNEMENTS
// ============================================================================

/** Payload pour l'événement device:detected */
export interface RfxComDeviceDetectedEvent {
  device: RfxComDevice;
  timestamp: string; // ISO8601
}

/** Payload pour l'événement receiver:created */
export interface RfxComReceiverCreatedEvent {
  receiver: RfxComReceiver;
  timestamp: string;
}

/** Payload pour l'événement receiver:updated */
export interface RfxComReceiverUpdatedEvent {
  receiver: RfxComReceiver;
  timestamp: string;
}

/** Payload pour l'événement receiver:deleted */
export interface RfxComReceiverDeletedEvent {
  receiverId: string;
  timestamp: string;
}

/** Payload pour l'événement devices:list */
export interface RfxComDevicesListEvent {
  devices: RfxComDevice[];
  timestamp: string;
}

/** Payload pour l'événement receivers:list */
export interface RfxComReceiversListEvent {
  receivers: RfxComReceiver[];
  timestamp: string;
}

/** Payload pour l'événement status */
export interface RfxComStatusEvent {
  connected: boolean;
  devicesCount: number;
  receiversCount: number;
  lastDiscovery: string;
  error?: string;
}

// ============================================================================
// TYPES POUR LES COMMANDES
// ============================================================================

/** Commande RFXCOM */
export interface RfxComCommand {
  receiverId: string;          // ID du récepteur cible
  action: RfxComCommandAction; // Action à exécuter
  value?: number;             // Valeur optionnelle (0-100 pour dim, position, etc.)
  timestamp: string;          // ISO8601
}

/** Actions possibles pour une commande RFXCOM */
export type RfxComCommandAction = 
  | 'on'
  | 'off'
  | 'toggle'
  | 'dim'
  | 'brighten'
  | 'up'
  | 'down'
  | 'stop';

/** Résultat d'une commande RFXCOM */
export interface RfxComCommandResult {
  command: RfxComCommand;
  success: boolean;
  error?: string;
  timestamp: string;
}

// ============================================================================
// TYPES POUR LES SCÈNES
// ============================================================================

/** Scène RFXCOM avec état */
export interface RfxComSceneWithStatus extends RfxComScene {
  lastTriggered?: string;    // ISO8601 - Dernier déclenchement
  triggerCount: number;     // Nombre de déclenchements
}

/** Payload pour l'événement scene:triggered */
export interface RfxComSceneTriggeredEvent {
  scene: RfxComScene;
  timestamp: string;
}

// ============================================================================
// TYPES POUR LES ASSOCIATIONS
// ============================================================================

/** Association avec état */
export interface RfxComAssociationWithStatus extends RfxComAssociation {
  lastTriggered?: string;   // ISO8601
  triggerCount: number;
}

// ============================================================================
// TYPES POUR LA DÉTECTION DES DEVICES
// ============================================================================

/** Filtrage des devices pour la détection */
export interface RfxComDiscoveryFilter {
  type?: RfxComDeviceType;
  protocol?: RfxComProtocol;
  minSignalStrength?: number;
  minRssi?: number;
}

/** Options de scan RFXCOM */
export interface RfxComScanOptions {
  durationMs: number;        // Durée du scan (ms)
  filter?: RfxComDiscoveryFilter;
  forceRediscovery: boolean; // Forcer la redécouverte des devices connus
}

// ============================================================================
// TYPES POUR LA CONFIGURATION DES DEVICES
// ============================================================================

/** Fichier de configuration des devices RFXCOM (stocké dans config-rfxcom-devices-v1.0.yaml) */
export interface RfxComDevicesConfig {
  version: string;            // Version du schéma
  devices: RfxComDevice[];   // Liste des devices connus
  lastUpdated?: string;       // ISO8601 (optionnel)
}

// ============================================================================
// TYPES POUR L'INTÉGRATION HA
// ============================================================================

/** Entité HA créée pour un récepteur RFXCOM */
export interface RfxComHaEntity {
  entity_id: string;         // Ex: sensor.rfxcom_temperature_salon
  friendly_name: string;    // Nom affiché dans HA
  domain: string;           // Ex: sensor, light, switch, cover
  device_class?: string;    // Classe HA (ex: temperature, humidity)
  state: string | number | boolean;
  attributes: Record<string, unknown>;
  unit_of_measurement?: string;
  icon?: string;
}

/** Configuration de découverte HA pour RFXCOM */
export interface RfxComHaDiscoveryConfig {
  enabled: boolean;          // Activer la découverte automatique HA
  prefix: string;            // Préfixe pour les entités (ex: rfxcom_)
  deviceInfo: {
    identifiers: string[];
    name: string;
    manufacturer: string;
    model: string;
    sw_version?: string;
  };
}

// ============================================================================
// ÉNUMS ET CONSTANTES
// ============================================================================

/** Noms des topics MQTT pour RFXCOM */
export const RFXCOM_MQTT_TOPICS = {
  // Discovery HA
  DISCOVERY_PREFIX: 'homeassistant',
  CONFIG_TOPIC: (component: string, objectId: string) => 
    `homeassistant/${component}/${objectId}/config`,
  STATE_TOPIC: (component: string, objectId: string) => 
    `homeassistant/${component}/${objectId}/state`,
  HA_COMMAND_TOPIC: (component: string, objectId: string) => 
    `homeassistant/${component}/${objectId}/set`,
  
  // Topics internes
  STATUS_TOPIC: 'ha-integration/rfxcom/status',
  DISCOVERY_TOPIC: 'ha-integration/rfxcom/discovery',
  COMMAND_TOPIC: 'ha-integration/rfxcom/command',
} as const;

/** Versions des schémas */
export const RFXCOM_SCHEMA_VERSIONS = {
  DEVICES_CONFIG: '1.0',
  RECEIVER: '1.0',
  SCENE: '1.0',
  ASSOCIATION: '1.0',
} as const;
