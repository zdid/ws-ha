/**
 * Script TypeScript pour le tableau de bord RFXCOM.
 */

// Import SocketService depuis le core (point d'entrée UI navigateur, pas le backend)
import { SocketService } from '../../../../core/src/ui-exports';

interface RfxComStatus {
  connected: boolean;
  devicesCount: number;
  receiversCount: number;
  lastDiscovery: string | null;
  scanInProgress: boolean;
  error?: string;
}

interface RfxComDiscoveredDevice {
  sensorId: string;
  type: string;
  subType: string;
  uniqueId: string;
  defaultQuoi: string;
  detectedAt: string;
}

interface RfxComDevicesListEvent {
  configured: unknown[];
  discovered: RfxComDiscoveredDevice[];
}

let socket: any | null = null;

function init(): void {
  try {
    const socketService = new SocketService();
    socket = socketService.connect();

    setupEventListeners();
    requestInitialStatus();
    hideLoading();

    console.log('[RFXCOM UI] Initialisation terminée');
  } catch (error) {
    console.error('[RFXCOM UI] Erreur d\'initialisation:', error);
  }
}

function setupEventListeners(): void {
  if (!socket) return;

  socket.on('rfxcom:status', (status: RfxComStatus) => {
    updateStatusDisplay(status);
    showMainContent();
  });

  socket.on('rfxcom:devices:list', (data: RfxComDevicesListEvent) => {
    updateRecentDevices(data.discovered);
  });

  socket.on('rfxcom:device:detected', () => {
    socket.emit('rfxcom:devices:list:get');
  });

  socket.on('connect', () => {
    console.log('[RFXCOM UI] Connecté au serveur Socket.io');
    requestInitialStatus();
  });

  socket.on('disconnect', () => {
    console.log('[RFXCOM UI] Déconnecté du serveur Socket.io');
  });
}

function requestInitialStatus(): void {
  if (!socket) return;
  socket.emit('rfxcom:status:get');
  socket.emit('rfxcom:devices:list:get');
}

function updateStatusDisplay(status: RfxComStatus): void {
  const badgeEl = document.getElementById('connection-badge');
  const devicesCountEl = document.getElementById('devices-count');
  const receiversCountEl = document.getElementById('receivers-count');
  const lastDiscoveryEl = document.getElementById('last-discovery');

  if (badgeEl) {
    badgeEl.textContent = status.connected ? 'Connecté' : 'Déconnecté';
    badgeEl.className = `status-badge ${status.connected ? 'connected' : 'disconnected'}`;
  }
  if (devicesCountEl) devicesCountEl.textContent = String(status.devicesCount);
  if (receiversCountEl) receiversCountEl.textContent = String(status.receiversCount);
  if (lastDiscoveryEl) {
    lastDiscoveryEl.textContent = status.lastDiscovery
      ? new Date(status.lastDiscovery).toLocaleString('fr-FR')
      : '--';
  }
}

function updateRecentDevices(discovered: RfxComDiscoveredDevice[]): void {
  const cardEl = document.getElementById('recent-devices-card');
  const listEl = document.getElementById('recent-devices-list');
  if (!listEl) return;

  if (discovered.length === 0) {
    if (cardEl) cardEl.style.display = 'none';
    return;
  }

  if (cardEl) cardEl.style.display = 'block';
  listEl.innerHTML = discovered.map((d) => `
    <div class="device-row">
      <span>${escapeHtml(d.uniqueId)} (${escapeHtml(d.defaultQuoi)})</span>
      <span>${new Date(d.detectedAt).toLocaleTimeString('fr-FR')}</span>
    </div>
  `).join('');
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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

declare global {
  interface Window {
    rfxcomApp: { init: () => void; refreshStatus: () => void };
  }
}

window.rfxcomApp = { init, refreshStatus };
// Utilisé par l'attribut onclick="refreshStatus()" du HTML (script classique, portée globale)
(window as unknown as { refreshStatus: () => void }).refreshStatus = refreshStatus;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
