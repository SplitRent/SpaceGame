import { EventBus } from '../engine/EventBus';
import type { Condition, Effect } from '../content/types';
import type { ContentRegistry } from '../content/registry';
import {
  emptyLocationState,
  type Container,
  type FlagValue,
  type GameState,
  type LocationPersistentState,
} from './GameState';
import { addItem, countItem, removeItem } from '../gameplay/inventory';
import { PROPELLANT_CAPACITY } from '../content/shipSystems';

export const PLAYER_INV = 'player';

export interface StoreEvents extends Record<string, unknown> {
  changed: { reason: string };
  itemAdded: { container: string; itemId: string; qty: number };
  itemRemoved: { container: string; itemId: string; qty: number };
  inventoryFull: { itemId: string; lost: number };
  flag: { key: string; value: FlagValue };
  questStarted: { quest: string };
  questStage: { quest: string; stage: string };
  questCompleted: { quest: string };
  systemChanged: { system: string };
  notify: { text: string; kind?: 'info' | 'item' | 'quest' | 'warn' | 'discovery' };
  discovered: { id: string };
  story: { id: string };
  entityChanged: { location: string; entity: string };
}

/**
 * The Store owns the GameState and is the only thing allowed to mutate it.
 * All gameplay mutations flow through `apply(effects)` or the typed helpers below,
 * so every change emits events that quests, UI and scenes react to.
 */
export class Store {
  readonly events = new EventBus<StoreEvents>();
  /** Increments on every change; UI can use it for cheap invalidation. */
  revision = 0;
  private depth = 0;
  private pendingChange = false;

  constructor(
    public state: GameState,
    readonly content: ContentRegistry,
  ) {}

  replaceState(state: GameState): void {
    this.state = state;
    this.touch('replace');
  }

  /* ----------------------------- Conditions ---------------------------- */

  check(cond: Condition | undefined): boolean {
    if (!cond) return true;
    const s = this.state;
    if ('all' in cond) return cond.all.every((c) => this.check(c));
    if ('any' in cond) return cond.any.some((c) => this.check(c));
    if ('not' in cond) return !this.check(cond.not);
    if ('always' in cond) return true;
    if ('flag' in cond) {
      const v = s.flags[cond.flag];
      if (cond.eq !== undefined) return v === cond.eq;
      if (cond.gte !== undefined) return typeof v === 'number' && v >= cond.gte;
      return !!v;
    }
    if ('notFlag' in cond) return !s.flags[cond.notFlag];
    if ('hasItem' in cond) {
      const c = this.container(cond.in ?? PLAYER_INV);
      return countItem(c, cond.hasItem) >= (cond.qty ?? 1);
    }
    if ('questDone' in cond) return s.quests[cond.questDone]?.status === 'completed';
    if ('questActive' in cond) return s.quests[cond.questActive]?.status === 'active';
    if ('quest' in cond) {
      const q = s.quests[cond.quest];
      if (!q) return false;
      if (cond.status && q.status !== cond.status) return false;
      if (cond.stage && q.stage !== cond.stage && !q.history.includes(cond.stage)) return false;
      return true;
    }
    if ('system' in cond) {
      const sys = s.ship.systems[cond.system];
      if (!sys) return false;
      if (cond.step !== undefined) return !!sys.steps[cond.step];
      if (cond.online !== undefined) return sys.online === cond.online;
      return sys.online;
    }
    if ('module' in cond) {
      return Object.values(s.base.pads).some((p) => p.built && p.moduleId === cond.module);
    }
    if ('scanned' in cond) return !!s.database[cond.scanned];
    if ('discovered' in cond) return !!s.universe.discovered[cond.discovered];
    if ('propellant' in cond) return s.ship.propellant >= cond.propellant;
    if ('npcAlive' in cond) return !!s.npcs[cond.npcAlive]?.alive;
    if ('relationship' in cond) {
      return (s.npcs[cond.relationship.npc]?.relationship ?? 0) >= cond.relationship.gte;
    }
    console.warn('[Store] unknown condition', cond);
    return false;
  }

  /* ------------------------------ Effects ------------------------------ */

  apply(effects: Effect[] | undefined, reason = 'effects'): void {
    if (!effects?.length) return;
    this.batch(reason, () => {
      for (const e of effects) this.applyOne(e);
    });
  }

  /** Group several mutations so listeners receive a single `changed` event. */
  batch(reason: string, fn: () => void): void {
    this.depth++;
    try {
      fn();
    } finally {
      this.depth--;
      if (this.depth === 0 && this.pendingChange) {
        this.pendingChange = false;
        this.revision++;
        this.events.emit('changed', { reason });
      }
    }
  }

  private touch(reason: string): void {
    if (this.depth > 0) {
      this.pendingChange = true;
      return;
    }
    this.revision++;
    this.events.emit('changed', { reason });
  }

  private applyOne(e: Effect): void {
    const s = this.state;
    if ('setFlag' in e) return this.setFlag(e.setFlag, e.value ?? true);
    if ('addFlag' in e) {
      const cur = typeof s.flags[e.addFlag] === 'number' ? (s.flags[e.addFlag] as number) : 0;
      return this.setFlag(e.addFlag, cur + e.value);
    }
    if ('give' in e) {
      this.give(e.give, e.qty ?? 1, e.to ?? PLAYER_INV);
      return;
    }
    if ('take' in e) {
      this.take(e.take, e.qty ?? 1, e.from ?? PLAYER_INV);
      return;
    }
    if ('startQuest' in e) return this.startQuest(e.startQuest);
    if ('setStage' in e) return this.setQuestStage(e.setStage.quest, e.setStage.stage);
    if ('completeQuest' in e) return this.completeQuest(e.completeQuest);
    if ('repairStep' in e) {
      const sys = s.ship.systems[e.repairStep.system];
      if (!sys || sys.steps[e.repairStep.step]) return;
      sys.steps[e.repairStep.step] = true;
      const def = this.content.shipSystems[e.repairStep.system];
      const done = def ? def.steps.filter((st) => sys.steps[st.id]).length / def.steps.length : 1;
      sys.condition = Math.max(sys.condition, 0.15 + 0.85 * done);
      this.events.emit('systemChanged', { system: e.repairStep.system });
      this.touch('repair');
      return;
    }
    if ('systemOnline' in e) {
      const sys = s.ship.systems[e.systemOnline.system];
      if (!sys || sys.online === e.systemOnline.online) return;
      sys.online = e.systemOnline.online;
      this.events.emit('systemChanged', { system: e.systemOnline.system });
      this.touch('system');
      return;
    }
    if ('relationship' in e) {
      const n = s.npcs[e.relationship.npc];
      if (!n) return;
      n.relationship = Math.max(-100, Math.min(100, n.relationship + e.relationship.delta));
      this.touch('relationship');
      return;
    }
    if ('discover' in e) return this.discover(e.discover);
    if ('unlock' in e) {
      if (s.universe.unlocked[e.unlock]) return;
      s.universe.unlocked[e.unlock] = true;
      this.touch('unlock');
      return;
    }
    if ('notify' in e) {
      this.events.emit('notify', { text: e.notify, kind: 'info' });
      return;
    }
    if ('grant' in e) {
      this.grant(e.grant, e.effects);
      return;
    }
    if ('setEntity' in e) {
      this.setEntity(e.setEntity.location, e.setEntity.entity, e.setEntity.key, e.setEntity.value);
      return;
    }
    if ('upgrade' in e) {
      const p = s.player;
      if (p[e.upgrade.stat] >= e.upgrade.value) return;
      p[e.upgrade.stat] = e.upgrade.value;
      this.touch('upgrade');
      return;
    }
    if ('heal' in e) {
      s.player.health = Math.min(100, s.player.health + e.heal);
      this.touch('heal');
      return;
    }
    if ('refillOxygen' in e) {
      s.player.oxygen = s.player.oxygenMax;
      this.touch('oxygen');
      return;
    }
    if ('story' in e) {
      this.events.emit('story', { id: e.story });
      return;
    }
    console.warn('[Store] unknown effect', e);
  }

  /* ---------------------------- Typed helpers --------------------------- */

  setFlag(key: string, value: FlagValue): void {
    if (this.state.flags[key] === value) return;
    this.state.flags[key] = value;
    this.events.emit('flag', { key, value });
    this.touch('flag');
  }

  container(id: string): Container {
    let c = this.state.inventories[id];
    if (!c) {
      c = { slots: 24, stacks: [] };
      this.state.inventories[id] = c;
    }
    return c;
  }

  count(itemId: string, containerId = PLAYER_INV): number {
    return countItem(this.container(containerId), itemId);
  }

  /** Adds items. Overflow that doesn't fit is reported (and optionally routed by caller). */
  give(itemId: string, qty: number, containerId = PLAYER_INV): number {
    const def = this.content.items[itemId];
    if (!def) {
      console.warn('[Store] unknown item', itemId);
      return 0;
    }
    const added = addItem(this.container(containerId), def, qty);
    if (added > 0) {
      this.events.emit('itemAdded', { container: containerId, itemId, qty: added });
      this.touch('give');
    }
    if (added < qty) this.events.emit('inventoryFull', { itemId, lost: qty - added });
    return added;
  }

  take(itemId: string, qty: number, containerId = PLAYER_INV): boolean {
    const ok = removeItem(this.container(containerId), itemId, qty);
    if (ok && qty > 0) {
      this.events.emit('itemRemoved', { container: containerId, itemId, qty });
      this.touch('take');
    }
    return ok;
  }

  /** Remove a list of inputs atomically. */
  takeAll(inputs: { item: string; qty: number }[], containerId = PLAYER_INV): boolean {
    const c = this.container(containerId);
    if (!inputs.every((i) => countItem(c, i.item) >= i.qty)) return false;
    this.batch('takeAll', () => {
      for (const i of inputs) this.take(i.item, i.qty, containerId);
    });
    return true;
  }

  /** Idempotent: effects are applied at most once per grant id for the whole save. */
  grant(id: string, effects: Effect[]): boolean {
    if (this.state.granted[id]) return false;
    this.state.granted[id] = true;
    this.apply(effects, `grant:${id}`);
    this.touch('grant');
    return true;
  }

  startQuest(id: string): void {
    const def = this.content.quests[id];
    if (!def) {
      console.warn('[Store] unknown quest', id);
      return;
    }
    if (this.state.quests[id]) return; // never restart
    this.state.quests[id] = { status: 'active', stage: def.stages[0].id, progress: {}, history: [] };
    this.events.emit('questStarted', { quest: id });
    this.events.emit('notify', { text: `New objective: ${def.title}`, kind: 'quest' });
    this.touch('questStart');
    if (def.onStart) this.grant(`quest:${id}:start`, def.onStart);
  }

  setQuestStage(id: string, stage: string): void {
    const q = this.state.quests[id];
    const def = this.content.quests[id];
    if (!q || !def || q.status !== 'active' || q.stage === stage) return;
    if (!def.stages.some((s) => s.id === stage)) {
      console.warn('[Store] unknown stage', id, stage);
      return;
    }
    q.history.push(q.stage);
    q.stage = stage;
    q.progress = {};
    this.events.emit('questStage', { quest: id, stage });
    this.touch('questStage');
  }

  completeQuest(id: string): void {
    const q = this.state.quests[id];
    const def = this.content.quests[id];
    if (!q || !def || q.status === 'completed') return;
    if (!q.history.includes(q.stage)) q.history.push(q.stage);
    q.status = 'completed';
    this.events.emit('questCompleted', { quest: id });
    this.events.emit('notify', { text: `Completed: ${def.title}`, kind: 'quest' });
    this.touch('questComplete');
    if (def.rewards) this.grant(`quest:${id}:rewards`, def.rewards);
  }

  /** Set ship propellant (clamped to tank capacity) and mirror it into the condition flag. */
  setPropellant(kg: number): void {
    const s = this.state;
    s.ship.propellant = Math.max(0, Math.min(PROPELLANT_CAPACITY, kg));
    this.state.flags['ship.propellant'] = Math.round(s.ship.propellant);
    this.touch('propellant');
  }

  discover(id: string): void {
    if (this.state.universe.discovered[id]) return;
    this.state.universe.discovered[id] = true;
    this.events.emit('discovered', { id });
    this.touch('discover');
  }

  locationState(locationId: string): LocationPersistentState {
    let l = this.state.world[locationId];
    if (!l) {
      l = emptyLocationState();
      this.state.world[locationId] = l;
    }
    return l;
  }

  entity(locationId: string, entityId: string): Record<string, FlagValue> {
    const l = this.locationState(locationId);
    return (l.entities[entityId] ??= {});
  }

  getEntity(locationId: string, entityId: string, key: string): FlagValue | undefined {
    return this.state.world[locationId]?.entities[entityId]?.[key];
  }

  setEntity(locationId: string, entityId: string, key: string, value: FlagValue): void {
    const e = this.entity(locationId, entityId);
    if (e[key] === value) return;
    e[key] = value;
    this.events.emit('entityChanged', { location: locationId, entity: entityId });
    this.touch('entity');
  }

  nextUid(prefix: string): string {
    this.state.uidCounter++;
    return `${prefix}-${this.state.uidCounter}`;
  }

  notify(text: string, kind: StoreEvents['notify']['kind'] = 'info'): void {
    this.events.emit('notify', { text, kind });
  }

  /** Mark a mutation made directly on state by a gameplay system. */
  markChanged(reason: string): void {
    this.touch(reason);
  }
}
