import type { BaseModuleDef } from './types';

export const BASE_MODULES: BaseModuleDef[] = [
  {
    id: 'shelter', name: 'Inflatable Habitat', powerKW: 1.5, storageSlots: 30,
    description: 'Pressurized shelter with bunks and a suit dock. The base’s heart.',
    cost: [{ item: 'frame', qty: 2 }, { item: 'sealant', qty: 2 }],
  },
  {
    id: 'solar', name: 'Solar Array', powerKW: -8,
    description: 'Vertical tracking panels on the ridge line. Output follows the low polar sun.',
    cost: [{ item: 'solarcell', qty: 2 }, { item: 'frame', qty: 1 }, { item: 'conduit', qty: 1 }],
  },
  {
    id: 'battery', name: 'Battery Bank', powerKW: 0,
    description: 'Stores 60 kWh for the long lunar night.',
    cost: [{ item: 'powercell', qty: 2 }, { item: 'conduit', qty: 1 }],
  },
  {
    id: 'workbench', name: 'Workbench', powerKW: 1, facility: 'workbench',
    description: 'Tools, a small sinter press and a welding rig.',
    cost: [{ item: 'frame', qty: 2 }, { item: 'conduit', qty: 1 }],
  },
  {
    id: 'iceproc', name: 'Ice Processor', powerKW: 4,
    description: 'Melts, filters and electrolyses ice into oxygen and hydrolox propellant.',
    cost: [{ item: 'frame', qty: 2 }, { item: 'conduit', qty: 2 }, { item: 'circuit', qty: 1 }],
  },
  {
    id: 'greenhouse', name: 'Greenhouse', powerKW: 3,
    description: 'Hydroponic racks under LED light. Food, oxygen and something green to look at.',
    cost: [{ item: 'frame', qty: 3 }, { item: 'sealant', qty: 2 }, { item: 'solarcell', qty: 1 }],
    requires: { module: 'shelter' },
  },
  {
    id: 'storage', name: 'Storage Depot', powerKW: 0, storageSlots: 40,
    description: 'Shielded lockers for bulk materials.',
    cost: [{ item: 'frame', qty: 2 }, { item: 'scrap', qty: 4 }],
  },
  {
    id: 'lab', name: 'Field Lab', powerKW: 2, facility: 'lab',
    description: 'Microscope, spectrometer and a sample glovebox. Research unknown materials.',
    cost: [{ item: 'frame', qty: 2 }, { item: 'circuit', qty: 2 }, { item: 'electronics', qty: 2 }],
  },
];

/** kWh capacity per built battery module */
export const BATTERY_KWH = 60;
