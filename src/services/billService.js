import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createWorker } from 'tesseract.js';
import { getUpcomingTime } from './customService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const USED_BILLS_FILE = path.join(DATA_DIR, 'used_bills.json');
const TEMP_DIR = path.resolve(__dirname, '../../assets/output');

// Tên chủ tài khoản và số tài khoản ngân hàng mặc định
export const ADMIN_RECIPIENT_NAMES = [
  'LE DAI QUY',
  'LÊ ĐẠI QUÝ',
  'LE ĐAI QUY',
  'LÊ ĐAI QUY',
  'LE DAI QUÝ'
];

export const ADMIN_ACCOUNT_NUMBERS = [
  '10002610909',
  '1000 2610 909',
  '1000261090'
];

class BillService {
  constructor() {
    this.usedBills = new Map();
    this.usedImageHashes = new Map();
    this.ocrWorker = null;
    this.isWorkerReady = false;
    this.initWorker();
    this.loadUsedBills();
  }

  ensureDirs() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  }

  loadUsedBills() {
    try {
      this.ensureDirs();
      if (fs.existsSync(USED_BILLS_FILE)) {
        const raw = fs.readFileSync(USED_BILLS_FILE, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach((item) => {
            if (item.id) this.usedBills.set(item.id, item);
            if (item.imageHash) this.usedImageHashes.set(item.imageHash, item);
          });
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu used_bills.json:', err);
    }
  }

  saveUsedBills() {
    try {
      this.ensureDirs();
      const list = Array.from(this.usedBills.values());
      fs.writeFileSync(USED_BILLS_FILE, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.error('Lỗi khi lưu used_bills.json:', err);
    }
  }

  async initWorker() {
    try {
      this.ocrWorker = await createWorker('vie+eng');
      this.isWorkerReady = true;
      console.log('🤖 [BillService] OCR Worker đã sẵn sàng nhận diện Bill!');
    } catch (err) {
      console.error('⚠️ [BillService] Không thể khởi tạo Tesseract worker:', err);
    }
  }

  async getWorker() {
    if (this.isWorkerReady && this.ocrWorker) {
      return this.ocrWorker;
    }
    await this.initWorker();
    return this.ocrWorker;
  }

  /**
   * Tải ảnh từ URL (Zalo CDN hoặc local) về máy
   */
  async downloadImage(url) {
    this.ensureDirs();
    const tempPath = path.join(TEMP_DIR, `bill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.png`);

    if (url.startsWith('file://') || fs.existsSync(url)) {
      const localPath = url.replace('file://', '');
      fs.copyFileSync(localPath, tempPath);
      return tempPath;
    }

    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    fs.writeFileSync(tempPath, Buffer.from(response.data));
    return tempPath;
  }

  /**
   * Chuẩn hóa văn bản để so khớp không dấu
   */
  normalizeText(str) {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toUpperCase()
      .trim();
  }

  /**
   * Lấy thời gian hiện tại theo múi giờ Việt Nam (UTC+7)
   */
  getVietnamNow() {
    const now = new Date();
    const vnTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
    return new Date(vnTimeStr);
  }

  /**
   * Trích xuất ngày và giờ giao dịch từ nội dung biên lai
   */
  parseTransactionTime(rawText) {
    const text = rawText.replace(/\s+/g, ' ');

    let day = null, month = null, year = null;
    // Dạng chữ: "11 Tháng 09, 2026", "11 Th09 2026", "ngày 11 tháng 9"
    const textMonthMatch = text.match(/\b(\d{1,2})\s*(?:tháng|th|thg)\s*(\d{1,2})(?:[\s,]+(?:năm\s*)?(\d{4}))?/i);
    if (textMonthMatch) {
      day = parseInt(textMonthMatch[1], 10);
      month = parseInt(textMonthMatch[2], 10);
      if (textMonthMatch[3]) year = parseInt(textMonthMatch[3], 10);
    }

    // Dạng số: "11/09/2026", "11-09-2026", "11.09.2026", "11/09"
    if (!day || !month) {
      const dateMatch = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{4}|\d{2}))?\b/);
      if (dateMatch) {
        day = parseInt(dateMatch[1], 10);
        month = parseInt(dateMatch[2], 10);
        if (dateMatch[3]) {
          let y = parseInt(dateMatch[3], 10);
          if (y < 100) y += 2000;
          year = y;
        }
      }
    }

    // Giờ: "12:45:10", "12:45", "12h45", "12:5", "12 giờ 45", "01:15 PM", "1:15 CH"
    let hour = null, minute = null, second = 0;
    const timeMatch = text.match(/\b([01]?\d|2[0-3])[:hH]([0-5]?\d)(?:[:sS]([0-5]?\d))?\s*(?:p|phút)?\s*(AM|PM|CH|SA)?\b/i)
      || text.match(/\b([01]?\d|2[0-3])\s*giờ\s*([0-5]?\d)\b/i);
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = parseInt(timeMatch[2], 10);
      if (timeMatch[3] && !isNaN(parseInt(timeMatch[3], 10))) second = parseInt(timeMatch[3], 10);
      const ampm = (timeMatch[4] || '').toUpperCase();
      if ((ampm === 'PM' || ampm === 'CH') && hour < 12) {
        hour += 12;
      } else if ((ampm === 'AM' || ampm === 'SA') && hour === 12) {
        hour = 0;
      }
    }

    return { day, month, year, hour, minute, second };
  }

  /**
   * Xác thực tính hợp lệ của thời gian trên bill:
   * - Phải trong ngày hôm nay (múi giờ VN)
   * - Không được ở tương lai (> 3 phút)
   * - Không được quá cũ (> 30 phút)
   */
  validateTransactionTime(timeObj) {
    if (!timeObj || (timeObj.day === null && timeObj.hour === null)) {
      return {
        valid: false,
        reason: 'NO_TIMESTAMP',
        detail: 'Không tìm thấy ngày giờ giao dịch trên ảnh bill! Vui lòng chụp rõ ngày giờ giao dịch.'
      };
    }

    const vnNow = this.getVietnamNow();
    const curDay = vnNow.getDate();
    const curMonth = vnNow.getMonth() + 1;
    const curYear = vnNow.getFullYear();

    // 1. Kiểm tra ngày nếu có
    if (timeObj.day !== null && timeObj.month !== null) {
      const billYear = timeObj.year || curYear;
      const isSameDay = (timeObj.day === curDay && timeObj.month === curMonth && billYear === curYear);

      if (!isSameDay) {
        // Cho phép giao dịch qua đêm cách nhau tối đa 30 phút (ví dụ 23:45 hôm trước -> 00:15 hôm sau)
        const yesterday = new Date(vnNow);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = (timeObj.day === yesterday.getDate() && timeObj.month === (yesterday.getMonth() + 1) && billYear === yesterday.getFullYear());

        if (isYesterday && timeObj.hour === 23 && vnNow.getHours() === 0 && (60 - timeObj.minute + vnNow.getMinutes() <= 30)) {
          // Hợp lệ qua đêm
        } else {
          const billDateStr = `${timeObj.day}/${timeObj.month}/${billYear}`;
          const curDateStr = `${curDay}/${curMonth}/${curYear}`;
          return {
            valid: false,
            reason: 'EXPIRED_DATE',
            detail: `Ngày giao dịch trên bill (${billDateStr}) không phải hôm nay (${curDateStr})!`
          };
        }
      }
    }

    // 2. Kiểm tra giờ nếu có
    if (timeObj.hour !== null && timeObj.minute !== null) {
      const billDay = timeObj.day || curDay;
      const billMonth = (timeObj.month ? timeObj.month - 1 : vnNow.getMonth());
      const billYear = timeObj.year || curYear;

      const billDate = new Date(billYear, billMonth, billDay, timeObj.hour, timeObj.minute, timeObj.second || 0);
      const diffMinutes = (vnNow.getTime() - billDate.getTime()) / (60 * 1000);

      if (diffMinutes < -3) {
        const timeStr = `${String(timeObj.hour).padStart(2, '0')}:${String(timeObj.minute).padStart(2, '0')}`;
        return {
          valid: false,
          reason: 'FUTURE_TIME',
          detail: `Thời gian trên bill (${timeStr}) ở tương lai so với thời gian hiện tại! Nghi vấn bill tạo giả.`
        };
      }

      if (diffMinutes > 30) {
        const timeStr = `${String(timeObj.hour).padStart(2, '0')}:${String(timeObj.minute).padStart(2, '0')}`;
        const curTimeStr = `${String(vnNow.getHours()).padStart(2, '0')}:${String(vnNow.getMinutes()).padStart(2, '0')}`;
        return {
          valid: false,
          reason: 'EXPIRED_TIME',
          detail: `Bill đã chuyển cách đây hơn 30 phút (${timeStr} - hiện tại: ${curTimeStr}). Vui lòng chỉ gửi bill vừa chuyển!`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Phân tích văn bản OCR để trích xuất thông tin Bill (Smart Anti-Fake)
   */
  parseBillText(rawText, imageBuffer = null, expectedRecipients = [], expectedAccounts = [], expectedBankName = '') {
    const norm = this.normalizeText(rawText);

    // 1. Kiểm tra dấu hiệu là biên lai / bill ngân hàng (yêu cầu ít nhất 2 từ khóa)
    const billKeywords = [
      'CHUYEN TIEN', 'CHUYEN KHOAN', 'THANH CONG', 'GIAO DICH', 'BIEN LAI',
      'TIEN CHUYEN', 'SO DU', 'VIETQR', 'NAPAS', 'TPBANK', 'MBBANK',
      'VIETCOMBANK', 'TECHCOMBANK', 'VPBANK', 'ACB', 'BIDV', 'VIETINBANK',
      'MOMO', 'ZALOPAY', 'SUCCESSFUL', 'COMPLETE', 'DA CHUYEN', 'HOAN THANH',
      'NGUOI THU HUONG', 'NGUOI NHAN', 'MA GD', 'THAM CHIEU', 'SO TIEN',
      'CHI TIET', 'TAI KHOAN', 'XAC NHAN', 'VND'
    ];

    const matchedKeywords = billKeywords.filter(kw => norm.includes(kw));
    const isLikelyBill = matchedKeywords.length >= 2;

    if (!isLikelyBill) {
      return { isBill: false };
    }

    // 2. Kiểm tra từ khóa giao dịch thất bại / đang xử lý
    const failKeywords = [
      'DANG XU LY', 'CHO XU LY', 'PENDING', 'THAT BAI',
      'FAILED', 'KHONG THANH CONG', 'HUY GIAO DICH', 'LOI GIAO DICH'
    ];
    const hasFailStatus = failKeywords.some(kw => norm.includes(kw));

    // 3. Kiểm tra tên người nhận hoặc số tài khoản (hỗ trợ tài khoản riêng của nhóm thuê)
    const allRecipients = [...expectedRecipients, ...ADMIN_RECIPIENT_NAMES].filter(Boolean);
    const allAccounts = [...expectedAccounts, ...ADMIN_ACCOUNT_NUMBERS].filter(Boolean);

    let matchedRecipient = null;
    for (const name of allRecipients) {
      if (!name) continue;
      const normName = this.normalizeText(name);
      if (norm.includes(normName)) {
        matchedRecipient = name;
        break;
      }
      // Hỗ trợ kiểm tra nếu tất cả các từ trong tên đều xuất hiện (chống lỗi ngắt dòng OCR)
      const parts = normName.split(/\s+/).filter(w => w.length >= 2);
      if (parts.length >= 2 && parts.every(p => norm.includes(p))) {
        matchedRecipient = name;
        break;
      }
    }

    let matchedAccount = null;
    const digitsOnlyRaw = rawText.replace(/\D/g, '');
    for (const acc of allAccounts) {
      if (!acc) continue;
      const cleanAcc = String(acc).replace(/\D/g, '');
      if (!cleanAcc) continue;

      // 1. Trùng khớp toàn bộ STK (bỏ qua khoảng trắng, dấu gạch, dấu chấm)
      if (digitsOnlyRaw.includes(cleanAcc)) {
        matchedAccount = acc;
        break;
      }

      // 2. Trùng khớp số đuôi / số masked (vd: 098***4321 hoặc che sao)
      if (cleanAcc.length >= 6) {
        const last4 = cleanAcc.slice(-4);
        const last6 = cleanAcc.slice(-6);
        const first3 = cleanAcc.slice(0, 3);
        const maskedRegex = new RegExp(`(?:${first3}[^0-9\\n\\r]{0,6})?[*xX•\\.]{2,8}${last4}`, 'i');
        if (maskedRegex.test(rawText) || digitsOnlyRaw.includes(last6)) {
          matchedAccount = acc;
          break;
        }
      }
    }

    let matchedBank = false;
    if (expectedBankName) {
      const normBank = this.normalizeText(expectedBankName);
      if (norm.includes(normBank)) {
        matchedBank = true;
      }
    }

    // Hợp lệ nếu khớp tên người nhận HOẶC khớp số tài khoản (kể cả dạng che sao) HOẶC khớp ngân hàng và có dấu hiệu chuyển khoản
    const isValidRecipient = !!(matchedRecipient || matchedAccount || (matchedBank && (matchedRecipient || matchedAccount || digitsOnlyRaw.length >= 4)));

    // 4. Trích xuất số tiền chuyển
    let amount = null;

    // Ưu tiên 1: Có từ khóa chỉ số tiền cụ thể
    const explicitAmount = rawText.match(/(?:số\s*tiền|tiền(?:\s*chuyển)?|amount|giao\s*dịch)[:\s]*([1-9]\d{0,2}(?:[\.,]\d{3})+|[1-9]\d{3,6})/i);
    if (explicitAmount) {
      const clean = explicitAmount[1].replace(/[\.,]/g, '');
      const val = parseInt(clean, 10);
      if (!isNaN(val) && val >= 1000 && val <= 10000000) {
        amount = val;
      }
    }

    // Ưu tiên 2: Số có định dạng hàng nghìn (ví dụ 6.000, 7.000, 6,000) kèm VND hoặc đứng độc lập
    if (!amount) {
      const thousandMatches = rawText.match(/\b([1-9]\d{0,2}(?:[\.,]\d{3})+)\s*(?:vnd|đ|d)?\b/i);
      if (thousandMatches) {
        const clean = thousandMatches[1].replace(/[\.,]/g, '');
        const val = parseInt(clean, 10);
        if (!isNaN(val) && val >= 1000 && val <= 10000000) {
          amount = val;
        }
      }
    }

    // Ưu tiên 3: Dạng 6k, 7k, 3k, 5k
    if (!amount) {
      const kMatch = rawText.match(/\b([1-9]\d{0,2})\s*k\b/i);
      if (kMatch) {
        amount = parseInt(kMatch[1], 10) * 1000;
      }
    }

    // 5. Trích xuất mã giao dịch ngân hàng (Transaction ID)
    let transactionCode = null;
    const codeMatch = rawText.match(/(?:MÃ\s*(?:GIAO\s*DỊCH|GD)|REF(?:\s*NO)?|SỐ\s*THAM\s*CHIẾU|SỐ\s*GIAO\s*DỊCH|SỐ\s*BÚT\s*TOÁN|TRANSACTION\s*(?:ID|NO)?|TRACE(?:\s*NO)?|MÃ\s*TRA\s*SOÁT)[:\s]*([A-Z0-9\-_]{6,30})/i)
      || rawText.match(/\b(FT\d{8,25}|MB\d{8,25}|GD\d{8,25}|VND\d{8,25}|VCB\d{8,25}|MM\d{9,15})\b/i);

    if (codeMatch) {
      const candidate = codeMatch[1].trim().toUpperCase();
      const blacklistWords = ['SUCCESS', 'THANHCONG', 'HOANTHANH', 'TIENCHUYEN', 'NGUOITHUHUONG', 'TAIKHOAN', 'CHUYENTIEN', 'TRANSACTION', 'GIAODICH'];
      if (!blacklistWords.includes(candidate)) {
        transactionCode = candidate;
      }
    }

    // 6. Tính MD5 hash của ảnh để chống gửi lại cùng 1 file ảnh
    let imageHash = null;
    if (imageBuffer) {
      imageHash = crypto.createHash('md5').update(imageBuffer).digest('hex');
    }

    // 7. Trích xuất thời gian trên bill
    const timeObj = this.parseTransactionTime(rawText);

    // 8. Trích xuất nội dung chuyển khoản trên bill (nếu có)
    let memo = '';
    const memoMatch = rawText.match(/\b(?:nội\s*dung|lời\s*nhắn|nd|message)[:\s]*([^\n\r]{2,60})/i);
    if (memoMatch) {
      memo = memoMatch[1].trim();
    }

    return {
      isBill: true,
      hasFailStatus,
      isValidRecipient,
      matchedRecipient: matchedRecipient || matchedAccount || expectedBankName || 'LE DAI QUY',
      matchedAccount,
      amount,
      transactionCode,
      imageHash,
      timeObj,
      memo,
      rawText
    };
  }

  /**
   * Phân tích ý định của người chơi từ tin nhắn / caption / nội dung CK (Smart Priority)
   * @param {string} userText - Tin nhắn người chơi gửi kèm ảnh hoặc ngay trước/sau ảnh (vd: "22h B", "22h", "B")
   * @param {string} billMemo - Lời nhắn trên biên lai (nếu có)
   * @returns {{ targetTime: string|null, targetTableKey: string|null }}
   */
  resolveTargetTimeAndTable(userText = '', billMemo = '') {
    const combined = `${userText || ''} ${billMemo || ''}`.trim();

    let targetTime = null;
    let targetTableKey = null;

    if (combined) {
      // 1. Tìm khung giờ: 22h, 8h, 12h, 20h, 22:00, 22g...
      const timeMatch = combined.match(/\b(\d{1,2})\s*(?:h|H|giờ|g|G|\:00)\b/);
      if (timeMatch) {
        const hour = parseInt(timeMatch[1], 10);
        if (hour >= 0 && hour <= 24) {
          targetTime = `${hour}h`;
        }
      }

      // 2. Tìm bảng: B, Bảng B, B1, C, A...
      const tableMatch = combined.match(/\b(?:bảng\s*)?([A-D]|B[1-9])\b/i);
      if (tableMatch) {
        targetTableKey = tableMatch[1].toUpperCase();
      }
    }

    // Nếu trên bill hoặc tin nhắn không có giờ -> Lấy giờ sắp tới tự động (ví dụ 19h30 -> 8h)
    if (!targetTime) {
      targetTime = getUpcomingTime();
    }

    return { targetTime, targetTableKey };
  }

  /**
   * Kiểm tra mã giao dịch đã được sử dụng chưa
   */
  isBillUsed(transactionCode) {
    if (!transactionCode) return false;
    return this.usedBills.has(transactionCode);
  }

  /**
   * Kiểm tra mã hash của ảnh bill đã từng được sử dụng chưa
   */
  isImageHashUsed(imageHash) {
    if (!imageHash) return false;
    return this.usedImageHashes.has(imageHash);
  }

  /**
   * Đánh dấu mã giao dịch và hash ảnh đã được sử dụng
   */
  markBillAsUsed(transactionCode, billData) {
    if (!transactionCode) return;
    const record = {
      id: transactionCode,
      ...billData,
      usedAt: Date.now()
    };
    this.usedBills.set(transactionCode, record);
    if (billData.imageHash) {
      this.usedImageHashes.set(billData.imageHash, record);
    }
    this.saveUsedBills();
  }

  /**
   * Toàn bộ quy trình xử lý ảnh Bill gửi vào nhóm Zalo (Multi-layer Anti-Fake)
   */
  async processBillImage(photoUrl, userText = '', senderName = 'Thành viên', senderId = '', threadId = '', expectedBankInfo = null) {
    let tempFilePath = null;
    try {
      tempFilePath = await this.downloadImage(photoUrl);
      const imageBuffer = fs.readFileSync(tempFilePath);

      const worker = await this.getWorker();
      if (!worker) {
        return { success: false, reason: 'OCR_NOT_READY' };
      }

      const ocrResult = await worker.recognize(tempFilePath);
      const rawText = ocrResult?.data?.text || '';

      console.log(`\n======================================================`);
      console.log(`📄 [OCR Process] Nhận ảnh từ [${senderName}] (Thread: ${threadId})`);
      console.log(`🔍 [OCR Raw Preview]: ${rawText.replace(/\s+/g, ' ').substring(0, 300)}`);

      const expectedRecipients = expectedBankInfo?.adminCtk ? [expectedBankInfo.adminCtk] : [];
      const expectedAccounts = expectedBankInfo?.bankAccount ? [expectedBankInfo.bankAccount] : [];
      const expectedBankName = expectedBankInfo?.bankName || '';

      console.log(`📋 [Group Expect]: CTK=[${expectedBankInfo?.adminCtk || 'Mặc định'}], STK=[${expectedBankInfo?.bankAccount || 'Mặc định'}], Bank=[${expectedBankName}]`);

      const billInfo = this.parseBillText(rawText, imageBuffer, expectedRecipients, expectedAccounts, expectedBankName);

      console.log(`🎯 [OCR Result]: isBill=${billInfo.isBill}, isValidRecipient=${billInfo.isValidRecipient}, amount=${billInfo.amount}, code=${billInfo.transactionCode}, time=${JSON.stringify(billInfo.timeObj)}`);
      console.log(`======================================================\n`);

      // 1. Kiểm tra có phải là biên lai ngân hàng
      if (!billInfo.isBill) {
        return { success: false, reason: 'NOT_A_BILL' };
      }

      // 2. Kiểm tra trạng thái giao dịch (thất bại / đang chờ xử lý)
      if (billInfo.hasFailStatus) {
        return {
          success: false,
          reason: 'TRANSACTION_NOT_SUCCESS',
          detail: 'Biên lai ghi nhận trạng thái giao dịch chưa hoàn tất hoặc thất bại!'
        };
      }

      // 3. Kiểm tra người thụ hưởng
      if (!billInfo.isValidRecipient) {
        const expectedName = expectedBankInfo?.adminCtk || 'LE DAI QUY';
        return {
          success: false,
          reason: 'WRONG_RECIPIENT',
          detail: `Tên người nhận trên bill không khớp với chủ tài khoản [${expectedName}]`
        };
      }

      // 4. Kiểm tra số tiền nạp hợp lệ (tối thiểu 3.000đ)
      if (!billInfo.amount || billInfo.amount < 3000) {
        return {
          success: false,
          reason: 'INVALID_AMOUNT',
          amount: billInfo.amount,
          detail: 'Số tiền nạp không hợp lệ (tối thiểu 3.000đ)!'
        };
      }

      // 5. Bắt buộc phải có Mã giao dịch ngân hàng thật (Ref No / Mã GD)
      if (!billInfo.transactionCode) {
        return {
          success: false,
          reason: 'NO_TRANSACTION_CODE',
          detail: 'Không tìm thấy Mã Giao Dịch ngân hàng (Ref No/Mã GD) hợp lệ trên biên lai!'
        };
      }

      // 6. Chống gửi lại bill trùng lặp theo Mã giao dịch
      if (this.isBillUsed(billInfo.transactionCode)) {
        const usedRecord = this.usedBills.get(billInfo.transactionCode);
        return {
          success: false,
          reason: 'DUPLICATE_BILL',
          transactionCode: billInfo.transactionCode,
          usedAt: usedRecord?.usedAt
        };
      }

      // 7. Chống gửi lại bill trùng lặp theo Hash của ảnh (kể cả khi cố tình sửa text)
      if (billInfo.imageHash && this.isImageHashUsed(billInfo.imageHash)) {
        const usedRecord = this.usedImageHashes.get(billInfo.imageHash);
        return {
          success: false,
          reason: 'DUPLICATE_IMAGE',
          transactionCode: usedRecord?.id || 'N/A',
          usedAt: usedRecord?.usedAt
        };
      }

      // 8. Xác thực thời gian giao dịch thực tế (Chống fake bill & bill quá hạn)
      const timeValidation = this.validateTransactionTime(billInfo.timeObj);
      if (!timeValidation.valid) {
        return {
          success: false,
          reason: timeValidation.reason,
          detail: timeValidation.detail
        };
      }

      // 9. Phân tích giờ & bảng
      const { targetTime, targetTableKey } = this.resolveTargetTimeAndTable(userText, billInfo.memo);

      return {
        success: true,
        billInfo,
        targetTime,
        targetTableKey,
        senderName,
        senderId,
        threadId
      };
    } catch (err) {
      console.error('❌ [BillService] Lỗi khi xử lý bill:', err);
      return { success: false, reason: 'ERROR', error: err.message };
    } finally {
      // Dọn dẹp file tạm
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
    }
  }
}

export const billService = new BillService();
