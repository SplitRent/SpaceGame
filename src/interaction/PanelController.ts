import * as THREE from 'three';
import type { Game } from '../Game';
import type { CameraPose } from '../camera/CameraDirector';
import { ui } from '../ui/uiState';

export interface PanelControl {
  id: string;
  object: THREE.Object3D;
  label: () => string;
  enabled: () => boolean;
  onClick: () => void;
}

const ray = new THREE.Raycaster();

/**
 * First-person physical panel interaction. Opening a panel moves the camera to a fixed
 * first-person pose in front of the panel, frees the cursor, and lets the player point
 * at and click individual controls (buttons, breakers, valves, screens). All control
 * actions go through the Store, so panels have no hidden state of their own.
 */
export abstract class PanelController {
  controls: PanelControl[] = [];
  hovered: PanelControl | null = null;
  private pressAnim = new Map<THREE.Object3D, number>();
  isOpen = false;

  constructor(
    protected game: Game,
    /** The panel root; camera pose is expressed in its local space. */
    readonly root: THREE.Object3D,
    /** Local camera position & look target. */
    private viewLocal: { pos: THREE.Vector3; target: THREE.Vector3; fov?: number },
    readonly title: string,
  ) {}

  cameraPose(): CameraPose {
    this.root.updateWorldMatrix(true, false);
    return {
      position: this.viewLocal.pos.clone().applyMatrix4(this.root.matrixWorld),
      target: this.viewLocal.target.clone().applyMatrix4(this.root.matrixWorld),
      fov: this.viewLocal.fov ?? 55,
    };
  }

  open(): void {
    this.isOpen = true;
    ui.panelHelp.value = `${this.title} — click controls · Esc to step back`;
    this.game.player.model.root.visible = false;
    this.onOpen();
  }

  close(): void {
    this.isOpen = false;
    this.setHover(null);
    this.game.player.model.root.visible = true;
    ui.prompt.value = null;
    this.onClose();
  }

  protected onOpen(): void {}
  protected onClose(): void {}
  /** Refresh screens / indicator lights from state. */
  abstract refresh(): void;

  update(dt: number): void {
    // Button press animation
    for (const [o, t] of this.pressAnim) {
      const nt = t - dt;
      o.position.z = (o.userData.baseZ ?? 0) - Math.max(0, nt) * 0.03;
      if (nt <= 0) {
        o.position.z = o.userData.baseZ ?? 0;
        this.pressAnim.delete(o);
      } else this.pressAnim.set(o, nt);
    }
    if (!this.isOpen) return;
    const input = this.game.input;
    ray.setFromCamera(new THREE.Vector2(input.cursorX, input.cursorY), this.game.cam.camera);
    const hits = ray.intersectObjects(this.controls.map((c) => c.object), true);
    let found: PanelControl | null = null;
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !found) {
        found = this.controls.find((c) => c.object === o) ?? null;
        o = o.parent;
      }
      if (found) break;
    }
    this.setHover(found);
    if (found && input.justPressed('primary', 'panel')) {
      if (found.enabled()) {
        if (found.object.userData.baseZ === undefined) found.object.userData.baseZ = found.object.position.z;
        this.pressAnim.set(found.object, 0.15);
        found.onClick();
        this.refresh();
      } else {
        this.game.audio.play('error', 0.5);
      }
    }
  }

  private setHover(c: PanelControl | null): void {
    this.hovered = c;
    if (!c) {
      if (ui.prompt.value) ui.prompt.value = null;
      document.body.style.cursor = this.isOpen ? 'crosshair' : '';
      return;
    }
    document.body.style.cursor = c.enabled() ? 'pointer' : 'not-allowed';
    const text = c.label();
    if (ui.prompt.value?.text !== text) ui.prompt.value = { text, detail: c.enabled() ? null : 'Unavailable', key: '🖱' };
  }
}
