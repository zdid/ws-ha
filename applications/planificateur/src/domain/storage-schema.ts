/**
 * Schémas Zod des 2 fichiers YAML de stockage (data/planificateur-macros-v1.0.yaml,
 * data/planificateur-planifications-v1.0.yaml) — voir specs §5.
 */

import { z } from 'zod';
import { macroDefinitionSchema, planificationDefinitionSchema } from './nodes-schema';

export const macrosConfigSchema = z.object({
  macros: z.record(macroDefinitionSchema).default({})
});

export type MacrosConfigFile = z.infer<typeof macrosConfigSchema>;

export const DEFAULT_MACROS_CONFIG: MacrosConfigFile = { macros: {} };

export const planificationsConfigSchema = z.object({
  planifications: z.record(planificationDefinitionSchema).default({})
});

export type PlanificationsConfigFile = z.infer<typeof planificationsConfigSchema>;

export const DEFAULT_PLANIFICATIONS_CONFIG: PlanificationsConfigFile = { planifications: {} };
