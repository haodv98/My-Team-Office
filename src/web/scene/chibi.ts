// Nhân vật chibi dùng chung cho người ngồi bàn và người đi lại.
import * as THREE from 'three';

const SKIN = 0xf4cfae;
const HAIR = [0x2b2118, 0x4a3426, 0x1d1d22, 0x7a4b2a, 0x3a2a4a];
const PANTS = 0x3b4252;

export function hashOf(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra });

const part = <T extends THREE.BufferGeometry>(geo: T, color: number, extra?: THREE.MeshStandardMaterialParameters) => {
  const m = new THREE.Mesh(geo, mat(color, extra));
  m.castShadow = true;
  return m;
};

export interface Chibi {
  group: THREE.Group;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  /** Tờ giấy cầm trên tay (ẩn mặc định). */
  paper: THREE.Mesh;
}

/** Nhân vật đứng, gốc ở chân, mặt quay +z. Tay/chân xoay quanh vai/hông. */
export function makeChibi(key: string): Chibi {
  const h = hashOf(key);
  const shirt = new THREE.Color().setHSL((h % 360) / 360, 0.5, 0.58).getHex();
  const g = new THREE.Group();

  const legPivot = (x: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0.42, 0);
    const leg = part(new THREE.CapsuleGeometry(0.07, 0.24, 4, 10), PANTS);
    leg.position.y = -0.2;
    p.add(leg);
    return p;
  };
  const legL = legPivot(-0.1);
  const legR = legPivot(0.1);

  const body = part(new THREE.CapsuleGeometry(0.2, 0.28, 6, 16), shirt);
  body.position.y = 0.72;

  const head = new THREE.Group();
  head.position.y = 1.18;
  const skull = part(new THREE.SphereGeometry(0.24, 24, 16), SKIN);
  const hair = part(new THREE.SphereGeometry(0.255, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), HAIR[h % HAIR.length]!);
  hair.rotation.x = -0.55;
  const eyeGeo = new THREE.SphereGeometry(0.028, 12, 8);
  const eyeL = part(eyeGeo, 0x2b2b2b, { roughness: 0.2 });
  const eyeR = part(eyeGeo, 0x2b2b2b, { roughness: 0.2 });
  eyeL.position.set(-0.08, 0.01, 0.215);
  eyeR.position.set(0.08, 0.01, 0.215);
  const cheekMat = new THREE.MeshBasicMaterial({ color: 0xf2a1a1, transparent: true, opacity: 0.55 });
  const cheekL = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), cheekMat);
  const cheekR = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), cheekMat);
  cheekL.position.set(-0.13, -0.05, 0.212);
  cheekR.position.set(0.13, -0.05, 0.212);
  head.add(skull, hair, eyeL, eyeR, cheekL, cheekR);

  const armPivot = (x: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0.88, 0);
    const arm = part(new THREE.CapsuleGeometry(0.06, 0.26, 4, 10), shirt);
    arm.position.y = -0.18;
    p.add(arm);
    return p;
  };
  const armL = armPivot(-0.25);
  const armR = armPivot(0.25);

  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.34), mat(0xfdfcf8));
  paper.position.set(0, 0.62, 0.32);
  paper.rotation.x = 0.3;
  paper.visible = false;

  g.add(legL, legR, body, head, armL, armR, paper);
  return { group: g, head, armL, armR, legL, legR, paper };
}
