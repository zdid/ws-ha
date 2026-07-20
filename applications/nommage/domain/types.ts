/**
 * Types spécifiques à l'application NOMMAGE
 * Gestion des conventions de nommage et taxonomie (QUOI/OÙ)
 */

import type { HaStructuredEntity } from '../../../../ha/types/ha-structure';

// ============================================================================
// Types pour le parsing QUOI/OÙ (basé sur nommage_specs_v1.0.md)
// ============================================================================

/**
 * Structure extraite d'un message de découverte MQTT
 * Format attendu : "quoi---lieu_precis--lieu--lieu_pere--lieu_grand_pere"
 */
export interface DiscoveryMessage {
  // Partiel : Chaîne brute reçue dans le payload MQTT
  rawName: string;
  
  // QUOI (Type de l'appareil)
  rawQuoi: string;
  slugQuoi: string;
  
  // OÙ (Hiérarchie géographique)
  rawLieux: string;
  lieuxSegments: string[];
  
  // Niveaux géographiques (null si non présent)
  nomPrecis?: string;
  slugPrecis?: string;
  
  nomLieu?: string;          // ⭐ OBLIGATOIRE (Pièce/Area HA)
  slugLieu?: string;
  
  nomPere?: string;          // Étage/Floor HA
  slugPere?: string;
  
  nomGrandPere?: string;     // Bâtiment/Label HA
  slugGrandPere?: string;
  
  // Métadonnées du message MQTT
  topic: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Résultat du parsing et classification
 */
export interface ParsedTaxonomy {
  // QUOI
  quoi: {
    raw: string;
    slug: string;
  };
  
  // OÙ (structuré)
  ou: {
    precis?: TaxonomyLevel;
    lieu?: TaxonomyLevel;       // ⭐ OBLIGATOIRE
    pere?: TaxonomyLevel;
    grandPere?: TaxonomyLevel;
  };
  
  // Pour l'intégration HA
  haAreaId?: string;           // Area ID à créer dans HA
  haAreaName?: string;        // Nom de l'Area
  haEntityId?: string;        // entity_id suggérée
  haDeviceClass?: string;    // Classe de l'entité HA
  
  // Attributs à injecter dans HA (via MQTT Discovery)
  haAttributes: {
    attributs_taxonomie: {
      quoi: string;
      slug_quoi: string;
      lieu_precis?: string;
      slug_precis?: string;
      lieu_principal?: string;
      slug_lieu?: string;
      lieu_pere?: string;
      slug_pere?: string;
      lieu_grand_pere?: string;
      slug_grand_pere?: string;
    };
    // Autres attributs à transmettre
    [key: string]: unknown;
  };
  
  // Source
  sourceTopic: string;
  sourcePayload: Record<string, unknown>;
}

/**
 * Niveau de taxonomie (avec raw et slug)
 */
export interface TaxonomyLevel {
  raw: string;
  slug: string;
}

/**
 * Événement de découverte interne (transmis au core)
 */
export interface NommageDiscoveryEvent {
  type: 'nommage:discovery:parsed';
  data: ParsedTaxonomy;
  timestamp: Date;
}

/**
 * Configuration de l'intégration MQTT pour NOMMAGE
 */
export interface NommageMqttConfig {
  // Connexion MQTT
  host: string;
  port: number;
  username?: string;
  password?: string;
  clientId?: string;
  keepalive?: number;
  reconnectPeriod?: number;
  
  // Topics à écouter (pour la découverte)
  discoveryTopics: string[];
  
  // Préfixe des topics (ex: "ha/", "homeassistant/")
  topicPrefix: string;
  
  // QoS et retain
  qos?: 0 | 1 | 2;
  retain?: boolean;
}

/**
 * Structure complète de la taxonomie pour une entité
 * (utilisée pour l'affichage et le filtrage)
 */
export interface TaxonomyStructure {
  entityId: string;
  taxonomy: ParsedTaxonomy;
  haEntity?: HaStructuredEntity;
  lastUpdated: Date;
}

/**
 * Événement de mise à jour de la structure globale
 */
export interface TaxonomyStructureUpdate {
  type: 'nommage:structure:updated';
  structures: TaxonomyStructure[];
  timestamp: Date;
}

/**
 * Commande de transmission vers HA
 */
export interface TransmitToHaCommand {
  type: 'nommage:transmit:to-ha';
  discoveryMessage: DiscoveryMessage;
  parsedTaxonomy: ParsedTaxonomy;
  targetTopic?: string;  // Topic HA cible (ex: homeassistant/sensor/.../config)
}

// ============================================================================
// Types pour Socket.io
// ============================================================================

/**
 * Statut de l'application NOMMAGE
 */
export interface NommageStatus {
  connected: boolean;
  mqttConnected: boolean;
  discoveryTopics: string[];
  parsedMessagesCount: number;
  lastParsedAt?: Date;
  error?: string;
}

/**
 * Message de log pour l'UI
 */
export interface NommageLogMessage {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  data?: unknown;
}
