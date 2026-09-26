import * as THREE from 'three';
import type { Game } from '../Game';
import type { Location } from '../locations/Location';
import { WAYPOINTS, type WaypointSpec } from '../content/waypoints';
import { SURFACES } from '../content/worlds';
import { zoneForStation, zoneForSurface } from '../content/zones';
import { LOCATION_REGISTRY } from '../locations/registry';
import { resolvePresence } from './presence';
import { navPath } from './crew';
import { ui } from '../ui/uiState';

/** Interior → the surface it opens onto and the waypoint key of its entrance there. */
const CHILD: Record<string, { surface: string; key: string }> = {
  'moon.kepler9': { surface: 'moon.south', key: 'it:k9.door' },
  'mars.station': { surface: 'mars.melas', key: 'it:melas.door' },
};
for (const s of Object.values(SURFACES)) {
  for (const p of s.pois) if (p.interact?.travel) CHILD[p.interact.travel.location] = { surface: s.id, key: `it:${p.id}` };
}

/** How to leave each walkable interior (default: its data-driven `exit` point). */
const EXITS: Record<string, string> = {
  'harbor.interior': 'it:harbor.toLantern',
  'mars.station': 'it:melas.out',
  'moon.kepler9': 'it:k9.exit',
};

interface Resolved {
  pos: THREE.Vector3;
  label: string;
  kind: 'objective' | 'route' | 'oxygen';
  /** The target interactable exists but can't be used right now. */
  unavailable?: boolean;
  sameLocation: boolean;
}

export function formatDist(d: number): string {
  return d < 1000 ? `${Math.max(0, Math.round(d))} m` : `${(d / 1000).toFixed(1)} km`;
}

/**
 * On-screen objective waypoint. Each objective maps (content/waypoints.ts) to a target in
 * some location; when the player is elsewhere the marker routes them one hop closer —
 * the exit, the ship, the pilot seat or the star map. Low suit oxygen outside overrides
 * the objective with the nearest refill.
 */
export class WaypointSystem {
  private target: Resolved | null = null;
  private crumb: THREE.Vector3 | null = null;
  private timer = 0;

  constructor(private game: Game) {}

  clear(): void {
    this.target = null;
    this.crumb = null;
    if (ui.waypoint.value) ui.waypoint.value = null;
    if (ui.waypointCrumb.value) ui.waypointCrumb.value = null;
  }

  update(dt: number): void {
    const g = this.game;
    const loc = g.currentLocation;
    if (!g.inGame || !loc || loc.mode !== 'foot' || g.settings.navAssist !== 'markers' || g.locations.busy || g.story.cinematicActive || !g.player.attached) {
      this.clear();
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.25;
      this.target = this.resolve(loc);
      this.crumb = this.breadcrumb(loc, this.target?.pos ?? null);
    }
    if (!this.target || g.input.context !== 'gameplay') {
      if (ui.waypoint.value) ui.waypoint.value = null;
      if (ui.waypointCrumb.value) ui.waypointCrumb.value = null;
      return;
    }
    this.project(loc);
  }

  /* ----------------------------- target selection ----------------------------- */

  private resolve(loc: Location): Resolved | null {
    const g = this.game;
    const store = g.store;
    const head = g.player.head();
    const p = store.state.player;
    if (!g.suit.readout.pressurized && p.oxygen / p.oxygenMax < 0.3) {
      const o = loc.oxygenWaypoint();
      const pos = o && loc.waypointPos(o.key, head);
      if (o && pos) return { pos, label: o.label, kind: 'oxygen', sameLocation: true };
    }
    const obj = g.story.currentObjective();
    if (!obj?.objectiveId) return null;
    const specs = WAYPOINTS[`${obj.questId}/${obj.stageId}/${obj.objectiveId}`];
    if (!specs) return null;
    const usable = specs.filter((s) => !s.when || store.check(s.when));
    for (let i = 0; i < usable.length; i++) {
      const r = this.resolveSpec(loc, usable[i], head);
      if (!r) continue;
      if (r.unavailable && i < usable.length - 1) continue;
      return r;
    }
    return null;
  }

  private resolveSpec(loc: Location, spec: WaypointSpec, from: THREE.Vector3): Resolved | null {
    const store = this.game.store;
    let targetLoc = spec.loc;
    if (!targetLoc && spec.at?.startsWith('npc:')) {
      const def = store.content.npcs[spec.at.slice(4)];
      targetLoc = def ? resolvePresence(def, store)?.location : undefined;
    }
    if (!targetLoc) return null;
    if (targetLoc === loc.id) {
      if (!spec.at) return null;
      const pos = loc.waypointPos(spec.at, from);
      if (!pos) return null;
      return { pos, label: spec.label, kind: 'objective', unavailable: this.isUnavailable(loc, spec.at), sameLocation: true };
    }
    const hop = this.route(loc, targetLoc, from);
    if (!hop) return null;
    const pos = loc.waypointPos(hop.key, from);
    if (!pos) return null;
    return { pos, label: `${hop.label} · ${spec.label}`, kind: 'route', sameLocation: false };
  }

  private isUnavailable(loc: Location, key: string): boolean {
    if (!key.startsWith('it:')) return false;
    const it = loc.interactables.find((i) => i.id === key.slice(3));
    return !!it && !!it.available && !it.available();
  }

  /** The next hop from `loc` toward `target` (a location id). */
  private route(loc: Location, target: string, from: THREE.Vector3): { key: string; label: string } | null {
    const cur = loc.id;
    const kind = LOCATION_REGISTRY[cur]?.kind;
    const site = CHILD[target]?.surface ?? target;
    if (cur === 'lantern.interior') {
      const p = this.game.store.state.ship.parking;
      if ((p.kind === 'surface' || p.kind === 'docked') && p.locationId === site) {
        if (p.kind === 'docked') return { key: 'it:airlock.outer', label: 'Airlock' };
        // Whichever way out is closer: main airlock (Deck 2) or cargo ramp (Deck 3).
        const a = loc.waypointPos('it:airlock.outer', from), r = loc.waypointPos('it:cargo.ramp', from);
        const useRamp = !!a && !!r && Math.abs(r.y - from.y) < Math.abs(a.y - from.y) - 1;
        return useRamp ? { key: 'it:cargo.ramp', label: 'Cargo ramp' } : { key: 'it:airlock.outer', label: 'Airlock' };
      }
      const targetZone = LOCATION_REGISTRY[target]?.kind === 'space' ? target : zoneForSurface(site)?.id ?? zoneForStation(site)?.id ?? null;
      if (p.kind === 'space' && targetZone && targetZone !== p.locationId) return { key: 'it:holo.table', label: 'Star map — plot a course' };
      if (p.kind === 'transit') return { key: 'it:pilot.seat', label: 'Helm — in transit' };
      return { key: 'it:pilot.seat', label: p.kind === 'surface' ? 'Pilot seat — take off' : 'Pilot seat — fly' };
    }
    if (kind === 'surface') {
      const child = CHILD[target];
      if (child && child.surface === cur) return { key: child.key, label: 'Entrance' };
      return { key: 'it:enter.airlock', label: 'Back to the Lantern' };
    }
    return { key: EXITS[cur] ?? 'it:exit', label: 'Exit' };
  }

  /** In interiors with a nav graph: the next corridor node toward the target. */
  private breadcrumb(loc: Location, pos: THREE.Vector3 | null): THREE.Vector3 | null {
    if (!loc.nav || !pos) return null;
    const feet = this.game.player.position.clone();
    const path = navPath(loc.nav, feet, pos);
    // Drop nodes we've already passed: skip a node when the next one is nearer than it.
    while (path.length >= 2 && feet.distanceTo(path[1]) < path[0].distanceTo(path[1])) path.shift();
    if (path.length < 2) return null;
    const next = path[0];
    if (next.distanceTo(feet) < 1.2) return path.length >= 3 ? path[1].clone().add(new THREE.Vector3(0, 1.1, 0)) : null;
    return next.clone().add(new THREE.Vector3(0, 1.1, 0));
  }

  /* ----------------------------- screen projection ----------------------------- */

  private project(loc: Location): void {
    const t = this.target!;
    const cam = this.game.cam.camera;
    const head = this.game.player.head();
    const v = t.pos.clone().project(cam);
    const behind = v.z > 1;
    let x = (v.x + 1) / 2;
    let y = (1 - v.y) / 2;
    if (behind) {
      x = 1 - x;
      y = 1 - y;
    }
    const mx = 0.05, my = 0.09;
    let edge = behind || x < mx || x > 1 - mx || y < my || y > 1 - my;
    let angle = 0;
    if (edge) {
      let dx = x - 0.5, dy = y - 0.5;
      if (behind && Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 0.5;
      if (behind) {
        // Behind the camera: always push to the side/bottom edge so it reads as "turn around".
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
      }
      const s = Math.min((0.5 - mx) / Math.max(1e-4, Math.abs(dx)), (0.5 - my) / Math.max(1e-4, Math.abs(dy)));
      x = 0.5 + dx * s;
      y = 0.5 + dy * s;
      angle = Math.atan2(dy, dx);
    }
    const d = head.distanceTo(t.pos);
    const dy = t.pos.y - head.y;
    const interior = loc.env.atmosphere === 'breathable' || LOCATION_REGISTRY[loc.id]?.kind !== 'surface';
    // Up/down cue for other decks: steeper than a listing floor (the crashed Lantern tilts 7°).
    const flat = Math.hypot(t.pos.x - head.x, t.pos.z - head.z);
    const vert = interior && Math.abs(dy) > 3 && Math.abs(dy) > flat * 0.3 ? (dy > 0 ? 'up' : 'down') : null;
    ui.waypoint.value = { x, y, label: t.label, dist: formatDist(d), edge, angle, kind: t.kind, vert, near: d < 3 };
    // Breadcrumb: the next corridor node, when it's in front of the camera.
    let crumb: { x: number; y: number } | null = null;
    if (this.crumb) {
      const c = this.crumb.clone().project(cam);
      const cx = (c.x + 1) / 2, cy = (1 - c.y) / 2;
      if (c.z < 1 && cx > 0.02 && cx < 0.98 && cy > 0.02 && cy < 0.98) crumb = { x: cx, y: cy };
    }
    const prev = ui.waypointCrumb.value;
    if (crumb || prev) ui.waypointCrumb.value = crumb;
  }
}
