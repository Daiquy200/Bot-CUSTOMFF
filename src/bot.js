import { Zalo, ThreadType, LoginQRCallbackEventType } from 'zca-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadImage } from '@napi-rs/canvas';
import { config, validateConfig } from './config.js';
import { garenaService } from './services/garenaService.js';
import { imageService } from './services/imageService.js';
import { customService } from './services/customService.js';
import { billService } from './services/billService.js';
import axios from 'axios';
import {
  formatMatchDetail,
  formatAggregatedScores,
  formatPlayerMatches,
  formatHelp,
  formatSlotMenu,
  formatSlotLeaderboard,
  getSlotTimestamps,
  parseDateInput,
  TIME_SLOTS
} from './utils/formatters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_SHEET_TEMPLATES_URL = 'https://docs.google.com/spreadsheets/d/1MLxOcJWdRn8YIyzTIWB8sEx2T5ZykrkCHWk4rOweT8c/edit?usp=sharing';

// Danh sách các lệnh hợp lệ (hỗ trợ gọi lệnh trực tiếp không cần dấu khi trượt tin nhắn trả lời trên điện thoại)
const KNOWN_COMMANDS = [
  'td', 'tinhdiem', 'mau', 'chonmau', 'template', 'xemmau', 'viewmau', 'preview',
  'help', 'huongdan', 'menu', 'check', 'status',
  'diem', 'tran', 'score', 'tongdiem', 'bxh', 'total', 'timtran', 'find',
  'kickall', 'kick-all', 'kicktatca', 'locnhom', 'clearall', 'dangxuat', 'logout',
  'cus', 'custom', 'taocus', 'clearslot', 'resetslot', 'xoatatca', 'huyslot', 'delslot',
  'xoa', 'phi', 'hen', 'gio', 'gia', 'bang', 'ctk', 'box', 'link',
  'xemslot', 'bangleslot', 'ds', 'chon', 'all', 'dsall', 'xoabang',
  'xoatatcabang', 'xoatoanbobang', 'clearallbang', 'cleartatcabang',
  'qr', 'stk', 'bank', 'doiqr', 'setqr', 'xoaqr', 'resetqr', 'setstk',
  'autobill', 'batbill', 'tatbill',
  'batbot', 'tatbot', 'bot',
  'anlenh', 'antan', 'batan', 'tatan', 'batanlenh', 'tatanlenh'
];

class BotManager {
  constructor() {
    // Hàm cung cấp kích thước ảnh cho zca-js khi gửi file ảnh đính kèm
    const imageMetadataGetter = async (filePath) => {
      try {
        const img = await loadImage(filePath);
        const stat = await fs.promises.stat(filePath);
        return {
          width: img.width,
          height: img.height,
          size: stat.size
        };
      } catch (err) {
        console.error('Lỗi khi đọc metadata ảnh:', err);
        return { width: 592, height: 1024, size: 500000 };
      }
    };

    this.zalo = new Zalo({ selfListen: true, imageMetadataGetter });
    this.api = null;
    this.prefixes = ['!', '.', '/'];
    this.selectedTemplate = 'mau_1'; // Mẫu mặc định (mau_1.png: BẢNG XẾP HẠNG CUS CỎ)
    this.pendingSlotRequests = new Map();
    this.groupInfoCache = new Map(); // Cache thông tin Trưởng / Phó nhóm
    this.recentUserMessages = new Map(); // Lưu tin nhắn gần đây để gộp với ảnh bill
  }

  /**
   * Lấy mẫu BXH riêng cho từng nhóm Zalo (threadId)
   */
  getGroupTemplate(threadId) {
    if (!threadId || threadId === '0') {
      return this.selectedTemplate || 'mau_1';
    }
    return customService.getTemplate(threadId);
  }

  /**
   * Cài đặt mẫu BXH riêng cho từng nhóm Zalo (threadId)
   */
  setGroupTemplate(threadId, templateId) {
    this.selectedTemplate = templateId; // Cập nhật fallback
    if (!threadId || threadId === '0') {
      return templateId;
    }
    return customService.setTemplate(threadId, templateId);
  }

  /**
   * Tải và lưu ảnh mã QR riêng cho từng nhóm Zalo (threadId)
   */
  async downloadAndSaveGroupQr(threadId, imageUrl) {
    const qrDir = path.resolve(__dirname, '../assets/qrs');
    if (!fs.existsSync(qrDir)) {
      fs.mkdirSync(qrDir, { recursive: true });
    }
    const targetFile = path.join(qrDir, `qr_${threadId}.png`);

    if (imageUrl.startsWith('file://') || fs.existsSync(imageUrl)) {
      const localPath = imageUrl.replace('file://', '');
      fs.copyFileSync(localPath, targetFile);
      return targetFile;
    }

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 25000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    fs.writeFileSync(targetFile, Buffer.from(response.data));
    return targetFile;
  }

  /**
   * Kiểm tra quyền hạn: Chỉ Trưởng nhóm hoặc Phó nhóm mới được dùng lệnh
   */
  async checkAdminPermission(threadId, threadType, senderId) {
    // 1. Nếu là tin nhắn riêng 1-1 với Bot -> Luôn cho phép
    if (threadType === ThreadType.User) {
      return { allowed: true, role: 'CÁ NHÂN' };
    }

    // 2. Nếu đã tắt chế độ phân quyền trong config -> Cho phép tất cả
    if (!config.bot.adminOnly) {
      return { allowed: true, role: 'TẤT CẢ' };
    }

    const sId = String(senderId);

    // Kiểm tra nếu là chính tài khoản Bot -> Luôn có quyền
    const ownBotId = String(this.api.getOwnId?.() || '').replace(/^0+/, '');
    const cleanSender = sId.replace(/^0+/, '');
    if (sId === '0' || (ownBotId && cleanSender === ownBotId)) {
      return { allowed: true, role: 'CHÍNH TÀI KHOẢN BOT' };
    }

    // 3. Kiểm tra danh sách Admin Whitelist đặc cách (nếu cấu hình)
    if (config.bot.adminWhitelist && (config.bot.adminWhitelist.includes(sId) || config.bot.adminWhitelist.includes(cleanSender))) {
      return { allowed: true, role: 'ADMIN_WHITELIST' };
    }

    // 4. Lấy thông tin nhóm từ cache hoặc từ Zalo API
    try {
      let groupData = this.groupInfoCache.get(threadId);
      const now = Date.now();

      // Cache trong 30 giây để cập nhật nhanh khi nhóm vừa bổ nhiệm Phó nhóm mới
      if (!groupData || (now - groupData.cachedAt > 30 * 1000)) {
        const res = await this.api.getGroupInfo(threadId);
        const info = res?.gridInfoMap?.[threadId];
        if (info) {
          const adminSet = new Set();

          // 1. Quét từ adminIds
          if (Array.isArray(info.adminIds)) {
            info.adminIds.forEach(id => {
              const str = String(id || '').trim();
              if (str) {
                adminSet.add(str);
                adminSet.add(str.replace(/^0+/, ''));
              }
            });
          }

          // 2. Quét từ admins
          if (Array.isArray(info.admins)) {
            info.admins.forEach(item => {
              const id = typeof item === 'object' && item !== null ? (item.id || item.uid) : item;
              const str = String(id || '').trim();
              if (str) {
                adminSet.add(str);
                adminSet.add(str.replace(/^0+/, ''));
              }
            });
          }

          // 3. Quét từ currentMems (type === 1: Trưởng nhóm, type === 2: Phó nhóm)
          if (Array.isArray(info.currentMems)) {
            info.currentMems.forEach(mem => {
              if (mem.type === 1 || mem.type === 2) {
                const str = String(mem.id || '').trim();
                if (str) {
                  adminSet.add(str);
                  adminSet.add(str.replace(/^0+/, ''));
                }
              }
            });
          }

          const creatorStr = String(info.creatorId || '').trim();
          groupData = {
            creatorId: creatorStr,
            cleanCreatorId: creatorStr.replace(/^0+/, ''),
            adminIds: Array.from(adminSet),
            cachedAt: now
          };
          this.groupInfoCache.set(threadId, groupData);
        }
      }

      if (groupData) {
        const isCreator = sId === groupData.creatorId || cleanSender === groupData.cleanCreatorId;
        const isDeputy = groupData.adminIds.includes(sId) || groupData.adminIds.includes(cleanSender);

        if (isCreator || isDeputy) {
          return {
            allowed: true,
            role: isCreator ? 'TRƯỞNG NHÓM' : 'PHÓ NHÓM'
          };
        }
      }

      console.log(`⛔ [TỪ CHỐI QUYỀN] Sender: ${sId} (clean: ${cleanSender}). Admin List:`, groupData?.adminIds, `Creator:`, groupData?.creatorId);

      return {
        allowed: false,
        reason: '⛔ QUYỀN HẠN BỊ TỪ CHỐI!\nChỉ Trưởng nhóm hoặc Phó nhóm mới có quyền sử dụng lệnh của Bot.'
      };
    } catch (err) {
      console.error('Lỗi khi kiểm tra quyền nhóm:', err);
      return { allowed: true, role: 'FALLBACK' };
    }
  }

  async start() {
    console.log('🚀 [BOT TÍNH ĐIỂM FREE FIRE] Đang khởi động...');

    if (!validateConfig()) {
      console.error('❌ Vui lòng kiểm tra lại file .env trước khi tiếp tục.');
      process.exit(1);
    }

    // 1. Kiểm tra tài khoản Garena trước
    console.log('🔄 Đang kiểm tra kết nối API Garena...');
    const profile = await garenaService.getUserProfile();
    if (profile.success && profile.data) {
      console.log(`✅ Kết nối Garena thành công: [${profile.data.nickName}] (ID: ${profile.data.accountId})`);
    } else {
      console.warn('⚠️ Cảnh báo: Cookie Garena có thể đã hết hạn hoặc không kết nối được:', profile.error);
    }

    // 2. Đăng nhập Zalo
    await this.loginZalo();

    // 3. Đăng ký lắng nghe tin nhắn
    this.registerMessageHandler();
  }

  async loginZalo() {
    const sessionFile = config.bot.sessionPath;

    // Nếu đã có session lưu trước đó, thử đăng nhập lại
    if (fs.existsSync(sessionFile)) {
      try {
        console.log('📁 Đang khôi phục phiên đăng nhập Zalo từ file lưu trữ...');
        const savedSession = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        this.api = await this.zalo.login(savedSession);
        console.log('✅ Đăng nhập Zalo thành công từ phiên lưu trữ!');
        return;
      } catch (err) {
        console.warn('⚠️ Phiên đăng nhập Zalo cũ hết hạn, đang tạo mã QR mới...');
      }
    }

    // Nếu chưa có hoặc phiên cũ hết hạn -> Quét mã QR
    console.log('📱 Đang khởi tạo mã QR đăng nhập Zalo...');
    const qrPath = 'qr.png';

    this.api = await this.zalo.loginQR({ qrPath }, async (event) => {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated: {
          try {
            await event.actions.saveToFile(qrPath);
            console.log('\n======================================================');
            console.log('📷 ĐÃ TẠO MÃ QR THÀNH CÔNG!');
            console.log(`👉 File ảnh QR: ${qrPath}`);
            console.log('👉 Đang tự động mở ảnh QR trên màn hình của bạn...');
            console.log('👉 Mở Zalo trên điện thoại -> Quét mã QR để đăng nhập!');
            console.log('======================================================\n');

            import('child_process').then(({ exec }) => {
              exec(`start "" "${qrPath}"`, (err) => {
                if (err) {
                  console.log(`ℹ️ Nếu ảnh không tự mở, vui lòng mở trực tiếp file: ${qrPath}`);
                }
              });
            });
          } catch (e) {
            console.error('Lỗi khi lưu/mở QR:', e);
          }
          break;
        }

        case LoginQRCallbackEventType.QRCodeScanned: {
          console.log('📲 Đã quét mã QR! Vui lòng bấm [ĐĂNG NHẬP] trên điện thoại để xác nhận...');
          break;
        }

        case LoginQRCallbackEventType.QRCodeExpired: {
          console.log('⏳ Mã QR đã hết hạn. Đang tự động tạo mã QR mới...');
          if (event.actions?.retry) {
            event.actions.retry();
          }
          break;
        }

        case LoginQRCallbackEventType.QRCodeDeclined: {
          console.log('❌ Bạn đã bấm từ chối đăng nhập trên điện thoại.');
          break;
        }

        case LoginQRCallbackEventType.GotLoginInfo: {
          console.log('💾 Đăng nhập thành công! Đang lưu phiên vào:', sessionFile);
          fs.writeFileSync(sessionFile, JSON.stringify(event.data, null, 2), 'utf8');
          break;
        }
      }
    });

    console.log('✅ Đăng nhập Zalo thành công!');
  }

  registerMessageHandler() {
    console.log(`🎧 Bot đang lắng nghe tin nhắn (Hỗ trợ tiền tố: "!", ".", "/")...\n`);

    this.api.listener.on('message', async (message) => {
      try {
        let content = '';
        let photoUrl = null;
        let directPhotoUrl = null;
        let quotedPhotoUrl = null;

        // Trích xuất nội dung chữ và link ảnh từ tin nhắn Zalo (hỗ trợ cả text thường và ảnh gửi kèm caption)
        const rawContent = message.data?.content;
        if (typeof rawContent === 'string') {
          try {
            const parsed = JSON.parse(rawContent);
            if (typeof parsed === 'object' && parsed !== null) {
              content = (parsed.description || parsed.title || parsed.text || '').trim();
              directPhotoUrl = parsed.href || parsed.hdUrl || parsed.normalUrl || parsed.thumb || parsed.url;
              if (parsed.params) {
                try {
                  const p = typeof parsed.params === 'string' ? JSON.parse(parsed.params) : parsed.params;
                  directPhotoUrl = directPhotoUrl || p.hdUrl || p.normalUrl || p.rawUrl || p.thumbUrl;
                } catch (e) {}
              }
            } else {
              content = rawContent.trim();
            }
          } catch (e) {
            content = rawContent.trim();
          }
        } else if (typeof rawContent === 'object' && rawContent !== null) {
          content = (rawContent.description || rawContent.title || rawContent.text || '').trim();
          directPhotoUrl = rawContent.href || rawContent.hdUrl || rawContent.normalUrl || rawContent.thumb || rawContent.url;
          if (rawContent.params) {
            try {
              const p = typeof rawContent.params === 'string' ? JSON.parse(rawContent.params) : rawContent.params;
              directPhotoUrl = directPhotoUrl || p.hdUrl || p.normalUrl || p.rawUrl || p.thumbUrl;
            } catch (e) {}
          }
        }

        // Kiểm tra ảnh trong tin nhắn quote (khi người dùng reply vào 1 ảnh trước đó)
        if (message.data?.quote) {
          const qAttach = message.data.quote.attach;
          if (typeof qAttach === 'string') {
            try {
              const parsed = JSON.parse(qAttach);
              quotedPhotoUrl = parsed.href || parsed.hdUrl || parsed.normalUrl || parsed.thumb || parsed.url;
              if (parsed.params) {
                const p = typeof parsed.params === 'string' ? JSON.parse(parsed.params) : parsed.params;
                quotedPhotoUrl = quotedPhotoUrl || p.hdUrl || p.normalUrl || p.rawUrl || p.thumbUrl;
              }
            } catch (e) {
              if (qAttach.startsWith('http')) quotedPhotoUrl = qAttach;
            }
          } else if (typeof qAttach === 'object' && qAttach !== null) {
            quotedPhotoUrl = qAttach.href || qAttach.hdUrl || qAttach.normalUrl || qAttach.thumb || qAttach.url;
            if (qAttach.params) {
              try {
                const p = typeof qAttach.params === 'string' ? JSON.parse(qAttach.params) : qAttach.params;
                quotedPhotoUrl = quotedPhotoUrl || p.hdUrl || p.normalUrl || p.rawUrl || p.thumbUrl;
              } catch (e) {}
            }
          }
        }

        photoUrl = directPhotoUrl || quotedPhotoUrl;
        message.photoUrl = photoUrl;
        message.directPhotoUrl = directPhotoUrl;
        message.quotedPhotoUrl = quotedPhotoUrl;

        // Nếu không có cả nội dung chữ lẫn ảnh thì bỏ qua
        if (!content && !photoUrl) return;

        // Nếu là tin nhắn từ chính tài khoản Bot (isSelf = true):
        // CHỈ cho phép xử lý lệnh đăng xuất (.dangxuat, !dangxuat, .logout), các tin nhắn khác bỏ qua để tránh vòng lặp.
        if (message.isSelf) {
          if (!content) return;
          const prefix = this.prefixes.find((p) => content.startsWith(p));
          if (!prefix) return;
          const [rawCmd] = content.slice(prefix.length).trim().split(/\s+/);
          const cmd = rawCmd?.toLowerCase();
          if (cmd !== 'dangxuat' && cmd !== 'logout') {
            return;
          }
        }

        const threadId = message.threadId;
        const threadType = message.type;
        const senderId = message.data?.uidFrom || 'unknown';
        const senderName = message.data?.dName || message.data?.displayName || 'Thành viên';

        // KIỂM TRA TRẠNG THÁI HOẠT ĐỘNG CỦA BOT TRONG NHÓM NÀY (.batbot / .tatbot)
        const isBotActiveInGroup = customService.isBotEnabled(threadId);
        const lowerContent = (content || '').toLowerCase().trim();
        const isBotSwitchCmd = /^[!\.\/]?(?:batbot|tatbot|bot)\b/i.test(lowerContent);

        // Nếu Bot đang TẮT trong nhóm này, bỏ qua mọi hoạt động trừ lệnh .batbot của Admin
        if (!isBotActiveInGroup && !isBotSwitchCmd) {
          return;
        }

        // Lưu tin nhắn text gần nhất của người dùng này (để ghép với ảnh bill nếu họ gửi ảnh trước/sau)
        if (content) {
          this.recentUserMessages.set(`${threadId}_${senderId}`, {
            text: content,
            time: Date.now()
          });
        }

        // TỰ ĐỘNG BẮT TỪ KHÓA XIN QR / STK CHUYỂN KHOẢN
        const isBankAdminCmd = /^[!\.\/]?(?:doiqr|setqr|xoaqr|resetqr|setstk)\b/i.test(lowerContent);
        const qrPhrases = [
          'xin mã', 'xin ma', 'xin qr', 'mã qr', 'ma qr', 'cho xin qr', 'cho xin mã', 'cho xin ma',
          'gửi qr', 'gui qr', 'gửi mã', 'gui ma', 'qr đâu', 'qr dau', 'mã đâu', 'ma dau',
          'xin stk', 'cho xin stk', 'gửi stk', 'gui stk', 'stk đâu', 'stk dau',
          'số tk', 'so tk', 'số tài khoản', 'so tai khoan', 'chuyển khoản', 'chuyen khoan',
          'xin bank', 'cho xin bank', 'gửi bank', 'stk bank'
        ];
        const exactQrWords = ['qr', '.qr', '!qr', '/qr', 'stk', '.stk', '!stk', '/stk', 'mã', 'ma', '.ma', '!ma', '/ma'];
        const isWordMatch = /\b(?:xin\s+mã|xin\s+ma|xin\s+qr|mã\s+qr|ma\s+qr|xin\s+stk|stk|qr|chuyển\s+khoản|chuyen\s+khoan)\b/i.test(lowerContent);
        const isExactMatch = exactQrWords.includes(lowerContent);
        const isPhraseMatch = qrPhrases.some(kw => lowerContent.includes(kw));
        const isAskingQr = !isBankAdminCmd && (isWordMatch || isExactMatch || isPhraseMatch);

        if (isAskingQr && !message.isSelf) {
          const bankInfo = customService.getGroupBankInfo(threadId);
          const qrPath = (bankInfo.qrImage && fs.existsSync(bankInfo.qrImage))
            ? bankInfo.qrImage
            : path.resolve(__dirname, '../assets/qr_tpbank.png');

          const isAuto = customService.isAutoBill(threadId);
          const feeSummary = customService.getGroupFeesSummary(threadId);
          let qrMsg = `🏦 THÔNG TIN CHUYỂN KHOẢN (${(bankInfo.bankName || 'NGÂN HÀNG').toUpperCase()})\n`;
          qrMsg += `👤 CTK: ${bankInfo.adminCtk}\n`;
          qrMsg += `💳 STK: ${bankInfo.bankAccount}\n`;
          qrMsg += `💰 Mức phí: ${feeSummary}\n`;
          qrMsg += `📝 ND: [Giờ + Bảng] (vd: 22h B)\n`;
          if (isAuto) {
            qrMsg += `👉 Chuyển xong GỬI ẢNH BILL vào nhóm, Bot tự xếp slot! ✅`;
          } else {
            qrMsg += `👉 Chuyển xong GỬI ẢNH BILL vào nhóm, Admin sẽ kiểm tra và duyệt slot! ⏳`;
          }

          const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
          if (fs.existsSync(qrPath)) {
            // Gửi ảnh kèm chữ trong cùng 1 tin nhắn duy nhất (không tách rời)
            await this.api.sendMessage({ msg: qrMsg, attachments: [qrPath] }, targetThreadId, threadType);
          } else {
            const payload = { msg: qrMsg };
            if (message.data) payload.quote = message.data;
            await this.api.sendMessage(payload, targetThreadId, threadType);
          }
          return;
        }

        // TỰ ĐỘNG BẮT VÀ QUÉT ẢNH BILL CHUYỂN KHOẢN VÀO NHÓM (CHỈ KHI LÀ ẢNH GỬI TRỰC TIẾP, BỎ QUA NẾU LÀ LỆNH HOẶC ĐANG TRƯỢT DUYỆT)
        const hasMentionTag = (message.data?.mentions && message.data.mentions.length > 0) || content.includes('@');
        if (directPhotoUrl && !isBankAdminCmd && !message.isSelf && !hasMentionTag) {
          if (!customService.isAutoBill(threadId)) {
            // Chế độ tự động duyệt bill đang TẮT -> Im lặng hoàn toàn (không spam thông báo khi gửi ảnh thường)
            // Admin chỉ cần trượt ảnh bill và gõ: @Tên [Giờ/Bảng] để xếp vào slot
            return;
          }

          const recentMsg = this.recentUserMessages.get(`${threadId}_${senderId}`);
          const recentText = (recentMsg && (Date.now() - recentMsg.time < 120000)) ? recentMsg.text : '';
          const effectiveUserText = content || recentText || '';

          const bankInfo = customService.getGroupBankInfo(threadId);
          const billResult = await billService.processBillImage(
            photoUrl,
            effectiveUserText,
            senderName,
            senderId,
            threadId,
            bankInfo
          );

          if (billResult.success) {
            console.log(`💵 [Bill] Nhận diện bill hợp lệ từ ${senderName} (${billResult.billInfo.amount || 'N/A'}đ) - Giờ: ${billResult.targetTime || 'auto'}, Bảng: ${billResult.targetTableKey || 'auto'}`);

            const assignResult = customService.autoAssignPlayerWithBill(
              threadId,
              billResult.targetTime,
              billResult.targetTableKey,
              senderName,
              senderId,
              billResult.billInfo.amount
            );

            if (assignResult.success) {
              // Lưu bill đã dùng để chống gian lận
              billService.markBillAsUsed(billResult.billInfo.transactionCode, {
                amount: billResult.billInfo.amount,
                imageHash: billResult.billInfo.imageHash,
                senderName,
                senderId,
                threadId,
                tableKey: assignResult.tableKey,
                slotIndex: assignResult.slotIndex
              });

              let notifyMsg = `🎉 DUYỆT BILL THÀNH CÔNG! 🎉\n`;
              const amtStr = billResult.billInfo.amount ? `${billResult.billInfo.amount.toLocaleString('vi-VN')}đ` : '';
              const codeStr = billResult.billInfo.transactionCode ? ` | 🔖 ${billResult.billInfo.transactionCode}` : '';
              notifyMsg += `👤 ${senderName} | 💵 ${amtStr}${codeStr}\n`;
              notifyMsg += `👉 VÀO SLOT [${assignResult.slotIndex}] - ${assignResult.room.table} (Ca ${assignResult.time}) ✅\n`;

              // KIỂM TRA LỆCH MỨC PHÍ (HƯỚNG 2 CÁCH B)
              const billAmt = billResult.billInfo.amount;
              const roomFeeStr = assignResult.room.fee || '6k';
              const expectedFee = customService.parseFeeToNumber(roomFeeStr);

              if (billAmt && expectedFee > 0 && billAmt !== expectedFee) {
                const diff = Math.abs(billAmt - expectedFee);
                if (billAmt > expectedFee) {
                  notifyMsg += `⚠️ Lệch phí: Chuyển ${billAmt.toLocaleString('vi-VN')}đ (DƯ +${diff.toLocaleString('vi-VN')}đ). Liên hệ Admin lấy tiền thừa!\n`;
                } else {
                  notifyMsg += `⚠️ Lệch phí: Chuyển ${billAmt.toLocaleString('vi-VN')}đ (THIẾU -${diff.toLocaleString('vi-VN')}đ). Vui lòng bù hoặc nhắn Admin!\n`;
                }
              }

              notifyMsg += `💡 Đổi ca: Trượt tin nhắn nhắn [Giờ + Bảng] (vd: 22h B) 🔄\n\n`;
              notifyMsg += customService.formatBoard(assignResult.room);

              const payload = { msg: notifyMsg };
              if (message.data) payload.quote = message.data;
              const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
              await this.api.sendMessage(payload, targetThreadId, threadType);
              return;
            } else if (assignResult.reason === 'TABLE_FULL' || assignResult.reason === 'ALL_TABLES_FULL') {
              let fullMsg = `⚠️ PHÒNG ĐÃ ĐẦY (12/12 SLOT)!\n`;
              fullMsg += `👉 Ca ${assignResult.time || 'hiện tại'} đã kín chỗ. Liên hệ Admin đổi ca hoặc nhận lại tiền.`;
              const payload = { msg: fullMsg };
              if (message.data) payload.quote = message.data;
              const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
              await this.api.sendMessage(payload, targetThreadId, threadType);
              return;
            }
          } else if (billResult.reason === 'DUPLICATE_BILL' || billResult.reason === 'DUPLICATE_IMAGE') {
            const timeStr = billResult.usedAt ? ` lúc ${new Date(billResult.usedAt).toLocaleTimeString('vi-VN')}` : '';
            let dupMsg = `⚠️ BILL ĐÃ ĐƯỢC DÙNG${timeStr}!\n`;
            dupMsg += `❌ Mã GD: ${billResult.transactionCode || 'N/A'}. Vui lòng không gửi lại bill cũ!`;
            const payload = { msg: dupMsg };
            if (message.data) payload.quote = message.data;
            const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
            await this.api.sendMessage(payload, targetThreadId, threadType);
            return;
          } else if (billResult.reason === 'EXPIRED_DATE') {
            let expMsg = `🚫 BILL HẾT HẠN: Ngày trên bill không phải hôm nay!\n`;
            expMsg += `👉 Bot chỉ nhận bill chuyển khoản trong ngày.`;
            const payload = { msg: expMsg };
            if (message.data) payload.quote = message.data;
            const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
            await this.api.sendMessage(payload, targetThreadId, threadType);
            return;
          } else if (billResult.reason === 'EXPIRED_TIME') {
            let timeMsg = `⏰ BILL QUÁ HẠN: Chuyển cách đây hơn 30 phút!\n`;
            timeMsg += `👉 Vui lòng gửi bill ngay sau khi chuyển hoặc liên hệ Admin.`;
            const payload = { msg: timeMsg };
            if (message.data) payload.quote = message.data;
            const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
            await this.api.sendMessage(payload, targetThreadId, threadType);
            return;
          } else if (billResult.reason === 'FUTURE_TIME') {
            let fakeMsg = `🚨 CẢNH BÁO FAKE BILL: Giờ trên bill ở tương lai!\n`;
            fakeMsg += `❌ Phát hiện dấu hiệu tạo bill giả (tool/photoshop).`;
            const payload = { msg: fakeMsg };
            if (message.data) payload.quote = message.data;
            const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
            await this.api.sendMessage(payload, targetThreadId, threadType);
            return;
          } else if (billResult.reason === 'NO_TRANSACTION_CODE') {
            let codeMsg = `⚠️ THIẾU MÃ GIAO DỊCH: Không thấy Mã GD / Ref No!\n`;
            codeMsg += `👉 Vui lòng chụp trọn vẹn hóa đơn rõ nét để quét lại.`;
            const payload = { msg: codeMsg };
            if (message.data) payload.quote = message.data;
            const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
            await this.api.sendMessage(payload, targetThreadId, threadType);
            return;
          } else if (billResult.reason === 'NO_TIMESTAMP') {
            let stampMsg = `⚠️ THIẾU THỜI GIAN: Không thấy ngày giờ giao dịch!\n`;
            stampMsg += `👉 Vui lòng chụp rõ phần ngày giờ trên app ngân hàng.`;
            const payload = { msg: stampMsg };
            if (message.data) payload.quote = message.data;
            const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
            await this.api.sendMessage(payload, targetThreadId, threadType);
            return;
          } else if (billResult.reason === 'TRANSACTION_NOT_SUCCESS') {
            let statMsg = `⚠️ CHƯA THÀNH CÔNG: Trạng thái đang xử lý hoặc thất bại!\n`;
            statMsg += `👉 Vui lòng kiểm tra lại giao dịch trên app ngân hàng.`;
            const payload = { msg: statMsg };
            if (message.data) payload.quote = message.data;
            const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
            await this.api.sendMessage(payload, targetThreadId, threadType);
            return;
          } else if (billResult.reason === 'INVALID_AMOUNT') {
            let amtMsg = `⚠️ SỐ TIỀN KHÔNG HỢP LỆ: Tối thiểu 3.000đ!\n`;
            amtMsg += `👉 Vui lòng kiểm tra lại số tiền bạn đã chuyển.`;
            const payload = { msg: amtMsg };
            if (message.data) payload.quote = message.data;
            const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
            await this.api.sendMessage(payload, targetThreadId, threadType);
            return;
          } else if (billResult.reason === 'WRONG_RECIPIENT') {
            const expectedName = bankInfo?.adminCtk || 'LE DAI QUY';
            const expectedAcc = bankInfo?.bankAccount || '1000 2610 909';
            let wrongMsg = `⚠️ SAI NGƯỜI NHẬN: Không khớp [${expectedName} - ${expectedAcc}]!\n`;
            wrongMsg += `👉 Vui lòng kiểm tra lại STK nhận hoặc liên hệ Admin.`;
            const payload = { msg: wrongMsg };
            if (message.data) payload.quote = message.data;
            const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
            await this.api.sendMessage(payload, targetThreadId, threadType);
            return;
          }
        }

        // Nếu không có nội dung chữ thì bỏ qua (ảnh không phải bill đã xử lý ở trên)
        if (!content) return;

        const requestKeyUser = `${threadId}_${senderId}`;
        const requestKeyThread = `${threadId}`;
        const pendingRequest = this.pendingSlotRequests.get(requestKeyUser) || this.pendingSlotRequests.get(requestKeyThread);

        // THÔNG TIN TRƯỢT TIN NHẮN ĐỂ TRẢ LỜI (QUOTE REPLY) TRÊN ĐIỆN THOẠI
        const quoteObj = message.data?.quote || null;
        const isQuote = !!quoteObj;
        let quotedMsg = (quoteObj?.msg || (typeof quoteObj?.content === 'string' ? quoteObj.content : '') || '').trim();
        if (typeof quoteObj?.content === 'object' && quoteObj.content !== null) {
          quotedMsg = (quoteObj.content.description || quoteObj.content.title || quoteObj.content.text || quotedMsg || '').trim();
        }

        // 1. KIỂM TRA PHẢN HỒI KHI TRƯỢT TIN NHẮN TRẢ LỜI (QUOTE REPLY) TRÊN ĐIỆN THOẠI / ZALO PC
        if (isQuote && (quotedMsg || quoteObj?.attach)) {
          // A. Trả lời chọn số khung giờ (1-8) khi trượt tin nhắn menu khung giờ
          const isSlotMenu = quotedMsg.includes('CHỌN KHUNG GIỜ') || quotedMsg.includes('Trả lời số từ 1-8') || quotedMsg.includes('chọn số thứ tự khung giờ');
          // Hỗ trợ cả khi Zalo tự chèn tag người được trả lời: "@Vợ của Me 5", "5", "#5"
          const cleanTextForSlot = content.replace(/^@[^\s]+\s*/g, '').trim();
          const slotMatch = cleanTextForSlot.match(/\b([1-8])\b/) || content.match(/\b([1-8])\b/);
          if (isSlotMenu && slotMatch) {
            const perm = await this.checkAdminPermission(threadId, threadType, senderId);
            if (!perm.allowed) return;

            const chosenSlotId = parseInt(slotMatch[1], 10);
            const accMatch = quotedMsg.match(/(?:UID|ID)[:\s]*\[?(\d{8,12})\]?/i) || quotedMsg.match(/\b(\d{8,12})\b/);
            const accountId = accMatch ? accMatch[1] : pendingRequest?.accountId;

            if (accountId) {
              this.pendingSlotRequests.delete(requestKeyUser);
              this.pendingSlotRequests.delete(requestKeyThread);
              await this.executeSlotCalculation(
                accountId,
                chosenSlotId,
                threadId,
                threadType,
                message.data
              );
              return;
            }
          }

          // B. Trả lời ngày khi trượt tin nhắn "Không tìm thấy trận... nhập ngày"
          const isWaitingDateMsg = quotedMsg.includes('BẠN CÓ MUỐN TÌM VÀO NGÀY KHÁC') || quotedMsg.includes('nhập ngày theo định dạng') || (pendingRequest && pendingRequest.type === 'WAITING_DATE');
          const parsedDate = parseDateInput(content);
          if (isWaitingDateMsg && parsedDate) {
            const perm = await this.checkAdminPermission(threadId, threadType, senderId);
            if (!perm.allowed) return;

            const accMatch = quotedMsg.match(/(?:UID|ID)[:\s]*\[?(\d{8,12})\]?/i) || quotedMsg.match(/\b(\d{8,12})\b/);
            const slotMatch = quotedMsg.match(/(?:Khung|Số)\s*(\d)/i) || quotedMsg.match(/\[(\d)\]/);
            const accountId = accMatch ? accMatch[1] : pendingRequest?.accountId;
            const slotId = slotMatch ? parseInt(slotMatch[1], 10) : pendingRequest?.slotId;

            if (accountId && slotId) {
              this.pendingSlotRequests.delete(requestKeyUser);
              this.pendingSlotRequests.delete(requestKeyThread);
              await this.executeSlotCalculation(
                accountId,
                slotId,
                threadId,
                threadType,
                message.data,
                parsedDate
              );
              return;
            }
          }

          // C. Trả lời chọn mẫu BXH khi trượt tin nhắn danh sách mẫu hoặc ảnh demo
          const isTemplateMsg = quotedMsg.includes('DANH SÁCH MẪU') || quotedMsg.includes('Chọn dùng mẫu này') || quotedMsg.includes('HÌNH ẢNH MẪU') || quotedMsg.includes('HÌNH ẢNH XEM TRƯỚC') || quotedMsg.includes('AI QUÉT PHÔI THÀNH CÔNG');
          if (isTemplateMsg) {
            const numMatch = content.match(/^[#\s]*(\d+)\b/) || content.match(/^(?:mau|chọn|chon|dùng|dung)\s*#?(\d+)/i);
            if (numMatch) {
              const perm = await this.checkAdminPermission(threadId, threadType, senderId);
              if (!perm.allowed) return;
              await this.handleCommand('mau', [numMatch[1]], message, senderName);
              return;
            } else if (content.toLowerCase().includes('chọn mẫu này') || content.toLowerCase().includes('dùng mẫu này') || content.toLowerCase() === 'chọn' || content.toLowerCase() === 'ok') {
              const perm = await this.checkAdminPermission(threadId, threadType, senderId);
              if (!perm.allowed) return;
              const templateMatch = quotedMsg.match(/\[(mau_\w+)\]/) || quotedMsg.match(/mau_(\d+)/) || quotedMsg.match(/Mẫu\s*#?(\d+)/i);
              if (templateMatch) {
                await this.handleCommand('mau', [templateMatch[1]], message, senderName);
                return;
              }
            }
          }

          // D.1 ADMIN DUYỆT BILL THỦ CÔNG KHI TRƯỢT TIN NHẮN ẢNH BILL (@Tên [Bảng/Giờ])
          const isQuotedBillMsg = Boolean(quotedMsg.includes('ĐÃ NHẬN BIÊN LAI'))
            || Boolean(quotedPhotoUrl)
            || Boolean(quoteObj?.attach)
            || /\[(?:Hình ảnh|Ảnh|Photo|Image)\]/i.test(quotedMsg);

          if (isQuotedBillMsg && hasMentionTag) {
            const perm = await this.checkAdminPermission(threadId, threadType, senderId);
            if (perm.allowed) {
              let targetPlayerName = '';
              let targetPlayerUid = '';
              let remainingText = content;

              if (message.data?.mentions && message.data.mentions.length > 0) {
                const m = message.data.mentions[0];
                targetPlayerUid = m.uid || '';
                targetPlayerName = (content.substring(m.pos, m.pos + m.len) || '').replace(/@+/g, '').trim();
                remainingText = (content.substring(0, m.pos) + ' ' + content.substring(m.pos + m.len)).trim();
              } else {
                const tagMatch = content.match(/@([^\s@]+(?:\s+[^\s@]+)*)/);
                if (tagMatch) {
                  targetPlayerName = tagMatch[1].trim();
                  remainingText = content.replace(tagMatch[0], '').trim();
                }
              }

              let customTime = null;
              let customTable = null;

              // Tìm khung giờ chuẩn xác (ví dụ: 22h, 14h, 8h, ca 14h, 14:00...)
              const timeMatch = remainingText.match(/(?:^|\s)(?:ca\s*)?([1-9]|1[0-9]|2[0-4])\s*(?:h|H|g|G|giờ|\:00)(?=\s|$)/i);
              if (timeMatch) {
                customTime = `${timeMatch[1]}h`;
                remainingText = remainingText.replace(timeMatch[0], ' ').trim();
              }

              // Tìm bảng chuẩn xác (ví dụ: B, C, D, Bảng B, Bảng A, B1..B9, A1..A9...)
              const tableMatch = remainingText.match(/(?:^|\s)(?:bảng\s*([A-Za-z][0-9]*)|([A-Za-z][0-9]*))(?=\s|$)/i);
              if (tableMatch) {
                customTable = (tableMatch[1] || tableMatch[2]).toUpperCase();
                remainingText = remainingText.replace(tableMatch[0], ' ').trim();
              }

              // Xử lý nếu chữ Bảng hoặc Giờ bị dính ở cuối targetPlayerName (khi gõ thủ công không chọn tag Zalo)
              let foundMore = true;
              while (foundMore) {
                foundMore = false;
                if (!customTable && targetPlayerName) {
                  const endTableMatch = targetPlayerName.match(/\s+(?:bảng\s*([A-Za-z][0-9]*)|([A-Za-z][0-9]*))$/i);
                  if (endTableMatch) {
                    customTable = (endTableMatch[1] || endTableMatch[2]).toUpperCase();
                    targetPlayerName = targetPlayerName.replace(/\s+(?:bảng\s*([A-Za-z][0-9]*)|([A-Za-z][0-9]*))$/i, '').trim();
                    foundMore = true;
                  }
                }
                if (!customTime && targetPlayerName) {
                  const endTimeMatch = targetPlayerName.match(/\s+(?:ca\s*)?([1-9]|1[0-9]|2[0-4])\s*(?:h|H|g|G|giờ|\:00)$/i);
                  if (endTimeMatch) {
                    customTime = `${endTimeMatch[1]}h`;
                    targetPlayerName = targetPlayerName.replace(/\s+(?:ca\s*)?([1-9]|1[0-9]|2[0-4])\s*(?:h|H|g|G|giờ|\:00)$/i, '').trim();
                    foundMore = true;
                  }
                }
              }

              // BẮT BUỘC: Admin phải gõ kèm Giờ HOẶC Bảng (vd: @Tên 14h, @Tên B, @Tên 14h B)
              // Nếu chỉ trượt tin nhắn để trò chuyện với thành viên (@Tên ...) mà không có giờ/bảng thì BỎ QUA không xếp slot!
              if (!customTime && !customTable) {
                return;
              }

              if (!targetPlayerName) {
                targetPlayerName = 'Thành viên';
              }

              const assignResult = customService.autoAssignPlayerWithBill(
                threadId,
                customTime,
                customTable,
                targetPlayerName,
                targetPlayerUid
              );

              if (assignResult.success) {
                let approveMsg = `🎉 ADMIN DUYỆT BILL THÀNH CÔNG! 🎉\n`;
                approveMsg += `👤 ${targetPlayerName} (Duyệt bởi: ${senderName})\n`;
                approveMsg += `👉 VÀO SLOT [${assignResult.slotIndex}] - ${assignResult.room.table} (Ca ${assignResult.time}) ✅\n\n`;
                approveMsg += customService.formatBoard(assignResult.room);

                const payload = { msg: approveMsg };
                if (message.data) payload.quote = message.data;
                const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
                await this.api.sendMessage(payload, targetThreadId, threadType);
                return;
              } else if (assignResult.reason === 'TABLE_FULL' || assignResult.reason === 'ALL_TABLES_FULL') {
                let fullMsg = `⚠️ PHÒNG ĐÃ ĐẦY (12/12)!\n`;
                fullMsg += `👉 Vui lòng chọn bảng khác (ví dụ: @${targetPlayerName} B) hoặc đổi ca khác.`;
                const payload = { msg: fullMsg };
                if (message.data) payload.quote = message.data;
                const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
                await this.api.sendMessage(payload, targetThreadId, threadType);
                return;
              }
            }
          }

          // D.2 Trả lời bổ sung Giờ / Bảng khi trượt tin nhắn ảnh bill hoặc tin nhắn xác nhận của Bot
          const isBillOrBoardMsg = quotedMsg.includes('XÁC NHẬN BILL CHUYỂN KHOẢN')
            || quotedMsg.includes('DUYỆT BILL THÀNH CÔNG')
            || quotedMsg.includes('ĐÃ XẾP VÀO: SLOT')
            || quotedMsg.includes('VÀO SLOT [')
            || quotedMsg.includes('BẢNG CUSTOM')
            || quotedMsg.includes('THÔNG TIN CHUYỂN KHOẢN')
            || quotedMsg.includes('Quên ND')
            || quotedMsg.includes('Đổi ca')
            || (quoteObj?.attach && !quotedMsg)
            || (quoteObj?.attach && typeof quoteObj.attach === 'string' && (quoteObj.attach.includes('photo') || quoteObj.attach.includes('http')));

          const cleanReplyContent = content.replace(/^@[^\s]+\s*/g, '').trim();
          const timeMatch = cleanReplyContent.match(/(?:^|\s)(?:ca\s*)?([1-9]|1[0-9]|2[0-4])\s*(?:h|H|g|G|giờ|\:00)(?=\s|$)/i);
          const tableMatch = cleanReplyContent.match(/(?:^|\s)(?:bảng\s*([A-Za-z][0-9]*)|([A-Za-z][0-9]*))(?=\s|$)/i);
          const hasTimePattern = Boolean(timeMatch);
          const hasTablePattern = Boolean(tableMatch);

          if (isBillOrBoardMsg && (hasTimePattern || hasTablePattern)) {
            const perm = await this.checkAdminPermission(threadId, threadType, senderId);
            if (!perm.allowed) return; // Chỉ Trưởng/Phó nhóm mới có quyền thao tác slot
            let customTime = null;
            let customTable = null;

            if (timeMatch) {
              customTime = `${timeMatch[1]}h`;
            }

            if (tableMatch) {
              const candidate = (tableMatch[1] || tableMatch[2]).toUpperCase();
              if (candidate !== 'H') {
                customTable = candidate;
              }
            }

            if (customTime || customTable) {
              const relocate = customService.relocatePlayerSlot(
                threadId,
                senderId,
                senderName,
                customTime,
                customTable
              );

              if (relocate.success) {
                let repMsg = `🔄 ĐỔI SLOT THÀNH CÔNG! 🎉\n`;
                if (relocate.isRelocated) {
                  repMsg += `👉 ${senderName}: [${relocate.oldRoom.table} - S${relocate.oldSlotId}] ➔ [${relocate.room.table} - S${relocate.slotIndex}] (Ca ${relocate.time}) ✅\n\n`;
                } else {
                  repMsg += `👉 ${senderName} ➔ [${relocate.room.table} - S${relocate.slotIndex}] (Ca ${relocate.time}) ✅\n\n`;
                }
                repMsg += customService.formatBoard(relocate.room);

                const payload = { msg: repMsg };
                if (message.data) payload.quote = message.data;
                const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
                await this.api.sendMessage(payload, targetThreadId, threadType);
                return;
              } else if (relocate.reason === 'TARGET_TABLE_FULL') {
                let errRep = `⚠️ BẢNG [${relocate.tableKey}] ĐÃ FULL (12/12)!\n`;
                if (relocate.oldRoom && relocate.oldSlotId) {
                  errRep += `👉 Vẫn giữ slot tại: [${relocate.oldRoom.table} - S${relocate.oldSlotId}].\n`;
                }
                errRep += `📞 Vui lòng chọn ca hoặc bảng khác.`;
                const payload = { msg: errRep };
                if (message.data) payload.quote = message.data;
                const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
                await this.api.sendMessage(payload, targetThreadId, threadType);
                return;
              }
            }
          }
        }

        // 2. KIỂM TRA TRẠNG THÁI CHỜ NHẬP NGÀY THEO SESSION (khi không trượt tin nhắn)
        if (pendingRequest && pendingRequest.type === 'WAITING_DATE') {
          const perm = await this.checkAdminPermission(threadId, threadType, senderId);
          if (!perm.allowed) return;

          const parsedDate = parseDateInput(content);
          if (parsedDate) {
            this.pendingSlotRequests.delete(requestKeyUser);
            this.pendingSlotRequests.delete(requestKeyThread);
            await this.executeSlotCalculation(
              pendingRequest.accountId,
              pendingRequest.slotId,
              threadId,
              threadType,
              message.data,
              parsedDate
            );
            return;
          }
        }

        // 3. KIỂM TRA TRẠNG THÁI CHỌN SỐ KHUNG GIỜ (1-8) THEO SESSION (khi không trượt tin nhắn)
        const cleanTextForSlotSession = content.replace(/^@[^\s]+\s*/g, '').trim();
        const slotMatch = cleanTextForSlotSession.match(/\b([1-8])\b/) || content.match(/\b([1-8])\b/);
        if (pendingRequest && pendingRequest.type === 'WAITING_SLOT' && slotMatch) {
          const perm = await this.checkAdminPermission(threadId, threadType, senderId);
          if (!perm.allowed) return;

          if (customService.isHideCommand(threadId)) {
            this.deleteCommandMessage(message).catch(() => {});
          }

          const chosenSlotId = parseInt(slotMatch[1], 10);
          this.pendingSlotRequests.delete(requestKeyUser);
          this.pendingSlotRequests.delete(requestKeyThread);
          await this.executeSlotCalculation(
            pendingRequest.accountId,
            chosenSlotId,
            threadId,
            threadType,
            message.data
          );
          return;
        }

        // 4. KIỂM TRA TIỀN TỐ LỆNH VÀ HỖ TRỢ LỆNH TRỰC TIẾP (KHÔNG CẦN DẤU) KHI TRƯỢT TRẢ LỜI HOẶC CHAT 1-1
        let prefix = this.prefixes.find((p) => content.startsWith(p));
        let rawCmd = '';
        let args = [];

        if (prefix) {
          const afterPrefix = content.slice(prefix.length).trim();
          if (!afterPrefix) return;

          const tokens = afterPrefix.split(/\s+/);
          const firstWord = tokens[0]?.toLowerCase();

          if (afterPrefix.startsWith('@')) {
            // Người dùng nhập dạng: .@tênnguoizalo, @tennguoizalo...
            rawCmd = 'addplayer';
            args = [content];
          } else if (/^[a-z](?:[0-9]{1,2})?$/i.test(firstWord) && tokens.length > 1) {
            // Người dùng gõ trực tiếp vào bảng: .b quy, phu hoặc .a Văn Thịnh, .a1 Long...
            rawCmd = 'addplayertable';
            args = [firstWord, afterPrefix.slice(firstWord.length).trim()];
          } else if (KNOWN_COMMANDS.includes(firstWord)) {
            rawCmd = firstWord;
            args = tokens.slice(1);
          } else {
            // Chỉ coi là lệnh nhập tên tuyển thủ nếu có dấu phẩy hoặc có tag hoặc có từ 2 từ trở lên
            // Tránh việc thành viên/admin chat câu bình thường (.alo, .oke, .vcl, .haha) bị coi là tên tuyển thủ
            const casualWords = new Set(['alo', 'oke', 'ok', 'vcl', 'haha', 'hi', 'chao', 'ko', 'dc', 'roi', 'uh', 'uk', 'cl', 'dit', 'vai', 'vl', 'di', 'ad', 'slot']);
            const isLikelyPlayer = (content.includes(',') || content.includes('@') || tokens.length >= 2) && !casualWords.has(firstWord);
            if (isLikelyPlayer) {
              rawCmd = 'addplayer';
              args = [content];
            } else {
              return; // Bỏ qua, không phải lệnh bot
            }
          }
        } else if (isQuote || threadType === ThreadType.User) {
          const tokens = content.trim().split(/\s+/);
          const firstWord = tokens[0]?.toLowerCase();
          if (firstWord && KNOWN_COMMANDS.includes(firstWord)) {
            rawCmd = firstWord;
            args = tokens.slice(1);
          }
        }

        if (!rawCmd) return;
        const command = rawCmd.toLowerCase();

        console.log(`📩 [${senderName}] Nhận lệnh [${command}] với tham số:`, args);

        await this.handleCommand(command, args, message, senderName, content);
      } catch (error) {
        console.error('❌ Lỗi xử lý tin nhắn:', error);
      }
    });

    this.api.listener.start();
  }

  async handleCommand(command, args, message, senderName, content = '') {
    const threadId = message.threadId;
    const threadType = message.type;
    const senderId = message.data?.uidFrom || 'unknown';

    // THÔNG TIN TRƯỢT TIN NHẮN TRẢ LỜI (QUOTE REPLY) TRÊN ĐIỆN THOẠI
    const quoteObj = message.data?.quote || null;
    const isQuote = !!quoteObj;
    const quotedMsg = (quoteObj?.msg || '').trim();

    const isHideCmd = customService.isHideCommand(threadId);
    const reply = async (text, attachments = null) => {
      const payload = { msg: text };
      if (message.data && !message.isSelf && !isHideCmd) {
        payload.quote = message.data;
      }
      if (attachments && attachments.length > 0) {
        payload.attachments = attachments;
      }
      const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo && message.data.idTo !== '0' ? message.data.idTo : this.api?.getOwnId?.());
      await this.api.sendMessage(payload, targetThreadId, threadType);

      // Tự động xóa file ảnh tạm trong assets/output/ sau khi gửi thành công
      if (attachments && attachments.length > 0) {
        setTimeout(() => {
          attachments.forEach((file) => {
            try {
              const filePath = typeof file === 'string' ? file : file?.filename;
              if (filePath && (filePath.includes('assets\\output') || filePath.includes('assets/output'))) {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              }
            } catch (e) {}
          });
        }, 5000);
      }
    };

    // KIỂM TRA PHÂN QUYỀN TUYỆT ĐỐI: CHỈ TRƯỞNG NHÓM HOẶC PHÓ NHÓM MỚI ĐƯỢC DÙNG LỆNH BOT
    // Nếu không phải Trưởng nhóm hoặc Phó nhóm mà gõ lệnh, bot sẽ IM LẶNG HOÀN TOÀN (không phản hồi gì hết)
    const perm = await this.checkAdminPermission(threadId, threadType, senderId);
    if (!perm.allowed) {
      console.log(`⛔ [BỎ QUA - IM LẶNG] ${senderName} (${senderId}) không phải Trưởng/Phó nhóm nên bỏ qua lệnh [${command}].`);
      return; // Im lặng 100%, không gửi bất kỳ tin nhắn nào vào nhóm
    }

    // TỰ ĐỘNG XÓA TIN NHẮN LỆNH NẾU NHÓM ĐANG BẬT CHẾ ĐỘ ẨN LỆNH (.batan / .anlenh on)
    if (isHideCmd) {
      this.deleteCommandMessage(message).catch(() => {});
    }

    switch (command) {
      // Lệnh tính điểm theo khung giờ (.td <UID> [KhungGiờ] [Ngày])
      case 'td':
      case 'tinhdiem': {
        let accountId = args[0];
        let slotArg = args[1];
        let dateArg = args[2];

        // HỖ TRỢ TRƯỢT TIN NHẮN TRẢ LỜI (QUOTE REPLY) TRÊN ĐIỆN THOẠI:
        // Nếu người dùng trượt tin nhắn chứa UID để gõ .td (hoặc .td 1, td 1, td)
        if (isQuote && quotedMsg) {
          const uidMatch = quotedMsg.match(/(?:UID|ID|Tài khoản)[:\s]*\[?(\d{8,12})\]?/i) || quotedMsg.match(/\b(\d{8,12})\b/);
          if (uidMatch) {
            // Nếu người dùng gõ .td 1 hoặc td 1 (args[0] là số khung giờ 1-8)
            if (accountId && /^[1-8]$/.test(accountId)) {
              dateArg = slotArg;
              slotArg = accountId;
              accountId = uidMatch[1];
            } else if (!accountId) {
              // Người dùng chỉ gõ .td hoặc td khi trượt tin nhắn chứa UID
              accountId = uidMatch[1];
            }
          }
        }

        if (!accountId) {
          await reply(`⚠️ Vui lòng nhập UID người chơi!\nVí dụ: .td 1739355607\nHoặc chọn luôn khung giờ: .td 1739355607 8\nHoặc chọn cả ngày: .td 1739355607 8 05/09\n👉 Mẹo trên điện thoại: Trượt tin nhắn chứa UID qua để gõ .td hoặc td 1!`);
          return;
        }

        // Nếu người dùng gõ sẵn khung giờ: .td 1739355607 8 [05/09]
        if (slotArg && /^[1-8]$/.test(slotArg)) {
          const chosenSlotId = parseInt(slotArg, 10);
          const customDate = dateArg ? parseDateInput(dateArg) : null;
          await this.executeSlotCalculation(accountId, chosenSlotId, threadId, threadType, message.data, customDate);
          return;
        }

        // Nếu chỉ gõ .td <UID> -> Hiển thị menu chọn khung giờ 1-8
        const menuText = formatSlotMenu(accountId, senderName);
        await reply(menuText);

        // Lưu trạng thái chờ người dùng gõ số 1-8 (hết hạn sau 5 phút)
        const requestKeyUser = `${threadId}_${senderId}`;
        const requestKeyThread = `${threadId}`;
        const slotSession = {
          type: 'WAITING_SLOT',
          accountId,
          senderName,
          createdAt: Date.now()
        };

        this.pendingSlotRequests.set(requestKeyUser, slotSession);
        this.pendingSlotRequests.set(requestKeyThread, slotSession);

        setTimeout(() => {
          if (this.pendingSlotRequests.get(requestKeyUser)?.type === 'WAITING_SLOT') {
            this.pendingSlotRequests.delete(requestKeyUser);
            this.pendingSlotRequests.delete(requestKeyThread);
          }
        }, 5 * 60 * 1000);

        break;
      }

      // Lệnh đổi hoặc xem danh sách mẫu phôi ảnh BXH (.mau [số_mẫu])
      case 'mau':
      case 'chonmau':
      case 'template': {
        const currentGroupTemplate = this.getGroupTemplate(threadId);
        const templates = imageService.getAvailableTemplates();
        const selected = args[0];

        // Nếu gõ: .mau xem <số> -> Chuyển sang lệnh xem mẫu ảnh
        if (selected && (selected.toLowerCase() === 'xem' || selected.toLowerCase() === 'view')) {
          const viewTarget = (args[1] || '').trim().replace(/^[#\s]+/, '');
          const idx = parseInt(viewTarget, 10) - 1;
          const targetId = templates[idx] || (templates.includes(`mau_${viewTarget}`) ? `mau_${viewTarget}` : viewTarget);
          const p = imageService.getTemplatePath(targetId);
          const name = imageService.getTemplateName(targetId);
          if (p) {
            await reply(`🖼️ [HÌNH ẢNH MẪU]: ${name}\n👉 Đổi sang mẫu này cho nhóm bằng lệnh: .mau #${viewTarget}\n----------bot tạo bởi Lê Đại Quý-----------`, [p]);
          } else {
            await reply(`⚠️ Vui lòng nhập số mẫu hợp lệ (1-${templates.length})!\nVí dụ: .mau xem 4 (hoặc .mau #4)`);
          }
          return;
        }

        if (!selected) {
          let text = `🎨 ═══ DANH SÁCH MẪU BẢNG XẾP HẠNG ═══ 🎨\n`;
          text += `----------bot tạo bởi Lê Đại Quý-----------\n\n`;
          const currentName = imageService.getTemplateName(currentGroupTemplate);
          text += `👉 Mẫu nhóm đang dùng: [${currentName}]\n\n`;
          text += `🔗 Kho ảnh toàn bộ các mẫu (Google Sheet):\n${GOOGLE_SHEET_TEMPLATES_URL}\n\n`;
          text += `📋 Danh sách mẫu có thể chọn:\n`;
          templates.forEach((t, i) => {
            const isCurrent = t === currentGroupTemplate ? ' (Đang dùng ✅)' : '';
            const desc = imageService.getTemplateName(t);
            text += `${i + 1}️⃣ ${desc}${isCurrent}\n`;
          });
          text += `\n💡 Đổi mẫu cho nhóm bằng lệnh: .mau #1, .mau #2, .mau #3, .mau #4...\n(Hoặc: .mau 1, .mau 2, .mau 3...)\n`;
          text += `🖼️ Xem ảnh mẫu: .xemmau 1, .xemmau 2... hoặc gõ .xemmau lấy link Google Sheet\n`;
          text += `----------bot tạo bởi Lê Đại Quý-----------`;
          await reply(text);
          return;
        }

        const cleanSelect = selected.trim().replace(/^[#\s]+/, '');
        const templateIdx = parseInt(cleanSelect, 10) - 1;
        let chosen = null;
        if (!isNaN(templateIdx) && templates[templateIdx]) {
          chosen = templates[templateIdx];
        } else if (templates.includes(selected)) {
          chosen = selected;
        } else if (templates.includes(`mau_${cleanSelect}`)) {
          chosen = `mau_${cleanSelect}`;
        }

        if (chosen) {
          this.setGroupTemplate(threadId, chosen);
          const chosenName = imageService.getTemplateName(chosen);
          await reply(`✅ Nhóm đã chuyển sang sử dụng [${chosenName}] thành công!\n(Mẫu này được lưu riêng cho nhóm này, không ảnh hưởng nhóm khác)\n----------bot tạo bởi Lê Đại Quý-----------`);
        } else {
          await reply(`⚠️ Mẫu không tồn tại. Vui lòng chọn từ .mau #1 đến .mau #${templates.length}!\n🔗 Xem kho mẫu tại: ${GOOGLE_SHEET_TEMPLATES_URL}`);
        }
        break;
      }

      // Lệnh xem trước hình ảnh phôi mẫu (.xemmau hoặc .xemmau [số_mẫu])
      case 'xemmau':
      case 'viewmau':
      case 'preview': {
        const currentGroupTemplate = this.getGroupTemplate(threadId);
        const templates = imageService.getAvailableTemplates();
        const target = args[0];

        // 1. Nếu chỉ gõ .xemmau hoặc .xemmau all -> Chỉ gửi link Google Sheet, KHÔNG gửi ảnh
        if (!target || target.toLowerCase() === 'all' || target.toLowerCase() === 'tatca') {
          let text = `🎨 KHO MẪU BẢNG XẾP HẠNG 🎨\n`;
          text += `----------bot tạo bởi Lê Đại Quý-----------\n\n`;
          text += `🔗 Link Google Sheet xem toàn bộ ảnh phôi mẫu:\n${GOOGLE_SHEET_TEMPLATES_URL}\n\n`;
          text += `👉 Xem ảnh mẫu cụ thể vào nhóm: .xemmau 1, .xemmau 2, .xemmau 3...\n`;
          text += `👉 Cài đặt mẫu cho nhóm: .mau 1, .mau 2, .mau 3...\n`;
          text += `----------bot tạo bởi Lê Đại Quý-----------`;
          await reply(text);
          return;
        }

        // 2. Chỉ khi gõ số mẫu cụ thể (.xemmau 1, .xemmau 2, .xemmau 3...) mới xuất ảnh ra
        const cleanTarget = target.trim().replace(/^[#\s]+/, '');
        const idx = parseInt(cleanTarget, 10) - 1;
        let targetId = null;
        if (!isNaN(idx) && templates[idx]) {
          targetId = templates[idx];
        } else if (templates.includes(target)) {
          targetId = target;
        } else if (templates.includes(`mau_${cleanTarget}`)) {
          targetId = `mau_${cleanTarget}`;
        }

        if (targetId) {
          const p = imageService.getTemplatePath(targetId);
          const name = imageService.getTemplateName(targetId);
          if (p) {
            const isCurrent = targetId === currentGroupTemplate ? ' (Đang dùng ✅)' : '';
            const sampleNum = idx !== -1 && !isNaN(idx) ? idx + 1 : (templates.indexOf(targetId) + 1);
            await reply(
              `🖼️ [MẪU SỐ ${sampleNum}]: ${name}${isCurrent}\n` +
              `👉 Cài đặt mẫu này cho nhóm gõ: .mau ${sampleNum}\n` +
              `----------bot tạo bởi Lê Đại Quý-----------`,
              [p]
            );
          } else {
            await reply(`❌ Không tìm thấy file ảnh của mẫu [${targetId}]!`);
          }
        } else {
          await reply(
            `⚠️ Số mẫu không hợp lệ! Vui lòng chọn từ .xemmau 1 đến .xemmau ${templates.length}\n` +
            `🔗 Link Google Sheet xem toàn bộ mẫu: ${GOOGLE_SHEET_TEMPLATES_URL}`
          );
        }
        break;
      }

      case 'help':
      case 'huongdan':
      case 'menu': {
        await reply(formatHelp(this.prefixes[0]));
        break;
      }

      // Lệnh đăng xuất Bot (.dangxuat / .logout)
      // Cho phép: Chính tài khoản Bot HOẶC Tin nhắn riêng 1-1 với Bot
      case 'dangxuat':
      case 'logout': {
        const ownBotId = String(this.api.getOwnId?.() || '').replace(/^0+/, '');
        const cleanSender = String(senderId).replace(/^0+/, '');
        const isBotAccount = message.isSelf === true || senderId === '0' || (ownBotId && cleanSender === ownBotId);
        const isPrivateChat = threadType === ThreadType.User;
        const isWhitelisted = config.bot.adminWhitelist && config.bot.adminWhitelist.includes(cleanSender);
        const canLogout = isBotAccount || isPrivateChat || isWhitelisted;

        if (!canLogout) {
          await reply(`⛔ QUYỀN HẠN BỊ TỪ CHỐI!\nĐể bảo vệ Bot an toàn, trong nhóm chỉ có chính tài khoản Bot mới được phép đăng xuất.\n👉 Bạn cũng có thể nhắn tin riêng 1-1 cho Bot lệnh: .dangxuat`);
          return;
        }

        console.log(`\n🚪 [ĐĂNG XUẤT] Nhận lệnh đăng xuất từ: ${senderName} (${senderId}). Đang xóa phiên...`);
        
        const sessionFile = config.bot.sessionPath;
        let sessionDeleted = false;

        if (fs.existsSync(sessionFile)) {
          try {
            fs.unlinkSync(sessionFile);
            sessionDeleted = true;
            console.log(`🗑️ Đã xóa file session: ${sessionFile}`);
          } catch (err) {
            console.error('Lỗi khi xóa file session:', err);
          }
        }

        if (fs.existsSync('qr.png')) {
          try { fs.unlinkSync('qr.png'); } catch (e) {}
        }

        let logoutMsg = `🚪 ═══ ĐĂNG XUẤT BOT THÀNH CÔNG ═══ 🚪\n`;
        if (sessionDeleted) {
          logoutMsg += `✅ Đã xóa file lưu phiên đăng nhập Zalo (${path.basename(sessionFile)}) thành công!\n`;
        } else {
          logoutMsg += `ℹ️ Không tìm thấy file phiên đăng nhập hoặc đã được xóa trước đó.\n`;
        }
        logoutMsg += `👉 Bot đã ngắt kết nối và dừng hoạt động ngay bây giờ.\n`;
        logoutMsg += `👉 Để đổi tài khoản khác làm Bot: Hãy chạy lại lệnh "npm start" trên máy tính và dùng tài khoản Zalo mới quét mã QR.`;

        await reply(logoutMsg);

        // Dừng listener và thoát tiến trình sau 1.5s để đảm bảo tin nhắn gửi thành công
        setTimeout(() => {
          console.log('👋 Bot đã đăng xuất hoàn tất và dừng tiến trình.\n');
          try {
            this.api.listener.stop();
          } catch (e) {}
          process.exit(0);
        }, 1500);

        break;
      }

      case 'check':
      case 'status': {
        const res = await garenaService.getUserProfile();
        if (res.success && res.data) {
          const text = `✅ [GARENA TRỰC TUYẾN]\n👤 Tên hiển thị: ${res.data.nickName}\n🆔 Account ID: ${res.data.accountId}\n🎖️ Level: ${res.data.level}\n🟢 Trạng thái: Cookie còn hạn sử dụng tốt!`;
          await reply(text);
        } else {
          await reply(`❌ [GARENA NGOẠI TUYẾN]\n⚠️ Cookie phiên làm việc đã hết hạn hoặc bị chặn.\nVui lòng F12 lấy lại Cookie mới và cập nhật vào .env!`);
        }
        break;
      }

      case 'diem':
      case 'tran':
      case 'score': {
        let matchId = args[0];
        if (!matchId && isQuote && quotedMsg) {
          const matchIdMatch = quotedMsg.match(/\b\d{18,20}\b/);
          if (matchIdMatch) {
            matchId = matchIdMatch[0];
          }
        }

        if (!matchId) {
          await reply(`⚠️ Vui lòng nhập ID trận đấu!\nVí dụ: !diem 2096072125441953792\n👉 Mẹo trên điện thoại: Trượt tin nhắn chứa ID trận qua để gõ .diem!`);
          return;
        }

        const res = await garenaService.getMatchDetail(matchId);

        if (res.success && res.match) {
          await reply(formatMatchDetail(res.match));
        } else {
          await reply(`❌ ${res.message || 'Không tìm thấy hoặc trận đấu chưa kết thúc.'}`);
        }
        break;
      }

      case 'tongdiem':
      case 'bxh':
      case 'total': {
        // Hỗ trợ trượt tin nhắn chứa các ID trận đấu và gõ .bxh hoặc bxh
        if (args.length === 0 && isQuote && quotedMsg) {
          const matchIds = quotedMsg.match(/\b\d{18,20}\b/g);
          if (matchIds && matchIds.length > 0) {
            args = matchIds;
          }
        }

        if (args.length === 0) {
          await reply(`⚠️ Vui lòng nhập danh sách các ID trận đấu cách nhau bởi dấu cách!\nVí dụ: !tongdiem 2096072125441953792 2096077702004002816\n👉 Mẹo trên điện thoại: Trượt tin nhắn chứa danh sách trận qua để gõ .bxh!`);
          return;
        }

        const res = await garenaService.calculateTournamentScores(args);

        if (res.success && res.aggregatedTeamRanks) {
          try {
            const template = this.getGroupTemplate(threadId);
            const imagePath = await imageService.generateLeaderboardImage(res.aggregatedTeamRanks, {
              template,
              matches: res.matches
            });
            const caption = `📊 BẢNG XẾP HẠNG TỔNG KẾT (${args.length} trận)`;
            await reply(caption, [imagePath]);
          } catch (err) {
            console.error('Lỗi tạo ảnh BXH:', err);
            await reply(formatAggregatedScores(res.aggregatedTeamRanks, args));
          }
        } else {
          await reply(`❌ Lỗi khi tính điểm: ${res.error || 'Vui lòng kiểm tra lại các ID trận đấu.'}`);
        }
        break;
      }

      case 'timtran':
      case 'find': {
        let accountId = args[0];
        const days = parseInt(args[1] || '7', 10);

        if (!accountId && isQuote && quotedMsg) {
          const uidMatch = quotedMsg.match(/(?:UID|ID|Tài khoản)[:\s]*\[?(\d{8,12})\]?/i) || quotedMsg.match(/\b(\d{8,12})\b/);
          if (uidMatch) {
            accountId = uidMatch[1];
          }
        }

        if (!accountId) {
          await reply(`⚠️ Vui lòng nhập UID người chơi cần tìm trận!\nVí dụ: !timtran 1739355607 7\n👉 Mẹo trên điện thoại: Trượt tin nhắn chứa UID qua để gõ .timtran!`);
          return;
        }

        const res = await garenaService.findMatchesByPlayer(accountId, days);

        if (res.success) {
          await reply(formatPlayerMatches(accountId, res.matches));
        } else {
          await reply(`❌ Lỗi tìm kiếm: ${res.error || 'Không thể tra cứu.'}`);
        }
        break;
      }

      // Lệnh kick tất cả thành viên thường trong nhóm (bảo lưu Trưởng nhóm và các Phó nhóm)
      case 'kickall':
      case 'kick-all':
      case 'kicktatca':
      case 'locnhom':
      case 'clearall': {
        if (threadType === ThreadType.User) {
          await reply(`⚠️ Lệnh này chỉ có thể sử dụng trong Nhóm chat Zalo!`);
          return;
        }

        try {
          // Lấy dữ liệu nhóm mới nhất từ Zalo API
          const res = await this.api.getGroupInfo(threadId);
          const info = res?.gridInfoMap?.[threadId];
          if (!info) {
            await reply(`❌ Không thể lấy thông tin nhóm chat từ Zalo. Vui lòng thử lại sau!`);
            return;
          }

          const cleanId = (id) => String(id || '').split('_')[0].trim();
          const creatorId = cleanId(info.creatorId);
          const adminIds = (info.adminIds || []).map(cleanId);
          const botId = cleanId(this.api.getOwnId?.() || '36775776416498471');

          // Kiểm tra xem tài khoản Bot có quyền quản trị (Trưởng nhóm hoặc Phó nhóm) trong nhóm không
          const isBotAdmin = (creatorId === botId) || adminIds.includes(botId);
          if (!isBotAdmin) {
            await reply(`❌ THẤT BẠI: Bot hiện tại KHÔNG PHẢI là Trưởng nhóm hoặc Phó nhóm!\n👉 Vui lòng thăng quyền Phó nhóm cho tài khoản Bot trên Zalo thì Bot mới có thể kick thành viên.`);
            return;
          }

          // Danh sách ID tuyệt đối KHÔNG ĐƯỢC KICK (Trưởng nhóm, các Phó nhóm, Bot, Người gửi, Whitelist Admin)
          const exemptIds = new Set([
            creatorId,
            botId,
            cleanId(senderId),
            ...adminIds,
            ...(config.bot.adminWhitelist || []).map(cleanId)
          ]);

          // Lấy danh sách toàn bộ thành viên từ mọi nguồn trả về của Zalo (memVerList, currentMems, memberIds)
          const allMemberIdsSet = new Set();

          // 1. Zalo API trả về danh sách thành viên trong memVerList (dạng "<uid>_<version>")
          if (Array.isArray(info.memVerList)) {
            info.memVerList.forEach((item) => {
              const uid = cleanId(item);
              if (uid) allMemberIdsSet.add(uid);
            });
          }

          // 2. Dự phòng thêm từ currentMems (nếu có)
          if (Array.isArray(info.currentMems)) {
            info.currentMems.forEach((m) => {
              const uid = cleanId(m?.id || m);
              if (uid) allMemberIdsSet.add(uid);
            });
          }

          // 3. Dự phòng thêm từ memberIds (nếu có)
          if (Array.isArray(info.memberIds)) {
            info.memberIds.forEach((id) => {
              const uid = cleanId(id);
              if (uid) allMemberIdsSet.add(uid);
            });
          }

          const toKick = Array.from(allMemberIdsSet).filter((id) => id && !exemptIds.has(id));

          console.log(`[KICKALL] Nhóm: ${info.name || threadId} | Tổng mem: ${allMemberIdsSet.size} | Miễn trừ: ${exemptIds.size} | Cần kick: ${toKick.length}`);

          if (toKick.length === 0) {
            await reply(`ℹ️ Trong nhóm hiện tại không có thành viên thường nào để lọc!\n(Chỉ có Trưởng nhóm và ${adminIds.length} Phó nhóm).`);
            return;
          }

          await reply(`⏳ BẮT ĐẦU LỌC THÀNH VIÊN:\n👉 Đang tiến hành kick ${toKick.length} thành viên thường khỏi nhóm...\n🛡️ Đã bảo vệ: Trưởng nhóm và ${adminIds.length} Phó nhóm an toàn.`);

          let kickedCount = 0;
          let failedCount = 0;
          const chunkSize = 5;

          for (let i = 0; i < toKick.length; i += chunkSize) {
            const chunk = toKick.slice(i, i + chunkSize);
            try {
              await this.api.removeUserFromGroup(chunk, threadId);
              kickedCount += chunk.length;
            } catch (chunkErr) {
              console.warn(`Lỗi khi kick nhóm ${chunk.length} thành viên, thử kick từng người:`, chunkErr?.message || chunkErr);
              for (const singleId of chunk) {
                try {
                  await this.api.removeUserFromGroup(singleId, threadId);
                  kickedCount++;
                } catch (err) {
                  console.error(`Không thể kick uid ${singleId}:`, err?.message || err);
                  failedCount++;
                }
                await new Promise(r => setTimeout(r, 200));
              }
            }

            // Nghỉ nhẹ 400ms giữa các đợt để tránh Zalo chặn rate-limit
            if (i + chunkSize < toKick.length) {
              await new Promise(r => setTimeout(r, 400));
            }
          }

          // Xóa cache nhóm để lần sau cập nhật dữ liệu mới nhất
          this.groupInfoCache.delete(threadId);

          let summary = `✅ HOÀN TẤT LỌC THÀNH VIÊN!\n`;
          summary += `👥 Đã kick thành công: ${kickedCount}/${toKick.length} thành viên thường.\n`;
          if (failedCount > 0) {
            summary += `⚠️ Không thể kick: ${failedCount} thành viên (có thể đã tự rời nhóm).\n`;
          }
          summary += `🛡️ Đã bảo lưu an toàn Trưởng nhóm và ${adminIds.length} Phó nhóm.`;

          await reply(summary);
        } catch (err) {
          console.error('Lỗi khi thực hiện kickall:', err);
          await reply(`❌ Lỗi khi thực hiện kick thành viên: ${err?.message || 'Lỗi không xác định'}`);
        }
        break;
      }

      // ==========================================
      // QUẢN LÝ SLOT CUSTOM & TUYỂN THỦ
      // ==========================================

      // Lệnh nhập trực tiếp tên tuyển thủ (không cần @): .Văn Thịnh 1, Văn Thịnh 2...
      case 'addplayer': {
        const rawContent = content || (args && args.join(' ')) || '';
        const players = customService.extractPlayers(rawContent, message.data?.mentions);
        if (players.length === 0) {
          await reply(`⚠️ Vui lòng nhập tên tuyển thủ!\nVí dụ: .Văn Thịnh 1, Văn Thịnh 2, Bi (hoặc .quy, phu)`);
          return;
        }

        const res = customService.addPlayers(threadId, players);
        await reply(customService.formatBoard(res.room));
        break;
      }

      // Lệnh thêm tuyển thủ trực tiếp vào bảng chỉ định: .b quy, phu hoặc .a Văn Thịnh...
      case 'addplayertable': {
        const targetTable = args[0];
        const rawContent = args[1] || '';
        const players = customService.extractPlayers(rawContent, message.data?.mentions);
        if (players.length === 0) {
          await reply(`⚠️ Vui lòng nhập tên tuyển thủ cho [Bảng ${targetTable.toUpperCase()}]!\nVí dụ: .${targetTable} quy, phu`);
          return;
        }

        const res = customService.addPlayers(threadId, players, targetTable);
        await reply(customService.formatBoard(res.room));
        break;
      }

      // Lệnh xem TẤT CẢ các bảng cùng lúc (gộp chung Bảng A, Bảng B...): .all hoặc .dsall
      case 'all':
      case 'dsall': {
        await reply(customService.formatAllBoards(threadId));
        break;
      }

      // Lệnh chọn bảng đang thao tác: .chon A, .chon B, .chon B1...
      case 'chon': {
        const targetTable = args[0];
        if (!targetTable) {
          const current = customService.getActiveTableKey(threadId);
          await reply(`ℹ️ Bảng đang chọn hiện tại là: [Bảng ${current}]!\n👉 Đổi sang bảng khác: .chon A (hoặc .chon B, .chon B1)`);
          return;
        }
        const room = customService.setActiveTable(threadId, targetTable);
        await reply(`👉 Đã chuyển sang quản lý [${room.table}]!\n\n` + customService.formatBoard(room));
        break;
      }

      // Lệnh xóa một bảng (.xoabang B), xóa theo ca (.xoabang 14h) hoặc xóa toàn bộ bảng (.xoabang all, .xoatatcabang)
      case 'xoabang':
      case 'xoatatcabang':
      case 'xoatoanbobang':
      case 'clearallbang':
      case 'cleartatcabang': {
        const rawArg = (args[0] || '').trim();
        const lowerArg = rawArg.toLowerCase();

        // 1. Xóa TẤT CẢ các bảng
        if (
          command === 'xoatatcabang' || command === 'xoatoanbobang' || command === 'clearallbang' || command === 'cleartatcabang' ||
          lowerArg === 'all' || lowerArg === 'tatca' || lowerArg === 'toanbo' || lowerArg === 'het' || lowerArg === '*'
        ) {
          const res = customService.deleteAllTables(threadId);
          await reply(`🗑️ ĐÃ XÓA SẠCH TOÀN BỘ CÁC BẢNG THÀNH CÔNG! (${res.count} bảng)`);
          return;
        }

        if (!rawArg) {
          await reply(
            `⚠️ HƯỚNG DẪN XÓA BẢNG:\n` +
            `👉 Xóa 1 bảng cụ thể: .xoabang B (hoặc .xoabang C)\n` +
            `👉 Xóa các bảng theo ca: .xoabang 14h (hoặc .xoabang 19h)\n` +
            `👉 Xóa TẤT CẢ các bảng cũ để mở ca mới: .xoabang all (hoặc .xoatatcabang)`
          );
          return;
        }

        // 2. Xóa theo khung giờ (vd: .xoabang 14h hoặc .xoabang 19:00)
        if (/\d+h/i.test(lowerArg) || /\d+:\d+/.test(lowerArg) || /^\d{1,2}$/.test(lowerArg)) {
          const res = customService.deleteTablesByTime(threadId, rawArg);
          if (res.success) {
            await reply(`🗑️ ĐÃ XÓA CÁC BẢNG THUỘC CA [${rawArg.toUpperCase()}] (${res.count} bảng)!\n👉 Danh sách bảng đã xóa: ${res.deletedNames.join(', ')} ✅`);
          } else {
            await reply(`❌ Không tìm thấy bảng nào thuộc ca [${rawArg}] để xóa!`);
          }
          return;
        }

        // 3. Xóa một bảng cụ thể (vd: .xoabang B)
        const deleted = customService.deleteTable(threadId, rawArg);
        if (deleted) {
          await reply(`✅ Đã xóa [Bảng ${rawArg.toUpperCase()}] thành công!`);
        } else {
          await reply(`❌ Không tìm thấy bảng [${rawArg}] để xóa!`);
        }
        break;
      }


      // Lệnh tạo giải / tạo bảng custom mới: .taocus [giờ] [giá] [bảng] (tự động A -> A1 -> A2... nếu trùng)
      case 'taocus': {
        let timeArg = null;
        let feeArg = null;
        let tableArg = null;

        for (const arg of args) {
          const lower = arg.toLowerCase();
          if (/\d+h/i.test(lower) || /\d+:\d+/.test(lower) || /^\d{1,2}$/.test(lower)) {
            timeArg = arg.includes(':') || lower.endsWith('h') ? arg : `${arg}h`;
          } else if (/^(3k|5k|6k|\d+k)$/i.test(lower)) {
            feeArg = lower;
          } else if (/^(?:bảng\s*)?([a-z][0-9]*)$/i.test(lower)) {
            const m = lower.match(/^(?:bảng\s*)?([a-z][0-9]*)$/i);
            tableArg = `Bảng ${m[1].toUpperCase()}`;
          }
        }

        const options = {};
        if (timeArg) options.time = timeArg;
        if (feeArg) options.fee = feeArg;
        if (tableArg) options.table = tableArg;

        const res = customService.createRoom(threadId, options);
        let noteMsg = '';
        if (res.isRenamed) {
          noteMsg = `💡 [Bảng ${res.originalKey}] đã có nên tự động đặt là [${res.room.table}] để tránh trùng lặp! ✅\n\n`;
        }
        await reply(
          `✨ ĐÃ TẠO [${res.room.table}] (${res.room.time || 'Ca mới'}) THÀNH CÔNG! ✅\n` +
          noteMsg +
          customService.formatBoard(res.room)
        );
        break;
      }

      // Lệnh .clearslot đã gỡ bỏ hoàn toàn, im lặng không phản hồi
      case 'clearslot':
      case 'resetslot':
      case 'xoatatca': {
        const subArg = (args[0] || '').toLowerCase().trim();
        if (subArg === 'all' || subArg === 'bang' || subArg === 'toanbo' || subArg === 'tatca') {
          const res = customService.deleteAllTables(threadId);
          await reply(`🗑️ ĐÃ XÓA SẠCH TOÀN BỘ CÁC BẢNG THÀNH CÔNG! (${res.count} bảng)`);
          return;
        }
        return; // Im lặng hoàn toàn, không gửi tin nhắn
      }

      // Lệnh hủy slot: .xoa 3 hoặc .huyslot 3 5 7
      case 'huyslot':
      case 'delslot':
      case 'xoa': {
        if (args.length === 0) {
          await reply(`⚠️ Vui lòng nhập số slot cần xóa (1-12)!\nVí dụ: .xoa 3 hoặc .xoa 3 5 7`);
          return;
        }

        const slotNums = args.map(a => parseInt(a, 10)).filter(n => !isNaN(n) && n >= 1 && n <= 12);
        if (slotNums.length === 0) {
          await reply(`⚠️ Vui lòng nhập số slot hợp lệ từ 1 đến 12!`);
          return;
        }

        const res = customService.removeSlots(threadId, slotNums);
        await reply(customService.formatBoard(res.room));
        break;
      }

      // Lệnh đánh dấu đã đóng phí 💸: .phi 8 hoặc .phi 1 2 3
      case 'phi': {
        if (args.length === 0) {
          await reply(`⚠️ Vui lòng nhập số slot đã nộp phí 💸!\nVí dụ: .phi 8 hoặc .phi 1 2 3`);
          return;
        }
        const slotNums = args.map(a => parseInt(a, 10)).filter(n => !isNaN(n) && n >= 1 && n <= 12);
        const res = customService.updateSlotStatus(threadId, slotNums, '💸');
        await reply(customService.formatBoard(res.room));
        break;
      }

      // Lệnh đánh dấu hẹn phí ⏰: .hen 8
      case 'hen': {
        if (args.length === 0) {
          await reply(`⚠️ Vui lòng nhập số slot hẹn phí ⏰!\nVí dụ: .hen 8 hoặc .hen 4 5`);
          return;
        }
        const slotNums = args.map(a => parseInt(a, 10)).filter(n => !isNaN(n) && n >= 1 && n <= 12);
        const res = customService.updateSlotStatus(threadId, slotNums, '⏰');
        await reply(customService.formatBoard(res.room));
        break;
      }

      // Lệnh đổi giờ thi đấu: .gio 8h hoặc .gio 22H00
      case 'gio': {
        const timeStr = args.join(' ').trim();
        const room = customService.setTime(threadId, timeStr || null);
        await reply(customService.formatBoard(room));
        break;
      }

      // Lệnh đổi mức phí: .gia 6k (hoặc 3k, 5k)
      case 'gia': {
        const feeStr = args[0];
        if (!feeStr) {
          await reply(`⚠️ Vui lòng nhập mức phí! Ví dụ: .gia 6k (hoặc 3k, 5k)`);
          return;
        }
        const room = customService.setFee(threadId, feeStr);
        await reply(customService.formatBoard(room));
        break;
      }

      // Lệnh đổi tên bảng: đã tắt hoàn toàn, im lặng không phản hồi
      case 'bang': {
        return;
      }

      // Lệnh đổi CTK + Bill: .ctk LE DAI QUY
      case 'ctk': {
        const ctkStr = args.join(' ').trim();
        if (!ctkStr) {
          await reply(`⚠️ Vui lòng nhập tên CTK + Bill! Ví dụ: .ctk LE DAI QUY`);
          return;
        }
        const room = customService.setAdminCtk(threadId, ctkStr);
        await reply(customService.formatBoard(room));
        break;
      }

      // Lệnh đổi tên Box: .box BOX CUSTOM ĐQ
      case 'box': {
        const boxStr = args.join(' ').trim();
        if (!boxStr) {
          await reply(`⚠️ Vui lòng nhập tên Box! Ví dụ: .box BOX CUSTOM ĐQ`);
          return;
        }
        const room = customService.setBoxName(threadId, boxStr);
        await reply(customService.formatBoard(room));
        break;
      }

      // Lệnh thêm/xóa link IDMK: .link https://zalo.me/g/... hoặc .link xoa
      case 'link': {
        const linkStr = args[0] || '';
        if (linkStr.toLowerCase() === 'xoa' || linkStr.toLowerCase() === 'clear') {
          const room = customService.setLinkIdmk(threadId, '');
          await reply(customService.formatBoard(room));
          return;
        }
        if (!linkStr) {
          await reply(`⚠️ Vui lòng nhập link IDMK! Ví dụ: .link https://zalo.me/g/... (hoặc .link xoa để xóa)`);
          return;
        }
        const room = customService.setLinkIdmk(threadId, linkStr);
        await reply(customService.formatBoard(room));
        break;
      }

      // Lệnh xem bảng slot hiện tại: .cus, .custom, .xemslot, .bangleslot, .ds
      case 'cus':
      case 'custom':
      case 'xemslot':
      case 'bangleslot':
      case 'ds': {
        if (args[0] && (args[0].toLowerCase() === 'all' || args[0].toLowerCase() === 'tatca')) {
          await reply(customService.formatAllBoards(threadId));
          return;
        }
        if (args[0]) {
          const room = customService.getRoom(threadId, args[0]);
          await reply(customService.formatBoard(room));
          return;
        }
        const room = customService.getRoom(threadId);
        await reply(customService.formatBoard(room));
        break;
      }


      // Lệnh hiển thị ảnh mã QR và thông tin chuyển khoản: .qr, .stk, .bank
      case 'qr':
      case 'stk':
      case 'bank': {
        const bankInfo = customService.getGroupBankInfo(threadId);
        const qrPath = (bankInfo.qrImage && fs.existsSync(bankInfo.qrImage))
          ? bankInfo.qrImage
          : path.resolve(__dirname, '../assets/qr_tpbank.png');

        const isAuto = customService.isAutoBill(threadId);
        const feeSummary = customService.getGroupFeesSummary(threadId);
        let qrMsg = `🏦 THÔNG TIN CHUYỂN KHOẢN (${(bankInfo.bankName || 'NGÂN HÀNG').toUpperCase()})\n`;
        qrMsg += `👤 CTK: ${bankInfo.adminCtk}\n`;
        qrMsg += `💳 STK: ${bankInfo.bankAccount}\n`;
        qrMsg += `💰 Mức phí: ${feeSummary}\n`;
        qrMsg += `📝 ND: [Giờ + Bảng] (vd: 22h B)\n`;
        if (isAuto) {
          qrMsg += `👉 Chuyển xong GỬI ẢNH BILL vào nhóm, Bot tự xếp slot! ✅`;
        } else {
          qrMsg += `👉 Chuyển xong GỬI ẢNH BILL vào nhóm, Admin sẽ kiểm tra và duyệt slot! ⏳`;
        }

        const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
        if (fs.existsSync(qrPath)) {
          // Gửi ảnh kèm chữ trong cùng 1 tin nhắn duy nhất (không tách rời)
          await this.api.sendMessage({ msg: qrMsg, attachments: [qrPath] }, targetThreadId, threadType);
        } else {
          await reply(qrMsg);
        }
        break;
      }

      // Lệnh đổi mã QR chuyển khoản riêng của nhóm (dành cho người thuê / Admin)
      case 'doiqr':
      case 'setqr': {
        let qrUrl = message.photoUrl;

        // Nếu không có trực tiếp từ message.photoUrl, kiểm tra lại quoteObj
        if (!qrUrl && quoteObj) {
          const qAttach = quoteObj.attach;
          if (typeof qAttach === 'string') {
            try {
              const parsed = JSON.parse(qAttach);
              qrUrl = parsed.href || parsed.hdUrl || parsed.normalUrl || parsed.thumb || parsed.url;
              if (parsed.params) {
                const p = typeof parsed.params === 'string' ? JSON.parse(parsed.params) : parsed.params;
                qrUrl = qrUrl || p.hdUrl || p.normalUrl || p.rawUrl || p.thumbUrl;
              }
            } catch (e) {
              if (qAttach.startsWith('http')) qrUrl = qAttach;
            }
          } else if (typeof qAttach === 'object' && qAttach !== null) {
            qrUrl = qAttach.href || qAttach.hdUrl || qAttach.normalUrl || qAttach.thumb || qAttach.url;
          }
        }

        // Kiểm tra nếu người dùng paste link ảnh trực tiếp: .doiqr https://...
        if (!qrUrl && args[0] && args[0].startsWith('http')) {
          qrUrl = args[0];
        }

        if (!qrUrl) {
          let guideMsg = `⚠️ KHÔNG TÌM THẤY ẢNH MÃ QR!\n\n`;
          guideMsg += `👉 CÁCH 1 (Khuyên dùng): Gửi ảnh mã QR lên nhóm, ở phần chú thích (caption) gõ: .doiqr\n`;
          guideMsg += `👉 CÁCH 2: Trượt tin nhắn (reply) vào ảnh mã QR có sẵn trong nhóm rồi gõ: .doiqr\n`;
          guideMsg += `👉 CÁCH 3: .doiqr <link_ảnh>\n\n`;
          guideMsg += `💡 Sau khi đổi mã QR, bạn có thể chỉnh STK & Ngân hàng bằng lệnh: .setstk <STK> <Ngân Hàng> và .ctk <Tên CTK>`;
          await reply(guideMsg);
          return;
        }

        try {
          await reply(`⏳ Đang tải và lưu mã QR mới cho nhóm...`);
          const savedQrPath = await this.downloadAndSaveGroupQr(threadId, qrUrl);
          customService.setGroupQrImage(threadId, savedQrPath);

          const currentBank = customService.getGroupBankInfo(threadId);
          let successMsg = `✅ ĐÃ ĐỔI MÃ QR CHO NHÓM THÀNH CÔNG! 🎉\n\n`;
          successMsg += `👉 Mã QR này đã được kích hoạt riêng cho nhóm chat này.\n`;
          successMsg += `👉 Khi thành viên gõ .qr, .stk hoặc nhắn "xin qr", Bot sẽ tự động gửi mã QR này!\n\n`;
          successMsg += `📋 THÔNG TIN THANH TOÁN HIỆN TẠI:\n`;
          successMsg += `• STK: ${currentBank.bankAccount} (đổi: .setstk <STK> <NgânHàng>)\n`;
          successMsg += `• Ngân hàng: ${currentBank.bankName}\n`;
          successMsg += `• Chủ TK: ${currentBank.adminCtk} (đổi: .ctk <Tên>)\n\n`;
          successMsg += `🔄 Để quay về mã QR mặc định (TPBank): .xoaqr`;

          await reply(successMsg, [savedQrPath]);
        } catch (err) {
          console.error('Lỗi khi lưu mã QR:', err);
          await reply(`❌ Lỗi khi tải và lưu mã QR: ${err.message || 'Không thể tải ảnh'}`);
        }
        break;
      }

      // Lệnh xóa QR riêng, quay về QR mặc định
      case 'xoaqr':
      case 'resetqr': {
        customService.clearGroupQrImage(threadId);
        const customQrPath = path.resolve(__dirname, `../assets/qrs/qr_${threadId}.png`);
        if (fs.existsSync(customQrPath)) {
          try { fs.unlinkSync(customQrPath); } catch (e) {}
        }
        await reply(`✅ Đã xóa mã QR riêng của nhóm!\n👉 Từ giờ nhóm sẽ quay về sử dụng mã QR mặc định (TPBank).`);
        break;
      }

      // Lệnh đổi STK, Ngân Hàng và Tên Chủ TK riêng của nhóm: .setstk <STK> <Tên Ngân Hàng> [Tên CTK]
      case 'setstk': {
        if (args.length === 0) {
          let msg = `⚠️ Vui lòng nhập số tài khoản và tên ngân hàng!\n\n`;
          msg += `👉 CÚ PHÁP NHANH:\n`;
          msg += `• .setstk <STK> <Ngân Hàng> [Tên Chủ TK]\n`;
          msg += `• Ví dụ: .setstk 0987654321 MBBank LE DAI PHU\n`;
          msg += `• Ví dụ: .setstk 1903678910 Techcombank NGUYEN VAN A\n\n`;
          msg += `💡 Hoặc đổi riêng từng mục:\n`;
          msg += `• Đổi tên Chủ tài khoản: .ctk LE DAI PHU\n`;
          msg += `• Đổi ảnh mã QR: Gửi ảnh kèm .doiqr`;
          await reply(msg);
          return;
        }

        const stk = args[0];
        let bankName = '';
        let ctkName = '';

        if (args.length >= 3) {
          bankName = args[1];
          ctkName = args.slice(2).join(' ').trim();
        } else {
          bankName = args.slice(1).join(' ').trim() || 'Ngân hàng';
        }

        const updated = customService.setGroupBankInfo(threadId, stk, bankName, ctkName || null);

        let successMsg = `✅ ĐÃ CẬP NHẬT THÔNG TIN THANH TOÁN CHO NHÓM! 🏦\n\n`;
        successMsg += `👉 Số tài khoản: ${updated.bankAccount}\n`;
        successMsg += `👉 Ngân hàng: ${updated.bankName}\n`;
        successMsg += `👉 Chủ tài khoản: ${updated.adminCtk}\n`;
        successMsg += `👉 Mức phí: ${updated.fee}\n\n`;

        if (!ctkName && updated.adminCtk === 'LE DAI QUY') {
          successMsg += `⚠️ LƯU Ý QUAN TRỌNG VỀ QUÉT BILL:\n`;
          successMsg += `👉 Tên Chủ tài khoản hiện tại của nhóm vẫn là [LE DAI QUY]!\n`;
          successMsg += `👉 Khi người chơi chuyển khoản, trên bill sẽ hiện tên của bạn (không phải LE DAI QUY).\n`;
          successMsg += `👉 Vui lòng đổi tên Chủ tài khoản khớp với tài khoản nhận tiền bằng lệnh:\n`;
          successMsg += `.ctk <TÊN CỦA BẠN> (Ví dụ: .ctk LE DAI PHU)\n`;
          successMsg += `(Hoặc gõ lại: .setstk ${stk} ${bankName} <TÊN CỦA BẠN>)\n\n`;
        } else {
          successMsg += `💡 Khi người chơi gửi bill, Bot sẽ tự động kiểm tra theo đúng STK và Chủ tài khoản này! ✅\n\n`;
        }

        successMsg += `🖼️ Xem lại thông tin QR nhóm bằng lệnh: .qr`;
        await reply(successMsg);
        break;
      }

      // Lệnh đổi tên Chủ tài khoản riêng của nhóm: .ctk <Tên CTK>
      case 'ctk': {
        const ctkName = args.join(' ').trim();
        if (!ctkName) {
          await reply(`⚠️ Vui lòng nhập tên chủ tài khoản! Ví dụ: .ctk LE DAI PHU`);
          return;
        }
        const bankInfo = customService.getGroupBankInfo(threadId);
        customService.setGroupBankInfo(threadId, bankInfo.bankAccount, bankInfo.bankName, ctkName);
        await reply(`✅ Đã cập nhật tên Chủ tài khoản nhóm: [${ctkName.toUpperCase()}]!`);
        break;
      }

      // Lệnh BẬT / TẮT tự động duyệt bill: .autobill [on/off], .batbill, .tatbill
      case 'autobill':
      case 'batbill':
      case 'tatbill': {
        const isTurnOnCmd = command === 'batbill' || (args[0] && ['on', 'bat', 'bật', '1', 'true'].includes(args[0].toLowerCase()));
        const isTurnOffCmd = command === 'tatbill' || (args[0] && ['off', 'tat', 'tắt', '0', 'false'].includes(args[0].toLowerCase()));

        if (isTurnOnCmd) {
          customService.setAutoBill(threadId, true);
          await reply(`🔓 ĐÃ BẬT TỰ ĐỘNG DUYỆT BILL! ✅\n👉 Bot sẽ tự quét ảnh bill và xếp slot ngay.`);
        } else if (isTurnOffCmd) {
          customService.setAutoBill(threadId, false);
          await reply(`🔒 ĐÃ TẮT TỰ ĐỘNG DUYỆT BILL! ⛔\n👉 Admin trượt ảnh bill nhắn: @Tên [Bảng] để duyệt tay.`);
        } else {
          const currentStatus = customService.isAutoBill(threadId);
          await reply(`ℹ️ TỰ ĐỘNG DUYỆT BILL: [${currentStatus ? 'BẬT ✅' : 'TẮT ⛔'}]\n👉 Bật: .batbill (hoặc .autobill on)\n👉 Tắt: .tatbill (hoặc .autobill off)`);
        }
        break;
      }

      // Lệnh BẬT / TẮT toàn bộ hoạt động của Bot trong nhóm: .batbot, .tatbot, .bot [on/off]
      case 'batbot':
      case 'tatbot':
      case 'bot': {
        const isTurnOnCmd = command === 'batbot' || (args[0] && ['on', 'bat', 'bật', '1', 'true', 'start'].includes(args[0].toLowerCase()));
        const isTurnOffCmd = command === 'tatbot' || (args[0] && ['off', 'tat', 'tắt', '0', 'false', 'stop'].includes(args[0].toLowerCase()));

        if (isTurnOnCmd) {
          customService.setBotEnabled(threadId, true);
          await reply(`🟢 ĐÃ BẬT BOT CHO NHÓM NÀY! ✅\n👉 Bot bắt đầu hoạt động và phản hồi mọi lệnh, tính điểm, quét bill.`);
        } else if (isTurnOffCmd) {
          customService.setBotEnabled(threadId, false);
          await reply(`🔴 ĐÃ TẮT BOT TRONG NHÓM NÀY! ⛔\n👉 Bot sẽ tạm dừng mọi phản hồi trong nhóm (không hiện QR, không quét bill, không trả lời lệnh).\n👉 Khi cần dùng lại, Admin gõ: .batbot`);
        } else {
          const currentStatus = customService.isBotEnabled(threadId);
          await reply(`ℹ️ TRẠNG THÁI BOT TRONG NHÓM: [${currentStatus ? 'ĐANG BẬT 🟢' : 'ĐANG TẮT 🔴'}]\n👉 Bật bot: .batbot (hoặc .bot on)\n👉 Tắt bot: .tatbot (hoặc .bot off)`);
        }
        break;
      }

      // Lệnh BẬT / TẮT tự động ẩn tin nhắn lệnh: .anlenh, .batan, .tatan, .antan
      case 'anlenh':
      case 'antan':
      case 'batan':
      case 'tatan':
      case 'batanlenh':
      case 'tatanlenh': {
        const isTurnOnCmd = command === 'batan' || command === 'batanlenh' || (args[0] && ['on', 'bat', 'bật', '1', 'true'].includes(args[0].toLowerCase()));
        const isTurnOffCmd = command === 'tatan' || command === 'tatanlenh' || (args[0] && ['off', 'tat', 'tắt', '0', 'false'].includes(args[0].toLowerCase()));

        if (isTurnOnCmd) {
          customService.setHideCommand(threadId, true);
          await reply(`🙈 ĐÃ BẬT CHẾ ĐỘ ẨN TIN NHẮN LỆNH! ✅\n👉 Từ giờ khi Admin gõ lệnh, Bot sẽ tự động xóa tin nhắn lệnh đó ngay lập tức.`);
        } else if (isTurnOffCmd) {
          customService.setHideCommand(threadId, false);
          await reply(`👀 ĐÃ TẮT CHẾ ĐỘ ẨN TIN NHẮN LỆNH! ⛔\n👉 Tin nhắn gõ lệnh sẽ hiển thị bình thường trong nhóm.`);
        } else {
          const currentStatus = customService.isHideCommand(threadId);
          await reply(`ℹ️ CHẾ ĐỘ ẨN TIN NHẮN LỆNH: [${currentStatus ? 'BẬT 🙈' : 'TẮT 👀'}]\n👉 Bật: .batan (hoặc .anlenh on)\n👉 Tắt: .tatan (hoặc .anlenh off)`);
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Tự động xóa hoặc thu hồi tin nhắn lệnh khi bật chế độ ẩn lệnh
   */
  async deleteCommandMessage(message) {
    try {
      if (!message || !message.data) return;
      const threadId = message.threadId;
      const threadType = message.type;

      if (message.isSelf) {
        if (typeof this.api?.undo === 'function') {
          await this.api.undo({
            msgId: message.data.msgId,
            cliMsgId: message.data.cliMsgId
          }, threadId, threadType);
        }
      } else {
        if (typeof this.api?.deleteMessage === 'function') {
          const deleteDest = {
            threadId: String(threadId),
            type: threadType,
            data: {
              cliMsgId: String(message.data.cliMsgId || ''),
              msgId: String(message.data.msgId || ''),
              uidFrom: String(message.data.uidFrom || '')
            }
          };
          const res = await this.api.deleteMessage(deleteDest, false);
          console.log('🗑️ [Ẩn lệnh] Kết quả xóa tin nhắn:', res);
        }
      }
    } catch (err) {
      console.error('❌ [Ẩn lệnh] Không thể xóa tin nhắn lệnh:', err?.message || err, 'Code:', err?.code);
    }
  }

  /**
   * Xử lý tìm trận và tính điểm theo khung giờ và ngày được chọn
   * Tự động xuất ẢNH BẢNG XẾP HẠNG gửi vào Zalo
   */
  async executeSlotCalculation(accountId, slotId, threadId, threadType, quoteData, customDate = null) {
    const isHideCmd = customService.isHideCommand(threadId);
    const activeQuote = isHideCmd ? null : quoteData;
    const slotData = getSlotTimestamps(slotId, customDate);
    if (!slotData) {
      await this.api.sendMessage(
        { msg: `⚠️ Khung giờ số [${slotId}] không hợp lệ. Vui lòng chọn từ 1 đến 8!`, quote: activeQuote },
        threadId,
        threadType
      );
      return;
    }

    const { slot, startTime, endTime, dateLabel } = slotData;

    // 1. Tìm trận theo khoảng thời gian
    const matchRes = await garenaService.findMatchesByPlayer(accountId, startTime, endTime);

    if (!matchRes.success) {
      const errorMsg = typeof matchRes.error === 'object'
        ? (matchRes.error?.message || JSON.stringify(matchRes.error))
        : (matchRes.error || 'Không thể truy vấn');
      await this.api.sendMessage(
        { msg: `❌ Lỗi khi tìm trận đấu: ${errorMsg}`, quote: activeQuote },
        threadId,
        threadType
      );
      return;
    }

    const matches = matchRes.matches || [];

    // Nếu không tìm thấy trận -> Gợi ý nhập ngày để tìm lại
    if (matches.length === 0) {
      const senderId = quoteData?.uidFrom || 'user';
      const requestKeyUser = `${threadId}_${senderId}`;
      const requestKeyThread = `${threadId}`;

      // Chuyển sang trạng thái chờ nhập ngày (hết hạn sau 5 phút)
      const waitingDateSession = {
        type: 'WAITING_DATE',
        accountId,
        slotId,
        senderName: quoteData?.dName || 'Bạn',
        createdAt: Date.now()
      };

      this.pendingSlotRequests.set(requestKeyUser, waitingDateSession);
      this.pendingSlotRequests.set(requestKeyThread, waitingDateSession);

      setTimeout(() => {
        if (this.pendingSlotRequests.get(requestKeyUser)?.type === 'WAITING_DATE') {
          this.pendingSlotRequests.delete(requestKeyUser);
          this.pendingSlotRequests.delete(requestKeyThread);
        }
      }, 5 * 60 * 1000);

      const notFoundMsg = `⚠️ Không tìm thấy trận đấu nào của UID [${accountId}] trong khung giờ [${slot.label}] (Khung ${slotId}) ngày ${dateLabel}.\n\n📅 BẠN CÓ MUỐN TÌM VÀO NGÀY KHÁC?\n👉 Hãy trượt tin nhắn này qua và trả lời ngày: DD/MM (hoặc gõ "hôm qua")\nVí dụ: 07/09 hoặc 06/09/2026`;

      await this.api.sendMessage({ msg: notFoundMsg, quote: activeQuote }, threadId, threadType);
      return;
    }

    // 2. Lấy danh sách matchIds và tính điểm tổng
    const matchIds = matches.map((m) => m.id || m.matchId);
    const scoreRes = await garenaService.calculateTournamentScores(matchIds);

    if (scoreRes.success && scoreRes.aggregatedTeamRanks) {
      // 3. TẠO ẢNH BẢNG XẾP HẠNG TỪ MẪU VÀ GỬI THẲNG VÀO ZALO
      try {
        const template = this.getGroupTemplate(threadId);
        const imagePath = await imageService.generateLeaderboardImage(scoreRes.aggregatedTeamRanks, {
          template,
          matches: scoreRes.matches
        });
        const caption = `📊 BẢNG XẾP HẠNG KHUNG GIỜ [${slot.label}] - Ngày: ${dateLabel}\n👤 UID: ${accountId} | Tổng số trận: ${matchIds.length}`;

        await this.api.sendMessage(
          {
            msg: caption,
            attachments: [imagePath],
            quote: activeQuote
          },
          threadId,
          threadType
        );

        // Tự động xóa file ảnh BXH tạm sau khi Zalo đã tải xong
        setTimeout(() => {
          try {
            if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
          } catch (e) {}
        }, 5000);
      } catch (imgErr) {
        console.error('Lỗi tạo ảnh BXH:', imgErr);
        // Fallback sang text nếu không tạo được ảnh
        const leaderboardText = formatSlotLeaderboard(slot.label, dateLabel, accountId, matchIds, scoreRes.aggregatedTeamRanks);
        await this.api.sendMessage({ msg: leaderboardText, quote: activeQuote }, threadId, threadType);
      }
    } else {
      await this.api.sendMessage(
        { msg: `❌ Lỗi khi tính điểm cho các trận: ${matchIds.join(', ')}`, quote: activeQuote },
        threadId,
        threadType
      );
    }
  }
}

const bot = new BotManager();
bot.start().catch((err) => {
  console.error('❌ Lỗi khởi chạy Bot:', err);
});
