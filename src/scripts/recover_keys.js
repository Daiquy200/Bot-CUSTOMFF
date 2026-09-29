import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KEYS_FILE = path.resolve(__dirname, '../../data/keys.json');

console.log('🔍 [KHÔI PHỤC KEY & SỐ LƯỢT CHUẨN XÁC] Đang quét toàn bộ file log để trích xuất tên chính xác và tính toán số lượt thực tế...');

// 1. Đọc keys.json hiện tại (bảo lưu key mẫu ldq, ldp)
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
const tdUsageCounts = {}; // Đếm số lần mỗi key đã dùng .td để tính điểm

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

      // 1. Bắt người gửi từ tin nhắn thường: 📩 [TIN NHẮN] Từ [Tên] (UID) tại ...
      const msgFromMatch = line.match(/📩\s*\[TIN NHẮN\]\s*Từ\s*\[(.*?)\]\s*\((\d+)\)/i);
      if (msgFromMatch) {
        lastSenderName = msgFromMatch[1].trim();
        lastSenderId = msgFromMatch[2].trim();
      }

      // 2. Bắt lệnh tạo key: 📩 [Tên Thật] Nhận lệnh [key] với tham số: [ 'tao', 'tenkey' ]
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
            credits: 5, // Mặc định tặng 5 lượt
            template: 'bxhconan',
            totalCharged: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            customTitle: 'CUSTOM PQ',
            logoPath: null
          };
          console.log(`➕ Tìm thấy Key: [${keyToCreate.toUpperCase()}] - Chủ: ${recovered[keyToCreate].ownerName}`);
        } else {
          // Cập nhật lại tên thật nếu trước đó đang để "Thành viên"
          if (ownerToSet && ownerToSet !== 'Thành viên' && (!recovered[keyToCreate].ownerName || recovered[keyToCreate].ownerName === 'Thành viên')) {
            recovered[keyToCreate].ownerName = ownerToSet;
            if (lastSenderId) recovered[keyToCreate].ownerZaloId = lastSenderId;
            console.log(`👤 Cập nhật tên chủ sở hữu cho Key [${keyToCreate.toUpperCase()}]: ${ownerToSet}`);
          }
        }
      }

      // 3. Bắt lệnh tính điểm .td: 📩 [Tên] Nhận lệnh [td] với tham số: [ 'uid', 'ca', 'tenkey' ]
      const tdMatch = line.match(/📩\s*\[(.*?)\]\s*Nhận lệnh \[(?:td|tinhdiem)\] với tham số:\s*\[(.*?)\]/i);
      if (tdMatch) {
        const callerName = tdMatch[1].trim();
        const argsStr = tdMatch[2].toLowerCase();

        // Tìm xem có tên key nào trong tham số gọi .td không
        let foundKeyInTd = null;
        for (const k of Object.keys(recovered)) {
          if (k === 'ldq' || k === 'ldp') continue; // Không trừ key admin mẫu
          if (argsStr.includes(`'${k}'`) || argsStr.includes(`"${k}"`)) {
            foundKeyInTd = k;
            break;
          }
        }

        // Nếu không truyền tên key nhưng người gọi có tên trùng với chủ sở hữu key
        if (!foundKeyInTd) {
          for (const [k, v] of Object.entries(recovered)) {
            if (k === 'ldq' || k === 'ldp') continue;
            if (v.ownerName && v.ownerName !== 'Thành viên' && v.ownerName === callerName) {
              foundKeyInTd = k;
              break;
            }
          }
        }

        if (foundKeyInTd) {
          tdUsageCounts[foundKeyInTd] = (tdUsageCounts[foundKeyInTd] || 0) + 1;
          // Nếu key chưa có tên chủ mà người này gọi .td thì gán tên luôn
          if (recovered[foundKeyInTd] && (!recovered[foundKeyInTd].ownerName || recovered[foundKeyInTd].ownerName === 'Thành viên')) {
            if (callerName && callerName !== 'Thành viên') {
              recovered[foundKeyInTd].ownerName = callerName;
              console.log(`👤 Nhận diện chủ Key [${foundKeyInTd.toUpperCase()}] từ lệnh .td: ${callerName}`);
            }
          }
        }
      }

      // 4. Bắt thông báo HẾT LƯỢT dùng: Key "xxx" đã HẾT LƯỢT dùng
      const outOfCreditsMatch = line.match(/(?:Key|key)\s*["'\[]([^"'\]]+)["'\]]\s*đã\s*HẾT\s*LƯỢT/i) ||
                               line.match(/không đủ lượt.*key\s*["'\[]([^"'\]]+)["'\]]/i);
      if (outOfCreditsMatch) {
        const outKey = outOfCreditsMatch[1].toLowerCase().trim();
        if (recovered[outKey]) {
          recovered[outKey].credits = 0;
          console.log(`⚠️ Key [${outKey.toUpperCase()}] đã dùng hết toàn bộ lượt -> Đặt về 0 lượt`);
        }
      }

      // 5. Bắt nạp tiền tự động: Cộng X lượt cho key [YYY]
      const napMatch = line.match(/Cộng (\d+) lượt cho key \[([^\]]+)\]/i);
      if (napMatch) {
        const addCount = parseInt(napMatch[1], 10);
        const kName = napMatch[2].toLowerCase().trim();
        if (recovered[kName]) {
          recovered[kName].credits = (recovered[kName].credits || 5) + addCount;
          recovered[kName].totalCharged = (recovered[kName].totalCharged || 0) + (addCount * 250);
          console.log(`💰 Key [${kName.toUpperCase()}] được nạp +${addCount} lượt`);
        }
      }
    }
  } catch (err) {
    console.warn(`Lỗi đọc ${p}:`, err.message);
  }
}

// 6. Trừ số lượt tương ứng với số lần từng key đã gọi .td
for (const [kName, useCount] of Object.entries(tdUsageCounts)) {
  if (recovered[kName] && kName !== 'ldq' && kName !== 'ldp') {
    const originalCredits = recovered[kName].credits !== undefined ? recovered[kName].credits : 5;
    const remaining = Math.max(0, originalCredits - useCount);
    recovered[kName].credits = remaining;
    console.log(`📉 Key [${kName.toUpperCase()}]: Đã dùng ${useCount} lần tính điểm -> Còn lại: ${remaining} lượt.`);
  }
}

// Lưu lại vào data/keys.json
try {
  const dataDir = path.dirname(KEYS_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(KEYS_FILE, JSON.stringify(recovered, null, 2), 'utf8');
  console.log(`\n🎉 [HOÀN TẤT] Đã cập nhật ${Object.keys(recovered).length} Key và số lượt chính xác vào data/keys.json!`);
} catch (e) {
  console.error('Lỗi khi ghi keys.json:', e.message);
}
