// src/applications/rfxcom/domain/config-schema.ts
// Schéma de configuration spécifique à RFXCOM
// Conforme à specs-presentation-v2.0.md §4.4 et specs-fonctionnelles-rfxcom-v5.0.md

import { z } from 'zod';

// ============================================================================
// SCHÉMAS POUR LES TYPES RFXCOM
// ============================================================================

/** Type de device RFXCOM */
export const rfxcomDeviceTypeSchema = z.enum([
  'light',      // Lumière
  'switch',     // Interrupteur
  'cover',      // Volet
  'sensor',     // Capteur
  'scene',      // Scène
  'thermostat', // Thermostat
]);

/** Classe de device RFXCOM */
export const rfxcomDeviceClassSchema = z.enum([
  'rf433',     // 433 MHz générique
  'rf433_433', // 433.433 MHz
  'rf433_868', // 868 MHz (variante européenne)
  'rf433_915', // 915 MHz (variante US)
]);

/** Protocole RFXCOM */
export const rfxcomProtocolSchema = z.enum([
  'lighting1',   // Protocole Lighting1
  'lighting2',   // Protocole Lighting2 (AC)
  'lighting3',   // Protocole Lighting3
  'lighting4',   // Protocole Lighting4
  'lighting5',   // Protocole Lighting5 (Dimmable)
  'lighting6',   // Protocole Lighting6 (RGB)
  'switch1',     // Protocole Switch1
  'switch2',     // Protocole Switch2 (AC)
  'blinds1',     // Protocole Blinds1 (T1)
  'blinds2',     // Protocole Blinds2 (T2)
  'blinds3',     // Protocole Blinds3 (T3)
  'sensor1',     // Protocole Sensor1 (Température/Humidité)
]);

// ============================================================================
// SCHÉMA DE CONFIGURATION RFXCOM
// ============================================================================

/** Configuration pour un récepteur RFXCOM */
export const rfxcomReceiverSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  deviceId: z.string().min(1, 'Device ID is required'),
  sensorId: z.string().optional(),
  type: rfxcomDeviceTypeSchema,
  deviceClass: rfxcomDeviceClassSchema.optional(),
  protocol: rfxcomProtocolSchema,
  subunitCode: z.number().int().nonnegative().max(255).optional(),
  unitCode: z.number().int().nonnegative().max(255),
  groupCode: z.string().optional(),
  houseCode: z.string().optional(),
  enabled: z.boolean().default(true),
  inverted: z.boolean().default(false),
  // Champs pour l'UI et l'intégration HA
  quoi: z.string().optional(),              // QUOI - Type fonctionnel
  ou: z.string().optional(),                // OÙ - Localisation
  haExposed: z.boolean().default(true),    // Exposé à Home Assistant
  emitters: z.array(z.string()).default([]), // Liste des IDs d'émetteurs appariés
  primaryEmitter: z.string().optional(),     // ID de l'émetteur primaire
});

/** Configuration pour une scène RFXCOM */
export const rfxcomSceneSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  receivers: z.array(z.string()).min(1, 'At least one receiver is required'),
  delayBetweenCommands: z.number().int().nonnegative().default(100), // ms
  enabled: z.boolean().default(true),
  // Champs pour l'exécution des scènes
  type: z.enum(['sequential', 'parallel']).default('parallel'),
  commands: z.array(z.object({
    target: z.string(),
    action: z.string(),
    parameters: z.record(z.unknown()).optional(),
  })).default([]),
});

/** Configuration pour une association (device → récepteur) */
export const rfxcomAssociationSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  receiverId: z.string().min(1, 'Receiver ID is required'),
  action: z.enum(['on', 'off', 'toggle', 'dim', 'brighten']),
  value: z.number().int().nonnegative().max(100).optional(),
});

// ============================================================================
// SCHÉMA PRINCIPAL DE CONFIGURATION RFXCOM
// ============================================================================

/** Configuration complète de RFXCOM */
export const rfxcomConfigSchema = z.object({
  // ======================================================================
  // Paramètres globaux RFXCOM
  // ======================================================================
  
  /** Activer/Désactiver RFXCOM */
  enabled: z.boolean().default(true),
  
  /** Chemin vers le fichier de configuration des devices */
  devicesConfigPath: z.string().default('/app/data/config-rfxcom-devices-v1.0.yaml'),
  
  /** Délai de rechargement automatique (ms), 0 = désactivé */
  autoReloadConfigMs: z.number().int().nonnegative().default(30000),
  
  /** Type de transceiver RFXCOM */
  transceiverType: z.enum(['rfxtrx433e', 'rfxtrx433xl', 'rfxcom433e']).default('rfxtrx433e'),
  
  /** Port série du device RFXCOM */
  serialPort: z.string().min(1, 'Serial port is required').default('/dev/ttyACM0'),
  
  /** Baud rate pour la communication série */
  baudRate: z.number().int().positive().default(38400),
  
  /** Timeout pour la lecture série (ms) */
  serialTimeoutMs: z.number().int().positive().default(1000),
  
  // ======================================================================
  // Récepteurs
  // ======================================================================
  
  /** Liste des récepteurs configurés */
  receivers: z.array(rfxcomReceiverSchema).default([]),
  
  // ======================================================================
  // Scènes
  // ======================================================================
  
  /** Liste des scènes configurées */
  scenes: z.array(rfxcomSceneSchema).default([]),
  
  // ======================================================================
  // Associations
  // ======================================================================
  
  /** Liste des associations device → récepteur */
  associations: z.array(rfxcomAssociationSchema).default([]),
  
  // ======================================================================
  // Paramètres avancés
  // ======================================================================
  
  /** Niveau de log spécifique à RFXCOM */
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  /** Activer la détection automatique des devices */
  autoDiscovery: z.boolean().default(true),
  
  /** Délai entre les scans de détection (ms) */
  discoveryIntervalMs: z.number().int().positive().default(60000),
  
  /** Timestamp de la dernière mise à jour */
  lastUpdated: z.string().optional(),
});

// ============================================================================
// TYPES DÉRIVÉS
// ============================================================================

/** Type pour un récepteur RFXCOM */
export type RfxComReceiver = z.infer<typeof rfxcomReceiverSchema>;

/** Type pour une scène RFXCOM */
export type RfxComScene = z.infer<typeof rfxcomSceneSchema>;

/** Type pour une association RFXCOM */
export type RfxComAssociation = z.infer<typeof rfxcomAssociationSchema>;

/** Type pour la configuration complète RFXCOM */
export type RfxComConfig = z.infer<typeof rfxcomConfigSchema>;

// ============================================================================
// VALEURS PAR DÉFAUT
// ============================================================================

/** Configuration RFXCOM par défaut */
export const DEFAULT_RFXCOM_CONFIG: RfxComConfig = {
  enabled: true,
  devicesConfigPath: process.env.RFXCOM_CONFIG_PATH || '/app/data/config-rfxcom-devices-v1.0.yaml',
  autoReloadConfigMs: 30000,
  transceiverType: 'rfxtrx433e',
  serialPort: '/dev/ttyACM0',
  baudRate: 38400,
  serialTimeoutMs: 1000,
  receivers: [],
  scenes: [],
  associations: [],
  logLevel: 'info',
  autoDiscovery: true,
  discoveryIntervalMs: 60000,
};

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Valide une configuration RFXCOM
 */
export function validateRfxComConfig(config: unknown): {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  data?: RfxComConfig;
} {
  const result = rfxcomConfigSchema.safeParse(config);
  
  if (result.success) {
    return {
      valid: true,
      errors: [],
      data: result.data,
    };
  }
  
  const errors = result.error.errors.map(zodError => ({
    path: `rfxcom.${zodError.path.join('.')}`,
    message: zodError.message,
  }));
  
  return {
    valid: false,
    errors,
  };
}

/**
 * Valide un récepteur RFXCOM
 */
export function validateRfxComReceiver(receiver: unknown): {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  data?: RfxComReceiver;
} {
  const result = rfxcomReceiverSchema.safeParse(receiver);
  
  if (result.success) {
    return {
      valid: true,
      errors: [],
      data: result.data,
    };
  }
  
  const errors = result.error.errors.map(zodError => ({
    path: `rfxcom.receivers[${zodError.path[0]}].${zodError.path.slice(1).join('.')}`,
    message: zodError.message,
  }));
  
  return {
    valid: false,
    errors,
  };
}

/**
 * Valide une scène RFXCOM
 */
export function validateRfxComScene(scene: unknown): {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  data?: RfxComScene;
} {
  const result = rfxcomSceneSchema.safeParse(scene);
  
  if (result.success) {
    return {
      valid: true,
      errors: [],
      data: result.data,
    };
  }
  
  const errors = result.error.errors.map(zodError => ({
    path: `rfxcom.scenes[${zodError.path[0]}].${zodError.path.slice(1).join('.')}`,
    message: zodError.message,
  }));
  
  return {
    valid: false,
    errors,
  };
}
