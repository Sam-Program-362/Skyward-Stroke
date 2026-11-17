import * as THREE from 'three';
import { OUTFITS, type Look, type World } from './data';
import { applyFraming, type Insets } from './framing';

const STEP_X = 1.35;
const STEP_Z = -0.35;

function isSoftwareWebGL(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const r = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      if (/swiftshader|llvmpipe|software|mesa offscreen/i.test(r)) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

const texCache = new Map<string, THREE.CanvasTexture>();
function letterTex(ch: string, maxAnisotropy = 1): THREE.CanvasTexture {
  const key = ch || ' ';
  const hit = texCache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);

  // High-contrast dark-tinted keycap well so white/gold letters pop on every world color
  const grad = g.createLinearGradient(0, 16, 0, 240);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.68)');
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(16, 16, 224, 224, 38);
  g.fill();

  // Crisp bright keycap bevel border
  g.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(20, 20, 216, 216, 34);
  g.stroke();

  if (!ch || ch === ' ') {
    // Stylized 3D spacebar emblem
    g.strokeStyle = '#ffffff';
    g.lineWidth = 14;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(68, 130);
    g.lineTo(68, 158);
    g.lineTo(188, 158);
    g.lineTo(188, 130);
    g.stroke();
  } else {
    const isUpper = /^[A-Z]$/.test(ch);
    const isPunct = !/[a-zA-Z0-9]/.test(ch);
    const isNum = /^[0-9]$/.test(ch);

    // Deep drop shadow under glyph
    g.fillStyle = 'rgba(0, 0, 0, 0.65)';
    g.font = '900 148px Nunito, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, 128, 134);

    // Main vibrant glyph fill
    g.fillStyle = isPunct ? '#fde047' : isNum ? '#7dd3fc' : '#ffffff';
    g.fillText(ch, 128, 124);

    if (isUpper) {
      g.fillStyle = '#fde047';
      g.beginPath();
      g.roundRect(72, 196, 112, 16, 8);
      g.fill();
    } else if (isPunct) {
      g.fillStyle = '#fde047';
      g.beginPath();
      g.arc(200, 56, 11, 0, Math.PI * 2);
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

interface Block {
  group: THREE.Group;
  meshGroup: THREE.Group;
  mat: THREE.MeshPhongMaterial;
  rimMat: THREE.MeshLambertMaterial;
  capMat: THREE.MeshLambertMaterial;
  topMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  basePos: THREE.Vector3;
  y: number;
  vy: number;
  scale: number;
  rotX: number;
  rotZ: number;
  ch: string;
  typed: boolean;
}

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  life: number;
  maxLife: number;
}

const TIER_HEX = [0x4c7dff, 0x10b981, 0xf59e0b, 0xec4899];

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cam: THREE.PerspectiveCamera;
  private world: World;
  private look: Look;
  private isSoftGl = false;
  private maxAniso = 1;

  private blocks: Block[] = [];
  private islands = new THREE.Group();
  private finishGroup = new THREE.Group();
  private charGroup: THREE.Group;
  private leftLeg: THREE.Mesh | null = null;
  private rightLeg: THREE.Mesh | null = null;
  private leftArm: THREE.Mesh | null = null;
  private rightArm: THREE.Mesh | null = null;
  private scarfMesh: THREE.Mesh | null = null;
  private ghostGroup: THREE.Group;
  private trailParticles: Particle[] = [];
  private ambientMesh: THREE.Points | null = null;

  // Shared geometries for blocks & particles
  private bodyGeo = new THREE.BoxGeometry(1.08, 0.34, 1.08);
  private rimGeo = new THREE.BoxGeometry(1.12, 0.18, 1.12);
  private capGeo = new THREE.BoxGeometry(0.96, 0.08, 0.96);
  private topPlaneGeo = new THREE.PlaneGeometry(0.9, 0.9);
  private ringGeo = new THREE.RingGeometry(0.56, 0.67, 24);
  private particleGeo = new THREE.OctahedronGeometry(0.11, 0);
  private bubbleGeo = new THREE.SphereGeometry(0.1, 8, 8);

  private text = '';
  private typed = 0;
  private started = false;
  private ghostTimes: number[] | null = null;
  private runStartMs = 0;

  private charPos = new THREE.Vector3(-STEP_X, 0, -STEP_Z);
  private charFrom = new THREE.Vector3(-STEP_X, 0, -STEP_Z);
  private charTo = new THREE.Vector3(-STEP_X, 0, -STEP_Z);
  private jumpT = 1;
  private jumpSpin = 0;
  private shakeT = 0;

  private w = 800;
  private h = 600;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private raf = 0;
  private timerId = 0;
  private disposed = false;
  private lastMs = performance.now();

  public showFinish = true;
  public onStep?: () => void;

  constructor(canvas: HTMLCanvasElement, world: World, look: Look) {
    this.world = world;
    this.look = look;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const gl = this.renderer.getContext();
    this.isSoftGl = isSoftwareWebGL(gl);
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() || 1;
    this.renderer.setPixelRatio(this.isSoftGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(world.fog, 0.02);

    this.cam = new THREE.PerspectiveCamera(45, 1.33, 0.1, 150);

    const hemi = new THREE.HemisphereLight(0xffffff, world.island, 1.2);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff8eb, 1.35);
    dir.position.set(14, 26, 18);
    this.scene.add(dir);

    const rimLight = new THREE.DirectionalLight(0xa5f3fc, 0.55);
    rimLight.position.set(-12, 10, -14);
    this.scene.add(rimLight);

    this.scene.add(this.islands);
    this.scene.add(this.finishGroup);

    this.charGroup = this.buildChar(look, false);
    this.scene.add(this.charGroup);

    this.ghostGroup = this.buildChar(look, true);
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);

    this.buildAmbientParticles();
    this.scheduleNextFrame();
  }

  private buildChar(look: Look, isGhost: boolean): THREE.Group {
    const g = new THREE.Group();
    const outfit = OUTFITS.find(o => o.id === look.outfit) || OUTFITS[0];
    const bodyCol = isGhost ? 0xa5f3fc : outfit.color;
    const accentCol = isGhost ? 0xffffff : outfit.accent || '#ffffff';
    const matOpts = isGhost ? { transparent: true, opacity: 0.42 } : {};

    // Contact shadow
    if (!isGhost) {
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.44, 20),
        new THREE.MeshBasicMaterial({
          color: 0x090d24,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
        })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.02;
      g.add(shadow);
    }

    // Legs & Sneakers
    const shoeMat = new THREE.MeshLambertMaterial({
      color: isGhost ? 0xffffff : 0xef4444,
      ...matOpts,
    });
    const legMat = new THREE.MeshLambertMaterial({
      color: isGhost ? 0xcffafe : 0x1e293b,
      ...matOpts,
    });
    [-0.14, 0.14].forEach((zOff, idx) => {
      const legPivot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 10), legMat);
      legPivot.position.set(0, 0.2, zOff);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.11, 0.15), shoeMat);
      shoe.position.set(0.04, -0.13, 0);
      legPivot.add(shoe);
      g.add(legPivot);
      if (!isGhost) {
        if (idx === 0) this.leftLeg = legPivot;
        else this.rightLeg = legPivot;
      }
    });

    // Torso
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.26, 0.28, 8, 14),
      new THREE.MeshPhongMaterial({
        color: bodyCol,
        shininess: 45,
        ...matOpts,
      })
    );
    torso.position.y = 0.56;
    g.add(torso);

    // Swinging Arms
    const armMat = new THREE.MeshLambertMaterial({ color: bodyCol, ...matOpts });
    [-0.31, 0.31].forEach((zOff, idx) => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.2, 6, 10), armMat);
      arm.position.set(0, 0.56, zOff);
      g.add(arm);
      if (!isGhost) {
        if (idx === 0) this.leftArm = arm;
        else this.rightArm = arm;
      }
    });

    // Collar & fluttering scarf
    const collarMat = new THREE.MeshLambertMaterial({ color: accentCol, ...matOpts });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 18), collarMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.78;
    g.add(collar);

    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.085, 0.15), collarMat);
    scarf.position.set(-0.26, 0.75, 0.08);
    scarf.rotation.z = 0.22;
    g.add(scarf);
    if (!isGhost) this.scarfMesh = scarf;

    // Flow Jetpack
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.3, 0.28),
      new THREE.MeshLambertMaterial({ color: isGhost ? 0xbae6fd : 0x334155, ...matOpts })
    );
    pack.position.set(-0.24, 0.56, 0);
    g.add(pack);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.31, 18, 16),
      new THREE.MeshLambertMaterial({ color: isGhost ? 0xe0f2fe : 0xfff3eb, ...matOpts })
    );
    head.position.y = 1.08;
    g.add(head);

    // Eyes
    if (!isGhost) {
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x181c30 });
      [-0.1, 0.1].forEach(zOff => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
        eye.position.set(0.27, 1.1, zOff);
        g.add(eye);
      });
    }

    // Hat / Hair
    if (look.hat === 'cap') {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.325, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshLambertMaterial({ color: 0xff3b5c, ...matOpts })
      );
      cap.position.y = 1.1;
      g.add(cap);
      const brim = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.035, 0.34),
        new THREE.MeshLambertMaterial({ color: 0xe11d48, ...matOpts })
      );
      brim.position.set(0.24, 1.12, 0);
      g.add(brim);
    } else if (look.hat === 'crown') {
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.2, 0.17, 6),
        new THREE.MeshPhongMaterial({ color: 0xffcc33, shininess: 90, ...matOpts })
      );
      crown.position.y = 1.42;
      g.add(crown);
    } else if (look.hat === 'halo') {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.27, 0.038, 10, 24),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 1.52;
      g.add(halo);
    } else {
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.33, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
        new THREE.MeshLambertMaterial({
          color: look.hat === 'beanie' ? 0xffd23d : look.hat === 'visor' ? 0x00f0ff : 0xff6a2b,
          ...matOpts,
        })
      );
      hair.position.y = 1.1;
      g.add(hair);
    }

    return g;
  }

  private buildAmbientParticles() {
    if (this.world.particles === 'none') return;
    const count = this.isSoftGl ? 70 : 140;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.2) * 44;
      pos[i * 3 + 1] = (Math.random() - 0.3) * 18;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 34;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const colMap: Record<string, number> = {
      petals: 0xffb3d9,
      snow: 0xffffff,
      stars: 0xfef08a,
      embers: 0xfb923c,
      fireflies: 0x6ee7b7,
      bubbles: 0x67e8f9,
    };
    const mat = new THREE.PointsMaterial({
      color: colMap[this.world.particles] || 0xffffff,
      size: 0.24,
      transparent: true,
      opacity: 0.82,
    });
    this.ambientMesh = new THREE.Points(geo, mat);
    this.scene.add(this.ambientMesh);
  }

  private posFor(idx: number): THREE.Vector3 {
    const wave = Math.sin(idx * 0.35) * 0.65;
    return new THREE.Vector3(idx * STEP_X, 0, idx * STEP_Z + wave);
  }

  private addIsland(pos: THREE.Vector3, radius = 2.2) {
    const g = new THREE.Group();
    g.position.copy(pos);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.88, 0.44, 7),
      new THREE.MeshLambertMaterial({ color: this.world.grass })
    );
    top.position.y = -0.22;
    g.add(top);

    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.86, radius * 1.4, 7),
      new THREE.MeshLambertMaterial({ color: this.world.island })
    );
    rock.rotation.x = Math.PI;
    rock.position.y = -0.44 - (radius * 1.4) / 2;
    g.add(rock);

    // Decorative tree/crystal prop
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.58, 6),
      new THREE.MeshLambertMaterial({ color: 0x78350f })
    );
    trunk.position.set(-radius * 0.42, 0.28, -radius * 0.28);
    g.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.45, 0),
      new THREE.MeshLambertMaterial({ color: this.world.sky[1] })
    );
    crown.position.set(-radius * 0.42, 0.72, -radius * 0.28);
    g.add(crown);

    this.islands.add(g);
  }

  private buildFinishGate(pos: THREE.Vector3) {
    this.finishGroup.clear();
    if (!this.showFinish) return;

    this.finishGroup.position.copy(pos);
    this.addIsland(pos.clone().add(new THREE.Vector3(STEP_X * 0.9, 0, STEP_Z * 0.9)), 2.4);

    const pillarMat = new THREE.MeshPhongMaterial({ color: 0xfef08a, shininess: 80 });
    const archGroup = new THREE.Group();
    archGroup.position.set(STEP_X * 0.65, 0, STEP_Z * 0.65);
    archGroup.rotation.y = Math.atan2(-STEP_Z, STEP_X);

    [-1.05, 1.05].forEach(zOff => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.4, 10), pillarMat);
      p.position.set(0, 1.2, zOff);
      archGroup.add(p);
    });

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.32, 2.45),
      new THREE.MeshPhongMaterial({ color: 0x6366f1, emissive: 0x312e81, emissiveIntensity: 0.4 })
    );
    beam.position.set(0, 2.35, 0);
    archGroup.add(beam);

    const star = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 0),
      new THREE.MeshBasicMaterial({ color: 0xfde047 })
    );
    star.position.set(0, 2.85, 0);
    archGroup.add(star);

    this.finishGroup.add(archGroup);
  }

  public setText(text: string, typed: number) {
    this.text = text;
    this.typed = typed;

    for (const b of this.blocks) this.scene.remove(b.group);
    this.blocks = [];
    this.islands.clear();
    this.finishGroup.clear();

    // Starting island
    this.addIsland(new THREE.Vector3(-STEP_X * 1.2, 0, -STEP_Z * 1.2), 2.5);

    for (let i = 0; i < text.length; i++) {
      this.spawnBlock(i, text[i]);
      if (i > 0 && i % 12 === 0) {
        const side = i % 24 === 0 ? -1 : 1;
        const p = this.posFor(i).add(new THREE.Vector3(0, -0.6, side * 4.2));
        this.addIsland(p, 1.7);
      }
    }

    if (this.showFinish && text.length > 0) {
      this.buildFinishGate(this.posFor(text.length - 1));
    }

    const startPos = typed > 0 ? this.posFor(typed - 1) : new THREE.Vector3(-STEP_X, 0, -STEP_Z);
    this.charPos.copy(startPos);
    this.charFrom.copy(startPos);
    this.charTo.copy(startPos);
    this.charGroup.position.copy(startPos);
  }

  public appendText(more: string) {
    const startIdx = this.text.length;
    this.text += more;
    for (let i = 0; i < more.length; i++) {
      this.spawnBlock(startIdx + i, more[i]);
    }
  }

  private spawnBlock(idx: number, ch: string) {
    const pos = this.posFor(idx);
    const group = new THREE.Group();
    const meshGroup = new THREE.Group();
    group.add(meshGroup);

    const isSpace = ch === ' ';
    const isTyped = idx < this.typed;
    const baseColor = new THREE.Color(isSpace ? '#475569' : this.world.block);
    const darkRimColor = baseColor.clone().multiplyScalar(0.42);
    const capColor = baseColor.clone().multiplyScalar(0.88);

    // 1. Deep 3D bottom shadow plinth (gives every block tactile keycap depth)
    const rimMat = new THREE.MeshLambertMaterial({
      color: darkRimColor,
      transparent: true,
      opacity: isTyped ? 1 : 0.9,
    });
    const rimBox = new THREE.Mesh(this.rimGeo, rimMat);
    rimBox.position.y = -0.35;
    meshGroup.add(rimBox);

    // 2. Main 3D block body with specular & emissive combo glow
    const mat = new THREE.MeshPhongMaterial({
      color: baseColor,
      emissive: baseColor.clone().multiplyScalar(isTyped ? 0.22 : 0.06),
      shininess: 65,
      specular: new THREE.Color(0xffffff),
      transparent: true,
      opacity: isTyped ? 1 : 0.88,
    });
    const box = new THREE.Mesh(this.bodyGeo, mat);
    box.position.y = -0.17;
    meshGroup.add(box);

    // 3. Raised beveled keycap top rim
    const capMat = new THREE.MeshLambertMaterial({
      color: capColor,
      transparent: true,
      opacity: isTyped ? 1 : 0.94,
    });
    const capBox = new THREE.Mesh(this.capGeo, capMat);
    capBox.position.y = 0.01;
    meshGroup.add(capBox);

    // 4. Crisp high-contrast letter decal on keycap face
    const topMat = new THREE.MeshBasicMaterial({
      map: letterTex(ch, this.maxAniso),
      transparent: true,
      opacity: isTyped ? 1 : 0.98,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const topPlane = new THREE.Mesh(this.topPlaneGeo, topMat);
    topPlane.rotation.x = -Math.PI / 2;
    topPlane.position.y = 0.055;
    meshGroup.add(topPlane);

    // 5. Target beacon halo ring (visible on the current expected block)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.02;
    ringMesh.visible = idx === this.typed;
    meshGroup.add(ringMesh);

    group.position.copy(pos);
    const inInitialWindow = idx <= this.typed + 13;
    const initScale = inInitialWindow ? (isTyped ? 1 : 0.95) : 0.01;
    const initY = inInitialWindow ? (isTyped ? 0 : 0.1) : -1.8;
    group.position.y = pos.y + initY;
    group.scale.setScalar(initScale);
    group.visible = idx <= this.typed + 15;
    this.scene.add(group);

    this.blocks.push({
      group,
      meshGroup,
      mat,
      rimMat,
      capMat,
      topMat,
      ringMesh,
      ringMat,
      basePos: pos.clone(),
      y: initY,
      vy: 0,
      scale: initScale,
      rotX: 0,
      rotZ: 0,
      ch,
      typed: isTyped,
    });
  }

  private spawnTrailBurst(origin: THREE.Vector3, combo: number, isWordEnd: boolean) {
    const count = this.isSoftGl ? (isWordEnd ? 8 : 4) : isWordEnd ? 14 : 7;
    const trail = this.look.trail || 'sparkle';
    const rainbowCols = [0xff5fd2, 0x38bdf8, 0x3fd67a, 0xffc53d, 0xa855f7];

    for (let i = 0; i < count; i++) {
      let col = 0xfde047;
      if (trail === 'bubble') col = 0x67e8f9;
      else if (trail === 'fire') col = i % 2 === 0 ? 0xf97316 : 0xfacc15;
      else if (trail === 'aurora') col = i % 2 === 0 ? 0x34d399 : 0x38bdf8;
      else if (trail === 'rainbow') col = rainbowCols[i % rainbowCols.length];
      else if (combo >= 30) col = 0xff5fd2;
      else if (combo >= 20) col = 0xffc53d;
      else if (combo >= 10) col = 0x3fd67a;

      const geo = trail === 'bubble' ? this.bubbleGeo : this.particleGeo;
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        origin.x + (Math.random() - 0.5) * 0.7,
        origin.y + 0.12 + Math.random() * 0.25,
        origin.z + (Math.random() - 0.5) * 0.7
      );
      const angle = Math.random() * Math.PI * 2;
      const speed = (isWordEnd ? 2.4 : 1.5) + Math.random() * 1.8;
      const life = 0.42 + Math.random() * 0.35;
      this.scene.add(mesh);
      this.trailParticles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 1.8 + Math.random() * (isWordEnd ? 3.2 : 2.1),
        vz: Math.sin(angle) * speed,
        rx: (Math.random() - 0.5) * 8,
        ry: (Math.random() - 0.5) * 8,
        life,
        maxLife: life,
      });
    }
  }

  public setGhost(times: number[]) {
    this.ghostTimes = times;
    this.ghostGroup.visible = true;
  }

  public setViewport(w: number, h: number, insets: Insets) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.insets = insets;
    this.renderer.setSize(this.w, this.h, false);
    applyFraming(this.cam, this.w, this.h, this.insets);
  }

  public start() {
    if (!this.started) {
      this.started = true;
      this.runStartMs = performance.now();
    }
  }

  public correct(typed: number, combo: number) {
    this.typed = typed;
    const idx = typed - 1;
    const blk = this.blocks[idx];
    if (blk) {
      blk.typed = true;
      blk.mat.opacity = 1;
      blk.rimMat.opacity = 1;
      blk.capMat.opacity = 1;
      blk.topMat.opacity = 1;
      blk.ringMesh.visible = false;

      // Apply vibrant combo-tier color & emissive bloom on locked block
      const tierIdx = Math.min(3, Math.floor(combo / 10));
      const tierCol = new THREE.Color(tierIdx > 0 ? TIER_HEX[tierIdx] : this.world.block);
      if (blk.ch !== ' ') {
        blk.mat.color.copy(tierCol);
        blk.mat.emissive.copy(tierCol).multiplyScalar(0.28);
        blk.capMat.color.copy(tierCol).multiplyScalar(0.86);
        blk.rimMat.color.copy(tierCol).multiplyScalar(0.42);
      } else {
        blk.mat.color.setHex(0x0284c7);
        blk.mat.emissive.setHex(0x0369a1);
        blk.capMat.color.setHex(0x0369a1);
      }

      // Snappy mechanical keycap press & spring bounce that settles flush at y = 0
      blk.y = -0.14;
      blk.vy = 1.8;
      blk.scale = 1.18;
      blk.rotX = 0;
      blk.rotZ = 0;

      const isWordEnd = blk.ch === ' ';
      this.spawnTrailBurst(blk.basePos, combo, isWordEnd);

      // Send a bounded ripple wave to adjacent blocks ahead and behind
      for (let off = 1; off <= 3; off++) {
        const nextB = this.blocks[idx + off];
        if (nextB) {
          nextB.vy = Math.min(0.65, nextB.vy + 0.35 / off);
          nextB.scale = Math.max(nextB.scale, 1 + 0.06 / off);
        }
      }
      if (isWordEnd) {
        for (let back = 1; back <= 5; back++) {
          const prevB = this.blocks[idx - back];
          if (prevB) {
            prevB.vy = Math.min(0.55, prevB.vy + 0.35 * (1 - back * 0.15));
            prevB.scale = 1.06;
          }
        }
      }

      // Anchor jump origin to the previous block so rapid typing stays centered on the path
      const prevBlockPos =
        idx > 0 ? this.posFor(idx - 1) : new THREE.Vector3(-STEP_X, 0, -STEP_Z);
      if (this.jumpT < 1) {
        this.charPos.copy(prevBlockPos);
      }
      this.charFrom.copy(this.charPos);
      this.charTo.copy(this.posFor(idx));
      this.jumpT = 0;
      this.jumpSpin = isWordEnd || combo >= 20 ? Math.PI * 2 : 0;
    }
  }

  public miss() {
    this.shakeT = 0.28;
    const target = this.blocks[this.typed];
    if (target) {
      target.vy = 1.8;
      target.scale = 1.15;
      target.rotZ = (Math.random() > 0.5 ? 1 : -1) * 0.32;
      target.mat.emissive.setHex(0xef4444);
    }
  }

  private scheduleNextFrame() {
    if (this.disposed) return;
    if (this.isSoftGl) {
      this.timerId = window.setTimeout(() => {
        this.raf = requestAnimationFrame(() => this.tick());
      }, 16);
    } else {
      this.raf = requestAnimationFrame(() => this.tick());
    }
  }

  private tick() {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastMs) / 1000));
    this.lastMs = now;

    // Runner jump & limb animation
    if (this.jumpT < 1) {
      this.jumpT = Math.min(1, this.jumpT + dt * 7.8);
      this.charPos.lerpVectors(this.charFrom, this.charTo, this.jumpT);
      const arc = (Math.sin(this.jumpT * Math.PI) * 0.68) / Math.max(0.55, this.world.gravity);
      this.charGroup.position.set(this.charPos.x, this.charPos.y + arc, this.charPos.z);

      // Forward pitch + celebratory spin during jump
      const stride = Math.sin(this.jumpT * Math.PI);
      this.charGroup.rotation.z = -stride * 0.22;
      this.charGroup.rotation.y = this.jumpSpin * this.jumpT;

      if (this.leftLeg && this.rightLeg) {
        this.leftLeg.rotation.z = stride * 0.65;
        this.rightLeg.rotation.z = -stride * 0.65;
      }
      if (this.leftArm && this.rightArm) {
        this.leftArm.rotation.z = -stride * 0.75;
        this.rightArm.rotation.z = stride * 0.75;
      }

      if (this.jumpT >= 1) {
        this.charGroup.rotation.z = 0;
        this.charGroup.rotation.y = 0;
        if (this.onStep) this.onStep();
      }
    } else {
      const idleBob = Math.sin(now * 0.005) * 0.04;
      this.charGroup.position.set(this.charPos.x, this.charPos.y + idleBob, this.charPos.z);
      this.charGroup.rotation.z = Math.sin(now * 0.003) * 0.025;
      this.charGroup.rotation.y = 0;
      if (this.leftLeg && this.rightLeg) {
        this.leftLeg.rotation.z *= 0.82;
        this.rightLeg.rotation.z *= 0.82;
      }
      if (this.leftArm && this.rightArm) {
        this.leftArm.rotation.z = Math.sin(now * 0.004) * 0.08;
        this.rightArm.rotation.z = -Math.sin(now * 0.004) * 0.08;
      }
    }

    if (this.scarfMesh) {
      this.scarfMesh.rotation.z =
        0.22 + Math.sin(now * 0.012) * 0.18 + (this.jumpT < 1 ? 0.25 : 0);
    }

    // Update visible window of blocks with floating wave & spring physics
    const lo = Math.max(0, this.typed - 9);
    const hi = Math.min(this.blocks.length, this.typed + 16);
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const vis = i >= lo && i < hi;
      if (vis && !b.group.visible) {
        // Newly revealed horizon block rises up & pops in from the clouds
        b.y = -1.6;
        b.vy = 2.8;
        b.scale = 0.08;
        b.rotZ = 0.28;
      }
      b.group.visible = vis;
      if (!vis) continue;

      const isCurrent = i === this.typed;
      const isPast = i < this.typed;

      // Target Y: past blocks lock flat at y=0; upcoming blocks float & bob in a gentle wave
      const floatWave = isPast
        ? 0
        : isCurrent
          ? 0.06 + Math.sin(now * 0.007) * 0.05
          : 0.1 + Math.sin(now * 0.0036 + i * 0.55) * 0.12;

      // Spring physics towards target Y
      const forceY = (floatWave - b.y) * 38;
      b.vy += forceY * dt;
      b.vy *= Math.pow(0.1, dt);
      b.y += b.vy * dt;

      // Target Scale: current target block pulses gently; typed & upcoming blocks settle smoothly
      const targetScale = isPast
        ? 1
        : isCurrent
          ? 1.05 + Math.sin(now * 0.008) * 0.035
          : 0.95;
      b.scale += (targetScale - b.scale) * Math.min(1, dt * 14);

      // Gentle 3D floating tilt on untyped sky blocks; locked flat on typed bridge blocks
      if (isPast) {
        b.rotX *= Math.pow(0.02, dt);
        b.rotZ *= Math.pow(0.02, dt);
      } else {
        const targetRotX = Math.cos(now * 0.0024 + i * 0.5) * (isCurrent ? 0.025 : 0.06);
        const targetRotZ = Math.sin(now * 0.0028 + i * 0.65) * (isCurrent ? 0.025 : 0.07);
        b.rotX += (targetRotX - b.rotX) * Math.min(1, dt * 8);
        b.rotZ += (targetRotZ - b.rotZ) * Math.min(1, dt * 8);
      }

      // Target beacon halo ring on the current expected block
      b.ringMesh.visible = isCurrent;
      if (isCurrent) {
        const pulse = 0.96 + Math.sin(now * 0.01) * 0.07;
        b.ringMesh.scale.setScalar(pulse);
        b.ringMat.opacity = 0.65 + Math.sin(now * 0.01) * 0.3;
      }

      b.group.position.y = b.basePos.y + b.y;
      b.group.scale.setScalar(b.scale);
      b.meshGroup.rotation.set(b.rotX, 0, b.rotZ);
    }

    // Ambient world particles drift
    if (this.ambientMesh) {
      this.ambientMesh.rotation.y = now * 0.00008;
      this.ambientMesh.position.x = this.charPos.x * 0.7;
      this.ambientMesh.position.z = this.charPos.z * 0.7;
    }

    // Ghost runner interpolation
    if (this.started && this.ghostTimes && this.ghostTimes.length > 0) {
      const elapsed = now - this.runStartMs;
      let gIdx = 0;
      while (gIdx < this.ghostTimes.length && this.ghostTimes[gIdx] <= elapsed) gIdx++;
      const gp = gIdx > 0 ? this.posFor(gIdx - 1) : new THREE.Vector3(-STEP_X, 0, -STEP_Z);
      this.ghostGroup.position.lerp(gp, Math.min(1, dt * 10));
    }

    // Camera follow
    const shakeX = this.shakeT > 0 ? (Math.random() - 0.5) * 0.28 : 0;
    this.shakeT = Math.max(0, this.shakeT - dt);

    const targetCam = new THREE.Vector3(
      this.charPos.x + 2.8 + shakeX,
      this.charPos.y + 4.8,
      this.charPos.z + 7.4
    );
    this.cam.position.lerp(targetCam, Math.min(1, dt * 8));
    this.cam.lookAt(this.charPos.x + 2.4, this.charPos.y + 0.5, this.charPos.z - 0.6);

    // Update trail burst particles
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.trailParticles.splice(i, 1);
      } else {
        p.vy -= 5.2 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.rx * dt;
        p.mesh.rotation.y += p.ry * dt;
        const ratio = Math.max(0.01, p.life / p.maxLife);
        p.mesh.scale.setScalar(ratio);
      }
    }

    this.renderer.render(this.scene, this.cam);
    this.scheduleNextFrame();
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timerId);
    for (const p of this.trailParticles) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.trailParticles = [];
    this.bodyGeo.dispose();
    this.rimGeo.dispose();
    this.capGeo.dispose();
    this.topPlaneGeo.dispose();
    this.ringGeo.dispose();
    this.particleGeo.dispose();
    this.bubbleGeo.dispose();
    this.renderer.dispose();
  }
}
