// Sàn, tường, ánh sáng, cây, nhãn dãy bàn.
import * as THREE from 'three';
import type { DeskSpot } from '../layout.js';
import { textSprite } from './text.js';

export function createOffice(scene: THREE.Scene, spots: DeskSpot[]): { boardAnchor: THREE.Vector3; center: THREE.Vector3; size: number; dispose(): void } {
  const group = new THREE.Group();
  const xs = spots.map((s) => s.x);
  const zs = spots.map((s) => s.z);
  const minX = Math.min(0, ...xs) - 3;
  const maxX = Math.max(10, ...xs) + 3;
  const minZ = -6;
  const maxZ = Math.max(0, ...zs) + 4;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0xe9dfcf, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  group.add(floor);

  // Thảm theo dãy
  const rows = new Map<string, DeskSpot[]>();
  for (const s of spots) rows.set(s.group, [...(rows.get(s.group) ?? []), s]);
  for (const [role, ss] of rows) {
    const rx = ss.map((s) => s.x);
    const z = ss[0]!.z;
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(...rx) - Math.min(...rx) + 2.6, 3.2),
      new THREE.MeshStandardMaterial({ color: rugColor(role), roughness: 1 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set((Math.max(...rx) + Math.min(...rx)) / 2, 0.005, z + 0.3);
    rug.receiveShadow = true;
    group.add(rug);
    const label = textSprite(role.toUpperCase(), { size: 36, bg: 'rgba(31,35,40,0.85)', color: '#ffffff', scale: 0.5 });
    label.position.set(Math.min(...rx) - 1.8, 0.4, z + 0.3);
    group.add(label);
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf3efe7 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, 4, 0.2), wallMat);
  back.position.set(cx, 2, minZ);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, d), wallMat);
  left.position.set(minX, 2, cz);
  group.add(back, left);

  // Cây góc phòng
  for (const [x, z] of [[minX + 1, minZ + 1], [maxX - 1, minZ + 1], [maxX - 1, maxZ - 1]] as const) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xb5654a }));
    pot.position.set(x, 0.25, z);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshStandardMaterial({ color: 0x4f9a5c, flatShading: true }));
    leaves.position.set(x, 1, z);
    pot.castShadow = leaves.castShadow = true;
    group.add(pot, leaves);
  }

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd8c9b0, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(cx - 8, 14, cz + 10);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const r = Math.max(w, d) / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 60 });
  group.add(hemi, sun, sun.target);
  scene.add(group);

  return {
    boardAnchor: new THREE.Vector3(cx, 2.3, minZ + 0.12),
    center: new THREE.Vector3(cx, 0, cz),
    size: Math.max(w, d),
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}

function rugColor(role: string): number {
  let h = 0;
  for (const ch of role) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.25, 0.82).getHex();
}
