import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { PhysicsEngine } from './physics';
import { createScene } from './scene';
import { Trail } from './trail';
import { createInput } from './input';

// ---- canvas ----------------------------------------------------------------
const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
if (!canvas) throw new Error('Canvas element not found');

const PIVOT_Y_OFFSET = 0.5;

// ---- physics ---------------------------------------------------------------
// Small starting angles near the resting vertical -> very slow, gentle motion
// on load that only gradually builds into chaos.
const physics = new PhysicsEngine(
  { lengths: [1.5, 1.5, 1.5], masses: [1, 1, 1], g: 9.81 },
  {
    angles: [0.35, 0.22, 0.12],  // small offsets (~20°, 13°, 7°)
    velocities: [0, 0, 0],       // released from rest
  },
);

// ---- scene -----------------------------------------------------------------
const { scene, camera, composer } = createScene(canvas);

// ---- orbit controls --------------------------------------------------------
const controls = new OrbitControls(camera, canvas);
controls.enableRotate = false;
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.screenSpacePanning = true;
controls.minZoom = 0.3;
controls.maxZoom = 8;

// ---- pendulum visuals ------------------------------------------------------

// 1) the rods (the links connecting the joints)
// Line2 (fat lines) so the arms render with real thickness - plain THREE.Line
// ignores linewidth on most GPUs and always draws 1px.
const rodMaterial = new LineMaterial({
  color: 0x556677,
  linewidth: 0.035, // world units (worldUnits: true)
  worldUnits: true,
});
const rodGeometry = new LineGeometry();
const rodPositions = new Float32Array(4 * 3); // pivot + 3 joints
rodGeometry.setPositions(rodPositions);
const rods = new Line2(rodGeometry, rodMaterial);
rods.frustumCulled = false;
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
const trail = new Trail(1000);    // ring buffer of the last 1000 tip positions, drawn as a fading trail
scene.add(trail.mesh);

// ---- input -----------------------------------------------------------------
const input = createInput({
  canvas,
  camera,
  joints,
  physics,
  pivotYOffset: PIVOT_Y_OFFSET,
  controls,
  onRelease: () => trail.clear(),
});

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
  const mode = input.simMode();
  if (mode === 'running') {
    physics.update(dt);
  } else if (mode === 'dragging') {
    const grabbed = input.activeJoint();
    if (grabbed !== null) physics.updateConstrained(dt, grabbed);
  }

  const positions = physics.getPositions();

  // Update rods
  for (let i = 0; i < 4; i++) {
    rodPositions[i * 3] = positions[i][0];
    rodPositions[i * 3 + 1] = positions[i][1] + PIVOT_Y_OFFSET;
    rodPositions[i * 3 + 2] = 0;
  }
  rodGeometry.setPositions(rodPositions);
  rodMaterial.resolution.set(window.innerWidth, window.innerHeight);

  // Update joints
  for (let i = 0; i < 4; i++) {
    joints[i].position.set(positions[i][0], positions[i][1] + PIVOT_Y_OFFSET, 0);
  }

  // Update trail with the tip position - ONLY when running
  const tip = positions[3];
  if (input.simMode() === 'running') {
    trail.push(tip[0], tip[1] + PIVOT_Y_OFFSET);
  }

  controls.update();
  composer.render();

  fpsFrames++;
  const now = performance.now();
  if (now - fpsLastTime >= 100) { // ~10 updates/sec - more responsive than 250ms
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
