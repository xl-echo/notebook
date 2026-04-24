/**
 * 认证 IPC 处理器
 */
const { ipcMain, dialog, app, shell } = require('electron');
const path = require('path');
const storage = require('../storage');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30000;

let mainWindow = null;

function registerAuthHandlers(window) {
  mainWindow = window;

  ipcMain.handle('auth-select-data-dir', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择数据存放目录',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return { success: false, canceled: true };
      }
      const dirPath = result.filePaths[0];
      storage.setDataDir(dirPath);
      return { success: true, dir: dirPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth-get-data-dir', () => storage.getDataDir());
  ipcMain.handle('auth-is-first-run', () => storage.isFirstRun());

  ipcMain.handle('auth-register', async (event, { username, password, createShortcut }) => {
    if (!storage.isFirstRun()) return { success: false, error: '已存在账户' };
    if (!username || username.length < 2) return { success: false, error: '用户名至少2个字符' };
    if (!password || password.length < 8) return { success: false, error: '密码至少8位' };
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return { success: false, error: '密码需包含字母和数字' };

    const passwordHash = storage.hashPassword(password);
    const dataDir = storage.getDataDir();
    storage.createConfig(username, passwordHash, dataDir);
    storage.setPassword(passwordHash);
    storage.clearLock();

    if (createShortcut) {
      try {
        const desktopPath = app.getPath('desktop');
        await shell.writeShortcutLink(path.join(desktopPath, 'SecureNotes.lnk'), {
          target: process.execPath,
          description: 'SecureNotes 加密笔记本',
          icon: process.execPath,
        });
      } catch (e) {
        console.error('创建快捷方式失败:', e);
      }
    }
    return { success: true };
  });

  ipcMain.handle('auth-login', async (event, { username, password }) => {
    const lockInfo = storage.getLockInfo();
    if (lockInfo && lockInfo.failedCount >= MAX_FAILED_ATTEMPTS) {
      const elapsed = Date.now() - lockInfo.lockedAt;
      if (elapsed < LOCK_DURATION_MS) {
        const remainingTime = Math.ceil((LOCK_DURATION_MS - elapsed) / 1000);
        return { success: false, error: `密码错误过多，请 ${remainingTime} 秒后重试`, locked: true, remainingTime };
      }
      // 锁定时间已过，自动清除
      storage.clearLock();
    }

    if (!username || !password) return { success: false, error: '请输入用户名和密码' };

    const passwordHash = storage.hashPassword(password);
    const config = storage.loadConfig(passwordHash);
    const currentLockInfo = storage.getLockInfo();
    const prevFailed = currentLockInfo ? currentLockInfo.failedCount : 0;

    if (!config) {
      const failedCount = prevFailed + 1;
      storage.setLockInfo(failedCount);
      if (failedCount >= MAX_FAILED_ATTEMPTS) {
        return { success: false, error: `密码错误 ${failedCount} 次，临时锁定 30 秒`, locked: true, remainingTime: 30 };
      }
      return { success: false, error: `用户名或密码错误，剩余尝试次数: ${MAX_FAILED_ATTEMPTS - failedCount}` };
    }

    if (config.username !== username) {
      const failedCount = prevFailed + 1;
      storage.setLockInfo(failedCount);
      if (failedCount >= MAX_FAILED_ATTEMPTS) {
        return { success: false, error: `密码错误 ${failedCount} 次，临时锁定 30 秒`, locked: true, remainingTime: 30 };
      }
      return { success: false, error: `用户名或密码错误，剩余尝试次数: ${MAX_FAILED_ATTEMPTS - failedCount}` };
    }

    // 登录成功
    const oldPwd = storage.getPassword();
    storage.setPassword(passwordHash);
    storage.clearLock();
    console.log('[auth] 登录成功, 旧密码:' + (oldPwd ? '已设置' : 'NULL') + ', 新密码hash:' + passwordHash.substring(0, 16) + '...');
    return { success: true, username: config.username };
  });

  ipcMain.handle('auth-logout', () => { storage.setPassword(null); return { success: true }; });
  ipcMain.handle('auth-is-logged-in', () => storage.getPassword() !== null);

  ipcMain.handle('auth-get-user', () => {
    const pwd = storage.getPassword();
    if (!pwd) return null;
    try { const c = storage.loadConfig(pwd); return c ? c.username : null; } catch (e) { return null; }
  });
}

module.exports = { registerAuthHandlers };
