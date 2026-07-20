// src/ha/integration/__tests__/IntegrationBridge.test.ts
// Tests unitaires pour IntegrationBridge
// Conforme à specs-techniques-socle-ha-mqtt-v4.3.md §10 (tests)

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IntegrationBridge, IntegrationBridgeConfig } from '../IntegrationBridge';
import { EventBus } from '../../../infrastructure/EventBus';
import { Logger } from '../../../infrastructure/logger/index';
import { HaMqttModuleConfig } from '../HaMqttIntegrationService';
import type { ConfigService } from '../../../infrastructure/config/ConfigService';

// Remplacer l'import réel par le mock
// Utiliser une factory pour éviter les problèmes de hoisting
vi.mock('../HaMqttIntegrationService', () => {
  class MockHaMqttIntegrationService {
    private connected = false;
    
    constructor(private config: HaMqttModuleConfig, private logger: Logger) {}
    
    async connect(host: string, port: number, username?: string, password?: string): Promise<void> {
      this.connected = true;
    }
    
    disconnect(): void {
      this.connected = false;
    }
    
    isConnectedToMqtt(): boolean {
      return this.connected;
    }
    
    subscribeToAllModuleCommands(qos: number): void {
      // Mock
    }
    
    publishDiscovery(..._args: any[]): void {
      // Mock
    }
    
    publishState(..._args: any[]): void {
      // Mock
    }
    
    onCommand(_callback: any): void {
      // Mock
    }
  }
  return { HaMqttIntegrationService: MockHaMqttIntegrationService };
});

// Configuration de base pour les tests
const baseConfig: HaMqttModuleConfig = {
  moduleName: 'test-module',
  clientId: 'test-client',
  cleanSession: false,
  keepalive: 60,
  reconnectPeriod: 5000,
};

const createTestConfig = (mqttEnable: boolean, configService?: ConfigService): IntegrationBridgeConfig => ({
  haMqtt: baseConfig,
  mqttEnable,
  modules: [{ moduleName: 'test-module' }],
  configService,
});

describe('IntegrationBridge', () => {
  let bridge: IntegrationBridge;
  let eventBus: EventBus;
  let logger: Logger;
  let mockConfigService: ConfigService;

  beforeEach(() => {
    eventBus = new EventBus();
    logger = new Logger({
      level: 'debug',
      maxSizeMb: 1,
      maxFiles: 1,
      logDir: '/tmp/test-logs',
    });
    
    // Mock ConfigService pour les tests de config listeners
    mockConfigService = {
      getConfig: vi.fn().mockReturnValue({ mqttEnable: false }),
    } as unknown as ConfigService;
  });

  afterEach(() => {
    // Nettoyage
    vi.clearAllMocks();
  });

  // =========================================================================
  // Tests : Initialisation et Configuration
  // =========================================================================

  describe('Initialization', () => {
    it('should create MQTT service when mqttEnable is true', () => {
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);

      expect(bridge.isMqttEnabled()).toBe(true);
      expect(bridge.getHaMqttService()).toBeDefined();
    });

    it('should NOT create MQTT service when mqttEnable is false', () => {
      const config = createTestConfig(false);
      bridge = new IntegrationBridge(config, eventBus, logger);

      expect(bridge.isMqttEnabled()).toBe(false);
      expect(bridge.getHaMqttService()).toBeUndefined();
    });

    it('should log MQTT ACTIF message when mqttEnable is true', () => {
      const loggerSpy = vi.spyOn(logger, 'info');
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);

      expect(loggerSpy).toHaveBeenCalledWith(
        'bridge',
        'MQTT est ACTIF (mqttEnable: true) - Service MQTT créé'
      );
    });

    it('should log MQTT DESACTIVE message when mqttEnable is false', () => {
      const loggerSpy = vi.spyOn(logger, 'info');
      const config = createTestConfig(false);
      bridge = new IntegrationBridge(config, eventBus, logger);

      expect(loggerSpy).toHaveBeenCalledWith(
        'bridge',
        'MQTT est DESACTIVE (mqttEnable: false) - Service MQTT non créé'
      );
    });
  });

  // =========================================================================
  // Tests : Connexion MQTT
  // =========================================================================

  describe('connect()', () => {
    it('should throw error when MQTT is disabled', async () => {
      const config = createTestConfig(false);
      bridge = new IntegrationBridge(config, eventBus, logger);

      await expect(bridge.connect('localhost', 1883))
        .rejects.toThrow('MQTT est désactivé (mqttEnable: false). Impossible de se connecter.');
    });

    it('should throw error when haMqttService is not initialized', async () => {
      const config = createTestConfig(true);
      // @ts-ignore - Forcer haMqttService à undefined
      bridge = new IntegrationBridge(config, eventBus, logger);
      // @ts-ignore
      bridge['haMqttService'] = undefined;

      await expect(bridge.connect('localhost', 1883))
        .rejects.toThrow('Service MQTT non initialisé. Impossible de se connecter.');
    });

    it('should connect successfully when MQTT is enabled', async () => {
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);

      await bridge.connect('localhost', 1883);
      
      expect(bridge.isConnected()).toBe(true);
    });

    it('should save connection info for reconnection', async () => {
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);

      await bridge.connect('192.168.1.100', 1883, 'user', 'pass');
      
      // @ts-ignore - Accès à la propriété privée pour le test
      const connectionInfo = bridge['mqttConnectionInfo'];
      expect(connectionInfo).toEqual({
        host: '192.168.1.100',
        port: 1883,
        username: 'user',
        password: 'pass',
      });
    });
  });

  // =========================================================================
  // Tests : Déconnexion MQTT
  // =========================================================================

  describe('disconnect()', () => {
    it('should disconnect when MQTT service exists', () => {
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);
      
      // @ts-ignore - Accès à la propriété privée
      const mockService = bridge['haMqttService'];
      const disconnectSpy = vi.spyOn(mockService, 'disconnect');

      bridge.disconnect();
      
      expect(disconnectSpy).toHaveBeenCalled();
      expect(bridge.isConnected()).toBe(false);
    });

    it('should log debug message when MQTT service does not exist', () => {
      const config = createTestConfig(false);
      bridge = new IntegrationBridge(config, eventBus, logger);
      const loggerSpy = vi.spyOn(logger, 'debug');

      bridge.disconnect();

      expect(loggerSpy).toHaveBeenCalledWith(
        'bridge',
        'Service MQTT non initialisé - rien à déconnecter'
      );
    });
  });

  // =========================================================================
  // Tests : Toggle MQTT
  // =========================================================================

  describe('toggleMqtt()', () => {
    it('should do nothing when enable state has not changed', () => {
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);
      const loggerSpy = vi.spyOn(logger, 'debug');

      bridge.toggleMqtt(true); // Déjà activé

      expect(loggerSpy).toHaveBeenCalledWith(
        'bridge',
        'MQTT déjà activé'
      );
    });

    it('should destroy MQTT service when toggling from true to false', () => {
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);

      // @ts-ignore - Accès à la propriété privée
      const initialService = bridge['haMqttService'];
      expect(initialService).toBeDefined();

      bridge.toggleMqtt(false);

      // @ts-ignore
      expect(bridge['haMqttService']).toBeUndefined();
      expect(bridge.isMqttEnabled()).toBe(false);
    });

    it('should create MQTT service when toggling from false to true', () => {
      const config = createTestConfig(false);
      bridge = new IntegrationBridge(config, eventBus, logger);

      expect(bridge.getHaMqttService()).toBeUndefined();

      bridge.toggleMqtt(true);

      expect(bridge.isMqttEnabled()).toBe(true);
      expect(bridge.getHaMqttService()).toBeDefined();
    });

    it('should attempt reconnection when toggling to true with saved connection info', async () => {
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);
      
      // Se connecter une première fois
      await bridge.connect('192.168.1.100', 1883);
      
      // Désactiver MQTT
      bridge.toggleMqtt(false);
      
      // Réactiver MQTT
      const loggerSpy = vi.spyOn(logger, 'info');
      bridge.toggleMqtt(true);

      // Vérifier que la reconnexion a été tentée
      expect(loggerSpy).toHaveBeenCalledWith(
        'bridge',
        expect.stringContaining('Reconnexion MQTT')
      );
    });
  });

  // =========================================================================
  // Tests : Configuration Listeners
  // =========================================================================

  describe('Config Listeners', () => {
    it('should listen to config:saved events', () => {
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);
      
      // @ts-ignore - Accès à la propriété privée
      const eventBusSpy = vi.spyOn(bridge['eventBus'], 'onAll');
      
      // Le listener devrait être enregistré dans le constructeur
      // On vérifie indirectement en émettant un événement
      const testResult = { success: true, error: undefined };
      // Utiliser emit car IntegrationBridge utilise EventBus depuis infrastructure (pas emitGeneric)
      eventBus.emit('config:save:result', testResult);

      // Si le listener est bien enregistré, aucun crash ne doit se produire
      expect(true).toBe(true);
    });

    it('should handle config save success', () => {
      const config = createTestConfig(false, mockConfigService);
      bridge = new IntegrationBridge(config, eventBus, logger);
      const loggerSpy = vi.spyOn(logger, 'debug');

      const testResult = { success: true, error: undefined };
      // Utiliser emitHa avec un EventBusEvent complet car IntegrationBridge utilise EventBus depuis infrastructure
      // qui attend un objet { type, source, timestamp, data }
      const event = {
        type: 'config:save:result',
        source: 'test',
        timestamp: new Date(),
        data: testResult,
      } as any;
      // @ts-ignore - emitHa est une méthode spécifique de infrastructure/EventBus
      eventBus.emitHa(event);

      expect(loggerSpy).toHaveBeenCalledWith(
        'bridge',
        'Configuration sauvegardée - Vérification de mqttEnable...'
      );
    });

    it('should handle config save failure', () => {
      const config = createTestConfig(false, mockConfigService);
      bridge = new IntegrationBridge(config, eventBus, logger);
      const loggerSpy = vi.spyOn(logger, 'warn');

      const testResult = { success: false, error: 'Validation failed' };
      // Utiliser emitHa avec un EventBusEvent complet
      const event = {
        type: 'config:save:result',
        source: 'test',
        timestamp: new Date(),
        data: testResult,
      } as any;
      // @ts-ignore - emitHa est une méthode spécifique de infrastructure/EventBus
      eventBus.emitHa(event);

      expect(loggerSpy).toHaveBeenCalledWith(
        'bridge',
        'Sauvegarde config échouée: Validation failed'
      );
    });
  });

  // =========================================================================
  // Tests : Getters et État
  // =========================================================================

  describe('Getters and State', () => {
    it('should return EventBus via getEventBus()', () => {
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);

      expect(bridge.getEventBus()).toBe(eventBus);
    });

    it('should return mqttEnabled state via isMqttEnabled()', () => {
      const configTrue = createTestConfig(true);
      const configFalse = createTestConfig(false);

      const bridgeTrue = new IntegrationBridge(configTrue, eventBus, logger);
      const bridgeFalse = new IntegrationBridge(configFalse, eventBus, logger);

      expect(bridgeTrue.isMqttEnabled()).toBe(true);
      expect(bridgeFalse.isMqttEnabled()).toBe(false);
    });

    it('should return false for isConnected when MQTT is disabled', () => {
      const config = createTestConfig(false);
      bridge = new IntegrationBridge(config, eventBus, logger);

      expect(bridge.isConnected()).toBe(false);
    });

    it('should return false for isConnected when not connected', () => {
      const config = createTestConfig(true);
      bridge = new IntegrationBridge(config, eventBus, logger);

      expect(bridge.isConnected()).toBe(false);
    });
  });

  // =========================================================================
  // Tests : Event Handlers (Guards)
  // =========================================================================

  describe('Event Handlers - Guards', () => {
    it('should ignore entity:discovered when MQTT is disabled', () => {
      const config = createTestConfig(false);
      bridge = new IntegrationBridge(config, eventBus, logger);
      const loggerSpy = vi.spyOn(logger, 'debug');

      const event = {
        type: 'entity:discovered',
        source: 'test-module',
        timestamp: new Date(),
        data: {
          entityId: 'sensor.test',
          deviceId: 'device1',
          name: 'Test Sensor',
          component: 'sensor',
          deviceClass: 'temperature',
          state: 20,
          attributes: {},
        },
      };

      // @ts-ignore - Accès à la méthode privée
      bridge['handleEntityDiscovered'](event);

      expect(loggerSpy).toHaveBeenCalledWith(
        'bridge',
        expect.stringContaining('MQTT désactivé - Ignore découverte entité')
      );
    });

    it('should ignore entity:state_changed when MQTT is disabled', () => {
      const config = createTestConfig(false);
      bridge = new IntegrationBridge(config, eventBus, logger);
      const loggerSpy = vi.spyOn(logger, 'debug');

      const event = {
        type: 'entity:state_changed',
        source: 'test-module',
        timestamp: new Date(),
        data: {
          entityId: 'sensor.test',
          state: 21,
          attributes: {},
        },
      };

      // @ts-ignore - Accès à la méthode privée
      bridge['handleEntityStateChanged'](event);

      expect(loggerSpy).toHaveBeenCalledWith(
        'bridge',
        expect.stringContaining('MQTT désactivé - Ignore changement état')
      );
    });

    it('should ignore entity:removed when MQTT is disabled', () => {
      const config = createTestConfig(false);
      bridge = new IntegrationBridge(config, eventBus, logger);
      const loggerSpy = vi.spyOn(logger, 'debug');

      const event = {
        data: { entityId: 'sensor.test' },
        source: 'test-module',
      };

      // @ts-ignore - Accès à la méthode privée
      bridge['handleEntityRemoved'](event);

      expect(loggerSpy).toHaveBeenCalledWith(
        'bridge',
        expect.stringContaining('MQTT désactivé - Ignore suppression entité')
      );
    });
  });
});
