import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MenuRenderService {
  constructor() {
    this.cachedImagePath = path.resolve(__dirname, '../../assets/menu_commands.png');
  }

  /**
   * Lấy đường dẫn file ảnh menu lệnh (nếu đã có sẵn ảnh trong assets thì dùng ngay,
   * nếu chưa có thì tự động vẽ bằng @napi-rs/canvas tương thích 100% cả Windows và Linux VPS)
   * @returns {Promise<string>} Đường dẫn tới file ảnh menu
   */
  async renderMenuImage() {
    const assetsDir = path.dirname(this.cachedImagePath);
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Nếu ảnh mẫu đã có sẵn trong assets thì gửi ngay lập tức (< 5ms)
    if (fs.existsSync(this.cachedImagePath) && fs.statSync(this.cachedImagePath).size > 1000) {
      return this.cachedImagePath;
    }

    // Vẽ menu bằng @napi-rs/canvas (Không cần trình duyệt, không lỗi VPS)
    return await this.generateCanvasMenu();
  }

  /**
   * Tạo ảnh menu chất lượng cao bằng canvas thuần
   */
  async generateCanvasMenu() {
    const width = 1080;
    const height = 1150;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Nền Gradient Cyberpunk Dark
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0b0e14');
    bgGradient.addColorStop(0.5, '#151922');
    bgGradient.addColorStop(1, '#0d1117');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Khung thẻ chính
    const pad = 35;
    const boxW = width - pad * 2;
    const boxH = height - pad * 2;
    ctx.fillStyle = 'rgba(22, 27, 34, 0.9)';
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.35)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, pad, pad, boxW, boxH, 20);
    ctx.fill();
    ctx.stroke();

    // 3. HEADER
    ctx.fillStyle = '#ffd700';
    this.roundRect(ctx, pad + 25, pad + 25, 55, 55, 14);
    ctx.fill();

    ctx.fillStyle = '#0b0e14';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FF', pad + 25 + 27.5, pad + 25 + 27.5);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('PQ BOT • MENU LỆNH', pad + 95, pad + 45);

    ctx.fillStyle = '#8b949e';
    ctx.font = '14px sans-serif';
    ctx.fillText('Hệ thống tính điểm tự động kết nối Garena API & Quản lý giải đấu', pad + 95, pad + 70);

    // Badge 17 Lệnh
    ctx.fillStyle = 'rgba(255, 215, 0, 0.12)';
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
    this.roundRect(ctx, width - pad - 160, pad + 25, 135, 55, 20);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('17 LỆNH', width - pad - 92.5, pad + 45);
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.fillText('ĐANG HOẠT ĐỘNG', width - pad - 92.5, pad + 65);

    // Đường gạch ngang phân cách
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + 25, pad + 100);
    ctx.lineTo(width - pad - 25, pad + 100);
    ctx.stroke();

    // 4. DANH SÁCH CÁC MỤC LỆNH
    let startY = pad + 125;
    const colW = (boxW - 60) / 2;

    // Cột 1: Tính Điểm & BXH
    this.drawSection(ctx, pad + 25, startY, colW, 250, '📊 1. TÍNH ĐIỂM & BXH', '#58a6ff', [
      { cmd: '.td <UID> [ca] [key]', desc: 'Tính điểm khung giờ (1-8). Trượt gõ: td 1' },
      { cmd: '.td <UID> [ca] xoa1', desc: 'Tự trừ 1 trận thấp nhất khi thi đấu 7 trận' },
      { cmd: '.bxh <ID1> <ID2>...', desc: 'Tổng hợp BXH nhiều trận đấu theo danh sách ID' }
    ]);

    // Cột 2: Key & Thuê Bot
    this.drawSection(ctx, pad + 35 + colW, startY, colW, 250, '🎫 2. KEY CÁ NHÂN & THUÊ BOT', '#ffd700', [
      { cmd: '.key tao <tên_key>', desc: 'Tạo key mới (TẶNG NGAY 5 LƯỢT dùng thử)' },
      { cmd: '.napluot <key> [tiền]', desc: 'Tạo mã QR nạp lượt tự động (250đ/lượt)' },
      { cmd: '.key <tên_key>', desc: 'Kiểm tra số dư lượt và hạn dùng của Key' },
      { cmd: '.key edit <tên_key>', desc: 'Đổi tên giải & logo riêng hiển thị trên BXH' },
      { cmd: '.luotdung', desc: 'Kích hoạt dùng thử vô hạn lượt cho toàn Box' }
    ]);

    startY += 275;

    // Cột 1 hàng 2: Quản Trị & Bảo Vệ
    this.drawSection(ctx, pad + 25, startY, colW, 250, '🛡️ 3. QUẢN TRỊ & BẢO VỆ BOX (QTV)', '#f85149', [
      { cmd: '.anti', desc: 'Cài đặt 16 tính năng Bảo Vệ (spam, link, avt...)' },
      { cmd: '.kick @tên / UID', desc: 'Kick thành viên (hoặc trượt tin nhắn + .kick)' },
      { cmd: '.kickall', desc: 'Lọc sạch thành viên thường (2 QTV xác nhận)' }
    ]);

    // Cột 2 hàng 2: QR & Ngân Hàng
    this.drawSection(ctx, pad + 35 + colW, startY, colW, 250, '💳 4. QR & NGÂN HÀNG (QTV)', '#3fb950', [
      { cmd: 'qr / mã / stk', desc: 'Thành viên nhắn tự do (không cần dấu .) để lấy QR' },
      { cmd: '.doiqr', desc: 'Đổi mã QR riêng cho nhóm (gửi kèm ảnh hoặc trượt ảnh)' },
      { cmd: '.setstk <STK> <Bank>', desc: 'Cài đặt số tài khoản & tên ngân hàng của nhóm' },
      { cmd: '.ctk <Tên_CTK>', desc: 'Cài đặt tên chủ tài khoản nhận tiền | .xoaqr' }
    ]);

    startY += 275;

    // Hàng 3 (Toàn chiều rộng): Hệ Thống
    this.drawSection(ctx, pad + 25, startY, boxW - 50, 150, '⚙️ 5. HỆ THỐNG & TIỆN ÍCH BOT', '#bc8cff', [
      { cmd: '.check / !check', desc: 'Kiểm tra kết nối Cookie Garena API (Online / Offline)' },
      { cmd: '.cookie <Cookie>', desc: 'Cập nhật Cookie Garena trực tiếp trong Zalo khi Cookie cũ hết hạn' }
    ]);

    // 5. FOOTER
    ctx.fillStyle = '#8b949e';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('💡 Mẹo: Quẹt phải (trượt tin nhắn) UID để tính điểm nhanh | Quản trị viên box có toàn quyền lệnh', pad + 30, height - pad - 20);

    ctx.textAlign = 'right';
    ctx.fillText('Phát triển & Tối ưu bởi Daiquy', width - pad - 30, height - pad - 20);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(this.cachedImagePath, buffer);
    return this.cachedImagePath;
  }

  drawSection(ctx, x, y, w, h, title, titleColor, items) {
    ctx.fillStyle = 'rgba(30, 36, 46, 0.6)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = titleColor;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(title, x + 16, y + 14);

    let itemY = y + 42;
    for (const item of items) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      this.roundRect(ctx, x + 12, itemY, w - 24, 38, 8);
      ctx.fill();

      // Dải viền màu bên trái item
      ctx.fillStyle = titleColor;
      this.roundRect(ctx, x + 12, itemY, 4, 38, 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.fillText(item.cmd, x + 24, itemY + 6);

      ctx.fillStyle = '#c9d1d9';
      ctx.font = '12px sans-serif';
      ctx.fillText(item.desc, x + 24, itemY + 22);

      itemY += 42;
    }
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

export const menuRenderService = new MenuRenderService();
