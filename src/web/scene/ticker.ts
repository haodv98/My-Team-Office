// Dải chữ chạy 20 sự kiện mới nhất (lớp HTML trên cảnh 3D).
import type { Member, OfficeEvent } from '../../shared/types.js';
import { ago, esc, eventLabel } from '../format.js';

export function renderTicker(el: HTMLElement, events: OfficeEvent[], members: Map<string, Member>, now = new Date()) {
  const items = events.slice(0, 20).map((e) => `<span class="item">${esc(eventLabel(e, members))} <em>${ago(e.at, now)}</em></span>`);
  const html = items.length ? items.join('<span class="sep">•</span>') : '<span class="item">Chưa có sự kiện mới.</span>';
  // Lặp hai lần để chạy vòng liền mạch.
  el.innerHTML = `<div class="track">${html}<span class="sep">•</span>${html}</div>`;
  const track = el.firstElementChild as HTMLElement;
  track.style.animationDuration = `${Math.max(30, items.length * 6)}s`;
}
