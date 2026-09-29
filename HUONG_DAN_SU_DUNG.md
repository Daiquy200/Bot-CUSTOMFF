# 📖 HƯỚNG DẪN SỬ DỤNG BOT ZALO TÍNH ĐIỂM FREE FIRE (TỰ ĐỘNG GARENA)

Hệ thống kết nối trực tiếp hệ thống Garena Community (`congdong.ff.garena.vn/tinh-diem`) để tự động tra cứu trận đấu theo khung giờ, tính điểm xếp hạng theo chuẩn luật Free Fire và vẽ ảnh Bảng Xếp Hạng cực đẹp gửi thẳng vào nhóm Zalo.

---

## 📌 MỤC LỤC
1. [Yêu cầu hệ thống & Chuẩn bị](#1-yêu-cầu-hệ-thống--chuẩn-bị)
2. [Cài đặt & Cấu hình lần đầu (.env)](#2-cài-đặt--cấu-hình-lần-đầu-env)
3. [Hướng dẫn lấy Cookie Garena khi hết hạn](#3-hướng-dẫn-lấy-cookie-garena-khi-hết-hạn)
4. [Cách khởi chạy Bot & Đăng nhập Zalo](#4-cách-khởi-chạy-bot--đăng-nhập-zalo)
5. [Bảo mật & Giới hạn nhóm hoạt động (File nhom_cho_phep.txt)](#5-bảo-mật--giới-hạn-nhóm-hoạt-động-file-nhom_cho_pheptxt)
6. [Lệnh Tính Điểm Theo Khung Giờ (.td) - Tính Năng Cốt Lõi 🌟](#6-lệnh-tính-điểm-theo-khung-giờ-td---tính-năng-cốt-lõi-)
7. [Các lệnh tra cứu điểm & Tiện ích khác](#7-các-lệnh-tra-cứu-điểm--tiện-ích-khác)
8. [Chọn & Xem trước mẫu phôi Bảng Xếp Hạng](#8-chọn--xem-trước-mẫu-phôi-bảng-xếp-hạng)
9. [Tự động gửi mã QR & Quản lý tài khoản ngân hàng](#9-tự-động-gửi-mã-qr--quản-lý-tài-khoản-ngân-hàng)
10. [Hệ thống bảo vệ nhóm (Anti)](#10-hệ-thống-bảo-vệ-nhóm-anti)
11. [Lệnh lọc thành viên nhóm (KickAll)](#11-lệnh-lọc-thành-viên-nhóm-kickall)
12. [Công cụ CLI (Tra cứu nhanh trên Terminal)](#12-công-cụ-cli-tra-cứu-nhanh-trên-terminal)
13. [Xử lý các lỗi thường gặp (Troubleshooting)](#13-xử-lý-các-lỗi-thường-gặp-troubleshooting)

---

## 1. YÊU CẦU HỆ THỐNG & CHUẨN BỊ
- **Hệ điều hành:** Windows 10/11 (hoặc Linux/macOS).
- **Môi trường:** Đã cài đặt [Node.js](https://nodejs.org/) (phiên bản khuyến nghị LTS: Node 18, 20 hoặc mới hơn).
- **Điện thoại:** Cài sẵn ứng dụng Zalo để quét mã QR đăng nhập tài khoản làm Bot.
- **Tài khoản Garena:** Tài khoản Free Fire có quyền tạo giải / tra cứu trên trang cộng đồng Garena.

---

## 2. CÀI ĐẶT & CẤU HÌNH LẦN ĐẦU (.env)

### Bước 1: Mở thư mục dự án trên Terminal / PowerShell
Mở PowerShell hoặc CMD tại thư mục `botTinhDIem`:
```bash
npm install
```

### Bước 2: Tạo hoặc kiểm tra file `.env`
Đảm bảo trong thư mục gốc đã có file `.env` với các nội dung sau:
```env
# Cookie đăng nhập tài khoản Garena Community
GARENA_COOKIE="_ga=...; session=...; session.sig=...;"

# Tiền tố nhận diện lệnh của Bot (hỗ trợ !, ., /)
BOT_PREFIX="!"

# Đường dẫn lưu file phiên đăng nhập Zalo
ZALO_SESSION_PATH="./zalo_session.json"

# Phân quyền: true = chỉ Trưởng/Phó nhóm mới dùng được lệnh (khuyến nghị để tránh mem spam)
ADMIN_ONLY_COMMANDS="true"

# Danh sách UID Zalo của Admin dự phòng/ngoại lệ (cách nhau bởi dấu phẩy, có thể để trống)
ADMIN_WHITELIST=""
```

---

## 3. HƯỚNG DẪN LẤY COOKIE GARENA KHI HẾT HẠN

Khi gõ lệnh `!check` mà bot báo **GARENA NGOẠI TUYẾN** (Cookie hết hạn), bạn làm theo các bước sau để lấy Cookie mới (khoảng 30 giây):

1. Dùng trình duyệt Google Chrome/Cốc Cốc mở trang: [https://congdong.ff.garena.vn/tinh-diem](https://congdong.ff.garena.vn/tinh-diem)
2. Đăng nhập tài khoản Garena của bạn.
3. Nhấn phím **F12** (hoặc chuột phải chọn **Inspect/Kiểm tra**) -> Chọn tab **Network** (Mạng).
4. Nhấn **F5** để tải lại trang.
5. Ở ô tìm kiếm / bộ lọc (Filter) bên trái, tìm một request bất kỳ (ví dụ: `me` hoặc `tournaments` hoặc `league-score-api`).
6. Bấm vào request đó -> Chọn tab **Headers** bên phải -> Kéo xuống mục **Request Headers**.
7. Tìm dòng `Cookie:` -> Sao chép toàn bộ giá trị phía sau chữ `Cookie:` (dạng `_ga=...; session=...; session.sig=...;`).
8. Mở file `.env`, dán đè chuỗi vừa copy vào sau `GARENA_COOKIE=`.
9. Lưu file `.env` lại và khởi động lại Bot.

---

## 4. CÁCH KHỞI CHẠY BOT & ĐĂNG NHẬP ZALO

### Khởi động Bot:
```bash
npm start
# Hoặc: node src/bot.js
```

### Quy trình đăng nhập Zalo:
1. **Lần đầu tiên chạy:**
   - Bot sẽ tự động tạo file `qr.png` và bật ảnh QR lên màn hình của bạn.
   - Mở app Zalo trên điện thoại -> Chọn biểu tượng **Quét mã QR** -> Quét mã trên màn hình.
   - Trên điện thoại bấm **Đăng nhập** để xác nhận.
   - Bot sẽ thông báo `✅ Đăng nhập Zalo thành công!` và tự động lưu phiên vào `zalo_session.json`.
2. **Từ các lần chạy tiếp theo:**
   - Bot tự động đọc phiên từ `zalo_session.json`, bạn **không cần quét lại mã QR nữa**.
3. **Đăng xuất hoặc Đổi tài khoản Bot:**
   - Trong nhóm chat, dùng chính tài khoản Bot gõ: `.dangxuat` (hoặc nhắn tin riêng 1-1 cho Bot: `.dangxuat`).
   - Bot sẽ tự động xóa `zalo_session.json` và dừng tiến trình.
   - Chạy lại `npm start` để quét mã bằng tài khoản mới.

---

## 5. BẢO MẬT & GIỚI HẠN NHÓM HOẠT ĐỘNG (FILE nhom_cho_phep.txt)
Bot được bảo vệ để **CHỈ HOẠT ĐỘNG TRONG CÁC NHÓM ĐƯỢC CHỈ ĐỊNH**:
- **Cấp quyền cho nhóm:**
  1. Gõ lệnh: `.idnhom` (hoặc `.id`) trong nhóm Zalo để lấy ID nhóm.
  2. Mở file `nhom_cho_phep.txt` ở thư mục gốc của bot.
  3. Dán Link nhóm (ví dụ: `https://zalo.me/g/abcdef123`) hoặc ID nhóm (ví dụ: `2542340226912335505`) vào file.
  4. Bấm **Lưu (Ctrl + S)**. Bot sẽ tự động nhận diện và kích hoạt ngay mà không cần tắt mở lại bot.
- **Phân quyền trong nhóm:**
  - Mặc định Bot chỉ phản hồi lệnh của **Trưởng nhóm**, **Phó nhóm** và **chính tài khoản Bot** để tránh thành viên spam.
  - Khi thêm Bot vào nhóm, hãy **thăng quyền Phó nhóm** cho tài khoản Bot để Bot có thể thực hiện lệnh `.kickall`.

---

## 6. LỆNH TÍNH ĐIỂM THEO KHUNG GIỜ (`.td`) - TÍNH NĂNG CỐT LÕI 🌟

Hệ thống chia sẵn 8 khung giờ chuẩn của các giải Free Fire:
1. **Khung 1:** 13h - 15h
2. **Khung 2:** 15h - 17h
3. **Khung 3:** 17h - 19h
4. **Khung 4:** 20h - 21h30
5. **Khung 5:** 21h40 - 23h
6. **Khung 6:** 23h30 - 1h (qua đêm)
7. **Khung 7:** 1h - 3h (sáng sớm)
8. **Khung 8:** 10h - 12h

### Cách sử dụng:
1. **Cách 1 - Hiện menu chọn giờ:**
   - Gõ: `.td <UID>` (Ví dụ: `.td 1043310641`)
   - Bot sẽ gửi menu 8 khung giờ. Bạn chỉ cần trả lời số từ `1` đến `8`.
2. **Cách 2 - Tính nhanh 1 dòng:**
   - Gõ: `.td <UID> <Số_Khung_Giờ>` (Ví dụ: `.td 1043310641 6`)
3. **Cách 3 - Tìm trận của ngày cũ:**
   - Gõ: `.td <UID> <Số_Khung_Giờ> <Ngày>` (Ví dụ: `.td 1043310641 4 08/09` hoặc kèm chữ `hôm qua`)
4. **🔥 MẸO CỰC TIỆN TRÊN ĐIỆN THOẠI:**
   - Khi có thành viên gửi UID trong nhóm, bạn chỉ cần **gạt ngón tay trượt tin nhắn đó qua** (Quote Reply) và gõ `td` hoặc `td 1`! Bot sẽ tự động bắt lấy UID từ tin nhắn được trích dẫn!

> **Kết quả:** Bot sẽ tự động tổng hợp toàn bộ các trận trong khung giờ, tính điểm xếp hạng theo luật Free Fire và **vẽ ảnh Bảng Xếp Hạng cực nét gửi thẳng vào nhóm Zalo**!

---

## 6.1. HỆ THỐNG KEY, CHỈNH SỬA TÊN GIẢI CUSTOM & LOGO BXH 🔑

Hệ thống Key cá nhân giúp người thuê bot tự quản lý lượt dùng, đặt tên giải và logo riêng hiển thị trực tiếp trên ảnh Bảng Xếp Hạng:

### 1. Tạo Key mới:
- Cú pháp: `.key tao <tên_key>`
- Ví dụ: `.key tao tenkey`

### 2. Nạp lượt dùng (Tự động SePay):
- Cú pháp: `.napluot <tên_key>`
- Bot gửi mã VietQR nạp tiền, quét mã chuyển khoản là tự động cộng lượt ngay lập tức.

### 3. Chỉnh sửa Key & Check lượt (`.key edit <tên_key>`):
- **Xem thông tin & Check lượt:** Gõ `.key edit tenkey` (hiển thị số lượt còn lại, tên custom hiện tại, trạng thái logo, mẫu BXH).
- **Đổi Tên Giải CUSTOM:** `.key edit tenkey ten <Tên_Giải>`
  - *Ví dụ:* `.key edit tenkey ten ĐẠI CHIẾN QUÂN ĐOÀN`
  - Tên giải sẽ xuất hiện nổi bật trên đầu ảnh Bảng Xếp Hạng.
- **Thêm / Đổi Logo BXH:** `.key edit tenkey logo`
  - Bot sẽ hỏi: `Bạn có muốn thêm logo cho Key [TENKEY] không? 👉 Hãy trượt tin nhắn này qua và trả lời: Có hoặc Không`.
  - Bạn **trượt tin nhắn của bot qua** và trả lời `Có`.
  - Sau đó bạn **gửi ảnh logo từ thư viện vào nhóm** (không cần trượt tin nhắn khi gửi ảnh).
  - **Bảo mật tuyệt đối:** Bot đã ghi nhớ UID của chính bạn và chỉ nhận ảnh do tài khoản của bạn gửi lên trong vòng 3 phút, bất kỳ ảnh nào của thành viên khác gửi vào nhóm đều bị bỏ qua 100%.
  - Logo được bo tròn tinh tế và vẽ viền vàng kim trên ảnh BXH.
- **Xóa Logo:** `.key edit tenkey xoalogo`
- **Đổi mẫu phôi BXH:** `.key edit tenkey <1-5>` (Ví dụ: `.key edit tenkey 5`).

### 4. Tính điểm kèm Key & Loại bỏ trận lỗi:
- **Cú pháp chuẩn:** `.td [id] [tenkey]`
  - *Ví dụ:* `.td 18154023211 tenkey`
- **Xóa trận lỗi (trận nớ không tính, tính các trận còn lại):** `.td [id] [xoaN] [tenkey]`
  - *Ví dụ:* `.td 18154023211 xoa1 tenkey` (Xóa trận số 1 bị lỗi, chỉ tính các trận còn lại).

---

## 7. CÁC LỆNH TRA CỨU ĐIỂM & TIỆN ÍCH KHÁC

| Lệnh | Cú pháp | Ví dụ & Mô tả |
| :--- | :--- | :--- |
| `!check` | `!check` | Kiểm tra kết nối tài khoản Garena xem Cookie còn sống hay đã hết hạn. |
| `!help` | `!help` / `.help` | Hiển thị menu tóm tắt nhanh các lệnh ngay trong Zalo. |
| `.qr` / `.stk` / `.bank` | `.qr` hoặc nhắn "xin qr" | Nhận ảnh VietQR & thông tin tài khoản chuyển khoản nhóm. |
| `.doiqr` / `.setqr` | `.doiqr` | *(Chỉ Trưởng/Phó nhóm)* Gửi ảnh kèm `.doiqr` để đổi ảnh QR riêng cho nhóm. |
| `.setstk` | `.setstk <STK> <NgânHàng> [CTK]` | *(Chỉ Trưởng/Phó nhóm)* Đổi số tài khoản & ngân hàng nhóm. |
| `.ctk` | `.ctk <Tên_CTK>` | *(Chỉ Trưởng/Phó nhóm)* Đổi tên Chủ tài khoản nhận tiền. |
| `.xoaqr` | `.xoaqr` | *(Chỉ Trưởng/Phó nhóm)* Xóa QR riêng, quay về mã QR mặc định. |
| `.anti` / `.baove` | `.anti` | *(Chỉ Trưởng/Phó nhóm)* Mở menu cài đặt Bảo Vệ Nhóm. |
| `.bxh` / `.tongdiem` | `.bxh <ID1> <ID2>... [key]` | Tính điểm tổng kết chính xác theo danh sách ID các trận đấu bạn nhập. |
| `.kick` | `.kick @tên` / reply `.kick` | *(Chỉ Trưởng/Phó nhóm)* Kick thành viên vi phạm khỏi nhóm. |
| `.kickall` | `.kickall` | *(Chỉ Trưởng/Phó nhóm)* Kick thành viên thường dọn box chuẩn bị giải mới. |
| `.check` | `.check` | *(Chỉ Trưởng/Phó nhóm)* Kiểm tra kết nối Cookie Garena. |

---

## 8. PHÔI BẢNG XẾP HẠNG TIÊU CHUẨN (MẪU #6)
Hệ thống sử dụng phôi đồ họa Esports chuẩn độc quyền:
- **Mẫu #6: Kaito Kid & Conan Esports** (Ngang 1024x576):
  - **Ô trên cùng:** Bên trái hiển thị Tên CUSTOM (tự đổi bằng `.key edit <tên_key> ten <Tên>`), bên phải hiển thị Ngày & Giờ thi đấu.
  - **Khung TOP 1 Champion:** Logo vuông phát sáng hiệu ứng cyan cực đẹp, tên đội vô địch, số Booyah, Elim và Tổng Điểm nổi bật.
  - **Bảng 11 Đội (Top 2 - 12):** Cột logo riêng biệt, tên đội căn lề chuẩn, điểm Kills, Booyah (2 chữ số) và Tổng Điểm Vàng Esports.
  - **4 Khung Booyah Recap (Game 1 - 4):** Hiển thị các đội đạt Booyah kèm logo ở góc phải.
  - **Ô dưới cùng:** Căn giữa logo và tên Custom sắc nét.

Tất cả các lệnh tính điểm `.td` đều tự động sử dụng Mẫu #6 tiêu chuẩn này!

---

## 9. TỰ ĐỘNG GỬI MÃ QR & QUẢN LÝ TÀI KHOẢN NGÂN HÀNG

### A. Tự động gửi mã QR ngân hàng:
- Thành viên chỉ cần nhắn trong nhóm bất kỳ từ khóa nào như: `xin qr`, `mã qr`, `cho xin qr`, `stk`, `chuyển khoản`, `.qr`, `.stk`, `.bank`...
- Bot sẽ tự động gửi ảnh **VietQR** riêng của nhóm (hoặc mặc định TPBank `1000 2610 909` - `LE DAI QUY`) kèm thông tin STK và CTK.
- **Ai cũng dùng được:** Lệnh xem QR mở công khai cho tất cả thành viên trong nhóm.

### B. Dành cho Admin đổi mã QR & Thông tin tài khoản nhóm:
Mỗi nhóm chat Zalo có thể cấu hình tài khoản ngân hàng và mã QR riêng biệt:
1. **Đổi mã QR nhóm (`.doiqr` hoặc `.setqr`)**:
   - **Cách 1 (Khuyên dùng)**: Gửi ảnh mã QR vào nhóm, ở phần chú thích (caption) gõ `.doiqr`.
   - **Cách 2**: Trượt tin nhắn (quote reply) vào ảnh mã QR có sẵn trong nhóm rồi gõ `.doiqr`.
   - **Cách 3**: `.doiqr <link_ảnh>` nếu có link ảnh trực tiếp.
2. **Đổi số tài khoản & Ngân hàng (`.setstk`)**:
   - Cú pháp: `.setstk <Số_TK> <Tên_Ngân_Hàng>`
   - Ví dụ: `.setstk 0987654321 MBBank` hoặc `.setstk 1903678910 Techcombank`
3. **Đổi tên Chủ tài khoản nhận tiền (`.ctk`)**:
   - Cú pháp: `.ctk <Tên_Chủ_Tài_Khoản>`
   - Ví dụ: `.ctk NGUYEN VAN A`
4. **Xóa QR riêng, quay về mặc định (`.xoaqr` hoặc `.resetqr`)**:
   - Gõ `.xoaqr` để hủy mã QR riêng và quay về sử dụng mã QR TPBank mặc định của hệ thống.

---

## 10. HỆ THỐNG BẢO VỆ NHÓM (ANTI)

Hệ thống Anti bảo vệ nhóm tự động giúp Admin giữ an toàn tuyệt đối cho box chat, ngăn chặn các hành vi phá nhóm, cướp quyền, spam và quảng cáo trái phép.

### A. Cú pháp mở Menu:
```text
.anti
# hoặc: !anti, .baove
```

### B. Giao diện Menu hiển thị:
```text
🛡️ ════ BẢO VỆ NHÓM (ANTI) ════ 🛡️
⚙️ Trạng thái bảo vệ hiện tại:

[1] Chống cướp Box       : [ TẮT ⛔ ]
[2] Chống Spam (7 tin/10s): [ TẮT ⛔ ]
[3] Chống Link Web       : [ TẮT ⛔ ]
[4] Chống Link & QR Zalo : [ TẮT ⛔ ]
[5] Chống QR Ngân Hàng   : [ TẮT ⛔ ]
───────────────────────────────
[6] 🟢 Bật TẤT CẢ bảo vệ
[7] ⛔ Tắt TẤT CẢ bảo vệ

👉 Trượt (Reply) tin này và gõ SỐ (vd: 1 hoặc 1 3 4) để Bật/Tắt!
⚡ Vi phạm: Tự động XÓA TIN & KICK KHỎI NHÓM!
```

### C. Cách Bật / Tắt:
- **Cách 1 (Trượt tin nhắn):** Admin chỉ cần trượt (reply) tin nhắn menu Anti và nhắn số:
  - Nhắn `1`: Bật/Tắt [1] Chống cướp Box.
  - Nhắn `2`: Bật/Tắt [2] Chống Spam tin.
  - Nhắn `3`: Bật/Tắt [3] Chống Link Web.
  - Nhắn `4`: Bật/Tắt [4] Chống Link & QR Zalo.
  - Nhắn `5`: Bật/Tắt [5] Chống QR Ngân Hàng.
  - Nhắn `6` (hoặc `on`, `all`): Bật TẤT CẢ bảo vệ.
  - Nhắn `7` (hoặc `off`): Tắt TẤT CẢ bảo vệ.
  - Nhắn nhiều số: `1, 3, 4` hoặc `1 3 4` để bật/tắt đồng thời nhiều mục.
- **Cách 2 (Gõ lệnh trực tiếp):** `.anti 1`, `.anti 2`, `.anti 1 3 4`, `.anti on`, `.anti off`.

### D. Chi tiết các chức năng bảo vệ:
1. **[1] Chống cướp Box:** Tự động phát hiện khi thành viên thường tự ý đổi tên nhóm, đổi ảnh đại diện nhóm, đổi cài đặt hoặc phong phó nhóm trái phép $\rightarrow$ Lập tức kick người vi phạm.
2. **[2] Chống Spam (7 tin / 10s):** Nếu thành viên thường gửi từ 7 tin nhắn trở lên trong vòng 10 giây $\rightarrow$ Tự động xóa tin nhắn và kick khỏi nhóm.
3. **[3] Chống Link Web:** Tự động phát hiện các liên kết website (`http`, `https`, `www`, `.com`, `.vn`...) do thành viên thường gửi $\rightarrow$ Tự động xóa tin nhắn và kick khỏi nhóm.
4. **[4] Chống Link & QR Zalo:** Chặn gửi link nhóm Zalo khác (`zalo.me/...`) và quét ảnh mã QR Zalo bằng trí tuệ nhân tạo (AI) $\rightarrow$ Tự động xóa tin và kick khỏi nhóm.
5. **[5] Chống QR Ngân Hàng:** Tự động quét và nhận diện mã VietQR / QR Ngân Hàng trong ảnh do thành viên thường gửi $\rightarrow$ Tự động xóa tin và kick ngay lập tức để chống lừa đảo bill/fake stk.

> **Lưu ý quan trọng:**
> - Trưởng nhóm và các Phó nhóm Zalo được **MIỄN TRỪ TUYỆT ĐỐI**, không bị giới hạn bởi hệ thống Anti.
> - Tài khoản Bot cần được trao quyền **Phó nhóm hoặc Trưởng nhóm** để có quyền thu hồi tin nhắn và kick người vi phạm.

---

## 11. LỆNH KICK THÀNH VIÊN (.kick & .kickall)

### A. Lệnh Kick thành viên chỉ định (`.kick`)
- **Cú pháp:**
  - `.kick @tên` : Tag trực tiếp 1 hoặc nhiều người trong nhóm để kick.
  - Trượt tin nhắn (Quote reply) tin nhắn của người cần kick và gõ: `.kick`
  - `.kick <UID>` : Kick trực tiếp theo UID tài khoản Zalo.
- **Ví dụ:**
  - `.kick @Nguyễn Văn A`
  - `.kick @A @B @C` (kick nhiều người cùng lúc)
  - `.kick 36775776416498471`
- **🛡️ CƠ CHẾ BẢO VỆ AN TOÀN:**
  - Tuyệt đối **KHÔNG** kick Trưởng nhóm, Phó nhóm, tài khoản Bot, chính người gõ lệnh và Admin trong danh sách Whitelist.
  - Nếu đối tượng được tag là Quản trị viên, Bot sẽ cảnh báo và từ chối kick.
- **⚠️ Điều kiện:** Tài khoản Bot phải là **Trưởng nhóm** hoặc **Phó nhóm**.

### B. Lệnh Lọc toàn bộ thành viên thường (`.kickall`)
- **Cú pháp:** `.kickall` (hoặc `!kickall`, `.locnhom`, `.clearall`)
- **Chức năng:** Tự động quét và kick **toàn bộ thành viên thường** ra khỏi nhóm chat sau khi giải đấu kết thúc để làm sạch box cho giải sau.
- **Yêu cầu an toàn cao cấp:** Cần **2 Trưởng/Phó nhóm khác nhau** lần lượt gõ `.kickall` xác nhận trong vòng 2 phút để tránh lỡ tay làm sạch nhóm.
- **🛡️ CƠ CHẾ BẢO VỆ TUYỆT ĐỐI:**
  - **KHÔNG BAO GIỜ KICK:** Trưởng nhóm Zalo.
  - **KHÔNG BAO GIỜ KICK:** Tất cả các Phó nhóm Zalo.
  - **KHÔNG BAO GIỜ KICK:** Chính tài khoản Bot Zalo.
  - **KHÔNG BAO GIỜ KICK:** Người vừa gõ lệnh kick.
  - **KHÔNG BAO GIỜ KICK:** Các ID nằm trong `ADMIN_WHITELIST`.
- **⚠️ Điều kiện bắt buộc:** Tài khoản Zalo của Bot **phải là Trưởng nhóm hoặc được bổ nhiệm làm Phó nhóm** thì mới có quyền kick thành viên.

---

## 12. CÔNG CỤ CLI (TRA CỨU NHANH TRÊN TERMINAL)
Nếu bạn không muốn mở Zalo mà chỉ muốn kiểm tra nhanh điểm số trên máy tính, hãy dùng bộ công cụ CLI chạy trực tiếp trên PowerShell / CMD:

```bash
# 1. Kiểm tra kết nối Cookie Garena
npm run test-garena
# hoặc: node src/cli.js check

# 2. Xem điểm chi tiết 1 trận đấu
node src/cli.js diem 2096072125441953792

# 3. Tính tổng điểm nhiều trận đấu
node src/cli.js tongdiem 2096072125441953792 2096077702004002816

# 4. Tìm các trận đấu của một UID trong 15 ngày qua
node src/cli.js timtran 1043310641 15
```

---

---

## 13. HỆ THỐNG CHO THUÊ BOT & NẠP LƯỢT TỰ ĐỘNG (TPBANK / SEPAY)

Hệ thống cho phép bạn kinh doanh cho thuê Bot với cơ chế tính điểm theo **Key cá nhân** và **lượt dùng** (tỷ giá: **250đ / 1 lượt**).

### A. Cơ Chế Hoạt Động & Lợi Ích
1. **Dùng Key xuyên mọi nhóm Zalo**: Khách thuê sở hữu Key (ví dụ `tenkey`) có thể mang Bot vào bất kỳ nhóm Zalo nào để dùng lệnh `.td <UID> tenkey` mà không cần phải là Trưởng nhóm hay Phó nhóm.
2. **Nạp tiền quét mã tự động (VietQR TPBank)**:
   - Khách gõ: `.napluot tenkey 20k`
   - Bot tự gửi mã VietQR TPBank: app ngân hàng tự điền đúng STK (`10002610909`), tên (`LE DAI QUY`), số tiền và nội dung `NAP TENKEY`.
3. **Cổng Webhook SePay nhận tiền tự động**:
   - Tiền vừa vào TPBank ➔ SePay gửi webhook về Bot ➔ Bot tự cộng lượt (Ví dụ 20.000đ = +80 lượt) và thông báo vào Zalo sau 1 - 3 giây.
4. **Bảo vệ quyền lợi khách hàng (Không trừ lượt oan)**:
   - Nếu tìm không thấy trận đấu hoặc Garena lỗi, Bot tự động hoàn lại lượt cho Key!

### B. Danh Sách Lệnh Cho Khách Thuê
- `.key tao <tên_key>`: Tạo key cá nhân mới (Ví dụ: `.key tao ldp`).
- `.key edit <tên_key>` (hoặc `.key <tên_key>`): Mở Menu Cài Đặt Key tương tác.
  - **Trượt tin nhắn menu và trả lời số để cài đặt:**
    - `1` ➔ Bot hỏi nhập tên giải mới ➔ Nhập tên giải ➔ Bot cập nhật và thông báo thành công.
    - `2` ➔ Bot yêu cầu gửi ảnh ➔ Gửi ảnh hoặc GIF vào nhóm ➔ Bot tự lưu logo BXH và thông báo đã nhận.
    - `3` ➔ Xóa Logo BXH của Key.
    - `4` ➔ Nạp thêm lượt dùng (tự gửi mã QR VietQR TPBank).
- Cú pháp lệnh trực tiếp (nếu không muốn trượt tin nhắn):
  - `.key edit <tên_key> ten <Tên_Giải>`: Đổi tên giải CUSTOM (Ví dụ: `.key edit ldp ten ĐẠI CHIẾN QUÂN ĐOÀN`).
  - `.key edit <tên_key> logo`: Cài đặt logo BXH.
  - `.key edit <tên_key> xoalogo`: Xóa logo hiện tại.
- `.napluot <tên_key> [số_tiền]`: Lấy mã QR TPBank nạp lượt (250đ/lượt).
- `.td [id] [tenkey]`: Tính điểm bằng key (trừ 1 lượt).
  - Ví dụ: `.td 18154023211 ldp`
  - Chọn luôn ca: `.td 18154023211 8 ldp`
- `.td [id] [xoaN] [tenkey]`: Tính điểm và xóa bỏ trận lỗi số N (Ví dụ: `.td 18154023211 xoa1 ldp` bỏ qua trận 1, chỉ tính các trận còn lại).

- `.key tao <tên_key>`: Thành viên tự tạo key (Tự động tặng ngay **+5 lượt** dùng thử miễn phí).

### C. Quản Lý Key & Điều Khiển Lượt Dành Cho Admin (Bạn)
- Mọi thao tác quản trị key (Tạo key, **Cộng lượt**, **Trừ lượt**, **Đặt lại số lượt** hoặc **Xóa key**) được thực hiện trực quan và nhanh chóng tại **Web Dashboard Quản Trị**:
  👉 Truy cập: `http://<IP_VPS_CỦA_BẠN>:3000` (Mục **🔑 Quản Lý Key & Lượt**). Không cần gõ lệnh thủ công trong Zalo.
![alt text](image.png)
### D. Cấu Hình Webhook SePay (Khi đưa lên VPS)
- Trên tài khoản SePay (sepay.vn) ➔ Mục **Tích hợp Webhook** ➔ Thêm Webhook:
  - **URL:** `http://<IP_VPS_CỦA_BẠN>:3000/webhook/sepay`
  - **Sự kiện:** Tiền vào (Chuyển vào).

---

## 14. XỬ LÝ CÁC LỖI THƯỜNG GẶP (TROUBLESHOOTING)

### 1. Gõ lệnh nhưng Bot không phản hồi:
- **Kiểm tra phân quyền:** Bạn có phải là Trưởng nhóm hoặc Phó nhóm không? (Ngoại lệ: Các lệnh Key `.td <UID> <key>`, `.napluot`, `.luot` mở cho mọi thành viên có key ở mọi nhóm). Thử nhắn tin riêng 1-1 cho Bot để kiểm tra.
- **Kiểm tra Terminal:** Xem cửa sổ chạy Bot có báo lỗi hay mất kết nối mạng không.

### 2. Lỗi `❌ [GARENA NGOẠI TUYẾN]` hoặc không tìm thấy trận:
- Cookie Garena trong file `.env` đã hết hạn. Hãy làm theo [Mục 3](#3-hướng-dẫn-lấy-cookie-garena-khi-hết-hạn) để lấy Cookie mới dán vào `.env` rồi khởi động lại Bot.

### 3. Lỗi `zalo_session.json` bị mất hoặc muốn đăng nhập nick khác:
- Gõ lệnh `.dangxuat` trên Zalo hoặc xóa file `zalo_session.json` trong thư mục code.
- Chạy lại `npm start` để quét mã QR mới.

### 4. Lệnh `.kickall` báo thất bại:
- Kiểm tra trên ứng dụng Zalo xem tài khoản Bot đã được cài làm **Phó nhóm** chưa. Nếu Bot chỉ là thành viên thường thì Zalo không cho phép kick ai.

---

## 15. BẢNG ĐIỀU KHIỂN QUẢN TRỊ TỪ XA (REMOTE WEB DASHBOARD)

Hệ thống tích hợp sẵn Bảng Điều Khiển Web quản trị chuyên nghiệp giúp bạn quản lý Bot và VPS từ xa qua trình duyệt web trên Máy Tính hoặc Điện Thoại:

### A. Cách truy cập:
* **Chạy trên Máy tính:** Mở trình duyệt gõ `http://localhost:3000`
* **Chạy trên VPS:** Mở trình duyệt gõ `http://<IP_VPS_CỦA_BẠN>:3000`
* **Mật khẩu quản trị mặc định:** `admin123` (Đổi tại `DASHBOARD_PASSWORD` trong file `.env`).

### B. Các tính năng chính:
1. **Quản lý Cookie Garena:**
   * Xem trạng thái tài khoản Garena (Nick in-game, UID, Level, Hạn cookie).
   * Ô dán Cookie mới + Nút **"Lưu & Kích Hoạt"** ➔ Tự động lưu vào `.env` trên VPS và kích hoạt ngay mà không cần khởi động lại Bot.
   * Nút **"Xóa / Đăng Xuất Cookie"**.
2. **Quản lý Bot Zalo & Quét QR Từ Xa:**
   * Xem trạng thái tài khoản Bot Zalo (Đang hoạt động / Chờ quét QR).
   * **Hiển thị trực tiếp ảnh mã QR đăng nhập Zalo ngay trên màn hình web:** Dùng điện thoại quét mã QR trực tiếp từ xa mà không cần mở terminal VPS.
   * Nút **"Đăng xuất Zalo"** để tạo mã QR mới.
3. **Màn hình Terminal Logs thời gian thực (Live Console):**
   * Theo dõi ai vừa gõ lệnh, kết quả tính điểm giải đấu, cảnh báo Anti kick thành viên vi phạm, thông báo nạp tiền SePay theo thời gian thực.
   * Nút Bật/Tắt tự động cuộn (Auto-scroll), nút Xóa log.
4. **Quản lý Key & Lượt tính điểm:**
   * Bảng danh sách tất cả các Key, số lượt còn lại, ngày tạo.
   * Form tạo key mới / nạp thêm lượt cho khách hàng nhanh chóng.
   * Nút xóa key trực tiếp trên web.
5. **Điều khiển tiến trình VPS:**
   * Xem Uptime, dung lượng RAM, CPU đang sử dụng trên VPS.
   * Nút **"Khởi động lại Bot (Restart)"** bằng 1 click chuột.

### C. Lệnh đổi Cookie Garena trực tiếp qua Zalo (Dành riêng cho Admin):
* **Cú pháp:** `.setcookie <chuỗi_cookie>` (hoặc `.cookie <chuỗi_cookie>`)
* **Lưu ý bảo mật:** Lệnh này **chỉ được phép thực hiện khi bạn chat riêng 1-1 với Bot** (không nhận trong nhóm chat). Bot sẽ tự động lưu vào `.env` và kiểm tra kết nối ngay lập tức!

---

Chúc bạn tính điểm giải đấu Free Fire thật dễ dàng và kinh doanh cho thuê bot thành công! 🚀

