import * as THREE from 'three';
import type { Game } from '../Game';
import type { Location } from '../locations/Location';
import type { NpcDef, NpcPresenceRule } from '../content/types';
import { Astronaut, type Activity } from '../procgen/astronaut';
import { resolvePresence } from './presence';
import type { Interactable } from '../interaction/Interactable';
import { ui } from '../ui/uiState';
import { dampAngle } from '../engine/math';

export interface Spot {
  position: THREE.Vector3;
  yaw: number;
}

export interface NavGraph {
  nodes: Record<string, THREE.Vector3>;
  edges: [string, string][];
}

/** Shortest route over a nav graph (Dijkstra; graphs are tiny), ending exactly at `to`. */
export function navPath(nav: NavGraph, from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  const nodes = nav.nodes;
  const ids = Object.keys(nodes);
  if (!ids.length) return [to.clone()];
  const nearest = (p: THREE.Vector3) => ids.reduce((b, id) => (nodes[id].distanceTo(p) < nodes[b].distanceTo(p) ? id : b), ids[0]);
  const a = nearest(from), b = nearest(to);
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const open = new Set(ids);
  for (const id of ids) dist[id] = Infinity;
  dist[a] = 0;
  prev[a] = null;
  while (open.size) {
    let u: string | null = null;
    for (const id of open) if (u === null || dist[id] < dist[u]) u = id;
    if (u === null || dist[u] === Infinity) break;
    open.delete(u);
    if (u === b) break;
    for (const [x, y] of nav.edges) {
      const v = x === u ? y : y === u ? x : null;
      if (!v || !open.has(v)) continue;
      const nd = dist[u] + nodes[u].distanceTo(nodes[v]);
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
      }
    }
  }
  const path: THREE.Vector3[] = [];
  let cur: string | null | undefined = b;
  while (cur) {
    path.unshift(nodes[cur].clone());
    cur = prev[cur];
  }
  if (path[0] && path[0].distanceTo(from) < 0.5) path.shift();
  path.push(to.clone());
  return path;
}

interface NpcInstance {
  def: NpcDef;
  model: Astronaut;
  rule: NpcPresenceRule;
  pos: THREE.Vector3;
  yaw: number;
  path: THREE.Vector3[];
  talk: Interactable;
  talking: boolean;
}

/**
 * Spawns and animates the crew present in a location. Presence comes from the pure
 * resolver; when state changes, crew whose spot changed walk there along the location's
 * nav graph (or reposition out of view). NPCs are purely a projection of state.
 */
export class CrewRuntime {
  private npcs = new Map<string, NpcInstance>();
  private barkTimer = 25;
  private refreshTimer = 0;

  constructor(
    private game: Game,
    private loc: Location,
    private spots: Record<string, Spot>,
    private groundY: (x: number, z: number, fallback: number) => number,
    private nav: NavGraph | null = null,
  ) {
    if (nav) loc.nav = nav;
  }

  refresh(): void {
    const store = this.game.store;
    const present = new Set<string>();
    for (const def of Object.values(store.content.npcs)) {
      const rule = resolvePresence(def, store);
      if (!rule || rule.location !== this.loc.id || !this.spots[rule.spot]) continue;
      present.add(def.id);
      const inst = this.npcs.get(def.id);
      const spot = this.spots[rule.spot];
      if (!inst) this.spawn(def, rule, spot);
      else if (inst.rule.spot !== rule.spot) {
        inst.rule = rule;
        inst.path = this.findPath(inst.pos, spot.position);
      } else inst.rule = rule;
    }
    for (const [id, inst] of this.npcs) {
      if (present.has(id)) continue;
      this.despawn(inst);
      this.npcs.delete(id);
    }
  }

  private spawn(def: NpcDef, rule: NpcPresenceRule, spot: Spot): void {
    const model = new Astronaut({
      suit: def.suitColor,
      accent: def.accentColor,
      skin: def.skinTone,
      hair: def.hairColor,
      height: def.height,
      helmet: true,
    });
    const pos = spot.position.clone();
    model.root.position.copy(pos);
    model.root.rotation.y = spot.yaw;
    this.loc.scene.add(model.root);
    const inst: NpcInstance = {
      def,
      model,
      rule,
      pos,
      yaw: spot.yaw,
      path: [],
      talking: false,
      talk: {
        id: `npc:${def.id}`,
        object: model.root,
        kind: 'talk',
        range: 3,
        prompt: () => `Talk to ${def.name.split(' ').slice(-2).join(' ')}`,
        detail: () => def.role,
        interact: () => {
          inst.talking = true;
          this.game.talkTo(def.dialogue);
        },
      },
    };
    this.loc.registerInteractable(inst.talk);
    this.npcs.set(def.id, inst);
  }

  private despawn(inst: NpcInstance): void {
    this.loc.removeInteractable(inst.talk);
    inst.model.dispose();
  }

  private findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    return this.nav ? navPath(this.nav, from, to) : [to.clone()];
  }

  update(dt: number): void {
    this.refreshTimer -= dt;
    if (this.refreshTimer <= 0) {
      // Schedules depend on the clock, so re-resolve periodically as well as on change.
      this.refreshTimer = 5;
      this.refresh();
    }
    const player = this.game.player;
    const talkingTo = this.game.dialogue.npcId;
    for (const inst of this.npcs.values()) {
      if (inst.talking && talkingTo !== inst.def.id) inst.talking = false;
      let speed = 0;
      let activity: Activity = inst.rule.activity === 'patrol' ? 'idle' : inst.rule.activity;
      const spot = this.spots[inst.rule.spot];
      if (inst.path.length && !inst.talking) {
        const target = inst.path[0];
        const to = target.clone().sub(inst.pos);
        to.y = 0;
        const d = to.length();
        if (d < 0.25) inst.path.shift();
        else {
          speed = Math.min(1.4, d * 2);
          to.normalize();
          inst.pos.addScaledVector(to, speed * dt);
          inst.yaw = dampAngle(inst.yaw, Math.atan2(to.x, to.z), 8, dt);
          activity = 'idle';
        }
      } else if (spot && inst.pos.distanceTo(spot.position) > 0.3 && !inst.talking) {
        inst.path = [spot.position.clone()];
      } else if (spot && !inst.talking) {
        inst.yaw = dampAngle(inst.yaw, spot.yaw, 4, dt);
      }
      // Face the player while talking or when the player is close and idle
      const toPlayer = player.position.clone().sub(inst.pos);
      toPlayer.y = 0;
      const pd = toPlayer.length();
      if (inst.talking && activity !== 'sit' && activity !== 'injured' && activity !== 'sleep') {
        inst.yaw = dampAngle(inst.yaw, Math.atan2(toPlayer.x, toPlayer.z), 6, dt);
        activity = 'talk';
      }
      // Head tracking
      if (pd < 5) {
        const rel = Math.atan2(toPlayer.x, toPlayer.z) - inst.yaw;
        inst.model.lookYaw = Math.atan2(Math.sin(rel), Math.cos(rel));
        inst.model.lookPitch = -0.1;
      } else {
        inst.model.lookYaw *= 0.95;
      }
      inst.pos.y = this.groundY(inst.pos.x, inst.pos.z, spot?.position.y ?? inst.pos.y);
      inst.model.root.position.copy(inst.pos);
      inst.model.root.rotation.y = inst.yaw;
      const head = inst.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
      inst.model.setHelmet(!this.loc.isPressurized(head));
      inst.model.animate(dt, speed, true, activity, this.loc.env.gravity);
    }
    this.updateBarks(dt);
  }

  private updateBarks(dt: number): void {
    this.barkTimer -= dt;
    if (this.barkTimer > 0 || ui.subtitle.value || this.game.dialogue.active) return;
    this.barkTimer = 35 + Math.random() * 50;
    const store = this.game.store;
    const player = this.game.player.position;
    const candidates = store.content.barks.filter((b) => {
      const inst = this.npcs.get(b.npc);
      if (!inst || inst.pos.distanceTo(player) > 18) return false;
      if (b.location && b.location !== this.loc.id) return false;
      if (b.once && store.state.flags[`bark.${b.id}`]) return false;
      if (b.reply && !this.npcs.has(b.reply.npc)) return false;
      return store.check(b.if);
    });
    if (!candidates.length) return;
    const b = candidates[Math.floor(Math.random() * candidates.length)];
    if (b.once) store.setFlag(`bark.${b.id}`, true);
    const name = (id: string) => store.content.npcs[id]?.name.split(' ').slice(-1)[0] ?? id;
    const radio = this.loc.env.atmosphere === 'vacuum';
    if (radio) this.game.audio.play('radio', 0.5);
    ui.subtitle.value = { speaker: name(b.npc), text: b.text };
    const reply = b.reply;
    const hold = (sp: string, text: string) => Math.max(4500, (this.game.voices.duration(sp, text) + 0.4) * 1000);
    setTimeout(() => {
      if (reply) {
        if (radio) this.game.audio.play('radio', 0.5);
        ui.subtitle.value = { speaker: name(reply.npc), text: reply.text };
        setTimeout(() => (ui.subtitle.value = null), hold(name(reply.npc), reply.text));
      } else ui.subtitle.value = null;
    }, hold(name(b.npc), b.text));
  }

  /** World position of an NPC (for cinematics/markers). */
  positionOf(id: string): THREE.Vector3 | null {
    return this.npcs.get(id)?.pos.clone() ?? null;
  }

  dispose(): void {
    for (const inst of this.npcs.values()) this.despawn(inst);
    this.npcs.clear();
  }
}
