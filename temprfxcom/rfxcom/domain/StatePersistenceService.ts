// src/applications/rfxcom/domain/StatePersistenceService.ts
// Service de persistance des états RFXCOM
// Conforme à specs-fonctionnelles-rfxcom-v5.0.md

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Logger } from '../../../infrastructure/logger/index';
import type { RfxComDevice } from './types';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';


// =============================================================================
// Types
// =============================================================================

/**
 * État persiste pour un device RFXCOM.
 */
export interface PersistedDeviceState {
  deviceId: string;              // ID unique du device
  sensorId: string;              // ID du capteur
  name: string;                 // Nom du device
  type: string;                 // Type de device
  protocol: string;             // Protocole RF
  state: any;                   // État actuel (structure RfxComDeviceState)
  signalStrength: number;       // Force du signal (0-100)
  batteryLevel?: number;        // Niveau de batterie (0-100)
  lastSeen: string;             // ISO8601 - Dernière fois vu
  rssi: number;                // RSSI (dBm)
  subunitCode?: number;         // Code sous-unité
  unitCode: number;             // Code unité
  groupCode?: string;           // Code de groupe
  houseCode?: string;           // Code maison
  version: number;              // Version du schéma (1 = actuelle)
}

/**
 * Format de stockage YAML.
 */
export interface PersistenceStorage {
  version: number;
  lastPersisted: string;
  devices: Record<string, PersistedDeviceState>; // key = deviceId
}

/**
 * Configuration du service de persistance.
 */
export interface StatePersistenceConfig {
  dataDir: string; // Répertoire de stockage (ex: '/app/data/rfxcom')
  fileName: string; // Nom du fichier (ex: 'states.yaml')
  batchIntervalMs: number; // Intervalle de batch (default: 5000 = 5s)
  maxBatchSize: number; // Taille max du batch avant écriture forcée (default: 100)
}

// =============================================================================
// Constantes
// =============================================================================

const CURRENT_VERSION = 1;
const DEFAULT_CONFIG: StatePersistenceConfig = {
  dataDir: process.env.RFXCOM_DATA_DIR || '/app/data/rfxcom',
  fileName: 'states.yaml',
  batchIntervalMs: 5000,
  maxBatchSize: 100,
};

// =============================================================================
// StatePersistenceService
// =============================================================================

/**
 * Service de persistance des états RFXCOM.
 * 
 * **Utilisation :**
 * ```typescript
 * const persistence = new StatePersistenceService(logger);
 * 
 * // Persister un état (ajouté au batch)
 * await persistence.persistDevice(device);
 * 
 * // Charger tous les états au démarrage
 * const allStates = await persistence.loadAllStates();
 * 
 * // Démarrer le batch
 * persistence.startBatch();
 * 
 * // Arrêter le batch
 * persistence.stopBatch();
 * ```
 */
export class StatePersistenceService {
  private logger: Logger;
  private config: StatePersistenceConfig;
  private filePath: string;
  
  // Batch de persistence
  private batch: Map<string, PersistedDeviceState> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  // Cache des états chargés
  private loadedStates: Map<string, PersistedDeviceState> = new Map();

  /**
   * @param logger - Logger (requis)
   * @param config - Configuration du service (optionnelle)
   */
  constructor(logger: Logger, config?: Partial<StatePersistenceConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.filePath = join(this.config.dataDir, this.config.fileName);
  }

  // ===========================================================================
  // Méthodes publiques - Batch
  // ===========================================================================

  /**
   * Démarre le batch de persistence.
   * Écrit les états en batch toutes les `batchIntervalMs` millisecondes.
   */
  startBatch(): void {
    if (this.isRunning) {
      this.logger.warn('rfxcom:persist', 'Batch déjà en cours');
      return;
    }

    this.isRunning = true;
    this.logger.info('rfxcom:persist', `Démarrage du batch (intervalle: ${this.config.batchIntervalMs}ms)`);

    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, this.config.batchIntervalMs);
  }

  /**
   * Arrête le batch de persistence.
   * Flush le batch avant de s'arrêter.
   */
  stopBatch(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('rfxcom:persist', 'Arrêt du batch, flush en cours...');
    
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    this.flushBatch();
    this.isRunning = false;
    this.logger.info('rfxcom:persist', 'Batch arrêté');
  }

  /**
   * Force l'écriture du batch sur disque.
   */
  async flushBatch(): Promise<void> {
    if (this.batch.size === 0) {
      return; // Rien à persister
    }

    this.logger.debug('rfxcom:persist', `Flush du batch: ${this.batch.size} états`);

    try {
      await this.writeStatesToDisk();
      this.batch.clear();
      this.logger.info('rfxcom:persist', `Batch persiste: ${this.batch.size} états`);
    } catch (error) {
      this.logger.error('rfxcom:persist', `Erreur lors du flush du batch: ${error}`);
    }
  }

  // ===========================================================================
  // Méthodes publiques - Persistance
  // ===========================================================================

  /**
   * Persiste un device (ajoute au batch).
   * 
   * @param device - Device à persister
   * @returns true si le device a été ajouté au batch, false si rejeté
   */
  persistDevice(device: RfxComDevice): boolean {
    // R4: Ne pas persister si battery_level == 0
    if (device.batteryLevel === 0) {
      this.logger.warn('rfxcom:persist', `Device ${device.id} non persiste: battery_level = 0`);
      return false;
    }

    // R6: Valider l'état
    if (!this.isValidState(device)) {
      this.logger.warn('rfxcom:persist', `Device ${device.id} non persiste: état invalide`);
      return false;
    }

    // Convertir le device en état persistant
    const persistedState: PersistedDeviceState = {
      deviceId: device.id,
      sensorId: device.sensorId ?? '',
      name: device.name,
      type: device.type,
      protocol: device.protocol,
      state: device.state ?? {},
      signalStrength: device.signalStrength ?? 0,
      batteryLevel: device.batteryLevel,
      lastSeen: device.lastSeen ?? '',
      rssi: device.rssi ?? 0,
      subunitCode: device.subunitCode,
      unitCode: device.unitCode ?? 0,
      groupCode: device.groupCode,
      houseCode: device.houseCode,
      version: CURRENT_VERSION,
    };

    this.batch.set(device.id, persistedState);
    
    // Flush forcé si batch trop grand
    if (this.batch.size >= this.config.maxBatchSize) {
      this.flushBatch().catch(error => {
        this.logger.error('rfxcom:persist', `Erreur lors du flush forcé: ${error}`);
      });
    }

    this.logger.debug('rfxcom:persist', `Device ${device.id} ajouté au batch`);
    return true;
  }

  /**
   * Persiste un device immédiatement (sans batch).
   * Utilisé pour la synchronisation initiale.
   * 
   * @param device - Device à persister
   */
  async persistDeviceImmediate(device: RfxComDevice): Promise<boolean> {
    if (!this.isValidState(device)) {
      return false;
    }

    const persistedState: PersistedDeviceState = {
      deviceId: device.id,
      sensorId: device.sensorId ?? '',
      name: device.name,
      type: device.type,
      protocol: device.protocol,
      state: device.state ?? {},
      signalStrength: device.signalStrength ?? 0,
      batteryLevel: device.batteryLevel,
      lastSeen: device.lastSeen ?? '',
      rssi: device.rssi ?? 0,
      subunitCode: device.subunitCode,
      unitCode: device.unitCode ?? 0,
      groupCode: device.groupCode,
      houseCode: device.houseCode,
      version: CURRENT_VERSION,
    };

    try {
      await this.writeSingleState(persistedState);
      this.logger.debug('rfxcom:persist', `Device ${device.id} persiste immédiatement`);
      return true;
    } catch (error) {
      this.logger.error('rfxcom:persist', `Erreur persistance immédiate: ${error}`);
      return false;
    }
  }

  /**
   * Charge tous les états persistés depuis le disque.
   * 
   * @returns Map deviceId → PersistedDeviceState
   */
  async loadAllStates(): Promise<Map<string, PersistedDeviceState>> {
    try {
      const storage = await this.readStorageFromDisk();
      
      if (!storage || !storage.devices) {
        this.logger.info('rfxcom:persist', 'Aucun état persiste trouvé');
        return new Map();
      }

      this.logger.info('rfxcom:persist', `Chargement de ${Object.keys(storage.devices).length} états persistés`);
      
      // Convertir en Map
      const states = new Map<string, PersistedDeviceState>();
      for (const [deviceId, state] of Object.entries(storage.devices)) {
        states.set(deviceId, state);
      }

      this.loadedStates = states;
      return states;
    } catch (error) {
      this.logger.error('rfxcom:persist', `Erreur lors du chargement des états: ${error}`);
      return new Map();
    }
  }

  /**
   * Charge un état spécifique depuis le disque.
   * 
   * @param deviceId - ID du device
   * @returns État persiste ou null
   */
  async loadState(deviceId: string): Promise<PersistedDeviceState | null> {
    const allStates = await this.loadAllStates();
    return allStates.get(deviceId) || null;
  }

  /**
   * Supprime un état persiste.
   * 
   * @param deviceId - ID du device
   */
  async deleteState(deviceId: string): Promise<boolean> {
    try {
      const storage = await this.readStorageFromDisk() || this.createEmptyStorage();
      
      if (storage.devices && storage.devices[deviceId]) {
        delete storage.devices[deviceId];
        await this.writeStorageToDisk(storage);
        this.loadedStates.delete(deviceId);
        this.logger.info('rfxcom:persist', `État supprimé: ${deviceId}`);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('rfxcom:persist', `Erreur suppression état: ${error}`);
      return false;
    }
  }

  /**
   * Supprime tous les états persistés.
   */
  async clearAllStates(): Promise<boolean> {
    try {
      await this.writeStorageToDisk(this.createEmptyStorage());
      this.loadedStates.clear();
      this.logger.info('rfxcom:persist', 'Tous les états ont été supprimés');
      return true;
    } catch (error) {
      this.logger.error('rfxcom:persist', `Erreur suppression tous les états: ${error}`);
      return false;
    }
  }

  /**
   * Crée un stockage vide.
   */
  private createEmptyStorage(): PersistenceStorage {
    return {
      version: CURRENT_VERSION,
      lastPersisted: new Date().toISOString(),
      devices: {},
    };
  }

  // ===========================================================================
  // Méthodes privées
  // ===========================================================================

  /**
   * Vérifie si un état est valide avant persistance (R6).
   */
  private isValidState(device: RfxComDevice): boolean {
    const state: any = device.state ?? {};
    
    // Vérifier selon le type de device
    switch (device.type) {
      case 'sensor':
        // Pour les capteurs, vérifier les valeurs numériques
        if (state.temperature !== undefined) {
          if (state.temperature < -50 || state.temperature > 100) {
            return false;
          }
        }
        if (state.humidity !== undefined) {
          if (state.humidity < 0 || state.humidity > 100) {
            return false;
          }
        }
        break;
        
      case 'light':
      case 'switch':
        // État binaire ou avec brightness
        if (state.on !== undefined && typeof state.on !== 'boolean') {
          return false;
        }
        if (state.brightness !== undefined) {
          if (state.brightness < 0 || state.brightness > 100) {
            return false;
          }
        }
        break;
        
      case 'cover':
        // Position entre 0 et 100
        if (state.position !== undefined) {
          if (state.position < 0 || state.position > 100) {
            return false;
          }
        }
        break;
    }
    
    // Par défaut, accepter si l'état est défini
    return state !== undefined && state !== null;
  }

  /**
   * Lit le stockage depuis le disque.
   */
  private async readStorageFromDisk(): Promise<PersistenceStorage | null> {
    if (!existsSync(this.filePath)) {
      return null;
    }

    try {
      const content = await readFile(this.filePath, 'utf-8');
      return yamlLoad(content) as PersistenceStorage;
    } catch (error) {
      this.logger.error('rfxcom:persist', `Erreur lecture fichier: ${error}`);
      return null;
    }
  }

  /**
   * Écrit le stockage complet sur disque.
   */
  private async writeStorageToDisk(storage: PersistenceStorage): Promise<void> {
    // Créer le répertoire si nécessaire
    await mkdir(dirname(this.filePath), { recursive: true });

    const yamlContent = yamlDump(storage, {
      indent: 2,
      sortKeys: false,
    });

    await writeFile(this.filePath, yamlContent, 'utf-8');
    this.logger.debug('rfxcom:persist', `Fichier persiste: ${this.filePath}`);
  }

  /**
   * Écrit les états du batch sur disque.
   */
  private async writeStatesToDisk(): Promise<void> {
    const storage = await this.readStorageFromDisk() || this.createEmptyStorage();

    // Fusionner avec le batch
    for (const [deviceId, state] of this.batch) {
      storage.devices[deviceId] = state;
      storage.lastPersisted = new Date().toISOString();
    }

    await this.writeStorageToDisk(storage);
  }

  /**
   * Écrit un seul état sur disque (pour la persistance immédiate).
   */
  private async writeSingleState(state: PersistedDeviceState): Promise<void> {
    const storage = await this.readStorageFromDisk() || this.createEmptyStorage();

    storage.devices[state.deviceId] = state;
    storage.lastPersisted = new Date().toISOString();

    await this.writeStorageToDisk(storage);
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  /**
   * Récupère le chemin du fichier de persistance.
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Récupère la taille actuelle du batch.
   */
  getBatchSize(): number {
    return this.batch.size;
  }

  /**
   * Vérifie si le batch est en cours d'exécution.
   */
  isBatchRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Récupère tous les états chargés en mémoire.
   */
  getLoadedStates(): Map<string, PersistedDeviceState> {
    return new Map(this.loadedStates);
  }
}

export { CURRENT_VERSION, DEFAULT_CONFIG };
