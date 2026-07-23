/**
 * Traitement des commandes reçues de `ia` (ia:command — JSON structuré détecté en conversation) et
 * des appels d'outil résolus (ia:tool:execute — action immédiate, specs ia §7/§8). Port adapté de
 * ts-planner/src/handler.ts : CRUD sur les fichiers YAML au lieu du store en mémoire du prototype,
 * réponses via EventBus corrélé au lieu de MQTT.
 */

import type { Logger } from '../../../core/src/exports';
import type {
  DomoticNode,
  MacroDefinition,
  PlanificationDefinition,
  GestionNode,
  ExecutionPayload,
  ExecuterActionParams,
  CorrelatedReponse
} from './types';
import type { ConfigFileManager } from './yaml/ConfigFileManager';
import type { MacrosConfigFile, PlanificationsConfigFile } from './storage-schema';
import type { SchedulerRuntime } from './scheduler-runtime';
import type { ExecutionEngine } from './execution';

export class CommandHandler {
  private macros: Record<string, MacroDefinition>;
  private planifications: Record<string, PlanificationDefinition>;

  constructor(
    private readonly logger: Logger,
    private readonly macrosManager: ConfigFileManager<MacrosConfigFile>,
    private readonly planificationsManager: ConfigFileManager<PlanificationsConfigFile>,
    private readonly schedulerRuntime: SchedulerRuntime,
    private readonly executionEngine: ExecutionEngine
  ) {
    this.macros = {};
    this.planifications = {};
  }

  /** Charge le contenu des fichiers YAML et reprogramme les planifications actives. */
  load(): void {
    this.macros = this.macrosManager.load().macros;
    this.planifications = this.planificationsManager.load().planifications;

    for (const plan of Object.values(this.planifications)) {
      if (plan.active) this.schedulerRuntime.schedule(plan);
    }
    this.logger.info('CommandHandler', `Chargé: ${Object.keys(this.macros).length} macro(s), ${Object.keys(this.planifications).length} planification(s) (${this.schedulerRuntime.listScheduled().length} active(s))`);
  }

  listMacros(): MacroDefinition[] {
    return Object.values(this.macros);
  }

  listPlanifications(): PlanificationDefinition[] {
    return Object.values(this.planifications);
  }

  findMacroByUtterance(text: string): MacroDefinition | undefined {
    const normalized = text.trim().toLowerCase();
    return Object.values(this.macros).find((m) => normalized.includes(m.name.toLowerCase()));
  }

  /** Traite un ia:command (JSON structuré, jamais un ActionNode de premier niveau — specs ia §9). */
  async handleCommand(payload: DomoticNode & { correlation_id: string }): Promise<CorrelatedReponse> {
    const corr = payload.correlation_id;

    try {
      switch (payload.type) {
        case 'macro': {
          const macro = payload as MacroDefinition & { correlation_id: string };
          this.macros[macro.name] = macro;
          this.persistMacros();
          return ok(corr, `Macro "${macro.name}" enregistrée avec ${macro.steps.length} étape(s).`);
        }

        case 'planification': {
          const plan = payload as PlanificationDefinition & { correlation_id: string };
          this.planifications[plan.name] = plan;
          this.persistPlanifications();
          if (plan.active) this.schedulerRuntime.schedule(plan);
          return ok(corr, `Planification "${plan.name}" enregistrée et ${plan.active ? 'activée' : 'désactivée'}.`);
        }

        case 'gestion':
          return this.handleGestion(corr, payload as GestionNode & { correlation_id: string });

        case 'execution': {
          const exec = payload as ExecutionPayload & { correlation_id: string };
          this.logger.info('CommandHandler', `Exécution directe "${exec.execution.trigger_name}" — ${exec.execution.steps.length} étape(s)`);
          this.executionEngine.executeSteps(exec.execution.steps).catch((e) =>
            this.logger.error('CommandHandler', `Erreur d'exécution: ${e}`)
          );
          return ok(corr, `Exécution de "${exec.execution.trigger_name}" lancée.`);
        }

        default:
          return err(corr, `Type non pris en charge en premier niveau: ${(payload as { type: string }).type}`);
      }
    } catch (error) {
      this.logger.error('CommandHandler', `Erreur: ${error}`);
      return err(corr, `Erreur interne: ${error}`);
    }
  }

  /**
   * Traite un ia:tool:execute (executer_action résolu, specs ia §7/§8) — traité comme une
   * planification immédiate et non répétitive, même mécanisme de déploiement que les deux autres
   * déclencheurs (specs planificateur §6).
   */
  async handleToolExecute(params: ExecuterActionParams & { correlation_id: string }): Promise<CorrelatedReponse> {
    const corr = params.correlation_id;
    const phrase = params.phrase_originale
      || `${params.verbe} ${params.quoi}${params.lieux?.length ? ' ' + params.lieux.join(' ') : ''}`;

    try {
      const result = await this.executionEngine.deployAndExecute('action_immediate', phrase, this.listMacros());
      return result.success
        ? ok(corr, `Action "${phrase}" exécutée.`)
        : err(corr, `Action "${phrase}" non exécutée: ${result.message}`);
    } catch (error) {
      this.logger.error('CommandHandler', `Erreur d'exécution de l'action immédiate: ${error}`);
      return err(corr, `Erreur interne: ${error}`);
    }
  }

  /** Déploiement déclenché par un minuteur (specs §6, premier cas) — voir PlanificateurService. */
  async handleTriggerFired(plan: PlanificationDefinition): Promise<void> {
    await this.executionEngine.deployAndExecute(plan.name, plan.phrase_originale, this.listMacros());
  }

  /** Déploiement déclenché par une macro dite directement (specs §6, deuxième cas). */
  async handleMacroUtterance(macro: MacroDefinition, utterance: string): Promise<void> {
    await this.executionEngine.deployAndExecute(macro.name, utterance, this.listMacros());
  }

  // ─── Gestion (lister/activer/désactiver/supprimer/modifier) ──────────────────────────────

  private handleGestion(corr: string, g: GestionNode & { correlation_id: string }): CorrelatedReponse {
    switch (g.operation) {
      case 'lister': {
        if (g.cible === 'macro') {
          const list = this.listMacros().map((m) => m.name);
          return ok(corr, list.length ? `Macros: ${list.join(', ')}.` : 'Aucune macro enregistrée.', list);
        }
        if (g.cible === 'planification') {
          const list = this.listPlanifications().map((p) => `${p.name} (${p.active ? 'active' : 'inactive'})`);
          return ok(corr, list.length ? `Planifications: ${list.join(', ')}.` : 'Aucune planification enregistrée.', list);
        }
        if (g.cible === 'tout') {
          const m = this.listMacros().map((m) => m.name);
          const p = this.listPlanifications().map((p) => `${p.name} (${p.active ? '✓' : '✗'})`);
          return ok(corr, `Macros: ${m.join(', ') || 'aucune'}. Planifications: ${p.join(', ') || 'aucune'}.`, { macros: m, planifications: p });
        }
        return err(corr, `Cible inconnue: ${g.cible}`);
      }

      case 'activer': {
        if (!g.name) return err(corr, 'Nom requis.');
        if (g.cible !== 'planification') return err(corr, `Activation non supportée pour: ${g.cible}`);
        const plan = this.planifications[g.name];
        if (!plan) return err(corr, `"${g.name}" introuvable.`);
        plan.active = true;
        this.persistPlanifications();
        this.schedulerRuntime.schedule(plan);
        return ok(corr, `Planification "${g.name}" activée.`);
      }

      case 'desactiver': {
        if (!g.name) return err(corr, 'Nom requis.');
        if (g.cible !== 'planification') return err(corr, `Désactivation non supportée pour: ${g.cible}`);
        const plan = this.planifications[g.name];
        if (!plan) return err(corr, `"${g.name}" introuvable.`);
        plan.active = false;
        this.persistPlanifications();
        this.schedulerRuntime.unschedule(g.name);
        return ok(corr, `Planification "${g.name}" désactivée.`);
      }

      case 'supprimer': {
        if (!g.name) return err(corr, 'Nom requis.');
        if (g.cible === 'macro') {
          if (!this.macros[g.name]) return err(corr, `Macro "${g.name}" introuvable.`);
          delete this.macros[g.name];
          this.persistMacros();
          return ok(corr, `Macro "${g.name}" supprimée.`);
        }
        if (g.cible === 'planification') {
          if (!this.planifications[g.name]) return err(corr, `Planification "${g.name}" introuvable.`);
          this.schedulerRuntime.unschedule(g.name);
          delete this.planifications[g.name];
          this.persistPlanifications();
          return ok(corr, `Planification "${g.name}" supprimée.`);
        }
        return err(corr, `Suppression non supportée pour: ${g.cible}`);
      }

      case 'modifier': {
        if (!g.name) return err(corr, 'Nom requis.');
        if (g.cible !== 'planification') return err(corr, `Modification non supportée pour: ${g.cible}`);
        const plan = this.planifications[g.name];
        if (!plan || !g.modifications) return err(corr, `"${g.name}" introuvable ou modifications manquantes.`);
        Object.assign(plan, g.modifications);
        this.persistPlanifications();
        if (plan.active) {
          this.schedulerRuntime.unschedule(g.name);
          this.schedulerRuntime.schedule(plan);
        }
        return ok(corr, `Planification "${g.name}" modifiée.`);
      }

      default:
        return err(corr, `Opération inconnue: ${g.operation}`);
    }
  }

  private persistMacros(): void {
    const result = this.macrosManager.save({ macros: this.macros });
    if (!result.success) this.logger.error('CommandHandler', `Échec de sauvegarde des macros: ${result.error}`);
  }

  private persistPlanifications(): void {
    const result = this.planificationsManager.save({ planifications: this.planifications });
    if (!result.success) this.logger.error('CommandHandler', `Échec de sauvegarde des planifications: ${result.error}`);
  }
}

function ok(corr: string, message: string, data?: unknown): CorrelatedReponse {
  return { correlation_id: corr, success: true, message, data };
}

function err(corr: string, message: string): CorrelatedReponse {
  return { correlation_id: corr, success: false, message };
}
