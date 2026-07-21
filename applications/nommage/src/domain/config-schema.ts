/**
 * Schéma de configuration pour l'application NOMMAGE
 * Basé sur Zod pour la validation
 * Structure : tableau de couples {mqtt, ha, logging?}
 */

import { z } from 'zod';

// ============================================================================
// Sous-schémas
// ============================================================================

// Configuration MQTT (pour écouter les messages de découverte)
const mqttConfigSchema = z.object({
  // Connexion
  host: z.string().default('localhost'),
  port: z.number().min(1).max(65535).default(1883),
  username: z.string().optional(),
  password: z.string().optional(),
  clientId: z.string().default('nommage-app'),
  keepalive: z.number().min(0).max(300).default(60),
  reconnectPeriod: z.number().min(1000).max(300000).default(5000),
  cleanSession: z.boolean().default(true),
  
  // Topics à écouter (découverte)
  discoveryTopics: z.array(z.string()).default([
    'ha/+/+/config',
    'homeassistant/+/+/config',
    'homeassistant/+/+/discovery'
  ]),
  
  // Préfixe des topics (ex: "ha/", "homeassistant/")
  topicPrefix: z.string().default('ha/'),
  
  // QoS
  qos: z.number().min(0).max(2).default(1),
  retain: z.boolean().default(true),
  
  // SSL/TLS
  useTls: z.boolean().default(false),
  rejectUnauthorized: z.boolean().default(true)
});

// Configuration de transmission vers HA
const haConfigSchema = z.object({
  // Activation de la transmission automatique
  autoTransmit: z.boolean().default(true),
  
  // Composant HA par défaut pour les entités créées
  defaultComponent: z.string().default('sensor'),
  
  // Domaine HA par défaut
  defaultDomain: z.string().default('sensor'),
  
  // Préfixe pour les object_id HA
  objectIdPrefix: z.string().default('nommage_'),
  
  // Activer la création automatique des Areas
  autoCreateAreas: z.boolean().default(true),
  
  // Activer l'ajout des attributs de taxonomie
  injectTaxonomyAttributes: z.boolean().default(true)
});

// Configuration Logging
const loggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  showParsedMessages: z.boolean().default(false),
  showRawMessages: z.boolean().default(false)
});

// ============================================================================
// Schéma d'un couple MQTT + HA
// ============================================================================

const nommageCoupleSchema = z.object({
  mqtt: mqttConfigSchema,
  ha: haConfigSchema,
  logging: loggingConfigSchema.optional()
});

// ============================================================================
// Schéma principal (tableau de couples)
// ============================================================================

export const nommageConfigSchema = z.object({
  // Activation générale
  enabled: z.boolean().default(true),
  
  // Tableau de couples de configuration (MQTT + HA)
  couples: z.array(nommageCoupleSchema).default([
    { mqtt: {}, ha: {}, logging: {} }
  ])
});

// ============================================================================
// Type TypeScript
// ============================================================================

export type NommageConfig = z.infer<typeof nommageConfigSchema>;

// ============================================================================
// Types pour les éléments du tableau
// ============================================================================

export type NommageCoupleConfig = z.infer<typeof nommageCoupleSchema>;
export type NommageMqttConfig = z.infer<typeof mqttConfigSchema>;
export type NommageHaConfig = z.infer<typeof haConfigSchema>;
export type NommageLoggingConfig = z.infer<typeof loggingConfigSchema>;

// ============================================================================
// Valeurs par défaut
// ============================================================================

// Valeurs par défaut pour un couple
const DEFAULT_NOMMAGE_COUPLE: NommageCoupleConfig = {
  mqtt: {
    host: 'localhost',
    port: 1883,
    clientId: 'nommage-app',
    keepalive: 60,
    reconnectPeriod: 5000,
    cleanSession: true,
    discoveryTopics: [
      'ha/+/+/config',
      'homeassistant/+/+/config',
      'homeassistant/+/+/discovery'
    ],
    topicPrefix: 'ha/',
    qos: 1,
    retain: true,
    useTls: false,
    rejectUnauthorized: true
  },
  ha: {
    autoTransmit: true,
    defaultComponent: 'sensor',
    defaultDomain: 'sensor',
    objectIdPrefix: 'nommage_',
    autoCreateAreas: true,
    injectTaxonomyAttributes: true
  },
  logging: {
    level: 'info',
    showParsedMessages: false,
    showRawMessages: false
  }
};

export const DEFAULT_NOMMAGE_CONFIG: NommageConfig = {
  enabled: true,
  couples: [DEFAULT_NOMMAGE_COUPLE]
};
