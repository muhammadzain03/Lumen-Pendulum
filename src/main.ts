import './style.css';
import * as THREE from 'three';
import { PhysicsEngine } from './physics';
import { createScene } from './scene';
import { Trail } from './trail';

// ---- canvas ----------------------------------------------------------------
const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
if (!canvas) throw new Error('Canvas element not found');

// ---- physics ---------------------------------------------------------------
const physics = new PhysicsEngine(
  { lengths: [2, 1.5, 1], masses: [1, 1, 1], g: 9.81 },
  {
    angles: [Math.PI / 2, Math.PI / 4, Math.PI / 3],
    velocities: [0, 0, 0],
  },
);

// ---- scene -----------------------------------------------------------------
const { scene, composer } = createScene(canvas);

// ---- pendulum visuals ------------------------------------------------------
const rodMaterial = new THREE.LineBasicMaterial({ color: 0x556677 });
const rodGeometry = new THREE.BufferGeometry();
rodGeometry.setAttribute(
  'position',
  new THREE.BufferAttribute(new Float32Array(4 * 3), 3), // 4 points (pivot + 3 joints)
);
const rods = new THREE.Line(rodGeometry, rodMaterial);
scene.add(rods);

const jointRadius = 0.08;
const jointMaterial = new THREE.MeshBasicMaterial({ color: 0x88aacc });
const tipMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const sphereGeo = new THREE.SphereGeometry(jointRadius, 16, 16);

const joints = [
  new THREE.Mesh(sphereGeo, jointMaterial),
  new THREE.Mesh(sphereGeo, jointMaterial),
  new THREE.Mesh(sphereGeo, jointMaterial),
  new THREE.Mesh(sphereGeo, tipMaterial),   // tip glows via bloom
];
joints.forEach((j) => scene.add(j));

// ---- trail -----------------------------------------------------------------
const trail = new Trail(2000);
scene.add(trail.mesh);

// ---- animation loop --------------------------------------------------------
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.033);
  physics.update(dt);

  const positions = physics.getPositions();

  // Update rods
  const rodPos = rods.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < 4; i++) {
    rodPos.setXYZ(i, positions[i][0], positions[i][1], 0);
  }
  rodPos.needsUpdate = true;

  // Update joints
  for (let i = 0; i < 4; i++) {
    joints[i].position.set(positions[i][0], positions[i][1], 0);
  }

  // Update trail with the tip position
  const tip = positions[3];
  trail.push(tip[0], tip[1]);

  composer.render();
}

animate();