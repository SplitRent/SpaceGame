import { describe, it, expect } from 'vitest';
import { makeStore } from '../helpers';
import { TravelSystem } from '../../src/gameplay/travel';
import { PROPELLANT_CAPACITY } from '../../src/content/shipSystems';
import { STARMAP } from '../../src/content/starmap';
import { ZONES } from '../../src/content/zones';

function setup() {
  const { store } = makeStore();
  const travelled: { location: string; spawn?: string }[] = [];
  const game = {
    store,
    audio: { play() {}, stinger() {} },
    cam: { addShake() {} },
    currentLocation: null as { id: string } | null,
    locations: { travel: async (t: { location: string; spawn?: string }) => void travelled.push(t) },
  };
  const travel = new TravelSystem(game as never);
  const s = store.state;
  // Flight-ready ship in lunar orbit, after the vertical slice
  s.flags.crashed = true;
  s.flags.launched = true;
  s.flags['slice.complete'] = true;
  s.ship.systems['nav.core'].online = true;
  s.ship.systems['prop.main'].online = true;
  s.ship.propellant = 1600;
  s.ship.parking = { kind: 'space', locationId: 'space.cislunar', position: [0, 0, 0], quat: [0, 0, 0, 1] };
  return { store, travel, game, travelled };
}
const entry = (body: string) => STARMAP.find((e) => e.body === body)!;

describe('travel', () => {
  it('knows which body the ship is at, wherever it is parked', () => {
    const { store, travel } = setup();
    expect(travel.currentBody()).toBe('moon');
    store.state.ship.parking = { kind: 'docked', locationId: 'harbor.interior', portId: 'dock' };
    expect(travel.currentBody()).toBe('moon');
    store.state.ship.parking = { kind: 'surface', locationId: 'mars.melas' };
    expect(travel.currentBody()).toBe('mars');
  });

  it('explains every lock and circumstance', () => {
    const { store, travel } = setup();
    expect(travel.status(entry('earth'))).toMatchObject({ ok: false, locked: true });
    expect(travel.status(entry('earth')).reason).toMatch(/quarantine/i);
    expect(travel.status(entry('venus')).reason).toMatch(/thermal/i);
    expect(travel.status(entry('europa')).reason).toMatch(/drive/i);
    expect(travel.status(entry('jupiter')).reason).toMatch(/gas giant/i);
    expect(travel.status(entry('moon'))).toMatchObject({ ok: false, here: true });
    expect(travel.status(entry('mars')).ok).toBe(true);
    store.state.ship.parking = { kind: 'docked', locationId: 'harbor.interior', portId: 'dock' };
    expect(travel.status(entry('mars')).reason).toMatch(/Undock/);
    store.state.ship.parking = { kind: 'surface', locationId: 'moon.south' };
    expect(travel.status(entry('mars')).reason).toMatch(/Take off/);
    store.state.ship.parking = { kind: 'space', locationId: 'space.cislunar', position: [0, 0, 0], quat: [0, 0, 0, 1] };
    store.state.ship.propellant = 500;
    expect(travel.status(entry('mars')).reason).toMatch(/800 kg/);
    store.state.flags['slice.complete'] = false;
    expect(travel.status(entry('mars')).locked).toBe(true);
  });

  it('plots a course once, burns propellant, and arrives in the destination zone', () => {
    const { store, travel, travelled, game } = setup();
    expect(travel.plot('earth')).toBe(false);
    expect(travel.plot('mars')).toBe(true);
    expect(travel.plot('mars')).toBe(false); // already in transit
    expect(store.state.ship.propellant).toBe(800);
    expect(store.state.ship.parking).toMatchObject({ kind: 'transit', from: 'space.cislunar', to: 'space.mars', elapsed: 0 });
    expect(store.check({ flag: 'course.mars' })).toBe(true);
    // The clock runs while walking the ship (not at the helm): arrival parks in Mars orbit, no travel.
    game.currentLocation = { id: 'lantern.interior' };
    for (let i = 0; i < 100; i++) travel.update(1);
    const p = store.state.ship.parking;
    expect(p.kind).toBe('space');
    expect(p.locationId).toBe('space.mars');
    if (p.kind === 'space') expect(p.position).toEqual(ZONES['space.mars'].arrival.pos);
    expect(travelled).toHaveLength(0);
  });

  it('arriving at the helm travels to the destination zone', () => {
    const { travel, travelled, game } = setup();
    travel.plot('mars');
    game.currentLocation = { id: 'space.transit' };
    for (let i = 0; i < 100; i++) travel.update(1);
    expect(travelled).toEqual([expect.objectContaining({ location: 'space.mars', spawn: 'arrival' })]);
  });

  it('propellant is clamped to tank capacity and mirrored into its condition', () => {
    const { store } = setup();
    store.setPropellant(99999);
    expect(store.state.ship.propellant).toBe(PROPELLANT_CAPACITY);
    expect(store.check({ propellant: 1000 })).toBe(true);
    store.setPropellant(-5);
    expect(store.state.ship.propellant).toBe(0);
    expect(store.check({ propellant: 1 })).toBe(false);
  });
});
