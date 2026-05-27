const STORAGE_KEY = 'roleplay-chatbox-state-v1';
const DB_NAME = 'roleplay-chatbox-db';
const STORE_NAME = 'messages';

const els = {
  apiBase: document.getElementById('apiBase'),
  apiKey: document.getElementById('apiKey'),
  modelName: document.getElementById('modelName'),
  systemPrompt: document.getElementById('systemPrompt'),
  saveSettings: document.getElementById('saveSettings'),
  clearSettings: document.getElementById('clearSettings'),
  cardFileInput: document.getElementById('cardFileInput'),
  characterInfo: document.getElementById('characterInfo'),
  useFirstMessage: document.getElementById('useFirstMessage'),
  clearCharacter: document.getElementById('clearCharacter'),
  exportData: document.getElementById('exportData'),
  importDataInput: document.getElementById('importDataInput'),
  clearChat: document.getElementById('clearChat'),
  messages: document.getElementById('messages'),
  chatForm: document.getElementById('chatForm'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  chatMeta: document.getElementById('chatMeta'),
  template: document.getElementById('messageTemplate'),
  settingsToggle: document.getElementById('settingsToggle'),
  settingsPanel: document.getElementById('settingsPanel'),
};

let state = {
  settings: {
    apiBase: 'https://api.openai.com/v1',
    apiKey: '',
    modelName: 'gpt-4o-mini',
    systemPrompt: ''
  },
  character: null,
  sessionId: crypto.randomUUID()
};

let db;

async function init() {
  await initDb();
  loadState();
  bindEvents();
  fillForm();
  await renderMessages();
  renderCharacter();
  updateMeta();
  registerServiceWorker();
}

function bindEvents() {
  els.saveSettings.addEventListener('click', saveSettingsFromForm);
  els.clearSettings.addEventListener('click', () => {
    state.settings = { apiBase: 'https://api.openai.com/v1', apiKey: '', modelName: 'gpt-4o-mini', systemPrompt: '' };
    persistState(); fillForm();
  });
  els.cardFileInput.addEventListener('change', onCardFileSelected);
  els.useFirstMessage.addEventListener('click', insertFirstMessage);
  els.clearCharacter.addEventListener('click', () => {
    state.character = null; persistState(); renderCharacter(); updateMeta();
  });
  els.exportData.addEventListener('click', exportAllData);
  els.importDataInput.addEventListener('change', importAllData);
  els.clearChat.addEventListener('click', clearCurrentChat);
  els.chatForm.addEventListener('submit', onSend);
  els.newChatBtn.addEventListener('click', async () => {
    state.sessionId = crypto.randomUUID();
    persistState();
    await renderMessages();
    updateMeta();
  });
  els.settingsToggle.addEventListener('click', () => {
    els.settingsPanel.classList.toggle('open');
  });
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state = { ...state, ...parsed, settings: { ...state.settings, ...(parsed.settings || {}) } };
  } catch (e) {
    console.error('加载本地状态失败', e);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fillForm() {
  els.apiBase.value = state.settings.apiBase || '';
  els.apiKey.value = state.settings.apiKey || '';
  els.modelName.value = state.settings.modelName || '';
  els.systemPrompt.value = state.settings.systemPrompt || '';
}

function saveSettingsFromForm() {
  state.settings = {
    apiBase: els.apiBase.value.trim(),
    apiKey: els.apiKey.value.trim(),
    modelName: els.modelName.value.trim(),
    systemPrompt: els.systemPrompt.value.trim()
  };
  persistState();
  alert('设置已保存到本地浏览器。');
}

function renderCharacter() {
  if (!state.character) {
    els.characterInfo.textContent = '尚未导入角色卡';
    els.characterInfo.classList.add('empty');
    return;
  }
  const c = state.character;
  els.characterInfo.classList.remove('empty');
  els.characterInfo.textContent = [
    `名字：${c.name || '未命名角色'}`,
    c.description ? `简介：${c.description}` : '',
    c.personality ? `性格：${c.personality}` : '',
    c.first_mes ? `开场白：${c.first_mes}` : ''
  ].filter(Boolean).join('\n\n');
}

function updateMeta() {
  const name = state.character?.name || '未连接角色';
  els.chatMeta.textContent = `当前角色：${name} ｜ 会话 ID：${state.sessionId.slice(0, 8)}`;
}

async function onCardFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      const text = await file.text();
      const json = JSON.parse(text);
      state.character = normalizeCharacter(json);
    } else if (file.type === 'image/png' || file.name.endsWith('.png')) {
      const buffer = await file.arrayBuffer();
      const json = extractJsonFromPng(buffer);
      state.character = normalizeCharacter(json);
    } else {
      throw new Error('暂不支持这个文件类型');
    }
    persistState();
    renderCharacter();
    updateMeta();
    alert('角色卡导入成功。');
  } catch (err) {
    console.error(err);
    alert(`导入失败：${err.message}`);
  } finally {
    event.target.value = '';
  }
}

function normalizeCharacter(data) {
  const root = data.data ? data.data : data;
  return {
    name: root.name || root.char_name || '未命名角色',
    description: root.description || root.desc || root.context || '',
    personality: root.personality || '',
    first_mes: root.first_mes || root.firstMessage || '',
    mes_example: root.mes_example || '',
    scenario: root.scenario || '',
    raw: data
  };
}

function extractJsonFromPng(buffer) {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');
  let offset = 8;
  while (offset < bytes.length) {
    const length = readUint32(bytes, offset);
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunk = bytes.slice(dataStart, dataEnd);

    if (type === 'tEXt' || type === 'iTXt') {
      const extracted = parseTextChunk(type, chunk);
      if (extracted) return extracted;
    }
    offset = dataEnd + 4;
  }
  throw new Error('PNG 中没有找到可识别的角色数据。');
}

function parseTextChunk(type, chunk) {
  if (type === 'tEXt') {
    const zero = chunk.indexOf(0);
    if (zero === -1) return null;
    const text = new TextDecoder('latin1').decode(chunk.slice(zero + 1));
    return tryParseCharacterJson(text);
  }
  if (type === 'iTXt') {
    const zero = chunk.indexOf(0);
    if (zero === -1) return null;
    let idx = zero + 1;
    const compressionFlag = chunk[idx]; idx += 1;
    idx += 1;
    const langEnd = chunk.indexOf(0, idx); if (langEnd === -1) return null;
    idx = langEnd + 1;
    const translatedEnd = chunk.indexOf(0, idx); if (translatedEnd === -1) return null;
    idx = translatedEnd + 1;
    const textBytes = chunk.slice(idx);
    if (compressionFlag !== 0) throw new Error('暂不支持压缩 iTXt');
    const text = new TextDecoder('utf-8').decode(textBytes);
    return tryParseCharacterJson(text);
  }
  return null;
}

function tryParseCharacterJson(text) {
  try {
    const direct = JSON.parse(text);
    return direct;
  } catch (_) {}
  try {
    const maybeBase64 = atob(text);
    return JSON.parse(maybeBase64);
  } catch (_) {}
  return null;
}

function readUint32(bytes, offset) {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function insertFirstMessage() {
  if (!state.character?.first_mes) return alert('当前角色没有开场白。');
  els.userInput.value = state.character.first_mes;
  els.userInput.focus();
}

async function onSend(event) {
  event.preventDefault();
  const userText = els.userInput.value.trim();
  if (!userText) return;
  if (!state.settings.apiBase || !state.settings.apiKey || !state.settings.modelName) {
    return alert('请先填写 API Base URL、API Key 和 Model。');
  }

  els.sendBtn.disabled = true;
  const pendingText = '...';
  try {
    await addMessage({ role: 'user', content: userText, sessionId: state.sessionId, createdAt: Date.now() });
    els.userInput.value = '';
    await renderMessages();

    const messages = await getMessagesBySession(state.sessionId);
    const apiMessages = buildApiMessages(messages);
    await addMessage({ role: 'assistant', content: pendingText, sessionId: state.sessionId, createdAt: Date.now(), pending: true });
    await renderMessages();

    const reply = await requestChatCompletion(apiMessages);
    await replaceLastPending(reply);
    await renderMessages();
  } catch (err) {
    console.error(err);
    alert(`发送失败：${err.message}`);
    await removePendingMessages();
    await renderMessages();
  } finally {
    els.sendBtn.disabled = false;
  }
}

function buildApiMessages(existingMessages) {
  const arr = [];
  const c = state.character;
  const systemParts = [];
  if (c) {
    systemParts.push(`你现在扮演角色：${c.name || '未命名角色'}`);
    if (c.description) systemParts.push(`角色描述：${c.description}`);
    if (c.personality) systemParts.push(`性格：${c.personality}`);
    if (c.scenario) systemParts.push(`场景：${c.scenario}`);
  }
  if (state.settings.systemPrompt) systemParts.push(state.settings.systemPrompt);
  if (systemParts.length) arr.push({ role: 'system', content: systemParts.join('\n') });

  for (const m of existingMessages.filter(m => !m.pending)) {
    arr.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  return arr;
}

async function requestChatCompletion(messages) {
  const endpoint = `${state.settings.apiBase.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.settings.apiKey}`
    },
    body: JSON.stringify({
      model: state.settings.modelName,
      messages,
      temperature: 0.8
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API 错误 ${response.status}: ${text}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 没有返回消息内容。');
  return content;
}

async function initDb() {
  db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode = 'readonly') {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

async function addMessage(message) {
  await new Promise((resolve, reject) => {
    const req = tx('readwrite').add(message);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getMessagesBySession(sessionId) {
  return await new Promise((resolve, reject) => {
    const store = tx();
    const index = store.index('sessionId');
    const req = index.getAll(sessionId);
    req.onsuccess = () => resolve(req.result.sort((a,b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

async function renderMessages() {
  const messages = await getMessagesBySession(state.sessionId);
  els.messages.innerHTML = '';
  for (const msg of messages) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.classList.add(msg.role);
    node.querySelector('.message-role').textContent = msg.role === 'assistant' ? (state.character?.name || 'Assistant') : '你';
    node.querySelector('.message-bubble').textContent = msg.content;
    els.messages.appendChild(node);
  }
  els.messages.scrollTop = els.messages.scrollHeight;
}

async function replaceLastPending(content) {
  const messages = await getMessagesBySession(state.sessionId);
  const pending = [...messages].reverse().find(m => m.pending);
  if (!pending) return;
  await new Promise((resolve, reject) => {
    const store = tx('readwrite');
    const req = store.put({ ...pending, content, pending: false });
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

async function removePendingMessages() {
  const messages = await getMessagesBySession(state.sessionId);
  const pending = messages.filter(m => m.pending);
  for (const p of pending) {
    await new Promise((resolve, reject) => {
      const req = tx('readwrite').delete(p.id);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
  }
}

async function clearCurrentChat() {
  if (!confirm('确定清空当前会话的聊天记录吗？')) return;
  const messages = await getMessagesBySession(state.sessionId);
  for (const m of messages) {
    await new Promise((resolve, reject) => {
      const req = tx('readwrite').delete(m.id);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
  }
  await renderMessages();
}

async function exportAllData() {
  const allMessages = await new Promise((resolve, reject) => {
    const req = tx().getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
    messages: allMessages
  };
  downloadJson(payload, `roleplay-chat-backup-${Date.now()}.json`);
}

async function importAllData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.state || !Array.isArray(data.messages)) throw new Error('备份格式不正确。');

    state = data.state;
    persistState();
    fillForm();
    renderCharacter();
    updateMeta();

    await clearAllMessages();
    for (const m of data.messages) {
      const { id, ...rest } = m;
      await addMessage(rest);
    }
    await renderMessages();
    alert('数据导入成功。');
  } catch (err) {
    console.error(err);
    alert(`导入失败：${err.message}`);
  } finally {
    event.target.value = '';
  }
}

async function clearAllMessages() {
  await new Promise((resolve, reject) => {
    const req = tx('readwrite').clear();
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
}

init();