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
| `.td <UID>` / `!td <UID>` | **Tính điểm theo khung giờ** (hiện menu 1-8 hoặc kèm số khung giờ và ngày, tự động xuất ảnh BXH) |
| `xin qr` / `stk` / `.qr` | Tự động gửi ảnh QR và thông tin tài khoản ngân hàng của nhóm |
| `.doiqr` / `.setqr` | Đổi mã QR nhóm (gõ kèm ảnh hoặc trượt tin nhắn ảnh) |
| `.setstk <STK> [Ngân Hàng]` | Cập nhật số tài khoản & tên ngân hàng của nhóm |
| `.ctk <Tên_Chủ_TK>` | Cập nhật tên chủ tài khoản ngân hàng |
| `.xoaqr` / `.resetqr` | Xóa mã QR riêng, quay về dùng mã QR mặc định |
| `.anti` / `.baove` | Menu cài đặt hệ thống Bảo Vệ Nhóm (Chống cướp box, Spam, Link, QR) |
| `!kickall` / `.kickall` | Kick toàn bộ thành viên thường khỏi nhóm (bảo lưu Trưởng nhóm & Phó nhóm) |
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
