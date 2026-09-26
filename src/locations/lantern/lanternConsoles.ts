import * as THREE from 'three';
import type { Game } from '../../Game';
import type { LanternInterior } from './LanternInterior';
import { ConsolePanel, type ConsoleSpec } from '../../interaction/ConsolePanel';
import { ScreenUI } from '../../render/screen';
import { LAUNCH_PROPELLANT, ASCENT_COST } from '../../content/shipSystems';
import { zoneForSurface } from '../../content/zones';
import { StarMapPanel } from './StarMapPanel';
import { pushNotification, ui } from '../../ui/uiState';

function ui_hint(text: string): void {
  ui.hint.value = text;
  setTimeout(() => {
    if (ui.hint.value === text) ui.hint.value = null;
  }, 5000);
}
import type { Interactable } from '../../interaction/Interactable';
import { disposeObject } from '../Location';

const D3 = -4;

export interface LanternConsoles {
  refresh(): void;
  update(dt: number): void;
  dispose(): void;
}

/**
 * All interactive equipment aboard the Lantern. Every console is a physical first-person
 * panel whose controls perform real repair steps / system activations through Game APIs.
 */
export function buildLanternConsoles(game: Game, loc: LanternInterior): LanternConsoles {
  const store = game.store;
  const st = () => store.state;
  const sys = (id: string) => st().ship.systems[id];
  const step = (id: string, s: string) => !!sys(id)?.steps[s];
  const online = (id: string) => !!sys(id)?.online;
  const crashed = () => !!st().flags.crashed;
  const ent = (id: string, key: string) => store.getEntity(loc.id, id, key);
  const setEnt = (id: string, key: string, v: boolean | number | string) => store.setEntity(loc.id, id, key, v);
  const panels: ConsolePanel[] = [];
  const disposables: THREE.Object3D[] = [];

  /** Create a mount point (ship-local position, facing direction yaw) and a panel on it. */
  const mount = (x: number, y: number, z: number, yaw: number, pitch = 0): THREE.Group => {
    const m = new THREE.Group();
    m.position.set(x, y, z);
    m.rotation.set(0, yaw, 0);
    const inner = new THREE.Group();
    inner.rotation.x = pitch;
    m.add(inner);
    loc.frame.add(m);
    disposables.push(m);
    return inner;
  };

  const console_ = (id: string, m: THREE.Object3D, spec: ConsoleSpec, prompt: () => string | null, available?: () => boolean, detail?: () => string | null) => {
    const panel = new ConsolePanel(game, m, spec);
    panels.push(panel);
    const it: Interactable = {
      id,
      object: panel.face,
      kind: 'panel',
      range: 2.6,
      prompt,
      detail,
      available,
      interact: () => game.openPanel(panel),
    };
    loc.registerInteractable(it);
    return panel;
  };

  const simple = (id: string, obj: THREE.Object3D, prompt: () => string | null, interact: () => void, opts: { available?: () => boolean; detail?: () => string | null; kind?: Interactable['kind']; range?: number } = {}) => {
    loc.registerInteractable({ id, object: obj, prompt, interact, kind: opts.kind ?? 'use', available: opts.available, detail: opts.detail, range: opts.range });
  };

  const hotspot = (x: number, y: number, z: number, w = 0.8, h = 0.8, d = 0.8, visible = false, color = '#4fd1ff'): THREE.Mesh => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      visible ? new THREE.MeshStandardMaterial({ color: '#2b3038', emissive: color, emissiveIntensity: 0.5 }) : new THREE.MeshBasicMaterial({ visible: false }),
    );
    m.position.set(x, y, z);
    loc.frame.add(m);
    disposables.push(m);
    return m;
  };

  const lowPower = () => !online('power.batteries') && crashed();

  const flightStatus = () => {
    const p = st().ship.parking;
    if (p.kind === 'surface') return `Landed. Take-off costs ${ascentCost()} kg · ${Math.round(st().ship.propellant)} kg aboard`;
    if (p.kind === 'transit') return `Transit ${Math.round((p.elapsed / p.duration) * 100)}% — autopilot coasting`;
    if (p.kind === 'docked') return 'Docked. Clamps engaged.';
    return 'In orbit — autopilot station-keeping';
  };
  const ascentCost = () => {
    const p = st().ship.parking;
    const body = p.kind === 'surface' ? zoneForSurface(p.locationId)?.body ?? 'moon' : 'moon';
    return ASCENT_COST[body] ?? 200;
  };

  /* =============================== ENGINEERING =============================== */

  // --- Battery bay: insert the emergency fuel cell
  console_(
    'battery.bay',
    mount(4.62, D3 + 1.35, 30.6, -Math.PI / 2),
    {
      title: 'Battery bay',
      width: 0.8,
      height: 0.6,
      screen: {
        x: 0.12, y: 0.1, w: 0.46, h: 0.28, px: [384, 232],
        draw: (ctx, w, h) => {
          ScreenUI.bg(ctx, w, h, '#120a06');
          ScreenUI.title(ctx, 'Battery bay');
          const has = step('power.batteries', 'fuelcell');
          ScreenUI.status(ctx, 18, 80, has ? 'Fuel cell: SEATED' : 'Fuel cell: MISSING', has ? 'ok' : 'fault');
          ScreenUI.status(ctx, 18, 115, `Bus charge ${has ? '38' : '0'}%`, has ? 'warn' : 'off');
          ScreenUI.text(ctx, has ? 'Close bus breakers (west wall)' : 'Insert emergency fuel cell', 18, 160, '#9fe8ff', 15);
        },
      },
      controls: [
        {
          id: 'slot', kind: 'slot', x: -0.24, y: 0.05,
          label: () => (step('power.batteries', 'fuelcell') ? 'Fuel cell seated' : store.count('fuelcell') ? 'Insert emergency fuel cell' : 'Fuel cell slot (empty — check the cargo hold)'),
          enabled: () => !step('power.batteries', 'fuelcell') && store.count('fuelcell') > 0,
          state: () => step('power.batteries', 'fuelcell'),
          onClick: () => game.repairStep('power.batteries', 'fuelcell', null),
        },
      ],
    },
    () => 'Battery bay',
    () => crashed(),
  );

  // --- Power distribution panel: breaker ordering puzzle
  const breakers: { id: string; label: string; needs: string[] }[] = [
    { id: 'main', label: 'MAIN BUS', needs: [] },
    { id: 'distA', label: 'DIST A', needs: ['main'] },
    { id: 'distB', label: 'DIST B', needs: ['main'] },
    { id: 'life', label: 'LIFE SUPPORT', needs: ['distA'] },
    { id: 'comms', label: 'COMMS', needs: ['distB'] },
    { id: 'hab', label: 'HAB LIGHTING', needs: ['distA', 'distB'] },
  ];
  const brk = (id: string) => !!ent('breakers', id) || step('power.batteries', 'breakers');
  const powerPanel = console_(
    'power.panel',
    mount(-11.36, D3 + 1.6, 35, Math.PI / 2),
    {
      title: 'Power distribution',
      width: 1.6,
      height: 1.2,
      screen: {
        x: 0, y: 0.33, w: 1.3, h: 0.46, px: [640, 226],
        draw: (ctx, w, h) => {
          ScreenUI.bg(ctx, w, h, '#0a0f14');
          ScreenUI.title(ctx, 'Power distribution — bus topology');
          if (!step('power.batteries', 'fuelcell')) {
            ScreenUI.text(ctx, 'NO SOURCE — bus dead. Seat a fuel cell in the battery bay.', 18, 90, '#ff7b7b', 18);
            return;
          }
          // topology diagram
          const pos: Record<string, [number, number]> = { main: [60, 120], distA: [220, 80], distB: [220, 160], life: [420, 60], comms: [420, 160], hab: [420, 110] };
          ctx.strokeStyle = 'rgba(143,227,255,0.4)';
          ctx.lineWidth = 2;
          for (const b of breakers) for (const n of b.needs) {
            ctx.beginPath();
            ctx.moveTo(pos[n][0] + 60, pos[n][1]);
            ctx.lineTo(pos[b.id][0], pos[b.id][1]);
            ctx.stroke();
          }
          for (const b of breakers) {
            const on = brk(b.id);
            ctx.fillStyle = on ? '#3ee08f' : '#39424c';
            ctx.fillRect(pos[b.id][0], pos[b.id][1] - 14, 120, 26);
            ScreenUI.text(ctx, b.label, pos[b.id][0] + 6, pos[b.id][1] + 4, on ? '#051a0e' : '#cfe9f2', 13, true);
          }
          ScreenUI.text(ctx, step('power.batteries', 'breakers') ? (online('power.batteries') ? 'BUS ONLINE' : 'All breakers closed — engage BUS ONLINE') : 'Close breakers upstream-first. Downstream loads trip if their bus is dead.', 18, h - 14, '#9fe8ff', 14);
        },
      },
      controls: [
        ...breakers.map((b, i) => ({
          id: b.id, kind: 'breaker' as const, x: -0.62 + i * 0.2, y: -0.25,
          label: () => `${b.label} breaker — ${brk(b.id) ? 'closed' : 'open'}`,
          enabled: () => step('power.batteries', 'fuelcell') && !step('power.batteries', 'breakers'),
          state: () => brk(b.id),
          color: '#ffc857',
          onClick: () => {
            if (brk(b.id)) {
              setEnt('breakers', b.id, false);
              return;
            }
            const missing = b.needs.find((n) => !brk(n));
            if (missing) {
              game.audio.play('error');
              game.cam.addShake(0.1);
              const wp = loc.shipToWorld(new THREE.Vector3(-11.2, D3 + 1.4, 35));
              loc.glowParticles.emit({ count: 25, position: wp, velocity: new THREE.Vector3(1, 0.5, 0), spread: 1.5, life: [0.2, 0.6], size: 0.05, color: '#ffd28a', gravity: loc.env.gravity });
              pushNotification(`${b.label} tripped — its upstream bus is dead`, 'warn');
              return;
            }
            setEnt('breakers', b.id, true);
            if (breakers.every((x) => brk(x.id))) game.repairStep('power.batteries', 'breakers', null);
          },
        })),
        {
          id: 'online', kind: 'button', x: 0.6, y: -0.42, color: '#3ee08f',
          label: () => (online('power.batteries') ? 'Bus online' : 'BUS ONLINE — energize ship'),
          enabled: () => step('power.batteries', 'breakers') && !online('power.batteries'),
          state: () => online('power.batteries'),
          onClick: () => {
            if (game.bringOnline('power.batteries')) {
              game.audio.play('powerUp');
              store.apply([{ story: 'batteries.online' }]);
            }
          },
        },
      ],
    },
    () => 'Power distribution panel',
    () => crashed(),
  );
  void powerPanel;

  // --- Reactor: actuator installation (physical, at the vessel)
  const actuatorSpot = hotspot(-4, D3 + 1.3, 38.6, 1.2, 1.2, 0.5, true, '#ffb347');
  simple('reactor.actuator', actuatorSpot, () => (step('power.reactor', 'actuator') ? null : 'Replace control-rod actuator'), () => game.repairStep('power.reactor', 'actuator', null), {
    available: () => crashed() && !step('power.reactor', 'actuator'),
    detail: () => (store.count('actuator') ? 'You have the new actuator' : 'Needs a Control-Rod Actuator (fabricator)'),
  });

  // --- Coolant valve manifold
  const valves = ['PRIMARY', 'SECONDARY', 'RETURN'];
  const valveOpen = (i: number) => !!ent('coolant', `v${i}`) || step('power.reactor', 'coolant');
  console_(
    'reactor.coolant',
    mount(-0.55, D3 + 1.5, 42, Math.PI / 2),
    {
      title: 'Coolant loop',
      width: 1.1,
      height: 0.8,
      screen: {
        x: 0, y: 0.2, w: 0.9, h: 0.3, px: [480, 160],
        draw: (ctx, w, h) => {
          ScreenUI.bg(ctx, w, h, '#06121a');
          ScreenUI.title(ctx, 'Coolant loop');
          const n = valves.filter((_, i) => valveOpen(i)).length;
          ScreenUI.text(ctx, `Loop pressure ${(n * 5.2).toFixed(1)} bar`, 18, 75);
          ScreenUI.bar(ctx, 18, 95, w - 36, 16, n / 3, n === 3 ? '#3ee08f' : '#ffc857');
          ScreenUI.text(ctx, n === 3 ? 'Flow nominal' : 'Open valves in flow order: primary → secondary → return', 18, 140, '#9fe8ff', 14);
        },
      },
      controls: valves.map((v, i) => ({
        id: v, kind: 'valve' as const, x: -0.32 + i * 0.32, y: -0.18, color: '#ff8a3d',
        label: () => `${v} valve — ${valveOpen(i) ? 'open' : 'closed'}`,
        enabled: () => crashed() && step('power.reactor', 'actuator') && !step('power.reactor', 'coolant'),
        state: () => valveOpen(i),
        onClick: () => {
          if (i > 0 && !valveOpen(i - 1)) {
            game.audio.play('error');
            pushNotification('Water hammer! Open the valves in flow order.', 'warn');
            game.cam.addShake(0.15);
            return;
          }
          setEnt('coolant', `v${i}`, true);
          game.audio.play('thruster', 0.5);
          if (valves.every((_, k) => valveOpen(k))) game.repairStep('power.reactor', 'coolant', null);
        },
      })),
    },
    () => 'Coolant valve manifold',
    () => crashed(),
    () => (step('power.reactor', 'actuator') ? null : 'Install the control-rod actuator first'),
  );

  // --- Engineering console: reactor start-up, struts, drive
  const seq = () => (ent('startup', 'stage') as number) ?? 0;
  const engConsole = console_(
    'eng.console',
    mount(-10.55, D3 + 1.25, 30, Math.PI / 2, -0.5),
    {
      title: 'Engineering console',
      width: 1.5,
      height: 0.9,
      tick: 0.5,
      screen: {
        x: 0, y: 0.18, w: 1.3, h: 0.46, px: [640, 226],
        draw: (ctx, w, h, t) => {
          ScreenUI.bg(ctx, w, h);
          if (!crashed()) {
            ScreenUI.title(ctx, 'Engineering · all systems nominal');
            ScreenUI.text(ctx, 'Reactor 62% · Drive cold · Radiators 88%', 18, 80);
            ScreenUI.text(ctx, st().flags['prologue.diag'] ? 'Diagnostic complete — no faults.' : 'Scheduled diagnostic pending (press RUN DIAGNOSTIC).', 18, 120, '#9fe8ff');
            return;
          }
          ScreenUI.title(ctx, 'Reactor & drive');
          const r = online('power.reactor');
          const stage = seq();
          ScreenUI.status(ctx, 18, 72, `Actuator ${step('power.reactor', 'actuator') ? 'OK' : 'FAULT'}`, step('power.reactor', 'actuator') ? 'ok' : 'fault');
          ScreenUI.status(ctx, 18, 102, `Coolant ${step('power.reactor', 'coolant') ? 'FLOWING' : 'NO FLOW'}`, step('power.reactor', 'coolant') ? 'ok' : 'fault');
          ScreenUI.status(ctx, 18, 132, `Core ${r ? 'CRITICAL · 60 kW(e)' : stage ? `START-UP ${stage}/4` : 'SHUTDOWN'}`, r ? 'ok' : stage ? 'warn' : 'off');
          const temp = r ? 0.62 + Math.sin(t) * 0.01 : stage * 0.15;
          ScreenUI.bar(ctx, 300, 60, 300, 14, temp, temp > 0.8 ? '#ff5a5a' : '#4fd1ff');
          ScreenUI.text(ctx, 'Core temperature', 300, 92, '#7d8a96', 13);
          ScreenUI.status(ctx, 300, 132, `Ship list ${st().ship.listDeg.toFixed(0)}°`, st().ship.listDeg > 0 ? 'warn' : 'ok');
          ScreenUI.status(ctx, 300, 162, `Propellant ${Math.round(st().ship.propellant)} / ${LAUNCH_PROPELLANT} kg`, st().ship.propellant >= LAUNCH_PROPELLANT ? 'ok' : 'warn');
          ScreenUI.status(ctx, 18, 162, `Main drive ${online('prop.main') ? 'READY' : 'OFFLINE'}`, online('prop.main') ? 'ok' : 'off');
          ScreenUI.text(ctx, r ? '' : 'Start-up: PUMPS → ROD STEP ×3 (watch temperature)', 18, h - 16, '#9fe8ff', 14);
        },
      },
      controls: [
        {
          id: 'diag', kind: 'button', x: -0.55, y: -0.25, color: '#4fd1ff',
          label: () => (crashed() ? 'Diagnostics' : 'RUN DIAGNOSTIC'),
          enabled: () => !crashed() && !st().flags['prologue.diag'],
          onClick: () => {
            store.setFlag('prologue.diag', true);
            game.audio.play('confirm');
          },
        },
        {
          id: 'pumps', kind: 'switch', x: -0.3, y: -0.25, color: '#4fd1ff',
          label: () => 'Primary coolant pumps',
          enabled: () => crashed() && step('power.reactor', 'coolant') && !online('power.reactor') && online('power.batteries') && seq() === 0,
          state: () => seq() >= 1 || online('power.reactor'),
          onClick: () => setEnt('startup', 'stage', 1),
        },
        {
          id: 'rod', kind: 'button', x: -0.08, y: -0.25, color: '#ffc857',
          label: () => `Control rods — step withdraw (${Math.max(0, seq() - 1)}/3)`,
          enabled: () => crashed() && seq() >= 1 && seq() < 4 && !online('power.reactor'),
          onClick: () => {
            const n = seq() + 1;
            setEnt('startup', 'stage', n);
            game.cam.addShake(0.08 * n);
            game.audio.play('powerUp', 0.4);
            if (n >= 4) {
              game.repairStep('power.reactor', 'startup', null);
              if (game.bringOnline('power.reactor')) store.apply([{ story: 'reactor.online' }]);
            }
          },
        },
        {
          id: 'struts', kind: 'button', x: 0.2, y: -0.25, color: '#b18cff',
          label: () => (step('prop.main', 'struts') ? 'Struts extended — ship level' : 'Extend port landing struts (level ship)'),
          enabled: () => crashed() && online('power.reactor') && !!store.check({ questActive: 'mq.lift' }) && !step('prop.main', 'struts'),
          onClick: () => {
            if (game.repairStep('prop.main', 'struts', null)) store.apply([{ story: 'ship.level' }]);
          },
        },
        {
          id: 'drive', kind: 'button', x: 0.5, y: -0.25, color: '#3ee08f',
          label: () => (online('prop.main') ? 'Main drive ready' : 'Bring main drive online'),
          enabled: () => crashed() && !online('prop.main') && game.systemReady('prop.main').ok,
          state: () => online('prop.main'),
          onClick: () => {
            game.bringOnline('prop.main');
          },
        },
      ],
    },
    () => 'Engineering console',
  );
  void engConsole;

  // --- Life support plant
  console_(
    'life.console',
    mount(-8.38, D3 + 1.4, 46.4, Math.PI / 2),
    {
      title: 'Life support',
      width: 1.1,
      height: 0.9,
      screen: {
        x: 0, y: 0.22, w: 0.9, h: 0.36, px: [480, 192],
        draw: (ctx, w, h) => {
          ScreenUI.bg(ctx, w, h, '#061a12');
          ScreenUI.title(ctx, 'Life support', 18, 36, '#8fffc8');
          ScreenUI.status(ctx, 18, 72, `Hull integrity ${online('life.hull') ? 'SEALED' : 'BREACHED'}`, online('life.hull') ? 'ok' : 'fault');
          ScreenUI.status(ctx, 18, 102, `CO₂ scrubbers ${step('life.support', 'scrubbers') ? 'LOADED' : 'EMPTY'}`, step('life.support', 'scrubbers') ? 'ok' : 'fault');
          ScreenUI.status(ctx, 18, 132, `Cabin pressure ${online('life.support') ? '101 kPa' : '0 kPa'}`, online('life.support') ? 'ok' : 'off');
          ScreenUI.text(ctx, online('life.support') ? 'Atmosphere nominal. Helmets off.' : 'Seal breaches, load cartridges, then repressurize.', 18, h - 18, '#9fe8ff', 14);
        },
      },
      controls: [
        {
          id: 'scrub', kind: 'slot', x: -0.28, y: -0.22,
          label: () => (step('life.support', 'scrubbers') ? 'Cartridges loaded' : `Load CO₂ scrubber cartridges (${store.count('scrubber')}/2)`),
          enabled: () => crashed() && !step('life.support', 'scrubbers') && store.count('scrubber') >= 2,
          state: () => step('life.support', 'scrubbers'),
          onClick: () => game.repairStep('life.support', 'scrubbers', null),
        },
        {
          id: 'repress', kind: 'button', x: 0.28, y: -0.22, color: '#3ee08f',
          label: () => (online('life.support') ? 'Pressurized' : 'REPRESSURIZE'),
          enabled: () => crashed() && !online('life.support') && step('life.support', 'scrubbers') && online('life.hull') && online('power.batteries'),
          state: () => online('life.support'),
          onClick: () => {
            if (!step('life.support', 'restart')) game.repairStep('life.support', 'restart', null);
            if (game.bringOnline('life.support')) {
              game.audio.play('airlock');
              store.apply([{ story: 'repressurized' }]);
            }
          },
        },
      ],
    },
    () => 'Life support plant',
    () => crashed(),
  );

  // --- Hull breaches (sealant)
  const breachSpot = (id: string, x: number, y: number, z: number) => {
    const h = hotspot(x, y, z, 1.4, 1.2, 1.4);
    simple(`seal.${id}`, h, () => 'Seal hull breach', () => game.repairStep('life.hull', id, 'life.hull'), {
      available: () => crashed() && !step('life.hull', id),
      detail: () => `Uses 2 Hull Sealant (${store.count('sealant')} carried)`,
      range: 3.2,
    });
  };
  breachSpot('breach.corridor', 0, 2.5, 11);
  breachSpot('breach.lab', -7.3, 1.5, 7.2);

  /* ================================= BRIDGE ================================== */

  // --- Navigation station: star tracker install + calibration timing
  let sweep = 0;
  const locks = () => (ent('navcal', 'locks') as number) ?? 0;
  console_(
    'nav.station',
    mount(-6.85, 1.25, -31, Math.PI / 2, -0.55),
    {
      title: 'Navigation',
      width: 1.5,
      height: 0.9,
      tick: 0.05,
      screen: {
        x: 0, y: 0.18, w: 1.3, h: 0.46, px: [640, 226],
        draw: (ctx, w, h) => {
          ScreenUI.bg(ctx, w, h, '#060a1a');
          if (!crashed()) {
            ScreenUI.title(ctx, 'Navigation · trans-lunar coast');
            ScreenUI.text(ctx, 'Harbor Station rendezvous in 00:41:12', 18, 80);
            ScreenUI.text(ctx, 'Next: lunar orbit insertion burn (automatic)', 18, 110, '#9fe8ff');
            return;
          }
          ScreenUI.title(ctx, 'Navigation', 18, 36, '#a8b8ff');
          if (!online('power.reactor')) return ScreenUI.text(ctx, 'Insufficient power for navigation core.', 18, 90, '#ff7b7b');
          if (!step('nav.core', 'tracker')) return ScreenUI.text(ctx, 'STAR TRACKER: NOT DETECTED — install replacement unit', 18, 90, '#ffc857');
          if (online('nav.core')) {
            ScreenUI.text(ctx, 'Inertial reference aligned. Position: lunar south polar region.', 18, 80);
            ScreenUI.text(ctx, 'Ascent trajectory to Harbor Station orbit: COMPUTED', 18, 110, '#3ee08f');
            return;
          }
          // star sweep calibration
          const cx = 440, cy = 120;
          ctx.strokeStyle = 'rgba(160,180,255,0.6)';
          ctx.beginPath();
          ctx.arc(cx, cy, 26, 0, Math.PI * 2);
          ctx.stroke();
          const sx = cx + Math.sin(sweep) * 150;
          const sy = cy + Math.cos(sweep * 1.3) * 18;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(sx, sy, 5, 0, Math.PI * 2);
          ctx.fill();
          ScreenUI.text(ctx, `Reference star ${['Canopus', 'Achernar', 'Rigil Kentaurus'][Math.min(2, locks())]}`, 18, 80);
          ScreenUI.text(ctx, `Locks ${locks()}/3 — press LOCK when the star is inside the ring`, 18, 110, '#9fe8ff', 14);
          ScreenUI.text(ctx, '(The south polar sky: Canopus rides high here.)', 18, 140, '#7d8a96', 13);
        },
      },
      controls: [
        {
          id: 'tracker', kind: 'slot', x: -0.5, y: -0.25,
          label: () => (step('nav.core', 'tracker') ? 'Star tracker installed' : store.count('startracker') ? 'Install star tracker' : 'Star tracker bay (unit destroyed in the crash)'),
          enabled: () => crashed() && online('power.reactor') && !step('nav.core', 'tracker') && store.count('startracker') > 0,
          state: () => step('nav.core', 'tracker'),
          onClick: () => game.repairStep('nav.core', 'tracker', null),
        },
        {
          id: 'lock', kind: 'button', x: 0.3, y: -0.25, color: '#a8b8ff',
          label: () => 'LOCK reference star',
          enabled: () => crashed() && step('nav.core', 'tracker') && !online('nav.core'),
          onClick: () => {
            const sx = Math.sin(sweep) * 150;
            const sy = Math.cos(sweep * 1.3) * 18;
            if (Math.hypot(sx, sy) < 30) {
              const n = locks() + 1;
              setEnt('navcal', 'locks', n);
              game.audio.play('scanDone');
              if (n >= 3) {
                game.repairStep('nav.core', 'calibrate', 'nav.core');
              }
            } else {
              game.audio.play('error', 0.5);
            }
          },
        },
      ],
    },
    () => 'Navigation station',
  );

  // --- Comms station
  console_(
    'comms.station',
    mount(6.85, 1.25, -31, -Math.PI / 2, -0.55),
    {
      title: 'Communications',
      width: 1.5,
      height: 0.9,
      tick: 0.5,
      screen: {
        x: 0, y: 0.18, w: 1.3, h: 0.46, px: [640, 226],
        draw: (ctx, w, h, t) => {
          ScreenUI.bg(ctx, w, h, '#0d0716');
          ScreenUI.title(ctx, 'Communications', 18, 36, '#d7b8ff');
          if (!crashed()) {
            ScreenUI.text(ctx, 'Harbor Station: “Lantern, you are cleared for approach.”', 18, 80);
            ScreenUI.text(ctx, 'Earth DSN: link nominal · 1.28 s light delay', 18, 110, '#9fe8ff');
            return;
          }
          ScreenUI.status(ctx, 18, 72, `Short range ${online('comms.short') ? 'ONLINE' : step('comms.short', 'antenna') ? 'READY' : 'ANTENNA DAMAGED'}`, online('comms.short') ? 'ok' : 'fault');
          ScreenUI.status(ctx, 18, 102, `Deep space ${online('comms.long') ? 'LINKED VIA SUMMIT RELAY' : 'NO LINE OF SIGHT TO EARTH'}`, online('comms.long') ? 'ok' : 'fault');
          // noise waveform
          ctx.strokeStyle = '#b18cff';
          ctx.beginPath();
          for (let x = 0; x < w - 36; x += 4) {
            const y = 160 + Math.sin(x * 0.07 + t * 5) * (online('comms.short') ? 6 : 2) + (Math.random() - 0.5) * 14;
            if (x === 0) ctx.moveTo(18 + x, y);
            else ctx.lineTo(18 + x, y);
          }
          ctx.stroke();
          ScreenUI.text(ctx, st().flags['harbor.silent'] ? 'Harbor Station: no carrier.' : '', 18, h - 16, '#ffc857', 14);
        },
      },
      controls: [
        {
          id: 'short', kind: 'button', x: -0.5, y: -0.25, color: '#b18cff',
          label: () => (online('comms.short') ? 'Short-range online' : 'Bring short-range comms online'),
          enabled: () => crashed() && !online('comms.short') && game.systemReady('comms.short').ok,
          state: () => online('comms.short'),
          onClick: () => {
            if (game.bringOnline('comms.short')) store.apply([{ story: 'comms.short.online' }]);
          },
        },
        {
          id: 'hail', kind: 'button', x: -0.2, y: -0.25, color: '#ffb347',
          label: () => 'Hail Harbor Station',
          enabled: () => crashed() && online('comms.short'),
          onClick: () => {
            store.setFlag('harbor.silent', true);
            game.audio.play('radio');
            pushNotification('Harbor Station, this is Lantern… Harbor, respond… — Nothing. Only static.', 'info');
          },
        },
        {
          id: 'earth', kind: 'button', x: 0.15, y: -0.25, color: '#6fb3ff',
          label: () => 'Open channel to Earth',
          enabled: () => crashed() && online('comms.long'),
          onClick: () => store.apply([{ story: 'earth.call' }]),
        },
      ],
    },
    () => 'Communications station',
  );

  // --- Pilot seat & flight console
  const seat = hotspot(0, 0.9, -32.2, 0.9, 1.4, 0.9);
  const pilotPanel = new ConsolePanel(game, mount(0, 1.25, -34.3, 0, -0.45), {
    title: 'Flight deck',
    width: 2.2,
    height: 0.8,
    tick: 0.25,
    viewDistance: 1.25,
    screen: {
      x: 0, y: 0.12, w: 1.9, h: 0.48, px: [900, 228],
      draw: (ctx, w, h) => {
        ScreenUI.bg(ctx, w, h, '#050b10');
        ScreenUI.title(ctx, 'Flight readiness');
        const items: [string, boolean][] = [
          ['Reactor', online('power.reactor')],
          ['Life support', online('life.support')],
          ['Navigation', online('nav.core')],
          ['Deep-space comms', online('comms.long')],
          ['Main drive', online('prop.main')],
          [`Propellant ≥ ${LAUNCH_PROPELLANT} kg (${Math.round(st().ship.propellant)})`, st().ship.propellant >= LAUNCH_PROPELLANT],
          ['Hull sealed', step('prop.main', 'hull')],
        ];
        if (!crashed()) {
          ScreenUI.text(ctx, 'Coast phase · autopilot engaged · Harbor Station approach in progress', 18, 80);
          return;
        }
        items.forEach(([label, ok], i) => ScreenUI.status(ctx, 18 + (i % 2) * 440, 76 + Math.floor(i / 2) * 32, label, ok ? 'ok' : 'fault'));
        const ready = items.every(([, ok]) => ok);
        ScreenUI.text(ctx, st().flags.launched ? flightStatus() : ready ? (store.check({ questActive: 'mq.ascent' }) ? 'ALL SYSTEMS GO — LAUNCH AVAILABLE' : 'Ready. Gather the crew on the bridge.') : 'Launch inhibited', 18, h - 18, ready ? '#3ee08f' : '#ff7b7b', 16);
      },
    },
    controls: [
      {
        id: 'launch', kind: 'key', x: 0.8, y: -0.28, color: '#ff5a5a',
        label: () => {
          if (!st().flags.launched) return 'LAUNCH';
          const p = st().ship.parking;
          if (p.kind === 'surface') return `TAKE OFF — climb to orbit (${ascentCost()} kg)`;
          if (p.kind === 'docked') return 'Take the helm — undock';
          return 'Take the helm';
        },
        enabled: () => {
          if (st().flags.launched) return st().ship.parking.kind !== 'surface' || st().ship.propellant >= ascentCost();
          return crashed() && store.check({ questActive: 'mq.ascent' }) && !!st().flags['ascent.crewReady'] && launchReady();
        },
        onClick: () => {
          game.closePanel();
          if (st().flags.launched) store.apply([{ story: 'helm' }]);
          else store.apply([{ story: 'launch' }]);
        },
      },
      {
        id: 'status', kind: 'button', x: -0.8, y: -0.28, color: '#4fd1ff',
        label: () => 'Ship systems overview',
        onClick: () => {
          game.closePanel();
          game.openOverlay('shipstatus', 'ship');
        },
      },
    ],
  });
  panels.push(pilotPanel);
  const launchReady = () =>
    online('power.reactor') && online('life.support') && online('nav.core') && online('comms.long') && online('prop.main') && st().ship.propellant >= LAUNCH_PROPELLANT;
  simple('pilot.seat', seat, () => (crashed() ? 'Sit in the pilot’s seat' : 'Kit’s seat'), () => game.openPanel(pilotPanel), {
    available: () => crashed(),
    kind: 'seat',
  });

  // --- Commander's holo table: the star map
  const tableRoot = new THREE.Group();
  tableRoot.position.set(0, 0.98, -28.4);
  loc.frame.add(tableRoot);
  disposables.push(tableRoot);
  const starMap = new StarMapPanel(game, tableRoot);
  const holoPowered = () => online('power.reactor') || !crashed();
  simple('holo.table', hotspot(0, 1.2, -28.4, 1.8, 0.6, 1.8), () => (holoPowered() ? 'Holographic star map' : 'Holo table (no reactor power)'), () => {
    if (!holoPowered()) {
      game.audio.play('error');
      pushNotification('The holo projector needs reactor power.', 'warn');
      return;
    }
    game.openPanel(starMap);
  }, { kind: 'panel', range: 2.4, detail: () => (holoPowered() ? 'Plot interplanetary courses' : null) });

  /* ================================ HABITATION ================================= */

  // Fabricator (workshop)
  simple('fabricator', hotspot(6.4, 1.2, -1, 0.6, 1.4, 3), () => 'Use fabricator', () => {
    if (lowPower()) {
      game.audio.play('error');
      pushNotification('The fabricator needs ship power', 'warn');
      return;
    }
    game.openOverlay('craft', 'fabricator');
  }, { detail: () => (lowPower() ? 'No power' : 'Sintering, machining and circuit printing') });

  // Ship cargo lockers (storage room + cargo hold)
  simple('storage.lockers', hotspot(6.9, 1.2, 9, 0.8, 2.2, 8), () => 'Open ship storage lockers', () => game.openOverlay('container', 'ship.cargo'));
  simple('cargo.lockers', hotspot(13.8, D3 + 1.1, 45.8, 0.8, 2.2, 5.4), () => 'Open cargo lockers', () => game.openOverlay('container', 'ship.cargo'));

  // Emergency supply crate
  const crate = hotspot(9.5, D3 + 0.6, 30, 1.6, 1.2, 1.2);
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: '#c9d0d6', roughness: 0.6, metalness: 0.3 }));
    body.position.set(9.5, D3 + 0.55, 30);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.18, 1.22), new THREE.MeshStandardMaterial({ color: '#c0392b', emissive: '#ff3b30', emissiveIntensity: 0.25 }));
    band.position.set(9.5, D3 + 0.8, 30);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.08, 1.24), new THREE.MeshStandardMaterial({ color: '#8e979f', metalness: 0.6, roughness: 0.4 }));
    lid.position.set(9.5, D3 + 1.14, 30);
    loc.frame.add(body, band, lid);
    disposables.push(body, band, lid);
  }
  simple('emergency.crate', crate, () => 'Open emergency supply crate', () => {
    store.grant('crate.emergency', [
      { setEntity: { location: loc.id, entity: 'emergency.crate', key: 'opened', value: true } },
      { give: 'fuelcell', qty: 1 },
      { give: 'scrubber', qty: 2 },
      { give: 'sealant', qty: 2 },
      { give: 'medpatch', qty: 2 },
      { give: 'o2canister', qty: 1 },
    ]);
    game.audio.play('door', 0.6);
  }, { available: () => crashed() && !ent('emergency.crate', 'opened'), detail: () => 'Stencilled: EMERGENCY — POWER / LIFE SUPPORT / MEDICAL' });

  // Suit lockers: refill + recovery point
  simple('suit.locker', hotspot(7.2, 1.2, -15, 0.7, 2.2, 2.6), () => 'Suit locker — recharge suit', () => {
    const p = st().player;
    // The suit room's high-pressure O₂ bottles need no power; recharging suit batteries does.
    p.oxygen = p.oxygenMax;
    if (!lowPower()) p.suitPower = p.suitPowerMax;
    else pushNotification('Oxygen topped up from the emergency bottles. Suit batteries need ship power to recharge.', 'info');
    p.respawn = { locationId: loc.id, spawnId: 'medbay' };
    store.markChanged('suit');
    game.audio.play('airlock', 0.4);
    pushNotification('Suit recharged. Recovery point: Lantern medbay.', 'info');
  });

  // Medbay: treat Kit / heal
  simple('medbay.station', hotspot(-7.5, 1.1, 3, 0.5, 1.4, 1.2, true, '#ff6b6b'), () => (st().flags['kit.treated'] || !crashed() ? 'Use medical station' : 'Treat Kit’s injuries'), () => {
    if (crashed() && !st().flags['kit.treated']) {
      if (!store.take('medpatch', 1)) {
        pushNotification('You need a Med Patch to treat Kit', 'warn');
        game.audio.play('error');
        return;
      }
      store.batch('treat', () => {
        store.setFlag('kit.treated', true);
        store.apply([{ relationship: { npc: 'arakawa', delta: 15 } }]);
      });
      pushNotification('Kit’s fractured ribs strapped and dosed. “Thanks, {p}. I owe you a landing.”'.replace('{p}', st().player.name.split(' ')[0]), 'info');
      return;
    }
    if (lowPower()) return pushNotification('Medical station unpowered', 'warn');
    st().player.health = 100;
    store.markChanged('heal');
    game.audio.play('confirm');
    pushNotification('Treated. Health restored.', 'info');
  });

  // Lab analyzer: the fragment
  simple('lab.analyzer', hotspot(-7.2, 1.35, 8.2, 1, 0.8, 1.5), () => (crashed() ? 'Sample analyzer' : 'Sample analyzer — scan regolith core'), () => {
    if (!crashed()) {
      store.setFlag('prologue.lab', true);
      game.audio.play('scanDone');
      pushNotification('Apollo 16 regolith core: anorthositic breccia. Imani grins at you through the glass.', 'info');
      return;
    }
    if (store.count('fragment') <= 0) return pushNotification('Nothing to analyze.', 'info');
    if (!online('power.reactor')) return pushNotification('The analyzer needs full ship power (reactor).', 'warn');
    if (st().flags['fragment.analyzed']) return pushNotification('Analysis complete: see Imani.', 'info');
    store.batch('analyze', () => {
      store.setFlag('fragment.analyzed', true);
      store.apply([{ story: 'fragment.analyzed' }]);
    });
  });

  // Commander's office door override + log terminal
  simple('office.lock', hotspot(1.3, 1.3, -22.4, 0.3, 0.4, 0.3, true, '#ff3030'), () => (st().flags['office.unlocked'] ? null : 'Commander’s office — locked'), () => {
    if (!online('power.reactor')) {
      pushNotification('Command-level lock. It will need full power and an override.', 'info');
      return;
    }
    store.setFlag('office.unlocked', true);
    game.audio.play('door');
  }, { available: () => crashed() && !st().flags['office.unlocked'], detail: () => (online('power.reactor') ? 'Override with engineering authority' : 'Needs reactor power') });
  simple('office.terminal', hotspot(5.4, 1.0, -22.6, 1.6, 0.6, 0.8), () => 'Commander Okonkwo’s terminal', () => {
    store.batch('office', () => {
      store.setFlag('office.log.read', true);
      store.discover('lore.okonkwo.log');
    });
    game.audio.stinger('somber');
    pushNotification('Personal log, A. Okonkwo: “Mission Directorate insists the crew is not to be told the Cadence repeats with a period of exactly 1,969 seconds. They say it’s a coincidence. I stopped believing in coincidences at Syrtis.”', 'discovery');
  }, { available: () => !!st().flags['office.unlocked'] });

  // Drive injectors (crawlway)
  simple('drive.injectors', hotspot(-1.4, D3 + 1.3, 54.6, 0.6, 1, 5), () => 'Install drive injector assemblies', () => game.repairStep('prop.main', 'injectors', null), {
    available: () => crashed() && !step('prop.main', 'injectors'),
    detail: () => `Needs 3 Drive Injector Assemblies (${store.count('injector')}/3)`,
  });

  /* ================================== ACT 0 =================================== */

  // Common room window: look back at Earth
  const view = hotspot(-7.6, 1.6, -9, 0.4, 1.8, 6.8);
  simple('common.window', view, () => 'Look out at Earth', () => {
    store.setFlag('prologue.earthview', true);
    game.audio.stinger('wonder');
    const from = loc.shipToWorld(new THREE.Vector3(-5.5, 1.65, -9));
    const to = loc.shipToWorld(new THREE.Vector3(-40, 0, 12));
    game.cam.setOverride({ position: from, target: to, fov: 45 }, 2);
    ui_hint('Earth — 250,000 km behind us and shrinking.');
    setTimeout(() => game.cam.setOverride(null), 5000);
  }, { available: () => !crashed() });

  // Bridge jump seats: strap in for approach (triggers the catastrophe)
  const jump = hotspot(-3.75, 0.9, -24.6, 2.2, 1.2, 0.8);
  simple('jump.seat', jump, () => 'Strap into a jump seat for approach', () => {
    const p = loc.shipToWorld(new THREE.Vector3(-3.75, 0, -25.2));
    game.player.teleport(p, 0);
    store.setFlag('prologue.seated', true);
  }, { available: () => !crashed() && !!store.check({ quest: 'mq.prologue', stage: 'approach' }) && !st().flags['prologue.seated'], kind: 'seat' });

  /* ================================== EXITS =================================== */

  const exit = (which: 'ramp' | 'airlock') => {
    const target = loc.exitTarget(which);
    if (!target) {
      pushNotification(st().flags.launched ? 'Outer doors are sealed while in flight.' : 'We’re in space. The doors stay shut.', 'warn');
      game.audio.play('error');
      return;
    }
    game.audio.play('airlock');
    void game.locations.travel({ location: target.location, spawn: target.spawn }, { label: which === 'airlock' ? 'Cycling airlock…' : 'Lowering the cargo ramp…' });
  };
  simple('airlock.outer', hotspot(11.3, 1.2, -9, 0.3, 2.3, 1.5, true, '#4fd1ff'), () => 'Cycle airlock — go outside', () => exit('airlock'), { kind: 'door', available: () => crashed() });
  {
    // Ramp door: heavy hatch with amber edge lights
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.8, 6.8), new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.5, metalness: 0.6 }));
    door.position.set(15.3, D3 + 2.45, 33);
    loc.frame.add(door);
    disposables.push(door);
    for (const dz of [-3.3, 3.3]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.6, 0.1), new THREE.MeshStandardMaterial({ color: '#332200', emissive: '#ffb347', emissiveIntensity: 1.2 }));
      strip.position.set(15.28, D3 + 2.45, 33 + dz);
      loc.frame.add(strip);
      disposables.push(strip);
    }
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 6.4), new THREE.MeshStandardMaterial({ color: '#2d3137', metalness: 0.5 }));
      rib.position.set(15.2, D3 + 0.5 + i * 0.8, 33);
      loc.frame.add(rib);
      disposables.push(rib);
    }
  }
  simple('cargo.ramp', hotspot(15.0, D3 + 2.5, 33, 0.5, 4.6, 6.8), () => 'Cargo ramp — go outside', () => exit('ramp'), { kind: 'door', available: () => crashed(), range: 3.5 });

  return {
    refresh() {
      const powered = online('power.batteries') || !crashed();
      for (const p of panels) {
        p.setScreenPowered(p === panels[0] ? true : powered);
        p.refresh();
      }
      starMap.setPowered(holoPowered());
      starMap.refresh();
    },
    update(dt: number) {
      sweep += dt * 1.6;
      if (game.panel !== starMap) starMap.update(dt);
    },
    dispose() {
      starMap.dispose();
      for (const p of panels) p.dispose();
      for (const d of disposables) disposeObject(d);
    },
  };
}
