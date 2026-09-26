import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'custom_rooms.json');

export const DEFAULT_ADMIN_CTK = 'LE DAI QUY';
export const DEFAULT_BANK_NAME = 'TPBank';
export const DEFAULT_BANK_ACCOUNT = '1000 2610 909';

export const DEFAULT_ANTI = {
  control: false,
  spam: false,
  link: false,
  zalo: false,
  bankQr: false
};

/**
 * Quản lý cài đặt cấu hình nhóm Zalo (mẫu phôi BXH, chế độ ẩn tin nhắn lệnh, tài khoản ngân hàng & QR)
 */
class CustomService {
  constructor() {
    this.groups = new Map();
    this.loadData();
  }

  ensureDataDir() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (e) {
      console.error('Lỗi khi tạo thư mục data:', e);
    }
  }

  loadData() {
    try {
      this.ensureDataDir();
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {

          for (const [key, value] of Object.entries(parsed)) {
            if (value && typeof value === 'object') {
              this.groups.set(key, {
                template: 'bxhconan',
                adminCtk: value.adminCtk || DEFAULT_ADMIN_CTK,
                bankAccount: value.bankAccount || DEFAULT_BANK_ACCOUNT,
                bankName: value.bankName || DEFAULT_BANK_NAME,
                qrImage: value.qrImage || '',
                anti: {
                  control: !!value.anti?.control,
                  spam: !!value.anti?.spam,
                  link: !!value.anti?.link,
                  zalo: !!value.anti?.zalo,
                  bankQr: !!value.anti?.bankQr
                }
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu cấu hình nhóm:', err);
    }
  }

  saveData() {
    try {
      this.ensureDataDir();
      const obj = {};
      for (const [key, value] of this.groups.entries()) {
        obj[key] = value;
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.error('Lỗi khi lưu dữ liệu cấu hình nhóm:', err);
    }
  }

  getGroupState(threadId) {
    const key = String(threadId || '0');
    if (!this.groups.has(key)) {
      const groupData = {
        template: 'bxhconan',
        adminCtk: DEFAULT_ADMIN_CTK,
        bankAccount: DEFAULT_BANK_ACCOUNT,
        bankName: DEFAULT_BANK_NAME,
        qrImage: '',
        anti: { ...DEFAULT_ANTI }
      };
      this.groups.set(key, groupData);
      this.saveData();
      return groupData;
    }
    const group = this.groups.get(key);
    if (!group.template || group.template !== 'bxhconan') {
      group.template = 'bxhconan';
    }
    if (!group.adminCtk) group.adminCtk = DEFAULT_ADMIN_CTK;
    if (!group.bankAccount) group.bankAccount = DEFAULT_BANK_ACCOUNT;
    if (!group.bankName) group.bankName = DEFAULT_BANK_NAME;
    if (!group.anti || typeof group.anti !== 'object') {
      group.anti = { ...DEFAULT_ANTI };
    }
    return group;
  }

  /**
   * Lấy cài đặt Anti của nhóm
   */
  getGroupAnti(threadId) {
    const group = this.getGroupState(threadId);
    return group.anti || { ...DEFAULT_ANTI };
  }

  /**
   * Cập nhật toàn bộ hoặc từng phần Anti
   */
  setGroupAnti(threadId, newAnti) {
    const group = this.getGroupState(threadId);
    group.anti = { ...group.anti, ...newAnti };
    this.saveData();
    return group.anti;
  }

  /**
   * Bật / Tắt tùy chọn Anti theo số thứ tự (1-7)
   */
  toggleGroupAntiOption(threadId, option) {
    const group = this.getGroupState(threadId);
    if (!group.anti) group.anti = { ...DEFAULT_ANTI };

    const opt = String(option).trim().toLowerCase();
    switch (opt) {
      case '1':
      case 'control':
        group.anti.control = !group.anti.control;
        break;
      case '2':
      case 'spam':
        group.anti.spam = !group.anti.spam;
        break;
      case '3':
      case 'link':
        group.anti.link = !group.anti.link;
        break;
      case '4':
      case 'zalo':
      case 'mess':
      case 'messenger':
        group.anti.zalo = !group.anti.zalo;
        break;
      case '5':
      case 'bankqr':
      case 'bank':
      case 'qr':
        group.anti.bankQr = !group.anti.bankQr;
        break;
      case '6':
      case 'all':
      case 'on':
      case 'bat':
        group.anti.control = true;
        group.anti.spam = true;
        group.anti.link = true;
        group.anti.zalo = true;
        group.anti.bankQr = true;
        break;
      case '7':
      case 'none':
      case 'off':
      case 'tat':
        group.anti.control = false;
        group.anti.spam = false;
        group.anti.link = false;
        group.anti.zalo = false;
        group.anti.bankQr = false;
        break;
      default:
        break;
    }
    this.saveData();
    return group.anti;
  }

  /**
   * Lấy mẫu phôi BXH đang cài đặt cho nhóm
   */
  getTemplate(threadId) {
    const group = this.getGroupState(threadId);
    return group.template || 'mau_1';
  }

  /**
   * Cài đặt mẫu phôi BXH cho nhóm
   */
  setTemplate(threadId, templateId) {
    const group = this.getGroupState(threadId);
    group.template = templateId;
    this.saveData();
    return group.template;
  }

  /**
   * Lấy thông tin tài khoản ngân hàng & QR của nhóm
   */
  getGroupBankInfo(threadId) {
    const group = this.getGroupState(threadId);
    return {
      adminCtk: group.adminCtk || DEFAULT_ADMIN_CTK,
      bankAccount: group.bankAccount || DEFAULT_BANK_ACCOUNT,
      bankName: group.bankName || DEFAULT_BANK_NAME,
      qrImage: group.qrImage || ''
    };
  }

  /**
   * Cài đặt thông tin tài khoản ngân hàng cho nhóm
   */
  setGroupBankInfo(threadId, bankAccount, bankName = null, adminCtk = null) {
    const group = this.getGroupState(threadId);
    if (bankAccount) group.bankAccount = String(bankAccount).trim();
    if (bankName) group.bankName = String(bankName).trim();
    if (adminCtk) group.adminCtk = String(adminCtk).trim();
    this.saveData();
    return this.getGroupBankInfo(threadId);
  }

  /**
   * Cài đặt đường dẫn ảnh QR riêng cho nhóm
   */
  setGroupQrImage(threadId, imagePath) {
    const group = this.getGroupState(threadId);
    group.qrImage = imagePath;
    this.saveData();
    return group.qrImage;
  }

  /**
   * Xóa ảnh QR riêng của nhóm (quay về QR TPBank mặc định)
   */
  clearGroupQrImage(threadId) {
    const group = this.getGroupState(threadId);
    group.qrImage = '';
    this.saveData();
    return true;
  }
}

export const customService = new CustomService();
