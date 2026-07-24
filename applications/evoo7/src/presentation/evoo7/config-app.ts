/**
 * Script TypeScript pour la page de configuration EVOO7 (Données).
 *
 * Le paramétrage (connexion broker, bridge HA, commande globale) vit uniquement dans
 * "Paramètres Techniques → EVOO7" (formulaire générique du core) — plus de doublon ici, voir
 * TODO.md "EVOO7 : formulaire générique et page dédiée éditent les mêmes champs".
 */

// SocketService : URL réellement servie par le socle (core la compile déjà en JS navigateur
// et l'expose via son middleware /js/ts) — pas un chemin de fichier TypeScript, un import
// d'exécution résolu par le navigateur lui-même. Voir presentation/tsconfig.ui.json.
import { SocketService } from '/js/ts/services/SocketService.js';

// ============================================================================
// Types (miroir simplifié de domain/types.ts, pour l'UI uniquement)
// ============================================================================

interface Evoo7ValeurPossible {
  code: string;
  libelle: string;
}

interface Evoo7DataDefinition {
  id: string;
  description: string;
  min?: number;
  max?: number;
  valeursPossibles?: Evoo7ValeurPossible[];
  updatable: boolean;
  isConfigData: boolean;
  consultation: boolean;
  miseAJour: boolean;
  topicSensor: string;
  formatMessageSensor: string;
}

// ============================================================================
// État
// ============================================================================

let socket: any | null = null;
let donnees: Evoo7DataDefinition[] = [];

// ============================================================================
// Initialisation
// ============================================================================

function init(): void {
  const socketService = new SocketService();
  socket = socketService.connect();

  setupSocketListeners();
  setupUiListeners();

  socket.emit('evoo7:donnees:list:get');

  hideLoading();
}

function setupSocketListeners(): void {
  socket.on('evoo7:donnees:list', (data: { donnees: Evoo7DataDefinition[] }) => {
    donnees = data.donnees;
    renderDonnees();
  });

  socket.on('evoo7:error', (error: { message: string }) => showAlert(error.message, 'error'));

  // Réponse honnête à set_selection/set_topic — jamais un succès affiché avant confirmation
  // réelle du serveur (voir TODO.md, même défaut corrigé pour le formulaire générique de config).
  socket.on('evoo7:donnee:save:response', (response: { id: string; success: boolean; error?: string }) => {
    if (response.success) showAlert(`Donnée "${response.id}" mise à jour`, 'success');
    // En cas d'échec, evoo7:error a déjà affiché le message détaillé — pas de double alerte.
  });
}

// ============================================================================
// Écouteurs UI
// ============================================================================

function setupUiListeners(): void {
  // Délégation d'événements pour les éléments générés dynamiquement (table Données)
  document.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    if (!id) return;

    if (target.classList.contains('consultation-check')) {
      toggleSelection(id, 'consultation', (target as HTMLInputElement).checked);
    }
    if (target.classList.contains('miseajour-check')) {
      toggleSelection(id, 'miseAJour', (target as HTMLInputElement).checked);
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    if (action === 'save-topic' && id) saveTopic(id);
  });
}

// ============================================================================
// Données
// ============================================================================

/** Miroir client de classification.ts: une énumération n'est jamais commandable (voir Evoo7Service). */
function isCommandable(d: Evoo7DataDefinition): boolean {
  const hasEnum = !!d.valeursPossibles && d.valeursPossibles.length > 0;
  return d.updatable && !hasEnum;
}

function renderConstraints(d: Evoo7DataDefinition): string {
  if (d.min !== undefined || d.max !== undefined) {
    return `min: ${d.min ?? '--'} / max: ${d.max ?? '--'}`;
  }
  if (d.valeursPossibles && d.valeursPossibles.length > 0) {
    return d.valeursPossibles.map((v) => escapeHtml(v.libelle)).join(', ');
  }
  return '--';
}

function renderDonnees(): void {
  const body = document.getElementById('donnees-body');
  if (!body) return;

  body.innerHTML = donnees.map((d) => `
    <tr>
      <td>
        <div class="mono">${escapeHtml(d.id)}</div>
        <div>${escapeHtml(d.description)}</div>
      </td>
      <td><span class="badge ${d.isConfigData ? 'config' : 'donnee'}">${d.isConfigData ? 'config' : 'donnée'}</span></td>
      <td class="constraints">${renderConstraints(d)}</td>
      <td><input type="checkbox" class="consultation-check" data-id="${escapeHtml(d.id)}" ${d.consultation ? 'checked' : ''}></td>
      <td>${isCommandable(d)
        ? `<input type="checkbox" class="miseajour-check" data-id="${escapeHtml(d.id)}" ${d.miseAJour ? 'checked' : ''}>`
        : '<span class="constraints">--</span>'}</td>
      <td class="topic-cell">
        <input type="text" class="form-control topic-sensor" data-id="${escapeHtml(d.id)}" value="${escapeHtml(d.topicSensor)}">
        <input type="text" class="form-control format-sensor" data-id="${escapeHtml(d.id)}" value="${escapeHtml(d.formatMessageSensor)}">
      </td>
      <td><button class="btn btn-secondary" data-action="save-topic" data-id="${escapeHtml(d.id)}">💾</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7">Aucune donnée</td></tr>';
}

function toggleSelection(id: string, field: 'consultation' | 'miseAJour', checked: boolean): void {
  const donnee = donnees.find((d) => d.id === id);
  if (!donnee) return;

  const consultation = field === 'consultation' ? checked : donnee.consultation;
  const miseAJour = field === 'miseAJour' ? checked : donnee.miseAJour;

  socket.emit('evoo7:donnee:set_selection', { id, consultation, miseAJour });
}

function saveTopic(id: string): void {
  const row = document.querySelector(`.topic-sensor[data-id="${id}"]`)?.closest('tr');
  if (!row) return;

  const topicSensor = (row.querySelector('.topic-sensor') as HTMLInputElement).value;
  const formatMessageSensor = (row.querySelector('.format-sensor') as HTMLInputElement).value;

  socket.emit('evoo7:donnee:set_topic', { id, topicSensor, formatMessageSensor });
  // Confirmation affichée par le listener evoo7:donnee:save:response (voir setupSocketListeners)
  // une fois le serveur réellement passé — jamais optimiste.
}

// ============================================================================
// Utilitaires
// ============================================================================

function showAlert(message: string, type: 'success' | 'error' | 'info'): void {
  const successEl = document.getElementById('success-alert');
  const errorEl = document.getElementById('error-alert');
  [successEl, errorEl].forEach((el) => { if (el) el.style.display = 'none'; });

  const el = type === 'error' ? errorEl : successEl;
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }
}

function hideLoading(): void {
  const el = document.getElementById('loading');
  if (el) el.style.display = 'none';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
