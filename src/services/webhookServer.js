import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { keyService } from './keyService.js';
import { paymentService, PAYMENT_CONFIG } from './paymentService.js';
import { config, updateEnvFile } from '../config.js';
import { garenaService } from './garenaService.js';
import { logService } from './logService.js';
import { announcementService, DEFAULT_ANNOUNCEMENT } from './announcementService.js';
import { boxService } from './boxService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dashboardHtmlPath = path.resolve(__dirname, '../public/dashboard.html');

class WebhookServer {
  constructor() {
    this.server = null;
    this.port = parseInt(process.env.WEBHOOK_PORT || process.env.PORT, 10) || 3000;
    this.bot = null; // Sẽ được truyền bot instance vào để gửi tin nhắn Zalo
    this.lastActiveThreads = new Map(); // Lưu threadId gần nhất của từng key để gửi thông báo
    this.processedTxIds = new Set(); // Chống cộng trùng giao dịch
    this.txFilePath = path.resolve(__dirname, '../../data/processed_transactions.json');
    this.loadProcessedTxIds();
    this.pollingInterval = null;
    this.validTokens = new Set(); // Lưu session tokens đăng nhập dashboard
  }

  loadProcessedTxIds() {
    try {
      if (fs.existsSync(this.txFilePath)) {
        const raw = fs.readFileSync(this.txFilePath, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          this.processedTxIds = new Set(list.map(String));
        }
      }
    } catch (e) {
      console.warn('⚠️ Lỗi đọc processed_transactions.json:', e.message);
    }
  }

  saveProcessedTxId(txId) {
    if (!txId) return;
    this.processedTxIds.add(String(txId));
    try {
      const dataDir = path.dirname(this.txFilePath);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(this.txFilePath, JSON.stringify(Array.from(this.processedTxIds), null, 2), 'utf8');
    } catch (e) {
      console.warn('⚠️ Lỗi ghi processed_transactions.json:', e.message);
    }
  }

  setBotInstance(bot) {
    this.bot = bot;
  }

  recordKeyActivity(keyName, threadId, threadType) {
    if (!keyName || !threadId) return;
    this.lastActiveThreads.set(String(keyName).toLowerCase(), { threadId, threadType });
  }

  isAuthorized(req) {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    return this.validTokens.has(token);
  }

  start(botInstance = null) {
    if (botInstance) {
      this.bot = botInstance;
    }

    if (this.server) {
      console.log(`ℹ️ [WEBHOOK] Server đã đang chạy ở cổng ${this.port}`);
      return;
    }

    // Khởi động lưu log
    logService.init();

    this.server = http.createServer(async (req, res) => {
      // Thiết lập CORS header
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = req.url.split('?')[0];

      // Helper đọc body JSON
      const readJsonBody = () => {
        return new Promise((resolve) => {
          let body = '';
          req.on('data', (chunk) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              resolve(body ? JSON.parse(body) : {});
            } catch {
              resolve({});
            }
          });
        });
      };

      // ==========================================
      // 1. GIAO DIỆN WEB DASHBOARD CHO MÁY TÍNH & VPS
      // ==========================================
      if (req.method === 'GET' && (url === '/' || url === '/dashboard')) {
        try {
          if (fs.existsSync(dashboardHtmlPath)) {
            const html = fs.readFileSync(dashboardHtmlPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Không tìm thấy dashboard.html');
            return;
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Lỗi tải giao diện: ' + err.message);
          return;
        }
      }

      // ==========================================
      // 2. AUTHENTICATION & LOGIN DASHBOARD
      // ==========================================
      if (req.method === 'POST' && url === '/api/login') {
        const payload = await readJsonBody();
        const inputPassword = String(payload.password || '').trim();
        const currentPassword = String(config.bot.dashboardPassword || 'admin123').trim();

        if (inputPassword === currentPassword) {
          const token = crypto.randomBytes(24).toString('hex');
          this.validTokens.add(token);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, token, message: 'Đăng nhập thành công!' }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Mật khẩu không chính xác!' }));
        }
        return;
      }

      // ==========================================
      // 3. API QUẢN TRỊ TRẠNG THÁI VPS (ADMIN STATUS)
      // ==========================================
      if (req.method === 'GET' && url === '/api/admin/status') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const uptimeSec = Math.floor(process.uptime());
        const d = Math.floor(uptimeSec / 86400);
        const h = Math.floor((uptimeSec % 86400) / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;
        const uptimeStr = `${d > 0 ? d + 'd ' : ''}${h}h ${m}m ${s}s`;

        const mem = process.memoryUsage();
        const totalMem = Math.round(os.totalmem() / 1024 / 1024);
        const memoryRss = Math.round(mem.rss / 1024 / 1024);

        // Garena status
        let garenaStatus = { connected: false, nickName: null, accountId: null, level: null, error: null };
        try {
          const gRes = await garenaService.getUserProfile();
          if (gRes.success && gRes.data) {
            garenaStatus = {
              connected: true,
              nickName: gRes.data.nickName,
              accountId: gRes.data.accountId,
              level: gRes.data.level,
              error: null
            };
          } else {
            garenaStatus.error = gRes.error || 'Cookie hết hạn';
          }
        } catch (e) {
          garenaStatus.error = e.message;
        }

        // Zalo status
        const botApi = this.bot?.api;
        const ownId = botApi?.getOwnId ? botApi.getOwnId() : null;
        const qrExists = fs.existsSync('qr.png');
        const zaloStatus = {
          loggedIn: !!botApi,
          selfId: ownId,
          selfName: ownId ? 'Bot Zalo FF' : null,
          qrExists
        };

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          system: {
            uptimeStr,
            uptimeSec,
            memoryRss,
            totalMem,
            platform: `${os.platform()} ${os.arch()}`,
            nodeVersion: process.version
          },
          garena: garenaStatus,
          zalo: zaloStatus
        }));
        return;
      }

      // ==========================================
      // 4. API LẤY ẢNH QR ZALO ĐĂNG NHẬP
      // ==========================================
      if (req.method === 'GET' && url === '/api/admin/qr') {
        const qrPath = path.resolve(process.cwd(), 'qr.png');
        if (fs.existsSync(qrPath)) {
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store, no-cache, must-revalidate, private'
          });
          fs.createReadStream(qrPath).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa có file QR hoặc bot đã đăng nhập' }));
        }
        return;
      }

      // ==========================================
      // 5. API CẬP NHẬT / ĐĂNG XUẤT COOKIE GARENA
      // ==========================================
      if (req.method === 'POST' && url === '/api/admin/cookie') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        const newCookie = String(payload.cookie || '').trim();
        if (!newCookie) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Chuỗi cookie không được để trống!' }));
          return;
        }

        // 1. Cập nhật vào cấu hình & garenaService
        garenaService.updateCookie(newCookie);
        // 2. Tự động lưu vào file .env trên VPS
        updateEnvFile('GARENA_COOKIE', newCookie);

        // 3. Test kết nối trực tiếp
        const testRes = await garenaService.getUserProfile();
        if (testRes.success && testRes.data) {
          console.log(`✅ [DASHBOARD] Đã đổi Cookie Garena thành công từ Web: [${testRes.data.nickName}] (ID: ${testRes.data.accountId})`);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, profile: testRes.data }));
        } else {
          console.warn(`⚠️ [DASHBOARD] Cookie vừa nhập không kết nối được Garena:`, testRes.error);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: testRes.error || 'Cookie không thể đăng nhập Garena.' }));
        }
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/cookie/logout') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        garenaService.updateCookie('');
        updateEnvFile('GARENA_COOKIE', '');
        console.log('🚪 [DASHBOARD] Đã đăng xuất / xóa Cookie Garena khỏi hệ thống.');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Đã xóa cookie thành công' }));
        return;
      }

      // ==========================================
      // 6. API ĐĂNG XUẤT ZALO & TẠO QR MỚI
      // ==========================================
      if (req.method === 'POST' && url === '/api/admin/zalo/logout') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const sessionPath = config.bot.sessionPath;
        if (fs.existsSync(sessionPath)) {
          try { fs.unlinkSync(sessionPath); } catch (e) {}
        }

        if (this.bot) {
          this.bot.api = null;
          // Kích hoạt tạo QR mới trong nền
          setTimeout(() => {
            this.bot.loginZalo().catch(err => console.error('Lỗi khi tạo QR sau logout:', err));
          }, 500);
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Đã đăng xuất Zalo. Đang tạo mã QR mới...' }));
        return;
      }

      // ==========================================
      // 6.1. API LÀM MỚI MÃ QR ZALO
      // ==========================================
      if (req.method === 'POST' && url === '/api/admin/zalo/refresh-qr') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        try { if (fs.existsSync('qr.png')) fs.unlinkSync('qr.png'); } catch (e) {}

        if (this.bot) {
          this.bot.api = null;
          setTimeout(() => {
            this.bot.loginZalo().catch(err => console.error('Lỗi khi làm mới QR:', err));
          }, 300);
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Đang tạo mã QR mới...' }));
        return;
      }

      // ==========================================
      // 6.2. API ĐĂNG NHẬP BẰNG COOKIE TỪ TRÌNH DUYỆT CHROME
      // ==========================================
      if (req.method === 'POST' && url === '/api/admin/zalo/set-cookie') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        const rawData = payload.data;
        if (!rawData) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Dữ liệu cookie không được để trống!' }));
          return;
        }

        let sessionObj = null;
        try {
          const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
          if (Array.isArray(parsed)) {
            // Định dạng JSON xuất trực tiếp từ tiện ích Cookie-Editor
            sessionObj = {
              cookie: parsed,
              imei: payload.imei || "767def13-86a2-4fa7-812c-cdd6ac8823e3-a69b52f9d7f760edf3fd052bcda2542f",
              userAgent: payload.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
            };
          } else if (parsed && parsed.cookie) {
            // Định dạng file zalo_session.json đầy đủ
            sessionObj = parsed;
          } else {
            throw new Error('Định dạng không hợp lệ');
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Dữ liệu JSON không đúng định dạng Cookie-Editor!' }));
          return;
        }

        const sessionPath = config.bot.sessionPath;
        try {
          fs.writeFileSync(sessionPath, JSON.stringify(sessionObj, null, 2), 'utf8');
          console.log('🍪 [DASHBOARD] Đã lưu Cookie Zalo mới từ Bảng điều khiển Web.');
        } catch (saveErr) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Không thể ghi file session: ' + saveErr.message }));
          return;
        }

        if (this.bot) {
          try { this.bot.api?.listener?.stop?.(); } catch (e) {}
          this.bot.api = null;
          setTimeout(() => {
            this.bot.loginZalo().catch(err => console.error('Lỗi khi kích hoạt bot bằng cookie mới:', err));
          }, 500);
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Đã lưu Cookie Zalo thành công! Bot đang đăng nhập...' }));
        return;
      }

      // ==========================================
      // 7. API LIVE TERMINAL LOGS
      // ==========================================
      if (req.method === 'GET' && url === '/api/admin/logs') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const querySince = new URL(req.url, 'http://localhost').searchParams.get('since') || 0;
        const logs = logService.getLogs(querySince);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ logs }));
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/logs/clear') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        logService.clear();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // ==========================================
      // 8. API QUẢN LÝ KEY & LƯỢT
      // ==========================================
      if (req.method === 'GET' && url === '/api/admin/keys') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const keysObj = keyService.getAllKeys();
        const keysList = Object.values(keysObj);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ keys: keysList }));
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/keys/add') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        const keyName = String(payload.key || '').trim().toLowerCase();
        const credits = parseInt(payload.credits, 10);
        if (!keyName || isNaN(credits) || credits <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Tên key hoặc số lượt không hợp lệ!' }));
          return;
        }

        const result = keyService.addCredits(keyName, credits, 0);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, key: keyName, totalCredits: result.totalCredits }));
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/keys/deduct') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        const keyName = String(payload.key || '').trim().toLowerCase();
        const credits = parseInt(payload.credits, 10);
        if (!keyName || isNaN(credits) || credits <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Tên key hoặc số lượt không hợp lệ!' }));
          return;
        }

        const result = keyService.deductCredits(keyName, credits);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/keys/set') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        const keyName = String(payload.key || '').trim().toLowerCase();
        const credits = parseInt(payload.credits, 10);
        if (!keyName || isNaN(credits) || credits < 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Tên key hoặc số lượt không hợp lệ!' }));
          return;
        }

        const result = keyService.setCredits(keyName, credits);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/keys/delete') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        const keyName = String(payload.key || '').trim().toLowerCase();
        const result = keyService.deleteKey(keyName);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
        return;
      }

      // ==========================================
      // 8.1. API QUẢN LÝ THÔNG BÁO QUẢNG BÁ
      // ==========================================
      if (req.method === 'GET' && url === '/api/admin/announcement') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const groups = await announcementService.getAllTargetGroups(this.bot);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          enabled: announcementService.enabled,
          intervalHours: announcementService.intervalHours,
          customMessage: announcementService.customMessage || DEFAULT_ANNOUNCEMENT,
          groupsCount: groups.length,
          isBroadcasting: announcementService.isBroadcasting
        }));
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/announcement/save') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        if (typeof payload.enabled === 'boolean') {
          announcementService.setEnabled(payload.enabled);
        }
        if (payload.intervalHours) {
          announcementService.setIntervalHours(payload.intervalHours);
        }
        if (typeof payload.customMessage === 'string') {
          announcementService.setMessage(payload.customMessage);
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Đã lưu cài đặt thông báo thành công!' }));
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/announcement/broadcast') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        if (!this.bot) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Bot chưa kết nối Zalo!' }));
          return;
        }

        const payload = await readJsonBody();
        const customText = payload.message || null;
        const result = await announcementService.broadcast(this.bot, customText);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
        return;
      }

      // ==========================================
      // 8.2. API QUẢN LÝ BOX ZALO CHO PHÉP HOẠT ĐỘNG
      // ==========================================
      if (req.method === 'GET' && url === '/api/admin/boxes') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const boxes = await boxService.getAllBoxesWithMembers(this.bot);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, boxes }));
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/boxes/toggle-unlimited') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        try {
          const updated = boxService.toggleUnlimited(payload.groupId, payload.status, payload.days);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, box: updated }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: err.message }));
        }
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/boxes/set-unlimited-days') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        try {
          const updated = boxService.setUnlimitedDays(payload.groupId, payload.days);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, box: updated }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: err.message }));
        }
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/boxes/add') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        try {
          const newBox = boxService.addBox(payload);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, box: newBox }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: err.message }));
        }
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/boxes/update') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        try {
          const updated = boxService.updateBox(payload.groupId, payload);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, box: updated }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: err.message }));
        }
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/boxes/extend') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        try {
          const updated = boxService.extendDays(payload.groupId, payload.days || 30);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, box: updated }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: err.message }));
        }
        return;
      }

      if (req.method === 'POST' && url === '/api/admin/boxes/delete') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        try {
          const ok = boxService.deleteBox(payload.groupId);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: ok }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: err.message }));
        }
        return;
      }

      // API lấy danh sách nhóm Zalo Bot đang tham gia để chọn nhanh
      if (req.method === 'GET' && url === '/api/admin/zalo/groups') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const groups = [];
        if (this.bot?.api && typeof this.bot.api.getAllGroups === 'function') {
          try {
            const resData = await this.bot.api.getAllGroups();
            const gridMap = resData?.gridInfoMap || {};
            for (const [id, info] of Object.entries(gridMap)) {
              if (id && id !== '0') {
                groups.push({
                  groupId: id,
                  name: info.name || `Nhóm ${id}`,
                  totalMember: info.totalMember || info.memVerList?.length || 0
                });
              }
            }
          } catch (e) {
            console.warn('Lỗi lấy nhóm từ Zalo API:', e.message);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, groups }));
        return;
      }

      // API tra cứu Link Box Zalo (zalo.me/g/...) hoặc ID để tự động lấy tên và ID nhóm
      if (req.method === 'POST' && url === '/api/admin/boxes/resolve-link') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const payload = await readJsonBody();
        const input = String(payload.link || payload.input || '').trim();
        if (!input) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Vui lòng nhập Link Box hoặc ID nhóm Zalo!' }));
          return;
        }

        if (!this.bot?.api) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Bot Zalo chưa kết nối, không thể tra cứu link!' }));
          return;
        }

        try {
          // 1. Nếu là Link Zalo (dạng https://zalo.me/g/... hoặc zalo.me/g/...)
          if (input.includes('zalo.me/g/') || (/^[a-zA-Z0-9_-]{5,}$/.test(input) && !/^\d+$/.test(input))) {
            let fullLink = input;
            if (!fullLink.startsWith('http')) {
              if (fullLink.startsWith('zalo.me/g/')) fullLink = `https://${fullLink}`;
              else if (!fullLink.includes('/')) fullLink = `https://zalo.me/g/${fullLink}`;
            }

            if (typeof this.bot.api.getGroupLinkInfo === 'function') {
              try {
                const linkInfo = await this.bot.api.getGroupLinkInfo({ link: fullLink });
                if (linkInfo && (linkInfo.groupId || linkInfo.grid)) {
                  const groupId = String(linkInfo.groupId || linkInfo.grid);
                  const name = linkInfo.name || linkInfo.groupName || `Box ${groupId}`;
                  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({
                    success: true,
                    groupId,
                    name,
                    totalMember: linkInfo.totalMember || linkInfo.currentMems?.length || 0
                  }));
                  return;
                }
              } catch (linkErr) {
                console.warn('Lỗi getGroupLinkInfo:', linkErr?.message || linkErr);
              }
            }
          }

          // 2. Nếu là ID số hoặc tra cứu theo getGroupInfo
          const cleanNum = input.replace(/\D/g, '');
          if (cleanNum && typeof this.bot.api.getGroupInfo === 'function') {
            try {
              const gInfoRes = await this.bot.api.getGroupInfo(cleanNum);
              const info = gInfoRes?.gridInfoMap?.[cleanNum] || (gInfoRes?.gridInfoMap ? Object.values(gInfoRes.gridInfoMap)[0] : null);
              if (info) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                  success: true,
                  groupId: cleanNum,
                  name: info.name || `Box ${cleanNum}`,
                  totalMember: info.totalMember || info.memVerList?.length || 0
                }));
                return;
              }
            } catch (gErr) {}
          }

          // 3. Tìm trong danh sách nhóm bot đã tham gia
          if (typeof this.bot.api.getAllGroups === 'function') {
            const all = await this.bot.api.getAllGroups();
            const gridMap = all?.gridInfoMap || {};
            for (const [id, grp] of Object.entries(gridMap)) {
              if (id === input || (grp.name && grp.name.toLowerCase().includes(input.toLowerCase()))) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                  success: true,
                  groupId: id,
                  name: grp.name || `Box ${id}`,
                  totalMember: grp.totalMember || 0
                }));
                return;
              }
            }
          }

          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Không thể tìm thấy thông tin nhóm từ link/ID vừa nhập!' }));
        } catch (err) {
          console.error('Lỗi khi resolve link Zalo:', err);
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Lỗi tra cứu link: ' + (err.message || 'Lỗi không xác định') }));
        }
        return;
      }

      // API gửi thông báo ngay tới 1 Box hoặc tất cả Box
      if (req.method === 'POST' && url === '/api/admin/boxes/notify') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        if (!this.bot?.api) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Bot Zalo chưa kết nối!' }));
          return;
        }

        const payload = await readJsonBody();
        const groupId = payload.groupId;
        try {
          if (groupId) {
            const result = await boxService.notifySingleBox(this.bot, groupId);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
          } else {
            await boxService.notifyAllBoxes(this.bot);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, message: 'Đã gửi thông báo tới tất cả các Box!' }));
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: err.message }));
        }
        return;
      }

      // ==========================================
      // 9. API KHỞI ĐỘNG LẠI BOT (RESTART)
      // ==========================================
      if (req.method === 'POST' && url === '/api/admin/restart') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        console.log('🔄 [DASHBOARD] Nhận yêu cầu khởi động lại Bot từ Bảng điều khiển Web...');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Bot đang khởi động lại...' }));

        setTimeout(() => {
          process.exit(0);
        }, 1000);
        return;
      }

      // ==========================================
      // 10. HEALTH CHECK
      // ==========================================
      if (req.method === 'GET' && url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          status: 'ok',
          service: 'Bot Free Fire Auto Payment & Dashboard',
          bank: PAYMENT_CONFIG.bankName,
          rate: `${PAYMENT_CONFIG.pricePerCredit}d / 1 credit`
        }));
        return;
      }

      // ==========================================
      // 11. WEBHOOK SEPAY NHẬN TIỀN TỰ ĐỘNG
      // ==========================================
      if (req.method === 'POST' && (url === '/webhook/sepay' || url === '/webhook' || url === '/api/sepay')) {
        const payload = await readJsonBody();
        try {
          console.log('🔔 [WEBHOOK SEPAY] Nhận dữ liệu giao dịch mới:', JSON.stringify(payload));

          const content = payload.transactionContent || payload.content || payload.description || '';
          const amount = Number(payload.transferAmount || payload.amount || 0);
          const transferType = payload.transferType || 'in';
          const txId = payload.id || payload.referenceCode || payload.transactionId || null;

          if (transferType === 'out') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Bỏ qua giao dịch tiền ra' }));
            return;
          }

          const resData = await this.processPaymentTransaction(content, amount, txId);
          if (!resData) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              message: 'Giao dịch không chứa cú pháp NAP <KEY> hoặc số tiền không hợp lệ'
            }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            key: resData.keyName,
            addedCredits: resData.creditsToAdd,
            totalCredits: resData.totalCredits,
            message: `Đã cộng ${resData.creditsToAdd} lượt cho key ${resData.keyName}`
          }));
        } catch (err) {
          console.error('❌ Lỗi xử lý webhook SePay:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // ==========================================
      // 12. TEST WEBHOOK NẠP LƯỢT
      // ==========================================
      if (req.method === 'POST' && url === '/webhook/test') {
        const data = await readJsonBody();
        try {
          const key = data.key || 'tenkey';
          const amount = Number(data.amount || 20000);
          const credits = Math.floor(amount / PAYMENT_CONFIG.pricePerCredit);
          const result = keyService.addCredits(key, credits, amount);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            message: `[TEST] Đã nạp ${amount}đ (+${credits} lượt) cho key "${key}"!`,
            data: result
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      // 404 cho các đường dẫn khác
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ [CẢNH BÁO] Cổng ${this.port} đang bị chiếm dụng bởi tiến trình khác. Thử lắng nghe cổng phụ ${this.port + 1}...`);
        this.port += 1;
        this.server.listen(this.port, '0.0.0.0');
      } else {
        console.error('❌ Lỗi WebhookServer:', err);
      }
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`🌐 [WEB DASHBOARD & WEBHOOK] Đang chạy tại: http://0.0.0.0:${this.port} (Cổng ${this.port})`);
      console.log(`🔑 [DASHBOARD] Mật khẩu truy cập: "${config.bot.dashboardPassword || 'admin123'}"`);
      this.startSepayPolling();
    });
  }

  /**
   * Xử lý giao dịch nạp tiền
   */
  async processPaymentTransaction(content, amount, txId = null) {
    if (txId) {
      if (this.processedTxIds.has(String(txId))) {
        console.log(`ℹ️ [THANH TOÁN] Giao dịch ID ${txId} đã được xử lý trước đó, bỏ qua.`);
        return null;
      }
      this.saveProcessedTxId(txId);
    }

    const parseResult = paymentService.parseTransferContent(content);
    if (!parseResult) {
      console.log(`ℹ️ [THANH TOÁN] Nội dung "${content}" không khớp cú pháp nạp lượt.`);
      return null;
    }

    const keyName = (typeof parseResult === 'string' ? parseResult : parseResult.keyName)?.toLowerCase();
    if (!keyName) {
      console.log(`ℹ️ [THANH TOÁN] Không bóc tách được tên key từ nội dung "${content}".`);
      return null;
    }

    const calcResult = paymentService.calculateCredits(amount);
    const creditsToAdd = calcResult?.credits ?? Math.floor(amount / (PAYMENT_CONFIG.pricePerCredit || 250));

    if (creditsToAdd <= 0) {
      console.warn(`⚠️ [THANH TOÁN] Số tiền ${amount}đ không đủ để nạp ít nhất 1 lượt (Giá: ${PAYMENT_CONFIG.pricePerCredit}đ/lượt).`);
      return null;
    }

    console.log(`💰 [NẠP TIỀN TỰ ĐỘNG] Tìm thấy giao dịch: +${amount.toLocaleString()}đ -> Cộng ${creditsToAdd} lượt cho key [${keyName.toUpperCase()}]`);

    const result = keyService.addCredits(keyName, creditsToAdd, amount);

    if (this.bot && this.bot.api) {
      const notifyMsg = paymentService.formatPaymentSuccessMessage(
        keyName,
        amount,
        creditsToAdd,
        result.totalCredits
      );

      let targetThreadId = null;
      let targetThreadType = 0; // 0 = ThreadType.User

      const activity = this.lastActiveThreads.get(keyName.toLowerCase());
      if (activity) {
        targetThreadId = activity.threadId;
        targetThreadType = activity.threadType;
      } else {
        const keyData = keyService.getKey(keyName);
        if (keyData && keyData.ownerZaloId) {
          targetThreadId = keyData.ownerZaloId;
          targetThreadType = 0; // ThreadType.User
        }
      }

      // Nếu không tìm thấy nhóm hoạt động, gửi thông báo trực tiếp cho Admin
      if (!targetThreadId && config.bot.adminWhitelist && config.bot.adminWhitelist.length > 0) {
        targetThreadId = config.bot.adminWhitelist[0];
        targetThreadType = 0;
        console.log(`ℹ️ [THÔNG BÁO ZALO] Key "${keyName}" chưa có nhóm hoạt động, chuyển thông báo về Zalo Admin (${targetThreadId})`);
      }

      if (targetThreadId) {
        try {
          await this.bot.api.sendMessage(
            { msg: notifyMsg },
            targetThreadId,
            targetThreadType
          );
          console.log(`📩 [THÔNG BÁO ZALO] Đã gửi thông báo nạp thành công vào Zalo (${targetThreadId})`);
        } catch (zErr) {
          console.warn('⚠️ Lỗi gửi thông báo nạp tiền qua Zalo:', zErr.message);
        }
      } else {
        console.warn(`⚠️ [THÔNG BÁO ZALO] Chưa xác định được threadId Zalo cho key "${keyName}".`);
      }
    }

    return { keyName, creditsToAdd, totalCredits: result.totalCredits };
  }

  /**
   * Tự động quét giao dịch SePay trực tiếp qua API
   */
  startSepayPolling() {
    const apiKey = process.env.SEPAY_API_KEY;
    if (!apiKey) {
      return;
    }

    console.log('🔄 [SEPAY POLLING] Đã kích hoạt chế độ tự động quét giao dịch SePay mỗi 15 giây...');

    const checkTransactions = async () => {
      try {
        const token = apiKey.trim();
        const authHeader = token.startsWith('Bearer ') || token.startsWith('Apikey ')
          ? token
          : (token.length > 30 ? `Bearer ${token}` : `Apikey ${token}`);

        const resp = await axios.get('https://my.sepay.vn/userapi/transactions/list', {
          headers: {
            Authorization: authHeader
          },
          timeout: 10000
        });

        const txList = resp.data?.transactions || [];
        for (const tx of txList) {
          const content = tx.transaction_content || tx.description || '';
          const amount = parseFloat(tx.amount_in || tx.amount || 0);
          const txId = tx.id;
          if (amount > 0 && content) {
            await this.processPaymentTransaction(content, amount, txId);
          }
        }
      } catch (err) {
        console.warn('⚠️ [SEPAY POLLING] Lỗi khi quét giao dịch SePay:', err.response?.data?.message || err.message);
      }
    };

    checkTransactions();
    this.pollingInterval = setInterval(checkTransactions, 15000);
  }
}

export const webhookServer = new WebhookServer();
