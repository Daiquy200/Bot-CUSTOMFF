import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'custom_rooms.json');

export const DEFAULT_BOX_NAME = 'BOX CUSTOM ĐQ';
export const DEFAULT_ADMIN_CTK = 'LE DAI QUY';
export const DEFAULT_BANK_NAME = 'TPBank';
export const DEFAULT_BANK_ACCOUNT = '1000 2610 909';
export const DEFAULT_FEE = '6k';
export const DEFAULT_TABLE = 'Bảng A';

export const PRIZE_POOLS = {
  '3k': {
    feeLabel: '3K',
    top1: '17k',
    top2: '6k',
    top3: '3k'
  },
  '5k': {
    feeLabel: '5K',
    top1: '30k',
    top2: '10k',
    top3: '5k'
  },
  '6k': {
    feeLabel: '6K',
    top1: '38k',
    top2: '12k',
    top3: '6k'
  }
};

export const KEYCAP_NUMBERS = [
  '0️⃣1️⃣', '0️⃣2️⃣', '0️⃣3️⃣', '0️⃣4️⃣', '0️⃣5️⃣', '0️⃣6️⃣',
  '0️⃣7️⃣', '0️⃣8️⃣', '0️⃣9️⃣', '1️⃣0️⃣', '1️⃣1️⃣', '1️⃣2️⃣'
];

/**
 * Tính giờ sắp tới tự động theo giờ Việt Nam (UTC+7)
 * Ví dụ: 19h20 -> chuẩn bị tới 20h (8h)
 */
export function getUpcomingTime() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const vnNow = new Date(utc + (7 * 3600000));

  const hours = vnNow.getHours();
  const minutes = vnNow.getMinutes();

  let targetHour = hours;
  if (minutes >= 30) {
    targetHour = hours + 1;
  }
  if (targetHour >= 24) targetHour = 0;

  return `${targetHour}h`;
}

function createInitialSlots() {
  const slots = [];
  for (let i = 1; i <= 12; i++) {
    slots.push({
      id: i,
      name: '',
      uid: '',
      status: '💸'
    });
  }
  return slots;
}

export function normalizeTableKey(str) {
  if (!str) return 'A';
  let s = String(str).trim().toUpperCase();
  s = s.replace(/^BẢNG\s*/i, '').replace(/^B\s*/i, 'B');
  if (!s) return 'A';
  return s;
}

export function isMatchingTime(roomTime, targetTime) {
  if (!roomTime || !targetTime) return false;
  const t1 = String(roomTime).toLowerCase().trim();
  const t2 = String(targetTime).toLowerCase().trim();
  if (t1 === t2) return true;
  const m1 = t1.match(/(\d{1,2})/);
  const m2 = t2.match(/(\d{1,2})/);
  if (m1 && m2) {
    const h1 = parseInt(m1[1], 10);
    const h2 = parseInt(m2[1], 10);
    if (h1 === h2) return true;
  }
  return false;
}

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
            // Tương thích ngược: Nếu dữ liệu cũ lưu trực tiếp 1 room
            if (value && value.slots && !value.tables) {
              const tableKey = normalizeTableKey(value.table || 'A');
              this.groups.set(key, {
                template: value.template || 'mau_1',
                activeTable: tableKey,
                tables: {
                  [tableKey]: value
                }
              });
            } else if (value && value.tables) {
              value.template = value.template || 'mau_1';
              this.groups.set(key, value);
            }
          }
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu custom_rooms.json:', err);
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
      console.error('Lỗi khi lưu dữ liệu custom_rooms.json:', err);
    }
  }

  getGroupState(threadId) {
    const key = String(threadId);
    if (!this.groups.has(key)) {
      const defaultTableKey = 'A';
      const defaultRoom = {
        boxName: DEFAULT_BOX_NAME,
        adminCtk: DEFAULT_ADMIN_CTK,
        fee: DEFAULT_FEE,
        table: 'Bảng A',
        time: null,
        linkIdmk: '',
        slots: createInitialSlots(),
        updatedAt: Date.now()
      };

      const groupData = {
        template: 'mau_1',
        activeTable: defaultTableKey,
        tables: {
          [defaultTableKey]: defaultRoom
        }
      };
      this.groups.set(key, groupData);
      this.saveData();
      return groupData;
    }
    const group = this.groups.get(key);
    if (!group.template) {
      group.template = 'mau_1';
    }
    return group;
  }

  getTemplate(threadId) {
    const group = this.getGroupState(threadId);
    return group.template || 'mau_1';
  }

  setTemplate(threadId, templateId) {
    const group = this.getGroupState(threadId);
    group.template = templateId;
    this.saveData();
    return group.template;
  }

  /**
   * Lấy thông tin thanh toán & QR riêng của nhóm
   */
  getGroupBankInfo(threadId) {
    const group = this.getGroupState(threadId);
    const room = this.getRoom(threadId);
    return {
      adminCtk: group.adminCtk || room.adminCtk || DEFAULT_ADMIN_CTK,
      bankAccount: group.bankAccount || DEFAULT_BANK_ACCOUNT,
      bankName: group.bankName || DEFAULT_BANK_NAME,
      qrImage: group.qrImage || '',
      fee: room.fee || DEFAULT_FEE
    };
  }

  /**
   * Lấy danh sách tổng hợp tất cả mức phí của các bảng đang mở trong nhóm
   */
  getGroupFeesSummary(threadId) {
    const allRooms = this.getAllRooms(threadId);

    // Thu thập danh sách các bảng đang mở có mức phí
    const tableFeeList = allRooms
      .filter(({ room }) => room && room.fee)
      .map(({ key, room }) => `${room.table || `Bảng ${key}`}: ${(room.fee || '').toUpperCase()}`);

    if (tableFeeList.length > 1) {
      return tableFeeList.join(' | ');
    } else if (tableFeeList.length === 1) {
      return `${tableFeeList[0]} (hoặc 3K / 5K / 6K tùy giải)`;
    }
    return '3K / 5K / 6K (Tùy theo bảng/giải)';
  }

  /**
   * Chuyển đổi chuỗi mức phí (vd: '6k', '5K', '8k', '6.000', '6000') thành số nguyên VNĐ
   */
  parseFeeToNumber(feeStr) {
    if (!feeStr) return 0;
    const clean = String(feeStr).toLowerCase().trim();
    const kMatch = clean.match(/^(\d+(?:[\.,]\d+)?)\s*k$/);
    if (kMatch) {
      return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);
    }
    const num = parseInt(clean.replace(/\D/g, ''), 10);
    if (!isNaN(num)) {
      if (num < 100) return num * 1000;
      return num;
    }
    return 0;
  }

  /**
   * Cài đặt ảnh QR riêng của nhóm
   */
  setGroupQrImage(threadId, imagePath) {
    const group = this.getGroupState(threadId);
    group.qrImage = imagePath;
    this.saveData();
    return group.qrImage;
  }

  /**
   * Xóa ảnh QR riêng của nhóm (quay về QR mặc định)
   */
  clearGroupQrImage(threadId) {
    const group = this.getGroupState(threadId);
    group.qrImage = '';
    this.saveData();
    return true;
  }

  /**
   * Kiểm tra trạng thái tự động duyệt bill của nhóm (mặc định là TẮT false)
   */
  isAutoBill(threadId) {
    const group = this.getGroupState(threadId);
    return group.autoBill === true;
  }

  /**
   * Cài đặt BẬT (true) hoặc TẮT (false) tự động duyệt bill
   */
  setAutoBill(threadId, enabled) {
    const group = this.getGroupState(threadId);
    group.autoBill = !!enabled;
    this.saveData();
    return group.autoBill;
  }

  /**
   * Kiểm tra Bot có đang hoạt động trong nhóm hay không (mặc định là TẮT false)
   */
  isBotEnabled(threadId) {
    const group = this.getGroupState(threadId);
    return group.botEnabled === true;
  }

  /**
   * BẬT hoặc TẮT toàn bộ hoạt động của Bot trong nhóm
   */
  setBotEnabled(threadId, enabled) {
    const group = this.getGroupState(threadId);
    group.botEnabled = !!enabled;
    this.saveData();
    return group.botEnabled;
  }

  /**
   * Kiểm tra trạng thái ẩn tin nhắn lệnh của nhóm (mặc định là BẬT true)
   */
  isHideCommand(threadId) {
    const group = this.getGroupState(threadId);
    return group.hideCommand !== false;
  }

  /**
   * BẬT hoặc TẮT chế độ ẩn tin nhắn lệnh
   */
  setHideCommand(threadId, enabled) {
    const group = this.getGroupState(threadId);
    group.hideCommand = !!enabled;
    this.saveData();
    return group.hideCommand;
  }

  /**
   * Cài đặt số tài khoản, ngân hàng và chủ tài khoản riêng của nhóm
   */
  setGroupBankInfo(threadId, bankAccount, bankName = null, adminCtk = null) {
    const group = this.getGroupState(threadId);
    if (bankAccount) group.bankAccount = String(bankAccount).trim();
    if (bankName) group.bankName = String(bankName).trim();
    if (adminCtk) {
      const cleanCtk = String(adminCtk).trim();
      group.adminCtk = cleanCtk;
      if (group.tables) {
        for (const t of Object.values(group.tables)) {
          if (t) t.adminCtk = cleanCtk;
        }
      }
    }
    this.saveData();
    return this.getGroupBankInfo(threadId);
  }

  getActiveTableKey(threadId) {
    const group = this.getGroupState(threadId);
    return group.activeTable || 'A';
  }

  setActiveTable(threadId, rawTableKey) {
    const group = this.getGroupState(threadId);
    const key = normalizeTableKey(rawTableKey);
    group.activeTable = key;
    // Đảm bảo bảng này tồn tại
    if (!group.tables[key]) {
      this.getRoom(threadId, key);
    }
    this.saveData();
    return group.tables[key];
  }

  /**
   * Lấy phòng custom theo bảng chỉ định (hoặc bảng đang active)
   */
  getRoom(threadId, rawTableKey = null) {
    const group = this.getGroupState(threadId);
    const tableKey = rawTableKey ? normalizeTableKey(rawTableKey) : (group.activeTable || 'A');

    if (!group.tables[tableKey]) {
      const displayTable = tableKey.toUpperCase().startsWith('B') && !isNaN(tableKey.slice(1))
        ? tableKey.toUpperCase()
        : `Bảng ${tableKey.toUpperCase()}`;

      group.tables[tableKey] = {
        boxName: group.boxName || DEFAULT_BOX_NAME,
        adminCtk: group.adminCtk || DEFAULT_ADMIN_CTK,
        fee: DEFAULT_FEE,
        table: displayTable,
        time: null,
        linkIdmk: '',
        slots: createInitialSlots(),
        updatedAt: Date.now()
      };
      this.saveData();
    }

    const room = group.tables[tableKey];
    if (!Array.isArray(room.slots) || room.slots.length !== 12) {
      room.slots = createInitialSlots();
      this.saveData();
    }
    return room;
  }

  /**
   * Lấy danh sách toàn bộ các bảng trong nhóm
   */
  getAllRooms(threadId) {
    const group = this.getGroupState(threadId);
    const result = [];
    for (const [key, room] of Object.entries(group.tables || {})) {
      result.push({ key, room });
    }
    // Sắp xếp thứ tự bảng (A, B, C...)
    result.sort((a, b) => a.key.localeCompare(b.key));
    return result;
  }

  /**
   * Trích xuất danh sách tuyển thủ từ nội dung tin nhắn (loại bỏ hoàn toàn ký tự @)
   */
  extractPlayers(content, mentions = []) {
    let raw = (content || '').trim();
    // Bỏ các tiền tố lệnh ở đầu
    raw = raw.replace(/^[!\.\/]\s*(?:slot|add|cus|custom)?\s*/i, '').trim();

    const players = [];

    // Tách theo dấu phẩy hoặc xuống dòng
    let parts = [];
    if (raw.includes(',') || raw.includes('\n')) {
      parts = raw.split(/[\,\n]+/).map(s => s.trim()).filter(Boolean);
    } else if (raw.includes('@')) {
      parts = raw.split(/(?=@)/).map(s => s.trim()).filter(Boolean);
    } else {
      parts = [raw];
    }

    for (const part of parts) {
      let clean = part.trim();
      if (!clean) continue;

      let status = '💸';
      const statusMatch = clean.match(/([💸⏰🅿️]+)/);
      if (statusMatch) {
        status = statusMatch[1];
        clean = clean.replace(/[💸⏰🅿️]+/g, '').trim();
      }

      // Xóa tất cả các ký tự @ ở bất kỳ đâu trong tên
      clean = clean.replace(/@+/g, '').trim();
      clean = clean.replace(/^[\.,\-\s]+|[\.,\-\s]+$/g, '').trim();

      if (clean) {
        players.push({
          name: clean,
          status: status || '💸'
        });
      }
    }

    return players;
  }

  /**
   * Thêm các tuyển thủ vào các slot còn trống tiếp theo
   */
  addPlayers(threadId, players, rawTableKey = null) {
    const room = this.getRoom(threadId, rawTableKey);
    let addedCount = 0;
    const addedSlots = [];

    for (const p of players) {
      const emptySlot = room.slots.find(s => !s.name);
      if (!emptySlot) {
        break; // Đã đầy 12 slot
      }

      emptySlot.name = p.name ? p.name.replace(/@+/g, '').trim() : '';
      emptySlot.status = p.status || '💸';
      emptySlot.uid = p.uid || '';
      addedCount++;
      addedSlots.push(emptySlot.id);
    }

    room.updatedAt = Date.now();
    this.saveData();

    const filledCount = room.slots.filter(s => !!s.name).length;
    return {
      success: true,
      addedCount,
      totalAdded: players.length,
      isFull: filledCount >= 12,
      filledCount,
      addedSlots,
      room
    };
  }

  /**
   * Tự động tìm bảng và xếp slot cho người chơi vừa chuyển khoản (Smart Priority)
   */
  autoAssignPlayerWithBill(threadId, targetTime = null, targetTableKey = null, playerName = 'Thành viên', playerUid = '', targetAmount = null) {
    const group = this.getGroupState(threadId);
    const cleanName = playerName ? playerName.replace(/@+/g, '').trim() : 'Thành viên';
    const upcomingTime = getUpcomingTime();

    let chosenTableKey = null;
    let chosenRoom = null;
    let wasShifted = false;

    // 1. Nếu có cả GIỜ và BẢNG (vd: 22h B)
    if (targetTime && targetTableKey) {
      chosenTableKey = normalizeTableKey(targetTableKey);
      chosenRoom = this.getRoom(threadId, chosenTableKey);
      if (!chosenRoom.time) {
        chosenRoom.time = targetTime;
      }
      const emptySlot = chosenRoom.slots.find(s => !s.name);
      if (!emptySlot) {
        return {
          success: false,
          reason: 'TABLE_FULL',
          tableKey: chosenTableKey,
          room: chosenRoom,
          time: targetTime
        };
      }
      emptySlot.name = cleanName;
      emptySlot.status = '✅';
      emptySlot.uid = playerUid || '';
      chosenRoom.updatedAt = Date.now();
      this.saveData();
      return {
        success: true,
        room: chosenRoom,
        tableKey: chosenTableKey,
        slotIndex: emptySlot.id,
        time: chosenRoom.time || targetTime,
        wasShifted: false
      };
    }

    // 2. Nếu chỉ có GIỜ (vd: 22h)
    if (targetTime && !targetTableKey) {
      const allRooms = this.getAllRooms(threadId);

      // Ưu tiên 1: Bảng có giờ này và khớp mức phí của bill (nếu có targetAmount)
      if (targetAmount) {
        for (const { key, room } of allRooms) {
          if (isMatchingTime(room.time, targetTime) && room.slots.some(s => !s.name)) {
            const feeVal = this.parseFeeToNumber(room.fee || DEFAULT_FEE);
            if (feeVal === targetAmount) {
              chosenTableKey = key;
              chosenRoom = room;
              break;
            }
          }
        }
      }

      // Ưu tiên 2: Bảng có giờ này còn slot
      if (!chosenRoom) {
        for (const { key, room } of allRooms) {
          if (isMatchingTime(room.time, targetTime) && room.slots.some(s => !s.name)) {
            chosenTableKey = key;
            chosenRoom = room;
            break;
          }
        }
      }

      // Nếu chưa có bảng nào mang giờ này còn slot, kiểm tra bảng active (hoặc Bảng A)
      if (!chosenRoom) {
        const activeKey = this.getActiveTableKey(threadId);
        const activeRoom = this.getRoom(threadId, activeKey);
        if (activeRoom.slots.some(s => !s.name)) {
          chosenTableKey = activeKey;
          chosenRoom = activeRoom;
          if (!chosenRoom.time) chosenRoom.time = targetTime;
        } else {
          // Bảng chính đã đầy -> Tự động tìm hoặc tạo bảng tiếp theo (A -> B -> C...)
          const tableLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
          for (const letter of tableLetters) {
            const r = this.getRoom(threadId, letter);
            if (r.slots.some(s => !s.name)) {
              chosenTableKey = letter;
              chosenRoom = r;
              if (!chosenRoom.time) chosenRoom.time = targetTime;
              wasShifted = true;
              break;
            }
          }
        }
      }

      if (!chosenRoom) {
        return {
          success: false,
          reason: 'ALL_TABLES_FULL',
          time: targetTime
        };
      }

      const emptySlot = chosenRoom.slots.find(s => !s.name);
      emptySlot.name = cleanName;
      emptySlot.status = '✅';
      emptySlot.uid = playerUid || '';
      chosenRoom.updatedAt = Date.now();
      this.saveData();
      return {
        success: true,
        room: chosenRoom,
        tableKey: chosenTableKey,
        slotIndex: emptySlot.id,
        time: chosenRoom.time || targetTime,
        wasShifted
      };
    }

    // 3. Nếu chỉ có TÊN BẢNG (vd: B hoặc Bảng B)
    if (!targetTime && targetTableKey) {
      chosenTableKey = normalizeTableKey(targetTableKey);
      chosenRoom = this.getRoom(threadId, chosenTableKey);
      if (!chosenRoom.time) {
        chosenRoom.time = upcomingTime;
      }
      const emptySlot = chosenRoom.slots.find(s => !s.name);
      if (!emptySlot) {
        return {
          success: false,
          reason: 'TABLE_FULL',
          tableKey: chosenTableKey,
          room: chosenRoom,
          time: chosenRoom.time || upcomingTime
        };
      }
      emptySlot.name = cleanName;
      emptySlot.status = '✅';
      emptySlot.uid = playerUid || '';
      chosenRoom.updatedAt = Date.now();
      this.saveData();
      return {
        success: true,
        room: chosenRoom,
        tableKey: chosenTableKey,
        slotIndex: emptySlot.id,
        time: chosenRoom.time || upcomingTime,
        wasShifted: false
      };
    }

    // 4. KHÔNG GHI GÌ CẢ (Chỉ gửi mỗi ảnh bill) -> Tự động 100%
    // Ưu tiên 1: Tìm bảng khớp mức phí của bill nếu có targetAmount
    if (targetAmount) {
      const allRooms = this.getAllRooms(threadId);
      for (const { key, room } of allRooms) {
        if (room.slots.some(s => !s.name)) {
          const feeVal = this.parseFeeToNumber(room.fee || DEFAULT_FEE);
          if (feeVal === targetAmount) {
            chosenTableKey = key;
            chosenRoom = room;
            if (!chosenRoom.time) chosenRoom.time = upcomingTime;
            break;
          }
        }
      }
    }

    // Ưu tiên 2: Bảng active
    if (!chosenRoom) {
      const activeKey = this.getActiveTableKey(threadId);
      const activeRoom = this.getRoom(threadId, activeKey);

      if (activeRoom.slots.some(s => !s.name)) {
        chosenTableKey = activeKey;
        chosenRoom = activeRoom;
        if (!chosenRoom.time) chosenRoom.time = upcomingTime;
      } else {
        // Bảng active đã đầy -> Tìm bảng tiếp theo còn slot (A -> B -> C...)
        const tableLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
        for (const letter of tableLetters) {
          const r = this.getRoom(threadId, letter);
          if (r.slots.some(s => !s.name)) {
            chosenTableKey = letter;
            chosenRoom = r;
            if (!chosenRoom.time) chosenRoom.time = upcomingTime;
            wasShifted = true;
            break;
          }
        }
      }
    }

    if (!chosenRoom) {
      return {
        success: false,
        reason: 'ALL_TABLES_FULL',
        time: upcomingTime
      };
    }

    const emptySlot = chosenRoom.slots.find(s => !s.name);
    emptySlot.name = cleanName;
    emptySlot.status = '✅';
    emptySlot.uid = playerUid || '';
    chosenRoom.updatedAt = Date.now();
    this.saveData();
    return {
      success: true,
      room: chosenRoom,
      tableKey: chosenTableKey,
      slotIndex: emptySlot.id,
      time: chosenRoom.time || upcomingTime,
      wasShifted
    };
  }

  /**
   * Di chuyển hoặc đổi ca / bảng cho người chơi (dành cho trường hợp quên nội dung CK và trượt tin nhắn bổ sung)
   */
  relocatePlayerSlot(threadId, playerUid, playerName, targetTime = null, targetTableKey = null) {
    const cleanName = playerName ? playerName.replace(/@+/g, '').trim() : 'Thành viên';
    const allRooms = this.getAllRooms(threadId);

    // 1. Tìm vị trí hiện tại của người chơi trong tất cả các bảng của nhóm này
    let foundLocation = null;
    for (const { key, room } of allRooms) {
      const slot = room.slots.find(s => (playerUid && s.uid === playerUid) || (s.name && s.name.toLowerCase() === cleanName.toLowerCase()));
      if (slot) {
        foundLocation = {
          tableKey: key,
          room,
          slot,
          status: slot.status || '✅'
        };
        break;
      }
    }

    // 2. Nếu chưa từng ở bảng nào -> Gọi trực tiếp autoAssignPlayerWithBill
    if (!foundLocation) {
      const assign = this.autoAssignPlayerWithBill(threadId, targetTime, targetTableKey, cleanName, playerUid);
      return {
        ...assign,
        isNewAssign: true
      };
    }

    // 3. Nếu đã có slot cũ: Tạm thời giải phóng slot cũ
    const oldLocation = { ...foundLocation };
    foundLocation.slot.name = '';
    foundLocation.slot.uid = '';
    foundLocation.slot.status = '💸';

    // Xác định ca và bảng đích cần chuyển sang
    const effectiveTime = targetTime || oldLocation.room.time || getUpcomingTime();
    const effectiveTableKey = targetTableKey || oldLocation.tableKey;

    const newRoom = this.getRoom(threadId, effectiveTableKey);
    if (targetTime) newRoom.time = targetTime;

    const emptySlot = newRoom.slots.find(s => !s.name);
    if (!emptySlot) {
      // Khôi phục slot cũ vì bảng mới bị đầy
      foundLocation.slot.name = cleanName;
      foundLocation.slot.uid = playerUid;
      foundLocation.slot.status = oldLocation.status;
      this.saveData();
      return {
        success: false,
        reason: 'TARGET_TABLE_FULL',
        tableKey: effectiveTableKey,
        oldRoom: oldLocation.room,
        oldSlotId: oldLocation.slot.id,
        room: newRoom,
        time: effectiveTime
      };
    }

    // Gán vào slot mới
    emptySlot.name = cleanName;
    emptySlot.uid = playerUid || '';
    emptySlot.status = oldLocation.status || '✅';
    newRoom.updatedAt = Date.now();
    this.saveData();

    return {
      success: true,
      isRelocated: true,
      oldTableKey: oldLocation.tableKey,
      oldRoom: oldLocation.room,
      oldSlotId: oldLocation.slot.id,
      tableKey: effectiveTableKey,
      room: newRoom,
      slotIndex: emptySlot.id,
      time: newRoom.time || effectiveTime
    };
  }

  /**
   * Gán hoặc thay thế tuyển thủ vào một slot cụ thể (1-12)
   */
  setSlot(threadId, slotIndex, name, status = '💸', uid = '', rawTableKey = null) {
    const room = this.getRoom(threadId, rawTableKey);
    const idx = parseInt(slotIndex, 10);
    if (isNaN(idx) || idx < 1 || idx > 12) {
      return { success: false, error: 'Số slot phải từ 1 đến 12' };
    }

    const targetSlot = room.slots[idx - 1];
    targetSlot.name = name ? name.replace(/@+/g, '').trim() : '';
    targetSlot.status = status || '💸';
    targetSlot.uid = uid || '';

    room.updatedAt = Date.now();
    this.saveData();

    return { success: true, slot: targetSlot, room };
  }

  /**
   * Hủy một hoặc nhiều slot (xóa tên)
   */
  removeSlots(threadId, slotIndices, rawTableKey = null) {
    const room = this.getRoom(threadId, rawTableKey);
    const indices = Array.isArray(slotIndices) ? slotIndices : [slotIndices];
    let removedCount = 0;

    for (const rawIdx of indices) {
      const idx = parseInt(rawIdx, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= 12) {
        const slot = room.slots[idx - 1];
        if (slot.name) {
          slot.name = '';
          slot.status = '💸';
          slot.uid = '';
          removedCount++;
        }
      }
    }

    room.updatedAt = Date.now();
    this.saveData();

    return { success: true, removedCount, room };
  }

  /**
   * Cập nhật trạng thái cho slot (ví dụ đóng phí 💸, hẹn giờ ⏰)
   */
  updateSlotStatus(threadId, slotIndices, status = '💸', rawTableKey = null) {
    const room = this.getRoom(threadId, rawTableKey);
    const indices = Array.isArray(slotIndices) ? slotIndices : [slotIndices];
    let updatedCount = 0;

    for (const rawIdx of indices) {
      const idx = parseInt(rawIdx, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= 12) {
        const slot = room.slots[idx - 1];
        slot.status = status;
        updatedCount++;
      }
    }

    room.updatedAt = Date.now();
    this.saveData();

    return { success: true, updatedCount, room };
  }

  /**
   * Tạo bảng custom mới với tên bảng không trùng lặp (tự động A -> A1 -> A2... hoặc B -> B1 -> B2...)
   */
  createRoom(threadId, options = {}) {
    const group = this.getGroupState(threadId);

    // Bảng được coi là "đang sử dụng" nếu nó đã có giờ hoặc đã có tuyển thủ đăng ký
    const isOccupied = (room) => {
      if (!room) return false;
      if (room.time) return true;
      if (Array.isArray(room.slots) && room.slots.some(s => s.name)) return true;
      return false;
    };

    let finalKey = null;
    let isRenamed = false;
    let originalKey = null;

    if (options.table) {
      originalKey = normalizeTableKey(options.table);
      const existing = group.tables[originalKey];

      if (existing && isOccupied(existing)) {
        // Tên bảng đã tồn tại và đang được sử dụng -> Thêm số phía sau: A -> A1, A2... hoặc B -> B1, B2...
        const prefixMatch = originalKey.match(/^([A-Za-z]+)/);
        const prefix = prefixMatch ? prefixMatch[1].toUpperCase() : 'A';

        let counter = 1;
        while (group.tables[`${prefix}${counter}`] && isOccupied(group.tables[`${prefix}${counter}`])) {
          counter++;
        }
        finalKey = `${prefix}${counter}`;
        isRenamed = true;
      } else {
        finalKey = originalKey;
      }
    } else {
      // Người dùng không chỉ định tên bảng: Tự tìm chữ cái trống tiếp theo (A -> B -> C -> D...)
      const defaultLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
      for (const letter of defaultLetters) {
        if (!group.tables[letter] || !isOccupied(group.tables[letter])) {
          finalKey = letter;
          break;
        }
      }
      if (!finalKey) {
        let counter = 1;
        while (group.tables[`A${counter}`] && isOccupied(group.tables[`A${counter}`])) {
          counter++;
        }
        finalKey = `A${counter}`;
      }
    }

    const displayTable = `Bảng ${finalKey}`;
    const newRoom = {
      boxName: options.boxName || group.boxName || DEFAULT_BOX_NAME,
      adminCtk: options.adminCtk || group.adminCtk || DEFAULT_ADMIN_CTK,
      fee: options.fee ? options.fee.toLowerCase() : DEFAULT_FEE,
      table: displayTable,
      time: options.time !== undefined ? options.time : getUpcomingTime(),
      linkIdmk: options.linkIdmk !== undefined ? options.linkIdmk : '',
      slots: createInitialSlots(),
      updatedAt: Date.now()
    };

    group.tables[finalKey] = newRoom;
    group.activeTable = finalKey;
    this.saveData();

    return { key: finalKey, room: newRoom, isRenamed, originalKey };
  }

  /**
   * Tạo mới hoặc reset toàn bộ bảng custom
   */
  resetRoom(threadId, options = {}, rawTableKey = null) {
    // Nếu options có chỉ định bảng (ví dụ 'B' hoặc 'Bảng B')
    let targetKey = rawTableKey;
    if (options.tableKey) {
      targetKey = options.tableKey;
    } else if (options.table) {
      targetKey = normalizeTableKey(options.table);
    }

    const group = this.getGroupState(threadId);
    if (targetKey) {
      group.activeTable = normalizeTableKey(targetKey);
    }

    const room = this.getRoom(threadId, targetKey);
    room.slots = createInitialSlots();
    if (options.time !== undefined) room.time = options.time;
    if (options.fee !== undefined) room.fee = options.fee.toLowerCase();
    if (options.table !== undefined) room.table = options.table;
    if (options.boxName !== undefined) room.boxName = options.boxName;
    if (options.adminCtk !== undefined) room.adminCtk = options.adminCtk;
    if (options.linkIdmk !== undefined) room.linkIdmk = options.linkIdmk;

    room.updatedAt = Date.now();
    this.saveData();

    return room;
  }

  /**
   * Xóa một bảng khỏi danh sách
   */
  deleteTable(threadId, rawTableKey) {
    const group = this.getGroupState(threadId);
    const key = normalizeTableKey(rawTableKey);
    if (group.tables[key]) {
      delete group.tables[key];
      const remainingKeys = Object.keys(group.tables);
      if (remainingKeys.length > 0) {
        group.activeTable = remainingKeys[0];
      } else {
        group.activeTable = 'A';
      }
      this.saveData();
      return true;
    }
    return false;
  }

  /**
   * Xóa tất cả các bảng cũ trong nhóm (xóa sạch hoàn toàn, không tạo bảng trống)
   */
  deleteAllTables(threadId) {
    const group = this.getGroupState(threadId);
    const count = Object.keys(group.tables || {}).length;
    group.tables = {};
    group.activeTable = null;
    this.saveData();
    return { count };
  }

  /**
   * Xóa tất cả các bảng theo khung giờ chỉ định (vd: 14h, 19h)
   */
  deleteTablesByTime(threadId, targetTime) {
    const group = this.getGroupState(threadId);
    let deletedCount = 0;
    const deletedNames = [];

    for (const [key, room] of Object.entries(group.tables || {})) {
      if (room.time && isMatchingTime(room.time, targetTime)) {
        deletedNames.push(room.table || `Bảng ${key}`);
        delete group.tables[key];
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      const remainingKeys = Object.keys(group.tables);
      if (remainingKeys.length > 0) {
        group.activeTable = remainingKeys[0];
      } else {
        group.activeTable = 'A';
        group.tables['A'] = {
          boxName: group.boxName || DEFAULT_BOX_NAME,
          adminCtk: group.adminCtk || DEFAULT_ADMIN_CTK,
          fee: DEFAULT_FEE,
          table: 'Bảng A',
          time: null,
          linkIdmk: '',
          slots: createInitialSlots(),
          updatedAt: Date.now()
        };
      }
      this.saveData();
      return { success: true, count: deletedCount, deletedNames };
    }
    return { success: false, count: 0, deletedNames: [] };
  }

  setTime(threadId, timeStr, rawTableKey = null) {
    const room = this.getRoom(threadId, rawTableKey);
    room.time = timeStr ? timeStr.trim() : null;
    room.updatedAt = Date.now();
    this.saveData();
    return room;
  }

  setFee(threadId, feeStr, rawTableKey = null) {
    const room = this.getRoom(threadId, rawTableKey);
    room.fee = feeStr ? feeStr.trim().toLowerCase() : DEFAULT_FEE;
    room.updatedAt = Date.now();
    this.saveData();
    return room;
  }

  setTable(threadId, tableStr, rawTableKey = null) {
    const room = this.getRoom(threadId, rawTableKey);
    room.table = tableStr ? tableStr.trim() : DEFAULT_TABLE;
    room.updatedAt = Date.now();
    this.saveData();
    return room;
  }

  setAdminCtk(threadId, ctkStr, rawTableKey = null) {
    const group = this.getGroupState(threadId);
    const cleanCtk = ctkStr ? ctkStr.trim() : DEFAULT_ADMIN_CTK;
    group.adminCtk = cleanCtk;
    if (group.tables) {
      for (const t of Object.values(group.tables)) {
        if (t) t.adminCtk = cleanCtk;
      }
    }
    const room = this.getRoom(threadId, rawTableKey);
    room.adminCtk = cleanCtk;
    room.updatedAt = Date.now();
    this.saveData();
    return room;
  }

  setBoxName(threadId, nameStr, rawTableKey = null) {
    const group = this.getGroupState(threadId);
    const cleanName = nameStr ? nameStr.trim() : DEFAULT_BOX_NAME;
    group.boxName = cleanName;
    if (group.tables) {
      for (const t of Object.values(group.tables)) {
        if (t) t.boxName = cleanName;
      }
    }
    const room = this.getRoom(threadId, rawTableKey);
    room.boxName = cleanName;
    room.updatedAt = Date.now();
    this.saveData();
    return room;
  }

  setLinkIdmk(threadId, linkStr, rawTableKey = null) {
    const room = this.getRoom(threadId, rawTableKey);
    room.linkIdmk = linkStr ? linkStr.trim() : '';
    room.updatedAt = Date.now();
    this.saveData();
    return room;
  }

  /**
   * Định dạng 1 bảng Custom đơn lẻ
   */
  formatBoard(room) {
    const boxName = room.boxName || DEFAULT_BOX_NAME;
    const feeRaw = (room.fee || DEFAULT_FEE).toLowerCase();
    const feeKey = feeRaw.replace(/[^0-9k]/gi, '');
    const prizes = PRIZE_POOLS[feeKey] || {
      feeLabel: feeRaw.toUpperCase(),
      top1: '38k',
      top2: '12k',
      top3: '6k'
    };

    const timeLabel = room.time || getUpcomingTime();
    const tableLabel = room.table || DEFAULT_TABLE;
    const adminCtk = room.adminCtk || DEFAULT_ADMIN_CTK;

    let text = `${boxName} 🌸 ${prizes.feeLabel}\n`;
    text += `🏆 Giải Thưởng 🏆\n`;
    text += `Lệ Phí ${prizes.feeLabel} 📌\n`;
    text += `Top🥇${prizes.top1}\n`;
    text += `Top🥈${prizes.top2}\n`;
    text += `Top🥉${prizes.top3}\n`;
    text += `—·—·—·—·—·—·—·—·—·—·—·—·—·—·—·—·\n`;
    text += `⏳${timeLabel}⏳ bảng ${feeRaw}🍀 ${tableLabel}\n`;
    if (room.linkIdmk) {
      text += `📣 Link IDMK ở cuối danh sách\n`;
    }

    for (let i = 0; i < 12; i++) {
      const keycap = KEYCAP_NUMBERS[i];
      const slot = room.slots[i];
      if (slot && slot.name) {
        const cleanName = slot.name.replace(/@+/g, '').trim();
        const statusIcon = slot.status ? ` ${slot.status}` : ' 💸';
        text += `${keycap} ${cleanName}${statusIcon}\n`;
      } else {
        text += `${keycap}\n`;
      }
    }

    if (room.linkIdmk) {
      text += `\n${room.linkIdmk}\n`;
    }

    text += `—·—·—·—·—·—·—·—·—·—·—·—·—·—·—·—·\n`;
    text += `CTK + Bill : ${adminCtk}`;

    return text;
  }

  /**
   * Định dạng TẤT CẢ các bảng trong nhóm (gộp chung Bảng A, Bảng B... giống hệt mẫu ban đầu)
   */
  formatAllBoards(threadId) {
    const allRooms = this.getAllRooms(threadId);
    if (allRooms.length === 0) {
      return `ℹ️ Hiện tại chưa có bảng thi đấu nào!\n👉 Admin dùng lệnh: .taocus [giờ] [giá] [bảng] để tạo bảng mới (vd: .taocus 18h 6k A).`;
    }
    if (allRooms.length === 1) {
      return this.formatBoard(allRooms[0].room);
    }

    const firstRoom = allRooms[0].room;
    const boxName = firstRoom.boxName || DEFAULT_BOX_NAME;
    const adminCtk = firstRoom.adminCtk || DEFAULT_ADMIN_CTK;

    // Lấy các mức phí duy nhất trong các bảng
    const fees = Array.from(new Set(allRooms.map(r => (r.room.fee || DEFAULT_FEE).toLowerCase())));
    const feeTitle = fees.map(f => f.toUpperCase()).join(' - ');

    let text = `${boxName} 🌸 ${feeTitle}\n`;
    text += `🏆 Giải Thưởng 🏆\n`;
    fees.forEach(f => {
      const feeKey = f.replace(/[^0-9k]/gi, '');
      const p = PRIZE_POOLS[feeKey] || { feeLabel: f.toUpperCase(), top1: '38k', top2: '12k', top3: '6k' };
      text += `Lệ Phí ${p.feeLabel} 📌\n`;
      text += `Top🥇${p.top1}\n`;
      text += `Top🥈${p.top2}\n`;
      text += `Top🥉${p.top3}\n`;
    });

    // In từng bảng một
    allRooms.forEach(({ room }) => {
      const feeRaw = (room.fee || DEFAULT_FEE).toLowerCase();
      const timeLabel = room.time || getUpcomingTime();
      const tableLabel = room.table || DEFAULT_TABLE;

      text += `—·—·—·—·—·—·—·—·—·—·—·—·—·—·—·—·\n`;
      text += `⏳${timeLabel} - ${feeRaw.toUpperCase()}⏳ ${tableLabel}\n`;
      if (room.linkIdmk) {
        text += `📣 Link IDMK ở cuối danh sách\n`;
      }

      for (let i = 0; i < 12; i++) {
        const keycap = KEYCAP_NUMBERS[i];
        const slot = room.slots[i];
        if (slot && slot.name) {
          const cleanName = slot.name.replace(/@+/g, '').trim();
          const statusIcon = slot.status ? ` ${slot.status}` : ' 💸';
          text += `${keycap} ${cleanName}${statusIcon}\n`;
        } else {
          text += `${keycap}\n`;
        }
      }

      if (room.linkIdmk) {
        text += `\n${room.linkIdmk}\n`;
      }
    });

    text += `—·—·—·—·—·—·—·—·—·—·—·—·—·—·—·—·\n`;
    text += `CTK + Bill : ${adminCtk}`;

    return text;
  }
}

export const customService = new CustomService();
