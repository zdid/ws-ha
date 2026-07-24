import * as fs from 'node:fs';
import * as path from 'node:path';
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
  private readonly appDataRoot?: string;

  /**
   * @param configPath - Chemin vers le config.yaml du socle (default: /app/data/core/config.yaml)
   * @param schema - Schéma Zod (default: configSchema)
   * @param appDataRoot - Répertoire `data/` contenant un sous-dossier par application
   *   (`{appDataRoot}/{app}/config.yaml`) — si fourni, chaque section d'app est fusionnée dans
   *   l'objet retourné par `load()` sous sa propre clé, en plus de `ha`/`web`/`logging`. Si
   *   omis, comportement inchangé (un seul fichier) — utilisé par `config.test.ts`, qui ne
   *   connaît pas cette notion de sous-dossiers par app.
   */
  constructor(
    configPath: string = process.env.CONFIG_PATH || '/app/data/core/config.yaml',
    schema: any = configSchema,
    appDataRoot?: string
  ) {
    this.configPath = configPath;
    this.schema = schema;
    this.appDataRoot = appDataRoot;
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

    if (this.appDataRoot) {
      this.mergeAppSections(configWithDefaults as Record<string, unknown>);
    }

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

  /**
   * Fusionne `{appDataRoot}/{app}/config.yaml` (un sous-dossier par application, chacun un objet
   * nu — pas de clé d'app en tête, le dossier fait déjà cette distinction) dans `target`, sous la
   * clé `{app}`. Miroir de l'ancien `.passthrough()` sur un seul fichier : une app absente ou sans
   * fichier n'apparaît simplement pas, pas d'erreur.
   */
  private mergeAppSections(target: Record<string, unknown>): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.appDataRoot!, { withFileTypes: true });
    } catch {
      return; // data/ absent ou pas encore créé (première installation) — rien à fusionner
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'core') continue;

      const sectionPath = path.join(this.appDataRoot!, entry.name, 'config.yaml');
      if (!fs.existsSync(sectionPath)) continue;

      try {
        const parsed = yaml.load(fs.readFileSync(sectionPath, 'utf-8'));
        target[entry.name] = parsed;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid YAML in ${sectionPath}: ${message}`);
      }
    }
  }
}

export { configSchema };
