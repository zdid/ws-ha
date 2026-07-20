import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { AppConfig, configSchema } from './schema';

/**
 * Valeurs par défaut complètes pour la configuration
 */
const DEFAULT_CONFIG: AppConfig = {
  ha: {
    ws_enable: false,
    mqtt_enable: false,
    ws: {
      host: '',
      port: 8123,
      token: '',
      reconnect_delay: 5,
    },
    structure: {
      include_unassigned: false,
      unassigned_label: 'Non assigné',
    },
  },
  web: {
    port: 8080,
    host: '0.0.0.0',
  },
  logging: {
    level: 'info',
    rotate: {
      max_size_mb: 10,
      max_files: 5,
    },
  },
};

/**
 * Deep merge : fusionne les valeurs par défaut avec la config fournie
 */
function deepMerge<T>(defaults: T, input: Partial<T>): T {
  const result = { ...defaults };
  for (const key in input) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
      if (input[key] && typeof input[key] === 'object' && typeof result[key] === 'object' && !Array.isArray(input[key])) {
        result[key] = deepMerge(result[key] as any, input[key] as any);
      } else {
        result[key] = input[key] as any;
      }
    }
  }
  return result;
}

/**
 * Chargeur de configuration.
 * Lit et valide le fichier YAML de configuration.
 * Applique les valeurs par défaut aux champs manquants.
 */
export class ConfigLoader {
  private readonly configPath: string;
  private readonly schema: any;

  /**
   * @param configPath - Chemin vers config.yaml (default: /app/data/config.yaml)
   * @param schema - Schéma Zod (default: configSchema)
   */
  constructor(
    configPath: string = process.env.CONFIG_PATH || '/app/data/config.yaml',
    schema: any = configSchema
  ) {
    this.configPath = configPath;
    this.schema = schema;
  }

  /**
   * Charge et valide la configuration.
   * @returns AppConfig typé avec valeurs par défaut
   * @throws Error si fichier manquant, YAML invalide ou validation échouée
   */
  load(): AppConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Configuration file not found at: ${this.configPath}`);
    }

    const fileContent = fs.readFileSync(this.configPath, 'utf-8');

    let parsedConfig: unknown;
    try {
      parsedConfig = yaml.load(fileContent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown YAML parsing error';
      throw new Error(`Invalid YAML in configuration file: ${errorMessage}`);
    }

    const configWithDefaults = deepMerge(DEFAULT_CONFIG, parsedConfig as Partial<AppConfig>);

    try {
      return this.schema.parse(configWithDefaults);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorDetails = error.errors
          .map((err: any) => `${err.path.join('.')}: ${err.message}`)
          .join('; ');
        throw new Error(`Configuration validation failed: ${errorDetails}`);
      }
      throw new Error(`Configuration validation error: ${error}`);
    }
  }
}

export { configSchema };
