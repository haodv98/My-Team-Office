// Văn phòng 3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
import { besideDesk, route, seatOf, Walkers } from './scene/walkers.js';
import type { DeskSpot } from './layout.js';

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9eef2);
if (renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
}
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
const controls = renderer ? new OrbitControls(camera, renderer.domElement) : null;
if (controls) {
  controls.enableDamping = true;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.2;
  controls.minDistance = 6;
  controls.maxDistance = 80;
  controls.screenSpacePanning = false;
  // Tự xoay chậm khi không ai chạm; người xem tương tác thì dừng 20 giây.
  controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotateSpeed = 0.35;
  let resume: ReturnType<typeof setTimeout> | undefined;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(resume);
  });
  controls.addEventListener('end', () => {
    clearTimeout(resume);
    resume = setTimeout(() => (controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches), 20_000);
  });
}

const effects = new Effects(scene);
const walkers = new Walkers(scene);
const walking = new Set<string>();
let spotByKey = new Map<string, DeskSpot>();
let dogAdded = false;
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
    spotByKey = new Map(spots.map((p) => [p.key, p]));
    if (!dogAdded) {
      dogAdded = true;
      // Chó đi dọc lối đi: ra hành lang trái, đổi dãy, rồi tới điểm đích (không xuyên bàn).
      walkers.addDog((cur) => {
        if (!office) return [];
        const pts = office.freePoints;
        const target = pts[Math.floor(Math.random() * pts.length)]!.clone();
        const x = office.corridorX;
        return [new THREE.Vector3(x, 0, cur.z), new THREE.Vector3(x, 0, target.z), target];
      });
    }
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
  const c = office.center.clone().add(new THREE.Vector3(0, 0.5, -0.5));
  const dist = office.size * 1.15 + 6;
  camera.position.set(c.x + dist * 0.38, dist * 0.52, c.z + dist * 0.78);
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

const navInfo = () => (office ? { corridorX: office.corridorX, coffee: office.coffee, spots: spotByKey } : null);

/** Người gửi đứng dậy, cầm giấy đi tới bàn người nhận rồi về chỗ. Trả false nếu không đi được. */
function deliver(fromKey: string, toKey: string): boolean {
  const nav = navInfo();
  const a = spotByKey.get(fromKey);
  const b = spotByKey.get(toKey);
  if (!nav || !a || !b || a === b || walking.has(fromKey)) return false;
  const go = [seatOf(a), ...route(a, b, nav)];
  walking.add(fromKey);
  desks.get(fromKey)?.setSeated(false);
  walkers.walkPerson(fromKey, go, {
    carrying: true,
    pause: 1.6,
    back: [...go].reverse(),
    onDone: () => {
      walking.delete(fromKey);
      desks.get(fromKey)?.setSeated(true);
    },
  });
  return true;
}

/** Thỉnh thoảng một người ra máy pha cà phê. */
function coffeeBreak() {
  const nav = navInfo();
  if (!nav || walkers.busy >= 2 || document.hidden) return;
  const free = [...spotByKey.values()].filter((s) => !walking.has(s.key));
  const s = free[Math.floor(Math.random() * free.length)];
  if (!s) return;
  const go = [seatOf(s), ...route(s, 'coffee', nav)];
  walking.add(s.key);
  desks.get(s.key)?.setSeated(false);
  walkers.walkPerson(s.key, go, {
    pause: 3,
    back: [...route('coffee', s, nav), seatOf(s)],
    onDone: () => {
      walking.delete(s.key);
      desks.get(s.key)?.setSeated(true);
    },
  });
}
setInterval(coffeeBreak, 9000);
void besideDesk;

// ?demo=1 — bắn sự kiện giả để xem hiệu ứng (không đụng dữ liệu thật).
if (new URLSearchParams(location.search).has('demo')) {
  const types: OfficeEvent['type'][] = ['gh_comment', 'review', 'review_requested', 'backlog_comment', 'pr_opened', 'pr_merged'];
  let n = 0;
  setInterval(() => {
    const keys = [...spotByKey.keys()];
    if (keys.length < 2) return;
    const from = keys[Math.floor(Math.random() * keys.length)]!;
    const to = keys.filter((k) => k !== from)[Math.floor(Math.random() * (keys.length - 1))]!;
    onEvent({ id: `demo-${++n}`, type: types[n % types.length]!, at: new Date().toISOString(), from, to: [to], title: 'Sự kiện mẫu', url: '#' });
  }, 5000);
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
    for (const p of tos.length ? tos : from ? [from] : []) {
      effects.popLabel(p, '🔔 Đã merge');
      effects.confetti(p);
    }
  } else if (from) {
    e.to.forEach((k, i) => {
      // Người đầu tiên được đưa giấy tận tay; còn lại bay giấy.
      if (!(i === 0 && e.from && deliver(e.from, k))) {
        const to = deskPos(k);
        if (to) effects.flyPaper(from, to, e.type === 'backlog_comment' ? 0xfff3b0 : 0xffffff);
      }
    });
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
  walkers.tick(dt, t);
  controls?.update();
  renderer.render(scene, camera);
});
