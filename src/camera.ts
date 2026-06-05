/* Camera: an orbit camera described by yaw / pitch / distance  */

export type Vec3 = readonly [number, number, number];

/** Mutable orbit-camera state driven by user input. */
export interface CameraState {
  yaw: number;       // radians, around the vertical (y) axis
  pitch: number;     // radians, clamped so we never flip over the poles
  dist: number;      // distance from the origin, geometric units (M = 1)
  autoYaw: boolean;  // slow idle spin until the user first drags
}

/** Derived per-frame basis handed to the shader as uniforms. */
export interface CameraBasis {
  pos: Vec3;    // world position of the camera
  fwd: Vec3;    // forward direction, ALREADY scaled by focal length
  right: Vec3;  // right direction (unit)
  up: Vec3;     // up direction (unit)
}

/** Focal length: larger = narrower field of view (more "zoomed" lens). */
export const FOCAL = 1.6;

/** Sensible default view: slightly above the disk plane, mid distance. */
export function createCamera(): CameraState {
  return { yaw: 0.6, pitch: 0.16, dist: 30, autoYaw: true };
}

// --- tiny vector helpers (kept local; not worth a dependency) ----------------
function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Build the camera basis from the orbit state.
 * Position is the usual spherical mapping; forward points back at the origin.
 */
export function computeBasis(cam: CameraState): CameraBasis {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);

  const pos: Vec3 = [cam.dist * cp * sy, cam.dist * sp, cam.dist * cp * cy];
  const fwd = norm([-pos[0], -pos[1], -pos[2]]);     // look at the origin
  const right = norm(cross(fwd, [0, 1, 0]));         // world-up reference
  const up = norm(cross(right, fwd));                // orthogonal to both

  return { pos, fwd, right, up };
}
