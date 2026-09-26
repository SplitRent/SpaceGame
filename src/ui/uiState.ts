import { signal } from '@preact/signals';

/**
 * UI-facing signals. The game writes view-model data here; Preact components render it.
 * UI never mutates GameState directly — it calls Game methods, which go through the Store.
 */
export type Screen = 'boot' | 'title' | 'game';
export type Overlay =
  | null
  | 'pause'
  | 'inventory'
  | 'journal'
  | 'database'
  | 'map'
  | 'craft'
  | 'build'
  | 'settings'
  | 'saves'
  | 'death'
  | 'container'
  | 'shipstatus'
  | 'newgame';

export interface HudData {
  health: number;
  oxygen: number;
  oxygenMax: number;
  suitPower: number;
  suitPowerMax: number;
  stamina: number;
  temperature: number;
  pressurized: boolean;
  /** Outside-air label when not pressurized (VACUUM, CO₂ 0.006 bar…). */
  atmosphere: string;
  locationName: string;
  objective: string | null;
  questTitle: string | null;
  view: string;
  tool: string;
  compass: number;
  timeOfDay: string | null;
  hazard: string | null;
  flight: FlightHud | null;
  scan: ScanHud | null;
  interior: boolean;
}

export interface FlightHud {
  view: string;
  speed: number;
  throttle: number;
  assist: boolean;
  target: string | null;
  targetDist: number | null;
  altitude: number | null;
  propellant: number;
  hull: number;
  mode: string;
}

export interface ScanHud {
  progress: number;
  label: string;
  result: string | null;
}

export interface Notification {
  id: number;
  text: string;
  kind: 'info' | 'item' | 'quest' | 'warn' | 'discovery';
  at: number;
}

export interface DialogueView {
  speaker: string;
  speakerRole: string;
  text: string;
  choices: { text: string; index: number }[];
  canContinue: boolean;
}

export interface PromptView {
  text: string;
  detail: string | null;
  key: string;
}

export interface Subtitle {
  speaker: string;
  text: string;
}

export const ui = {
  screen: signal<Screen>('boot'),
  overlay: signal<Overlay>(null),
  overlayArg: signal<string | null>(null),
  hud: signal<HudData | null>(null),
  prompt: signal<PromptView | null>(null),
  notifications: signal<Notification[]>([]),
  dialogue: signal<DialogueView | null>(null),
  subtitle: signal<Subtitle | null>(null),
  fade: signal(1),
  fadeColor: signal('#000'),
  loading: signal<string | null>(null),
  title: signal<{ text: string; sub: string } | null>(null),
  crosshair: signal(true),
  letterbox: signal(false),
  revision: signal(0),
  debug: signal(false),
  debugText: signal(''),
  hint: signal<string | null>(null),
  panelHelp: signal<string | null>(null),
  bootError: signal<string | null>(null),
  /** Screen-space flight markers (0..1 coords). */
  markers: signal<{ x: number; y: number; label: string; dist: string; selected: boolean; behind: boolean }[]>([]),
};

let nid = 1;
export function pushNotification(text: string, kind: Notification['kind'] = 'info'): void {
  const list = ui.notifications.value.filter((n) => performance.now() - n.at < 6000).slice(-4);
  ui.notifications.value = [...list, { id: nid++, text, kind, at: performance.now() }];
}
