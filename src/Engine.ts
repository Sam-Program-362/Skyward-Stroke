import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { World, Look } from './data';
import { OUTFITS } from './data';
import { frameView, applyFraming, placeCamera, type Framing, type Insets } from './framing';

const STEP = 1.15;
const TIER_COLORS = ['', '#3fd67a', '#ffc53d', '#ff5fd2'];
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

const isSoftwareGl = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
})();

interface Block {
  g: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  placed: boolean;
  t: number;
  x: number;
  seed: number;
  pulse: number;
  lmat?: THREE.MeshBasicMaterial;
}
interface Particle {
  m: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
  max: number;
}

const letterCache = new Map<string, THREE.Texture>();
function letterTex(ch: string, maxAnisotropy = 4) {
  const key = ch;
  if (letterCache.has(key)) return letterCache.get(key)!;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const isUpper = ch >= 'A' && ch <= 'Z';
  const isPunct = !/[a-zA-Z0-9 ]/.test(ch);

  x.font = `${isPunct ? '900 96px' : '900 88px'} "Nunito", "Arial Rounded MT Bold", Arial, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';

  // Drop shadow
  x.fillStyle = 'rgba(0,0,0,0.28)';
  x.fillText(ch, 66, 70);

  // Main character glyph (exact case preserved!)
  x.fillStyle = isPunct ? '#ffe89e' : '#ffffff';
  x.fillText(ch, 64, 66);

  // Subtle uppercase indicator bar underneath capital letters so A vs a is unmistakable on 3D tiles
  if (isUpper) {
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath();
    x.roundRect(42, 104, 44, 7, 3.5);
    x.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.anisotropy = maxAnisotropy;
  t.colorSpace = THREE.SRGBColorSpace;
  letterCache.set(key, t);
  return t;
}

function makeContactShadowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(15, 20, 45, 0.52)');
  grad.addColorStop(0.6, 'rgba(15, 20, 45, 0.22)');
  grad.addColorStop(1, 'rgba(15, 20, 45, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let sharedShadowTex: THREE.CanvasTexture | null = null;

export function buildChar(look: Look, ghost = false) {
  const g = new THREE.Group();
  const outfitObj = OUTFITS.find(o => o.id === look.outfit) || OUTFITS[0];
  const outfitCol = outfitObj.color;
  const accentCol = outfitObj.accent || '#ffffff';

  const mk = (c: string, rough = 0.55, metal = 0.08) =>
    new THREE.MeshStandardMaterial({
      color: c,
      roughness: rough,
      metalness: metal,
      transparent: ghost,
      opacity: ghost ? 0.35 : 1,
      depthWrite: !ghost,
    });

  const skin = mk(ghost ? '#bfe3ff' : '#fff3eb', 0.65, 0.02);
  const shirt = mk(ghost ? '#bfe3ff' : outfitCol, 0.5, 0.1);
  const trim = mk(ghost ? '#bfe3ff' : accentCol, 0.35, 0.2);
  const pants = mk(ghost ? '#bfe3ff' : '#252d44', 0.7, 0.05);
  const shoe = mk(ghost ? '#bfe3ff' : '#ff4757', 0.45, 0.1);
  const soleMat = mk(ghost ? '#bfe3ff' : '#ffffff', 0.8, 0.0);

  // 1. Contact shadow disc at ground level
  if (!ghost) {
    if (!sharedShadowTex) sharedShadowTex = makeContactShadowTex();
    const shadowDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({
        map: sharedShadowTex,
        transparent: true,
        depthWrite: false,
      })
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.02;
    g.add(shadowDisc);
  }

  // 2. Torso + Collar + Belt Trim
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.32, 8, 14), shirt);
  body.position.y = 0.72;
  g.add(body);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.055, 8, 18), trim);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0.02, 0.96, 0);
  g.add(collar);

  // 3. Fluttering Scarf / Cape Wing behind the neck (-X is behind the runner)
  const scarfPivot = new THREE.Group();
  scarfPivot.position.set(-0.18, 0.95, 0);
  const scarfMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.24), trim);
  scarfMesh.position.set(-0.16, -0.02, 0);
  scarfPivot.add(scarfMesh);
  g.add(scarfPivot);

  // 4. Back-mounted Flow Jetpack + Glowing Core
  const pack = new THREE.Group();
  pack.position.set(-0.24, 0.74, 0);
  const packShell = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.32), pants);
  pack.add(packShell);
  const coreMat = new THREE.MeshStandardMaterial({
    color: ghost ? '#bfe3ff' : '#38bdf8',
    emissive: ghost ? '#bfe3ff' : '#38bdf8',
    emissiveIntensity: ghost ? 0.2 : 0.7,
    roughness: 0.2,
    transparent: ghost,
    opacity: ghost ? 0.35 : 1,
  });
  const packCore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), coreMat);
  packCore.rotation.z = Math.PI / 2;
  packCore.position.set(-0.05, 0, 0);
  pack.add(packCore);
  g.add(pack);

  // 5. Head + Facial Details (+X is facing forward along the track)
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.28;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 22, 18), skin);
  headGroup.add(head);

  if (!ghost) {
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#181c30', roughness: 0.15, metalness: 0.2 });
    const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const blushMat = new THREE.MeshBasicMaterial({ color: '#ff8da1', transparent: true, opacity: 0.45 });

    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), eyeMat);
      eye.position.set(0.285, 0.03, s * 0.11);
      eye.scale.set(0.6, 1.15, 1);
      headGroup.add(eye);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), shineMat);
      pupil.position.set(0.31, 0.048, s * 0.102);
      headGroup.add(pupil);

      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), blushMat);
      blush.position.set(0.265, -0.045, s * 0.17);
      blush.scale.set(0.4, 0.7, 1.1);
      headGroup.add(blush);
    }
  }
  g.add(headGroup);

  // 6. Articulated Legs + Sneakers with Soles
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0, 0.48, s * 0.13);
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 6, 10), pants);
    l.position.y = -0.2;
    leg.add(l);

    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.16), shoe);
    sh.position.set(0.04, -0.39, 0);
    leg.add(sh);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.17), soleMat);
    sole.position.set(0.04, -0.445, 0);
    leg.add(sole);

    g.add(leg);
    legs.push(leg);
  }

  // 7. Articulated Arms + Hands
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0, 0.95, s * 0.32);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.24, 6, 10), shirt);
    a.position.y = -0.19;
    arm.add(a);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.05, 10), trim);
    cuff.position.y = -0.3;
    arm.add(cuff);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.082, 10, 10), skin);
    h.position.y = -0.38;
    arm.add(h);
    g.add(arm);
    arms.push(arm);
  }

  // 8. Hats & Headgear
  if (!ghost) {
    if (look.hat === 'hair') {
      const m = mk('#ff6a2b', 0.65);
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        m
      );
      hair.position.y = 0.03;
      hair.rotation.z = 0.25;
      headGroup.add(hair);
      // Tuft spike
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 6), m);
      tuft.position.set(0.08, 0.36, 0);
      tuft.rotation.z = -0.35;
      headGroup.add(tuft);
    } else if (look.hat === 'cap') {
      const m = mk('#ff3b5c', 0.5);
      const c = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
        m
      );
      c.position.y = 0.05;
      headGroup.add(c);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16), m);
      brim.position.set(0.28, 0.08, 0);
      brim.scale.set(1.2, 1, 0.9);
      headGroup.add(brim);
    } else if (look.hat === 'visor') {
      const visorMat = new THREE.MeshStandardMaterial({
        color: '#00f0ff',
        emissive: '#00d8ff',
        emissiveIntensity: 0.75,
        roughness: 0.15,
        metalness: 0.8,
      });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.12, 20, 1, true), visorMat);
      band.position.y = 0.04;
      headGroup.add(band);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.04), trim);
      fin.position.set(-0.05, 0.34, 0);
      fin.rotation.z = 0.25;
      headGroup.add(fin);
    } else if (look.hat === 'beanie') {
      const m = mk('#ffd23d', 0.75);
      const c = new THREE.Mesh(
        new THREE.SphereGeometry(0.345, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        m
      );
      c.position.y = 0.04;
      headGroup.add(c);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), mk('#ffffff', 0.85));
      p.position.y = 0.4;
      headGroup.add(p);
    } else if (look.hat === 'crown') {
      const m = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.85, roughness: 0.2 });
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.18, 6, 1, true), m);
      c.position.y = 0.34;
      headGroup.add(c);
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 4), m);
        const a = (i / 6) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.23, 0.48, Math.sin(a) * 0.23);
        headGroup.add(s);
      }
    } else if (look.hat === 'halo') {
      const haloMat = new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#facc15',
        emissiveIntensity: 0.9,
        roughness: 0.15,
        metalness: 0.6,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.038, 12, 28), haloMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.48;
      headGroup.add(ring);
    }
  }

  g.traverse(o => {
    if ((o as THREE.Mesh).isMesh && o.position.y > 0.03) {
      o.castShadow = !ghost && !isSoftwareGl;
    }
  });
  g.userData = { legs, arms, body, headGroup, scarfPivot, coreMat };
  return g;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  text = '';
  typed = 0;
  combo = 0;
  blocks = new Map<number, Block>();
  char!: THREE.Group;
  ghost?: THREE.Group;
  look: Look;
  charX = -STEP;
  fromX = -STEP;
  hopT = 1;
  stumble = 0;
  runPhase = 0;
  ghostTimes: number[] | null = null;
  startTime = 0;
  ghostX = -STEP;
  particles: Particle[] = [];
  ambient: THREE.Points | null = null;
  finishFlag?: THREE.Group;
  raf = 0;
  timerId = 0;
  disposed = false;
  lastTime = performance.now();
  elapsedTime = 0;
  camX = 0;
  framing: Framing = frameView(800, 600, NO_INSETS);
  zoom = 0;
  viewKey = '';
  maxAnisotropy = 4;
  geoBlock = new RoundedBoxGeometry(1, 0.42, 1.5, 3, 0.12);
  geoSpace = new RoundedBoxGeometry(1, 0.3, 1.5, 3, 0.1);
  geoLetter = new THREE.PlaneGeometry(0.8, 0.8);
  pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  bubbleGeo = new THREE.SphereGeometry(0.1, 8, 6);
  onStep?: () => void;
  showFinish = true;
  islands = new THREE.Group();

  constructor(canvas: HTMLCanvasElement, world: World, look: Look) {
    this.world = world;
    this.look = look;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy() || 4;

    if (!isSoftwareGl) {
      try {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      } catch {
        // ignore if PMREM fails
      }
    }

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    applyFraming(this.camera, this.framing, 800, 600, NO_INSETS);

    const hemi = new THREE.HemisphereLight('#ffffff', '#7788bb', 1.65);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff5e4', 2.2);
    sun.position.set(-4, 10, 6);
    sun.castShadow = !isSoftwareGl;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    this.scene.add(sun, sun.target);
    this.scene.userData.sun = sun;

    this.scene.add(this.islands);
    this.setupWorld();
    this.char = buildChar(look);
    this.char.position.set(-STEP, 0.21, 0);
    this.scene.add(this.char);
    this.scheduleNextFrame();
  }

  private scheduleNextFrame() {
    if (this.disposed) return;
    if (isSoftwareGl) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext | null;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            this.timerId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            this.timerId = window.setTimeout(this.loop, 80);
          }
        };
        this.timerId = window.setTimeout(poll, 5);
      } else {
        this.timerId = window.setTimeout(this.loop, 80);
      }
    } else {
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  setupWorld() {
    const w = this.world;
    this.scene.fog = new THREE.Fog(w.fog, 18, 60);
    // Start island
    const start = this.makeIsland(4.2, true);
    start.position.set(-STEP * 2.6, -0.2, 0);
    this.islands.add(start);
    // Decorative distant islands
    for (let i = 0; i < 26; i++) {
      const isl = this.makeIsland(1.1 + Math.random() * 2.5, false);
      const side = Math.random() < 0.5 ? -1 : 1;
      isl.position.set(
        i * 9 - 10 + Math.random() * 6,
        -3 + Math.random() * 6,
        side * (7 + Math.random() * 14)
      );
      isl.userData.bob = Math.random() * 6;
      this.islands.add(isl);
    }
    // Ambient world particles
    if (w.particles !== 'none') {
      const n = 380;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = Math.random() * 60 - 20;
        pos[i * 3 + 1] = Math.random() * 20 - 5;
        pos[i * 3 + 2] = Math.random() * 40 - 20;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const colorMap: Record<string, string> = {
        petals: '#ffb3d9',
        snow: '#ffffff',
        stars: '#fff6c8',
        embers: '#ff8533',
        fireflies: '#a7f3d0',
        bubbles: '#7dd3fc',
      };
      const color = colorMap[w.particles] || '#ffffff';
      const size = w.particles === 'stars' ? 0.13 : w.particles === 'bubbles' ? 0.2 : 0.18;
      this.ambient = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color,
          size,
          transparent: true,
          opacity: 0.9,
          fog: w.particles !== 'stars',
        })
      );
      this.scene.add(this.ambient);
    }
  }

  makeIsland(r: number, main: boolean) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 0.95, 0.5, 7),
      new THREE.MeshStandardMaterial({ color: this.world.grass, roughness: 0.85, flatShading: true })
    );
    top.receiveShadow = !isSoftwareGl;
    g.add(top);

    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(r * 0.95, r * 1.65, 7),
      new THREE.MeshStandardMaterial({ color: this.world.island, roughness: 0.95, flatShading: true })
    );
    rock.rotation.x = Math.PI;
    rock.position.y = -0.25 - r * 0.82;
    g.add(rock);

    const count = main ? 3 : Math.floor(Math.random() * 3) + 1;
    const wid = this.world.id;

    for (let i = 0; i < count; i++) {
      const prop = new THREE.Group();

      if (wid === 'sunset') {
        // Sandstone desert pyramid or saguaro cactus
        if (i === 0 && r > 1.8) {
          const pyr = new THREE.Mesh(
            new THREE.ConeGeometry(0.65, 1.1, 4),
            new THREE.MeshStandardMaterial({ color: '#e08e45', roughness: 0.8, flatShading: true })
          );
          pyr.position.y = 0.55;
          prop.add(pyr);
        } else {
          const cactusMat = new THREE.MeshStandardMaterial({ color: '#2d8a4e', roughness: 0.7 });
          const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.65, 4, 8), cactusMat);
          stem.position.y = 0.4;
          prop.add(stem);
          const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.25, 4, 8), cactusMat);
          arm.position.set(0.16, 0.48, 0);
          arm.rotation.z = -0.5;
          prop.add(arm);
        }
      } else if (wid === 'bamboo') {
        // Tall segmented bamboo stalks or red torii gate
        if (main && i === 0) {
          const gateMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.5 });
          for (const s of [-0.35, 0.35]) {
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8), gateMat);
            pillar.position.set(s, 0.55, 0);
            prop.add(pillar);
          }
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 0.14), gateMat);
          lintel.position.set(0, 1.08, 0);
          prop.add(lintel);
        } else {
          const bamMat = new THREE.MeshStandardMaterial({ color: '#059669', roughness: 0.45 });
          const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.35, 8), bamMat);
          stalk.position.y = 0.67;
          prop.add(stalk);
          const foliage = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.32, 0),
            new THREE.MeshStandardMaterial({ color: '#6ee7b7', flatShading: true })
          );
          foliage.position.y = 1.35;
          prop.add(foliage);
        }
      } else if (wid === 'volcano') {
        // Jagged obsidian crystal spires with glowing magma veins
        const spire = new THREE.Mesh(
          new THREE.ConeGeometry(0.28, 1.15, 5),
          new THREE.MeshStandardMaterial({
            color: '#1c1917',
            emissive: '#dc2626',
            emissiveIntensity: 0.35,
            roughness: 0.3,
            metalness: 0.5,
            flatShading: true,
          })
        );
        spire.position.y = 0.55;
        spire.rotation.z = (Math.random() - 0.5) * 0.25;
        prop.add(spire);
      } else if (wid === 'ocean') {
        // Bioluminescent coral branches & glowing sea pearls
        const coralCol = i % 2 === 0 ? '#f472b6' : '#22d3ee';
        const coral = new THREE.Mesh(
          new THREE.TorusKnotGeometry(0.22, 0.06, 24, 6),
          new THREE.MeshStandardMaterial({
            color: coralCol,
            emissive: coralCol,
            emissiveIntensity: 0.3,
            roughness: 0.35,
          })
        );
        coral.position.y = 0.45;
        prop.add(coral);
      } else if (wid === 'cosmic') {
        // Ringed mini-planetoid or astral monolith
        const orb = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.34, 1),
          new THREE.MeshStandardMaterial({
            color: '#a78bfa',
            emissive: '#6d28d9',
            emissiveIntensity: 0.35,
            roughness: 0.25,
            metalness: 0.4,
          })
        );
        orb.position.y = 0.72;
        prop.add(orb);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.52, 0.03, 8, 24),
          new THREE.MeshStandardMaterial({ color: '#fde047', roughness: 0.3, metalness: 0.6 })
        );
        ring.position.y = 0.72;
        ring.rotation.x = 1.1;
        prop.add(ring);
      } else {
        // Sky, Neon, Ice classic stylized trees
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.11, 0.52),
          new THREE.MeshStandardMaterial({ color: wid === 'neon' ? '#1e1b4b' : '#8a5a3c' })
        );
        trunk.position.y = 0.26;
        prop.add(trunk);
        const leafC =
          wid === 'neon' ? '#ff3df2' : wid === 'ice' ? '#e0f2fe' : '#ff9fcf';
        const leaf = new THREE.Mesh(
          wid === 'ice' ? new THREE.ConeGeometry(0.45, 0.95, 6) : new THREE.IcosahedronGeometry(0.45, 0),
          new THREE.MeshStandardMaterial({
            color: leafC,
            emissive: wid === 'neon' ? '#ff2ced' : '#000000',
            emissiveIntensity: wid === 'neon' ? 0.25 : 0,
            flatShading: true,
          })
        );
        leaf.position.y = 0.82;
        prop.add(leaf);
      }

      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const d = (0.25 + Math.random() * 0.35) * r;
      prop.position.set(Math.cos(a) * d, 0.25, Math.sin(a) * d + (main ? -1.4 : 0));
      prop.traverse(o => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = !isSoftwareGl;
      });
      g.add(prop);
    }
    return g;
  }

  setViewport(w: number, h: number, insets: Insets) {
    if (!(w > 0 && h > 0)) return;
    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const key = [w, h, dpr, insets.top, insets.right, insets.bottom, insets.left]
      .map(n => Math.round(n * 4) / 4)
      .join();
    if (key === this.viewKey) return;
    this.viewKey = key;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.framing = frameView(w, h, insets);
    applyFraming(this.camera, this.framing, w, h, insets);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.framing.dist + 7.5;
    fog.far = this.framing.dist + 49.5;
    this.clearSightLines();
    this.render();
  }

  clearSightLines() {
    const [, camY, camZ] = this.framing.offset;
    const sight = (z: number) => -0.4 + ((camY + 0.4) * Math.max(0, z - 0.85)) / (camZ - 0.85);
    for (const isl of this.islands.children) {
      if (isl.userData.bob === undefined || isl.position.z < 0) continue;
      const r = ((isl.children[0] as THREE.Mesh).geometry as THREE.CylinderGeometry).parameters
        .radiusTop;
      const z = isl.position.z;
      if (z - r >= camZ) continue;
      const maxY = Math.min(sight(z - r) - 0.25, sight(z - 0.6 * r - 0.45) - 1.5) - 1;
      if (isl.position.y > maxY) isl.position.y = maxY;
    }
  }

  setText(text: string, typed = 0) {
    this.text = text;
    this.typed = typed;
    this.ensureBlocks();
    if (this.finishFlag) this.scene.remove(this.finishFlag);
    if (this.showFinish) {
      const f = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 2.4),
        new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.4, roughness: 0.3 })
      );
      pole.position.y = 1.2;
      f.add(pole);
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 32;
      const x = c.getContext('2d')!;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 4; j++) {
          x.fillStyle = (i + j) % 2 ? '#1e293b' : '#ffffff';
          x.fillRect(i * 8, j * 8, 8, 8);
        }
      }
      const flagTex = new THREE.CanvasTexture(c);
      flagTex.colorSpace = THREE.SRGBColorSpace;
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.6),
        new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide })
      );
      flag.position.set(0.6, 2.05, 0);
      f.add(flag);
      f.userData.flag = flag;
      const plat = this.makeIsland(2.1, false);
      plat.position.set(1.6, -0.2, 0);
      f.add(plat);
      f.position.set(text.length * STEP + 0.4, 0, -0.9);
      this.scene.add(f);
      this.finishFlag = f;
    }
  }

  appendText(more: string) {
    this.text += more;
    this.ensureBlocks();
  }

  setGhost(times: number[] | null) {
    this.ghostTimes = times;
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = undefined;
    if (times) {
      this.ghost = buildChar(this.look, true);
      this.ghost.position.set(-STEP, 0.21, -0.45);
      this.scene.add(this.ghost);
    }
  }

  start() {
    this.startTime = performance.now();
  }

  tierColor() {
    const t = Math.min(3, Math.floor(this.combo / 10));
    return t === 0 ? this.world.block : TIER_COLORS[t];
  }

  ensureBlocks() {
    let end = this.typed;
    let words = 0;
    while (end < this.text.length && words < 2) {
      if (this.text[end] === ' ') words++;
      end++;
    }
    for (let i = Math.max(0, this.typed - 1); i < end; i++) {
      if (!this.blocks.has(i)) this.spawnBlock(i);
    }
  }

  spawnBlock(i: number) {
    const ch = this.text[i];
    const space = ch === ' ';
    const mat = new THREE.MeshStandardMaterial({
      color: space ? '#ffffff' : this.world.block,
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.58,
      emissive: this.world.block,
      emissiveIntensity: 0.16,
    });
    const g = new THREE.Group();
    const m = new THREE.Mesh(space ? this.geoSpace : this.geoBlock, mat);
    m.castShadow = !isSoftwareGl;
    m.receiveShadow = !isSoftwareGl;
    g.add(m);
    let lmat: THREE.MeshBasicMaterial | undefined;
    if (!space) {
      lmat = new THREE.MeshBasicMaterial({
        map: letterTex(ch, this.maxAnisotropy),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const l = new THREE.Mesh(this.geoLetter, lmat);
      l.rotation.x = -Math.PI / 2;
      l.rotation.z = -Math.PI / 2;
      l.position.y = 0.215;
      g.add(l);
    }
    const x = i * STEP;
    const ahead = Math.max(0, i - this.typed);
    g.position.set(x, 1.2 + ahead * 0.06, 0);
    const seed = Math.random() * 10;
    g.rotation.set(
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.5) * 0.35
    );
    // Initial blocks at track start spawn at 0.96 scale so they are immediately visible on first frame
    g.scale.setScalar(this.typed === 0 ? 0.96 : 0.15);
    this.scene.add(g);
    this.blocks.set(i, { g, mat, placed: false, t: 0, x, seed, pulse: 0, lmat });
  }

  correct(typedNow: number, combo: number) {
    this.combo = combo;
    this.typed = typedNow;
    const i = typedNow - 1;
    if (!this.blocks.has(i)) this.spawnBlock(i);
    const b = this.blocks.get(i)!;
    b.placed = true;
    b.t = 0;
    const col = this.text[i] === ' ' ? '#ffffff' : this.tierColor();
    b.mat.color.set(col);
    b.mat.emissive.set(col);
    b.mat.opacity = 1;
    b.mat.transparent = false;
    b.mat.emissiveIntensity = 0.52;
    if (b.lmat) b.lmat.opacity = 1;

    // Word completion ripple pulse across the word just typed
    if (this.text[i] === ' ' || typedNow === this.text.length) {
      let k = i - (this.text[i] === ' ' ? 1 : 0);
      let d = 0;
      while (k >= 0 && this.text[k] !== ' ') {
        const bb = this.blocks.get(k);
        if (bb) bb.pulse = 1 + d * 0.08;
        k--;
        d++;
      }
    }
    this.fromX = this.char.position.x;
    this.charX = i * STEP;
    this.hopT = 0;
    this.stumble = 0;
    this.ensureBlocks();
    this.emitTrail(combo);
    // Cleanup distant blocks behind the runner
    for (const [k, bb] of this.blocks) {
      if (k < typedNow - 60) {
        this.scene.remove(bb.g);
        bb.mat.dispose();
        bb.lmat?.dispose();
        this.blocks.delete(k);
      }
    }
  }

  miss() {
    this.combo = 0;
    this.stumble = 1;
  }

  emitTrail(combo: number) {
    const count = combo >= 30 ? 6 : combo >= 20 ? 4 : combo >= 10 ? 3 : 1;
    const tr = this.look.trail;
    for (let n = 0; n < count; n++) {
      let color = '#ffffff';
      if (tr === 'fire') color = ['#ff4d00', '#ffb000', '#ff7a00'][n % 3];
      else if (tr === 'aurora') color = ['#34d399', '#22d3ee', '#a78bfa'][n % 3];
      else if (tr === 'rainbow') color = `hsl(${Math.random() * 360},90%,65%)`;
      else if (tr === 'bubble') color = '#bfefff';
      else color = ['#fff7a8', '#ffffff', this.tierColor()][n % 3];

      const m = new THREE.Mesh(
        tr === 'bubble' ? this.bubbleGeo : this.pGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: tr === 'bubble' ? 0.65 : 1,
        })
      );
      m.position
        .copy(this.char.position)
        .add(new THREE.Vector3(-0.22, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5));
      const v = new THREE.Vector3(
        -1 - Math.random(),
        tr === 'fire' || tr === 'bubble' || tr === 'aurora'
          ? 1.5 + Math.random()
          : Math.random() * 2,
        (Math.random() - 0.5) * 2
      );
      this.scene.add(m);
      this.particles.push({ m, v, life: 0, max: 0.6 + Math.random() * 0.5 });
    }
  }

  loop = () => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(Math.max(0.001, (now - this.lastTime) / 1000), 0.05);
    this.lastTime = now;
    this.elapsedTime += dt;
    const t = this.elapsedTime;
    const grav = this.world.gravity;
    const speed = 1 + Math.min(this.combo, 40) / 40;

    // Blocks animation
    for (const [i, b] of this.blocks) {
      if (b.placed) {
        b.t = Math.min(1, b.t + dt * 11);
        const e = 1 - Math.pow(1 - b.t, 3);
        b.g.position.y += (0 - b.g.position.y) * Math.min(1, dt * 24);
        b.g.rotation.x *= 1 - e;
        b.g.rotation.y *= 1 - e;
        b.g.rotation.z *= 1 - e;
        const s = 1 + Math.sin(b.t * Math.PI) * 0.15 + b.pulse * 0.12;
        b.g.scale.set(s, 1 + b.pulse * 0.5, s);
        b.mat.emissiveIntensity += (0.08 + b.pulse * 0.4 - b.mat.emissiveIntensity) * dt * 4;
        b.pulse = Math.max(0, b.pulse - dt * 3);
      } else {
        const sc = b.g.scale.x + (1 - b.g.scale.x) * Math.min(1, dt * 16);
        b.g.scale.setScalar(sc);
        const ahead = i - this.typed;
        b.g.position.y = 1.2 + ahead * 0.06 + Math.sin(t * 2 * grav + b.seed) * 0.15;
        b.g.rotation.y += dt * 0.3 * Math.sin(b.seed);
      }
    }

    // Character hop + squash-and-stretch + scarf flutter
    const ud = this.char.userData as {
      legs: THREE.Group[];
      arms: THREE.Group[];
      headGroup?: THREE.Group;
      scarfPivot?: THREE.Group;
      coreMat?: THREE.MeshStandardMaterial;
    };

    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt * 11 * speed * grav);
      const x = this.fromX + (this.charX - this.fromX) * this.hopT;
      const arc = Math.sin(this.hopT * Math.PI);
      const y = 0.21 + (arc * 0.36) / grav;
      this.char.position.set(x, y, 0);
      // Subtle squash and stretch on hop arc
      const stretchY = 1 + arc * 0.08;
      const squashXZ = 1 - arc * 0.04;
      this.char.scale.set(squashXZ, stretchY, squashXZ);
      if (this.hopT >= 1) {
        this.char.scale.set(1, 1, 1);
        this.onStep?.();
      }
      this.runPhase += dt * 18 * speed;
    } else {
      this.char.position.y = 0.21;
      this.char.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 14));
      this.runPhase *= 0.9;
    }
    if (this.char.position.x < -STEP * 0.9 && this.hopT >= 1) this.char.position.x = -STEP;

    const sw = Math.sin(this.runPhase) * (this.hopT < 1 ? 0.85 : 0.05);
    ud.legs[0].rotation.z = sw;
    ud.legs[1].rotation.z = -sw;
    ud.arms[0].rotation.z = -sw;
    ud.arms[1].rotation.z = sw;

    if (ud.scarfPivot) {
      ud.scarfPivot.rotation.z =
        0.15 + Math.sin(t * 10 * speed) * (this.hopT < 1 ? 0.35 : 0.08);
    }
    if (ud.coreMat) {
      ud.coreMat.color.set(this.tierColor());
      ud.coreMat.emissive.set(this.tierColor());
      ud.coreMat.emissiveIntensity = 0.5 + Math.min(this.combo, 30) * 0.04;
    }

    this.stumble = Math.max(0, this.stumble - dt * 2.5);
    this.char.rotation.z = -Math.sin(this.stumble * Math.PI * 3) * 0.25 * this.stumble;
    this.char.rotation.y = 0;
    this.char.position.y += Math.sin(t * 3) * 0.01;

    // Ghost runner
    if (this.ghost && this.ghostTimes && this.startTime) {
      const el = performance.now() - this.startTime;
      let idx = 0;
      while (idx < this.ghostTimes.length && this.ghostTimes[idx] <= el) idx++;
      const target = (idx - 1) * STEP;
      const prev = this.ghostX;
      this.ghostX += (target - this.ghostX) * Math.min(1, dt * 14);
      const moving = Math.abs(target - prev) > 0.02;
      this.ghost.position.set(
        this.ghostX,
        0.21 + (moving ? Math.abs(Math.sin(t * 16)) * 0.25 : 0),
        -0.45
      );
      const gud = this.ghost.userData as { legs: THREE.Group[] };
      const gs = moving ? Math.sin(t * 16) * 0.8 : 0;
      gud.legs[0].rotation.z = gs;
      gud.legs[1].rotation.z = -gs;
    }

    // Trail particles
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k];
      p.life += dt;
      p.m.position.addScaledVector(p.v, dt);
      if (this.look.trail !== 'fire' && this.look.trail !== 'bubble' && this.look.trail !== 'aurora') {
        p.v.y -= dt * 4 * grav;
      }
      p.m.rotation.x += dt * 5;
      p.m.rotation.y += dt * 4;
      const f = 1 - p.life / p.max;
      p.m.scale.setScalar(Math.max(0.01, f));
      if (p.life >= p.max) {
        this.scene.remove(p.m);
        (p.m.material as THREE.Material).dispose();
        this.particles.splice(k, 1);
      }
    }
    if (this.combo >= 20 && Math.random() < 0.3) this.emitTrailIdle();

    // Ambient world particles (petals, snow, stars, embers, fireflies, bubbles)
    if (this.ambient) {
      const pos = this.ambient.geometry.attributes.position as THREE.BufferAttribute;
      const pKind = this.world.particles;
      const vy =
        pKind === 'stars' || pKind === 'fireflies'
          ? 0
          : pKind === 'embers' || pKind === 'bubbles'
            ? 0.85
            : pKind === 'snow'
              ? -1.2
              : -0.6;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + vy * dt + (pKind === 'fireflies' ? Math.sin(t * 2 + i) * dt * 0.4 : 0);
        let x = pos.getX(i) + Math.sin(t + i) * dt * 0.35;
        if (vy < 0 && y < -6) y = 14;
        if (vy > 0 && y > 14) y = -6;
        if (x < this.camX - 25) x += 60;
        pos.setXY(i, x, y);
      }
      pos.needsUpdate = true;
    }

    // Islands bob & recycle
    for (const isl of this.islands.children) {
      if (isl.userData.bob !== undefined) {
        isl.position.y += Math.sin(t * 0.6 * grav + isl.userData.bob) * dt * 0.15;
        if (isl.position.x < this.camX - 30) isl.position.x += 234;
      }
    }
    if (this.finishFlag) {
      const fl = this.finishFlag.userData.flag as THREE.Mesh;
      fl.rotation.y = Math.sin(t * 3) * 0.2;
    }

    // Camera follow
    this.camX += (this.char.position.x - this.camX) * Math.min(1, dt * 3 * speed);
    this.zoom += (Math.min(this.combo, 40) / 40 - this.zoom) * Math.min(1, dt * 4);
    this.render();
    this.scheduleNextFrame();
  };

  render() {
    placeCamera(this.camera, this.framing, this.camX, this.zoom);
    const sun = this.scene.userData.sun as THREE.DirectionalLight;
    sun.position.set(this.camX - 4, 10, 6);
    sun.target.position.set(this.camX + 2, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  emitTrailIdle() {
    const m = new THREE.Mesh(
      this.pGeo,
      new THREE.MeshBasicMaterial({ color: this.tierColor(), transparent: true })
    );
    m.position
      .copy(this.char.position)
      .add(new THREE.Vector3(-0.3, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6));
    this.scene.add(m);
    this.particles.push({ m, v: new THREE.Vector3(-1.5, 0.3, 0), life: 0, max: 0.5 });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timerId);
    this.renderer.dispose();
  }
}
