/**
 * 窗口 IPC 处理器 - v1.0.0
 * 修复关闭按钮：使用 app.quit() 确保进程彻底退出
 */
const { ipcMain, app } = require('electron');

let mainWindow = null;

function registerWindowHandlers(window) {
  mainWindow = window;

  ipcMain.handle('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  // 关闭按钮：彻底退出进程
  ipcMain.handle('window-close', () => {
    if (mainWindow) {
      mainWindow.destroy();
      mainWindow = null;
    }
    // 确保进程退出
    app.quit();
  });

  // quit：彻底退出
  ipcMain.handle('window-quit', () => {
    if (mainWindow) {
      mainWindow.destroy();
      mainWindow = null;
    }
    app.quit();
  });

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  if (mainWindow) {
    mainWindow.on('maximize', () => {
      mainWindow.webContents.send('window-maximized-changed', true);
    });
    mainWindow.on('unmaximize', () => {
      mainWindow.webContents.send('window-maximized-changed', false);
    });
  }
}

module.exports = { registerWindowHandlers };
