# Lumen Pendulum

A real-time, interactive triple pendulum simulation that visualizes deterministic chaos through glowing motion trails. The physics are derived from Lagrangian mechanics and integrated with 4th-order Runge-Kutta; the visuals are rendered with Three.js and a bloom post-processing pass. Built with TypeScript and Vite, and deployed automatically to GitHub Pages.

**Live demo:** [muhammadzain03.github.io/Lumen-Pendulum](https://muhammadzain03.github.io/Lumen-Pendulum/)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Physics and Mathematics](#physics-and-mathematics)
  - [System Description](#system-description)
  - [Lagrangian Formulation](#lagrangian-formulation)
  - [Mass Matrix and Forcing Vector](#mass-matrix-and-forcing-vector)
  - [Numerical Integration (RK4)](#numerical-integration-rk4)
  - [Constrained Integration While Dragging](#constrained-integration-while-dragging)
  - [Cartesian Conversion](#cartesian-conversion)
- [Interaction Model](#interaction-model)
  - [State Machine](#state-machine)
  - [Inverse Kinematics (FABRIK)](#inverse-kinematics-fabrik)
  - [Joint Picking](#joint-picking)
  - [Camera Controls](#camera-controls)
- [Rendering Pipeline](#rendering-pipeline)
- [Trail System](#trail-system)
- [Development Plan and Change Log](#development-plan-and-change-log)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Overview

A triple pendulum is one of the simplest physical systems that exhibits true chaotic behaviour. Three rigid arms, each free to swing under gravity, are connected end-to-end from a fixed pivot. Despite being governed by fully deterministic equations, the system is extraordinarily sensitive to initial conditions: two simulations started with angles differing by less than a millionth of a radian will diverge into completely different trajectories within seconds.

Lumen Pendulum simulates this system in the browser in real time, painting a fading luminous trail behind the tip of the third arm. The trail is rendered through a bloom post-processing pass, producing the characteristic glowing path that makes the underlying chaos visible. The simulation is also fully interactive: any mass can be grabbed and dragged, with the rest of the chain responding through inverse kinematics above the grab point and free gravitational motion below it.

---

## Features

- **Accurate physics.** Full planar triple-pendulum equations of motion derived from the Lagrangian, solved as a linear system at every sub-step and integrated with classical RK4.
- **Interactive dragging.** Grab any of the three masses. Arms above the grabbed joint follow the cursor via inverse kinematics; arms below it hang and swing freely under gravity, as a real chain would.
- **Forgiving grab.** A distance-based pick grabs the nearest joint within a generous radius, so catching a fast-moving mass is easy.
- **Camera controls.** Pan and zoom (OrbitControls) to inspect dense regions of the trail. Rotation is disabled because the system is planar.
- **Gentle startup.** The pendulum begins near its resting vertical with small offsets, producing slow motion on load that only gradually builds into chaos.
- **Glowing trail.** A fixed-capacity ring buffer renders a fading, colour-graded trail behind the tip, amplified by bloom.
- **Performance HUD.** A live, colour-coded frames-per-second counter.
- **Polished shell.** Loading spinner, fade-in canvas, descriptive overlay, favicon, and Open Graph / Twitter social cards.
- **Touch and mouse.** Unified Pointer Events with pointer capture support both desktop and mobile.

---

## Physics and Mathematics

### System Description

The simulation models a planar triple pendulum with the following parameters:

| Symbol | Description | Default |
|--------|-------------|---------|
| \(l_1, l_2, l_3\) | Arm lengths | 1.5, 1.5, 1.5 |
| \(m_1, m_2, m_3\) | Point masses at each joint | 1.0, 1.0, 1.0 |
| \(g\) | Gravitational acceleration | 9.81 m/s^2 |
| \(\theta_1, \theta_2, \theta_3\) | Absolute angles (from downward vertical) | 0.35, 0.22, 0.12 rad |
| \(\omega_1, \omega_2, \omega_3\) | Angular velocities | 0, 0, 0 |

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
- `M` is the 3x3 mass (inertia) matrix, dependent on the current angles
- `alpha = [alpha_1, alpha_2, alpha_3]` are the angular accelerations (the unknowns)
- `F` is the forcing vector containing gravity and velocity coupling (Coriolis / centripetal) terms

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
- Velocity coupling terms proportional to `omega_j^2 * sin(d_ij)`, which encode the Coriolis and centripetal effects between the arms

The system `M * alpha = F` is solved at every integration sub-step using Gaussian elimination with partial pivoting (`solve3x3`).

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

Each animation frame's delta time is clamped to a maximum of 33 ms (preventing explosions on tab refocus) and subdivided into 8 RK4 sub-steps for numerical stability.

### Constrained Integration While Dragging

When the user grabs a joint, the chain is split into two parts and each is handled differently:

- The arms **above** the grabbed joint are positioned by inverse kinematics so the joint tracks the cursor (see [Inverse Kinematics](#inverse-kinematics-fabrik)). These arms are treated as a held support and do not carry momentum.
- The arms **below** the grabbed joint continue to obey gravity, swinging freely as if hanging from a moving support.

This is implemented by `PhysicsEngine.updateConstrained(dt, freeStart)`, where `freeStart` is the index of the first free arm (equal to the grabbed joint index). Because the held arms have their angular velocities pinned to zero, every velocity-coupling term they would contribute to the forcing vector vanishes. The free arms therefore reduce exactly to a smaller sub-pendulum suspended from the held joint.

Rather than solving the full 3x3 system, the constrained integrator solves only the lower-right sub-block of `M` corresponding to the free arms (`solveSub`):

- Grab joint 1: arms 2 and 3 form a free double pendulum (a 2x2 solve).
- Grab joint 2: arm 3 forms a simple pendulum (a 1x1 solve), reducing to `alpha_3 = -g*sin(theta_3) / l3`.
- Grab joint 3 (the tip): no arms hang below it, so the integrator does nothing and the tip is purely cursor-controlled.

The free arms are advanced with the same 8 sub-step RK4 scheme (`rk4StepConstrained`), and only their angles and velocities are written back to the state; the held arms remain exactly as the IK handle placed them.

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

`getPositions()` returns four points (pivot, joint 1, joint 2, tip). The pivot is at the origin (0, 0) in physics space, and the coordinate system places +y upward. The renderer applies a fixed vertical offset (`PIVOT_Y_OFFSET = 0.5`) so the anchor sits slightly above centre on screen.

---

## Interaction Model

All interaction logic lives in `input.ts`, wired together in `main.ts`. Pointer Events are used throughout (rather than separate mouse and touch handlers), and `setPointerCapture` keeps a drag alive even if the cursor leaves the canvas.

### State Machine

The simulation is always in one of two modes:

| Mode | Meaning |
|------|---------|
| `running` | Free simulation. The full RK4 integrator advances all three arms, and the tip position is pushed into the trail. |
| `dragging` | A joint is held. Inverse kinematics drives the arms above it, and the constrained integrator advances the arms below it. The trail is paused. |

On pointer down near a joint the mode switches to `dragging`; on pointer up (or pointer cancel) it returns to `running`, the held momentum is reset, and the trail is cleared so a fresh path is drawn from the new configuration.

### Inverse Kinematics (FABRIK)

When a joint is dragged, the arms between the pivot and that joint are solved with **FABRIK** (Forward And Backward Reaching Inverse Kinematics), an iterative position-based solver:

1. If the target is beyond the chain's total reach, the chain is laid out straight toward the target.
2. Otherwise the solver alternates a backward pass (place the end effector on the target, then walk back toward the root, preserving each segment length) and a forward pass (re-anchor at the root, then walk out toward the target). Ten iterations are sufficient for visually exact convergence on a three-segment chain.

The solved joint positions are converted back into absolute angles with `atan2(dx, -dy)`, matching the angle convention used by the physics. This makes the upper arms lean and rotate naturally toward the cursor instead of a single link rotating in isolation.

### Joint Picking

Hit testing uses a distance-based pick rather than ray intersection against the small joint spheres. The pointer is unprojected into world space, and the nearest grabbable joint within `PICK_RADIUS` (0.6 world units) is selected. This is far more forgiving than requiring a precise hit on a moving 0.1-radius sphere, which makes grabbing responsive even while the pendulum is in fast motion.

### Camera Controls

`OrbitControls` provide pan and zoom:

- **Zoom** with the scroll wheel or pinch gesture, clamped between `minZoom = 0.3` and `maxZoom = 8`, to inspect dense, knotted regions of the trail.
- **Pan** with screen-space panning enabled.
- **Rotation is disabled** (`enableRotate = false`) because the pendulum is strictly planar.
- Damping is enabled for smooth, weighted camera motion.

Controls are temporarily disabled the moment a joint is grabbed, so dragging a mass never fights with a camera pan, and re-enabled on release.

---

## Rendering Pipeline

The visual output is rendered with Three.js using an orthographic camera (no perspective distortion) and a post-processing bloom pass:

1. **WebGLRenderer** -- GPU-accelerated rendering onto an HTML canvas, with antialiasing enabled and pixel ratio capped at 2.
2. **OrthographicCamera** -- A view half-size of 6 units comfortably fits the full pendulum reach (1.5 + 1.5 + 1.5 = 4.5 units). The frustum and renderer are recomputed on window resize.
3. **EffectComposer** -- Chains a standard `RenderPass` with a `BloomEffect` (intensity 1.5, luminance threshold 0.1, luminance smoothing 0.4, mipmap blur). Bright objects in the scene glow naturally through this pass.

The scene contains:

- **Rods** -- The arms are drawn with `Line2` fat lines (`LineGeometry` + `LineMaterial`) in world units. A plain `THREE.Line` ignores line width on most GPUs and always renders one pixel wide, so fat lines are used to give the arms real, zoom-aware thickness. The geometry positions are rewritten each frame, and the material resolution tracks the window size.
- **Joints** -- Four sphere meshes. The first three use a muted light-blue material; the tip is solid white so it crosses the bloom luminance threshold and glows strongly as it moves.
- **Pivot ring** -- A faint, semi-transparent ring at the fixed anchor to make the origin feel intentional.

---

## Trail System

The glowing tail behind the pendulum tip uses a fixed-capacity ring buffer (1000 points in the running configuration). Each frame, while running, the tip's (x, y) position is pushed into the buffer and the oldest point is implicitly evicted once capacity is reached. Grabbing a joint pauses pushes, and releasing clears the buffer so a fresh trail is drawn.

The trail is rendered as a `THREE.Line` with per-vertex RGBA colour. A normalized parameter `t` runs from 0 (oldest point) to 1 (newest point), and the colour gradient is:

```
R = 0.4 + 0.6 * t
G = 0.2 + 0.5 * t
B = 0.9
A = t^1.8
```

This produces a purple-to-cyan gradient that fades out along the tail, with a softer-than-quadratic alpha curve that keeps the older portion of the trail visible.

All GPU buffers (`Float32Array` for positions and colours, `BufferAttribute` wrappers) are allocated once in the constructor and written into in-place every frame. No objects are created in the hot path, eliminating garbage-collection pressure during continuous animation. On each push, the ring buffer is reordered into chronological order within the pre-allocated draw arrays and the colour gradient is recomputed, again without allocating.

---

## Development Plan and Change Log

The project was built and refined in stages. This section records the planning and the major changes at each step.

### Phase 1 - Scaffolding

- Set up a Vite + TypeScript project with strict compiler options.
- Added Three.js and the `postprocessing` library, and configured the GitHub Pages base path (`/Lumen-Pendulum/`) in `vite.config.ts`.
- Created the minimal HTML shell with a single full-viewport canvas.

### Phase 2 - Physics Core

- Derived the planar triple-pendulum equations of motion from the Lagrangian using the absolute-angle convention.
- Implemented the symmetric 3x3 mass matrix and the gravity / velocity-coupling forcing vector.
- Added a Gaussian-elimination solver with partial pivoting and a classical RK4 integrator with 8 sub-steps per frame for stability.
- Added forward kinematics (`getPositions`) to convert angles into joint coordinates.

### Phase 3 - Rendering

- Built the Three.js scene with an orthographic camera sized to the pendulum's reach, plus resize handling.
- Added the bloom post-processing pipeline via `EffectComposer`.
- Drew the rods, the joint spheres (white tip for glow), and a pivot ring.

### Phase 4 - Trail

- Implemented a fixed-capacity ring buffer with pre-allocated, reused draw buffers (zero per-frame allocations).
- Added the per-vertex purple-to-cyan colour and alpha gradient.

### Phase 5 - Deployment and Documentation

- Added a GitHub Actions workflow to type-check, build, and deploy to GitHub Pages on every push to `main`.
- Wrote the project documentation, including the full physics derivation.

### Phase 6 - User Experience Polish

- Added a descriptive overlay (title and hint), a loading spinner with a canvas fade-in, and a colour-coded FPS counter.
- Added favicon and Open Graph / Twitter social-card metadata.

### Phase 7 - Pointer Interaction

- Introduced a `running` / `dragging` state machine driven by unified Pointer Events with pointer capture, supporting both mouse and touch.
- Added the necessary CSS (`touch-action: none`, grab cursors) so dragging never scrolls the page.
- Added `Trail.clear()` so releasing a joint starts a fresh trail.

### Phase 8 - Physical Drag Upgrade (Inverse Kinematics)

- Replaced the original single-link angle rotation, which left the upstream arms frozen and broke physical intuition, with a FABRIK inverse-kinematics solver.
- Dragging a lower joint now makes the arms above it lean, rotate, and align toward the cursor like a real chain being pulled.

### Phase 9 - Free Gravity Below the Grab Point

- Added the constrained integrator (`updateConstrained` / `rk4StepConstrained` / `solveSub`) so the arms below a grabbed joint hang and swing freely under gravity instead of staying rigid.
- Refactored the equations of motion into a shared `buildSystem` helper used by both the full and constrained solvers.

### Phase 10 - Camera Controls

- Added `OrbitControls` for pan and zoom (rotation disabled, damping enabled, zoom clamped), so dense regions of the trail can be inspected. Controls are suspended during a drag to avoid input conflicts.

### Phase 11 - Startup, Picking, and Rendering Refinements

- Changed the initial conditions to small angles near the resting vertical so the simulation opens with slow, gentle motion that gradually builds into chaos.
- Replaced ray-based joint hit testing with a forgiving distance-based pick, making grabs responsive even on a fast-moving pendulum.
- Switched the rods to `Line2` fat lines for real, adjustable thickness, and tuned the line width.

---

## Project Structure

```
Lumen-Pendulum/
  src/
    main.ts        Entry point, scene wiring, animation loop, mesh updates
    physics.ts     Lagrangian EOM, 3x3 and sub-block solvers, full and constrained RK4
    input.ts       Pointer interaction, FABRIK IK, joint picking, state machine
    scene.ts       Three.js renderer, orthographic camera, bloom pipeline, resize
    trail.ts       Ring buffer, per-vertex colour gradient, line mesh
    style.css      Full-viewport layout, loader, overlay, FPS, cursors
    vite-env.d.ts  Vite client type reference
  public/
    favicon.svg    Site favicon
    preview.jpg    Social-card / preview image
  index.html       HTML shell: canvas, overlay, loader, FPS, social metadata
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

**Controls:** drag any mass to reposition it; the arms above follow the cursor while the arms below swing under gravity. Release to let the whole system run. Scroll or pinch to zoom, and drag empty space to pan.

### Build for production

```bash
npm run build
npm run preview
```

---

## Deployment

Deployment to GitHub Pages is fully automated via GitHub Actions. Every push to `main` triggers the workflow defined in `.github/workflows/deploy.yml`:

1. Checks out the repository
2. Sets up Node.js 20 with npm caching
3. Installs dependencies with `npm ci`
4. Runs `npm run build` (`tsc && vite build`) to type-check and bundle
5. Uploads the `dist/` directory as a Pages artifact
6. Deploys to GitHub Pages

To enable: go to **Repository Settings > Pages > Build and deployment** and set the source to **GitHub Actions**.

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Language | TypeScript | Type safety across physics and rendering code |
| Bundler | Vite | Fast dev server, tree-shaking, production builds |
| Rendering | Three.js | WebGL-based scene graph, OrbitControls, fat lines |
| Post-processing | postprocessing | Bloom effect |
| CI/CD | GitHub Actions | Automated build and deploy on push |
| Hosting | GitHub Pages | Static site hosting |

---

## License

This project is open source. See [LICENSE](LICENSE) for details.
