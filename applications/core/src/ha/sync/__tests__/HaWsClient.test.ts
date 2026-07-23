// src/ha/sync/__tests__/HaWsClient.test.ts
// Tests unitaires pour HaWsClient (implémentation home-assistant-js-websocket)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HaWsConfig } from '../../../infrastructure/config/schema';
import { Logger } from '../../../infrastructure/logger/index';

const createLongLivedTokenAuth = vi.fn();
const createConnection = vi.fn();
const getStates = vi.fn();
const callService = vi.fn();

vi.mock('home-assistant-js-websocket', () => ({
  createLongLivedTokenAuth: (...args: unknown[]) => createLongLivedTokenAuth(...args),
  createConnection: (...args: unknown[]) => createConnection(...args),
  getStates: (...args: unknown[]) => getStates(...args),
  callService: (...args: unknown[]) => callService(...args),
}));

// Import après le mock (HaWsClient importe home-assistant-js-websocket au chargement).
const { HaWsClient } = await import('../HaWsClient');

/** Fake Connection minimal — reproduit la surface utilisée par HaWsClient. */
function createFakeConnection() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    addEventListener: vi.fn((eventType: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(eventType)) listeners.set(eventType, []);
      listeners.get(eventType)!.push(cb);
    }),
    subscribeEvents: vi.fn(),
    sendMessagePromise: vi.fn(),
    close: vi.fn(),
    fire: (eventType: string, ...args: unknown[]) => {
      for (const cb of listeners.get(eventType) ?? []) cb(...args);
    },
  };
}

const testConfig: HaWsConfig = {
  host: '192.168.1.100',
  port: 8123,
  token: 'test-token-12345',
  reconnect_delay: 5,
};

describe('HaWsClient', () => {
  let client: InstanceType<typeof HaWsClient>;
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new Logger({ level: 'debug', maxSizeMb: 1, maxFiles: 1, logDir: '/tmp/test-logs' });
    createLongLivedTokenAuth.mockReturnValue({ hassUrl: `http://${testConfig.host}:${testConfig.port}` });
    client = new HaWsClient(testConfig, logger);
  });

  describe('Initialization', () => {
    it('should initialize with default state values', () => {
      expect(client.getIsAuthenticated()).toBe(false);
      expect(client.getIsReady()).toBe(false);
    });
  });

  describe('connect()', () => {
    it('should build auth from host/port/token and create a connection', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);

      client.connect();
      await vi.waitFor(() => expect(createConnection).toHaveBeenCalled());

      expect(createLongLivedTokenAuth).toHaveBeenCalledWith(
        `http://${testConfig.host}:${testConfig.port}`,
        testConfig.token
      );
      expect(createConnection).toHaveBeenCalledWith(
        expect.objectContaining({ setupRetry: -1 })
      );
    });

    it('should set isAuthenticated and fire onConnect once the connection resolves', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);
      const callback = vi.fn();
      client.onConnect(callback);

      client.connect();
      await vi.waitFor(() => expect(client.getIsAuthenticated()).toBe(true));

      expect(callback).toHaveBeenCalled();
    });

    it('should fire onError and not throw when the connection fails', async () => {
      createConnection.mockRejectedValue(2); // ERR_INVALID_AUTH
      const errorCallback = vi.fn();
      client.onError(errorCallback);

      client.connect();
      await vi.waitFor(() => expect(errorCallback).toHaveBeenCalled());

      expect(errorCallback).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid HA token' }));
      expect(client.getIsAuthenticated()).toBe(false);
    });

    it('should fire onDisconnect when the connection reports disconnected', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);
      const disconnectCallback = vi.fn();
      client.onDisconnect(disconnectCallback);

      client.connect();
      await vi.waitFor(() => expect(client.getIsAuthenticated()).toBe(true));

      fakeConnection.fire('disconnected');

      expect(disconnectCallback).toHaveBeenCalled();
      expect(client.getIsAuthenticated()).toBe(false);
    });
  });

  describe('disconnect()', () => {
    it('should close the connection and reset state', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);
      client.connect();
      await vi.waitFor(() => expect(client.getIsAuthenticated()).toBe(true));

      client.disconnect();

      expect(fakeConnection.close).toHaveBeenCalled();
      expect(client.getIsAuthenticated()).toBe(false);
      expect(client.getIsReady()).toBe(false);
    });
  });

  describe('loadInitialRegistry()', () => {
    it('should throw when not authenticated', async () => {
      await expect(client.loadInitialRegistry())
        .rejects.toThrow('Cannot load registry: not authenticated. Call connect() first.');
    });

    it('should load states + area/device/entity registries in parallel and set isReady', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);
      client.connect();
      await vi.waitFor(() => expect(client.getIsAuthenticated()).toBe(true));

      getStates.mockResolvedValue([{ entity_id: 'sensor.test', state: 'on' }]);
      fakeConnection.sendMessagePromise
        .mockResolvedValueOnce({ areas: [{ area_id: 'a1', name: 'Salon' }] })
        // config/device_registry/list utilise `id` comme identifiant, PAS `device_id`
        // (vérifié en live sur une instance HA réelle) — HaWsClient doit le remapper.
        .mockResolvedValueOnce([{ id: 'd1', name: 'Device 1' }])
        .mockResolvedValueOnce([{ entity_id: 'sensor.test', domain: 'sensor' }]);

      const result = await client.loadInitialRegistry();

      expect(getStates).toHaveBeenCalledWith(fakeConnection);
      expect(fakeConnection.sendMessagePromise).toHaveBeenCalledWith({ type: 'config/area_registry/list' });
      expect(fakeConnection.sendMessagePromise).toHaveBeenCalledWith({ type: 'config/device_registry/list' });
      expect(fakeConnection.sendMessagePromise).toHaveBeenCalledWith({ type: 'config/entity_registry/list' });
      expect(result.entities).toHaveLength(1);
      expect(result.areas).toEqual([{ area_id: 'a1', name: 'Salon' }]);
      expect(result.devices).toEqual([{ device_id: 'd1', name: 'Device 1', area_id: undefined }]);
      expect(client.getIsReady()).toBe(true);
    });
  });

  describe('subscribeToEvents()', () => {
    it('should subscribe to all 4 HA event types', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);
      client.connect();
      await vi.waitFor(() => expect(client.getIsAuthenticated()).toBe(true));

      client.subscribeToEvents();

      expect(fakeConnection.subscribeEvents).toHaveBeenCalledTimes(4);
      const eventTypes = fakeConnection.subscribeEvents.mock.calls.map((call: unknown[]) => call[1]);
      expect(eventTypes).toEqual(
        expect.arrayContaining(['state_changed', 'area_registry_updated', 'device_registry_updated', 'entity_registry_updated'])
      );
    });

    it('should dispatch state_changed to onStateChanged callbacks', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);
      client.connect();
      await vi.waitFor(() => expect(client.getIsAuthenticated()).toBe(true));

      const stateCallback = vi.fn();
      client.onStateChanged(stateCallback);
      client.subscribeToEvents();

      const stateChangedHandler = fakeConnection.subscribeEvents.mock.calls.find(
        (call: unknown[]) => call[1] === 'state_changed'
      )![0];
      stateChangedHandler({ data: { entity_id: 'sensor.test', new_state: { entity_id: 'sensor.test', state: 'on' } } });

      expect(stateCallback).toHaveBeenCalledWith({ entity_id: 'sensor.test', state: 'on' });
    });

    it('should notify area_registry_updated events with action=delete (id only, needed to remove from registry)', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);
      client.connect();
      await vi.waitFor(() => expect(client.getIsAuthenticated()).toBe(true));

      const areaCallback = vi.fn();
      client.onAreaUpdated(areaCallback);
      client.subscribeToEvents();

      const areaHandler = fakeConnection.subscribeEvents.mock.calls.find(
        (call: unknown[]) => call[1] === 'area_registry_updated'
      )![0];
      areaHandler({ data: { area_id: 'a1', action: 'delete' } });

      expect(areaCallback).toHaveBeenCalledWith({ area_id: 'a1', name: '', picture: undefined, action: 'delete' });
    });
  });

  describe('sendCommand()', () => {
    it('should throw when not authenticated', () => {
      expect(() => {
        client.sendCommand('light', 'turn_on', { entity_id: 'light.salon' }, {});
      }).toThrow('Cannot send command: not authenticated');
    });

    it('should delegate to callService with domain/service/serviceData/target', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);
      client.connect();
      await vi.waitFor(() => expect(client.getIsAuthenticated()).toBe(true));

      callService.mockResolvedValue({ ok: true });

      await client.sendCommand('light', 'turn_on', { entity_id: 'light.salon' }, { brightness: 128 });

      expect(callService).toHaveBeenCalledWith(
        fakeConnection,
        'light',
        'turn_on',
        { brightness: 128 },
        { entity_id: 'light.salon' }
      );
    });
  });

  describe('reconfigure()', () => {
    it('should connect with the new config when currently disconnected', () => {
      const connectSpy = vi.spyOn(client, 'connect');
      const newConfig: HaWsConfig = { ...testConfig, host: '192.168.1.200' };

      client.reconfigure(newConfig);

      expect(connectSpy).toHaveBeenCalled();
    });

    it('should reconnect when connected and config changed', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);
      client.connect();
      await vi.waitFor(() => expect(client.getIsAuthenticated()).toBe(true));

      const newConfig: HaWsConfig = { ...testConfig, host: '192.168.1.200' };
      client.reconfigure(newConfig);

      expect(fakeConnection.close).toHaveBeenCalled();
    });

    it('should do nothing when connected and config unchanged', async () => {
      const fakeConnection = createFakeConnection();
      createConnection.mockResolvedValue(fakeConnection);
      client.connect();
      await vi.waitFor(() => expect(client.getIsAuthenticated()).toBe(true));

      client.reconfigure({ ...testConfig });

      expect(fakeConnection.close).not.toHaveBeenCalled();
    });
  });
});
