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
 * 👉 mau_1: Phôi Cus Cỏ (dọc 592x1024, nền đỏ/trắng, chữ đen)
 * 👉 mau_2: Phôi Cus ĐQ@ (dọc 592x1024, nền đỏ/đen/trắng, 12 hàng dọc)
 * 👉 mau_3: Phôi Cus ĐQ@ 2 Cột (ngang 1024x768, Top 1-6 trái & Top 7-12 phải)
 * 👉 mau_4: Phôi Map Thi Đấu (ngang 1024x718, 4 Map bên trái + 12 hàng bên phải)
 * 👉 mau_5: Phôi Mẫu 5 (dự phòng)
 * 👉 mau_6: Phôi Naruto Booyah (dọc 741x1024, 12 hàng dọc)
 * 👉 mau_7: Phôi Naruto Phú Quý (dọc 741x1024, 12 hàng dọc + ô đồng hồ ngày giờ)
 * 👉 mau_8: Phôi Custom PQ Map Thi Đấu (dọc 741x1024, 12 hàng dọc + 4 Map Thi Đấu)
 */
export const TEMPLATE_CONFIGS = {
  // MẪU #1: CUS ĐQ@ (Dọc 592x1024, 12 hàng dọc)
  mau_1: {
    id: 'mau_1',
    name: 'Mẫu #1: Cus ĐQ@ (Dọc 12 hàng)',
    file: 'mau_1.png',
    type: 'single_column',
    rowY: [325, 383, 437, 491, 545, 599, 653, 707, 763, 816, 870, 923],
    teamName: { x: 110, maxWidth: 240, align: 'left', color: '#111111', fontSize: 14 },
    kill: { x: 385, align: 'center', color: '#1a1a1a', fontSize: 16 },
    booyah: { x: 452, align: 'center', color: '#c47d00', fontSize: 16 },
    totalPoints: { x: 523, align: 'center', color: '#b80000', fontSize: 17 }
  },

  // MẪU #2: CUS ĐQ@ 2 CỘT (Ngang 1024x768, Top 1-6 trái & Top 7-12 phải)
  mau_2: {
    id: 'mau_2',
    name: 'Mẫu #2: Cus ĐQ@ (Ngang 2 cột)',
    file: 'mau_2.png',
    type: 'two_columns',
    rowYLeft: [382, 438, 494, 550, 606, 662],
    leftCol: {
      teamName: { x: 205, maxWidth: 170, align: 'center', color: '#ffffff', fontSize: 14 },
      kill: { x: 336, align: 'center', color: '#ffffff', fontSize: 15 },
      booyah: { x: 402, align: 'center', color: '#ffd700', fontSize: 15 },
      totalPoints: { x: 470, align: 'center', color: '#ff3b30', fontSize: 16 }
    },
    rowYRight: [382, 438, 494, 550, 606, 662],
    rightCol: {
      teamName: { x: 675, maxWidth: 170, align: 'center', color: '#ffffff', fontSize: 14 },
      kill: { x: 812, align: 'center', color: '#ffffff', fontSize: 15 },
      booyah: { x: 880, align: 'center', color: '#ffd700', fontSize: 15 },
      totalPoints: { x: 950, align: 'center', color: '#ff3b30', fontSize: 16 }
    }
  },

  // MẪU #3: MAP THI ĐẤU (Ngang 1024x718: 4 Map trái + 12 hàng phải)
  mau_3: {
    id: 'mau_3',
    name: 'Mẫu #3: Map Thi Đấu (Ngang kèm 4 Map Booyah)',
    file: 'mau_3.png',
    type: 'with_maps',
    rowY: [252, 285, 318, 351, 385, 418, 452, 485, 519, 552, 586, 619],
    teamName: { x: 565, maxWidth: 210, align: 'center', color: '#ffffff', fontSize: 14 },
    kill: { x: 734, align: 'center', color: '#ffffff', fontSize: 15 },
    booyah: { x: 833, align: 'center', color: '#ffd700', fontSize: 15 },
    totalPoints: { x: 930, align: 'center', color: '#ff3b30', fontSize: 16 },
    mapBoxes: [
      { name: 'Đảo Quân Sự',     x: 268, y: 228, maxWidth: 175 },
      { name: 'Đảo Thiên Đường', x: 268, y: 348, maxWidth: 175 },
      { name: 'Đảo Sa Mạc',      x: 268, y: 468, maxWidth: 175 },
      { name: 'Đảo Bình Minh',   x: 268, y: 588, maxWidth: 175 }
    ]
  },

  // MẪU #4: BANNER VÀNG ĐEN CHIẾN BINH (Dọc 1024x1536)
  mau_4: {
    id: 'mau_4',
    name: 'Mẫu #4: Banner Vàng Đen (Dọc 12 hàng)',
    file: 'mau_4.png',
    type: 'single_column',
    rowY: [534, 597, 660, 723, 786, 849, 912, 975, 1038, 1101, 1164, 1227],
    teamName: { x: 455, maxWidth: 200, align: 'left', color: '#ffffff', fontSize: 18 },
    kill: { x: 706, align: 'center', color: '#ffffff', fontSize: 18 },
    booyah: { x: 812, align: 'center', color: '#ffd700', fontSize: 18 },
    totalPoints: { x: 928, align: 'center', color: '#ffd700', fontSize: 20 }
  },

  // MẪU #5: BANNER XANH LAM CHIẾN BINH (Dọc 1024x1536)
  mau_5: {
    id: 'mau_5',
    name: 'Mẫu #5: Banner Xanh Lam (Dọc 12 hàng)',
    file: 'mau_5.png',
    type: 'single_column',
    rowY: [567, 629, 691, 753, 815, 877, 939, 1001, 1063, 1125, 1187, 1249],
    teamName: { x: 455, maxWidth: 200, align: 'left', color: '#ffffff', fontSize: 18 },
    kill: { x: 715, align: 'center', color: '#ffffff', fontSize: 18 },
    booyah: { x: 822, align: 'center', color: '#ffd700', fontSize: 18 },
    totalPoints: { x: 929, align: 'center', color: '#ffd700', fontSize: 20 }
  },

  // MẪU #6: NARUTO BOOYAH (Dọc 741x1024, 12 hàng dọc)
  mau_6: {
    id: 'mau_6',
    name: 'Mẫu #6: Naruto Booyah (Dọc 12 hàng)',
    file: 'mau_6.png',
    type: 'single_column',
    rowY: [486, 525, 560, 595, 629, 664, 699, 734, 768, 803, 838, 872],
    teamName: { x: 165, maxWidth: 205, align: 'left', color: '#ffffff', fontSize: 14 },
    kill: { x: 430, align: 'center', color: '#ffffff', fontSize: 15 },
    booyah: { x: 530, align: 'center', color: '#ffd700', fontSize: 15 },
    totalPoints: { x: 622, align: 'center', color: '#ffd700', fontSize: 16 }
  },

  // MẪU #7: NARUTO PHÚ QUÝ (Dọc 741x1024, 12 hàng dọc kèm ô đồng hồ ngày giờ)
  mau_7: {
    id: 'mau_7',
    name: 'Mẫu #7: Naruto Phú Quý (Dọc 12 hàng + Đồng hồ)',
    file: 'mau_7.png',
    type: 'single_column',
    timeBox: { x: 588, y: 437, fontSize: 12, color: '#ffd700', clockRadius: 5.5 },
    rowY: [505, 542, 573, 601, 632, 662, 694, 726, 755, 783, 814, 846],
    teamName: { x: 175, maxWidth: 165, align: 'left', color: '#ffffff', fontSize: 13 },
    kill: { x: 400, align: 'center', color: '#ffffff', fontSize: 14 },
    booyah: { x: 517, align: 'center', color: '#ffd700', fontSize: 14 },
    totalPoints: { x: 621, align: 'center', color: '#ffd700', fontSize: 15 }
  },

  // MẪU #8: CUSTOM PQ MAP THI ĐẤU (Dọc 741x1024: 12 hàng dọc + 4 Map Thi Đấu)
  mau_8: {
    id: 'mau_8',
    name: 'Mẫu #8: Custom PQ (Dọc 12 hàng + 4 Map Thi Đấu)',
    file: 'mau_8.png',
    type: 'with_maps',
    rowY: [356, 396, 436, 476, 516, 555, 594, 634, 673, 713, 752, 792],
    teamName: { x: 124, maxWidth: 236, align: 'left', color: '#ffffff', fontSize: 17 },
    kill: { x: 420, align: 'center', color: '#ffffff', fontSize: 19 },
    booyah: { x: 538, align: 'center', color: '#ffd700', fontSize: 19 },
    totalPoints: { x: 655, align: 'center', color: '#ffd700', fontSize: 21 },
    mapBoxes: [
      { name: 'Đảo Quân Sự',     x: 118, y: 895, maxWidth: 155 },
      { name: 'Đảo Sa Mạc',      x: 290, y: 895, maxWidth: 155 },
      { name: 'Đảo Thiên Đường', x: 463, y: 895, maxWidth: 155 },
      { name: 'Đảo Bình Minh',   x: 637, y: 895, maxWidth: 155 }
    ]
  }
};

class ImageService {
  constructor() {
    this.templatesDir = path.resolve(__dirname, '../../assets/templates');
    this.outputDir = path.resolve(__dirname, '../../assets/output');
    this.customConfigFile = path.join(this.templatesDir, 'templates_config.json');
    this.defaultTemplate = 'mau_1';
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

  getTemplateName(templateId) {
    this.loadCustomConfigs();
    if (this.configs[templateId]) {
      return this.configs[templateId].name;
    }
    return templateId;
  }

  getTemplateConfig(templateId) {
    this.loadCustomConfigs();
    return this.configs[templateId] || this.configs['mau_1'];
  }

  getTemplatePath(templateId) {
    const exts = ['.png', '.jpg', '.jpeg'];
    for (const ext of exts) {
      const p = path.join(this.templatesDir, `${templateId}${ext}`);
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
      { ranks: [{ rank: 1, teamName: '1VienM590' }] }
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
    const templateName = options.template || this.defaultTemplate;
    let templatePath = path.join(this.templatesDir, `${templateName}.png`);

    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(this.templatesDir, 'mau_1.png');
    }

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Không tìm thấy file phôi mẫu ảnh tại: ${templatePath}`);
    }

    this.loadCustomConfigs();
    const cfg = this.configs[templateName] || this.configs['mau_1'] || TEMPLATE_CONFIGS['mau_1'];

    const templateImg = await loadImage(templatePath);
    const canvas = createCanvas(templateImg.width, templateImg.height);
    const ctx = canvas.getContext('2d');

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
    } else {
      // MẪU 1 CỘT CHUẨN (Mẫu 1, Mẫu 2, Mẫu 5)
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
