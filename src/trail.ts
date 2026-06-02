// ---------------------------------------------------------------------------
// trail.ts
// Fixed-Capacity ring buffer of tip posiion
// Fading/glowing line geometry
// ------------------------------------------------------------

import * as THREE from 'three';

export class Trail {
  private capacity: number;

  // Ring buffer - push() writes here with zero allocations.
  private positions: Float32Array;
  private head = 0;
  private count = 0;

  // Pre-allocated draw buffers reused every frame (no GC pressure).
  private drawPositions: Float32Array;
  private drawColors: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;

  private geometry: THREE.BufferGeometry;
  readonly mesh: THREE.Line;

  constructor(capacity = 2000) {
    // 2000 points gives a long visible trail without excessive memory churn.
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);

    // Allocate draw buffers once at full capacity - written into in-place each frame.
    this.drawPositions = new Float32Array(capacity * 3);
    this.drawColors = new Float32Array(capacity * 4);

    this.posAttr = new THREE.BufferAttribute(this.drawPositions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.drawColors, 4).setUsage(THREE.DynamicDrawUsage);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('color', this.colorAttr);
    this.geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      linewidth: 1, // Keep the trail thin so bloom creates the perceived glow width.
    });

    this.mesh = new THREE.Line(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  push(x: number, y: number): void {
    const i = this.head;
    this.positions[i * 3]     = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = 0; // Pendulum motion is planar (XY), so z stays fixed.

    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;

    this.rebuildDrawOrder();
  }

  /**
   * Reorder ring buffer into chronological order within the pre-allocated
   * draw arrays and recompute per-vertex color/alpha gradient.
   * No allocations happen here - just writes into existing typed arrays.
   */
  private rebuildDrawOrder(): void {
    const dp = this.drawPositions;
    const dc = this.drawColors;
    const sp = this.positions;
    const n = this.count;
    const invN = 1 / (n - 1 || 1); // Fallback 1 avoids division by zero with one point.

    for (let i = 0; i < n; i++) {
      const src = (this.head - n + i + this.capacity) % this.capacity;

      dp[i * 3]     = sp[src * 3];
      dp[i * 3 + 1] = sp[src * 3 + 1];
      dp[i * 3 + 2] = 0;

      const t = i * invN; // 0 = oldest, 1 = newest

      // Cyan-ish glow that brightens toward the tip
      dc[i * 4]     = 0.2 + 0.8 * t;  // R: starts dim, ramps up near tip.
      dc[i * 4 + 1] = 0.6 + 0.4 * t;  // G: stays high to keep cyan tone.
      dc[i * 4 + 2] = 1.0;             // B: pinned to max for electric-blue glow.
      dc[i * 4 + 3] = t * t;           // A: quadratic fade keeps tail soft, tip bright.
    }

    // Signal Three.js that the existing buffers have new data - no new objects created.
    this.posAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, n);
  }
}
