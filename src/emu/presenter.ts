// Draws emulator frames onto the visible canvas through the selected display filter.
//
// The core renders into its own WebGL2 canvas; each frame is copied into a texture here.
// Keeping the two contexts separate means the filters can never disturb the core's GL
// state (Flycast caches a lot of it).

import { fragmentSource, shaderById, VERTEX_SHADER } from './shaders';
import type { VideoFrame } from './core';

export type AspectMode = 'auto' | '4:3' | '16:9' | 'stretch';

export interface PresenterSettings {
  shader: string;
  params: Record<string, number>;
  aspect: AspectMode;
  integerScale: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
}

export const DEFAULT_PRESENTER: PresenterSettings = {
  shader: 'bilinear',
  params: {},
  aspect: 'auto',
  integerScale: false,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  gamma: 1,
};

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export class Presenter {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture;
  private quad: WebGLBuffer;
  private programs = new Map<string, Program>();
  private texW = 1;
  private texH = 1;
  private frameW = 640;
  private frameH = 480;
  private frameCount = 0;
  private hasFrame = false;
  settings: PresenterSettings = { ...DEFAULT_PRESENTER };
  /** Display aspect ratio the core reports (usually 4:3, wider with the widescreen hack). */
  coreAspect = 4 / 3;
  /** Last viewport in CSS pixels relative to the canvas, for mapping light-gun coordinates. */
  viewport = { x: 0, y: 0, w: 1, h: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private program(id: string): Program {
    const cached = this.programs.get(id);
    if (cached) return cached;
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`Shader ${id}: ${gl.getShaderInfoLog(sh)}`);
      return sh;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource(shaderById(id))));
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Shader ${id}: ${gl.getProgramInfoLog(program)}`);
    const uniforms: Program['uniforms'] = {};
    for (const name of ['uSource', 'uTexSize', 'uFrameSize', 'uOutputSize', 'uFrame', 'uColor', 'uP']) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    const p = { program, uniforms };
    this.programs.set(id, p);
    return p;
  }

  /** Checks every filter compiles (used by tests and to fail fast on odd GPUs). */
  compileAll(ids: string[]) {
    for (const id of ids) this.program(id);
  }

  /** Copies a frame from the core into the display texture. */
  upload(frame: VideoFrame, coreCanvas: HTMLCanvasElement) {
    if (frame.kind === 'dupe') return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (frame.kind === 'hw') {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, coreCanvas);
      this.texW = coreCanvas.width;
      this.texH = coreCanvas.height;
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, frame.width, frame.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame.rgba);
      this.texW = frame.width;
      this.texH = frame.height;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.frameW = Math.min(frame.width, this.texW);
    this.frameH = Math.min(frame.height, this.texH);
    this.hasFrame = true;
  }

  private lastDrawn: { w: number; h: number; settings: PresenterSettings | null } = { w: 0, h: 0, settings: null };

  /** True when a redraw would change what's on screen (used while paused). */
  needsRedraw(): boolean {
    return this.lastDrawn.w !== this.canvas.width || this.lastDrawn.h !== this.canvas.height || this.lastDrawn.settings !== this.settings;
  }

  /** Matches the drawing buffer to the canvas's on-screen size. */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private displayAspect(): number {
    switch (this.settings.aspect) {
      case '4:3':
        return 4 / 3;
      case '16:9':
        return 16 / 9;
      case 'stretch':
        return this.canvas.width / this.canvas.height;
      default:
        return this.coreAspect || 4 / 3;
    }
  }

  draw() {
    const gl = this.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    this.lastDrawn = { w: cw, h: ch, settings: this.settings };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.hasFrame) return;

    const aspect = this.displayAspect();
    let w = cw;
    let h = Math.round(cw / aspect);
    if (h > ch) {
      h = ch;
      w = Math.round(ch * aspect);
    }
    if (this.settings.integerScale && this.settings.aspect !== 'stretch') {
      // Scale the frame height by a whole number; width follows the aspect ratio.
      const scale = Math.floor(h / this.frameH);
      if (scale >= 1) {
        h = this.frameH * scale;
        w = Math.round(h * aspect);
      }
    }
    const x = Math.floor((cw - w) / 2);
    const y = Math.floor((ch - h) / 2);
    gl.viewport(x, y, w, h);
    const dpr = cw / Math.max(1, this.canvas.clientWidth);
    this.viewport = { x: x / dpr, y: (ch - y - h) / dpr, w: w / dpr, h: h / dpr };

    const def = shaderById(this.settings.shader);
    const p = this.program(def.id);
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const filter = def.filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    const u = p.uniforms;
    gl.uniform1i(u.uSource, 0);
    gl.uniform2f(u.uTexSize, this.texW, this.texH);
    gl.uniform2f(u.uFrameSize, this.frameW, this.frameH);
    gl.uniform2f(u.uOutputSize, w, h);
    gl.uniform1f(u.uFrame, this.frameCount++ % 100000);
    const s = this.settings;
    gl.uniform4f(u.uColor, s.brightness, s.contrast, s.saturation, s.gamma);
    const values = def.params.map((param) => s.params[`${def.id}.${param.id}`] ?? param.default);
    gl.uniform4f(u.uP, values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** PNG data URL of what is on screen right now. */
  snapshot(maxWidth = 0): string {
    if (!maxWidth || this.canvas.width <= maxWidth) return this.canvas.toDataURL('image/png');
    const c = document.createElement('canvas');
    c.width = maxWidth;
    c.height = Math.round((this.canvas.height / this.canvas.width) * maxWidth);
    c.getContext('2d')!.drawImage(this.canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }

  /** Converts a client (CSS pixel) position to the frame's -1..1 range; null if outside. */
  toFrameCoords(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.canvas.getBoundingClientRect();
    const vx = (clientX - r.left - this.viewport.x) / this.viewport.w;
    const vy = (clientY - r.top - this.viewport.y) / this.viewport.h;
    if (vx < 0 || vx > 1 || vy < 0 || vy > 1) return null;
    return { x: vx * 2 - 1, y: vy * 2 - 1 };
  }

  /** Releases GPU resources. The canvas belongs to the page, so its context is left alive. */
  destroy() {
    const gl = this.gl;
    for (const p of this.programs.values()) gl.deleteProgram(p.program);
    this.programs.clear();
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.quad);
  }
}
