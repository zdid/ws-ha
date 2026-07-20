// =============================================================================
// DefaultHaClassifier - Implémentation par défaut minimaliste de IHaClassifier
//
// Cette implémentation ne fait aucun classement spécifique.
// Les modules peuvent fournir leur propre implémentation via dependency injection.
// =============================================================================

import {
  HaStructuredEntity
} from '../types/ha-entity';
import {
  IHaClassifier,
  HaQuoiDefinition
} from '../types/ha-structure';

/**
 * Implémentation par défaut de IHaClassifier.
 * Ne fait aucun classement spécifique - retourne toujours un tableau vide.
 * Les applications doivent fournir leur propre classifieur si elles ont besoin de classement.
 */
export class DefaultHaClassifier implements IHaClassifier {
  /**
   * Classifie une entité et retourne les quoi_ids applicables.
   * Par défaut, retourne un tableau vide (pas de classement).
   * @param entity - Entité à classer
   * @returns Tableau de quoi_ids (peut être vide)
   */
  classify(_entity: HaStructuredEntity): string[] {
    return [];
  }

  /**
   * Retourne le catalogue des QUOI disponibles.
   * Par défaut, retourne un tableau vide.
   */
  getQuoiCatalog(): HaQuoiDefinition[] {
    return [];
  }
}
