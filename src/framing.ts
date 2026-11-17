import * as THREE from 'three';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Adjusts camera view offset and distance so the 3D runner and letter bridge
 * remain centered inside the unobstructed region between the HUD prompt and on-screen keyboard.
 */
export function applyFraming(
  cam: THREE.PerspectiveCamera,
  w: number,
  h: number,
  insets: Insets
) {
  const safeW = Math.max(1, w);
  const safeH = Math.max(1, h);
  cam.aspect = safeW / safeH;

  const freeW = Math.max(80, safeW - insets.left - insets.right);
  const freeH = Math.max(80, safeH - insets.top - insets.bottom);
  const cx = insets.left + freeW * 0.5;
  const cy = insets.top + freeH * 0.54;

  const offX = safeW * 0.5 - cx;
  const offY = safeH * 0.5 - cy;

  cam.setViewOffset(safeW, safeH, offX, offY, safeW, safeH);
  cam.fov = freeW < freeH ? 52 : 44;
  cam.updateProjectionMatrix();
}
