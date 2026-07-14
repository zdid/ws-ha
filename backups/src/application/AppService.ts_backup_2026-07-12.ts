// src/application/AppService.ts
// Service d'orchestration de l'application
// Conforme à specs-techniques-socle-ha-mqtt-v4.3.md §10.1 et specs-presentation-v2.0.md §4.2

import { readdir, stat } from 'node:fs/promises';
import { Dirent, existsSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EventBus } from './EventBus';
import type { RestartManager } from './RestartManager';
import type { SocketBridge } from './SocketBridge';
import type { ConfigService } from '../infrastructure/config/ConfigService';
import type { Logger } from '../infrastructure/logger/index';
import type { HaWsClient } from '../ha/sync/HaWsClient';
import type { HaStructureRegistry } from '../ha/sync/HaStructureRegistry';
import type {
  TechnicalConfig,
  AppConfig,
  ConfigValidationResult,
  ConfigSaveResult,
  ApplicationModule,
  ValidationError,
  ValidationWarning,
} from '../types/config';
import { technicalConfigSchema, getRequiredMissing } from '../types/config';

/**
 * AppService - Orchestre le cycle de vie de l'application
 * 
 * Responsabilités (conforme §6.1 specs-presentation-v2.0) :
 * - Détection automatique des modules d'application
 * - Gestion de la configuration
 * - Coordination entre les couches
 * - Émission des événements système
 */
export class AppService {
  private eventBus: EventBus;
  private configService: ConfigService;
  private socketBridge: SocketBridge;
  private restartManager: RestartManager;
  private logger: Logger;
  
  // Composants HA
  private haWsClient?: HaWsClient;
  private haStructureRegistry?: HaStructureRegistry;
  
  // Liste des modules détectés
  private modules: ApplicationModule[] = [];
  
  // Statut de l'application
  private haConnected: boolean = false;
  private startTime: number = Date.now();

  /**
   * Crée un nouveau AppService
   */
  constructor(
    eventBus: EventBus,
    configService: ConfigService,
    socketBridge: SocketBridge,
    restartManager: RestartManager,
    logger: Logger,
    haWsClient?: HaWsClient,
    haStructureRegistry?: HaStructureRegistry
  ) {
    this.eventBus = eventBus;
    this.configService = configService;
    this.socketBridge = socketBridge;
    this.restartManager = restartManager;
    this.logger = logger;
    this.haWsClient = haWsClient;
    this.haStructureRegistry = haStructureRegistry;

    // Initialiser
    this.setupEventListeners();
  }

  /**
   * Configure les listeners EventBus
   */
  private setupEventListeners(): void {
    // Écouter les demandes de configuration
    this.eventBus.on('config:get', () => this.handleConfigGet());
    this.eventBus.on('config:save:requested', (config) => this.handleConfigSave(config as TechnicalConfig));
    this.eventBus.on('config:validate:requested', (config) => this.handleConfigValidate(config as TechnicalConfig));
    
    // Écouter les demandes de modules
    this.eventBus.on('app:modules:config:get', (data) => this.handleModuleConfigGet(data));
    this.eventBus.on('app:modules:config:save', (data) => this.handleModuleConfigSave(data));
  }

  /**
   * Démarre l'application
   * Conforme à specs-techniques-socle-ha-mqtt-v4.3.md §10.1
   */
  async start(): Promise<void> {
    this.logger.info('AppService', 'Démarrage de l\'application...');

    // 1. Détecter les modules d'application
    await this.detectApplicationModules();
    this.logger.info('AppService', `Modules détectés : ${this.modules.map(m => m.id).join(', ')}`);

    // 2. Charger et valider la configuration
    await this.loadAndValidateConfig();

    // 3. Émettre la liste des modules vers l'UI
    this.eventBus.emit('app:modules:registered', { modules: this.modules });

    // 4. Démarrer HA WebSocket (si configuré)
    if (this.haWsClient) {
      this.startHaWsClient();
    }

    this.logger.info('AppService', 'Application démarrée');
  }

  /**
   * Détecte automatiquement les modules d'application dans src/applications/
   * Conforme à specs-presentation-v2.0.md §4.3
   */
  private async detectApplicationModules(): Promise<void> {
    try {
      // Module core (paramètres techniques) est toujours présent
      this.modules.push(this.createCoreModule());

      // Chemin vers le répertoire applications (src/applications ou dist/applications)
      // Quand on exécute depuis src/ avec tsx, __dirname = /.../ws-ha/src/application
      // Quand on exécute depuis dist/ en production, __dirname = /.../ws-ha/dist/application
      // Dans les deux cas, projectRoot = /.../ws-ha/
      const projectRoot = process.env.PROJECT_ROOT || path.resolve(path.join(__dirname, '../../../'));
      let appsPath = path.join(projectRoot, 'applications');
      
      // Lister les répertoires dans applications/
      // En production (dist/), on préfère utiliser dist/applications/
      // En développement (src/), on utilise src/applications/
      let dirs: Dirent[] = [];
      
      // Essayer d'abord dist/applications/ (mode production)
      const distAppsPath = path.join(projectRoot, 'dist', 'applications');
      try {
        dirs = await readdir(distAppsPath, { withFileTypes: true });
        appsPath = distAppsPath;
      } catch (err) {
        // Essayer src/applications/ (mode développement)
        const srcAppsPath = path.join(projectRoot, 'src', 'applications');
        try {
          dirs = await readdir(srcAppsPath, { withFileTypes: true });
          appsPath = srcAppsPath;
        } catch (err2) {
          // Essayer applications/ à la racine
          try {
            dirs = await readdir(appsPath, { withFileTypes: true });
          } catch (err3) {
            this.logger.warn('AppService', 'Aucun répertoire applications trouvé');
            return;
          }
        }
      }

      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;

        // Vérifier si le répertoire contient domain/index.ts ou domain/index.js
        const domainIndexTsPath = path.join(appsPath, dir.name, 'domain', 'index.ts');
        const domainIndexJsPath = path.join(appsPath, dir.name, 'domain', 'index.js');
        
        let domainIndexExists = false;
        try {
          await stat(domainIndexTsPath);
          domainIndexExists = true;
        } catch (errTs) {
          try {
            await stat(domainIndexJsPath);
            domainIndexExists = true;
          } catch (errJs) {
            // Aucun fichier index.ts ou index.js trouvé, passer
            continue;
          }
        }
        
        if (!domainIndexExists) continue;
        
        try {
          // Essayer de charger le module
          // Utiliser file:// URL pour ESM et chemin absolu pour CommonJS
          let modulePath = path.join(appsPath, dir.name, 'domain', 'index');
          
          // Ajouter l'extension .ts pour les imports dynamiques ESM
          // En production (dist/), le fichier sera .js
          if (!modulePath.endsWith('.ts') && !modulePath.endsWith('.js')) {
            modulePath += existsSync(`${modulePath}.ts`) ? '.ts' : '.js';
          }
          
          // Convertir en URL file: pour les imports dynamiques
          // Pour Node.js, on peut utiliser import() avec un chemin absolu ou file://
          const moduleUrl = pathToFileURL(modulePath).href;
          
          // Essayer d'importer avec import() d'abord
          let module;
          try {
            module = await import(moduleUrl);
          } catch (importError) {
            // Si l'import ESM échoue, essayer avec require pour CommonJS
            // Utiliser un chemin absolu pour require
            const requirePath = path.resolve(modulePath);
            try {
              module = require(requirePath);
            } catch (requireError) {
              const importMsg = importError instanceof Error ? importError.message : String(importError);
              const requireMsg = requireError instanceof Error ? requireError.message : String(requireError);
              throw new Error(`Impossible de charger le module ${dir.name}: ${importMsg} | ${requireMsg} | path=${modulePath} | requirePath=${requirePath}`);
            }
          }

          // Chercher une constante *APP (ex: RFXCOM_APP)
          const appKey = Object.keys(module).find(k => k.endsWith('_APP'));
          if (appKey && module[appKey]) {
            const appModule = module[appKey] as ApplicationModule;
            
            // Déterminer le statut de configuration
            const configStatus = this.getModuleConfigStatus(appModule);
            
            // Ajouter le module avec son statut
            this.modules.push({
              ...appModule,
              status: configStatus,
            });

            this.logger.info('AppService', `Module détecté : ${appModule.id} (type: ${appModule.type})`);
          }
        } catch (error) {
          this.logger.warn('AppService', `Erreur de chargement du module ${dir.name}: ${error}`);
        }
      }
    } catch (error) {
      this.logger.error('AppService', `Erreur de détection des modules: ${error}`);
    }
  }

  /**
   * Crée le module core (paramètres techniques)
   */
  private createCoreModule(): ApplicationModule {
    return {
      id: 'core',
      name: 'Paramètres Techniques',
      description: 'Configuration globale de l\'application',
      icon: '⚙️',
      type: 'core',
      configurable: true,
      requiredMqtt: false,
      requiredHaWs: false,
      status: 'partial', // À mettre à jour après validation
    };
  }

  /**
   * Détermine le statut de configuration d'un module
   */
  private getModuleConfigStatus(module: ApplicationModule): 'configured' | 'partial' | 'missing' | 'error' {
    // Pour le module core, vérifier la configuration technique
    if (module.id === 'core') {
      return this.getCoreConfigStatus();
    }
    
    // Pour les autres modules, vérifier leurs exigences
    if (module.requiredMqtt && !this.configService.getMqttConfig()) {
      return 'missing';
    }
    
    if (module.requiredHaWs && !this.configService.getHaConfig()) {
      return 'missing';
    }
    
    return 'partial';
  }

  /**
   * Détermine le statut de la configuration technique (core)
   */
  private getCoreConfigStatus(): 'configured' | 'partial' | 'missing' | 'error' {
    const config = this.configService.getConfig();
    const validationResult = this.validateConfig(config as TechnicalConfig);
    const missing = this.getRequiredMissing(config, validationResult);
    
    if (missing.length > 0) {
      return 'missing';
    }
    
    return 'configured';
  }

  /**
   * Récupère les champs requis manquants
   */
  private getRequiredMissing(config: unknown, validationResult: ConfigValidationResult): string[] {
    const requiredFields = ['ha.ws.host', 'ha.ws.token'];
    const configObj = config as Record<string, unknown>;
    return requiredFields.filter(field => {
      const value = this.getNestedValue(configObj, field);
      return value === undefined || value === null || value === '';
    });
  }

  /**
   * Récupère une valeur imbriquée par son chemin
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: any, key) => {
      return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
    }, obj as Record<string, unknown>);
  }

  /**
   * Charge et valide la configuration au démarrage
   */
  private async loadAndValidateConfig(): Promise<void> {
    try {
      const config = this.configService.getConfig();
      const validationResult = this.validateConfig(config);
      
      // Émettre la configuration actuelle
      this.eventBus.emit('config:current', config);
      
      // Émettre le résultat de validation
      this.eventBus.emit('config:validation:result', validationResult);

      if (!validationResult.valid) {
        this.logger.warn('AppService', `Configuration invalide : ${validationResult.errors.length} erreurs`);
      }
    } catch (error) {
      this.logger.error('AppService', `Erreur de chargement de la configuration: ${error}`);
      this.eventBus.emit('config:validation:result', {
        valid: false,
        errors: [{ path: 'config', message: String(error), severity: 'error', section: 'global', required: true }],
        warnings: [],
        requiredMissing: [],
      });
    }
  }

  /**
   * Valide une configuration avec Zod
   */
  validateConfig(config: Partial<TechnicalConfig>): ConfigValidationResult {
    const result = technicalConfigSchema.safeParse(config);
    
    if (result.success) {
      return {
        valid: true,
        errors: [],
        warnings: this.getConfigurationWarnings(result.data),
        requiredMissing: [],
      };
    }

    // Transformer les erreurs Zod en ValidationError
    const errors: ValidationError[] = result.error.errors.map(zodError => ({
      path: zodError.path.join('.'),
      message: zodError.message,
      severity: 'error',
      section: zodError.path[0] as string,
      required: true,
    }));

    return {
      valid: false,
      errors,
      warnings: [],
      requiredMissing: errors.map(e => e.path),
    };
  }

  /**
   * Génère des avertissements pour la configuration
   */
  private getConfigurationWarnings(config: TechnicalConfig): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Avertir si level = debug en production
    const loggingConfig = (config as any).logging as { level?: string } | undefined;
    if (process.env.NODE_ENV === 'production' && loggingConfig?.level === 'debug') {
      warnings.push({
        path: 'logging.level',
        message: 'Recommended: use info or warn level in production',
        severity: 'warning',
        section: 'logging',
        required: false,
      });
    }

    return warnings;
  }

  // ===========================================================================
  // Méthodes pour HA WebSocket
  // ===========================================================================

  /**
   * Démarre le client HA WebSocket
   */
  private startHaWsClient(): void {
    if (!this.haWsClient) return;

    this.haWsClient.connect();

    // @ts-ignore
    this.haWsClient.onConnect(() => {
      this.haConnected = true;
      this.logger.info('AppService', 'Connecté à Home Assistant WebSocket');
      this.eventBus.emitGeneric('ha:connected', undefined);
    });

    // @ts-ignore
    this.haWsClient.onDisconnect((reason?: string) => {
      this.haConnected = false;
      this.logger.warn('AppService', `Déconnecté de Home Assistant WebSocket: ${reason || 'inconnu'}`);
      this.eventBus.emitGeneric('ha:disconnected', undefined);
    });

    // @ts-ignore
    this.haWsClient.onError((error: Error) => {
      this.logger.error('AppService', `Erreur HA WebSocket: ${error.message}`);
    });
  }

  // ===========================================================================
  // Handlers de configuration
  // ===========================================================================

  /**
   * Gère la demande de configuration
   */
  private handleConfigGet(): void {
    const config = this.configService.getConfig();
    this.eventBus.emit('config:current', config);
  }

  /**
   * Gère la sauvegarde de la configuration
   */
  private handleConfigSave(config: TechnicalConfig): void {
    const validationResult = this.validateConfig(config);
    
    if (!validationResult.valid) {
      this.eventBus.emit('config:save:result', {
        success: false,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        message: 'Validation échouée',
      } as ConfigSaveResult);
      return;
    }

    // @ts-ignore
    const saveResult = this.configService.saveConfig(config as unknown as AppConfig);
    
    if (saveResult.success) {
      this.eventBus.emit('config:save:result', {
        success: true,
        message: 'Configuration sauvegardée',
      } as ConfigSaveResult);

      // Recharger la configuration
      this.configService.reload();
      
      // Redémarrer l'application si nécessaire (via RestartManager)
      this.restartManager.scheduleRestart();
    } else {
      this.eventBus.emit('config:save:result', {
        success: false,
        errors: [{ path: 'config', message: saveResult.error || 'Erreur de sauvegarde', severity: 'error', section: 'global', required: true }],
        message: saveResult.error || 'Erreur de sauvegarde',
      } as ConfigSaveResult);
    }
  }

  /**
   * Gère la validation de la configuration
   */
  private handleConfigValidate(config: TechnicalConfig): void {
    const result = this.validateConfig(config);
    this.eventBus.emit('config:validation:result', result);
  }

  /**
   * Gère la demande de configuration d'un module
   */
  private handleModuleConfigGet(data: { moduleId: string }): void {
    const config = this.configService.getConfig();
    const moduleConfig = (config as any)[data.moduleId];
    
    this.eventBus.emit(`module:${data.moduleId}:config`, {
      moduleId: data.moduleId,
      config: moduleConfig,
    });
  }

  /**
   * Gère la sauvegarde de la configuration d'un module
   */
  private handleModuleConfigSave(data: { moduleId: string; config: unknown }): void {
    // Pour l'instant, on émet juste un événement
    // L'implémentation complète sera faite plus tard
    this.eventBus.emit(`module:${data.moduleId}:config:saved`, {
      moduleId: data.moduleId,
      success: true,
    });
  }
}

export default AppService;