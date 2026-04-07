/**
 * 加密模块 - AES-256-CBC
 */
const crypto = require('crypto');

const MAGIC = 'SNDB2:';

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt || 'SecureNotes_V2', 100000, 32, 'sha256');
}

function encrypt(text, password) {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return MAGIC + salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

function decrypt(data, password) {
  if (!data.startsWith(MAGIC)) {
    throw new Error('无效的加密数据');
  }

  const parts = data.slice(MAGIC.length).split(':');
  if (parts.length !== 3) {
    throw new Error('数据格式错误');
  }

  const salt = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

function hashPassword(password) {
  return crypto.createHash('sha256').update('SecureNotes_V2_Salt_' + password).digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  deriveKey,
};
