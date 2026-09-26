import { describe, it, expect } from 'vitest';
import { makeStore } from '../helpers';
import { BaseSystem, PROPELLANT_PER_ICE, ICE_PROCESS_TIME } from '../../src/gameplay/base';

describe('base system', () => {
  it('builds atomically and only once per pad', () => {
    const { store } = makeStore();
    const base = new BaseSystem(store);
    expect(base.build('pad.a', 'shelter')).toBe(false);
    store.give('frame', 4);
    store.give('sealant', 4);
    expect(base.build('pad.a', 'shelter')).toBe(true);
    expect(base.build('pad.a', 'storage')).toBe(false);
    expect(store.count('frame')).toBe(2);
    expect(store.check({ module: 'shelter' })).toBe(true);
  });

  it('batteries carry the base through the night', () => {
    const { store } = makeStore();
    const base = new BaseSystem(store);
    store.state.base.pads['pad.a'] = { moduleId: 'solar', built: true };
    store.state.base.pads['pad.b'] = { moduleId: 'battery', built: true };
    store.state.base.pads['pad.c'] = { moduleId: 'workbench', built: true };
    for (let i = 0; i < 600; i++) base.update(1, 1); // day: charge
    expect(store.state.base.batteryKWh).toBeGreaterThan(0);
    base.update(1, 0); // night
    expect(base.report.powered).toBe(true);
  });

  it('ice processor converts hopper ice into propellant when powered', () => {
    const { store } = makeStore();
    const base = new BaseSystem(store);
    store.state.base.pads['pad.a'] = { moduleId: 'solar', built: true };
    store.state.base.pads['pad.b'] = { moduleId: 'solar', built: true };
    store.state.base.pads['pad.c'] = { moduleId: 'iceproc', built: true };
    store.give('ice', 5);
    expect(base.loadIce()).toBe(5);
    for (let i = 0; i < 5; i++) base.update(ICE_PROCESS_TIME, 1);
    expect(store.state.ship.propellant).toBe(5 * PROPELLANT_PER_ICE);
    expect(store.state.flags['iceproc.hopper']).toBe(0);
  });
});
