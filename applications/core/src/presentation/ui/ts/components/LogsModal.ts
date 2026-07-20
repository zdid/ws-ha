/**
 * Composant LogsModal - Modale d'affichage des logs
 * Affiche les logs en temps réel
 */

interface LogEntry {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  module: string;
  message: string;
}

// Template HTML pour le Shadow DOM
const createTemplate = (): HTMLTemplateElement => {
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      .modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 2000;
        align-items: center;
        justify-content: center;
      }
      
      .modal[open] {
        display: flex;
      }
      
      .modal-content {
        background: white;
        border-radius: 8px;
        width: 90%;
        max-width: 800px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      }
      
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        border-bottom: 1px solid #eee;
      }
      
      .modal-header h3 {
        margin: 0;
        color: #2c3e50;
      }
      
      .modal-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #7f8c8d;
        padding: 0;
        line-height: 1;
      }
      
      .modal-close:hover {
        color: #e74c3c;
      }
      
      .modal-body {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
      }
      
      .logs-container {
        height: 100%;
      }
      
      .logs {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .log-entry {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 0.85rem;
        font-family: 'Courier New', monospace;
      }
      
      .log-timestamp {
        color: #7f8c8d;
        margin-right: 10px;
        font-size: 0.8rem;
        min-width: 120px;
      }
      
      .log-level {
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.75rem;
        font-weight: bold;
        margin-right: 10px;
      }
      
      .log-level.debug { background: #d9edf7; color: #31708f; }
      .log-level.info { background: #d9edf7; color: #31708f; }
      .log-level.warn { background: #fcf8e3; color: #8a6d3b; }
      .log-level.error { background: #f2dede; color: #a94442; }
      
      .log-module {
        color: #95a5a6;
        margin-right: 10px;
        font-size: 0.8rem;
      }
      
      .log-message {
        flex: 1;
        color: #2c3e50;
      }
      
      .modal-footer {
        padding: 15px 20px;
        border-top: 1px solid #eee;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      
      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 0.9rem;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .btn-secondary {
        background-color: #95a5a6;
        color: white;
      }
      
      .btn-secondary:hover {
        background-color: #7f8c8d;
      }
      
      .btn-primary {
        background-color: #3498db;
        color: white;
      }
      
      .btn-primary:hover {
        background-color: #2980b9;
      }
      
      .clear-btn {
        color: #e74c3c;
      }
      
      .clear-btn:hover {
        color: #c0392b;
        text-decoration: underline;
      }
    </style>
    
    <div class="modal" id="modal" role="dialog" aria-modal="true">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Logs en temps réel</h3>
          <button class="modal-close" id="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="logs-container">
            <div class="logs" id="logs-container">
              <!-- Les logs seront insérés ici -->
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="clear-btn" id="clear-btn">Effacer les logs</button>
          <button class="btn btn-secondary" id="close-footer-btn">Fermer</button>
        </div>
      </div>
    </div>
  `;
  return template;
};

export class LogsModal extends HTMLElement {
  private logs: LogEntry[] = [];
  private show: boolean = false;
  private maxLogs: number = 100;
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    const template = createTemplate();
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
  }
  
  connectedCallback() {
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    // Écouter les logs
    window.addEventListener('logs:new', (e: CustomEvent) => {
      const log = e.detail as LogEntry;
      this.addLog(log);
    });
    
    // Écouter les logs en batch
    window.addEventListener('logs:batch', (e: CustomEvent) => {
      const logs = e.detail as LogEntry[];
      logs.forEach(log => this.addLog(log));
    });
    
    // Bouton de fermeture
    const closeBtn = this.shadowRoot!.getElementById('close-btn');
    closeBtn?.addEventListener('click', () => this.close());
    
    const closeFooterBtn = this.shadowRoot!.getElementById('close-footer-btn');
    closeFooterBtn?.addEventListener('click', () => this.close());
    
    // Bouton d'effacement
    const clearBtn = this.shadowRoot!.getElementById('clear-btn');
    clearBtn?.addEventListener('click', () => this.clear());
    
    // Fermer avec la touche Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.show) {
        this.close();
      }
    });
    
    // Fermer en cliquant à l'extérieur
    const modal = this.shadowRoot!.getElementById('modal');
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.close();
      }
    });
  }
  
  /**
   * Ouvre la modale
   */
  open(): void {
    this.show = true;
    const modal = this.shadowRoot!.getElementById('modal');
    if (modal) {
      modal.setAttribute('open', 'true');
    }
    this.render();
  }
  
  /**
   * Ferme la modale
   */
  close(): void {
    this.show = false;
    const modal = this.shadowRoot!.getElementById('modal');
    if (modal) {
      modal.removeAttribute('open');
    }
  }
  
  /**
   * Bascule l'état de la modale
   */
  toggle(): void {
    if (this.show) {
      this.close();
    } else {
      this.open();
    }
  }
  
  /**
   * Ajoute un log
   */
  addLog(log: LogEntry): void {
    this.logs.unshift(log);
    
    // Limiter le nombre de logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
    
    this.render();
  }
  
  /**
   * Efface tous les logs
   */
  clear(): void {
    this.logs = [];
    this.render();
  }
  
  /**
   * Rend les logs
   */
  private render(): void {
    const container = this.shadowRoot!.getElementById('logs-container');
    if (!container) return;
    
    if (this.logs.length === 0) {
      container.innerHTML = '<div class="app-empty">Aucun log disponible</div>';
      return;
    }
    
    container.innerHTML = this.logs.map(log => `
      <div class="log-entry">
        <span class="log-timestamp">${log.ts}</span>
        <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
        <span class="log-module">[${log.module}]</span>
        <span class="log-message">${this.escapeHtml(log.message)}</span>
      </div>
    `).join('');
    
    // Scroll vers le bas pour voir les nouveaux logs
    container.scrollTop = container.scrollHeight;
  }
  
  /**
   * Échappe les caractères HTML pour éviter XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Enregistrer le composant
customElements.define('app-logs-modal', LogsModal);
