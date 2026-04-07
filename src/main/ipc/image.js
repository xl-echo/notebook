/**
 * 图片和文件 IPC 处理器
 */
const { ipcMain } = require('electron');
const crypto = require('crypto');

// 生成随机 UUID
function generateUUID() {
  return crypto.randomBytes(16).toString('hex');
}
const storage = require('../storage');
const path = require('path');
const fs = require('fs');

function registerImageHandlers() {
  // 保存图片（加密保存到数据目录）
  ipcMain.handle('image-save', async (event, { imageDataUrl, dataUrl } = {}) => {
    const password = storage.getPassword();
    console.log('[后端] image-save 密码状态: ' + (password ? '已设置' : '未设置'));
    if (!password) {
      console.log('[后端] image-save 失败: 未登录');
      return null;
    }

    // 兼容 dataUrl 和 imageDataUrl 两种参数名
    const sourceUrl = imageDataUrl || dataUrl;
    console.log('[后端] image-save 收到数据长度: ' + (sourceUrl ? sourceUrl.length : 0));
    
    if (!sourceUrl) {
      console.log('[后端] image-save 失败: 没有数据');
      return null;
    }
    
    const matches = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      console.log('[后端] image-save 失败: URL格式错误');
      return null;
    }

    const buffer = Buffer.from(matches[2], 'base64');
    const imageId = 'img_' + generateUUID();
    console.log('[后端] image-save 保存图片ID: ' + imageId + ' 大小:' + buffer.length);
    storage.saveImage(imageId, buffer);
    
    console.log('[后端] image-save 成功');
    return { id: imageId, src: `snimg://${imageId}` };
  });

  // 加载图片（解密从数据目录读取）
  ipcMain.handle('image-load', async (event, imageId) => {
    const password = storage.getPassword();
    if (!password) return null;

    const buffer = storage.loadImage(imageId);
    if (!buffer) return null;

    let mimeType = 'image/png';
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) mimeType = 'image/jpeg';
    else if (buffer[0] === 0x47 && buffer[1] === 0x49) mimeType = 'image/gif';

    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  });

  // 删除图片
  ipcMain.handle('image-delete', async (event, imageId) => {
    const password = storage.getPassword();
    if (!password) return { success: false };
    storage.deleteImage(imageId);
    return { success: true };
  });

  // 保存文件（加密保存到数据目录）
  ipcMain.handle('file-save', async (event, { fileDataUrl, dataUrl, fileName, fileType } = {}) => {
    const password = storage.getPassword();
    console.log('[后端] file-save 密码状态: ' + (password ? '已设置' : '未设置'));
    if (!password) {
      console.log('[后端] file-save 失败: 未登录');
      return null;
    }

    // 兼容 dataUrl 和 fileDataUrl 两种参数名
    const sourceUrl = fileDataUrl || dataUrl;
    console.log('[后端] file-save 收到文件: ' + fileName + ' 类型:' + fileType + ' 数据长度:' + (sourceUrl ? sourceUrl.length : 0));
    
    if (!sourceUrl) {
      console.log('[后端] file-save 失败: 没有数据');
      return null;
    }
    
    // 解析 data URL
    const matches = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      console.log('[后端] file-save 失败: URL格式错误');
      return null;
    }

    const buffer = Buffer.from(matches[2], 'base64');
    const fileId = 'file_' + Date.now() + '_' + generateUUID().substr(0, 8);
    console.log('[后端] file-save 保存文件ID: ' + fileId + ' 大小:' + buffer.length);
    storage.saveFile(fileId, buffer, { name: fileName, type: fileType });
    
    console.log('[后端] file-save 成功');
    return { id: fileId, name: fileName, type: fileType };
  });

  // 加载文件（解密并返回）
  ipcMain.handle('file-load', async (event, fileId) => {
    const password = storage.getPassword();
    if (!password) {
      console.log('[后端] file-load 失败: 未登录, password=' + (password ? '已设置' : 'NULL'));
      return null;
    }
    console.log('[后端] file-load 开始, fileId=' + fileId + ', password长度=' + password.length);

    const result = storage.loadFile(fileId);
    if (!result) {
      console.log('[后端] file-load 返回null, fileId=' + fileId);
      return null;
    }

    console.log('[后端] file-load 成功, fileId=' + fileId + ', data长度=' + result.data?.length);
    return result;
  });

  // 删除文件
  ipcMain.handle('file-delete', async (event, fileId) => {
    const password = storage.getPassword();
    if (!password) return { success: false };
    storage.deleteFile(fileId);
    return { success: true };
  });
}

module.exports = { registerImageHandlers };
