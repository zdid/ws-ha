import * as fs from 'node:fs';
import * as path from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// =============================================================================
// Types
// =============================================================================

/**
 * Entrée de log avec tous les champs nécessaires
 */
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  module: string;
  message: string;
  ts: string; // ISO8601 timestamp
}

/**
 * Configuration du logger
 */
export interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  maxSizeMb: number;
  maxFiles: number;
  logDir: string;
}

/**
 * Callback pour les logs (utilisé pour relais vers Socket.io)
 */
type LogCallback = (entry: LogEntry) => void;

// =============================================================================
// Logger principal
// =============================================================================

/**
 * Logger basé sur Winston avec :
 * - Transport console (format colorisé)
 * - Transport fichier avec rotation quotidienne
 * - Émission des logs via callbacks pour relais vers Socket.io
 */
export class Logger {
  private winstonLogger: winston.Logger;
  private logCallbacks: LogCallback[] = [];

  /**
   * @param config - Configuration du logger
   */
  constructor(config: LoggerConfig) {
    // S'assurer que le dossier de logs existe
    this.ensureLogDirExists(config.logDir);

    // Créer les transports
    const transports: winston.transport[] = [
      // Transport console (pour Docker logs)
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
          winston.format.printf(
            (info) => `
${this.formatLogMessage(info)}
`
          )
        ),
      }),

      // Transport fichier avec rotation quotidienne
      new DailyRotateFile({
        filename: path.join(config.logDir, 'app.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: `${config.maxSizeMb}m`,
        maxFiles: config.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
          winston.format.printf(
            (info) => this.formatLogMessage(info)
          )
        ),
      }),
    ];

    // Créer le logger Winston
    this.winstonLogger = winston.createLogger({
      level: config.level,
      levels: winston.config.npm.levels,
      transports,
    });
  }

  /**
   * Vérifie que le dossier de logs existe, le crée sinon
   */
  private ensureLogDirExists(logDir: string): void {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Formate un message de log selon le format : [ISO8601] [LEVEL] [module] message
   */
  private formatLogMessage(info: winston.Logform.TransformableInfo): string {
    const timestamp = info.timestamp as string || new Date().toISOString();
    const level = info.level.toUpperCase();
    const module = info.module ? `[${info.module}]` : '[global]';
    return `[${timestamp}] [${level}] ${module} ${info.message}`;
  }

  /**
   * Crée une entrée de log et notifie les callbacks
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', module: string, message: string): void {
    const ts = new Date().toISOString();
    const entry: LogEntry = { level, module, message, ts };

    // Écrire avec Winston
    this.winstonLogger.log(level, message, { module });

    // Notifier les callbacks
    for (const callback of this.logCallbacks) {
      try {
        callback(entry);
      } catch {
        // Ignorer les erreurs dans les callbacks
      }
    }
  }

  /**
   * Log un message de debug
   */
  debug(module: string, message: string): void {
    this.log('debug', module, message);
  }

  /**
   * Log un message d'information
   */
  info(module: string, message: string): void {
    this.log('info', module, message);
  }

  /**
   * Log un avertissement
   */
  warn(module: string, message: string): void {
    this.log('warn', module, message);
  }

  /**
   * Log une erreur
   */
  error(module: string, message: string): void {
    this.log('error', module, message);
  }

  /**
   * Obtient le niveau de log actuel
   */
  getLevel(): string {
    return this.winstonLogger.level;
  }

  /**
   * S'abonner aux logs pour relais vers Socket.io
   */
  onLog(callback: LogCallback): void {
    this.logCallbacks.push(callback);
  }

  /**
   * Met à jour le niveau de log dynamiquement
   * @param newLevel - Nouveau niveau de log (debug, info, warn, error)
   */
  setLevel(newLevel: 'debug' | 'info' | 'warn' | 'error'): void {
    this.winstonLogger.level = newLevel;
  }
}

// =============================================================================
// Fabrique de logger (Singleton optionnel)
// =============================================================================

let globalLogger: Logger | null = null;

/**
 * Crée ou récupère le logger global (singleton)
 */
export function getLogger(config?: LoggerConfig): Logger {
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
export function resetLogger(): void {
  globalLogger = null;
}

/**
 * Crée un nouveau logger (pour éviter le singleton)
 */
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}
