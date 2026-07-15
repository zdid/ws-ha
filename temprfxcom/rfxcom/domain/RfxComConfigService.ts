// src/applications/rfxcom/domain/RfxComConfigService.ts
// Service de configuration RFXCOM
// Conforme à specs-presentation-v2.0.md §8.1 et specs-fonctionnelles-rfxcom-v5.0.md

import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { Logger } from '../../../infrastructure/logger/index';
import type { ConfigService } from '../../../infrastructure/config/ConfigService';
import type { EventBus } from '../../../application/EventBus';
import type { RfxComDevicesConfig, RfxComDevice } from './types';
import type { RfxComConfig, RfxComReceiver, RfxComScene } from './config-schema';
import { RFXCOM_SOCKET_EVENTS } from './socket-events';
import { RfxComDevicesConfig as RfxComDevicesConfigType } from './types';

/**
 * RfxComConfigService - Gère la configuration spécifique RFXCOM
 * 
 * Responsabilités :
 * - Chargement de la configuration des devices depuis config-rfxcom-devices-v1.0.yaml
 * - Sauvegarde de la configuration des devices
 * - Gestion du rechargement automatique
 * - Validation de la configuration
 */
export class RfxComConfigService {
  private logger: Logger;
  private configService: ConfigService;
  private eventBus: EventBus;
  
  // Configuration chargée
  private devicesConfig: RfxComDevicesConfig | null = null;
  
  // Timer pour le rechargement automatique
  private reloadTimer: NodeJS.Timeout | null = null;
  
  // Callbacks pour les changements
  private onConfigChangeCallbacks: Array<() => void> = [];

  /**
   * Crée un nouveau RfxComConfigService
   * @param logger - Instance du logger
   * @param configService - Instance de ConfigService
   * @param eventBus - Instance de l'EventBus
   */
  constructor(
    logger: Logger,
    configService: ConfigService,
    eventBus: EventBus
  ) {
    this.logger = logger;
    this.configService = configService;
    this.eventBus = eventBus;
  }

  /**
   * Initialise le service de configuration RFXCOM
   */
  async initialize(): Promise<void> {
    try {
      // Charger la configuration RFXCOM principale
      const rfxcomConfig = this.configService.getConfig().rfxcom as RfxComConfig;
      
      if (rfxcomConfig) {
        // Charger la configuration des devices
        await this.loadDevicesConfig(rfxcomConfig.devicesConfigPath);
        
        // Démarrer le rechargement automatique si activé
        if (rfxcomConfig.autoReloadConfigMs > 0) {
          this.startAutoReload(rfxcomConfig.autoReloadConfigMs);
        }
        
        this.logger.info('RfxComConfigService', `Configuration RFXCOM initialisée: ${this.devicesConfig?.devices.length || 0} devices chargés`);
      } else {
        this.logger.warn('RfxComConfigService', 'Configuration RFXCOM non trouvée');
      }
    } catch (error) {
      this.logger.error('RfxComConfigService', `Erreur d'initialisation: ${error}`);
      throw error;
    }
  }

  /**
   * Charge la configuration des devices depuis le fichier YAML
   * @param configPath - Chemin vers le fichier de configuration
   */
  async loadDevicesConfig(configPath: string): Promise<void> {
    try {
      // Vérifier si le fichier existe
      try {
        await stat(configPath);
      } catch {
        // Fichier non trouvé - créer une configuration par défaut
        this.devicesConfig = this.createDefaultDevicesConfig();
        await this.saveDevicesConfig(configPath, this.devicesConfig);
        this.logger.info('RfxComConfigService', `Fichier de configuration créé: ${configPath}`);
        return;
      }

      // Lire le fichier
      const fileContent = await readFile(configPath, 'utf-8');
      
      // Parser YAML
      const rawConfig = yaml.load(fileContent) as unknown;
      
      // Valider avec Zod
      const devicesConfig = this.validateDevicesConfig(rawConfig);
      
      if (devicesConfig.valid) {
        this.devicesConfig = devicesConfig.data!;
        this.logger.info('RfxComConfigService', `Configuration des devices chargée: ${this.devicesConfig.devices.length} devices`);
        
        // Notifier les callbacks
        this.notifyConfigChange();
      } else {
        this.logger.error('RfxComConfigService', `Configuration des devices invalide: ${devicesConfig.errors.join(', ')}`);
        
        // Créer une configuration par défaut
        this.devicesConfig = this.createDefaultDevicesConfig();
      }
    } catch (error) {
      this.logger.error('RfxComConfigService', `Erreur de chargement de la configuration des devices: ${error}`);
      
      // Créer une configuration par défaut en cas d'erreur
      this.devicesConfig = this.createDefaultDevicesConfig();
      throw error;
    }
  }

  /**
   * Valide une configuration des devices avec Zod
   */
  private validateDevicesConfig(config: unknown): {
    valid: boolean;
    errors: string[];
    data?: RfxComDevicesConfig;
  } {
    // Schéma Zod pour la configuration des devices
    const devicesConfigSchema = z.object({
      version: z.string().min(1, 'Version is required'),
      devices: z.array(z.object({
        id: z.string().min(1, 'ID is required'),
        name: z.string().min(1, 'Name is required'),
        deviceId: z.string().min(1, 'Device ID is required'),
        sensorId: z.string().optional(),
        type: z.enum(['light', 'switch', 'cover', 'sensor', 'scene', 'thermostat']),
        protocol: z.enum([
          'lighting1', 'lighting2', 'lighting3', 'lighting4', 'lighting5', 'lighting6',
          'switch1', 'switch2',
          'blinds1', 'blinds2', 'blinds3',
          'sensor1'
        ]),
        subunitCode: z.number().int().nonnegative().max(255).optional(),
        unitCode: z.number().int().nonnegative().max(255),
        groupCode: z.string().optional(),
        houseCode: z.string().optional(),
        lastSeen: z.string().optional(),
        rssi: z.number().optional(),
      })),
      lastUpdated: z.string().optional(),
    });

    const result = devicesConfigSchema.safeParse(config);
    
    if (result.success) {
      return {
        valid: true,
        errors: [],
        data: result.data,
      };
    }

    const errors = result.error.errors.map(zodError => {
      return `${zodError.path.join('.')}: ${zodError.message}`;
    });

    return {
      valid: false,
      errors,
    };
  }

  /**
   * Crée une configuration des devices par défaut
   */
  private createDefaultDevicesConfig(): RfxComDevicesConfig {
    return {
      version: '1.0',
      devices: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Sauvegarde la configuration des devices dans le fichier YAML
   * @param configPath - Chemin vers le fichier de configuration
   * @param config - Configuration à sauvegarder
   */
  async saveDevicesConfig(configPath: string, config: RfxComDevicesConfig): Promise<void> {
    try {
      // Valider la configuration
      const validation = this.validateDevicesConfig(config);
      if (!validation.valid) {
        throw new Error(`Configuration invalide: ${validation.errors.join(', ')}`);
      }

      // Convertir en YAML
      const yamlContent = yaml.dump(config, {
        indent: 2,
        sortKeys: true,
        noRefs: true,
      });

      // Assurer que le répertoire existe
      const dirPath = path.dirname(configPath);
      await this.ensureDirectoryExists(dirPath);

      // Écrire atomiquement (via un fichier temporaire)
      const tempPath = `${configPath}.tmp`;
      await writeFile(tempPath, yamlContent, 'utf-8');
      await this.renameFile(tempPath, configPath);

      // Mettre à jour la configuration en mémoire
      this.devicesConfig = config;
      
      // Notifier les callbacks
      this.notifyConfigChange();
      
      this.logger.info('RfxComConfigService', `Configuration des devices sauvegardée: ${config.devices.length} devices`);
    } catch (error) {
      this.logger.error('RfxComConfigService', `Erreur de sauvegarde de la configuration des devices: ${error}`);
      throw error;
    }
  }

  /**
   * Vérifie que le répertoire existe, le crée si nécessaire
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await stat(dirPath);
    } catch {
      // Répertoire non trouvé - le créer
      const { mkdir } = await import('node:fs/promises');
      await mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Renomme un fichier (atomic move)
   */
  private async renameFile(oldPath: string, newPath: string): Promise<void> {
    const { rename } = await import('node:fs/promises');
    await rename(oldPath, newPath);
  }

  /**
   * Démarre le rechargement automatique de la configuration
   * @param intervalMs - Intervalle en millisecondes
   */
  private startAutoReload(intervalMs: number): void {
    // Arrêter un timer existant
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(async () => {
      try {
        const rfxcomConfig = this.configService.getConfig().rfxcom as RfxComConfig;
        if (rfxcomConfig) {
          await this.loadDevicesConfig(rfxcomConfig.devicesConfigPath);
        }
        
        // Relancer le timer
        this.startAutoReload(intervalMs);
      } catch (error) {
        this.logger.error('RfxComConfigService', `Erreur de rechargement automatique: ${error}`);
        
        // Relancer quand même le timer
        this.startAutoReload(intervalMs);
      }
    }, intervalMs);

    this.logger.debug('RfxComConfigService', `Rechargement automatique démarré (${intervalMs}ms)`);
  }

  /**
   * Arrête le rechargement automatique
   */
  stopAutoReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
      this.logger.debug('RfxComConfigService', 'Rechargement automatique arrêté');
    }
  }

  /**
   * Recharge manuellement la configuration
   */
  async reload(): Promise<void> {
    try {
      const rfxcomConfig = this.configService.getConfig().rfxcom as RfxComConfig;
      if (rfxcomConfig) {
        await this.loadDevicesConfig(rfxcomConfig.devicesConfigPath);
        
        // Émettre un événement de rechargement
        this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.CONFIG_RELOAD, {
          success: true,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error('RfxComConfigService', `Erreur de rechargement manuel: ${error}`);
      
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.CONFIG_RELOAD, {
        success: false,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * S'abonne aux changements de configuration
   * @param callback - Callback à appeler lors d'un changement
   * @returns Fonction pour se désabonner
   */
  onConfigChange(callback: () => void): () => void {
    this.onConfigChangeCallbacks.push(callback);
    return () => {
      this.onConfigChangeCallbacks = this.onConfigChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Notifie tous les callbacks d'un changement de configuration
   */
  private notifyConfigChange(): void {
    for (const callback of this.onConfigChangeCallbacks) {
      try {
        callback();
      } catch (error) {
        this.logger.error('RfxComConfigService', `Erreur dans un callback de changement de configuration: ${error}`);
      }
    }
  }

  /**
   * Récupère la configuration des devices
   */
  getDevicesConfig(): RfxComDevicesConfig | null {
    return this.devicesConfig;
  }

  /**
   * Récupère la liste des devices
   */
  getDevices(): RfxComDevice[] {
    return this.devicesConfig?.devices || [];
  }

  /**
   * Récupère un device par son ID
   */
  getDevice(deviceId: string): RfxComDevice | undefined {
    return this.devicesConfig?.devices.find(d => d.id === deviceId);
  }

  /**
   * Ajoute un device à la configuration
   */
  async addDevice(device: RfxComDevice): Promise<void> {
    try {
      if (!this.devicesConfig) {
        this.devicesConfig = this.createDefaultDevicesConfig();
      }

      // Vérifier si le device existe déjà
      const existingIndex = this.devicesConfig.devices.findIndex(d => d.id === device.id);
      if (existingIndex >= 0) {
        // Mettre à jour le device existant
        this.devicesConfig.devices[existingIndex] = device;
      } else {
        // Ajouter le nouveau device
        this.devicesConfig.devices.push(device);
      }

      // Mettre à jour le timestamp
      this.devicesConfig.lastUpdated = new Date().toISOString();

      // Sauvegarder
      const rfxcomConfig = this.configService.getConfig().rfxcom as RfxComConfig;
      if (rfxcomConfig) {
        await this.saveDevicesConfig(rfxcomConfig.devicesConfigPath, this.devicesConfig);
      }
    } catch (error) {
      this.logger.error('RfxComConfigService', `Erreur lors de l'ajout d'un device: ${error}`);
      throw error;
    }
  }

  /**
   * Met à jour un device dans la configuration
   */
  async updateDevice(deviceId: string, updates: Partial<RfxComDevice>): Promise<void> {
    try {
      if (!this.devicesConfig) {
        throw new Error('Configuration des devices non chargée');
      }

      const deviceIndex = this.devicesConfig.devices.findIndex(d => d.id === deviceId);
      if (deviceIndex < 0) {
        throw new Error(`Device avec ID ${deviceId} non trouvé`);
      }

      // Mettre à jour le device
      this.devicesConfig.devices[deviceIndex] = {
        ...this.devicesConfig.devices[deviceIndex],
        ...updates,
        id: deviceId, // Garantir que l'ID ne change pas
      } as RfxComDevice;

      // Mettre à jour le timestamp
      this.devicesConfig.lastUpdated = new Date().toISOString();

      // Sauvegarder
      const rfxcomConfig = this.configService.getConfig().rfxcom as RfxComConfig;
      if (rfxcomConfig) {
        await this.saveDevicesConfig(rfxcomConfig.devicesConfigPath, this.devicesConfig);
      }
    } catch (error) {
      this.logger.error('RfxComConfigService', `Erreur lors de la mise à jour d'un device: ${error}`);
      throw error;
    }
  }

  /**
   * Supprime un device de la configuration
   */
  async removeDevice(deviceId: string): Promise<void> {
    try {
      if (!this.devicesConfig) {
        throw new Error('Configuration des devices non chargée');
      }

      const deviceIndex = this.devicesConfig.devices.findIndex(d => d.id === deviceId);
      if (deviceIndex < 0) {
        throw new Error(`Device avec ID ${deviceId} non trouvé`);
      }

      // Supprimer le device
      this.devicesConfig.devices.splice(deviceIndex, 1);

      // Mettre à jour le timestamp
      this.devicesConfig.lastUpdated = new Date().toISOString();

      // Sauvegarder
      const rfxcomConfig = this.configService.getConfig().rfxcom as RfxComConfig;
      if (rfxcomConfig) {
        await this.saveDevicesConfig(rfxcomConfig.devicesConfigPath, this.devicesConfig);
      }
    } catch (error) {
      this.logger.error('RfxComConfigService', `Erreur lors de la suppression d'un device: ${error}`);
      throw error;
    }
  }

  /**
   * Arrête le service de configuration
   */
  async stop(): Promise<void> {
    this.stopAutoReload();
    this.logger.info('RfxComConfigService', 'Service de configuration RFXCOM arrêté');
  }
}
