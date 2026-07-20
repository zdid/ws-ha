import { HaQuoiDefinition } from '../types/ha-structure';

// =============================================================================
// Catalogue des QUOI (concepts métiers) pour la classification des entités HA
// 
// Règles de classification (par ordre de priorité) :
// 1. device_class (le plus précis) → ex: "temperature", "motion" → "detecteur"
// 2. domain → ex: "light" → "eclairage", "switch" → "interrupteur"
// 3. entity_id (dernier segment séparé par '--') → ex: "salon--interrupteur" → "interrupteur"
// 4. fallback → "non_classifie"
// =============================================================================

/**
 * Catalogue complet des QUOI disponibles.
 * Chaque QUOI représente une catégorie fonctionnelle d'entités.
 */
export const QUI_CATALOG: HaQuoiDefinition[] = [
  // ===========================================================================
  // ÉCLAIRAGE
  // ===========================================================================
  {
    quoi_id: 'eclairage',
    label: 'Éclairage',
    description: 'Lumières, lampes, LED, bandes lumineuses',
  },

  // ===========================================================================
  // INTERUPTEURS & PRISES
  // ===========================================================================
  {
    quoi_id: 'interrupteur',
    label: 'Interrupteurs',
    description: 'Interrupteurs physiques et virtuels',
  },
  {
    quoi_id: 'prise',
    label: 'Prises',
    description: 'Prises électriques, multi-prises connectées',
  },

  // ===========================================================================
  // CLIMATISATION
  // ===========================================================================
  {
    quoi_id: 'climatisation',
    label: 'Climatisation',
    description: 'Chauffage, climatiseurs, pompes à chaleur',
  },
  {
    quoi_id: 'ventilation',
    label: 'Ventilation',
    description: 'Ventilateurs, VMC, extracteurs d\'air',
  },
  {
    quoi_id: 'temperature',
    label: 'Température',
    description: 'Capteurs de température',
  },
  {
    quoi_id: 'humidite',
    label: 'Humidité',
    description: 'Capteurs d\'humidité',
  },

  // ===========================================================================
  // CAPTEURS DE MOUVEMENT & PRÉSENCE
  // ===========================================================================
  {
    quoi_id: 'detecteur',
    label: 'Détecteurs',
    description: 'Détecteurs de mouvement, présence, occupation',
  },
  {
    quoi_id: 'bouton',
    label: 'Bouton',
    description: 'Boutons physiques, télécommandes',
  },
  {
    quoi_id: 'contact',
    label: 'Contact',
    description: 'Capteurs de contact (porte/fenêtre)',
  },

  // ===========================================================================
  // SÉCURITÉ
  // ===========================================================================
  {
    quoi_id: 'securite',
    label: 'Sécurité',
    description: 'Systèmes d\'alarme, centrales de sécurité',
  },
  {
    quoi_id: 'fumee',
    label: 'Détection Fumée/CO2',
    description: 'Détecteurs de fumée, monoxyde de carbone, gaz',
  },
  {
    quoi_id: 'inondation',
    label: 'Détection Inondation',
    description: 'Capteurs d\'inondation, fuites d\'eau',
  },
  {
    quoi_id: 'acces',
    label: 'Contrôle d\'accès',
    description: 'Serres, serrures connectées, digicodes',
  },

  // ===========================================================================
  // VOLETS & STORES
  // ===========================================================================
  {
    quoi_id: 'volet',
    label: 'Volets',
    description: 'Volets roulants, stores intérieurs',
  },
  {
    quoi_id: 'portail',
    label: 'Portails & Portes',
    description: 'Portails motorisés, portes de garage',
  },

  // ===========================================================================
  // MULTIMÉDIA
  // ===========================================================================
  {
    quoi_id: 'multimedia',
    label: 'Multimédia',
    description: 'Téléviseurs, projecteurs, amplificateurs',
  },
  {
    quoi_id: 'enceinte',
    label: 'Enceintes',
    description: 'Enceintes connectées, son multi-pièces',
  },

  // ===========================================================================
  // AUTOMATISATION
  // ===========================================================================
  {
    quoi_id: 'automatisation',
    label: 'Automatisations',
    description: 'Scénarios, scripts, règles',
  },

  // ===========================================================================
  // ÉNERGIE & CONSOMMATION
  // ===========================================================================
  {
    quoi_id: 'energie',
    label: 'Énergie',
    description: 'Compteurs électriques, consommation énergétique',
  },
  {
    quoi_id: 'courant',
    label: 'Courant',
    description: 'Compteurs de courant électrique',
  },
  {
    quoi_id: 'puissance',
    label: 'Puissance',
    description: 'Compteurs de puissance électrique',
  },

  // ===========================================================================
  // EAU
  // ===========================================================================
  {
    quoi_id: 'eau',
    label: 'Eau',
    description: 'Compteurs d\'eau, détection de fuites',
  },

  // ===========================================================================
  // JARDIN
  // ===========================================================================
  {
    quoi_id: 'arrosage',
    label: 'Arrosage',
    description: 'Arrosage automatique, vannes, pompes',
  },
  {
    quoi_id: 'meteo',
    label: 'Station Météo',
    description: 'Stations météo personnelles',
  },

  // ===========================================================================
  // APPAREILS MÉNAGERS
  // ===========================================================================
  {
    quoi_id: 'electromenager',
    label: 'Électroménager',
    description: 'Lave-linge, lave-vaisselle, four, réfrigérateur connecté',
  },

  // ===========================================================================
  // VEHICULES
  // ===========================================================================
  {
    quoi_id: 'vehicule',
    label: 'Véhicules',
    description: 'Voitures électriques, chargeurs de véhicules',
  },

  // ===========================================================================
  // FALLBACK
  // ===========================================================================
  {
    quoi_id: 'non_classifie',
    label: 'Non Classifié',
    description: 'Entités non classées automatiquement',
  },
];

/**
 * Crée une Map pour un accès rapide par quoi_id.
 */
export const QUI_MAP: Map<string, HaQuoiDefinition> = new Map(
  QUI_CATALOG.map((quoi) => [quoi.quoi_id, quoi])
);

/**
 * Vérifie si un quoi_id existe dans le catalogue.
 */
export function isValidQuoiId(quoiId: string): boolean {
  return QUI_MAP.has(quoiId);
}
