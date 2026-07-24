import * as fs from 'node:fs';
import * as path from 'node:path';
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
const YAML_DUMP_OPTIONS = { indent: 2, sortKeys: false, lineWidth: -1 };

export class ConfigWriter {
  private readonly configPath: string;
  private readonly schema: any;
  private readonly tmpSuffix: string;
  private readonly appDataRoot?: string;

  /**
   * @param configPath - Chemin vers le config.yaml du socle (default: /app/data/core/config.yaml)
   * @param schema - Schéma Zod (default: configSchema)
   * @param tmpSuffix - Suffixe pour le fichier temporaire (default: .tmp)
   * @param appDataRoot - Répertoire `data/` contenant un sous-dossier par application — requis
   *   pour utiliser `saveModuleFile()`. Absent : comportement inchangé pour `save()`.
   */
  constructor(
    configPath: string = process.env.CONFIG_PATH || '/app/data/core/config.yaml',
    schema: any = configSchema,
    tmpSuffix: string = '.tmp',
    appDataRoot?: string
  ) {
    this.configPath = configPath;
    this.schema = schema;
    this.tmpSuffix = tmpSuffix;
    this.appDataRoot = appDataRoot;
  }

  /**
   * Écrit `data` en YAML de façon atomique (fichier temporaire → rename), en créant le
   * répertoire parent si nécessaire (indispensable depuis qu'un premier save doit créer
   * `data/{app}/`, jamais nécessaire tant que `data/` existait déjà à plat).
   */
  private writeYamlAtomic(filePath: string, data: unknown): SaveResult {
    const tmpPath = `${filePath}${this.tmpSuffix}`;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const yamlContent = yaml.dump(data, YAML_DUMP_OPTIONS);
      fs.writeFileSync(tmpPath, yamlContent, 'utf-8');
      fs.renameSync(tmpPath, filePath);
      return { success: true };
    } catch (error) {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
      const errorMessage = error instanceof Error ? error.message : 'Unknown write error';
      return { success: false, error: `Write failed: ${errorMessage}` };
    }
  }

  /**
   * Valide et sauvegarde la configuration du socle (ha/web/logging) dans `configPath`.
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

    return this.writeYamlAtomic(this.configPath, config);
  }

  /**
   * Sauvegarde la section d'une application dans son propre fichier
   * (`{appDataRoot}/{moduleId}/config.yaml`, objet nu, pas de clé d'app en tête). Pas de
   * validation de schéma générique ici — chaque appelant (ConfigService.savePartialConfig/
   * saveModuleConfig) gère sa propre validation le cas échéant.
   */
  saveModuleFile(moduleId: string, data: unknown): SaveResult {
    if (!this.appDataRoot) {
      return { success: false, error: 'ConfigWriter: appDataRoot non fourni, saveModuleFile() indisponible' };
    }
    const filePath = path.join(this.appDataRoot, moduleId, 'config.yaml');
    return this.writeYamlAtomic(filePath, data);
  }
}

export { configSchema };
