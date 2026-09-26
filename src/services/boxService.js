import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const BOXES_FILE = path.join(DATA_DIR, 'allowed_boxes.json');

class BoxService {
  constructor() {
    this.boxes = new Map();
    this.lastNotifiedDate = '';
    this.loadBoxes();
  }

  ensureDataDir() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (e) {
      console.error('Lỗi tạo thư mục data cho boxService:', e);
    }
  }

  loadBoxes() {
    try {
      this.ensureDataDir();
      if (fs.existsSync(BOXES_FILE)) {
        const raw = fs.readFileSync(BOXES_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [id, data] of Object.entries(parsed)) {
            if (data && typeof data === 'object') {
              this.boxes.set(String(id), {
                groupId: String(id),
                name: data.name || `Box ${id}`,
                enabled: data.enabled !== false,
                daysTotal: Number(data.daysTotal || 30),
                expiryDate: data.expiryDate || new Date(Date.now() + 30 * 86400000).toISOString(),
                createdAt: data.createdAt || new Date().toISOString(),
                note: data.note || ''
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Lỗi khi đọc file allowed_boxes.json:', err.message);
    }
  }

  saveBoxes() {
    try {
      this.ensureDataDir();
      const obj = {};
      for (const [id, box] of this.boxes.entries()) {
        obj[id] = box;
      }
      fs.writeFileSync(BOXES_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.error('Lỗi khi lưu allowed_boxes.json:', err.message);
    }
  }

  /**
   * Tính số ngày còn lại của Box
   */
  getRemainingDays(box) {
    if (!box || !box.expiryDate) return 0;
    const now = Date.now();
    const expiry = new Date(box.expiryDate).getTime();
    const diffMs = expiry - now;
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Định dạng ngày hết hạn DD/MM/YYYY
   */
  formatDate(dateInput) {
    try {
      const d = new Date(dateInput);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return 'N/A';
    }
  }

  /**
   * Lấy toàn bộ danh sách box kèm thông tin hạn sử dụng
   */
  getAllBoxes() {
    const list = [];
    for (const box of this.boxes.values()) {
      const remainingDays = this.getRemainingDays(box);
      list.push({
        ...box,
        remainingDays,
        isExpired: remainingDays <= 0,
        formattedExpiry: this.formatDate(box.expiryDate)
      });
    }
    return list;
  }

  /**
   * Lấy chi tiết 1 box
   */
  getBox(groupId) {
    const cleanId = String(groupId || '').trim();
    const box = this.boxes.get(cleanId);
    if (!box) return null;
    const remainingDays = this.getRemainingDays(box);
    return {
      ...box,
      remainingDays,
      isExpired: remainingDays <= 0,
      formattedExpiry: this.formatDate(box.expiryDate)
    };
  }

  /**
   * Thêm mới box cho phép hoạt động
   */
  addBox({ groupId, name, days = 30, note = '', enabled = true }) {
    const cleanId = String(groupId || '').trim();
    if (!cleanId) throw new Error('ID Box không được để trống!');

    const numDays = Math.max(1, parseInt(days, 10) || 30);
    const expiryDate = new Date(Date.now() + (numDays * 86400000)).toISOString();

    const boxData = {
      groupId: cleanId,
      name: (name || `Box ${cleanId}`).trim(),
      enabled: enabled !== false,
      daysTotal: numDays,
      expiryDate,
      createdAt: new Date().toISOString(),
      note: (note || '').trim()
    };

    this.boxes.set(cleanId, boxData);
    this.saveBoxes();
    return this.getBox(cleanId);
  }

  /**
   * Cập nhật thông tin box
   */
  updateBox(groupId, { name, days, note, enabled }) {
    const cleanId = String(groupId || '').trim();
    const existing = this.boxes.get(cleanId);
    if (!existing) throw new Error('Không tìm thấy Box trong danh sách!');

    if (name !== undefined) existing.name = String(name).trim();
    if (note !== undefined) existing.note = String(note).trim();
    if (enabled !== undefined) existing.enabled = !!enabled;

    if (days !== undefined && !isNaN(parseInt(days, 10))) {
      const numDays = parseInt(days, 10);
      existing.daysTotal = numDays;
      existing.expiryDate = new Date(Date.now() + (numDays * 86400000)).toISOString();
    }

    this.saveBoxes();
    return this.getBox(cleanId);
  }

  /**
   * Gia hạn thêm số ngày cho box
   */
  extendDays(groupId, additionalDays = 30) {
    const cleanId = String(groupId || '').trim();
    const existing = this.boxes.get(cleanId);
    if (!existing) throw new Error('Không tìm thấy Box trong danh sách!');

    const addDays = parseInt(additionalDays, 10) || 30;
    const now = Date.now();
    const currentExpiry = new Date(existing.expiryDate).getTime();

    // Nếu còn hạn thì cộng dồn từ ngày hết hạn, nếu đã hết hạn thì tính từ hiện tại
    const baseTime = currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(baseTime + (addDays * 86400000)).toISOString();

    existing.expiryDate = newExpiry;
    existing.daysTotal = (existing.daysTotal || 0) + addDays;
    existing.enabled = true;

    this.saveBoxes();
    return this.getBox(cleanId);
  }

  /**
   * Xóa box khỏi danh sách
   */
  deleteBox(groupId) {
    const cleanId = String(groupId || '').trim();
    const deleted = this.boxes.delete(cleanId);
    if (deleted) this.saveBoxes();
    return deleted;
  }

  /**
   * Kiểm tra quyền hoạt động của nhóm chat:
   * Trả về { allowed: true/false, remainingDays, reason, box }
   */
  isGroupActive(groupId) {
    const cleanId = String(groupId || '').trim();
    if (!cleanId) return { allowed: false, reason: 'INVALID_ID' };

    const box = this.boxes.get(cleanId);
    if (!box) {
      return { allowed: false, reason: 'NOT_IN_LIST' };
    }

    if (!box.enabled) {
      return { allowed: false, reason: 'DISABLED', box };
    }

    const remainingDays = this.getRemainingDays(box);
    if (remainingDays <= 0) {
      return { allowed: false, reason: 'EXPIRED', box, remainingDays: 0 };
    }

    return { allowed: true, box, remainingDays };
  }

  /**
   * Khởi động lịch tự động thông báo thời gian hoạt động vào lúc 00:05 mỗi ngày
   */
  startDailyNotifier(bot) {
    console.log('⏰ [BOX NOTIFIER] Đã kích hoạt lịch thông báo thời hạn hoạt động Box Zalo vào lúc 00:05 hàng ngày.');

    // Kiểm tra mỗi 30 giây
    setInterval(async () => {
      if (!bot?.api) return;

      const now = new Date();
      // Chuyển sang múi giờ Việt Nam (UTC+7)
      const vnTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
      const vnDate = new Date(vnTimeStr);

      const hour = vnDate.getHours();
      const minute = vnDate.getMinutes();
      const dateStr = `${vnDate.getFullYear()}-${String(vnDate.getMonth() + 1).padStart(2, '0')}-${String(vnDate.getDate()).padStart(2, '0')}`;

      // Bắn thông báo chính xác vào lúc 00:05
      if (hour === 0 && minute === 5) {
        if (this.lastNotifiedDate !== dateStr) {
          this.lastNotifiedDate = dateStr;
          console.log(`🔔 [00:05 NOTIFIER] Đúng 00:05 ngày ${dateStr} - Đang gửi thông báo thời hạn tới tất cả các Box Zalo...`);
          await this.notifyAllBoxes(bot);
        }
      }
    }, 30 * 1000);
  }

  /**
   * Gửi thông báo thời hạn tới từng box (hiển thị đầy đủ ID Box, Tên Box và Thời gian còn lại)
   */
  async notifyAllBoxes(bot) {
    if (!bot?.api) return;
    const { ThreadType } = await import('zca-js');

    for (const box of this.boxes.values()) {
      if (!box.enabled) continue;

      const remainingDays = this.getRemainingDays(box);
      const formattedDate = this.formatDate(box.expiryDate);

      let msg = '';
      if (remainingDays > 0) {
        msg = `🤖 PQ BOT 🤖\n` +
              `⏰ THÔNG BÁO THỜI HẠN HOẠT ĐỘNG\n` +
              `📌 Tên Box: ${box.name || 'N/A'}\n` +
              `🆔 ID Box: ${box.groupId}\n` +
              `⏳ Thời gian còn lại: ${remainingDays} ngày (Hạn dùng đến: ${formattedDate})\n` +
              `✨ Chúc các bạn chơi game & tính điểm vui vẻ!`;
      } else {
        msg = `🤖 PQ BOT 🤖\n` +
              `⚠️ THÔNG BÁO: THỜI HẠN HOẠT ĐỘNG ĐÃ HẾT!\n` +
              `📌 Tên Box: ${box.name || 'N/A'}\n` +
              `🆔 ID Box: ${box.groupId}\n` +
              `⏳ Hết hạn từ ngày: ${formattedDate}\n` +
              `👉 Vui lòng liên hệ Admin để gia hạn thêm thời gian sử dụng bot.`;
      }

      try {
        await bot.api.sendMessage({ msg }, box.groupId, ThreadType.Group);
        console.log(`✅ [00:05 NOTIFIER] Đã gửi thông báo tới nhóm [${box.name}] (ID: ${box.groupId}): còn ${remainingDays} ngày.`);
        // Nghỉ 1.5 giây giữa các nhóm để tránh spam rate limit
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.warn(`⚠️ [00:05 NOTIFIER] Lỗi khi gửi thông báo tới nhóm ${box.groupId}:`, err.message);
      }
    }
  }

  /**
   * Gửi thông báo thử nghiệm tới 1 box cụ thể từ Dashboard
   */
  async notifySingleBox(bot, groupId) {
    if (!bot?.api) return { success: false, message: 'Bot chưa kết nối Zalo!' };
    const cleanId = String(groupId || '').trim();
    const box = this.boxes.get(cleanId);
    if (!box) return { success: false, message: 'Không tìm thấy Box trong danh sách!' };

    const remainingDays = this.getRemainingDays(box);
    const formattedDate = this.formatDate(box.expiryDate);

    let msg = '';
    if (remainingDays > 0) {
      msg = `🤖 PQ BOT 🤖\n` +
            `⏰ THÔNG BÁO THỜI HẠN HOẠT ĐỘNG\n` +
            `📌 Tên Box: ${box.name || 'N/A'}\n` +
            `🆔 ID Box: ${box.groupId}\n` +
            `⏳ Thời gian còn lại: ${remainingDays} ngày (Hạn dùng đến: ${formattedDate})\n` +
            `✨ Chúc các bạn chơi game & tính điểm vui vẻ!`;
    } else {
      msg = `🤖 PQ BOT 🤖\n` +
            `⚠️ THÔNG BÁO: THỜI HẠN HOẠT ĐỘNG ĐÃ HẾT!\n` +
            `📌 Tên Box: ${box.name || 'N/A'}\n` +
            `🆔 ID Box: ${box.groupId}\n` +
            `⏳ Hết hạn từ ngày: ${formattedDate}\n` +
            `👉 Vui lòng liên hệ Admin để gia hạn thêm thời gian sử dụng bot.`;
    }

    const { ThreadType } = await import('zca-js');
    await bot.api.sendMessage({ msg }, box.groupId, ThreadType.Group);
    return { success: true, message: `Đã gửi thông báo tới [${box.name}] (ID: ${box.groupId}) thành công!` };
  }
}

export const boxService = new BoxService();
