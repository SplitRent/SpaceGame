import * as THREE from 'three';
import type { Game } from '../Game';
import { CinematicPlayer, type Shot } from '../cinematics/Cinematic';
import { ui, pushNotification } from '../ui/uiState';
import { ZONES, zoneForStation, zoneForSurface } from '../content/zones';
import { ASCENT_COST, propellantCapacity } from '../content/shipSystems';

/**
 * Story beats raised by content effects ({ story: id }) or by systems coming online.
 * Handlers present the moment (subtitles, music, camera) and apply state changes in
 * idempotent ways, so replaying or skipping never duplicates anything.
 */
export function registerStoryEvents(game: Game): void {
  const story = game.story;
  const store = game.store;

  /** Queue lines of dialogue as subtitles (radio-filtered when in vacuum). */
  const say = (lines: [string, string, number?][]) => {
    let delay = 0;
    for (const [speaker, text, given = 4.2] of lines) {
      const dur = Math.max(given, game.voices.duration(speaker, text) + 0.3);
      setTimeout(() => {
        const vac = game.currentLocation?.env.atmosphere === 'vacuum' || !game.currentLocation?.isPressurized(game.player.head());
        if (vac) game.audio.play('radio', 0.5);
        ui.subtitle.value = { speaker, text };
      }, delay * 1000);
      delay += dur;
    }
    setTimeout(() => (ui.subtitle.value = null), delay * 1000);
  };
  (story as any).say = say;

  /* ------------------------------ Act 0 → crash ------------------------------ */
  story.on('catastrophe', async () => {
    const loc = game.currentLocation as any;
    if (!loc || loc.id !== 'lantern.interior') return;
    const player = new CinematicPlayer(game);
    const w = (x: number, y: number, z: number) => loc.shipToWorld(new THREE.Vector3(x, y, z));
    const shots: Shot[] = [
      { duration: 4, from: { pos: w(-2.5, 1.7, -25.5), target: w(0, 1.8, -40), fov: 55 }, to: { pos: w(-1.5, 1.7, -27), target: w(0, 1.9, -40), fov: 55 }, subtitle: { speaker: 'Arakawa', text: 'Harbor, Lantern. On final. Beautiful morning up here.' } },
      {
        duration: 4, from: { pos: w(0, 1.8, -30), target: w(0, 2.2, -45), fov: 50 },
        onStart: () => loc.spawnBlackglass?.(),
        subtitle: { speaker: 'Haddad', text: 'Contact, bearing zero-one-zero… no. That’s not a contact. That’s a hole.' },
      },
      {
        duration: 3, from: { pos: w(0, 1.8, -30), target: w(0, 2.2, -45), fov: 58 },
        onStart: () => {
          game.audio.play('alarm');
          game.audio.play('explosion');
          game.cam.addShake(1.3);
          loc.setCatastropheVisual?.(true);
          ui.fadeColor.value = '#e8f0ff';
          void game.fadeTo(0.85, 0.08).then(() => game.fadeTo(0, 0.6));
        },
        subtitle: { speaker: 'Okonkwo', text: 'BRACE! Everyone, brace!' },
      },
      {
        duration: 3, from: { pos: w(0.5, 1.4, -26), target: w(-3, 1.2, -32), fov: 62 },
        onStart: () => { game.cam.addShake(1.5); game.audio.play('powerDown'); },
        onUpdate: (k) => { if (k > 0.5) { ui.fadeColor.value = '#000'; void game.fadeTo(1, 0.8); } },
        subtitle: { speaker: 'Castellanos', text: 'We’ve lost everything — power, attitude, everything!' },
      },
    ];
    await player.play(shots, {
      skippable: true,
      onEnd: async () => {
        store.setFlag('cine.mode', 'crash');
        ui.fadeColor.value = '#000';
        await game.locations.travel({ location: 'cinematic.opening' }, { label: '', holdBlack: true, fadeTime: 0.3 });
      },
    });
  });

  /* ------------------------------ Act 1 beats ------------------------------ */
  story.on('batteries.online', () => {
    game.audio.stinger('quest');
    say([
      ['Castellanos', 'Lights! Oh, I could kiss this ship.'],
      ['Haddad', 'Consoles are waking up. Harbor still isn’t answering.'],
      ['Castellanos', 'One thing at a time. Next: air.'],
    ]);
  });
  story.on('repressurized', () => {
    game.audio.stinger('wonder');
    store.state.meta.chapter = 'Act 1 — Stranded';
    say([
      ['Novak', 'Pressure is holding. One hundred and one kilopascals. Helmets off, everyone.'],
      ['Arakawa', 'Oh, that’s — that smells terrible. That smells wonderful.'],
      ['Novak', 'Breathe. Go on. All of you.'],
    ]);
    void game.autosave('Air restored');
  });
  story.on('reactor.online', () => {
    game.audio.stinger('launch');
    game.cam.addShake(0.4);
    say([
      ['Castellanos', 'Core is critical — the good kind of critical. Sixty kilowatts and climbing.'],
      ['Sola', 'Every light on the ship just came on. Every one.'],
      ['Castellanos', 'She’s alive. Now we can start thinking about the sky.'],
    ]);
    void game.autosave('Reactor online');
  });
  story.on('comms.short.online', () => {
    say([
      ['Haddad', 'Short range is up. Suits can talk to the ship again.'],
      ['Haddad', 'Harbor… nothing. Earth… below the horizon. We need a higher place to shout from.'],
    ]);
  });
  story.on('fragment.analyzed', () => {
    game.audio.stinger('danger');
    say([['Sola', 'Come to the lab. Now. Please — I need someone to tell me I’m reading this wrong.']]);
  });
  story.on('earth.call', () => {
    if (store.state.flags['earth.called']) {
      say([['Earth Control', 'Lantern, we hear you. Hold on. We’re working on it.']]);
      return;
    }
    game.audio.stinger('wonder');
    say([
      ['You', 'Earth Control, this is the EXV Lantern. Do you read?', 4],
      ['', '…', 2.5],
      ['Earth Control', 'Lantern — Lantern, we read you! We read you! Stand by… stand by…', 5],
      ['Earth Control', 'We lost Harbor Station at the same second we lost you. Two relay satellites went dark with it.', 5.5],
      ['Earth Control', 'Status of your crew?', 3],
      ['You', 'Five of six. The commander is missing. We’re on the far side, south pole. We’re repairing the ship.', 5.5],
      ['Earth Control', 'Copy five of six. …Lantern, the nearest rescue vehicle is months out. Whatever you’re doing — keep doing it.', 6],
      ['Earth Control', 'And Lantern? Harbor’s beacon came back on four hours ago. Automatic. Nobody here triggered it.', 6],
    ]);
    store.batch('earthcall', () => {
      store.setFlag('earth.called', true);
      store.discover('earth.contact');
    });
    void game.autosave('Earth contact');
  });
  story.on('ship.level', async () => {
    game.cam.addShake(1.0);
    game.audio.play('powerUp');
    game.audio.play('impact', 0.5);
    say([['Castellanos', 'Port struts extending… she’s coming up… hold on… LEVEL. Floor is a floor again.']]);
    store.state.ship.listDeg = 0;
    store.markChanged('level');
    const loc = game.currentLocation;
    if (loc?.id === 'lantern.interior') {
      await game.locations.travel({ location: 'lantern.interior', spawn: 'engineering' }, { label: 'The Lantern groans as she settles level…', fadeTime: 0.6 });
    }
  });

  /* --------------------------------- Launch --------------------------------- */
  story.on('launch', async () => {
    if (store.state.flags.launched) return;
    game.audio.play('powerUp');
    game.cam.addShake(0.5);
    say([
      ['Arakawa', 'Pre-launch complete. All stations report.'],
      ['Castellanos', 'Engineering go.'],
      ['Sola', 'Science go. Bring us home. Well — up.'],
      ['Novak', 'Medical go. Everyone’s strapped in, even Kit.'],
      ['Haddad', 'Comms go. Earth is listening.'],
    ]);
    await new Promise((r) => setTimeout(r, 9000));
    store.setFlag('cine.mode', 'launch');
    await game.locations.travel({ location: 'cinematic.opening' }, { label: '', holdBlack: true, fadeTime: 0.8 });
  });
  /** Take the helm: where that leads depends on where the ship is. */
  story.on('helm', async () => {
    const p = store.state.ship.parking;
    if (p.kind === 'transit') {
      await game.locations.travel({ location: 'space.transit', spawn: 'helm' }, { label: 'Taking the helm…', fadeTime: 0.4 });
    } else if (p.kind === 'space') {
      await game.locations.travel({ location: p.locationId, spawn: 'helm' }, { label: 'Taking the helm…', fadeTime: 0.4 });
    } else if (p.kind === 'docked') {
      const z = zoneForStation(p.locationId);
      if (z) await game.locations.travel({ location: z.id, spawn: 'undock' }, { label: 'Releasing docking clamps…', fadeTime: 0.4 });
    } else {
      // Take-off from a surface: a real propellant cost for climbing out of the gravity well.
      const z = zoneForSurface(p.locationId);
      const cost = ASCENT_COST[z?.body ?? 'moon'] ?? 200;
      if (!z) return;
      if (store.state.ship.propellant < cost) {
        pushNotification(`Take-off needs ${cost} kg of propellant (${Math.round(store.state.ship.propellant)} kg aboard).`, 'warn');
        game.audio.play('error');
        return;
      }
      store.setPropellant(store.state.ship.propellant - cost);
      game.audio.play('powerUp');
      game.cam.addShake(0.6);
      await game.locations.travel({ location: z.id, spawn: 'ascent' }, { label: `Main engine start… lift-off. Climbing to orbit (−${cost} kg).`, fadeTime: 0.8 });
    }
  });

  /* ---------------------------- Acts 2–5 beats ---------------------------- */
  story.on('refuel.full', () => {
    const p = store.state.ship.parking;
    if (p.kind !== 'surface' && p.kind !== 'docked') {
      pushNotification('The Lantern isn’t connected here.', 'warn');
      return;
    }
    const cap = propellantCapacity(store.state);
    if (store.state.ship.propellant >= cap - 1) {
      pushNotification('The Lantern’s tanks are already full.', 'info');
      return;
    }
    store.setPropellant(cap);
    game.audio.play('confirm');
    pushNotification(`Tanks full: ${cap} kg.`, 'info');
  });
  story.on('fusion.online', () => {
    say([
      ['Castellanos', 'Confinement stable. Oh, listen to her. That’s not a drive, that’s a choir.'],
      ['Arakawa', 'Jupiter in weeks. I’m going to need a bigger star chart.'],
      ['Haddad', 'The Cadence changed pitch the second we lit the torch. It knows.'],
    ]);
  });
  const jump = async (to: string, label: string) => {
    const z = ZONES[to];
    const pos = new THREE.Vector3(...z.arrival.pos);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, new THREE.Vector3(...z.arrival.look), new THREE.Vector3(0, 1, 0)));
    store.batch('gate', () => {
      store.state.ship.parking = { kind: 'space', locationId: to, position: [pos.x, pos.y, pos.z], quat: [q.x, q.y, q.z, q.w] };
      store.markChanged('gate');
    });
    game.audio.stinger('wonder');
    ui.fadeColor.value = '#e8e0ff';
    await game.locations.travel({ location: to, spawn: 'arrival' }, { label, fadeTime: 1.4 });
    ui.fadeColor.value = '#000';
  };
  story.on('gate.open', async () => {
    say([
      ['Okonkwo', 'Everyone to your stations. It’s opening.'],
      ['Arakawa', 'I have no idea how to fly this.'],
      ['Okonkwo', 'You don’t. It flies us.'],
    ]);
    await new Promise((r) => setTimeout(r, 6000));
    await jump('space.vesper', 'The Door opens. The Lantern falls through a corridor of light…');
    say([
      ['Sola', 'That’s… that’s not our Sun. That star is orange.'],
      ['Haddad', 'Navigation says we are forty-one light-years from Earth. Navigation is very upset.'],
      ['Okonkwo', 'Welcome to Vesper. There’s a world below us. It’s alive.'],
    ]);
  });
  story.on('gate.return', async () => {
    await jump('space.threshold', 'The Far Gate opens. Home is on the other side…');
    say([['Arakawa', 'Threshold. Pluto’s that way. And behind that, everything.']]);
  });
  for (const id of ['open', 'close', 'beyond']) {
    story.on(`ending.${id}`, () => {
      setTimeout(() => game.playEnding(id), 1500);
    });
  }

  /* -------------------------------- Transit -------------------------------- */
  story.on('transit.depart', () => {
    const p = store.state.ship.parking;
    if (p.kind !== 'transit') return;
    if (p.to === 'space.mars' && !store.state.flags['said.depart.mars']) {
      store.setFlag('said.depart.mars', true);
      say([
        ['Arakawa', 'Burn complete. Trans-Mars injection nominal. We are officially the farthest crewed ship from Earth.'],
        ['Castellanos', 'Seven months of coasting, squeezed into a nap. Somebody check the coffee supply.'],
        ['Haddad', 'Melas, Lantern. We’re coming. Hold on.'],
      ]);
    } else say([['Arakawa', 'Burn complete. Coasting.']]);
    pushNotification(`Course plotted: ${ZONES[p.to]?.name ?? p.to}. Take the helm, or walk the ship while we coast.`, 'info');
  });
  /** Mid-cruise encounters: one per route, each a small moment with a database entry. */
  const TRANSIT_EVENTS: Record<string, { lines: [string, string][]; note: string; db: string; shake?: number; flash?: string; hull?: number }> = {
    'space.mars': {
      lines: [['Novak', 'Solar particle event! Everyone behind the water tanks on Deck 3 — now, please.'], ['Castellanos', 'Water’s the best shield we’ve got. Ten minutes and it’s over.'], ['Novak', '…Dose within limits. Everybody drink water. I mean it.']],
      note: 'Solar particle event: the crew sheltered behind the water tanks. Dose within limits.', db: 'db.spe', shake: 0.25, flash: '#fff4d0',
    },
    'space.cislunar': {
      lines: [['Sola', 'Halfway. Earth and the Moon are two stars now — one blue, one grey — getting closer.']],
      note: 'Earth and the Moon: a double star, growing.', db: 'db.earthmoon',
    },
    'space.ceres': {
      lines: [['Arakawa', 'Proximity alert — asteroid, three hundred metres across, passing at four kilometres. It’s just… going by.'], ['Sola', 'Scanning! Oh — it’s a rubble pile. A flying heap of gravel held together by almost nothing.']],
      note: 'Close pass: rubble-pile asteroid 2031 QX, 4 km. Scanned.', db: 'db.flyby', shake: 0.1,
    },
    'space.jupiter': {
      lines: [['Haddad', 'Comms are full of static. Jupiter’s magnetosphere — we’re inside it already, twenty million kilometres out.'], ['Sola', 'Look at the hull cameras. The ship is glowing. It’s an aurora — on us.']],
      note: 'Inside Jupiter’s magnetosphere: an aurora plays over the hull.', db: 'db.aurora', flash: '#9ab8ff',
    },
    'space.saturn': {
      lines: [['Arakawa', 'Crossing the ring plane. The rings are ten metres thick in places, and we are going through the gap. Hold on to something.'], ['Castellanos', 'Ice pinging off the hull. Little ones. …Mostly little ones.']],
      note: 'Ring-plane crossing: minor ice impacts on the hull.', db: 'db.rings', shake: 0.5, hull: 0.01,
    },
    'space.pluto': {
      lines: [['Haddad', 'Contact, twenty million kilometres off the bow. It’s… New Horizons. Silent since the 2040s, still flying outward.'], ['Okonkwo', 'Dip the lights. It came all this way first.']],
      note: 'Passed New Horizons, drifting silent toward the stars.', db: 'db.newhorizons',
    },
    'space.threshold': {
      lines: [['Haddad', 'The Cadence is loud now. The hull is humming with it. Every 1,969 seconds, everything on the ship rings.'], ['Okonkwo', 'It knows we’re coming. It has always known.']],
      note: 'The Cadence rings through the hull.', db: 'db.cadence', shake: 0.3, flash: '#b8a8ff',
    },
    'space.venus': {
      lines: [['Castellanos', 'Sun’s twice as bright out here. Tiles are holding at four hundred degrees on the sunward side.']],
      note: 'Thermal shield holding under double sunlight.', db: 'db.innersun', flash: '#fff8e0',
    },
    'space.mercury': {
      lines: [['Arakawa', 'The Sun is three times wider than at home. I’ve got the ship turned so the tiles take it. Don’t look out of the starboard windows.']],
      note: 'Sunward attitude: the thermal shield takes seven times Earth’s sunlight.', db: 'db.innersun', flash: '#fff8e0',
    },
    'space.earth': {
      lines: [['Novak', 'There she is.'], ['Haddad', 'Earth Control is on the line. They’re… cheering. The whole room.']],
      note: 'Earth, growing ahead.', db: 'db.earth',
    },
  };
  story.on('transit.half', () => {
    const p = store.state.ship.parking;
    if (p.kind !== 'transit') return;
    const ev = TRANSIT_EVENTS[p.to];
    if (!ev) {
      say([['Arakawa', 'Halfway there.']]);
      return;
    }
    say(ev.lines);
    pushNotification(ev.note, 'discovery');
    if (ev.shake) game.cam.addShake(ev.shake);
    if (ev.hull) store.state.ship.hull = Math.max(0.3, store.state.ship.hull - ev.hull);
    if (ev.flash) {
      ui.fadeColor.value = ev.flash;
      void game.fadeTo(0.45, 0.12).then(() => game.fadeTo(0, 1.2)).then(() => (ui.fadeColor.value = '#000'));
    }
    const s = store.state;
    if (!s.database[ev.db] && store.content.database[ev.db]) {
      s.database[ev.db] = { at: s.clock };
      store.markChanged('transit.event');
      pushNotification(`Database: ${store.content.database[ev.db].title}`, 'discovery');
    }
  });
  story.on('transit.arrive', () => {
    const s = store.state;
    const p = s.ship.parking;
    if (p.kind === 'space' && p.locationId === 'space.mars' && !s.flags['said.arrive.mars']) {
      store.setFlag('said.arrive.mars', true);
      say([
        ['Arakawa', 'Orbit insertion complete. Mars, everyone.'],
        ['Sola', 'Valles Marineris. Four thousand kilometres of canyon. Melas Chasma is right in the middle of it.'],
        ['Haddad', 'Still nothing from Melas Station. Their beacon’s alive. Nobody’s answering it.'],
      ]);
    }
  });
}
