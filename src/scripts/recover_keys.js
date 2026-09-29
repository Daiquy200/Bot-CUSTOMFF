import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KEYS_FILE = path.resolve(__dirname, '../../data/keys.json');

console.log('🔍 [KHÔI PHỤC KEY & CHỦ SỞ HỮU] Đang quét toàn bộ file log để trích xuất tên chính xác và số lượt...');

// 1. Đọc keys.json hiện tại
let existingKeys = {};
try {
  if (fs.existsSync(KEYS_FILE)) {
    existingKeys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  }
} catch (e) {
  existingKeys = {};
}

// 2. Tìm tất cả các file log PM2 và file rác của Git
const logPaths = [
  '/root/.pm2/logs/bot-ff-out.log',
  '/root/.pm2/logs/bot-ff-out-0.log',
  '/root/.pm2/logs/bot-ff-out-1.log',
  '/root/.pm2/logs/bot-ff-out.log.1',
  '/root/.pm2/logs/bot-ff-out.log.2',
  path.resolve(__dirname, '../../output.log'),
  path.resolve(__dirname, '../../bot.log')
];

// Quét thêm thư mục .git/lost-found nếu git có lưu blob
const lostFoundDir = path.resolve(__dirname, '../../.git/lost-found/other');
if (fs.existsSync(lostFoundDir)) {
  try {
    const files = fs.readdirSync(lostFoundDir);
    for (const f of files) {
      logPaths.push(path.join(lostFoundDir, f));
    }
  } catch (e) {}
}

const recovered = { ...existingKeys };
let foundCount = 0;

for (const p of logPaths) {
  if (!fs.existsSync(p)) continue;

  try {
    const content = fs.readFileSync(p, 'utf8');

    // Nếu là file JSON hoàn chỉnh từng lưu trước đó
    try {
      if (content.includes('"credits"') && content.includes('"ownerZaloId"')) {
        const parsed = JSON.parse(content);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [k, v] of Object.entries(parsed)) {
            if (v && v.key && typeof v.credits === 'number') {
              const kClean = k.toLowerCase().trim();
              recovered[kClean] = {
                ...recovered[kClean],
                ...v,
                key: kClean
              };
              foundCount++;
              console.log(`✨ Khôi phục từ snapshot JSON: Key [${kClean.toUpperCase()}] - Chủ: ${v.ownerName} (${v.credits} lượt)`);
            }
          }
        }
      }
    } catch (e) {}

    const lines = content.split('\n');
    let lastSenderId = '';
    let lastSenderName = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Bắt người gửi từ: 📩 [TIN NHẮN] Từ [Tên] (UID) tại ...
      const msgFromMatch = line.match(/📩\s*\[TIN NHẮN\]\s*Từ\s*\[(.*?)\]\s*\((\d+)\)/i);
      if (msgFromMatch) {
        lastSenderName = msgFromMatch[1].trim();
        lastSenderId = msgFromMatch[2].trim();
      }

      // Bắt người gửi từ: 📩 [Tên] Nhận lệnh ...
      const cmdSenderMatch = line.match(/📩\s*\[(.*?)\]\s*Nhận lệnh/i);
      if (cmdSenderMatch) {
        lastSenderName = cmdSenderMatch[1].trim();
      }

      // Bắt lệnh tạo key: 📩 [Tên] Nhận lệnh [key] với tham số: [ 'tao', 'tenkey' ]
      const createFullMatch = line.match(/📩\s*\[(.*?)\]\s*Nhận lệnh \[key\] với tham số:\s*\[\s*'(?:tao|create)',\s*'([^']+)'/i);
      const createSimpleMatch = line.match(/Nhận lệnh \[key\] với tham số:\s*\[\s*'(?:tao|create)',\s*'([^']+)'/i);
      const createSuccessMatch = line.match(/Đã tạo key \[([^\]]+)\] thành công/i);

      let keyToCreate = null;
      let ownerToSet = lastSenderName;

      if (createFullMatch) {
        ownerToSet = createFullMatch[1].trim();
        keyToCreate = createFullMatch[2].toLowerCase().trim();
      } else if (createSimpleMatch) {
        keyToCreate = createSimpleMatch[1].toLowerCase().trim();
      } else if (createSuccessMatch) {
        keyToCreate = createSuccessMatch[1].toLowerCase().trim();
      }

      if (keyToCreate) {
        if (!recovered[keyToCreate]) {
          recovered[keyToCreate] = {
            key: keyToCreate,
            ownerZaloId: lastSenderId || null,
            ownerName: (ownerToSet && ownerToSet !== 'Thành viên') ? ownerToSet : 'Thành viên',
            credits: 5,
            template: 'bxhconan',
            totalCharged: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            customTitle: 'CUSTOM PQ',
            logoPath: null
          };
          foundCount++;
          console.log(`➕ Tìm thấy Key: [${keyToCreate.toUpperCase()}] - Chủ: ${recovered[keyToCreate].ownerName}`);
        } else {
          // Cập nhật tên thật nếu trước đó đang để "Thành viên"
          if (ownerToSet && ownerToSet !== 'Thành viên' && (!recovered[keyToCreate].ownerName || recovered[keyToCreate].ownerName === 'Thành viên')) {
            recovered[keyToCreate].ownerName = ownerToSet;
            if (lastSenderId) recovered[keyToCreate].ownerZaloId = lastSenderId;
            console.log(`👤 Cập nhật tên chủ sở hữu cho Key [${keyToCreate.toUpperCase()}]: ${ownerToSet}`);
          }
        }
      }

      // Bắt lệnh tính điểm .td dùng key để suy ra người sở hữu nếu chưa có tên
      const tdMatch = line.match(/📩\s*\[(.*?)\]\s*Nhận lệnh \[td\] với tham số:.*'([^']+)'/i);
      if (tdMatch) {
        const callerName = tdMatch[1].trim();
        const calledKey = tdMatch[2].toLowerCase().trim();
        if (recovered[calledKey] && (!recovered[calledKey].ownerName || recovered[calledKey].ownerName === 'Thành viên')) {
          if (callerName && callerName !== 'Thành viên') {
            recovered[calledKey].ownerName = callerName;
            console.log(`👤 Nhận diện chủ Key [${calledKey.toUpperCase()}] từ người gọi .td: ${callerName}`);
          }
        }
      }

      // Bắt số lượt còn lại khi tính điểm: Key [XXX]: -1 lượt (Còn lại: YY lượt)
      const creditMatch = line.match(/Key \[([^\]]+)\]:\s*-1\s*lượt\s*\(Còn lại:\s*(\d+)\s*lượt\)/i) ||
                          line.match(/Key\s*\[([^\]]+)\]\s*còn\s*lại\s*(\d+)\s*lượt/i) ||
                          line.match(/Số dư mới:\s*(\d+)\s*lượt.*key\s*\[([^\]]+)\]/i) ||
                          line.match(/Bạn còn lại:\s*(\d+)\s*lượt/i);
      if (creditMatch) {
        let kName = '';
        let credits = 0;
        if (/Số dư mới/i.test(creditMatch[0])) {
          credits = parseInt(creditMatch[1], 10);
          kName = creditMatch[2].toLowerCase().trim();
        } else if (/Bạn còn lại/i.test(creditMatch[0])) {
          credits = parseInt(creditMatch[1], 10);
        } else {
          kName = creditMatch[1].toLowerCase().trim();
          credits = parseInt(creditMatch[2], 10);
        }

        if (kName && recovered[kName]) {
          recovered[kName].credits = credits;
          recovered[kName].updatedAt = new Date().toISOString();
        }
      }

      // Bắt nạp tiền tự động: Cộng X lượt cho key [YYY]
      const napMatch = line.match(/Cộng (\d+) lượt cho key \[([^\]]+)\]/i);
      if (napMatch) {
        const addCount = parseInt(napMatch[1], 10);
        const kName = napMatch[2].toLowerCase().trim();
        if (recovered[kName]) {
          recovered[kName].totalCharged = (recovered[kName].totalCharged || 0) + (addCount * 250);
        }
      }
    }
  } catch (err) {
    console.warn(`Lỗi đọc ${p}:`, err.message);
  }
}

// Lưu lại vào data/keys.json
try {
  const dataDir = path.dirname(KEYS_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(KEYS_FILE, JSON.stringify(recovered, null, 2), 'utf8');
  console.log(`\n🎉 [HOÀN TẤT] Đã cập nhật ${Object.keys(recovered).length} Key vào data/keys.json!`);
} catch (e) {
  console.error('Lỗi khi ghi keys.json:', e.message);
}
