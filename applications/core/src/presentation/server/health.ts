// src/presentation/server/health.ts
// Route /health pour le healthcheck Docker
// Conforme à specs-techniques-socle-ha-mqtt-v4.3.md §5 et §11.1

import type { Request, Response } from 'express';
import type { Logger } from '../../infrastructure/logger/index';

/**
 * HealthController - Gère la route /health
 * 
 * Règles (conforme §5 specs-techniques-socle-ha-mqtt-v4.3) :
 * - /health est la SEULE route HTTP (pas de REST API)
 * - Utilisée par Docker pour le healthcheck
 * - Doit répondre même si HA ou MQTT ne sont pas connectés
 */
export class HealthController {
  private logger: Logger;

  /**
   * Crée un nouveau HealthController
   * @param logger - Instance du logger
   */
  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Handler pour GET /health
   * @param req - Requête Express
   * @param res - Réponse Express
   */
  handleHealthCheck(req: Request, res: Response): void {
    try {
      const healthStatus = this.getHealthStatus();
      
      res.status(healthStatus.status === 'healthy' ? 200 : 503).json(healthStatus);
    } catch (error) {
      this.logger.error('HealthController', `Erreur healthcheck: ${error}`);
      res.status(500).json({
        status: 'error',
        error: String(error),
      });
    }
  }

  /**
   * Récupère le statut de santé
   */
  private getHealthStatus(): HealthStatus {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      // Note: HA et MQTT peuvent être déconnectés, l'application reste healthy
      // car l'UI doit rester accessible pour corriger la configuration
    };
  }
}

/** Statut de santé */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'error';
  timestamp: string;
  uptime: number;
  memory?: NodeJS.MemoryUsage;
  error?: string;
}

/**
 * Middleware pour /health
 * @param logger - Instance du logger
 * @returns Middleware Express
 */
export function createHealthMiddleware(logger: Logger) {
  const controller = new HealthController(logger);
  return (req: Request, res: Response) => {
    controller.handleHealthCheck(req, res);
  };
}
