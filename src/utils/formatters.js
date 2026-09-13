/**
 * Bộ định dạng tin nhắn hiển thị đẹp mắt trên Zalo
 */

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Định dạng kết quả chi tiết 1 trận đấu
 */
export function formatMatchDetail(match) {
  if (!match) return '⚠️ Không có dữ liệu trận đấu.';

  const matchId = match.id || match.matchId || 'N/A';
  const startTime = match.startTime ? new Date(match.startTime * 1000).toLocaleString('vi-VN') : '';
  const ranks = match.ranks || match.teams || [];

  let text = `🏆 ═══ KẾT QUẢ TRẬN ĐẤU #${matchId} ═══ 🏆\n`;
  if (startTime) text += `⏰ Thời gian: ${startTime}\n`;
  text += `──────────────────────\n`;

  if (ranks.length === 0) {
    text += `(Chưa có danh sách xếp hạng chi tiết)\n`;
    return text;
  }

  // Sắp xếp theo rank tăng dần (Top 1 -> Top 12)
  const sorted = [...ranks].sort((a, b) => (a.rank || 0) - (b.rank || 0));

  sorted.forEach((team, index) => {
    const rank = team.rank || (index + 1);
    const medal = rank <= 3 ? MEDALS[rank - 1] : `[#${rank}]`;
    const name = (team.accountNames && team.accountNames.length > 0 && team.accountNames[0])
      ? team.accountNames[0]
      : (team.teamName || team.name || team.playerName || `Team ${rank}`);
    const kills = team.killCount ?? team.kills ?? team.kill ?? 0;
    const points = team.totalPoints ?? team.points ?? team.point ?? 0;
    const isBooyah = rank === 1 ? ' 👑 Booyah!' : '';

    text += `${medal} ${name}${isBooyah}\n`;
    text += `   └ Hạ gục: ${kills} kill | Điểm: ${points}đ\n`;
  });

  text += `──────────────────────\n`;
  text += `💡 Dùng !tongdiem <ID1> <ID2>... để cộng dồn các trận.`;

  return text;
}

/**
 * Định dạng bảng xếp hạng tổng điểm nhiều trận
 */
export function formatAggregatedScores(aggregatedRanks, matchIds = []) {
  if (!aggregatedRanks || aggregatedRanks.length === 0) {
    return '⚠️ Không có dữ liệu tính điểm cho các trận này.';
  }

  let text = `📊 ═══ BẢNG XẾP HẠNG TỔNG KẾT ═══ 📊\n`;
  if (matchIds.length > 0) {
    text += `🎮 Các trận đã tính (${matchIds.length}): ${matchIds.join(', ')}\n`;
  }
  text += `──────────────────────\n`;

  // Sắp xếp theo thứ hạng
  const sorted = [...aggregatedRanks].sort((a, b) => (a.rank || 0) - (b.rank || 0));

  sorted.forEach((team, index) => {
    const rank = team.rank || (index + 1);
    const medal = rank <= 3 ? MEDALS[rank - 1] : `[#${rank}]`;
    const name = team.teamName || team.name || `Đội ${rank}`;
    const booyah = team.booyahCount ?? team.booyah ?? 0;
    const kills = team.killCount ?? team.kills ?? team.kill ?? 0;
    const rankPoints = team.rankPoints ?? team.rankPoint ?? 0;
    const totalPoints = team.totalPoints ?? team.points ?? team.point ?? 0;

    text += `${medal} ${name}\n`;
    text += `   ├ Booyah: ${booyah} 👑 | Hạ gục: ${kills} kill\n`;
    text += `   └ Điểm hạng: ${rankPoints}đ | TỔNG ĐIỂM: ${totalPoints}đ\n`;
  });

  text += `──────────────────────\n`;
  text += `📌 Dữ liệu chính thức từ Garena Community`;

  return text;
}

/**
 * Định dạng danh sách trận đấu tìm được theo UID
 */
export function formatPlayerMatches(accountId, matches) {
  if (!matches || matches.length === 0) {
    return `ℹ️ Không tìm thấy trận đấu nào của UID [${accountId}] trong những ngày gần đây.`;
  }

  let text = `🔍 ═══ CÁC TRẬN ĐẤU CỦA UID [${accountId}] ═══ 🔍\n`;
  text += `Tìm thấy ${matches.length} trận đấu gần đây:\n\n`;

  const matchIds = [];
  matches.slice(0, 15).forEach((m, idx) => {
    const id = m.id || m.matchId;
    matchIds.push(id);
    const time = m.startTime ? new Date(m.startTime * 1000).toLocaleString('vi-VN') : '';
    text += `${idx + 1}. ID Trận: ${id} ${time ? `(${time})` : ''}\n`;
  });

  if (matches.length > 15) {
    text += `... và ${matches.length - 15} trận khác.\n`;
  }

  text += `\n──────────────────────\n`;
  text += `💡 Lệnh tính tổng điểm tất cả các trận trên:\n`;
  text += `!tongdiem ${matchIds.join(' ')}`;

  return text;
}

/**
 * Danh sách các khung giờ scrims / giải đấu phổ biến
 */
export const TIME_SLOTS = [
  { id: 1, label: '13h - 15h', start: [13, 0], end: [15, 0] },
  { id: 2, label: '15h - 17h', start: [15, 0], end: [17, 0] },
  { id: 3, label: '17h - 19h', start: [17, 0], end: [19, 0] },
  { id: 4, label: '20h - 21h30', start: [20, 0], end: [21, 30] },
  { id: 5, label: '21h40 - 23h', start: [21, 40], end: [23, 0] },
  { id: 6, label: '23h30 - 1h', start: [23, 30], end: [1, 0], nextDay: true },
  { id: 7, label: '1h - 3h', start: [1, 0], end: [3, 0] },
  { id: 8, label: '10h - 12h', start: [10, 0], end: [12, 0] }
];

const SLOT_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

/**
 * Phân tích chuỗi ngày nhập vào (hỗ trợ DD/MM, DD/MM/YYYY, DD-MM-YYYY, "hôm qua", "hôm nay")
 */
export function parseDateInput(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();

  // Lấy ngày hiện tại theo giờ VN (UTC+7)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const vnNow = new Date(utc + (7 * 3600000));

  if (s === 'hôm qua' || s === 'hom qua') {
    const d = new Date(vnNow);
    d.setDate(d.getDate() - 1);
    return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
  }
  if (s === 'hôm nay' || s === 'hom nay') {
    return { day: vnNow.getDate(), month: vnNow.getMonth() + 1, year: vnNow.getFullYear() };
  }

  // DD/MM/YYYY hoặc DD-MM-YYYY hoặc DD.MM.YYYY
  const matchFull = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (matchFull) {
    return {
      day: parseInt(matchFull[1], 10),
      month: parseInt(matchFull[2], 10),
      year: parseInt(matchFull[3], 10)
    };
  }

  // DD/MM hoặc DD-MM
  const matchShort = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})$/);
  if (matchShort) {
    return {
      day: parseInt(matchShort[1], 10),
      month: parseInt(matchShort[2], 10),
      year: vnNow.getFullYear()
    };
  }

  return null;
}

/**
 * Tính toán mốc thời gian Unix timestamp (UTC+7) cho khung giờ
 * @param {number|string} slotId Mã khung giờ (1-8)
 * @param {object|null} customDate Ngày tùy chỉnh { day, month, year }
 */
export function getSlotTimestamps(slotId, customDate = null) {
  const slot = TIME_SLOTS.find(s => s.id === Number(slotId));
  if (!slot) return null;

  let startYear, startMonth, startDate;

  if (customDate) {
    startYear = customDate.year;
    startMonth = customDate.month - 1;
    startDate = customDate.day;
  } else {
    // Lấy thời gian hiện tại theo múi giờ Việt Nam (UTC+7)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const vnNow = new Date(utc + (7 * 3600000));

    startYear = vnNow.getFullYear();
    startMonth = vnNow.getMonth();
    startDate = vnNow.getDate();

    // Nếu là slot qua đêm (ví dụ 23h30 - 1h) mà hiện tại đang là sáng sớm (< 12h trưa)
    // thì trận đó đã diễn ra từ tối hôm qua
    if (slot.nextDay && vnNow.getHours() < 12) {
      const yesterday = new Date(vnNow);
      yesterday.setDate(yesterday.getDate() - 1);
      startYear = yesterday.getFullYear();
      startMonth = yesterday.getMonth();
      startDate = yesterday.getDate();
    }
  }

  const startVn = new Date(Date.UTC(startYear, startMonth, startDate, slot.start[0] - 7, slot.start[1], 0));
  
  let endYear = startYear;
  let endMonth = startMonth;
  let endDate = startDate;
  if (slot.nextDay) {
    const nextD = new Date(startVn);
    nextD.setUTCDate(nextD.getUTCDate() + 1);
    endYear = nextD.getUTCFullYear();
    endMonth = nextD.getUTCMonth();
    endDate = nextD.getUTCDate();
  }
  
  const endVn = new Date(Date.UTC(endYear, endMonth, endDate, slot.end[0] - 7, slot.end[1], 0));

  let startTime = Math.floor(startVn.getTime() / 1000);
  let endTime = Math.floor(endVn.getTime() / 1000);

  // Nếu không chỉ định ngày và thời gian bắt đầu > hiện tại thì lùi 1 ngày
  if (!customDate) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (startTime > currentTimestamp) {
      startTime -= 86400;
      endTime -= 86400;
      startDate -= 1;
    }
  }

  const dateLabel = `${startDate.toString().padStart(2, '0')}/${(startMonth + 1).toString().padStart(2, '0')}/${startYear}`;

  return { slot, startTime, endTime, dateLabel };
}

/**
 * Định dạng menu chọn khung giờ giống mẫu
 */
export function formatSlotMenu(accountId, requesterName = '') {
  let text = `📋 CHỌN KHUNG GIỜ (UID: ${accountId}):\n\n`;
  TIME_SLOTS.forEach((slot, index) => {
    const emoji = SLOT_EMOJIS[index] || `[${slot.id}]`;
    text += `${emoji} ${slot.label}\n`;
  });

  text += `\n👉 Trả lời số từ 1-8 (hoặc trượt tin nhắn này qua để trả lời số khung giờ)\n`;
  if (requesterName) {
    text += `👤 Yêu cầu bởi: ${requesterName}`;
  }
  return text;
}

/**
 * Định dạng bảng xếp hạng tổng kết theo khung giờ
 */
export function formatSlotLeaderboard(slotLabel, dateLabel, accountId, matchIds, aggregatedTeamRanks) {
  if (!aggregatedTeamRanks || aggregatedTeamRanks.length === 0) {
    return `⚠️ Không có dữ liệu tính điểm trong khung giờ [${slotLabel}] ngày ${dateLabel || ''}.`;
  }

  let text = `📊 ═══ BẢNG XẾP HẠNG KHUNG GIỜ [${slotLabel}] ═══ 📊\n`;
  if (dateLabel) text += `📅 Ngày: ${dateLabel}\n`;
  text += `👤 UID: ${accountId}\n`;
  text += `🎮 Tổng số trận: ${matchIds.length} (ID: ${matchIds.join(', ')})\n`;
  text += `──────────────────────\n`;

  const sorted = [...aggregatedTeamRanks].sort((a, b) => (a.rank || 0) - (b.rank || 0));

  sorted.forEach((team, index) => {
    const rank = team.rank || (index + 1);
    const medal = rank <= 3 ? MEDALS[rank - 1] : `[#${rank}]`;
    const name = team.teamName || team.name || `Đội ${rank}`;
    const booyah = team.booyahCount ?? team.booyah ?? 0;
    const kills = team.killCount ?? team.kills ?? team.kill ?? 0;
    const rankPoints = team.rankPoints ?? team.rankPoint ?? 0;
    const totalPoints = team.totalPoints ?? team.points ?? team.point ?? 0;

    text += `${medal} ${name}\n`;
    text += `   ├ Booyah: ${booyah} 👑 | Hạ gục: ${kills} kill\n`;
    text += `   └ Điểm hạng: ${rankPoints}đ | TỔNG ĐIỂM: ${totalPoints}đ\n`;
  });

  text += `──────────────────────\n`;
  text += `📌 Dữ liệu chính thức từ Garena Community`;

  return text;
}

/**
 * Hướng dẫn sử dụng Bot
 */
export function formatHelp(prefix = '!') {
  return `📋 ════ MENU HƯỚNG DẪN LỆNH ════ 📋
----------bot tạo bởi Lê Đại Quý-----------

📊 1. TÍNH ĐIỂM & BẢNG XẾP HẠNG
🔹 .td <UID> [Khung] [Ngày]
   👉 Tính điểm theo ca (chọn 1-8)
   • Ví dụ: .td 511156251
   • Chọn luôn ca: .td 511156251 5
   💡 Mẹo: Trượt tin nhắn chứa UID để gõ .td

🔹 .bxh <ID1> <ID2>... (hoặc .tongdiem)
   👉 Tính tổng điểm các trận & xuất ảnh BXH

🔹 .diem <ID_Trận>
   👉 Xem chi tiết điểm của 1 trận

🔹 .timtran <UID> [số_ngày]
   👉 Tìm các trận gần đây của người chơi

───────────────────────
🎮 2. QUẢN LÝ PHÒNG & SLOT CUSTOM
🔹 .tên1, tên2...
   👉 Thêm nhanh tuyển thủ (vd: .hào, quý, phú)

🔹 .taocus [giờ] [giá] [bảng]
   👉 Tạo phòng/bảng mới (vd: .taocus 18h 6k A). Tự động đặt A1, A2... nếu trùng tên

🔹 .all (hoặc .xemslot)
   👉 Xem bảng danh sách slot các bảng

🔹 .xoa <số>        : Hủy người ở slot (vd: .xoa 3)
🔹 .phi <số>        : Đánh dấu đã đóng phí 💸
🔹 .hen <số>        : Đánh dấu hẹn phí ⏰
🔹 .xoabang <tên|all>: Xóa 1 bảng (.xoabang B) hoặc xóa TẤT CẢ các bảng cũ (.xoabang all)
🔹 .chon <bảng>     : Đổi sang quản lý Bảng A/B/C

───────────────────────
💳 3. THANH TOÁN & QUÉT BILL
🔹 Nhắn "xin qr", "xin mã", "mã", "stk", "xin stk"... (hoặc .qr / .stk)
   👉 Nhận ảnh VietQR & thông tin chuyển khoản nhóm
🔹 .autobill [on/off] (hoặc .batbill / .tatbill)
   👉 Bật / Tắt chế độ tự động duyệt bill (Mặc định: TẮT ⛔)
   👉 Khi tắt: Admin kiểm tra app ngân hàng rồi trượt tin nhắn ảnh bill gõ: @Tên [Bảng] để duyệt tay
   👉 Khi bật: Bot tự đọc bill (OCR), chống fake bill và xếp slot ngay lập tức
🔹 .doiqr (hoặc .setqr)
   👉 Đổi mã QR riêng cho nhóm (gửi ảnh kèm .doiqr hoặc trượt ảnh gõ .doiqr)
🔹 .setstk <STK> [NgânHàng]
   👉 Đổi số tài khoản & ngân hàng nhóm (vd: .setstk 0987654321 MBBank)
🔹 .ctk <Tên_CTK>
   👉 Đổi tên Chủ tài khoản nhận tiền (vd: .ctk NGUYEN VAN A)
🔹 .xoaqr
   👉 Xóa QR riêng, quay về mã QR TPBank mặc định

───────────────────────
🎨 4. ĐỔI MẪU ẢNH BẢNG XẾP HẠNG
🔹 .xemmau           : Gửi link Google Sheet xem toàn bộ ảnh phôi
🔹 .xemmau [số_mẫu]  : Xuất ảnh mẫu ra chat (vd: .xemmau 6)
🔹 .mau [số_mẫu]     : Đổi mẫu BXH cho riêng nhóm (vd: .mau 6)

───────────────────────
⚙️ 5. QUẢN TRỊ & TIỆN ÍCH
🔹 .batbot / .tatbot : Bật hoặc Tắt hoạt động của Bot trong nhóm (Mặc định: TẮT 🔴)
   👉 Cần gõ .batbot để kích hoạt Bot phục vụ cho nhóm
🔹 .batan / .tatan   : Bật hoặc Tắt tự động ẩn/xóa tin nhắn lệnh của Admin (Mặc định: BẬT 🙈)
   👉 Khi bật, Bot sẽ xóa ngay tin nhắn lệnh để làm sạch khung chat
🔹 .kickall          : Lọc thành viên chuẩn bị giải mới
🔹 .check            : Kiểm tra kết nối Cookie Garena

═══════════════════════
----------bot tạo bởi Lê Đại Quý-----------
💡 Mọi thắc mắc vui lòng liên hệ Admin!`;
}

