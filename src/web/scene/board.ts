// Bảng tường: tiến độ milestone đang chạy + PR chờ team.
import * as THREE from 'three';
import type { Snapshot } from '../../shared/types.js';
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
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.4, 4.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x8a6a4a }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.95), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.z = 0.07;
  group.add(frame, face);

  const text = (s: string, x: number, y: number, size: number, color = '#24312a', bold = false, max = 600) => {
    ctx.font = `${bold ? 600 : 400} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.fillText(fitText(ctx, s, max), x, y);
  };

  return {
    mesh: group,
    update(s) {
      ctx.fillStyle = '#2f4a3a';
      ctx.fillRect(0, 0, W, H);
      text('Tiến độ', 60, 40, 64, '#f4f1e8', true);
      const cols = s.progress.slice(0, 3);
      if (!cols.length) text('Không có milestone nào đang chạy.', 60, 160, 44, '#cfd8cf');
      cols.forEach((p, i) => {
        const x = 60 + i * 500;
        text(p.milestone.name, x, 150, 42, '#f4f1e8', true, 460);
        text(`còn ${p.daysLeft} ngày · ${p.percentClosed}% đóng`, x, 205, 34, '#cfd8cf', false, 460);
        ctx.fillStyle = '#4b6b58';
        ctx.fillRect(x, 260, 440, 22);
        ctx.fillStyle = '#7fd3a0';
        ctx.fillRect(x, 260, (440 * p.percentClosed) / 100, 22);
        const rows: [string, number][] = [
          ['Chưa xử lý', p.counts.todo],
          ['Đang xử lý', p.counts.doing],
          ['Đã xử lý', p.counts.done],
          ['Đóng', p.counts.closed],
        ];
        rows.forEach(([label, n], j) => {
          text(label, x, 320 + j * 60, 38, '#e6ece6');
          text(String(n), x + 340, 320 + j * 60, 38, '#ffffff', true);
        });
      });
      const tx = 1560;
      text('Chờ team', tx, 40, 52, '#f4f1e8', true);
      if (!s.teamWaits.length) text('Không có', tx, 120, 36, '#cfd8cf');
      s.teamWaits.slice(0, 10).forEach((t, i) => text(`${t.team} · #${t.pr.number} ${t.pr.title}`, tx, 120 + i * 52, 34, '#e6ece6', false, 440));
      tex.needsUpdate = true;
    },
  };
}
