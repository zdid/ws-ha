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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
exports.getLogger = getLogger;
exports.resetLogger = resetLogger;
exports.createLogger = createLogger;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const winston_1 = __importDefault(require("winston"));
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
// =============================================================================
// Logger principal
// =============================================================================
/**
 * Logger basé sur Winston avec :
 * - Transport console (format colorisé)
 * - Transport fichier avec rotation quotidienne
 * - Émission des logs via callbacks pour relais vers Socket.io
 */
class Logger {
    winstonLogger;
    logCallbacks = [];
    /**
     * @param config - Configuration du logger
     */
    constructor(config) {
        // S'assurer que le dossier de logs existe
        this.ensureLogDirExists(config.logDir);
        // Créer les transports
        const transports = [
            // Transport console (pour Docker logs)
            new winston_1.default.transports.Console({
                format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }), winston_1.default.format.printf((info) => `
${this.formatLogMessage(info)}
`)),
            }),
            // Transport fichier avec rotation quotidienne
            new winston_daily_rotate_file_1.default({
                filename: path.join(config.logDir, 'app.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: `${config.maxSizeMb}m`,
                maxFiles: config.maxFiles,
                format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }), winston_1.default.format.printf((info) => this.formatLogMessage(info))),
            }),
        ];
        // Créer le logger Winston
        this.winstonLogger = winston_1.default.createLogger({
            level: config.level,
            levels: winston_1.default.config.npm.levels,
            transports,
        });
    }
    /**
     * Vérifie que le dossier de logs existe, le crée sinon
     */
    ensureLogDirExists(logDir) {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }
    /**
     * Formate un message de log selon le format : [ISO8601] [LEVEL] [module] message
     */
    formatLogMessage(info) {
        const timestamp = info.timestamp || new Date().toISOString();
        const level = info.level.toUpperCase();
        const module = info.module ? `[${info.module}]` : '[global]';
        return `[${timestamp}] [${level}] ${module} ${info.message}`;
    }
    /**
     * Crée une entrée de log et notifie les callbacks
     */
    log(level, module, message) {
        const ts = new Date().toISOString();
        const entry = { level, module, message, ts };
        // Écrire avec Winston
        this.winstonLogger.log(level, message, { module });
        // Notifier les callbacks
        for (const callback of this.logCallbacks) {
            try {
                callback(entry);
            }
            catch {
                // Ignorer les erreurs dans les callbacks
            }
        }
    }
    /**
     * Log un message de debug
     */
    debug(module, message) {
        this.log('debug', module, message);
    }
    /**
     * Log un message d'information
     */
    info(module, message) {
        this.log('info', module, message);
    }
    /**
     * Log un avertissement
     */
    warn(module, message) {
        this.log('warn', module, message);
    }
    /**
     * Log une erreur
     */
    error(module, message) {
        this.log('error', module, message);
    }
    /**
     * Obtient le niveau de log actuel
     */
    getLevel() {
        return this.winstonLogger.level;
    }
    /**
     * S'abonner aux logs pour relais vers Socket.io
     */
    onLog(callback) {
        this.logCallbacks.push(callback);
    }
}
exports.Logger = Logger;
// =============================================================================
// Fabrique de logger (Singleton optionnel)
// =============================================================================
let globalLogger = null;
/**
 * Crée ou récupère le logger global (singleton)
 */
function getLogger(config) {
    if (!globalLogger && config) {
        globalLogger = new Logger(config);
    }
    if (!globalLogger) {
        throw new Error('Logger not initialized. Call getLogger(config) first.');
    }
    return globalLogger;
}
/**
 * Réinitialise le logger global (utile pour les tests)
 */
function resetLogger() {
    globalLogger = null;
}
/**
 * Crée un nouveau logger (pour éviter le singleton)
 */
function createLogger(config) {
    return new Logger(config);
}
//# sourceMappingURL=index.js.map