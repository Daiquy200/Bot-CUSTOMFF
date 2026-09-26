import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đăng ký font hệ thống để hiển thị đầy đủ ký tự đặc biệt, icon game của Free Fire
const SYSTEM_FONTS = [
  'C:/Windows/Fonts/seguisym.ttf',
  'C:/Windows/Fonts/seguiemj.ttf',
  'C:/Windows/Fonts/malgun.ttf',
  'C:/Windows/Fonts/msgothic.ttc',
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/segoeui.ttf'
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

/**
 * =========================================================================
 * BẢNG CẤU HÌNH TỌA ĐỘ VÀ GIAO DIỆN TỪNG MẪU BẢNG XẾP HẠNG
 * =========================================================================
 * 👉 mau_1: Phôi Map Thi Đấu (ngang 1024x718, 4 Map bên trái + 12 hàng bên phải)
 * 👉 mau_2: Phôi Banner Vàng Đen Chiến Binh (dọc 1024x1536, 12 hàng dọc)
 * 👉 mau_3: Phôi Banner Xanh Lam Chiến Binh (dọc 1024x1536, 12 hàng dọc)
 * 👉 mau_4: Phôi Custom PQ Map Thi Đấu (dọc 741x1024, 12 hàng dọc + 4 Map Thi Đấu)
 * 👉 mau_5: Phôi Custom PQ Kimetsu (ngang 1024x576, Top 1 Champion + 2 Cột 12 Đội + 5 Map Booyah)
 */
export const TEMPLATE_CONFIGS = {
  // MẪU BXH CONAN & KAITO KID ESPORTS (Siêu Nét 2K Ultra HD: 2048x1152)
  bxhconan: {
    id: 'bxhconan',
    name: 'Mẫu BXH Conan & Kaito Kid Esports',
    file: 'bxhconan.png',
    type: 'conan_kaito',
    width: 2048,
    height: 1152,
    // Ô parallelogram phía trên:
    // - Bên trái màu xanh đậm: Tên CUSTOM
    titlePos: { x: 900, y: 168, fontSize: 28, align: 'center', color: '#ffffff', noStroke: true },
    // - Bên phải màu xanh nhạt: Thời gian
    timeBar: { x: 1170, y: 168, fontSize: 28, align: 'center', color: '#ffffff', format: 'DD/MM HH:mm' },
    // Ô trắng/kem bên dưới: Toàn bộ logo và tên custom căn giữa tuyệt đối
    bottomWhiteBox: { x: 908, y: 1056, fontSize: 30, align: 'center', color: '#0b2e4f', logoSize: 38, gap: 16 },
    // Khung logo của Top 1 bên trái (Kích thước 176x176 Siêu Nét 2K)
    logoPos: { x: 124, y: 756, size: 176, isSquare: true, borderRadius: 12, showBorder: false },
    // Top 1 Champion Box
    championBox: {
      teamName: { x: 650, y: 676, maxWidth: 350, fontSize: 36, align: 'center', color: '#ffffff' },
      booyah: { x: 690, y: 790, fontSize: 48, color: '#ffffff', align: 'center', padZero: false },
      kill: { x: 484, y: 936, fontSize: 48, color: '#ffffff', align: 'center' },
      totalPoints: { x: 716, y: 936, fontSize: 48, color: '#ffffff', align: 'center' }
    },
    // Bảng 11 hàng cho Top 2 -> Top 12
    rowY: [308, 370, 434, 498, 562, 626, 688, 752, 816, 880, 944],
    logoCol: { x: 952, size: 40 },
    teamName: { x: 1010, maxWidth: 280, align: 'left', color: '#ffffff', fontSize: 26 },
    kill: { x: 1316, align: 'center', color: '#ffffff', fontSize: 26 },
    booyah: { x: 1436, align: 'center', color: '#ffffff', fontSize: 26, padZero: false },
    totalPoints: { x: 1544, align: 'center', color: '#ffd700', fontSize: 26 },
    // 4 Ô Booyah Recap của Game 1, Game 2, Game 3, Game 4 bên phải
    mapBoxes: [
      { name: 'Game 1', x: 1760, y: 444, logoX: 1900, logoSize: 40, maxWidth: 240 },
      { name: 'Game 2', x: 1760, y: 564, logoX: 1900, logoSize: 40, maxWidth: 240 },
      { name: 'Game 3', x: 1760, y: 684, logoX: 1900, logoSize: 40, maxWidth: 240 },
      { name: 'Game 4', x: 1760, y: 804, logoX: 1900, logoSize: 40, maxWidth: 240 }
    ]
  }
};

class ImageService {
  constructor() {
    this.templatesDir = path.resolve(__dirname, '../../assets/templates');
    this.outputDir = path.resolve(__dirname, '../../assets/output');
    this.customConfigFile = path.join(this.templatesDir, 'templates_config.json');
    this.defaultTemplate = 'bxhconan';
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

  loadCustomConfigs() {
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
    return 'bxhconan';
  }

  getTemplateName(templateId) {
    this.loadCustomConfigs();
    return this.configs['bxhconan']?.name || 'Mẫu BXH Conan & Kaito Kid Esports';
  }

  getTemplateConfig(templateId) {
    this.loadCustomConfigs();
    return this.configs['bxhconan'] || TEMPLATE_CONFIGS['bxhconan'];
  }

  getTemplatePath(templateId) {
    const realId = this.resolveTemplateAlias(templateId);
    const exts = ['.png', '.jpg', '.jpeg'];
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
   * Tạo ảnh Bảng Xếp Hạng dựa trên phôi mẫu
   * @param {Array} teams Danh sách các đội đã xếp hạng (Top 1 -> 12)
   * @param {Object} options Cấu hình: template, matches, v.v.
   */
  async generateLeaderboardImage(teams, options = {}) {
    const requested = options.template || options.templateId || this.defaultTemplate;
    const templateName = this.resolveTemplateAlias(requested);
    let templatePath = path.join(this.templatesDir, `${templateName}.png`);

    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(this.templatesDir, 'bxhconan.png');
    }

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Không tìm thấy file phôi mẫu ảnh tại: ${templatePath}`);
    }

    this.loadCustomConfigs();
    const cfg = this.configs[templateName] || this.configs['bxhconan'] || TEMPLATE_CONFIGS['bxhconan'];

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

      ctx.font = `bold ${cfg.timeBox.fontSize || 12}px "Segoe UI", Tahoma, Arial, sans-serif`;
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
      let timeLabel = options.matchTime || options.timeStr || '';
      if (!timeLabel) {
        const matches = options.matches || [];
        let matchTs = null;
        for (const m of matches) {
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
        if (cfg.timeBar.format === 'DD/MM HH:mm' || cfg.type === 'conan_kaito') {
          timeLabel = `${pad(vnNow.getDate())}/${pad(vnNow.getMonth() + 1)} ${pad(vnNow.getHours())}:${pad(vnNow.getMinutes())}`;
        } else {
          timeLabel = `${pad(vnNow.getHours())}:${pad(vnNow.getMinutes())} ${pad(vnNow.getDate())}/${pad(vnNow.getMonth() + 1)}`;
        }
      } else {
        const mMatch = timeLabel.match(/(\d{1,2})[h:](\d{2}).*?(\d{1,2})\/(\d{1,2})/);
        if (mMatch) {
          const pad = n => String(n).padStart(2, '0');
          if (cfg.timeBar.format === 'DD/MM HH:mm' || cfg.type === 'conan_kaito') {
            timeLabel = `${pad(mMatch[3])}/${pad(mMatch[4])} ${pad(mMatch[1])}:${pad(mMatch[2])}`;
          } else {
            timeLabel = `${pad(mMatch[1])}:${pad(mMatch[2])} ${pad(mMatch[3])}/${pad(mMatch[4])}`;
          }
        }
      }

      ctx.save();
      const isItalic = cfg.timeBar.italic !== false && cfg.type !== 'conan_kaito';
      ctx.font = `${isItalic ? 'bold italic' : 'bold'} ${cfg.timeBar.fontSize || 15}px "Segoe UI", "Segoe UI Symbol", Arial, sans-serif`;
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
    if (options.logoPath && fs.existsSync(options.logoPath)) {
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

    // Vẽ Tên Giải CUSTOM nếu có
    if (options.customTitle) {
      try {
        const titleCfg = cfg.titlePos || { x: canvas.width / 2, y: 50, fontSize: 22, align: 'center', color: '#ffd700' };
        ctx.save();
        ctx.font = `900 ${titleCfg.fontSize || 22}px "Segoe UI", "Malgun Gothic", "MS Gothic", Arial, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        const titleText = String(options.customTitle).trim().toUpperCase();
        let drawX = titleCfg.x;

        if (titleCfg.withSocialIcons) {
          // Vẽ bộ icon YTB, FB, TIKTOK phía trước rồi viết tên custom
          drawX = drawSocialIcons(titleCfg.x, titleCfg.y, 16);
          ctx.textAlign = 'left';
        } else {
          ctx.textAlign = titleCfg.align || 'center';
        }

        if (cfg.type !== 'conan_kaito' && !titleCfg.noStroke) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3.5;
          ctx.strokeText(titleText, drawX, titleCfg.y);
        } else {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 3;
        }
        ctx.fillStyle = titleCfg.color || '#ffd700';
        ctx.fillText(titleText, drawX, titleCfg.y);
        ctx.restore();
      } catch (err) {
        console.error('⚠️ [IMAGE SERVICE] Lỗi khi vẽ customTitle:', err.message);
      }
    }

    ctx.textBaseline = 'middle';

    // Helper rút gọn tên nếu quá dài
    const truncate = (text, maxWidth) => {
      let str = (text || '').trim();
      while (ctx.measureText(str).width > maxWidth && str.length > 3) {
        str = str.slice(0, -1);
      }
      if (str !== (text || '').trim() && str.length > 3) {
        str = str.slice(0, -2) + '...';
      }
      return str;
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
      ctx.font = `bold ${rowConfig.teamName.fontSize || 14}px "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", "Malgun Gothic", "MS Gothic", Arial, sans-serif`;
      const name = truncate(team?.teamName || defaultName, rowConfig.teamName.maxWidth || 200);
      ctx.fillText(name, rowConfig.teamName.x, y);

      // Kill
      ctx.textAlign = rowConfig.kill.align || 'center';
      ctx.fillStyle = rowConfig.kill.color || '#ffffff';
      ctx.font = `bold ${rowConfig.kill.fontSize || 15}px "Segoe UI", Tahoma, Arial, sans-serif`;
      ctx.fillText(String(team?.killCount ?? 0), rowConfig.kill.x, y);

      // Booyah
      ctx.textAlign = rowConfig.booyah.align || 'center';
      ctx.fillStyle = rowConfig.booyah.color || '#ffd700';
      ctx.font = `bold ${rowConfig.booyah.fontSize || 15}px "Segoe UI", Tahoma, Arial, sans-serif`;
      ctx.fillText(String(team?.booyahCount ?? 0), rowConfig.booyah.x, y);

      // Total Points
      ctx.textAlign = rowConfig.totalPoints.align || 'center';
      ctx.fillStyle = rowConfig.totalPoints.color || '#ff3b30';
      ctx.font = `bold ${rowConfig.totalPoints.fontSize || 16}px "Segoe UI", Tahoma, Arial, sans-serif`;
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
            ctx.font = 'bold 13px "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", Arial, sans-serif';
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
          ctx.font = `bold ${cBox.teamName.fontSize || 20}px "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", "Malgun Gothic", "MS Gothic", Arial, sans-serif`;
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
          ctx.font = `bold ${cBox.kill.fontSize || 18}px "Segoe UI", Tahoma, Arial, sans-serif`;
          ctx.fillStyle = cBox.kill.color || '#0b2e4f';
          ctx.textAlign = cBox.kill.align || 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(top1.killCount ?? 0), cBox.kill.x, cBox.kill.y);
          ctx.restore();
        }

        // BOOYAH Top 1
        if (cBox.booyah) {
          ctx.save();
          ctx.font = `bold ${cBox.booyah.fontSize || 18}px "Segoe UI", Tahoma, Arial, sans-serif`;
          ctx.fillStyle = cBox.booyah.color || '#0b2e4f';
          ctx.textAlign = cBox.booyah.align || 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(top1.booyahCount ?? 0), cBox.booyah.x, cBox.booyah.y);
          ctx.restore();
        }

        // PTS Top 1
        if (cBox.totalPoints) {
          ctx.save();
          ctx.font = `bold ${cBox.totalPoints.fontSize || 20}px "Segoe UI", Tahoma, Arial, sans-serif`;
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
        ctx.font = `bold ${cNameCfg.fontSize || 20}px "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", "Malgun Gothic", "MS Gothic", Arial, sans-serif`;
        ctx.fillStyle = cNameCfg.color || '#ffd700';
        ctx.textAlign = cNameCfg.align || 'left';
        ctx.textBaseline = 'middle';
        const top1Name = truncate(top1.teamName || 'Đội Vô Địch', cNameCfg.maxWidth || 255);
        ctx.fillText(top1Name, cNameCfg.x || 145, cNameCfg.y || 415);

        // Top 1 Stats
        const sCfg = cfg.championBox.stats || {};
        const statY = sCfg.y || 478;
        ctx.font = `bold ${sCfg.fontSize || 14}px "Segoe UI", Tahoma, Arial, sans-serif`;
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
            ctx.font = 'bold 12px "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", "Malgun Gothic", "MS Gothic", Arial, sans-serif';
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
        ctx.font = `bold italic ${cfg.bottomBar.fontSize || 13}px "Segoe UI", "Segoe UI Symbol", Tahoma, Arial, sans-serif`;
        ctx.fillStyle = cfg.bottomBar.color || '#ffd700';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 3;

        // Tính giờ ngày bắn (theo giờ Việt Nam UTC+7)
        let timeLabel = options.matchTime || options.timeStr || '';
        if (!timeLabel) {
          const matches = options.matches || [];
          let matchTs = null;
          for (const m of matches) {
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
          timeLabel = `${pad(vnNow.getHours())}h${pad(vnNow.getMinutes())} - ${pad(vnNow.getDate())}/${pad(vnNow.getMonth() + 1)}/${vnNow.getFullYear()}`;
        }

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
          ctx.font = `bold ${cBox.teamName.fontSize || 18}px "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", "Malgun Gothic", "MS Gothic", Arial, sans-serif`;
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
          ctx.font = `900 ${cBox.booyah.fontSize || 24}px "Segoe UI", Tahoma, Arial, sans-serif`;
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
          ctx.font = `900 ${cBox.kill.fontSize || 24}px "Segoe UI", Tahoma, Arial, sans-serif`;
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
          ctx.font = `900 ${cBox.totalPoints.fontSize || 24}px "Segoe UI", Tahoma, Arial, sans-serif`;
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

        // 1. Logo vuông nhỏ bo góc cạnh số thứ tự
        if (teamLogoImg && cfg.logoCol) {
          const lX = cfg.logoCol.x || 952;
          const lS = cfg.logoCol.size || 40;
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(lX, y - lS / 2, lS, lS, 4);
          ctx.clip();
          ctx.drawImage(teamLogoImg, lX, y - lS / 2, lS, lS);
          ctx.restore();
        }

        // 2. Tên đội
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 6;
        ctx.textAlign = cfg.teamName.align || 'left';
        ctx.fillStyle = cfg.teamName.color || '#ffffff';
        ctx.font = `bold ${cfg.teamName.fontSize || 26}px "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", "Malgun Gothic", "MS Gothic", Arial, sans-serif`;
        const name = truncate(team?.teamName || `Đội ${i + 2}`, cfg.teamName.maxWidth || 280);
        ctx.fillText(name, cfg.teamName.x, y);

        // 3. Kill
        ctx.textAlign = cfg.kill.align || 'center';
        ctx.fillStyle = cfg.kill.color || '#ffffff';
        ctx.font = `900 ${cfg.kill.fontSize || 26}px "Segoe UI", Tahoma, Arial, sans-serif`;
        ctx.fillText(String(team?.killCount ?? 0), cfg.kill.x, y);

        // 4. Booyah định dạng 2 chữ số (00, 01, 02)
        ctx.textAlign = cfg.booyah.align || 'center';
        ctx.fillStyle = cfg.booyah.color || '#ffffff';
        ctx.font = `900 ${cfg.booyah.fontSize || 26}px "Segoe UI", Tahoma, Arial, sans-serif`;
        const byStr = cfg.booyah.padZero
          ? String(team?.booyahCount ?? 0).padStart(2, '0')
          : String(team?.booyahCount ?? 0);
        ctx.fillText(byStr, cfg.booyah.x, y);

        // 5. Total Points (PTS màu vàng gold)
        ctx.textAlign = cfg.totalPoints.align || 'center';
        ctx.fillStyle = cfg.totalPoints.color || '#ffd700';
        ctx.font = `900 ${cfg.totalPoints.fontSize || 26}px "Segoe UI", Tahoma, Arial, sans-serif`;
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
            ctx.font = `bold ${box.fontSize || 24}px "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", "Malgun Gothic", "MS Gothic", Arial, sans-serif`;
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
        ctx.font = `900 ${bw.fontSize || 30}px "Segoe UI", "Malgun Gothic", Arial, sans-serif`;
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
          ctx.font = `900 ${bw.fontSize || 30}px "Segoe UI", "Malgun Gothic", Arial, sans-serif`;
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

    } else {
      // MẪU 1 CỘT CHUẨN (Mẫu 1, Mẫu 2, Mẫu 3)
      const maxRows = Math.min(teams.length, cfg.rowY.length);
      for (let i = 0; i < maxRows; i++) {
        const y = cfg.rowY[i];
        drawRow(teams[i], cfg, y, `Đội ${i + 1}`);
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
