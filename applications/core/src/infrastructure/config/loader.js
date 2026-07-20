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
exports.configSchema = exports.ConfigLoader = void 0;
const fs = __importStar(require("node:fs"));
const yaml = __importStar(require("js-yaml"));
const zod_1 = require("zod");
const schema_1 = require("./schema");
Object.defineProperty(exports, "configSchema", { enumerable: true, get: function () { return schema_1.configSchema; } });
/**
 * Valeurs par défaut complètes pour la configuration
 */
const DEFAULT_CONFIG = {
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
function deepMerge(defaults, input) {
    const result = { ...defaults };
    for (const key in input) {
        if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
            if (input[key] && typeof input[key] === 'object' && typeof result[key] === 'object' && !Array.isArray(input[key])) {
                result[key] = deepMerge(result[key], input[key]);
            }
            else {
                result[key] = input[key];
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
class ConfigLoader {
    configPath;
    schema;
    /**
     * @param configPath - Chemin vers config.yaml (default: /app/data/config.yaml)
     * @param schema - Schéma Zod (default: configSchema)
     */
    constructor(configPath = process.env.CONFIG_PATH || '/app/data/config.yaml', schema = schema_1.configSchema) {
        this.configPath = configPath;
        this.schema = schema;
    }
    /**
     * Charge et valide la configuration.
     * @returns AppConfig typé avec valeurs par défaut
     * @throws Error si fichier manquant, YAML invalide ou validation échouée
     */
    load() {
        if (!fs.existsSync(this.configPath)) {
            throw new Error(`Configuration file not found at: ${this.configPath}`);
        }
        const fileContent = fs.readFileSync(this.configPath, 'utf-8');
        let parsedConfig;
        try {
            parsedConfig = yaml.load(fileContent);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown YAML parsing error';
            throw new Error(`Invalid YAML in configuration file: ${errorMessage}`);
        }
        const configWithDefaults = deepMerge(DEFAULT_CONFIG, parsedConfig);
        try {
            return this.schema.parse(configWithDefaults);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                const errorDetails = error.errors
                    .map((err) => `${err.path.join('.')}: ${err.message}`)
                    .join('; ');
                throw new Error(`Configuration validation failed: ${errorDetails}`);
            }
            throw new Error(`Configuration validation error: ${error}`);
        }
    }
}
exports.ConfigLoader = ConfigLoader;
//# sourceMappingURL=loader.js.map