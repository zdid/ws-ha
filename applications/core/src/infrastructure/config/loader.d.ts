import { AppConfig, configSchema } from './schema';
/**
 * Chargeur de configuration.
 * Lit et valide le fichier YAML de configuration.
 * Applique les valeurs par défaut aux champs manquants.
 */
export declare class ConfigLoader {
    private readonly configPath;
    private readonly schema;
    /**
     * @param configPath - Chemin vers config.yaml (default: /app/data/config.yaml)
     * @param schema - Schéma Zod (default: configSchema)
     */
    constructor(configPath?: string, schema?: any);
    /**
     * Charge et valide la configuration.
     * @returns AppConfig typé avec valeurs par défaut
     * @throws Error si fichier manquant, YAML invalide ou validation échouée
     */
    load(): AppConfig;
}
export { configSchema };
//# sourceMappingURL=loader.d.ts.map