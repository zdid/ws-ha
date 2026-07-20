// =============================================================================
// Types pour la structure Home Assistant (Areas, Devices, Entities)
// Conforme aux spécifications §7.2 et §7.3
// =============================================================================

import { HaStructuredEntity } from './ha-entity';

/**
 * Définition d'un QUOI (concept métier).
 * Un QUOI représente une catégorie fonctionnelle d'entités.
 */
export interface HaQuoiDefinition {
  quoi_id: string;           // Identifiant unique (ex: "eclairage", "temperature")
  label: string;             // Label affiché dans l'UI (ex: "Éclairage")
  description?: string;      // Description optionnelle
}

/**
 * Zone (Area) Home Assistant enrichie.
 * Contient une carte des QUOI et de leurs entités.
 */
export interface HaArea {
  area_id: string;
  name: string;
  picture?: string;
  quoiMap: Map<string, HaQuoi>;  // clé = quoi_id
}

/**
 * QUOI avec ses entités classées.
 */
export interface HaQuoi {
  quoi_id: string;
  label: string;
  description?: string;
  entities: HaStructuredEntity[];
}

/**
 * Appareil (Device) Home Assistant.
 */
export interface HaDevice {
  device_id: string;
  name: string;
  identifiers?: any[];
  manufacturer?: string;
  model?: string;
  via_device_id?: string;
  area_id?: string;
  entities: HaStructuredEntity[];
}

/**
 * Référentiel structuré complet : area → QUOI → entités.
 * C'est la structure principale utilisée par la couche Métier.
 */
export interface HaStructuredRegistry {
  areas: Map<string, HaArea>;           // Toutes les areas (clé = area_id)
  unassigned?: HaArea;                  // Area virtuelle pour les entités sans area
  devices: Map<string, HaDevice>;       // Tous les devices (clé = device_id)
  lastFullSync: Date;                   // Timestamp de la dernière synchronisation complète
  entityCount: number;                  // Nombre total d'entités
  areaCount: number;                    // Nombre total d'areas
  deviceCount: number;                  // Nombre total de devices
}

/**
 * Interface du classifieur (à implémenter).
 * Utilisé par HaStructureRegistry pour classer les entités.
 */
export interface IHaClassifier {
  /**
   * Classifie une entité et retourne les quoi_ids applicables.
   * @param entity - Entité à classer
   * @returns Tableau de quoi_ids (peut être vide, jamais null)
   */
  classify(entity: HaStructuredEntity): string[];

  /**
   * Retourne le catalogue complet des QUOI disponibles.
   */
  getQuoiCatalog(): HaQuoiDefinition[];
}

/**
 * Résultat d'une classification.
 */
export interface ClassificationResult {
  entity_id: string;
  quoi_ids: string[];
  matchedBy: 'subType' | 'type' | 'domain' | 'device_class' | 'entity_id' | 'fallback';
}
