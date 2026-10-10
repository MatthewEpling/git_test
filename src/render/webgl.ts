let cached: boolean | null = null;

/** Whether WebGL 2 works here. Checked once: every probe creates a real GL context, and
 *  browsers drop the oldest contexts (including the live board's) once too many exist. */
export function webglAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    cached = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
