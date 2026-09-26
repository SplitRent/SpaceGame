import * as THREE from 'three';
import { createPlanet } from './planets';
import { Sky } from './sky';
import { buildLantern } from '../procgen/lanternShip';

/** Title-screen scene: the Lantern gliding past Earth with the Moon beyond. */
export function buildTitleBackdrop(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000');
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 30000);
  const sky = new Sky({ seed: 5, radius: 20000 });
  scene.add(sky.group);
  const sunDir = new THREE.Vector3(1, 0.25, 0.4).normalize();
  sky.sunDir.copy(sunDir);
  const earth = createPlanet('earth', 2400, { segments: 128 });
  earth.group.position.set(-900, -2600, -3200);
  earth.group.rotation.set(0.3, 2.2, 0.1);
  scene.add(earth.group);
  const moon = createPlanet('moon', 180, { segments: 64 });
  moon.group.position.set(4200, 900, -9000);
  scene.add(moon.group);
  const ship = buildLantern({ damaged: false, power: 1, landed: false });
  ship.setEngine(0.35);
  scene.add(ship.group);
  const key = new THREE.DirectionalLight('#fff6ea', 3);
  key.position.copy(sunDir).multiplyScalar(100);
  scene.add(key, new THREE.AmbientLight('#20324a', 0.35));
  scene.userData.update = (t: number) => {
    ship.group.position.set(40 - t * 2.5, 10 + Math.sin(t * 0.2) * 2, -40);
    ship.group.rotation.set(0.05, -0.35 + Math.sin(t * 0.07) * 0.05, 0.08);
    camera.position.set(120 + Math.sin(t * 0.03) * 20 - t * 2.5, 45, 140);
    camera.lookAt(ship.group.position.clone().add(new THREE.Vector3(-30, -8, 0)));
    earth.update(t, sunDir);
    moon.update(t, sunDir);
    earth.group.rotation.y = 2.2 + t * 0.004;
    sky.update(camera.position, t, 1);
  };
  return { scene, camera };
}
