/**
 * 笔记 IPC 处理器
 */
const { ipcMain } = require('electron');
const crypto = require('crypto');
const storage = require('../storage');

// 生成随机 UUID
function generateUUID() {
  return crypto.randomBytes(16).toString('hex');
}

function registerNotesHandlers() {
  ipcMain.handle('notes-list', async (event, { sortBy = 'updatedAt', order = 'desc' } = {}) => {
    const password = storage.getPassword();
    if (!password) return [];

    const ids = storage.listNotes();
    const notes = [];

    for (const id of ids) {
      const note = storage.loadNote(id);
      if (note) {
        notes.push({
          id: note.id,
          title: note.title || '无标题',
          preview: (note.content || '').substring(0, 100),
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          tags: note.tags || [],
        });
      }
    }

    notes.sort((a, b) => {
      let valA = a[sortBy] || 0;
      let valB = b[sortBy] || 0;
      return order === 'desc' ? valB - valA : valA - valB;
    });

    return notes;
  });

  ipcMain.handle('notes-get', async (event, id) => {
    const password = storage.getPassword();
    if (!password) return null;
    return storage.loadNote(id);
  });

  ipcMain.handle('notes-create', async (event, { title = '', content = '' } = {}) => {
    const password = storage.getPassword();
    if (!password) return null;

    const now = Date.now();
    const note = {
      id: generateUUID(),
      title, content,
      createdAt: now,
      updatedAt: now,
      tags: [],
    };

    storage.saveNote(note.id, note);
    return note;
  });

  ipcMain.handle('notes-save', async (event, note) => {
    const password = storage.getPassword();
    if (!password) return { success: false };
    note.updatedAt = Date.now();
    storage.saveNote(note.id, note);
    return { success: true };
  });

  ipcMain.handle('notes-delete', async (event, id) => {
    const password = storage.getPassword();
    if (!password) return { success: false };
    const note = storage.loadNote(id);
    if (note?.imageIds) note.imageIds.forEach(imgId => storage.deleteImage(imgId));
    storage.deleteNote(id);
    return { success: true };
  });

  ipcMain.handle('notes-search', async (event, keyword) => {
    const password = storage.getPassword();
    if (!password) return [];
    if (!keyword?.trim()) return [];

    const ids = storage.listNotes();
    const results = [];
    const kw = keyword.toLowerCase();

    for (const id of ids) {
      const note = storage.loadNote(id);
      if (note) {
        const titleMatch = (note.title || '').toLowerCase().includes(kw);
        const contentMatch = (note.content || '').toLowerCase().includes(kw);
        if (titleMatch || contentMatch) {
          results.push({
            id: note.id,
            title: note.title || '无标题',
            preview: (note.content || '').substring(0, 100),
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            tags: note.tags || [],
          });
        }
      }
    }
    return results;
  });
}

module.exports = { registerNotesHandlers };
