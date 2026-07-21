/**
 * Script TypeScript pour le tableau de bord EVOO7.
 */

// Import SocketService depuis le core (point d'entrée UI navigateur, pas le backend)
import { SocketService } from '../../../../core/src/ui-exports';

interface Evoo7Status {
  evoo7Connected: boolean;
  bridgeConnected: boolean;
  donneesCount: number;
  consultationCount: number;
  miseAJourCount: number;
  lastMessageAt: string | null;
}

let socket: any | null = null;

function init(): void {
  try {
    const socketService = new SocketService();
    socket = socketService.connect();

    setupEventListeners();
    requestInitialStatus();
    hideLoading();

    console.log('[EVOO7 UI] Initialisation terminée');
  } catch (error) {
    console.error('[EVOO7 UI] Erreur d\'initialisation:', error);
  }
}

function setupEventListeners(): void {
  if (!socket) return;

  socket.on('evoo7:status', (status: Evoo7Status) => {
    updateStatusDisplay(status);
    showMainContent();
  });

  socket.on('connect', () => {
    console.log('[EVOO7 UI] Connecté au serveur Socket.io');
    requestInitialStatus();
  });

  socket.on('disconnect', () => {
    console.log('[EVOO7 UI] Déconnecté du serveur Socket.io');
  });
}

function requestInitialStatus(): void {
  if (!socket) return;
  socket.emit('evoo7:status:get');
}

function updateStatusDisplay(status: Evoo7Status): void {
  const evoo7BadgeEl = document.getElementById('evoo7-badge');
  const bridgeBadgeEl = document.getElementById('bridge-badge');
  const donneesCountEl = document.getElementById('donnees-count');
  const consultationCountEl = document.getElementById('consultation-count');
  const miseAJourCountEl = document.getElementById('miseajour-count');
  const lastMessageEl = document.getElementById('last-message');

  if (evoo7BadgeEl) {
    evoo7BadgeEl.textContent = `Broker EVOO7: ${status.evoo7Connected ? 'Connecté' : 'Déconnecté'}`;
    evoo7BadgeEl.className = `status-badge ${status.evoo7Connected ? 'connected' : 'disconnected'}`;
  }
  if (bridgeBadgeEl) {
    bridgeBadgeEl.textContent = `Bridge HA: ${status.bridgeConnected ? 'Connecté' : 'Déconnecté'}`;
    bridgeBadgeEl.className = `status-badge ${status.bridgeConnected ? 'connected' : 'disconnected'}`;
  }
  if (donneesCountEl) donneesCountEl.textContent = String(status.donneesCount);
  if (consultationCountEl) consultationCountEl.textContent = String(status.consultationCount);
  if (miseAJourCountEl) miseAJourCountEl.textContent = String(status.miseAJourCount);
  if (lastMessageEl) {
    lastMessageEl.textContent = status.lastMessageAt
      ? new Date(status.lastMessageAt).toLocaleString('fr-FR')
      : '--';
  }
}

function showMainContent(): void {
  const actionsEl = document.getElementById('actions');
  const statusCardEl = document.getElementById('status-card');
  if (actionsEl) actionsEl.style.display = 'flex';
  if (statusCardEl) statusCardEl.style.display = 'block';
}

function hideLoading(): void {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'none';
}

function refreshStatus(): void {
  requestInitialStatus();
}

declare global {
  interface Window {
    evoo7App: { init: () => void; refreshStatus: () => void };
  }
}

window.evoo7App = { init, refreshStatus };
// Utilisé par l'attribut onclick="refreshStatus()" du HTML (script classique, portée globale)
(window as unknown as { refreshStatus: () => void }).refreshStatus = refreshStatus;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
