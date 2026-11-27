// Bản 2D: theo người, tiến độ, sự kiện, chờ team, chưa rõ người, cấu hình thiếu.
import type { Desk, DeskPr, Member, OfficeEvent, Snapshot, Task, WaitItem } from '../shared/types.js';
import { connect } from './api.js';
import { ago, esc, eventLabel, hhmm, OFFLINE_BANNER, safeUrl, staleBanner, waitLabel } from './format.js';

const $ = (id: string) => document.getElementById(id)!;
let snap: Snapshot | null = null;
let online = true;

const link = (url: string, text: string) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(text)}</a>`;
const members = (s: Snapshot) => new Map<string, Member>(s.desks.map((d) => [d.member.key, d.member]));

function avatar(m: Member): string {
  if (m.avatarUrl) return `<img class="avatar" src="${esc(safeUrl(m.avatarUrl))}" alt="" loading="lazy" />`;
  return `<span class="avatar">${esc(m.display.slice(0, 1).toUpperCase())}</span>`;
}

const taskLine = (t: Task) => `<li><span class="tag">${esc(t.status)}</span>${link(t.url, `${t.key} ${t.title}`)}</li>`;
const prLine = (p: DeskPr) =>
  `<li><span class="tag">PR${p.draft ? ' nháp' : ''}</span>${link(p.url, `#${p.number} ${p.title}`)}</li>`;
const waitLine = (w: WaitItem, ms: Map<string, Member>, now: Date) =>
  `<li class="wait${w.stale ? ' stale' : ''}">${link(w.url, waitLabel(w, ms))} <span class="muted">· ${ago(w.since, now)}${w.stale ? ' · chờ lâu' : ''}</span></li>`;

function personHtml(d: Desk, ms: Map<string, Member>, now: Date): string {
  const cls = d.waits.some((w) => w.stale) ? 'has-stale' : d.waits.length ? 'has-wait' : '';
  const body = [
    ...d.waits.map((w) => waitLine(w, ms, now)),
    ...d.doingTasks.map(taskLine),
    ...d.prs.map(prLine),
    ...d.otherTasks.map(taskLine),
  ];
  return `<article class="person ${cls}">
    <div class="name">${avatar(d.member)}${esc(d.member.display)}</div>
    <ul>${body.length ? body.join('') : '<li class="empty">Không có task đang mở, không có gì chờ.</li>'}</ul>
  </article>`;
}

function render() {
  if (!snap) return;
  const s = snap;
  const ms = members(s);
  const now = new Date();
  $('updated').textContent = `Cập nhật ${hhmm(s.generatedAt)}`;
  const banner = online ? staleBanner(s.staleSources, s.generatedAt) : OFFLINE_BANNER;
  $('banner').hidden = !banner;
  $('banner').textContent = banner ?? '';

  const groups = new Map<string, Desk[]>();
  for (const d of s.desks) groups.set(d.member.role, [...(groups.get(d.member.role) ?? []), d]);
  $('people').innerHTML = [...groups]
    .map(([role, ds]) => `<div class="group"><h2>${esc(role)}</h2>${ds.map((d) => personHtml(d, ms, now)).join('')}</div>`)
    .join('');

  $('progress').innerHTML =
    `<h2>Tiến độ</h2>` +
    (s.progress.length
      ? s.progress
          .map(
            (p) => `<div><strong>${esc(p.milestone.name)}</strong> <span class="muted">· còn ${p.daysLeft} ngày</span>
        <div class="bar"><span style="width:${p.percentClosed}%"></span></div>
        <div class="muted">${p.percentClosed}% đóng · Chưa xử lý ${p.counts.todo} · Đang xử lý ${p.counts.doing} · Đã xử lý ${p.counts.done} · Đóng ${p.counts.closed}</div></div>`,
          )
          .join('')
      : '<p class="empty">Không có milestone nào đang chạy.</p>');

  $('events').innerHTML =
    `<h2>Sự kiện mới</h2><ul class="events">` +
    (s.events.length
      ? s.events
          .slice(0, 20)
          .map((e: OfficeEvent) => `<li>${link(e.url, eventLabel(e, ms))} <span class="muted">· ${ago(e.at, now)}</span></li>`)
          .join('')
      : '<li class="empty">Chưa có sự kiện mới.</li>') +
    `</ul>`;

  $('team').innerHTML = s.teamWaits.length
    ? `<h2>Chờ team</h2><ul class="plain">${s.teamWaits.map((t) => `<li><span class="tag">${esc(t.team)}</span>${link(t.pr.url, `#${t.pr.number} ${t.pr.title}`)}</li>`).join('')}</ul>`
    : '';

  const un = s.unassigned;
  $('unassigned').innerHTML =
    un.prs.length || un.waits.length
      ? `<h2>Chưa rõ người</h2><ul class="plain">${un.waits.map((w) => waitLine(w, ms, now)).join('')}${un.prs.map(prLine).join('')}</ul>`
      : '';

  const cfg = [
    s.unmappedLogins.length
      ? `<h2>Tài khoản GitHub chưa ghép người</h2><p>${s.unmappedLogins.map(esc).join(', ')}</p>`
      : '',
    s.unmappedMembers.length
      ? `<h2>Thành viên Backlog chưa có trong members.yaml</h2><p>${s.unmappedMembers.map(esc).join(', ')}</p>`
      : '',
  ].join('');
  $('config').innerHTML = cfg;
}

connect({
  onSnapshot: (s) => {
    snap = s;
    render();
  },
  onEvent: (e) => {
    if (!snap || snap.events.some((x) => x.id === e.id)) return;
    snap = { ...snap, events: [e, ...snap.events].slice(0, 50) };
    render();
  },
  onStatus: (o) => {
    online = o;
    render();
  },
});
setInterval(render, 60_000);
