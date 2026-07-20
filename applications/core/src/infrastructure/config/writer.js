"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.configSchema = exports.ConfigWriter = void 0;
const fs = __importStar(require("node:fs"));
const yaml = __importStar(require("js-yaml"));
const zod_1 = require("zod");
const schema_1 = require("./schema");
Object.defineProperty(exports, "configSchema", { enumerable: true, get: function () { return schema_1.configSchema; } });
/**
 * Écrit la configuration de manière atomique (fichier temporaire → rename)
 */
class ConfigWriter {
    configPath;
    schema;
    tmpSuffix;
    /**
     * @param configPath - Chemin vers config.yaml (default: /app/data/config.yaml)
     * @param schema - Schéma Zod (default: configSchema)
     * @param tmpSuffix - Suffixe pour le fichier temporaire (default: .tmp)
     */
    constructor(configPath = process.env.CONFIG_PATH || '/app/data/config.yaml', schema = schema_1.configSchema, tmpSuffix = '.tmp') {
        this.configPath = configPath;
        this.schema = schema;
        this.tmpSuffix = tmpSuffix;
    }
    /**
     * Valide et sauvegarde la configuration.
     * @param config - Config à sauvegarder
     * @returns Résultat { success, error? }
     */
    save(config) {
        try {
            this.schema.parse(config);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                const errorDetails = error.errors
                    .map((err) => `${err.path.join('.')}: ${err.message}`)
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
        }
        catch (error) {
            try {
                if (fs.existsSync(tmpPath))
                    fs.unlinkSync(tmpPath);
            }
            catch { }
            const errorMessage = error instanceof Error ? error.message : 'Unknown write error';
            return { success: false, error: `Write failed: ${errorMessage}` };
        }
    }
}
exports.ConfigWriter = ConfigWriter;
//# sourceMappingURL=writer.js.map