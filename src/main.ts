import './style.css';
import * as THREE from 'three';
import { PhysicsEngine } from './physics';
import { createScene } from './scene';
import { Trail } from './trail';

// ---- canvas ----------------------------------------------------------------
const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
if (!canvas) throw new Error('Canvas element not found');   // If it is missing, the app fails fast instead of crashing later inside Three.js.

const PIVOT_Y_OFFSET = 0.5;

// ---- physics ---------------------------------------------------------------
const physics = new PhysicsEngine(
  { lengths: [1.5, 1.5, 1.5], masses: [1, 1, 1], g: 9.81 },  // lengths of rods, masses, and gravity
  {
    angles: [Math.PI / 2, Math.PI / 4, Math.PI / 3],  // Starting angles (90°, 45°, 60°)
    velocities: [0, 0, 0],  // Released from rest
  },
);

// ---- scene -----------------------------------------------------------------
const { scene, composer } = createScene(canvas);

// ---- pendulum visuals ------------------------------------------------------
// creates two distinct visual components: 

// 1) the rods (the links connecting the joints) 
const rodMaterial = new THREE.LineBasicMaterial({ color: 0x556677 });   // color: 0x556677 is a muted blue-gray for the arms.
const rodGeometry = new THREE.BufferGeometry();
rodGeometry.setAttribute(
  'position',
  new THREE.BufferAttribute(new Float32Array(4 * 3), 3), // 4 points (pivot + 3 joints)
);
const rods = new THREE.Line(rodGeometry, rodMaterial);
scene.add(rods);

// 2) the joints (the masses at the pivot points).
const jointRadius = 0.1;
const jointMaterial = new THREE.MeshBasicMaterial({ color: 0x88aacc });   // First three: light blue (0x88aacc) - pivot and intermediate joints.
const tipMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });     // Fourth (tip): white (0xffffff) - brightest; bloom makes it glow strongly.
const sphereGeo = new THREE.SphereGeometry(jointRadius, 16, 16);

const joints = [
  new THREE.Mesh(sphereGeo, jointMaterial),
  new THREE.Mesh(sphereGeo, jointMaterial),
  new THREE.Mesh(sphereGeo, jointMaterial),
  new THREE.Mesh(sphereGeo, tipMaterial),   // tip glows via bloom
];
joints.forEach((j) => scene.add(j));

// The Bloom Strategy: By making the final tip solid white, its pixel luminosity value will instantly 
// punch past the threshold of your post-processing bloom shader. 
// This ensures that while the base joints stay dim, the tip will emit a powerful, glowing aura as it cuts through space.

// ---- pivot ring ------------------------------------------------------------
// A faint glowing ring at the fixed anchor point to make the origin feel intentional.
const pivotRing = new THREE.Mesh(
  new THREE.RingGeometry(0.14, 0.18, 64),
  new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  }),
);
pivotRing.position.set(0, PIVOT_Y_OFFSET, 0);
scene.add(pivotRing);

// ---- trail -----------------------------------------------------------------
const trail = new Trail(1000);    // keeps up to 1000 recent tip positions in a ring buffer and draws a fading cyan line - can be changed (was 2000 before) 
scene.add(trail.mesh);

// ---- FPS counter -----------------------------------------------------------
const fpsNode = document.querySelector<HTMLDivElement>('#fps');
if (!fpsNode) throw new Error('FPS element not found');
const fpsEl: HTMLDivElement = fpsNode;

let fpsFrames = 0;
let fpsLastTime = performance.now();

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
    rodPos.setXYZ(i, positions[i][0], positions[i][1] + PIVOT_Y_OFFSET, 0);
  }
  rodPos.needsUpdate = true;

  // Update joints
  for (let i = 0; i < 4; i++) {
    joints[i].position.set(positions[i][0], positions[i][1] + PIVOT_Y_OFFSET, 0);
  }

  // Update trail with the tip position
  const tip = positions[3];
  trail.push(tip[0], tip[1] + PIVOT_Y_OFFSET);

  composer.render();

  fpsFrames++;
  const now = performance.now();
  if (now - fpsLastTime >= 100) { // ~10 updates/sec — more responsive than 250ms
    const fps = Math.round((fpsFrames * 1000) / (now - fpsLastTime));
    fpsEl.textContent = `${fps} FPS`;

    fpsEl.className =
      fps >= 55 ? 'good' :
      fps >= 30 ? 'ok' :
      'bad';

    fpsFrames = 0;
    fpsLastTime = now;
  }
}

animate();

// Fade in canvas and hide CSS spinner once scene is ready.
document.body.classList.add('loaded');