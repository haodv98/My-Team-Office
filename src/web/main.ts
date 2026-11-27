// Văn phòng 3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Member, OfficeEvent, Snapshot } from '../shared/types.js';
import { connect } from './api.js';
import { hhmm, OFFLINE_BANNER, staleBanner } from './format.js';
import { layoutDesks } from './layout.js';
import { renderPanel } from './panel.js';
import { createBoard } from './scene/board.js';
import { createDesk, type DeskObject } from './scene/desk.js';
import { createOffice } from './scene/office.js';
import { Effects } from './scene/paper.js';
import { renderTicker } from './scene/ticker.js';

const $ = (id: string) => document.getElementById(id)!;

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!webglOk() || matchMedia('(max-width: 768px)').matches) $('lite-hint').hidden = false;
$('lite-hint').querySelector('button')!.onclick = () => ($('lite-hint').hidden = true);

const stage = $('stage');
const renderer = webglOk() ? new THREE.WebGLRenderer({ antialias: true }) : null;
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ee);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const controls = renderer ? new OrbitControls(camera, renderer.domElement) : null;
if (controls) {
  controls.enableDamping = true;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.2;
  controls.minDistance = 6;
  controls.maxDistance = 80;
  controls.screenSpacePanning = false;
}

const effects = new Effects(scene);
const board = createBoard();
scene.add(board.mesh);
const desks = new Map<string, DeskObject>();
let office: ReturnType<typeof createOffice> | null = null;
let layoutKey = '';
let snap: Snapshot | null = null;
let members = new Map<string, Member>();
let selected: string | null = null;
let online = true;

function resize() {
  if (!renderer) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function applySnapshot(s: Snapshot) {
  snap = s;
  members = new Map(s.desks.map((d) => [d.member.key, d.member]));
  const spots = layoutDesks(s.desks);
  const key = spots.map((p) => `${p.key}@${p.x},${p.z}`).join('|');
  if (key !== layoutKey) {
    // Tập người đổi → dựng lại sàn + vị trí; bàn cũ giữ nguyên nếu còn.
    layoutKey = key;
    office?.dispose();
    office = createOffice(scene, spots);
    board.mesh.position.copy(office.boardAnchor);
    const keep = new Set(spots.map((p) => p.key));
    for (const [k, d] of desks) {
      if (!keep.has(k)) {
        scene.remove(d.group);
        d.dispose();
        desks.delete(k);
      }
    }
    for (const p of spots) {
      const data = s.desks.find((d) => d.member.key === p.key)!;
      let obj = desks.get(p.key);
      if (!obj) {
        obj = createDesk(data);
        desks.set(p.key, obj);
        scene.add(obj.group);
      }
      obj.group.position.set(p.x, 0, p.z);
    }
    if (!controls?.target.lengthSq() || camera.position.lengthSq() === 0) frameCamera();
  }
  for (const d of s.desks) desks.get(d.member.key)?.update(d);
  board.update(s);
  renderTicker($('ticker'), s.events, members);
  renderHud();
  if (selected) renderPanel($('panel'), s.desks.find((d) => d.member.key === selected) ?? null, members);
}

function frameCamera() {
  if (!office) return;
  const c = office.center.clone().add(new THREE.Vector3(0, 0, -1));
  const dist = office.size * 1.05 + 4;
  camera.position.set(c.x + dist * 0.15, dist * 0.8, c.z + dist * 0.7);
  controls?.target.copy(c);
  controls?.update();
}

function renderHud() {
  if (!snap) return;
  const waiting = snap.desks.reduce((n, d) => n + d.waits.length, 0);
  $('updated').textContent = `Cập nhật ${hhmm(snap.generatedAt)} · ${waiting} mục đang chờ`;
  const banner = online ? staleBanner(snap.staleSources, snap.generatedAt) : OFFLINE_BANNER;
  $('banner').hidden = !banner;
  $('banner').textContent = banner ?? '';
}

function deskPos(key: string | null): THREE.Vector3 | null {
  const d = key ? desks.get(key) : undefined;
  return d ? d.group.position.clone().add(d.anchor) : null;
}

function onEvent(e: OfficeEvent) {
  if (!snap || snap.events.some((x) => x.id === e.id)) return;
  snap = { ...snap, events: [e, ...snap.events].slice(0, 50) };
  renderTicker($('ticker'), snap.events, members);
  const from = deskPos(e.from);
  const tos = e.to.map(deskPos).filter((p): p is THREE.Vector3 => !!p);
  if (e.type === 'pr_opened') {
    for (const k of e.to) desks.get(k)?.bumpStack();
    if (from) effects.popLabel(from, 'PR mới');
  } else if (e.type === 'pr_merged') {
    for (const p of tos.length ? tos : from ? [from] : []) effects.popLabel(p, '🔔 Đã merge');
  } else if (from) {
    for (const to of tos) effects.flyPaper(from, to, e.type === 'backlog_comment' ? 0xfff3b0 : 0xffffff);
  } else {
    for (const p of tos) effects.popLabel(p, e.type === 'task_status' ? 'Đổi trạng thái' : 'Mới');
  }
}

// Bấm bàn → bảng bên
const raycaster = new THREE.Raycaster();
let down: { x: number; y: number } | null = null;
renderer?.domElement.addEventListener('pointerdown', (ev) => (down = { x: ev.clientX, y: ev.clientY }));
renderer?.domElement.addEventListener('pointerup', (ev) => {
  if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5 || !snap) return;
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = raycaster.intersectObjects([...desks.values()].map((d) => d.group), true).find((h) => h.object.userData.memberKey);
  selected = (hit?.object.userData.memberKey as string | undefined) ?? null;
  renderPanel($('panel'), snap.desks.find((d) => d.member.key === selected) ?? null, members);
});
$('panel').addEventListener('close', () => (selected = null));
$('recenter').onclick = frameCamera;

connect({
  onSnapshot: applySnapshot,
  onEvent,
  onStatus: (o) => {
    online = o;
    renderHud();
  },
});
setInterval(() => snap && (renderTicker($('ticker'), snap.events, members), renderHud()), 60_000);

const clock = new THREE.Clock();
resize();
renderer?.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  for (const d of desks.values()) d.tick(t);
  effects.tick(dt);
  controls?.update();
  renderer.render(scene, camera);
});
