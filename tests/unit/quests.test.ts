import { describe, it, expect } from 'vitest';
import { makeStore } from '../helpers';

describe('state-derived quests', () => {
  it('prologue starts on act0 and advances as flags are set', () => {
    const { store } = makeStore();
    store.setFlag('act0', true);
    expect(store.state.quests['mq.prologue']?.stage).toBe('cmdr');
    store.setFlag('prologue.cmdr', true);
    expect(store.state.quests['mq.prologue'].stage).toBe('rounds');
    store.setFlag('prologue.diag', true);
    store.setFlag('prologue.lab', true);
    expect(store.state.quests['mq.prologue'].stage).toBe('rounds');
    store.setFlag('prologue.petra', true); // optional earth view not required
    expect(store.state.quests['mq.prologue'].stage).toBe('approach');
  });

  it('Act 1 chain gates correctly and completes from world state', () => {
    const { store } = makeStore();
    store.setFlag('crashed', true);
    expect(store.state.quests['mq.aftermath']?.status).toBe('active');
    store.setFlag('met.castellanos', true);
    expect(store.state.quests['mq.aftermath'].stage).toBe('power');
    // Satisfy the world state directly (as the repair panels would).
    store.apply([
      { repairStep: { system: 'power.batteries', step: 'fuelcell' } },
      { repairStep: { system: 'power.batteries', step: 'breakers' } },
      { systemOnline: { system: 'power.batteries', online: true } },
    ]);
    expect(store.state.quests['mq.aftermath'].status).toBe('completed');
    expect(store.state.quests['mq.air']?.status).toBe('active');
    expect(store.state.quests['mq.ice']).toBeUndefined(); // gated behind mq.air
    // Rewards granted exactly once.
    const rel = store.state.npcs.castellanos.relationship;
    store.markChanged('noop');
    expect(store.state.npcs.castellanos.relationship).toBe(rel);
  });

  it('a stage whose objectives are already satisfied completes immediately (no stuck quests)', () => {
    const { store } = makeStore();
    // Player already has everything before the quest starts
    store.apply([
      { repairStep: { system: 'power.batteries', step: 'fuelcell' } },
      { repairStep: { system: 'power.batteries', step: 'breakers' } },
      { systemOnline: { system: 'power.batteries', online: true } },
      { setFlag: 'met.castellanos' },
    ]);
    store.setFlag('crashed', true);
    expect(store.state.quests['mq.aftermath'].status).toBe('completed');
  });
});
