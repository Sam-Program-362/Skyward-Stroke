import type { PerspectiveCamera } from 'three';

/** Space, in CSS pixels, taken up along each edge of the canvas by things drawn over it. */
export interface Insets { top: number; right: number; bottom: number; left: number }

type V3 = [number, number, number];

export interface Framing {
  freeW: number; freeH: number;
  /** Vertical field of view across the free area, in degrees. */
  fov: number;
  /** Unit vector from the track toward the camera. */
  back: V3;
  /** Camera position relative to the runner's spot on the track. */
  offset: V3;
  /** How far back the camera sits. */
  dist: number;
  /** Share of that distance a full combo closes. */
  dolly: number;
}

/*
 * The "free area" is the part of the canvas nothing is drawn over: below the prompt and above
 * the on-screen keyboard. Its shape (width / height) decides the camera angle:
 *   az     how far the camera swings round to the side of the track (0 = straight behind the runner)
 *   el     how steeply it looks down
 *   ahead  how much track in front of the runner has to stay in view
 * Shapes in between are blended.
 */
const VIEWS = [
  { aspect: 0.9, az: 47, el: 39, ahead: 6.5 }, // tall or square: a phone held upright
  { aspect: 1.7, az: 59, el: 33, ahead: 12 },  // wide: desktop and tablets (the original desktop angle)
  { aspect: 2.5, az: 59, el: 33, ahead: 12 },
  { aspect: 5.0, az: 70, el: 27, ahead: 13 },  // letterbox strip: a phone held sideways with the keyboard up
];

/** A combo dollies the camera toward this point, just ahead of the runner. */
const ANCHOR: V3 = [2.5, 1, 0];
/** Fraction of the free area the action may fill. */
const FILL = 0.93;

const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function viewFor(aspect: number) {
  const la = Math.log(aspect);
  let i = 0;
  while (i < VIEWS.length - 2 && la > Math.log(VIEWS[i + 1].aspect)) i++;
  const a = VIEWS[i], b = VIEWS[i + 1];
  const t = clamp((la - Math.log(a.aspect)) / (Math.log(b.aspect) - Math.log(a.aspect)), 0, 1);
  return { az: lerp(a.az, b.az, t), el: lerp(a.el, b.el, t), ahead: lerp(a.ahead, b.ahead, t) };
}

/** Work out where the camera has to be for a canvas of w x h with `insets` covered up. */
export function frameView(w: number, h: number, insets: Insets): Framing {
  const freeW = Math.max(80, w - insets.left - insets.right);
  const freeH = Math.max(60, h - insets.top - insets.bottom);
  const aspect = freeW / freeH;
  const view = viewFor(aspect);

  // Lens: about 42 degrees across the narrower side (as before), opening up for tall areas, and
  // never more than about 64 degrees across so that very wide areas don't stretch at the edges.
  let tanV = clamp(0.385 / aspect, 0.384, 0.625);
  if (tanV * aspect > 0.62) tanV = 0.62 / aspect;
  const tanH = tanV * aspect;

  const az = view.az * RAD, el = view.el * RAD;
  const back: V3 = [-Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
  const fwd: V3 = [-back[0], -back[1], -back[2]];
  const right: V3 = [Math.sin(az), 0, Math.cos(az)];
  const up: V3 = [Math.cos(az) * Math.sin(el), Math.cos(el), -Math.sin(az) * Math.sin(el)];

  // Everything that has to stay in view, relative to the runner: the runner plus the next few
  // floating letters at full height, then the track further ahead at ground level only.
  const tH = tanH * FILL, tV = tanV * FILL;
  let R = -Infinity, L = -Infinity, T = -Infinity, B = -Infinity;
  const include = (x: number, y: number, z: number) => {
    const px = x * right[0] + y * right[1] + z * right[2];
    const py = x * up[0] + y * up[1] + z * up[2];
    const pz = x * fwd[0] + y * fwd[1] + z * fwd[2];
    R = Math.max(R, px / tH - pz); L = Math.max(L, -px / tH - pz);
    T = Math.max(T, py / tV - pz); B = Math.max(B, -py / tV - pz);
  };
  for (const z of [-0.85, 0.85]) {
    for (const y of [-0.4, 2.25]) { include(-1.5, y, z); include(4.2, y, z); }
    include(view.ahead, -0.4, z); include(view.ahead, 0.7, z);
  }

  // The closest distance at which all of it fits, then where to stand at that distance.
  const dist = Math.max((R + L) / 2, (T + B) / 2);
  const cx = lerp((R - dist) * tH, (dist - L) * tH, 0.75); // spare width goes in front of the runner
  const cy = lerp((T - dist) * tV, (dist - B) * tV, 0.5);  // spare height is split evenly
  const offset = [0, 1, 2].map(i => right[i] * cx + up[i] * cy - fwd[i] * dist) as V3;

  const dolly = 0.25 - 0.13 * clamp((aspect - 2.5) / 2.5, 0, 1);
  return { freeW, freeH, fov: (2 * Math.atan(tanV)) / RAD, back, offset, dist, dolly };
}

/** Point the camera and set its lens. Call whenever the framing changes. */
export function applyFraming(camera: PerspectiveCamera, f: Framing, w: number, h: number, insets: Insets) {
  camera.fov = f.fov;
  // The lens describes the free area only; this widens the picture to cover the whole canvas.
  camera.setViewOffset(f.freeW, f.freeH, -insets.left, -insets.top, w, h);
  camera.up.set(0, 1, 0);
  camera.position.set(f.back[0], f.back[1], f.back[2]);
  camera.lookAt(0, 0, 0);
}

/** Move the camera along with the runner. `zoom` runs from 0 (no combo) to 1 (full combo). */
export function placeCamera(camera: PerspectiveCamera, f: Framing, runnerX: number, zoom: number) {
  const k = 1 - f.dolly * zoom;
  camera.position.set(
    runnerX + ANCHOR[0] + (f.offset[0] - ANCHOR[0]) * k,
    ANCHOR[1] + (f.offset[1] - ANCHOR[1]) * k,
    ANCHOR[2] + (f.offset[2] - ANCHOR[2]) * k,
  );
}
