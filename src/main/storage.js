/**
 * 存储模块
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('./crypto');
const NodeCrypto = require('crypto');  // Node.js 原生 crypto 模块

let DATA_DIR = null;
let currentPassword = null;

const CONFIG_DIR = path.join(os.homedir(), '.SecureNotes');
const PATH_INFO_FILE = path.join(CONFIG_DIR, 'path.inf');

function loadSavedPaths() {
  if (fs.existsSync(PATH_INFO_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PATH_INFO_FILE, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function savePathInfo(dataDir) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(PATH_INFO_FILE, JSON.stringify({ dataDir }), 'utf8');
}

function setDataDir(dirPath) {
  DATA_DIR = dirPath;
  savePathInfo(dirPath);
  ensureDirs();
}

function getDataDir() { return DATA_DIR; }
function setPassword(pwd) { currentPassword = pwd; }
function getPassword() { return currentPassword; }

function ensureDirs() {
  if (!DATA_DIR) return;
  [DATA_DIR, getNotesDir(), getImagesDir(), getFilesDir()].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function getConfigFile() { return DATA_DIR ? path.join(DATA_DIR, 'config.sndb2') : null; }
function getLockFile() { return DATA_DIR ? path.join(DATA_DIR, 'lock.sndb2') : null; }
function getMetaFile() { return DATA_DIR ? path.join(DATA_DIR, 'meta.sndb2') : null; }
function getNotesDir() { return DATA_DIR ? path.join(DATA_DIR, 'notes') : null; }
function getImagesDir() { return DATA_DIR ? path.join(DATA_DIR, 'images') : null; }
function getFilesDir() { return DATA_DIR ? path.join(DATA_DIR, 'files') : null; }
function getNoteFile(id) { return path.join(getNotesDir(), id + '.sndb2'); }
function getImageFile(id) { return path.join(getImagesDir(), id + '.sndb2'); }
function getFileFile(id) { return path.join(getFilesDir(), id + '.sndb2'); }

// 元数据（文件夹 + 笔记顺序）
function saveMeta(meta) {
  if (!DATA_DIR) return;
  try {
    const encrypted = crypto.encrypt(JSON.stringify(meta), currentPassword);
    fs.writeFileSync(getMetaFile(), encrypted, 'utf8');
  } catch (e) { console.error('[storage] saveMeta error:', e); }
}

function loadMeta() {
  const file = getMetaFile();
  if (!file || !fs.existsSync(file)) return null;
  try {
    const encrypted = fs.readFileSync(file, 'utf8');
    const decrypted = crypto.decrypt(encrypted, currentPassword);
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

function createConfig(username, passwordHash, dataDir) {
  const config = { username, passwordHash, createdAt: Date.now(), version: '1.0.0', dataDir };
  const encrypted = crypto.encrypt(JSON.stringify(config), passwordHash);
  fs.writeFileSync(getConfigFile(), encrypted, 'utf8');
}

function loadConfig(password) {
  const configFile = getConfigFile();
  if (!fs.existsSync(configFile)) return null;
  try {
    const encrypted = fs.readFileSync(configFile, 'utf8');
    const decrypted = crypto.decrypt(encrypted, password);
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

function isFirstRun() {
  if (!DATA_DIR) {
    const savedPaths = loadSavedPaths();
    if (savedPaths && savedPaths.dataDir) {
      DATA_DIR = savedPaths.dataDir;
      ensureDirs();
    }
  }
  return !DATA_DIR || !fs.existsSync(getConfigFile());
}

function getLockInfo() {
  const lockFile = getLockFile();
  if (!fs.existsSync(lockFile)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    if (Date.now() - data.lockedAt > 30000) {
      fs.unlinkSync(lockFile);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function setLockInfo(failedCount) {
  fs.writeFileSync(getLockFile(), JSON.stringify({ failedCount, lockedAt: Date.now() }), 'utf8');
}

function clearLock() {
  const lockFile = getLockFile();
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
}

function listNotes() {
  const notesDir = getNotesDir();
  if (!fs.existsSync(notesDir)) return [];
  return fs.readdirSync(notesDir).filter(f => f.endsWith('.sndb2')).map(f => f.replace('.sndb2', ''));
}

function saveNote(id, note) {
  const encrypted = crypto.encrypt(JSON.stringify(note), currentPassword);
  fs.writeFileSync(getNoteFile(id), encrypted, 'utf8');
}

function loadNote(id) {
  const file = getNoteFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    const encrypted = fs.readFileSync(file, 'utf8');
    const decrypted = crypto.decrypt(encrypted, currentPassword);
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

function deleteNote(id) {
  const file = getNoteFile(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function saveImage(id, buffer) {
  console.log('[storage] saveImage 目录状态: DATA_DIR=' + DATA_DIR);
  const salt = NodeCrypto.randomBytes(16);
  const key = crypto.deriveKey(currentPassword, salt);
  const iv = NodeCrypto.randomBytes(16);
  const cipher = NodeCrypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const output = Buffer.concat([Buffer.from('SNDB2:'), salt, iv, encrypted]);
  const filePath = getImageFile(id);
  console.log('[storage] saveImage 保存路径: ' + filePath);
  fs.writeFileSync(filePath, output);
}

function loadImage(id) {
  const file = getImageFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    const data = fs.readFileSync(file);
    const salt = data.slice(6, 22);
    const iv = data.slice(22, 38);
    const encrypted = data.slice(38);
    const key = crypto.deriveKey(currentPassword, salt);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (e) {
    return null;
  }
}

function deleteImage(id) {
  const file = getImageFile(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// 保存文件（加密）
function saveFile(id, buffer, metadata) {
  console.log('[storage] saveFile 目录状态: DATA_DIR=' + DATA_DIR);
  const salt = NodeCrypto.randomBytes(16);
  const key = crypto.deriveKey(currentPassword, salt);
  const iv = NodeCrypto.randomBytes(16);
  const cipher = NodeCrypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  // 存储格式: SNFILE: + salt(16) + iv(16) + json长度(2) + json(metadata) + 加密数据
  const metaJson = JSON.stringify(metadata);
  const metaLen = Buffer.alloc(2);
  metaLen.writeUInt16BE(metaJson.length);
  const metaBuffer = Buffer.from(metaJson, 'utf8');
  const output = Buffer.concat([Buffer.from('SNFILE'), salt, iv, metaLen, metaBuffer, encrypted]);
  const filePath = getFileFile(id);
  console.log('[storage] saveFile 保存路径: ' + filePath);
  fs.writeFileSync(filePath, output);
}

// 加载文件（解密）
function loadFile(id) {
  const file = getFileFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    const data = fs.readFileSync(file);
    const salt = data.slice(7, 23);
    const iv = data.slice(23, 39);
    const metaLen = data.readUInt16BE(39);
    const metaJson = data.slice(41, 41 + metaLen).toString('utf8');
    const encrypted = data.slice(41 + metaLen);
    const key = crypto.deriveKey(currentPassword, salt);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const buffer = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const metadata = JSON.parse(metaJson);
    return {
      ...metadata,
      data: `data:${metadata.type || 'application/octet-stream'};base64,${buffer.toString('base64')}`
    };
  } catch (e) {
    return null;
  }
}

// 删除文件
function deleteFile(id) {
  const file = getFileFile(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

module.exports = {
  setDataDir, getDataDir, setPassword, getPassword,
  isFirstRun, getConfigFile, createConfig, loadConfig,
  getLockInfo, setLockInfo, clearLock,
  listNotes, saveNote, loadNote, deleteNote,
  saveImage, loadImage, deleteImage,
  saveFile, loadFile, deleteFile,
  loadMeta, saveMeta,
  hashPassword: crypto.hashPassword,
};
