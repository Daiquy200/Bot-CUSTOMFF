# 📖 HƯỚNG DẪN SỬ DỤNG BOT ZALO TÍNH ĐIỂM FREE FIRE & QUẢN LÝ CUSTOM

Hệ thống tự động hóa quản lý phòng Custom (12 slot, đa bảng), kết nối trực tiếp hệ thống Garena Community (`congdong.ff.garena.vn/tinh-diem`) để tra cứu trận đấu, tính điểm tự động và xuất ảnh Bảng Xếp Hạng cực đẹp gửi thẳng vào nhóm Zalo.

---

## 📌 MỤC LỤC
1. [Yêu cầu hệ thống & Chuẩn bị](#1-yêu-cầu-hệ-thống--chuẩn-bị)
2. [Cài đặt & Cấu hình lần đầu (.env)](#2-cài-đặt--cấu-hình-lần-đầu-env)
3. [Hướng dẫn lấy Cookie Garena khi hết hạn](#3-hướng-dẫn-lấy-cookie-garena-khi-hết-hạn)
4. [Cách khởi chạy Bot & Đăng nhập Zalo](#4-cách-khởi-chạy-bot--đăng-nhập-zalo)
5. [Cơ chế phân quyền Admin trong nhóm Zalo](#5-cơ-chế-phân-quyền-admin-trong-nhóm-zalo)
6. [Danh sách lệnh quản lý Slot Custom](#6-danh-sách-lệnh-quản-lý-slot-custom)
7. [Danh sách lệnh tra cứu & Tính điểm Garena (Xuất ảnh BXH)](#7-danh-sách-lệnh-tra-cứu--tính-điểm-garena-xuất-ảnh-bxh)
8. [Chọn & Xem trước mẫu phôi Bảng Xếp Hạng](#8-chọn--xem-trước-mẫu-phôi-bảng-xếp-hạng)
9. [Lệnh lọc thành viên nhóm (KickAll)](#9-lệnh-lọc-thành-viên-nhóm-kickall)
10. [Công cụ CLI (Tra cứu nhanh trên Terminal)](#10-công-cụ-cli-tra-cứu-nhanh-trên-terminal)
11. [Xử lý các lỗi thường gặp (Troubleshooting)](#11-xử-lý-các-lỗi-thường-gặp-troubleshooting)

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

## 5. CƠ CHẾ PHÂN QUYỀN ADMIN TRONG NHÓM ZALO
Để tránh việc thành viên thường trong nhóm spam hoặc phá bảng custom:
- Mặc định Bot được bật chế độ **ADMIN ONLY**: Chỉ **Trưởng nhóm**, **Phó nhóm** và **chính tài khoản Bot** mới có quyền gõ các lệnh quản trị, tính điểm, kickall.
- Khi thêm Bot vào nhóm, hãy **thăng quyền Phó nhóm** cho tài khoản Bot để Bot có thể thực hiện lệnh `.kickall`.

---

## 6. DANH SÁCH LỆNH QUẢN LÝ SLOT CUSTOM
Hệ thống hỗ trợ quản lý 12 slot, hỗ trợ nhiều bảng đấu (Bảng A, B, C...) và hiển thị cơ cấu giải thưởng chuẩn (3k, 5k, 6k).
Tiền tố hỗ trợ dấu chấm (`.`), chấm than (`!`) hoặc xuyệt (`/`).

### A. Thêm tuyển thủ vào Slot
| Cú pháp | Giải thích & Ví dụ |
| :--- | :--- |
| `.tên1, tên2...` | **Thêm nhanh nhiều tuyển thủ** vào các slot trống kế tiếp của bảng hiện tại.<br>*Ví dụ:* `.Văn Thịnh 1, Văn Thịnh 2, Bi` hoặc `.quy, phu` |
| `.b tên1, tên2...` | **Thêm trực tiếp vào Bảng B** (hoặc `.a`, `.c`, `.b1`...).<br>*Ví dụ:* `.b Văn Thịnh, An Quốc` |
| Trượt bill `@Tên [giờ/bảng]` | **Duyệt bill thủ công**: Admin trượt tin nhắn bill và tag `@Tên <giờ>` hoặc `@Tên <bảng>` (vd: `@Võ Tài 14h`, `@Võ Tài B`, `@Võ Tài 14h B`).<br>*Lưu ý:* Bắt buộc phải có giờ hoặc bảng thì bot mới xếp slot, nếu chỉ trượt tin nhắn để chat nói chuyện bình thường (vd: `@Võ Tài ok em`) thì bot sẽ bỏ qua, không tự ý xếp slot. |

### B. Quản lý trạng thái & Xóa Slot
| Cú pháp | Giải thích & Ví dụ |
| :--- | :--- |
| `.xoa <số_slot>` | **Xóa tuyển thủ** khỏi slot (hỗ trợ xóa nhiều slot cùng lúc).<br>*Ví dụ:* `.xoa 3` hoặc `.xoa 3 5 8` |
| `.phi <số_slot>` | **Đánh dấu đã nộp phí** (icon 💸).<br>*Ví dụ:* `.phi 8` hoặc `.phi 1 2 3` |
| `.hen <số_slot>` | **Đánh dấu hẹn phí** (icon ⏰).<br>*Ví dụ:* `.hen 8` hoặc `.hen 4 6` |
| `.xoabang all` | **Xóa sạch tất cả bảng cũ** để chuẩn bị mở ca mới. |

### C. Cấu hình thông tin phòng Custom
| Cú pháp | Giải thích & Ví dụ |
| :--- | :--- |
| `.taocus [giờ] [giá] [bảng]` | **Tạo bảng mới** với thông số tùy ý.<br>*Ví dụ:* `.taocus 18h 6k A`<br>*(Lưu ý: Tên bảng không bị trùng, nếu đã có Bảng A thì bot sẽ tự động đặt là `Bảng A1`, `Bảng A2`, `Bảng B1`...)* |
| `.ctk <tên>` | Đổi tên Chủ Tài Khoản nhận tiền + ghi chú bill.<br>*Ví dụ:* `.ctk LE DAI QUY` |
| `.box <tên>` | Đổi tiêu đề Box Custom.<br>*Ví dụ:* `.box BOX CUSTOM ĐQ VIP` |
| `.link <url>` | Gắn link nhóm IDMK ở cuối bảng.<br>*Ví dụ:* `.link https://zalo.me/g/abcxyz` (gõ `.link xoa` để bỏ link) |

### D. Xem danh sách Slot
| Cú pháp | Giải thích & Ví dụ |
| :--- | :--- |
| `.xemslot` / `.cus` / `.ds` | Hiển thị bảng 12 slot của bảng hiện tại. |
| `.xemslot B` | Xem riêng danh sách của Bảng B. |
| `.all` hoặc `.dsall` | **Xem gộp tất cả các bảng** đang hoạt động (Bảng A, B, C...) trong cùng 1 tin nhắn. |
| `.chon <bảng>` | Chuyển quyền quản lý sang bảng khác.<br>*Ví dụ:* `.chon B` |
| `.xoabang <bảng>` | Xóa hẳn một bảng không dùng nữa.<br>*Ví dụ:* `.xoabang B` |
| `.xoabang <giờ>` | Xóa toàn bộ các bảng thuộc một ca thi đấu.<br>*Ví dụ:* `.xoabang 14h` hoặc `.xoabang 19h` |
| `.xoabang all` / `.xoatatcabang` | **Xóa sạch TẤT CẢ các bảng cũ** khi hết ca thi đấu để tạo lại từ đầu.<br>*Ví dụ:* `.xoabang all` |

---

## 7. DANH SÁCH LỆNH TRA CỨU & TÍNH ĐIỂM GARENA (XUẤT ẢNH BXH)

### A. Lệnh Tính Điểm Theo Khung Giờ (`.td`) - Tính Năng Đỉnh Cao 🌟
Hệ thống chia sẵn 8 khung giờ chuẩn của các giải Custom Free Fire:
1. **Khung 1:** 13h - 15h
2. **Khung 2:** 15h - 17h
3. **Khung 3:** 17h - 19h
4. **Khung 4:** 20h - 21h30
5. **Khung 5:** 21h40 - 23h
6. **Khung 6:** 23h30 - 1h (qua đêm)
7. **Khung 7:** 1h - 3h (sáng sớm)
8. **Khung 8:** 10h - 12h

#### Cách sử dụng:
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

### B. Các lệnh tra cứu khác
| Lệnh | Cú pháp | Ví dụ & Mô tả |
| :--- | :--- | :--- |
| `!diem` | `!diem <ID_Trận>` | Xem chi tiết kết quả (Top 1-12, kills, điểm) của 1 trận đấu.<br>*Ví dụ:* `!diem 2096072125441953792` |
| `!tongdiem` / `.bxh` | `!tongdiem <ID1> <ID2>...` | Tính tổng điểm nhiều trận chỉ định và xuất ảnh BXH.<br>*Ví dụ:* `!tongdiem 123456 123457 123458` |
| `!timtran` | `!timtran <UID> [số_ngày]` | Tìm danh sách các ID trận đấu gần nhất của một người chơi.<br>*Ví dụ:* `!timtran 1043310641 7` |
| `!check` | `!check` | Kiểm tra kết nối tài khoản Garena xem Cookie còn sống hay đã hết hạn. |
| `!help` | `!help` / `.help` | Hiển thị menu tóm tắt nhanh các lệnh ngay trong Zalo. |

---

## 8. CHỌN & XEM TRƯỚC MẪU PHÔI BẢNG XẾP HẠNG
Bot tích hợp sẵn nhiều mẫu phôi đồ họa đẹp mắt:
- **Mẫu #1:** Cus ĐQ@ (Dọc 12 hàng dọc - phong cách Cus Cỏ).
- **Mẫu #2:** Cus ĐQ@ (Ngang 2 cột - Top 1-6 bên trái, Top 7-12 bên phải).
- **Mẫu #3:** Map Thi Đấu (Ngang kèm bảng danh sách 4 Map: Đảo Quân Sự, Thiên Đường, Sa Mạc, Bình Minh).
- **Mẫu #4:** Banner Vàng Đen Chiến Binh (Dọc 12 hàng phong cách Esport).
- **Mẫu #5:** Banner Xanh Lam Chiến Binh (Dọc 12 hàng).
- **Mẫu #6:** Naruto Booyah (Dọc 12 hàng phong cách Naruto anime cam/đen/vàng).
- **Mẫu #7:** Naruto Phú Quý (Dọc 12 hàng phong cách Naruto kèm ô đồng hồ ngày giờ tự động).
- **Mẫu #8:** Custom PQ (Dọc 12 hàng + 4 Map Thi Đấu bên dưới: Đảo Quân Sự, Đảo Sa Mạc, Đảo Thiên Đường, Đảo Bình Minh).

### Các lệnh điều khiển mẫu:
- `.mau`: Xem danh sách tất cả các mẫu phôi và link xem ảnh mẫu.
- `.mau #4` (hoặc `.mau 4`): Đổi mẫu BXH sang Mẫu số 4 cho riêng nhóm này (mỗi nhóm lưu mẫu độc lập, không làm ảnh hưởng các nhóm khác khi cho thuê bot).
- `.xemmau` (hoặc `.xemmau all`): Bot gửi link Google Sheet chứa toàn bộ ảnh phôi gốc (không gửi ảnh trực tiếp để tránh spam nhóm).
- `.xemmau <số_mẫu>` (ví dụ: `.xemmau 1`, `.xemmau 2`, `.xemmau 6`): Bot gửi ảnh xem trước của riêng Mẫu đó vào chat.

---

## 9. LỆNH LỌC THÀNH VIÊN NHÓM (KICKALL)

### Cú pháp:
```text
.kickall
# hoặc: !kickall, .locnhom, .clearall
```

### Chức năng:
- Tự động quét và kick **toàn bộ thành viên thường** ra khỏi nhóm chat sau khi giải đấu kết thúc để làm sạch box cho giải sau.
- **🛡️ CƠ CHẾ BẢO VỆ TUYỆT ĐỐI:**
  - **KHÔNG BAO GIỜ KICK:** Trưởng nhóm Zalo.
  - **KHÔNG BAO GIỜ KICK:** Tất cả các Phó nhóm Zalo.
  - **KHÔNG BAO GIỜ KICK:** Chính tài khoản Bot Zalo.
  - **KHÔNG BAO GIỜ KICK:** Người vừa gõ lệnh kick.
  - **KHÔNG BAO GIỜ KICK:** Các ID nằm trong `ADMIN_WHITELIST`.
- **⚠️ Điều kiện bắt buộc:** Tài khoản Zalo của Bot **phải là Trưởng nhóm hoặc được bổ nhiệm làm Phó nhóm** thì mới có quyền kick thành viên.

---

## 10. TỰ ĐỘNG GỬI MÃ QR NGÂN HÀNG & QUÉT BILL XẾP SLOT TỰ ĐỘNG

Tính năng tự động hóa 100% quy trình thanh toán và nhận slot thi đấu:

### A. Tự động gửi mã QR ngân hàng:
- Thành viên chỉ cần nhắn trong nhóm bất kỳ từ khóa nào như: `xin qr`, `mã qr`, `cho xin qr`, `stk`, `chuyển khoản`, `.qr`, `.stk`, `.bank`...
- Bot sẽ tự động gửi ảnh **VietQR** riêng của nhóm (hoặc mặc định TPBank `1000 2610 909` - `LE DAI QUY`) kèm thông tin mức phí và hướng dẫn gửi bill.
- **Ai cũng dùng được:** Lệnh xem QR mở công khai cho tất cả thành viên thường trong nhóm.

### B. Dành cho người thuê Bot / Admin đổi mã QR & Thông tin ngân hàng:
Mỗi nhóm chat Zalo có thể cấu hình tài khoản ngân hàng và mã QR riêng biệt:
1. **Đổi mã QR nhóm (`.doiqr` hoặc `.setqr`)**:
   - **Cách 1 (Khuyên dùng)**: Gửi ảnh mã QR vào nhóm, ở phần chú thích (caption) gõ `.doiqr`.
   - **Cách 2**: Trượt tin nhắn (quote reply) vào ảnh mã QR có sẵn trong nhóm rồi gõ `.doiqr`.
   - **Cách 3**: `.doiqr <link_ảnh>` nếu có link ảnh trực tiếp.
   - *Khi lưu thành công, toàn bộ thành viên gõ `.qr` hoặc nhắn "xin qr" sẽ nhận ảnh mã QR này.*
2. **Đổi số tài khoản & Ngân hàng (`.setstk`)**:
   - Cú pháp: `.setstk <Số_TK> <Tên_Ngân_Hàng>`
   - Ví dụ: `.setstk 0987654321 MBBank` hoặc `.setstk 1903678910 Techcombank`
3. **Đổi tên Chủ tài khoản nhận tiền (`.ctk`)**:
   - Cú pháp: `.ctk <Tên_Chủ_Tài_Khoản>`
   - Ví dụ: `.ctk NGUYEN VAN A`
   - *Lưu ý: Bot sẽ dùng tên này để kiểm tra bill OCR khi người chơi gửi biên lai.*
4. **Xóa QR riêng, quay về mặc định (`.xoaqr` hoặc `.resetqr`)**:
   - Gõ `.xoaqr` để hủy mã QR riêng và quay về sử dụng mã QR mặc định của hệ thống.

### C. Tự động quét ảnh Bill & Xếp Slot (Smart Priority):
Người chơi sau khi chuyển khoản chỉ cần **chụp ảnh Bill chuyển khoản gửi vào nhóm** (có thể đính kèm tin nhắn hoặc gửi trơ trọi mỗi ảnh):

1. **Bot tự động đọc biên lai (OCR)**:
   - Nhận diện đúng tên người nhận theo cấu hình riêng của nhóm (hoặc mặc định `LE DAI QUY` / `1000 2610 909`).
   - Trích xuất số tiền chuyển và mã giao dịch.
   - Chống gian lận: Tự động ghi nhớ mã giao dịch, từ chối nếu có người gửi lại bill cũ.

2. **Cơ chế phân luồng thông minh (Smart Priority)**:
   - **Ghi cả giờ & bảng (vd: `22h B`)**: Xếp thẳng vào Bảng B ca 22h.
   - **Chỉ ghi giờ (vd: `22h`)**: Xếp vào ca 22h (Bảng A còn chỗ thì vào A, A đầy tự động tràn sang B).
   - **Chỉ ghi tên bảng (vd: `B` hoặc `Bảng B`)**: Xếp vào Bảng B của ca giờ sắp diễn ra gần nhất.
   - **Không ghi gì (chỉ quăng mỗi ảnh bill)**: Tự động xếp vào bảng gần nhất còn slot của ca sắp diễn ra.

3. **Tự động điền tên Zalo & Trả kết quả**:
   - Bot lấy tên hiển thị Zalo của người gửi bill điền vào slot trống đầu tiên và gắn icon `✅` (Đã đóng phí).
   - Xuất danh sách slot mới nhất ra nhóm kèm lời chúc mừng và tag tên người chơi.
   - Nếu phòng đã hết sạch slot: Thông báo phòng đã FULL để admin hỗ trợ.

4. **Xử lý khi người chơi QUÊN GHI NỘI DUNG CHUYỂN KHOẢN**:
   - Khi người chơi chuyển khoản mà quên ghi nội dung (giờ/bảng) và gửi bill vào nhóm, Bot sẽ tự động xếp vào ca gần nhất, đồng thời nhắc nhở kèm lời khuyên:
     *`💡 MẸO: Nếu bạn chuyển khoản quên ghi nội dung hoặc muốn đổi ca/bảng, hãy TRƯỢT TIN NHẮN BILL (hoặc trượt tin nhắn này) rồi nhắn [Giờ + Bảng] (Ví dụ: 22h B hoặc 23h), Bot sẽ tự động chuyển slot cho bạn! 🔄`*
   - Người chơi chỉ cần **trượt tin nhắn ảnh bill hoặc tin nhắn của Bot** rồi nhắn nội dung (ví dụ: `22h B`, `23h`, `bảng B`), Bot sẽ **tự động chuyển người chơi sang đúng ca và bảng mới**, đồng thời làm trống slot cũ ở bảng trước đó!

---

## 11. CÔNG CỤ CLI (TRA CỨU NHANH TRÊN TERMINAL)
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

## 12. XỬ LÝ CÁC LỖI THƯỜNG GẶP (TROUBLESHOOTING)

### 1. Gõ lệnh nhưng Bot không phản hồi:
- **Kiểm tra phân quyền:** Bạn có phải là Trưởng nhóm hoặc Phó nhóm không? (Mặc định Bot chỉ phản hồi Trưởng/Phó nhóm, ngoại lệ: `.dk`, `.qr`, `.stk`, gửi bill). Thử nhắn tin riêng 1-1 cho Bot để kiểm tra.
- **Kiểm tra Terminal:** Xem cửa sổ chạy Bot có báo lỗi hay mất kết nối mạng không.

### 2. Lỗi `❌ [GARENA NGOẠI TUYẾN]` hoặc không tìm thấy trận:
- Cookie Garena trong file `.env` đã hết hạn. Hãy làm theo [Mục 3](#3-hướng-dẫn-lấy-cookie-garena-khi-hết-hạn) để lấy Cookie mới dán vào `.env` rồi khởi động lại Bot.

### 3. Lỗi `zalo_session.json` bị mất hoặc muốn đăng nhập nick khác:
- Gõ lệnh `.dangxuat` trên Zalo hoặc xóa file `zalo_session.json` trong thư mục code.
- Chạy lại `npm start` để quét mã QR mới.

### 4. Lệnh `.kickall` báo thất bại:
- Kiểm tra trên ứng dụng Zalo xem tài khoản Bot đã được cài làm **Phó nhóm** chưa. Nếu Bot chỉ là thành viên thường thì Zalo không cho phép kick ai.

---

Chúc bạn quản lý giải đấu và tính điểm Free Fire thật dễ dàng và chuyên nghiệp! 🚀
