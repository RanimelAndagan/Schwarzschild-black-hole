/* ============================================================================
   WebGL helper functions — this is where we make the GL context, compile the
   shaders, and grab the uniforms.
   It's plain WebGL1, no library or framework. If something breaks, each function
   throws an error (with the message GL gives back) so main.ts can show the
   ".err" screen instead of just a blank black canvas.
   ============================================================================ */

/** All the uniforms the black hole shader uses. */
export interface Uniforms {
  uRes: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uCamPos: WebGLUniformLocation | null;
  uCamRight: WebGLUniformLocation | null;
  uCamUp: WebGLUniformLocation | null;
  uCamFwd: WebGLUniformLocation | null;
  uLensing: WebGLUniformLocation | null;
  uDisk: WebGLUniformLocation | null;
  uSteps: WebGLUniformLocation | null;
}

/** Create a WebGL1 context, or throw if the device can't provide one. */
export function createContext(canvas: HTMLCanvasElement): WebGLRenderingContext {
  const gl =
    canvas.getContext("webgl") ||
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
  if (!gl) throw new Error("WebGL is not available on this device.");
  return gl;
}

/** Compile a single shader stage; throw with the info log on failure. */
function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to allocate a shader object.");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "(no log)";
    gl.deleteShader(shader);
    const stage = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
    throw new Error(`${stage} shader failed to compile:\n${log}`);
  }
  return shader;
}

/** Compile + link the vertex/fragment pair into a ready-to-use program. */
export function createProgram(
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to allocate a program object.");

  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "(no log)";
    throw new Error(`Program failed to link:\n${log}`);
  }
  // Shaders are baked into the program; the standalone objects can go.
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

/** Look up every uniform location once, up front. */
export function getUniforms(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
): Uniforms {
  const at = (name: string) => gl.getUniformLocation(program, name);
  return {
    uRes: at("uRes"),
    uTime: at("uTime"),
    uCamPos: at("uCamPos"),
    uCamRight: at("uCamRight"),
    uCamUp: at("uCamUp"),
    uCamFwd: at("uCamFwd"),
    uLensing: at("uLensing"),
    uDisk: at("uDisk"),
    uSteps: at("uSteps"),
  };
}

/**
 * Bind the full-screen triangle: three vertices that cover clip space.
 * Returns nothing — it wires the attribute and leaves it enabled for drawing.
 */
export function setupFullscreenTriangle(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
): void {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // (-1,-1) (3,-1) (-1,3): one oversized triangle, no diagonal seam.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
}
