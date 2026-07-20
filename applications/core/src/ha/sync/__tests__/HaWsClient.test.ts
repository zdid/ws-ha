// src/ha/sync/__tests__/HaWsClient.test.ts
// Tests unitaires pour HaWsClient
// Conforme à specs-techniques-socle-ha-mqtt-v4.3.md §10 (tests)

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HaWsClient, HaWsConfig } from '../HaWsClient';
import { HaWsTransport } from '../../../infrastructure/transport/HaWsTransport';
import { Logger } from '../../../infrastructure/logger/index';

// Mock de HaWsTransport
class MockHaWsTransport {
  private connected = false;
  private listeners: Map<string, Function[]> = new Map();
  
  connect(): void {
    this.connected = true;
    // Émettre l'événement de connexion
    this.trigger('connect');
  }
  
  disconnect(): void {
    this.connected = false;
    this.trigger('disconnect');
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  sendMessage(message: any): void {
    // Mock
  }
  
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }
  
  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
  
  private trigger(event: string, ...args: any[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(...args));
    }
  }
}

// Mock de socket.io pour les tests
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  connected: false,
};

// Configuration de test
const testConfig: HaWsConfig = {
  host: '192.168.1.100',
  port: 8123,
  token: 'test-token-12345',
  reconnect_delay: 5,
};

describe('HaWsClient', () => {
  let client: HaWsClient;
  let mockTransport: MockHaWsTransport;
  let logger: Logger;

  beforeEach(() => {
    mockTransport = new MockHaWsTransport();
    logger = new Logger({
      level: 'debug',
      maxSizeMb: 1,
      maxFiles: 1,
      logDir: '/tmp/test-logs',
    });
    
    // Créer le client avec le transport mocké
    // @ts-ignore - On passe le mock au lieu du vrai HaWsTransport
    client = new HaWsClient(testConfig, mockTransport as unknown as HaWsTransport, logger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Tests : Initialisation
  // =========================================================================

  describe('Initialization', () => {
    it('should initialize with configuration', () => {
      expect(client).toBeDefined();
      // @ts-ignore - Accès à la propriété privée
      expect(client['config']).toEqual(testConfig);
    });

    it('should create transport with config values', () => {
      // @ts-ignore - Accès à la propriété privée
      const transport = client['transport'];
      expect(transport).toBeDefined();
    });

    it('should initialize with default state values', () => {
      // @ts-ignore - Accès à la propriété privée
      expect(client['isAuthenticated']).toBe(false);
      // @ts-ignore
      expect(client['isReady']).toBe(false);
    });
  });

  // =========================================================================
  // Tests : Connexion
  // =========================================================================

  describe('connect()', () => {
    it('should call transport.connect()', () => {
      const transportSpy = vi.spyOn(mockTransport, 'connect');
      
      client.connect();
      
      expect(transportSpy).toHaveBeenCalled();
    });

    it('should log connection attempt', () => {
      const loggerSpy = vi.spyOn(logger, 'info');
      
      client.connect();
      
      expect(loggerSpy).toHaveBeenCalledWith(
        'ha:ws',
        `Connexion à HA WebSocket: ${testConfig.host}:${testConfig.port}`
      );
    });
  });

  // =========================================================================
  // Tests : Déconnexion
  // =========================================================================

  describe('disconnect()', () => {
    it('should call transport.disconnect()', () => {
      // D'abord se connecter
      client.connect();
      
      const transportSpy = vi.spyOn(mockTransport, 'disconnect');
      
      client.disconnect();
      
      expect(transportSpy).toHaveBeenCalled();
    });

    it('should log disconnection', () => {
      const loggerSpy = vi.spyOn(logger, 'info');
      
      client.disconnect();
      
      expect(loggerSpy).toHaveBeenCalledWith(
        'ha:ws',
        'Déconnexion de HA WebSocket'
      );
    });

    it('should reset authentication and ready states', () => {
      // @ts-ignore - Simuler la connexion
      client['isAuthenticated'] = true;
      // @ts-ignore
      client['isReady'] = true;

      client.disconnect();

      // @ts-ignore
      expect(client['isAuthenticated']).toBe(false);
      // @ts-ignore
      expect(client['isReady']).toBe(false);
    });
  });

  // =========================================================================
  // Tests : Chargement du référentiel
  // =========================================================================

  describe('loadInitialRegistry()', () => {
    it('should throw error when not authenticated', async () => {
      // @ts-ignore - Pas authentifié
      client['isAuthenticated'] = false;

      await expect(client.loadInitialRegistry())
        .rejects.toThrow('Cannot load registry: not authenticated. Call connect() first.');
    });

    it('should load all registries in parallel', async () => {
      // @ts-ignore - Simuler l'authentification
      client['isAuthenticated'] = true;
      
      // Mock des réponses
      const mockSendRequest = vi.fn();
      // @ts-ignore
      client['sendRequest'] = mockSendRequest;
      
      mockSendRequest
        .mockResolvedValueOnce({ type: 'result', id: 1, result: [] }) // get_states
        .mockResolvedValueOnce({ type: 'result', id: 2, result: { areas: [] } }) // area_registry
        .mockResolvedValueOnce({ type: 'result', id: 3, result: [] }) // device_registry
        .mockResolvedValueOnce({ type: 'result', id: 4, result: [] }); // entity_registry

      await client.loadInitialRegistry();

      expect(mockSendRequest).toHaveBeenCalledTimes(4);
    });

    it('should set isReady to true after loading', async () => {
      // @ts-ignore - Simuler l'authentification
      client['isAuthenticated'] = true;
      
      // Mock des réponses
      const mockSendRequest = vi.fn();
      // @ts-ignore
      client['sendRequest'] = mockSendRequest;
      
      mockSendRequest
        .mockResolvedValueOnce({ type: 'result', id: 1, result: [] })
        .mockResolvedValueOnce({ type: 'result', id: 2, result: { areas: [] } })
        .mockResolvedValueOnce({ type: 'result', id: 3, result: [] })
        .mockResolvedValueOnce({ type: 'result', id: 4, result: [] });

      // @ts-ignore
      expect(client['isReady']).toBe(false);
      
      await client.loadInitialRegistry();
      
      // @ts-ignore
      expect(client['isReady']).toBe(true);
    });
  });

  // =========================================================================
  // Tests : SendRequest
  // =========================================================================

  describe('sendRequest()', () => {
    it('should send message with incrementing ID', () => {
      const transportSpy = vi.spyOn(mockTransport, 'sendMessage');
      
      // @ts-ignore - Réinitialiser le nextId
      client['nextId'] = 1;
      
      const message = { type: 'get_states' };
      
      // @ts-ignore - Accès à sendRequest
      client['sendRequest'](message);
      
      expect(transportSpy).toHaveBeenCalledWith({
        ...message,
        id: 1,
      });
    });

    it('should increment ID for each request', () => {
      const transportSpy = vi.spyOn(mockTransport, 'sendMessage');
      
      // @ts-ignore
      client['nextId'] = 1;
      
      const message1 = { type: 'get_states' };
      const message2 = { type: 'config/area_registry/list' };
      
      // @ts-ignore
      client['sendRequest'](message1);
      // @ts-ignore
      client['sendRequest'](message2);
      
      expect(transportSpy).toHaveBeenNthCalledWith(1, {
        ...message1,
        id: 1,
      });
      expect(transportSpy).toHaveBeenNthCalledWith(2, {
        ...message2,
        id: 2,
      });
    });

    it('should return promise that resolves with response', async () => {
      const message = { type: 'test_request' };
      const expectedResponse = { type: 'result', id: 1, result: 'test' };
      
      // Mock sendMessage pour simuler une réponse
      // @ts-ignore
      client['sendMessage'] = vi.fn((msg) => {
        // Simuler une réponse asynchrone
        setTimeout(() => {
          // @ts-ignore
          const callback = client['pendingRequests'].get(msg.id);
          if (callback) {
            callback.resolve(expectedResponse);
          }
        }, 0);
      });
      
      // @ts-ignore
      const result = await client['sendRequest'](message);
      
      expect(result).toEqual(expectedResponse);
    });
  });

  // =========================================================================
  // Tests : SendMessage
  // =========================================================================

  describe('sendMessage()', () => {
    it('should send message via transport', () => {
      const transportSpy = vi.spyOn(mockTransport, 'sendMessage');
      
      const message = { type: 'subscribe_events', event_type: 'state_changed' };
      
      // @ts-ignore
      client['sendMessage'](message);
      
      expect(transportSpy).toHaveBeenCalledWith(message);
    });

    it('should increment nextId for messages without id', () => {
      const transportSpy = vi.spyOn(mockTransport, 'sendMessage');
      
      // @ts-ignore
      client['nextId'] = 10;
      
      const message = { type: 'subscribe_events' };
      
      // @ts-ignore
      client['sendMessage'](message);
      
      expect(transportSpy).toHaveBeenCalledWith({
        ...message,
        id: 10,
      });
    });

    it('should not modify message id if already present', () => {
      const transportSpy = vi.spyOn(mockTransport, 'sendMessage');
      
      const message = { id: 999, type: 'subscribe_events' };
      
      // @ts-ignore
      client['sendMessage'](message);
      
      expect(transportSpy).toHaveBeenCalledWith(message);
    });
  });

  // =========================================================================
  // Tests : Callbacks et Listeners
  // =========================================================================

  describe('Callbacks', () => {
    it('should allow registering entity state callback', () => {
      const callback = vi.fn();
      
      // @ts-ignore
      client.onEntityStateChange(callback);
      
      // @ts-ignore - Simuler la réception d'un message state_changed
      const message = {
        type: 'state_changed',
        id: 1,
        event_type: 'state_changed',
        data: {
          entity_id: 'sensor.test',
          state: 'on',
          new_state: {
            entity_id: 'sensor.test',
            state: 'on',
            attributes: {},
            last_changed: new Date().toISOString(),
            last_updated: new Date().toISOString(),
          },
        },
      };
      
      // @ts-ignore - Simuler le traitement du message
      const messageHandler = mockTransport.listeners.get('message')?.[0];
      if (messageHandler) {
        messageHandler(message);
      }
      
      // Note: Ce test dépend de l'implémentation interne du traitement des messages
      // Il peut nécessiter des ajustements selon le code réel
    });

    it('should allow registering connect callback', () => {
      const callback = vi.fn();
      
      // @ts-ignore
      client.onConnect(callback);
      
      // Se connecter
      client.connect();
      
      // Le callback devrait avoir été appelé
      expect(callback).toHaveBeenCalled();
    });

    it('should allow registering disconnect callback', () => {
      const callback = vi.fn();
      
      // @ts-ignore
      client.onDisconnect(callback);
      
      // Se connecter puis déconnecter
      client.connect();
      client.disconnect();
      
      expect(callback).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Tests : Subscription aux événements
  // =========================================================================

  describe('subscribeToEvents()', () => {
    it('should subscribe to all HA events', () => {
      const transportSpy = vi.spyOn(mockTransport, 'sendMessage');
      
      client.subscribeToEvents();
      
      // Devrait s'abonner à : state_changed, area_registry_updated, device_registry_updated, entity_registry_updated
      expect(transportSpy).toHaveBeenCalledTimes(4);
      
      const calls = transportSpy.mock.calls;
      const eventTypes = calls.map(call => call[0].event_type);
      
      expect(eventTypes).toContain('state_changed');
      expect(eventTypes).toContain('area_registry_updated');
      expect(eventTypes).toContain('device_registry_updated');
      expect(eventTypes).toContain('entity_registry_updated');
    });
  });

  // =========================================================================
  // Tests : Envoi de commandes
  // =========================================================================

  describe('sendCommand()', () => {
    it('should send service call message', () => {
      const transportSpy = vi.spyOn(mockTransport, 'sendMessage');
      
      // @ts-ignore - Simuler l'authentification
      client['isAuthenticated'] = true;
      
      client.sendCommand('light', 'turn_on', { entity_id: 'light.salon' }, {});
      
      expect(transportSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'call_service',
        domain: 'light',
        service: 'turn_on',
        service_data: { entity_id: 'light.salon' },
      }));
    });

    it('should throw error when not authenticated', () => {
      // @ts-ignore - Pas authentifié
      client['isAuthenticated'] = false;

      expect(() => {
        client.sendCommand('light', 'turn_on', { entity_id: 'light.salon' }, {});
      }).toThrow('Cannot send command: not authenticated');
    });

    it('should generate unique request IDs', () => {
      // @ts-ignore
      client['isAuthenticated'] = true;
      const transportSpy = vi.spyOn(mockTransport, 'sendMessage');
      
      client.sendCommand('light', 'turn_on', { entity_id: 'light1' }, {});
      client.sendCommand('switch', 'turn_off', { entity_id: 'switch1' }, {});
      
      const calls = transportSpy.mock.calls;
      expect(calls[0][0].id).toBe(1);
      expect(calls[1][0].id).toBe(2);
    });
  });
});
