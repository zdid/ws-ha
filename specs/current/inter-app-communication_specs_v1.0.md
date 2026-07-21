# Spécifications — Communication Inter-Applications
**Version :** 1.0
**Date :** 20 Juillet 2026
**Statut :** Spécification active
**Conformité :** specs-techniques-socle-ha-mqtt-v4.6.md (architecture 5 couches)

---

## 📌 Table des Matières
1. [Principe général](#1-principe-général)
2. [Pattern de communication](#2-pattern-de-communication)
3. [Système de corrélation Request/Reply](#3-système-de-corrélation-requestreply)
4. [Déclaration des capacités](#4-déclaration-des-capacités)
5. [Implémentation technique](#5-implémentation-technique)
6. [Gestion des erreurs](#6-gestion-des-erreurs)
7. [Exemples complets](#7-exemples-complets)
8. [Bonnes pratiques](#8-bonnes-pratiques)
9. [Références](#9-références)

---

## 1. Principe général

### 1.1 Modèle de communication
Les applications du socle communiquent entre elles via **l'EventBus partagé** selon **deux patterns** :

| Pattern | Type | Description | Synchronisation |
|---------|------|-------------|-----------------|
| **Fire & Forget** | Événement unidirectionnel | Une application émet, d'autres écoutent | Asynchrone |
| **Request/Reply** | Question/Réponse | Une application pose une question, une autre répond | **Asynchrone avec corrélation** |

> **⚠️ IMPORTANT :** TOUTES les communications inter-applications sont **asynchrones**. 
> Aucune communication synchrone n'est autorisée entre applications. Le pattern Request/Reply 
> utilise des Promises et un système de corrélation pour gérer l'asynchronisme.

### 1.2 Règles fondamentales

1. **Un seul EventBus partagé** : Toutes les applications reçoivent la même instance d'EventBus du core
2. **Pas de couplage direct** : Les applications ne connaissent pas l'implémentation des autres
3. **Contrats explicites** : Chaque application déclare ce qu'elle gère (handledRequests)
4. **Corrélation obligatoire** : Toutes les Request/Reply DOIVENT utiliser un `requestId` unique
5. **Pas de timeout dans le core** : La gestion des timeouts est responsabilité de l'application appelante
6. **Toutes les applications (sauf core) DOIVENT implémenter** le suivi des requêtes (Request Tracking)

### 1.3 Glossaire

| Terme | Définition |
|-------|------------|
| **Capacité (Capability)** | Fonctionnalité qu'une application expose aux autres (ex: `scheduler:schedule`) |
| **Request** | Question posée par une application à une autre |
| **Reply** | Réponse à une Request, identifiée par `requestId` |
| **RequestId** | Identifiant unique de corrélation entre Request et Reply |
| **Fire & Forget** | Événement sans réponse attendue |
| **Handler** | Fonction qui traite une Request et émet une Reply |

---

## 2. Pattern de communication

### 2.1 Fire & Forget (Événements simples)

Pour les notifications où aucune réponse n'est attendue.

```
Émetteur ──────[emit]──► EventBus ──────[on]──► Récepteur(s)
     │                    (asynchrone)           │
     └─────────────────────────────────────────┘
                        │
                 (aucune réponse attendue)
```

**Cas d'usage :**
- Notification de changement d'état
- Détection de device
- Logs inter-applications
- Événements de cycle de vie

**Exemple :**
```typescript
// L'application RFXCOM notifie qu'un device a été détecté
this.eventBus.emitGeneric('rfxcom:device:detected', {
  deviceId: '0xA5B3',
  type: 'RFXSensor',
  subType: 'Temperature'
});

// L'application IA écoute ces notifications
this.eventBus.onGeneric('rfxcom:device:detected', (data) => {
  this.handleNewDevice(data);
});
```

### 2.2 Request/Reply (Question/Réponse)

Pour les interactions où une réponse est attendue. **Toutes les réponses sont asynchrones.**

```
Émetteur ──────[emit]──► EventBus ──────[on]──► Récepteur
     │                    (asynchrone)           │
     │                     requestId: "req-123"  │
     │                                          ▼
     │                                 [traitement asynchrone]
     │                                          │
     └──────────────────[on]◄──────────────────┘
              reply:
          { requestId: "req-123", status: "success", result: {...} }
```

**Caractéristiques :**
- **Asynchrone** : L'émetteur continue son exécution sans attendre
- **Corrélation** : Le `requestId` permet de lier Request et Reply
- **Promise-based** : L'émetteur utilise une Promise pour recevoir la réponse
- **Timeout** : L'émetteur peut définir un timeout (géré localement)

**Cas d'usage :**
- IA demande une planification au Scheduler
- Scheduler demande l'état d'un device à HA
- RFXCOM demande la configuration MQTT
- Toute interaction nécessitant une confirmation ou un résultat

**Exemple :**
```typescript
// Émetteur : L'IA demande une planification
const reply = await this.interAppClient.request(
  'scheduler:schedule',
  { action: 'turn_on', at: '+15m', entity: 'light.salon' },
  5000 // timeout 5 secondes
);

if (reply.status === 'success') {
  console.log('Planification créée:', reply.result.scheduleId);
}

// Récepteur : Le Scheduler traite la demande
this.eventBus.onGeneric('scheduler:schedule', (request) => {
  // Traitement...
  this.replyToRequest(request, {
    status: 'success',
    result: { scheduleId: 'sched-123' }
  });
});
```

---

## 3. Système de corrélation Request/Reply

### 3.1 Structure de base

#### Request (Question)
```typescript
// applications/core/src/types/interapp.ts

export interface AppRequest<T = unknown> {
  // ⭐ OBLIGATOIRE : Identifiant unique de la requête
  // Format : {appId}-{timestamp}-{seq}
  // Exemple : "ia-1hf3k2m-5"
  requestId: string;

  // Nom de la capacité appelée (ex: "scheduler:schedule")
  capability: string;

  // Payload spécifique à la capacité
  payload: T;

  // ⭐ OBLIGATOIRE : Identifiant de l'application émettrice
  fromApp: string;

  // Timestamp de la requête (ISO8601)
  timestamp: string;

  // Timeout optionnel (en ms) - géré par l'émetteur
  timeout?: number;
}
```

#### Reply (Réponse)
```typescript
// applications/core/src/types/interapp.ts

export interface AppReply<T = unknown, E = unknown> {
  // ⭐ OBLIGATOIRE : Doit correspondre au requestId de la requête
  requestId: string;

  // Identifiant de la requête originale (pour vérification)
  // Doit être égal à requestId
  inReplyTo: string;

  // ⭐ OBLIGATOIRE : Identifiant de l'application réceptrice
  fromApp: string;

  // Statut de la réponse
  status: 'success' | 'error' | 'timeout';

  // Résultat (si status = 'success')
  result?: T;

  // Erreur (si status = 'error')
  error?: {
    code: string;              // Code d'erreur standardisé
    message: string;           // Message lisible
    details?: E;               // Détails optionnels
  };

  // Timestamp de la réponse (ISO8601)
  timestamp: string;
}
```

### 3.2 Génération du requestId

**Format :** `{appId}-{timestamp}-{seq}`

```typescript
// applications/core/src/application/requestCorrelator.ts

let requestCounters: Map<string, number> = new Map();

export function generateRequestId(appId: string): string {
  const timestamp = Date.now().toString(36);
  const seq = (requestCounters.get(appId) || 0) + 1;
  requestCounters.set(appId, seq);
  return `${appId}-${timestamp}-${seq}`;
}

// Exemple d'utilisation :
// generateRequestId('ia') -> "ia-1hf3k2m-5"
// generateRequestId('ia') -> "ia-1hf3k2m-6"
// generateRequestId('mqtt') -> "mqtt-1hf3k2m-1"
```

### 3.3 Suivi des requêtes (Request Tracking)

**Chaque application (sauf core) DOIT implémenter** un mécanisme de suivi des requêtes en attente.

```typescript
// applications/core/src/application/InterAppClient.ts

export interface PendingRequest {
  resolve: (reply: AppReply) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout | null;
  timestamp: number;
  capability: string;
}

export class RequestTracker {
  // Map des requêtes en attente : requestId -> PendingRequest
  private pendingRequests: Map<string, PendingRequest> = new Map();

  // Map des réponses déjà reçues (pour déduplication)
  private receivedReplies: Set<string> = new Set();

  addRequest(requestId: string, pending: PendingRequest): void {
    this.pendingRequests.set(requestId, pending);
  }

  getRequest(requestId: string): PendingRequest | undefined {
    return this.pendingRequests.get(requestId);
  }

  removeRequest(requestId: string): void {
    this.pendingRequests.delete(requestId);
  }

  markReplyAsReceived(requestId: string): boolean {
    if (this.receivedReplies.has(requestId)) {
      return false; // Déjà reçue (dédoublonnage)
    }
    this.receivedReplies.add(requestId);
    return true;
  }

  cleanupExpired(timeout: number = 300000): void {
    // Nettoyer les requêtes expirées (5 min par défaut)
    const now = Date.now();
    for (const [requestId, pending] of this.pendingRequests) {
      if (now - pending.timestamp > timeout) {
        this.pendingRequests.delete(requestId);
      }
    }
  }
}
```

### 3.4 Flux complet Request/Reply

```
1. Émetteur génère requestId unique
   │
2. Émetteur émet Request sur EventBus
   │   request: { requestId: "ia-xxx-1", capability: "scheduler:schedule", ... }
   │
3. Récepteur(s) reçoivent la Request
   │   (plusieurs récepteurs peuvent écouter, mais seul celui qui gère
   │    la capacité doit répondre)
   │
4. Récepteur traite la demande de manière ASYNCHRONE
   │   (peuvent être des opérations longues)
   │
5. Récepteur émet Reply sur EventBus
   │   reply: { requestId: "ia-xxx-1", inReplyTo: "ia-xxx-1", 
   │            fromApp: "scheduler", status: "success", ... }
   │
6. Émetteur reçoit la Reply via son RequestTracker
   │   (la Promise est résolue ou rejetée)
   │
7. Si timeout dépassé, Promise rejetée avec erreur TimeoutError
```

---

## 4. Déclaration des capacités

### 4.1 Structure de déclaration

**Toute application (sauf core) DOIT exporter** dans `domain/index.ts` une déclaration de ses capacités.

```typescript
// applications/core/src/types/interapp.ts

import type { AppRequest, AppReply } from './interapp';

// Type générique pour les handlers
export type RequestHandler<T extends AppRequest = AppRequest, R = unknown> = (
  request: T,
  reply: (response: AppReply<R>) => void
) => void | Promise<void>;

// Déclaration des capacités de l'application
export interface ApplicationCapabilities {
  // Identifiant unique de l'application
  id: string;

  // Nom affiché
  name: string;

  // Description
  description: string;

  // Version de l'API (pour compatibilité ascendante)
  version?: string;

  // ⭐ Capacités gérées (Request/Reply)
  // Clé = nom de la capacité (ex: "scheduler:schedule")
  // Valeur = configuration de la capacité
  handledRequests: {
    [capabilityName: string]: {
      description: string;
      requestType: string;       // Nom du type TypeScript pour le payload
      responseType: string;      // Nom du type TypeScript pour le résultat
      handler: RequestHandler;
      // Timeout maximum acceptable pour cette capacité (ms)
      maxTimeout?: number;
    };
  };

  // Événements émettables (Fire & Forget)
  // Ces événements peuvent être écoutés par d'autres applications
  emittedEvents?: {
    [eventName: string]: {
      description: string;
      payloadType: string;      // Nom du type TypeScript
    };
  };
}
```

### 4.2 Exemple : Application Scheduler

```typescript
// applications/scheduler/domain/index.ts

import type { AppRequest, AppReply, ApplicationCapabilities, RequestHandler } from '../../../core/src/types/interapp';

// === Types spécifiques au Scheduler ===

export interface ScheduleRequestPayload {
  // Action à exécuter
  action: string;
  
  // Quand exécuter (ISO8601 ou relative comme "+15m")
  at: string;
  
  // Entité ou topic cible
  target?: string;
  
  // Payload spécifique à l'action
  payload?: Record<string, unknown>;
  
  // Options de planification
  options?: {
    repeat?: string;    // "daily", "weekly", cron expression
    retryCount?: number;
    retryDelay?: number;
  };
}

export interface ScheduleReplyResult {
  scheduleId: string;
  scheduledAt: string;       // ISO8601
  status: 'scheduled' | 'already-exists' | 'invalid' | 'conflict';
  message?: string;
}

export interface CancelRequestPayload {
  scheduleId: string;
  force?: boolean;
}

export interface CancelReplyResult {
  success: boolean;
  scheduleId: string;
  message?: string;
}

export interface ScheduleItem {
  id: string;
  action: string;
  at: string;
  status: 'pending' | 'executed' | 'cancelled' | 'failed' | 'missed';
  target?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  executedAt?: string;
  errorMessage?: string;
}

// === Handlers ===

const handleScheduleRequest: RequestHandler<
  AppRequest<ScheduleRequestPayload>,
  ScheduleReplyResult
> = async (request, reply) => {
  try {
    const result = await SchedulerEngine.schedule(request.payload);
    
    reply({
      requestId: request.requestId,
      inReplyTo: request.requestId,
      fromApp: 'scheduler',
      status: 'success',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    reply({
      requestId: request.requestId,
      inReplyTo: request.requestId,
      fromApp: 'scheduler',
      status: 'error',
      error: {
        code: 'SCHEDULE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? undefined : error
      },
      timestamp: new Date().toISOString()
    });
  }
};

const handleCancelRequest: RequestHandler<
  AppRequest<CancelRequestPayload>,
  CancelReplyResult
> = async (request, reply) => {
  try {
    const result = await SchedulerEngine.cancel(request.payload);
    
    reply({
      requestId: request.requestId,
      inReplyTo: request.requestId,
      fromApp: 'scheduler',
      status: 'success',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    reply({
      requestId: request.requestId,
      inReplyTo: request.requestId,
      fromApp: 'scheduler',
      status: 'error',
      error: {
        code: 'CANCEL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date().toISOString()
    });
  }
};

const handleListRequest: RequestHandler<
  AppRequest<void>,
  ScheduleItem[]
> = async (request, reply) => {
  try {
    const items = await SchedulerEngine.list();
    
    reply({
      requestId: request.requestId,
      inReplyTo: request.requestId,
      fromApp: 'scheduler',
      status: 'success',
      result: items,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    reply({
      requestId: request.requestId,
      inReplyTo: request.requestId,
      fromApp: 'scheduler',
      status: 'error',
      error: {
        code: 'LIST_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date().toISOString()
    });
  }
};

// === Events Fire & Forget ===

// Événement émis quand une planification est exécutée
export interface ScheduleExecutedPayload {
  scheduleId: string;
  action: string;
  target?: string;
  executedAt: string;
  success: boolean;
  errorMessage?: string;
}

// Événement émis quand une planification est manquée
export interface ScheduleMissedPayload {
  scheduleId: string;
  action: string;
  scheduledAt: string;
  missedAt: string;
  reason: 'device-offline' | 'error' | 'timeout' | 'unknown';
}

// === Déclaration complète des capacités ===

export const SCHEDULER_CAPABILITIES: ApplicationCapabilities = {
  id: 'scheduler',
  name: 'Planificateur',
  description: 'Gère la planification d\'actions futures et la gestion des tâches temporisées',
  version: '1.0',

  handledRequests: {
    'scheduler:schedule': {
      description: 'Planifier une nouvelle action',
      requestType: 'AppRequest<ScheduleRequestPayload>',
      responseType: 'AppReply<ScheduleReplyResult>',
      handler: handleScheduleRequest,
      maxTimeout: 10000 // 10 secondes max
    },
    'scheduler:cancel': {
      description: 'Annuler une planification existante',
      requestType: 'AppRequest<CancelRequestPayload>',
      responseType: 'AppReply<CancelReplyResult>',
      handler: handleCancelRequest,
      maxTimeout: 5000
    },
    'scheduler:list': {
      description: 'Lister toutes les planifications actives',
      requestType: 'AppRequest<void>',
      responseType: 'AppReply<ScheduleItem[]>',
      handler: handleListRequest,
      maxTimeout: 3000
    },
    'scheduler:get': {
      description: 'Récupérer une planification spécifique',
      requestType: 'AppRequest<{scheduleId: string}>',
      responseType: 'AppReply<ScheduleItem | null>',
      handler: handleGetRequest
    }
  },

  emittedEvents: {
    'scheduler:executed': {
      description: 'Une planification a été exécutée avec succès',
      payloadType: 'ScheduleExecutedPayload'
    },
    'scheduler:missed': {
      description: 'Une planification a été manquée',
      payloadType: 'ScheduleMissedPayload'
    },
    'scheduler:created': {
      description: 'Une nouvelle planification a été créée',
      payloadType: 'ScheduleItem'
    },
    'scheduler:cancelled': {
      description: 'Une planification a été annulée',
      payloadType: 'ScheduleItem'
    }
  }
};

// Export pour compatibilité
export default SCHEDULER_CAPABILITIES;
```


### 4.3 Découverte des capacités

**Approche décentralisée :** Chaque application documente ses propres capacités dans sa spécification (section 9). 
Il n'y a **pas de registry central** au runtime. Les applications découvrent les capacités disponibles en consultant la documentation de chaque application.

**Bonnes pratiques :**
- Chaque application exporte ses types dans `domain/index.ts` pour permettre aux autres applications de les importer
- Les noms de capacités suivent la convention `{app}:{action}` (ex: `rfxcom:device:list`)
- Les conflits de noms de capacités sont résolus par convention entre développeurs

### 4.4 Intégration avec le démarrage des applications

Les applications démarrent indépendamment. Aucune inscription centrale n'est nécessaire. Chaque application :

1. Déclare ses capacités dans sa section 9 de spécification
2. Exporte ses types TypeScript pour les autres applications
3. Écoute les requêtes qu'elle gère via `interAppClient.onRequest()`
4. Émet les événements qu'elle produit via `interAppClient.emit()`

```typescript
// Exemple d'initialisation dans une application
import { InterAppClient } from '../../../core/src/exports';

class RfxcomApp {
  private interAppClient: InterAppClient;

  start() {
    // Écouter les requêtes gérées
    this.interAppClient.onRequest('rfxcom:device:list', this.handleListRequest);
    this.interAppClient.onRequest('rfxcom:device:send', this.handleSendRequest);
    
    // Les autres applications peuvent maintenant appeler ces capacités
  }
}
```


---

## 5. Implémentation technique

### 5.1 Client InterApp (à utiliser par toutes les applications)

**Fichier :** `applications/core/src/application/InterAppClient.ts`

```typescript
import type { IEventBus } from './IEventBus';
import type { Logger } from '../infrastructure/logger/index';
import type { AppRequest, AppReply, ApplicationCapabilities } from '../types/interapp';

/**
 * Client pour la communication inter-applications
 * Gère les Request/Reply avec corrélation et timeout
 */
export class InterAppClient {
  private requestTracker: RequestTracker;
  private requestCounter: number = 0;

  constructor(
    private eventBus: IEventBus,
    private logger: Logger,
    private appId: string
  ) {
    this.requestTracker = new RequestTracker();
    
    // Écouter toutes les réponses
    this.eventBus.onGeneric('*:reply', (reply: AppReply) => {
      this.handleReply(reply);
    });

    this.logger.info('InterAppClient', `Client inter-app initialisé pour ${appId}`);
  }

  /**
   * Pose une question à une autre application
   * @param capability - Nom de la capacité (ex: 'scheduler:schedule')
   * @param payload - Payload de la requête
   * @param timeout - Timeout en ms (défaut: 5000)
   * @returns Promise qui résout avec la réponse
   */
  async request<P = unknown, R = unknown>(
    capability: string,
    payload: P,
    timeout: number = 5000
  ): Promise<AppReply<R>> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();

      // Créer la requête
      const request: AppRequest<P> = {
        requestId,
        capability,
        payload,
        fromApp: this.appId,
        timestamp: new Date().toISOString(),
        timeout
      };

      // Stocker la promesse pour corrélation
      const pending: PendingRequest = {
        resolve,
        reject,
        timeout: null,
        timestamp: Date.now(),
        capability
      };

      this.requestTracker.addRequest(requestId, pending);

      this.logger.debug(
        'InterAppClient',
        `Requête émise: ${capability} (reqId: ${requestId}) from ${this.appId}`
      );

      // Émettre la requête
      this.eventBus.emitGeneric(capability, request);

      // Gestion du timeout
      pending.timeout = setTimeout(() => {
        this.requestTracker.removeRequest(requestId);
        reject(new InterAppTimeoutError(
          requestId,
          capability,
          timeout,
          this.appId
        ));
      }, timeout);
    });
  }

  /**
   * Émet un événement Fire & Forget
   * @param eventName - Nom de l'événement
   * @param payload - Payload de l'événement
   */
  emit(eventName: string, payload: unknown): void {
    this.logger.debug(
      'InterAppClient',
      `Événement émis: ${eventName} from ${this.appId}`
    );
    
    this.eventBus.emitGeneric(eventName, {
      ...payload,
      fromApp: this.appId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Écoute un événement Fire & Forget
   * @param eventName - Nom de l'événement
   * @param handler - Callback de traitement
   */
  on(eventName: string, handler: (payload: unknown, fromApp: string) => void): void {
    this.eventBus.onGeneric(eventName, (payload: unknown) => {
      // Extraire fromApp et timestamp si présents
      const fromApp = (payload as any)?.fromApp || 'unknown';
      const cleanPayload = (payload as any)?.payload || payload;
      
      this.logger.debug(
        'InterAppClient',
        `Événement reçu: ${eventName} from ${fromApp}`
      );
      
      handler(cleanPayload, fromApp);
    });
  }

  /**
   * Écoute une capacité Request/Reply spécifique
   * À utiliser par les applications qui gèrent des capacités
   * @param capability - Nom de la capacité
   * @param handler - Handler de traitement
   */
  onRequest<R = unknown, P = unknown>(
    capability: string,
    handler: RequestHandler<AppRequest<P>, R>
  ): void {
    this.eventBus.onGeneric(capability, (request: AppRequest<P>) => {
      this.logger.debug(
        'InterAppClient',
        `Requête reçue: ${capability} (reqId: ${request.requestId}) from ${request.fromApp}`
      );
      
      // Appeler le handler avec un wrapper pour le reply
      handler(request, (reply: AppReply<R>) => {
        this.sendReply(reply);
      });
    });
  }

  /**
   * Émet une réponse à une requête
   * @param reply - Réponse à envoyer
   */
  sendReply(reply: AppReply): void {
    // Vérifier que la réponse a bien un requestId
    if (!reply.requestId) {
      this.logger.error(
        'InterAppClient',
        'Tentative d\'envoi de réponse sans requestId'
      );
      return;
    }

    // Définir inReplyTo si non présent
    if (!reply.inReplyTo) {
      reply.inReplyTo = reply.requestId;
    }

    // Définir timestamp si non présent
    if (!reply.timestamp) {
      reply.timestamp = new Date().toISOString();
    }

    // Définir fromApp si non présent
    if (!reply.fromApp) {
      reply.fromApp = this.appId;
    }

    this.logger.debug(
      'InterAppClient',
      `Réponse envoyée: ${reply.requestId} (inReplyTo: ${reply.inReplyTo}) status=${reply.status}`
    );

    // Émettre la réponse avec le pattern {capability}:reply
    // On émet sur un canal générique que l'émetteur original écoute
    this.eventBus.emitGeneric(`${reply.inReplyTo}:reply`, reply);
  }

  /**
   * Gère une réponse reçue
   */
  private handleReply(reply: AppReply): void {
    // Vérifier que cette réponse n'a pas déjà été traitée
    if (!this.requestTracker.markReplyAsReceived(reply.requestId)) {
      this.logger.warn(
        'InterAppClient',
        `Réponse dupliquée reçue pour: ${reply.requestId}`
      );
      return;
    }

    const pending = this.requestTracker.getRequest(reply.requestId);

    if (!pending) {
      this.logger.warn(
        'InterAppClient',
        `Réponse reçue pour requête inconnue: ${reply.requestId} (from: ${reply.fromApp})`
      );
      return;
    }

    // Clear timeout
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    // Résoudre ou rejeter selon le statut
    if (reply.status === 'success') {
      this.logger.debug(
        'InterAppClient',
        `Réponse réussie pour ${reply.requestId}: ${pending.capability}`
      );
      pending.resolve(reply);
    } else {
      const errorMessage = reply.error?.message || `Erreur ${reply.status}`;
      const error = new InterAppReplyError(
        reply.requestId,
        pending.capability,
        reply.status,
        reply.error?.code,
        errorMessage,
        reply.error?.details
      );
      
      this.logger.warn(
        'InterAppClient',
        `Réponse en erreur pour ${reply.requestId}: ${errorMessage}`
      );
      pending.reject(error);
    }

    this.requestTracker.removeRequest(reply.requestId);
  }

  /**
   * Génère un requestId unique
   */
  private generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    this.requestCounter++;
    return `${this.appId}-${timestamp}-${this.requestCounter}`;
  }

  /**
   * Nettoie les requêtes expirées
   */
  cleanupExpired(): void {
    this.requestTracker.cleanupExpired();
  }

  /**
   * Récupère le nombre de requêtes en attente
   */
  get pendingCount(): number {
    return this.requestTracker.pendingRequests.size;
  }
}

// =============================================================================
// TYPES D'ERREURS SPÉCIFIQUES
// =============================================================================

/**
 * Erreur de timeout pour une requête inter-application
 */
export class InterAppTimeoutError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly capability: string,
    public readonly timeout: number,
    public readonly fromApp: string
  ) {
    super(
      `Timeout pour ${capability} (reqId: ${requestId}) après ${timeout}ms. ` +
      `Émetteur: ${fromApp}`
    );
    this.name = 'InterAppTimeoutError';
  }
}

/**
 * Erreur dans la réponse inter-application
 */
export class InterAppReplyError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly capability: string,
    public readonly status: 'error' | 'timeout',
    public readonly errorCode?: string,
    public readonly errorMessage: string,
    public readonly details?: unknown
  ) {
    super(
      `Erreur ${status} pour ${capability} (reqId: ${requestId}): ${errorMessage}` +
      (errorCode ? ` [${errorCode}]` : '')
    );
    this.name = 'InterAppReplyError';
  }
}

// =============================================================================
// CLASSE REQUESTTRACKER (déplacée ici pour simplicité)
// =============================================================================

interface PendingRequest {
  resolve: (reply: AppReply) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout | null;
  timestamp: number;
  capability: string;
}

class RequestTracker {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private receivedReplies: Set<string> = new Set();

  addRequest(requestId: string, pending: PendingRequest): void {
    this.pendingRequests.set(requestId, pending);
  }

  getRequest(requestId: string): PendingRequest | undefined {
    return this.pendingRequests.get(requestId);
  }

  removeRequest(requestId: string): void {
    this.pendingRequests.delete(requestId);
  }

  markReplyAsReceived(requestId: string): boolean {
    if (this.receivedReplies.has(requestId)) {
      return false; // Déjà reçue
    }
    this.receivedReplies.add(requestId);
    return true;
  }

  cleanupExpired(timeout: number = 300000): void {
    const now = Date.now();
    for (const [requestId, pending] of this.pendingRequests) {
      if (now - pending.timestamp > timeout) {
        this.pendingRequests.delete(requestId);
      }
    }
  }
}
