/**
 * Entrée de log avec tous les champs nécessaires
 */
export interface LogEntry {
    level: 'debug' | 'info' | 'warn' | 'error';
    module: string;
    message: string;
    ts: string;
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
/**
 * Logger basé sur Winston avec :
 * - Transport console (format colorisé)
 * - Transport fichier avec rotation quotidienne
 * - Émission des logs via callbacks pour relais vers Socket.io
 */
export declare class Logger {
    private winstonLogger;
    private logCallbacks;
    /**
     * @param config - Configuration du logger
     */
    constructor(config: LoggerConfig);
    /**
     * Vérifie que le dossier de logs existe, le crée sinon
     */
    private ensureLogDirExists;
    /**
     * Formate un message de log selon le format : [ISO8601] [LEVEL] [module] message
     */
    private formatLogMessage;
    /**
     * Crée une entrée de log et notifie les callbacks
     */
    private log;
    /**
     * Log un message de debug
     */
    debug(module: string, message: string): void;
    /**
     * Log un message d'information
     */
    info(module: string, message: string): void;
    /**
     * Log un avertissement
     */
    warn(module: string, message: string): void;
    /**
     * Log une erreur
     */
    error(module: string, message: string): void;
    /**
     * Obtient le niveau de log actuel
     */
    getLevel(): string;
    /**
     * S'abonner aux logs pour relais vers Socket.io
     */
    onLog(callback: LogCallback): void;
}
/**
 * Crée ou récupère le logger global (singleton)
 */
export declare function getLogger(config?: LoggerConfig): Logger;
/**
 * Réinitialise le logger global (utile pour les tests)
 */
export declare function resetLogger(): void;
/**
 * Crée un nouveau logger (pour éviter le singleton)
 */
export declare function createLogger(config: LoggerConfig): Logger;
export {};
//# sourceMappingURL=index.d.ts.map