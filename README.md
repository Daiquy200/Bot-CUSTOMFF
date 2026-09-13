# 🤖 Bot Zalo Tính Điểm Giải Đấu Free Fire

Dự án tự động hóa tra cứu trận đấu, tính điểm và xuất bảng xếp hạng giải đấu Free Fire từ hệ thống Garena (`congdong.ff.garena.vn/tinh-diem`) vào nhóm chat Zalo.

---

## 🚀 Tính Năng Chính

* 🔍 **Tra cứu chi tiết trận:** Xem xếp hạng (Top 1 - Top 12), số Kill, Booyah và tổng điểm của từng đội trong trận.
* 📊 **Cộng dồn & tính tổng điểm:** Tính điểm tích lũy nhiều trận đấu trong giải để tạo bảng xếp hạng tổng.
* 🔎 **Tìm trận theo UID:** Tự động tìm danh sách ID các trận đấu của người chơi trong N ngày gần nhất.
* ⚡ **Công cụ CLI test độc lập:** Cho phép tra cứu và tính điểm ngay trên Terminal mà không cần bật Zalo.
* 💾 **Ghi nhớ đăng nhập Zalo:** Chỉ cần quét mã QR 1 lần duy nhất, bot sẽ tự lưu phiên (`zalo_session.json`).

---

## 🛠️ Cài Đặt & Cấu Hình

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Cấu hình file `.env`
File `.env` đã được điền sẵn Cookie phiên đăng nhập của bạn:
```env
GARENA_COOKIE="_ga=...; session=...; session.sig=...;"
BOT_PREFIX="!"
ZALO_SESSION_PATH="./zalo_session.json"
```

> **Lưu ý về Cookie:** Khi Cookie Garena hết hạn (lệnh `!check` báo ngoại tuyến), bạn chỉ cần vào F12 $\rightarrow$ tab Network $\rightarrow$ copy lại dòng `Cookie:` mới và dán đè vào `GARENA_COOKIE` trong file `.env`.

---

## 📖 Cách Sử Dụng

### Cách 1: Chạy Bot Zalo (Phản hồi tự động trong nhóm)
```bash
npm start
# hoặc: node src/bot.js
```
1. Khi khởi chạy lần đầu, Terminal sẽ hiển thị **mã QR**.
2. Mở ứng dụng Zalo trên điện thoại $\rightarrow$ Quét mã QR để đăng nhập tài khoản làm Bot.
3. Thêm tài khoản Bot vào nhóm Zalo giải đấu.
4. Thành viên trong nhóm có thể gõ các lệnh sau:

| Lệnh | Mô tả & Ví dụ |
| :--- | :--- |
| `!help` / `.help` | Xem hướng dẫn sử dụng bot |
| `.tên1, tên2...` | **Thêm tuyển thủ vào slot Custom** (Ví dụ: `.Văn Thịnh 1, Văn Thịnh 2, Bi`) |
| `.taocus [giờ] [giá] [bảng]` | Tạo giải Custom mới (Ví dụ: `.taocus 8h 6k A` hoặc `.taocus`) |
| `.xemslot` / `.cus` / `.ds` | Xem lại bảng danh sách 12 slot hiện tại |
| `.xoa <số_slot>` | Hủy tuyển thủ ở slot (Ví dụ: `.xoa 3` hoặc `.xoa 3 5`) |
| `.phi <số_slot>` | Đánh dấu đã đóng phí 💸 (Ví dụ: `.phi 8`) |
| `.hen <số_slot>` | Đánh dấu hẹn phí ⏰ (Ví dụ: `.hen 8`) |
| `.ctk <tên>` | Đổi tên CTK + Bill (Mặc định: LE DAI QUY) |
| `.box <tên>` | Đổi tên Box (Mặc định: BOX CUSTOM ĐQ) |
| `.link <url>` | Gắn link nhóm IDMK ở cuối bảng danh sách |
| `.td <UID>` / `!td <UID>` | Tính điểm theo khung giờ (hiện menu 1-8 hoặc kèm số khung giờ) |
| `.mau [số_mẫu]` | Xem danh sách mẫu & chọn mẫu phôi BXH 1-8 (Ví dụ: `.mau 8`) |
| `.xemmau [số_mẫu]` | Xem ảnh mẫu phôi BXH (Ví dụ: `.xemmau 4` hoặc `.xemmau all`) |
| `!diem <ID_Trận>` | Xem điểm chi tiết 1 trận (Ví dụ: `!diem 12345678`) |
| `!timtran <UID> [số_ngày]` | Tìm các ID trận gần nhất của một UID (Ví dụ: `!timtran 1043310641 7`) |
| `!kickall` / `.kickall` | Kick toàn bộ thành viên thường khỏi nhóm (bảo lưu Trưởng nhóm & Phó nhóm) |
| `.dangxuat` / `!dangxuat` | Đăng xuất Bot và xóa phiên đăng nhập để đổi tài khoản mới (Chỉ tài khoản Bot mới có quyền) |
| `!check` | Kiểm tra trạng thái kết nối tài khoản Garena |

---

### Cách 2: Sử dụng công cụ CLI (Chạy trực tiếp trên máy)
Không cần mở Zalo, bạn có thể tra cứu ngay trên PowerShell/CMD:

```bash
# Kiểm tra kết nối Garena
npm run test-garena

# Xem điểm 1 trận
node src/cli.js diem 12345678

# Tính tổng điểm nhiều trận
node src/cli.js tongdiem 12345 12346 12347

# Tìm các trận đấu của UID trong 15 ngày qua
node src/cli.js timtran 1043310641 15
```
