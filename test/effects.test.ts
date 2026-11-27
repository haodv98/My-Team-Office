import * as THREE from 'three';
import { expect, test } from 'vitest';
import { Effects } from '../src/web/scene/paper.js';

test('giấy bay: thêm vào cảnh, bay giữa đường, gỡ khi tới nơi', () => {
  const scene = new THREE.Scene();
  const fx = new Effects(scene);
  const from = new THREE.Vector3(0, 1, 0);
  const to = new THREE.Vector3(10, 1, 0);
  fx.flyPaper(from, to);
  expect(scene.children).toHaveLength(1);
  fx.tick(0.5);
  const p = scene.children[0]!.position;
  expect(p.x).toBeGreaterThan(0);
  expect(p.x).toBeLessThan(10);
  expect(p.y).toBeGreaterThan(1);
  fx.tick(5);
  expect(scene.children).toHaveLength(0);
});
