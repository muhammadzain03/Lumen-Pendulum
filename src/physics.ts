// ---------------------------------------------------------------------------
// Triple-pendulum physics (Lagrangian mechanics + RK4 integration)
//
// Angles are ABSOLUTE - each measured from the downward vertical.
// The state vector is [θ1, θ2, θ3, ω1, ω2, ω3].
// ---------------------------------------------------------------------------

export interface PendulumParams {
  lengths: [number, number, number];
  masses: [number, number, number];
  g: number;
}

export interface PendulumState {
  angles: [number, number, number];
  velocities: [number, number, number];
}

type Vec6 = [number, number, number, number, number, number];

// ---- helpers ---------------------------------------------------------------

function solve3x3(M: number[][], b: number[]): [number, number, number] {
  // Gaussian elimination with partial pivoting for a 3×3 system.
  const A = [
    [M[0][0], M[0][1], M[0][2], b[0]],
    [M[1][0], M[1][1], M[1][2], b[1]],
    [M[2][0], M[2][1], M[2][2], b[2]],
  ];

  for (let col = 0; col < 3; col++) {
    let maxRow = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];

    const pivot = A[col][col];
    if (Math.abs(pivot) < 1e-12) return [0, 0, 0]; // degenerate

    for (let row = col + 1; row < 3; row++) {
      const factor = A[row][col] / pivot;
      for (let j = col; j < 4; j++) A[row][j] -= factor * A[col][j];
    }
  }

  const x: number[] = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let sum = A[i][3];
    for (let j = i + 1; j < 3; j++) sum -= A[i][j] * x[j];
    x[i] = sum / A[i][i];
  }
  return [x[0], x[1], x[2]];
}

// ---- equations of motion ---------------------------------------------------
//
// Derived from the Lagrangian of a planar triple pendulum with absolute angles.
//
// Mass matrix  M · α = F  where α = [α1, α2, α3] (angular accelerations)
// and F contains gravitational + centripetal / Coriolis terms.
//
// Notation:
//   mT_i  = total mass hanging from pivot i  (m_i + m_{i+1} + …)
//   l_i   = length of arm i
//   θ_ij  = θ_i − θ_j
// ---------------------------------------------------------------------------

function computeAccelerations(
  params: PendulumParams,
  angles: [number, number, number],
  velocities: [number, number, number],
): [number, number, number] {
  const { lengths: [l1, l2, l3], masses: [m1, m2, m3], g } = params;

  const [t1, t2, t3] = angles;
  const [w1, w2, w3] = velocities;

  const mT1 = m1 + m2 + m3;
  const mT2 = m2 + m3;

  const d12 = t1 - t2;
  const d13 = t1 - t3;
  const d23 = t2 - t3;

  const c12 = Math.cos(d12);
  const c13 = Math.cos(d13);
  const c23 = Math.cos(d23);
  const s12 = Math.sin(d12);
  const s13 = Math.sin(d13);
  const s23 = Math.sin(d23);

  // Mass matrix M (symmetric)
  const M: number[][] = [
    [mT1 * l1 * l1,      mT2 * l1 * l2 * c12, m3 * l1 * l3 * c13],
    [mT2 * l1 * l2 * c12, mT2 * l2 * l2,       m3 * l2 * l3 * c23],
    [m3 * l1 * l3 * c13,  m3 * l2 * l3 * c23,  m3 * l3 * l3],
  ];

  // Forcing vector F (gravity + velocity coupling)
  const F: number[] = [
    -mT1 * g * l1 * Math.sin(t1)
      - mT2 * l1 * l2 * w2 * w2 * s12
      - m3 * l1 * l3 * w3 * w3 * s13,

    -mT2 * g * l2 * Math.sin(t2)
      + mT2 * l1 * l2 * w1 * w1 * s12
      - m3 * l2 * l3 * w3 * w3 * s23,

    -m3 * g * l3 * Math.sin(t3)
      + m3 * l1 * l3 * w1 * w1 * s13
      + m3 * l2 * l3 * w2 * w2 * s23,
  ];

  return solve3x3(M, F);
}

// ---- RK4 integrator --------------------------------------------------------

function derivatives(params: PendulumParams, y: Vec6): Vec6 {
  const angles: [number, number, number] = [y[0], y[1], y[2]];
  const velocities: [number, number, number] = [y[3], y[4], y[5]];
  const [a1, a2, a3] = computeAccelerations(params, angles, velocities);
  return [y[3], y[4], y[5], a1, a2, a3];
}

function addVec(a: Vec6, b: Vec6, scale: number): Vec6 {
  return [
    a[0] + b[0] * scale,
    a[1] + b[1] * scale,
    a[2] + b[2] * scale,
    a[3] + b[3] * scale,
    a[4] + b[4] * scale,
    a[5] + b[5] * scale,
  ];
}

function rk4Step(params: PendulumParams, y: Vec6, dt: number): Vec6 {
  const k1 = derivatives(params, y);
  const k2 = derivatives(params, addVec(y, k1, dt / 2));
  const k3 = derivatives(params, addVec(y, k2, dt / 2));
  const k4 = derivatives(params, addVec(y, k3, dt));

  return [
    y[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    y[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    y[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    y[3] + (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
    y[4] + (dt / 6) * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4]),
    y[5] + (dt / 6) * (k1[5] + 2 * k2[5] + 2 * k3[5] + k4[5]),
  ];
}

// ---- public API ------------------------------------------------------------

export class PhysicsEngine {
  params: PendulumParams;
  state: PendulumState;
  private subSteps: number;

  constructor(
    params: PendulumParams,
    initialState: PendulumState,
    subSteps = 8,
  ) {
    this.params = params;
    this.state = { ...initialState };
    this.subSteps = subSteps;
  }

  /** Advance the simulation by `dt` seconds (split into sub-steps). */
  update(dt: number): void {
    const h = dt / this.subSteps;
    let y: Vec6 = [
      ...this.state.angles,
      ...this.state.velocities,
    ] as Vec6;

    for (let i = 0; i < this.subSteps; i++) {
      y = rk4Step(this.params, y, h);
    }

    this.state.angles = [y[0], y[1], y[2]];
    this.state.velocities = [y[3], y[4], y[5]];
  }

  /**
   * Convert the current angles to Cartesian (x, y) positions.
   * Returns 4 points: pivot, joint1, joint2, tip.
   * +y is UP (screen-friendly when negated later by the renderer).
   */
  getPositions(): [number, number][] {
    const { lengths: [l1, l2, l3] } = this.params;
    const [a1, a2, a3] = this.state.angles;

    const x1 = l1 * Math.sin(a1);
    const y1 = -l1 * Math.cos(a1);

    const x2 = x1 + l2 * Math.sin(a2);
    const y2 = y1 - l2 * Math.cos(a2);

    const x3 = x2 + l3 * Math.sin(a3);
    const y3 = y2 - l3 * Math.cos(a3);

    return [[0, 0], [x1, y1], [x2, y2], [x3, y3]];
  }
}
