import type { RoomDef } from '../../locations/lantern/interiorKit';
import type { InteriorDef } from '../worldTypes';

/**
 * Standard outpost layout: an airlock to the south (z 0..5), a commons (x −8..8,
 * z −14..0) with a big north window, a west wing and an east wing (z −12..−2).
 */
export function outpostRooms(): RoomDef[] {
  return [
    { id: 'lock', x0: -2, x1: 2, z0: 0, z1: 5, y: 0, h: 2.8, openings: [{ side: 'n', at: 0, width: 1.6 }] },
    {
      id: 'commons', x0: -8, x1: 8, z0: -14, z1: 0, y: 0, h: 3.4,
      openings: [
        { side: 's', at: 0, width: 1.6 },
        { side: 'w', at: -7, width: 1.8 },
        { side: 'e', at: -7, width: 1.8 },
        { side: 'n', at: 0, width: 10, bottom: 0.8, top: 2.8, window: true },
      ],
    },
    { id: 'west', x0: -16, x1: -8, z0: -12, z1: -2, y: 0, h: 3, openings: [{ side: 'e', at: -7, width: 1.8 }] },
    { id: 'east', x0: 8, x1: 16, z0: -12, z1: -2, y: 0, h: 3, openings: [{ side: 'w', at: -7, width: 1.8 }] },
  ];
}

export const OUTPOST_SPAWN = { id: 'lock', x: 0, z: 3, yaw: 0 };

/** Exit hatch in the standard airlock. */
export function outpostExit(to: string, spawn: string): InteriorDef['points'][number] {
  return { id: 'exit', x: 0, y: 1.15, z: 4.85, size: [1.6, 2.3, 0.2], prompt: 'Airlock — go outside', kind: 'door', travel: { location: to, spawn, label: 'Cycling the airlock…' } };
}

/** Builder hall: entry vestibule, a long nave, two side alcoves and the heart. */
export function builderRooms(): RoomDef[] {
  return [
    { id: 'entry', x0: -3, x1: 3, z0: 0, z1: 8, y: 0, h: 5, openings: [{ side: 'n', at: 0, width: 3 }], wall: 'wall', floor: 'floor' },
    {
      id: 'nave', x0: -14, x1: 14, z0: -40, z1: 0, y: 0, h: 14,
      openings: [
        { side: 's', at: 0, width: 3 },
        { side: 'n', at: 0, width: 5 },
        { side: 'w', at: -24, width: 3 },
        { side: 'e', at: -24, width: 3 },
      ],
    },
    { id: 'west', x0: -24, x1: -14, z0: -30, z1: -18, y: 0, h: 8, openings: [{ side: 'e', at: -24, width: 3 }] },
    { id: 'east', x0: 14, x1: 24, z0: -30, z1: -18, y: 0, h: 8, openings: [{ side: 'w', at: -24, width: 3 }] },
    { id: 'heart', x0: -10, x1: 10, z0: -62, z1: -40, y: 0, h: 16, openings: [{ side: 's', at: 0, width: 5 }] },
  ];
}
