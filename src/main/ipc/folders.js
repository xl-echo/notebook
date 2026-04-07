/**
 * 文件夹 IPC 处理器
 * 文件夹数据保存在 folders.sndb2（加密）
 */
const { ipcMain } = require('electron');
const crypto = require('crypto');
const storage = require('../storage');

function generateUUID() {
  return crypto.randomBytes(8).toString('hex');
}

// ---- 文件夹元数据持久化 ----
// 格式: { folders: [{id,name,order},...], noteOrder: [noteId,...], noteFolders: {noteId: folderId} }

function loadMeta() {
  const raw = storage.loadMeta();
  if (!raw) return { folders: [], noteOrder: [], noteFolders: {} };
  return raw;
}

function saveMeta(meta) {
  storage.saveMeta(meta);
}

function registerFoldersHandlers() {

  // 获取所有文件夹
  ipcMain.handle('folders-list', async () => {
    const meta = loadMeta();
    return meta.folders || [];
  });

  // 新建文件夹
  ipcMain.handle('folders-create', async (event, { name }) => {
    const meta = loadMeta();
    const folder = { id: 'folder_' + generateUUID(), name: name || '新建文件夹', order: meta.folders.length };
    meta.folders.push(folder);
    saveMeta(meta);
    return folder;
  });

  // 重命名文件夹
  ipcMain.handle('folders-rename', async (event, { id, name }) => {
    const meta = loadMeta();
    const folder = meta.folders.find(f => f.id === id);
    if (folder) folder.name = name;
    saveMeta(meta);
    return { success: !!folder };
  });

  // 删除文件夹（文件夹内笔记移到根目录）
  ipcMain.handle('folders-delete', async (event, id) => {
    const meta = loadMeta();
    meta.folders = meta.folders.filter(f => f.id !== id);
    // 把该文件夹下的笔记移回根
    Object.keys(meta.noteFolders).forEach(noteId => {
      if (meta.noteFolders[noteId] === id) {
        delete meta.noteFolders[noteId];
      }
    });
    saveMeta(meta);
    return { success: true };
  });

  // 移动笔记到文件夹（folderId 为 null 表示移到根）
  ipcMain.handle('note-move-folder', async (event, { noteId, folderId }) => {
    const meta = loadMeta();
    if (folderId) {
      meta.noteFolders[noteId] = folderId;
    } else {
      delete meta.noteFolders[noteId];
    }
    saveMeta(meta);
    return { success: true };
  });

  // 保存笔记顺序
  ipcMain.handle('note-reorder', async (event, { noteOrder }) => {
    const meta = loadMeta();
    meta.noteOrder = noteOrder;
    saveMeta(meta);
    return { success: true };
  });

  // 获取 meta（包含顺序和文件夹归属）
  ipcMain.handle('meta-get', async () => {
    return loadMeta();
  });
}

module.exports = { registerFoldersHandlers };
