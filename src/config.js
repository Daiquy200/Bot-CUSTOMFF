import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
      .filter(Boolean)
  }
};

export function validateConfig() {
  if (!config.garena.cookie) {
    console.warn('⚠️ [CẢNH BÁO] Chưa cấu hình GARENA_COOKIE trong file .env');
    return false;
  }
  return true;
}
