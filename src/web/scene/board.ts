// Bảng tường: tiến độ milestone đang chạy + PR chờ team.
import * as THREE from 'three';
import type { Snapshot } from '../../shared/types.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FONT, fitText } from './text.js';

const W = 2048;
const H = 900;

export function createBoard(): { mesh: THREE.Group; update(s: Snapshot): void } {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new RoundedBoxGeometry(9.4, 4.2, 0.12, 3, 0.05), new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.4, metalness: 0.3 }));
  frame.castShadow = true;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.95), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.z = 0.07;
  group.add(frame, face);

  const text = (s: string, x: number, y: number, size: number, color = '#1f2328', bold = false, max = 600) => {
    ctx.font = `${bold ? 600 : 400} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.fillText(fitText(ctx, s, max), x, y);
  };

  return {
    mesh: group,
    update(s) {
      ctx.fillStyle = '#fbfaf6';
      ctx.fillRect(0, 0, W, H);
      text('Tiến độ', 60, 40, 64, '#1f2328', true);
      const cols = s.progress.slice(0, 3);
      if (!cols.length) text('Không có milestone nào đang chạy.', 60, 160, 44, '#6b6f76');
      cols.forEach((p, i) => {
        const x = 60 + i * 500;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#e3e0d8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(x - 24, 130, 470, 640, 28);
        ctx.fill();
        ctx.stroke();
        text(p.milestone.name, x, 150, 42, '#1f2328', true, 420);
        text(`còn ${p.daysLeft} ngày · ${p.percentClosed}% đóng`, x, 205, 34, '#6b6f76', false, 420);
        ctx.fillStyle = '#ece8df';
        ctx.beginPath();
        ctx.roundRect(x, 262, 420, 22, 11);
        ctx.fill();
        ctx.fillStyle = '#4cb07a';
        ctx.beginPath();
        ctx.roundRect(x, 262, Math.max(22, (420 * p.percentClosed) / 100), 22, 11);
        ctx.fill();
        const rows: [string, number][] = [
          ['Chưa xử lý', p.counts.todo],
          ['Đang xử lý', p.counts.doing],
          ['Đã xử lý', p.counts.done],
          ['Đóng', p.counts.closed],
        ];
        rows.forEach(([label, n], j) => {
          ctx.fillStyle = ['#9aa0a6', '#2f6fde', '#f5b62a', '#4cb07a'][j]!;
          ctx.beginPath();
          ctx.arc(x + 12, 344 + j * 64, 10, 0, Math.PI * 2);
          ctx.fill();
          text(label, x + 34, 322 + j * 64, 38, '#3a3f45');
          text(String(n), x + 340, 322 + j * 64, 40, '#1f2328', true);
        });
      });
      const tx = 1560;
      text('Chờ team', tx, 40, 52, '#1f2328', true);
      if (!s.teamWaits.length) text('Không có', tx, 120, 36, '#6b6f76');
      s.teamWaits.slice(0, 10).forEach((t, i) => text(`${t.team} · #${t.pr.number} ${t.pr.title}`, tx, 120 + i * 52, 34, '#3a3f45', false, 440));
      tex.needsUpdate = true;
    },
  };
}
