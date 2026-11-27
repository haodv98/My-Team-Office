// Một chỗ ngồi: bàn bo góc, laptop, cốc, chậu cây, nhân vật chibi, thẻ tên + task, đèn báo, robot agent.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Desk } from '../../shared/types.js';
import { makeChibi, hashOf } from './chibi.js';
import { FONT, fitText } from './text.js';

const C = {
  top: 0xe8c9a0,
  leg: 0x3b3f46,
  chair: 0x2f3d4f,
  laptop: 0xc9ced6,
  screen: 0x2a3a4d,
  mug: 0xf6f1e9,
  pot: 0xd77a5b,
  leaf: 0x5aa469,
  paper: 0xfdfcf8,
  skin: 0xf4cfae,
  eye: 0x2b2b2b,
  red: 0xef4f45,
  yellow: 0xf5b62a,
  robot: 0x9cc6ee,
};

export interface DeskObject {
  group: THREE.Group;
  anchor: THREE.Vector3;
  update(desk: Desk): void;
  tick(t: number): void;
  bumpStack(): void;
  /** Ẩn người ở bàn khi họ đang đi lại. */
  setSeated(seated: boolean): void;
  dispose(): void;
}

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, ...extra });
const rbox = (w: number, h: number, d: number, r: number, color: number) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat(color));
  m.castShadow = m.receiveShadow = true;
  return m;
};
const sphere = (r: number, color: number, extra?: THREE.MeshStandardMaterialParameters) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color, extra));
  m.castShadow = true;
  return m;
};

/** Thẻ tên nổi: tên đậm, task đang làm, chấm trạng thái. */
function createCard() {
  const W = 640;
  const H = 200;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.5, (2.5 * H) / W, 1);
  sprite.renderOrder = 2;
  const draw = (name: string, line: string, dot: string | null) => {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.shadowColor = 'rgba(30,35,45,0.25)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath();
    ctx.roundRect(16, 12, W - 32, H - 40, 36);
    ctx.fill();
    ctx.restore();
    let x = 48;
    if (dot) {
      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(x + 12, 62, 13, 0, Math.PI * 2);
      ctx.fill();
      x += 40;
    }
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1f2328';
    ctx.font = `600 50px ${FONT}`;
    ctx.fillText(fitText(ctx, name, W - x - 48), x, 62);
    ctx.fillStyle = '#5b6470';
    ctx.font = `400 36px ${FONT}`;
    ctx.fillText(fitText(ctx, line, W - 96), 48, 122);
    tex.needsUpdate = true;
  };
  return { sprite, draw, dispose: () => tex.dispose() };
}

/** Màn hình laptop: dòng code chạy (một texture dùng chung, mỗi bàn lệch pha). */
let codeCanvas: HTMLCanvasElement | null = null;
function codeTexture(): THREE.CanvasTexture {
  if (!codeCanvas) {
    codeCanvas = document.createElement('canvas');
    codeCanvas.width = 128;
    codeCanvas.height = 256;
    const ctx = codeCanvas.getContext('2d')!;
    ctx.fillStyle = '#1e2a38';
    ctx.fillRect(0, 0, 128, 256);
    const colors = ['#7fb4ff', '#9be29b', '#f5c26b', '#d3a6ff', '#c9d4e0'];
    for (let y = 6, i = 0; y < 250; y += 10, i++) {
      let x = 8 + ((i * 7) % 4) * 8;
      for (let k = 0; k < 1 + (i % 3); k++) {
        const w = 12 + ((i * 13 + k * 29) % 40);
        if (x + w > 120) break;
        ctx.fillStyle = colors[(i + k) % colors.length]!;
        ctx.fillRect(x, y, w, 4);
        x += w + 6;
      }
    }
  }
  const tex = new THREE.CanvasTexture(codeCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 0.5);
  return tex;
}

export function createDesk(desk: Desk): DeskObject {
  const g = new THREE.Group();
  g.userData.memberKey = desk.member.key;
  const h = hashOf(desk.member.key);

  // Bàn
  const top = rbox(1.9, 0.08, 1.05, 0.03, C.top);
  top.position.y = 0.76;
  g.add(top);
  for (const [x, z] of [[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.74, 10), mat(C.leg, { metalness: 0.4, roughness: 0.4 }));
    leg.position.set(x, 0.37, z);
    leg.castShadow = true;
    g.add(leg);
  }

  // Laptop quay về người ngồi
  const base = rbox(0.62, 0.03, 0.42, 0.01, C.laptop);
  base.position.set(0, 0.815, -0.12);
  const lid = new THREE.Group();
  const lidShell = rbox(0.62, 0.4, 0.025, 0.01, C.laptop);
  lidShell.position.y = 0.2;
  const code = codeTexture();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.34), new THREE.MeshBasicMaterial({ color: C.screen }));
  glow.position.set(0, 0.2, -0.014);
  glow.rotation.y = Math.PI;
  lid.add(lidShell, glow);
  lid.position.set(0, 0.83, 0.09);
  lid.rotation.x = -0.25;
  g.add(base, lid);

  // Cốc + chậu cây nhỏ
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.13, 20), mat(C.mug));
  mug.position.set(0.62, 0.865, 0.05);
  mug.castShadow = true;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.14, 20), mat(C.pot));
  pot.position.set(-0.68, 0.87, 0.18);
  const leaf = sphere(0.14, C.leaf, { flatShading: true });
  leaf.scale.set(1, 1.2, 1);
  leaf.position.set(-0.68, 1.04, 0.18);
  g.add(mug, pot, leaf);

  // Xấp giấy = số PR
  const stack = new THREE.Group();
  stack.position.set(0.55, 0.8, 0.3);
  g.add(stack);

  // Ghế (sau lưng người, phía -z)
  const seat = rbox(0.6, 0.1, 0.55, 0.04, C.chair);
  seat.position.set(0, 0.48, -0.85);
  const back = rbox(0.6, 0.62, 0.1, 0.05, C.chair);
  back.position.set(0, 0.86, -1.15);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 10), mat(C.leg, { metalness: 0.5 }));
  post.position.set(0, 0.24, -0.85);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 20), mat(C.leg, { metalness: 0.5 }));
  foot.position.set(0, 0.03, -0.85);
  g.add(seat, back, post, foot);

  // Nhân vật chibi ngồi, quay mặt ra phía trước (+z)
  const chibi = makeChibi(desk.member.key);
  const person = chibi.group;
  const { armL, armR, head } = chibi;
  chibi.legL.rotation.x = chibi.legR.rotation.x = -Math.PI / 2;
  person.position.set(0, 0.12, -0.8);
  g.add(person);

  // Đèn báo nổi
  const bulbMat = mat(C.red, { emissive: C.red, emissiveIntensity: 1 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), bulbMat);
  const haloMat = new THREE.MeshBasicMaterial({ color: C.red, transparent: true, opacity: 0.3, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), haloMat);
  const beacon = new THREE.Group();
  beacon.add(bulb, halo);
  beacon.position.set(1.05, 2.25, -0.2);
  g.add(beacon);

  // Robot agent nhỏ bên cạnh
  const robot = new THREE.Group();
  const rHead = rbox(0.24, 0.2, 0.2, 0.06, C.robot);
  rHead.position.y = 0.26;
  const rBody = rbox(0.2, 0.2, 0.16, 0.05, C.robot);
  rBody.position.y = 0.06;
  const visor = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshBasicMaterial({ color: 0x1d2b3a }));
  visor.position.set(0, 0.27, 0.101);
  const antenna = sphere(0.035, 0x55d68f, { emissive: 0x55d68f, emissiveIntensity: 0.8 });
  antenna.position.y = 0.42;
  robot.add(rHead, rBody, visor, antenna);
  robot.position.set(-1.25, 0.0, 0.1);
  robot.scale.setScalar(1.6);
  g.add(robot);

  // Thẻ tên
  const card = createCard();
  card.sprite.position.set(0, 2.1, -0.2);
  g.add(card.sprite);

  // Vùng bấm
  const hit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 2.4), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 1.2, -0.3);
  hit.userData.memberKey = desk.member.key;
  g.add(hit);

  let lamp: 'off' | 'red' | 'yellow' = 'off';
  let typing = false;
  let stackBump = 0;

  const update = (d: Desk) => {
    const t = d.doingTasks[0];
    const line = t ? `${t.key} · ${t.title}${d.doingTasks.length > 1 ? ` (+${d.doingTasks.length - 1})` : ''}` : 'Không có task đang xử lý';
    lamp = d.waits.some((w) => w.stale) ? 'yellow' : d.waits.length ? 'red' : 'off';
    const col = lamp === 'yellow' ? C.yellow : C.red;
    card.draw(d.member.display, line, lamp === 'off' ? null : lamp === 'yellow' ? '#f5b62a' : '#ef4f45');
    beacon.visible = lamp !== 'off';
    bulbMat.color.setHex(col);
    bulbMat.emissive.setHex(col);
    haloMat.color.setHex(col);
    const gm = glow.material as THREE.MeshBasicMaterial;
    gm.map = t ? code : null;
    gm.color.setHex(t ? 0xffffff : C.screen);
    gm.needsUpdate = true;
    typing = !!t;
    robot.visible = d.waits.some((w) => w.sender.viaAgent);
    stack.clear();
    for (let i = 0; i < Math.min(d.prs.length, 8); i++) {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.46), mat(C.paper));
      sheet.position.y = i * 0.03;
      sheet.rotation.y = (i % 2 ? 1 : -1) * 0.1;
      sheet.castShadow = true;
      stack.add(sheet);
    }
  };
  update(desk);

  return {
    group: g,
    anchor: new THREE.Vector3(0, 1.4, 0),
    update,
    tick(t) {
      if (beacon.visible) {
        beacon.position.y = 2.25 + Math.sin(t * 2.2) * 0.06;
        haloMat.opacity = 0.18 + 0.16 * (1 + Math.sin(t * 4)) * 0.5;
      }
      const k = typing ? Math.sin(t * 14 + h) * 0.1 : 0;
      armL.rotation.x = -1.15 + k;
      if (lamp !== 'off') {
        // đang có người chờ: giơ tay vẫy
        armR.rotation.x = -2.9;
        armR.rotation.z = Math.sin(t * 6 + h) * 0.35;
      } else {
        armR.rotation.x = -1.15 - k;
        armR.rotation.z = 0;
      }
      if (typing) code.offset.y = (t * 0.08 + (h % 100) / 100) % 1;
      person.position.y = 0.12 + Math.sin(t * 1.6 + h) * 0.012;
      head.rotation.y = Math.sin(t * 0.6 + h) * 0.25;
      head.rotation.x = typing ? 0.12 : Math.sin(t * 0.4 + h) * 0.05;
      if (robot.visible) robot.position.y = Math.abs(Math.sin(t * 3)) * 0.06;
      if (stackBump > 0) {
        stackBump = Math.max(0, stackBump - 0.02);
        stack.position.y = 0.8 + Math.sin(stackBump * Math.PI) * 0.3;
      }
    },
    bumpStack() {
      stackBump = 1;
    },
    setSeated(seated) {
      person.visible = seated;
    },
    dispose() {
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      card.dispose();
      code.dispose();
    },
  };
}
