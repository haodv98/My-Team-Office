// Người / chó đi lại theo lối đi giữa các dãy bàn.
import * as THREE from 'three';
import type { DeskSpot } from '../layout.js';
import { makeChibi } from './chibi.js';

export interface Nav {
  corridorX: number;
  coffee: THREE.Vector3;
  spots: Map<string, DeskSpot>;
}

const GAP = 1.25; // nửa khoảng cách giữa hai bàn
const AISLE = 1.7; // lối đi trước mỗi dãy

const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);

/** Chỗ đứng cạnh một bàn (bên phải người ngồi). */
export const besideDesk = (s: DeskSpot) => v(s.x + 0.95, s.z - 0.35);
/** Ghế của bàn. */
export const seatOf = (s: DeskSpot) => v(s.x, s.z - 0.78);

/** Đường từ bàn ra lối đi chung (hành lang trái), không xuyên qua bàn. */
function toCorridor(s: DeskSpot, nav: Nav): THREE.Vector3[] {
  return [v(s.x + GAP, s.z - 0.6), v(s.x + GAP, s.z + AISLE), v(nav.corridorX, s.z + AISLE)];
}

export function route(from: DeskSpot | 'coffee', to: DeskSpot | 'coffee', nav: Nav): THREE.Vector3[] {
  if (from !== 'coffee' && to !== 'coffee' && from.z === to.z) {
    return [v(from.x + GAP, from.z - 0.6), v(from.x + GAP, from.z + AISLE), v(to.x + GAP, to.z + AISLE), v(to.x + GAP, to.z - 0.1), besideDesk(to)];
  }
  const a = from === 'coffee' ? [nav.coffee.clone(), v(nav.corridorX, nav.coffee.z)] : toCorridor(from, nav);
  const b = to === 'coffee' ? [v(nav.corridorX, nav.coffee.z), nav.coffee.clone()] : [...toCorridor(to, nav).reverse(), besideDesk(to)];
  return [...a, ...b];
}

interface Mover {
  obj: THREE.Object3D;
  path: THREE.Vector3[];
  i: number;
  speed: number;
  pause: number;
  onDone?: () => void;
  phase: number;
  limbs?: { legL: THREE.Object3D; legR: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D; carrying: boolean };
  tail?: THREE.Object3D;
}

export class Walkers {
  private movers: Mover[] = [];
  constructor(private readonly scene: THREE.Scene) {}

  get busy(): number {
    return this.movers.filter((m) => m.limbs).length;
  }

  /** Người đi theo path; mang giấy nếu carrying. pauseAtEnd giây đứng lại cuối đường. */
  walkPerson(key: string, path: THREE.Vector3[], opts: { carrying?: boolean; back?: THREE.Vector3[]; pause?: number; onDone?: () => void } = {}) {
    const c = makeChibi(key);
    c.paper.visible = !!opts.carrying;
    c.group.position.copy(path[0]!);
    this.scene.add(c.group);
    const limbs = { legL: c.legL, legR: c.legR, armL: c.armL, armR: c.armR, carrying: !!opts.carrying };
    const finish = () => {
      this.scene.remove(c.group);
      c.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      opts.onDone?.();
    };
    const goBack = () => {
      c.paper.visible = false;
      limbs.carrying = false;
      if (opts.back) this.movers.push({ obj: c.group, path: opts.back, i: 1, speed: 1.7, pause: 0, onDone: finish, phase: 0, limbs });
      else finish();
    };
    this.movers.push({ obj: c.group, path, i: 1, speed: 1.9, pause: opts.pause ?? 1.2, onDone: goBack, phase: Math.random() * 6, limbs });
  }

  /** Chó đi lang thang mãi. */
  addDog(points: (cur: THREE.Vector3) => THREE.Vector3[]) {
    const dog = makeDog();
    dog.group.position.copy(points(new THREE.Vector3())[0] ?? new THREE.Vector3());
    this.scene.add(dog.group);
    const again = () => {
      const p = points(dog.group.position.clone());
      p.unshift(dog.group.position.clone());
      this.movers.push({ obj: dog.group, path: p, i: 1, speed: 1.3, pause: 2 + Math.random() * 3, onDone: again, phase: 0, tail: dog.tail });
    };
    again();
  }

  tick(dt: number, t: number) {
    const done: Mover[] = [];
    for (const m of this.movers) {
      const target = m.path[m.i];
      if (!target) {
        if (m.pause > 0) {
          m.pause -= dt;
          this.idle(m, t);
          continue;
        }
        done.push(m);
        continue;
      }
      const pos = m.obj.position;
      const dir = target.clone().sub(pos);
      dir.y = 0;
      const dist = dir.length();
      const step = m.speed * dt;
      if (dist <= step) {
        pos.set(target.x, 0, target.z);
        m.i++;
      } else {
        dir.normalize();
        pos.addScaledVector(dir, step);
        const yaw = Math.atan2(dir.x, dir.z);
        m.obj.rotation.y += shortest(yaw - m.obj.rotation.y) * Math.min(1, dt * 10);
      }
      m.phase += dt * m.speed * 6;
      const s = Math.sin(m.phase);
      pos.y = Math.abs(s) * 0.05;
      if (m.limbs) {
        m.limbs.legL.rotation.x = s * 0.6;
        m.limbs.legR.rotation.x = -s * 0.6;
        m.limbs.armL.rotation.x = m.limbs.carrying ? -1.1 : -s * 0.5;
        m.limbs.armR.rotation.x = m.limbs.carrying ? -1.1 : s * 0.5;
      }
      if (m.tail) m.tail.rotation.y = Math.sin(t * 14) * 0.6;
    }
    this.movers = this.movers.filter((m) => !done.includes(m));
    for (const m of done) m.onDone?.();
  }

  private idle(m: Mover, t: number) {
    m.obj.position.y = 0;
    if (m.limbs) {
      m.limbs.legL.rotation.x = m.limbs.legR.rotation.x = 0;
      // đưa giấy: chìa tay ra
      m.limbs.armR.rotation.x = m.limbs.carrying ? -1.4 : Math.sin(t * 3) * 0.1;
      m.limbs.armL.rotation.x = m.limbs.carrying ? -1.4 : 0;
    }
    if (m.tail) m.tail.rotation.y = Math.sin(t * 8) * 0.3;
  }
}

function shortest(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function makeDog(): { group: THREE.Group; tail: THREE.Object3D } {
  const fur = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.36, 6, 12), fur);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.32;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), fur);
  head.position.set(0, 0.48, 0.3);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), fur);
  snout.position.set(0, 0.44, 0.44);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), dark);
  nose.position.set(0, 0.46, 0.5);
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), dark);
  earL.scale.set(0.6, 1.4, 0.6);
  earL.position.set(-0.1, 0.56, 0.26);
  const earR = earL.clone();
  earR.position.x = 0.1;
  g.add(body, head, snout, nose, earL, earR);
  for (const [x, z] of [[-0.09, 0.16], [0.09, 0.16], [-0.09, -0.16], [0.09, -0.16]] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), fur);
    leg.position.set(x, 0.11, z);
    g.add(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.38, -0.26);
  const tailMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.16, 4, 8), fur);
  tailMesh.position.set(0, 0.06, -0.06);
  tailMesh.rotation.x = -0.8;
  tail.add(tailMesh);
  g.add(tail);
  g.traverse((o) => (o.castShadow = true));
  return { group: g, tail };
}
