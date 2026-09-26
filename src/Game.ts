import * as THREE from 'three';
import { Scope } from './engine/Scope';
import { Renderer } from './render/Renderer';
import { Input } from './input/Input';
import { Store, PLAYER_INV } from './state/Store';
import { CONTENT } from './content';
import { createNewGameState } from './state/newGame';
import { reconcileState } from './state/reconcile';
import { QuestSystem } from './gameplay/quests';
import { CameraDirector } from './camera/CameraDirector';
import { Player } from './player/Player';
import { initPhysics } from './physics/Physics';
import { LocationManager, type TravelTarget } from './locations/LocationManager';
import type { Location } from './locations/Location';
import { LOCATION_REGISTRY } from './locations/registry';
import { InteractionSystem } from './interaction/InteractionSystem';
import { SuitSystem } from './gameplay/suit';
import { DialogueRunner } from './gameplay/dialogue';
import { AudioSystem } from './audio/AudioSystem';
import { SaveManager, buildSaveFile, type SlotId } from './save/SaveManager';
import { ToolSystem } from './gameplay/tools';
import { CraftingSystem } from './gameplay/crafting';
import { StoryDirector } from './story/StoryDirector';
import { BaseSystem } from './gameplay/base';
import { moonSunFactor } from './locations/moon/moonSky';
import { ui, pushNotification, type HudData } from './ui/uiState';
import type { GameState } from './state/GameState';
import { clamp } from './engine/math';
import type { PanelController } from './interaction/PanelController';

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  sensitivity: number;
  invertY: boolean;
  fov: number;
  navAssist: 'off' | 'hints' | 'markers';
  volumes: { master: number; sfx: number; ambience: number; music: number };
  subtitles: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  sensitivity: 1,
  invertY: false,
  fov: 72,
  navAssist: 'hints',
  volumes: { master: 0.8, sfx: 0.9, ambience: 0.7, music: 0.6 },
  subtitles: true,
};

/**
 * The Game orchestrates all systems. It owns the main loop and the lifetime of the
 * current location. GameState lives in the Store; this class holds only runtime state.
 */
export class Game {
  readonly scope = new Scope('game');
  renderer!: Renderer;
  input!: Input;
  readonly store: Store;
  readonly quests: QuestSystem;
  readonly cam = new CameraDirector();
  readonly player = new Player();
  readonly locations: LocationManager;
  readonly interaction = new InteractionSystem();
  readonly suit: SuitSystem;
  readonly dialogue: DialogueRunner;
  readonly audio = new AudioSystem();
  readonly saves = new SaveManager();
  readonly tools: ToolSystem;
  readonly crafting: CraftingSystem;
  readonly story: StoryDirector;
  readonly base: BaseSystem;
  settings: Settings = loadSettings();
  /** Active first-person panel (ship console etc.). */
  panel: PanelController | null = null;
  inGame = false;
  paused = false;
  private last = 0;
  private hudTimer = 0;
  private autosaveTimer = 0;
  private dying = false;
  private fps = 60;
  private questScope: Scope | null = null;
  private stateScope: Scope | null = null;
  private fadeAnim: { from: number; to: number; t: number; dur: number; resolve: () => void } | null = null;
  /** Update hooks registered by transient systems (cinematics). Return false to remove. */
  private hooks = new Set<(dt: number) => boolean | void>();
  /** True while the player is controlling a vehicle / ship (flight location handles input). */
  flightMode = false;
  timeScale = 1;

  constructor() {
    this.store = new Store(createNewGameState(CONTENT), CONTENT);
    this.quests = new QuestSystem(this.store);
    this.locations = new LocationManager(this);
    this.suit = new SuitSystem(this.store);
    this.dialogue = new DialogueRunner(this.store);
    this.tools = new ToolSystem(this);
    this.crafting = new CraftingSystem(this);
    this.story = new StoryDirector(this);
    this.base = new BaseSystem(this.store);
  }

  async boot(canvas: HTMLCanvasElement): Promise<void> {
    this.renderer = new Renderer(canvas, this.settings.quality);
    this.input = new Input(canvas);
    this.applySettings();
    this.scope.listen(window, 'resize', () => this.renderer.resize());
    this.scope.listen(window, 'pointerdown', () => this.audio.unlock());
    this.scope.listen(window, 'keydown', () => this.audio.unlock());
    this.scope.listen(document, 'pointerlockchange', () => {
      // Losing pointer lock during gameplay (e.g. Esc) opens the pause menu.
      if (!this.input.locked && this.inGame && !this.paused && (this.input.context === 'gameplay' || this.input.context === 'flight')) {
        this.openOverlay('pause');
      }
    });
    await initPhysics();
    this.player.onFootstep = () => this.audio.play(this.currentLocation?.env.ambience.startsWith('ship') || this.currentLocation?.env.ambience === 'station' ? 'stepMetal' : 'step', 0.8);
    this.suit.onDamage = () => {
      this.audio.play('hurt', 0.6);
      this.cam.addShake(0.2);
    };
    this.dialogue.onEnd = () => {
      this.input.pop('dialogue');
      this.story.onDialogueEnd();
    };
    this.renderer.setScene(new THREE.Scene(), this.cam.camera);
    ui.screen.value = 'title';
    ui.fade.value = 0;
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.scope.disposed) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
    (window as any).__game = this; // dev/test hook
  }

  get currentLocation(): Location | null {
    return this.locations.current;
  }

  /* ============================== Game flow ============================== */

  /** Start a brand-new game (full opening). */
  async newGame(playerName: string): Promise<void> {
    const state = createNewGameState(CONTENT, playerName.trim() || 'Specialist', (Math.random() * 1e9) | 0);
    this.beginSession(state);
    ui.screen.value = 'game';
    ui.overlay.value = null;
    await this.story.playOpening();
  }

  /** Load a save slot and restore the world. */
  async loadSlot(slot: string): Promise<boolean> {
    const res = await this.saves.read(slot);
    if (!res.ok) {
      pushNotification(`Load failed: ${res.error}`, 'warn');
      return false;
    }
    return this.loadState(res.state, true);
  }

  async loadState(state: GameState, contextual: boolean): Promise<boolean> {
    if (this.locations.busy) return false;
    this.dialogue.end();
    this.closePanel();
    reconcileState(state, CONTENT);
    this.beginSession(state);
    ui.screen.value = 'game';
    ui.overlay.value = null;
    this.paused = false;
    const p = state.player;
    const target: TravelTarget = {
      location: LOCATION_REGISTRY[p.locationId] ? p.locationId : 'moon.south',
      spawn: p.spawnId,
      position: p.position ? new THREE.Vector3(...p.position) : undefined,
      yaw: p.yaw,
    };
    const ok = await this.locations.travel(target, { label: 'Restoring…', holdBlack: contextual });
    if (ok && contextual) await this.story.playLoadIntro();
    else if (ok) await this.fadeTo(0, 0.5);
    return ok;
  }

  /** Replace state and (re)bind state-driven systems. */
  private beginSession(state: GameState): void {
    this.questScope?.dispose();
    this.stateScope?.dispose();
    this.store.replaceState(state);
    this.questScope = this.scope.child('quests');
    this.stateScope = this.scope.child('state');
    this.quests.attach(this.questScope);
    this.store.events.on(this.stateScope, 'changed', () => {
      ui.revision.value = this.store.revision;
      this.currentLocation?.onStateChanged();
    });
    this.store.events.on(this.stateScope, 'notify', (n) => {
      pushNotification(n.text, n.kind ?? 'info');
      if (n.kind === 'quest') this.audio.play('confirm', 0.7);
      if (n.kind === 'warn') this.audio.play('beep');
    });
    this.store.events.on(this.stateScope, 'itemAdded', (e) => {
      if (e.container !== PLAYER_INV) return;
      const def = CONTENT.items[e.itemId];
      pushNotification(`+${e.qty} ${def?.name ?? e.itemId}`, 'item');
      this.audio.play('pickup', 0.5);
    });
    this.store.events.on(this.stateScope, 'inventoryFull', (e) => {
      pushNotification(`Pack full — ${e.lost} ${CONTENT.items[e.itemId]?.name ?? e.itemId} left behind`, 'warn');
    });
    this.store.events.on(this.stateScope, 'story', (e) => this.story.onStoryEvent(e.id));
    this.store.events.on(this.stateScope, 'questCompleted', () => this.audio.stinger('quest'));
    this.store.events.on(this.stateScope, 'discovered', () => this.audio.stinger('discovery'));
    this.cam.view = state.player.cameraView;
    this.dialogue.playerName = state.player.name;
    this.suit.stamina = 1;
    this.inGame = true;
    this.dying = false;
    this.autosaveTimer = 0;
  }

  async quitToTitle(): Promise<void> {
    await this.fadeTo(1, 0.4);
    this.dialogue.end();
    this.closePanel();
    this.story.stopAll();
    this.hooks.clear();
    this.player.detach();
    this.locations.current?.dispose();
    this.locations.current = null;
    this.inGame = false;
    this.paused = false;
    this.flightMode = false;
    this.input.setBase('menu');
    while (this.input.context !== 'menu') this.input.pop(this.input.context);
    ui.overlay.value = null;
    ui.hud.value = null;
    ui.screen.value = 'title';
    this.renderer.setBackground(null, null);
    this.renderer.setScene(new THREE.Scene(), this.cam.camera);
    this.audio.setAmbience('none');
    await this.fadeTo(0, 0.4);
  }

  /** Called by LocationManager after the old location is gone and before the new one is built. */
  onBeforeLocationExit(): void {
    this.interaction.reset();
    this.tools.reset();
    this.closePanel();
    if (this.dialogue.active) this.dialogue.end();
  }

  /** Called by LocationManager once the new location is built. Places the player. */
  onLocationEntered(loc: Location, target: TravelTarget): void {
    const s = this.store.state;
    const entry = LOCATION_REGISTRY[loc.id];
    this.renderer.setScene(loc.scene, this.cam.camera);
    this.audio.setAmbience(loc.env.ambience);
    this.audio.setVacuum(loc.env.atmosphere === 'vacuum');
    this.store.locationState(loc.id).visited = true;
    s.player.locationId = loc.id;
    if (loc.mode === 'foot') {
      const { pos, yaw, spawnId } = this.resolveSpawn(loc, target);
      this.player.attach(loc.physics, loc.scene, pos, yaw);
      this.player.controlEnabled = true;
      s.player.spawnId = spawnId;
      s.player.position = [pos.x, pos.y, pos.z];
      this.flightMode = false;
      this.input.setBase('gameplay');
    } else if (loc.mode === 'flight') {
      this.flightMode = true;
      this.input.setBase('flight');
    } else {
      this.flightMode = false;
      this.input.setBase('cinematic');
    }
    this.cam.snap();
    loc.onEnter();
    this.store.markChanged('locationEntered');
    ui.title.value = null;
    if (entry && loc.mode !== 'cinematic') this.showLocationTitle(entry.name);
  }

  showLocationTitle(name: string, sub = ''): void {
    ui.title.value = { text: name, sub };
    const v = ui.title.value;
    setTimeout(() => {
      if (ui.title.value === v) ui.title.value = null;
    }, 4000);
  }

  /**
   * Spawn resolver: use a saved position if it is inside bounds and not embedded in
   * geometry; otherwise fall back to the named spawn, then to the first spawn.
   */
  resolveSpawn(loc: Location, target: TravelTarget): { pos: THREE.Vector3; yaw: number; spawnId: string } {
    const spawnId = target.spawn && loc.spawns[target.spawn] ? target.spawn : Object.keys(loc.spawns)[0];
    const spawn = loc.spawns[spawnId];
    if (target.position && loc.bounds.containsPoint(target.position) && this.isClear(loc, target.position)) {
      return { pos: target.position.clone(), yaw: target.yaw ?? spawn?.yaw ?? 0, spawnId };
    }
    if (!spawn) return { pos: new THREE.Vector3(0, 2, 0), yaw: 0, spawnId: 'none' };
    return { pos: spawn.position.clone(), yaw: target.yaw ?? spawn.yaw, spawnId };
  }

  private isClear(loc: Location, p: THREE.Vector3): boolean {
    loc.physics.step();
    // Must have ground below within 3 m and no geometry inside the capsule volume.
    const down = loc.physics.raycast(new THREE.Vector3(p.x, p.y + 1.0, p.z), new THREE.Vector3(0, -1, 0), 4);
    if (down === null) return false;
    const up = loc.physics.raycast(new THREE.Vector3(p.x, p.y + 0.3, p.z), new THREE.Vector3(0, 1, 0), 1.5);
    return up === null;
  }

  /* ================================ Frame ================================ */

  private frame(dt: number): void {
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05;
    this.updateFade(dt);
    const input = this.input;

    if (input.rawPressed('Backquote')) ui.debug.value = !ui.debug.value;

    const loc = this.currentLocation;
    const running = this.inGame && !this.paused && !!loc && !this.locations.busy;
    const sdt = dt * this.timeScale;

    if (running) {
      this.handleGlobalInput();
      this.store.state.meta.playtimeSec += dt;
      this.store.state.clock += sdt;
      this.base.update(sdt, moonSunFactor(this.store.state.clock));

      if (loc!.mode === 'foot' && this.player.attached) {
        if (input.context === 'gameplay') {
          const m = input.consumeMouse();
          const sens = input.sensitivity * this.settings.sensitivity;
          const view = this.cam.effectiveView;
          this.player.applyLook(view === 'front' ? -m.dx : m.dx, view === 'front' ? -m.dy : m.dy, sens);
        } else input.consumeMouse();
        this.player.controlEnabled = input.context === 'gameplay';
        this.player.update(sdt, input, this.suit.stamina > 0.05);
        this.handleLanding();
        loc!.physics.step();
        this.suit.update(sdt, loc!, this.player.head(), this.player.sprinting);
        this.player.model.setHelmet(!this.suit.readout.pressurized);
        this.checkBounds(loc!);
        const s = this.store.state.player;
        s.position = [this.player.position.x, this.player.position.y, this.player.position.z];
        s.yaw = this.player.yaw;
        if (this.suit.dead && !this.dying) void this.die();
      }
      loc!.update(sdt);
      for (const h of [...this.hooks]) if (h(sdt) === false) this.hooks.delete(h);
      this.panel?.update(dt);
      this.cam.baseFov = this.settings.fov;
      if (loc!.mode === 'foot') {
        this.cam.update(dt, this.player, loc!.physics);
        this.interaction.locked = input.context !== 'gameplay';
        this.interaction.update(dt, this.cam.camera, this.player, loc!);
        if (input.justPressed('interact', 'gameplay')) {
          if (this.interaction.trigger()) this.audio.play('click', 0.5);
        }
        this.tools.update(sdt);
      } else if (loc!.mode === 'cinematic') {
        this.cam.update(dt, null, null);
      }
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 300) {
        this.autosaveTimer = 0;
        void this.autosave('Autosave');
      }
    } else if (this.inGame && loc && !this.locations.busy) {
      // Paused: keep rendering, no simulation.
      input.consumeMouse();
      if (input.justPressed('pause', ['ui', 'menu'])) this.closeOverlay();
    }

    this.hudTimer += dt;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      this.updateHud();
    }
    if (this.inGame && loc) this.renderer.render(dt);
    else this.renderTitleBackdrop(dt);
    input.endFrame();
  }

  private titleScene: THREE.Scene | null = null;
  private titleCam: THREE.PerspectiveCamera | null = null;
  private titleT = 0;
  private renderTitleBackdrop(dt: number): void {
    if (!this.titleScene) {
      void import('./render/titleBackdrop').then((m) => {
        const r = m.buildTitleBackdrop();
        this.titleScene = r.scene;
        this.titleCam = r.camera;
      });
      this.titleScene = new THREE.Scene();
      return;
    }
    if (!this.titleCam) return;
    this.titleT += dt;
    this.titleScene.userData.update?.(this.titleT);
    this.renderer.setScene(this.titleScene, this.titleCam);
    this.renderer.render(dt);
  }

  private handleGlobalInput(): void {
    const input = this.input;
    const ctx = input.context;
    if (ctx === 'gameplay' || ctx === 'flight') {
      if (input.justPressed('pause', ctx)) this.openOverlay('pause');
      else if (input.justPressed('inventory', ctx)) this.openOverlay('inventory');
      else if (input.justPressed('journal', ctx)) this.openOverlay('journal');
      else if (input.justPressed('map', ctx)) this.openOverlay('map');
      else if (input.justPressed('quicksave', ctx)) void this.quicksave();
      else if (input.justPressed('quickload', ctx)) void this.loadSlot('quick');
    }
    if (ctx === 'gameplay') {
      if (input.justPressed('cycleView', 'gameplay')) {
        const v = this.cam.cycleView();
        this.store.state.player.cameraView = v;
        pushNotification(`View: ${v === 'first' ? 'First person' : v === 'back' ? 'Third person (behind)' : 'Third person (front)'}`);
      }
      if (input.justPressed('flashlight', 'gameplay')) {
        this.suit.headlamp = !this.suit.headlamp;
        this.player.model.setHeadLamp(this.suit.headlamp);
        this.audio.play('switch', 0.5);
      }
    }
    if (ctx === 'dialogue') {
      if (input.justPressed('skip', 'dialogue') || input.justPressed('interact', 'dialogue')) this.dialogue.continue();
    }
    if (ctx === 'panel' && input.justPressed('pause', 'panel')) this.closePanel();
    if (ctx === 'ui' && (input.justPressed('pause', 'ui') || input.justPressed('inventory', 'ui') && ui.overlay.value === 'inventory')) this.closeOverlay();
  }

  private handleLanding(): void {
    const impact = this.player.landingImpact;
    if (impact <= 0) return;
    this.player.landingImpact = 0;
    this.audio.play('land', clamp(impact / 8, 0.3, 1));
    const g = this.currentLocation?.env.gravity ?? 9.8;
    // Fall damage scales with impact speed; lethal only for large falls.
    const safe = g < 4 ? 7 : 10;
    if (impact > safe) {
      const dmg = (impact - safe) * 9;
      this.store.state.player.health = Math.max(0, this.store.state.player.health - dmg);
      this.audio.play('hurt');
      this.cam.addShake(0.6);
    } else if (impact > safe * 0.6) this.cam.addShake(0.15);
  }

  /** Falling out of the world or leaving bounds returns the player to safety. */
  private checkBounds(loc: Location): void {
    const p = this.player.position;
    if (p.y < loc.killY) {
      const spawn = loc.spawns[this.store.state.player.spawnId] ?? Object.values(loc.spawns)[0];
      if (spawn) this.player.teleport(spawn.position, spawn.yaw);
      pushNotification('Recovered to a safe position', 'warn');
      this.cam.snap();
    }
  }

  addHook(fn: (dt: number) => boolean | void): () => void {
    this.hooks.add(fn);
    return () => this.hooks.delete(fn);
  }

  /* =========================== Ship repairs =========================== */

  /**
   * Perform one physical repair step: checks requirements, consumes parts atomically,
   * records the step, and optionally brings the system online if everything is ready.
   */
  repairStep(systemId: string, stepId: string, autoOnline: string | null): boolean {
    const store = this.store;
    const def = store.content.shipSystems[systemId];
    const step = def?.steps.find((s) => s.id === stepId);
    const sys = store.state.ship.systems[systemId];
    if (!def || !step || !sys) return false;
    if (sys.steps[stepId]) return false;
    if (!store.check(step.requires)) {
      store.notify('Not possible yet', 'warn');
      this.audio.play('error');
      return false;
    }
    let ok = false;
    store.batch('repair', () => {
      if (step.consumes && !store.takeAll(step.consumes)) {
        const missing = step.consumes.find((c) => store.count(c.item) < c.qty);
        store.notify(`Need ${missing?.qty} ${store.content.items[missing?.item ?? '']?.name ?? missing?.item}`, 'warn');
        return;
      }
      store.apply([{ repairStep: { system: systemId, step: stepId } }]);
      store.notify(`${def.name}: ${step.label} — done`, 'info');
      ok = true;
    });
    if (!ok) {
      this.audio.play('error');
      return false;
    }
    this.audio.play('confirm');
    if (autoOnline) this.bringOnline(autoOnline);
    return true;
  }

  /** Whether a system can be brought online (all steps done + dependencies online). */
  systemReady(systemId: string): { ok: boolean; reason?: string } {
    const store = this.store;
    const def = store.content.shipSystems[systemId];
    const sys = store.state.ship.systems[systemId];
    if (!def || !sys) return { ok: false, reason: 'Unknown system' };
    const missing = def.steps.find((s) => !sys.steps[s.id]);
    if (missing) return { ok: false, reason: `${missing.label} (${missing.where})` };
    const dep = def.dependsOn.find((d) => !store.state.ship.systems[d]?.online);
    if (dep) return { ok: false, reason: `Requires ${store.content.shipSystems[dep]?.name ?? dep} online` };
    return { ok: true };
  }

  bringOnline(systemId: string): boolean {
    const r = this.systemReady(systemId);
    const store = this.store;
    if (!r.ok) {
      store.notify(r.reason ?? 'Not ready', 'warn');
      return false;
    }
    if (store.state.ship.systems[systemId].online) return true;
    store.apply([{ systemOnline: { system: systemId, online: true } }]);
    store.notify(`${store.content.shipSystems[systemId].name} ONLINE`, 'quest');
    this.audio.play('powerUp');
    this.cam.addShake(0.15);
    this.story.onStoryEvent(`online:${systemId}`);
    return true;
  }

  /* ============================== Death ============================== */

  private async die(): Promise<void> {
    this.dying = true;
    const s = this.store.state;
    this.player.controlEnabled = false;
    this.audio.stinger('somber');
    ui.overlay.value = 'death';
    this.input.push('ui');
    // Drop non-quest suit contents into a recoverable cache at the death location.
    const inv = this.store.container(PLAYER_INV);
    const dropped = inv.stacks.filter((st) => CONTENT.items[st.itemId]?.category !== 'quest');
    if (dropped.length && this.currentLocation?.mode === 'foot') {
      const locState = this.store.locationState(this.currentLocation.id);
      locState.dynamic = locState.dynamic.filter((d) => d.kind !== 'cache'); // one cache per location
      locState.dynamic.push({
        uid: this.store.nextUid('cache'),
        kind: 'cache',
        position: [this.player.position.x, this.player.position.y, this.player.position.z],
        items: dropped.map((d) => ({ ...d })),
      });
      inv.stacks = inv.stacks.filter((st) => CONTENT.items[st.itemId]?.category === 'quest');
      this.store.markChanged('death-drop');
    }
    void s;
  }

  /** Called from the death overlay. */
  async respawn(): Promise<void> {
    const s = this.store.state;
    ui.overlay.value = null;
    this.input.pop('ui');
    s.player.health = 100;
    s.player.oxygen = s.player.oxygenMax;
    s.player.suitPower = s.player.suitPowerMax;
    this.dying = false;
    await this.locations.travel(
      { location: s.player.respawn.locationId, spawn: s.player.respawn.spawnId },
      { label: 'Recovering…' },
    );
    pushNotification('Your suit contents were left in a cache where you fell.', 'warn');
  }

  /* ============================== Saving ============================== */

  /** Saving is only allowed in safe states. */
  canSave(): { ok: boolean; reason?: string } {
    if (!this.inGame) return { ok: false, reason: 'Not in game' };
    if (this.locations.busy) return { ok: false, reason: 'In transition' };
    if (this.story.cinematicActive) return { ok: false, reason: 'During a cinematic' };
    if (this.dialogue.active) return { ok: false, reason: 'During a conversation' };
    if (this.dying) return { ok: false, reason: 'Incapacitated' };
    if (this.currentLocation?.mode === 'cinematic') return { ok: false, reason: 'During a cinematic' };
    return { ok: true };
  }

  async save(slot: SlotId | string, label: string): Promise<boolean> {
    const can = this.canSave();
    if (!can.ok) {
      pushNotification(`Can't save now: ${can.reason}`, 'warn');
      return false;
    }
    try {
      const obj = this.story.currentObjectiveText();
      const locName = LOCATION_REGISTRY[this.store.state.player.locationId]?.name ?? '';
      this.story.beforeSave();
      const file = buildSaveFile(this.store.state, slot, label, obj, locName);
      await this.saves.write(file);
      if (!this.saves.persistent) pushNotification('Saved to memory only (browser storage unavailable). Use Export.', 'warn');
      return true;
    } catch (e) {
      console.error(e);
      pushNotification(`Save failed: ${(e as Error).message}`, 'warn');
      return false;
    }
  }

  async quicksave(): Promise<void> {
    if (await this.save('quick', 'Quicksave')) pushNotification('Quicksaved', 'info');
  }

  /** Autosaves are deferred until a safe state rather than skipped silently. */
  async autosave(label: string): Promise<void> {
    if (!this.canSave().ok) {
      const off = this.addHook(() => {
        if (!this.inGame) return false;
        if (this.canSave().ok) {
          off();
          void this.autosave(label);
          return false;
        }
      });
      return;
    }
    const slot = await this.saves.nextAutoSlot();
    if (await this.save(slot, label)) pushNotification('Progress saved', 'info');
  }

  /* ============================ Overlays / UI ============================ */

  openOverlay(o: Exclude<typeof ui.overlay.value, null>, arg: string | null = null): void {
    if (ui.overlay.value) return;
    if (this.story.cinematicActive && o !== 'pause') return;
    ui.overlayArg.value = arg;
    ui.overlay.value = o;
    this.input.push('ui');
    if (o === 'pause' || o === 'saves' || o === 'settings') this.paused = true;
    ui.revision.value = this.store.revision + 1;
  }

  closeOverlay(): void {
    if (!ui.overlay.value || ui.overlay.value === 'death') return;
    ui.overlay.value = null;
    ui.overlayArg.value = null;
    this.paused = false;
    this.input.pop('ui');
  }

  openPanel(p: PanelController): void {
    if (this.panel) return;
    this.panel = p;
    this.input.push('panel');
    this.cam.setOverride(p.cameraPose(), 4);
    this.cam.forceFirst = true;
    p.open();
  }

  closePanel(): void {
    const p = this.panel;
    if (!p) return;
    this.panel = null;
    p.close();
    this.cam.setOverride(null);
    this.cam.forceFirst = false;
    this.input.pop('panel');
    ui.panelHelp.value = null;
  }

  talkTo(dialogueId: string): void {
    if (this.dialogue.active) return;
    if (this.dialogue.start(dialogueId)) this.input.push('dialogue');
  }

  /* ============================ Fading ============================ */

  fadeTo(target: number, seconds: number): Promise<void> {
    this.fadeAnim?.resolve();
    if (seconds <= 0) {
      ui.fade.value = target;
      this.fadeAnim = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.fadeAnim = { from: ui.fade.value, to: target, t: 0, dur: seconds, resolve };
    });
  }

  private updateFade(dt: number): void {
    const f = this.fadeAnim;
    if (!f) return;
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    ui.fade.value = f.from + (f.to - f.from) * k;
    if (k >= 1) {
      this.fadeAnim = null;
      f.resolve();
    }
  }

  /* ============================ HUD ============================ */

  private updateHud(): void {
    if (!this.inGame) return;
    const s = this.store.state;
    const loc = this.currentLocation;
    const q = this.story.currentObjective();
    const hud: HudData = {
      health: s.player.health,
      oxygen: s.player.oxygen,
      oxygenMax: s.player.oxygenMax,
      suitPower: s.player.suitPower,
      suitPowerMax: s.player.suitPowerMax,
      stamina: this.suit.stamina,
      temperature: this.suit.readout.temperature,
      pressurized: this.suit.readout.pressurized,
      locationName: loc ? LOCATION_REGISTRY[loc.id]?.name ?? loc.name : '',
      objective: q?.objective ?? null,
      questTitle: q?.title ?? null,
      view: this.cam.effectiveView,
      tool: this.tools.label,
      compass: this.player.yaw,
      timeOfDay: (loc as any)?.timeOfDayLabel?.() ?? null,
      hazard: this.suit.readout.hazard,
      flight: (loc as any)?.flightHud?.() ?? null,
      scan: this.tools.scanHud,
      interior: loc?.env.atmosphere === 'breathable',
    };
    ui.hud.value = hud;
    if (ui.debug.value) {
      const st = this.renderer.stats();
      const p = this.player.position;
      ui.debugText.value = `fps ${this.fps.toFixed(0)} | calls ${st.calls} | tris ${(st.triangles / 1000).toFixed(0)}k | geo ${st.geometries} | tex ${st.textures}\n` +
        `loc ${loc?.id} | pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} | ctx ${this.input.context} | listeners ${this.store.events.listenerCount()}`;
    }
  }

  /* ============================ Settings ============================ */

  applySettings(): void {
    const s = this.settings;
    this.input.sensitivity = 0.0022 * s.sensitivity;
    this.input.invertY = s.invertY;
    this.audio.volumes = { ...s.volumes };
    this.audio.applyVolumes();
    if (this.renderer.preset !== s.quality) this.renderer.setQuality(s.quality);
    try {
      localStorage.setItem('lantern:settings', JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('lantern:settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return structuredClone(DEFAULT_SETTINGS);
}
