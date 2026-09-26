// Log Service - Lưu trữ và phát sóng log thời gian thực cho Web Dashboard

class LogService {
  constructor() {
    this.logs = [];
    this.maxLogs = 500;
    this.logCounter = 0;
    this.intercepted = false;
  }

  init() {
    if (this.intercepted) return;
    this.intercepted = true;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    const formatArgs = (args) => {
      return args
        .map((a) => {
          if (typeof a === 'object') {
            try {
              return JSON.stringify(a, null, 2);
            } catch {
              return String(a);
            }
          }
          return String(a);
        })
        .join(' ');
    };

    const addLogEntry = (level, args) => {
      const text = formatArgs(args);
      const entry = {
        id: ++this.logCounter,
        time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
        level,
        message: text
      };
      this.logs.push(entry);
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }
    };

    console.log = (...args) => {
      addLogEntry('info', args);
      originalLog.apply(console, args);
    };

    console.info = (...args) => {
      addLogEntry('info', args);
      originalInfo.apply(console, args);
    };

    console.warn = (...args) => {
      addLogEntry('warn', args);
      originalWarn.apply(console, args);
    };

    console.error = (...args) => {
      addLogEntry('error', args);
      originalError.apply(console, args);
    };
  }

  getLogs(sinceId = 0) {
    if (!sinceId) return this.logs;
    const numId = Number(sinceId);
    return this.logs.filter((l) => l.id > numId);
  }

  clear() {
    this.logs = [];
  }
}

export const logService = new LogService();
