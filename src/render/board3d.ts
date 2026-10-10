// The 3D tabletop. Everything is built from three.js primitives and textures drawn in code
// (see ASSETS.md); the minis are original stand-ins, not sculpts of official miniatures.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BoardView } from './view';

const FACING_ROT: Record<string, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

type Pickable = THREE.Object3D & { userData: { pick?: string; label?: string } };
type Mini = THREE.Group & { userData: { target: THREE.Vector3; ring: THREE.Mesh; nameSprite?: THREE.Sprite; pickable?: boolean } };

function boardTexture(w: number, h: number) {
  const px = 48;
  const canvas = document.createElement('canvas');
  canvas.width = w * px;
  canvas.height = h * px;
  const g = canvas.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const shade = 34 + ((x * 7 + y * 13) % 5) * 3 + ((x + y) % 2) * 4;
      g.fillStyle = `rgb(${shade + 6}, ${shade + 2}, ${shade - 2})`;
      g.fillRect(x * px, y * px, px, px);
      // speckle for a stone feel
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(0,0,0,${0.08 + ((x * 31 + y * 17 + i * 11) % 7) / 60})`;
        g.fillRect(x * px + ((i * 13 + x * 5) % px), y * px + ((i * 29 + y * 7) % px), 2, 2);
      }
    }
  }
  g.strokeStyle = 'rgba(210, 180, 120, 0.28)';
  g.lineWidth = 2;
  for (let x = 0; x <= w; x++) {
    g.beginPath();
    g.moveTo(x * px, 0);
    g.lineTo(x * px, h * px);
    g.stroke();
  }
  for (let y = 0; y <= h; y++) {
    g.beginPath();
    g.moveTo(0, y * px);
    g.lineTo(w * px, y * px);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function labelSprite(text: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.font = '600 30px system-ui, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 24);
  g.fillStyle = 'rgba(12, 10, 8, 0.78)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 10, w, 44, 12);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#f4ead8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33, 236);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function survivorMini(color: string) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xcdb9a0, roughness: 0.7 });
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.08, 32), stone);
  base.position.y = 0.04;
  base.castShadow = base.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.025, 8, 40), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 6, 16), cloth);
  body.position.y = 0.42;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), skin);
  head.position.y = 0.78;
  head.castShadow = true;
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), skin);
  arm.position.set(0.2, 0.46, 0.04);
  arm.rotation.z = -0.35;
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0xffa630, emissiveIntensity: 1.6 }));
  lantern.position.set(0.3, 0.3, 0.08);
  g.add(base, ring, body, head, arm, lantern);
  g.userData.ring = ring;
  return g;
}

function stagMini(w: number, h: number) {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3733, roughness: 0.9 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, emissive: 0x8fd0ff, emissiveIntensity: 1.2, roughness: 0.4 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.08, h - 0.1), new THREE.MeshStandardMaterial({ color: 0x161412, roughness: 0.95 }));
  base.position.y = 0.04;
  base.receiveShadow = base.castShadow = true;
  const s = Math.min(w, h);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), hide);
  body.scale.set(0.75 * s, 0.62 * s, 1.15 * s);
  body.position.set(0, 1.0 * s, -0.05 * s);
  body.castShadow = true;
  g.add(base, body);
  for (const [lx, lz] of [[-0.24, 0.32], [0.24, 0.32], [-0.24, -0.38], [0.24, -0.38]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * s, 0.04 * s, 0.85 * s, 10), dark);
    leg.position.set(lx * s, 0.47 * s, lz * s);
    leg.castShadow = true;
    g.add(leg);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * s, 0.16 * s, 0.6 * s, 12), hide);
  neck.position.set(0, 1.3 * s, 0.5 * s);
  neck.rotation.x = 0.6;
  neck.castShadow = true;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.13 * s, 0.42 * s, 14), hide);
  head.position.set(0, 1.55 * s, 0.82 * s);
  head.rotation.x = Math.PI / 2 + 0.35;
  head.castShadow = true;
  g.add(neck, head);
  for (const side of [-1, 1]) {
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * s, 0.03 * s, 0.6 * s, 6), glow);
    main.position.set(side * 0.16 * s, 1.85 * s, 0.68 * s);
    main.rotation.z = -side * 0.55;
    g.add(main);
    for (let i = 0; i < 3; i++) {
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.02 * s, 0.24 * s, 5), glow);
      tine.position.set(side * (0.24 + i * 0.07) * s, (1.88 + i * 0.1) * s, 0.68 * s);
      tine.rotation.z = -side * (1.1 - i * 0.2);
      g.add(tine);
    }
  }
  const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.03 * s, 8, 6), glow);
  eyes.position.set(0, 1.62 * s, 0.98 * s);
  eyes.scale.x = 4;
  g.add(eyes);
  const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(w, h) * 0.58, Math.max(w, h) * 0.64, 48), new THREE.MeshBasicMaterial({ color: 0xff6b4a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.09;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

export class Board3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private boardGroup = new THREE.Group();
  private highlights = new THREE.Group();
  private minis = new Map<string, Mini>();
  private monster: THREE.Group | null = null;
  private monsterTarget = new THREE.Vector3();
  private monsterRot = 0;
  private view: BoardView | null = null;
  private dims = { w: 0, h: 0 };
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private down: { x: number; y: number } | null = null;
  private hovered: string | null = null;
  private clock = new THREE.Clock();
  private resizeObserver: ResizeObserver;
  private disposed = false;

  constructor(
    private container: HTMLElement,
    private onPick: (optionId: string) => void,
    private onHover: (label: string | null) => void,
    private onLost: (reason: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute('aria-label', 'Showdown board, 3D view. All actions are also available as buttons in the side panel.');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      // Disposing the renderer on purpose also fires this event; only report real losses.
      if (!this.disposed) this.onLost('The graphics context was lost.');
    });
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 45;
    this.controls.screenSpacePanning = false;
    this.scene.background = new THREE.Color(0x0b0a09);
    this.scene.fog = new THREE.Fog(0x0b0a09, 28, 60);
    this.scene.add(new THREE.HemisphereLight(0x8a90a0, 0x1a140e, 0.55));
    const key = new THREE.DirectionalLight(0xffe2b8, 1.6);
    key.position.set(-8, 18, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 1, far: 50 });
    this.scene.add(key);
    const lanternGlow = new THREE.PointLight(0xffa64a, 18, 18, 1.6);
    lanternGlow.position.set(0, 3, 0);
    this.scene.add(lanternGlow);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x14110e, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.21;
    floor.receiveShadow = true;
    this.scene.add(floor, this.boardGroup, this.highlights);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!this.down) return;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      this.down = null;
      if (moved > 6) return;
      const hit = this.pickAt(e);
      if (hit) this.onPick(hit);
    });
    el.addEventListener('pointermove', (e) => {
      const obj = this.objectAt(e);
      const pick = obj?.userData.pick ?? null;
      el.style.cursor = pick ? 'pointer' : 'grab';
      if (pick !== this.hovered) {
        this.hovered = pick;
        this.onHover(obj?.userData.label ?? null);
      }
    });
    el.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.onHover(null);
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private cellPos(x: number, y: number, w = 1, h = 1) {
    return new THREE.Vector3(x + w / 2 - this.dims.w / 2, 0, y + h / 2 - this.dims.h / 2);
  }

  private buildBoard(w: number, h: number) {
    this.boardGroup.clear();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.2, h),
      [
        new THREE.MeshStandardMaterial({ color: 0x2a241d }),
        new THREE.MeshStandardMaterial({ color: 0x2a241d }),
        new THREE.MeshStandardMaterial({ map: boardTexture(w, h), roughness: 0.92 }),
        new THREE.MeshStandardMaterial({ color: 0x2a241d }),
        new THREE.MeshStandardMaterial({ color: 0x2a241d }),
        new THREE.MeshStandardMaterial({ color: 0x2a241d }),
      ],
    );
    board.position.y = -0.1;
    board.receiveShadow = true;
    this.boardGroup.add(board);
    this.dims = { w, h };
    this.resetView();
  }

  resetView() {
    const { w, h } = this.dims;
    this.camera.position.set(0, Math.max(w, h) * 0.85, h * 0.95);
    this.controls.target.set(0, 0, 0.5);
    this.controls.update();
  }

  update(v: BoardView) {
    if (v.width !== this.dims.w || v.height !== this.dims.h) this.buildBoard(v.width, v.height);
    this.view = v;
    // Highlights for legal squares.
    this.highlights.clear();
    const tileGeo = new THREE.PlaneGeometry(0.92, 0.92);
    for (const cell of v.cells) {
      const tile = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.38, depthWrite: false }));
      tile.rotation.x = -Math.PI / 2;
      tile.position.copy(this.cellPos(cell.x, cell.y)).setY(0.012);
      (tile as Pickable).userData = { pick: cell.pick, label: `Move to ${cell.label}` };
      this.highlights.add(tile);
    }
    // Survivors.
    const seen = new Set<string>();
    for (const s of v.survivors) {
      seen.add(s.id);
      let mini = this.minis.get(s.id);
      if (!mini) {
        mini = survivorMini(s.color) as Mini;
        mini.userData.target = this.cellPos(s.x, s.y);
        mini.position.copy(mini.userData.target);
        this.scene.add(mini);
        this.minis.set(s.id, mini);
      }
      const m = mini;
      m.userData.target = this.cellPos(s.x, s.y);
      m.rotation.z = s.knockedDown ? Math.PI / 2 : 0;
      m.userData.pickable = !!s.pick;
      m.traverse((o) => ((o as Pickable).userData = { ...(o as Pickable).userData, pick: s.pick, label: s.pick ? `${s.name}: ${s.pickLabel}` : `${s.name}${s.knockedDown ? ' (knocked down)' : ''}` }));
      m.userData.target = this.cellPos(s.x, s.y);
      if (m.userData.nameSprite) {
        const old = m.userData.nameSprite;
        m.remove(old);
        old.material.map?.dispose();
        old.material.dispose();
      }
      const label = labelSprite(`${s.name}${s.knockedDown ? ' ↓' : ''}`, s.active ? '#ffd27a' : s.targeted ? '#ff6b4a' : s.color);
      label.position.set(0, 1.25, 0);
      m.add(label);
      m.userData.nameSprite = label;
      const ringMat = m.userData.ring.material as THREE.MeshStandardMaterial;
      ringMat.emissiveIntensity = s.active ? 1.4 : s.pick ? 0.9 : s.targeted ? 1.2 : 0.25;
      ringMat.emissive.set(s.targeted ? '#ff6b4a' : s.active ? '#ffd27a' : s.color);
    }
    for (const [id, m] of this.minis) {
      if (!seen.has(id)) {
        this.scene.remove(m);
        this.minis.delete(id);
      }
    }
    // Monster.
    if (!this.monster) {
      this.monster = stagMini(v.monster.w, v.monster.h);
      this.monster.position.copy(this.cellPos(v.monster.x, v.monster.y, v.monster.w, v.monster.h));
      this.scene.add(this.monster);
    }
    this.monsterTarget = this.cellPos(v.monster.x, v.monster.y, v.monster.w, v.monster.h);
    this.monsterRot = FACING_ROT[v.monster.facing];
    const label = v.monster.pick ? `${v.monster.name}: ${v.monster.pickLabel}` : `${v.monster.name} (facing ${v.monster.facing})`;
    this.monster.traverse((o) => ((o as Pickable).userData = { ...(o as Pickable).userData, pick: v.monster.pick, label }));
    ((this.monster.userData.ring as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = v.monster.pick ? 0.75 : 0;
  }

  private objectAt(e: PointerEvent): Pickable | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets: THREE.Object3D[] = [...this.highlights.children, ...this.minis.values()];
    if (this.monster) targets.push(this.monster);
    const hits = this.raycaster.intersectObjects(targets, true).filter((h) => !(h.object instanceof THREE.Sprite));
    const withPick = hits.find((h) => (h.object as Pickable).userData.pick);
    return ((withPick ?? hits[0])?.object as Pickable) ?? null;
  }

  private pickAt(e: PointerEvent): string | null {
    return this.objectAt(e)?.userData.pick ?? null;
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const k = 1 - Math.pow(0.0005, dt);
    for (const m of this.minis.values()) {
      m.position.lerp(m.userData.target, k);
      const ring = m.userData.ring;
      if (m.userData.pickable) ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
      else ring.scale.setScalar(1);
    }
    if (this.monster) {
      this.monster.position.lerp(this.monsterTarget, k * 0.8);
      let dr = this.monsterRot - this.monster.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      this.monster.rotation.y += dr * k;
    }
    for (const tile of this.highlights.children) {
      const mat = (tile as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = (tile as Pickable).userData.pick === this.hovered ? 0.75 : 0.32 + Math.sin(t * 3) * 0.06;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    // Release the WebGL context now rather than when the canvas is garbage collected;
    // browsers cap live contexts and drop old ones once the cap is reached.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    void this.view;
  }
}
