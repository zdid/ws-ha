// src/ha/integration/__tests__/passthrough.test.ts
// Tests unitaires pour passthrough.ts (fonctions pures)
// Conforme à techniques-socle-ha-mqtt_specs v4.9 §8.5.6

import { describe, it, expect, vi } from 'vitest';
import { publishDiscoveryPassthrough, publishPassthrough } from '../passthrough';
import type { MqttTransport } from '../../../infrastructure/transport/MqttTransport';

describe('publishDiscoveryPassthrough', () => {
  it('réécrit le premier segment du topic source en homeassistant et publie en QoS1/retain', () => {
    const publishSpy = vi.fn();
    const transport = { publish: publishSpy } as unknown as MqttTransport;

    publishDiscoveryPassthrough(transport, 'homeassist/sensor/temp_salon/config', { name: 'Salon' });

    expect(publishSpy).toHaveBeenCalledWith(
      'homeassistant/sensor/temp_salon/config',
      JSON.stringify({ name: 'Salon' }),
      1,
      true
    );
  });
});

describe('publishPassthrough', () => {
  it('publie topic et payload JSON sans transformation, avec qos/retain fournis', () => {
    const publishSpy = vi.fn();
    const transport = { publish: publishSpy } as unknown as MqttTransport;

    publishPassthrough(transport, 'rfxcom/custom/topic', { raw: true }, 0, false);

    expect(publishSpy).toHaveBeenCalledWith('rfxcom/custom/topic', JSON.stringify({ raw: true }), 0, false);
  });

  it('utilise QoS1/retain false par défaut', () => {
    const publishSpy = vi.fn();
    const transport = { publish: publishSpy } as unknown as MqttTransport;

    publishPassthrough(transport, 'rfxcom/custom/topic', { raw: true });

    expect(publishSpy).toHaveBeenCalledWith('rfxcom/custom/topic', JSON.stringify({ raw: true }), 1, false);
  });

  it('publie une payload string telle quelle, sans JSON.stringify', () => {
    const publishSpy = vi.fn();
    const transport = { publish: publishSpy } as unknown as MqttTransport;

    publishPassthrough(transport, 'rfxcom/custom/topic', 'raw-string-payload');

    expect(publishSpy).toHaveBeenCalledWith('rfxcom/custom/topic', 'raw-string-payload', 1, false);
  });
});
