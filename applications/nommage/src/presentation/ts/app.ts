/**
 * Script TypeScript pour l'interface de l'application NOMMAGE
 * 
 * Fonctionnalités :
 * - Connexion Socket.io au serveur
 * - Affichage du statut de l'application
 * - Affichage des messages de découverte parsés
 * 
 * Note: UI minimaliste pour l'instant - juste affiche la présence de l'application
 */

// Import SocketService depuis le core (point d'entrée UI navigateur, pas le backend)
// Chemin depuis applications/nommage/src/presentation/ts/ vers applications/core/src/ui-exports
import { SocketService } from '../../../../core/src/ui-exports';

// ============================================================================
// Types pour les données reçues
// ============================================================================

interface SourceStatus {
  id: string;
  connected: boolean;
}

interface DailyCount {
  date: string;
  count: number;
}

interface NommageStatus {
  connected: boolean;
  mqttConnected: boolean;
  discoveryTopics: string[];
  parsedMessagesCount: number;
  lastParsedAt?: Date;
  error?: string;
  sources: SourceStatus[];
  dailyCounts: DailyCount[];
}

interface DiscoveryParsedEvent {
  rawMessage: {
    rawName: string;
    topic: string;
    timestamp: Date;
  };
  parsedTaxonomy: {
    quoi: { raw: string; slug: string };
    ou: {
      precis?: { raw: string; slug: string };
      lieu?: { raw: string; slug: string };
      pere?: { raw: string; slug: string };
      grandPere?: { raw: string; slug: string };
    };
  };
  timestamp: Date;
}

interface TaxonomyStructure {
  structures: Array<{
    entityId: string;
    taxonomy: unknown;
    lastUpdated: Date;
  }>;
  count: number;
  timestamp: Date;
}

// ============================================================================
// État de l'application
// ============================================================================

let appStatus: NommageStatus | null = null;
let socket: any | null = null;

// ============================================================================
// Initialisation
// ============================================================================

/**
 * Initialiser l'application
 */
function init(): void {
  try {
    // Créer et connecter le socket
    const socketService = new SocketService();
    socket = socketService.connect();
    
    // Configurer les écouteurs d'événements
    setupEventListeners();
    
    // Demander le statut initial
    requestInitialStatus();
    
    // Masquer le chargement
    hideLoading();
    
    console.log('[NOMMAGE UI] Initialisation terminée');
    
  } catch (error) {
    console.error('[NOMMAGE UI] Erreur d\'initialisation:', error);
    showError('Erreur d\'initialisation de l\'application NOMMAGE');
  }
}

/**
 * Configurer les écouteurs d'événements Socket.io
 */
function setupEventListeners(): void {
  if (!socket) return;
  
  // Statut de l'application
  socket.on('nommage:status', (status: NommageStatus) => {
    appStatus = status;
    updateStatusDisplay(status);
    showMainContent();
  });
  
  // Message de découverte parsed
  socket.on('nommage:discovery:parsed', (data: DiscoveryParsedEvent) => {
    updateParsedMessagesCounter();
    updateLastParsedDisplay(data.timestamp);
    
    if (appStatus) {
      appStatus.parsedMessagesCount++;
      appStatus.lastParsedAt = data.timestamp;
    }
    
    console.log('[NOMMAGE UI] Message parsed:', data.rawMessage.rawName);
  });
  
  // Structure taxonomique
  socket.on('nommage:taxonomy:structure', (data: TaxonomyStructure) => {
    console.log('[NOMMAGE UI] Structure taxonomique mise à jour:', data.count, 'entités');
  });
  
  // Erreur
  socket.on('nommage:error', (error: { message: string; timestamp: Date }) => {
    showError(error.message);
  });
  
  // Connexion/déconnexion Socket.io
  socket.on('connect', () => {
    console.log('[NOMMAGE UI] Connecté au serveur Socket.io');
    requestInitialStatus();
  });
  
  socket.on('disconnect', () => {
    console.log('[NOMMAGE UI] Déconnecté du serveur Socket.io');
    showDisconnected();
  });
  
  // Événements persistants (reçus automatiquement à la connexion)
  socket.on('nommage:status', updateStatusDisplay);
  socket.on('nommage:taxonomy:structure', (data: TaxonomyStructure) => {
    if (data.count > 0) {
      document.getElementById('messages-counter')!.textContent = String(data.count);
    }
  });
}

/**
 * Demander le statut initial
 */
function requestInitialStatus(): void {
  if (!socket) return;
  
  // Ces événements sont persistants, donc devraient être reçus automatiquement
  // Mais on peut forcer une demande si nécessaire
  socket.emit('nommage:status:get');
  socket.emit('nommage:taxonomy:get');
}

// ============================================================================
// Mise à jour de l'affichage
// ============================================================================

/**
 * Mettre à jour l'affichage du statut
 */
function updateStatusDisplay(status: NommageStatus): void {
  // Mettre à jour les indicateurs
  const appStatusEl = document.getElementById('app-status');
  const mqttStatusEl = document.getElementById('mqtt-status');
  const parsedCountEl = document.getElementById('parsed-count');
  const lastParsedEl = document.getElementById('last-parsed');
  
  if (appStatusEl) {
    appStatusEl.textContent = status.connected ? 'Connecté' : 'Déconnecté';
    appStatusEl.className = `value ${status.connected ? 'connected' : 'disconnected'}`;
  }
  
  if (mqttStatusEl) {
    mqttStatusEl.textContent = status.mqttConnected ? 'Connecté' : 'Déconnecté';
    mqttStatusEl.className = `value ${status.mqttConnected ? 'connected' : 'disconnected'}`;
  }
  
  if (parsedCountEl) {
    parsedCountEl.textContent = String(status.parsedMessagesCount);
  }
  
  if (lastParsedEl) {
    lastParsedEl.textContent = status.lastParsedAt 
      ? new Date(status.lastParsedAt).toLocaleString('fr-FR')
      : '--';
  }
  
  // Mettre à jour les topics de découverte
  updateDiscoveryTopics(status.discoveryTopics);

  // Mettre à jour le compteur de messages
  if (status.parsedMessagesCount > 0) {
    const counterEl = document.getElementById('messages-counter');
    if (counterEl) {
      counterEl.textContent = String(status.parsedMessagesCount);
    }
  }

  // Afficher la date du dernier parsing
  if (status.lastParsedAt) {
    const lastParsedDetailEl = document.getElementById('last-parsed-detail');
    if (lastParsedDetailEl) {
      lastParsedDetailEl.textContent = `Dernier parsing: ${new Date(status.lastParsedAt).toLocaleString('fr-FR')}`;
    }
  }

  // Statut par connexion (source MQTT)
  updateSourcesDisplay(status.sources);

  // Entrées traitées sur les 5 derniers jours
  updateDailyStatsDisplay(status.dailyCounts);
}

/**
 * Affiche le statut de chaque connexion (nom + connecté/déconnecté)
 */
function updateSourcesDisplay(sources: SourceStatus[]): void {
  const listEl = document.getElementById('sources-list');
  const cardEl = document.getElementById('sources-card');

  if (!listEl || !sources || sources.length === 0) return;

  if (cardEl) cardEl.style.display = 'block';

  listEl.innerHTML = sources.map((source) => `
    <div class="source-row">
      <span class="source-name">${escapeHtml(source.id)}</span>
      <span class="source-badge ${source.connected ? 'connected' : 'disconnected'}">
        ${source.connected ? 'Connecté' : 'Déconnecté'}
      </span>
    </div>
  `).join('');
}

/**
 * Affiche le nombre d'entrées traitées pour chacun des 5 derniers jours (plus ancien → plus récent)
 */
function updateDailyStatsDisplay(dailyCounts: DailyCount[]): void {
  const headerEl = document.getElementById('daily-stats-header');
  const rowEl = document.getElementById('daily-stats-row');
  const containerEl = document.getElementById('daily-stats');

  if (!headerEl || !rowEl || !dailyCounts || dailyCounts.length === 0) return;

  if (containerEl) containerEl.style.display = 'block';

  headerEl.innerHTML = dailyCounts.map((day) => `<th>${formatShortDate(day.date)}</th>`).join('');
  rowEl.innerHTML = dailyCounts.map((day) => `<td class="count">${day.count}</td>`).join('');
}

/**
 * Formate une date ISO ("AAAA-MM-JJ") en libellé court ("21/07")
 */
function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

/**
 * Mettre à jour l'affichage des topics de découverte
 */
function updateDiscoveryTopics(topics: string[]): void {
  const topicsListEl = document.getElementById('topics-list');
  
  if (!topicsListEl || topics.length === 0) return;
  
  topicsListEl.innerHTML = topics.map(topic => 
    `<span class="topic-tag">${escapeHtml(topic)}</span>`
  ).join('');
}

/**
 * Mettre à jour le compteur de messages parsés
 */
function updateParsedMessagesCounter(): void {
  if (!appStatus) return;
  
  appStatus.parsedMessagesCount++;
  const parsedCountEl = document.getElementById('parsed-count');
  const messagesCounterEl = document.getElementById('messages-counter');
  
  if (parsedCountEl) {
    parsedCountEl.textContent = String(appStatus.parsedMessagesCount);
  }
  
  if (messagesCounterEl) {
    messagesCounterEl.textContent = String(appStatus.parsedMessagesCount);
  }
}

/**
 * Mettre à jour l'affichage du dernier message parsed
 */
function updateLastParsedDisplay(timestamp: Date): void {
  const lastParsedEl = document.getElementById('last-parsed');
  const lastParsedDetailEl = document.getElementById('last-parsed-detail');
  
  if (lastParsedEl) {
    lastParsedEl.textContent = new Date(timestamp).toLocaleString('fr-FR');
  }
  
  if (lastParsedDetailEl) {
    lastParsedDetailEl.textContent = `Dernier parsing: ${new Date(timestamp).toLocaleString('fr-FR')}`;
  }
}

// ============================================================================
// Gestion de l'affichage
// ============================================================================

/**
 * Masquer le chargement
 */
function hideLoading(): void {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.style.display = 'none';
  }
}

/**
 * Afficher le contenu principal
 */
function showMainContent(): void {
  const mainContainerEl = document.getElementById('main-container');
  const actionsEl = document.getElementById('actions');
  
  if (mainContainerEl) {
    mainContainerEl.style.display = 'block';
  }
  
  if (actionsEl) {
    actionsEl.style.display = 'flex';
  }
  
  // Afficher les sections
  const statusCardEl = document.getElementById('status-card');
  const discoveryTopicsEl = document.getElementById('discovery-topics');
  const parsedMessagesEl = document.getElementById('parsed-messages');
  
  if (statusCardEl) statusCardEl.style.display = 'block';
  if (discoveryTopicsEl) discoveryTopicsEl.style.display = 'block';
  if (parsedMessagesEl) parsedMessagesEl.style.display = 'block';
}

/**
 * Afficher la déconnexion
 */
function showDisconnected(): void {
  const appStatusEl = document.getElementById('app-status');
  const mqttStatusEl = document.getElementById('mqtt-status');
  
  if (appStatusEl) {
    appStatusEl.textContent = 'Déconnecté';
    appStatusEl.className = 'value disconnected';
  }
  
  if (mqttStatusEl) {
    mqttStatusEl.textContent = 'Déconnecté';
    mqttStatusEl.className = 'value disconnected';
  }
}

/**
 * Afficher une erreur
 */
function showError(message: string): void {
  const errorEl = document.getElementById('error');
  if (errorEl) {
    errorEl.textContent = `⚠️ Erreur: ${message}`;
    errorEl.style.display = 'block';
  }
}

/**
 * Masquer les erreurs
 */
function hideError(): void {
  const errorEl = document.getElementById('error');
  if (errorEl) {
    errorEl.style.display = 'none';
  }
}

// ============================================================================
// Fonctions d'action (appelées depuis le HTML)
// ============================================================================

/**
 * Rafraîchir le statut (appelée depuis le bouton)
 */
function refreshStatus(): void {
  if (!socket) return;
  
  hideError();
  socket.emit('nommage:status:get');
  socket.emit('nommage:taxonomy:get');
}

/**
 * Demander la structure taxonomique
 */
function getTaxonomy(): void {
  if (!socket) return;
  
  hideError();
  socket.emit('nommage:taxonomy:get');
}

// ============================================================================
// Utilitaires
// ============================================================================

/**
 * Échapper le HTML pour éviter les injections XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Export global pour accès depuis le HTML
// ============================================================================

declare global {
  interface Window {
    nommageApp: {
      init: () => void;
      refreshStatus: () => void;
      getTaxonomy: () => void;
    };
  }
}

window.nommageApp = {
  init,
  refreshStatus,
  getTaxonomy
};

// ============================================================================
// Initialisation automatique au chargement de la page
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
