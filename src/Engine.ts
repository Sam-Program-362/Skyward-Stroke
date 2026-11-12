import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { World, Look } from './data';
import { OUTFITS } from './data';
import { frameView, applyFraming, placeCamera, type Framing, type Insets } from './framing';

const STEP = 1.15;
const TIER_COLORS = ['', '#3fd67a', '#ffc53d', '#ff5fd2'];
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

interface Block { g: THREE.Group; mat: THREE.MeshStandardMaterial; placed: boolean; t: number; x: number; seed: number; pulse: number; lmat?: THREE.MeshBasicMaterial }
interface Particle { m: THREE.Mesh; v: THREE.Vector3; life: number; max: number }

const letterCache = new Map<string, THREE.Texture>();
function letterTex(ch: string) {
  if (letterCache.has(ch)) return letterCache.get(ch)!;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.font = '900 92px "Arial Rounded MT Bold", "Nunito", Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillText(ch.toUpperCase(), 66, 72);
  x.fillStyle = '#fff'; x.fillText(ch.toUpperCase(), 64, 68);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  letterCache.set(ch, t); return t;
}

function buildChar(look: Look, ghost = false) {
  const g = new THREE.Group();
  const outfit = OUTFITS.find(o => o.id === look.outfit)?.color || '#3b6dff';
  const mk = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, transparent: ghost, opacity: ghost ? 0.35 : 1, depthWrite: !ghost });
  const skin = mk(ghost ? '#bfe3ff' : '#fbf6f0'), shirt = mk(ghost ? '#bfe3ff' : outfit), pants = mk(ghost ? '#bfe3ff' : '#2d3550'), shoe = mk(ghost ? '#bfe3ff' : '#ff4757');
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.32, 6, 12), shirt); body.position.y = 0.72; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), skin); head.position.y = 1.28; g.add(head);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0, 0.48, s * 0.13);
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 4, 8), pants); l.position.y = -0.2; leg.add(l);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.16), shoe); sh.position.set(0.04, -0.4, 0); leg.add(sh);
    g.add(leg); legs.push(leg);
  }
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(0, 0.95, s * 0.32);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.25, 4, 8), shirt); a.position.y = -0.2; arm.add(a);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), skin); h.position.y = -0.38; arm.add(h);
    g.add(arm); arms.push(arm);
  }
  if (!ghost) {
    if (look.hat === 'hair') {
      const m = mk('#ff6a2b');
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m); hair.position.y = 1.31; hair.rotation.z = 0.25; g.add(hair);
    } else if (look.hat === 'cap') {
      const m = mk('#ff3b5c');
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), m); c.position.y = 1.33; g.add(c);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16), m); brim.position.set(0.28, 1.36, 0); brim.scale.set(1.2, 1, 0.9); g.add(brim);
    } else if (look.hat === 'beanie') {
      const m = mk('#ffd23d');
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.345, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m); c.position.y = 1.32; g.add(c);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mk('#fff')); p.position.y = 1.68; g.add(p);
    } else if (look.hat === 'crown') {
      const m = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.8, roughness: 0.25 });
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.18, 5, 1, true), m); c.position.y = 1.62; g.add(c);
      for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), m); const a = (i / 5) * Math.PI * 2; s.position.set(Math.cos(a) * 0.23, 1.76, Math.sin(a) * 0.23); g.add(s); }
    }
  }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = !ghost; });
  g.userData = { legs, arms, body };
  return g;
}

export class Engine {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  world: World; text = ''; typed = 0; combo = 0;
  blocks = new Map<number, Block>();
  char!: THREE.Group; ghost?: THREE.Group; look: Look;
  charX = -STEP; fromX = -STEP; hopT = 1; stumble = 0; runPhase = 0;
  ghostTimes: number[] | null = null; startTime = 0; ghostX = -STEP;
  particles: Particle[] = []; ambient: THREE.Points | null = null;
  finishFlag?: THREE.Group; raf = 0; clock = new THREE.Clock(); camX = 0;
  framing: Framing = frameView(800, 600, NO_INSETS); zoom = 0; viewKey = '';
  geoBlock = new RoundedBoxGeometry(1, 0.42, 1.5, 3, 0.12); geoSpace = new RoundedBoxGeometry(1, 0.3, 1.5, 3, 0.1);
  geoLetter = new THREE.PlaneGeometry(0.8, 0.8); pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12); bubbleGeo = new THREE.SphereGeometry(0.1, 8, 6);
  onStep?: () => void; showFinish = true;
  islands = new THREE.Group();

  constructor(canvas: HTMLCanvasElement, world: World, look: Look) {
    this.world = world; this.look = look;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    applyFraming(this.camera, this.framing, 800, 600, NO_INSETS);
    const hemi = new THREE.HemisphereLight('#ffffff', '#8899cc', 1.6); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.position.set(-4, 10, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    this.scene.add(sun, sun.target); this.scene.userData.sun = sun;
    this.scene.add(this.islands);
    this.setupWorld();
    this.char = buildChar(look); this.scene.add(this.char);
    this.loop();
  }

  setupWorld() {
    const w = this.world;
    this.scene.fog = new THREE.Fog(w.fog, 18, 60);
    // start island
    const start = this.makeIsland(4, true); start.position.set(-STEP * 2.6, -0.2, 0); this.islands.add(start);
    // decorative distant islands
    for (let i = 0; i < 26; i++) {
      const isl = this.makeIsland(1 + Math.random() * 2.5, false);
      const side = Math.random() < 0.5 ? -1 : 1;
      isl.position.set(i * 9 - 10 + Math.random() * 6, -3 + Math.random() * 6, side * (7 + Math.random() * 14));
      isl.userData.bob = Math.random() * 6; this.islands.add(isl);
    }
    // ambient particles
    if (w.particles !== 'none') {
      const n = 400, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * 60 - 20; pos[i * 3 + 1] = Math.random() * 20 - 5; pos[i * 3 + 2] = Math.random() * 40 - 20; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const color = w.particles === 'petals' ? '#ffb3d9' : w.particles === 'snow' ? '#ffffff' : '#fff6c8';
      this.ambient = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: w.particles === 'stars' ? 0.12 : 0.18, transparent: true, opacity: 0.9, fog: w.particles !== 'stars' }));
      this.scene.add(this.ambient);
    }
  }

  makeIsland(r: number, main: boolean) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, 0.5, 7), new THREE.MeshStandardMaterial({ color: this.world.grass, roughness: 0.9, flatShading: true }));
    top.receiveShadow = true; g.add(top);
    const rock = new THREE.Mesh(new THREE.ConeGeometry(r * 0.95, r * 1.6, 7), new THREE.MeshStandardMaterial({ color: this.world.island, roughness: 1, flatShading: true }));
    rock.rotation.x = Math.PI; rock.position.y = -0.25 - r * 0.8; g.add(rock);
    const trees = main ? 3 : Math.floor(Math.random() * 3);
    for (let i = 0; i < trees; i++) {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: '#8a5a3c' })); trunk.position.y = 0.25; t.add(trunk);
      const leafC = this.world.id === 'neon' ? '#ff3df2' : this.world.id === 'ice' ? '#d8f0ff' : this.world.id === 'cosmic' ? '#7b5bff' : '#ff9fcf';
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: leafC, flatShading: true })); leaf.position.y = 0.8; t.add(leaf);
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.6;
      t.position.set(Math.cos(a) * d, 0.25, Math.sin(a) * d + (main ? -1.4 : 0)); t.traverse(o => (o.castShadow = true)); g.add(t);
    }
    return g;
  }

  /**
   * Tell the engine how big the canvas is (CSS pixels) and how much of each edge is covered by
   * the prompt, HUD and so on. The camera re-frames so the runner and the track ahead sit in
   * what is left, whatever shape that is.
   */
  setViewport(w: number, h: number, insets: Insets) {
    if (!(w > 0 && h > 0)) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = [w, h, dpr, insets.top, insets.right, insets.bottom, insets.left].map(n => Math.round(n * 4) / 4).join();
    if (key === this.viewKey) return;
    this.viewKey = key;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.framing = frameView(w, h, insets);
    applyFraming(this.camera, this.framing, w, h, insets);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.framing.dist + 7.5; fog.far = this.framing.dist + 49.5;
    this.clearSightLines();
    this.render(); // resizing clears the canvas, so repaint straight away rather than flash empty
  }

  /**
   * Islands floating on the camera's side of the track are lowered until they sit under the
   * line of sight to the track, so none of them can drift in front of the runner. This matters
   * most on a phone held sideways, where the camera stands a long way back.
   */
  clearSightLines() {
    const [, camY, camZ] = this.framing.offset;
    // height of the line from the camera to the near edge of the track, at `z` out from the track
    const sight = (z: number) => -0.4 + ((camY + 0.4) * Math.max(0, z - 0.85)) / (camZ - 0.85);
    for (const isl of this.islands.children) {
      if (isl.userData.bob === undefined || isl.position.z < 0) continue; // the start island, or one on the far side
      const r = ((isl.children[0] as THREE.Mesh).geometry as THREE.CylinderGeometry).parameters.radiusTop;
      const z = isl.position.z;
      if (z - r >= camZ) continue; // wholly behind the camera
      // the grass edge and the tree tops both stay under the line, with room to bob and a little to spare
      const maxY = Math.min(sight(z - r) - 0.25, sight(z - 0.6 * r - 0.45) - 1.5) - 1;
      if (isl.position.y > maxY) isl.position.y = maxY;
    }
  }

  setText(text: string, typed = 0) {
    this.text = text; this.typed = typed; this.ensureBlocks();
    if (this.finishFlag) this.scene.remove(this.finishFlag);
    if (this.showFinish) {
      const f = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4), new THREE.MeshStandardMaterial({ color: '#fff' })); pole.position.y = 1.2; f.add(pole);
      const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d')!;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#222' : '#fff'; x.fillRect(i * 8, j * 8, 8, 8); }
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide }));
      flag.position.set(0.6, 2.05, 0); f.add(flag); f.userData.flag = flag;
      const plat = this.makeIsland(2, false); plat.position.set(1.6, -0.2, 0); f.add(plat);
      f.position.set(text.length * STEP + 0.4, 0, -0.9); this.scene.add(f); this.finishFlag = f;
    }
  }
  appendText(more: string) { this.text += more; this.ensureBlocks(); }

  setGhost(times: number[] | null) {
    this.ghostTimes = times;
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = undefined;
    if (times) { this.ghost = buildChar(this.look, true); this.ghost.position.set(-STEP, 0.21, -0.45); this.scene.add(this.ghost); }
  }
  start() { this.startTime = performance.now(); }

  tierColor() { const t = Math.min(3, Math.floor(this.combo / 10)); return t === 0 ? this.world.block : TIER_COLORS[t]; }

  ensureBlocks() {
    // spawn floating ghost blocks for current and next word
    let end = this.typed; let words = 0;
    while (end < this.text.length && words < 2) { if (this.text[end] === ' ') words++; end++; }
    for (let i = Math.max(0, this.typed - 1); i < end; i++) if (!this.blocks.has(i)) this.spawnBlock(i);
  }

  spawnBlock(i: number) {
    const ch = this.text[i]; const space = ch === ' ';
    const mat = new THREE.MeshStandardMaterial({ color: space ? '#ffffff' : this.world.block, roughness: 0.45, transparent: true, opacity: 0.35, emissive: this.world.block, emissiveIntensity: 0.1 });
    const g = new THREE.Group();
    const m = new THREE.Mesh(space ? this.geoSpace : this.geoBlock, mat); m.castShadow = true; m.receiveShadow = true; g.add(m);
    let lmat: THREE.MeshBasicMaterial | undefined;
    if (!space) {
      lmat = new THREE.MeshBasicMaterial({ map: letterTex(ch), transparent: true, opacity: 0.6, depthWrite: false });
      const l = new THREE.Mesh(this.geoLetter, lmat); l.rotation.x = -Math.PI / 2; l.rotation.z = -Math.PI / 2; l.position.y = 0.215; g.add(l);
    }
    const x = i * STEP; g.position.set(x, 1.6, 0);
    const seed = Math.random() * 10;
    g.rotation.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6);
    g.scale.setScalar(0.01);
    this.scene.add(g);
    this.blocks.set(i, { g, mat, placed: false, t: 0, x, seed, pulse: 0, lmat });
  }

  correct(typedNow: number, combo: number) {
    this.combo = combo; this.typed = typedNow;
    const i = typedNow - 1;
    if (!this.blocks.has(i)) this.spawnBlock(i);
    const b = this.blocks.get(i)!;
    b.placed = true; b.t = 0;
    const col = this.text[i] === ' ' ? '#ffffff' : this.tierColor();
    b.mat.color.set(col); b.mat.emissive.set(col); b.mat.opacity = 1; b.mat.transparent = false; b.mat.emissiveIntensity = 0.5;
    if (b.lmat) b.lmat.opacity = 1;
    // word completion snap
    if (this.text[i] === ' ' || typedNow === this.text.length) {
      let k = i - (this.text[i] === ' ' ? 1 : 0);
      let d = 0;
      while (k >= 0 && this.text[k] !== ' ') { const bb = this.blocks.get(k); if (bb) bb.pulse = 1 + d * 0.08; k--; d++; }
    }
    this.fromX = this.char.position.x; this.charX = i * STEP; this.hopT = 0; this.stumble = 0;
    this.ensureBlocks();
    this.emitTrail(combo);
    // cleanup
    for (const [k, bb] of this.blocks) if (k < typedNow - 60) { this.scene.remove(bb.g); bb.mat.dispose(); bb.lmat?.dispose(); this.blocks.delete(k); }
  }
  miss() { this.combo = 0; this.stumble = 1; }

  emitTrail(combo: number) {
    const count = combo >= 30 ? 6 : combo >= 20 ? 4 : combo >= 10 ? 3 : 1;
    const tr = this.look.trail;
    for (let n = 0; n < count; n++) {
      let color = '#ffffff';
      if (tr === 'fire') color = ['#ff4d00', '#ffb000', '#ff7a00'][n % 3];
      else if (tr === 'rainbow') color = `hsl(${Math.random() * 360},90%,65%)`;
      else if (tr === 'bubble') color = '#bfefff';
      else color = ['#fff7a8', '#ffffff', this.tierColor()][n % 3];
      const m = new THREE.Mesh(tr === 'bubble' ? this.bubbleGeo : this.pGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: tr === 'bubble' ? 0.6 : 1 }));
      m.position.copy(this.char.position).add(new THREE.Vector3(-0.2, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5));
      const v = new THREE.Vector3(-1 - Math.random(), tr === 'fire' || tr === 'bubble' ? 1.5 + Math.random() : Math.random() * 2, (Math.random() - 0.5) * 2);
      this.scene.add(m); this.particles.push({ m, v, life: 0, max: 0.6 + Math.random() * 0.5 });
    }
  }

  loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05); const t = this.clock.elapsedTime;
    const grav = this.world.gravity;
    const speed = 1 + Math.min(this.combo, 40) / 40;
    // blocks
    for (const [i, b] of this.blocks) {
      if (b.placed) {
        b.t = Math.min(1, b.t + dt * 9);
        const e = 1 - Math.pow(1 - b.t, 3);
        b.g.position.y += (0 - b.g.position.y) * Math.min(1, dt * 22);
        b.g.rotation.x *= 1 - e; b.g.rotation.y *= 1 - e; b.g.rotation.z *= 1 - e;
        const s = 1 + Math.sin(b.t * Math.PI) * 0.15 + b.pulse * 0.12;
        b.g.scale.set(s, 1 + b.pulse * 0.5, s);
        b.mat.emissiveIntensity += (0.08 + b.pulse * 0.4 - b.mat.emissiveIntensity) * dt * 4;
        b.pulse = Math.max(0, b.pulse - dt * 3);
      } else {
        const sc = b.g.scale.x + (1 - b.g.scale.x) * dt * 8; b.g.scale.setScalar(sc);
        const ahead = i - this.typed;
        b.g.position.y = 1.2 + ahead * 0.06 + Math.sin(t * 2 * grav + b.seed) * 0.15;
        b.g.rotation.y += dt * 0.3 * Math.sin(b.seed);
      }
    }
    // character hop
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt * 11 * speed * grav);
      const x = this.fromX + (this.charX - this.fromX) * this.hopT;
      const y = 0.21 + Math.sin(this.hopT * Math.PI) * 0.35 / grav;
      this.char.position.set(x, y, 0);
      if (this.hopT >= 1) this.onStep?.();
      this.runPhase += dt * 18 * speed;
    } else {
      this.char.position.y = 0.21 + (this.char.position.x < -STEP * 0.5 ? 0 : 0);
      this.runPhase *= 0.9;
    }
    if (this.char.position.x < -STEP * 0.9 && this.hopT >= 1) this.char.position.x = -STEP;
    const ud = this.char.userData as { legs: THREE.Group[]; arms: THREE.Group[] };
    const sw = Math.sin(this.runPhase) * (this.hopT < 1 ? 0.8 : 0.05);
    ud.legs[0].rotation.z = sw; ud.legs[1].rotation.z = -sw; ud.arms[0].rotation.z = -sw; ud.arms[1].rotation.z = sw;
    this.stumble = Math.max(0, this.stumble - dt * 2.5);
    this.char.rotation.z = -Math.sin(this.stumble * Math.PI * 3) * 0.25 * this.stumble;
    this.char.rotation.y = 0;
    this.char.position.y += Math.sin(t * 3) * 0.01;
    // ghost
    if (this.ghost && this.ghostTimes && this.startTime) {
      const el = performance.now() - this.startTime;
      let idx = 0; while (idx < this.ghostTimes.length && this.ghostTimes[idx] <= el) idx++;
      const target = (idx - 1) * STEP;
      const prev = this.ghostX; this.ghostX += (target - this.ghostX) * Math.min(1, dt * 14);
      const moving = Math.abs(target - prev) > 0.02;
      this.ghost.position.set(this.ghostX, 0.21 + (moving ? Math.abs(Math.sin(t * 16)) * 0.25 : 0), -0.45);
      const gud = this.ghost.userData as { legs: THREE.Group[] };
      const gs = moving ? Math.sin(t * 16) * 0.8 : 0; gud.legs[0].rotation.z = gs; gud.legs[1].rotation.z = -gs;
    }
    // particles
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k]; p.life += dt;
      p.m.position.addScaledVector(p.v, dt);
      if (this.look.trail !== 'fire' && this.look.trail !== 'bubble') p.v.y -= dt * 4 * grav;
      p.m.rotation.x += dt * 5; p.m.rotation.y += dt * 4;
      const f = 1 - p.life / p.max; p.m.scale.setScalar(Math.max(0.01, f));
      if (p.life >= p.max) { this.scene.remove(p.m); (p.m.material as THREE.Material).dispose(); this.particles.splice(k, 1); }
    }
    if (this.combo >= 20 && Math.random() < 0.3) this.emitTrailIdle();
    // ambient
    if (this.ambient) {
      const pos = this.ambient.geometry.attributes.position as THREE.BufferAttribute;
      const fall = this.world.particles === 'stars' ? 0 : this.world.particles === 'snow' ? 1.2 : 0.6;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - fall * dt; let x = pos.getX(i) + Math.sin(t + i) * dt * 0.3;
        if (y < -6) y = 14;
        if (x < this.camX - 25) x += 60;
        pos.setXY(i, x, y);
      }
      pos.needsUpdate = true;
    }
    // islands bob & recycle
    for (const isl of this.islands.children) {
      if (isl.userData.bob !== undefined) {
        isl.position.y += Math.sin(t * 0.6 * grav + isl.userData.bob) * dt * 0.15;
        if (isl.position.x < this.camX - 30) isl.position.x += 234;
      }
    }
    if (this.finishFlag) { const fl = this.finishFlag.userData.flag as THREE.Mesh; fl.rotation.y = Math.sin(t * 3) * 0.2; }
    // camera: follow the runner, and ease closer as the combo builds
    this.camX += (this.char.position.x - this.camX) * Math.min(1, dt * 3 * speed);
    this.zoom += (Math.min(this.combo, 40) / 40 - this.zoom) * Math.min(1, dt * 4);
    this.render();
  };

  render() {
    placeCamera(this.camera, this.framing, this.camX, this.zoom);
    const sun = this.scene.userData.sun as THREE.DirectionalLight;
    sun.position.set(this.camX - 4, 10, 6); sun.target.position.set(this.camX + 2, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  emitTrailIdle() {
    const m = new THREE.Mesh(this.pGeo, new THREE.MeshBasicMaterial({ color: this.tierColor(), transparent: true }));
    m.position.copy(this.char.position).add(new THREE.Vector3(-0.3, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6));
    this.scene.add(m); this.particles.push({ m, v: new THREE.Vector3(-1.5, 0.3, 0), life: 0, max: 0.5 });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
