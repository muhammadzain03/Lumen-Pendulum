# Lumen Pendulum

A real-time triple pendulum simulation that visualizes deterministic chaos through glowing motion trails. Built with TypeScript, Three.js, and Vite. Deployed automatically to GitHub Pages.

**Live demo:** [muhammadzain03.github.io/Lumen-Pendulum](https://muhammadzain03.github.io/Lumen-Pendulum/)

---

## Table of Contents

- [Overview](#overview)
- [Physics and Mathematics](#physics-and-mathematics)
  - [System Description](#system-description)
  - [Lagrangian Formulation](#lagrangian-formulation)
  - [Mass Matrix and Forcing Vector](#mass-matrix-and-forcing-vector)
  - [Numerical Integration (RK4)](#numerical-integration-rk4)
  - [Cartesian Conversion](#cartesian-conversion)
- [Rendering Pipeline](#rendering-pipeline)
- [Trail System](#trail-system)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Overview

A triple pendulum is one of the simplest physical systems that exhibits true chaotic behaviour. Three rigid arms, each free to swing under gravity, are connected end-to-end from a fixed pivot. Despite being governed by fully deterministic equations, the system is extraordinarily sensitive to initial conditions: two simulations started with angles differing by less than a millionth of a radian will diverge into completely different trajectories within seconds.

Lumen Pendulum simulates this system in the browser at 60 fps, painting a fading luminous trail behind the tip of the third arm. The trail is rendered through a bloom post-processing pass, producing the characteristic glowing path that makes the underlying chaos visible.

---

## Physics and Mathematics

### System Description

The simulation models a planar triple pendulum with the following parameters:

| Symbol | Description | Default |
|--------|-------------|---------|
| \(l_1, l_2, l_3\) | Arm lengths | 2.0, 1.5, 1.0 |
| \(m_1, m_2, m_3\) | Point masses at each joint | 1.0, 1.0, 1.0 |
| \(g\) | Gravitational acceleration | 9.81 m/s^2 |
| \(\theta_1, \theta_2, \theta_3\) | Absolute angles (from downward vertical) | |
| \(\omega_1, \omega_2, \omega_3\) | Angular velocities | |

All angles use the **absolute convention**: each angle is measured from the downward vertical, not relative to the previous arm. This convention must be consistent between the equations of motion and the Cartesian conversion, otherwise the simulation diverges immediately.

The full state vector at any instant is:

```
y = [theta_1, theta_2, theta_3, omega_1, omega_2, omega_3]
```

### Lagrangian Formulation

The physics are derived from Lagrangian mechanics rather than Newtonian force analysis. The Lagrangian of the system is:

```
L = T - V
```

where T is the total kinetic energy and V is the total potential energy of all three masses. Applying the Euler-Lagrange equations to each generalized coordinate (theta_1, theta_2, theta_3) yields three coupled second-order ordinary differential equations.

These are rewritten as a linear system:

```
M(theta) * alpha = F(theta, omega)
```

where:
- `M` is the 3x3 mass (inertia) matrix, dependent on current angles
- `alpha = [alpha_1, alpha_2, alpha_3]` are the angular accelerations (unknowns)
- `F` is the forcing vector containing gravity and velocity coupling (Coriolis/centripetal) terms

### Mass Matrix and Forcing Vector

Define cumulative masses:

```
mT1 = m1 + m2 + m3    (total mass below pivot 1)
mT2 = m2 + m3          (total mass below pivot 2)
```

And angle differences:

```
d_ij = theta_i - theta_j
```

The symmetric 3x3 mass matrix M is:

```
M = | mT1*l1^2              mT2*l1*l2*cos(d12)    m3*l1*l3*cos(d13)  |
    | mT2*l1*l2*cos(d12)    mT2*l2^2              m3*l2*l3*cos(d23)  |
    | m3*l1*l3*cos(d13)     m3*l2*l3*cos(d23)     m3*l3^2            |
```

The forcing vector F is:

```
F1 = -mT1*g*l1*sin(theta_1) - mT2*l1*l2*omega_2^2*sin(d12) - m3*l1*l3*omega_3^2*sin(d13)
F2 = -mT2*g*l2*sin(theta_2) + mT2*l1*l2*omega_1^2*sin(d12) - m3*l2*l3*omega_3^2*sin(d23)
F3 = -m3*g*l3*sin(theta_3)  + m3*l1*l3*omega_1^2*sin(d13)  + m3*l2*l3*omega_2^2*sin(d23)
```

Each row of F contains:
- A gravity term proportional to `sin(theta_i)`
- Velocity coupling terms proportional to `omega_j^2 * sin(d_ij)`, which encode Coriolis and centripetal effects between the arms

The system `M * alpha = F` is solved at every integration sub-step using Gaussian elimination with partial pivoting.

### Numerical Integration (RK4)

Simple Euler integration introduces energy drift that causes the pendulum to either spiral inward or fly apart within seconds. The simulation uses the classical **4th-order Runge-Kutta method** (RK4), which evaluates the derivative function at four points per time step and combines them with a weighted average:

```
k1 = f(t, y)
k2 = f(t + dt/2, y + dt/2 * k1)
k3 = f(t + dt/2, y + dt/2 * k2)
k4 = f(t + dt,   y + dt   * k3)

y_next = y + (dt/6) * (k1 + 2*k2 + 2*k3 + k4)
```

where `f` maps the current state `[theta, omega]` to its derivative `[omega, alpha]`, and `alpha` is obtained by solving `M * alpha = F` at the intermediate state.

Each animation frame's delta time is clamped to a maximum of 33ms (preventing explosions on tab-refocus) and subdivided into 8 RK4 sub-steps for numerical stability.

### Cartesian Conversion

Given absolute angles, the (x, y) positions of each joint are computed by forward kinematics:

```
x1 = l1 * sin(theta_1)
y1 = -l1 * cos(theta_1)

x2 = x1 + l2 * sin(theta_2)
y2 = y1 - l2 * cos(theta_2)

x3 = x2 + l3 * sin(theta_3)
y3 = y2 - l3 * cos(theta_3)
```

The pivot is at the origin (0, 0). The coordinate system places +y upward.

---

## Rendering Pipeline

The visual output is rendered with Three.js using an orthographic camera (no perspective distortion) and a post-processing bloom pass:

1. **WebGLRenderer** -- GPU-accelerated rendering onto an HTML canvas, with antialiasing enabled and pixel ratio capped at 2.
2. **OrthographicCamera** -- View half-size of 6 units fits the full pendulum reach (2 + 1.5 + 1 = 4.5 units) with margin. Responsive to window resize.
3. **EffectComposer** -- Chains a standard `RenderPass` with a `BloomEffect` (intensity 1.5, mipmap blur). Bright objects in the scene (the tip mass, the trail head) glow naturally through this pass.

The pendulum itself is drawn as:
- A `THREE.Line` connecting the four joint positions (pivot through tip)
- Four `THREE.Mesh` spheres at each joint, with the tip sphere using a white emissive material so bloom picks it up

---

## Trail System

The glowing tail behind the pendulum tip uses a fixed-capacity ring buffer (default 2000 points). Each frame, the tip's (x, y) position is pushed into the buffer, and the oldest point is implicitly evicted when capacity is reached.

The trail is rendered as a `THREE.Line` with per-vertex RGBA colour. A normalized parameter `t` runs from 0 (oldest point) to 1 (newest point), and the colour gradient is:

```
R = 0.2 + 0.8 * t
G = 0.6 + 0.4 * t
B = 1.0
A = t^2
```

This produces a cyan-to-white gradient that fades out with a quadratic alpha curve, giving a soft tail and a bright head.

All GPU buffers (`Float32Array` for positions and colours, `BufferAttribute` wrappers) are allocated once in the constructor and written into in-place every frame. No objects are created in the hot path, eliminating garbage collection pressure at 60 fps.

---

## Project Structure

```
Lumen-Pendulum/
  src/
    main.ts        Entry point, animation loop, mesh updates
    physics.ts     Lagrangian EOM, 3x3 solver, RK4 integrator
    scene.ts       Three.js renderer, camera, bloom pipeline, resize
    trail.ts       Ring buffer, per-vertex colour gradient, line mesh
    style.css      Full-viewport dark canvas layout
    vite-env.d.ts  Vite client type reference
  index.html       Minimal HTML shell with a single <canvas>
  vite.config.ts   Base path for GitHub Pages
  tsconfig.json    Strict TypeScript configuration
  package.json     Dependencies and build scripts
  .github/
    workflows/
      deploy.yml   CI/CD pipeline for GitHub Pages
```

---

## Getting Started

Prerequisites: [Node.js](https://nodejs.org/) 20 or later.

```bash
git clone https://github.com/muhammadzain03/Lumen-Pendulum.git
cd Lumen-Pendulum
npm install
npm run dev
```

Open the URL printed by Vite (default `http://localhost:5173/Lumen-Pendulum/`).

### Build for production

```bash
npm run build
npm run preview
```

---

## Deployment

Deployment to GitHub Pages is fully automated via GitHub Actions. Every push to `main` triggers the workflow defined in `.github/workflows/deploy.yml`:

1. Checks out the repository
2. Installs dependencies with `npm ci`
3. Runs `tsc && vite build` to type-check and bundle
4. Uploads the `dist/` directory as a Pages artifact
5. Deploys to GitHub Pages

To enable: go to **Repository Settings > Pages > Build and deployment** and set the source to **GitHub Actions**.

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Language | TypeScript | Type safety across physics and rendering code |
| Bundler | Vite | Fast dev server, tree-shaking, production builds |
| Rendering | Three.js | WebGL-based 3D scene graph |
| Post-processing | postprocessing | Bloom (UnrealBloomPass equivalent) |
| CI/CD | GitHub Actions | Automated build and deploy on push |
| Hosting | GitHub Pages | Static site hosting |

---

## License

This project is open source. See [LICENSE](LICENSE) for details.
