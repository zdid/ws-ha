/**
 * Schéma de configuration `ia` — section `ia` de data/config.yaml. Voir specs §12.
 * Le routage multi-IA (§6) est hors scope de cette version (voir plan d'implémentation) — pas de
 * champs claude/gemini/chatgpt ici pour l'instant.
 */

import { z } from 'zod';

export const modelMapSchema = z.record(z.string()).default({
  mistral: 'mistral-small-latest',
  'mistral:latest': 'mistral-small-latest',
  'mistral-small': 'mistral-small-latest',
  'mistral-large': 'mistral-large-latest'
});

export const iaConfigSchema = z.object({
  enabled: z.boolean().default(true),

  mistralApiKey: z.string().optional(),
  mistralBaseUrl: z.string().default('https://api.mistral.ai/v1'),
  defaultMistralModel: z.string().default('mistral-small-latest'),
  modelMap: modelMapSchema,

  ollamaHttpPort: z.number().int().positive().default(11434),

  // Chemin relatif à la racine de l'application (applications/ia/), voir rules.ts
  rulesFile: z.string().min(1).default('rules/regles_mistral.txt'),

  // Délais d'attente pour les échanges de corrélation avec planificateur
  commandTimeoutMs: z.number().int().positive().default(2000),
  toolExecuteTimeoutMs: z.number().int().positive().default(10000)
});

export type IaConfig = z.infer<typeof iaConfigSchema>;

export const DEFAULT_IA_CONFIG: IaConfig = {
  enabled: true,
  mistralBaseUrl: 'https://api.mistral.ai/v1',
  defaultMistralModel: 'mistral-small-latest',
  modelMap: {
    mistral: 'mistral-small-latest',
    'mistral:latest': 'mistral-small-latest',
    'mistral-small': 'mistral-small-latest',
    'mistral-large': 'mistral-large-latest'
  },
  ollamaHttpPort: 11434,
  rulesFile: 'rules/regles_mistral.txt',
  commandTimeoutMs: 2000,
  toolExecuteTimeoutMs: 10000
};
