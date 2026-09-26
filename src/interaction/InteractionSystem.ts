import * as THREE from 'three';
import type { Interactable } from './Interactable';
import type { Location } from '../locations/Location';
import type { Player } from '../player/Player';
import { ui } from '../ui/uiState';

const raycaster = new THREE.Raycaster();

/**
 * Finds the interactable under the crosshair (screen centre) within reach of the player,
 * shows its prompt, and triggers it on the interact action. A short cooldown prevents
 * double activation; interaction is disabled while locked (dialogue, panel, cinematic).
 */
export class InteractionSystem {
  focused: Interactable | null = null;
  private cooldown = 0;
  locked = false;
  private highlight: THREE.Object3D | null = null;

  update(dt: number, camera: THREE.Camera, player: Player, loc: Location | null): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.locked || !loc || !player.attached) {
      this.setFocus(null);
      return;
    }
    const origin = camera.position;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    raycaster.set(origin, dir);
    raycaster.far = 12;
    const head = player.head();
    let best: Interactable | null = null;
    let bestDist = Infinity;
    const objects: THREE.Object3D[] = [];
    const owners = new Map<THREE.Object3D, Interactable>();
    for (const it of loc.interactables) {
      if (!it.object.visible) continue;
      if (it.available && !it.available()) continue;
      objects.push(it.object);
      owners.set(it.object, it);
    }
    const hits = raycaster.intersectObjects(objects, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      let owner: Interactable | undefined;
      while (o && !(owner = owners.get(o))) o = o.parent;
      if (!owner) continue;
      const reach = owner.range ?? 2.6;
      if (h.point.distanceTo(head) > reach + 0.4) continue;
      if (h.distance < bestDist) {
        best = owner;
        bestDist = h.distance;
      }
      break; // first hit wins (occlusion)
    }
    // Proximity fallback for NPCs / big objects: nearest within reach roughly in front.
    if (!best) {
      const fwd = player.lookDir();
      fwd.y = 0;
      fwd.normalize();
      let bd = Infinity;
      for (const it of owners.values()) {
        if (it.kind !== 'talk') continue;
        const p = it.object.getWorldPosition(new THREE.Vector3());
        const to = p.sub(head);
        to.y = 0;
        const d = to.length();
        if (d > (it.range ?? 2.6)) continue;
        if (to.normalize().dot(fwd) < 0.6) continue;
        if (d < bd) {
          bd = d;
          best = it;
        }
      }
    }
    this.setFocus(best);
  }

  private setFocus(it: Interactable | null): void {
    this.focused = it;
    if (!it) {
      if (ui.prompt.value) ui.prompt.value = null;
      this.setHighlight(null);
      return;
    }
    const text = it.prompt();
    if (!text) {
      ui.prompt.value = null;
      this.setHighlight(null);
      return;
    }
    const detail = it.detail?.() ?? null;
    const cur = ui.prompt.value;
    if (!cur || cur.text !== text || cur.detail !== detail) ui.prompt.value = { text, detail, key: 'E' };
    this.setHighlight(it.object);
  }

  private bracket: THREE.LineSegments | null = null;

  /** Corner-bracket highlight around the focused object (never touches shared materials). */
  private setHighlight(o: THREE.Object3D | null): void {
    if (o === this.highlight) return;
    this.highlight = o;
    if (!o) {
      if (this.bracket) this.bracket.visible = false;
      return;
    }
    const box = new THREE.Box3().setFromObject(o);
    if (box.isEmpty()) return;
    box.expandByScalar(0.04);
    if (!this.bracket) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, depthTest: false });
      this.bracket = new THREE.LineSegments(geo, mat);
      this.bracket.renderOrder = 999;
      this.bracket.frustumCulled = false;
    }
    const scene = o.parent ? (() => { let r: THREE.Object3D = o; while (r.parent) r = r.parent; return r; })() : null;
    if (scene && this.bracket.parent !== scene) scene.add(this.bracket);
    const pos = this.bracket.geometry.getAttribute('position') as THREE.BufferAttribute;
    const size = box.getSize(new THREE.Vector3());
    const len = Math.min(size.x, size.y, size.z) * 0.3 + 0.05;
    let i = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const sx = x === box.min.x ? 1 : -1, sy = y === box.min.y ? 1 : -1, sz = z === box.min.z ? 1 : -1;
          pos.setXYZ(i++, x, y, z); pos.setXYZ(i++, x + sx * Math.min(len, size.x / 2), y, z);
          pos.setXYZ(i++, x, y, z); pos.setXYZ(i++, x, y + sy * Math.min(len, size.y / 2), z);
          pos.setXYZ(i++, x, y, z); pos.setXYZ(i++, x, y, z + sz * Math.min(len, size.z / 2));
        }
    pos.needsUpdate = true;
    this.bracket.geometry.computeBoundingSphere();
    this.bracket.visible = true;
  }

  /** Called when the interact action is pressed. */
  trigger(): boolean {
    if (this.locked || this.cooldown > 0 || !this.focused) return false;
    const it = this.focused;
    if (it.available && !it.available()) return false;
    this.cooldown = 0.35;
    it.interact();
    return true;
  }

  reset(): void {
    this.setHighlight(null);
    this.bracket?.removeFromParent();
    this.focused = null;
    ui.prompt.value = null;
  }
}
