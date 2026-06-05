import * as THREE from 'three';
import type { PhysicsEngine } from './physics';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Two Possible states the simulation can be in
export type SimMode = 'dragging' | 'running';

export interface InputContext {
  canvas: HTMLCanvasElement;
  camera: THREE.OrthographicCamera;
  joints: THREE.Mesh[];
  physics: PhysicsEngine;
  pivotYOffset: number;
  controls: OrbitControls;
  onRelease: () => void;    // callback to clear the trail when the user lets go
}

// ---------------------------------------------------------------------------
// FABRIK (Forward And Backward Reaching Inverse Kinematics)
//
// Solves a planar chain anchored at `root` so that the end-effector reaches
// `target`. When the target is beyond total reach the chain stretches straight
// toward it; otherwise it iterates forward/backward passes to converge.
// ---------------------------------------------------------------------------

function solveFABRIK(
  root: [number, number],
  lengths: number[],
  target: [number, number],
  currentPositions: [number, number][],
  iterations = 10,
): [number, number][] {
  const n = lengths.length;
  const pos: [number, number][] = [[...root]];
  for (let i = 0; i < n; i++) pos.push([...currentPositions[i]]);

  const totalLen = lengths.reduce((a, b) => a + b, 0);
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > totalLen) {
    const ux = dx / dist;
    const uy = dy / dist;
    for (let i = 0; i < n; i++) {
      pos[i + 1] = [
        pos[i][0] + ux * lengths[i],
        pos[i][1] + uy * lengths[i],
      ];
    }
    return pos;
  }

  for (let _iter = 0; _iter < iterations; _iter++) {
    pos[n] = [...target];
    for (let i = n - 1; i >= 0; i--) {
      const ddx = pos[i][0] - pos[i + 1][0];
      const ddy = pos[i][1] - pos[i + 1][1];
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1e-10;
      pos[i] = [
        pos[i + 1][0] + (ddx / d) * lengths[i],
        pos[i + 1][1] + (ddy / d) * lengths[i],
      ];
    }

    pos[0] = [...root];
    for (let i = 0; i < n; i++) {
      const ddx = pos[i + 1][0] - pos[i][0];
      const ddy = pos[i + 1][1] - pos[i][1];
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1e-10;
      pos[i + 1] = [
        pos[i][0] + (ddx / d) * lengths[i],
        pos[i][1] + (ddy / d) * lengths[i],
      ];
    }
  }

  return pos;
}

// ---------------------------------------------------------------------------
// Pointer interaction state machine
// ---------------------------------------------------------------------------

export function createInput(ctx: InputContext) {
  let mode: SimMode = 'running';
  let activeJointIndex: number | null = null;

  // Generous grab radius (world units) so a moving joint is easy to catch -
  // ray-hitting the small joint sphere directly is far too fiddly.
  const PICK_RADIUS = 0.6;

  function pointerToWorld(
    clientX: number,
    clientY: number,
  ): [number, number] {
    const rect = ctx.canvas.getBoundingClientRect();
    const v = new THREE.Vector3(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
      0,
    );
    v.unproject(ctx.camera);
    return [v.x, v.y - ctx.pivotYOffset];
  }

  // --- pointer down: grab the nearest joint within PICK_RADIUS, begin drag ---

  function onPointerDown(event: PointerEvent) {
    if (mode === 'dragging') return;

    const target = pointerToWorld(event.clientX, event.clientY);
    const positions = ctx.physics.getPositions();

    let bestIndex = -1;
    let bestDist = PICK_RADIUS;
    for (let i = 1; i <= 3; i++) {
      const dx = positions[i][0] - target[0];
      const dy = positions[i][1] - target[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) return;

    activeJointIndex = bestIndex;
    mode = 'dragging';
    ctx.physics.state.velocities = [0, 0, 0];

    ctx.controls.enabled = false;
    ctx.canvas.setPointerCapture(event.pointerId);
    ctx.canvas.classList.add('dragging');
  }

  // --- pointer move: solve IK chain toward cursor ---

  function onPointerMove(event: PointerEvent) {
    if (mode !== 'dragging' || activeJointIndex === null) return;

    const target = pointerToWorld(event.clientX, event.clientY);
    const { lengths } = ctx.physics.params;
    const positions = ctx.physics.getPositions();

    // Solve only the sub-chain from pivot to the grabbed joint
    const subLengths = lengths.slice(0, activeJointIndex) as number[];
    const subCurrent = positions.slice(1, activeJointIndex + 1) as [number, number][];

    const solved = solveFABRIK([0, 0], subLengths, target, subCurrent);

    for (let i = 0; i < activeJointIndex; i++) {
      const sdx = solved[i + 1][0] - solved[i][0];
      const sdy = solved[i + 1][1] - solved[i][1];
      ctx.physics.state.angles[i] = Math.atan2(sdx, -sdy);
      ctx.physics.state.velocities[i] = 0; // held arms don't carry momentum
    }
    // Lower arms keep their velocity so they swing freely under gravity.
  }

  // --- pointer up: release joint, resume physics ---

  function onPointerUp(event: PointerEvent) {
    if (mode !== 'dragging') return;

    ctx.canvas.releasePointerCapture(event.pointerId);
    mode = 'running';
    activeJointIndex = null;

    ctx.controls.enabled = true;
    ctx.onRelease();
    ctx.canvas.classList.remove('dragging');
  }

  ctx.canvas.addEventListener('pointerdown', onPointerDown);
  ctx.canvas.addEventListener('pointermove', onPointerMove);
  ctx.canvas.addEventListener('pointerup', onPointerUp);
  ctx.canvas.addEventListener('pointercancel', onPointerUp);

  return {
    simMode: (): SimMode => mode,
    activeJoint: (): number | null => activeJointIndex,
  };
}
