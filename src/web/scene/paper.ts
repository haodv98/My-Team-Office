// Hiệu ứng sự kiện: giấy bay giữa hai bàn, chuông khi merge.
import * as THREE from 'three';
import { textSprite } from './text.js';

interface Anim {
  update(dt: number): boolean; // false = xong, gỡ
}

export class Effects {
  private anims: Anim[] = [];
  constructor(private readonly scene: THREE.Scene) {}

  flyPaper(from: THREE.Vector3, to: THREE.Vector3, color = 0xffffff) {
    const plane = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.4, 3),
      new THREE.MeshStandardMaterial({ color, flatShading: true }),
    );
    plane.rotation.x = Math.PI / 2;
    this.scene.add(plane);
    const mid = from.clone().lerp(to, 0.5);
    mid.y += 2 + from.distanceTo(to) * 0.15;
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
    const dur = Math.min(3, 1.2 + from.distanceTo(to) * 0.08);
    let t = 0;
    this.anims.push({
      update: (dt) => {
        t += dt / dur;
        if (t >= 1) {
          this.scene.remove(plane);
          plane.geometry.dispose();
          (plane.material as THREE.Material).dispose();
          return false;
        }
        plane.position.copy(curve.getPoint(t));
        plane.lookAt(curve.getPoint(Math.min(1, t + 0.02)));
        return true;
      },
    });
  }

  popLabel(at: THREE.Vector3, text: string) {
    const s = textSprite(text, { size: 44, bg: 'rgba(255,248,214,0.95)', scale: 0.55 });
    s.position.copy(at).add(new THREE.Vector3(0, 1.1, 0));
    this.scene.add(s);
    let t = 0;
    this.anims.push({
      update: (dt) => {
        t += dt / 2.5;
        s.position.y += dt * 0.3;
        (s.material as THREE.SpriteMaterial).opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        if (t >= 1) {
          this.scene.remove(s);
          (s.material as THREE.SpriteMaterial).map?.dispose();
          s.material.dispose();
          return false;
        }
        return true;
      },
    });
  }

  tick(dt: number) {
    this.anims = this.anims.filter((a) => a.update(dt));
  }
}
