import axios from 'axios';
import { config } from '../config.js';

function formatGarenaError(error, context = '') {
  const status = error.response?.status;
  if (status === 422) {
    return context ? `UID/ID [${context}] không hợp lệ hoặc không tìm thấy trên máy chủ Garena.` : 'Dữ liệu không hợp lệ hoặc không tìm thấy (422).';
  }
  if (status === 401) {
    return 'Cookie Garena đã hết hạn. Vui lòng lấy lại Cookie mới cập nhật vào .env!';
  }
  if (status === 403) {
    return 'Bị Garena chặn truy cập (403 Forbidden). Vui lòng thử lại sau!';
  }
  if (status === 404) {
    return 'Không tìm thấy dữ liệu trên máy chủ Garena (404).';
  }
  if (status >= 500) {
    return 'Máy chủ Garena đang bảo trì hoặc gặp sự cố. Vui lòng thử lại sau!';
  }

  const data = error.response?.data;
  if (typeof data === 'string' && data.length > 0) return data;
  if (data?.message) return String(data.message);
  if (data?.error) {
    return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
  }
  return error.message || 'Lỗi kết nối máy chủ Garena.';
}

class GarenaService {
  constructor() {
    this.client = axios.create({
      baseURL: config.garena.baseUrl,
      timeout: 15000,
      headers: {
        'User-Agent': config.garena.userAgent,
        'Cookie': config.garena.cookie,
        'Referer': config.garena.referer,
        'Origin': config.garena.origin,
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Cập nhật Cookie mới khi phiên cũ hết hạn
   */
  updateCookie(newCookie) {
    config.garena.cookie = newCookie;
    this.client.defaults.headers['Cookie'] = newCookie;
  }

  /**
   * 1. Lấy thông tin tài khoản người dùng
   */
  async getUserProfile() {
    try {
      const res = await this.client.get('/player/get');
      return { success: true, data: res.data?.player };
    } catch (error) {
      return {
        success: false,
        error: formatGarenaError(error, 'Tài khoản'),
        status: error.response?.status
      };
    }
  }

  /**
   * 2. Lấy danh sách các giải đấu của người dùng đã tạo
   */
  async getUserLeagues() {
    try {
      const res = await this.client.get('/player/get-leagues');
      return { success: true, leagues: res.data?.leagues || [] };
    } catch (error) {
      return {
        success: false,
        error: formatGarenaError(error, 'Giải đấu'),
        status: error.response?.status
      };
    }
  }

  /**
   * 3. Lấy chi tiết thông tin 1 giải đấu
   */
  async getLeagueDetail(leagueId) {
    try {
      const res = await this.client.get(`/league/get?leagueId=${leagueId}`);
      return { success: true, league: res.data?.league };
    } catch (error) {
      return {
        success: false,
        error: formatGarenaError(error, `Giải đấu ${leagueId}`),
        status: error.response?.status
      };
    }
  }

  /**
   * 4. Lấy chi tiết 1 trận đấu theo Match ID
   * @param {string|number} matchId
   */
  async getMatchDetail(matchId) {
    try {
      const res = await this.client.post('/match', { matchId: String(matchId) });
      if (res.data && res.data.match) {
        return { success: true, match: res.data.match };
      }
      return { success: false, message: 'Không tìm thấy dữ liệu trận đấu.' };
    } catch (error) {
      if (error.response?.status === 422) {
        return { success: false, message: `ID trận [${matchId}] không tồn tại hoặc chưa kết thúc.` };
      }
      return {
        success: false,
        error: formatGarenaError(error, `Trận đấu ${matchId}`),
        message: formatGarenaError(error, `Trận đấu ${matchId}`),
        status: error.response?.status
      };
    }
  }

  /**
   * 5. Tìm kiếm các trận đấu theo UID người chơi
   * @param {string|number} accountId UID người chơi
   * @param {number} startOrDays Số ngày (nếu không truyền end) hoặc unix timestamp bắt đầu
   * @param {number|null} endTimestamp unix timestamp kết thúc (tùy chọn)
   */
  async findMatchesByPlayer(accountId, startOrDays = 7, endTimestamp = null) {
    try {
      let startTime;
      let endTime;

      if (endTimestamp !== null) {
        startTime = Number(startOrDays);
        endTime = Number(endTimestamp);
      } else {
        endTime = Math.floor(Date.now() / 1000);
        startTime = endTime - (Number(startOrDays) * 86400);
      }

      const res = await this.client.post('/player/find-match', {
        accountId: Number(accountId),
        startTime,
        endTime
      });

      return { success: true, matches: res.data?.matches || [] };
    } catch (error) {
      return {
        success: false,
        error: formatGarenaError(error, accountId),
        status: error.response?.status
      };
    }
  }

  /**
   * 6. Tính tổng điểm các trận đấu đã diễn ra
   * Tự động tổng hợp điểm, số kill, booyah của các đội qua các trận
   * @param {Array<string|number>} matchIds Danh sách ID các trận đấu
   * @param {string|number|null} leagueId ID giải đấu (tùy chọn)
   */
  async calculateTournamentScores(matchIds, leagueId = null) {
    try {
      const ids = matchIds.map(id => String(id).trim()).filter(Boolean);
      if (ids.length === 0) {
        return { success: false, error: 'Danh sách ID trận đấu trống.' };
      }

      // 1. Tải chi tiết từng trận đấu
      const matchPromises = ids.map(id => this.getMatchDetail(id));
      const matchResults = await Promise.all(matchPromises);

      const validMatches = [];
      for (const res of matchResults) {
        if (res.success && res.match && Array.isArray(res.match.ranks)) {
          validMatches.push(res.match);
        }
      }

      if (validMatches.length === 0) {
        return { success: false, error: 'Không lấy được dữ liệu của bất kỳ trận đấu nào trong danh sách.' };
      }

      // 2. Thuật toán gom đội và tính tổng điểm chuẩn Free Fire
      const teams = [];

      function findOrCreateTeam(rankData) {
        const pNames = rankData.accountNames || [];
        const pIds = rankData.playerAccountIds || [];
        const teamName = (rankData.teamName || '').trim();

        // Khớp theo teamName nếu có
        if (teamName) {
          const found = teams.find(t => t.teamName && t.teamName.toLowerCase() === teamName.toLowerCase());
          if (found) return found;
        }

        // Khớp theo ID người chơi (trùng >= 2 người)
        for (const t of teams) {
          let overlap = 0;
          for (const id of pIds) {
            if (id && t.playerAccountIds.includes(id)) overlap++;
          }
          if (overlap >= 2 || (pIds.length <= 2 && overlap >= 1)) {
            return t;
          }
        }

        // Khớp theo tên người chơi (trùng >= 2 tên)
        for (const t of teams) {
          let overlap = 0;
          for (const name of pNames) {
            if (name && t.accountNames.includes(name)) overlap++;
          }
          if (overlap >= 2 || (pNames.length <= 2 && overlap >= 1)) {
            return t;
          }
        }

        // Đặt tên hiển thị cho đội: chỉ lấy tên của 1 thành viên đầu tiên trong danh sách 4 người
        let displayName = '';
        if (pNames.length > 0 && pNames[0] && String(pNames[0]).trim()) {
          displayName = String(pNames[0]).trim();
        } else if (teamName) {
          displayName = teamName.trim();
        } else {
          displayName = `Đội ${teams.length + 1}`;
        }

        const newTeam = {
          teamName: displayName,
          accountNames: [...pNames],
          playerAccountIds: [...pIds],
          booyahCount: 0,
          killCount: 0,
          totalPoints: 0,
          matchesPlayed: 0
        };
        teams.push(newTeam);
        return newTeam;
      }

      // Cộng dồn từng trận
      for (const m of validMatches) {
        for (const r of m.ranks) {
          const t = findOrCreateTeam(r);
          t.booyahCount += Number(r.booyah || 0);
          t.killCount += Number(r.kill || 0);
          t.totalPoints += Number(r.score || 0);
          t.matchesPlayed += 1;
        }
      }

      // 3. Sắp xếp bảng xếp hạng: Điểm tổng giảm dần -> Booyah giảm dần -> Kill giảm dần
      teams.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        if (b.booyahCount !== a.booyahCount) return b.booyahCount - a.booyahCount;
        return b.killCount - a.killCount;
      });

      const aggregatedTeamRanks = teams.map((t, index) => ({
        rank: index + 1,
        teamName: t.teamName,
        booyahCount: t.booyahCount,
        killCount: t.killCount,
        rankPoints: Math.max(0, t.totalPoints - t.killCount),
        totalPoints: t.totalPoints,
        matchesPlayed: t.matchesPlayed,
        accountNames: t.accountNames
      }));

      return {
        success: true,
        aggregatedTeamRanks,
        matches: validMatches
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Lỗi khi tổng hợp điểm các trận đấu.'
      };
    }
  }
}

export const garenaService = new GarenaService();
