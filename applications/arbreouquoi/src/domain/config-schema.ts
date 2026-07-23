import { z } from 'zod';

// Schema de configuration pour l'application ArbreOuquoi
export const arbreouquoiConfigSchema = z.object({
  // Activation/désactivation
  enabled: z.boolean().default(true),
  
  // Options d'affichage
  display: z.object({
    expandAll: z.boolean().default(false),
    showEntityIds: z.boolean().default(true),
    showQuoiIcons: z.boolean().default(true),
    theme: z.enum(['light', 'dark', 'auto']).default('auto'),
    // Mode d'affichage : 'ou-first' (OÙ → QUOI) ou 'quoi-first' (QUOI → OÙ)
    viewMode: z.enum(['ou-first', 'quoi-first']).default('ou-first')
  }).default({}),
  
  // Options de rafraîchissement
  refresh: z.object({
    autoRefreshEnabled: z.boolean().default(true),
    autoRefreshInterval: z.number().min(1000).max(300000).default(30000), // 30 secondes
    refreshOnHaUpdate: z.boolean().default(true)
  }).default({})
});

export type ArbreouquoiConfig = z.infer<typeof arbreouquoiConfigSchema>;
