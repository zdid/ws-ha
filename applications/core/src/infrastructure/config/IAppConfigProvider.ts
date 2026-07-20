/**
 * Interface pour fournir l'accès à la configuration d'une application.
 * 
 * **Rôle :**
 * - Abstraction de ConfigService pour la couche Métier
 * - Permet à une application d'accéder UNIQUEMENT à son propre chapitre de configuration
 * - Respecte le principe : "La couche Métier ne connaît pas ConfigService" (spécs-techniques-socle-ha-mqtt-v4.3.md)
 * 
 * **Exemple :**
 * - Un service ne peut accéder qu'à sa propre section de configuration
 * - Pas d'accès aux autres sections
 */

import { SaveResult } from './writer';

/**
 * Type générique pour la configuration d'une section spécifique.
 * Chaque application définit son propre type.
 */
export type AppSectionConfig<T = any> = T;

/**
 * Interface pour accéder à la configuration d'une application.
 * Une application ne peut accéder qu'à son propre chapitre de configuration.
 */
export interface IAppConfigProvider<T = any> {
  /**
   * Retourne la configuration complète de l'application.
   * **À utiliser avec parcimonie** - préférer les méthodes typées.
   */
  getAppConfig(): T;

  /**
   * Sauvegarde une section partielle de la configuration.
   * 
   * @param partialConfig - Configuration partielle de la section de l'application
   * @returns Résultat de la sauvegarde
   */
  savePartialConfig(partialConfig: T): SaveResult;

  /**
   * Recharge la configuration depuis le fichier.
   * Utile pour les tests ou après une modification externe.
   */
  reload(): void;
}

/**
 * Factory pour créer un IAppConfigProvider à partir d'une section de configuration.
 * 
 * @param section - Nom de la section
 * @param configService - Instance de ConfigService (couche Infrastructure)
 * @returns IAppConfigProvider<T> limité à la section demandée
 */
export function createAppConfigProvider<T>(section: string): IAppConfigProvider<T> {
  // Cette fonction sera implémentée dans ConfigService ou un adapter
  // Pour l'instant, elle sert de contrat pour l'injection
  throw new Error('Implémentation requise : Utiliser ConfigServiceAdapter ou une implémentation concrète');
}
