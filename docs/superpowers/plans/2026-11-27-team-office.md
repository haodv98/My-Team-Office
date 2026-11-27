# My Team Office — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang web văn phòng 3D (kèm bản 2D) cho cả đội thấy ai đang làm task nào, PR nào chờ ai review, comment nào chờ ai xác nhận / sửa, tiến độ milestone đang chạy và sự kiện mới — dữ liệu đọc từ GitHub + Backlog.

**Architecture:** Một tiến trình Node: collector hỏi GitHub / Backlog mỗi `POLL_SECONDS`, chuẩn hoá về kiểu chung, ghép người – task – PR, tính mục chờ + tiến độ, dựng `Snapshot`, so với snapshot trước để sinh `OfficeEvent`, lưu snapshot ra file. Cùng tiến trình chạy Fastify phục vụ `/api/snapshot`, `/api/events` (SSE) và trang tĩnh do Vite build (`/` 3D bằng Three.js, `/list` 2D). Logic ghép / mục chờ / tiến độ là hàm thuần, test bằng dữ liệu tự sinh.

**Tech Stack:** Node 22, TypeScript (ESM, strict), Fastify 5, `@fastify/static`, `undici` (fetch + `ProxyAgent`), `yaml`, Vite 6, Three.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-team-office-design.md`

## Global Constraints

- Repo **public**: không commit token, email, `config/members.yaml`, mã dự án Backlog, nội dung task thật. Chỉ commit `config/members.example.yaml`, `.env.example`. Fixture test là dữ liệu bịa (tên `Người A`, login `user-a`, dự án `DEMO`).
- Chỉ **đọc** GitHub / Backlog. Không có lời gọi POST/PATCH/PUT/DELETE tới hai API.
- Trình duyệt không bao giờ nhận token; mọi gọi API ngoài nằm ở server.
- Env: `GITHUB_TOKEN`, `GITHUB_REPOS` (`owner/repo`, phân cách dấu phẩy), `BACKLOG_SPACE` (vd `xxx.backlog.com`), `BACKLOG_API_KEY`, `BACKLOG_PROJECT_KEY`, `POLL_SECONDS` (mặc định `60`), `PORT` (mặc định `4800`), `MEMBERS_FILE` (mặc định `config/members.yaml`), `DATA_DIR` (mặc định `data`), `HTTPS_PROXY` (tuỳ chọn), `AGENT_MARKERS` (mặc định `Generated with Claude Code`), `STATUS_MAP` (tuỳ chọn, JSON `{"<tên trạng thái>": "todo|doing|done|closed"}`).
- Mục chờ quá **3 ngày làm việc** (T2–T6, múi giờ `Asia/Ho_Chi_Minh`) → `stale: true`.
- Lần chạy đầu / snapshot cũ hơn 1 giờ: backfill **14 ngày**.
- Câu chữ hiển thị tiếng Việt.
- Không xếp hạng / so sánh số lượng PR, comment giữa người với người ở bất kỳ màn nào.
- `THIRD_PARTY_NOTICES.md` ghi nguồn + giấy phép MIT của `github.com/AgentSystemLabs/agent-office` cho mọi đồ vật 3D chép từ đó.

## Review Focus

1. **Số task trong nhánh không tồn tại trên Backlog** (vd `fix/901-...` là số PR) → không được gán theo task, rơi về người mở PR. Test ở Task 2.
2. **Một chu kỳ polling lỗi giữa chừng** (401, 403 rate limit, 5xx, timeout) → giữ nguyên snapshot cũ, đặt `stale_source`, không xoá đèn, không sinh sự kiện "biến mất". Test ở Task 6.
3. **Login GitHub khác hoa thường** (`User-A` vs `user-a`) và một người nhiều login → vẫn ghép đúng người. Test ở Task 1.
4. **Người không có task, không có GitHub** → vẫn có bàn, không lỗi. Test ở Task 5 (`buildSnapshot`).
5. **Trình duyệt mất SSE rồi kết nối lại** (server khởi động lại) → nạp lại `/api/snapshot`, không nhân đôi bàn / sự kiện. Test ở Task 7.

---

## Cấu trúc file

```
package.json  tsconfig.json  vite.config.ts  vitest.config.ts
.env.example  .gitignore  README.md  THIRD_PARTY_NOTICES.md
config/members.example.yaml
src/shared/types.ts            kiểu dùng chung server + web
src/server/config.ts           đọc env + members.yaml
src/server/http.ts             fetch có ETag + proxy
src/server/github.ts           thu thập GitHub → GithubData
src/server/backlog.ts          thu thập Backlog → BacklogData
src/server/match.ts            mã task trong PR, gán PR, xác định người viết
src/server/waits.ts            luật mục chờ §5.4
src/server/progress.ts         tiến độ milestone
src/server/snapshot.ts         dựng Snapshot, sinh OfficeEvent, đọc/ghi file
src/server/poller.ts           vòng lặp, backfill, xử lý lỗi nguồn
src/server/main.ts             Fastify, API, SSE, static
src/web/api.ts                 tải snapshot + SSE
src/web/list.html, list.ts     bản 2D
src/web/index.html, main.ts    bản 3D
src/web/scene/{office,desk,board,paper,ticker}.ts
src/web/panel.ts               bảng bên khi bấm bàn
test/fixtures.ts               dựng dữ liệu bịa
test/*.test.ts
deploy/Dockerfile  deploy/compose.yml
```

---

### Task 1: Khung dự án, kiểu chung, cấu hình

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `config/members.example.yaml`, `src/shared/types.ts`, `src/server/config.ts`, `test/fixtures.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Produces (`src/shared/types.ts`) — mọi task sau dùng đúng tên này:

```ts
export type Role = string;
export interface Member { key: string; display: string; backlogUserId: number; github: string[]; role: Role; avatarUrl?: string }
export type ProgressBucket = 'todo' | 'doing' | 'done' | 'closed';
export interface Task { number: number; key: string; title: string; assigneeId: number | null; status: string; bucket: ProgressBucket; milestoneIds: number[]; updatedAt: string; url: string }
export interface Milestone { id: number; name: string; start: string; due: string }
export interface Review { id: number; author: string; state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED'; submittedAt: string; body: string }
export interface PrComment { id: number; author: string; body: string; createdAt: string; url: string }
export interface PullRequest { repo: string; number: number; title: string; branch: string; body: string; author: string; draft: boolean; state: 'open' | 'closed' | 'merged'; createdAt: string; closedAt: string | null; requestedReviewers: string[]; requestedTeams: string[]; reviews: Review[]; comments: PrComment[]; url: string }
export interface BacklogComment { id: number; taskNumber: number; authorId: number; notifiedIds: number[]; createdAt: string; body: string; url: string }
export interface GithubData { pulls: PullRequest[] }
export interface BacklogData { users: { id: number; name: string; iconUrl?: string }[]; milestones: Milestone[]; tasks: Task[]; comments: BacklogComment[] }
export interface Actor { memberKey: string | null; login: string; viaAgent: boolean }
export type WaitKind = 'review' | 'fix' | 'gh_mention' | 'backlog_notify';
export interface WaitItem { id: string; kind: WaitKind; recipient: string; sender: Actor; since: string; stale: boolean; title: string; url: string }
export interface DeskPr { repo: string; number: number; title: string; url: string; draft: boolean; taskNumbers: number[] }
export interface Desk { member: Member; doingTasks: Task[]; otherTasks: Task[]; prs: DeskPr[]; waits: WaitItem[] }
export interface MilestoneProgress { milestone: Milestone; counts: Record<ProgressBucket, number>; percentClosed: number; daysLeft: number }
export type OfficeEventType = 'pr_opened' | 'pr_merged' | 'pr_closed' | 'review' | 'gh_comment' | 'review_requested' | 'backlog_comment' | 'task_status';
export interface OfficeEvent { id: string; type: OfficeEventType; at: string; from: string | null; to: string[]; title: string; url: string }
export interface Snapshot { version: 1; generatedAt: string; desks: Desk[]; unassigned: { prs: DeskPr[]; waits: WaitItem[] }; teamWaits: { team: string; pr: DeskPr }[]; progress: MilestoneProgress[]; events: OfficeEvent[]; staleSources: ('github' | 'backlog')[]; unmappedLogins: string[]; unmappedMembers: string[] }
```

- Produces (`src/server/config.ts`):
  - `loadConfig(env: NodeJS.ProcessEnv): Config` — `Config { github: { token: string; repos: string[] }; backlog: { space: string; apiKey: string; projectKey: string }; pollSeconds: number; port: number; membersFile: string; dataDir: string; proxy?: string; agentMarkers: string[]; statusMap: Record<string, ProgressBucket> }`. Thiếu biến bắt buộc → `throw new Error('Thiếu biến môi trường: <TÊN>')`.
  - `loadMembers(path: string): Member[]` — đọc YAML (`backlog_user_id`, `github`, `role`, `display`, `key`), login lưu chữ thường.
  - `memberByLogin(members: Member[], login: string): Member | undefined` — so khớp không phân biệt hoa thường.
- Produces (`test/fixtures.ts`): `makeMember(p?: Partial<Member>)`, `makeTask(p?)`, `makePr(p?)`, `makeReview(p?)`, `makeComment(p?)`, `makeBacklogComment(p?)` — giá trị mặc định bịa, ghi đè từng trường.

- [ ] **Step 1: Khởi tạo** `package.json` (`"type": "module"`, scripts `dev`, `build` = `vite build && tsc -p tsconfig.json`, `start` = `node dist/server/main.js`, `test` = `vitest run`, `typecheck` = `tsc --noEmit`), `tsconfig.json` strict, `.gitignore` gồm `node_modules dist data .env config/members.yaml`. Cài các gói ở Tech Stack.
- [ ] **Step 2: Viết test hỏng** `test/config.test.ts`:

```ts
test('thiếu GITHUB_TOKEN thì báo tên biến', () => {
  expect(() => loadConfig({ ...validEnv, GITHUB_TOKEN: undefined })).toThrow('Thiếu biến môi trường: GITHUB_TOKEN');
});
test('mặc định POLL_SECONDS=60, PORT=4800, AGENT_MARKERS', () => {
  const c = loadConfig(validEnv);
  expect(c.pollSeconds).toBe(60); expect(c.port).toBe(4800);
  expect(c.agentMarkers).toEqual(['Generated with Claude Code']);
});
test('GITHUB_REPOS tách theo dấu phẩy, bỏ khoảng trắng', () => {
  expect(loadConfig({ ...validEnv, GITHUB_REPOS: 'a/b, c/d' }).github.repos).toEqual(['a/b', 'c/d']);
});
test('memberByLogin không phân biệt hoa thường, nhiều login', () => {
  const m = makeMember({ github: ['user-a', 'user-a-bot'] });
  expect(memberByLogin([m], 'User-A')?.key).toBe(m.key);
  expect(memberByLogin([m], 'user-a-bot')?.key).toBe(m.key);
});
test('loadMembers đọc members.example.yaml', () => {
  expect(loadMembers('config/members.example.yaml').length).toBeGreaterThan(0);
});
```

- [ ] **Step 3:** `npx vitest run test/config.test.ts` → FAIL (chưa có module).
- [ ] **Step 4:** Viết `types.ts`, `config.ts`, `fixtures.ts`, `members.example.yaml` (2 người bịa), `.env.example` (mọi biến, giá trị rỗng / mẫu).
- [ ] **Step 5:** `npx vitest run test/config.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 6:** Commit `feat: khung dự án, kiểu chung, đọc cấu hình`.

### Task 2: Ghép PR với task và người (§5.2)

**Files:**
- Create: `src/server/match.ts`
- Test: `test/match.test.ts`

**Interfaces:**
- Consumes: kiểu ở Task 1, `memberByLogin`.
- Produces:
  - `extractTaskNumbers(pr: PullRequest, projectKey: string): number[]` — theo thứ tự, dừng ở luật đầu tiên có kết quả: (1) `<projectKey>-(\d+)` trong tiêu đề / nhánh / mô tả; (2) nhánh `^[a-z]+\/(\d+)(?:-(\d+))?-`; (3) tiêu đề `^[a-z]+\(#(\d+)\)`. Kết quả không trùng, tăng dần.
  - `attributePr(pr: PullRequest, tasks: Map<number, Task>, members: Member[], projectKey: string): { memberKeys: string[]; taskNumbers: number[] }` — chỉ giữ số task có trong `tasks`; có task → người được giao của từng task (bỏ task không có người giao); không còn ai → người mở PR theo `memberByLogin`; vẫn không có → `memberKeys: []`.
  - `resolveActor(login: string, body: string, members: Member[], agentMarkers: string[]): Actor` — `viaAgent = agentMarkers.some(m => body.includes(m))`; `memberKey` = người sở hữu login (comment agent tính cho chủ tài khoản).

- [ ] **Step 1: Viết test hỏng:**

```ts
test('mã đầy đủ thắng số trong nhánh', () => {
  expect(extractTaskNumbers(makePr({ title: 'feat: x DEMO-12', branch: 'feat/99-y' }), 'DEMO')).toEqual([12]);
});
test('nhánh feat/584-585-... cho hai task', () => {
  expect(extractTaskNumbers(makePr({ title: 'feat: x', branch: 'feat/584-585-danh-muc' }), 'DEMO')).toEqual([584, 585]);
});
test('tiêu đề feat(#583): ... cho task 583', () => {
  expect(extractTaskNumbers(makePr({ title: 'feat(#583): kiểm', branch: 'x' }), 'DEMO')).toEqual([583]);
});
test('"sửa review PR #901" không phải task', () => {
  expect(extractTaskNumbers(makePr({ title: 'fix(work-items): sửa review PR #901', branch: 'fix/pr901-review' }), 'DEMO')).toEqual([]);
});
test('PR do tài khoản chung mở được gán cho người giao task', () => {
  const a = makeMember({ key: 'a', github: ['shared'], backlogUserId: 1 });
  const b = makeMember({ key: 'b', github: [], backlogUserId: 2 });
  const tasks = new Map([[612, makeTask({ number: 612, assigneeId: 2 })]]);
  expect(attributePr(makePr({ author: 'shared', branch: 'feat/612-x' }), tasks, [a, b], 'DEMO').memberKeys).toEqual(['b']);
});
test('số task không tồn tại → rơi về người mở PR', () => {  // Review Focus 1
  const a = makeMember({ key: 'a', github: ['user-a'] });
  expect(attributePr(makePr({ author: 'user-a', branch: 'fix/901-x' }), new Map(), [a], 'DEMO'))
    .toEqual({ memberKeys: ['a'], taskNumbers: [] });
});
test('login lạ, không task → không gán ai', () => {
  expect(attributePr(makePr({ author: 'ghost', branch: 'x' }), new Map(), [], 'DEMO').memberKeys).toEqual([]);
});
test('comment có dấu agent vẫn tính cho chủ tài khoản', () => {
  const a = makeMember({ key: 'a', github: ['user-a'] });
  expect(resolveActor('user-a', '...\n🤖 Generated with Claude Code', [a], ['Generated with Claude Code']))
    .toEqual({ memberKey: 'a', login: 'user-a', viaAgent: true });
});
```

- [ ] **Step 2:** `npx vitest run test/match.test.ts` → FAIL.
- [ ] **Step 3:** Viết `match.ts` theo Interfaces.
- [ ] **Step 4:** chạy lại → PASS.
- [ ] **Step 5:** Commit `feat: ghép PR với task Backlog và người`.

### Task 3: Thu thập GitHub và Backlog

**Files:**
- Create: `src/server/http.ts`, `src/server/github.ts`, `src/server/backlog.ts`
- Test: `test/github.test.ts`, `test/backlog.test.ts`

**Interfaces:**
- Consumes: kiểu Task 1, `Config`.
- Produces:
  - `class CachedFetcher { constructor(opts: { proxy?: string; fetchImpl?: typeof fetch }); getJson<T>(url: string, headers?: Record<string,string>): Promise<T> }` — nhớ `ETag` + body theo URL trong đối tượng; lần sau gửi `If-None-Match`, `304` → trả body đã nhớ. Status ≥ 400 → `throw new SourceError(source, status, url)` (`SourceError` export cùng file, `source: 'github' | 'backlog'` suy từ host). Chỉ dùng phương thức GET.
  - `collectGithub(f: CachedFetcher, cfg: Config['github'], since: Date): Promise<GithubData>` — với mỗi repo: `GET /repos/{r}/pulls?state=open&per_page=100` (+ phân trang theo `Link`), `GET /repos/{r}/pulls?state=closed&sort=updated&direction=desc&per_page=50` lọc `closed_at >= since`; với mỗi PR lấy `/pulls/{n}/reviews`, `/pulls/{n}/comments`, `/issues/{n}/comments`. `state` = `merged` khi `merged_at` có giá trị. Header `Authorization: Bearer`, `X-GitHub-Api-Version: 2022-11-28`.
  - `collectBacklog(f: CachedFetcher, cfg: Config['backlog'], statusMap: Config['statusMap'], since: Date): Promise<BacklogData>` — `GET /api/v2/projects/{key}`, `/users`, `/versions`, `/statuses`; task: `/api/v2/issues?projectId[]=…&count=100&updatedSince=YYYY-MM-DD` (phân trang `offset`) gồm task chưa đóng + task cập nhật từ `since`; comment: `/api/v2/issues/{key}/comments?count=100` cho task chưa đóng có `updated >= since`, lấy `notifications[].user.id` làm `notifiedIds`. `apiKey` gửi bằng query `apiKey`. Bucket: `statusMap[name]` nếu có, không thì theo tên mặc định Backlog (`Open`/`未対応`/`Chưa xử lý` → todo, `In Progress`/`処理中`/`Đang xử lý` → doing, `Resolved`/`処理済み`/`Đã xử lý` → done, `Closed`/`完了`/`Đóng` → closed); không khớp → `todo` và ghi log cảnh báo một lần mỗi tên.

- [ ] **Step 1: Viết test hỏng** (fetch giả trả JSON bịa):

```ts
test('304 trả lại body đã nhớ, có gửi If-None-Match', async () => { /* lần 1: 200 + ETag "x"; lần 2: kiểm header If-None-Match === '"x"', trả 304 → kết quả bằng lần 1 */ });
test('403 ném SourceError github', async () => { await expect(f.getJson('https://api.github.com/x')).rejects.toMatchObject({ source: 'github', status: 403 }); });
test('collectGithub: merged_at → state merged, gộp reviews/comments', async () => { /* … */ expect(pr.state).toBe('merged'); expect(pr.reviews).toHaveLength(1); expect(pr.comments).toHaveLength(2); });
test('collectGithub đi hết phân trang theo Link', async () => { /* 2 trang → 101 PR */ });
test('collectBacklog: notifications → notifiedIds; trạng thái tiếng Việt → bucket', async () => { expect(c.notifiedIds).toEqual([2]); expect(t.bucket).toBe('doing'); });
test('collectBacklog: STATUS_MAP ghi đè tên tuỳ biến', async () => { /* "Chờ QA" → done */ });
test('không bao giờ gọi phương thức khác GET', async () => { /* ghi lại mọi init.method trong fetch giả, đều undefined hoặc 'GET' */ });
```

- [ ] **Step 2:** `npx vitest run test/github.test.ts test/backlog.test.ts` → FAIL.
- [ ] **Step 3:** Viết `http.ts` (proxy qua `undici.ProxyAgent` khi có `proxy`), `github.ts`, `backlog.ts`.
- [ ] **Step 4:** chạy lại → PASS.
- [ ] **Step 5:** Commit `feat: thu thập dữ liệu GitHub và Backlog (chỉ đọc, ETag)`.

### Task 4: Mục chờ (§5.4) và tiến độ

**Files:**
- Create: `src/server/waits.ts`, `src/server/progress.ts`
- Test: `test/waits.test.ts`, `test/progress.test.ts`

**Interfaces:**
- Consumes: `attributePr`, `resolveActor` (Task 2), kiểu Task 1.
- Produces:
  - `computeWaits(gh: GithubData, bl: BacklogData, members: Member[], ctx: { projectKey: string; agentMarkers: string[]; now: Date }): { waits: WaitItem[]; teamWaits: Snapshot['teamWaits'] }` — chỉ xét PR `open` và task chưa `closed`. `WaitItem.id` ổn định: `review:{repo}#{n}:{login}`, `fix:{repo}#{n}:{reviewer}`, `ghm:{repo}#{n}:{commentId}:{memberKey}`, `bln:{taskNumber}:{commentId}:{memberKey}`. Luật:
    - `review`: mỗi login trong `requestedReviewers` ghép được người → mục chờ cho người đó, `since` = thời điểm PR mở hoặc review gần nhất của PR (lấy cái muộn hơn).
    - `fix`: với mỗi reviewer R có review mới nhất (bỏ `COMMENTED`) là `CHANGES_REQUESTED` **và** R không còn trong `requestedReviewers` → mục chờ cho từng người trong `attributePr(...).memberKeys`. R được yêu cầu review lại hoặc review mới nhất là `APPROVED` → không có mục.
    - `gh_mention`: comment / review / review comment có `@login` (regex `@([A-Za-z0-9-]+)`) ghép được người M ≠ người viết → mục chờ cho M, trừ khi M (kể cả agent dưới login của M) có comment / review trong cùng PR sau thời điểm đó.
    - `backlog_notify`: mỗi `notifiedIds` ≠ tác giả → mục chờ cho người đó, trừ khi người đó có comment sau thời điểm đó trên cùng task.
    - `requestedTeams` → `teamWaits`, không tạo `WaitItem`.
    - `stale = businessDaysBetween(since, now) > 3`.
  - `businessDaysBetween(from: Date, to: Date): number` — đếm ngày T2–T6 trọn vẹn theo `Asia/Ho_Chi_Minh`.
  - `computeProgress(bl: BacklogData, today: Date): MilestoneProgress[]` — milestone có `start ≤ today ≤ due`; đếm task theo bucket trong milestone; `percentClosed = round(closed / total * 100)` (total 0 → 0); `daysLeft` = số ngày lịch tới `due` (≥ 0).

- [ ] **Step 1: Viết test hỏng:**

```ts
test('reviewer được yêu cầu → mục review', () => { expect(kinds(w)).toEqual(['review']); expect(w[0].recipient).toBe('b'); });
test('CHANGES_REQUESTED, chủ PR có commit mới nhưng chưa yêu cầu lại → vẫn mục fix cho chủ PR', () => { /* … */ });
test('CHANGES_REQUESTED rồi được yêu cầu review lại → chỉ mục review cho reviewer, không mục fix', () => { /* … */ });
test('CHANGES_REQUESTED rồi APPROVED → không mục nào', () => { /* … */ });
test('PR agent mở dưới tài khoản chung, task giao cho b → mục fix đến b', () => { /* … */ });
test('@user-b rồi b trả lời qua agent (có dấu) → tắt mục gh_mention', () => { /* … */ });
test('tự nhắc chính mình không tạo mục', () => { /* … */ });
test('Backlog notify c, c comment sau → tắt; task đóng → tắt', () => { /* … */ });
test('team được yêu cầu review → teamWaits, không WaitItem', () => { /* … */ });
test('stale: T6 9h → T4 tuần sau 10h là 3 ngày làm việc → chưa stale; T5 → stale', () => {
  expect(businessDaysBetween(new Date('2026-11-20T02:00:00Z'), new Date('2026-11-25T03:00:00Z'))).toBe(3);
});
test('tiến độ: 2 milestone chồng nhau đều hiện; total 0 → 0%', () => { /* … */ });
```

- [ ] **Step 2:** `npx vitest run test/waits.test.ts test/progress.test.ts` → FAIL.
- [ ] **Step 3:** Viết `waits.ts`, `progress.ts`.
- [ ] **Step 4:** chạy lại → PASS.
- [ ] **Step 5:** Commit `feat: luật mục chờ và tiến độ milestone`.

### Task 5: Snapshot, sự kiện, lưu file

**Files:**
- Create: `src/server/snapshot.ts`
- Test: `test/snapshot.test.ts`

**Interfaces:**
- Consumes: Task 2, 4.
- Produces:
  - `buildSnapshot(gh: GithubData, bl: BacklogData, members: Member[], ctx: { projectKey: string; agentMarkers: string[]; now: Date }): Omit<Snapshot, 'events' | 'staleSources'>` — một `Desk` cho **mỗi** người dự án Backlog (người có trong `bl.users` nhưng thiếu ở `members` → `Member` tạm `key: 'bl-<id>'`, `github: []`, `role: 'khac'`, ghi vào `unmappedMembers`); `avatarUrl` lấy từ `iconUrl` của `bl.users`; `doingTasks` = task bucket `doing` của người đó, sắp `updatedAt` giảm dần; `unassigned` = PR / mục chờ không gán được ai; `unmappedLogins` = login tác giả PR / comment không ghép được người, không trùng, sắp xếp.
  - `type Seen = { prs: Record<string, PullRequest['state']>; reviewIds: number[]; commentIds: number[]; backlogCommentIds: number[]; taskStatus: Record<number, string>; requested: string[] }` — khoá `prs` là `{repo}#{n}`, `requested` là `{repo}#{n}:{login}`. Chỉ lưu trong file, không gửi cho trình duyệt.
  - `diffEvents(prevSeen: Seen | null, gh: GithubData, bl: BacklogData, members: Member[], ctx): { events: OfficeEvent[]; seen: Seen }` — luôn trả `seen` mới dựng từ dữ liệu hiện tại; `prevSeen === null` → `events: []` (lần đầu không bắn sự kiện). Sinh sự kiện cho: PR mới mở / merge / đóng, review mới, comment GitHub mới, reviewer mới được yêu cầu, comment Backlog mới, task đổi `status` — "mới" = không có trong `prevSeen`. `from` / `to` là `memberKey` (qua `resolveActor` / `attributePr`).
  - `mergeEvents(prev: OfficeEvent[], fresh: OfficeEvent[]): OfficeEvent[]` — giữ 50 sự kiện mới nhất, không trùng `id`.
  - `readStore(dataDir: string): Promise<StoredState | null>`, `writeStore(dataDir: string, s: StoredState): Promise<void>` — `StoredState = { snapshot: Snapshot; seen: Seen }`; ghi file tạm rồi `rename` (không hỏng file khi chết giữa chừng).

- [ ] **Step 1: Viết test hỏng:**

```ts
test('người không task, không GitHub vẫn có bàn', () => { /* Review Focus 4 */ expect(s.desks.map(d => d.member.key)).toContain('c'); });
test('người Backlog thiếu trong members.yaml → bàn tạm bl-<id>', () => { /* … */ });
test('lần đầu không có sự kiện', () => { expect(diffEvents(null, gh, bl, members, ctx).events).toEqual([]); });
test('ảnh đại diện lấy từ iconUrl Backlog', () => { /* … */ expect(desk.member.avatarUrl).toBe('https://x/icon.png'); });
test('PR mới + comment mới → pr_opened, gh_comment với from/to đúng', () => { /* … */ });
test('chạy lại cùng dữ liệu không sinh sự kiện mới (idempotent)', () => { /* … */ });
test('mergeEvents giữ 50, bỏ trùng id', () => { /* … */ });
test('writeStore rồi readStore trả đúng dữ liệu', async () => { /* thư mục tạm */ });
```

- [ ] **Step 2:** `npx vitest run test/snapshot.test.ts` → FAIL.
- [ ] **Step 3:** Viết `snapshot.ts`.
- [ ] **Step 4:** chạy lại → PASS.
- [ ] **Step 5:** Commit `feat: dựng snapshot, sinh sự kiện, lưu file`.

### Task 6: Vòng polling

**Files:**
- Create: `src/server/poller.ts`
- Test: `test/poller.test.ts`

**Interfaces:**
- Consumes: Task 3, 5.
- Produces:
  - `runCycle(deps: { collectGithub: (since: Date) => Promise<GithubData>; collectBacklog: (since: Date) => Promise<BacklogData>; members: Member[]; ctx: { projectKey: string; agentMarkers: string[] }; now: () => Date; prev: StoredState | null }): Promise<{ state: StoredState; fresh: OfficeEvent[] }>` — `since` = `now − 14 ngày` nếu `prev` null hoặc `prev.snapshot.generatedAt` cũ hơn 1 giờ, ngược lại `now − 24 giờ`. Một nguồn ném lỗi → không dựng snapshot mới (không ghép được nửa cũ nửa mới): giữ **nguyên** `prev.snapshot` và `prev.seen` (chỉ cập nhật `staleSources` thêm nguồn lỗi), `fresh = []`. Cả hai thành công → `staleSources = []`.
  - `startPoller(cfg: Config, onUpdate: (s: Snapshot, fresh: OfficeEvent[]) => void): { stop(): void; current(): Snapshot | null }` — chạy `runCycle` ngay rồi mỗi `pollSeconds`; không chạy chồng chu kỳ; lỗi bất ngờ ghi log và đợi chu kỳ sau.

- [ ] **Step 1: Viết test hỏng:**

```ts
test('lần đầu backfill 14 ngày', async () => { expect(sinceSeen).toEqual(new Date(now - 14 * 864e5)); });
test('GitHub 403 giữa chừng → giữ snapshot cũ, staleSources=[github], không sự kiện', async () => { /* Review Focus 2 */ });
test('nguồn hồi phục → staleSources rỗng', async () => { /* … */ });
test('snapshot cũ hơn 1 giờ → backfill lại 14 ngày', async () => { /* … */ });
```

- [ ] **Step 2:** `npx vitest run test/poller.test.ts` → FAIL.
- [ ] **Step 3:** Viết `poller.ts`.
- [ ] **Step 4:** chạy lại → PASS.
- [ ] **Step 5:** Commit `feat: vòng polling có backfill và giữ snapshot khi nguồn lỗi`.

### Task 7: Server API + SSE

**Files:**
- Create: `src/server/main.ts`, `src/web/api.ts`
- Test: `test/server.test.ts`, `test/api-client.test.ts`

**Interfaces:**
- Consumes: `startPoller`, `readStore`.
- Produces:
  - `buildServer(opts: { getSnapshot: () => Snapshot | null; staticDir?: string }): { app: FastifyInstance; broadcast(s: Snapshot, fresh: OfficeEvent[]): void }`.
  - `GET /api/snapshot` → `200` JSON `Snapshot` (không có `seen`); chưa có snapshot → `503` `{ "message": "Đang lấy dữ liệu lần đầu, thử lại sau ít giây." }`.
  - `GET /api/events` → SSE: ngay khi nối gửi `event: hello` `data: {"generatedAt": …}`; mỗi chu kỳ gửi `event: snapshot` (`data: {"generatedAt": …}`) và từng `event: office` (`data: OfficeEvent`); ping comment mỗi 25 s.
  - `/` → `index.html`, `/list` → `list.html`, file tĩnh từ `dist/web`.
  - Web (`src/web/api.ts`): `connect(handlers: { onSnapshot(s: Snapshot): void; onEvent(e: OfficeEvent): void; onStatus(online: boolean): void }): () => void` — tải `/api/snapshot` lúc đầu và mỗi khi nhận `hello` hoặc `snapshot` có `generatedAt` khác bản đang giữ; `EventSource` tự nối lại.
  - `main.ts`: `loadConfig(process.env)` → `loadMembers` → `readStore` → `buildServer` → `startPoller(cfg, broadcast)` → `listen({ host: '0.0.0.0', port })`.

- [ ] **Step 1: Viết test hỏng:**

```ts
test('chưa có snapshot → 503', async () => { expect((await app.inject('/api/snapshot')).statusCode).toBe(503); });
test('/api/snapshot không lộ seen', async () => { expect(body).not.toHaveProperty('seen'); });
test('nối lại SSE (hello) → client tải lại snapshot đúng một lần, không nhân đôi', async () => { /* Review Focus 5: EventSource giả, phát hello 2 lần cùng generatedAt → fetch gọi 1 lần; generatedAt mới → gọi lần 2 */ });
```

- [ ] **Step 2:** `npx vitest run test/server.test.ts test/api-client.test.ts` → FAIL.
- [ ] **Step 3:** Viết `main.ts`, `api.ts`.
- [ ] **Step 4:** chạy lại → PASS; `npm run build && npm start` với `.env` thật trên máy dev, `curl localhost:4800/api/snapshot` trả JSON có `desks`.
- [ ] **Step 5:** Commit `feat: API snapshot và luồng sự kiện SSE`.

### Task 8: Bản 2D `/list`

**Files:**
- Create: `vite.config.ts` (multi-page: `index.html`, `list.html`), `src/web/list.html`, `src/web/list.ts`, `src/web/format.ts`
- Test: `test/format.test.ts`

**Interfaces:**
- Consumes: `connect` (Task 7), `Snapshot`.
- Produces: `src/web/format.ts` — `waitLabel(w: WaitItem, members: Map<string, Member>): string` và `ago(iso: string, now: Date): string`, dùng lại ở 3D.

Câu chữ cố định:
- `waitLabel`: `review` → `Chờ {người} review PR #{n}`; `fix` → `Chờ {người} sửa theo review của {người gửi}`; `gh_mention` → `{người gửi} nhắc {người} trên PR #{n}`; `backlog_notify` → `{người gửi} báo {người} trên {mã task}`. Người gửi là agent → thêm ` (agent)`.
- `ago`: `vừa xong` (< 1 phút), `{n} phút trước`, `{n} giờ trước`, `{n} ngày trước`.
- Dải trạng thái: nguồn trong `staleSources` → `Dữ liệu {GitHub|Backlog} chưa cập nhật được, đang hiện bản lúc {HH:mm}.`; mất SSE → `Mất kết nối tới máy chủ, đang thử lại…`.

Bố cục: cột trái theo người (tên, task đang làm, PR, mục chờ có màu đỏ / vàng nếu `stale`), cột phải tiến độ milestone + 20 sự kiện mới nhất + "Chờ team" + "Chưa rõ người" + `unmappedLogins` (tiêu đề `Tài khoản GitHub chưa ghép người`) + `unmappedMembers` (tiêu đề `Thành viên Backlog chưa có trong members.yaml`), đặt ở khối `#config` cuối trang. Mọi dòng là link sang GitHub / Backlog, mở tab mới. Không sắp xếp người theo số lượng; sắp theo `role` rồi tên.

- [ ] **Step 1: Viết test hỏng** cho `waitLabel` (4 loại + agent) và `ago` (4 mốc).
- [ ] **Step 2:** `npx vitest run test/format.test.ts` → FAIL.
- [ ] **Step 3:** Viết `format.ts`, `list.html`, `list.ts`.
- [ ] **Step 4:** test PASS; `npm run dev` mở `http://localhost:5173/list` (proxy `/api` → 4800) thấy đủ các khối với dữ liệu thật; chụp màn hình.
- [ ] **Step 5:** Commit `feat: bản 2D /list`.

### Task 9: Văn phòng 3D

**Files:**
- Create: `src/web/index.html`, `src/web/main.ts`, `src/web/panel.ts`, `src/web/scene/office.ts`, `src/web/scene/desk.ts`, `src/web/scene/board.ts`, `src/web/scene/paper.ts`, `src/web/scene/ticker.ts`, `src/web/layout.ts`, `THIRD_PARTY_NOTICES.md`
- Test: `test/layout.test.ts`

**Interfaces:**
- Consumes: `connect`, `waitLabel`, `ago`.
- Produces:
  - `layoutDesks(desks: Desk[]): { key: string; x: number; z: number; group: string }[]` — nhóm theo `role`, mỗi nhóm một dãy, bàn cách nhau 2.5 đơn vị, nhóm cách nhau 4; thứ tự trong nhóm theo tên; vị trí **chỉ phụ thuộc tập người + role** (thêm mục chờ không làm bàn đổi chỗ).
  - `scene/desk.ts`: `createDesk(desk: Desk): THREE.Group` + `updateDesk(g: THREE.Group, desk: Desk): void` — bảng tên, ảnh / chữ cái đầu, màn hình task (`{mã} {tên ≤ 28 ký tự}` + `+n`), xấp giấy cao theo số PR, đèn: đỏ nếu có `waits` không stale, vàng nếu có stale (vàng thắng đỏ), tắt nếu rỗng; robot nhỏ khi có mục chờ / sự kiện gần nhất `viaAgent`.
  - `scene/board.ts`: bảng tường mỗi milestone một cột (tên, 4 bucket, thanh %, `còn {n} ngày`) + cột `Chờ team`.
  - `scene/paper.ts`: `flyPaper(from: Vector3, to: Vector3): void` cho sự kiện có `from` và `to`; `pr_opened` → xấp giấy nhô; `pr_merged` → chuông.
  - `scene/ticker.ts`: dải chữ 20 sự kiện mới nhất.
  - `panel.ts`: bấm bàn → bảng bên (HTML overlay) liệt kê `doingTasks`, `otherTasks`, `prs`, `waits`, mỗi dòng link.
  - Camera: `OrbitControls` nhìn từ trên xuống, giới hạn góc nghiêng, không di chuyển WASD.
  - Không có WebGL hoặc `matchMedia('(max-width: 768px)')` → hiện thông báo `Máy này hiển thị 3D chậm. Mở bản danh sách?` kèm link `/list`.
  - Đồ vật 3D (bàn, ghế, cây, đèn) có thể chép từ `AgentSystemLabs/agent-office` `src/client/` — ghi file nguồn + commit SHA vào `THIRD_PARTY_NOTICES.md` kèm toàn văn MIT.

- [ ] **Step 1: Viết test hỏng** `layoutDesks`: cùng tập người cho cùng toạ độ dù `waits` khác; hai role → hai dãy; thêm một người vào role A không đổi toạ độ role B.
- [ ] **Step 2:** `npx vitest run test/layout.test.ts` → FAIL.
- [ ] **Step 3:** Viết `layout.ts`, rồi cảnh và các phần tử.
- [ ] **Step 4:** test PASS; `npm run dev` mở `/` với dữ liệu thật: đủ bàn, đèn khớp `/list`, bấm bàn ra bảng bên, bắn một sự kiện giả qua `broadcast` thấy giấy bay; thử cửa sổ 375 px thấy gợi ý `/list`. Chụp màn hình.
- [ ] **Step 5:** Commit `feat: văn phòng 3D`.

### Task 10: Đóng gói và chạy trên VM

**Files:**
- Create: `deploy/Dockerfile`, `deploy/compose.yml`, `README.md`

**Interfaces:**
- Consumes: `npm run build`, `npm start`.

- [ ] **Step 1:** `deploy/Dockerfile` hai tầng (`node:22-alpine` build → chạy `node dist/server/main.js`, user không phải root, `EXPOSE 4800`). `deploy/compose.yml`: service `team-office`, `env_file: ../.env`, volume `../config/members.yaml:/app/config/members.yaml:ro` và `team-office-data:/app/data`, `ports: ["4800:4800"]`, `restart: unless-stopped`.
- [ ] **Step 2:** `docker compose -f deploy/compose.yml up --build -d` trên máy dev → `curl -s localhost:4800/api/snapshot | head -c 200` trả JSON; `docker compose restart` rồi gọi lại vẫn có dữ liệu ngay (đọc từ volume).
- [ ] **Step 3:** `README.md` (tiếng Việt): mục đích, tạo GitHub fine-grained token (Pull requests / Issues / Metadata: Read-only), lấy Backlog API key, tạo `config/members.yaml` từ mẫu, `.env`, chạy compose, cổng 4800 trong mạng nội bộ, cảnh báo repo public — không commit `.env` / `members.yaml`.
- [ ] **Step 4:** `git status` không có `.env`, `config/members.yaml`, `data/`; `git grep -nE "apiKey=[A-Za-z0-9]|ghp_|github_pat_"` không ra gì.
- [ ] **Step 5:** `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 6:** Commit `chore: đóng gói container và hướng dẫn chạy trên VM`.
