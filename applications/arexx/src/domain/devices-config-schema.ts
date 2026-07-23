/**
 * Schéma de validation Zod pour le fichier de configuration centralisé arexx-sensors-v1.0.yaml
 * (capteurs AREXX paramétrés). Miroir simplifié de devices-config-schema.ts (RFXCOM) — pas de
 * récepteurs logiques ici, un capteur AREXX n'a pas de commande.
 */

import { z } from 'zod';

export const arexxSensorKindSchema = z.enum(['temperature', 'humidity']);

export const arexxSensorSchema = z.object({
  uniqueId: z.string().min(1),
  kind: arexxSensorKindSchema,
  name: z.string().min(1),
  transmitToHa: z.boolean().default(false),
  lastValue: z.number().optional(),
  lastSeen: z.string().optional()
});

export type ArexxSensorEntry = z.infer<typeof arexxSensorSchema>;

// ============================================================================
// Fichier de configuration centralisé (arexx-sensors-v1.0.yaml)
// ============================================================================

export const arexxSensorsConfigSchema = z.object({
  arexx_sensors: z.record(arexxSensorSchema).default({})
});

export type ArexxSensorsConfigFile = z.infer<typeof arexxSensorsConfigSchema>;

export const DEFAULT_SENSORS_CONFIG: ArexxSensorsConfigFile = {
  arexx_sensors: {}
};
