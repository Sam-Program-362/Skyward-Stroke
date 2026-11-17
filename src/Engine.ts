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
function letterTex(ch: string): THREE.CanvasTexture {
  const key = ch || ' ';
  const hit = texCache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);

  if (ch && ch !== ' ') {
    const isUpper = /^[A-Z]$/.test(ch);
    const isPunct = !/[a-zA-Z0-9]/.test(ch);
    g.fillStyle = isPunct ? '#ffe89e' : '#ffffff';
    g.font = '900 78px Nunito, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, 64, 62);

    if (isUpper) {
      g.fillStyle = '#fde047';
      g.beginPath();
      g.roundRect(38, 100, 52, 8, 4);
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

interface Block {
  group: THREE.Group;
  mat: THREE.MeshLambertMaterial;
  topMat: THREE.MeshBasicMaterial;
  baseY: number;
  y: number;
  vy: number;
  scale: number;
  ch: string;
}

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cam: THREE.PerspectiveCamera;
  private world: World;
  private isSoftGl = false;

  private blocks: Block[] = [];
  private islands = new THREE.Group();
  private finishGroup = new THREE.Group();
  private charGroup: THREE.Group;
  private scarfMesh: THREE.Mesh | null = null;
  private ghostGroup: THREE.Group;
  private trailParticles: Particle[] = [];
  private ambientMesh: THREE.Points | null = null;

  private text = '';
  private typed = 0;
  private started = false;
  private ghostTimes: number[] | null = null;
  private runStartMs = 0;

  private charPos = new THREE.Vector3(-STEP_X, 0, -STEP_Z);
  private charFrom = new THREE.Vector3(-STEP_X, 0, -STEP_Z);
  private charTo = new THREE.Vector3(-STEP_X, 0, -STEP_Z);
  private jumpT = 1;
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

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const gl = this.renderer.getContext();
    this.isSoftGl = isSoftwareWebGL(gl);
    this.renderer.setPixelRatio(this.isSoftGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(world.fog, 0.022);

    this.cam = new THREE.PerspectiveCamera(45, 1.33, 0.1, 140);

    const hemi = new THREE.HemisphereLight(0xffffff, world.island, 1.15);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff8eb, 1.25);
    dir.position.set(12, 24, 16);
    this.scene.add(dir);

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
        new THREE.CircleGeometry(0.42, 16),
        new THREE.MeshBasicMaterial({ color: 0x090d24, transparent: true, opacity: 0.28 })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.02;
      g.add(shadow);
    }

    // Sneakers
    const shoeMat = new THREE.MeshLambertMaterial({ color: isGhost ? 0xffffff : 0xef4444, ...matOpts });
    const legMat = new THREE.MeshLambertMaterial({ color: isGhost ? 0xcffafe : 0x1e293b, ...matOpts });
    [-0.14, 0.14].forEach(zOff => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 8), legMat);
      leg.position.set(0, 0.2, zOff);
      g.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.15), shoeMat);
      shoe.position.set(0.04, 0.06, zOff);
      g.add(shoe);
    });

    // Torso
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.26, 0.28, 6, 12),
      new THREE.MeshLambertMaterial({ color: bodyCol, ...matOpts })
    );
    torso.position.y = 0.56;
    g.add(torso);

    // Collar & fluttering scarf
    const collarMat = new THREE.MeshLambertMaterial({ color: accentCol, ...matOpts });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 16), collarMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.78;
    g.add(collar);

    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.14), collarMat);
    scarf.position.set(-0.26, 0.75, 0.08);
    scarf.rotation.z = 0.22;
    g.add(scarf);
    if (!isGhost) this.scarfMesh = scarf;

    // Flow Jetpack
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.3, 0.28),
      new THREE.MeshLambertMaterial({ color: isGhost ? 0xbae6fd : 0x334155, ...matOpts })
    );
    pack.position.set(-0.24, 0.56, 0);
    g.add(pack);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.31, 16, 14),
      new THREE.MeshLambertMaterial({ color: isGhost ? 0xe0f2fe : 0xfff3eb, ...matOpts })
    );
    head.position.y = 1.08;
    g.add(head);

    // Eyes
    if (!isGhost) {
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x181c30 });
      [-0.1, 0.1].forEach(zOff => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), eyeMat);
        eye.position.set(0.27, 1.1, zOff);
        g.add(eye);
      });
    }

    // Hat / Hair
    if (look.hat === 'cap') {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshLambertMaterial({ color: 0xff3b5c, ...matOpts })
      );
      cap.position.y = 1.1;
      g.add(cap);
    } else if (look.hat === 'crown') {
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.2, 0.16, 6),
        new THREE.MeshLambertMaterial({ color: 0xffcc33, ...matOpts })
      );
      crown.position.y = 1.42;
      g.add(crown);
    } else if (look.hat === 'halo') {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.26, 0.035, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 1.5;
      g.add(halo);
    } else {
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.325, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
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
    const count = this.isSoftGl ? 60 : 120;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.2) * 40;
      pos[i * 3 + 1] = (Math.random() - 0.3) * 18;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 32;
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
      size: 0.22,
      transparent: true,
      opacity: 0.78,
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
      new THREE.CylinderGeometry(radius, radius * 0.88, 0.42, 7),
      new THREE.MeshLambertMaterial({ color: this.world.grass })
    );
    top.position.y = -0.21;
    g.add(top);

    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.86, radius * 1.35, 7),
      new THREE.MeshLambertMaterial({ color: this.world.island })
    );
    rock.rotation.x = Math.PI;
    rock.position.y = -0.42 - (radius * 1.35) / 2;
    g.add(rock);

    // Decorative tree/crystal prop
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.11, 0.55, 6),
      new THREE.MeshLambertMaterial({ color: 0x78350f })
    );
    trunk.position.set(-radius * 0.42, 0.26, -radius * 0.28);
    g.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.42, 0),
      new THREE.MeshLambertMaterial({ color: this.world.sky[1] })
    );
    crown.position.set(-radius * 0.42, 0.68, -radius * 0.28);
    g.add(crown);

    this.islands.add(g);
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
        this.addIsland(p, 1.65);
      }
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
    const isSpace = ch === ' ';
    const col = isSpace ? 0xe2e8f0 : this.world.block;

    const mat = new THREE.MeshLambertMaterial({
      color: col,
      transparent: true,
      opacity: idx < this.typed ? 1 : 0.68,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.28, 1.06), mat);
    box.position.y = -0.14;
    group.add(box);

    const topMat = new THREE.MeshBasicMaterial({
      map: letterTex(ch),
      transparent: true,
      opacity: idx < this.typed ? 1 : 0.92,
    });
    const topPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), topMat);
    topPlane.rotation.x = -Math.PI / 2;
    topPlane.position.y = 0.01;
    group.add(topPlane);

    group.position.copy(pos);
    const initScale = idx <= this.typed + 12 ? 0.96 : 0.01;
    group.scale.setScalar(initScale);
    group.visible = idx <= this.typed + 14;
    this.scene.add(group);

    this.blocks.push({
      group,
      mat,
      topMat,
      baseY: 0,
      y: 0,
      vy: 0,
      scale: initScale,
      ch,
    });
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

  public correct(typed: number, _combo: number) {
    this.typed = typed;
    const idx = typed - 1;
    const blk = this.blocks[idx];
    if (blk) {
      blk.mat.opacity = 1;
      blk.topMat.opacity = 1;
      blk.scale = 1.08;
      blk.vy = -2.4;
      this.charFrom.copy(this.charPos);
      this.charTo.copy(this.posFor(idx));
      this.jumpT = 0;
    }
  }

  public miss() {
    this.shakeT = 0.25;
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

    // Runner jump interpolation
    if (this.jumpT < 1) {
      this.jumpT = Math.min(1, this.jumpT + dt * 7.5);
      this.charPos.lerpVectors(this.charFrom, this.charTo, this.jumpT);
      const arc = Math.sin(this.jumpT * Math.PI) * 0.65 / Math.max(0.55, this.world.gravity);
      this.charGroup.position.set(this.charPos.x, this.charPos.y + arc, this.charPos.z);
      if (this.jumpT >= 1 && this.onStep) this.onStep();
    } else {
      this.charGroup.position.set(
        this.charPos.x,
        this.charPos.y + Math.sin(now * 0.004) * 0.04,
        this.charPos.z
      );
    }

    if (this.scarfMesh) {
      this.scarfMesh.rotation.z = 0.22 + Math.sin(now * 0.01) * 0.14;
    }

    // Update visible window of blocks
    const lo = Math.max(0, this.typed - 8);
    const hi = Math.min(this.blocks.length, this.typed + 16);
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const vis = i >= lo && i < hi;
      b.group.visible = vis;
      if (!vis) continue;
      const targetScale = i < this.typed ? 1 : 0.96;
      b.scale += (targetScale - b.scale) * Math.min(1, dt * 12);
      b.y += b.vy * dt;
      b.vy += (0 - b.y) * 28 * dt;
      b.vy *= 0.82;
      b.group.position.y = b.baseY + b.y;
      b.group.scale.setScalar(b.scale);
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

    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.trailParticles.splice(i, 1);
      } else {
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.scale.setScalar(p.life / p.maxLife);
      }
    }

    this.renderer.render(this.scene, this.cam);
    this.scheduleNextFrame();
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timerId);
    this.renderer.dispose();
  }
}
