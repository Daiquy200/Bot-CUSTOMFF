import { Zalo, LoginQRCallbackEventType } from 'zca-js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const sessionPath = path.resolve(process.cwd(), 'zalo_session.json');
const qrPath = path.resolve(process.cwd(), 'qr_pc.png');

try { if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath); } catch (e) {}
try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath); } catch (e) {}

async function startLogin() {
  console.log('🚀 ĐANG KHỞI TẠO MÃ QR ĐĂNG NHẬP TRÊN MÁY TÍNH CỦA BẠN...');
  const zalo = new Zalo({ selfListen: false });

  try {
    await zalo.loginQR({ qrPath }, async (event) => {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated: {
          await event.actions.saveToFile(qrPath);
          console.log('\n==============================================================');
          console.log('📷 ĐÃ TẠO MÃ QR THÀNH CÔNG TRÊN MÁY TÍNH!');
          console.log('👉 Ảnh QR đang được mở trên màn hình Windows của bạn.');
          console.log('👉 Mở App Zalo trên điện thoại quét mã và bấm [Đăng nhập] ngay!');
          console.log('==============================================================\n');
          exec(`cmd.exe /c start "" "${qrPath}"`);
          break;
        }
        case LoginQRCallbackEventType.QRCodeScanned: {
          console.log('📲 ĐÃ QUÉT MÃ QR! Vui lòng bấm [ĐĂNG NHẬP] trên điện thoại để xác nhận...');
          break;
        }
        case LoginQRCallbackEventType.QRCodeExpired: {
          console.log('⏳ Mã QR hết hạn. Đang tự động tạo mã QR mới...');
          if (event.actions?.retry) event.actions.retry();
          break;
        }
        case LoginQRCallbackEventType.QRCodeDeclined: {
          console.log('❌ Bạn đã bấm từ chối trên điện thoại.');
          process.exit(1);
          break;
        }
        case LoginQRCallbackEventType.GotLoginInfo: {
          fs.writeFileSync(sessionPath, JSON.stringify(event.data, null, 2), 'utf8');
          console.log('\n==============================================================');
          console.log('🎉 ĐĂNG NHẬP ZALO THÀNH CÔNG RỒI!');
          console.log(`📁 File lưu phiên: ${sessionPath}`);
          console.log('👉 BƯỚC CUỐI CÙNG: Bạn chỉ cần kéo thả file zalo_session.json vào MobaXterm trên VPS!');
          console.log('==============================================================\n');
          setTimeout(() => process.exit(0), 1500);
          break;
        }
      }
    });
  } catch (err) {
    console.error('⚠️ Kết nối Zalo bị gián đoạn, đang tự tạo lại mã sau 3s...', err.message);
    setTimeout(startLogin, 3000);
  }
}

startLogin();
