# SecureNotes - 安全加密笔记

一款基于 **Electron** 的本地加密笔记软件，数据全程加密存储，确保隐私安全。

---

## ✨ 功能特性

- **🔐 强加密保护** - AES-256-CBC 加密 + PBKDF2 密钥派生，密码错误无法解密
- **📝 Markdown 编辑** - 支持实时预览、代码高亮
- **🖼️ 图片附件** - 粘贴图片直接存入加密存储
- **📎 文件附件** - 支持 PDF 等文件加密存储
- **📁 文件夹管理** - 新建/重命名/删除文件夹，笔记可归类整理
- **↕️ 拖拽排序** - 拖拽调整笔记顺序，拖入/拖出文件夹
- **🔒 本地存储** - 所有数据保存在本地，无云端同步

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                     用户界面层 (Renderer)               │
│  HTML + CSS + Vanilla JS                                 │
│  ├── 响应式布局（Flexbox）                               │
│  ├── Markdown 编辑器 / 实时预览                           │
│  ├── 文件夹树 + 拖拽排序（HTML5 Drag & Drop）            │
│  ├── marked.js（MD → HTML）                             │
│  └── highlight.js（代码高亮）                           │
└──────────────────────┬──────────────────────────────────┘
                       │ contextBridge（安全隔离）
┌──────────────────────▼──────────────────────────────────┐
│                    预加载层 (Preload)                    │
│  preload.js — 暴露安全的 IPC 通道                        │
│  ├── 仅暴露必要方法，无直接 Node API 暴露                 │
│  └── 双向数据绑定（invoke / handle）                     │
└──────────────────────┬──────────────────────────────────┘
                       │ IPC 通信
┌──────────────────────▼──────────────────────────────────┐
│                    主进程层 (Main)                       │
│  Node.js + Electron API                                 │
│  ├── main.js — 应用生命周期 + 窗口管理                    │
│  ├── crypto.js — AES-256-CBC 加密/解密                  │
│  ├── storage.js — 数据持久化                             │
│  └── ipc/ — IPC 处理器模块                              │
│      ├── auth.js — 注册 / 登录 / 验证                   │
│      ├── notes.js — 笔记 CRUD                          │
│      ├── image.js — 图片存储管理                         │
│      ├── file.js — 文件存储管理                          │
│      └── folders.js — 文件夹 + 元数据管理                │
└─────────────────────────────────────────────────────────┘
```

---

## 🔐 安全模型

### 分层隔离

| 层级 | 隔离方式 | 说明 |
|------|----------|------|
| Renderer | `nodeIntegration: false` | 禁止直接访问 Node.js |
| Preload | `contextIsolation: true` | 沙箱隔离，仅暴露白名单 API |
| IPC | `invoke / handle` 模式 | 异步安全调用主进程功能 |

### 数据加密

```
用户密码 → PBKDF2 (100000次迭代) → AES-256-CBC 密钥
数据存储 → AES-256-CBC 加密 → 本地文件
```

---

## 💾 存储结构

```
%APPDATA%/SecureNotes/
├── config.sndb2       # 用户配置（密码哈希 + 盐）
├── meta.sndb2         # 元数据（文件夹结构 + 笔记排序）
├── notes/             # 加密笔记内容
│   └── {id}.sndb2    # AES 加密后的笔记正文
├── images/            # 加密图片文件
│   └── {id}.sndb2    # 加密后的图片数据
└── files/             # 加密附件文件
    └── {id}.sndb2    # 加密后的附件数据
```

> **所有数据加密存储**，即使文件被拷贝也无法直接读取内容。

---

## 🧩 核心模块

### main.js — 应用入口

- `app.whenReady()` — 初始化窗口、注册 IPC 处理器
- `app.on('before-quit')` — 安全关闭前保存状态
- 窗口配置：`1200x800`，最小 `800x600`，可缩放、可最大化

### crypto.js — 加密引擎

| 函数 | 说明 |
|------|------|
| `deriveKey(password, salt)` | PBKDF2 密钥派生（100000 次迭代） |
| `encrypt(plaintext, key)` | AES-256-CBC 加密 |
| `decrypt(ciphertext, key)` | AES-256-CBC 解密 |
| `hashPassword(password, salt)` | 密码哈希验证 |

### storage.js — 数据持久化

- 所有读写操作通过加密层处理
- 图片/文件独立加密存储于 `images/` 和 `files/` 目录
- `saveMeta` / `loadMeta` — 文件夹结构与排序数据加密存储于 `meta.sndb2`

### ipc/ — 进程间通信

| 模块 | 通道 | 功能 |
|------|------|------|
| `auth` | `auth:register` | 用户注册 |
| `auth` | `auth:login` | 用户登录验证 |
| `auth` | `auth:logout` | 登出（清除内存密钥） |
| `notes` | `notes:list` | 获取笔记列表 |
| `notes` | `notes:get` | 获取单条笔记（解密） |
| `notes` | `notes:save` | 保存笔记（加密） |
| `notes` | `notes:delete` | 删除笔记 |
| `image` | `image:save` | 保存粘贴的图片 |
| `image` | `image:load` | 加载图片数据 |
| `file` | `file:save` | 保存附件文件 |
| `file` | `file:load` | 加载附件文件 |
| `folders` | `meta-get` | 获取文件夹结构 + 排序数据 |
| `folders` | `folders-create` | 新建文件夹 |
| `folders` | `folders-rename` | 重命名文件夹 |
| `folders` | `folders-delete` | 删除文件夹 |
| `folders` | `note-move-folder` | 移动笔记到文件夹 |
| `folders` | `note-reorder` | 保存手动排序 |

---

## 🚀 构建与运行

### 开发模式

```bash
cd v1.0.0
npm install
npx electron .
```

### 构建安装包

```bash
cd v1.0.0
npm run build
```

输出：`dist/SecureNotes Setup 1.0.0.exe`

---

## 🛠️ 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Electron | 31.7.7 |
| 构建 | electron-builder | 24.13.3 |
| 前端 | HTML5 / CSS3 / Vanilla JS | — |
| 加密 | Node.js `crypto` (AES-256-CBC + PBKDF2) | 内置 |
| 渲染 | marked.js | 12.0.0 |
| 高亮 | highlight.js | 11.9.0 |

---

## 📌 版本

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-04-07 | 正式版：加密笔记 / 响应式布局 / 图片附件 / 文件附件 / 文件夹管理 / 拖拽排序 |
