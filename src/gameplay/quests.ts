import type { Scope } from '../engine/Scope';
import type { Store } from '../state/Store';
import type { QuestDef, QuestStageDef } from '../content/types';

/**
 * Quests are *state-derived*: an objective is complete while its condition holds.
 * The system re-evaluates after every state change, so progress is always consistent
 * with the world after save/load, and nothing depends on transient runtime events.
 * Stage completion effects are applied through the grant ledger (never twice).
 */
export class QuestSystem {
  private evaluating = false;
  private dirty = false;

  constructor(private store: Store) {}

  attach(scope: Scope): void {
    this.store.events.on(scope, 'changed', () => this.evaluate());
    this.evaluate();
  }

  evaluate(): void {
    if (this.evaluating) {
      this.dirty = true;
      return;
    }
    this.evaluating = true;
    try {
      let guard = 0;
      do {
        this.dirty = false;
        this.pass();
        if (++guard > 50) {
          console.error('[QuestSystem] evaluation did not settle; possible effect loop');
          break;
        }
      } while (this.dirty);
    } finally {
      this.evaluating = false;
    }
  }

  private pass(): void {
    const { store } = this;
    const quests = store.content.quests;
    for (const def of Object.values(quests)) {
      const q = store.state.quests[def.id];
      if (!q && def.autoStart && store.check(def.autoStart)) {
        store.startQuest(def.id);
        this.dirty = true;
      }
    }
    for (const [id, q] of Object.entries(store.state.quests)) {
      if (q.status !== 'active') continue;
      const def = quests[id];
      if (!def) continue;
      const stage = def.stages.find((s) => s.id === q.stage);
      if (!stage) continue;
      let allDone = true;
      let progressChanged = false;
      for (const obj of stage.objectives) {
        const done = store.check(obj.done) ? 1 : 0;
        if (q.progress[obj.id] !== done) {
          q.progress[obj.id] = done;
          progressChanged = true;
        }
        if (!done && !obj.optional) allDone = false;
      }
      if (progressChanged) store.markChanged('questProgress');
      if (allDone) {
        this.completeStage(def, stage);
        this.dirty = true;
      }
    }
  }

  private completeStage(def: QuestDef, stage: QuestStageDef): void {
    const { store } = this;
    store.batch('stageComplete', () => {
      if (stage.onComplete) store.grant(`quest:${def.id}:${stage.id}`, stage.onComplete);
      const q = store.state.quests[def.id];
      // onComplete effects might have already moved the quest; only advance if unchanged.
      if (!q || q.status !== 'active' || q.stage !== stage.id) return;
      if (stage.next === 'complete') store.completeQuest(def.id);
      else store.setQuestStage(def.id, stage.next);
    });
  }

  /** Current stage info for UI. */
  currentStage(questId: string): QuestStageDef | undefined {
    const q = this.store.state.quests[questId];
    const def = this.store.content.quests[questId];
    return def?.stages.find((s) => s.id === q?.stage);
  }
}
