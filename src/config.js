import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

export const config = {
  garena: {
    baseUrl: 'https://congdong.ff.garena.vn/league-score-api',
    cookie: process.env.GARENA_COOKIE || '',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    referer: 'https://congdong.ff.garena.vn/tinh-diem',
    origin: 'https://congdong.ff.garena.vn'
  },
  bot: {
    prefix: process.env.BOT_PREFIX || '!',
    sessionPath: path.resolve(__dirname, '../', process.env.ZALO_SESSION_PATH || './zalo_session.json'),
    adminOnly: process.env.ADMIN_ONLY_COMMANDS !== 'false',
    adminWhitelist: (process.env.ADMIN_WHITELIST || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean),
    dashboardPassword: process.env.DASHBOARD_PASSWORD || 'admin123',
    proxy: process.env.ZALO_PROXY || ''
  }
};

export function updateEnvFile(key, value) {
  try {
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const safeVal = JSON.stringify(value);
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${safeVal}`);
    } else {
      content = (content.trim() ? content.trim() + '\n' : '') + `${key}=${safeVal}\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
    process.env[key] = value;
    if (key === 'GARENA_COOKIE') config.garena.cookie = value;
    if (key === 'DASHBOARD_PASSWORD') config.bot.dashboardPassword = value;
    return true;
  } catch (err) {
    console.error('❌ Lỗi khi cập nhật file .env:', err);
    return false;
  }
}

export function validateConfig() {
  if (!config.garena.cookie) {
    console.warn('⚠️ [CẢNH BÁO] Chưa cấu hình GARENA_COOKIE trong file .env');
    return false;
  }
  return true;
}

