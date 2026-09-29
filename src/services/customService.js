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
  spam: false,         // [1] Spam tin nhắn
  tagAll: false,       // [2] Tag All (@all, @mọi người)
  link: false,         // [3] Link Website ngoài
  linkZalo: false,     // [4] Link / Thẻ Nhóm Zalo
  qrZalo: false,       // [5] QR Zalo
  qrMess: false,       // [6] QR Messenger
  bankQr: false,       // [7] QR Ngân Hàng
  allQr: false,        // [8] Tất Cả Mã QR
  antiUndo: false,     // [9] Thu Hồi Tin Nhắn
  changeName: false,   // [10] Đổi Tên Box
  changeAvatar: false, // [11] Thay Avt Box
  sexyAvatar: false,   // [12] Avt Sexy / 18+
  nsfw: false,         // [13] Nudo / 18+ / Đồi Trụy
  voice: false,        // [14] Tin Thoại (Voice)
  card: false,         // [15] Danh Thiếp (Card)
  image: false         // [16] Gửi Hình Ảnh
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
                qrAutoListen: !!value.qrAutoListen,
                anti: {
                  spam: !!value.anti?.spam,
                  tagAll: !!(value.anti?.tagAll ?? value.anti?.tabAll),
                  link: !!value.anti?.link,
                  linkZalo: !!(value.anti?.linkZalo ?? value.anti?.zalo),
                  qrZalo: !!(value.anti?.qrZalo ?? false),
                  qrMess: !!(value.anti?.qrMess ?? false),
                  bankQr: !!value.anti?.bankQr,
                  allQr: !!value.anti?.allQr,
                  antiUndo: !!(value.anti?.antiUndo ?? value.anti?.thuHoi),
                  changeName: !!(value.anti?.changeName ?? value.anti?.doiTen),
                  changeAvatar: !!(value.anti?.changeAvatar ?? value.anti?.thayAvt),
                  sexyAvatar: !!(value.anti?.sexyAvatar ?? value.anti?.avtSexy),
                  nsfw: !!(value.anti?.nsfw ?? value.anti?.nudo ?? value.anti?.m18),
                  voice: !!value.anti?.voice,
                  card: !!value.anti?.card,
                  image: !!(value.anti?.image ?? value.anti?.anh)
                },
                freeTrial: value.freeTrial || null
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
        qrAutoListen: false,
        anti: { ...DEFAULT_ANTI },
        freeTrial: null
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
    if (typeof group.qrAutoListen !== 'boolean') group.qrAutoListen = false;
    if (!group.anti || typeof group.anti !== 'object') {
      group.anti = { ...DEFAULT_ANTI };
    }
    return group;
  }

  /**
   * Kiểm tra nhóm có bật tự động lắng nghe từ khóa QR không có tiền tố hay không
   */
  isGroupQrListenEnabled(threadId) {
    const group = this.getGroupState(threadId);
    return !!group.qrAutoListen;
  }

  /**
   * Bật/tắt chế độ tự động lắng nghe từ khóa QR (tự do)
   */
  setGroupQrListen(threadId, enabled) {
    const group = this.getGroupState(threadId);
    group.qrAutoListen = !!enabled;
    this.saveData();
    return group.qrAutoListen;
  }

  toggleGroupQrListen(threadId) {
    const group = this.getGroupState(threadId);
    group.qrAutoListen = !group.qrAutoListen;
    this.saveData();
    return group.qrAutoListen;
  }

  /**
   * Lấy cài đặt Anti của nhóm
   */
  getGroupAnti(threadId) {
    const group = this.getGroupState(threadId);
    return { ...DEFAULT_ANTI, ...(group.anti || {}) };
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
   * Bật / Tắt tùy chọn Anti theo số thứ tự (1-8, 9 bật tất cả, 0 tắt tất cả)
   */
  toggleGroupAntiOption(threadId, option) {
    const group = this.getGroupState(threadId);
    if (!group.anti) group.anti = { ...DEFAULT_ANTI };

    const opt = String(option).trim().toLowerCase();
    switch (opt) {
      case '1':
      case 'spam':
        group.anti.spam = !group.anti.spam;
        break;
      case '2':
      case 'tagall':
      case 'taball':
      case 'tag':
        group.anti.tagAll = !group.anti.tagAll;
        break;
      case '3':
      case 'link':
      case 'web':
        group.anti.link = !group.anti.link;
        break;
      case '4':
      case 'linkzalo':
      case 'lzalo':
      case 'zalo':
        group.anti.linkZalo = !group.anti.linkZalo;
        break;
      case '5':
      case 'qrzalo':
      case 'qrz':
        group.anti.qrZalo = !group.anti.qrZalo;
        break;
      case '6':
      case 'qrmess':
      case 'qrm':
      case 'mess':
      case 'messenger':
        group.anti.qrMess = !group.anti.qrMess;
        break;
      case '7':
      case 'bankqr':
      case 'bank':
        group.anti.bankQr = !group.anti.bankQr;
        break;
      case '8':
      case 'allqr':
      case 'qr':
        group.anti.allQr = !group.anti.allQr;
        break;
      case '9':
      case 'antiundo':
      case 'undo':
      case 'thuhoi':
      case 'thuhoitin':
        group.anti.antiUndo = !group.anti.antiUndo;
        break;
      case '10':
      case 'changename':
      case 'doiten':
      case 'name':
        group.anti.changeName = !group.anti.changeName;
        break;
      case '11':
      case 'changeavatar':
      case 'thayavt':
      case 'doiavt':
        group.anti.changeAvatar = !group.anti.changeAvatar;
        break;
      case '12':
      case 'sexyavatar':
      case 'avtsexy':
      case 'sexy':
        group.anti.sexyAvatar = !group.anti.sexyAvatar;
        break;
      case '13':
      case 'nsfw':
      case 'nudo':
      case '18+':
      case '8+':
      case 'sex':
      case 'doitruy':
        group.anti.nsfw = !group.anti.nsfw;
        break;
      case '14':
      case 'voice':
      case 'tinthoai':
      case 'audio':
        group.anti.voice = !group.anti.voice;
        break;
      case '15':
      case 'card':
      case 'danhthiep':
      case 'contact':
        group.anti.card = !group.anti.card;
        break;
      case '16':
      case 'image':
      case 'anh':
      case 'photo':
      case 'guianh':
        group.anti.image = !group.anti.image;
        break;
      case 'all':
      case 'on':
      case 'bat':
        Object.keys(DEFAULT_ANTI).forEach(k => {
          group.anti[k] = true;
        });
        break;
      case '0':
      case 'none':
      case 'off':
      case 'tat':
        Object.keys(DEFAULT_ANTI).forEach(k => {
          group.anti[k] = false;
        });
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

  /**
   * Kích hoạt chế độ vô hạn lượt / dùng thử miễn phí cho Box
   * @param {string} threadId ID nhóm
   * @param {number} days Số ngày
   * @param {number} scope 1: Chỉ QTV box, 2: Tất cả thành viên
   */
  setGroupFreeTrial(threadId, days = 1, scope = 2) {
    const group = this.getGroupState(threadId);
    const numDays = Math.max(1, parseInt(days, 10) || 1);
    const expireAt = Date.now() + (numDays * 24 * 60 * 60 * 1000);
    group.freeTrial = {
      enabled: true,
      days: numDays,
      scope: Number(scope) === 1 ? 1 : 2,
      expireAt,
      createdAt: Date.now()
    };
    this.saveData();
    return group.freeTrial;
  }

  /**
   * Hủy kích hoạt chế độ vô hạn lượt của Box
   */
  cancelGroupFreeTrial(threadId) {
    const group = this.getGroupState(threadId);
    if (group.freeTrial) {
      group.freeTrial.enabled = false;
      this.saveData();
    }
    return true;
  }

  /**
   * Lấy thông tin vô hạn lượt nếu còn hạn
   */
  getGroupFreeTrial(threadId) {
    const group = this.getGroupState(threadId);
    if (!group.freeTrial || !group.freeTrial.enabled) return null;
    if (Date.now() > group.freeTrial.expireAt) {
      group.freeTrial.enabled = false;
      this.saveData();
      return null;
    }
    return group.freeTrial;
  }

  /**
   * Kiểm tra người dùng có được miễn phí / vô hạn lượt tính điểm không
   */
  isUserEligibleForFreeTrial(threadId, senderId, isGroupAdmin = false) {
    const trial = this.getGroupFreeTrial(threadId);
    if (!trial) return false;
    if (trial.scope === 1) {
      return !!isGroupAdmin;
    }
    return true;
  }
}

export const customService = new CustomService();
