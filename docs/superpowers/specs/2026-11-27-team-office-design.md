# My Team Office — thiết kế

Ngày: 27/11/2026 · Trạng thái: bản nháp chờ duyệt

## 1. Mục đích

Một trang web văn phòng 3D cho cả đội dự án. Ai mở ra cũng thấy ngay:

- mỗi thành viên **đang làm task nào** (Backlog);
- **PR nào đang chờ ai review** (GitHub);
- **comment nào được gửi về ai** và đang chờ người đó xác nhận hoặc sửa (GitHub + Backlog);
- **tiến độ hiện tại** của đợt (milestone) đang chạy;
- các **sự kiện mới** (tạo PR, comment, review, đổi trạng thái task) khi chúng xảy ra.

Người xem: mọi thành viên trong đội, mở từ mạng nội bộ công ty.

## 2. Mục tiêu / không làm / tránh

**Mục tiêu**

- Nhìn 5 giây biết "ai đang chờ ai": PR chờ review, comment chờ trả lời, xếp theo người nhận.
- Gán việc đúng người kể cả khi PR do agent mở dưới tài khoản người khác (xem §5.2).
- Dữ liệu trễ tối đa ~1–2 phút so với GitHub / Backlog.
- Chạy được trên máy yếu: có chế độ 2D danh sách.

**Không làm (giai đoạn này)**

- Không ghi ngược lên GitHub / Backlog (không comment, không đổi trạng thái, không merge). Chỉ đọc.
- Không thuê / điều khiển agent, không terminal, không voice, không chia sẻ màn hình như agent-office.
- Không đăng nhập riêng từng người (trang chỉ mở trong mạng nội bộ).
- Không lưu lịch sử dài hạn hay báo cáo thống kê.

**Tránh (dù chạy đúng vẫn là thất bại)**

- Biến thành **bảng xếp hạng năng suất** (đếm PR / comment theo người để so sánh). *(đề xuất của người viết — cần chủ dự án xác nhận)*
- Gán sai người: hiện đèn "chờ bạn" ở bàn người không liên quan làm mất tin cậy nhanh hơn thiếu dữ liệu. Không chắc chắn thì đặt vào khu "chưa rõ người", không đoán.
- Lộ token hoặc thông tin cá nhân: **repo này public**.

## 3. Ràng buộc

- Chạy trên **VM demo hiện có**, trong mạng nội bộ. GitHub / Backlog **không gọi webhook vào được** → phải hỏi API định kỳ (polling).
- Repo `haodv98/My-Team-Office` là **public**: không commit token, email, bảng ghép tài khoản, tên dự án Backlog, nội dung task. Những thứ đó nằm trong file cấu hình / biến môi trường trên VM (gitignore), repo chỉ có file mẫu.
- Token chỉ cần quyền **đọc**: GitHub fine-grained token (Pull requests, Issues, Metadata: read) cho repo đang theo dõi; Backlog API key của một tài khoản có quyền xem dự án.
- Giới hạn gọi API: GitHub 5.000 lượt/giờ (dùng ETag để lượt không đổi không bị tính); Backlog có trần theo phút — chu kỳ polling phải nằm dưới trần.
- VM gọi ra ngoài trực tiếp; nếu mạng cần proxy thì HTTP client đọc `HTTPS_PROXY`. *(lựa chọn của người viết)*
- agent-office (`github.com/AgentSystemLabs/agent-office`) là MIT; đồ vật 3D của nó dựng bằng mã / script trong chính repo nên cùng giấy phép: được chép mô hình / mã dựng đồ vật 3D, giữ ghi chú giấy phép trong `THIRD_PARTY_NOTICES.md`.

## 4. Các hướng đã cân nhắc

| Hướng | Được | Mất | Kết luận |
| --- | --- | --- | --- |
| A. Fork agent-office rồi sửa | Có sẵn cảnh 3D đẹp, nhân vật, bảng ghim | Lõi gắn chặt việc chạy terminal agent (PTY, worktree, voice); phải gỡ nhiều; upstream đổi liên tục; cần `gh` quyền ghi trên VM | Loại |
| **B. App nhỏ riêng, mượn phong cách + đồ vật 3D của agent-office** | Làm đúng việc cần, nhẹ, token chỉ đọc, tự quản | Tự dựng cảnh 3D, bản đầu đơn giản hơn | **Chọn** (chủ dự án chọn 27/11) |
| C. Dùng nguyên agent-office, đổi map JSON | Không phải viết code | Map chỉ đổi giao diện, không thêm được nguồn dữ liệu người / Backlog | Loại |

Đặt ở repo riêng (không trong repo sản phẩm) — chủ dự án đã tạo `haodv98/My-Team-Office`.

## 5. Thiết kế

### 5.1 Khối chính

```
GitHub REST ─┐                              ┌─> /api/snapshot (JSON)
             ├─> collector (polling 60 s) ─>│   /api/events  (SSE)
Backlog API ─┘     ghép người–task–PR       └─> web: 3D office + 2D list
                   → snapshot + feed sự kiện
```

- **collector**: tiến trình Node chạy nền. Mỗi chu kỳ đọc dữ liệu (§5.3), ghép (§5.2), tính ra một `snapshot` và danh sách sự kiện mới. Lưu `snapshot` ra file trên volume để khởi động lại không mất trạng thái hiện tại.
- **server**: cùng tiến trình, phục vụ trang tĩnh, `GET /api/snapshot`, `GET /api/events` (SSE đẩy sự kiện mới + phiên bản snapshot mới).
- **web**: trang tĩnh. `/` là văn phòng 3D; `/list` là bản 2D. Trình duyệt chỉ nói chuyện với server, không bao giờ cầm token.
- Đóng thành **một container**, chạy cạnh Compose hiện có trên VM, mở một cổng trong mạng nội bộ.

### 5.2 Ghép người – task – PR

**Gốc về con người là Backlog.** File `config/members.yaml` (không commit; repo có `members.example.yaml`):

```yaml
- key: m01                 # khoá nội bộ, ổn định
  display: "Tên hiển thị"
  backlog_user_id: 123456
  github: [login-a]         # có thể rỗng (thành viên không dùng GitHub) hoặc nhiều login
  role: dev                 # dev | qs | ba | lead … chỉ để nhóm bàn
```

**Ai có bàn:** mọi thành viên của dự án Backlog (hiện đều là người của đội, không có tài khoản khách hàng). Ai có trên Backlog dự án nhưng thiếu trong file → vẫn có bàn, hiện cảnh báo "chưa ghép GitHub" ở trang quản trị nhỏ (`/list#config`). Login GitHub không có trong file → khu "Khách".

**PR thuộc về ai** (theo thứ tự, dừng ở luật đầu tiên khớp):

1. Có mã task đầy đủ `<PROJECT_KEY>-<n>` trong tiêu đề / nhánh / mô tả.
2. Tên nhánh dạng `<loại>/<n>-...` hoặc `<loại>/<n>-<m>-...` (ví dụ `feat/583-...`, `feat/584-585-...`).
3. Tiêu đề có `(#n)` trong phần scope, ví dụ `feat(#583): ...`.

Tìm được task → PR gán cho **người được giao task** trên Backlog (không phải người mở PR, vì agent hay mở PR dưới một tài khoản chung). Nhiều task → hiện ở bàn của mỗi người được giao. Không tìm được task → gán cho người mở PR theo `members.yaml`; không ghép được nữa → khu "chưa rõ người". Mẫu regex nằm trong cấu hình.

**Comment / review do agent viết** (nhận ra bằng dấu trong nội dung, mặc định `Generated with Claude Code`; mẫu nằm trong cấu hình) **được tính cho chủ tài khoản** — tức là chủ tài khoản đã phản hồi, tắt được mục chờ của họ (§5.4). Trên trang, chúng hiện là "agent của X" với biểu tượng robot ở bàn X. *(chủ dự án chốt 27/11)*

Lưu ý: `#n` trong tiêu đề có thể là số PR GitHub (ví dụ "sửa review PR #901"). Luật 3 chỉ nhận `#n` nằm trong ngoặc scope ngay sau loại commit; số task phải tồn tại trên Backlog mới được nhận.

### 5.3 Dữ liệu đọc mỗi chu kỳ

**Backlog** (dự án cấu hình qua env `BACKLOG_PROJECT_KEY`)

- Thành viên dự án.
- Milestone: chọn các milestone **đang chạy** (`startDate ≤ hôm nay ≤ releaseDueDate`, chưa archive). Có thể có nhiều milestone chồng nhau → hiện từng cái.
- Task chưa đóng được giao cho thành viên + task đóng trong milestone đang chạy (để tính tiến độ).
- Hoạt động dự án gần đây (activities: tạo / sửa task, comment có người được báo).

**GitHub** (repo cấu hình qua env `GITHUB_REPOS`, có thể nhiều repo)

- PR đang mở: người mở, nhánh, tiêu đề, draft, người / nhóm được yêu cầu review, trạng thái review gần nhất của từng reviewer.
- Review, review comment, issue comment trên PR đang mở + PR đóng / merge trong 24 giờ qua (cho feed sự kiện).
- Dùng ETag / `If-None-Match` để lượt không đổi không tốn hạn mức.

### 5.4 "Đang chờ ai" — luật bật / tắt

Mỗi mục chờ có `người nhận`, `người gửi`, `nguồn` (link GitHub / Backlog), `từ lúc`.

| Mục chờ | Bật khi | Tắt khi |
| --- | --- | --- |
| Chờ review PR | người đó nằm trong danh sách yêu cầu review của PR đang mở | họ gửi review (bất kỳ loại) hoặc bị gỡ khỏi danh sách |
| Chờ sửa PR | review `CHANGES_REQUESTED` trên PR của họ (người nhận = chủ PR theo §5.2) | chủ PR yêu cầu review lại, hoặc reviewer duyệt (commit mới thôi chưa đủ — sửa dở vẫn còn đèn) |
| Được nhắc trên GitHub | comment / review comment có `@login` của họ trên PR đang mở | họ comment trong cùng PR sau thời điểm đó, hoặc PR đóng |
| Được báo trên Backlog | comment Backlog có họ trong danh sách được báo (notify) | họ comment trên cùng task sau thời điểm đó, hoặc task đóng |

*(Các luật "tắt khi" là đề xuất của người viết; chủ dự án duyệt.)* Mục chờ quá 3 ngày làm việc → đổi màu "chờ lâu".

Yêu cầu review gửi cho **team** GitHub (không phải người) → hiện ở cột "chờ team" trên bảng tường, không bật đèn bàn nào (token chỉ đọc không xem được thành viên team). *(lựa chọn của người viết)*

**Lần chạy đầu / sau khi dừng lâu:** đọc lại comment của task Backlog đang mở và PR đang mở cập nhật trong **14 ngày** gần nhất để dựng lại mục chờ, không chỉ dựa vào feed hoạt động (feed chỉ trả các mục gần đây). *(lựa chọn của người viết)*

### 5.5 Văn phòng 3D

- Một tầng, bàn xếp theo nhóm `role`. Mỗi thành viên một bàn có bảng tên, ảnh đại diện (icon Nulab nếu tải được, không thì chữ cái đầu).
- Trên bàn: màn hình nhỏ ghi task **đang làm** = task được giao có trạng thái "Đang xử lý"; nhiều task thì hiện task cập nhật gần nhất kèm "+n", bảng bên liệt kê đủ. Task mở khác (chưa xử lý / đã xử lý) chỉ ở bảng bên. Trạng thái tuỳ biến của Backlog được ghép vào 4 nhóm tiến độ qua cấu hình. Xấp giấy = số PR đang mở của người đó. *(lựa chọn của người viết)*
- **Đèn trên bàn**: đỏ = có mục chờ người này (§5.4), vàng = chờ lâu, không đèn = không ai chờ. Bấm vào bàn → bảng bên liệt kê mục chờ, PR, task, mỗi dòng có link mở sang GitHub / Backlog.
- **Bảng tường tiến độ**: mỗi milestone đang chạy một cột — số task theo trạng thái Backlog (Chưa xử lý / Đang xử lý / Đã xử lý / Đóng) + thanh phần trăm đóng + số ngày còn lại.
- **Sự kiện mới**: một tờ giấy bay từ bàn người gửi sang bàn người nhận (comment, yêu cầu review); PR mới → xấp giấy trên bàn nhô lên; merge → chuông nhỏ. Có dải chữ chạy liệt kê 20 sự kiện gần nhất.
- Camera: nhìn từ trên xuống, xoay / zoom bằng chuột; không đi bộ WASD như agent-office (người xem chỉ cần nhìn). *(đề xuất)*
- Trang `/list`: cùng dữ liệu dạng bảng — theo người: task / PR / mục chờ; feed sự kiện; tiến độ. Trang 3D tự gợi ý `/list` trên điện thoại hoặc máy không có WebGL.

### 5.6 Công nghệ *(lựa chọn của người viết)*

- Node 22 + TypeScript cho collector / server (Fastify), Vite + Three.js cho web — cùng nền với agent-office nên chép đồ vật 3D dễ.
- Không dùng DB: snapshot JSON trên volume là đủ (một bản, không lịch sử).
- Test: unit cho luật ghép (§5.2) và luật bật / tắt mục chờ (§5.4) trên dữ liệu mẫu tự sinh (không dùng dữ liệu thật trong repo public).
- Cấu hình qua env: `GITHUB_TOKEN`, `GITHUB_REPOS`, `BACKLOG_SPACE`, `BACKLOG_API_KEY`, `BACKLOG_PROJECT_KEY`, `POLL_SECONDS` (mặc định 60), `PORT`, `MEMBERS_FILE`.

## 6. Để người làm tự quyết

- Bố cục cụ thể của tầng, mô hình bàn ghế, màu sắc (giữ tinh thần hoạt hình của agent-office).
- Cách chia lô gọi API trong một chu kỳ để nằm dưới hạn mức.
- Định dạng snapshot / sự kiện (giữ ổn định, có `version`).
- Cách đóng container và nối vào Compose trên VM.

## 7. Còn mở

- Không còn câu chặn. Các mục đánh dấu *(đề xuất / lựa chọn của người viết)* chờ chủ dự án xem khi duyệt.
