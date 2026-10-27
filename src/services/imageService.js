import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đăng ký font hệ thống phong phú để hiển thị đầy đủ ký tự đặc biệt, cánh bướm, icon game, emoji của Free Fire
const SYSTEM_FONTS = [
  'C:/Windows/Fonts/seguisym.ttf',    // Segoe UI Symbol (ký tự biểu tượng, hình vẽ đặc biệt)
  'C:/Windows/Fonts/seguiemj.ttf',    // Segoe UI Emoji (emoji màu, vương miện, tia sét, hoa...)
  'C:/Windows/Fonts/seguihis.ttf',    // Segoe UI Historic (cánh chim Ai Cập 𓆩 𓆪, chữ cổ, runes)
  'C:/Windows/Fonts/javatext.ttf',    // Javanese Text (hoa văn cánh đại bàng ꧁ ꧂)
  'C:/Windows/Fonts/himalaya.ttf',    // Microsoft Himalaya (cánh chim Tây Tạng ༺ ༻, ấn ༗)
  'C:/Windows/Fonts/msyh.ttc',        // Microsoft YaHei (chữ Hán/CJK 亗, 彡, 丶...)
  'C:/Windows/Fonts/msjh.ttc',        // Microsoft JhengHei (chữ Hán phồn thể)
  'C:/Windows/Fonts/simsun.ttc',      // SimSun (khung ngoặc châu Á 『 』 【 】)
  'C:/Windows/Fonts/mingliu.ttc',     // MingLiU
  'C:/Windows/Fonts/malgun.ttf',      // Malgun Gothic (tiếng Hàn, Hangul Filler khoảng trống ẩn ㅤ, khung...)
  'C:/Windows/Fonts/msgothic.ttc',    // MS Gothic (Katakana Nhật Bản ヅ, ツ, ッ, 〆...)
  'C:/Windows/Fonts/cambria.ttc',     // Cambria Math (font chữ nghệ thuật Fraktur 𝕶 𝕴 𝕹 𝕲, Script 𝓝 𝓐 𝓜 𝓔...)
  'C:/Windows/Fonts/leelawad.ttf',    // Leelawadee UI (ký tự Thái Lan và Đông Nam Á ๛)
  'C:/Windows/Fonts/Nirmala.ttc',     // Nirmala UI (chữ Phạn / Ấn Độ ॐ, Bengali, Tamil, Telugu)
  'C:/Windows/Fonts/tahoma.ttf',      // Tahoma (Ả Rập ت, Latin)
  'C:/Windows/Fonts/gadugi.ttf',      // Gadugi
  'C:/Windows/Fonts/ebrima.ttf',      // Ebrima
  'C:/Windows/Fonts/sylfaen.ttf',     // Sylfaen
  'C:/Windows/Fonts/monbaiti.ttf',    // Mongolian Baiti
  'C:/Windows/Fonts/taile.ttf',       // Tai Le
  'C:/Windows/Fonts/ntailu.ttf',      // New Tai Lue
  'C:/Windows/Fonts/phagspa.ttf',     // Phags-pa
  'C:/Windows/Fonts/symbol.ttf',      // Symbol
  'C:/Windows/Fonts/arial.ttf',       // Arial
  'C:/Windows/Fonts/segoeui.ttf',     // Segoe UI
  'C:/Windows/Fonts/segoeuib.ttf'     // Segoe UI Bold
];

for (const fontPath of SYSTEM_FONTS) {
  try {
    if (fs.existsSync(fontPath)) {
      GlobalFonts.registerFromPath(fontPath);
    }
  } catch (e) {
    // Bỏ qua nếu font không tồn tại
  }
}

// Đăng ký font từ thư mục assets/fonts nội bộ (luôn sẵn có kể cả khi di chuyển bot sang máy khác/VPS)
const fontsDir = path.resolve(__dirname, '../../assets/fonts');
if (fs.existsSync(fontsDir)) {
  try {
    const fontFiles = fs.readdirSync(fontsDir);
    for (const f of fontFiles) {
      const fullPath = path.join(fontsDir, f);
      try {
        if (/Prompt/i.test(f)) {
          GlobalFonts.registerFromPath(fullPath, 'Prompt');
        } else if (f.endsWith('.ttf') || f.endsWith('.otf') || f.endsWith('.ttc')) {
          GlobalFonts.registerFromPath(fullPath);
        }
      } catch (err) {}
    }
  } catch (e) {}
}

/**
 * Chuỗi font fallback toàn diện để không bao giờ bị lỗi ô vuông tofu [] khi gặp ký tự đặc biệt Free Fire
 */
export const FONT_FALLBACK_CHAIN = '"Prompt", "Segoe UI Emoji", "Segoe UI Symbol", "Segoe UI Historic", "Segoe UI", "Microsoft YaHei", "Microsoft JhengHei", "Javanese Text", "Microsoft Himalaya", "Cambria", "Leelawadee UI", "Nirmala UI", "Malgun Gothic", "MS Gothic", "SimSun", "Tahoma", "Gadugi", "Ebrima", "Sylfaen", Arial, sans-serif';

/**
 * Chuẩn hóa các ký tự đặc biệt, emoji, Apple logo (U+F8FF), loại bỏ control characters ẩn gây lỗi ô vuông
 */
export function normalizeSpecialText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    // Thay thế ký tự quả táo Apple PUA U+F8FF (vốn chỉ có trên iOS/macOS) thành quả táo 🍎 để hiển thị đẹp mắt không bị ô vuông
    .replace(/[\uF8FF]/g, '🍎')
    // Loại bỏ các ký tự điều khiển ẩn bidi / zero-width vô hình gây lỗi render ô vuông
    .replace(/[\u200B\u200C\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2060]/g, '');
}

/**
 * Helper tạo chuỗi ctx.font với font chỉ định và chuỗi fallback an toàn
 */
export function getFontWithFallback(size = 40, weight = 'bold', primaryFont = 'Prompt') {
  const cleanWeight = weight && weight.trim() ? `${weight.trim()} ` : '';
  if (!primaryFont || primaryFont === 'Prompt') {
    return `${cleanWeight}${size}px ${FONT_FALLBACK_CHAIN}`;
  }
  return `${cleanWeight}${size}px "${primaryFont}", ${FONT_FALLBACK_CHAIN}`;
}

/**
 * =========================================================================
 * BẢNG CẤU HÌNH TỌA ĐỘ VÀ GIAO DIỆN TỪNG MẪU BẢNG XẾP HẠNG
 * =========================================================================
 * 👉 bxhconan: Mẫu BXH Conan & Kaito Kid Esports (ngang 2048x1152)
 * 👉 bxhkelly: Mẫu BXH Kelly Vàng Đen - Overall Standing (dọc 1674x2048)
 */
export const TEMPLATE_CONFIGS = {
  // MẪU 2: KELLY VÀNG ĐEN - OVERALL STANDING (Dọc 1674x2048)
  bxhkelly: {
    id: 'bxhkelly',
    name: 'Mẫu BXH Kelly Vàng Đen (Overall Standing)',
    file: 'bxhkelly.png',
    type: 'custom_coords',
    width: 1674,
    height: 2048,
    limit: 12,
    header: {
      customName: { x: 393, y: 2010, color: '#FFFFFF', size: 38, font: 'Prompt', bold: true, align: 'left', maxWidth: 1100 },
      customName2: { x: 31700.2, y: 730.4, color: '#FFFFFF', size: 60, font: 'Prompt', bold: true, align: 'left' },
      customTime: { x: 510, y: 1960, color: '#FFFFFF', size: 36, font: 'Prompt', bold: true, align: 'left' },
      logos: [
        { top: '1', x: 250, y: 882, w: 60, h: 60 },
        { top: '2', x: 250, y: 962, w: 60, h: 60 },
        { top: '3', x: 250, y: 1038, w: 60, h: 60 },
        { top: '4', x: 250, y: 1120, w: 60, h: 60 },
        { top: '5', x: 250, y: 1200, w: 60, h: 60 },
        { top: '6', x: 250, y: 1280, w: 60, h: 60 },
        { top: '7', x: 250, y: 1360, w: 60, h: 60 },
        { top: '8', x: 250, y: 1440, w: 60, h: 60 },
        { top: '9', x: 250, y: 1520, w: 60, h: 60 },
        { top: '10', x: 250, y: 1602, w: 60, h: 60 },
        { top: '11', x: 250, y: 1682, w: 60, h: 60 },
        { top: '12', x: 250, y: 1758, w: 60, h: 60 }
      ]
    },
    BooyahGames: {
      Game1: { x: 250001, y: 3330, size: 75, color: '#FFFFFF', font: 'Arial', align: 'left' },
      Game2: { x: 120006, y: 3330, size: 75, color: '#FFFFFF', font: 'Arial', align: 'left' },
      Game3: { x: 2220003, y: 3330, size: 75, color: '#FFFFFF', font: 'Arial', align: 'left' },
      Game4: { x: 3193000, y: 3330, size: 75, color: '#FFFFFF', font: 'Arial', align: 'left' },
      Game5: { x: 10000, y: 680, size: 22, color: '#FFD700', font: 'Arial', align: 'left' },
      Game6: { x: 10000, y: 680, size: 22, color: '#FFD700', font: 'Arial', align: 'left' },
      LogosBooyah: [
        { game: 1, x: 457000, y: 966, w: 90, h: 90 },
        { game: 2, x: 457000, y: 1247, w: 90, h: 90 },
        { game: 3, x: 457000, y: 1540, w: 90, h: 90 },
        { game: 4, x: 457000, y: 1838, w: 90, h: 90 },
        { game: 5, x: 50000, y: 680, w: 40, h: 40 },
        { game: 6, x: 50000, y: 680, w: 40, h: 40 }
      ]
    },
    Top1: {
      Top: { x: 116100, y: 1615, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 920, lineHeight: 50, color: '#000000', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 920, lineHeight: 50, color: '#000000', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 920, lineHeight: 50, color: '#000000', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 920, lineHeight: 50, color: '#000000', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top2: {
      Top: { x: 10000, y: 921.8, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1002, lineHeight: 50, color: '#000000', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1002, lineHeight: 50, color: '#000000', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1002, lineHeight: 50, color: '#000000', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1002, lineHeight: 50, color: '#000000', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top3: {
      Top: { x: 10000, y: 1052.4, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1085, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1085, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1085, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1085, lineHeight: 50, color: '#F6D919', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top4: {
      Top: { x: 10000, y: 1183, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1164, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1164, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1164, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1164, lineHeight: 50, color: '#F6D919', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top5: {
      Top: { x: 10000, y: 1313.6, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1242, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1242, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1242, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1242, lineHeight: 50, color: '#F6D919', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top6: {
      Top: { x: 10000, y: 1441.2, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1325, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1325, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1325, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1325, lineHeight: 50, color: '#F6D919', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top7: {
      Top: { x: 10000, y: 1567.7, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1406, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1406, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1406, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1406, lineHeight: 50, color: '#F6D919', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top8: {
      Top: { x: 10000, y: 1702.3, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1482, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1482, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1482, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1482, lineHeight: 50, color: '#F6D919', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top9: {
      Top: { x: 10000, y: 1829.9, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1563, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1563, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1563, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1563, lineHeight: 50, color: '#F6D919', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top10: {
      Top: { x: 10000, y: 1965.5, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1642, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1642, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1642, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1642, lineHeight: 50, color: '#F6D919', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top11: {
      Top: { x: 10000, y: 2096.1, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1720, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1720, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1720, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1720, lineHeight: 50, color: '#F6D919', size: 40, font: 'Prompt', bold: false, align: 'center' }
    },
    Top12: {
      Top: { x: 10000, y: 2221.5, lineHeight: 50, color: '#FFD700', size: 32, font: 'Prompt', bold: true, align: 'left' },
      Name: { x: 340, y: 1801, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'left', maxWidth: 480 },
      Kill: { x: 875, y: 1801, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Booyah: { x: 1024, y: 1801, lineHeight: 50, color: '#FFFFFF', size: 40, font: 'Prompt', bold: false, align: 'center' },
      Score: { x: 1188, y: 1801, lineHeight: 50, color: '#F6D919', size: 40, font: 'Prompt', bold: false, align: 'center' }
    }
  }
};

class ImageService {
  constructor() {
    this.templatesDir = path.resolve(__dirname, '../../assets/templates');
    this.outputDir = path.resolve(__dirname, '../../assets/output');
    this.customConfigFile = path.join(this.templatesDir, 'templates_config.json');
    this.defaultTemplate = 'mau_42';
    this.configs = { ...TEMPLATE_CONFIGS };

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.cleanOutputDir();
    this.loadCustomConfigs();
  }

  /**
   * Tự động dọn dẹp sạch toàn bộ ảnh tạm trong assets/output/
   */
  cleanOutputDir() {
    try {
      if (fs.existsSync(this.outputDir)) {
        const files = fs.readdirSync(this.outputDir);
        for (const f of files) {
          const p = path.join(this.outputDir, f);
          try {
            if (fs.statSync(p).isFile()) {
              fs.unlinkSync(p);
            }
          } catch (e) {}
        }
        if (files.length > 0) {
          console.log(`🧹 [DỌN DẸP] Đã dọn sạch ${files.length} file ảnh BXH tạm trong assets/output/`);
        }
      }
    } catch (err) {
      console.warn('⚠️ Lỗi khi dọn dẹp thư mục output:', err.message);
    }
  }

  loadCustomConfigs(force = false) {
    if (this._customConfigsLoaded && !force) return;
    this._customConfigsLoaded = true;
    try {
      if (fs.existsSync(this.customConfigFile)) {
        const data = fs.readFileSync(this.customConfigFile, 'utf8');
        const custom = JSON.parse(data);
        this.configs = { ...TEMPLATE_CONFIGS, ...custom };
        console.log(`📁 [MẪU BXH] Đã tải ${Object.keys(custom).length} mẫu phôi động từ templates_config.json`);
      }
    } catch (e) {
      console.warn('⚠️ Lỗi khi đọc templates_config.json:', e.message);
    }

    // Đọc thêm tất cả các file *.json riêng lẻ trong assets/templates/ (như bxhgalaxy.json, bxhvietnam.json...)
    try {
      if (fs.existsSync(this.templatesDir)) {
        const files = fs.readdirSync(this.templatesDir);
        for (const file of files) {
          if (file.endsWith('.json') && file !== 'templates_config.json') {
            try {
              const fullPath = path.join(this.templatesDir, file);
              const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
              if (content.id) {
                this.configs[content.id] = { ...(this.configs[content.id] || {}), ...content };
              }
            } catch (err) {}
          }
        }
      }
    } catch (err) {}

    // Đọc toàn bộ các mẫu từ thư mục layouts (assets/templates/layouts, D:/BXH/BXH, data/assets/templates/layouts hoặc D:/ẢNHBOTFF/BXH/layouts)
    const layoutsDirs = [
      path.join(this.templatesDir, 'layouts'),
      'D:/BXH/BXH',
      path.resolve(__dirname, '../../data/assets/templates/layouts'),
      'D:/ẢNHBOTFF/BXH/layouts'
    ];
    for (const lDir of layoutsDirs) {
      if (!fs.existsSync(lDir)) continue;
      try {
        const subdirs = fs.readdirSync(lDir);
        for (const sub of subdirs) {
          const folderPath = path.join(lDir, sub);
          try {
            if (!fs.statSync(folderPath).isDirectory()) continue;
            const subFiles = fs.readdirSync(folderPath);

            // Tìm file json layout: ưu tiên layout.json, nếu không thì tìm bất kỳ file .json nào (như layout_ff2.json, layout_wave.json)
            let layoutJsonPath = path.join(folderPath, 'layout.json');
            if (!fs.existsSync(layoutJsonPath)) {
              const jsonFile = subFiles.find(f => f.toLowerCase().endsWith('.json'));
              if (jsonFile) {
                layoutJsonPath = path.join(folderPath, jsonFile);
              } else {
                continue;
              }
            }

            const num = parseInt(sub, 10);
            const tmplId = !isNaN(num) ? `mau_${num}` : `mau_${sub}`;
            // Nếu mẫu này đã được tải từ thư mục ưu tiên cao hơn, bỏ qua
            if (this.configs[tmplId] && this.configs[tmplId].file && fs.existsSync(this.configs[tmplId].file)) {
              continue;
            }

            const layoutData = JSON.parse(fs.readFileSync(layoutJsonPath, 'utf8'));
            const bgFile = subFiles.find(f => /^(background|backrgou|bg|phoi)\.(png|jpg|jpeg)$/i.test(f))
              || subFiles.find(f => /\.(png|jpg|jpeg)$/i.test(f) && !/^logo\./i.test(f))
              || 'background.png';
            const bgFullPath = path.join(folderPath, bgFile);
            const logoFile = subFiles.find(f => /^logo\.(png|jpg|jpeg)$/i.test(f));
            const logoFullPath = logoFile ? path.join(folderPath, logoFile) : null;

            const tmplName = `Mẫu #${sub}`;

            const fullConfig = {
              ...layoutData,
              id: tmplId,
              name: tmplName,
              file: bgFullPath,
              defaultLogo: logoFullPath,
              type: 'custom_coords'
            };

            this.configs[tmplId] = fullConfig;
            this.configs[sub] = fullConfig;
            this.configs[`mau${sub}`] = fullConfig;
            this.configs[`bxh${sub}`] = fullConfig;
          } catch (e) {}
        }
      } catch (err) {}
    }
  }

  saveCustomTemplate(templateId, configData, imageBufferOrPath) {
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }

    // 1. Lưu file ảnh phôi vào assets/templates/
    const targetPath = path.join(this.templatesDir, `${templateId}.png`);
    if (Buffer.isBuffer(imageBufferOrPath)) {
      fs.writeFileSync(targetPath, imageBufferOrPath);
    } else if (typeof imageBufferOrPath === 'string' && imageBufferOrPath !== targetPath) {
      fs.copyFileSync(imageBufferOrPath, targetPath);
    }

    // 2. Cập nhật cấu hình bộ nhớ
    const newConfig = {
      ...configData,
      id: templateId,
      name: configData.name || `Mẫu AI: ${templateId}`,
      file: `${templateId}.png`
    };
    this.configs[templateId] = newConfig;
    this._customConfigsLoaded = false;

    // 3. Ghi vào file templates_config.json
    try {
      let customMap = {};
      if (fs.existsSync(this.customConfigFile)) {
        try {
          customMap = JSON.parse(fs.readFileSync(this.customConfigFile, 'utf8'));
        } catch (e) {}
      }
      customMap[templateId] = newConfig;
      fs.writeFileSync(this.customConfigFile, JSON.stringify(customMap, null, 2), 'utf8');
      console.log(`💾 [MẪU BXH] Đã lưu cấu hình mẫu [${templateId}] vào templates_config.json`);
    } catch (err) {
      console.error('Lỗi khi lưu templates_config.json:', err);
    }

    return targetPath;
  }

  getAvailableTemplates() {
    this.loadCustomConfigs();
    if (!fs.existsSync(this.templatesDir)) return Object.keys(this.configs);
    const files = fs.readdirSync(this.templatesDir)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .map(f => path.parse(f).name);

    // Kết hợp các file ảnh và các key trong configs, sắp xếp theo thứ tự số
    const set = new Set([...Object.keys(this.configs), ...files]);
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 999;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 999;
      return numA - numB;
    });
  }

  resolveTemplateAlias(templateId) {
    if (!templateId) return this.defaultTemplate || 'mau_42';
    const s = String(templateId).trim().toLowerCase();

    // 1. Kiểm tra nếu là số (1-100 hoặc các mẫu phôi có sẵn) hoặc mau_X, mauX, bxhX
    const numMatch = s.match(/^(?:mau_?|bxh_?)?(\d+)$/);
    if (numMatch) {
      const n = parseInt(numMatch[1], 10);
      if (n >= 1 && (n <= 100 || (this.configs && this.configs[`mau_${n}`]))) {
        return `mau_${n}`;
      }
    }

    // 2. Các alias chữ cho các mẫu cũ
    if (s === 'bxhkelly' || s === 'kelly' || s === 'overall' || s === 'overall_standing') return 'bxhkelly';
    if (s === 'bxhgaixinh' || s === 'gaixinh' || s === 'bxhscrim' || s === 'scrim' || s === 'summer' || s === 'bxhsummer') return 'bxhgaixinh';
    if (s === 'bxhdoraemon' || s === 'doraemon' || s === 'doremon' || s === 'bxhdoremon') return 'bxhdoraemon';
    if (s === 'bxhvietnam' || s === 'vietnam' || s === 'vn' || s === 'bodoi' || s === 'bxhbodoi') return 'bxhvietnam';
    if (s === 'bxhrengoku' || s === 'rengoku' || s === 'tanjiro' || s === 'demonslayer' || s === 'kimetsu' || s === 'viemtru') return 'bxhrengoku';
    if (s === 'bxhgalaxy' || s === 'galaxy' || s === 'cyber' || s === 'bxhcyber' || s === 'neon' || s === 'bxhneon' || s === 'standings' || s === 'overall_standings') return 'bxhgalaxy';

    if (this.configs && this.configs[s]) {
      return s;
    }
    return this.defaultTemplate || 'mau_42';
  }

  getTemplateName(templateId) {
    this.loadCustomConfigs();
    const realId = this.resolveTemplateAlias(templateId);
    if (this.configs[realId]?.name) {
      return this.configs[realId].name;
    }
    const numMatch = realId.match(/^(?:mau_?|bxh_?)?(\d+)$/);
    if (numMatch) {
      return `Mẫu #${numMatch[1]}`;
    }
    return (realId === 'bxhgalaxy' ? 'Mẫu BXH Galaxy Neon Cyber (Dọc 1170x1470)' : realId === 'bxhrengoku' ? 'Mẫu BXH Rengoku & Tanjiro Demon Slayer (Ngang 4800x2700)' : realId === 'bxhvietnam' ? 'Mẫu BXH Bộ Đội Việt Nam (Ngang 4800x2700)' : realId === 'bxhdoraemon' ? 'Mẫu BXH Doraemon Esports (Vuông 2560x2560)' : realId === 'bxhgaixinh' ? 'Mẫu BXH Gái Xinh Anime (Ngang 4800x2700)' : realId === 'bxhkelly' ? 'Mẫu BXH Kelly Vàng Đen (Overall Standing)' : 'Mẫu #42');
  }

  getTemplateConfig(templateId) {
    this.loadCustomConfigs();
    const realId = this.resolveTemplateAlias(templateId);
    return this.configs[realId] || TEMPLATE_CONFIGS[realId] || this.configs['mau_42'];
  }

  getTemplatePath(templateId) {
    this.loadCustomConfigs();
    const realId = this.resolveTemplateAlias(templateId);
    const cfg = this.configs[realId];
    if (cfg && cfg.file) {
      if (path.isAbsolute(cfg.file) && fs.existsSync(cfg.file)) return cfg.file;
      const rel = path.join(this.templatesDir, cfg.file);
      if (fs.existsSync(rel)) return rel;
    }
    const numMatch = realId.match(/^(?:mau_?|bxh_?)?(\d+)$/);
    if (numMatch) {
      const n = numMatch[1];
      const candidateDirs = [
        path.join(this.templatesDir, 'layouts', n),
        `D:/BXH/BXH/${n}`,
        `D:/ẢNHBOTFF/BXH/layouts/${n}`
      ];
      for (const d of candidateDirs) {
        if (fs.existsSync(d)) {
          const files = fs.readdirSync(d);
          const bg = files.find(f => /^background\.(png|jpg|jpeg)$/i.test(f));
          if (bg) return path.join(d, bg);
        }
      }
    }
    const exts = ['.png', '.jpg', '.jpeg', '.PNG', '.JPG'];
    for (const ext of exts) {
      const p = path.join(this.templatesDir, `${realId}${ext}`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Tạo ảnh xem trước thử nghiệm (demo) với 12 đội mẫu để kiểm tra độ chính xác tọa độ
   */
  async generateDemoPreview(templateId) {
    const demoTeams = [
      { teamName: '『HN』ĐộcCôCầuBại', killCount: 16, booyahCount: 1, rankPoints: 12, totalPoints: 28 },
      { teamName: 'HPĐ☞BenLòHeo', killCount: 12, booyahCount: 1, rankPoints: 9, totalPoints: 21 },
      { teamName: '@justmtam’', killCount: 9, booyahCount: 0, rankPoints: 8, totalPoints: 17 },
      { teamName: '1VienM590', killCount: 7, booyahCount: 0, rankPoints: 7, totalPoints: 14 },
      { teamName: '『Iron』boi', killCount: 6, booyahCount: 0, rankPoints: 6, totalPoints: 12 },
      { teamName: 'Cắm⠀Net⠀24h', killCount: 5, booyahCount: 0, rankPoints: 5, totalPoints: 10 },
      { teamName: 'Vo.Danh.ɴᴏ1', killCount: 4, booyahCount: 0, rankPoints: 4, totalPoints: 8 },
      { teamName: 'VIE.TLương', killCount: 3, booyahCount: 0, rankPoints: 3, totalPoints: 6 },
      { teamName: 'ĐạiBàngSaMạc', killCount: 2, booyahCount: 0, rankPoints: 2, totalPoints: 4 },
      { teamName: 'XạThủBìnhMinh', killCount: 2, booyahCount: 0, rankPoints: 1, totalPoints: 3 },
      { teamName: 'SátThủVôDanh', killCount: 1, booyahCount: 0, rankPoints: 0, totalPoints: 1 },
      { teamName: 'ChiếnBinhCus', killCount: 0, booyahCount: 0, rankPoints: 0, totalPoints: 0 }
    ];

    const demoMatches = [
      { ranks: [{ rank: 1, teamName: '『HN』ĐộcCôCầuBại' }] },
      { ranks: [{ rank: 1, teamName: 'HPĐ☞BenLòHeo' }] },
      { ranks: [{ rank: 1, teamName: '@justmtam’' }] },
      { ranks: [{ rank: 1, teamName: '1VienM590' }] },
      { ranks: [{ rank: 1, teamName: '『Iron』boi' }] }
    ];

    return this.generateLeaderboardImage(demoTeams, {
      template: templateId,
      matches: demoMatches
    });
  }

  /**
   * Định dạng chuẩn hiển thị thời gian cho tất cả các mẫu BXH: "DD/MM HH:mm" (ví dụ: "07/10 13:00")
   */
  formatLeaderboardTimeLabel(rawTime, matches = []) {
    let str = String(rawTime || '').trim();
    if (str) {
      str = str.replace(/\/20\d{2}/g, '').replace(/-\s*20\d{2}/g, '').trim();

      // Trường hợp 1: "13h-15h - 07/10", "13h-15h-07/10", "13h - 07/10", "13:00 - 15:00 - 07/10"
      const m1 = str.match(/(\d{1,2})(?:h|:)(\d{2})?(?:\s*[-–]\s*\d{1,2}(?:h|:)?\d{0,2})?\s*[-–]\s*(\d{1,2}\/\d{1,2})/i);
      if (m1) {
        const h = String(m1[1]).padStart(2, '0');
        const min = m1[2] ? String(m1[2]).padStart(2, '0') : '00';
        const d = m1[3];
        return `${d} ${h}:${min}`;
      }

      // Trường hợp 2: "07/10 - 13h-15h", "07/10 - 13h", "07/10 - 13:00"
      const m2 = str.match(/(\d{1,2}\/\d{1,2})\s*[-–]\s*(\d{1,2})(?:h|:)(\d{2})?/i);
      if (m2) {
        const d = m2[1];
        const h = String(m2[2]).padStart(2, '0');
        const min = m2[3] ? String(m2[3]).padStart(2, '0') : '00';
        return `${d} ${h}:${min}`;
      }

      // Trường hợp 3: "13:00 07/10" hoặc "13:00  07/10"
      const m3 = str.match(/^(\d{1,2}:\d{2})\s+(\d{1,2}\/\d{1,2})$/);
      if (m3) {
        return `${m3[2]} ${m3[1]}`;
      }

      // Trường hợp 4: "13h 07/10"
      const m4 = str.match(/^(\d{1,2})h(?:(\d{2}))?\s+(\d{1,2}\/\d{1,2})$/i);
      if (m4) {
        const h = String(m4[1]).padStart(2, '0');
        const min = m4[2] ? String(m4[2]).padStart(2, '0') : '00';
        return `${m4[3]} ${h}:${min}`;
      }

      // Nếu đã đúng chuẩn "07/10 13:00"
      if (/^\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}$/.test(str)) {
        return str;
      }

      return str;
    }

    // Nếu không truyền thời gian thì tự động bóc tách từ danh sách trận đấu
    let matchTs = null;
    for (const m of (matches || [])) {
      const ts = m.startTime || m.endTime || m.createTime || m.matchTime;
      if (ts) {
        matchTs = typeof ts === 'number' && ts < 1e11 ? ts * 1000 : Number(ts);
        break;
      }
    }
    const dt = matchTs ? new Date(matchTs) : new Date();
    const utc = dt.getTime() + (dt.getTimezoneOffset() * 60000);
    const vnNow = new Date(utc + (7 * 3600000));
    const pad = n => String(n).padStart(2, '0');
    return `${pad(vnNow.getDate())}/${pad(vnNow.getMonth() + 1)} ${pad(vnNow.getHours())}:${pad(vnNow.getMinutes())}`;
  }

  /**
   * Tạo ảnh Bảng Xếp Hạng dựa trên phôi mẫu
   * @param {Array} teams Danh sách các đội đã xếp hạng (Top 1 -> 12)
   * @param {Object} options Cấu hình: template, matches, v.v.
   */
  async generateLeaderboardImage(teams, options = {}) {
    // Chuẩn hóa tên đội bóng và tiêu đề để bảo đảm mọi ký tự đặc biệt, emoji, Apple logo được xử lý đồng bộ
    if (Array.isArray(teams)) {
      teams = teams.map(t => ({
        ...t,
        teamName: normalizeSpecialText(t?.teamName || t?.displayName || '')
      }));
    }
    if (options.customTitle) options.customTitle = normalizeSpecialText(options.customTitle);
    if (options.roomTitle) options.roomTitle = normalizeSpecialText(options.roomTitle);

    const requested = options.template || options.templateId || this.defaultTemplate;
    const templateName = this.resolveTemplateAlias(requested);
    this.loadCustomConfigs();
    const cfg = this.configs[templateName] || this.configs['mau_1'] || this.configs[this.defaultTemplate];

    let templatePath = this.getTemplatePath(templateName);
    if (!templatePath || !fs.existsSync(templatePath)) {
      templatePath = this.getTemplatePath(this.defaultTemplate) || this.getTemplatePath('mau_1');
    }

    if (!templatePath || !fs.existsSync(templatePath)) {
      throw new Error(`Không tìm thấy file phôi mẫu ảnh tại: ${templatePath}`);
    }

    console.log(`🎨 [IMAGE SERVICE] Đang vẽ BXH với mẫu: [${templateName}] - Tên: [${this.getTemplateName(templateName)}] - Loại: [${cfg.type}] - File: [${templatePath}]`);

    const templateImg = await loadImage(templatePath);
    const canvas = createCanvas(templateImg.width, templateImg.height);
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Vẽ phôi nền
    ctx.drawImage(templateImg, 0, 0);

    // Vẽ ô đồng hồ ngày giờ nếu mẫu có cấu hình timeBox
    if (cfg.timeBox) {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const timeStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}  ${pad(now.getHours())}h:${pad(now.getMinutes())}`;

      ctx.font = getFontWithFallback(cfg.timeBox.fontSize || 12, 'bold', 'Segoe UI');
      ctx.textBaseline = 'middle';
      const textWidth = ctx.measureText(timeStr).width;
      const clockRadius = cfg.timeBox.clockRadius || 5.5;
      const gap = 5;
      const totalW = clockRadius * 2 + gap + textWidth;
      const centerX = cfg.timeBox.x || 588;
      const centerY = cfg.timeBox.y || 437;
      const startX = centerX - totalW / 2;

      // Vẽ biểu tượng đồng hồ tròn
      ctx.save();
      const clockColor = cfg.timeBox.color || '#ffd700';
      ctx.strokeStyle = clockColor;
      ctx.fillStyle = clockColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(startX + clockRadius, centerY, clockRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(startX + clockRadius, centerY);
      ctx.lineTo(startX + clockRadius, centerY - clockRadius * 0.6);
      ctx.moveTo(startX + clockRadius, centerY);
      ctx.lineTo(startX + clockRadius + clockRadius * 0.5, centerY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(startX + clockRadius, centerY, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Vẽ chữ ngày giờ
      ctx.textAlign = 'left';
      ctx.fillStyle = clockColor;
      ctx.fillText(timeStr, startX + clockRadius * 2 + gap, centerY);
    }

    // Vẽ thanh thời gian nếu mẫu có cấu hình timeBar
    if (cfg.timeBar) {
      let timeLabel = this.formatLeaderboardTimeLabel(options.matchTime || options.timeStr, options.matches);

      ctx.save();
      const isItalic = cfg.timeBar.italic !== false && cfg.type !== 'conan_kaito';
      ctx.font = getFontWithFallback(cfg.timeBar.fontSize || 15, isItalic ? 'bold italic' : 'bold', 'Segoe UI');
      ctx.fillStyle = cfg.timeBar.color || '#ffffff';
      ctx.textAlign = cfg.timeBar.align || 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(timeLabel, cfg.timeBar.x || 700, cfg.timeBar.y || 83);
      ctx.restore();
    }

    // Vẽ Logo giải đấu/Key nếu có
    if (options.logoPath && fs.existsSync(options.logoPath) && (cfg.logoPos || (cfg.type !== 'custom_coords' && !cfg.Top1))) {
      try {
        const logoImg = await loadImage(options.logoPath);
        const logoCfg = cfg.logoPos || { x: 40, y: 35, size: 75 };
        const lx = logoCfg.x;
        const ly = logoCfg.y;
        const lSize = logoCfg.size || 75;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        if (logoCfg.isSquare) {
          // Vẽ logo vuông bo góc nhẹ trong khung vuông (như Mẫu 6 Kaito Kid)
          const radius = logoCfg.borderRadius || 6;
          ctx.beginPath();
          ctx.roundRect(lx, ly, lSize, lSize, radius);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(logoImg, lx, ly, lSize, lSize);
          ctx.restore();

          // Viền quanh logo vuông (chỉ vẽ nếu cấu hình yêu cầu, mẫu conan_kaito phôi đã có sẵn viền phát sáng)
          if (logoCfg.showBorder !== false && cfg.type !== 'conan_kaito') {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(lx, ly, lSize, lSize, radius);
            ctx.strokeStyle = logoCfg.borderColor || '#00ffff';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.restore();
          }
        } else {
          // Mặc định: Logo hình tròn viền vàng
          ctx.beginPath();
          ctx.arc(lx + lSize / 2, ly + lSize / 2, lSize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(logoImg, lx, ly, lSize, lSize);
          ctx.restore();

          // Viền vàng kim quanh logo tròn
          ctx.save();
          ctx.beginPath();
          ctx.arc(lx + lSize / 2, ly + lSize / 2, (lSize / 2) + 1, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        }
      } catch (err) {
        console.error('⚠️ [IMAGE SERVICE] Lỗi khi vẽ logo:', err.message);
      }
    }

    // Helper vẽ bộ 3 icon YTB, FB, TIKTOK vector cực nét
    const drawSocialIcons = (startX, centerY, size = 16) => {
      // 1. YouTube Icon (Nền đỏ bo góc + tam giác trắng)
      const ytbX = startX;
      const ytbY = centerY - size / 2;
      ctx.save();
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.roundRect(ytbX, ytbY, size * 1.3, size, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(ytbX + size * 0.45, centerY - size * 0.28);
      ctx.lineTo(ytbX + size * 0.95, centerY);
      ctx.lineTo(ytbX + size * 0.45, centerY + size * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 2. Facebook Icon (Hình tròn xanh + chữ f trắng)
      const fbX = startX + size * 1.3 + 6;
      ctx.save();
      ctx.fillStyle = '#1877f2';
      ctx.beginPath();
      ctx.arc(fbX + size / 2, centerY, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(size * 0.8)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('f', fbX + size / 2, centerY + 1);
      ctx.restore();

      // 3. TikTok Icon (Hình tròn đen + nốt nhạc)
      const ttX = fbX + size + 6;
      ctx.save();
      ctx.fillStyle = '#010101';
      ctx.beginPath();
      ctx.arc(ttX + size / 2, centerY, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#25f4ee';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ttX + size / 2 + 1, centerY - 2, size * 0.26, 0, Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#fe2c55';
      ctx.beginPath();
      ctx.arc(ttX + size / 2 - 1, centerY + 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      return ttX + size + 8; // Trả về tọa độ X tiếp theo để viết chữ
    };

    // Người dùng yêu cầu: Bỏ chữ ở trên đó cho tất cả các mẫu
    // (Không vẽ customTitle floating ở trên đỉnh phôi ảnh)

    ctx.textBaseline = 'middle';

    // Helper rút gọn tên nếu quá dài (Hỗ trợ an toàn tuyệt đối ký tự đặc biệt, cánh bướm, icon emoji và surrogate pairs)
    const truncate = (text, maxWidth) => {
      const normalized = normalizeSpecialText(text);
      let chars = Array.from((normalized || '').trim());
      while (chars.length > 3 && ctx.measureText(chars.join('')).width > maxWidth) {
        chars.pop();
      }
      const rawTrimmed = (normalized || '').trim();
      if (chars.join('') !== rawTrimmed && chars.length > 3) {
        chars = chars.slice(0, -2);
        return chars.join('') + '...';
      }
      return chars.join('');
    };

    // Helper lấy logo đội từ options.teamLogosMap (hỗ trợ tên mới .hsg, tên gốc, displayName, chữ hoa/thường)
    const getTeamLogo = (t, defaultLogo = null) => {
      if (!options.teamLogosMap || !t) return defaultLogo;
      const tName = typeof t === 'string' ? t : (t.teamName || t.displayName);
      const dName = typeof t === 'object' ? t.displayName : null;
      if (tName && options.teamLogosMap[tName]) return options.teamLogosMap[tName];
      if (tName && options.teamLogosMap[tName.trim()]) return options.teamLogosMap[tName.trim()];
      if (tName && options.teamLogosMap[tName.trim().toUpperCase()]) return options.teamLogosMap[tName.trim().toUpperCase()];
      if (dName && options.teamLogosMap[dName]) return options.teamLogosMap[dName];
      if (dName && options.teamLogosMap[dName.trim()]) return options.teamLogosMap[dName.trim()];
      if (dName && options.teamLogosMap[dName.trim().toUpperCase()]) return options.teamLogosMap[dName.trim().toUpperCase()];
      return defaultLogo;
    };

    // Helper vẽ 1 dòng đội
    const drawRow = (team, rowConfig, y, defaultName = 'Đội') => {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      // Tên đội
      ctx.textAlign = rowConfig.teamName.align || 'left';
      ctx.fillStyle = rowConfig.teamName.color || '#ffffff';
      ctx.font = getFontWithFallback(rowConfig.teamName.fontSize || 14, 'bold', rowConfig.teamName.font || 'Prompt');
      const name = truncate(team?.teamName || defaultName, rowConfig.teamName.maxWidth || 200);
      ctx.fillText(name, rowConfig.teamName.x, y);

      // Kill
      ctx.textAlign = rowConfig.kill.align || 'center';
      ctx.fillStyle = rowConfig.kill.color || '#ffffff';
      ctx.font = getFontWithFallback(rowConfig.kill.fontSize || 15, 'bold', rowConfig.kill.font || 'Prompt');
      ctx.fillText(String(team?.killCount ?? 0), rowConfig.kill.x, y);

      // Booyah
      ctx.textAlign = rowConfig.booyah.align || 'center';
      ctx.fillStyle = rowConfig.booyah.color || '#ffd700';
      ctx.font = getFontWithFallback(rowConfig.booyah.fontSize || 15, 'bold', rowConfig.booyah.font || 'Prompt');
      ctx.fillText(String(team?.booyahCount ?? 0), rowConfig.booyah.x, y);

      // Total Points
      ctx.textAlign = rowConfig.totalPoints.align || 'center';
      ctx.fillStyle = rowConfig.totalPoints.color || '#ff3b30';
      ctx.font = getFontWithFallback(rowConfig.totalPoints.fontSize || 16, 'bold', rowConfig.totalPoints.font || 'Prompt');
      ctx.fillText(String(team?.totalPoints ?? 0), rowConfig.totalPoints.x, y);

      ctx.restore();
    };

    // 2. Điền dữ liệu tùy theo loại mẫu:
    if (cfg.type === 'two_columns') {
      // MẪU 2 CỘT (Mẫu 3: Top 1-6 trái, Top 7-12 phải)
      // Cột trái (Top 1 -> 6)
      for (let i = 0; i < 6; i++) {
        if (i < teams.length) {
          const y = cfg.rowYLeft[i];
          drawRow(teams[i], cfg.leftCol, y, `Đội ${i + 1}`);
        }
      }
      // Cột phải (Top 7 -> 12)
      for (let i = 0; i < 6; i++) {
        const teamIdx = i + 6;
        if (teamIdx < teams.length) {
          const y = cfg.rowYRight[i];
          drawRow(teams[teamIdx], cfg.rightCol, y, `Đội ${teamIdx + 1}`);
        }
      }
    } else if (cfg.type === 'with_maps') {
      // MẪU MAP THI ĐẤU (Mẫu 4: 4 map trái + 12 hàng phải)
      // A. Điền 12 hàng bên phải
      const maxRows = Math.min(teams.length, cfg.rowY.length);
      for (let i = 0; i < maxRows; i++) {
        const y = cfg.rowY[i];
        drawRow(teams[i], cfg, y, `Đội ${i + 1}`);
      }

      // B. Điền tên đội Booyah từng map bên dưới
      const matches = options.matches || [];
      if (cfg.mapBoxes && Array.isArray(cfg.mapBoxes)) {
        cfg.mapBoxes.forEach((box, mapIdx) => {
          let booyahTeamName = '';

          // Lấy chính xác đội đạt Booyah của trận tương ứng với map
          if (matches[mapIdx] && Array.isArray(matches[mapIdx].ranks)) {
            // 1. Tìm đội có booyah === 1 (chuẩn Garena Battle Royale)
            let booyahRank = matches[mapIdx].ranks.find(r => Number(r.booyah) === 1);

            // Chỉ fallback về rank === 1 nếu dữ liệu không có trường booyah (ví dụ dữ liệu demo)
            if (!booyahRank) {
              const hasBooyahField = matches[mapIdx].ranks.some(r => r.booyah !== undefined && r.booyah !== null);
              if (!hasBooyahField) {
                booyahRank = matches[mapIdx].ranks.find(r => Number(r.rank) === 1);
              }
            }

            if (booyahRank) {
              // 2. Khớp với tên đội hiển thị trên Bảng Xếp Hạng (teams)
              const matchedTeam = teams.find(t => {
                if (booyahRank.teamName && t.teamName && t.teamName.trim().toLowerCase() === booyahRank.teamName.trim().toLowerCase()) {
                  return true;
                }
                const pIds = booyahRank.playerAccountIds || booyahRank.playerIds || [];
                if (t.playerAccountIds && pIds.length > 0) {
                  let overlapId = 0;
                  for (const id of pIds) {
                    if (id && t.playerAccountIds.includes(id)) overlapId++;
                  }
                  if (overlapId >= 2 || (pIds.length <= 2 && overlapId >= 1)) return true;
                }
                const pNames = booyahRank.accountNames || [];
                if (t.accountNames && pNames.length > 0) {
                  let overlap = 0;
                  for (const name of pNames) {
                    if (name && t.accountNames.includes(name)) overlap++;
                  }
                  if (overlap >= 2 || (pNames.length <= 2 && overlap >= 1)) return true;
                }
                if (t.teamName && pNames.includes(t.teamName)) return true;
                return false;
              });

              if (matchedTeam) {
                booyahTeamName = matchedTeam.teamName;
              } else {
                booyahTeamName = ((booyahRank.accountNames && booyahRank.accountNames[0]) || booyahRank.teamName || booyahRank.name || '').trim();
              }
            }
          }

          if (booyahTeamName) {
            // Vẽ hộp badge booyah bo tròn nền đen bóng kính
            ctx.font = getFontWithFallback(13, 'bold', 'Segoe UI');
            const textToDraw = truncate(`👑 ${booyahTeamName}`, box.maxWidth - 16);
            const textMetrics = ctx.measureText(textToDraw);
            const badgeW = Math.min(box.maxWidth, textMetrics.width + 18);
            const badgeH = 28;
            const badgeX = box.x - (badgeW / 2);
            const badgeY = box.y - (badgeH / 2);

            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1.5;

            // Bo góc hộp badge
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
            ctx.fill();
            ctx.stroke();

            // Chữ tên đội màu vàng kim
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffd700';
            ctx.fillText(textToDraw, box.x, box.y);
            ctx.restore();
          }
        });
      }
    } else if (cfg.type === 'kimetsu_pq') {
      // MẪU KIMETSU CUSTOM PQ: TOP 1 CHAMPION CARD + 2 CỘT 12 ĐỘI + 5 MAP BOOYAH
      // A. Điền Top 1 Champion Card ở giữa trên
      if (teams.length > 0 && cfg.championBox) {
        const top1 = teams[0];
        const cBox = cfg.championBox;

        // Tên đội Top 1
        if (cBox.teamName) {
          ctx.save();
          ctx.font = getFontWithFallback(cBox.teamName.fontSize || 20, 'bold', cBox.teamName.font || 'Prompt');
          ctx.fillStyle = cBox.teamName.color || '#0b2e4f';
          ctx.textAlign = cBox.teamName.align || 'center';
          ctx.textBaseline = 'middle';
          const top1Name = truncate(top1.teamName || 'Đội 1', cBox.teamName.maxWidth || 260);
          ctx.fillText(top1Name, cBox.teamName.x, cBox.teamName.y);
          ctx.restore();
        }

        // ELIMS Top 1
        if (cBox.kill) {
          ctx.save();
          ctx.font = getFontWithFallback(cBox.kill.fontSize || 18, 'bold', cBox.kill.font || 'Prompt');
          ctx.fillStyle = cBox.kill.color || '#0b2e4f';
          ctx.textAlign = cBox.kill.align || 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(top1.killCount ?? 0), cBox.kill.x, cBox.kill.y);
          ctx.restore();
        }

        // BOOYAH Top 1
        if (cBox.booyah) {
          ctx.save();
          ctx.font = getFontWithFallback(cBox.booyah.fontSize || 18, 'bold', cBox.booyah.font || 'Prompt');
          ctx.fillStyle = cBox.booyah.color || '#0b2e4f';
          ctx.textAlign = cBox.booyah.align || 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(top1.booyahCount ?? 0), cBox.booyah.x, cBox.booyah.y);
          ctx.restore();
        }

        // PTS Top 1
        if (cBox.totalPoints) {
          ctx.save();
          ctx.font = getFontWithFallback(cBox.totalPoints.fontSize || 20, 'bold', cBox.totalPoints.font || 'Prompt');
          ctx.fillStyle = cBox.totalPoints.color || '#c00000';
          ctx.textAlign = cBox.totalPoints.align || 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(top1.totalPoints ?? 0), cBox.totalPoints.x, cBox.totalPoints.y);
          ctx.restore();
        }
      }

      // B. Điền Bảng 2 Cột (Top 1 -> 6 bên trái, Top 7 -> 12 bên phải)
      for (let i = 0; i < 6; i++) {
        if (i < teams.length) {
          const y = cfg.rowYLeft[i];
          drawRow(teams[i], cfg.leftCol, y, `Đội ${i + 1}`);
        }
      }
      for (let i = 0; i < 6; i++) {
        const teamIdx = i + 6;
        if (teamIdx < teams.length) {
          const y = cfg.rowYRight[i];
          drawRow(teams[teamIdx], cfg.rightCol, y, `Đội ${teamIdx + 1}`);
        }
      }

    } else if (cfg.type === 'champion_and_maps') {
      // MẪU ESPORTS: TOP 1 CHAMPION BÊN TRÁI + 11 HÀNG (TOP 2-12) BÊN PHẢI + 4 MAP RECAP
      // A. Điền Top 1 Champion bên trái
      if (teams.length > 0 && cfg.championBox) {
        const top1 = teams[0];
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        // Top 1 Team Name
        const cNameCfg = cfg.championBox.teamName || {};
        ctx.font = getFontWithFallback(cNameCfg.fontSize || 20, 'bold', cNameCfg.font || 'Prompt');
        ctx.fillStyle = cNameCfg.color || '#ffd700';
        ctx.textAlign = cNameCfg.align || 'left';
        ctx.textBaseline = 'middle';
        const top1Name = truncate(top1.teamName || 'Đội Vô Địch', cNameCfg.maxWidth || 255);
        ctx.fillText(top1Name, cNameCfg.x || 145, cNameCfg.y || 415);

        // Top 1 Stats
        const sCfg = cfg.championBox.stats || {};
        const statY = sCfg.y || 478;
        ctx.font = getFontWithFallback(sCfg.fontSize || 14, 'bold', sCfg.font || 'Prompt');
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        ctx.fillStyle = sCfg.colorLabel || '#ffffff';
        ctx.fillText('ELIMS: ', 145, statY);
        ctx.fillStyle = sCfg.colorValue || '#ffd700';
        ctx.fillText(String(top1.killCount ?? 0), 195, statY);

        ctx.fillStyle = sCfg.colorLabel || '#ffffff';
        ctx.fillText('BOOYAH: ', 230, statY);
        ctx.fillStyle = sCfg.colorValue || '#ffd700';
        ctx.fillText(String(top1.booyahCount ?? 0), 302, statY);

        ctx.fillStyle = sCfg.colorLabel || '#ffffff';
        ctx.fillText('PTS: ', 330, statY);
        ctx.fillStyle = sCfg.colorPoints || '#ff3b30';
        ctx.fillText(String(top1.totalPoints ?? 0), 368, statY);

        ctx.restore();
      }

      // B. Điền 11 hàng (Top 2 -> 12) vào bảng chính
      const maxRows = Math.min(Math.max(0, teams.length - 1), cfg.rowY.length);
      for (let i = 0; i < maxRows; i++) {
        const team = teams[i + 1];
        const y = cfg.rowY[i];
        drawRow(team, cfg, y, `Đội ${i + 2}`);
      }

      // C. Điền Booyah Recap 4 Game bên phải
      const matches = options.matches || [];
      if (cfg.mapBoxes && Array.isArray(cfg.mapBoxes)) {
        cfg.mapBoxes.forEach((box, mapIdx) => {
          let booyahTeamName = '';

          if (matches[mapIdx] && Array.isArray(matches[mapIdx].ranks)) {
            let booyahRank = matches[mapIdx].ranks.find(r => Number(r.booyah) === 1);
            if (!booyahRank) {
              const hasBooyahField = matches[mapIdx].ranks.some(r => r.booyah !== undefined && r.booyah !== null);
              if (!hasBooyahField) {
                booyahRank = matches[mapIdx].ranks.find(r => Number(r.rank) === 1);
              }
            }

            if (booyahRank) {
              const matchedTeam = teams.find(t => {
                if (booyahRank.teamName && t.teamName && t.teamName.trim().toLowerCase() === booyahRank.teamName.trim().toLowerCase()) {
                  return true;
                }
                const pNames = booyahRank.accountNames || [];
                if (t.accountNames && pNames.length > 0) {
                  let overlap = 0;
                  for (const name of pNames) {
                    if (name && t.accountNames.includes(name)) overlap++;
                  }
                  if (overlap >= 2 || (pNames.length <= 2 && overlap >= 1)) return true;
                }
                if (t.teamName && pNames.includes(t.teamName)) return true;
                return false;
              });

              if (matchedTeam) {
                booyahTeamName = matchedTeam.teamName;
              } else {
                booyahTeamName = ((booyahRank.accountNames && booyahRank.accountNames[0]) || booyahRank.teamName || booyahRank.name || '').trim();
              }
            }
          }

          if (booyahTeamName) {
            ctx.save();
            ctx.font = getFontWithFallback(12, 'bold', 'Segoe UI');
            const textToDraw = truncate(`👑 ${booyahTeamName}`, box.maxWidth - 16);
            const textMetrics = ctx.measureText(textToDraw);
            const badgeW = Math.min(box.maxWidth, textMetrics.width + 16);
            const badgeH = 22;
            const badgeX = box.x - (badgeW / 2);
            const badgeY = box.y - (badgeH / 2);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 5);
            ctx.fill();
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffd700';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
            ctx.shadowBlur = 3;
            ctx.fillText(textToDraw, box.x, box.y);
            ctx.restore();
          }
        });
      }

      // D. Điền thông tin thanh ngang bên dưới (Bottom Bar: Giờ & Ngày bắn)
      if (cfg.bottomBar) {
        ctx.save();
        ctx.textAlign = cfg.bottomBar.align || 'center';
        ctx.textBaseline = 'middle';
        ctx.font = getFontWithFallback(cfg.bottomBar.fontSize || 13, 'bold italic', 'Segoe UI');
        ctx.fillStyle = cfg.bottomBar.color || '#ffd700';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 3;

        // Tính giờ ngày bắn (theo giờ Việt Nam UTC+7 chuẩn DD/MM HH:mm)
        let timeLabel = this.formatLeaderboardTimeLabel(options.matchTime || options.timeStr, options.matches);

        const prefix = options.customTitle || options.roomTitle || cfg.bottomBar.prefix || 'BẢNG ĐẤU CUSTOM PQ';
        const barText = `• ${prefix} • ${timeLabel} •`;
        ctx.fillText(barText, cfg.bottomBar.x || 500, cfg.bottomBar.y || 532);
        ctx.restore();
      }
    } else if (cfg.type === 'conan_kaito') {
      // MẪU #6: CONAN & KAITO KID ESPORTS
      // (Top 1 Champion Box bên trái + 11 hàng Top 2-12 có khoảng cách logo bên phải + 4 Game Recap)

      // A. Điền Top 1 Champion Box bên trái
      if (teams.length > 0 && cfg.championBox) {
        const top1 = teams[0];
        const cBox = cfg.championBox;

        // Tên đội Top 1: Căn giữa dải banner bên phải TOP 1
        if (cBox.teamName) {
          ctx.save();
          ctx.font = getFontWithFallback(cBox.teamName.fontSize || 18, 'bold', cBox.teamName.font || 'Prompt');
          ctx.textAlign = cBox.teamName.align || 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = cBox.teamName.color || '#ffffff';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 4;
          const top1Name = truncate(top1.teamName || 'Đội 1', cBox.teamName.maxWidth || 175);
          ctx.fillText(top1Name, cBox.teamName.x, cBox.teamName.y);
          ctx.restore();
        }

        // Số Booyah Top 1 (Bên phải chữ BOOYAH! định dạng 2 chữ số 01)
        if (cBox.booyah) {
          ctx.save();
          ctx.font = getFontWithFallback(cBox.booyah.fontSize || 24, '900', cBox.booyah.font || 'Prompt');
          ctx.fillStyle = cBox.booyah.color || '#ffffff';
          ctx.textAlign = cBox.booyah.align || 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 3;
          const byCount = cBox.booyah.padZero
            ? String(top1.booyahCount ?? 0).padStart(2, '0')
            : String(top1.booyahCount ?? 0);
          ctx.fillText(byCount, cBox.booyah.x, cBox.booyah.y);
          ctx.restore();
        }

        // ELIM Top 1
        if (cBox.kill) {
          ctx.save();
          ctx.font = getFontWithFallback(cBox.kill.fontSize || 24, '900', cBox.kill.font || 'Prompt');
          ctx.fillStyle = cBox.kill.color || '#ffffff';
          ctx.textAlign = cBox.kill.align || 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 3;
          ctx.fillText(String(top1.killCount ?? 0), cBox.kill.x, cBox.kill.y);
          ctx.restore();
        }

        // PTS Top 1
        if (cBox.totalPoints) {
          ctx.save();
          ctx.font = getFontWithFallback(cBox.totalPoints.fontSize || 24, '900', cBox.totalPoints.font || 'Prompt');
          ctx.fillStyle = cBox.totalPoints.color || '#ffffff';
          ctx.textAlign = cBox.totalPoints.align || 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 3;
          ctx.fillText(String(top1.totalPoints ?? 0), cBox.totalPoints.x, cBox.totalPoints.y);
          ctx.restore();
        }
      }

      // Tải logo dùng chung (nếu có)
      let teamLogoImg = null;
      if (options.logoPath && fs.existsSync(options.logoPath)) {
        try {
          teamLogoImg = await loadImage(options.logoPath);
        } catch (e) {}
      }

      // B. Điền 11 hàng (Top 2 -> Top 12) vào bảng chính bên phải
      const maxRows = Math.min(Math.max(0, teams.length - 1), cfg.rowY.length);
      for (let i = 0; i < maxRows; i++) {
        const team = teams[i + 1];
        const y = cfg.rowY[i];

        // 1. Logo vuông nhỏ bo góc cạnh số thứ tự (ưu tiên logo riêng từng team)
        const eachTeamLogo = getTeamLogo(team, teamLogoImg);
        if (eachTeamLogo && cfg.logoCol) {
          const lX = cfg.logoCol.x || 952;
          const lS = cfg.logoCol.size || 40;
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(lX, y - lS / 2, lS, lS, 4);
          ctx.clip();
          ctx.drawImage(eachTeamLogo, lX, y - lS / 2, lS, lS);
          ctx.restore();
        }

        // 2. Tên đội
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 6;
        ctx.textAlign = cfg.teamName.align || 'left';
        ctx.fillStyle = cfg.teamName.color || '#ffffff';
        ctx.font = getFontWithFallback(cfg.teamName.fontSize || 26, 'bold', cfg.teamName.font || 'Prompt');
        const name = truncate(team?.teamName || `Đội ${i + 2}`, cfg.teamName.maxWidth || 280);
        ctx.fillText(name, cfg.teamName.x, y);

        // 3. Kill
        ctx.textAlign = cfg.kill.align || 'center';
        ctx.fillStyle = cfg.kill.color || '#ffffff';
        ctx.font = getFontWithFallback(cfg.kill.fontSize || 26, '900', cfg.kill.font || 'Prompt');
        ctx.fillText(String(team?.killCount ?? 0), cfg.kill.x, y);

        // 4. Booyah định dạng 2 chữ số (00, 01, 02)
        ctx.textAlign = cfg.booyah.align || 'center';
        ctx.fillStyle = cfg.booyah.color || '#ffffff';
        ctx.font = getFontWithFallback(cfg.booyah.fontSize || 26, '900', cfg.booyah.font || 'Prompt');
        const byStr = cfg.booyah.padZero
          ? String(team?.booyahCount ?? 0).padStart(2, '0')
          : String(team?.booyahCount ?? 0);
        ctx.fillText(byStr, cfg.booyah.x, y);

        // 5. Total Points (PTS màu vàng gold)
        ctx.textAlign = cfg.totalPoints.align || 'center';
        ctx.fillStyle = cfg.totalPoints.color || '#ffd700';
        ctx.font = getFontWithFallback(cfg.totalPoints.fontSize || 26, '900', cfg.totalPoints.font || 'Prompt');
        ctx.fillText(String(team?.totalPoints ?? 0), cfg.totalPoints.x, y);
        ctx.restore();
      }

      // C. Điền Booyah Recap 4 Game bên phải
      const matches = options.matches || [];
      if (cfg.mapBoxes && Array.isArray(cfg.mapBoxes)) {
        cfg.mapBoxes.forEach((box, mapIdx) => {
          let booyahTeamName = '';

          if (matches[mapIdx] && Array.isArray(matches[mapIdx].ranks)) {
            let booyahRank = matches[mapIdx].ranks.find(r => Number(r.booyah) === 1);
            if (!booyahRank) {
              const hasBooyahField = matches[mapIdx].ranks.some(r => r.booyah !== undefined && r.booyah !== null);
              if (!hasBooyahField) {
                booyahRank = matches[mapIdx].ranks.find(r => Number(r.rank) === 1);
              }
            }

            if (booyahRank) {
              const matchedTeam = teams.find(t => {
                if (booyahRank.teamName && t.teamName && t.teamName.trim().toLowerCase() === booyahRank.teamName.trim().toLowerCase()) {
                  return true;
                }
                const pNames = booyahRank.accountNames || [];
                if (t.accountNames && pNames.length > 0) {
                  let overlap = 0;
                  for (const name of pNames) {
                    if (name && t.accountNames.includes(name)) overlap++;
                  }
                  if (overlap >= 2 || (pNames.length <= 2 && overlap >= 1)) return true;
                }
                if (t.teamName && pNames.includes(t.teamName)) return true;
                return false;
              });

              if (matchedTeam) {
                booyahTeamName = matchedTeam.teamName;
              } else {
                booyahTeamName = ((booyahRank.accountNames && booyahRank.accountNames[0]) || booyahRank.teamName || booyahRank.name || '').trim();
              }
            }
          }

          if (booyahTeamName) {
            ctx.save();
            ctx.font = getFontWithFallback(box.fontSize || 24, 'bold', box.font || 'Prompt');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
            ctx.shadowBlur = 8;
            const textToDraw = truncate(booyahTeamName, box.maxWidth || 240);
            ctx.fillText(textToDraw, box.x, box.y);

            // Vẽ logo nhỏ bên phải banner recap nếu có (BỎ VIỀN)
            if (teamLogoImg && box.logoX) {
              const lS = box.logoSize || 40;
              ctx.beginPath();
              ctx.roundRect(box.logoX, box.y - lS / 2, lS, lS, 6);
              ctx.clip();
              ctx.drawImage(teamLogoImg, box.logoX, box.y - lS / 2, lS, lS);
            }
            ctx.restore();
          }
        });
      }

      // D. Điền ô trắng/kem bên dưới (Bottom White Box: Tên Custom / Logo)
      if (cfg.bottomWhiteBox) {
        const bw = cfg.bottomWhiteBox;
        const cy = bw.y || 1056;
        const cusName = (options.customTitle || options.roomTitle || 'CUSTOM FREE FIRE').trim().toUpperCase();

        ctx.save();
        ctx.font = getFontWithFallback(bw.fontSize || 30, '900', bw.font || 'Prompt');
        ctx.textBaseline = 'middle';
        ctx.fillStyle = bw.color || '#0b2e4f';

        const boxCenterX = bw.x || 908;

        if (teamLogoImg) {
          const lSize = bw.logoSize || 38;
          const gap = bw.gap || 16;
          const textW = ctx.measureText(cusName).width;
          const totalW = lSize + gap + textW;
          const startX = Math.round(boxCenterX - (totalW / 2));

          // Vẽ logo - BỎ VIỀN, bo tròn mềm mại không viền thừa
          ctx.save();
          ctx.beginPath();
          ctx.arc(startX + lSize / 2, cy, lSize / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(teamLogoImg, startX, cy - lSize / 2, lSize, lSize);
          ctx.restore();

          // Vẽ tên Custom bên cạnh logo, toàn bộ khối căn giữa tuyệt đối
          ctx.save();
          ctx.font = getFontWithFallback(bw.fontSize || 30, '900', bw.font || 'Prompt');
          ctx.textBaseline = 'middle';
          ctx.fillStyle = bw.color || '#0b2e4f';
          ctx.textAlign = 'left';
          ctx.fillText(truncate(cusName, bw.maxWidth || 440), startX + lSize + gap, cy);
          ctx.restore();
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(truncate(cusName, bw.maxWidth || 520), boxCenterX, cy);
        }
        ctx.restore();
      }

    } else if (cfg.type === 'custom_coords' || (cfg.Top1 && cfg.Top2)) {
      // MẪU THEO TỌA ĐỘ TỪNG TOP (Ví dụ Mẫu Kelly Vàng Đen Overall Standing)

      // 1. Vẽ Logo cho từng đội nếu có logo và có cấu hình logos
      let teamLogoImg = null;
      const isDefaultTemplate = (cfg.id === 'mau_42' || cfg.id === '42' || String(cfg.name || '').includes('#42'));

      let effectiveLogoPath = null;
      if (isDefaultTemplate) {
        // MẪU MẶC ĐỊNH (MẪU 42): Mẫu cố định của Bot, KHÔNG ĐƯỢC THAY ĐỔI, luôn luôn dùng logo LDQY STUDIO mặc định
        const layoutId = '42';
        const candidates = [
          cfg.defaultLogo,
          path.resolve(__dirname, `../../assets/templates/layouts/${layoutId}/logo.png`),
          path.resolve(__dirname, `../../data/assets/templates/layouts/${layoutId}/logo.png`),
          path.resolve(__dirname, `../../assets/templates/layouts/${cfg.id}/logo.png`),
          path.resolve(__dirname, `../../data/assets/templates/layouts/${cfg.id}/logo.png`),
          path.resolve(__dirname, `../../assets/logos/logo_${layoutId}.png`),
          path.resolve(__dirname, `../../data/assets/logos/logo_${layoutId}.png`),
          `D:/ẢNHBOTFF/BXH/layouts/${layoutId}/logo.png`
        ];
        for (const cand of candidates) {
          if (cand && fs.existsSync(cand)) {
            effectiveLogoPath = cand;
            break;
          }
        }
      } else {
        // CÁC MẪU KHÁC (MẪU 1 -> 41): Những mẫu cần edit, chỉ hiện logo khi người dùng cài đặt riêng cho Key
        if (options.logoPath && fs.existsSync(options.logoPath)) {
          effectiveLogoPath = options.logoPath;
        }
      }

      if (effectiveLogoPath && fs.existsSync(effectiveLogoPath)) {
        try {
          teamLogoImg = await loadImage(effectiveLogoPath);
        } catch (e) {
          console.error('Lỗi tải logo BXH:', e);
        }
      }

      if (cfg.header && Array.isArray(cfg.header.logos)) {
        const logoList = cfg.header.logos;
        for (let i = 0; i < Math.min(teams.length, logoList.length); i++) {
          const lItem = logoList[i];
          const currentTeam = teams[i];
          const eachTeamImg = getTeamLogo(currentTeam, teamLogoImg);
          if (eachTeamImg && lItem && lItem.x && lItem.y && lItem.w && lItem.h) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(lItem.x, lItem.y, lItem.w, lItem.h, 6);
            ctx.clip();
            ctx.drawImage(eachTeamImg, lItem.x, lItem.y, lItem.w, lItem.h);
            ctx.restore();
          }
        }
      }

      // 2. Điền dữ liệu 12 đội theo từng Top1 -> Top12
      const limit = cfg.limit || 12;
      const count = Math.min(teams.length, limit);

      for (let i = 0; i < count; i++) {
        const topKey = `Top${i + 1}`;
        const topCfg = cfg[topKey];
        if (!topCfg) continue;

        const team = teams[i];
        ctx.save();
        ctx.textBaseline = 'middle';

        // Tên Đội
        if (topCfg.Name) {
          const nCfg = topCfg.Name;
          ctx.textAlign = nCfg.align || 'left';
          ctx.fillStyle = nCfg.color || '#FFFFFF';
          ctx.font = getFontWithFallback(nCfg.size || 40, nCfg.bold ? 'bold' : '', nCfg.font || 'Prompt');
          const autoMaxW = nCfg.maxWidth || (topCfg.Kill && topCfg.Kill.x > nCfg.x ? Math.max(150, topCfg.Kill.x - nCfg.x - 20) : 480);
          const teamNameStr = truncate(team?.teamName || `Đội ${i + 1}`, autoMaxW);
          ctx.fillText(teamNameStr, nCfg.x, nCfg.y);
        }

        // Kill (Elims)
        if (topCfg.Kill) {
          const kCfg = topCfg.Kill;
          ctx.textAlign = kCfg.align || 'center';
          ctx.fillStyle = kCfg.color || '#FFFFFF';
          ctx.font = getFontWithFallback(kCfg.size || 40, kCfg.bold ? 'bold' : '900', kCfg.font || 'Prompt');
          ctx.fillText(String(team?.killCount ?? 0), kCfg.x, kCfg.y);
        }

        // Booyah
        if (topCfg.Booyah) {
          const bCfg = topCfg.Booyah;
          ctx.textAlign = bCfg.align || 'center';
          ctx.fillStyle = bCfg.color || '#FFFFFF';
          ctx.font = getFontWithFallback(bCfg.size || 40, bCfg.bold ? 'bold' : '900', bCfg.font || 'Prompt');
          ctx.fillText(String(team?.booyahCount ?? 0), bCfg.x, bCfg.y);
        }

        // Score (Total PTS)
        if (topCfg.Score) {
          const sCfg = topCfg.Score;
          ctx.textAlign = sCfg.align || 'center';
          ctx.fillStyle = sCfg.color || '#F6D919';
          ctx.font = getFontWithFallback(sCfg.size || 40, sCfg.bold ? 'bold' : '900', sCfg.font || 'Prompt');
          ctx.fillText(String(team?.totalPoints ?? 0), sCfg.x, sCfg.y);
        }

        // Tên Đội 2 (nếu có ô Champion riêng như Layout 34)
        if (topCfg.Name2 && topCfg.Name2.x < 10000) {
          const n2Cfg = topCfg.Name2;
          ctx.textAlign = n2Cfg.align || 'left';
          ctx.fillStyle = n2Cfg.color || '#FFFFFF';
          ctx.font = getFontWithFallback(n2Cfg.size || 40, n2Cfg.bold ? 'bold' : '', n2Cfg.font || 'Prompt');
          const teamNameStr = truncate(team?.teamName || `Đội ${i + 1}`, n2Cfg.maxWidth || 600);
          ctx.fillText(teamNameStr, n2Cfg.x, n2Cfg.y);
        }

        // Kill 2
        if (topCfg.Kill2 && topCfg.Kill2.x < 10000) {
          const k2Cfg = topCfg.Kill2;
          ctx.textAlign = k2Cfg.align || 'center';
          ctx.fillStyle = k2Cfg.color || '#FFFFFF';
          ctx.font = getFontWithFallback(k2Cfg.size || 40, k2Cfg.bold ? 'bold' : '900', k2Cfg.font || 'Prompt');
          ctx.fillText(String(team?.killCount ?? 0), k2Cfg.x, k2Cfg.y);
        }

        // Booyah 2
        if (topCfg.Booyah2 && topCfg.Booyah2.x < 10000) {
          const b2Cfg = topCfg.Booyah2;
          ctx.textAlign = b2Cfg.align || 'center';
          ctx.fillStyle = b2Cfg.color || '#FFFFFF';
          ctx.font = getFontWithFallback(b2Cfg.size || 40, b2Cfg.bold ? 'bold' : '900', b2Cfg.font || 'Prompt');
          ctx.fillText(String(team?.booyahCount ?? 0), b2Cfg.x, b2Cfg.y);
        }

        // Score 2
        if (topCfg.Score2 && topCfg.Score2.x < 10000) {
          const s2Cfg = topCfg.Score2;
          ctx.textAlign = s2Cfg.align || 'center';
          ctx.fillStyle = s2Cfg.color || '#FFFFFF';
          ctx.font = getFontWithFallback(s2Cfg.size || 40, s2Cfg.bold ? 'bold' : '900', s2Cfg.font || 'Prompt');
          ctx.fillText(String(team?.totalPoints ?? 0), s2Cfg.x, s2Cfg.y);
        }

        // Logo từng đội cạnh hàng điểm (nếu layout có cấu hình Logo hoặc TeamLogo)
        const rowLogoCfg = topCfg.Logo || topCfg.TeamLogo;
        if (rowLogoCfg && rowLogoCfg.x < 10000 && rowLogoCfg.y < 10000) {
          const rowLogoImg = getTeamLogo(team, teamLogoImg);
          if (rowLogoImg) {
            ctx.save();
            const lw = rowLogoCfg.w || rowLogoCfg.size || 50;
            const lh = rowLogoCfg.h || rowLogoCfg.size || 50;
            ctx.beginPath();
            ctx.roundRect(rowLogoCfg.x, rowLogoCfg.y, lw, lh, 6);
            ctx.clip();
            ctx.drawImage(rowLogoImg, rowLogoCfg.x, rowLogoCfg.y, lw, lh);
            ctx.restore();
          }
        }

        ctx.restore();
      }

      // 3. Header & Footer (Tên giải & Thời gian)
      if (cfg.header) {
        const headerAngle = cfg.header.angle || (cfg.id === 'bxhgalaxy' ? -7.0 : 0);
        if (headerAngle !== 0) {
          // Xử lý vẽ nghiêng chuẩn xác cho ô tiêu đề nghiêng (như Mẫu 7 Galaxy Neon Cyber)
          const cNameCfg = cfg.header.customName || {};
          const cTimeCfg = cfg.header.customTime || {};
          const cusTitle = (options.customTitle || options.roomTitle || 'CUSTOM FREE FIRE').trim().toUpperCase();

          let timeLabel = this.formatLeaderboardTimeLabel(options.matchTime || options.timeStr, options.matches);

          ctx.save();
          const rad = (headerAngle * Math.PI) / 180;
          const hX = cfg.header.x || (cfg.id === 'bxhgalaxy' ? 330 : (cNameCfg.x || 330));
          const hY = cfg.header.y || (cfg.id === 'bxhgalaxy' ? 442 : (cNameCfg.y || 442));
          ctx.translate(hX, hY);
          ctx.rotate(rad);
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';

          // Tên Custom (Vẽ nghiêng theo khung đen)
          const fontSize = cNameCfg.size || 30;
          ctx.fillStyle = cNameCfg.color || '#FFFFFF';
          ctx.font = getFontWithFallback(fontSize, cNameCfg.bold !== false ? 'bold' : '900', cNameCfg.font || 'Prompt');
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 6;
          const drawName = truncate(cusTitle, cNameCfg.maxWidth || 380);
          ctx.fillText(drawName, 0, 0);

          // Thời gian (Vẽ nghiêng song song theo khung ngay sau tên giải, không đè nhau)
          if (cTimeCfg && cTimeCfg.x < 5000) {
            const nameWidth = ctx.measureText(drawName).width;
            const timeFontSize = cTimeCfg.size || 26;
            ctx.font = getFontWithFallback(timeFontSize, cTimeCfg.bold !== false ? 'bold' : '900', cTimeCfg.font || 'Prompt');
            ctx.fillStyle = cTimeCfg.color || '#FFFFFF';
            const gap = 30;
            ctx.fillText(timeLabel, nameWidth + gap, 0);
          }
          ctx.restore();
        } else {
          // Tên giải CUSTOM (customName)
          if (cfg.header.customName && cfg.header.customName.x < 10000) {
            const cNameCfg = cfg.header.customName;
            const cusTitle = (options.customTitle || options.roomTitle || 'CUSTOM FREE FIRE').trim().toUpperCase();
            ctx.save();
            ctx.textAlign = cNameCfg.align || 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = cNameCfg.color || '#FFFFFF';
            ctx.font = getFontWithFallback(cNameCfg.size || 40, cNameCfg.bold ? 'bold' : '900', cNameCfg.font || 'Prompt');
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            const drawName = truncate(cusTitle, cNameCfg.maxWidth || 1100);
            ctx.fillText(drawName, cNameCfg.x, cNameCfg.y);
            ctx.restore();
          }

          // Tên giải phụ 2 (customName2)
          if (cfg.header.customName2 && cfg.header.customName2.x < 10000) {
            const cName2Cfg = cfg.header.customName2;
            const cusTitle = (options.customTitle || options.roomTitle || 'CUSTOM FREE FIRE').trim().toUpperCase();
            ctx.save();
            ctx.textAlign = cName2Cfg.align || 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = cName2Cfg.color || '#FFFFFF';
            ctx.font = getFontWithFallback(cName2Cfg.size || 40, cName2Cfg.bold ? 'bold' : '900', cName2Cfg.font || 'Prompt');
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            const drawName = truncate(cusTitle, cName2Cfg.maxWidth || 1100);
            ctx.fillText(drawName, cName2Cfg.x, cName2Cfg.y);
            ctx.restore();
          }

          // Thời gian (customTime chuẩn DD/MM HH:mm)
          let timeLabel = this.formatLeaderboardTimeLabel(options.matchTime || options.timeStr, options.matches);

          if (cfg.header.customTime && cfg.header.customTime.x < 10000) {
            const cTimeCfg = cfg.header.customTime;
            ctx.save();
            ctx.textAlign = cTimeCfg.align || 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = cTimeCfg.color || '#FFFFFF';
            ctx.font = getFontWithFallback(cTimeCfg.size || 40, cTimeCfg.bold ? 'bold' : '900', cTimeCfg.font || 'Prompt');
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            ctx.fillText(timeLabel, cTimeCfg.x, cTimeCfg.y);
            ctx.restore();
          }

          // Thời gian phụ 2 (customTime2)
          if (cfg.header.customTime2 && cfg.header.customTime2.x < 10000) {
            const cTime2Cfg = cfg.header.customTime2;
            ctx.save();
            ctx.textAlign = cTime2Cfg.align || 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = cTime2Cfg.color || '#FFFFFF';
            ctx.font = getFontWithFallback(cTime2Cfg.size || 40, cTime2Cfg.bold ? 'bold' : '900', cTime2Cfg.font || 'Prompt');
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            ctx.fillText(timeLabel, cTime2Cfg.x, cTime2Cfg.y);
            ctx.restore();
          }
        }
      }

      // 4. Vẽ tên đội Booyah từng trận nếu có cấu hình BooyahGames (ví dụ Mẫu Doraemon)
      if (cfg.BooyahGames) {
        const matches = options.matches || [];
        const gameKeys = ['Game1', 'Game2', 'Game3', 'Game4', 'Game5', 'Game6'];
        gameKeys.forEach((gKey, gIdx) => {
          const gCfg = cfg.BooyahGames[gKey] || cfg.BooyahGames[`Game ${gIdx + 1}`];
          if (gCfg && gCfg.x < 5000 && gCfg.y < 5000) {
            let booyahTeamName = '';
            if (matches[gIdx] && Array.isArray(matches[gIdx].ranks)) {
              let booyahRank = matches[gIdx].ranks.find(r => Number(r.booyah) === 1);
              if (!booyahRank) {
                const hasBooyahField = matches[gIdx].ranks.some(r => r.booyah !== undefined && r.booyah !== null);
                if (!hasBooyahField) {
                  booyahRank = matches[gIdx].ranks.find(r => Number(r.rank) === 1);
                }
              }
              if (booyahRank) {
                const matchedTeam = teams.find(t => {
                  if (booyahRank.teamName && t.teamName && t.teamName.trim().toLowerCase() === booyahRank.teamName.trim().toLowerCase()) return true;
                  const pNames = booyahRank.accountNames || [];
                  if (t.accountNames && pNames.length > 0) {
                    let overlap = 0;
                    for (const name of pNames) {
                      if (name && t.accountNames.includes(name)) overlap++;
                    }
                    if (overlap >= 2 || (pNames.length <= 2 && overlap >= 1)) return true;
                  }
                  if (t.teamName && pNames.includes(t.teamName)) return true;
                  return false;
                });
                if (matchedTeam) booyahTeamName = matchedTeam.teamName;
                else booyahTeamName = ((booyahRank.accountNames && booyahRank.accountNames[0]) || booyahRank.teamName || booyahRank.name || '').trim();
              }
            }

            if (booyahTeamName) {
              ctx.save();
              ctx.textAlign = gCfg.align || 'left';
              ctx.textBaseline = 'middle';
              ctx.font = getFontWithFallback(gCfg.size || 18, gCfg.bold ? 'bold' : '', gCfg.font || 'Prompt');

              // Viền nét màu (hồng đậm cho mẫu 42 hoặc tùy chỉnh) và bóng đổ mềm giúp chữ nổi bật
              const strokeColor = gCfg.stroke || gCfg.strokeColor || cfg.BooyahGames?.stroke || cfg.BooyahGames?.strokeColor || (templateName === 'mau_42' ? '#B3125A' : 'rgba(0, 0, 0, 0.85)');
              const isPinkStroke = strokeColor.toLowerCase().includes('b3125a') || strokeColor.toLowerCase().includes('pink') || templateName === 'mau_42';

              ctx.shadowColor = isPinkStroke ? 'rgba(179, 18, 90, 0.5)' : (strokeColor.startsWith('#') ? strokeColor : 'rgba(0, 0, 0, 0.9)');
              ctx.shadowBlur = 5;
              ctx.shadowOffsetX = 1;
              ctx.shadowOffsetY = 1;

              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = gCfg.strokeWidth ?? 3.5;
              ctx.lineJoin = 'round';
              ctx.strokeText(truncate(booyahTeamName, gCfg.maxWidth || 215), gCfg.x, gCfg.y);

              ctx.fillStyle = gCfg.color || '#FFFFFF';
              ctx.fillText(truncate(booyahTeamName, gCfg.maxWidth || 215), gCfg.x, gCfg.y);
              ctx.restore();
            }
          }
        });

        // Vẽ logo đội Booyah từng game (LogosBooyah) nếu layout có cấu hình
        if (Array.isArray(cfg.BooyahGames.LogosBooyah)) {
          cfg.BooyahGames.LogosBooyah.forEach((lCfg) => {
            const gIdx = (lCfg.game || 1) - 1;
            const match = matches[gIdx];
            if (!match || !Array.isArray(match.ranks)) return;
            const booyahRank = match.ranks.find(r => Number(r.booyah) === 1) || match.ranks.find(r => Number(r.rank) === 1);
            if (!booyahRank) return;
            const matchedTeam = teams.find(t => {
              if (booyahRank.teamName && t.teamName && t.teamName.trim().toLowerCase() === booyahRank.teamName.trim().toLowerCase()) return true;
              const pIds = booyahRank.playerAccountIds || booyahRank.playerIds || [];
              if (t.playerAccountIds && pIds.length > 0) {
                let overlapId = 0;
                for (const id of pIds) {
                  if (id && t.playerAccountIds.includes(id)) overlapId++;
                }
                if (overlapId >= 2 || (pIds.length <= 2 && overlapId >= 1)) return true;
              }
              const pNames = booyahRank.accountNames || [];
              if (t.accountNames && pNames.length > 0) {
                let overlap = 0;
                for (const name of pNames) {
                  if (name && t.accountNames.includes(name)) overlap++;
                }
                if (overlap >= 2 || (pNames.length <= 2 && overlap >= 1)) return true;
              }
              if (t.teamName && pNames.includes(t.teamName)) return true;
              return false;
            });
            const bName = matchedTeam ? matchedTeam.teamName : ((booyahRank.accountNames && booyahRank.accountNames[0]) || booyahRank.teamName || '').trim();
            const bImg = getTeamLogo(bName, getTeamLogo(matchedTeam, teamLogoImg));
            if (bImg && lCfg.x < 10000 && lCfg.y < 10000) {
              ctx.save();
              ctx.beginPath();
              ctx.roundRect(lCfg.x, lCfg.y, lCfg.w || 100, lCfg.h || 100, 6);
              ctx.clip();
              ctx.drawImage(bImg, lCfg.x, lCfg.y, lCfg.w || 100, lCfg.h || 100);
              ctx.restore();
            }
          });
        }
      }

    } else {
      // MẪU 1 CỘT CHUẨN (Mẫu 1, Mẫu 2, Mẫu 3)
      const maxRows = Math.min(teams.length, cfg.rowY.length);
      for (let i = 0; i < maxRows; i++) {
        const y = cfg.rowY[i];
        drawRow(teams[i], cfg, y, `Đội ${i + 1}`);
      }
    }

    // 5. Vẽ viền sáng màu vàng xung quanh ô khung giờ (nếu mẫu có slotPills - ví dụ Mẫu 42)
    if (Array.isArray(cfg.slotPills) && cfg.slotPills.length > 0) {
      let matchedPill = null;
      const targetSlotId = options.slotId ? Number(options.slotId) : null;
      const targetHour = options.slotHour !== undefined ? Number(options.slotHour) : null;

      if (targetSlotId) {
        matchedPill = cfg.slotPills.find(p => p.id === targetSlotId);
      }
      if (!matchedPill && targetHour !== null && !isNaN(targetHour)) {
        matchedPill = cfg.slotPills.find(p => Array.isArray(p.hours) && p.hours.includes(targetHour));
      }

      if (matchedPill) {
        // 1. Vùng nền tỏa ánh sáng vàng ấm nhẹ bên trong ô
        ctx.save();
        const fillGrad = ctx.createLinearGradient(matchedPill.x, matchedPill.y, matchedPill.x, matchedPill.y + matchedPill.h);
        fillGrad.addColorStop(0, 'rgba(255, 235, 130, 0.22)');
        fillGrad.addColorStop(1, 'rgba(255, 180, 0, 0.12)');
        ctx.fillStyle = fillGrad;
        ctx.beginPath();
        ctx.roundRect(matchedPill.x, matchedPill.y, matchedPill.w, matchedPill.h, matchedPill.r || 20);
        ctx.fill();
        ctx.restore();

        // 2. Vầng hào quang vàng tỏa rộng (Outer Golden Halo / Aura)
        ctx.save();
        ctx.shadowColor = '#FFB300';
        ctx.shadowBlur = 24;
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.65)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.roundRect(matchedPill.x, matchedPill.y, matchedPill.w, matchedPill.h, matchedPill.r || 20);
        ctx.stroke();
        ctx.restore();

        // 3. Viền gradient kim loại vàng óng ánh (Metallic Gold Gradient Stroke)
        ctx.save();
        const strokeGrad = ctx.createLinearGradient(
          matchedPill.x, matchedPill.y,
          matchedPill.x + matchedPill.w, matchedPill.y + matchedPill.h
        );
        strokeGrad.addColorStop(0.0, '#FFE082');
        strokeGrad.addColorStop(0.2, '#FFF9C4');
        strokeGrad.addColorStop(0.45, '#FFD54F');
        strokeGrad.addColorStop(0.7, '#FFA000');
        strokeGrad.addColorStop(0.85, '#FFF9C4');
        strokeGrad.addColorStop(1.0, '#FFC107');

        ctx.shadowColor = '#FFE57F';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.roundRect(matchedPill.x, matchedPill.y, matchedPill.w, matchedPill.h, matchedPill.r || 20);
        ctx.stroke();
        ctx.restore();

        // 4. Đường nét highlight lấp lánh mảnh bên trong
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 240, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(matchedPill.x + 2, matchedPill.y + 2, matchedPill.w - 4, matchedPill.h - 4, (matchedPill.r || 20) - 2);
        ctx.stroke();
        ctx.restore();

        // 5. Ngôi sao lấp lánh (Sparkling Stars ✨) tỏa sáng ở các góc viền
        const drawSparkle = (cx, cy, size) => {
          ctx.save();
          ctx.shadowColor = '#FFF59D';
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(cx, cy - size);
          ctx.quadraticCurveTo(cx, cy, cx + size, cy);
          ctx.quadraticCurveTo(cx, cy, cx, cy + size);
          ctx.quadraticCurveTo(cx, cy, cx - size, cy);
          ctx.quadraticCurveTo(cx, cy, cx, cy - size);
          ctx.fill();

          const dSize = size * 0.45;
          ctx.beginPath();
          ctx.moveTo(cx - dSize, cy - dSize);
          ctx.lineTo(cx + dSize, cy + dSize);
          ctx.moveTo(cx - dSize, cy + dSize);
          ctx.lineTo(cx + dSize, cy - dSize);
          ctx.strokeStyle = 'rgba(255, 245, 157, 0.9)';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          ctx.fillStyle = '#FFFDE7';
          ctx.beginPath();
          ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        };

        drawSparkle(matchedPill.x + matchedPill.w - 6, matchedPill.y + 3, 10);
        drawSparkle(matchedPill.x + 6, matchedPill.y + matchedPill.h - 4, 8);
        drawSparkle(matchedPill.x + Math.round(matchedPill.w * 0.25), matchedPill.y - 1, 6);
      }
    }

    // 6. Vẽ hiệu ứng Neon Polygon phát sáng cho Khung Giờ (nếu mẫu có TimeSlots)
    if (cfg.TimeSlots && Array.isArray(cfg.TimeSlots.slots) && cfg.TimeSlots.slots.length > 0) {
      const slots = cfg.TimeSlots.slots;
      const style = cfg.TimeSlots.style || {};
      const layers = style.layers || [
        { width: 14, color: '#B6FF00', alpha: 0.35, blur: 10 },
        { width: 7, color: '#B6FF00', alpha: 0.8, blur: 4 },
        { width: 3, color: '#B6FF00', alpha: 1, blur: 0 },
        { width: 1.5, color: '#FFFFFF', alpha: 1, blur: 0 }
      ];

      let matchedSlot = null;
      const targetSlotId = options.slotId ? Number(options.slotId) : null;
      const targetHour = options.slotHour !== undefined ? Number(options.slotHour) : null;
      const timeQuery = String(options.matchTime || options.timeStr || '').trim().toLowerCase();

      // A. Khớp theo slotId (1..n)
      if (targetSlotId && targetSlotId >= 1 && targetSlotId <= slots.length) {
        matchedSlot = slots[targetSlotId - 1];
      }

      // B. Khớp theo chuỗi thời gian (ví dụ: "10:00", "13:00", "15:00", "20:00", "21:40", "23:30")
      if (!matchedSlot && timeQuery) {
        matchedSlot = slots.find(s => {
          const sTime = String(s.time || '').toLowerCase();
          const sNoColon = sTime.replace(':', 'h');
          return timeQuery.includes(sTime) || timeQuery.includes(sNoColon);
        });
      }

      // C. Khớp theo giờ (targetHour)
      if (!matchedSlot && targetHour !== null && !isNaN(targetHour)) {
        matchedSlot = slots.find(s => {
          const parts = String(s.time || '').split(':');
          const h = parseInt(parts[0], 10);
          return h === targetHour;
        });
      }

      // D. Nếu không truyền thông tin hoặc không khớp, tự động highlight khung giờ gần nhất theo giờ Việt Nam UTC+7
      if (!matchedSlot) {
        const now = new Date();
        const currentTotalMin = ((now.getUTCHours() + 7) % 24) * 60 + now.getUTCMinutes();
        let minDiff = Infinity;
        for (const s of slots) {
          const [sh, sm] = String(s.time || '0:0').split(':').map(Number);
          const slotMin = (sh || 0) * 60 + (sm || 0);
          const diff = Math.abs(currentTotalMin - slotMin);
          if (diff < minDiff) {
            minDiff = diff;
            matchedSlot = s;
          }
        }
      }

      if (matchedSlot && Array.isArray(matchedSlot.points) && matchedSlot.points.length >= 3) {
        const points = matchedSlot.points;

        // Vùng nền phát sáng nhẹ bên trong khung giờ
        ctx.save();
        ctx.beginPath();
        points.forEach(([px, py], pIdx) => {
          if (pIdx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        if (style.closePath !== false) ctx.closePath();
        ctx.fillStyle = 'rgba(182, 255, 0, 0.12)';
        ctx.fill();
        ctx.restore();

        // Vẽ từng lớp neon viền phát sáng (Layers)
        for (const layer of layers) {
          ctx.save();
          ctx.globalAlpha = layer.alpha !== undefined ? layer.alpha : 1;
          ctx.strokeStyle = layer.color || '#B6FF00';
          ctx.lineWidth = layer.width || 3;
          ctx.lineJoin = style.lineJoin || 'round';
          ctx.lineCap = 'round';
          if (layer.blur && layer.blur > 0) {
            ctx.shadowColor = layer.color || '#B6FF00';
            ctx.shadowBlur = layer.blur;
          } else {
            ctx.shadowBlur = 0;
          }

          ctx.beginPath();
          points.forEach(([px, py], pIdx) => {
            if (pIdx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          if (style.closePath !== false) {
            ctx.closePath();
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 3. Xuất file ảnh
    const fileName = `bxh_${Date.now()}.png`;
    const outputPath = path.join(this.outputDir, fileName);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
  }
}

export const imageService = new ImageService();
