/* =================================================================
   Entry point: canvas + GL setup, the render loop, camera input, HUD wiring,
   and the QUALITY / FPS-governor system.

   The heavy lifting (the physics) is in src/shaders/blackhole.frag.glsl.
   Here we just feed it uniforms each frame and keep the frame rate healthy.
   ============================================================================ */

import vertSrc from "./shaders/fullscreen.vert.glsl?raw";
import fragSrc from "./shaders/blackhole.frag.glsl?raw";
import {
  createContext,
  createProgram,
  getUniforms,
  setupFullscreenTriangle,
  type Uniforms,
} from "./gl";
import { createCamera, computeBasis, type CameraState } from "./camera";

// r_s = 2M = 2 in our units; camera distances are reported in r_s.
const R_S = 2.0;

/* ---------------------------------------------------------------------------
   Quality tiers. Each tier sets BOTH the integration step budget (the shader's
   uSteps) and the render-resolution scale. The governor moves between tiers;
   the user can also cycle them manually with the QUALITY chip.
   Default = MEDIUM (index 1), per spec.
   --------------------------------------------------------------------------- */
interface QualityTier {
  name: string;
  steps: number; // photon integration steps per ray
  scale: number; // render-resolution multiplier (lower = faster, softer)
}
const TIERS: readonly QualityTier[] = [
  { name: "LOW", steps: 96, scale: 0.5 },
  { name: "MEDIUM", steps: 180, scale: 0.65 },
  { name: "HIGH", steps: 320, scale: 0.8 },
];
let tierIndex = 1;

/* ---------------------------------------------------------------------------
   DOM lookups (all guaranteed present in index.html).
   --------------------------------------------------------------------------- */
const canvas = document.getElementById("gl") as HTMLCanvasElement;
const errEl = document.getElementById("err") as HTMLDivElement;
const rCamEl = document.getElementById("r-cam") as HTMLElement;
const rStepsEl = document.getElementById("r-steps") as HTMLElement;
const rQualEl = document.getElementById("r-qual") as HTMLElement;
const rLensEl = document.getElementById("r-lens") as HTMLElement;
const tSpin = document.getElementById("t-spin") as HTMLElement;
const tLens = document.getElementById("t-lens") as HTMLElement;
const tDisk = document.getElementById("t-disk") as HTMLElement;
const tQual = document.getElementById("t-qual") as HTMLElement;
const tQualLabel = document.getElementById("t-qual-label") as HTMLElement;

/* ---------------------------------------------------------------------------
   GL bootstrap. Any failure shows the graceful overlay and stops.
   --------------------------------------------------------------------------- */
let gl: WebGLRenderingContext;
let program: WebGLProgram;
let uniforms: Uniforms;
try {
  gl = createContext(canvas);
  program = createProgram(gl, vertSrc, fragSrc);
  gl.useProgram(program);
  setupFullscreenTriangle(gl, program);
  uniforms = getUniforms(gl, program);
} catch (e) {
  console.error(e);
  errEl.style.display = "flex";
  throw e; // stop module execution; nothing else can run without GL
}

/* ---------------------------------------------------------------------------
   State.
   --------------------------------------------------------------------------- */
const cam: CameraState = createCamera();
let lensingOn = true;
let diskOn = true;

// Cap devicePixelRatio like the reference so big retina displays don't melt.
const dpr = () => Math.min(window.devicePixelRatio || 1, 1.5);

/** Resize the backing store to clientSize * dpr * tier.scale (the low-res
 *  framebuffer we upscale from). CSS keeps the canvas full-screen; the browser
 *  scales the smaller buffer up, and the HTML HUD on top stays crisp. */
function resize(): void {
  const scale = dpr() * TIERS[tierIndex].scale;
  const w = Math.max(1, Math.floor(canvas.clientWidth * scale));
  const h = Math.max(1, Math.floor(canvas.clientHeight * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);

/* ---------------------------------------------------------------------------
   Input: drag to orbit, scroll to zoom (matches the reference exactly).
   pointer events => works for both mouse and touch. wheel is passive:false so
   we can preventDefault the page scroll.
   --------------------------------------------------------------------------- */
let dragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  cam.autoYaw = false; // user took over; stop the idle spin
  tSpin.classList.toggle("on", false); // keep the Auto_Orbit chip in sync
  lastX = e.clientX;
  lastY = e.clientY;
  document.body.classList.add("dragging");
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  cam.yaw -= (e.clientX - lastX) * 0.006;
  cam.pitch += (e.clientY - lastY) * 0.006;
  cam.pitch = Math.max(-1.35, Math.min(1.35, cam.pitch)); // avoid pole flip
  lastX = e.clientX;
  lastY = e.clientY;
});
function endDrag(): void {
  dragging = false;
  document.body.classList.remove("dragging");
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    // cap zoom-out at 55 units, which keeps the camera within the LOW-tier
    // (96-step) photon reach so the marcher always integrates the hole and it
    // never fades out.
    cam.dist = Math.max(10, Math.min(55, cam.dist + e.deltaY * 0.02));
  },
  { passive: false },
);

/* ---------------------------------------------------------------------------
   Toggles + quality chip.
   --------------------------------------------------------------------------- */
tSpin.addEventListener("click", () => {
  // re-enable the idle orbit on demand; pointerdown turns it back off
  cam.autoYaw = !cam.autoYaw;
  tSpin.classList.toggle("on", cam.autoYaw);
});
tLens.addEventListener("click", () => {
  lensingOn = !lensingOn;
  tLens.classList.toggle("on", lensingOn);
  rLensEl.textContent = lensingOn ? "on" : "off";
});
tDisk.addEventListener("click", () => {
  diskOn = !diskOn;
  tDisk.classList.toggle("on", diskOn);
});
tQual.addEventListener("click", () => {
  // user took over: stop the FPS governor from overriding manual choices
  autoQuality = false;
  // manual cycle LOW -> MEDIUM -> HIGH -> LOW
  tierIndex = (tierIndex + 1) % TIERS.length;
  // clear any mid-threshold accumulation so nothing fires right after
  lowAccum = 0;
  highAccum = 0;
  applyTier();
});

/** Push the current tier to the HUD chip + readout and resize the buffer. */
function applyTier(): void {
  const tier = TIERS[tierIndex];
  tQualLabel.textContent = tier.name;
  rQualEl.textContent = tier.name;
  rStepsEl.textContent = `${tier.steps} / ray`;
  resize();
}

/* ---------------------------------------------------------------------------
   FPS governor. Rolling-average frame time; if we sit below ~50fps for ~1s we
   drop a tier, if comfortably above ~58fps for ~1s we climb one. Keeps a weak
   GPU smooth without the user touching anything.
   --------------------------------------------------------------------------- */
let avgDt = 1 / 60; // seconds, exponential moving average
let lowAccum = 0; // seconds spent below the low watermark
let highAccum = 0; // seconds spent above the high watermark
let autoQuality = true; // false once the user clicks QUALITY (manual override)

function governor(dt: number): void {
  // once the user picks a tier manually, stop auto-adjusting so the choice sticks
  if (!autoQuality) return;
  // EMA smooths out single-frame spikes (GC, tab focus, etc.)
  avgDt += (dt - avgDt) * 0.1;
  const fps = 1 / avgDt;

  if (fps < 50) {
    lowAccum += dt;
    highAccum = 0;
  } else if (fps > 58) {
    highAccum += dt;
    lowAccum = 0;
  } else {
    lowAccum = 0;
    highAccum = 0;
  }

  if (lowAccum > 1.0 && tierIndex > 0) {
    tierIndex--;
    applyTier();
    lowAccum = 0;
  } else if (highAccum > 1.0 && tierIndex < TIERS.length - 1) {
    tierIndex++;
    applyTier();
    highAccum = 0;
  }
}

/* ---------------------------------------------------------------------------
   Render loop. Pauses entirely when the tab is hidden; idles to a lower frame
   rate when nothing is moving (no drag, no autospin) to save the GPU.
   --------------------------------------------------------------------------- */
const startTime = performance.now();
let lastFrame = startTime;
let rafId = 0;
let idleTimer = 0;

function isIdle(): boolean {
  return !dragging && !cam.autoYaw;
}

function render(now: number): void {
  const dt = Math.min((now - lastFrame) / 1000, 0.1); // clamp huge gaps
  lastFrame = now;
  const t = (now - startTime) / 1000;

  if (cam.autoYaw) cam.yaw += 0.0016; // gentle idle spin

  const basis = computeBasis(cam);
  const tier = TIERS[tierIndex];

  gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
  gl.uniform1f(uniforms.uTime, t);
  // spread the readonly tuples into mutable arrays for the GL typings
  gl.uniform3fv(uniforms.uCamPos, [...basis.pos]);
  gl.uniform3fv(uniforms.uCamRight, [...basis.right]);
  gl.uniform3fv(uniforms.uCamUp, [...basis.up]);
  gl.uniform3fv(uniforms.uCamFwd, [...basis.fwd]);
  gl.uniform1f(uniforms.uLensing, lensingOn ? 1 : 0);
  gl.uniform1f(uniforms.uDisk, diskOn ? 1 : 0);
  gl.uniform1i(uniforms.uSteps, tier.steps);

  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // live HUD readout: camera distance in r_s
  rCamEl.textContent = `${(cam.dist / R_S).toFixed(2)} rₛ`;

  governor(dt);

  // schedule the next frame: full rAF when active, throttled when idle
  if (isIdle()) {
    // ~30fps idle — still animates the disk swirl but halves the GPU load
    idleTimer = window.setTimeout(() => {
      rafId = requestAnimationFrame(render);
    }, 33);
  } else {
    rafId = requestAnimationFrame(render);
  }
}

function startLoop(): void {
  lastFrame = performance.now();
  rafId = requestAnimationFrame(render);
}
function stopLoop(): void {
  cancelAnimationFrame(rafId);
  clearTimeout(idleTimer);
}

// Pause completely while the tab is hidden; resume on return.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopLoop();
  else startLoop();
});

/* ---------------------------------------------------------------------------
   Go.
   --------------------------------------------------------------------------- */
applyTier(); // sets HUD + initial resize
rLensEl.textContent = lensingOn ? "on" : "off";
startLoop();
