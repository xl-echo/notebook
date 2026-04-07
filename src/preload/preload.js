/**
 * 预加载脚本
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 调试日志
  writeLog: (msg) => ipcRenderer.invoke('write-log', msg),

  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  quit: () => ipcRenderer.invoke('window-quit'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => {
    ipcRenderer.on('window-maximized-changed', (event, isMaximized) => callback(isMaximized));
  },

  selectDataDir: () => ipcRenderer.invoke('auth-select-data-dir'),
  getDataDir: () => ipcRenderer.invoke('auth-get-data-dir'),
  isFirstRun: () => ipcRenderer.invoke('auth-is-first-run'),
  register: (data) => ipcRenderer.invoke('auth-register', data),
  login: (data) => ipcRenderer.invoke('auth-login', data),
  logout: () => ipcRenderer.invoke('auth-logout'),
  isLoggedIn: () => ipcRenderer.invoke('auth-is-logged-in'),
  getUser: () => ipcRenderer.invoke('auth-get-user'),

  notesList: (options) => ipcRenderer.invoke('notes-list', options || {}),
  notesGet: (id) => ipcRenderer.invoke('notes-get', id),
  notesCreate: (data) => ipcRenderer.invoke('notes-create', data),
  notesSave: (note) => ipcRenderer.invoke('notes-save', note),
  notesDelete: (id) => ipcRenderer.invoke('notes-delete', id),
  notesSearch: (keyword) => ipcRenderer.invoke('notes-search', keyword),

  imageSave: (data) => ipcRenderer.invoke('image-save', data),
  imageLoad: (id) => ipcRenderer.invoke('image-load', id),
  imageDelete: (id) => ipcRenderer.invoke('image-delete', id),

  fileSave: (data) => ipcRenderer.invoke('file-save', data),
  fileLoad: (id) => ipcRenderer.invoke('file-load', id),
  fileDelete: (id) => ipcRenderer.invoke('file-delete', id),

  // 文件夹 & 元数据
  metaGet: () => ipcRenderer.invoke('meta-get'),
  foldersList: () => ipcRenderer.invoke('folders-list'),
  foldersCreate: (data) => ipcRenderer.invoke('folders-create', data),
  foldersRename: (data) => ipcRenderer.invoke('folders-rename', data),
  foldersDelete: (id) => ipcRenderer.invoke('folders-delete', id),
  noteMoveFolder: (data) => ipcRenderer.invoke('note-move-folder', data),
  noteReorder: (data) => ipcRenderer.invoke('note-reorder', data),
});
