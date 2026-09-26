import * as THREE from 'three';
import { PanelController } from './PanelController';
import type { Game } from '../Game';
import { ScreenDisplay } from '../render/screen';

export type ControlKind = 'button' | 'switch' | 'breaker' | 'valve' | 'slot' | 'key';

export interface ControlSpec {
  id: string;
  kind: ControlKind;
  label: () => string;
  /** Local position on the panel face (x right, y up), metres. */
  x: number;
  y: number;
  color?: string;
  enabled?: () => boolean;
  /** For switches/breakers/valves: current on/open state (drives the visual). */
  state?: () => boolean;
  onClick: () => void;
}

export interface ConsoleSpec {
  title: string;
  /** Panel face size (metres). */
  width: number;
  height: number;
  /** Screen area on the face: centre + size (metres) and pixel size. */
  screen?: { x: number; y: number; w: number; h: number; px: [number, number]; draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void };
  controls: ControlSpec[];
  /** Camera distance from the face. */
  viewDistance?: number;
  /** Seconds between automatic screen redraws while open (animated readouts). */
  tick?: number;
}

/**
 * Data-driven first-person console: builds a physical panel face with a diegetic screen
 * and real 3D controls (buttons, rocker switches, breakers, valve wheels, item slots).
 * Mounted on an existing object (the console's `mount`), facing its local +Z.
 * The screen redraws from state; every control action goes through Game/Store APIs.
 */
export class ConsolePanel extends PanelController {
  private screen: ScreenDisplay | null = null;
  private visuals: { spec: ControlSpec; obj: THREE.Object3D; lever?: THREE.Object3D }[] = [];
  private t = 0;
  private tickAcc = 0;
  readonly face: THREE.Group;
  private materials: THREE.Material[] = [];

  constructor(game: Game, mount: THREE.Object3D, readonly spec: ConsoleSpec, faceOffset = new THREE.Vector3()) {
    const face = new THREE.Group();
    face.position.copy(faceOffset);
    mount.add(face);
    const d = spec.viewDistance ?? Math.max(spec.width, spec.height) * 1.05 + 0.25;
    super(game, face, { pos: new THREE.Vector3(0, 0.05, d), target: new THREE.Vector3(0, 0, 0), fov: 50 }, spec.title);
    this.face = face;
    const backMat = this.mat(new THREE.MeshStandardMaterial({ color: '#23282f', roughness: 0.55, metalness: 0.4 }));
    const back = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, 0.04), backMat);
    back.position.z = -0.02;
    face.add(back);
    if (spec.screen) {
      const sc = spec.screen;
      this.screen = new ScreenDisplay(sc.px[0], sc.px[1], sc.w, sc.h, sc.draw);
      this.screen.mesh.position.set(sc.x, sc.y, 0.002);
      face.add(this.screen.mesh);
    }
    for (const c of spec.controls) this.addControl(c);
    this.refresh();
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private addControl(c: ControlSpec): void {
    const color = c.color ?? '#4fd1ff';
    const group = new THREE.Group();
    group.position.set(c.x, c.y, 0);
    let lever: THREE.Object3D | undefined;
    const lit = this.mat(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4 }));
    const dark = this.mat(new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.6 }));
    const metal = this.mat(new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.35, metalness: 0.8 }));
    switch (c.kind) {
      case 'button':
      case 'key': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.015), dark);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.036, 0.022), lit);
        cap.position.z = 0.014;
        group.add(base, cap);
        break;
      }
      case 'switch':
      case 'breaker': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(c.kind === 'breaker' ? 0.06 : 0.04, 0.09, 0.02), dark);
        lever = new THREE.Mesh(new THREE.BoxGeometry(c.kind === 'breaker' ? 0.035 : 0.014, 0.05, 0.02), c.kind === 'breaker' ? lit : metal);
        lever.position.z = 0.018;
        group.add(base, lever);
        break;
      }
      case 'valve': {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 6, 16), this.mat(new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 })));
        wheel.position.z = 0.03;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), metal);
        hub.rotation.x = Math.PI / 2;
        hub.position.z = 0.015;
        for (let i = 0; i < 3; i++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.008), metal);
          spoke.rotation.z = (i * Math.PI) / 3;
          spoke.position.z = 0.03;
          wheel.add(spoke);
          spoke.position.set(0, 0, 0);
        }
        lever = wheel;
        group.add(hub, wheel);
        break;
      }
      case 'slot': {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.03), metal);
        const hole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.035), dark);
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.036), lit);
        led.position.set(0.065, 0.04, 0);
        group.add(frame, hole, led);
        lever = hole;
        break;
      }
    }
    this.face.add(group);
    this.visuals.push({ spec: c, obj: group, lever });
    this.controls.push({ id: c.id, object: group, label: c.label, enabled: c.enabled ?? (() => true), onClick: () => {
      c.onClick();
      this.game.audio.play(c.kind === 'breaker' ? 'breaker' : c.kind === 'switch' ? 'switch' : c.kind === 'valve' ? 'switch' : 'click', 0.7);
    } });
  }

  override refresh(): void {
    for (const v of this.visuals) {
      const on = v.spec.state?.() ?? false;
      const enabled = v.spec.enabled?.() ?? true;
      if (v.lever) {
        if (v.spec.kind === 'switch' || v.spec.kind === 'breaker') v.lever.position.y = on ? 0.02 : -0.02;
        if (v.spec.kind === 'valve') v.lever.rotation.z = on ? Math.PI * 1.5 : 0;
        if (v.spec.kind === 'slot') v.lever.visible = !on;
      }
      v.obj.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && m.emissive && m.emissiveIntensity !== undefined && m.color.getHexString() !== '15181c') {
          m.emissiveIntensity = enabled ? (on ? 1.4 : 0.5) : 0.05;
        }
      });
    }
    this.screen?.redraw(this.t);
  }

  /** Redraw the screen even while closed (world-visible displays). */
  redrawScreen(): void {
    this.screen?.redraw(this.t);
  }

  setScreenPowered(on: boolean): void {
    if (this.screen) {
      this.screen.powered = on;
      this.screen.redraw(this.t);
    }
  }

  override update(dt: number): void {
    super.update(dt);
    this.t += dt;
    if (this.spec.tick && this.isOpen) {
      this.tickAcc += dt;
      if (this.tickAcc >= this.spec.tick) {
        this.tickAcc = 0;
        this.screen?.redraw(this.t);
      }
    }
  }

  dispose(): void {
    this.screen?.dispose();
    for (const m of this.materials) m.dispose();
    this.face.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.face.removeFromParent();
  }
}
