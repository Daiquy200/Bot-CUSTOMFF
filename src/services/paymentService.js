import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PAYMENT_CONFIG = {
  bankId: 'tpbank',
  bankName: 'TPBank (Ngân hàng Tiên Phong)',
  accountNo: '10002610909',
  accountName: 'LE DAI QUY',
  pricePerCredit: 250, // 250đ = 1 lượt
  qrTemplate: 'compact2' // compact2 | qr_only
};

class PaymentService {
  constructor() {
    this.outputDir = path.resolve(__dirname, '../../assets/output');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Tạo URL ảnh VietQR chuẩn
   * @param {string} keyName Tên key nạp
   * @param {number|null} amount Số tiền nạp (nếu null thì mã QR để trống số tiền để người nạp tự nhập tùy ý)
   */
  getVietQRUrl(keyName, amount = null) {
    const cleanKey = String(keyName).trim().toUpperCase();
    const memo = `NAP ${cleanKey}`;
    const encMemo = encodeURIComponent(memo);
    const encName = encodeURIComponent(PAYMENT_CONFIG.accountName);

    let url = `https://img.vietqr.io/image/${PAYMENT_CONFIG.bankId}-${PAYMENT_CONFIG.accountNo}-${PAYMENT_CONFIG.qrTemplate}.png?addInfo=${encMemo}&accountName=${encName}`;

    if (amount) {
      const amt = parseInt(amount, 10);
      if (amt >= 1000) {
        url += `&amount=${amt}`;
      }
    }

    return url;
  }

  /**
   * Tải ảnh VietQR về máy để gửi vào Zalo
   */
  async downloadQRImage(keyName, amount = null) {
    const qrUrl = this.getVietQRUrl(keyName, amount);
    const cleanKey = String(keyName).trim().toLowerCase();
    const fileName = `qr_nap_${cleanKey}_${Date.now()}.png`;
    const filePath = path.join(this.outputDir, fileName);

    try {
      const response = await axios({
        url: qrUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 10000
      });

      fs.writeFileSync(filePath, Buffer.from(response.data));
      return filePath;
    } catch (err) {
      console.error('⚠️ Lỗi khi tải ảnh VietQR:', err.message);
      return null;
    }
  }

  /**
   * Tạo tin nhắn thông tin nạp lượt ngắn gọn, súc tích dưới ảnh QR
   */
  formatPaymentInvoice(keyName, amount = null, currentCredits = 0) {
    const cleanKey = String(keyName).trim().toUpperCase();

    return `💳 NẠP LƯỢT KEY [${cleanKey.toLowerCase()}]
🏦 STK: ${PAYMENT_CONFIG.accountNo} (${PAYMENT_CONFIG.accountName}) - TPBank
⚠️ Nội dung CK: NAP ${cleanKey}
👤 Hiện có: ${currentCredits} lượt
⚡ Quét QR hoặc CK đúng cú pháp, bot tự cộng lượt 1-3s!`;
  }

  /**
   * Tính số lượt dựa trên số tiền nạp
   */
  calculateCredits(amount) {
    const amt = parseInt(amount, 10) || 0;
    const price = PAYMENT_CONFIG.pricePerCredit || 250;
    const credits = Math.floor(amt / price);
    return {
      amount: amt,
      credits,
      pricePerCredit: price
    };
  }

  /**
   * Bóc tách tên key từ nội dung chuyển khoản của ngân hàng
   * Ví dụ: "NAP TENKEY", "NAPTENKEY", "NAP TENKEY ZALO", "MBVCB... NAP TENKEY"
   */
  parseTransferContent(content) {
    if (!content || typeof content !== 'string') return null;

    // Loại bỏ dấu tiếng Việt và chuẩn hóa
    const normalized = content
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

    // Regex tìm NAP <KEY> hoặc NAP<KEY>
    // Ví dụ: NAP TENKEY, NAP_TENKEY, NAP-TENKEY, NAPTENKEY
    const match = normalized.match(/NAP[\s_-]*([A-Z0-9_]{2,20})/);
    if (match && match[1]) {
      const key = match[1].trim().toLowerCase();
      return { keyName: key, key };
    }

    return null;
  }

  /**
   * Tạo tin nhắn thông báo nạp tiền thành công gửi vào Zalo
   */
  formatPaymentSuccessMessage(keyName, amount, addedCredits, totalCredits) {
    const cleanKey = String(keyName).trim().toUpperCase();
    const formattedAmount = Number(amount || 0).toLocaleString('vi-VN');
    return (
      `🎉 NẠP LƯỢT THÀNH CÔNG! 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔑 Tên Key: [${cleanKey.toLowerCase()}]\n` +
      `💰 Số tiền nạp: ${formattedAmount} VNĐ\n` +
      `⚡ Lượt cộng thêm: +${addedCredits} lượt (250đ/lượt)\n` +
      `👥 Tổng lượt hiện có: ${totalCredits} lượt\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👉 Gõ .td <UID> để bắt đầu tính điểm ngay!`
    );
  }
}

export const paymentService = new PaymentService();
