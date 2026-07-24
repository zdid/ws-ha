/**
 * Script TypeScript pour le tableau de bord planificateur.
 */

function moduleRoot(): ParentNode {
  return (window as any).__moduleContainerRoot || document;
}

function $(id: string): HTMLElement | null {
  return moduleRoot().querySelector(`#${id}`);
}

interface PlanificateurStatus {
  macrosCount: number;
  planificationsCount: number;
  activeSchedules: string[];
}

let socket: any | null = null;

function init(): void {
  try {
    // Connexion Socket.io unique, réutilisée depuis le core (window.app.socketService) au lieu
    // d'en ouvrir une seconde — voir arbreouquoi/app.ts pour le détail du pourquoi.
    socket = window.app.socketService.getSocket();

    setupEventListeners();
    requestInitialStatus();
    hideLoading();

    console.log('[Planificateur UI] Initialisation terminée');
  } catch (error) {
    console.error('[Planificateur UI] Erreur d\'initialisation:', error);
  }
}

function setupEventListeners(): void {
  if (!socket) return;

  socket.on('planificateur:status', (status: PlanificateurStatus) => {
    updateStatusDisplay(status);
    showMainContent();
  });

  socket.on('connect', () => {
    console.log('[Planificateur UI] Connecté au serveur Socket.io');
    requestInitialStatus();
  });

  socket.on('disconnect', () => {
    console.log('[Planificateur UI] Déconnecté du serveur Socket.io');
  });
}

function requestInitialStatus(): void {
  if (!socket) return;
  socket.emit('planificateur:status:get');
}

function updateStatusDisplay(status: PlanificateurStatus): void {
  const macrosEl = $('macros-count');
  const planificationsEl = $('planifications-count');
  const activeEl = $('active-count');

  if (macrosEl) macrosEl.textContent = String(status.macrosCount);
  if (planificationsEl) planificationsEl.textContent = String(status.planificationsCount);
  if (activeEl) activeEl.textContent = String(status.activeSchedules.length);
}

function showMainContent(): void {
  const actionsEl = $('actions');
  const statusCardEl = $('status-card');
  if (actionsEl) actionsEl.style.display = 'flex';
  if (statusCardEl) statusCardEl.style.display = 'block';
}

function hideLoading(): void {
  const loadingEl = $('loading');
  if (loadingEl) loadingEl.style.display = 'none';
}

function refreshStatus(): void {
  requestInitialStatus();
}

declare global {
  interface Window {
    planificateurApp: { init: () => void; refreshStatus: () => void };
  }
}

window.planificateurApp = { init, refreshStatus };
(window as unknown as { refreshStatus: () => void }).refreshStatus = refreshStatus;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Force ce fichier à être traité comme un module TS (nécessaire pour `declare global` ci-dessus)
// — perdu en retirant l'import de SocketService, seul import du fichier jusqu'ici.
export {};
