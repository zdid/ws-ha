/**
 * AppConfigProvider - Adaptateur pour fournir l'accès à une section spécifique de la configuration.
 * 
 * **Rôle :**
 * - Implémente IAppConfigProvider pour une section donnée
 * - Fournit à la couche Métier un accès LIMITÉ à sa propre configuration
 * - Respecte le principe : "Une application ne peut accéder qu'à son chapitre" (point 4 utilisateur)
 * 
 * **Conforme à :** specs-techniques-socle-ha-mqtt-v4.3.md (architecture 5 couches)
 */

import { ConfigService } from './ConfigService';
import type { IAppConfigProvider, AppSectionConfig } from './IAppConfigProvider';
import type { SaveResult } from './writer';
import type { AppConfig } from './schema';

/**
 * Adaptateur pour une section spécifique de la configuration.
 * 
 * @template T - Type de la section de configuration
 */
export class AppConfigProvider<T extends AppSectionConfig> implements IAppConfigProvider<T> {
  private section: keyof AppConfig;

  /**
   * Crée un nouveau AppConfigProvider pour une section donnée.
   * 
   * @param section - Nom de la section
   * @param configService - Instance de ConfigService (couche Infrastructure)
   */
  constructor(section: keyof AppConfig, private configService: ConfigService) {
    this.section = section;
  }

  /**
   * Retourne la configuration de la section de l'application.
   * **Accès limité** à la section demandée.
   *
   * Si la section est absente de config.yaml (première installation, application jamais
   * configurée via l'UI), retourne un objet vide plutôt que de lever une exception : chaque
   * application connaît son propre schéma Zod / DEFAULT_XXX_CONFIG (le core ne les connaît pas,
   * les modules étant chargés dynamiquement) — c'est à l'application de fusionner ce résultat
   * avec ses propres valeurs par défaut avant de l'utiliser.
   */
  getAppConfig(): T {
    const fullConfig = this.configService.getConfig();
    const sectionConfig = (fullConfig as Record<string, unknown>)[this.section as string];

    return (sectionConfig ?? {}) as T;
  }

  /**
   * Sauvegarde la configuration de la section.
   * 
   * @param partialConfig - Configuration partielle de la section
   */
  savePartialConfig(partialConfig: T): SaveResult {
    return this.configService.savePartialConfig(this.section as any, partialConfig as any);
  }

  /**
   * Recharge la configuration depuis le fichier.
   */
  reload(): void {
    this.configService.reload();
  }
}

/**
 * Factory pour créer un AppConfigProvider typé.
 * 
 * @param section - Nom de la section
 * @param configService - Instance de ConfigService
 * @returns AppConfigProvider<T> prêt à l'emploi
 * 
 * **Exemple :**
 * ```typescript
 * const configProvider = createAppConfigProvider<ModuleConfig>('moduleName', configService);
 * ```
 */
export function createAppConfigProvider<T extends AppSectionConfig>(
  section: keyof AppConfig,
  configService: ConfigService
): AppConfigProvider<T> {
  return new AppConfigProvider<T>(section, configService);
}
