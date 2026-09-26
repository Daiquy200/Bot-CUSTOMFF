import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class KeyService {
  constructor() {
    this.dataFile = path.resolve(__dirname, '../../data/keys.json');
    this.keys = {};
    this.loadKeys();
  }

  loadKeys() {
    try {
      const dataDir = path.dirname(this.dataFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      if (fs.existsSync(this.dataFile)) {
        const raw = fs.readFileSync(this.dataFile, 'utf8');
        this.keys = JSON.parse(raw);
      } else {
        this.keys = {};
        this.saveKeys();
      }
    } catch (err) {
      console.error('⚠️ [KEY SERVICE] Lỗi khi đọc keys.json:', err.message);
      this.keys = {};
    }
  }

  saveKeys() {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.keys, null, 2), 'utf8');
    } catch (err) {
      console.error('⚠️ [KEY SERVICE] Lỗi khi ghi keys.json:', err.message);
    }
  }

  normalizeKey(keyName) {
    if (!keyName) return '';
    return String(keyName).trim().toLowerCase();
  }

  getKey(keyName) {
    this.loadKeys();
    const clean = this.normalizeKey(keyName);
    return this.keys[clean] || null;
  }

  getAllKeys() {
    this.loadKeys();
    return this.keys;
  }

  findKeyByOwner(zaloId) {
    if (!zaloId) return null;
    this.loadKeys();
    for (const [keyName, data] of Object.entries(this.keys)) {
      if (data.ownerZaloId && String(data.ownerZaloId) === String(zaloId)) {
        return { key: keyName, ...data };
      }
    }
    return null;
  }

  createKey(keyName, ownerZaloId = null, ownerName = '', initialCredits = 5, template = 'bxhconan') {
    const clean = this.normalizeKey(keyName);
    if (!clean) {
      return { success: false, message: 'Tên key không hợp lệ!' };
    }

    this.loadKeys();
    if (this.keys[clean]) {
      return {
        success: false,
        message: `Tên Key [${clean.toUpperCase()}] đã tồn tại và thuộc sở hữu của người khác! Vui lòng chọn một tên Key khác.`
      };
    }

    const startCredits = initialCredits !== undefined && initialCredits !== null ? Math.max(0, parseInt(initialCredits, 10)) : 5;
    const newKey = {
      key: clean,
      ownerZaloId: ownerZaloId ? String(ownerZaloId) : null,
      ownerName: ownerName || 'Khách thuê',
      credits: startCredits,
      template: template || 'bxhconan',
      totalCharged: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.keys[clean] = newKey;
    this.saveKeys();
    return { success: true, message: `Đã tạo key "${clean}" thành công với ${newKey.credits} lượt!`, data: newKey };
  }

  getOrCreateKey(keyName, ownerZaloId = null, ownerName = '') {
    const clean = this.normalizeKey(keyName);
    if (!clean) return null;

    this.loadKeys();
    if (!this.keys[clean]) {
      this.keys[clean] = {
        key: clean,
        ownerZaloId: ownerZaloId ? String(ownerZaloId) : null,
        ownerName: ownerName || 'Khách thuê',
        credits: 5,
        template: 'bxhconan',
        totalCharged: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.saveKeys();
    } else if (ownerZaloId && !this.keys[clean].ownerZaloId) {
      // Gán chủ sở hữu nếu key chưa có
      this.keys[clean].ownerZaloId = String(ownerZaloId);
      if (ownerName) this.keys[clean].ownerName = ownerName;
      this.saveKeys();
    }

    return this.keys[clean];
  }

  addCredits(keyName, count, amount = 0) {
    const clean = this.normalizeKey(keyName);
    if (!clean) return { success: false, message: 'Tên key không hợp lệ!' };

    this.loadKeys();
    if (!this.keys[clean]) {
      // Tự động khởi tạo key nếu chưa có khi nạp tiền
      this.keys[clean] = {
        key: clean,
        ownerZaloId: null,
        ownerName: 'Khách nạp',
        credits: 0,
        template: 'bxhconan',
        totalCharged: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    const added = parseInt(count, 10) || 0;
    this.keys[clean].credits = Math.max(0, (this.keys[clean].credits || 0) + added);
    this.keys[clean].totalCharged = (this.keys[clean].totalCharged || 0) + (Number(amount) || 0);
    this.keys[clean].updatedAt = new Date().toISOString();
    this.saveKeys();

    return {
      success: true,
      key: clean,
      added,
      totalCredits: this.keys[clean].credits,
      ownerZaloId: this.keys[clean].ownerZaloId,
      ownerName: this.keys[clean].ownerName
    };
  }

  deductCredits(keyName, count) {
    const clean = this.normalizeKey(keyName);
    if (!clean) return { success: false, message: 'Tên key không hợp lệ!' };

    this.loadKeys();
    if (!this.keys[clean]) {
      return { success: false, message: `❌ Key [${clean.toUpperCase()}] không tồn tại trên hệ thống!` };
    }

    const deducted = Math.abs(parseInt(count, 10)) || 0;
    const current = this.keys[clean].credits || 0;
    this.keys[clean].credits = Math.max(0, current - deducted);
    this.keys[clean].updatedAt = new Date().toISOString();
    this.saveKeys();

    return {
      success: true,
      key: clean,
      deducted,
      totalCredits: this.keys[clean].credits,
      ownerZaloId: this.keys[clean].ownerZaloId,
      ownerName: this.keys[clean].ownerName
    };
  }

  setCredits(keyName, count) {
    const clean = this.normalizeKey(keyName);
    if (!clean) return { success: false, message: 'Tên key không hợp lệ!' };

    this.loadKeys();
    if (!this.keys[clean]) {
      return { success: false, message: `❌ Key [${clean.toUpperCase()}] không tồn tại trên hệ thống!` };
    }

    const targetCredits = Math.max(0, parseInt(count, 10) || 0);
    this.keys[clean].credits = targetCredits;
    this.keys[clean].updatedAt = new Date().toISOString();
    this.saveKeys();

    return {
      success: true,
      key: clean,
      totalCredits: this.keys[clean].credits,
      ownerZaloId: this.keys[clean].ownerZaloId,
      ownerName: this.keys[clean].ownerName
    };
  }

  /**
   * Kiểm tra và trừ 1 lượt khi dùng lệnh .td
   * @param {string} keyName Tên key
   * @param {string} userZaloId ID Zalo của người gọi lệnh
   * @param {boolean} isAdmin Có phải admin tối cao không (admin có thể bypass)
   */
  useCredit(keyName, userZaloId = null, isAdmin = false) {
    const clean = this.normalizeKey(keyName);
    this.loadKeys();

    const keyData = this.keys[clean];
    if (!keyData) {
      return {
        success: false,
        errorType: 'KEY_NOT_FOUND',
        message: `❌ Key "${clean}" không tồn tại trên hệ thống!\n👉 Gõ .napluot ${clean} để tạo và nạp lượt.`
      };
    }

    // Kiểm tra quyền sở hữu tuyệt đối: CHỈ DUY NHẤT CHỦ SỞ HỮU MỚI ĐƯỢC DÙNG KEY NÀY!
    if (keyData.ownerZaloId && userZaloId && String(keyData.ownerZaloId) !== String(userZaloId)) {
      return {
        success: false,
        errorType: 'NOT_OWNER',
        message: `⛔ Key [${clean.toUpperCase()}] không phải của bạn! Bạn không thể sử dụng key của người khác.`
      };
    }

    // Nếu key chưa có chủ và người dùng hợp lệ thì gán luôn
    if (!keyData.ownerZaloId && userZaloId) {
      keyData.ownerZaloId = String(userZaloId);
    }

    // Kiểm tra số dư lượt
    if ((keyData.credits || 0) <= 0) {
      return {
        success: false,
        errorType: 'OUT_OF_CREDITS',
        key: clean,
        credits: 0,
        message: `⚠️ Key "${clean}" đã HẾT LƯỢT dùng!\n👉 Vui lòng gõ .napluot ${clean} để nạp thêm lượt (250đ/lượt).`
      };
    }

    // Trừ 1 lượt
    keyData.credits -= 1;
    keyData.updatedAt = new Date().toISOString();
    this.saveKeys();

    return {
      success: true,
      key: clean,
      remainingCredits: keyData.credits,
      template: keyData.template || 'mau_5'
    };
  }

  setKeyTemplate(keyName, templateId, userZaloId = null, isAdmin = false) {
    const clean = this.normalizeKey(keyName);
    this.loadKeys();

    const keyData = this.keys[clean];
    if (!keyData) {
      return { success: false, message: `❌ Key "${clean}" không tồn tại!` };
    }

    if (keyData.ownerZaloId && userZaloId && String(keyData.ownerZaloId) !== String(userZaloId)) {
      return { success: false, message: `⛔ Key [${clean.toUpperCase()}] không phải của bạn! Bạn không có quyền chỉnh sửa key này.` };
    }

    keyData.template = templateId;
    keyData.updatedAt = new Date().toISOString();
    this.saveKeys();

    return {
      success: true,
      message: `✅ Đã đổi mẫu mặc định cho key "${clean}" sang [${templateId}]!`
    };
  }

  setKeyCustomTitle(keyName, title, userZaloId = null, isAdmin = false) {
    const clean = this.normalizeKey(keyName);
    this.loadKeys();

    const keyData = this.keys[clean];
    if (!keyData) {
      return { success: false, message: `❌ Key "${clean}" không tồn tại!` };
    }

    if (keyData.ownerZaloId && userZaloId && String(keyData.ownerZaloId) !== String(userZaloId)) {
      return { success: false, message: `⛔ Key [${clean.toUpperCase()}] không phải của bạn! Bạn không có quyền chỉnh sửa key này.` };
    }

    keyData.customTitle = (title || '').trim();
    keyData.updatedAt = new Date().toISOString();
    this.saveKeys();

    return {
      success: true,
      message: `✅ Đã cập nhật tên giải CUSTOM cho key "${clean}" thành: "${keyData.customTitle}"!`,
      customTitle: keyData.customTitle
    };
  }

  setKeyLogo(keyName, logoPath, userZaloId = null, isAdmin = false) {
    const clean = this.normalizeKey(keyName);
    this.loadKeys();

    const keyData = this.keys[clean];
    if (!keyData) {
      return { success: false, message: `❌ Key "${clean}" không tồn tại!` };
    }

    if (keyData.ownerZaloId && userZaloId && String(keyData.ownerZaloId) !== String(userZaloId)) {
      return { success: false, message: `⛔ Key [${clean.toUpperCase()}] không phải của bạn! Bạn không có quyền chỉnh sửa key này.` };
    }

    keyData.logoPath = logoPath;
    keyData.updatedAt = new Date().toISOString();
    this.saveKeys();

    return {
      success: true,
      message: `✅ Đã cập nhật logo cho key "${clean}" thành công!`,
      logoPath: keyData.logoPath
    };
  }

  removeKeyLogo(keyName, userZaloId = null, isAdmin = false) {
    const clean = this.normalizeKey(keyName);
    this.loadKeys();

    const keyData = this.keys[clean];
    if (!keyData) {
      return { success: false, message: `❌ Key "${clean}" không tồn tại!` };
    }

    if (keyData.ownerZaloId && userZaloId && String(keyData.ownerZaloId) !== String(userZaloId)) {
      return { success: false, message: `⛔ Key [${clean.toUpperCase()}] không phải của bạn! Bạn không có quyền chỉnh sửa key này.` };
    }

    if (keyData.logoPath && fs.existsSync(keyData.logoPath)) {
      try {
        fs.unlinkSync(keyData.logoPath);
      } catch (e) {}
    }

    keyData.logoPath = null;
    keyData.updatedAt = new Date().toISOString();
    this.saveKeys();

    return {
      success: true,
      message: `✅ Đã xóa logo của key "${clean}"!`
    };
  }

  deleteKey(keyName) {
    const clean = this.normalizeKey(keyName);
    this.loadKeys();
    if (!this.keys[clean]) {
      return { success: false, message: `Key "${clean}" không tồn tại!` };
    }
    delete this.keys[clean];
    this.saveKeys();
    return { success: true, message: `Đã xóa key "${clean}" thành công!` };
  }
}

export const keyService = new KeyService();
