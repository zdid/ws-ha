/**
 * Gestion des minuteurs actifs (un par planification active) — état + effets de bord, au-dessus du
 * calcul pur de scheduler.ts. Port de la partie "état" de ts-planner/src/scheduler.ts, adapté :
 * au lieu de publier sur MQTT, appelle directement un callback de déploiement (voir
 * PlanificateurService — même mécanisme que le déclenchement d'une macro dite directement,
 * specs §6).
 */

import type { Logger } from '../../../core/src/exports';
import type { PlanificationDefinition } from './types';
import { triggerToMs, isRecurring } from './scheduler';

export type FireCallback = (plan: PlanificationDefinition) => void;

export class SchedulerRuntime {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly logger: Logger,
    private readonly onFire: FireCallback
  ) {}

  schedule(plan: PlanificationDefinition): void {
    this.unschedule(plan.name);

    const ms = triggerToMs(plan.trigger, this.logger);
    if (ms === null) {
      this.logger.warn('SchedulerRuntime', `Déclencheur non supporté pour "${plan.name}": ${plan.trigger.type}`);
      return;
    }

    const recurring = isRecurring(plan.trigger);

    const fire = () => {
      this.logger.info('SchedulerRuntime', `Déclenchement: "${plan.name}"`);
      this.onFire(plan);

      if (recurring) {
        const next = triggerToMs(plan.trigger, this.logger);
        if (next !== null) {
          const t = setTimeout(fire, next);
          this.timers.set(plan.name, t);
          this.logger.info('SchedulerRuntime', `Prochain déclenchement "${plan.name}" dans ${Math.round(next / 1000)}s`);
        }
      } else {
        this.timers.delete(plan.name);
      }
    };

    const timer = setTimeout(fire, ms);
    this.timers.set(plan.name, timer);
    this.logger.info('SchedulerRuntime', `"${plan.name}" programmée dans ${Math.round(ms / 1000)}s (${plan.trigger.type})`);
  }

  unschedule(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(name);
      this.logger.info('SchedulerRuntime', `"${name}" annulée`);
    }
  }

  listScheduled(): string[] {
    return [...this.timers.keys()];
  }

  stopAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
