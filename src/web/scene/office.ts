// Phòng: sàn gỗ, tường có cửa sổ, thảm theo dãy, cây, kệ, ánh sáng ấm.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { DeskSpot } from '../layout.js';
import { FONT } from './text.js';

function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const tones = ['#d9b98f', '#d2b084', '#dcbf97', '#cfab7e', '#d6b68b'];
  const plankH = 64;
  for (let row = 0; row < 512 / plankH; row++) {
    let x = row % 2 ? -128 : 0;
    while (x < 512) {
      const w = 192 + ((row * 37 + x) % 3) * 64;
      ctx.fillStyle = tones[(row + Math.floor(x / 64)) % tones.length]!;
      ctx.fillRect(x, row * plankH, w, plankH);
      ctx.strokeStyle = 'rgba(120,85,50,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, row * plankH + 1, w - 2, plankH - 2);
      x += w;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function labelTexture(text: string, color: string): { tex: THREE.CanvasTexture; aspect: number } {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `600 64px ${FONT}`;
  const w = Math.ceil(ctx.measureText(text).width) + 80;
  c.width = w;
  c.height = 110;
  ctx.font = `600 64px ${FONT}`;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 110, 55);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 40, 58);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / 110 };
}

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

function plant(x: number, z: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.25, 0.55, 24), mat(0xe9e4da));
  pot.position.y = 0.275;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), mat(0x5a4636));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.55;
  g.add(pot, soil);
  const leafMat = mat(0x4f9a5c, { flatShading: true });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), leafMat);
    const a = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.2, 0.95 + (i % 2) * 0.25, Math.sin(a) * 0.2);
    leaf.scale.set(0.8, 1.3, 0.8);
    g.add(leaf);
  }
  g.traverse((o) => (o.castShadow = true));
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
}

function shelf(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.6, 0.45, 2, 0.04), mat(0xf4efe6));
  frame.position.y = 0.8;
  g.add(frame);
  const colors = [0xef8354, 0x4f9a5c, 0x3d5a80, 0xf5b62a, 0x98c1d9, 0xc96d8b];
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42 + ((i * 7) % 3) * 0.06, 0.3), mat(colors[(i + row * 3) % colors.length]!));
      b.position.set(-1 + i * 0.22, 0.38 + row * 0.75 + b.geometry.parameters.height / 2 - 0.2, 0.05);
      g.add(b);
    }
  }
  g.traverse((o) => (o.castShadow = true));
  g.position.set(x, 0, z);
  return g;
}

function coffeeMachine(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const counter = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.95, 1.4, 2, 0.04), mat(0xf4efe6));
  counter.position.y = 0.475;
  const machine = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.55, 0.4, 2, 0.05), mat(0x2f3540, { metalness: 0.3, roughness: 0.4 }));
  machine.position.set(0, 1.23, -0.25);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x55d68f }));
  light.position.set(0.12, 1.4, -0.04);
  const cupA = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 16), mat(0xffffff));
  cupA.position.set(-0.1, 1.0, 0.3);
  const cupB = cupA.clone();
  cupB.position.set(0.1, 1.0, 0.4);
  g.add(counter, machine, light, cupA, cupB);
  g.traverse((o) => (o.castShadow = true));
  g.rotation.y = Math.PI / 2;
  g.position.set(x, 0, z);
  return g;
}

export interface OfficeInfo {
  boardAnchor: THREE.Vector3;
  center: THREE.Vector3;
  size: number;
  corridorX: number;
  coffee: THREE.Vector3;
  /** Các điểm sàn trống để chó đi dạo. */
  freePoints: THREE.Vector3[];
  dispose(): void;
}

export function createOffice(scene: THREE.Scene, spots: DeskSpot[]): OfficeInfo {
  const group = new THREE.Group();
  const xs = spots.map((s) => s.x);
  const zs = spots.map((s) => s.z);
  const minX = Math.min(0, ...xs) - 4;
  const maxX = Math.max(10, ...xs) + 3.5;
  const minZ = -6.5;
  const maxZ = Math.max(0, ...zs) + 3.5;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const wood = woodTexture();
  wood.repeat.set(w / 4, d / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0xffffff, { map: wood, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  group.add(floor);

  // Thảm bo góc + nhãn dãy nằm trên sàn
  const rows = new Map<string, DeskSpot[]>();
  for (const s of spots) rows.set(s.group, [...(rows.get(s.group) ?? []), s]);
  for (const [role, ss] of rows) {
    const rx = ss.map((s) => s.x);
    const z = ss[0]!.z;
    const color = rugColor(role);
    const rw = Math.max(...rx) - Math.min(...rx) + 3;
    const rug = new THREE.Mesh(new RoundedBoxGeometry(rw, 0.03, 3.3, 2, 0.015), mat(color.getHex(), { roughness: 1 }));
    rug.position.set((Math.max(...rx) + Math.min(...rx)) / 2, 0.015, z - 0.35);
    rug.receiveShadow = true;
    group.add(rug);
    const { tex, aspect } = labelTexture(role.toUpperCase(), `#${color.clone().offsetHSL(0, 0.1, -0.35).getHexString()}`);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.45 * aspect, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    label.rotation.x = -Math.PI / 2;
    label.position.set(Math.min(...rx) - 1.5 - 0.22 * aspect, 0.035, z - 0.35);
    group.add(label);
  }

  // Tường + chân tường + cửa sổ
  const wallMat = mat(0xf6f1e8, { roughness: 0.95 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, 0.25), wallMat);
  back.position.set(cx, 2.1, minZ);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, d), wallMat);
  left.position.set(minX, 2.1, cz);
  left.receiveShadow = true;
  const trimMat = mat(0x8a6a4a);
  const trimB = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.3), trimMat);
  trimB.position.set(cx, 0.09, minZ + 0.02);
  const trimL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, d), trimMat);
  trimL.position.set(minX + 0.02, 0.09, cz);
  group.add(back, left, trimB, trimL);

  const paneMat = new THREE.MeshStandardMaterial({ color: 0xbfe0f5, emissive: 0xbfe0f5, emissiveIntensity: 0.55, roughness: 0.2 });
  const frameMat = mat(0xffffff);
  for (let i = 0; i < Math.floor(d / 4); i++) {
    const z = minZ + 2.5 + i * 4;
    if (z > maxZ - 1.5) break;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 2.3), frameMat);
    frame.position.set(minX + 0.12, 2.3, z);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.9), paneMat);
    pane.rotation.y = Math.PI / 2;
    pane.position.set(minX + 0.19, 2.3, z);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.9, 0.05), frameMat);
    bar.position.set(minX + 0.2, 2.3, z);
    group.add(frame, pane, bar);
  }

  group.add(plant(minX + 1, minZ + 1, 1.1), plant(maxX - 0.9, minZ + 1), plant(maxX - 0.9, maxZ - 1, 0.9), shelf(maxX - 3, minZ + 0.4), coffeeMachine(minX + 0.55, -3.6));

  // Ánh sáng: trời + nắng ấm có bóng mềm
  const hemi = new THREE.HemisphereLight(0xfff6e8, 0xcdb79a, 1.4);
  const sun = new THREE.DirectionalLight(0xfff1de, 2.4);
  sun.position.set(cx - 10, 16, cz + 8);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0005;
  const r = Math.max(w, d) / 2 + 3;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 70 });
  const fill = new THREE.DirectionalLight(0xdbe8ff, 0.6);
  fill.position.set(cx + 10, 8, cz - 6);
  group.add(hemi, sun, sun.target, fill);
  scene.add(group);

  return {
    boardAnchor: new THREE.Vector3(cx - w * 0.12, 2.4, minZ + 0.16),
    center: new THREE.Vector3(cx, 0, cz),
    size: Math.max(w, d),
    corridorX: minX + 1.6,
    coffee: new THREE.Vector3(minX + 1.3, 0, -3.6),
    freePoints: [
      new THREE.Vector3(minX + 1.6, 0, -3),
      new THREE.Vector3(cx, 0, -3.2),
      new THREE.Vector3(maxX - 2, 0, -3),
      ...[...new Set(zs)].flatMap((z) => [new THREE.Vector3(minX + 1.6, 0, z + 1.7), new THREE.Vector3(cx, 0, z + 1.7), new THREE.Vector3(maxX - 1.5, 0, z + 1.7)]),
    ],
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.MeshStandardMaterial;
          m.map?.dispose();
          m.dispose();
        }
      });
    },
  };
}

function rugColor(role: string): THREE.Color {
  let h = 0;
  for (const ch of role) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.35, 0.8);
}
