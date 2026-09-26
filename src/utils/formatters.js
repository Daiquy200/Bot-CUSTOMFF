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

  let text = `🤖 PQ BOT 🤖 - TRẬN #${matchId}\n`;
  if (startTime) text += `⏰ ${startTime}\n`;
  text += `──────────────────────\n`;

  if (ranks.length === 0) {
    text += `(Chưa có danh sách xếp hạng chi tiết)\n`;
    return text;
  }

  const sorted = [...ranks].sort((a, b) => (a.rank || 0) - (b.rank || 0));

  sorted.forEach((team, index) => {
    const rank = team.rank || (index + 1);
    const medal = rank <= 3 ? MEDALS[rank - 1] : `[#${rank}]`;
    const name = (team.accountNames && team.accountNames.length > 0 && team.accountNames[0])
      ? team.accountNames[0]
      : (team.teamName || team.name || team.playerName || `Team ${rank}`);
    const kills = team.killCount ?? team.kills ?? team.kill ?? 0;
    const points = team.totalPoints ?? team.points ?? team.point ?? 0;
    const isBooyah = rank === 1 ? ' 👑' : '';

    text += `${medal} ${name}${isBooyah} • ${kills}k • ${points}đ\n`;
  });

  text += `──────────────────────\n`;
  text += `💡 Lệnh gộp điểm: .bxh <ID1> <ID2>...`;

  return text;
}

/**
 * Định dạng bảng xếp hạng tổng điểm nhiều trận
 */
export function formatAggregatedScores(aggregatedRanks, matchIds = []) {
  if (!aggregatedRanks || aggregatedRanks.length === 0) {
    return '⚠️ Không có dữ liệu tính điểm cho các trận này.';
  }

  let text = `🤖 PQ BOT 🤖 - BẢNG XẾP HẠNG TỔNG KẾT\n`;
  if (matchIds.length > 0) {
    text += `🎮 Trận (${matchIds.length}): ${matchIds.join(', ')}\n`;
  }
  text += `──────────────────────\n`;

  const sorted = [...aggregatedRanks].sort((a, b) => (a.rank || 0) - (b.rank || 0));

  sorted.forEach((team, index) => {
    const rank = team.rank || (index + 1);
    const medal = rank <= 3 ? MEDALS[rank - 1] : `[#${rank}]`;
    const name = team.teamName || team.name || `Đội ${rank}`;
    const booyah = team.booyahCount ?? team.booyah ?? 0;
    const kills = team.killCount ?? team.kills ?? team.kill ?? 0;
    const totalPoints = team.totalPoints ?? team.points ?? team.point ?? 0;

    text += `${medal} ${name}${booyah > 0 ? ` (${booyah}👑)` : ''} • ${kills}k • ${totalPoints}đ\n`;
  });

  text += `──────────────────────\n`;
  text += `📌 Dữ liệu chính thức Garena`;

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

export function formatSlotMenu(accountId, requesterName = '') {
  let text = `📋 CHỌN KHUNG GIỜ (UID: ${accountId}):\n\n`;
  text += `1️⃣ 13h - 15h\n`;
  text += `2️⃣ 15h - 17h\n`;
  text += `3️⃣ 17h - 19h\n`;
  text += `4️⃣ 20h - 21h30\n`;
  text += `5️⃣ 21h40 - 23h\n`;
  text += `6️⃣ 23h30 - 1h\n`;
  text += `7️⃣ 1h - 3h\n`;
  text += `8️⃣ 10h - 12h\n\n`;
  text += `👉 Hãy trượt tin nhắn này qua và trả lời số từ 1 đến 8\n`;
  text += `💡 Mẹo bỏ trận lỗi: Trả lời kèm "xoaN" (ví dụ: "8 xoa1" để bỏ trận 1)\n`;
  if (requesterName) {
    text += `👤 Yêu cầu bởi: ${requesterName}`;
  }
  return text.trim();
}

/**
 * Định dạng bảng xếp hạng tổng kết theo khung giờ
 */
export function formatSlotLeaderboard(slotLabel, dateLabel, accountId, matchIds, aggregatedTeamRanks) {
  if (!aggregatedTeamRanks || aggregatedTeamRanks.length === 0) {
    return `⚠️ Không có dữ liệu tính điểm trong khung giờ [${slotLabel}] ngày ${dateLabel || ''}.`;
  }

  let text = `🤖 PQ BOT 🤖 - BẢNG XẾP HẠNG [${slotLabel}]\n`;
  if (dateLabel) text += `📅 ${dateLabel} | UID: ${accountId}\n`;
  text += `🎮 Trận (${matchIds.length}): ${matchIds.join(', ')}\n`;
  text += `──────────────────────\n`;

  const sorted = [...aggregatedTeamRanks].sort((a, b) => (a.rank || 0) - (b.rank || 0));

  sorted.forEach((team, index) => {
    const rank = team.rank || (index + 1);
    const medal = rank <= 3 ? MEDALS[rank - 1] : `[#${rank}]`;
    const name = team.teamName || team.name || `Đội ${rank}`;
    const booyah = team.booyahCount ?? team.booyah ?? 0;
    const kills = team.killCount ?? team.kills ?? team.kill ?? 0;
    const totalPoints = team.totalPoints ?? team.points ?? team.point ?? 0;

    text += `${medal} ${name}${booyah > 0 ? ` (${booyah}👑)` : ''} • ${kills}k • ${totalPoints}đ\n`;
  });

  text += `──────────────────────\n`;
  text += `📌 Dữ liệu chính thức Garena`;

  return text;
}

/**
 * Hướng dẫn sử dụng Bot gọn gàng, súc tích
 */
export function formatHelp(prefix = '!') {
  return `🤖 PQ BOT 🤖 - MENU HƯỚNG DẪN
━━━━━━━━━━━━━━━━━━━━━━
📊 1. TÍNH ĐIỂM & BXH
🔹 .td <UID> [ca] [key] : Tính điểm theo ca (1-8)
   • Bỏ trận: .td <UID> [ca] xoa1 [key]
🔹 .bxh <ID1> <ID2>... [key] : BXH từ ID các trận (trận bắt đầu sớm)

🎫 2. KEY CÁ NHÂN & THUÊ BOT
🔹 .key tao <tên_key> : Tạo key mới (Tặng 5 lượt)
🔹 .napluot <tên_key> [tiền] : Nạp lượt QR (250đ/lượt)
🔹 .key <tên_key> : Xem số dư lượt
🔹 .key edit <tên_key> : Đổi tên giải & logo BXH

💳 3. QR & STK NHÓM (Admin)
🔹 .setstk <STK> <NgânHàng> [CTK] | .doiqr (gửi kèm ảnh)
🔹 .ctk <Tên> | .xoaqr
💡 Thành viên gõ "qr", "stk", "mã" để lấy thông tin

⚙️ 4. QUẢN TRỊ (Admin)
🔹 .kickall : Lọc thành viên (Cần 2 Admin xác nhận)
🔹 .anti : Bật/tắt bảo vệ chống cướp box, spam, link
🔹 .check : Kiểm tra kết nối Cookie Garena
━━━━━━━━━━━━━━━━━━━━━━
🤖 PQ BOT 🤖 • Chúc các bạn leo top vui vẻ!`;
}

/**
 * Menu cấu hình hệ thống Anti Bảo Vệ Nhóm gọn gàng
 */
export function formatAntiMenu(anti = {}) {
  const status = (enabled) => (enabled ? '🟢 BẬT' : '⛔ TẮT');
  return `🤖 PQ BOT 🤖 - BẢO VỆ NHÓM (ANTI)
[1] Cướp Box: ${status(anti.control)} | [2] Spam: ${status(anti.spam)}
[3] Link Web: ${status(anti.link)} | [4] Link/QR Zalo: ${status(anti.zalo)}
[5] QR Ngân Hàng: ${status(anti.bankQr)}
─────────────────────────
[6] 🟢 Bật TẤT CẢ | [7] ⛔ Tắt TẤT CẢ
👉 Trượt tin nhắn gõ SỐ (vd: 1 2 4) để Bật/Tắt.`;
}

