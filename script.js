/* ========== 碎知识 Kitty - Main Application Script ========== */

(function () {
  'use strict';

  // ========== Constants ==========
  const STORAGE_KEY = 'kitty_knowledge_data';
  const VERSION = '1.0';

  const PRESET_CATEGORIES = [
    { emoji: '📚', name: '公考知识' },
    { emoji: '📝', name: '公文写作' },
    { emoji: '🏡', name: '生活小常识' },
    { emoji: '🚗', name: '驾车技巧' },
    { emoji: '👗', name: '穿搭思路' },
    { emoji: '⚖️', name: '法律实务' },
    { emoji: '⚡', name: '效率工具' }
  ];

  // ========== State ==========
  let state = {
    data: null,
    currentView: 'home',
    currentCategoryId: null,
    editingId: null,
    confirmCallback: null
  };

  // ========== Utilities ==========
  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return escaped.replace(regex, '<span class="highlight">$1</span>');
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function toast(message, type) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.classList.remove('show');
    }, 2200);
  }

  // ========== Data Layer ==========
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.categories) {
          state.data = parsed;
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    initData();
  }

  function initData() {
    const now = new Date().toISOString();
    state.data = {
      version: VERSION,
      categories: PRESET_CATEGORIES.map((c) => ({
        id: uid('cat'),
        emoji: c.emoji,
        name: c.name,
        order: 0,
        createdAt: now,
        subModules: []
      })),
      settings: { lastUpdated: now }
    };
    saveData();
  }

  function saveData() {
    if (!state.data) return;
    state.data.settings = state.data.settings || {};
    state.data.settings.lastUpdated = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    } catch (e) {
      console.error('Failed to save data:', e);
      toast('保存失败：存储空间不足', 'error');
    }
  }

  // ========== CRUD: Categories ==========
  function getCategory(id) {
    return state.data.categories.find((c) => c.id === id);
  }

  function addCategory(emoji, name) {
    const now = new Date().toISOString();
    const cat = {
      id: uid('cat'),
      emoji: emoji || '📌',
      name: name.trim(),
      order: state.data.categories.length,
      createdAt: now,
      subModules: []
    };
    state.data.categories.push(cat);
    saveData();
    return cat;
  }

  function updateCategory(id, updates) {
    const cat = getCategory(id);
    if (!cat) return;
    if (updates.emoji !== undefined) cat.emoji = updates.emoji;
    if (updates.name !== undefined) cat.name = updates.name.trim();
    saveData();
  }

  function deleteCategory(id) {
    const idx = state.data.categories.findIndex((c) => c.id === id);
    if (idx >= 0) {
      state.data.categories.splice(idx, 1);
      saveData();
    }
  }

  // ========== CRUD: SubModules ==========
  function addSubModule(catId, name) {
    const cat = getCategory(catId);
    if (!cat) return;
    cat.subModules = cat.subModules || [];
    const sub = {
      id: uid('sub'),
      name: name.trim(),
      order: cat.subModules.length,
      createdAt: new Date().toISOString(),
      records: []
    };
    cat.subModules.push(sub);
    saveData();
    return sub;
  }

  function updateSubModule(catId, subId, updates) {
    const cat = getCategory(catId);
    if (!cat) return;
    const sub = (cat.subModules || []).find((s) => s.id === subId);
    if (!sub) return;
    if (updates.name !== undefined) sub.name = updates.name.trim();
    saveData();
  }

  function deleteSubModule(catId, subId) {
    const cat = getCategory(catId);
    if (!cat) return;
    const idx = (cat.subModules || []).findIndex((s) => s.id === subId);
    if (idx >= 0) {
      cat.subModules.splice(idx, 1);
      saveData();
    }
  }

  // ========== CRUD: Records ==========
  function addRecord(catId, subId, title, content, tags) {
    const cat = getCategory(catId);
    if (!cat) return;
    const sub = (cat.subModules || []).find((s) => s.id === subId);
    if (!sub) return;
    sub.records = sub.records || [];
    const now = new Date().toISOString();
    const rec = {
      id: uid('rec'),
      title: title.trim(),
      content: content || '',
      tags: (tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      createdAt: now,
      updatedAt: now
    };
    sub.records.push(rec);
    saveData();
    return rec;
  }

  function updateRecord(catId, subId, recId, updates) {
    const cat = getCategory(catId);
    if (!cat) return;
    const sub = (cat.subModules || []).find((s) => s.id === subId);
    if (!sub) return;
    const rec = (sub.records || []).find((r) => r.id === recId);
    if (!rec) return;
    if (updates.title !== undefined) rec.title = updates.title.trim();
    if (updates.content !== undefined) rec.content = updates.content;
    if (updates.tags !== undefined) {
      rec.tags = updates.tags.split(',').map((t) => t.trim()).filter(Boolean);
    }
    rec.updatedAt = new Date().toISOString();
    saveData();
  }

  function deleteRecord(catId, subId, recId) {
    const cat = getCategory(catId);
    if (!cat) return;
    const sub = (cat.subModules || []).find((s) => s.id === subId);
    if (!sub) return;
    const idx = (sub.records || []).findIndex((r) => r.id === recId);
    if (idx >= 0) {
      sub.records.splice(idx, 1);
      saveData();
    }
  }

  // ========== Search ==========
  function searchAll(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    state.data.categories.forEach((cat) => {
      (cat.subModules || []).forEach((sub) => {
        (sub.records || []).forEach((rec) => {
          const haystack = [
            rec.title,
            rec.content,
            ...(rec.tags || [])
          ].join(' ').toLowerCase();
          if (haystack.includes(q)) {
            results.push({
              category: cat,
              subModule: sub,
              record: rec
            });
          }
        });
      });
    });
    return results;
  }

  // ========== Statistics ==========
  function countSubModules(cat) {
    return (cat.subModules || []).length;
  }

  function countRecords(cat) {
    return (cat.subModules || []).reduce((sum, sub) => {
      return sum + ((sub.records || []).length);
    }, 0);
  }

  // ========== Router ==========
  function navigate(view, params) {
    let hash = '#/';
    if (view === 'category') hash = `#/category/${params.id}`;
    else if (view === 'search') hash = '#/search';
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      handleRoute();
    }
  }

  function handleRoute() {
    const hash = window.location.hash || '#/';
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));

    if (hash === '#/') {
      showView('homeView');
      renderHome();
      state.currentView = 'home';
    } else if (hash.startsWith('#/category/')) {
      const id = hash.split('/')[2];
      if (getCategory(id)) {
        showView('categoryView');
        state.currentCategoryId = id;
        renderCategory(id);
        state.currentView = 'category';
      } else {
        navigate('home');
      }
    } else if (hash === '#/search') {
      showView('searchView');
      state.currentView = 'search';
      const input = document.getElementById('searchInput');
      if (input && document.activeElement !== input) {
        setTimeout(() => input.focus(), 100);
      }
    } else {
      navigate('home');
    }
  }

  function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ========== Render: Home ==========
  function renderHome() {
    const grid = document.getElementById('categoryGrid');
    if (!grid) return;
    if (!state.data.categories.length) {
      grid.innerHTML = '<div class="empty-state"><p>🌱 还没有分类</p><p class="empty-hint">点击右下角按钮添加第一个分类</p></div>';
      return;
    }
    grid.innerHTML = state.data.categories.map((cat) => `
      <div class="category-card" data-id="${cat.id}">
        <span class="category-emoji">${escapeHtml(cat.emoji)}</span>
        <div class="category-name">${escapeHtml(cat.name)}</div>
        <div class="category-meta">${countSubModules(cat)} 个子模块 · ${countRecords(cat)} 条记录</div>
      </div>
    `).join('');

    grid.querySelectorAll('.category-card').forEach((card) => {
      card.addEventListener('click', () => {
        navigate('category', { id: card.dataset.id });
      });
      // Long press to edit
      let pressTimer = null;
      card.addEventListener('touchstart', () => {
        pressTimer = setTimeout(() => openCategoryModal(card.dataset.id), 600);
      });
      card.addEventListener('touchend', () => clearTimeout(pressTimer));
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openCategoryModal(card.dataset.id);
      });
    });
  }

  // ========== Render: Category Detail ==========
  function renderCategory(catId) {
    const cat = getCategory(catId);
    if (!cat) return;
    document.getElementById('categoryTitle').textContent = `${cat.emoji} ${cat.name}`;
    document.getElementById('categorySubtitle').textContent =
      `${countSubModules(cat)} 个子模块 · ${countRecords(cat)} 条记录`;

    const subList = document.getElementById('subModuleList');
    const recList = document.getElementById('recordList');
    const emptyState = document.getElementById('emptyCategoryState');

    subList.innerHTML = '';
    recList.innerHTML = '';

    const subModules = cat.subModules || [];
    const allRecords = [];

    subModules.forEach((sub) => {
      const section = document.createElement('div');
      section.className = 'submodule-section';
      section.innerHTML = `
        <div class="submodule-header">
          <span class="submodule-name">${escapeHtml(sub.name)} <span style="font-size:12px;color:var(--text-light);">(${(sub.records || []).length})</span></span>
          <div class="submodule-actions">
            <button data-action="edit-sub" data-id="${sub.id}">编辑</button>
            <button data-action="delete-sub" data-id="${sub.id}" class="delete">删除</button>
          </div>
        </div>
      `;
      subList.appendChild(section);

      (sub.records || []).forEach((rec) => allRecords.push({ rec, sub }));
    });

    allRecords.forEach(({ rec, sub }) => {
      const card = document.createElement('div');
      card.className = 'record-card';
      card.dataset.id = rec.id;
      card.dataset.subId = sub.id;
      card.innerHTML = `
        <div class="record-title">${escapeHtml(rec.title)}</div>
        <div class="record-content">${escapeHtml(rec.content || '')}</div>
        ${(rec.tags && rec.tags.length) ? `<div class="record-tags">${rec.tags.map((t) => `<span class="record-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      `;
      recList.appendChild(card);
    });

    // Show empty state if no submodules and no records
    if (subModules.length === 0) {
      emptyState.style.display = 'block';
      recList.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      recList.style.display = 'flex';
    }

    // Bind submodule actions
    subList.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const subId = btn.dataset.id;
        if (action === 'edit-sub') {
          openSubModuleModal(catId, subId);
        } else if (action === 'delete-sub') {
          confirm(`确定要删除子模块「${sub.name}」吗？其中的记录也会被删除。`, () => {
            deleteSubModule(catId, subId);
            renderCategory(catId);
            toast('已删除子模块', 'success');
          });
        }
      });
    });

    // Bind record card clicks
    recList.querySelectorAll('.record-card').forEach((card) => {
      card.addEventListener('click', () => {
        openRecordModal(catId, card.dataset.subId, card.dataset.id);
      });
    });
  }

  // ========== Render: Search ==========
  function doSearch(query) {
    const results = searchAll(query);
    const container = document.getElementById('searchResults');
    if (!query.trim()) {
      container.innerHTML = '<div class="empty-state"><p>🔍 输入关键词开始搜索</p></div>';
      return;
    }
    if (!results.length) {
      container.innerHTML = '<div class="empty-state"><p>🌸 没有找到相关记录</p><p class="empty-hint">试试其他关键词</p></div>';
      return;
    }
    container.innerHTML = results.map(({ category, subModule, record }) => `
      <div class="search-result-item" data-cat="${category.id}" data-sub="${subModule.id}" data-rec="${record.id}">
        <div class="search-result-path">${escapeHtml(category.emoji)} ${escapeHtml(category.name)} › ${escapeHtml(subModule.name)}</div>
        <div class="search-result-title">${highlight(record.title, query)}</div>
        <div class="record-content">${highlight((record.content || '').slice(0, 100), query)}</div>
      </div>
    `).join('');

    container.querySelectorAll('.search-result-item').forEach((item) => {
      item.addEventListener('click', () => {
        state.currentCategoryId = item.dataset.cat;
        navigate('category', { id: item.dataset.cat });
      });
    });
  }

  // ========== Modals ==========
  function openCategoryModal(catId) {
    const modal = document.getElementById('categoryModal');
    const titleEl = document.getElementById('categoryModalTitle');
    const emojiEl = document.getElementById('categoryEmoji');
    const nameEl = document.getElementById('categoryName');
    if (catId) {
      const cat = getCategory(catId);
      if (!cat) return;
      titleEl.textContent = '编辑分类';
      emojiEl.value = cat.emoji;
      nameEl.value = cat.name;
      state.editingId = catId;
    } else {
      titleEl.textContent = '新建分类';
      emojiEl.value = '';
      nameEl.value = '';
      state.editingId = null;
    }
    modal.style.display = 'flex';
    setTimeout(() => nameEl.focus(), 50);
  }

  function openSubModuleModal(catId, subId) {
    const modal = document.getElementById('subModuleModal');
    const titleEl = document.getElementById('subModuleModalTitle');
    const nameEl = document.getElementById('subModuleName');
    if (subId) {
      const cat = getCategory(catId);
      const sub = (cat.subModules || []).find((s) => s.id === subId);
      if (!sub) return;
      titleEl.textContent = '编辑子模块';
      nameEl.value = sub.name;
      state.editingId = { catId, subId };
    } else {
      titleEl.textContent = '新建子模块';
      nameEl.value = '';
      state.editingId = { catId };
    }
    modal.style.display = 'flex';
    setTimeout(() => nameEl.focus(), 50);
  }

  function openRecordModal(catId, subId, recId) {
    const modal = document.getElementById('recordModal');
    const titleEl = document.getElementById('recordModalTitle');
    const selectEl = document.getElementById('recordSubModule');
    const titleInput = document.getElementById('recordTitle');
    const contentInput = document.getElementById('recordContent');
    const tagsInput = document.getElementById('recordTags');

    const cat = getCategory(catId);
    if (!cat) return;

    // Populate submodule select
    selectEl.innerHTML = (cat.subModules || []).map((s) =>
      `<option value="${s.id}">${escapeHtml(s.name)}</option>`
    ).join('') || '<option value="">（请先创建子模块）</option>';

    if (recId) {
      let foundSub = null, foundRec = null;
      (cat.subModules || []).forEach((sub) => {
        const r = (sub.records || []).find((rr) => rr.id === recId);
        if (r) { foundSub = sub; foundRec = r; }
      });
      if (!foundRec) return;
      titleEl.textContent = '编辑记录';
      selectEl.value = foundSub.id;
      titleInput.value = foundRec.title;
      contentInput.value = foundRec.content || '';
      tagsInput.value = (foundRec.tags || []).join(', ');
      state.editingId = { catId, subId: foundSub.id, recId };
    } else {
      titleEl.textContent = '新建记录';
      titleInput.value = '';
      contentInput.value = '';
      tagsInput.value = '';
      // Default to first submodule
      if ((cat.subModules || []).length) {
        selectEl.value = cat.subModules[0].id;
        state.editingId = { catId, subId: cat.subModules[0].id };
      } else {
        state.editingId = null;
      }
    }
    modal.style.display = 'flex';
    setTimeout(() => titleInput.focus(), 50);
  }

  function closeAllModals() {
    document.querySelectorAll('.modal').forEach((m) => m.style.display = 'none');
    state.editingId = null;
  }

  function confirm(message, callback) {
    document.getElementById('confirmTitle').textContent = '请确认';
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmModal').style.display = 'flex';
    state.confirmCallback = callback;
  }

  // ========== Import / Export ==========
  function exportData() {
    try {
      const data = JSON.stringify(state.data, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kitty-knowledge-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('已导出备份文件', 'success');
    } catch (e) {
      console.error(e);
      toast('导出失败', 'error');
    }
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || !Array.isArray(data.categories)) {
          throw new Error('数据格式不正确');
        }
        confirm('导入将覆盖当前所有数据，确定继续吗？', () => {
          state.data = {
            version: data.version || VERSION,
            categories: data.categories,
            settings: data.settings || { lastUpdated: new Date().toISOString() }
          };
          saveData();
          handleRoute();
          toast('数据导入成功', 'success');
        });
      } catch (err) {
        toast('导入失败：文件格式错误', 'error');
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    confirm('确定要清空所有数据吗？此操作无法撤销！建议先导出备份。', () => {
      localStorage.removeItem(STORAGE_KEY);
      initData();
      handleRoute();
      toast('已清空数据', 'success');
    });
  }

  // ========== Event Bindings ==========
  function bindEvents() {
    // Navigation
    document.getElementById('navHome').addEventListener('click', () => navigate('home'));
    document.getElementById('navSearch').addEventListener('click', () => navigate('search'));
    document.getElementById('navSettings').addEventListener('click', () => {
      document.getElementById('settingsModal').style.display = 'flex';
    });
    document.getElementById('backToHome').addEventListener('click', () => navigate('home'));
    document.getElementById('backToHomeFromSearch').addEventListener('click', () => navigate('home'));

    // Category actions
    document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal());
    document.getElementById('cancelCategoryBtn').addEventListener('click', closeAllModals);
    document.getElementById('saveCategoryBtn').addEventListener('click', () => {
      const emoji = document.getElementById('categoryEmoji').value.trim();
      const name = document.getElementById('categoryName').value.trim();
      if (!name) {
        toast('请输入分类名称', 'error');
        return;
      }
      if (state.editingId) {
        updateCategory(state.editingId, { emoji, name });
        toast('已更新', 'success');
      } else {
        addCategory(emoji, name);
        toast('已创建分类', 'success');
      }
      closeAllModals();
      handleRoute();
    });

    // SubModule actions
    document.getElementById('addSubModuleBtn').addEventListener('click', () => {
      if (!state.currentCategoryId) return;
      openSubModuleModal(state.currentCategoryId);
    });
    document.getElementById('cancelSubModuleBtn').addEventListener('click', closeAllModals);
    document.getElementById('saveSubModuleBtn').addEventListener('click', () => {
      const name = document.getElementById('subModuleName').value.trim();
      if (!name) {
        toast('请输入子模块名称', 'error');
        return;
      }
      const { catId, subId } = state.editingId || {};
      if (subId) {
        updateSubModule(catId, subId, { name });
        toast('已更新', 'success');
      } else if (catId) {
        addSubModule(catId, name);
        toast('已创建子模块', 'success');
      }
      closeAllModals();
      renderCategory(state.currentCategoryId);
    });

    // Record actions
    document.getElementById('addRecordBtn').addEventListener('click', () => {
      if (!state.currentCategoryId) return;
      const cat = getCategory(state.currentCategoryId);
      if (!cat || !cat.subModules || !cat.subModules.length) {
        toast('请先创建子模块', 'error');
        return;
      }
      openRecordModal(state.currentCategoryId);
    });
    document.getElementById('cancelRecordBtn').addEventListener('click', closeAllModals);
    document.getElementById('saveRecordBtn').addEventListener('click', () => {
      const title = document.getElementById('recordTitle').value.trim();
      const content = document.getElementById('recordContent').value;
      const tags = document.getElementById('recordTags').value;
      const subModuleId = document.getElementById('recordSubModule').value;
      if (!title) {
        toast('请输入记录标题', 'error');
        return;
      }
      if (!subModuleId) {
        toast('请先创建子模块', 'error');
        return;
      }
      const { catId, subId, recId } = state.editingId || {};
      if (recId) {
        updateRecord(catId, subId, recId, { title, content, tags });
        toast('已更新', 'success');
      } else if (catId) {
        addRecord(catId, subModuleId, title, content, tags);
        toast('已创建记录', 'success');
      }
      closeAllModals();
      renderCategory(state.currentCategoryId);
    });

    // Delete category
    document.getElementById('deleteCategoryBtn').addEventListener('click', () => {
      if (!state.currentCategoryId) return;
      const cat = getCategory(state.currentCategoryId);
      if (!cat) return;
      confirm(`确定要删除分类「${cat.name}」吗？其中的所有子模块和记录都会被删除。`, () => {
        deleteCategory(state.currentCategoryId);
        toast('已删除分类', 'success');
        navigate('home');
      });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce((e) => {
      doSearch(e.target.value);
    }, 250));

    // Settings
    document.getElementById('closeSettingsBtn').addEventListener('click', closeAllModals);
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });
    document.getElementById('clearDataBtn').addEventListener('click', clearAllData);

    // Confirm modal
    document.getElementById('confirmCancelBtn').addEventListener('click', () => {
      state.confirmCallback = null;
      closeAllModals();
    });
    document.getElementById('confirmOkBtn').addEventListener('click', () => {
      const cb = state.confirmCallback;
      state.confirmCallback = null;
      closeAllModals();
      if (cb) cb();
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach((bd) => {
      bd.addEventListener('click', closeAllModals);
    });

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
    });

    // Hash routing
    window.addEventListener('hashchange', handleRoute);
  }

  // ========== Init ==========
  function init() {
    loadData();
    bindEvents();
    handleRoute();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();