import * as THREE from 'three';
import type { Location } from './Location';
import type { Game } from '../Game';
import type { LanternModel } from '../procgen/lanternShip';
import { KitBuilder, stdMat } from '../procgen/kit';

/**
 * Walkable exterior of the landed Lantern, shared by every surface region: hull colliders,
 * the cargo ramp, and the two ways in (ramp door and main airlock with its ladder).
 * `shipRoot` must already be positioned; the ship group is a child of it.
 */
export function addLanternExterior(game: Game, loc: Location, shipRoot: THREE.Object3D, ship: LanternModel): { rampDoor: THREE.Mesh; airlockDoor: THREE.Mesh } {
  shipRoot.updateMatrixWorld(true);
  const mtx = shipRoot.matrixWorld;
  const q = new THREE.Quaternion().setFromRotationMatrix(mtx);
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
    const c = new THREE.Vector3(cx, cy, cz).applyMatrix4(mtx);
    loc.physics.addBox(c, new THREE.Vector3(hx, hy, hz), q);
  };
  box(0, 8.3, -39, 7.5, 5, 13);
  box(0, 8.5, -5, 11.8, 6, 20);
  box(0, 8, 37.5, 15.8, 7, 23.5);
  box(0, 8, 66, 11, 4.5, 6);
  box(-9.5, 3.6, -4, 2.6, 2.6, 17);
  box(9.5, 3.6, -4, 2.6, 2.6, 17);
  box(0, 17.2, 34, 6.5, 2.2, 6.5);
  // Walkable cargo ramp
  const a = ship.anchors;
  const mid = a.ramp.clone().add(a.rampTop).multiplyScalar(0.5);
  const len = a.ramp.distanceTo(a.rampTop);
  const ang = Math.atan2(a.rampTop.y - a.ramp.y, a.ramp.x - a.rampTop.x);
  const rq = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -ang)));
  loc.physics.addBox(mid.clone().applyMatrix4(mtx), new THREE.Vector3(len / 2, 0.2, 3.7), rq);

  // Ship entrances
  const rampDoor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 7), new THREE.MeshStandardMaterial({ color: '#1a1d22', emissive: '#ffcf8a', emissiveIntensity: 0 }));
  rampDoor.position.copy(a.rampTop).add(new THREE.Vector3(-0.2, 2.6, 0));
  ship.group.add(rampDoor);
  loc.registerInteractable({
    id: 'enter.cargo',
    object: rampDoor,
    kind: 'door',
    range: 4,
    prompt: () => 'Enter the Lantern — cargo hold',
    interact: () => void game.locations.travel({ location: 'lantern.interior', spawn: 'cargo' }, { label: 'Entering the cargo hold…' }),
  });
  const airlockDoor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.4, 3), new THREE.MeshStandardMaterial({ color: '#2a2e35', emissive: '#7fd4ff', emissiveIntensity: 0.2 }));
  airlockDoor.position.set(12.45, 7.3, -9);
  ship.group.add(airlockDoor);
  // Short ladder up to the airlock threshold, and the long one to the dorsal hull
  const ladder = new KitBuilder({ m: stdMat('#8b939c', { metalness: 0.7, roughness: 0.4 }) });
  for (let i = 0; i < 6; i++) ladder.box('m', 0.1, 0.1, 1.4, { x: 13.2, y: 1 + i * 0.9, z: -9 });
  ladder.box('m', 0.12, 6, 0.12, { x: 13.2, y: 3.2, z: -9.7 });
  ladder.box('m', 0.12, 6, 0.12, { x: 13.2, y: 3.2, z: -8.3 });
  ladder.box('m', 0.12, 12, 0.12, { x: 12.8, y: 10.5, z: -2.7 });
  ladder.box('m', 0.12, 12, 0.12, { x: 12.8, y: 10.5, z: -1.3 });
  for (let i = 0; i < 12; i++) ladder.box('m', 0.1, 0.1, 1.4, { x: 12.8, y: 5 + i * 0.95, z: -2 });
  ship.group.add(ladder.build());
  loc.registerInteractable({
    id: 'enter.airlock',
    object: airlockDoor,
    kind: 'door',
    range: 4.5,
    prompt: () => 'Cycle main airlock',
    interact: () => {
      game.audio.play('airlock');
      void game.locations.travel({ location: 'lantern.interior', spawn: 'airlock' }, { label: 'Cycling airlock…' });
    },
  });
  loc.scannables.push({ entry: 'db.lantern', object: ship.group, range: 120 });
  return { rampDoor, airlockDoor };
}
