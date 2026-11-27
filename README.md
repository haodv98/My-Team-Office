# My Team Office

Văn phòng 3D cho cả đội: ai đang làm task nào (Backlog), PR nào chờ ai review, comment nào chờ ai xác nhận / sửa (GitHub + Backlog), tiến độ milestone đang chạy và sự kiện mới. Có thêm bản danh sách 2D ở `/list`.

Chỉ **đọc** GitHub / Backlog, không ghi gì ngược lại. Thiết kế: `docs/superpowers/specs/2026-11-27-team-office-design.md`.

> ⚠️ Repo này **public**. Không commit `.env`, `config/members.yaml`, thư mục `data/` hay bất cứ token, email, tên dự án nào.

## Chuẩn bị

1. **GitHub token** — fine-grained, chỉ chọn các repo cần theo dõi, quyền *Read-only*: Pull requests, Issues, Metadata.
2. **Backlog API key** — của một tài khoản có quyền xem dự án (Cá nhân → API).
3. **`.env`** — sao chép từ `.env.example`, điền `GITHUB_TOKEN`, `GITHUB_REPOS`, `BACKLOG_SPACE`, `BACKLOG_API_KEY`, `BACKLOG_PROJECT_KEY`.
4. **`config/members.yaml`** — sao chép từ `config/members.example.yaml`, mỗi thành viên một mục: `backlog_user_id`, các login GitHub (`github: [...]`), `role` (để xếp dãy bàn). Sửa file này không cần khởi động lại; ai thiếu sẽ hiện ở cuối trang `/list`.

## Chạy trên VM (Docker)

```bash
docker compose -f deploy/compose.yml up --build -d
```

Mở `http://<ip-vm>:4800` trong mạng nội bộ. Trạng thái lưu ở volume `team-office-data`, khởi động lại vẫn hiện ngay bản gần nhất. Mạng cần proxy thì thêm `HTTPS_PROXY` vào `.env`.

## Chạy trên máy dev

```bash
npm install
npm test
npm run build && npm start          # http://localhost:4800
npm run dev                          # Vite ở :5173, proxy /api → :4800
npx tsx scripts/demo-state.ts        # dữ liệu bịa để xem giao diện khi chưa có token
```

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `POLL_SECONDS` | 60 | chu kỳ hỏi API |
| `PORT` | 4800 | cổng HTTP |
| `AGENT_MARKERS` | `Generated with Claude Code` | dấu nhận comment do agent viết (nhiều dấu: phân cách `\|`) |
| `STATUS_MAP` | — | JSON ghép trạng thái Backlog tuỳ biến vào `todo / doing / done / closed` |
| `MEMBERS_FILE`, `DATA_DIR`, `HTTPS_PROXY` | | xem `.env.example` |
