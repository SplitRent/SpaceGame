import type { Game } from '../Game';
import { ui } from '../ui/uiState';

export interface ObjectiveView {
  title: string;
  objective: string;
  questId: string;
  stageId: string;
  objectiveId: string | null;
}

/**
 * Coordinates story-level flow: the opening sequence, contextual load intros, story
 * events raised by content effects ({ story: 'id' }), and the current tracked objective.
 * Cinematic handlers register here so that skipping always applies identical end-state.
 */
export class StoryDirector {
  cinematicActive = false;
  trackedQuest: string | null = null;
  private handlers = new Map<string, () => void | Promise<void>>();

  constructor(private game: Game) {}

  /** Register a handler for a story event id (content raises these via effects). */
  on(id: string, fn: () => void | Promise<void>): void {
    this.handlers.set(id, fn);
  }

  onStoryEvent(id: string): void {
    const h = this.handlers.get(id);
    if (h) void h();
    else if (!id.startsWith('online:')) console.warn('[Story] unhandled story event', id);
  }

  async playOpening(): Promise<void> {
    const { game } = this;
    game.store.setFlag('act0', true);
    game.store.setFlag('cine.mode', 'opening');
    await game.locations.travel({ location: 'cinematic.opening' }, { label: '', holdBlack: true, fadeTime: 0.01 });
  }

  /** Short contextual intro when loading a save (never replays the opening). */
  async playLoadIntro(): Promise<void> {
    const { game } = this;
    const s = game.store.state;
    const days = Math.floor(s.clock / 7200) + 1;
    const locName = game.currentLocation?.name ?? '';
    ui.title.value = { text: locName, sub: s.flags.crashed ? `${s.meta.chapter} · Day ${days} since the crash` : s.meta.chapter };
    game.cam.addShake(0);
    await game.fadeTo(0, 1.4);
    setTimeout(() => (ui.title.value = null), 3500);
  }

  stopAll(): void {
    this.cinematicActive = false;
    ui.letterbox.value = false;
    ui.subtitle.value = null;
  }

  onDialogueEnd(): void {
    const store = this.game.store;
    this.checkChapterBeats();
    // End of the vertical slice: Harbor reached and survivors found.
    if (store.state.flags['harbor.survivors'] && !store.state.flags['slice.complete']) {
      store.setFlag('slice.complete', true);
      store.state.meta.chapter = 'Act 2 — The Frontier';
      this.game.audio.stinger('wonder');
      ui.title.value = { text: 'End of Act 1', sub: 'Act 2 — The Frontier. Talk to Rafi.' };
      setTimeout(() => (ui.title.value = null), 9000);
      void this.game.autosave('Harbor Station');
    }
  }

  beforeSave(): void {}

  /** Chapter beat: the spire reported (current end of the authored story). */
  checkChapterBeats(): void {
    const store = this.game.store;
    if (store.state.flags['spire.reported'] && !store.state.flags['chapter.spire']) {
      store.setFlag('chapter.spire', true);
      this.game.audio.stinger('wonder');
      ui.title.value = { text: 'A Network', sub: 'Every place the Blackglass touched keeps the same time. To be continued.' };
      setTimeout(() => (ui.title.value = null), 9000);
      void this.game.autosave('The Spire');
    }
  }

  /** The objective shown on the HUD: tracked quest, else first active main quest. */
  currentObjective(): ObjectiveView | null {
    const store = this.game.store;
    const active = Object.entries(store.state.quests).filter(([, q]) => q.status === 'active');
    if (!active.length) return null;
    const pick =
      active.find(([id]) => id === this.trackedQuest) ??
      active.find(([id]) => store.content.quests[id]?.kind === 'main') ??
      active[0];
    const [id, q] = pick;
    const def = store.content.quests[id];
    const stage = def?.stages.find((s) => s.id === q.stage);
    if (!def || !stage) return null;
    const next = stage.objectives.find((o) => !q.progress[o.id] && !o.optional) ?? stage.objectives[0];
    return { title: def.title, objective: next?.text ?? stage.journal, questId: id, stageId: stage.id, objectiveId: next?.id ?? null };
  }

  currentObjectiveText(): string | null {
    return this.currentObjective()?.objective ?? null;
  }
}
