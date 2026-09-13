import { garenaService } from './services/garenaService.js';
import {
  formatMatchDetail,
  formatAggregatedScores,
  formatPlayerMatches,
  formatHelp
} from './utils/formatters.js';
import { validateConfig } from './config.js';

async function main() {
  if (!validateConfig()) {
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const command = args[0] ? args[0].toLowerCase() : 'help';

  console.log('⚡ [CLI TÍNH ĐIỂM FREE FIRE] ⚡\n');

  switch (command) {
    case 'check': {
      console.log('🔄 Đang kiểm tra kết nối API Garena...');
      const res = await garenaService.getUserProfile();
      if (res.success && res.data) {
        console.log('✅ KẾT NỐI THÀNH CÔNG!');
        console.log('Tên hiển thị:', res.data.nickName);
        console.log('Account ID:', res.data.accountId);
        console.log('Level:', res.data.level);
      } else {
        console.error('❌ KẾT NỐI THẤT BẠI:', res.error || 'Cookie không hợp lệ hoặc đã hết hạn.');
      }
      break;
    }

    case 'td': {
      const accountId = args[1];
      const slotId = parseInt(args[2] || '6', 10);
      const dateStr = args[3];
      if (!accountId) {
        console.log('⚠️ Vui lòng nhập UID. Ví dụ: node src/cli.js td 1618746773 6 07/09');
        return;
      }
      import('./utils/formatters.js').then(async ({ getSlotTimestamps, formatSlotLeaderboard, parseDateInput }) => {
        const customDate = dateStr ? parseDateInput(dateStr) : null;
        const slotData = getSlotTimestamps(slotId, customDate);
        if (!slotData) {
          console.log('⚠️ Khung giờ không hợp lệ (1-8).');
          return;
        }
        console.log(`🔄 Đang tìm các trận của UID [${accountId}] trong khung giờ [${slotData.slot.label}] ngày ${slotData.dateLabel}...`);
        const res = await garenaService.findMatchesByPlayer(accountId, slotData.startTime, slotData.endTime);
        if (!res.success) {
          console.error('❌ Lỗi:', res.error);
          return;
        }
        const matches = res.matches || [];
        if (matches.length === 0) {
          console.log(`⚠️ Không tìm thấy trận đấu nào trong khung giờ [${slotData.slot.label}] ngày ${slotData.dateLabel}.`);
          console.log(`👉 Bạn có thể thử tìm ngày khác: node src/cli.js td ${accountId} ${slotId} 07/09`);
          return;
        }
        const matchIds = matches.map(m => m.id || m.matchId);
        console.log(`🎯 Tìm thấy ${matchIds.length} trận (${matchIds.join(', ')}). Đang tính điểm...`);
        const scoreRes = await garenaService.calculateTournamentScores(matchIds);
        if (scoreRes.success && scoreRes.aggregatedTeamRanks) {
          const { imageService } = await import('./services/imageService.js');
          const imgPath = await imageService.generateLeaderboardImage(scoreRes.aggregatedTeamRanks);
          console.log('\n🎨 ĐÃ XUẤT ẢNH BẢNG XẾP HẠNG THÀNH CÔNG!');
          console.log('👉 File ảnh:', imgPath);
          console.log('\n' + formatSlotLeaderboard(slotData.slot.label, slotData.dateLabel, accountId, matchIds, scoreRes.aggregatedTeamRanks));
        } else {
          console.error('❌ Lỗi tính điểm:', scoreRes.error);
        }
      });
      break;
    }

    case 'diem': {
      const matchId = args[1];
      if (!matchId) {
        console.log('⚠️ Vui lòng nhập ID trận đấu. Ví dụ: node src/cli.js diem 123456');
        return;
      }
      console.log(`🔄 Đang lấy dữ liệu trận [${matchId}]...`);
      const res = await garenaService.getMatchDetail(matchId);
      if (res.success && res.match) {
        console.log('\n' + formatMatchDetail(res.match));
      } else {
        console.error('❌ Lỗi:', res.message || res.error);
      }
      break;
    }

    case 'tongdiem': {
      const matchIds = args.slice(1);
      if (matchIds.length === 0) {
        console.log('⚠️ Vui lòng nhập danh sách ID trận. Ví dụ: node src/cli.js tongdiem 12345 12346');
        return;
      }
      console.log(`🔄 Đang tính tổng điểm cho các trận: ${matchIds.join(', ')}...`);
      const res = await garenaService.calculateTournamentScores(matchIds);
      if (res.success && res.aggregatedTeamRanks) {
        console.log('\n' + formatAggregatedScores(res.aggregatedTeamRanks, matchIds));
      } else {
        console.error('❌ Lỗi tính điểm:', res.error || 'Không tính được điểm.');
      }
      break;
    }

    case 'timtran': {
      const accountId = args[1];
      const days = parseInt(args[2] || '7', 10);
      if (!accountId) {
        console.log('⚠️ Vui lòng nhập UID người chơi. Ví dụ: node src/cli.js timtran 1043310641 7');
        return;
      }
      console.log(`🔄 Đang tìm các trận đấu của UID [${accountId}] trong ${days} ngày qua...`);
      const res = await garenaService.findMatchesByPlayer(accountId, days);
      if (res.success) {
        console.log('\n' + formatPlayerMatches(accountId, res.matches));
      } else {
        console.error('❌ Lỗi:', res.error);
      }
      break;
    }

    case 'quetmau':
    case 'themmau': {
      const imagePath = args[1];
      const customId = args[2] || `mau_${Date.now()}`;
      if (!imagePath) {
        console.log('⚠️ Vui lòng nhập đường dẫn file ảnh phôi cần quét.');
        console.log('Ví dụ: node src/cli.js quetmau assets/templates/mau_1.png mau_moi');
        return;
      }
      try {
        const { aiService } = await import('./services/aiService.js');
        const { imageService } = await import('./services/imageService.js');
        console.log(`🤖 Đang dùng AI phân tích phôi: ${imagePath}...`);
        const templateConfig = await aiService.analyzeLeaderboardTemplate(imagePath);
        templateConfig.name = `Mẫu AI: ${customId}`;
        const savedPath = imageService.saveCustomTemplate(customId, templateConfig, imagePath);
        console.log(`✅ Đã lưu cấu hình phôi [${customId}] vào templates_config.json!`);
        console.log(`🖼️ Đang tạo ảnh thử nghiệm (demo preview)...`);
        const demoPath = await imageService.generateDemoPreview(customId);
        console.log(`🎉 ĐÃ HOÀN TẤT!`);
        console.log(`👉 File ảnh phôi: ${savedPath}`);
        console.log(`👉 File ảnh demo: ${demoPath}`);
        console.log(`👉 Dùng mẫu này bằng lệnh: .mau ${customId}`);
      } catch (err) {
        console.error('❌ Lỗi quét mẫu:', err.message);
      }
      break;
    }

    default:
      console.log(formatHelp('node src/cli.js '));
      break;
  }
}

main().catch(err => {
  console.error('❌ Lỗi chương trình:', err);
});
