import * as THREE from 'three';
import { Location } from '../Location';
import type { Game } from '../../Game';

/** Placeholder — replaced by the full implementation. */
export class CislunarSpace extends Location {
  readonly id = 'space.cislunar';
  readonly name = 'CislunarSpace';
  readonly mode = 'foot' as const;
  constructor(game: Game) {
    super(game, 9.8);
    this.env = { gravity: 9.8, atmosphere: 'breathable', temperatureC: 20, radiation: 0, ambience: 'ship' };
  }
  async build(): Promise<void> {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 40), new THREE.MeshStandardMaterial({ color: '#555' }));
    floor.position.y = -0.5;
    this.scene.add(floor, new THREE.HemisphereLight('#fff', '#444', 2));
    this.physics.addBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 0.5, 20));
    this.spawns = { default: { id: 'default', position: new THREE.Vector3(0, 0.1, 0), yaw: 0 } };
  }
}
