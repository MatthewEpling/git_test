// Display filters. Each is a single-pass GLSL ES 3.0 fragment shader that samples the
// emulator frame (a sub-rectangle of uSource) and writes the final pixel.

export interface ShaderParam {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface ShaderDef {
  id: string;
  label: string;
  description: string;
  /** Texture filtering used when sampling the frame. */
  filter: 'nearest' | 'linear';
  params: ShaderParam[];
  body: string;
}

export const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** Shared header: uniforms, frame sampling and the colour-adjustment stage. */
const HEADER = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uTexSize;     // full texture size in texels
uniform vec2 uFrameSize;   // emulator frame size in texels
uniform vec2 uOutputSize;  // viewport size in pixels
uniform float uFrame;
uniform vec4 uColor;       // brightness, contrast, saturation, gamma
uniform vec4 uP;           // shader parameters

// Frame-space uv (0..1 over the visible frame) to texture uv.
vec2 toTex(vec2 uv) { return uv * uFrameSize / uTexSize; }
vec3 frameAt(vec2 uv) { return texture(uSource, toTex(clamp(uv, 0.0, 1.0))).rgb; }
vec3 texel(vec2 px) { return texture(uSource, (px + 0.5) / uTexSize).rgb; }

vec3 adjust(vec3 c) {
  c = pow(max(c, 0.0), vec3(1.0 / uColor.w));
  c = (c - 0.5) * uColor.y + 0.5;
  c *= uColor.x;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uColor.z);
  return clamp(c, 0.0, 1.0);
}
`;

export const SHADERS: ShaderDef[] = [
  {
    id: 'nearest',
    label: 'Sharp pixels',
    description: 'No filtering. Crisp, blocky pixels.',
    filter: 'nearest',
    params: [],
    body: `void main() { fragColor = vec4(adjust(frameAt(vUV)), 1.0); }`,
  },
  {
    id: 'bilinear',
    label: 'Smooth (bilinear)',
    description: 'Simple smoothing, like most TVs and upscalers.',
    filter: 'linear',
    params: [],
    body: `void main() { fragColor = vec4(adjust(frameAt(vUV)), 1.0); }`,
  },
  {
    id: 'sharp-bilinear',
    label: 'Sharp bilinear',
    description: 'Keeps pixels sharp but avoids shimmering at non-integer scales.',
    filter: 'linear',
    params: [],
    body: `void main() {
  vec2 texel = vUV * uFrameSize;
  vec2 scale = max(floor(uOutputSize / uFrameSize), vec2(1.0));
  vec2 f = fract(texel);
  vec2 inside = clamp((f - 0.5) * scale + 0.5, 0.0, 1.0);
  vec2 px = floor(texel) + inside;
  fragColor = vec4(adjust(texture(uSource, px / uTexSize).rgb), 1.0);
}`,
  },
  {
    id: 'bicubic',
    label: 'Bicubic (Catmull-Rom)',
    description: 'Sharper smoothing that keeps edges defined.',
    filter: 'linear',
    params: [],
    body: `vec4 cubic(float x) {
  float x2 = x * x, x3 = x2 * x;
  return vec4(-0.5*x3 + x2 - 0.5*x, 1.5*x3 - 2.5*x2 + 1.0, -1.5*x3 + 2.0*x2 + 0.5*x, 0.5*x3 - 0.5*x2);
}
void main() {
  vec2 pos = vUV * uFrameSize - 0.5;
  vec2 f = fract(pos);
  vec2 base = floor(pos);
  vec4 wx = cubic(f.x), wy = cubic(f.y);
  vec3 c = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    vec3 row = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec2 p = clamp(base + vec2(float(i) - 1.0, float(j) - 1.0), vec2(0.0), uFrameSize - 1.0);
      row += texel(p) * wx[i];
    }
    c += row * wy[j];
  }
  fragColor = vec4(adjust(c), 1.0);
}`,
  },
  {
    id: 'crt',
    label: 'CRT',
    description: 'Curved tube, scanlines, shadow mask and a soft glow.',
    filter: 'linear',
    params: [
      { id: 'curvature', label: 'Curvature', min: 0, max: 0.25, step: 0.01, default: 0.08 },
      { id: 'scanlines', label: 'Scanline strength', min: 0, max: 1, step: 0.05, default: 0.55 },
      { id: 'mask', label: 'Shadow mask', min: 0, max: 1, step: 0.05, default: 0.35 },
      { id: 'glow', label: 'Glow', min: 0, max: 1, step: 0.05, default: 0.3 },
    ],
    body: `vec2 curve(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 off = abs(uv.yx) * uP.x;
  uv = uv + uv * off * off;
  return uv * 0.5 + 0.5;
}
void main() {
  vec2 uv = curve(vUV);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 col = frameAt(uv);
  vec2 d = 1.0 / uFrameSize;
  vec3 blur = (frameAt(uv + vec2(d.x, 0.0)) + frameAt(uv - vec2(d.x, 0.0)) + frameAt(uv + vec2(0.0, d.y)) + frameAt(uv - vec2(0.0, d.y))) * 0.25;
  col = mix(col, max(col, blur), uP.w);
  // Scanlines follow the emulated line count; brighter pixels bloom through them.
  float line = sin(uv.y * uFrameSize.y * 3.14159265);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col *= 1.0 - uP.y * (1.0 - lum * 0.6) * (1.0 - line * line) ;
  // Aperture-grille mask in output pixels.
  float m = mod(gl_FragCoord.x, 3.0);
  vec3 mask = vec3(m < 1.0 ? 1.0 : 1.0 - uP.z, (m >= 1.0 && m < 2.0) ? 1.0 : 1.0 - uP.z, m >= 2.0 ? 1.0 : 1.0 - uP.z);
  col *= mask * (1.0 + uP.z * 0.5);
  // Vignette
  vec2 v = uv * (1.0 - uv.yx);
  col *= pow(clamp(v.x * v.y * 15.0, 0.0, 1.0), 0.25);
  fragColor = vec4(adjust(col * (1.0 + uP.y * 0.35)), 1.0);
}`,
  },
  {
    id: 'scanlines',
    label: 'Scanlines',
    description: 'Flat screen with classic dark scanlines.',
    filter: 'linear',
    params: [{ id: 'strength', label: 'Strength', min: 0, max: 1, step: 0.05, default: 0.45 }],
    body: `void main() {
  vec3 col = frameAt(vUV);
  float line = 0.5 + 0.5 * cos(vUV.y * uFrameSize.y * 6.2831853);
  col *= 1.0 - uP.x * line;
  fragColor = vec4(adjust(col * (1.0 + uP.x * 0.4)), 1.0);
}`,
  },
  {
    id: 'lcd',
    label: 'LCD grid',
    description: 'Visible pixel grid with RGB subpixels, like a handheld screen.',
    filter: 'nearest',
    params: [{ id: 'grid', label: 'Grid strength', min: 0, max: 1, step: 0.05, default: 0.5 }],
    body: `void main() {
  vec2 px = vUV * uFrameSize;
  vec2 f = fract(px);
  vec3 col = frameAt(vUV);
  float edge = smoothstep(0.0, 0.12, f.x) * smoothstep(1.0, 0.88, f.x) * smoothstep(0.0, 0.12, f.y) * smoothstep(1.0, 0.88, f.y);
  vec3 sub = vec3(f.x < 0.333 ? 1.0 : 0.75, (f.x >= 0.333 && f.x < 0.666) ? 1.0 : 0.75, f.x >= 0.666 ? 1.0 : 0.75);
  col *= mix(vec3(1.0), sub * edge, uP.x);
  fragColor = vec4(adjust(col * (1.0 + uP.x * 0.3)), 1.0);
}`,
  },
  {
    id: 'fxaa',
    label: 'FXAA (anti-aliasing)',
    description: 'Softens jagged polygon edges in 3D games.',
    filter: 'linear',
    params: [],
    body: `void main() {
  vec2 rcp = 1.0 / uFrameSize;
  vec3 rgbNW = frameAt(vUV + vec2(-1.0, -1.0) * rcp);
  vec3 rgbNE = frameAt(vUV + vec2(1.0, -1.0) * rcp);
  vec3 rgbSW = frameAt(vUV + vec2(-1.0, 1.0) * rcp);
  vec3 rgbSE = frameAt(vUV + vec2(1.0, 1.0) * rcp);
  vec3 rgbM = frameAt(vUV);
  vec3 luma = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, luma), lNE = dot(rgbNE, luma), lSW = dot(rgbSW, luma), lSE = dot(rgbSE, luma), lM = dot(rgbM, luma);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcpMin, vec2(-8.0), vec2(8.0)) * rcp;
  vec3 a = 0.5 * (frameAt(vUV + dir * (1.0 / 3.0 - 0.5)) + frameAt(vUV + dir * (2.0 / 3.0 - 0.5)));
  vec3 b = a * 0.5 + 0.25 * (frameAt(vUV + dir * -0.5) + frameAt(vUV + dir * 0.5));
  float lB = dot(b, luma);
  fragColor = vec4(adjust((lB < lMin || lB > lMax) ? a : b), 1.0);
}`,
  },
  {
    id: 'composite',
    label: 'Composite video',
    description: 'Soft colour bleed and a little noise, like a composite cable.',
    filter: 'linear',
    params: [
      { id: 'bleed', label: 'Colour bleed', min: 0, max: 1, step: 0.05, default: 0.6 },
      { id: 'noise', label: 'Noise', min: 0, max: 0.2, step: 0.01, default: 0.04 },
    ],
    body: `vec3 toYiq(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 toRgb(vec3 c) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * c; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uFrame * 0.618) * 43758.5453); }
void main() {
  float dx = 1.0 / uFrameSize.x;
  vec3 y = toYiq(frameAt(vUV));
  vec3 chroma = vec3(0.0);
  for (int i = -3; i <= 3; i++) chroma += toYiq(frameAt(vUV + vec2(float(i) * dx * (1.0 + uP.x * 2.0), 0.0)));
  chroma /= 7.0;
  vec3 yiq = vec3(y.x, mix(y.yz, chroma.yz, uP.x));
  vec3 col = toRgb(yiq) + (hash(gl_FragCoord.xy) - 0.5) * uP.y;
  fragColor = vec4(adjust(col), 1.0);
}`,
  },
];

export function fragmentSource(def: ShaderDef): string {
  return `${HEADER}\n${def.body}`;
}

export function shaderById(id: string): ShaderDef {
  return SHADERS.find((s) => s.id === id) ?? SHADERS[1];
}
