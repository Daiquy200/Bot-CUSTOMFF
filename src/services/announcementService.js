import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.resolve(__dirname, '../../data/announcement_config.json');

export const DEFAULT_ANNOUNCEMENT = `BOX .td free theo lượt và anti 20k 1 tháng ib.`;

class AnnouncementService {
  constructor() {
    this.enabled = true;
    this.intervalHours = 3; // Mặc định 3 tiếng 1 lần: 00:00 (12h đêm), 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00
    this.customMessage = DEFAULT_ANNOUNCEMENT;
    this.knownGroups = new Set();
    this.lastSentHour = -1;
    this.lastSentDate = '';
    this.isBroadcasting = false;

    this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        if (typeof data.enabled === 'boolean') this.enabled = data.enabled;
        if (typeof data.intervalHours === 'number') this.intervalHours = data.intervalHours;
        if (data.customMessage) this.customMessage = data.customMessage;
        if (Array.isArray(data.knownGroups)) {
          data.knownGroups.forEach(id => this.knownGroups.add(String(id)));
        }
      }
    } catch (err) {
      console.error('Lỗi khi đọc cấu hình thông báo:', err.message);
    }
  }

  saveConfig() {
    try {
      const dataDir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const data = {
        enabled: this.enabled,
        intervalHours: this.intervalHours,
        customMessage: this.customMessage,
        knownGroups: Array.from(this.knownGroups)
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Lỗi khi lưu cấu hình thông báo:', err.message);
    }
  }

  /**
   * Đăng ký một nhóm vào danh sách nhận thông báo
   */
  registerGroup(threadId) {
    const cleanId = String(threadId || '').trim();
    if (!cleanId || cleanId === '0' || cleanId === '123') return;
    if (!this.knownGroups.has(cleanId)) {
      this.knownGroups.add(cleanId);
      this.saveConfig();
    }
  }

  /**
   * Bật/tắt tự động thông báo
   */
  setEnabled(status) {
    this.enabled = !!status;
    this.saveConfig();
    return this.enabled;
  }

  /**
   * Cập nhật nội dung thông báo
   */
  setMessage(msg) {
    if (msg && typeof msg === 'string') {
      this.customMessage = msg.trim();
      this.saveConfig();
      return true;
    }
    return false;
  }

  /**
   * Cập nhật chu kỳ gửi (tiếng)
   */
  setIntervalHours(hours) {
    const h = parseInt(hours, 10);
    if (h >= 1 && h <= 24) {
      this.intervalHours = h;
      this.saveConfig();
      return true;
    }
    return false;
  }

  /**
   * Thu thập tất cả các nhóm mà Bot đang tham gia
   */
  async getAllTargetGroups(bot) {
    const groupSet = new Set(this.knownGroups);

    // 1. Thêm từ custom_rooms.json
    try {
      const customRoomsFile = path.resolve(__dirname, '../../data/custom_rooms.json');
      if (fs.existsSync(customRoomsFile)) {
        const rooms = JSON.parse(fs.readFileSync(customRoomsFile, 'utf8'));
        Object.keys(rooms).forEach(id => {
          if (id && id !== '123' && id !== '0') groupSet.add(id);
        });
      }
    } catch (e) {}

    // 2. Thêm từ Zalo API nếu có
    if (bot?.api && typeof bot.api.getAllGroups === 'function') {
      try {
        const res = await bot.api.getAllGroups();
        const gridMap = res?.gridInfoMap;
        if (gridMap && typeof gridMap === 'object') {
          Object.keys(gridMap).forEach(id => {
            if (id && id !== '0') groupSet.add(id);
          });
        }
      } catch (e) {}
    }

    return Array.from(groupSet);
  }

  /**
   * Gửi thông báo ngay lập tức tới tất cả các nhóm
   */
  async broadcast(bot, messageText = null) {
    if (this.isBroadcasting) {
      console.warn('⚠️ [THÔNG BÁO] Đang có tiến trình phát thông báo chạy, bỏ qua...');
      return { success: false, message: 'Đang phát thông báo, vui lòng chờ!' };
    }

    if (!bot?.api) {
      return { success: false, message: 'Bot chưa kết nối Zalo!' };
    }

    const textToSend = messageText || this.customMessage || DEFAULT_ANNOUNCEMENT;
    const targetGroups = await this.getAllTargetGroups(bot);

    if (targetGroups.length === 0) {
      console.log('ℹ️ [THÔNG BÁO] Chưa có nhóm Zalo nào trong danh sách nhận thông báo.');
      return { success: true, count: 0, message: 'Chưa có nhóm nào trong danh sách.' };
    }

    this.isBroadcasting = true;
    console.log(`\n📢 [THÔNG BÁO] Bắt đầu phát thông báo tới ${targetGroups.length} nhóm Zalo...`);
    let successCount = 0;

    try {
      const { ThreadType } = await import('zca-js');
      for (const groupId of targetGroups) {
        try {
          await bot.api.sendMessage(
            { msg: textToSend },
            groupId,
            ThreadType.Group
          );
          successCount++;
          // Delay 2 giây giữa mỗi nhóm để chống bị Zalo hạn chế tốc độ gửi
          await new Promise(r => setTimeout(r, 2000));
        } catch (err) {
          console.warn(`⚠️ [THÔNG BÁO] Không thể gửi tới nhóm ${groupId}:`, err.message);
        }
      }
    } finally {
      this.isBroadcasting = false;
    }

    console.log(`✅ [THÔNG BÁO] Hoàn thành: Đã gửi thành công tới ${successCount}/${targetGroups.length} nhóm!\n`);
    return { success: true, count: successCount, total: targetGroups.length };
  }

  /**
   * Khởi động lịch kiểm tra tự động phát thông báo
   */
  startScheduler(bot) {
    console.log(`⏰ [THÔNG BÁO] Đã kích hoạt hệ thống tự động thông báo: Chu kỳ ${this.intervalHours} tiếng/lần (bao gồm 00:00 đêm).`);

    // Kiểm tra mỗi 1 phút
    setInterval(async () => {
      if (!this.enabled || !bot?.api) return;

      const now = new Date();
      // Chuyển sang múi giờ Việt Nam (UTC+7)
      const vnTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
      const vnDate = new Date(vnTimeStr);

      const hour = vnDate.getHours();
      const minute = vnDate.getMinutes();
      const dateStr = `${vnDate.getFullYear()}-${vnDate.getMonth() + 1}-${vnDate.getDate()}`;

      // Chỉ gửi đúng vào phút thứ 0 của các giờ thuộc chu kỳ (Ví dụ: 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00)
      if (minute === 0 && (hour % this.intervalHours === 0)) {
        const timeKey = `${dateStr}_${hour}`;
        if (this.lastSentDate !== timeKey) {
          this.lastSentDate = timeKey;
          console.log(`🔔 [THÔNG BÁO] Đúng ${hour}:00 - Đang tự động gửi thông báo quảng bá tới các nhóm...`);
          await this.broadcast(bot);
        }
      }
    }, 60 * 1000);
  }
}

export const announcementService = new AnnouncementService();
