/**
 * SecureNotes v1.0.0 主进程入口
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

// 日志文件路径
const LOG_FILE = path.join(app.getPath('userData'), 'debug.log');

// 清空日志文件
try {
  fs.writeFileSync(LOG_FILE, '', 'utf8');
} catch (e) {}

// 写日志到文件
ipcMain.handle('write-log', async (event, msg) => {
  const time = new Date().toLocaleString();
  const logLine = `[${time}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logLine, 'utf8');
  } catch (e) {}
  return true;
});

const storage = require('./storage');
const windowIPC = require('./ipc/window');
const authIPC = require('./ipc/auth');
const notesIPC = require('./ipc/notes');
const imageIPC = require('./ipc/image');
const foldersIPC = require('./ipc/folders');

let mainWindow = null;

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false,
    backgroundColor: '#f0f4f8',
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  windowIPC.registerWindowHandlers(mainWindow);
  authIPC.registerAuthHandlers(mainWindow);
  notesIPC.registerNotesHandlers();
  imageIPC.registerImageHandlers();
  foldersIPC.registerFoldersHandlers();

  mainWindow.on('closed', () => {
    storage.setPassword(null);
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  storage.setPassword(null);
});
