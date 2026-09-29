import { Zalo, ThreadType, LoginQRCallbackEventType } from 'zca-js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { config, validateConfig, updateEnvFile } from './config.js';
import { garenaService } from './services/garenaService.js';
import { imageService } from './services/imageService.js';
import { customService } from './services/customService.js';
import { keyService } from './services/keyService.js';
import { paymentService, PAYMENT_CONFIG } from './services/paymentService.js';
import { webhookServer } from './services/webhookServer.js';
import axios from 'axios';
import {
  formatHelp,
  formatSlotMenu,
  formatSlotLeaderboard,
  formatAntiMenu,
  getSlotTimestamps,
  parseDateInput,
  TIME_SLOTS
} from './utils/formatters.js';
import { announcementService } from './services/announcementService.js';
import { menuRenderService } from './services/menuRenderService.js';
import { boxService } from './services/boxService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Danh sách các lệnh hợp lệ (hỗ trợ gọi lệnh trực tiếp không cần dấu khi trượt tin nhắn trả lời trên điện thoại)
const KNOWN_COMMANDS = [
  'td', 'tinhdiem', 'bxh', 'bangxephang', 'tongdiem',
  'help', 'huongdan', 'menu', 'check', 'status',
  'kick', 'kickall', 'kick-all', 'kicktatca', 'locnhom', 'clearall',
  'doiqr', 'setqr', 'xoaqr', 'resetqr', 'setstk', 'ctk',
  'anti', 'baove',
  'setcookie', 'cookie',
  'napluot', 'nap', 'luot', 'checkkey', 'key',
  'luotdung', 'vohanbox',
  'id', 'boxid', 'idbox'
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

    let agent = undefined;
    if (config.bot.proxy) {
      try {
        agent = new HttpsProxyAgent(config.bot.proxy);
        console.log(`🌐 [PROXY] Đang sử dụng Proxy Zalo: ${config.bot.proxy.replace(/:[^:@]+@/, ':***@')}`);
      } catch (e) {
        console.error('❌ [PROXY] Lỗi khởi tạo proxy:', e.message);
      }
    }

    this.zalo = new Zalo({ selfListen: true, imageMetadataGetter, agent });
    this.api = null;
    this.prefixes = ['!', '.', '/'];
    this.selectedTemplate = 'bxhconan'; // Mẫu mặc định Conan & Kaito Kid
    this.pendingSlotRequests = new Map();
    this.pendingLogoRequests = new Map(); // Quản lý phiên xác nhận và gửi ảnh logo cho key
    this.pendingTitleRequests = new Map(); // Quản lý phiên nhập tên giải CUSTOM cho key
    this.groupInfoCache = new Map(); // Cache thông tin Trưởng / Phó nhóm
    this.spamTracker = new Map(); // Theo dõi spam tin nhắn: Map<`${threadId}_${senderId}`, number[]>
    this.pendingKickallConfirmations = new Map(); // Lưu phiên chờ xác nhận kickall: threadId -> { firstAdminId, firstAdminName, firstAdminRole, expiresAt }
    this.pendingFreeBoxRequests = new Map(); // Quản lý phiên chọn phạm vi kích hoạt box miễn phí
    this.recentMessages = new Map(); // Lưu cache tin nhắn nhóm phục vụ Anti Thu Hồi (Undo)
    this.userAvatarCache = new Map(); // Lưu cache avatar thành viên
    this.userQrCooldown = new Map(); // Giãn cách xin QR theo từng người (User Cooldown: 45s)
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
   * Tải và lưu ảnh logo của Key cho giải đấu
   */
  async downloadAndSaveKeyLogo(keyName, imageUrl) {
    const logoDir = path.resolve(__dirname, '../assets/logos');
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, { recursive: true });
    }
    const cleanKey = String(keyName).toLowerCase().trim();
    const targetFile = path.join(logoDir, `logo_${cleanKey}.png`);

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
   * Quét và giải mã QR code từ URL ảnh (Hỗ trợ ảnh độ phân giải cao & cả QR sáng/tối)
   */
  async scanQrFromUrl(imageUrl) {
    try {
      if (!imageUrl) return null;
      let url = String(imageUrl).trim();
      if (url.startsWith('//')) url = 'https:' + url;

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const img = await loadImage(Buffer.from(response.data));

      const tryScanCanvas = (w, h) => {
        try {
          const canvas = createCanvas(w, h);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
          return code ? code.data : null;
        } catch (e) {
          return null;
        }
      };

      // 1. Thử quét ở kích thước gốc
      let qrText = tryScanCanvas(img.width, img.height);
      if (qrText) return qrText;

      // 2. Thử scale ảnh nếu ảnh chụp màn hình điện thoại hoặc ảnh máy ảnh độ phân giải lớn
      const maxDim = Math.max(img.width, img.height);
      if (maxDim > 800) {
        const scale1 = 800 / maxDim;
        qrText = tryScanCanvas(Math.round(img.width * scale1), Math.round(img.height * scale1));
        if (qrText) return qrText;
      }

      if (maxDim > 1200) {
        const scale2 = 500 / maxDim;
        qrText = tryScanCanvas(Math.round(img.width * scale2), Math.round(img.height * scale2));
        if (qrText) return qrText;
      }

      return null;
    } catch (err) {
      console.error('❌ [Anti QR] Lỗi scan QR từ ảnh:', err?.message || err);
      return null;
    }
  }

  /**
   * Xóa tin nhắn vi phạm khỏi nhóm cho tất cả mọi người
   */
  async deleteMessage(message) {
    try {
      if (!message || !message.data) return;
      const threadId = message.threadId;
      const threadType = message.type;
      const deleteDest = {
        threadId: String(threadId),
        type: threadType,
        data: {
          cliMsgId: String(message.data.cliMsgId || ''),
          msgId: String(message.data.msgId || ''),
          uidFrom: String(message.data.uidFrom || '')
        }
      };
      if (typeof this.api?.deleteMessage === 'function') {
        await this.api.deleteMessage(deleteDest, false);
      }
    } catch (err) {
      console.error('❌ [Anti] Lỗi xóa tin nhắn:', err?.message || err);
    }
  }

  /**
   * Kick thành viên vi phạm khỏi nhóm
   */
  async kickMember(threadId, userId) {
    try {
      const cleanId = String(userId || '').replace(/^0+/, '');
      if (!cleanId || cleanId === '0') return false;
      await this.api.removeUserFromGroup(cleanId, threadId);
      return true;
    } catch (err) {
      console.error(`❌ [Anti] Không thể kick UID ${userId}:`, err?.message || err);
      return false;
    }
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
        const info = res?.gridInfoMap?.[threadId] || (res?.gridInfoMap ? Object.values(res.gridInfoMap)[0] : null);
        if (info) {
          const adminSet = new Set();
          const cleanId = (id) => String(id || '').split('_')[0].replace(/^0+/, '').trim();

          // 1. Quét từ adminIds (Danh sách Phó nhóm chuẩn do Zalo trả về)
          if (Array.isArray(info.adminIds)) {
            info.adminIds.forEach(id => {
              const str = cleanId(id);
              if (str) adminSet.add(str);
            });
          }

          // 2. Quét từ admins (nếu Zalo trả về dạng đối tượng)
          if (Array.isArray(info.admins)) {
            info.admins.forEach(item => {
              const id = typeof item === 'object' && item !== null ? (item.id || item.uid) : item;
              const str = cleanId(id);
              if (str) adminSet.add(str);
            });
          }

          const creatorStr = cleanId(info.creatorId);
          groupData = {
            creatorId: creatorStr,
            adminIds: Array.from(adminSet),
            cachedAt: now
          };
          this.groupInfoCache.set(threadId, groupData);
        }
      }

      if (groupData) {
        const cleanSenderId = String(senderId || '').split('_')[0].replace(/^0+/, '').trim();
        const isCreator = cleanSenderId === groupData.creatorId;
        const isDeputy = groupData.adminIds.includes(cleanSenderId);

        if (isCreator || isDeputy) {
          return {
            allowed: true,
            role: isCreator ? 'TRƯỞNG NHÓM' : 'PHÓ NHÓM'
          };
        }
      }

      console.log(`⛔ [TỪ CHỐI QUYỀN - IM LẶNG] Sender: ${cleanSender}. Admin List:`, groupData?.adminIds, `Creator:`, groupData?.creatorId);

      return {
        allowed: false,
        reason: ''
      };
    } catch (err) {
      console.error('Lỗi khi kiểm tra quyền nhóm:', err);
      return {
        allowed: false,
        reason: ''
      };
    }
  }

  /**
   * Kiểm tra quyền Admin tối cao của Bot (Chính tài khoản Bot hoặc UID trong ADMIN_WHITELIST)
   */
  isSuperAdmin(senderId, message = null) {
    const ownBotId = String(this.api?.getOwnId?.() || '').replace(/^0+/, '');
    const cleanSender = String(senderId || '').replace(/^0+/, '');
    if (message?.isSelf === true || cleanSender === '0' || (ownBotId && cleanSender === ownBotId)) {
      return true;
    }
    if (config.bot.adminWhitelist && config.bot.adminWhitelist.length > 0) {
      return config.bot.adminWhitelist.includes(senderId) || config.bot.adminWhitelist.includes(cleanSender);
    }
    return false;
  }

  checkIsAdmin(senderId, message = null) {
    return this.isSuperAdmin(senderId, message);
  }

  /**
   * Kiểm tra quyền Admin (Chính tài khoản bot, Whitelist, Chat 1-1 riêng, hoặc Trưởng/Phó nhóm)
   */
  async isAdmin(senderId, threadId = null, threadType = null, message = null) {
    if (this.isSuperAdmin(senderId, message)) return true;
    if (threadType === ThreadType.User) return true;
    if (threadId) {
      const perm = await this.checkAdminPermission(threadId, threadType, senderId);
      return !!perm?.allowed;
    }
    return false;
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

    // 2. Khởi động cổng Web Dashboard & Webhook SePay trước (để có thể mở QR đăng nhập trên web)
    webhookServer.start(this);

    // 3. Đăng nhập Zalo (tự động kích hoạt lắng nghe tin nhắn sau khi đăng nhập)
    await this.loginZalo();
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
        this.registerMessageHandler();
        return;
      } catch (err) {
        console.warn('⚠️ Phiên đăng nhập Zalo thất bại:', err?.message || err);
        try { if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile); } catch (e) {}
      }
    }

    // Nếu chưa có hoặc phiên cũ hết hạn -> Quét mã QR
    console.log('📱 Đang khởi tạo mã QR đăng nhập Zalo...');
    const qrPath = 'qr.png';

    try {
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
      this.registerMessageHandler();
    } catch (err) {
      console.error('❌ Lỗi khi đăng nhập QR Zalo:', err.message || err);
      console.log('🔄 Đang tự động tạo mã QR mới sau 3 giây...');
      try { if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath); } catch (e) {}
      setTimeout(() => {
        this.loginZalo().catch(e => console.error('Lỗi loginZalo retry:', e));
      }, 3000);
    }
  }

  registerMessageHandler() {
    if (!this.api || !this.api.listener) return;
    try {
      this.api.listener.stop?.();
    } catch (e) {}
    console.log(`🎧 Bot đang lắng nghe tin nhắn (Hỗ trợ tiền tố: "!", ".", "/")...\n`);

    // Khởi động lịch kiểm tra tự động phát thông báo quảng bá (3 tiếng/lần, bao gồm 12h đêm)
    announcementService.startScheduler(this);
    // Khởi động lịch thông báo thời hạn hoạt động Box Zalo lúc 00:05 mỗi ngày
    boxService.startDailyNotifier(this);

    // LẮNG NGHE SỰ KIỆN NHÓM (GROUP_EVENT) ĐỂ THỰC HIỆN ANTI CONTROL, ANTI ĐỔI TÊN, ANTI THAY AVATAR
    this.api.listener.on('group_event', async (event) => {
      try {
        if (!event || !event.threadId) return;
        const threadId = String(event.threadId);
        const boxStatus = boxService.isGroupActive(threadId);
        if (!boxStatus.allowed) return; // Bỏ qua nếu nhóm chưa được kích hoạt
        const anti = customService.getGroupAnti(threadId);
        if (!anti) return;

        const actorId = String(event.data?.creatorId || event.data?.sourceId || event.data?.actorId || '').replace(/^0+/, '');
        if (!actorId || actorId === '0') return;

        // Nếu là chính bot hoặc admin hợp lệ thì bỏ qua
        const perm = await this.checkAdminPermission(threadId, ThreadType.Group, actorId);
        if (perm.allowed) return;

        const eventTypeStr = String(event.type || '').toLowerCase();

        // 1. Chống đổi tên / cài đặt nhóm trái phép
        if (anti.changeName && (eventTypeStr === 'update' || eventTypeStr === 'update_setting')) {
          await this.kickMember(threadId, actorId);
          await this.api.sendMessage(
            { msg: `🛡️ [ANTI ĐỔI TÊN] Đã kick thành viên (${actorId}) do tự ý đổi tên/thông tin nhóm trái phép!` },
            threadId,
            ThreadType.Group
          );
          return;
        }

        // 2. Chống thay đổi ảnh đại diện nhóm trái phép
        if (anti.changeAvatar && eventTypeStr === 'update_avatar') {
          await this.kickMember(threadId, actorId);
          await this.api.sendMessage(
            { msg: `🛡️ [ANTI THAY AVATAR] Đã kick thành viên (${actorId}) do tự ý đổi ảnh đại diện nhóm trái phép!` },
            threadId,
            ThreadType.Group
          );
          return;
        }
      } catch (err) {
        console.error('❌ Lỗi xử lý group_event anti:', err);
      }
    });

    // LẮNG NGHE SỰ KIỆN THU HỒI TIN NHẮN (UNDO) ĐỂ THỰC HIỆN ANTI THU HỒI
    this.api.listener.on('undo', async (undo) => {
      try {
        if (!undo) return;
        const threadId = String(undo.threadId || undo.data?.idTo || '');
        if (!threadId || threadId === '0') return;
        const boxStatus = boxService.isGroupActive(threadId);
        if (!boxStatus.allowed) return; // Bỏ qua nếu nhóm chưa được kích hoạt

        const anti = customService.getGroupAnti(threadId);
        if (!anti || !anti.antiUndo) return;

        const delContent = undo.data?.content?.deleteMsg || {};
        const delMsgId = String(delContent.msgId || undo.data?.msgId || '');
        const delCliId = String(delContent.clientMsgId || delContent.cliMsgId || undo.data?.cliMsgId || '');

        const cached = (delMsgId && this.recentMessages.get(`${threadId}_${delMsgId}`)) ||
                       (delCliId && this.recentMessages.get(`${threadId}_${delCliId}`));

        if (cached) {
          let notify = `🕵️‍♂️ [ANTI THU HỒI] Phát hiện tin nhắn vừa bị thu hồi!\n` +
                       `👤 Người gửi: [${cached.senderName}]\n` +
                       `💬 Nội dung: "${cached.content || '(Tệp tin / Hình ảnh)'}"`;
          const payload = { msg: notify };
          if (cached.photoUrl) {
            payload.attachments = [cached.photoUrl];
          }
          await this.api.sendMessage(payload, threadId, ThreadType.Group);
        } else {
          const sender = undo.data?.dName || undo.data?.displayName || 'Thành viên';
          await this.api.sendMessage(
            { msg: `🕵️‍♂️ [ANTI THU HỒI] Thành viên [${sender}] vừa thu hồi 1 tin nhắn!` },
            threadId,
            ThreadType.Group
          );
        }
      } catch (err) {
        console.error('❌ Lỗi xử lý anti thu hồi (undo):', err);
      }
    });

    const isInternalZaloMediaUrl = (url) => {
      if (!url || typeof url !== 'string') return false;
      return /zadn\.vn|zaloapp\.com|res-zalo|photo-zalo|avatar-zalo|media-zalo|zalo-api/i.test(url) ||
             /\.(jpe?g|png|webp|gif|mp3|mp4|aac|m4a|wav)(\?.*)?$/i.test(url);
    };

    this.api.listener.on('message', async (message) => {
      try {
        let content = '';
        let photoUrl = null;
        let directPhotoUrl = null;
        let quotedPhotoUrl = null;
        let linkUrl = '';
        let fullMessageText = '';

        // Phân loại kiểu tin nhắn Zalo
        const msgTypeStr = String(message.data?.msgType || '').toLowerCase();
        const isLinkMsgType = msgTypeStr.includes('link');
        const isRecommendedMsgType = msgTypeStr.includes('recommended') || msgTypeStr.includes('invite') || msgTypeStr.includes('share') || msgTypeStr.includes('card');

        // Trích xuất nội dung chữ, liên kết và ảnh từ tin nhắn Zalo
        const extractPhotoFromData = (data) => {
          if (!data) return null;
          if (typeof data === 'string') {
            try {
              const p = JSON.parse(data);
              return extractPhotoFromData(p);
            } catch (e) {
              if (/\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(data) || /zadn\.vn|zaloapp\.com/i.test(data)) {
                return data;
              }
              return null;
            }
          }
          if (typeof data === 'object' && data !== null) {
            const photo = data.hdUrl || data.normalUrl || data.rawUrl || data.url || data.mediaUrl || data.fileUrl || data.thumbUrl || data.thumb;
            if (photo && typeof photo === 'string') return photo;
            if (data.href && (/\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(data.href) || /zadn\.vn|zaloapp\.com/i.test(data.href))) {
              return data.href;
            }
            if (data.params) {
              const pPhoto = extractPhotoFromData(data.params);
              if (pPhoto) return pPhoto;
            }
            if (data.data) {
              const dPhoto = extractPhotoFromData(data.data);
              if (dPhoto) return dPhoto;
            }
          }
          return null;
        };

        const rawContent = message.data?.content;
        if (typeof rawContent === 'string') {
          try {
            const parsed = JSON.parse(rawContent);
            if (typeof parsed === 'object' && parsed !== null) {
              const textParts = [parsed.text, parsed.title, parsed.description];
              const possibleUrl = parsed.href || parsed.url || parsed.link || parsed.targetUrl || parsed.groupLink || parsed.actionUrl || parsed.redirectUrl || parsed.uri;
              if (possibleUrl && !isInternalZaloMediaUrl(possibleUrl)) {
                linkUrl = linkUrl || possibleUrl;
                textParts.push(possibleUrl);
              }
              content = textParts.filter(Boolean).join(' ').trim();

              if (parsed.params) {
                try {
                  const p = typeof parsed.params === 'string' ? JSON.parse(parsed.params) : parsed.params;
                  const pUrl = p.href || p.url || p.link || p.targetUrl;
                  if (pUrl && !isInternalZaloMediaUrl(pUrl)) {
                    linkUrl = linkUrl || pUrl;
                    fullMessageText += pUrl + ' ';
                  }
                } catch (e) {}
              }

              if (parsed.data && typeof parsed.data === 'object') {
                const dUrl = parsed.data.href || parsed.data.url || parsed.data.link;
                if (dUrl && !isInternalZaloMediaUrl(dUrl)) linkUrl = linkUrl || dUrl;
              }
            } else {
              content = rawContent.trim();
            }
          } catch (e) {
            content = rawContent.trim();
          }
        } else if (typeof rawContent === 'object' && rawContent !== null) {
          const textParts = [rawContent.text, rawContent.title, rawContent.description];
          const possibleUrl = rawContent.href || rawContent.url || rawContent.link || rawContent.targetUrl || rawContent.groupLink || rawContent.actionUrl || rawContent.redirectUrl || rawContent.uri;
          if (possibleUrl && !isInternalZaloMediaUrl(possibleUrl)) {
            linkUrl = linkUrl || possibleUrl;
            textParts.push(possibleUrl);
          }
          content = textParts.filter(Boolean).join(' ').trim();

          if (rawContent.params) {
            try {
              const p = typeof rawContent.params === 'string' ? JSON.parse(rawContent.params) : rawContent.params;
              const pUrl = p.href || p.url || p.link || p.targetUrl;
              if (pUrl && !isInternalZaloMediaUrl(pUrl)) {
                linkUrl = linkUrl || pUrl;
                fullMessageText += pUrl + ' ';
              }
            } catch (e) {}
          }

          if (rawContent.data && typeof rawContent.data === 'object') {
            const dUrl = rawContent.data.href || rawContent.data.url || rawContent.data.link;
            if (dUrl && !isInternalZaloMediaUrl(dUrl)) linkUrl = linkUrl || dUrl;
          }
        }

        // Trích xuất ảnh trực tiếp (directPhotoUrl) do người này gửi
        directPhotoUrl = extractPhotoFromData(rawContent);
        if (!directPhotoUrl && message.data?.attach) {
          directPhotoUrl = extractPhotoFromData(message.data.attach);
        }
        if (!directPhotoUrl && message.data) {
          directPhotoUrl = extractPhotoFromData(message.data);
        }

        // Bổ sung các trường dữ liệu link khác từ Zalo API (CHỈ lấy chữ do người gửi gõ, KHÔNG lấy raw JSON chứa link media Zalo)
        let userMessageText = [content, message.data?.msg, message.data?.text, message.data?.caption].filter(Boolean).join(' ').trim();
        const candidateLink = message.data?.href || message.data?.url || message.data?.link;
        if (candidateLink && !isInternalZaloMediaUrl(candidateLink)) {
          linkUrl = linkUrl || candidateLink;
          userMessageText += ' ' + candidateLink;
        }

        // fullMessageText có thể chứa quote để làm ngữ cảnh phụ (nếu cần)
        fullMessageText += userMessageText;
        if (message.data?.quote?.msg) fullMessageText += ' ' + message.data.quote.msg;
        if (message.data?.quote?.attach) {
          fullMessageText += (typeof message.data.quote.attach === 'string' ? message.data.quote.attach : JSON.stringify(message.data.quote.attach)) + ' ';
        }

        // Kiểm tra ảnh trong tin nhắn quote (khi người dùng reply vào 1 ảnh trước đó)
        if (message.data?.quote) {
          quotedPhotoUrl = extractPhotoFromData(message.data.quote.attach) || extractPhotoFromData(message.data.quote);
        }

        photoUrl = directPhotoUrl || quotedPhotoUrl;
        message.photoUrl = photoUrl;
        message.directPhotoUrl = directPhotoUrl;
        message.quotedPhotoUrl = quotedPhotoUrl;

        // Nếu không có cả nội dung chữ, liên kết, ảnh, và không phải thẻ link/thẻ nhóm thì bỏ qua
        if (!content && !photoUrl && !linkUrl && !isLinkMsgType && !isRecommendedMsgType) return;

        // Nếu là tin nhắn từ chính tài khoản Bot (isSelf = true): bỏ qua để tránh vòng lặp
        if (message.isSelf) {
          return;
        }

        const threadId = message.threadId;
        const threadType = message.type;
        const senderId = message.data?.uidFrom || 'unknown';
        const senderName = message.data?.dName || message.data?.displayName || 'Thành viên';
        const lowerContent = (content || message.data?.msg || '').toLowerCase().trim();
        console.log(`📩 [TIN NHẮN] Từ [${senderName}] (${senderId}) tại [${threadId}]: "${lowerContent}"`);

        // Tự động lưu nhóm Zalo vào danh sách thông báo nếu nhóm đã được kích hoạt
        if (threadType !== ThreadType.User && threadId) {
          const boxStatus = boxService.isGroupActive(threadId);
          if (boxStatus.allowed) {
            announcementService.registerGroup(threadId);
          }
        }

        // Lưu tin nhắn nhóm vào bộ nhớ đệm phục vụ Anti Thu Hồi
        if (threadType !== ThreadType.User && !message.isSelf) {
          const msgId = String(message.data?.msgId || '');
          const cliMsgId = String(message.data?.cliMsgId || '');
          const msgRecord = {
            senderId,
            senderName,
            content: userMessageText || content || '',
            photoUrl: directPhotoUrl || null,
            timestamp: Date.now()
          };
          if (msgId) this.recentMessages.set(`${threadId}_${msgId}`, msgRecord);
          if (cliMsgId) this.recentMessages.set(`${threadId}_${cliMsgId}`, msgRecord);

          if (this.recentMessages.size > 2000) {
            const firstKey = this.recentMessages.keys().next().value;
            this.recentMessages.delete(firstKey);
          }
        }

        // ─── KIỂM TRA HỆ THỐNG BẢO VỆ NHÓM (ANTI) CHO THÀNH VIÊN THƯỜNG ───
        if (threadType !== ThreadType.User && !message.isSelf) {
          const boxStatus = boxService.isGroupActive(threadId);
          if (boxStatus.allowed) {
            const anti = customService.getGroupAnti(threadId);
          const hasAnyAnti = anti.spam || anti.tagAll || anti.link || anti.linkZalo ||
                             anti.qrZalo || anti.qrMess || anti.bankQr || anti.allQr ||
                             anti.sexyAvatar ||
                             anti.nsfw || anti.voice || anti.card || anti.image;
          if (hasAnyAnti) {
            const perm = await this.checkAdminPermission(threadId, threadType, senderId);
            if (!perm.allowed) {
              // 1. Chống Spam tin nhắn: 7 tin trong 10 giây
              if (anti.spam) {
                const now = Date.now();
                const spamKey = `${threadId}_${senderId}`;
                const timestamps = (this.spamTracker.get(spamKey) || []).filter(t => now - t <= 10000);
                timestamps.push(now);
                this.spamTracker.set(spamKey, timestamps);
                if (timestamps.length >= 7) {
                  this.spamTracker.delete(spamKey);
                  await this.deleteMessage(message);
                  await this.kickMember(threadId, senderId);
                  await this.api.sendMessage(
                    { msg: `🛡️ [ANTI SPAM] Đã kick [${senderName}] do spam tin nhắn liên tục (7 tin/10s)!` },
                    threadId,
                    threadType
                  );
                  return;
                }
              }

              // 2. Chống Tag All / Tab All (@all, @tất cả, @mọi người)
              if (anti.tagAll) {
                const hasTagAllMention = Array.isArray(message.data?.mentions) && message.data.mentions.some(m => {
                  return String(m.uid) === '-1' || m.type === 1 || (String(m.uid) === '0' && m.len >= 3);
                });
                const isTagAllText = /(?:^|\s)@(all|tất cả|tat ca|mọi người|moi nguoi)(?:$|[\s!?,.:])/i.test(userMessageText);
                if (hasTagAllMention || isTagAllText) {
                  await this.deleteMessage(message);
                  await this.kickMember(threadId, senderId);
                  await this.api.sendMessage(
                    { msg: `🛡️ [ANTI TAG ALL] Đã kick [${senderName}] do tự ý Tag All / Nhắc tên tất cả thành viên trái phép!` },
                    threadId,
                    threadType
                  );
                  return;
                }
              }

              // 3. Chống Tin Nhắn Thoại (Voice)
              const isVoiceMsg = msgTypeStr.includes('voice') ||
                                 message.data?.msgType === 'chat.voice' ||
                                 !!message.data?.voiceUrl ||
                                 !!rawContent?.voiceUrl;
              if (anti.voice && isVoiceMsg) {
                await this.deleteMessage(message);
                await this.kickMember(threadId, senderId);
                await this.api.sendMessage(
                  { msg: `🛡️ [ANTI VOICE] Đã kick [${senderName}] do gửi tin nhắn thoại (nhóm đang cấm voice)!` },
                  threadId,
                  threadType
                );
                return;
              }

              // 4. Chống Chia Sẻ Danh Thiếp / Card
              const rawStr = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
              const isCardMsg = isRecommendedMsgType && (
                /recommend_user|share_contact|contact_card/i.test(rawStr) ||
                message.data?.content?.type === 1 ||
                msgTypeStr.includes('card') ||
                msgTypeStr.includes('contact')
              );
              if (anti.card && isCardMsg) {
                await this.deleteMessage(message);
                await this.kickMember(threadId, senderId);
                await this.api.sendMessage(
                  { msg: `🛡️ [ANTI CARD] Đã kick [${senderName}] do chia sẻ danh thiếp/liên hệ cá nhân trái phép!` },
                  threadId,
                  threadType
                );
                return;
              }

              // 5. Chống Gửi Hình Ảnh
              if (anti.image && directPhotoUrl) {
                await this.deleteMessage(message);
                await this.kickMember(threadId, senderId);
                await this.api.sendMessage(
                  { msg: `🛡️ [ANTI ẢNH] Đã kick [${senderName}] do gửi hình ảnh vào nhóm (nhóm đang cấm gửi ảnh)!` },
                  threadId,
                  threadType
                );
                return;
              }

              // 6. Chống Nudo / 18+ / Đồi Trụy
              const NSFW_REGEX = /(?:^|[\s,.:;!?])(nudo|nudes?|clip nóng|lộ clip|clip sex|phim sex|jav|hentai|porn|xvideos|xxnx|gạ chịch|show hàng|bán quạt|onlyfans|link 18\+|link sex|gái gọi|thác loạn)(?:$|[\s,.:;!?])/i;
              if (anti.nsfw && userMessageText && NSFW_REGEX.test(userMessageText)) {
                await this.deleteMessage(message);
                await this.kickMember(threadId, senderId);
                await this.api.sendMessage(
                  { msg: `🛡️ [ANTI NUDO / 18+] Đã kick [${senderName}] do gửi nội dung 18+ / khiêu dâm trái phép!` },
                  threadId,
                  threadType
                );
                return;
              }

              // 7. Chống Link & Thẻ Nhóm Zalo (Chỉ kiểm tra tin nhắn của người này, KHÔNG phạt vì quote tin nhắn cũ)
              const ZALO_LINK_REGEX = /(?:https?:\/\/)?(?:chat\.)?zalo\.me(?:\/[a-zA-Z0-9_.-]*|\b)|zalo:\/\/[^\s]*/i;
              
              // Nhận diện thẻ mời / thẻ chia sẻ nhóm Zalo
              const isZaloShareCard = isRecommendedMsgType && (
                /join_group|invite|recommend_group/i.test(rawStr) ||
                message.data?.content?.type === 2 ||
                !!(message.data?.content?.groupId || message.data?.content?.group_id || message.data?.groupId)
              );

              const isZaloLink = isZaloShareCard ||
                                 ZALO_LINK_REGEX.test(userMessageText) ||
                                 (linkUrl && !isInternalZaloMediaUrl(linkUrl) && ZALO_LINK_REGEX.test(linkUrl));

              if (anti.linkZalo && isZaloLink) {
                await this.deleteMessage(message);
                await this.kickMember(threadId, senderId);
                await this.api.sendMessage(
                  { msg: `🛡️ [ANTI LINK ZALO] Đã kick [${senderName}] do gửi Link / Thẻ Nhóm Zalo vào nhóm!` },
                  threadId,
                  threadType
                );
                return;
              }

              // 10. Chống Link Website ngoài (Chỉ kiểm tra text người dùng gõ hoặc link card thật, KHÔNG phạt ảnh media)
              const URL_REGEX = /(?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*|[a-zA-Z0-9-]+\.(?:com|vn|net|org|xyz|top|site|vip|pro|online|info|me|cc|io|gg|link|app|live|club|fun|asia|mobi|tech|shop|store|cloud|dev|tv|edu|gov|biz|co)\b/i;
              
              let hasWebLink = false;
              if (!isZaloLink) {
                if (isLinkMsgType && linkUrl && !isInternalZaloMediaUrl(linkUrl)) {
                  hasWebLink = true;
                } else if (userMessageText && URL_REGEX.test(userMessageText)) {
                  // Đảm bảo không phải là link media zadn/zaloapp
                  const matchedUrls = userMessageText.match(/(?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*/gi) || [];
                  const hasRealExternalUrl = matchedUrls.length > 0 
                    ? matchedUrls.some(u => !isInternalZaloMediaUrl(u))
                    : URL_REGEX.test(userMessageText);
                  if (hasRealExternalUrl) {
                    hasWebLink = true;
                  }
                }
              }

              if (anti.link && hasWebLink) {
                await this.deleteMessage(message);
                await this.kickMember(threadId, senderId);
                await this.api.sendMessage(
                  { msg: `🛡️ [ANTI LINK] Đã kick [${senderName}] do gửi liên kết website trái phép!` },
                  threadId,
                  threadType
                );
                return;
              }

              // 11. Chống Avatar Sexy / Nhạy cảm
              if (anti.sexyAvatar) {
                let userAvatar = message.data?.avatar || message.data?.avt || message.data?.thumb || this.userAvatarCache.get(senderId);
                if (userAvatar === undefined) {
                  try {
                    if (typeof this.api?.getAvatarUrlProfile === 'function') {
                      const profile = await this.api.getAvatarUrlProfile(senderId);
                      userAvatar = profile?.avatar || profile?.data?.avatar || profile?.[senderId] || profile?.[0]?.avatar || '';
                    } else {
                      userAvatar = '';
                    }
                  } catch (e) {
                    userAvatar = '';
                  }
                  if (userAvatar) this.userAvatarCache.set(senderId, userAvatar);
                }

                if (userAvatar && /sexy|nude|18plus|nsfw|sex|jav|hentai/i.test(userAvatar)) {
                  await this.deleteMessage(message);
                  await this.kickMember(threadId, senderId);
                  await this.api.sendMessage(
                    { msg: `🛡️ [ANTI AVT SEXY] Đã kick [${senderName}] do ảnh đại diện nhạy cảm / vi phạm tiêu chuẩn cộng đồng!` },
                    threadId,
                    threadType
                  );
                  return;
                }
              }

              // 12. Chống ảnh mã QR Zalo, QR Messenger, QR Ngân Hàng & Tất Cả QR
              if ((anti.qrZalo || anti.qrMess || anti.bankQr || anti.allQr) && directPhotoUrl) {
                const qrText = await this.scanQrFromUrl(directPhotoUrl);
                if (qrText) {
                  console.log(`🔍 [Anti QR] Đã quét được mã QR từ ảnh của [${senderName}]: ${qrText}`);

                  // Kiểm tra xem QR này có phải là QR chính thức của Bot hoặc của Nhóm không (Nếu đúng thì KHÔNG được kick)
                  const defaultBankAcc = String(PAYMENT_CONFIG.accountNo || '').trim();
                  const groupBankInfo = customService.getGroupBankInfo(threadId);
                  const groupBankAcc = String(groupBankInfo?.bankAccount || '').trim();
                  const isOfficialGroupQr = (defaultBankAcc && qrText.includes(defaultBankAcc)) ||
                                            (groupBankAcc && qrText.includes(groupBankAcc));

                  // Quét mã QR dẫn tới Zalo (Nhóm Zalo, Trang cá nhân Zalo, OA Zalo...)
                  const isZaloQr = anti.qrZalo && /(?:zalo\.me|zalo:\/\/|qr\.zalo|id\.zalo)/i.test(qrText);

                  // Quét mã QR dẫn tới Messenger / Facebook
                  const isMessQr = anti.qrMess && /(?:m\.me|messenger\.com|facebook\.com\/messages|facebook\.com\/qr|fb\.me|fb\.com)/i.test(qrText);
                  
                  // Nhận diện mã VietQR nhận tiền chuyển khoản (bắt buộc có chuẩn thanh toán Napas/VietQR)
                  const isBankQr = anti.bankQr && (
                    (qrText.startsWith('000201') && (/QRIBFTTA|A000000727|9704/i.test(qrText))) ||
                    /^https?:\/\/(?:www\.)?(?:api\.)?vietqr\.(?:net|io)/i.test(qrText)
                  );

                  if (anti.allQr && !isOfficialGroupQr) {
                    await this.deleteMessage(message);
                    await this.kickMember(threadId, senderId);
                    await this.api.sendMessage(
                      { msg: `🛡️ [ANTI TẤT CẢ QR] Đã kick [${senderName}] do gửi hình ảnh chứa mã QR vào nhóm!` },
                      threadId,
                      threadType
                    );
                    return;
                  }

                  if (isZaloQr) {
                    await this.deleteMessage(message);
                    await this.kickMember(threadId, senderId);
                    await this.api.sendMessage(
                      { msg: `🛡️ [ANTI QR ZALO] Đã kick [${senderName}] do gửi ảnh mã QR Zalo vào nhóm!` },
                      threadId,
                      threadType
                    );
                    return;
                  }

                  if (isMessQr) {
                    await this.deleteMessage(message);
                    await this.kickMember(threadId, senderId);
                    await this.api.sendMessage(
                      { msg: `🛡️ [ANTI QR MESS] Đã kick [${senderName}] do gửi ảnh mã QR Messenger vào nhóm!` },
                      threadId,
                      threadType
                    );
                    return;
                  }

                  if (isBankQr && !isOfficialGroupQr) {
                    await this.deleteMessage(message);
                    await this.kickMember(threadId, senderId);
                    await this.api.sendMessage(
                      { msg: `🛡️ [ANTI QR BANK] Đã kick [${senderName}] do gửi ảnh mã QR Ngân Hàng trái phép!` },
                      threadId,
                      threadType
                    );
                    return;
                  }
                }
              }
            }
          }
        }
      }

        // TỰ ĐỘNG BẮT TỪ KHÓA XIN QR / STK / MÃ CHUYỂN KHOẢN (CHỈ LẮNG NGHE TỰ DO, KHÔNG DÙNG LỆNH CÓ TIỀN TỐ . ! /)
        let isAskingQr = false;
        if (!message.isSelf && !/^[!\.\/]/.test(lowerContent)) {
          // Tin nhắn văn bản thông thường từ thành viên (KHÔNG CẦN CÓ DẤU .): nhận diện qr, mã, stk
          const cleanContent = lowerContent
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/đ/g, 'd')
              .replace(/Đ/g, 'D')
              .replace(/[^a-z0-9\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            if (cleanContent) {
              // 1. Chứa từ viết tắt chuyên biệt: chính xác từ "qr" hoặc "stk"
              if (/\b(?:qr|stk)\b/i.test(cleanContent)) {
                isAskingQr = true;
              } else {
                // 2. Các từ/cụm từ liên quan đến mã chuyển khoản / xin mã
                const maPatterns = [
                  /\b(?:xin|cho|gui|lay)\s+(?:e\s+|em\s+)?(?:cai\s+)?(?:ma|ma qr|ma ck|ma stk)\b/i,
                  /\b(?:cho\s+xin|gui\s+xin)\s+(?:ma|ma qr|ma ck|ma stk)\b/i,
                  /\bma\s+(?:qr|ck|stk|dau|ngan hang|chuyen khoan|thanh toan)\b/i,
                  /^(?:cho\s+)?(?:xin\s+)?(?:e\s+|em\s+)?(?:cai\s+)?ma(?:\s+(?:nha|nhe|di|voi|vs|a|bot|nhom|ad|admin|nhi|dau|nao))*$/i
                ];

                // 3. Các từ liên quan đến số tài khoản / chuyển khoản / bank
                const phrasePatterns = [
                  /\b(?:so\s+tk|so\s+tai\s+khoan)\b/i,
                  /\b(?:xin|cho|gui|lay|ban)\s+(?:so\s+)?(?:tk|tai\s+khoan)\b/i,
                  /\b(?:chuyen\s+khoan|thong\s+tin\s+bank|tt\s+bank|xin\s+bank|cho\s+bank|gui\s+bank)\b/i,
                  /\b(?:xin|cho|gui|lay|ban)\s+ck\b/i,
                  /^(?:bank|ck)(?:\s+(?:nha|nhe|di|voi|vs|a|bot|nhom|ad|admin))*$/i
                ];

                if (maPatterns.some(p => p.test(cleanContent)) || phrasePatterns.some(p => p.test(cleanContent))) {
                  isAskingQr = true;
                }
              }
            }
          }

        if (isAskingQr && !message.isSelf) {
          if (threadType !== ThreadType.User) {
            const boxStatus = boxService.isGroupActive(threadId);
            if (!boxStatus.allowed) return; // Nhóm chưa kích hoạt -> Im lặng hoàn toàn, không gửi QR
          }
          const now = Date.now();
          const userCooldownKey = `${threadId}_${senderId}`;

          // Giãn cách cá nhân: nếu vẫn là người đó gõ lần 2 trong 45s -> Bot im lặng hoàn toàn, không rep
          const lastUserTime = this.userQrCooldown.get(userCooldownKey) || 0;
          if (now - lastUserTime < 45000) {
            return;
          }

          // Cập nhật mốc thời gian gọi QR của người này (người khác nhắn vẫn được bot rep ngay không cần chờ)
          this.userQrCooldown.set(userCooldownKey, now);

          const bankInfo = customService.getGroupBankInfo(threadId);
          const qrPath = (bankInfo.qrImage && fs.existsSync(bankInfo.qrImage))
            ? bankInfo.qrImage
            : path.resolve(__dirname, '../assets/qr_tpbank.png');

          let qrMsg = `🏦 THÔNG TIN CHUYỂN KHOẢN (${(bankInfo.bankName || 'NGÂN HÀNG').toUpperCase()})\n`;
          qrMsg += `👤 CTK: ${bankInfo.adminCtk}\n`;
          qrMsg += `💳 STK: ${bankInfo.bankAccount}\n`;
          qrMsg += `📝 ND: [Tên / Nội dung chuyển khoản]\n`;

          const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo || senderId);
          try {
            if (fs.existsSync(qrPath)) {
              await this.api.sendMessage({ msg: qrMsg, attachments: [qrPath] }, targetThreadId, threadType);
            } else {
              const payload = { msg: qrMsg };
              if (message.data) payload.quote = message.data;
              await this.api.sendMessage(payload, targetThreadId, threadType);
            }
          } catch (sendErr) {
            console.warn('⚠️ Lỗi gửi ảnh QR, thử gửi dạng tin nhắn văn bản:', sendErr?.message || sendErr);
            try {
              const payload = { msg: qrMsg };
              if (message.data) payload.quote = message.data;
              await this.api.sendMessage(payload, targetThreadId, threadType);
            } catch (textErr) {}
          }
          return;
        }

        // THÔNG TIN TRƯỢT TIN NHẮN ĐỂ TRẢ LỜI (QUOTE REPLY) TRÊN ĐIỆN THOẠI / ZALO PC
        const quoteObj = message.data?.quote || null;
        const isQuote = !!quoteObj;
        let quotedMsg = (quoteObj?.msg || (typeof quoteObj?.content === 'string' ? quoteObj.content : '') || '').trim();
        if (typeof quoteObj?.content === 'object' && quoteObj.content !== null) {
          quotedMsg = (quoteObj.content.description || quoteObj.content.title || quoteObj.content.text || quotedMsg || '').trim();
        }

        // ─── 0. KIỂM TRA NHẬN ẢNH LOGO TỪ CHÍNH THÀNH VIÊN ĐÃ XÁC NHẬN "CÓ" (KHÔNG CẦN TRƯỢT TN VÌ ZALO KHÔNG CHO TRƯỢT KHI GỬI ẢNH) ───
        const logoSession = this.pendingLogoRequests.get(`${threadId}_${senderId}`);
        if (logoSession && logoSession.type === 'WAITING_LOGO_IMAGE') {
          // Tự hủy phiên nếu quá 3 phút
          if (Date.now() - logoSession.createdAt > 3 * 60 * 1000) {
            this.pendingLogoRequests.delete(`${threadId}_${senderId}`);
          } else {
            const cleanAns = (content || '').toLowerCase().trim();
            if (/^(hủy|huy|cancel|không|khong|k|ko)$/i.test(cleanAns)) {
              this.pendingLogoRequests.delete(`${threadId}_${senderId}`);
              await this.api.sendMessage(
                { msg: `❌ Đã hủy gửi ảnh logo cho Key [${logoSession.keyName.toUpperCase()}].` },
                threadId,
                threadType
              );
              return;
            }

            // Tìm ảnh hoặc ảnh GIF từ mọi nguồn tin nhắn Zalo (hỗ trợ JPG, PNG, WEBP, GIF)
            let targetImgUrl = directPhotoUrl || photoUrl;
            if (!targetImgUrl && message.data) {
              const d = message.data;
              targetImgUrl = d.url || d.href || d.gifUrl || d.mediaUrl || d.thumbUrl;
              if (!targetImgUrl && d.content) {
                if (typeof d.content === 'object' && d.content !== null) {
                  targetImgUrl = d.content.gifUrl || d.content.url || d.content.href || d.content.mediaUrl || d.content.thumbUrl || d.content.hdUrl;
                } else if (typeof d.content === 'string') {
                  try {
                    const parsed = JSON.parse(d.content);
                    targetImgUrl = parsed.gifUrl || parsed.url || parsed.href || parsed.mediaUrl || parsed.thumbUrl || parsed.hdUrl;
                  } catch (e) {
                    if (/\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(d.content)) targetImgUrl = d.content;
                  }
                }
              }
              if (!targetImgUrl && d.attach) {
                const att = typeof d.attach === 'string' ? (() => { try { return JSON.parse(d.attach); } catch(e){ return null; } })() : d.attach;
                if (att) targetImgUrl = att.gifUrl || att.url || att.href || att.hdUrl || att.thumbUrl;
              }
            }

            if (targetImgUrl) {
              try {
                const savedLogoPath = await this.downloadAndSaveKeyLogo(logoSession.keyName, targetImgUrl);
                keyService.setKeyLogo(logoSession.keyName, savedLogoPath, senderId, true);
                this.pendingLogoRequests.delete(`${threadId}_${senderId}`);
                await this.api.sendMessage(
                  { msg: `✅ Đã nhận và lưu ảnh/GIF logo cho Key [${logoSession.keyName.toUpperCase()}] thành công!\nLogo sẽ tự động xuất hiện trên ảnh BXH khi tính điểm.` },
                  threadId,
                  threadType
                );
                return;
              } catch (err) {
                console.error('Lỗi khi tải logo:', err);
                await this.api.sendMessage(
                  { msg: `❌ Lỗi khi lưu ảnh logo: ${err.message}. Vui lòng thử gửi lại ảnh khác!` },
                  threadId,
                  threadType
                );
                return;
              }
            }
          }
        }

        // ─── 0.1. KIỂM TRA NHẬP TÊN GIẢI CUSTOM CHO KEY (PHIÊN CHỜ TỪ THÀNH VIÊN) ───
        const titleSession = this.pendingTitleRequests.get(`${threadId}_${senderId}`);
        if (titleSession) {
          if (Date.now() - titleSession.createdAt > 3 * 60 * 1000) {
            this.pendingTitleRequests.delete(`${threadId}_${senderId}`);
          } else {
            const rawText = (content || '').trim();
            const cleanLower = rawText.toLowerCase();
            if (/^(hủy|huy|cancel|không|khong|k|ko)$/i.test(cleanLower)) {
              this.pendingTitleRequests.delete(`${threadId}_${senderId}`);
              await this.api.sendMessage(
                { msg: `❌ Đã hủy cập nhật tên giải cho Key [${titleSession.keyName.toUpperCase()}].` },
                threadId,
                threadType
              );
              return;
            }

            const startsWithPrefix = this.prefixes.some(p => rawText.startsWith(p));
            // Nếu người dùng nhắn text không phải lệnh thì lưu tên giải
            if (!startsWithPrefix && rawText.length > 0) {
              const cleanTitle = rawText.replace(/^@[^\s]+\s*/g, '').trim();
              if (cleanTitle) {
                const isAdmin = this.isSuperAdmin(senderId, message);
                const res = keyService.setKeyCustomTitle(titleSession.keyName, cleanTitle, senderId, isAdmin);
                this.pendingTitleRequests.delete(`${threadId}_${senderId}`);
                if (res.success) {
                  await this.api.sendMessage(
                    {
                      msg: `✅ ĐÃ CẬP NHẬT TÊN GIẢI THÀNH CÔNG!\n🏷️ Tên giải mới: ${cleanTitle}\n🔑 Key: [${titleSession.keyName.toUpperCase()}]`
                    },
                    threadId,
                    threadType
                  );
                } else {
                  await this.api.sendMessage(
                    { msg: res.message || `❌ Không thể cập nhật tên giải!` },
                    threadId,
                    threadType
                  );
                }
                return;
              }
            }
          }
        }

        // ─── 1. XỬ LÝ PHẢN HỒI KHI TRƯỢT TIN NHẮN TRẢ LỜI (QUOTE REPLY) CỦA BOT ───
        if (isQuote && (quotedMsg || quoteObj?.attach)) {
          // A1. Trả lời số (1-4) khi trượt tin nhắn Menu Cài Đặt Key
          const isKeyMenu = /KEY:\s*\[([^\]]+)\]/i.test(quotedMsg) && (
            quotedMsg.includes('1️⃣') ||
            quotedMsg.includes('Đổi tên giải') ||
            quotedMsg.includes('trả lời số để cài đặt')
          );
          if (isKeyMenu) {
            const keyMatch = quotedMsg.match(/KEY:\s*\[([^\]]+)\]/i);
            const targetKey = keyMatch ? keyMatch[1].toLowerCase().trim() : null;
            if (targetKey) {
              const cleanAns = (content || '').replace(/^@[^\s]+\s*/g, '').trim();
              const numMatch = cleanAns.match(/^[#\s]*([1-4])\b/) || cleanAns.match(/\b([1-4])\b/);
              if (numMatch) {
                const choice = parseInt(numMatch[1], 10);
                const keyData = keyService.getKey(targetKey);
                if (!keyData) {
                  await this.api.sendMessage(
                    { msg: `❌ Key [${targetKey.toUpperCase()}] không tồn tại trên hệ thống!` },
                    threadId,
                    threadType
                  );
                  return;
                }
                if (keyData.ownerZaloId && String(keyData.ownerZaloId) !== String(senderId)) {
                  await this.api.sendMessage(
                    { msg: `⛔ Key [${targetKey.toUpperCase()}] không phải của bạn! Bạn không có quyền thao tác trên key này.` },
                    threadId,
                    threadType
                  );
                  return;
                }

                if (choice === 1) {
                  this.pendingTitleRequests.set(`${threadId}_${senderId}`, {
                    keyName: targetKey,
                    senderId,
                    threadId,
                    createdAt: Date.now()
                  });
                  await this.api.sendMessage(
                    {
                      msg: `👉 Vui lòng trượt tin nhắn này (hoặc nhắn vào nhóm) TÊN GIẢI CUSTOM mới cho Key [${targetKey.toUpperCase()}]:\n(Ví dụ: CUSTOM PQ, ĐẠI CHIẾN QUÂN ĐOÀN... Nhắn "hủy" để thoát)`,
                      quote: message.data
                    },
                    threadId,
                    threadType
                  );
                  return;
                }

                if (choice === 2) {
                  this.pendingLogoRequests.set(`${threadId}_${senderId}`, {
                    type: 'WAITING_LOGO_IMAGE',
                    keyName: targetKey,
                    senderId,
                    threadId,
                    createdAt: Date.now()
                  });
                  await this.api.sendMessage(
                    {
                      msg: `👉 Vui lòng gửi 1 ảnh logo hoặc ảnh GIF cho Key [${targetKey.toUpperCase()}] vào nhóm.\n(Bot chỉ nhận ảnh/GIF từ bạn [${senderName}] trong 3 phút, nhắn "hủy" để thoát).`,
                      quote: message.data
                    },
                    threadId,
                    threadType
                  );
                  return;
                }

                if (choice === 3) {
                  const rmRes = keyService.removeKeyLogo(targetKey, senderId, isAdmin);
                  if (rmRes.success) {
                    await this.api.sendMessage(
                      { msg: `✅ Đã xóa Logo của Key [${targetKey.toUpperCase()}] thành công!`, quote: message.data },
                      threadId,
                      threadType
                    );
                  } else {
                    await this.api.sendMessage(
                      { msg: rmRes.message || `❌ Không thể xóa logo!`, quote: message.data },
                      threadId,
                      threadType
                    );
                  }
                  return;
                }

                if (choice === 4) {
                  await this.handleCommand('napluot', [targetKey], message, senderName);
                  return;
                }
              }
            }
          }

          // A2. Trả lời khi trượt tin nhắn yêu cầu nhập Tên Giải CUSTOM
          const isTitlePromptMsg = quotedMsg.includes('TÊN GIẢI CUSTOM') || quotedMsg.includes('nhập TÊN GIẢI');
          if (isTitlePromptMsg) {
            const keyMatch = quotedMsg.match(/Key\s*\[([^\]]+)\]/i);
            const targetKey = keyMatch ? keyMatch[1].toLowerCase().trim() : (this.pendingTitleRequests.get(`${threadId}_${senderId}`)?.keyName || null);
            if (targetKey) {
              const rawText = (content || '').trim();
              if (/^(hủy|huy|cancel|không|khong|k|ko)$/i.test(rawText)) {
                this.pendingTitleRequests.delete(`${threadId}_${senderId}`);
                await this.api.sendMessage(
                  { msg: `❌ Đã hủy cập nhật tên giải cho Key [${targetKey.toUpperCase()}].`, quote: message.data },
                  threadId,
                  threadType
                );
                return;
              }
              const cleanTitle = rawText.replace(/^@[^\s]+\s*/g, '').trim();
              if (cleanTitle) {
                const isAdmin = this.isSuperAdmin(senderId, message);
                const res = keyService.setKeyCustomTitle(targetKey, cleanTitle, senderId, isAdmin);
                this.pendingTitleRequests.delete(`${threadId}_${senderId}`);
                if (res.success) {
                  await this.api.sendMessage(
                    {
                      msg: `✅ ĐÃ CẬP NHẬT TÊN GIẢI THÀNH CÔNG!\n🏷️ Tên giải mới: ${cleanTitle}\n🔑 Key: [${targetKey.toUpperCase()}]`,
                      quote: message.data
                    },
                    threadId,
                    threadType
                  );
                } else {
                  await this.api.sendMessage(
                    { msg: res.message || `❌ Không thể cập nhật tên giải!`, quote: message.data },
                    threadId,
                    threadType
                  );
                }
                return;
              }
            }
          }

          // A. Trả lời Có / Không khi trượt tin nhắn hỏi thêm logo cho Key
          const isLogoConfirmMsg = quotedMsg.includes('thêm logo cho Key') || quotedMsg.includes('muốn thêm logo');
          if (isLogoConfirmMsg) {
            const keyMatch = quotedMsg.match(/Key\s*\[([^\]]+)\]/i);
            const targetKey = keyMatch ? keyMatch[1].toLowerCase().trim() : null;
            if (targetKey) {
              const cleanAns = (content || '').replace(/^@[^\s]+\s*/g, '').trim().toLowerCase();
              if (/^(có|co|yes|ok|y)$/i.test(cleanAns)) {
                this.pendingLogoRequests.set(`${threadId}_${senderId}`, {
                  type: 'WAITING_LOGO_IMAGE',
                  keyName: targetKey,
                  senderId,
                  threadId,
                  createdAt: Date.now()
                });
                await this.api.sendMessage(
                  {
                    msg: `👉 Vui lòng gửi 1 ảnh logo hoặc ảnh GIF cho Key [${targetKey.toUpperCase()}] vào nhóm.\n(Bot chỉ nhận ảnh/GIF từ bạn [${senderName}] trong 3 phút, ảnh người khác gửi sẽ bị bỏ qua).`,
                    quote: message.data
                  },
                  threadId,
                  threadType
                );
                return;
              } else if (/^(không|khong|no|k|ko|hủy|huy|cancel)$/i.test(cleanAns)) {
                this.pendingLogoRequests.delete(`${threadId}_${senderId}`);
                await this.api.sendMessage(
                  { msg: `❌ Đã hủy cài đặt logo cho Key [${targetKey.toUpperCase()}].`, quote: message.data },
                  threadId,
                  threadType
                );
                return;
              }
            }
          }

          // C. Trả lời chọn số khung giờ (1-8) khi trượt tin nhắn menu khung giờ
          const isSlotMenu = quotedMsg.includes('CHỌN KHUNG GIỜ') || quotedMsg.includes('Trả lời số từ 1') || quotedMsg.includes('chọn số thứ tự khung giờ');
          // Hỗ trợ cả khi Zalo tự chèn tag người được trả lời: "@Vợ của Me 5", "5", "#5"
          const cleanTextForSlot = (content || '').replace(/^@[^\s]+\s*/g, '').trim();
          const slotMatch = cleanTextForSlot.match(/\b([1-8])\b/) || (content || '').match(/\b([1-8])\b/);
          if (isSlotMenu && slotMatch) {
            const chosenSlotId = parseInt(slotMatch[1], 10);
            const accMatch = quotedMsg.match(/(?:UID|ID)[:\s]*\[?(\d{8,12})\]?/i) || quotedMsg.match(/\b(\d{8,12})\b/);
            const requestKeyUser = `${threadId}_${senderId}`;
            const requestKeyThread = `${threadId}`;
            const pendingRequest = this.pendingSlotRequests.get(requestKeyUser) || this.pendingSlotRequests.get(requestKeyThread);
            const accountId = accMatch ? accMatch[1] : pendingRequest?.accountId;

            if (accountId) {
              const keyName = pendingRequest?.keyName || null;
              const xoaInInput = cleanTextForSlot.match(/xoa\s*(\d+)/i);
              const xoaMatchIndex = xoaInInput ? parseInt(xoaInInput[1], 10) : (pendingRequest?.xoaMatchIndex || null);
              this.pendingSlotRequests.delete(requestKeyUser);
              this.pendingSlotRequests.delete(requestKeyThread);
              await this.executeSlotCalculation(
                accountId,
                chosenSlotId,
                threadId,
                threadType,
                message.data,
                null,
                keyName,
                xoaMatchIndex
              );
              return;
            }
          }

          // D. Trả lời ngày khi trượt tin nhắn "Không tìm thấy trận... nhập ngày"
          const isWaitingDateMsg = quotedMsg.includes('BẠN CÓ MUỐN TÌM VÀO NGÀY KHÁC') || quotedMsg.includes('nhập ngày theo định dạng');
          const parsedDate = content ? parseDateInput(content) : null;
          if (isWaitingDateMsg && parsedDate) {
            const requestKeyUser = `${threadId}_${senderId}`;
            const requestKeyThread = `${threadId}`;
            const pendingRequest = this.pendingSlotRequests.get(requestKeyUser) || this.pendingSlotRequests.get(requestKeyThread);
            const accMatch = quotedMsg.match(/(?:UID|ID)[:\s]*\[?(\d{8,12})\]?/i) || quotedMsg.match(/\b(\d{8,12})\b/);
            const slotMatch = quotedMsg.match(/(?:Khung|Số)\s*(\d)/i) || quotedMsg.match(/\[(\d)\]/);
            const accountId = accMatch ? accMatch[1] : pendingRequest?.accountId;
            const slotId = slotMatch ? parseInt(slotMatch[1], 10) : pendingRequest?.slotId;
            const keyName = pendingRequest?.keyName || null;

            if (accountId && slotId) {
              const xoaMatchIndex = pendingRequest?.xoaMatchIndex || null;
              this.pendingSlotRequests.delete(requestKeyUser);
              this.pendingSlotRequests.delete(requestKeyThread);
              await this.executeSlotCalculation(
                accountId,
                slotId,
                threadId,
                threadType,
                message.data,
                parsedDate,
                keyName,
                xoaMatchIndex
              );
              return;
            }
          }

          // E. Trả lời số khi trượt tin nhắn MENU BẢO VỆ NHÓM (ANTI)
          const isAntiMenu = quotedMsg.includes('BẢO VỆ NHÓM (ANTI)') || quotedMsg.includes('Trạng thái bảo vệ hiện tại');
          if (isAntiMenu) {
            const perm = await this.checkAdminPermission(threadId, threadType, senderId);
            if (!perm.allowed) return;

            const cleanInput = content.replace(/^@[^\s]+\s*/g, '').trim().toLowerCase();
            const matchedTokens = cleanInput.match(/\d+|all|on|off|bat|tat/gi);
            if (matchedTokens && matchedTokens.length > 0) {
              for (const token of matchedTokens) {
                customService.toggleGroupAntiOption(threadId, token);
              }
              const updatedAnti = customService.getGroupAnti(threadId);
              await this.api.sendMessage(
                { msg: formatAntiMenu(updatedAnti), quote: message.data },
                threadId,
                threadType
              );
              return;
            }
          }

          // F. Trả lời số 1 hoặc 2 khi trượt tin nhắn KÍCH HOẠT BOX MIỄN PHÍ
          const isFreeBoxMenu = quotedMsg.includes('KÍCH HOẠT BOX MIỄN PHÍ') || quotedMsg.includes('Chọn phạm vi áp dụng:');
          if (isFreeBoxMenu) {
            const isSuperAdmin = this.isSuperAdmin(senderId, message);
            if (!isSuperAdmin) {
              await this.api.sendMessage(
                { msg: '⚠️ Chỉ Admin Bot mới có quyền sử dụng lệnh này.', quote: message.data },
                threadId,
                threadType
              );
              return;
            }

            const cleanInput = content.replace(/^@[^\s]+\s*/g, '').trim();
            const choiceMatch = cleanInput.match(/\b([12])\b/);
            if (choiceMatch) {
              const scope = parseInt(choiceMatch[1], 10);
              const session = this.pendingFreeBoxRequests.get(threadId);
              const days = session?.days || 1;
              customService.setGroupFreeTrial(threadId, days, scope);
              this.pendingFreeBoxRequests.delete(threadId);

              const exp = new Date(Date.now() + (days * 86400000));
              const expStr = `${String(exp.getDate()).padStart(2, '0')}/${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;
              const scopeText = scope === 1 ? '1️⃣ Chỉ QTV box' : '2️⃣ Tất cả thành viên';

              const successMsg = `╭──────────────⭓\n` +
                                 `│ ✅ KÍCH HOẠT THÀNH CÔNG\n` +
                                 `├──────────────⭓\n` +
                                 `│ 🎁 Chế độ: Vô hạn lượt box\n` +
                                 `│ 📅 Thời hạn: ${days} ngày (đến ${expStr})\n` +
                                 `│ 👥 Phạm vi: ${scopeText}\n` +
                                 `╰──────────────⭓`;

              await this.api.sendMessage(
                { msg: successMsg, quote: message.data },
                threadId,
                threadType
              );
              return;
            }
          }
        }

        // 2. KIỂM TRA TRẠNG THÁI CHỜ NHẬP NGÀY THEO SESSION (CHỈ KHI CHAT 1-1 RIÊNG VỚI BOT)
        // Trong nhóm Zalo, bắt buộc phải trượt tin nhắn để không nhận nhầm tin nhắn của người khác
        const requestKeyUser = `${threadId}_${senderId}`;
        const requestKeyThread = `${threadId}`;
        const pendingRequest = this.pendingSlotRequests.get(requestKeyUser) || this.pendingSlotRequests.get(requestKeyThread);

        if (threadType === ThreadType.User && pendingRequest && pendingRequest.type === 'WAITING_DATE') {
          const perm = await this.checkAdminPermission(threadId, threadType, senderId);
          if (!perm.allowed) return;

          const parsedDate = parseDateInput(content);
          if (parsedDate) {
            const keyName = pendingRequest.keyName || null;
            const xoaMatchIndex = pendingRequest.xoaMatchIndex || null;
            this.pendingSlotRequests.delete(requestKeyUser);
            this.pendingSlotRequests.delete(requestKeyThread);
            await this.executeSlotCalculation(
              pendingRequest.accountId,
              pendingRequest.slotId,
              threadId,
              threadType,
              message.data,
              parsedDate,
              keyName,
              xoaMatchIndex
            );
            return;
          }
        }

        // 3. KIỂM TRA TRẠNG THÁI CHỌN SỐ KHUNG GIỜ (1-8) THEO SESSION (CHỈ KHI CHAT 1-1 RIÊNG VỚI BOT)
        // Trong nhóm Zalo, bắt buộc phải trượt tin nhắn để không nhận nhầm tin nhắn của người khác
        const cleanTextForSlotSession = content.replace(/^@[^\s]+\s*/g, '').trim();
        const slotMatch = cleanTextForSlotSession.match(/\b([1-8])\b/) || content.match(/\b([1-8])\b/);
        if (threadType === ThreadType.User && pendingRequest && pendingRequest.type === 'WAITING_SLOT' && slotMatch) {
          const perm = await this.checkAdminPermission(threadId, threadType, senderId);
          if (!perm.allowed) return;

          const chosenSlotId = parseInt(slotMatch[1], 10);
          const keyName = pendingRequest.keyName || null;
          const xoaInSlot = cleanTextForSlotSession.match(/xoa\s*(\d+)/i);
          const xoaMatchIndex = xoaInSlot ? parseInt(xoaInSlot[1], 10) : (pendingRequest.xoaMatchIndex || null);
          this.pendingSlotRequests.delete(requestKeyUser);
          this.pendingSlotRequests.delete(requestKeyThread);
          await this.executeSlotCalculation(
            pendingRequest.accountId,
            chosenSlotId,
            threadId,
            threadType,
            message.data,
            null,
            keyName,
            xoaMatchIndex
          );
          return;
        }

        // 4. KIỂM TRA TIỀN TỐ LỆNH (BẮT BUỘC PHẢI CÓ DẤU '.', '!', '/')
        // Hỗ trợ trường hợp Zalo tự động chèn tag @người_dùng ở đầu khi trả lời tin nhắn (vd: @Lê Đại Quý .pass B)
        let effectiveContent = content.trim();
        let leadingMention = '';

        // Kiểm tra mentions từ metadata Zalo (nếu vị trí ở đầu tin nhắn)
        if (message.data?.mentions && message.data.mentions.length > 0) {
          const m0 = message.data.mentions[0];
          if (m0.pos === 0) {
            const mentionText = content.substring(0, m0.len).replace(/@+/g, '').trim();
            const rest = content.substring(m0.len).trim();
            if (this.prefixes.some(p => rest.startsWith(p))) {
              leadingMention = mentionText;
              effectiveContent = rest;
            }
          }
        }

        // Tách mention bằng regex nếu không có metadata hoặc nhập tay (vd: @Lê Đại Quý .pass B)
        if (!leadingMention) {
          const leadingTagMatch = effectiveContent.match(/^(@[^\.\!\/\s]+(?:\s+[^\.\!\/\s]+)*)\s+([!\.\/].*)$/i);
          if (leadingTagMatch) {
            leadingMention = leadingTagMatch[1].replace(/@+/g, '').trim();
            effectiveContent = leadingTagMatch[2].trim();
          }
        }

        let prefix = this.prefixes.find((p) => effectiveContent.startsWith(p));
        let rawCmd = '';
        let args = [];

        if (!prefix) {
          return; // Bắt buộc phải có tiền tố mới xử lý lệnh
        }

        message.leadingMention = leadingMention;

        const afterPrefix = effectiveContent.slice(prefix.length).trim();
        if (!afterPrefix) return;

        const tokens = afterPrefix.split(/\s+/);
        const firstWord = tokens[0]?.toLowerCase();

        if (KNOWN_COMMANDS.includes(firstWord)) {
          rawCmd = firstWord;
          args = tokens.slice(1);
        } else {
          return; // Bỏ qua, không phải lệnh bot
        }

        if (!rawCmd) return;
        const command = rawCmd.toLowerCase();

        console.log(`📩 [${senderName}] Nhận lệnh [${command}] với tham số:`, args);

        await this.handleCommand(command, args, message, senderName, effectiveContent);
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

    const reply = async (text, attachments = null) => {
      const payload = { msg: text };
      if (message.data && !message.isSelf && (!attachments || attachments.length === 0)) {
        payload.quote = message.data;
      }
      if (attachments && attachments.length > 0) {
        payload.attachments = attachments;
      }
      const targetThreadId = (threadId && threadId !== '0') ? threadId : (message.data?.idTo && message.data.idTo !== '0' ? message.data.idTo : this.api?.getOwnId?.());
      try {
        await this.api.sendMessage(payload, targetThreadId, threadType);
      } catch (err) {
        console.warn(`⚠️ [REPLY] Lỗi gửi tin kèm quote (${err.message}), đang thử lại không kèm quote...`);
        if (payload.quote) {
          try {
            delete payload.quote;
            await this.api.sendMessage(payload, targetThreadId, threadType);
          } catch (retryErr) {
            console.error('❌ Gửi tin nhắn Zalo thất bại:', retryErr.message);
          }
        }
      }

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

    // KIỂM TRA QUYỀN HOẠT ĐỘNG CỦA NHÓM (BOX ZALO) THEO DANH SÁCH QUẢN LÝ
    if (threadType !== ThreadType.User) {
      const isGetIdCmd = ['id', 'boxid', 'idbox', 'getid'].includes(command);
      const boxStatus = boxService.isGroupActive(threadId);

      // Nếu nhóm chưa được cho phép / hết hạn -> IM LẶNG HOÀN TOÀN 100%, không gửi thông báo làm phiền nhóm
      if (!boxStatus.allowed) {
        if (isGetIdCmd) {
          await reply(`🆔 ID Box Zalo này là: ${threadId}\n👤 ID người gửi: ${senderId}`);
        }
        return; // Im lặng hoàn toàn!
      }
    }

    // KIỂM TRA PHÂN QUYỀN:
    // Các lệnh dùng key cá nhân (.td, .bxh, .napluot, .luot) cho phép thành viên dùng ở mọi nhóm Zalo!
    // Các lệnh quản trị nhóm khác (anti, kickall...) bắt buộc phải là Trưởng nhóm hoặc Phó nhóm.
    const keyCommands = [
      'td', 'tinhdiem', 'bxh', 'bangxephang', 'tongdiem',
      'napluot', 'nap', 'luot',
      'checkkey', 'key',
      'help', 'huongdan', 'menu',
      'qr', 'stk', 'bank', 'ma',
      'id', 'boxid', 'idbox'
    ];
    const isKeyCommand = keyCommands.includes(command);

    if (!isKeyCommand) {
      const perm = await this.checkAdminPermission(threadId, threadType, senderId);
      if (!perm.allowed) {
        console.log(`⛔ [BỎ QUA - IM LẶNG] ${senderName} (${senderId}) không phải Trưởng/Phó nhóm nên bỏ qua lệnh [${command}].`);
        return; // Im lặng 100%, không gửi bất kỳ tin nhắn nào vào nhóm
      }
      console.log(`🔑 [QUYỀN HỢP LỆ] ${senderName} (${senderId}) có quyền [${perm.role}] được thực hiện lệnh [${command}].`);
    }

    switch (command) {
      // Lấy ID Nhóm Zalo (để thêm vào Bảng Quản Trị)
      case 'id':
      case 'boxid':
      case 'idbox':
      case 'getid': {
        await reply(`🆔 ID Nhóm Zalo này là: ${threadId}\n👤 ID người gửi: ${senderId}`);
        return;
      }

      // Lệnh tính điểm theo khung giờ (.td <UID> [KhungGiờ] [Ngày] [xoaN] [tên_key])
      case 'td':
      case 'tinhdiem': {
        // 1. Tách tham số xoaN nếu có (vd: xoa1, xoa2, xoa3 hoặc "xoa 1")
        let xoaMatchIndex = null;
        const xoaIdx = args.findIndex((a) => /^xoa(\d*)$/i.test(a));
        if (xoaIdx !== -1) {
          const m = args[xoaIdx].match(/^xoa(\d+)$/i);
          if (m) {
            xoaMatchIndex = parseInt(m[1], 10);
            args.splice(xoaIdx, 1);
          } else if (/^xoa$/i.test(args[xoaIdx]) && args[xoaIdx + 1] && /^\d+$/.test(args[xoaIdx + 1])) {
            xoaMatchIndex = parseInt(args[xoaIdx + 1], 10);
            args.splice(xoaIdx, 2);
          }
        }

        // 2. Tách keyName nếu có ở cuối danh sách tham số
        let keyName = null;
        if (args.length > 0) {
          const lastArg = args[args.length - 1];
          if (!/^\d{8,12}$/.test(lastArg) && !/^[1-8]$/.test(lastArg) && !/^\d{1,2}\/\d{1,2}/.test(lastArg) && !/^hôm\s*qua$/i.test(lastArg)) {
            keyName = lastArg.toLowerCase();
            args.pop();
          }
        }

        let accountId = args[0];
        let slotArg = args[1];
        let dateArg = args[2];

        // HỖ TRỢ TRƯỢT TIN NHẮN TRẢ LỜI (QUOTE REPLY) TRÊN ĐIỆN THOẠI:
        // Nếu người dùng trượt tin nhắn chứa UID để gõ .td (hoặc .td 1, td 1, td)
        if (isQuote && quotedMsg) {
          const uidMatch = quotedMsg.match(/(?:UID|ID|Tài khoản)[:\s]*\[?(\d{8,12})\]?/i) || quotedMsg.match(/\b(\d{8,12})\b/);
          if (uidMatch) {
            if (accountId && /^[1-8]$/.test(accountId)) {
              dateArg = slotArg;
              slotArg = accountId;
              accountId = uidMatch[1];
            } else if (!accountId) {
              accountId = uidMatch[1];
            }
          }
        }

        // Tự động nhận diện key nếu người dùng sở hữu key
        if (!keyName) {
          const ownedKey = keyService.findKeyByOwner(senderId);
          if (ownedKey) {
            keyName = ownedKey.key;
          }
        }

        // NẾU NGƯỜI DÙNG KHÔNG TRUYỀN UID (chỉ gõ .td) -> Hiện ngay hướng dẫn sử dụng ngắn gọn
        if (!accountId) {
          await reply(
            `👉 Cú pháp: .td [id] [tenkey]\n` +
            `Ví dụ: .td 18154023211${keyName ? ' ' + keyName : ' tenkey'}\n\n` +
            `👉 Xóa trận lỗi: .td [id] [xoaN] [tenkey]\n` +
            `Ví dụ: .td 18154023211 xoa1${keyName ? ' ' + keyName : ' tenkey'}\n` +
            `(xoaN: xóa trận lỗi số N, trận nớ không tính, tính những trận còn lại)\n\n` +
            (!keyName ? `👉 Chưa có key? Gõ: .key tao <tên_key>` : `🔑 Key: [${keyName.toUpperCase()}]`)
          );
          return;
        }

        // Kiểm tra yêu cầu Key nếu không phải Admin và không thuộc box miễn phí
        const isSuperAdmin = this.isSuperAdmin(senderId, message);
        let isEligibleFreeTrial = false;
        if (threadType !== ThreadType.User) {
          const boxStatus = boxService.isGroupActive(threadId);
          if (boxStatus.allowed && boxStatus.box && boxStatus.box.unlimitedCredits !== false) {
            isEligibleFreeTrial = true;
          } else {
            const groupPerm = await this.checkAdminPermission(threadId, threadType, senderId);
            const isGroupAdmin = groupPerm.allowed && (groupPerm.role === 'admin' || groupPerm.role === 'deputy' || groupPerm.role === 'creator');
            isEligibleFreeTrial = customService.isUserEligibleForFreeTrial(threadId, senderId, isGroupAdmin || isSuperAdmin);
          }
        }

        if (!keyName && !isSuperAdmin && !isEligibleFreeTrial) {
          const ownedKey = keyService.findKeyByOwner(senderId);
          if (ownedKey) {
            keyName = ownedKey.key;
          }
        }

        if (!keyName && !isSuperAdmin && !isEligibleFreeTrial) {
          await reply(
            `⚠️ Bạn cần có Key để sử dụng lệnh tính điểm .td!\n` +
            `👉 Cú pháp: .td [id] [tenkey]\n` +
            `💡 Ví dụ: .td ${accountId} tenkey\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎫 Tạo key mới miễn phí: .key tao <tên_key>\n` +
            `💳 Nạp lượt dùng: .napluot <tên_key> (250đ/lượt)`
          );
          return;
        }

        // Nếu có key, kiểm tra quyền sở hữu và số dư lượt (miễn kiểm tra nếu box đang miễn phí)
        if (keyName && !isEligibleFreeTrial) {
          const keyData = keyService.getKey(keyName);
          if (!keyData) {
            await reply(`❌ Key "${keyName}" không tồn tại trên hệ thống!\n👉 Vui lòng gõ .key tao ${keyName} để tạo key hoặc .napluot ${keyName} để nạp lượt.`);
            return;
          }
          if (keyData.ownerZaloId && String(keyData.ownerZaloId) !== String(senderId)) {
            await reply(`⛔ Key [${keyName.toUpperCase()}] không phải của bạn! Bạn không thể sử dụng key của người khác.\n👉 Gõ .key tao <tên_key_mới> để tạo key riêng cho bạn.`);
            return;
          }
          if (!keyData.ownerZaloId && senderId) {
            keyData.ownerZaloId = String(senderId);
            if (senderName) keyData.ownerName = senderName;
            keyService.saveKeys();
          }
          if ((keyData.credits || 0) <= 0) {
            await reply(`⚠️ Key "${keyName}" đã HẾT LƯỢT dùng!\n👉 Vui lòng gõ .napluot ${keyName} để nạp thêm lượt (250đ/lượt).`);
            return;
          }
        }

        // Nếu người dùng gõ sẵn khung giờ: .td 18154023211 8 [05/09] [xoaN] [key]
        if (slotArg && /^[1-8]$/.test(slotArg)) {
          const chosenSlotId = parseInt(slotArg, 10);
          const customDate = dateArg ? parseDateInput(dateArg) : null;
          await this.executeSlotCalculation(accountId, chosenSlotId, threadId, threadType, message.data, customDate, keyName, xoaMatchIndex);
          return;
        }

        // Nếu chỉ gõ .td <UID> [xoaN] [key] -> Hiển thị menu chọn khung giờ 1-8
        const menuText = formatSlotMenu(accountId, senderName);
        await reply(menuText);

        // Lưu trạng thái chờ người dùng gõ số 1-8 (hết hạn sau 5 phút)
        const requestKeyUser = `${threadId}_${senderId}`;
        const requestKeyThread = `${threadId}`;
        const slotSession = {
          type: 'WAITING_SLOT',
          accountId,
          senderName,
          keyName,
          xoaMatchIndex,
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

      case 'help':
      case 'huongdan':
      case 'menu': {
        try {
          const menuImgPath = await menuRenderService.renderMenuImage();
          if (fs.existsSync(menuImgPath)) {
            const sendPayload = {
              msg: `📋 BẢNG MENU CÂU LỆNH BOT TÍNH ĐIỂM (17 LỆNH)`,
              attachments: [menuImgPath]
            };
            if (message.data) sendPayload.quote = message.data;
            await this.api.sendMessage(sendPayload, threadId, threadType);
            break;
          }
        } catch (renderErr) {
          console.error('Lỗi khi render ảnh menu từ HTML:', renderErr);
        }
        await reply(formatHelp(this.prefixes[0]));
        break;
      }

      // Lệnh Cài đặt hệ thống Anti Bảo vệ nhóm: .anti
      case 'anti':
      case 'baove': {
        if (args.length > 0) {
          const rawTokens = args.join(' ').match(/\d+|all|on|off|bat|tat/gi);
          if (rawTokens && rawTokens.length > 0) {
            for (const token of rawTokens) {
              customService.toggleGroupAntiOption(threadId, token);
            }
          }
        }
        const antiSettings = customService.getGroupAnti(threadId);
        await reply(formatAntiMenu(antiSettings));
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

      // Lệnh đổi Cookie Garena trực tiếp (Chỉ nhận khi chat 1-1 với Bot để bảo mật)
      case 'setcookie':
      case 'cookie': {
        if (threadType !== ThreadType.User) {
          await reply(`⚠️ Vì lý do bảo mật tài khoản, lệnh đổi Cookie Garena chỉ được phép gửi khi chat riêng 1-1 với Bot!`);
          return;
        }

        const perm = await this.checkAdminPermission(threadId, threadType, senderId);
        if (!perm.allowed) {
          return;
        }

        const newCookie = args.join(' ').trim();
        if (!newCookie) {
          await reply(`⚠️ Vui lòng nhập chuỗi Cookie mới!\nCú pháp: .setcookie <chuỗi_cookie>`);
          return;
        }

        garenaService.updateCookie(newCookie);
        updateEnvFile('GARENA_COOKIE', newCookie);

        const profile = await garenaService.getUserProfile();
        if (profile.success && profile.data) {
          await reply(`✅ [CẬP NHẬT COOKIE THÀNH CÔNG!]\n👤 Tên hiển thị: ${profile.data.nickName}\n🆔 Account ID: ${profile.data.accountId}\n🎖️ Level: ${profile.data.level}\n👉 Đã tự động lưu vào file .env trên VPS!`);
        } else {
          await reply(`❌ [CẬP NHẬT THẤT BẠI]\nCookie vừa nhập không thể kết nối Garena: ${profile.error || 'Lỗi không xác định'}`);
        }
        break;
      }

      // Lệnh kích hoạt box miễn phí / vô hạn lượt (.luotdung vohanbox <số_ngày>, .vohanbox <số_ngày>)
      case 'luotdung':
      case 'vohanbox': {
        const isSuperAdmin = this.isSuperAdmin(senderId, message);
        if (!isSuperAdmin) {
          await reply('⚠️ Chỉ Admin Bot mới có quyền sử dụng lệnh này.');
          return;
        }

        let targetSub = command === 'vohanbox' ? 'vohanbox' : (args[0] || '').toLowerCase();
        let daysArg = command === 'vohanbox' ? args[0] : args[1];
        let scopeArg = command === 'vohanbox' ? args[1] : args[2];

        if (targetSub !== 'vohanbox') {
          await reply(
            `👉 Cú pháp kích hoạt box miễn phí:\n` +
            `• .luotdung vohanbox <số_ngày> (vd: .luotdung vohanbox 1)\n` +
            `• .luotdung vohanbox off (để tắt chế độ miễn phí)\n` +
            `• .luotdung vohanbox check (để kiểm tra thời hạn)`
          );
          return;
        }

        // Tắt chế độ vô hạn box
        if (daysArg === 'off' || daysArg === 'tat' || daysArg === 'huy') {
          customService.cancelGroupFreeTrial(threadId);
          await reply('✅ Đã tắt chế độ miễn phí / vô hạn lượt cho box này thành công!');
          return;
        }

        // Kiểm tra trạng thái vô hạn box
        if (daysArg === 'check' || daysArg === 'status') {
          const trial = customService.getGroupFreeTrial(threadId);
          if (trial) {
            const exp = new Date(trial.expireAt);
            const expStr = `${String(exp.getDate()).padStart(2, '0')}/${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()} ${String(exp.getHours()).padStart(2, '0')}:${String(exp.getMinutes()).padStart(2, '0')}`;
            const scopeText = trial.scope === 1 ? '1️⃣ Chỉ QTV box (Trưởng/Phó nhóm)' : '2️⃣ Tất cả thành viên trong box';
            await reply(
              `╭──────────────⭓\n` +
              `│ 🎁 TRẠNG THÁI BOX MIỄN PHÍ\n` +
              `├──────────────⭓\n` +
              `│ 🟢 Trạng thái: Đang hoạt động\n` +
              `│ 📅 Hạn dùng: Đến ${expStr}\n` +
              `│ 👥 Phạm vi: ${scopeText}\n` +
              `╰──────────────⭓`
            );
          } else {
            await reply('ℹ️ Box này hiện chưa được kích hoạt chế độ vô hạn lượt / miễn phí.\n👉 Gõ .luotdung vohanbox <số_ngày> để kích hoạt.');
          }
          return;
        }

        const days = Math.max(1, parseInt(daysArg, 10) || 1);
        const scope = parseInt(scopeArg, 10);

        // Nếu admin gõ sẵn phạm vi: .luotdung vohanbox 1 2 hoặc .vohanbox 1 2
        if (scope === 1 || scope === 2) {
          customService.setGroupFreeTrial(threadId, days, scope);
          this.pendingFreeBoxRequests.delete(threadId);
          const exp = new Date(Date.now() + (days * 86400000));
          const expStr = `${String(exp.getDate()).padStart(2, '0')}/${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;
          const scopeText = scope === 1 ? '1️⃣ Chỉ QTV box' : '2️⃣ Tất cả thành viên';
          await reply(
            `╭──────────────⭓\n` +
            `│ ✅ KÍCH HOẠT THÀNH CÔNG\n` +
            `├──────────────⭓\n` +
            `│ 🎁 Chế độ: Vô hạn lượt box\n` +
            `│ 📅 Thời hạn: ${days} ngày (đến ${expStr})\n` +
            `│ 👥 Phạm vi: ${scopeText}\n` +
            `╰──────────────⭓`
          );
          return;
        }

        // Lưu session chờ reply số 1 hoặc 2
        this.pendingFreeBoxRequests.set(threadId, {
          days,
          adminId: senderId,
          createdAt: Date.now()
        });

        const cardMsg = `╭──────────────⭓\n` +
                        `│ 🎁 KÍCH HOẠT BOX MIỄN PHÍ\n` +
                        `├──────────────⭓\n` +
                        `│ 📅 Thời hạn: ${days} ngày\n` +
                        `│ \n` +
                        `│ Chọn phạm vi áp dụng:\n` +
                        `│ 1️⃣ Chỉ QTV box\n` +
                        `│ 2️⃣ Tất cả thành viên\n` +
                        `│ \n` +
                        `│ 💬 Phản hồi (reply/quote) số để chọn\n` +
                        `╰──────────────⭓`;

        await reply(cardMsg);
        break;
      }

      // Lệnh nạp lượt tự động VietQR TPBank (.napluot <tên_key> [số_tiền])
      case 'napluot':
      case 'nap': {
        let keyName = args[0];
        let amountArg = args[1];

        // Hỗ trợ trường hợp gõ .napluot 20k (nếu đã sở hữu key)
        if (keyName && /^\d+k?$/i.test(keyName)) {
          amountArg = keyName;
          keyName = null;
        }

        // Tự động tìm key của người dùng nếu không nhập tên key
        if (!keyName) {
          const ownedKey = keyService.findKeyByOwner(senderId);
          if (ownedKey) {
            keyName = ownedKey.key;
          }
        }

        if (!keyName) {
          await reply(
            `⚠️ Vui lòng nhập tên Key bạn muốn nạp lượt!\n` +
            `👉 Cú pháp: .napluot <tên_key> [số_tiền_tùy_chọn]\n` +
            `💡 Ví dụ:\n` +
            `• .napluot tenkey (Quét QR và tự nhập số tiền muốn nạp tùy ý)\n` +
            `• .napluot tenkey 50k (Mã QR điền sẵn 50.000đ = 200 lượt)\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎫 BẢNG GIÁ QUY ĐỔI (250đ / 1 lượt):\n` +
            `💠 1.000đ   ➜ 4 lượt\n` +
            `💠 10.000đ  ➜ 40 lượt\n` +
            `💠 20.000đ  ➜ 80 lượt\n` +
            `💠 50.000đ  ➜ 200 lượt\n` +
            `💠 100.000đ ➜ 400 lượt`
          );
          return;
        }

        keyName = keyName.toLowerCase().trim();

        // Xử lý số tiền nạp (mặc định để null để khách tự do nhập bao nhiêu tùy ý khi quét QR)
        let amount = null;
        if (amountArg) {
          const cleanAmt = String(amountArg).toLowerCase().replace(/k$/, '000').replace(/\D/g, '');
          const parsedAmt = parseInt(cleanAmt, 10);
          if (parsedAmt && parsedAmt >= 1000) {
            amount = parsedAmt;
          }
        }

        // Tự động tạo key nếu chưa có trên hệ thống
        const keyData = keyService.getOrCreateKey(keyName, senderId, senderName);
        webhookServer.recordKeyActivity(keyName, threadId, threadType);

        try {
          const qrPath = await paymentService.downloadQRImage(keyName, amount);
          const invoiceText = paymentService.formatPaymentInvoice(keyName, amount, keyData.credits);

          if (qrPath && fs.existsSync(qrPath)) {
            await reply(invoiceText, [qrPath]);
            setTimeout(() => {
              try { if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath); } catch (e) {}
            }, 30000);
          } else {
            await reply(invoiceText);
          }
        } catch (qrErr) {
          console.error('Lỗi tạo ảnh QR nạp lượt:', qrErr);
          const invoiceText = paymentService.formatPaymentInvoice(keyName, amount, keyData.credits);
          await reply(invoiceText);
        }
        break;
      }

      // Lệnh kiểm tra lượt và quản lý key (.luot [tên_key], .checkkey [tên_key], .key)
      case 'luot':
      case 'checkkey':
      case 'key': {
        const subCommand = (args[0] || '').toLowerCase();

        // 1. TẠO KEY MỚI: .key tao <tên_key> (hoặc .key create <tên_key>)
        if (command === 'key' && (subCommand === 'tao' || subCommand === 'create')) {
          const newKeyRaw = args[1];
          if (!newKeyRaw) {
            await reply(
              `⚠️ Vui lòng nhập tên Key bạn muốn tạo!\n` +
              `👉 Cú pháp: .key tao <tên_key>\n` +
              `💡 Ví dụ: .key tao tenkey`
            );
            return;
          }

          const cleanKey = newKeyRaw.toLowerCase().trim();
          if (!/^[a-z0-9_-]{2,20}$/.test(cleanKey)) {
            await reply('⚠️ Tên key chỉ được gồm 2-20 ký tự (chữ cái, số, gạch dưới, không dấu, không khoảng trắng)!\n💡 Ví dụ: .key tao tenkey');
            return;
          }

          const existingKey = keyService.getKey(cleanKey);
          if (existingKey) {
            const isOwner = existingKey.ownerZaloId && String(existingKey.ownerZaloId) === String(senderId);
            if (isOwner) {
              await reply(`ℹ️ Bạn đã sở hữu Key [${cleanKey.toUpperCase()}] rồi!\n👉 Gõ .key ${cleanKey} để xem thông tin hoặc .napluot ${cleanKey} để nạp thêm lượt.`);
            } else {
              await reply(`❌ Tên Key [${cleanKey.toUpperCase()}] đã có người khác sử dụng!\n👉 Vui lòng chọn một tên Key khác (Ví dụ: .key tao ${cleanKey}_ff hoặc .key tao ${cleanKey}2).`);
            }
            return;
          }

          const res = keyService.createKey(cleanKey, senderId, senderName, 5);
          if (!res.success) {
            await reply(`❌ ${res.message}\n👉 Vui lòng chọn một tên Key khác để tạo.`);
            return;
          }

          await reply(
            `✅ Đã tạo key [${cleanKey}] thành công! Tặng ngay +5 lượt dùng thử miễn phí 🎁\n` +
            `🎫 Số lượt hiện có: ${res.data?.credits || 5} lượt\n` +
            `👉 Nạp lượt: .napluot ${cleanKey}\n` +
            `👉 Đổi mẫu: .key edit ${cleanKey}\n` +
            `👉 Tính điểm: .td [id] ${cleanKey}\n` +
            `👉 Xóa trận lỗi: .td [id] xoaN ${cleanKey}`
          );
          return;
        }

        // 2. CHỈNH SỬA KEY: .key edit <tên_key> (Tên giải, Logo, Mẫu BXH, Check lượt)
        if (command === 'key' && (subCommand === 'edit' || subCommand === 'sua' || subCommand === 'doimau')) {
          let editKey = args[1];
          let subAction = args[2] ? args[2].toLowerCase() : '';

          // Hỗ trợ gõ đảo thứ tự: .key edit 2 tenkey
          if (editKey && /^[1-5]$/.test(editKey) && args[2]) {
            subAction = editKey;
            editKey = args[2];
          }

          if (!editKey) {
            const ownedKey = keyService.findKeyByOwner(senderId);
            if (ownedKey) editKey = ownedKey.key;
          }

          if (!editKey) {
            await reply(
              `⚠️ Vui lòng nhập tên Key cần chỉnh sửa!\n` +
              `👉 Cú pháp: .key edit <tên_key>\n` +
              `💡 Ví dụ: .key edit tenkey`
            );
            return;
          }

          editKey = editKey.toLowerCase().trim();
          const keyData = keyService.getKey(editKey);
          if (!keyData) {
            await reply(`❌ Key "${editKey}" không tồn tại trên hệ thống!\n👉 Gõ .key tao ${editKey} để tạo key.`);
            return;
          }

          if (keyData.ownerZaloId && String(keyData.ownerZaloId) !== String(senderId)) {
            await reply(`⛔ Key [${editKey.toUpperCase()}] không phải của bạn! Bạn không có quyền chỉnh sửa key này.\n👉 Gõ .key tao <tên_key_mới> để tạo key riêng.`);
            return;
          }
          if (!keyData.ownerZaloId && senderId) {
            keyData.ownerZaloId = String(senderId);
            if (senderName) keyData.ownerName = senderName;
            keyService.saveKeys();
          }

          // A. Đổi Logo: .key edit tenkey logo
          if (subAction === 'logo' || subAction === 'themlogo' || subAction === 'addlogo') {
            const sessionKey = `${threadId}_${senderId}`;
            this.pendingLogoRequests.set(sessionKey, {
              type: 'WAITING_LOGO_CONFIRM',
              keyName: editKey,
              senderId,
              threadId,
              createdAt: Date.now()
            });

            await reply(
              `Bạn có muốn thêm logo cho Key [${editKey.toUpperCase()}] không?\n` +
              `👉 Hãy trượt tin nhắn này qua và trả lời: Có hoặc Không`
            );
            return;
          }

          // B. Xóa Logo: .key edit tenkey xoalogo
          if (subAction === 'xoalogo' || subAction === 'deletelogo' || subAction === 'removelogo') {
            const rmRes = keyService.removeKeyLogo(editKey, senderId, isSuperAdmin);
            await reply(rmRes.message);
            return;
          }

          // C. Đổi Tên Giải CUSTOM: .key edit tenkey ten <Tên mới>
          if (subAction === 'ten' || subAction === 'name' || subAction === 'tieude' || subAction === 'title') {
            const newTitle = args.slice(3).join(' ').trim();
            if (!newTitle) {
              await reply(`⚠️ Vui lòng nhập tên giải muốn đặt!\n💡 Ví dụ: .key edit ${editKey} ten ĐẠI CHIẾN QUÂN ĐOÀN`);
              return;
            }
            const titleRes = keyService.setKeyCustomTitle(editKey, newTitle, senderId, isSuperAdmin);
            await reply(titleRes.message);
            return;
          }

          // D. Đổi Mẫu Phôi BXH (đã rút gọn về mẫu duy nhất bxhconan)
          let templateNum = null;
          if (/^[1-6]$/.test(subAction)) {
            templateNum = subAction;
          } else if ((subAction === 'mau' || subAction === 'template') && args[3] && /^[1-6]$/.test(args[3])) {
            templateNum = args[3];
          }

          if (templateNum) {
            await reply(`ℹ️ Hệ thống hiện đang áp dụng mẫu chuẩn đẹp nhất: [Mẫu BXH Conan & Kaito Kid Esports].`);
            return;
          }

          // E. Không truyền hành động cụ thể -> Hiển thị thông tin Key và menu trượt tin nhắn chọn 1-4
          const currentTemplateName = imageService.getTemplateName(keyData.template || 'bxhconan');
          const currentLogo = (keyData.logoPath && fs.existsSync(keyData.logoPath)) ? 'Đã có logo ✅' : 'Chưa có ❌';
          const currentCustomTitle = keyData.customTitle ? keyData.customTitle : 'Chưa cài';

          await reply(
            `🔑 KEY: [${editKey.toUpperCase()}] | 📊 Còn lại: ${keyData.credits} lượt\n` +
            `🏷️ Tên CUSTOM: ${currentCustomTitle}\n` +
            `🖼️ Logo BXH: ${currentLogo}\n` +
            `🎨 Mẫu BXH: [${currentTemplateName}]\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `👉 Trượt tin nhắn này và trả lời số để cài đặt:\n` +
            `1️⃣ Đổi tên giải CUSTOM\n` +
            `2️⃣ Cài đặt Logo BXH (Ảnh hoặc GIF)\n` +
            `3️⃣ Xóa Logo BXH\n` +
            `4️⃣ Nạp thêm lượt dùng`
          );
          return;
        }

        // 3. XEM THÔNG TIN KEY HOẶC HƯỚNG DẪN DÙNG KEY
        let keyName = args[0];
        if (subCommand === 'check' || subCommand === 'xem') {
          keyName = args[1];
        }
        if (!keyName) {
          const ownedKey = keyService.findKeyByOwner(senderId);
          if (ownedKey) {
            keyName = ownedKey.key;
          }
        }

        if (!keyName) {
          await reply(
            `👉 Tạo key: .key tao [tenkey]\n` +
            `👉 Nạp lượt: .napluot [tenkey]\n` +
            `👉 Cài đặt key: .key edit [tenkey]\n` +
            `👉 Tính điểm: .td [id] [tenkey]\n` +
            `👉 Xóa trận lỗi: .td [id] [xoaN] [tenkey]`
          );
          return;
        }

        const keyData = keyService.getKey(keyName);
        if (!keyData) {
          await reply(`❌ Key "${keyName}" không tồn tại trên hệ thống!\n👉 Gõ .key tao ${keyName} để tạo key hoặc .napluot ${keyName} để nạp lượt.`);
          return;
        }

        if (keyData.ownerZaloId && String(keyData.ownerZaloId) !== String(senderId)) {
          await reply(`⛔ Key [${keyData.key.toUpperCase()}] không phải của bạn! Bạn không thể xem hoặc chỉnh sửa key này.\n👉 Gõ .key tao <tên_key_mới> để tạo key riêng cho bạn.`);
          return;
        }
        if (!keyData.ownerZaloId && senderId) {
          keyData.ownerZaloId = String(senderId);
          if (senderName) keyData.ownerName = senderName;
          keyService.saveKeys();
        }

        webhookServer.recordKeyActivity(keyData.key, threadId, threadType);
        const templateName = imageService.getTemplateName(keyData.template || 'bxhconan');
        const currentLogo = (keyData.logoPath && fs.existsSync(keyData.logoPath)) ? 'Đã có logo ✅' : 'Chưa có ❌';
        const currentCustomTitle = keyData.customTitle ? keyData.customTitle : 'Chưa cài';

        const infoText = `🔑 KEY: [${keyData.key.toUpperCase()}] | 📊 Còn lại: ${keyData.credits} lượt\n` +
        `🏷️ Tên CUSTOM: ${currentCustomTitle}\n` +
        `🖼️ Logo BXH: ${currentLogo}\n` +
        `🎨 Mẫu BXH: [${templateName}]\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 Trượt tin nhắn này và trả lời số để cài đặt:\n` +
        `1️⃣ Đổi tên giải CUSTOM\n` +
        `2️⃣ Cài đặt Logo BXH (Ảnh hoặc GIF)\n` +
        `3️⃣ Xóa Logo BXH\n` +
        `4️⃣ Nạp thêm lượt dùng\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 Tính điểm: .td <UID> ${keyData.key}\n` +
        `👉 Xóa trận lỗi: .td <UID> xoaN ${keyData.key}`;

        await reply(infoText);
        break;
      }



      // Lệnh tính điểm tổng hợp theo danh sách ID trận đấu (.bxh <ID1> <ID2>... [key])
      case 'bxh':
      case 'bangxephang':
      case 'tongdiem': {
        let keyName = null;
        const candidateArgs = [...args];

        // 1. Kiểm tra xem argument cuối cùng có phải là tên key không
        if (candidateArgs.length > 0) {
          const lastArg = candidateArgs[candidateArgs.length - 1].toLowerCase().trim();
          // Nếu không phải dãy số ID (từ 8 chữ số trở lên) hoặc là tên key có trong hệ thống
          if (!/^\d{8,}$/.test(lastArg) || keyService.getKey(lastArg)) {
            keyName = lastArg;
            candidateArgs.pop();
          }
        }

        const isSuperAdmin = this.isSuperAdmin(senderId, message);
        let isEligibleFreeTrial = false;
        if (threadType !== ThreadType.User) {
          const boxStatus = boxService.isGroupActive(threadId);
          if (boxStatus.allowed && boxStatus.box && boxStatus.box.unlimitedCredits !== false) {
            isEligibleFreeTrial = true;
          } else {
            const groupPerm = await this.checkAdminPermission(threadId, threadType, senderId);
            const isGroupAdmin = groupPerm.allowed && (groupPerm.role === 'admin' || groupPerm.role === 'deputy' || groupPerm.role === 'creator');
            isEligibleFreeTrial = customService.isUserEligibleForFreeTrial(threadId, senderId, isGroupAdmin || isSuperAdmin);
          }
        }

        if (!keyName && !isSuperAdmin && !isEligibleFreeTrial) {
          const ownedKey = keyService.findKeyByOwner(senderId);
          if (ownedKey) {
            keyName = ownedKey.key;
          }
        }

        // 2. Bóc tách toàn bộ ID trận từ args và tin nhắn quote (chuỗi số từ 6 đến 24 chữ số)
        const combinedText = `${candidateArgs.join(' ')} ${quotedMsg || ''}`;
        const rawIds = combinedText.match(/\b\d{6,24}\b/g) || [];
        // Giữ nguyên đúng thứ tự các trận đấu mà người dùng nhập vào
        const uniqueIds = [];
        for (const id of rawIds) {
          const cleanId = String(id).trim();
          if (cleanId && !uniqueIds.includes(cleanId)) {
            uniqueIds.push(cleanId);
          }
        }

        if (uniqueIds.length === 0) {
          await reply(
            `⚠️ CÚ PHÁP LỆNH .bxh (TÍNH ĐIỂM THEO DANH SÁCH ID TRẬN):\n` +
            `👉 Cú pháp: .bxh <ID_Trận_1> <ID_Trận_2> [ID_Trận_3]... [tên_key]\n` +
            `💡 Ví dụ: .bxh 2096072125441953792 2096077702004002816${keyName ? ' ' + keyName : ' tenkey'}\n` +
            `📌 Tính điểm chính xác theo danh sách ID các trận đấu bạn nhập vào.`
          );
          return;
        }

        let keyData = null;
        if (keyName && !isEligibleFreeTrial) {
          keyData = keyService.getKey(keyName);
          if (!keyData) {
            await reply(`❌ Key "${keyName}" không tồn tại trên hệ thống!\n👉 Vui lòng kiểm tra lại tên key hoặc nạp lượt (.napluot ${keyName}).`);
            return;
          }
          if ((keyData.credits || 0) <= 0 && !isSuperAdmin) {
            await reply(`⚠️ Key "${keyName}" đã HẾT LƯỢT dùng!\n👉 Vui lòng gõ .napluot ${keyName} để nạp thêm lượt (250đ/lượt).`);
            return;
          }
        } else if (!isSuperAdmin && !isEligibleFreeTrial) {
          await reply(
            `⚠️ Vui lòng nhập kèm Tên Key để tính điểm!\n` +
            `👉 Cú pháp: .bxh ${uniqueIds.join(' ')} <tên_key>\n` +
            `💡 Gõ .key tao <tên_key> để tạo key mới nhận 5 lượt miễn phí.`
          );
          return;
        }

        await reply(`⏳ 🤖 PQ BOT 🤖 đang truy xuất dữ liệu ${uniqueIds.length} trận đấu theo đúng ID bạn yêu cầu...`);

        // 3. Lấy chính xác dữ liệu từng trận đấu theo ID trận
        const validMatchIds = [];
        const validMatches = [];
        const failedIds = [];

        for (const id of uniqueIds) {
          try {
            const res = await garenaService.getMatchDetail(id);
            if (res.success && res.match && Array.isArray(res.match.ranks) && res.match.ranks.length > 0) {
              const mId = String(res.match.id || res.match.matchId || id);
              validMatchIds.push(mId);
              validMatches.push(res.match);
              continue;
            }
          } catch (e) {
            console.error(`Lỗi khi lấy dữ liệu trận ID [${id}]:`, e?.message || e);
          }
          failedIds.push(id);
        }

        if (validMatchIds.length === 0) {
          await reply(
            `❌ Không tìm thấy dữ liệu của trận nào trong các ID: [${uniqueIds.join(', ')}].\n` +
            `⚠️ Vui lòng kiểm tra lại ID trận hoặc đảm bảo các trận đã kết thúc trên máy chủ Garena!`
          );
          return;
        }

        let keyInfo = null;
        if (isEligibleFreeTrial) {
          keyInfo = {
            key: keyName || 'NNT',
            remainingCredits: 'Vô hạn',
            isFreeTrial: true,
            template: this.getGroupTemplate(threadId)
          };
          if (keyName) {
            webhookServer.recordKeyActivity(keyName, threadId, threadType);
          }
        } else if (keyName) {
          webhookServer.recordKeyActivity(keyName, threadId, threadType);
          const creditRes = keyService.useCredit(keyName, senderId, isSuperAdmin);
          if (!creditRes.success) {
            await reply(creditRes.message);
            return;
          }
          keyInfo = creditRes;
        }

        const scoreRes = await garenaService.calculateTournamentScores(validMatchIds);
        if (!scoreRes.success || !scoreRes.aggregatedTeamRanks) {
          if (keyInfo && !keyInfo.isFreeTrial) keyService.addCredits(keyInfo.key, 1);
          await reply(`❌ Lỗi khi tính điểm tổng kết: ${scoreRes.error || 'Không thể tổng hợp điểm'}`);
          return;
        }

        try {
          const template = keyInfo?.template || this.getGroupTemplate(threadId);
          const fullKeyData = keyInfo?.key ? keyService.getKey(keyInfo.key) : null;
          const imagePath = await imageService.generateLeaderboardImage(scoreRes.aggregatedTeamRanks, {
            template,
            matches: scoreRes.matches,
            matchTime: `TỔNG KẾT ${validMatchIds.length} TRẬN`,
            customTitle: fullKeyData?.customTitle || 'BẢNG XẾP HẠNG TỔNG KẾT',
            logoPath: fullKeyData?.logoPath || null
          });

          let caption = `🤖 PQ BOT\n` +
                        `📊 ID Trận: ${validMatchIds.join(', ')}\n` +
                        `🎯 Số trận: ${validMatchIds.length}\n` +
                        `⏳ Tổng kết ${validMatchIds.length} trận đấu theo ID`;

          if (keyInfo?.isFreeTrial) {
            caption += `\n🔑 Key: ${keyName ? keyName.toUpperCase() : 'NNT'}`;
            caption += `\n🎟 Bạn còn lại: Vô hạn lượt sử dụng`;
          } else if (keyInfo?.remainingCredits !== undefined) {
            caption += `\n🔑 Key: ${keyInfo.key ? keyInfo.key.toUpperCase() : 'N/A'}`;
            caption += `\n🎟 Bạn còn lại: ${keyInfo.remainingCredits} lượt sử dụng`;
          }

          if (failedIds.length > 0) {
            caption += `\n⚠️ Bỏ qua ID không tìm thấy: ${failedIds.join(', ')}`;
          }

          await this.api.sendMessage(
            {
              msg: caption,
              attachments: [imagePath]
            },
            threadId,
            threadType
          );

          setTimeout(() => {
            try {
              if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            } catch (e) {}
          }, 5000);
        } catch (imgErr) {
          console.error('Lỗi tạo ảnh BXH:', imgErr);
          let textBxh = formatAggregatedScores(scoreRes.aggregatedTeamRanks, validMatchIds);
          if (failedIds.length > 0) {
            textBxh += `\n⚠️ Bỏ qua ID không tìm thấy: ${failedIds.join(', ')}`;
          }
          if (keyInfo?.isFreeTrial) {
            textBxh += `\n🔑 Key: ${keyName ? keyName.toUpperCase() : 'NNT'}\n🎟 Bạn còn lại: Vô hạn lượt sử dụng`;
          } else if (keyInfo?.remainingCredits !== undefined) {
            textBxh += `\n🎫 Key [${keyInfo.key.toUpperCase()}]: -1 lượt (Còn lại: ${keyInfo.remainingCredits} lượt)`;
          }
          await reply(textBxh);
        }
        break;
      }

      // Lệnh kick thành viên chỉ định theo @tag, trượt tin nhắn (quote), UID hoặc tên (.kick @ten)
      case 'kick': {
        if (threadType === ThreadType.User) {
          await reply(`⚠️ Lệnh này chỉ có thể sử dụng trong Nhóm chat Zalo!`);
          return;
        }

        const perm = await this.checkAdminPermission(threadId, threadType, senderId);
        if (!perm.allowed) {
          return;
        }

        try {
          const res = await this.api.getGroupInfo(threadId);
          const info = res?.gridInfoMap?.[threadId] || (res?.gridInfoMap ? Object.values(res.gridInfoMap)[0] : null);
          if (!info) {
            await reply(`❌ Không thể lấy thông tin nhóm chat từ Zalo. Vui lòng thử lại sau!`);
            return;
          }

          const cleanId = (id) => String(id || '').split('_')[0].replace(/^0+/, '').trim();
          const creatorId = cleanId(info.creatorId);
          const adminIds = (info.adminIds || []).map(cleanId);
          const botId = cleanId(this.api.getOwnId?.() || '');

          // Kiểm tra xem tài khoản Bot có quyền quản trị (Trưởng nhóm hoặc Phó nhóm) trong nhóm không
          const isBotAdmin = (creatorId && creatorId === botId) || adminIds.includes(botId);
          if (!isBotAdmin) {
            await reply(`❌ THẤT BẠI: Bot hiện tại KHÔNG PHẢI là Trưởng nhóm hoặc Phó nhóm!\n👉 Vui lòng thăng quyền Phó nhóm cho tài khoản Bot trên Zalo thì Bot mới có thể kick thành viên.`);
            return;
          }

          // Lập bản đồ thành viên trong nhóm để tra cứu tên/UID
          const memMap = new Map();
          if (Array.isArray(info.currentMems)) {
            for (const m of info.currentMems) {
              const uid = cleanId(m?.id || m?.uid);
              if (uid) {
                memMap.set(uid, m.dName || m.zaloName || '');
              }
            }
          }

          const normalizeText = (str) =>
            String(str || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/đ/g, 'd')
              .replace(/Đ/g, 'D')
              .toLowerCase()
              .trim();

          // Thu thập các UID cần kick từ 3 nguồn:
          const targetMap = new Map(); // uid -> displayName

          // 1. Mentions (@tag) từ tin nhắn
          if (Array.isArray(message.data?.mentions) && message.data.mentions.length > 0) {
            for (const m of message.data.mentions) {
              const uid = cleanId(m.uid);
              if (!uid || uid === '-1' || uid === '0' || m.type === 1) continue;
              let name = '';
              if (typeof m.pos === 'number' && typeof m.len === 'number' && m.len > 0) {
                name = content.substring(m.pos, m.pos + m.len).replace(/^@+/, '').trim();
              }
              if (!name && memMap.has(uid)) name = memMap.get(uid);
              targetMap.set(uid, name || uid);
            }
          }

          // 2. Trượt tin nhắn (Quote reply) của người cần kick
          if (quoteObj) {
            const quoteUid = cleanId(quoteObj.ownerId || quoteObj.fromId || quoteObj.senderId || quoteObj.uidFrom);
            if (quoteUid && quoteUid !== '0') {
              const qName = (quoteObj.fromD || memMap.get(quoteUid) || quoteUid).trim();
              if (!targetMap.has(quoteUid)) {
                targetMap.set(quoteUid, qName);
              }
            }
          }

          // 3. Nhập UID dạng số hoặc tìm theo tên nếu chưa có mention metadata
          if (args.length > 0) {
            for (const arg of args) {
              const cleanArg = cleanId(arg);
              if (/^\d{8,22}$/.test(cleanArg)) {
                if (!targetMap.has(cleanArg)) {
                  targetMap.set(cleanArg, memMap.get(cleanArg) || cleanArg);
                }
              }
            }

            // Nếu vẫn chưa tìm thấy ai và có text sau .kick (vd: .kick @Nguyen Van A hoặc .kick Nguyen Van A)
            if (targetMap.size === 0 && Array.isArray(info.currentMems)) {
              const rawName = args.join(' ').replace(/^@+/, '').trim();
              const normSearch = normalizeText(rawName);
              if (normSearch.length >= 2) {
                const matchedMem = info.currentMems.find((m) => {
                  const dName = normalizeText(m.dName);
                  const zName = normalizeText(m.zaloName);
                  return (dName && (dName === normSearch || dName.includes(normSearch))) ||
                         (zName && (zName === normSearch || zName.includes(normSearch)));
                });
                if (matchedMem) {
                  const uid = cleanId(matchedMem.id || matchedMem.uid);
                  if (uid) {
                    targetMap.set(uid, matchedMem.dName || matchedMem.zaloName || uid);
                  }
                }
              }
            }
          }

          // Nếu không tìm thấy thành viên nào được chỉ định
          if (targetMap.size === 0) {
            await reply(
              `👉 CÚ PHÁP KICK THÀNH VIÊN:\n` +
              `• Cách 1: .kick @tên (tag 1 hoặc nhiều người trong nhóm)\n` +
              `• Cách 2: Trượt tin nhắn của người cần kick và gõ .kick\n` +
              `• Cách 3: .kick <UID>`
            );
            return;
          }

          // Danh sách ID miễn trừ tuyệt đối không được kick
          const exemptIds = new Set([
            creatorId,
            botId,
            cleanId(senderId),
            ...adminIds,
            ...(config.bot.adminWhitelist || []).map(cleanId)
          ]);

          // Lọc danh sách: tách người được phép kick và người bị miễn trừ
          const toKickList = [];
          const protectedList = [];

          for (const [uid, name] of targetMap.entries()) {
            const displayName = name || memMap.get(uid) || uid;
            if (exemptIds.has(uid)) {
              let reason = 'Được bảo vệ';
              if (uid === creatorId) reason = 'Trưởng nhóm';
              else if (adminIds.includes(uid)) reason = 'Phó nhóm';
              else if (uid === botId) reason = 'Tài khoản Bot';
              else if (uid === cleanId(senderId)) reason = 'Chính bạn';
              protectedList.push({ uid, name: displayName, reason });
            } else {
              toKickList.push({ uid, name: displayName });
            }
          }

          // Nếu tất cả người được chọn đều là người được bảo vệ
          if (toKickList.length === 0) {
            if (protectedList.length === 1) {
              const p = protectedList[0];
              await reply(`❌ Không thể kick [${p.name}] vì đây là ${p.reason.toUpperCase()}!`);
            } else {
              await reply(`❌ Không thể kick các thành viên đã chọn vì họ đều là Trưởng nhóm / Phó nhóm / Admin!`);
            }
            return;
          }

          // Tiến hành kick
          const kickedNames = [];
          const failedNames = [];

          for (const target of toKickList) {
            const ok = await this.kickMember(threadId, target.uid);
            if (ok) {
              kickedNames.push(target.name);
            } else {
              failedNames.push(target.name);
            }
            if (toKickList.length > 1) {
              await new Promise((r) => setTimeout(r, 300));
            }
          }

          // Xóa cache group info để cập nhật lại danh sách thành viên mới
          this.groupInfoCache.delete(threadId);

          // Phản hồi kết quả
          let resultMsg = '';
          if (kickedNames.length > 0) {
            if (kickedNames.length === 1) {
              resultMsg += `👞 Đã kick thành viên [${kickedNames[0]}] ra khỏi nhóm!`;
            } else {
              resultMsg += `👞 Đã kick thành công ${kickedNames.length} thành viên:\n` + kickedNames.map((n) => `• ${n}`).join('\n');
            }
          }

          if (failedNames.length > 0) {
            resultMsg += `\n⚠️ Thất bại (${failedNames.length}): ` + failedNames.join(', ');
          }

          if (protectedList.length > 0) {
            resultMsg += `\n🛡️ Đã bỏ qua ${protectedList.length} người: ` + protectedList.map((p) => `${p.name} (${p.reason})`).join(', ');
          }

          await reply(resultMsg.trim());
        } catch (kickErr) {
          console.error('[KICK] Lỗi xử lý lệnh kick:', kickErr);
          await reply(`❌ Đã xảy ra lỗi khi thực hiện lệnh kick: ${kickErr?.message || kickErr}`);
        }
        break;
      }

      // Lệnh kick tất cả thành viên thường trong nhóm (bảo lưu Trưởng nhóm và các Phó nhóm)
      // CẦN XÁC NHẬN TỪ 2 TRƯỞNG/PHÓ NHÓM KHÁC NHAU ĐỂ ĐẢM BẢO AN TOÀN
      case 'kickall':
      case 'kick-all':
      case 'kicktatca':
      case 'locnhom':
      case 'clearall': {
        if (threadType === ThreadType.User) {
          await reply(`⚠️ Lệnh này chỉ có thể sử dụng trong Nhóm chat Zalo!`);
          return;
        }

        const subAction = (args[0] || '').toLowerCase().trim();
        const pending = this.pendingKickallConfirmations.get(threadId);

        // Hủy bỏ yêu cầu lọc thành viên
        if (subAction === 'huy' || subAction === 'cancel' || subAction === 'no') {
          if (pending) {
            this.pendingKickallConfirmations.delete(threadId);
            await reply(`❌ Đã hủy yêu cầu .kickall của nhóm!`);
          } else {
            await reply(`ℹ️ Không có yêu cầu .kickall nào đang chờ.`);
          }
          return;
        }

        const cleanSenderId = String(senderId || '').split('_')[0].trim();

        // 1. Nếu chưa có phiên yêu cầu nào hoặc phiên cũ đã hết hạn (> 2 phút)
        if (!pending || Date.now() > pending.expiresAt) {
          const perm = await this.checkAdminPermission(threadId, threadType, senderId);
          if (!perm.allowed) {
            return;
          }

          this.pendingKickallConfirmations.set(threadId, {
            firstAdminId: cleanSenderId,
            firstAdminName: senderName,
            firstAdminRole: perm.role,
            expiresAt: Date.now() + 2 * 60 * 1000
          });

          await reply(
            `⚠️ XÁC NHẬN KICKALL (1/2)\n` +
            `👤 Yêu cầu: ${senderName} (${perm.role})\n` +
            `👉 Trưởng/Phó nhóm 2 gõ: .kickall (trong 2p)\n` +
            `💡 Gõ ".kickall huy" để hủy`
          );
          return;
        }

        // 2. Nếu chính người yêu cầu 1 gõ lại
        if (pending.firstAdminId === cleanSenderId) {
          await reply(`⚠️ Bạn đã gửi yêu cầu. Cần Trưởng/Phó nhóm khác gõ .kickall xác nhận!`);
          return;
        }

        // 3. Người thứ 2 gõ xác nhận -> Kiểm tra xem người thứ 2 có phải là Trưởng/Phó nhóm không
        const secondPerm = await this.checkAdminPermission(threadId, threadType, senderId);
        if (!secondPerm.allowed) {
          await reply(`⛔ Chỉ Trưởng nhóm hoặc Phó nhóm mới có quyền xác nhận!`);
          return;
        }

        // Đã đủ 2 Admin khác nhau xác nhận!
        const admin1Name = pending.firstAdminName;
        const admin1Role = pending.firstAdminRole;
        this.pendingKickallConfirmations.delete(threadId);

        await reply(
          `✅ ĐÃ XÁC NHẬN (2/2)\n` +
          `👤 QTV 1: ${admin1Name}\n` +
          `👤 QTV 2: ${senderName}\n` +
          `⚡ Bắt đầu lọc toàn bộ thành viên thường...`
        );

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
            cleanId(pending.firstAdminId),
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

          let summary = `🤖 PQ BOT 🤖 - HOÀN TẤT LỌC THÀNH VIÊN!\n`;
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

      // Lệnh đổi mã QR riêng cho nhóm: .doiqr, .setqr
      case 'doiqr':
      case 'setqr': {
        const perm = await this.checkAdminPermission(threadId, threadType, senderId);
        if (!perm.allowed) {
          return;
        }

        const photoUrl = message.directPhotoUrl || message.quotedPhotoUrl || message.photoUrl || (args[0]?.startsWith('http') ? args[0] : null);

        if (!photoUrl) {
          await reply(
            `⚠️ Vui lòng gửi ảnh mã QR cần đổi!\n\n` +
            `👉 Cách 1 (Khuyên dùng): Gửi ảnh mã QR vào nhóm, ở ô chú thích (caption) gõ: .doiqr\n` +
            `👉 Cách 2: Trượt tin nhắn vào ảnh mã QR có sẵn trong nhóm rồi gõ: .doiqr\n` +
            `👉 Cách 3: Gõ .doiqr <link_ảnh>`
          );
          return;
        }

        try {
          await reply('⏳ Đang tải và lưu mã QR mới cho nhóm...');
          const savedQrPath = await this.downloadAndSaveGroupQr(threadId, photoUrl);

          if (!savedQrPath || !fs.existsSync(savedQrPath)) {
            await reply('❌ Lỗi khi tải ảnh mã QR. Vui lòng thử lại!');
            return;
          }

          customService.setGroupQrImage(threadId, savedQrPath);

          const currentBank = customService.getGroupBankInfo(threadId);
          let successMsg = `✅ ĐÃ ĐỔI MÃ QR CHO NHÓM THÀNH CÔNG! 🎉\n\n`;
          successMsg += `📌 Mã QR này đã được kích hoạt riêng cho nhóm chat này.\n`;
          successMsg += `👉 Khi thành viên gõ .qr hoặc nhắn "xin qr", Bot sẽ gửi mã QR mới này kèm STK: [${currentBank.bankAccount} - ${currentBank.adminCtk}].`;

          const sendPayload = {
            msg: successMsg,
            attachments: [savedQrPath]
          };
          if (message.data) sendPayload.quote = message.data;

          await this.api.sendMessage(
            sendPayload,
            threadId,
            threadType
          );
        } catch (err) {
          console.error('Lỗi khi đổi QR nhóm:', err);
          await reply(`❌ Lỗi khi lưu ảnh mã QR: ${err?.message || 'Không xác định'}`);
        }
        break;
      }

      // Lệnh xóa mã QR riêng, quay về mặc định: .xoaqr, .resetqr
      case 'xoaqr':
      case 'resetqr': {
        const perm = await this.checkAdminPermission(threadId, threadType, senderId);
        if (!perm.allowed) {
          return;
        }

        customService.clearGroupQrImage(threadId);
        const customQrPath = path.resolve(__dirname, `../assets/qrs/qr_${threadId}.png`);
        if (fs.existsSync(customQrPath)) {
          try { fs.unlinkSync(customQrPath); } catch (e) {}
        }

        await reply(`✅ ĐÃ XÓA MÃ QR RIÊNG CỦA NHÓM!\n👉 Bot đã quay về sử dụng mã QR TPBank mặc định.`);
        break;
      }

      // Lệnh đổi Số tài khoản & Tên ngân hàng cho nhóm: .setstk <STK> <NgânHàng> [CTK]
      case 'setstk': {
        const perm = await this.checkAdminPermission(threadId, threadType, senderId);
        if (!perm.allowed) {
          return;
        }

        if (!args[0]) {
          await reply(
            `⚠️ Vui lòng nhập số tài khoản và tên ngân hàng!\n\n` +
            `👉 Cú pháp: .setstk <Số_TK> <Tên_Ngân_Hàng> [Tên_CTK]\n` +
            `• Ví dụ 1: .setstk 0987654321 MBBank\n` +
            `• Ví dụ 2: .setstk 1903678910 Techcombank NGUYEN VAN A`
          );
          return;
        }

        const stk = args[0].trim();
        const bankName = args[1] ? args[1].trim() : 'Ngân Hàng';
        const ctkName = args.slice(2).join(' ').trim() || null;

        const updated = customService.setGroupBankInfo(threadId, stk, bankName, ctkName || null);

        let successMsg = `✅ ĐÃ CẬP NHẬT THÔNG TIN THANH TOÁN CHO NHÓM! 🎉\n\n`;
        successMsg += `🏦 Ngân hàng: [${updated.bankName.toUpperCase()}]\n`;
        successMsg += `💳 STK: [${updated.bankAccount}]\n`;
        successMsg += `👤 CTK: [${updated.adminCtk}]\n\n`;
        successMsg += `👉 Thành viên gõ .qr hoặc nhắn "xin qr" sẽ thấy thông tin tài khoản mới này!`;

        await reply(successMsg);
        break;
      }

      // Lệnh đổi tên Chủ tài khoản nhận tiền nhóm: .ctk <Tên_CTK>
      case 'ctk': {
        const perm = await this.checkAdminPermission(threadId, threadType, senderId);
        if (!perm.allowed) {
          return;
        }

        const ctkName = args.join(' ').trim();
        if (!ctkName) {
          await reply(`⚠️ Vui lòng nhập tên Chủ tài khoản!\nVí dụ: .ctk LE DAI QUY`);
          return;
        }

        const bankInfo = customService.getGroupBankInfo(threadId);
        customService.setGroupBankInfo(threadId, bankInfo.bankAccount, bankInfo.bankName, ctkName);
        await reply(`✅ Đã cập nhật tên Chủ tài khoản nhóm: [${ctkName.toUpperCase()}]!`);
        break;
      }

      default:
        break;
    }
  }

  /**
   * Xử lý tìm trận và tính điểm theo khung giờ và ngày được chọn
   * Tự động xuất ẢNH BẢNG XẾP HẠNG gửi vào Zalo
   */
  async executeSlotCalculation(accountId, slotId, threadId, threadType, quoteData, customDate = null, keyName = null, xoaMatchIndex = null) {
    const activeQuote = quoteData?.msgId ? quoteData : null;
    const senderId = quoteData?.uidFrom || 'user';

    const slotData = getSlotTimestamps(slotId, customDate);
    if (!slotData) {
      await this.api.sendMessage(
        { msg: `⚠️ Khung giờ số [${slotId}] không hợp lệ. Vui lòng chọn từ 1 đến 8!`, quote: activeQuote },
        threadId,
        threadType
      );
      return;
    }

    // 0. KIỂM TRA VÀ TRỪ LƯỢT KEY NẾU CÓ
    let keyInfo = null;
    const isSuperAdmin = this.isSuperAdmin(senderId);
    let isEligibleFreeTrial = false;

    if (threadType !== ThreadType.User) {
      const boxStatus = boxService.isGroupActive(threadId);
      if (boxStatus.allowed && boxStatus.box && boxStatus.box.unlimitedCredits !== false) {
        isEligibleFreeTrial = true;
      } else {
        const perm = await this.checkAdminPermission(threadId, threadType, senderId);
        const isGroupAdmin = perm.allowed && (perm.role === 'admin' || perm.role === 'deputy' || perm.role === 'creator');
        isEligibleFreeTrial = customService.isUserEligibleForFreeTrial(threadId, senderId, isGroupAdmin || isSuperAdmin);
      }
    }

    if (isEligibleFreeTrial) {
      keyInfo = {
        key: keyName || 'NNT',
        remainingCredits: 'Vô hạn',
        isFreeTrial: true,
        template: this.getGroupTemplate(threadId)
      };
      if (keyName) {
        webhookServer.recordKeyActivity(keyName, threadId, threadType);
      }
    } else if (keyName) {
      webhookServer.recordKeyActivity(keyName, threadId, threadType);
      const creditRes = keyService.useCredit(keyName, senderId, isSuperAdmin);
      if (!creditRes.success) {
        await this.api.sendMessage(
          { msg: creditRes.message, quote: activeQuote },
          threadId,
          threadType
        );
        return;
      }
      keyInfo = creditRes;
    }

    const { slot, startTime, endTime, dateLabel } = slotData;

    // 1. Tìm trận theo khoảng thời gian
    const matchRes = await garenaService.findMatchesByPlayer(accountId, startTime, endTime);

    if (!matchRes.success) {
      if (keyInfo && !keyInfo.isFreeTrial) {
        keyService.addCredits(keyInfo.key, 1);
      }
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

    let matches = matchRes.matches || [];

    // Nếu không tìm thấy trận -> Gợi ý nhập ngày để tìm lại
    if (matches.length === 0) {
      if (keyInfo && !keyInfo.isFreeTrial) {
        keyService.addCredits(keyInfo.key, 1);
      }

      const requestKeyUser = `${threadId}_${senderId}`;
      const requestKeyThread = `${threadId}`;

      // Chuyển sang trạng thái chờ nhập ngày (hết hạn sau 5 phút)
      const waitingDateSession = {
        type: 'WAITING_DATE',
        accountId,
        slotId,
        keyName,
        xoaMatchIndex,
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

      const notFoundMsg = `⚠️ Không tìm thấy trận đấu nào của UID [${accountId}] trong khung giờ [${slot.label}] (Khung ${slotId}) ngày ${dateLabel}.${keyInfo ? ' (Chưa trừ lượt)' : ''}\n\n📅 BẠN CÓ MUỐN TÌM VÀO NGÀY KHÁC?\n👉 Hãy trượt tin nhắn này qua và trả lời ngày: DD/MM (hoặc gõ "hôm qua")\nVí dụ: 07/09 hoặc 06/09/2026`;

      await this.api.sendMessage({ msg: notFoundMsg, quote: activeQuote }, threadId, threadType);
      return;
    }

    // Sắp xếp các trận theo thứ tự thời gian bắt đầu tăng dần (Trận 1 -> Trận N)
    matches.sort((a, b) => {
      const timeA = a.startTime || a.start_time || a.createTime || a.id || 0;
      const timeB = b.startTime || b.start_time || b.createTime || b.id || 0;
      return timeA - timeB;
    });

    // Xử lý bỏ qua trận lỗi nếu có chỉ định xoaN
    let removedMatchNote = '';
    if (xoaMatchIndex) {
      const totalBefore = matches.length;
      if (xoaMatchIndex > 0 && xoaMatchIndex <= totalBefore) {
        matches = matches.filter((_, idx) => idx !== (xoaMatchIndex - 1));
        removedMatchNote = `\n🗑️ Đã xóa trận lỗi số [${xoaMatchIndex}], chỉ tính ${matches.length} trận còn lại!`;
      } else {
        removedMatchNote = `\n⚠️ Lưu ý: Không tìm thấy trận số [${xoaMatchIndex}] để xóa (khung này có ${totalBefore} trận). Bot vẫn tính tất cả các trận.`;
      }
    }

    if (matches.length === 0) {
      if (keyInfo && !keyInfo.isFreeTrial) {
        keyService.addCredits(keyInfo.key, 1);
      }
      await this.api.sendMessage(
        { msg: `⚠️ Sau khi xóa trận số [${xoaMatchIndex}], không còn trận nào trong khung giờ này để tính điểm! (Đã hoàn lại lượt key)`, quote: activeQuote },
        threadId,
        threadType
      );
      return;
    }

    // 2. Lấy danh sách matchIds và tính điểm tổng
    const matchIds = matches.map((m) => m.id || m.matchId);
    const scoreRes = await garenaService.calculateTournamentScores(matchIds);

    if (scoreRes.success && scoreRes.aggregatedTeamRanks) {
      // 3. TẠO ẢNH BẢNG XẾP HẠNG TỪ MẪU VÀ GỬI THẲNG VÀO ZALO
      try {
        const template = keyInfo?.template || this.getGroupTemplate(threadId);
        const fullKeyData = keyInfo?.key ? keyService.getKey(keyInfo.key) : null;
        const imagePath = await imageService.generateLeaderboardImage(scoreRes.aggregatedTeamRanks, {
          template,
          matches: scoreRes.matches,
          matchTime: `${slot.label} - ${dateLabel}`,
          customTitle: fullKeyData?.customTitle || null,
          logoPath: fullKeyData?.logoPath || null
        });

        const slotLabel = `${String(slot.start[0]).padStart(2, '0')}:${String(slot.start[1]).padStart(2, '0')} → ${String(slot.end[0]).padStart(2, '0')}:${String(slot.end[1]).padStart(2, '0')}`;

        let caption = `🤖 PQ BOT\n` +
                      `📊 ID: ${accountId}\n` +
                      `🎯 Số trận: ${matchIds.length}\n` +
                      `⏳ Khung giờ: ${slotLabel} ${dateLabel}`;

        if (keyInfo?.isFreeTrial) {
          caption += `\n🔑 Key: ${keyName ? keyName.toUpperCase() : 'NNT'}`;
          caption += `\n🎟 Bạn còn lại: Vô hạn lượt sử dụng`;
        } else if (keyInfo?.remainingCredits !== undefined) {
          caption += `\n🔑 Key: ${keyInfo.key ? keyInfo.key.toUpperCase() : 'N/A'}`;
          caption += `\n🎟 Bạn còn lại: ${keyInfo.remainingCredits} lượt sử dụng`;
        }

        if (removedMatchNote) {
          caption += removedMatchNote;
        }

        await this.api.sendMessage(
          {
            msg: caption,
            attachments: [imagePath]
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
        let leaderboardText = formatSlotLeaderboard(slot.label, dateLabel, accountId, matchIds, scoreRes.aggregatedTeamRanks);
        if (removedMatchNote) {
          leaderboardText += removedMatchNote;
        }
        if (keyInfo?.isFreeTrial) {
          leaderboardText += `\n🔑 Key: ${keyName ? keyName.toUpperCase() : 'NNT'}\n🎟 Bạn còn lại: Vô hạn lượt sử dụng`;
        } else if (keyInfo?.remainingCredits !== undefined) {
          leaderboardText += `\n🎫 Key [${keyInfo.key.toUpperCase()}]: -1 lượt (Còn lại: ${keyInfo.remainingCredits} lượt)`;
        }
        await this.api.sendMessage({ msg: leaderboardText, quote: activeQuote }, threadId, threadType);
      }
    } else {
      if (keyInfo && !keyInfo.isFreeTrial) {
        keyService.addCredits(keyInfo.key, 1);
      }
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
