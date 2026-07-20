import { AppConfig, configSchema } from './schema';
/**
 * Résultat de la sauvegarde
 */
export interface SaveResult {
    success: boolean;
    error?: string;
}
/**
 * Écrit la configuration de manière atomique (fichier temporaire → rename)
 */
export declare class ConfigWriter {
    private readonly configPath;
    private readonly schema;
    private readonly tmpSuffix;
    /**
     * @param configPath - Chemin vers config.yaml (default: /app/data/config.yaml)
     * @param schema - Schéma Zod (default: configSchema)
     * @param tmpSuffix - Suffixe pour le fichier temporaire (default: .tmp)
     */
    constructor(configPath?: string, schema?: any, tmpSuffix?: string);
    /**
     * Valide et sauvegarde la configuration.
     * @param config - Config à sauvegarder
     * @returns Résultat { success, error? }
     */
    save(config: AppConfig): SaveResult;
}
export { configSchema };
//# sourceMappingURL=writer.d.ts.map