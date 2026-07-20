import { AppConfig, HaConfig, MqttConfig, WebConfig, LoggingConfig } from './schema';
import { ConfigLoader } from './loader';
import { ConfigWriter, SaveResult } from './writer';
import type { Logger } from '../logger/index';

/**
 * Service centralisé d'accès à la configuration.
 * 
 * **Pattern :**
 * - Instancié UNE SEULE FOIS dans index.ts (bootstrap)
 * - Injecté dans les services via leurs constructeurs
 * - PAS de singleton global, PAS de méthodes statiques
 * 
 * **Règles :**
 * - Les couches ne lisent PAS config.yaml directement
 * - Les couches ne connaissent PAS ConfigLoader/ConfigWriter
 * - Toute modification de config passe par ConfigWriter (déclenché par Socket.io)
 * 
 * **Exemple d'utilisation :**
 * ```typescript
 * // index.ts (bootstrap)
 * const configService = new ConfigService();
 * const logger = new Logger(configService.getLoggingConfig());
 * const haWsClient = new HaWsClient(configService.getHaWsConfig());
 * 
 * // Dans un service (couche HA)
 * class HaSyncService {
 *   constructor(private configService: ConfigService) {}
 *   
 *   connect() {
 *     const wsConfig = this.configService.getHaWsConfig();
 *     // Utiliser wsConfig.host, wsConfig.port, etc.
 *   }
 * }
 * ```
 */
export class ConfigService {
  private config: AppConfig;
  private readonly loader: ConfigLoader;
  private readonly writer: ConfigWriter;
  private readonly logger: Logger;

  /**
   * @param loader - ConfigLoader pour charger la configuration (default: new ConfigLoader())
   * @param writer - ConfigWriter pour sauvegarder la configuration (default: new ConfigWriter())
   * @param logger - Logger pour les logs
   */
  constructor(
    loader: ConfigLoader = new ConfigLoader(),
    writer: ConfigWriter = new ConfigWriter(),
    logger: Logger
  ) {
    this.loader = loader;
    this.writer = writer;
    this.logger = logger;
    this.config = this.loader.load();
  }

  /**
   * Retourne la configuration complète.
   * **À utiliser avec parcimonie** - préférer les méthodes typées ci-dessous.
   */
  getConfig(): AppConfig {
    return { ...this.config };
  }

  /**
   * Retourne la configuration Home Assistant.
   */
  getHaConfig(): HaConfig | undefined {
    return this.config.ha ? { ...this.config.ha } : undefined;
  }

  /**
   * Retourne la configuration WebSocket HA.
   */
  getHaWsConfig() {
    return this.config.ha?.ws ? { ...this.config.ha.ws } : undefined;
  }

  /**
   * Retourne la configuration de structuration HA.
   */
  getHaStructureConfig() {
    return this.config.ha?.structure ? { ...this.config.ha.structure } : undefined;
  }

  /**
   * Retourne la configuration MQTT (ou undefined si non présente).
   */
  getMqttConfig(): MqttConfig | undefined {
    return this.config.ha?.mqtt ? { ...this.config.ha.mqtt } : undefined;
  }

  /**
   * Retourne la configuration Web.
   */
  getWebConfig(): WebConfig {
    return { ...this.config.web };
  }

  /**
   * Retourne la configuration de logging.
   */
  getLoggingConfig(): LoggingConfig {
    return { ...this.config.logging };
  }

  /**
   * Sauvegarde une nouvelle configuration (via ConfigWriter).
   * **À utiliser uniquement** pour la configuration métier (pas pour HA/MQTT bas niveau).
   * 
   * @param newConfig - Nouvelle configuration complète
   * @returns Résultat de la sauvegarde
   */
  saveConfig(newConfig: AppConfig): SaveResult {
    console.log('[ConfigService SERVEUR] Sauvegarde configuration globale');
    console.log('[ConfigService SERVEUR] Config complète:', JSON.stringify(newConfig, null, 2));
    const result = this.writer.save(newConfig);
    console.log('[ConfigService SERVEUR] Résultat sauvegarde:', result);
    return result;
  }

  /**
   * Sauvegarde une section partielle de la configuration.
   * Utile pour mettre à jour uniquement une partie.
   * 
   * @param section - Nom de la section à sauvegarder
   * @param partialConfig - Configuration partielle de la section
   * @returns Résultat de la sauvegarde
   */
  savePartialConfig<T extends keyof AppConfig>(section: T, partialConfig: AppConfig[T]): SaveResult {
    const newConfig = {
      ...this.config,
      [section]: partialConfig,
    };
    return this.writer.save(newConfig as AppConfig);
  }

  /**
   * Recharge la configuration depuis le fichier.
   * Utile pour les tests ou après une modification externe.
   */
  reload(): void {
    this.config = this.loader.load();
  }

  /**
   * Configurations par défaut pour les sections de modules
   * Utilisées pour auto-initialiser les sections manquantes
   * 
   * NOTE: Les modules peuvent enregistrer leurs propres configurations par défaut
   * dynamiquement via le mécanisme d'enregistrement des modules.
   */
  private static DEFAULT_MODULE_CONFIGS: Record<string, unknown> = {};

  /**
   * Vérifie et initialise les sections de configuration manquantes pour les modules.
   * Si une section n'existe pas dans la config mais que le module est détecté,
   * elle est créée avec ses valeurs par défaut.
   * 
   * @param moduleIds - Liste des identifiants de modules détectés
   */
  ensureModuleSections(moduleIds: string[]): void {
    let needsSave = false;

    for (const moduleId of moduleIds) {
      // Vérifier si la section existe déjà dans la config
      if (this.config[moduleId as keyof AppConfig] === undefined) {
        // Vérifier si on a une config par défaut pour ce module
        const defaultConfig = (ConfigService.DEFAULT_MODULE_CONFIGS as Record<string, unknown>)[moduleId];
        
        if (defaultConfig) {
          // Appliquer la configuration par défaut
          (this.config as Record<string, unknown>)[moduleId] = defaultConfig;
          this.logger.info('ConfigService', `Section '${moduleId}' initialisée avec les valeurs par défaut`);
          needsSave = true;
        } else {
          this.logger.warn('ConfigService', `Pas de configuration par défaut pour le module '${moduleId}'`);
        }
      }
    }

    // Sauvegarder si des modifications ont été apportées
    if (needsSave) {
      this.writer.save(this.config as AppConfig);
    }
  }

  /**
   * Récupère la configuration d'un module spécifique.
   * @param moduleId - Identifiant du module
   * @returns La configuration du module ou undefined si non trouvée
   */
  getModuleConfig<T>(moduleId: string): T | undefined {
    return (this.config as Record<string, unknown>)[moduleId] as T | undefined;
  }

  /**
   * Sauvegarde la configuration d'un module spécifique.
   * @param moduleId - Identifiant du module
   * @param config - Configuration du module à sauvegarder
   * @returns Résultat de la sauvegarde
   */
  saveModuleConfig<T>(moduleId: string, config: T): SaveResult {
    console.log('[ConfigService SERVEUR] Sauvegarde configuration module - moduleId:', moduleId);
    console.log('[ConfigService SERVEUR] Config module:', JSON.stringify(config, null, 2));
    
    const newConfig = {
      ...this.config,
      [moduleId]: config,
    };
    const result = this.writer.save(newConfig as AppConfig);
    console.log('[ConfigService SERVEUR] Résultat sauvegarde module:', result);
    if (result.success) {
      this.config = newConfig as AppConfig;
    }
    return result;
  }
}

export { AppConfig, HaConfig, MqttConfig, WebConfig, LoggingConfig };
