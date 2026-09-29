import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KEYS_FILE = path.resolve(__dirname, '../../data/keys.json');

console.log('🔍 [KHÔI PHỤC KEY] Đang bắt đầu quét lịch sử để tìm lại tất cả Key và số lượt...');

// 1. Đọc keys.json hiện tại (nếu có)
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

// Duyệt qua tất cả các file log tìm được
for (const p of logPaths) {
  if (!fs.existsSync(p)) continue;

  try {
    const content = fs.readFileSync(p, 'utf8');

    // Nếu nội dung chính là 1 file JSON keys hợp lệ
    try {
      if (content.includes('"credits"') && content.includes('"ownerZaloId"')) {
        const parsed = JSON.parse(content);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [k, v] of Object.entries(parsed)) {
            if (v && v.key && typeof v.credits === 'number') {
              recovered[k.toLowerCase()] = { ...v };
              foundCount++;
              console.log(`✨ Khôi phục trực tiếp từ file backup: Key [${k.toUpperCase()}] (${v.credits} lượt, chủ: ${v.ownerName || v.ownerZaloId})`);
            }
          }
        }
      }
    } catch (e) {}

    const lines = content.split('\n');
    let lastSenderId = '';
    let lastSenderName = '';

    for (const line of lines) {
      // Bắt sender: 📩 [Tên] (UID) tại ...
      const senderMatch = line.match(/📩\s*\[(.*?)\]\s*\((\d+)\)/);
      if (senderMatch) {
        lastSenderName = senderMatch[1].trim();
        lastSenderId = senderMatch[2].trim();
      }

      // Bắt lệnh tạo key: Nhận lệnh [key] với tham số: [ 'tao', 'xxx' ]
      const createMatch = line.match(/Nhận lệnh \[key\] với tham số:\s*\[\s*'(?:tao|create)',\s*'([^']+)'/i) ||
                          line.match(/Đã tạo key \[([^\]]+)\] thành công/i);
      if (createMatch) {
        const kName = createMatch[1].toLowerCase().trim();
        if (!recovered[kName]) {
          recovered[kName] = {
            key: kName,
            ownerZaloId: lastSenderId || null,
            ownerName: lastSenderName || 'Thành viên',
            credits: 5,
            template: 'bxhconan',
            totalCharged: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            customTitle: 'CUSTOM PQ',
            logoPath: null
          };
          foundCount++;
          console.log(`➕ Tìm thấy Key đã tạo: [${kName.toUpperCase()}] - Chủ: ${lastSenderName} (${lastSenderId})`);
        }
      }

      // Bắt số lượt còn lại khi tính điểm: Key [XXX]: -1 lượt (Còn lại: YY lượt)
      const creditMatch = line.match(/Key \[([^\]]+)\]:\s*-1\s*lượt\s*\(Còn lại:\s*(\d+)\s*lượt\)/i) ||
                          line.match(/Key\s*\[([^\]]+)\]\s*còn\s*lại\s*(\d+)\s*lượt/i) ||
                          line.match(/Số dư mới:\s*(\d+)\s*lượt.*key\s*\[([^\]]+)\]/i);
      if (creditMatch) {
        let kName = '';
        let credits = 0;
        if (/Số dư mới/i.test(creditMatch[0])) {
          credits = parseInt(creditMatch[1], 10);
          kName = creditMatch[2].toLowerCase().trim();
        } else {
          kName = creditMatch[1].toLowerCase().trim();
          credits = parseInt(creditMatch[2], 10);
        }

        if (recovered[kName]) {
          recovered[kName].credits = credits;
          recovered[kName].updatedAt = new Date().toISOString();
        } else {
          recovered[kName] = {
            key: kName,
            ownerZaloId: lastSenderId || null,
            ownerName: lastSenderName || 'Thành viên',
            credits: credits,
            template: 'bxhconan',
            totalCharged: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            customTitle: 'CUSTOM PQ',
            logoPath: null
          };
          foundCount++;
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
  console.log(`\n🎉 [HOÀN TẤT] Đã khôi phục tổng cộng ${Object.keys(recovered).length} Key vào data/keys.json!`);
  console.log('Danh sách Key hiện tại:', Object.keys(recovered).join(', '));
} catch (e) {
  console.error('Lỗi khi ghi keys.json:', e.message);
}
