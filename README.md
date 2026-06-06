<div align="center">

# `▓▒░ [ SCHWARZSCHILD ] ░▒▓`

### BLACK HOLE RENDERER · RAY-MARCHED GRAVITATIONAL LENSING

*A real-time, physically-correct Schwarzschild black hole —*
*one photon per pixel, traced backward through curved spacetime on the GPU.*

<br/>

[![My Skills](https://skillicons.dev/icons?i=ts,html,css,vite,nodejs,git,github&theme=dark)](https://skillicons.dev)

<br/>

![Renderer](https://img.shields.io/badge/RENDERER-WebGL_1.0-e8e8e8?style=flat-square&labelColor=0d0d0d&color=2a2a2a)
![Physics](https://img.shields.io/badge/PHYSICS-GLSL_shader-e8e8e8?style=flat-square&labelColor=0d0d0d&color=2a2a2a)
![Build](https://img.shields.io/badge/BUILD-Vite-e8e8e8?style=flat-square&labelColor=0d0d0d&color=2a2a2a)
![Mode](https://img.shields.io/badge/MODE-real--time_60fps-e8e8e8?style=flat-square&labelColor=0d0d0d&color=2a2a2a)
![License](https://img.shields.io/badge/LICENSE-ISC-e8e8e8?style=flat-square&labelColor=0d0d0d&color=2a2a2a)

```
DRAG TO ORBIT   ::   SCROLL TO ZOOM   ::   TOGGLE LENSING / DISK / QUALITY
```

</div>

---

> A non-rotating (Schwarzschild) black hole rendered in the browser. Every pixel
> fires a photon that is traced backward through curved spacetime using the real
> general-relativity light-bending equation. The glowing accretion disk, the
> Einstein ring, and the lopsided brightness are not painted on. They fall out
> of the physics.

---

## // SYSTEM

```
LANGUAGE   ::  TypeScript (the driver)  +  GLSL (the physics)
RENDER     ::  raw WebGL1, no framework
BUILD      ::  Vite
SIM RUNS   ::  on the GPU, per pixel, every frame
```

The TypeScript never simulates the black hole. It sets up the canvas, reads your
mouse, manages quality, and feeds numbers into the shader each frame. The actual
simulation lives in `src/shaders/blackhole.frag.glsl` and runs on the GPU.

---

## // RUN IT

You need Node.js installed. Then:

```bash
git clone https://github.com/RanimelAndagan/Schwarzschild-black-hole.git
cd Schwarzschild-black-hole
npm install      # rebuilds node_modules from package.json
npm run dev      # starts the renderer
```

Open the localhost link it prints. That is it.

Note: `node_modules` is not in this repo on purpose. It is huge and fully
rebuildable. `npm install` recreates it from `package.json` and
`package-lock.json`, which is why those two small files are all you need.

---

## // CONTROLS

```
> DRAG          orbit the camera around the hole
> SCROLL        zoom in and out
> GRAV_LENSING  toggle the real light bending on / off
> ACCRETION_DISK   toggle the glowing disk
> QUALITY       cycle LOW / MEDIUM / HIGH (photon step budget)
```

---

## // PHENOMENA ON SCREEN

None of these are textures or fakes. They emerge from tracing photons through
curved spacetime — turn the math on and they appear, turn it off and they vanish.

| Phenomenon | What you see | Why it happens |
|---|---|---|
| **Event horizon (shadow)** | The pure-black central disk | Photons that cross `r_s = 2M` can never come back out |
| **Photon sphere** | The thin bright rim hugging the shadow | At `3M`, light can orbit the hole; rays graze it and barely escape |
| **Gravitational lensing** | The whole background warps and bends around the hole | Mass curves spacetime, so light follows curved paths (the `3Mu²` term) |
| **Einstein ring** | A bright ring of smeared, duplicated background stars | A source directly behind the hole is lensed into a full circle |
| **Secondary image** | The far side of the accretion disk wrapped *over the top* of the hole | Light from behind is bent up and over toward your eye |
| **Relativistic beaming** | One side of the disk blazes far brighter than the other | Disk gas moving toward you is Doppler-boosted by `g⁴` |
| **Gravitational redshift** | The disk dims and reddens near the horizon | Light loses energy climbing out of the gravity well (`√(1 − r_s/r)`) |
| **Accretion-disk thermal gradient** | Hot blue-white inner ring cooling to amber then deep red outward | Thin-disk thermodynamics: `T(r) ∝ [(R_in/r)³(1 − √(R_in/r))]^¼` |
| **ISCO inner edge** | The disk stops cleanly at `6M`, not at the horizon | Below the innermost stable circular orbit, no stable orbits exist |

> Toggle **GRAV_LENSING** off to watch the Einstein ring and the wrapped disk
> snap back to a flat, ordinary scene — the cleanest way to *see* general
> relativity doing its work.

---

## // THE PHYSICS

Everything below is real and lives in the fragment shader. Units are geometric
(`G = c = 1`, mass `M = 1`), so distances come out clean.

### Key radii

```
r_s   (event horizon)   =  2M  =  2     the point of no return, the black disk
photon sphere           =  3M  =  3     where light can orbit
ISCO  (disk inner edge) =  6M  =  6     closest a stable orbit can sit
```

### 1. Bending light (the core)

A photon near a mass does not travel straight. Its path obeys the
general-relativity light-deflection equation:

```
d^2u / dphi^2  +  u   =   3 * M * u^2          where u = 1 / r
```

That `3 * M * u^2` term is the entire difference between Einstein and Newton.
Delete it and light goes straight (no lensing, no ring). Re-written in a form the
shader can step through:

```
d^2x / dlambda^2   =   -3 * M * h^2 * x / r^5

h^2 = | x cross v |^2      (angular momentum, conserved, computed once per ray)
```

This is solved per photon with RK4 (a 4th-order numerical integrator) using an
adaptive step: big steps far from the hole where space is nearly flat, small
steps up close where it curves hard. The number of steps is the QUALITY knob.

### 2. The accretion disk glow (thin-disk thermodynamics)

The disk is not a texture. Its temperature at each radius comes from the
Novikov-Thorne / Shakura-Sunyaev thin-disk model:

```
T(r)   proportional to   [ (R_in / r)^3 * (1 - sqrt(R_in / r)) ]^(1/4)
F(r)   proportional to   T^4                 (Stefan-Boltzmann)

R_in = ISCO = 6M
```

The `(1 - sqrt(R_in/r))` factor forces the temperature to zero at the inner edge,
so the hottest ring sits a little outside it (around r approx 8.2M) and then cools
outward. The color comes from a blackbody curve: hot reads blue-white, cooling
reads amber, then deep red.

### 3. Why one side is brighter (relativistic Doppler + redshift)

The disk gas orbits at a large fraction of light speed, so the side coming toward
you brightens and blue-shifts. The shader folds two real effects into one factor:

```
g      =  grav * delta

grav   =  sqrt(1 - r_s / r)                  gravitational redshift (climbing out)
beta   =  sqrt(M / r)                        Keplerian orbital speed (c = 1)
gamma  =  1 / sqrt(1 - beta^2)
delta  =  1 / (gamma * (1 - beta * cosA))    special-relativistic Doppler boost

T_obs  =  g * T_emit        (observed color shifts with g)
I_obs  =  g^4 * I_emit       (relativistic beaming, the approaching side blazes)
```

The `g^4` beaming is why the approaching side is genuinely, dramatically brighter.
Same effect you see in the M87 image and in Interstellar.

### 4. The lensed starfield

Background stars are sampled by each photon's FINAL, already-bent direction. So
stars near the hole smear into arcs and Einstein rings on their own, because the
escaping rays leave at deflected angles. No special code for the ring. It is just
the bending applied to the background.

---

## // WHAT I LEARNED

Things that were new to me on this project (the language basics are in my private
notes, this is the bigger-picture stuff):

### GPU vs CPU is the whole game

A black hole render means doing the ray-marching math for every pixel (millions)
every frame (60 times a second). Only the GPU can do that, because it runs
thousands of cores in parallel. The CPU works mostly one thing at a time and would
take seconds or minutes per frame. The language (TypeScript, C++, whatever) is just
the wrapper. The GPU shader is what makes it fast.

### WebGL is OpenGL for the browser

Other black hole projects written in C++ use OpenGL plus shaders. This project uses
WebGL plus shaders. Same idea, same shader language (GLSL), different doorway. The
real divide was never C++ vs TypeScript. It was always CPU vs GPU. A C++ black hole
on the CPU would be just as slow.

### The build chain

```
npm run dev  ->  Vite  ->  index.html  ->  /src/main.ts  ->  imports gl, camera, shaders
```

`package.json` scripts launch Vite. Vite uses `index.html` as the front door.
`index.html` loads `main.ts`. `main.ts` imports everything else, including the
shaders as raw strings (`?raw`). The config files exist to keep every link in that
chain legal. The browser cannot run TypeScript directly, so for a public page the
project must be built first (`npm run build`).

### You do not commit node_modules

`npm init` makes `package.json`. `npm install` generates `package-lock.json` and
the giant `node_modules` folder. Two requested packages exploded into dozens of
folders, because they pull in their own dependencies. None of it goes in the repo,
because `package.json` plus `package-lock.json` is enough to rebuild it exactly.
`.gitignore` is what tells git to skip it.

---

## // BUGS I FOUGHT

The war stories, because the lessons are worth more than the fixes.

### The error screen that lied

The page showed "WebGL could not start on this device," so I chased browsers,
hardware acceleration, GPU settings. None of it was the problem. That overlay is a
generic catch-all. It fires for ANY failure during startup, and the real failure
was typos in the shader that stopped it from compiling. Lessons:

```
> GLSL is not checked until the GPU compiles it at runtime.
  The editor never squiggles it, so typos sail through.
> GLSL compiles all-or-nothing. One typo blanks the whole screen,
  same as twelve typos. No partial render to hint you are close.
> The real error was in the browser console (F12) the entire time.
  The overlay was just the polite face on top.
```

It was the cheapest kind of bug (spelling) wearing the scariest costume (a
hardware error). The physics underneath was correct the whole time.

### The black hole that faded when zooming out

Zooming out slowly dissolved the hole into stars. It was not the distance cap. Each
photon has a fixed step budget, and from far away the photons ran out of steps
before they ever reached the hole, so they exited to the background. Fix: cap the
zoom at a distance the lowest quality tier can still reach.

### The quality button that fought back

The button only worked after several fast clicks. An automatic FPS governor was
changing the quality every frame and overriding my clicks. Fix: when the user picks
a quality manually, the governor backs off (same pattern the camera uses to stop
its idle spin once you grab it).

### The missing /* that broke everything

One file lost the `/*` that opens its top comment block. Without it, a line of equals
signs looked like a merge conflict marker to the bundler, and nothing built. One
two-character fix brought it all back.

### Git, the hard way

Pushed to the wrong branch, hit "unrelated histories," committed conflict markers,
opened Vim by accident, fought "fetch first" rejections. Came out the other side
actually understanding pull-before-push, branches, collaborators, and tokens.

---

## // CREDITS

**Contributors**

- `RanimelAndagan` :: WebGL / GLSL shaders, HTML, TypeScript, project lead, this README :: [profile](https://github.com/RanimelAndagan)
- `emerjameszk-hue` (Emerson James) :: WebGL / GLSL shaders :: [profile](https://github.com/emerjameszk-hue)
- `LawrenceSuizo` :: HTML and TypeScript :: [profile](https://github.com/LawrenceSuizo)

The physics and the math were worked out with help from an AI assistant (Claude),
which also guided the debugging and the project decisions. The coding itself was
done by the contributors above (with Claude Code handling the actual edits). We
wrote this README, broke the project many times, and learned how all of it fits
together.

Built at midnight, mostly. Worth it.

---

## // DEMO

<div align="center">

<!--
  TO ADD THE VIDEO:
  Open this README on github.com → click the pencil (Edit) → drag your
  .mp4 / .mov / .webm file into the editor. GitHub uploads it and inserts a
  https://github.com/user-attachments/assets/... link that auto-embeds as a
  player. Paste that link in place of the line below, then commit.
-->

https://github.com/user-attachments/assets/REPLACE-WITH-UPLOADED-VIDEO

*▲ Real-time capture — orbiting the hole, the Einstein ring, and the beamed disk.*

</div>

```
==============================================================================
   END OF LINE
==============================================================================
```
