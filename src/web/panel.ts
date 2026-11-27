// Bảng bên khi bấm vào bàn.
import type { Desk, Member } from '../shared/types.js';
import { ago, esc, safeUrl, waitLabel } from './format.js';

const link = (url: string, text: string) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(text)}</a>`;

export function renderPanel(el: HTMLElement, desk: Desk | null, members: Map<string, Member>, now = new Date()) {
  if (!desk) {
    el.hidden = true;
    return;
  }
  const m = desk.member;
  const section = (title: string, items: string[], empty: string) =>
    `<h3>${title}</h3><ul>${items.length ? items.join('') : `<li class="empty">${empty}</li>`}</ul>`;
  el.innerHTML = `
    <button class="close" aria-label="Đóng">×</button>
    <div class="who">${m.avatarUrl ? `<img src="${esc(safeUrl(m.avatarUrl))}" alt="" />` : ''}<div><strong>${esc(m.display)}</strong><div class="muted">${esc(m.role)}</div></div></div>
    ${section(
      'Đang chờ',
      desk.waits.map(
        (w) => `<li class="wait${w.stale ? ' stale' : ''}">${link(w.url, waitLabel(w, members))}<div class="muted">${ago(w.since, now)}${w.stale ? ' · chờ lâu' : ''}</div></li>`,
      ),
      'Không có gì đang chờ.',
    )}
    ${section('Đang làm', desk.doingTasks.map((t) => `<li>${link(t.url, `${t.key} ${t.title}`)}</li>`), 'Không có task đang xử lý.')}
    ${section('PR đang mở', desk.prs.map((p) => `<li>${link(p.url, `#${p.number} ${p.title}`)}${p.draft ? ' <span class="muted">(nháp)</span>' : ''}</li>`), 'Không có PR đang mở.')}
    ${section('Task khác', desk.otherTasks.map((t) => `<li><span class="muted">${esc(t.status)}</span> ${link(t.url, `${t.key} ${t.title}`)}</li>`), 'Không có.')}
  `;
  el.hidden = false;
  el.querySelector<HTMLButtonElement>('.close')!.onclick = () => {
    el.hidden = true;
    el.dispatchEvent(new CustomEvent('close'));
  };
}
