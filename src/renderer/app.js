/**
 * SecureNotes v1.0.0 前端逻辑
 * 增强：图片粘贴 + 文件粘贴 + 文件夹 + 拖拽排序
 */

// 全局状态
let currentNote = null;
let allNotes = [];
let isDirty = false;
let isSplitMode = false;
let isPreviewOnly = false;
let autoSaveTimer = null;
let imageCache = new Map();
let fileCache = new Map();
let isSyncingScroll = false;
let isMobile = window.innerWidth <= 768;
let sidebarOpen = false;

// 文件夹 + 排序状态
let folders = [];           // [{id, name, order}]
let noteFolders = {};       // {noteId: folderId}
let noteOrder = [];         // [noteId,...] 手动排序
let collapsedFolders = {};  // {folderId: true}
let currentSort = 'updatedAt-desc';
let contextTarget = null;   // 右键菜单目标

// 调试日志写入文件
function addDebugLog(msg) {
  const time = new Date().toLocaleTimeString();
  const logLine = `[${time}] ${msg}`;
  // 写入日志文件
  if (window.api && window.api.writeLog) {
    window.api.writeLog(logLine);
  }
  // 同时输出到控制台
  console.log('[DEBUG]', msg);
}

// 初始化
window.addEventListener('DOMContentLoaded', async () => {
  addDebugLog('[前端] 初始化开始...');
  // 配置 marked
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function(code, lang) {
        if (lang && window.hljs) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (e) {}
        }
        return code;
      }
    });

    const renderer = new marked.Renderer();
    // 图片渲染 - 支持 data URL 和 snimg:// 协议
    const origImage = renderer.image.bind(renderer);
    renderer.image = function(href, title, text) {
      if (href && href.startsWith('snimg://')) {
        const id = href.replace('snimg://', '');
        return `<img src="" data-snimg="${id}" alt="${escHtml(text || '')}">`;
      }
      // data URL 图片直接显示
      if (href && href.startsWith('data:')) {
        return `<img src="${href}" alt="${escHtml(text || '')}" style="max-width:100%;cursor:pointer;">`;
      }
      return origImage(href, title, text);
    };
    // 文件链接渲染 - 转为下载按钮
    const origLink = renderer.link.bind(renderer);
    renderer.link = function(href, title, text) {
      if (href && href.startsWith('snfile://')) {
        const id = href.replace('snfile://', '');
        const fileName = text || '文件';
        return `<span class="file-attachment" data-file-id="${id}">
          <span class="file-icon">📎</span>
          <span class="file-name">${escHtml(fileName)}</span>
          <button class="file-download-btn" onclick="downloadFile('${id}')">下载</button>
        </span>`;
      }
      return origLink(href, title, text);
    };
    marked.use({ renderer });
  }

  bindButtonEvents();

  try {
    const isFirst = await window.api.isFirstRun();
    // 首次运行显示欢迎页；已注册用户显示登录页
    showPage(isFirst ? 'install-step0' : 'login-page');
  } catch (e) {
    showPage('install-step0');
  }

  // 窗口状态
  window.api.onMaximizedChange(isMaximized => {
    document.querySelector('.maximize-icon').classList.toggle('hidden', isMaximized);
    document.querySelector('.restore-icon').classList.toggle('hidden', !isMaximized);
  });
  window.api.isMaximized().then(isMaximized => {
    document.querySelector('.maximize-icon').classList.toggle('hidden', isMaximized);
    document.querySelector('.restore-icon').classList.toggle('hidden', !isMaximized);
  });

  // 回车快捷键
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('setup-password2').addEventListener('keydown', e => {
    if (e.key === 'Enter') goToStep3();
  });

  // 响应式检测
  window.addEventListener('resize', () => {
    const newMobile = window.innerWidth <= 768;
    if (newMobile !== isMobile) {
      isMobile = newMobile;
      document.querySelector('.app-layout').classList.toggle('mobile-sidebar', isMobile);
    }
  });
  if (isMobile) {
    document.querySelector('.app-layout').classList.add('mobile-sidebar');
  }

  // 全局快捷键
  document.addEventListener('keydown', e => {
    if (!document.getElementById('app-page').classList.contains('active')) return;
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); insertFormat('bold'); }
    if (e.ctrlKey && e.key === 'i') { e.preventDefault(); insertFormat('italic'); }
  });
});

// 绑定按钮事件
function bindButtonEvents() {
  // 安装向导
  document.getElementById('btn-start-install')?.addEventListener('click', () => showPage('install-step1'));
  document.getElementById('btn-back-step0')?.addEventListener('click', () => showPage('install-step0'));
  document.getElementById('btn-select-dir')?.addEventListener('click', selectDataDir);
  document.getElementById('btn-next-step2')?.addEventListener('click', goToStep2);
  document.getElementById('btn-next-step3')?.addEventListener('click', goToStep3);
  document.getElementById('btn-next-step4')?.addEventListener('click', goToStep4);
  document.getElementById('finish-btn')?.addEventListener('click', finishInstall);
  document.getElementById('btn-prev-step1')?.addEventListener('click', () => showPage('install-step1'));
  document.getElementById('btn-prev-step2')?.addEventListener('click', () => showPage('install-step2'));
  document.getElementById('btn-prev-step3')?.addEventListener('click', () => showPage('install-step3'));

  // 登录
  document.getElementById('btn-login')?.addEventListener('click', doLogin);

  // 主界面
  document.getElementById('btn-logout')?.addEventListener('click', doLogout);
  document.getElementById('btn-new')?.addEventListener('click', createNote);
  document.getElementById('btn-delete')?.addEventListener('click', deleteNote);

  // 格式化
  ['bold', 'italic', 'heading', 'link', 'code', 'quote', 'list'].forEach(type => {
    document.getElementById('btn-' + type)?.addEventListener('click', () => insertFormat(type));
  });
  document.getElementById('btn-image')?.addEventListener('click', triggerImageUpload);
  document.getElementById('btn-file')?.addEventListener('click', triggerFileUploadDialog);
  document.getElementById('file-input')?.addEventListener('change', handleImageInput);
  document.getElementById('file-upload-input')?.addEventListener('change', handleFileInput);

  // 视图切换
  document.getElementById('view-toggle')?.addEventListener('click', toggleViewMode);
  document.getElementById('btn-preview')?.addEventListener('click', toggleFullPreview);

  // 移动端菜单
  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => toggleSidebar());

  // 笔记列表（事件委托已移入 bindNotesListEvents，保留占位）
  // document.getElementById('notes-list') handled dynamically

  // 搜索
  document.getElementById('search-input')?.addEventListener('input', e => handleSearch(e.target.value));
  document.getElementById('sort-select')?.addEventListener('change', e => {
    currentSort = e.target.value;
    handleSort(e.target.value);
  });

  // 文件夹
  document.getElementById('btn-new-folder')?.addEventListener('click', createFolder);
  document.getElementById('ctx-rename-folder')?.addEventListener('click', renameFolder);
  document.getElementById('ctx-delete-folder')?.addEventListener('click', deleteFolderCtx);
  document.getElementById('rename-cancel')?.addEventListener('click', closeRenameModal);
  document.getElementById('rename-ok')?.addEventListener('click', confirmRename);
  document.getElementById('rename-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') closeRenameModal(); });

  // 笔记右键菜单
  document.getElementById('ctx-delete-note')?.addEventListener('click', deleteNoteCtx);

  // 关闭右键菜单
  document.addEventListener('click', () => { hideContextMenu(); hideNoteContextMenu(); });
  document.addEventListener('contextmenu', e => e.preventDefault());

  // 笔记输入
  document.getElementById('note-title')?.addEventListener('input', onTitleChange);
  const noteContent = document.getElementById('note-content');
  if (noteContent) {
    noteContent.addEventListener('input', onContentChange);
    noteContent.addEventListener('keydown', handleKeydown);
    noteContent.addEventListener('paste', handlePaste);
    noteContent.addEventListener('scroll', onEditorScroll);
  }

  document.getElementById('preview-panel')?.addEventListener('scroll', onPreviewScroll);
}

// 页面切换
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.add('hidden');
    p.classList.remove('active');
  });
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }
}

// === 安装向导 ===
async function selectDataDir() {
  const errorEl = document.getElementById('step1-error');
  errorEl.textContent = '正在打开目录选择...';
  errorEl.style.color = '#666';
  try {
    const result = await window.api.selectDataDir();
    errorEl.style.color = '';
    if (result.success) {
      document.getElementById('data-dir').value = result.dir;
      errorEl.textContent = '';
      showToast('目录已选择', 'success');
    } else if (result.canceled) {
      errorEl.textContent = '';
    } else if (result.error) {
      errorEl.textContent = '错误: ' + result.error;
    }
  } catch (e) {
    errorEl.style.color = '#ef4444';
    errorEl.textContent = '调用失败: ' + e.message;
  }
}

function goToStep2() {
  const dir = document.getElementById('data-dir').value;
  const errorEl = document.getElementById('step1-error');
  if (!dir) { errorEl.textContent = '请先选择数据存放目录'; return; }
  errorEl.textContent = '';
  showPage('install-step2');
}

function goToStep3() {
  const username = document.getElementById('setup-username').value.trim();
  const password = document.getElementById('setup-password').value;
  const password2 = document.getElementById('setup-password2').value;
  const errorEl = document.getElementById('step2-error');
  errorEl.textContent = '';
  if (!username || username.length < 2) { errorEl.textContent = '用户名至少2个字符'; return; }
  if (!password || password.length < 8) { errorEl.textContent = '密码至少8位'; return; }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) { errorEl.textContent = '密码需包含字母和数字'; return; }
  if (password !== password2) { errorEl.textContent = '两次密码不一致'; return; }
  document.getElementById('summary-dir').textContent = document.getElementById('data-dir').value;
  document.getElementById('summary-username').textContent = username;
  showPage('install-step3');
}

function goToStep4() {
  showPage('install-step4');
}

async function finishInstall() {
  const username = document.getElementById('setup-username').value.trim();
  const password = document.getElementById('setup-password').value;
  const errorEl = document.getElementById('step4-error');
  const btn = document.getElementById('finish-btn');
  const createShortcut = document.getElementById('create-shortcut')?.checked || false;
  const runNow = document.getElementById('run-now')?.checked || true;

  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = '创建中...';

  try {
    const result = await window.api.register({ username, password, createShortcut });
    if (result.success) {
      if (runNow) {
        showPage('app-page');
        initApp(username);
      } else {
        window.api.quit();
      }
    } else {
      errorEl.textContent = result.error || '创建失败';
      btn.disabled = false;
      btn.textContent = '创建并开始使用';
    }
  } catch (e) {
    errorEl.textContent = '创建失败: ' + e.message;
    btn.disabled = false;
    btn.textContent = '创建并开始使用';
  }
}

// === 登录 ===
let loginLockTimer = null;

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');

  errorEl.textContent = '';
  if (!username || !password) { errorEl.textContent = '请输入用户名和密码'; return; }

  // 如果正在锁定倒计时，禁止提交
  if (btn.disabled) return;

  const result = await window.api.login({ username, password });
  if (result.success) {
    // 清理锁定状态
    if (loginLockTimer) { clearInterval(loginLockTimer); loginLockTimer = null; }
    btn.disabled = false;
    btn.textContent = '登 录';
    showPage('app-page');
    initApp(username);
  } else {
    errorEl.textContent = result.error;
    if (result.locked && result.remainingTime > 0) {
      // 禁用登录按钮并倒计时
      if (loginLockTimer) clearInterval(loginLockTimer);
      let remaining = result.remainingTime;
      btn.disabled = true;
      btn.textContent = `等待 ${remaining}s`;
      loginLockTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(loginLockTimer);
          loginLockTimer = null;
          btn.disabled = false;
          btn.textContent = '登 录';
          errorEl.textContent = '可以重新尝试登录';
        } else {
          btn.textContent = `等待 ${remaining}s`;
        }
      }, 1000);
    }
  }
}

async function initApp(username) {
  document.getElementById('user-avatar').textContent = username.charAt(0).toUpperCase();
  document.getElementById('user-name').textContent = username;
  document.getElementById('welcome-name').textContent = username;
  currentNote = null;

  await loadNotes();
  updateWelcomeStats();

  document.getElementById('welcome-panel').classList.remove('hidden');
  document.getElementById('editor-panel').classList.add('hidden');
}

function updateWelcomeStats() {
  const total = allNotes.length;
  const today = allNotes.filter(n => {
    const d = new Date(n.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  document.getElementById('stat-notes').textContent = total;
  document.getElementById('stat-today').textContent = today;
}

async function doLogout() {
  await window.api.logout();
  clearCurrentNote();
  showPage('login-page');
}

function clearCurrentNote() {
  currentNote = null;
  allNotes = [];
  isDirty = false;
  imageCache.clear();
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
  // 重置登录按钮状态
  const btn = document.getElementById('btn-login');
  if (btn) { btn.disabled = false; btn.textContent = '登 录'; }
  if (loginLockTimer) { clearInterval(loginLockTimer); loginLockTimer = null; }
}

// === 笔记列表 ===
async function loadNotes(sortBy = null, order = null) {
  // 解析排序参数
  let sb = sortBy, ord = order;
  if (!sb) {
    const parts = (currentSort || 'updatedAt-desc').split('-');
    sb = parts[0]; ord = parts[1] || 'desc';
  }

  // 加载笔记
  if (sb === 'manual') {
    allNotes = await window.api.notesList({ sortBy: 'updatedAt', order: 'desc' });
  } else {
    allNotes = await window.api.notesList({ sortBy: sb, order: ord });
  }

  // 加载 meta（文件夹 + 顺序）
  const meta = await window.api.metaGet();
  if (meta) {
    folders = meta.folders || [];
    noteFolders = meta.noteFolders || {};
    noteOrder = meta.noteOrder || [];
    // 默认将所有文件夹设置为收起状态（如果没有记录）
    folders.forEach(f => {
      if (collapsedFolders[f.id] === undefined) {
        collapsedFolders[f.id] = true;
      }
    });
  }

  renderNotesList();
}

function getSortedNotes(noteList) {
  if (currentSort === 'manual') {
    // 按 noteOrder 排序
    const ordered = [];
    noteOrder.forEach(id => {
      const n = noteList.find(n => n.id === id);
      if (n) ordered.push(n);
    });
    // 追加未在 noteOrder 中的笔记
    noteList.forEach(n => { if (!noteOrder.includes(n.id)) ordered.push(n); });
    return ordered;
  }
  return noteList;
}

function renderNotesList() {
  const el = document.getElementById('notes-list');
  const countEl = document.getElementById('notes-count');
  countEl.textContent = allNotes.length + ' 篇';

  if (allNotes.length === 0) {
    el.innerHTML = '<div class="empty-list">还没有笔记<br>点击上方「新建」开始</div>';
    return;
  }

  const sorted = getSortedNotes(allNotes);

  // 分组：文件夹内 / 根目录
  const folderMap = {}; // folderId -> notes[]
  const rootNotes = [];

  sorted.forEach(note => {
    const fid = noteFolders[note.id];
    if (fid && folders.find(f => f.id === fid)) {
      if (!folderMap[fid]) folderMap[fid] = [];
      folderMap[fid].push(note);
    } else {
      rootNotes.push(note);
    }
  });

  let html = '';

  // 渲染文件夹
  folders.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(folder => {
    const collapsed = !!collapsedFolders[folder.id];
    const folderNotes = folderMap[folder.id] || [];
    html += `
      <div class="folder-group" data-folder-id="${folder.id}">
        <div class="folder-header" data-folder-id="${folder.id}">
          <span class="folder-toggle">${collapsed ? '▶' : '▼'}</span>
          <svg class="folder-icon" width="13" height="13" viewBox="0 0 24 24" fill="${collapsed ? '#94a3b8' : '#52c97d'}" stroke="${collapsed ? '#94a3b8' : '#52c97d'}" stroke-width="0">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="folder-name">${escHtml(folder.name)}</span>
          <span class="folder-count">${folderNotes.length}</span>
        </div>
        <div class="folder-notes ${collapsed ? 'collapsed' : ''}" data-folder-id="${folder.id}">
          ${folderNotes.length === 0 ? '<div class="folder-empty">拖拽笔记到此处</div>' : ''}
          ${folderNotes.map(note => renderNoteItem(note, true)).join('')}
        </div>
      </div>`;
  });

  // 渲染根目录笔记
  if (rootNotes.length > 0 || folders.length === 0) {
    html += `<div class="root-notes" id="root-notes-container">`;
    if (folders.length > 0 && rootNotes.length > 0) {
      html += `<div class="section-label">未分类</div>`;
    }
    html += rootNotes.map(note => renderNoteItem(note, false)).join('');
    html += `</div>`;
  }

  el.innerHTML = html;

  // 绑定事件
  bindNotesListEvents(el);
  initDragDrop(el);
}

function renderNoteItem(note, inFolder) {
  const active = currentNote && currentNote.id === note.id ? 'active' : '';
  return `<div class="note-item ${active}" data-note-id="${note.id}" draggable="true">
    <div class="note-item-inner">
      <div class="note-title">${escHtml(note.title || '无标题')}</div>
      <div class="note-meta">${formatDate(note.updatedAt)}</div>
    </div>
    <div class="drag-handle" title="拖拽排序">
      <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
        <circle cx="3" cy="3" r="1.2" fill="#94a3b8"/>
        <circle cx="7" cy="3" r="1.2" fill="#94a3b8"/>
        <circle cx="3" cy="7" r="1.2" fill="#94a3b8"/>
        <circle cx="7" cy="7" r="1.2" fill="#94a3b8"/>
        <circle cx="3" cy="11" r="1.2" fill="#94a3b8"/>
        <circle cx="7" cy="11" r="1.2" fill="#94a3b8"/>
      </svg>
    </div>
  </div>`;
}

function bindNotesListEvents(el) {
  // 点击笔记
  el.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.drag-handle')) return;
      const noteId = item.dataset.noteId;
      if (noteId) openNote(noteId);
    });
    // 笔记右键菜单
    item.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      const noteId = item.dataset.noteId;
      showNoteContextMenu(e, noteId);
    });
  });

  // 折叠/展开文件夹
  el.querySelectorAll('.folder-header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('.folder-actions')) return;
      const fid = header.dataset.folderId;
      collapsedFolders[fid] = !collapsedFolders[fid];
      renderNotesList();
    });
    // 右键菜单
    header.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      const fid = header.dataset.folderId;
      showFolderContextMenu(e, fid);
    });
  });
}

// === 打开/创建笔记 ===
async function openNote(id) {
  if (isDirty && currentNote) await saveNote();

  const note = await window.api.notesGet(id);
  if (!note) { showToast('无法加载笔记', 'error'); return; }

  // 清理旧笔记的图片缓存
  imageCache.clear();
  fileCache.clear();

  currentNote = note;
  isDirty = false;

  document.getElementById('welcome-panel').classList.add('hidden');
  document.getElementById('editor-panel').classList.remove('hidden');

  document.getElementById('note-title').value = note.title || '';
  document.getElementById('note-content').value = note.content || '';
  updateCharCount();
  renderNotesList();
  initEditorView();
  
  // 更新图片预览区域
  updateImagePreviewArea();

  document.getElementById('save-status').textContent = '';
  document.getElementById('save-status').className = 'save-status';

  if (isMobile) toggleSidebar(false);
}

async function createNote() {
  if (isDirty && currentNote) await saveNote();

  const note = await window.api.notesCreate({ title: '', content: '' });
  if (!note) { showToast('无法创建笔记', 'error'); return; }

  // 清理图片缓存
  imageCache.clear();

  currentNote = note;
  isDirty = false;

  document.getElementById('welcome-panel').classList.add('hidden');
  document.getElementById('editor-panel').classList.remove('hidden');

  document.getElementById('note-title').value = '';
  document.getElementById('note-title').focus();
  document.getElementById('note-content').value = '';
  updateCharCount();

  initEditorView();
  document.getElementById('save-status').textContent = '';
  document.getElementById('save-status').className = 'save-status';

  await loadNotes();

  if (isMobile) toggleSidebar(false);
}

function initEditorView() {
  isSplitMode = true;
  isPreviewOnly = false;

  const editArea = document.getElementById('edit-area');
  const preview = document.getElementById('preview-panel');
  const toggle = document.getElementById('view-toggle');
  const editor = document.getElementById('note-content');

  editArea.classList.add('split');
  preview.classList.remove('hidden');
  editor.classList.remove('hidden');
  editor.disabled = false;

  if (toggle) {
    toggle.classList.add('active');
    toggle.classList.remove('preview-mode');
    toggle.textContent = '双栏';
  }

  editor.focus();
  updatePreview();
}

// === 编辑 ===
function onTitleChange() {
  if (!currentNote) return;
  isDirty = true;
  scheduleAutoSave();
  updatePreview();
}

let previewUpdateTimer = null;
function onContentChange() {
  if (!currentNote) return;
  isDirty = true;
  updateCharCount();
  scheduleAutoSave();
  updatePreview();
  // 防抖更新图片预览
  if (previewUpdateTimer) clearTimeout(previewUpdateTimer);
  previewUpdateTimer = setTimeout(() => updateImagePreviewArea(), 500);
}

function scheduleAutoSave() {
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = '● 未保存';
  statusEl.className = 'save-status';
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    if (isDirty && currentNote) await saveNote(true);
  }, 2000);
}

function updateCharCount() {
  const content = document.getElementById('note-content').value || '';
  document.getElementById('char-count').textContent = content.length + ' 字符';
}

// === 保存 ===
async function saveNote(isAuto = false) {
  if (!currentNote) return;

  const statusEl = document.getElementById('save-status');
  if (!isAuto) {
    statusEl.textContent = '保存中...';
    statusEl.className = 'save-status saving';
  }

  currentNote.title = document.getElementById('note-title').value;
  currentNote.content = document.getElementById('note-content').value;

  await window.api.notesSave(currentNote);
  isDirty = false;

  if (isAuto) {
    statusEl.textContent = '✓ 已保存';
    statusEl.className = 'save-status saved';
  } else {
    showToast('已保存', 'success');
    statusEl.textContent = '';
    statusEl.className = 'save-status';
  }

  await loadNotes();
  updateWelcomeStats();
}

// === 删除 ===
async function deleteNote() {
  if (!currentNote) return;
  if (!confirm('确定要删除这条笔记吗？')) return;

  const noteId = currentNote.id;
  await window.api.notesDelete(noteId);

  // 清理
  currentNote = null;
  isDirty = false;
  imageCache.clear();

  document.getElementById('editor-panel').classList.add('hidden');
  document.getElementById('welcome-panel').classList.remove('hidden');
  document.getElementById('note-title').value = '';
  document.getElementById('note-content').value = '';

  await loadNotes();
  updateWelcomeStats();
  showToast('已删除', 'success');
}

// === 搜索 ===
async function handleSearch(keyword) {
  if (!keyword.trim()) {
    await loadNotes();
    return;
  }
  allNotes = await window.api.notesSearch(keyword);
  renderNotesList();
}

// === 排序 ===
async function handleSort(value) {
  currentSort = value;
  const [sortBy, order] = value.split('-');
  await loadNotes(sortBy, order || 'desc');
}

// ===========================
// === 文件夹操作 ===
// ===========================
async function createFolder() {
  const result = await window.api.foldersCreate({ name: '新建文件夹' });
  if (result?.id) {
    folders.push(result);
    renderNotesList();
    // 自动弹出重命名
    showRenameModal(result.id, result.name);
  }
}

function showFolderContextMenu(e, folderId) {
  contextTarget = { type: 'folder', id: folderId };
  const menu = document.getElementById('context-menu');
  menu.classList.remove('hidden');
  const x = Math.min(e.clientX, window.innerWidth - 160);
  const y = Math.min(e.clientY, window.innerHeight - 80);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function hideContextMenu() {
  document.getElementById('context-menu').classList.add('hidden');
  contextTarget = null;
}

// === 笔记右键菜单 ===
let noteContextTarget = null;

function showNoteContextMenu(e, noteId) {
  noteContextTarget = noteId;
  const menu = document.getElementById('note-context-menu');
  menu.classList.remove('hidden');
  const x = Math.min(e.clientX, window.innerWidth - 160);
  const y = Math.min(e.clientY, window.innerHeight - 60);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function hideNoteContextMenu() {
  const menu = document.getElementById('note-context-menu');
  if (menu) menu.classList.add('hidden');
  noteContextTarget = null;
}

async function deleteNoteCtx() {
  const noteId = noteContextTarget;
  hideNoteContextMenu();
  if (!noteId) return;
  const note = allNotes.find(n => n.id === noteId);
  const title = note ? (note.title || '无标题') : '此笔记';
  if (!confirm(`确定要删除「${title}」吗？`)) return;

  await window.api.notesDelete(noteId);

  // 如果删的是当前打开的笔记，清空编辑区
  if (currentNote && currentNote.id === noteId) {
    currentNote = null;
    isDirty = false;
    imageCache.clear();
    document.getElementById('editor-panel').classList.add('hidden');
    document.getElementById('welcome-panel').classList.remove('hidden');
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
  }

  await loadNotes();
  updateWelcomeStats();
  showToast('已删除', 'success');
}

function renameFolder() {
  if (!contextTarget || contextTarget.type !== 'folder') return;
  const folder = folders.find(f => f.id === contextTarget.id);
  if (folder) showRenameModal(folder.id, folder.name);
  hideContextMenu();
}

function showRenameModal(folderId, currentName) {
  const modal = document.getElementById('rename-modal');
  const input = document.getElementById('rename-input');
  modal.dataset.folderId = folderId;
  input.value = currentName;
  modal.classList.remove('hidden');
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

function closeRenameModal() {
  document.getElementById('rename-modal').classList.add('hidden');
}

async function confirmRename() {
  const modal = document.getElementById('rename-modal');
  const folderId = modal.dataset.folderId;
  const name = document.getElementById('rename-input').value.trim();
  if (!name) return;
  await window.api.foldersRename({ id: folderId, name });
  const folder = folders.find(f => f.id === folderId);
  if (folder) folder.name = name;
  closeRenameModal();
  renderNotesList();
}

async function deleteFolderCtx() {
  if (!contextTarget || contextTarget.type !== 'folder') return;
  const fid = contextTarget.id;
  hideContextMenu();
  const folder = folders.find(f => f.id === fid);
  if (!folder) return;
  // 计算文件夹内笔记数
  const count = Object.values(noteFolders).filter(v => v === fid).length;
  const msg = count > 0
    ? `确定删除文件夹「${folder.name}」？其中 ${count} 篇笔记将移回未分类。`
    : `确定删除文件夹「${folder.name}」？`;
  if (!confirm(msg)) return;
  await window.api.foldersDelete(fid);
  folders = folders.filter(f => f.id !== fid);
  Object.keys(noteFolders).forEach(nid => { if (noteFolders[nid] === fid) delete noteFolders[nid]; });
  renderNotesList();
  showToast('文件夹已删除', 'success');
}

// ===========================
// === 拖拽排序 & 移入文件夹 ===
// ===========================
let dragNoteId = null;
let dragOverEl = null;

function initDragDrop(container) {
  // 拖拽笔记
  container.querySelectorAll('.note-item[draggable]').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragNoteId = item.dataset.noteId;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', e => {
      item.classList.remove('dragging');
      clearDragOver();
      dragNoteId = null;
    });
  });

  // 放置目标：笔记条目之间（排序）
  container.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('dragover', e => {
      if (!dragNoteId || dragNoteId === item.dataset.noteId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDragOver();
      const rect = item.getBoundingClientRect();
      const isAfter = e.clientY > rect.top + rect.height / 2;
      item.classList.add(isAfter ? 'drag-over-bottom' : 'drag-over-top');
      dragOverEl = { el: item, after: isAfter };
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragNoteId) return;
      const targetId = item.dataset.noteId;
      if (dragNoteId === targetId) return;
      const isAfter = dragOverEl?.after;
      reorderNote(dragNoteId, targetId, isAfter);
      clearDragOver();
    });
  });

  // 放置目标：文件夹（移入文件夹）
  container.querySelectorAll('.folder-notes').forEach(folderZone => {
    folderZone.addEventListener('dragover', e => {
      if (!dragNoteId) return;
      const fid = folderZone.dataset.folderId;
      // 检查是否已在该文件夹
      if (noteFolders[dragNoteId] === fid) return;
      e.preventDefault();
      e.stopPropagation();
      clearDragOver();
      folderZone.classList.add('folder-drag-over');
    });
    folderZone.addEventListener('dragleave', e => {
      if (!folderZone.contains(e.relatedTarget)) {
        folderZone.classList.remove('folder-drag-over');
      }
    });
    folderZone.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      folderZone.classList.remove('folder-drag-over');
      if (!dragNoteId) return;
      const fid = folderZone.dataset.folderId;
      moveNoteToFolder(dragNoteId, fid);
    });
  });

  // 放置目标：根目录（移出文件夹）
  const rootContainer = container.querySelector('#root-notes-container');
  if (rootContainer) {
    rootContainer.addEventListener('dragover', e => {
      if (!dragNoteId) return;
      if (!noteFolders[dragNoteId]) return; // 已在根目录
      e.preventDefault();
      clearDragOver();
      rootContainer.classList.add('root-drag-over');
    });
    rootContainer.addEventListener('dragleave', e => {
      if (!rootContainer.contains(e.relatedTarget)) {
        rootContainer.classList.remove('root-drag-over');
      }
    });
    rootContainer.addEventListener('drop', e => {
      e.preventDefault();
      rootContainer.classList.remove('root-drag-over');
      if (!dragNoteId) return;
      moveNoteToFolder(dragNoteId, null);
    });
  }

  // 文件夹标题区域也可放置
  container.querySelectorAll('.folder-header').forEach(header => {
    header.addEventListener('dragover', e => {
      if (!dragNoteId) return;
      const fid = header.dataset.folderId;
      if (noteFolders[dragNoteId] === fid) return;
      e.preventDefault();
      clearDragOver();
      header.classList.add('folder-header-drag-over');
    });
    header.addEventListener('dragleave', () => {
      header.classList.remove('folder-header-drag-over');
    });
    header.addEventListener('drop', e => {
      e.preventDefault();
      header.classList.remove('folder-header-drag-over');
      if (!dragNoteId) return;
      const fid = header.dataset.folderId;
      // 自动展开
      collapsedFolders[fid] = false;
      moveNoteToFolder(dragNoteId, fid);
    });
  });
}

function clearDragOver() {
  document.querySelectorAll('.drag-over-top, .drag-over-bottom, .folder-drag-over, .folder-header-drag-over, .root-drag-over')
    .forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom', 'folder-drag-over', 'folder-header-drag-over', 'root-drag-over'));
}

async function reorderNote(srcId, targetId, insertAfter) {
  // 先切换到手动排序
  currentSort = 'manual';
  document.getElementById('sort-select').value = 'manual';

  // 构建顺序数组
  let order = noteOrder.length > 0 ? [...noteOrder] : allNotes.map(n => n.id);
  // 确保所有笔记都在 order 中
  allNotes.forEach(n => { if (!order.includes(n.id)) order.push(n.id); });

  const srcIdx = order.indexOf(srcId);
  if (srcIdx !== -1) order.splice(srcIdx, 1);
  const targetIdx = order.indexOf(targetId);
  order.splice(insertAfter ? targetIdx + 1 : targetIdx, 0, srcId);

  noteOrder = order;
  await window.api.noteReorder({ noteOrder });
  renderNotesList();
}

async function moveNoteToFolder(noteId, folderId) {
  const note = allNotes.find(n => n.id === noteId);
  if (!note) return;

  const oldFid = noteFolders[noteId];
  if (oldFid === folderId) return;

  await window.api.noteMoveFolder({ noteId, folderId });
  if (folderId) {
    noteFolders[noteId] = folderId;
  } else {
    delete noteFolders[noteId];
  }

  const folder = folders.find(f => f.id === folderId);
  const name = note.title || '无标题';
  showToast(folder ? `「${name}」已移入 ${folder.name}` : `「${name}」已移到未分类`, 'success');
  renderNotesList();
}

// === 视图模式 ===
function toggleViewMode() {
  const toggle = document.getElementById('view-toggle');
  const editArea = document.getElementById('edit-area');
  const preview = document.getElementById('preview-panel');
  const editor = document.getElementById('note-content');

  if (isSplitMode && !isPreviewOnly) {
    isSplitMode = false;
    isPreviewOnly = false;
    toggle.classList.remove('active', 'preview-mode');
    toggle.textContent = '编辑';
    editArea.classList.remove('split');
    preview.classList.add('hidden');
    editor.disabled = false;
    editor.focus();
  } else if (!isSplitMode && !isPreviewOnly) {
    isSplitMode = false;
    isPreviewOnly = true;
    toggle.classList.remove('active');
    toggle.classList.add('preview-mode');
    toggle.textContent = '预览';
    editArea.classList.remove('split');
    preview.classList.remove('hidden');
    editor.classList.add('hidden');
    editor.disabled = true;
  } else {
    isSplitMode = true;
    isPreviewOnly = false;
    toggle.classList.add('active');
    toggle.classList.remove('preview-mode');
    toggle.textContent = '双栏';
    editArea.classList.add('split');
    preview.classList.remove('hidden');
    editor.classList.remove('hidden');
    editor.disabled = false;
    editor.focus();
  }
  updatePreview();
}

function updatePreview() {
  const preview = document.getElementById('preview-panel');
  const editor = document.getElementById('note-content');
  const content = editor.value || '';
  preview.innerHTML = marked.parse(content);
  preview.querySelectorAll('pre code').forEach(block => { hljs.highlightElement(block); });
  loadPreviewImages(preview);
}

// === 滚动同步 ===
function onEditorScroll() {
  if (!isSplitMode || isSyncingScroll) return;
  isSyncingScroll = true;
  const editor = document.getElementById('note-content');
  const preview = document.getElementById('preview-panel');
  if (editor.scrollHeight > editor.clientHeight) {
    const ratio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
    preview.scrollTop = ratio * Math.max(preview.scrollHeight - preview.clientHeight, 0);
  }
  setTimeout(() => { isSyncingScroll = false; }, 30);
}

function onPreviewScroll() {
  if (!isSplitMode || isSyncingScroll) return;
  isSyncingScroll = true;
  const editor = document.getElementById('note-content');
  const preview = document.getElementById('preview-panel');
  if (preview.scrollHeight > preview.clientHeight) {
    const ratio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
    editor.scrollTop = ratio * Math.max(editor.scrollHeight - editor.clientHeight, 0);
  }
  setTimeout(() => { isSyncingScroll = false; }, 30);
}

async function loadPreviewImages(container) {
  // 只处理 snimg:// 协议的图片（data URL 图片已直接嵌入）
  const imgs = container.querySelectorAll('img[data-snimg]');
  for (const img of imgs) {
    const id = img.dataset.snimg;
    if (!imageCache.has(id)) {
      const dataUrl = await window.api.imageLoad(id);
      if (dataUrl) imageCache.set(id, dataUrl);
    }
    if (imageCache.has(id)) img.src = imageCache.get(id);
  }

  // 预加载文件数据到缓存
  const fileAttachments = container.querySelectorAll('.file-attachment');
  for (const attachment of fileAttachments) {
    const id = attachment.dataset.fileId;
    if (!fileCache.has(id)) {
      const fileData = await window.api.fileLoad(id);
      if (fileData) fileCache.set(id, fileData);
    }
  }
}

// 下载文件
async function downloadFile(fileId) {
  const fileData = fileCache.get(fileId) || await window.api.fileLoad(fileId);
  if (!fileData) {
    showToast('文件加载失败', 'error');
    return;
  }

  // 创建下载链接
  const link = document.createElement('a');
  link.href = fileData.data;
  link.download = fileData.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`正在下载: ${fileData.name}`, 'success');
}

// === 增强粘贴：图片 + 文件 ===
async function handlePaste(e) {
  // 优先处理剪贴板数据
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    // 图片
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) await pasteImage(file);
      return;
    }
    // 文件
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        await pasteFile(file);
        return;
      }
    }
  }
}

// 点击图片上传按钮：打开图片选择器
function triggerImageUpload() {
  document.getElementById('file-input').click();
}

// 点击文件上传按钮：打开文件选择器（仅非图片文件）
function triggerFileUploadDialog() {
  const input = document.getElementById('file-upload-input');
  input.accept = ''; // 接受所有文件
  input.click();
}

// 处理选择的图片
async function handleImageInput(e) {
  addDebugLog('[handleImageInput] 开始执行');
  const files = e.target.files;
  if (!files || files.length === 0) {
    addDebugLog('[handleImageInput] 没有选择文件');
    return;
  }
  addDebugLog('[handleImageInput] 文件数: ' + files.length);
  
  // 确保有打开的笔记
  if (!currentNote) {
    addDebugLog('[handleImageInput] 错误: currentNote=null');
    showToast('请先新建或打开笔记', 'warning');
    return;
  }
  addDebugLog('[handleImageInput] currentNote.id=' + currentNote.id);
  
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      addDebugLog('[handleImageInput] 处理图片: ' + file.name);
      await pasteImage(file);
    }
  }
  e.target.value = '';
  addDebugLog('[handleImageInput] 完成');
}

// 处理选择的文件（非图片）
async function handleFileInput(e) {
  addDebugLog('[handleFileInput] 开始执行');
  const files = e.target.files;
  if (!files || files.length === 0) {
    addDebugLog('[handleFileInput] 没有选择文件');
    return;
  }
  addDebugLog('[handleFileInput] 文件数: ' + files.length);
  
  // 确保有打开的笔记
  if (!currentNote) {
    addDebugLog('[handleFileInput] 错误: currentNote=null');
    showToast('请先新建或打开笔记', 'warning');
    return;
  }
  addDebugLog('[handleFileInput] currentNote.id=' + currentNote.id);
  
  for (const file of files) {
    // 非图片文件才处理
    if (!file.type.startsWith('image/')) {
      addDebugLog('[handleFileInput] 处理文件: ' + file.name);
      await pasteFile(file);
    }
  }
  e.target.value = '';
  addDebugLog('[handleFileInput] 完成');
}

async function pasteImage(file) {
  addDebugLog('[pasteImage] 开始: ' + file.name + ' 类型:' + file.type);
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    addDebugLog('[pasteImage] 读取完成 DataURL长度:' + dataUrl.length);
    addDebugLog('[pasteImage] 调用imageSave API...');
    
    // 保存到加密存储，使用 snimg:// 协议
    const result = await window.api.imageSave({ dataUrl });
    addDebugLog('[pasteImage] imageSave返回: ' + JSON.stringify(result));
    
    if (result?.id) {
      addDebugLog('[pasteImage] 保存成功, ID:' + result.id);
      // 保存图片 ID 到缓存
      imageCache.set(result.id, dataUrl);
      // 在编辑器中插入 Markdown 标记
      insertAtCursor(`\n![${file.name}](snimg://${result.id})\n`);
      // 更新预览区域的图片
      updateImagePreviewArea();
      showToast('图片已插入', 'success');
    } else if (!currentNote) {
      addDebugLog('[pasteImage] 失败: 没有打开的笔记');
      showToast('请先新建或打开笔记', 'warning');
    } else {
      addDebugLog('[pasteImage] 失败: 未登录或其他错误');
      showToast('请先登录', 'error');
    }
  };
  reader.onerror = () => {
    addDebugLog('[pasteImage] 错误: FileReader失败');
    showToast('图片读取失败', 'error');
  };
  reader.readAsDataURL(file);
}

// 更新图片预览区域
async function updateImagePreviewArea() {
  const previewArea = document.getElementById('image-preview-area');
  const editor = document.getElementById('note-content');
  const content = editor?.value || '';
  
  // 提取所有 snimg:// 和 snfile:// 的 ID
  const imagePattern = /!\[.*?\]\(snimg:\/\/([^)]+)\)/g;
  const filePattern = /📎 \[([^\]]+)\]\(snfile:\/\/([^)]+)\)/g;
  
  let imageIds = [];
  let match;
  while ((match = imagePattern.exec(content)) !== null) {
    imageIds.push({ id: match[1], name: match[0] });
  }
  while ((match = filePattern.exec(content)) !== null) {
    imageIds.push({ id: match[2], name: match[1], isFile: true });
  }
  
  if (imageIds.length === 0) {
    previewArea.innerHTML = '';
    previewArea.classList.remove('has-images');
    return;
  }
  
  previewArea.classList.add('has-images');
  previewArea.innerHTML = '';
  
  for (const item of imageIds) {
    if (item.isFile) {
      // 文件预览
      const fileData = fileCache.get(item.id) || await window.api.fileLoad(item.id);
      if (fileData) {
        fileCache.set(item.id, fileData);
        previewArea.innerHTML += `
          <div class="file-preview-item" data-file-id="${item.id}">
            <span class="file-icon">📎</span>
            <span class="file-name" title="${item.name}">${item.name}</span>
          </div>
        `;
      }
    } else {
      // 图片预览
      let dataUrl = imageCache.get(item.id);
      if (!dataUrl) {
        dataUrl = await window.api.imageLoad(item.id);
        if (dataUrl) imageCache.set(item.id, dataUrl);
      }
      if (dataUrl) {
        previewArea.innerHTML += `
          <div class="preview-item" data-image-id="${item.id}">
            <img src="${dataUrl}" alt="${item.name}">
            <button class="remove-btn" onclick="removeImageFromEditor('${item.id}')">×</button>
          </div>
        `;
      }
    }
  }
}

// 从编辑器中移除图片
window.removeImageFromEditor = function(imageId) {
  const editor = document.getElementById('note-content');
  const content = editor.value;
  // 移除图片标记
  editor.value = content.replace(new RegExp(`!?\\[([^\\]]*)\\]\\(snimg://${imageId}\\)`, 'g'), '');
  // 清除缓存
  imageCache.delete(imageId);
  isDirty = true;
  updateSaveStatus();
  updateImagePreviewArea();
  showToast('图片已移除', 'success');
};

async function pasteFile(file) {
  addDebugLog('[pasteFile] 开始: ' + file.name + ' 类型:' + file.type + ' 大小:' + file.size);
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    const size = formatFileSize(file.size);
    addDebugLog('[pasteFile] 读取完成 DataURL长度:' + dataUrl.length);
    addDebugLog('[pasteFile] 调用fileSave API...');
    
    // 通过 IPC 保存到加密数据目录
    try {
      const result = await window.api.fileSave({
        fileDataUrl: dataUrl,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream'
      });
      addDebugLog('[pasteFile] fileSave返回: ' + JSON.stringify(result));
      
      if (result?.id) {
        addDebugLog('[pasteFile] 保存成功, ID:' + result.id);
        // 保存到缓存
        fileCache.set(result.id, {
          name: file.name,
          type: file.type,
          size: file.size,
          data: dataUrl
        });
        
        // 在编辑器中插入文件引用
        const editor = document.getElementById('note-content');
        if (editor) {
          addDebugLog('[pasteFile] 插入编辑器');
          insertAtCursor(`\n📎 [${file.name} (${size})](snfile://${result.id})\n`);
        } else {
          addDebugLog('[pasteFile] 编辑器不存在');
        }
        
        // 更新预览区域
        updateImagePreviewArea();
        showToast(`文件「${file.name}」已插入`, 'success');
      } else if (!currentNote) {
        addDebugLog('[pasteFile] 失败: 没有打开的笔记');
        showToast('请先新建或打开笔记', 'warning');
      } else {
        addDebugLog('[pasteFile] 失败: 未登录或其他错误');
        showToast('请先登录', 'error');
      }
    } catch (err) {
      addDebugLog('[pasteFile] 异常: ' + err.message);
      showToast('文件保存失败', 'error');
    }
  };
  reader.onerror = () => {
    addDebugLog('[pasteFile] 错误: FileReader失败');
    showToast('文件读取失败', 'error');
  };
  reader.readAsDataURL(file);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function insertAtCursor(text) {
  addDebugLog('[insertAtCursor] 开始插入文本: ' + text.substring(0, 30) + '...');
  const editor = document.getElementById('note-content');
  if (!editor) {
    addDebugLog('[insertAtCursor] 错误: 编辑器元素不存在');
    return;
  }
  addDebugLog('[insertAtCursor] 编辑器存在');
  
  const start = editor.selectionStart ?? 0;
  const end = editor.selectionEnd ?? 0;
  const value = editor.value || '';
  editor.value = value.substring(0, start) + text + value.substring(end);
  editor.selectionStart = editor.selectionEnd = start + text.length;
  editor.focus();
  addDebugLog('[insertAtCursor] 插入完成，编辑器内容长度: ' + editor.value.length);
  onContentChange();
}

// === 格式化 ===
function insertFormat(type) {
  const editor = document.getElementById('note-content');
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const text = editor.value;
  const selected = text.substring(start, end);

  let insert = '', cursorOffset = 0;
  switch (type) {
    case 'bold': insert = `**${selected || '粗体文本'}**`; cursorOffset = selected ? insert.length : 2; break;
    case 'italic': insert = `*${selected || '斜体文本'}*`; cursorOffset = selected ? insert.length : 1; break;
    case 'heading': insert = `## ${selected || '标题'}`; cursorOffset = insert.length; break;
    case 'link': insert = `[${selected || '链接文本'}](url)`; cursorOffset = selected ? insert.length - 5 : 1; break;
    case 'code':
      insert = selected.includes('\n')
        ? `\`\`\`\n${selected || '代码'}\n\`\`\``
        : `\`${selected || '代码'}\``;
      cursorOffset = selected ? insert.length : 1;
      break;
    case 'quote': insert = `> ${selected || '引用'}`; cursorOffset = insert.length; break;
    case 'list': insert = `- ${selected || '列表项'}`; cursorOffset = insert.length; break;
  }

  editor.value = text.substring(0, start) + insert + text.substring(end);
  editor.focus();
  editor.setSelectionRange(start + cursorOffset, start + cursorOffset);
  onContentChange();
}

// === 快捷键 ===
function handleKeydown(e) {
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveNote(); }
  if (e.ctrlKey && e.key === 'n') { e.preventDefault(); createNote(); }
}

function updateSaveStatus() {
  const statusEl = document.getElementById('save-status');
  if (isDirty) {
    statusEl.textContent = '● 未保存';
    statusEl.className = 'save-status';
  }
}

// === 工具函数 ===
function escHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = Date.now() - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return d.toLocaleDateString('zh-CN');
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function toggleMaximize() {
  window.api.maximize();
}

// === 移动端侧边栏 ===
function toggleSidebar(force) {
  sidebarOpen = force !== undefined ? force : !sidebarOpen;
  document.querySelector('.sidebar').classList.toggle('open', sidebarOpen);
}

// === 全屏预览 ===
function toggleFullPreview() {
  const overlay = document.getElementById('full-preview');
  if (overlay.classList.contains('hidden')) {
    const content = document.getElementById('note-content').value || '';
    const previewContent = document.getElementById('full-preview-content');
    previewContent.innerHTML = marked.parse(content);
    previewContent.querySelectorAll('pre code').forEach(block => { hljs.highlightElement(block); });
    loadPreviewImages(previewContent);
    overlay.classList.remove('hidden');
  } else {
    exitFullPreview();
  }
}

function exitFullPreview() {
  document.getElementById('full-preview').classList.add('hidden');
}
