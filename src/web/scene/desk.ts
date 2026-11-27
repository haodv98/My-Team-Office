// Một bàn làm việc: mặt bàn, ghế, màn hình task, xấp giấy PR, đèn báo, bảng tên, robot agent.
import * as THREE from 'three';
import type { Desk } from '../../shared/types.js';
import { TextCanvas, textSprite } from './text.js';

const C = {
  top: 0xd9b382,
  leg: 0x6b5a48,
  chair: 0x3d5a80,
  screen: 0x22262b,
  paper: 0xfafafa,
  red: 0xe5483d,
  yellow: 0xf2b11f,
  off: 0x9aa0a6,
  robot: 0x8fb8de,
  skin: 0xf1c9a5,
};

export interface DeskObject {
  group: THREE.Group;
  /** Điểm để giấy bay tới / đi. */
  anchor: THREE.Vector3;
  update(desk: Desk): void;
  /** Gọi mỗi khung hình. */
  tick(t: number): void;
  bumpStack(): void;
  dispose(): void;
}

const box = (w: number, h: number, d: number, color: number) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));

export function createDesk(desk: Desk): DeskObject {
  const g = new THREE.Group();
  g.userData.memberKey = desk.member.key;

  const top = box(1.8, 0.08, 1, C.top);
  top.position.y = 0.75;
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  for (const [x, z] of [[-0.82, -0.42], [0.82, -0.42], [-0.82, 0.42], [0.82, 0.42]] as const) {
    const leg = box(0.06, 0.75, 0.06, C.leg);
    leg.position.set(x, 0.375, z);
    g.add(leg);
  }

  // Ghế + người (khối đơn giản)
  const seat = box(0.55, 0.08, 0.55, C.chair);
  seat.position.set(0, 0.45, 0.85);
  const back = box(0.55, 0.6, 0.08, C.chair);
  back.position.set(0, 0.78, 1.1);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 12), new THREE.MeshStandardMaterial({ color: colorFor(desk.member.key) }));
  body.position.set(0, 0.85, 0.85);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshStandardMaterial({ color: C.skin }));
  head.position.set(0, 1.28, 0.82);
  for (const m of [seat, back, body, head]) {
    m.castShadow = true;
    g.add(m);
  }

  // Màn hình hiện task đang làm
  const screenTex = new TextCanvas({ width: 512, height: 288, bg: '#1d2733', color: '#e8eef5', padding: 20 });
  const monitor = box(1.1, 0.66, 0.05, C.screen);
  monitor.position.set(0, 1.2, -0.3);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.58), new THREE.MeshBasicMaterial({ map: screenTex.texture }));
  screen.position.set(0, 1.2, -0.27);
  const stand = box(0.08, 0.4, 0.08, C.screen);
  stand.position.set(0, 0.95, -0.32);
  g.add(monitor, screen, stand);

  // Xấp giấy = số PR
  const stack = new THREE.Group();
  stack.position.set(0.65, 0.8, 0.05);
  g.add(stack);

  // Đèn báo
  const bulbMat = new THREE.MeshStandardMaterial({ color: C.off, emissive: 0x000000 });
  // Đèn nổi phía trên bàn, chỉ hiện khi có người đang chờ.
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), bulbMat);
  bulb.position.set(0, 2.45, 0.6);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshBasicMaterial({ color: C.red, transparent: true, opacity: 0, depthWrite: false }));
  halo.position.copy(bulb.position);
  g.add(bulb, halo);

  // Robot agent (hiện khi có mục chờ / sự kiện do agent)
  const robot = new THREE.Group();
  const rHead = box(0.22, 0.18, 0.18, C.robot);
  rHead.position.y = 0.2;
  const rBody = box(0.18, 0.18, 0.14, C.robot);
  rBody.position.y = 0.04;
  const antenna = new THREE.Mesh(new THREE.SphereGeometry(0.03), new THREE.MeshBasicMaterial({ color: 0x4cc38a }));
  antenna.position.y = 0.33;
  robot.add(rHead, rBody, antenna);
  robot.position.set(-0.3, 0.79, 0.15);
  g.add(robot);

  // Bảng tên
  let nameSprite = textSprite(desk.member.display);
  nameSprite.position.set(0, 1.85, 0.6);
  g.add(nameSprite);

  // Vùng bấm (cả bàn)
  const hit = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2.2), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 1, 0.3);
  hit.userData.memberKey = desk.member.key;
  g.add(hit);

  let lamp: 'off' | 'red' | 'yellow' = 'off';
  let stackBump = 0;
  let current = desk;

  const update = (d: Desk) => {
    current = d;
    const t = d.doingTasks[0];
    screenTex.draw(
      t
        ? [
            ['Đang làm', 26, '#8fb8de'],
            [t.key, 40, '#ffffff', true],
            [t.title, 30],
            [d.doingTasks.length > 1 ? `+${d.doingTasks.length - 1} task khác` : '', 24, '#9aa7b4'],
          ]
        : [['Không có task đang xử lý', 28, '#9aa7b4']],
    );
    stack.clear();
    const n = Math.min(d.prs.length, 8);
    for (let i = 0; i < n; i++) {
      const sheet = box(0.38, 0.04, 0.5, C.paper);
      sheet.position.y = i * 0.05;
      sheet.rotation.y = (i % 2 ? 1 : -1) * 0.08;
      sheet.castShadow = true;
      stack.add(sheet);
    }
    lamp = d.waits.some((w) => w.stale) ? 'yellow' : d.waits.length ? 'red' : 'off';
    const col = lamp === 'yellow' ? C.yellow : lamp === 'red' ? C.red : C.off;
    bulb.visible = halo.visible = lamp !== 'off';
    bulbMat.color.setHex(col);
    bulbMat.emissive.setHex(lamp === 'off' ? 0x000000 : col);
    (halo.material as THREE.MeshBasicMaterial).color.setHex(col);
    robot.visible = d.waits.some((w) => w.sender.viaAgent);
    if (nameSprite.userData.text !== d.member.display) {
      g.remove(nameSprite);
      nameSprite = textSprite(d.member.display);
      nameSprite.userData.text = d.member.display;
      nameSprite.position.set(0, 1.85, 0.6);
      g.add(nameSprite);
    }
  };
  nameSprite.userData.text = desk.member.display;
  update(desk);

  return {
    group: g,
    anchor: new THREE.Vector3(0, 1.3, 0),
    update,
    tick(t) {
      const pulse = lamp === 'off' ? 0 : 0.25 + 0.2 * Math.sin(t * 4);
      (halo.material as THREE.MeshBasicMaterial).opacity = pulse;
      bulbMat.emissiveIntensity = lamp === 'off' ? 0 : 0.8 + 0.4 * Math.sin(t * 4);
      bulb.position.y = halo.position.y = 2.45 + Math.sin(t * 2) * 0.06;
      if (robot.visible) robot.rotation.y = Math.sin(t * 1.5) * 0.4;
      if (stackBump > 0) {
        stackBump = Math.max(0, stackBump - 0.02);
        stack.position.y = 0.8 + Math.sin(stackBump * Math.PI) * 0.25;
      }
      void current;
    },
    bumpStack() {
      stackBump = 1;
    },
    dispose() {
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      screenTex.texture.dispose();
    },
  };
}

/** Màu áo ổn định theo người. */
function colorFor(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.45, 0.55).getHex();
}
