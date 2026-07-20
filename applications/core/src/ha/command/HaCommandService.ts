import { HaCommand, HaCommandResult, HaCommandWithStatus } from '../types/ha-command';
import { HaWsClient } from '../sync/HaWsClient';
import { Logger } from '../../infrastructure/logger/index';
import { createHaWsError, type AppError } from '../../types/errors';

// =============================================================================
// HaCommandService - Service d'envoi et de gestion des commandes HA
// 
// Ce service permet d'envoyer des commandes à Home Assistant via WebSocket
// et de suivre leur statut d'exécution.
// =============================================================================

/**
 * Callback pour les résultats de commandes.
 */
type CommandResultCallback = (result: HaCommandResult) => void;

/**
 * Callback pour les mises à jour de statut de commandes.
 */
type CommandStatusCallback = (command: HaCommandWithStatus) => void;

/**
 * Configuration du service de commandes.
 */
export interface HaCommandServiceConfig {
  commandTimeout: number;      // Timeout en ms pour les commandes (default: 10000)
  maxRetries: number;          // Nombre maximal de tentatives (default: 3)
  retryDelay: number;          // Délai entre les tentatives en ms (default: 1000)
}

/**
 * Service de gestion des commandes Home Assistant.
 * 
 * **Responsabilités :**
 * - Envoi de commandes à HA via HaWsClient
 * - Gestion des timeouts et retries
 * - Suivi du statut des commandes
 * - Notification des résultats aux abonnés
 */
export class HaCommandService {
  private pendingCommands: Map<string, HaCommandWithStatus> = new Map();
  private resultCallbacks: Map<string, CommandResultCallback[]> = new Map();
  private statusCallbacks: CommandStatusCallback[] = [];
  private nextId = 1;
  private logger: Logger;
  private config: HaCommandServiceConfig;

  /**
   * @param haWsClient - Client WebSocket HA pour l'envoi des commandes
   * @param config - Configuration du service (optionnelle)
   * @param logger - Logger pour les logs (optionnel)
   */
  constructor(
    private readonly haWsClient: HaWsClient,
    config: Partial<HaCommandServiceConfig> = {},
    logger?: Logger
  ) {
    this.logger = logger || new Logger({
      level: 'info',
      maxSizeMb: 10,
      maxFiles: 5,
      logDir: '/app/logs',
    });

    this.config = {
      commandTimeout: 10000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };

    this.setupHaWsClientListeners();
  }

  /**
   * Configure les listeners sur le client WebSocket HA.
   */
  private setupHaWsClientListeners(): void {
    // Écouter les réponses aux commandes
    this.haWsClient.onMessage((message) => {
      if (message.type === 'result' && message.id) {
        this.handleCommandResponse(message);
      }
      if (message.type === 'error' && message.id) {
        this.handleCommandError(message);
      }
    });

    // Écouter la déconnexion pour marquer les commandes en erreur
    this.haWsClient.onDisconnect(() => {
      this.handleDisconnect();
    });

    // Écouter la reconnexion pour relancer les commandes en attente
    this.haWsClient.onConnect(() => {
      this.handleReconnect();
    });
  }

  /**
   * Traite la réponse d'une commande.
   */
  private handleCommandResponse(message: any): void {
    const commandId = this.findCommandIdByRequestId(message.id);
    
    if (!commandId) {
      return; // Pas une commande que nous avons envoyée
    }

    const command = this.pendingCommands.get(commandId);
    if (!command) {
      return;
    }

    // Marquer la commande comme réussie
    command.status = 'success';
    command.result = message.result;
    command.timestamp = new Date();

    this.notifyStatusUpdate(command);
    this.notifyResult({
      success: true,
      command: command,
      timestamp: new Date(),
    });

    this.pendingCommands.delete(commandId);
    this.resultCallbacks.delete(commandId);

    this.logger.debug('ha:command', `Commande réussie: ${commandId} (${command.domain}.${command.service})`);
  }

  /**
   * Traite une erreur de commande.
   * Conforme à specs-erreurs-v1.0.md §3
   */
  private handleCommandError(message: any): void {
    const commandId = this.findCommandIdByRequestId(message.id);
    
    if (!commandId) {
      return;
    }

    const command = this.pendingCommands.get(commandId);
    if (!command) {
      return;
    }

    const errorMessage = message.error?.message || 'Unknown error';
    const errorCode = message.error?.code || 'HA_SERVICE_INVALID';

    // Marquer la commande comme en erreur
    command.status = 'error';
    command.error = errorMessage;
    command.timestamp = new Date();

    this.notifyStatusUpdate(command);
    this.notifyResult({
      success: false,
      command: command,
      error: errorMessage,
      errorCode: errorCode,
      timestamp: new Date(),
    });

    this.pendingCommands.delete(commandId);
    this.resultCallbacks.delete(commandId);

    this.logger.error('ha:command', `Commande échouée: ${commandId} - ${errorCode}: ${errorMessage}`);
  }

  /**
   * Trouve l'ID de commande correspondant à un ID de requête.
   */
  private findCommandIdByRequestId(requestId: number): string | undefined {
    for (const [commandId, command] of this.pendingCommands) {
      // Le requestId correspond à l'ID utilisé dans le message WS
      // Dans notre implémentation, nous utilisons nextId pour les requêtes
      // Nous devons tracer le mapping entre commandId et requestId
      // Pour l'instant, nous allons stocker le requestId dans la commande
      if ((command as any).requestId === requestId) {
        return commandId;
      }
    }
    return undefined;
  }

  /**
   * Traite la déconnexion du client HA.
   * Conforme à specs-erreurs-v1.0.md §3.1 (HA_CONNECTION_LOST)
   */
  private handleDisconnect(): void {
    this.logger.warn('ha:command', 'Connexion HA perdue. Les commandes en attente sont marquées en erreur.');

    for (const [_commandId, command] of this.pendingCommands) {
      if (command.status === 'pending' || command.status === 'executing') {
        command.status = 'error';
        command.error = 'Connection lost';
        command.timestamp = new Date();

        this.notifyStatusUpdate(command);
        this.notifyResult({
          success: false,
          command: this.createHaCommandFromWithStatus(command),
          error: 'Connection lost',
          errorCode: 'HA_CONNECTION_LOST',
          timestamp: new Date(),
        });
      }
    }

    this.pendingCommands.clear();
    this.resultCallbacks.clear();
  }

  /**
   * Traite la reconnexion du client HA.
   * Les commandes en attente peuvent être relancées automatiquement.
   */
  private handleReconnect(): void {
    this.logger.info('ha:command', 'Connexion HA rétablie. Relancement des commandes en attente...');

    // Pour l'instant, nous ne relançons pas automatiquement les commandes
    // Cela pourrait être ajouté comme fonctionnalité future
  }

  /**
   * Crée une HaCommand à partir d'une HaCommandWithStatus.
   * (Conserve uniquement les propriétés de base pour le résultat)
   */
  private createHaCommandFromWithStatus(command: HaCommandWithStatus): HaCommandWithStatus {
    return { ...command };
  }

  /**
   * Envoie une commande à Home Assistant.
   * 
   * @param command - Commande à envoyer
   * @param timeout - Timeout personnalisé (optionnel)
   * @returns Promise qui résout avec le résultat de la commande
   */
  async sendCommand(
    command: HaCommand,
    timeout?: number
  ): Promise<HaCommandResult> {
    return new Promise((resolve) => {
      const commandId = crypto.randomUUID();
      const requestId = this.nextId++;

      const commandWithStatus: HaCommandWithStatus = {
        id: commandId,
        ...command,
        status: 'pending',
        timestamp: new Date(),
        retryCount: 0,
        maxRetries: this.config.maxRetries,
      };

      // Stocker la commande et son callback
      this.pendingCommands.set(commandId, { ...commandWithStatus, requestId });

      // Créer un timeout pour la commande
      const timeoutId = setTimeout(() => {
        this.handleCommandTimeout(commandId);
        resolve({
          success: false,
          command: this.createHaCommandFromWithStatus(commandWithStatus),
          error: `Command timed out after ${timeout || this.config.commandTimeout}ms`,
          timestamp: new Date(),
        });
      }, timeout || this.config.commandTimeout);

      // Stocker le callback de résolution
      this.resultCallbacks.set(commandId, [(result) => {
        clearTimeout(timeoutId);
        resolve(result);
      }]);

      // Notifier le statut initial
      this.notifyStatusUpdate({ ...commandWithStatus, requestId });

      // Envoyer la commande via le client HA
      this.sendCommandToHa(command, requestId, commandId);
    });
  }

  /**
   * Envoie une commande à Home Assistant via le client WebSocket.
   */
  private async sendCommandToHa(
    command: HaCommand,
    requestId: number,
    commandId: string
  ): Promise<void> {
    try {
      const commandWithStatus = this.pendingCommands.get(commandId);
      if (!commandWithStatus) {
        return;
      }

      // Mettre à jour le statut
      commandWithStatus.status = 'executing';
      this.notifyStatusUpdate(commandWithStatus);

      this.logger.debug('ha:command', `Envoi commande: ${command.domain}.${command.service} vers ${JSON.stringify(command.entity_id)}`);

      // Envoyer via le client HA
      await this.haWsClient.sendCommand(
        command.domain,
        command.service,
        { entity_id: command.entity_id },
        command.service_data
      );

      // Stocker le requestId pour le mapping
      commandWithStatus.requestId = requestId;
      this.pendingCommands.set(commandId, commandWithStatus);

    } catch (error) {
      const commandWithStatus = this.pendingCommands.get(commandId);
      if (commandWithStatus) {
        commandWithStatus.status = 'error';
        commandWithStatus.error = (error as Error).message;
        commandWithStatus.timestamp = new Date();
        
        this.notifyStatusUpdate(commandWithStatus);
        this.notifyResult({
          success: false,
          command: this.createHaCommandFromWithStatus(commandWithStatus),
          error: (error as Error).message,
          timestamp: new Date(),
        });

        this.pendingCommands.delete(commandId);
        this.resultCallbacks.delete(commandId);
      }
    }
  }

  /**
   * Traite le timeout d'une commande.
   */
  private handleCommandTimeout(commandId: string): void {
    const command = this.pendingCommands.get(commandId);
    
    if (!command) {
      return;
    }

    // Essayer de relancer si possible
    if (command.retryCount < command.maxRetries) {
      command.retryCount++;
      command.status = 'pending';
      command.timestamp = new Date();

      this.notifyStatusUpdate(command);

      // Relancer après un délai
      setTimeout(() => {
        this.sendCommandToHa(
          this.createHaCommandFromWithStatus(command),
          this.nextId++,
          commandId
        );
      }, this.config.retryDelay);

      this.logger.debug('ha:command', `Retentative ${command.retryCount}/${command.maxRetries} pour: ${commandId}`);
    } else {
      // Plus de tentatives, marquer comme timeout
      command.status = 'timeout';
      command.error = `Command timed out after ${command.retryCount} retries`;
      command.timestamp = new Date();

      this.notifyStatusUpdate(command);
      this.notifyResult({
        success: false,
        command: this.createHaCommandFromWithStatus(command),
        error: `Command timed out after ${command.retryCount} retries`,
        errorCode: 'HA_CONNECTION_TIMEOUT',
        timestamp: new Date(),
      });

      this.pendingCommands.delete(commandId);
      this.resultCallbacks.delete(commandId);

      this.logger.warn('ha:command', `Commande timeout: ${commandId} après ${command.retryCount} tentatives`);
    }
  }

  /**
   * Annule une commande en attente.
   * 
   * @param commandId - ID de la commande à annuler
   * @returns true si la commande a été annulée
   */
  cancelCommand(commandId: string): boolean {
    const command = this.pendingCommands.get(commandId);
    
    if (!command) {
      return false;
    }

    if (command.status === 'executing') {
      // Impossible d'annuler une commande en cours d'exécution
      return false;
    }

    command.status = 'error';
    command.error = 'Command cancelled';
    command.timestamp = new Date();

    this.notifyStatusUpdate(command);
    this.notifyResult({
      success: false,
      command: this.createHaCommandFromWithStatus(command),
      error: 'Command cancelled',
      timestamp: new Date(),
    });

    this.pendingCommands.delete(commandId);
    this.resultCallbacks.delete(commandId);

    this.logger.info('ha:command', `Commande annulée: ${commandId}`);
    return true;
  }

  /**
   * Récupère le statut d'une commande.
   * 
   * @param commandId - ID de la commande
   * @returns Le statut de la commande ou undefined si non trouvée
   */
  getCommandStatus(commandId: string): HaCommandWithStatus | undefined {
    return this.pendingCommands.get(commandId);
  }

  /**
   * Récupère toutes les commandes en attente.
   */
  getPendingCommands(): HaCommandWithStatus[] {
    return Array.from(this.pendingCommands.values());
  }

  /**
   * Récupère le nombre de commandes en attente.
   */
  getPendingCommandCount(): number {
    return this.pendingCommands.size;
  }

  /**
   * S'abonne aux résultats des commandes.
   * 
   * @param commandId - ID de la commande (optionnel, pour s'abonner à une commande spécifique)
   * @param callback - Callback à appeler lors de la réception du résultat
   */
  onCommandResult(commandId: string, callback: CommandResultCallback): void;
  onCommandResult(callback: CommandResultCallback): void;
  onCommandResult(commandIdOrCallback: string | CommandResultCallback, callback?: CommandResultCallback): void {
    if (typeof commandIdOrCallback === 'string') {
      // S'abonner à une commande spécifique
      if (!this.resultCallbacks.has(commandIdOrCallback)) {
        this.resultCallbacks.set(commandIdOrCallback, []);
      }
      this.resultCallbacks.get(commandIdOrCallback)!.push(callback!);
    } else {
      // S'abonner à tous les résultats
      this.globalResultCallbacks.push(commandIdOrCallback);
    }
  }

  /**
   * Callbacks globaux pour tous les résultats.
   */
  private globalResultCallbacks: CommandResultCallback[] = [];

  /**
   * S'abonne aux mises à jour de statut des commandes.
   * 
   * @param callback - Callback à appeler lors d'une mise à jour de statut
   */
  onStatusUpdate(callback: CommandStatusCallback): void {
    this.statusCallbacks.push(callback);
  }

  /**
   * Notifie les callbacks de résultat.
   */
  private notifyResult(result: HaCommandResult): void {
    // Notifier les callbacks spécifiques à la commande
    if (result.command.id) {
      const callbacks = this.resultCallbacks.get(result.command.id as string);
      if (callbacks) {
        for (const callback of callbacks) {
          try {
            callback(result);
          } catch (error) {
            this.logger.error('ha:command', `Erreur dans callback de résultat: ${error}`);
          }
        }
      }
    }

    // Notifier les callbacks globaux
    for (const callback of this.globalResultCallbacks) {
      try {
        callback(result);
      } catch (error) {
        this.logger.error('ha:command', `Erreur dans callback global de résultat: ${error}`);
      }
    }
  }

  /**
   * Notifie les callbacks de statut.
   */
  private notifyStatusUpdate(command: HaCommandWithStatus): void {
    for (const callback of this.statusCallbacks) {
      try {
        callback({ ...command });
      } catch (error) {
        this.logger.error('ha:command', `Erreur dans callback de statut: ${error}`);
      }
    }
  }

  /**
   * Crée une commande simple pour allumer une entité.
   * 
   * @param entityId - ID de l'entité
   * @returns La commande
   */
  createTurnOnCommand(entityId: string | string[]): HaCommand {
    const firstId = Array.isArray(entityId) && entityId.length > 0 ? entityId[0] : entityId;
    const domain = typeof firstId === 'string' ? firstId.split('.')[0] || '' : '';
    return {
      entity_id: entityId,
      domain: domain,
      service: 'turn_on',
    };
  }

  /**
   * Crée une commande simple pour éteindre une entité.
   * 
   * @param entityId - ID de l'entité
   * @returns La commande
   */
  createTurnOffCommand(entityId: string | string[]): HaCommand {
    const firstId = Array.isArray(entityId) && entityId.length > 0 ? entityId[0] : entityId;
    const domain = typeof firstId === 'string' ? firstId.split('.')[0] || '' : '';
    return {
      entity_id: entityId,
      domain: domain,
      service: 'turn_off',
    };
  }

  /**
   * Crée une commande pour définir la température.
   * 
   * @param entityId - ID de l'entité
   * @param temperature - Température cible
   * @returns La commande
   */
  createSetTemperatureCommand(entityId: string, temperature: number): HaCommand {
    const domain = entityId.split('.')[0] || '';
    return {
      entity_id: entityId,
      domain: domain,
      service: 'set_temperature',
      service_data: { temperature },
    };
  }

  /**
   * Crée une commande pour définir un état.
   * 
   * @param entityId - ID de l'entité
   * @param state - État cible
   * @returns La commande
   */
  createSetStateCommand(entityId: string, state: string): HaCommand {
    const domain = entityId.split('.')[0] || '';
    return {
      entity_id: entityId,
      domain: domain,
      service: 'set_state',
      service_data: { state },
    };
  }

  /**
   * Vérifie si une commande est valide.
   * 
   * @param command - Commande à valider
   * @returns true si la commande est valide
   */
  isValidCommand(command: HaCommand): boolean {
    if (!command.domain || command.domain.trim() === '') {
      return false;
    }
    if (!command.service || command.service.trim() === '') {
      return false;
    }
    if (!command.entity_id || (Array.isArray(command.entity_id) && command.entity_id.length === 0)) {
      return false;
    }
    return true;
  }

  /**
   * Efface toutes les commandes en attente.
   */
  clearPendingCommands(): void {
    for (const [_commandId, command] of this.pendingCommands) {
      command.status = 'error';
      command.error = 'Commands cleared';
      command.timestamp = new Date();
      this.notifyStatusUpdate(command);
    }

    this.pendingCommands.clear();
    this.resultCallbacks.clear();
    this.globalResultCallbacks = [];

    this.logger.info('ha:command', 'Toutes les commandes en attente ont été effacées');
  }

  /**
   * Vérifie si le client HA est connecté.
   */
  isConnected(): boolean {
    return this.haWsClient.getIsAuthenticated();
  }

  /**
   * Attend que le client HA soit prêt.
   * 
   * @param timeout - Timeout en ms (optionnel)
   * @returns Promise qui résout quand le client est prêt
   */
  async waitForConnection(timeout?: number): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 100;

    while (!this.haWsClient.getIsReady()) {
      if (timeout && Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for HA connection (${timeout}ms)`);
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }
}
