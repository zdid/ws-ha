/**
 * Schéma de configuration RFXCOM — section `rfxcom` de data/config.yaml.
 * Paramètres généraux uniquement (port série, MQTT via le socle, fichier de devices) —
 * les devices/récepteurs/scènes sont dans config-rfxcom-devices-v1.0.yaml
 * (voir devices-config-schema.ts), conforme à fonctionnelles-rfxcom_specs_v5.6.md §8.1.
 */

import { z } from 'zod';

export const rfxcomConfigSchema = z.object({
  enabled: z.boolean().default(true),

  // Port série du transceiver RFXtrx433
  port: z.string().min(1).default('/dev/ttyUSB0'),
  baudRate: z.number().int().positive().default(38400),

  // bridge_instance utilisé pour la connexion MQTT au socle (techniques-socle-ha-mqtt_specs §8.5.1)
  bridgeInstance: z.string().min(1).default('rfx_bridge_0001'),

  // Fichier de configuration centralisé (devices/récepteurs/scènes), relatif à la racine du projet
  devicesConfigFile: z.string().min(1).default('config-rfxcom-devices-v1.0.yaml'),

  // Détection continue des nouveaux devices RF433 (fonctionnelles-rfxcom_specs §11.2)
  autoDiscovery: z.boolean().default(true),

  // Protocoles RF433 activés sur le transceiver (fonctionnelles-rfxcom_specs §8.2) —
  // liste vide = tous les protocoles supportés par le transceiver sont activés par défaut
  enabledProtocols: z.array(z.string()).default([])
});

export type RfxComConfig = z.infer<typeof rfxcomConfigSchema>;

export const DEFAULT_RFXCOM_CONFIG: RfxComConfig = {
  enabled: true,
  port: '/dev/ttyUSB0',
  baudRate: 38400,
  bridgeInstance: 'rfx_bridge_0001',
  devicesConfigFile: 'config-rfxcom-devices-v1.0.yaml',
  autoDiscovery: true,
  enabledProtocols: []
};
