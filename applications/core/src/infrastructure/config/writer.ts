import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';
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
export class ConfigWriter {
  private readonly configPath: string;
  private readonly schema: any;
  private readonly tmpSuffix: string;

  /**
   * @param configPath - Chemin vers config.yaml (default: /app/data/config.yaml)
   * @param schema - Schéma Zod (default: configSchema)
   * @param tmpSuffix - Suffixe pour le fichier temporaire (default: .tmp)
   */
  constructor(
    configPath: string = process.env.CONFIG_PATH || '/app/data/config.yaml',
    schema: any = configSchema,
    tmpSuffix: string = '.tmp'
  ) {
    this.configPath = configPath;
    this.schema = schema;
    this.tmpSuffix = tmpSuffix;
  }

  /**
   * Valide et sauvegarde la configuration.
   * @param config - Config à sauvegarder
   * @returns Résultat { success, error? }
   */
  save(config: AppConfig): SaveResult {
    try {
      this.schema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorDetails = error.errors
          .map((err: any) => `${err.path.join('.')}: ${err.message}`)
          .join('; ');
        return { success: false, error: `Validation failed: ${errorDetails}` };
      }
      return { success: false, error: `Validation error: ${error}` };
    }

    const tmpPath = `${this.configPath}${this.tmpSuffix}`;

    try {
      const yamlContent = yaml.dump(config, {
        indent: 2,
        sortKeys: false,
        lineWidth: -1,
      });

      fs.writeFileSync(tmpPath, yamlContent, 'utf-8');
      fs.renameSync(tmpPath, this.configPath);

      return { success: true };
    } catch (error) {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
      const errorMessage = error instanceof Error ? error.message : 'Unknown write error';
      return { success: false, error: `Write failed: ${errorMessage}` };
    }
  }
}

export { configSchema };
