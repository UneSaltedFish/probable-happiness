const STORAGE_KEY = 'roleplay-chatbox-state-v222';
const DB_NAME = 'roleplay-chatbox-db';
const STORE_NAME = 'messages';

const DEFAULT_PROMPT_TEMPLATE = [
  '你现在扮演角色：{{char}}',
  '{{description_block}}',
  '{{personality_block}}',
  '{{scenario_block}}',
  '{{system_prompt_block}}',
  '{{depth_prompt_block}}',
  '{{lorebook_block}}',
  '{{user_persona_block}}',
  '{{custom_system_prompt_block}}',
  '{{post_history_block}}'
].join('\n');

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
  userName: document.getElementById('userName'),
  userPersona: document.getElementById('userPersona'),
  toggleCardDetails: document.getElementById('toggleCardDetails'),
  cardDetails: document.getElementById('cardDetails'),
  cardDetailsText: document.getElementById('cardDetailsText'),
  lorebookInfo: document.getElementById('lorebookInfo'),
  promptTemplate: document.getElementById('promptTemplate'),
};

let state = {
  settings: {
    apiBase: 'https://api.deepseek.com',
    apiKey: '',
    modelName: 'deepseek-v4-flash',
    systemPrompt: '',
    userName: 'User',
    userPersona: '',
    promptTemplate: DEFAULT_PROMPT_TEMPLATE,
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
    state.settings = {
      apiBase: 'https://api.deepseek.com',
      apiKey: '',
      modelName: 'deepseek-v4-flash',
      systemPrompt: '',
      userName: 'User',
      userPersona: '',
      promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    };
    persistState();
    fillForm();
  });

  els.cardFileInput.addEventListener('change', onCardFileSelected);
  els.useFirstMessage.addEventListener('click', insertFirstMessage);
  els.clearCharacter.addEventListener('click', () => {
    state.character = null;
    persistState();
    renderCharacter();
    updateMeta();
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

  if (els.toggleCardDetails && els.cardDetails) {
    els.toggleCardDetails.addEventListener('click', () => {
      els.cardDetails.open = !els.cardDetails.open;
    });
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state = {
      ...state,
      ...parsed,
      settings: {
        ...state.settings,
        ...(parsed.settings || {}),
        promptTemplate: parsed?.settings?.promptTemplate || DEFAULT_PROMPT_TEMPLATE,
      }
    };
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
  if (els.userName) els.userName.value = state.settings.userName || 'User';
  if (els.userPersona) els.userPersona.value = state.settings.userPersona || '';
  if (els.promptTemplate) els.promptTemplate.value = state.settings.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
}

function saveSettingsFromForm() {
  state.settings = {
    apiBase: els.apiBase.value.trim(),
    apiKey: els.apiKey.value.trim(),
    modelName: els.modelName.value.trim(),
    systemPrompt: els.systemPrompt.value.trim(),
    userName: els.userName?.value.trim() || 'User',
    userPersona: els.userPersona?.value.trim() || '',
    promptTemplate: els.promptTemplate?.value.trim() || DEFAULT_PROMPT_TEMPLATE,
  };
  persistState();
  alert('设置已保存到本地浏览器。');
}

function renderCharacter() {
  if (!state.character) {
    els.characterInfo.textContent = '尚未导入角色卡';
    els.characterInfo.classList.add('empty');
    if (els.lorebookInfo) {
      els.lorebookInfo.textContent = '尚未检测到世界书';
      els.lorebookInfo.classList.add('empty');
    }
    if (els.cardDetailsText) els.cardDetailsText.textContent = '暂无内容';
    return;
  }

  const c = state.character;
  els.characterInfo.classList.remove('empty');

  const presetSummary = [];
  if (c.system_prompt) presetSummary.push('system_prompt');
  if (c.post_history_instructions) presetSummary.push('post_history_instructions');
  if (c.depth_prompt?.prompt) presetSummary.push(`depth_prompt@${c.depth_prompt.depth ?? 'auto'}`);
  if ((c.lorebookEntries || []).length) presetSummary.push(`lorebook ${c.lorebookEntries.length} 条`);
  if ((c.alternate_greetings || []).length) presetSummary.push(`alternate_greetings ${c.alternate_greetings.length} 条`);

  const chosenFirst = getPreferredFirstMessage(c);

  els.characterInfo.textContent = [
    `名字：${c.name || '未命名角色'}`,
    c.description ? `简介：${c.description}` : '',
    c.personality ? `性格：${c.personality}` : '',
    chosenFirst ? `开场白：${chosenFirst}` : '',
    presetSummary.length ? `导入预设：${presetSummary.join(' / ')}` : '导入预设：无'
  ].filter(Boolean).join('\n\n');

  renderLorebookInfo(c);
  renderCardDetails(c);
}

function renderLorebookInfo(character) {
  if (!els.lorebookInfo) return;
  const entries = character?.lorebookEntries || [];
  if (!entries.length) {
    els.lorebookInfo.textContent = '尚未检测到世界书';
    els.lorebookInfo.classList.add('empty');
    return;
  }

  const constantCount = entries.filter(e => e.constant).length;
  const keyedCount = entries.length - constantCount;
  els.lorebookInfo.classList.remove('empty');
  els.lorebookInfo.textContent = [
    `已导入内嵌世界书：${entries.length} 条`,
    `常驻条目：${constantCount} 条`,
    `关键词触发：${keyedCount} 条`,
  ].join('\n');
}

function renderCardDetails(character) {
  if (!els.cardDetailsText) return;
  const detail = {
    name: character.name,
    first_mes: character.first_mes || '',
    alternate_greetings_count: (character.alternate_greetings || []).length,
    system_prompt: character.system_prompt || '',
    post_history_instructions: character.post_history_instructions || '',
    depth_prompt: character.depth_prompt || null,
    lorebook_preview: (character.lorebookEntries || []).slice(0, 10).map(entry => ({
      keys: entry.keys,
      constant: entry.constant,
      enabled: entry.enabled,
      order: entry.order,
      content: entry.content,
    })),
  };
  els.cardDetailsText.textContent = JSON.stringify(detail, null, 2);
}

function updateMeta() {
  const name = state.character?.name || '未连接角色';
  els.chatMeta.textContent = `当前角色：${name} ｜ 会话 ID：${state.sessionId.slice(0, 8)}`;
}

async function onCardFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    let json;
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      const text = await file.text();
      json = JSON.parse(text);
    } else if (file.type === 'image/png' || file.name.endsWith('.png')) {
      const buffer = await file.arrayBuffer();
      json = extractJsonFromPng(buffer);
    } else {
      throw new Error('暂不支持这个文件类型');
    }

    state.character = normalizeCharacter(json);
    persistState();
    renderCharacter();
    updateMeta();
    alert('角色卡导入成功，已尝试一并导入卡内预设。');
  } catch (err) {
    console.error(err);
    alert(`导入失败：${err.message}`);
  } finally {
    event.target.value = '';
  }
}

function normalizeCharacter(data) {
  const root = data?.data && typeof data.data === 'object' ? data.data : data || {};
  const top = data || {};
  const extensions = root.extensions || top.extensions || {};

  const alternateGreetingsRaw =
    root.alternate_greetings ||
    root.alternateGreetings ||
    root.alternategreetings ||
    top.alternate_greetings ||
    top.alternateGreetings ||
    top.alternategreetings ||
    [];

  const lorebookEntries = normalizeLorebookEntries(
    root.character_book ||
    root.characterbook ||
    root.lorebook ||
    top.character_book ||
    top.characterbook ||
    top.lorebook
  );

  const firstMes = pickNonEmpty(
    root.first_mes,
    root.firstMessage,
    root.firstmes,
    top.first_mes,
    top.firstMessage,
    top.firstmes
  );

  const description = pickNonEmpty(root.description, root.desc, root.context, top.description, top.desc, top.context);
  const personality = pickNonEmpty(root.personality, top.personality);
  const scenario = pickNonEmpty(root.scenario, top.scenario);
  const mesExample = pickNonEmpty(root.mes_example, root.mesexample, top.mes_example, top.mesexample);
  const systemPrompt = pickNonEmpty(root.system_prompt, root.systemPrompt, root.systemprompt, top.system_prompt, top.systemPrompt, top.systemprompt);
  const postHistory = pickNonEmpty(
    root.post_history_instructions,
    root.postHistoryInstructions,
    root.posthistoryinstructions,
    top.post_history_instructions,
    top.postHistoryInstructions,
    top.posthistoryinstructions
  );

  const normalized = {
    name: pickNonEmpty(root.name, root.char_name, root.charname, top.name, top.char_name, top.charname, '未命名角色'),
    description,
    personality,
    first_mes: firstMes,
    mes_example: mesExample,
    scenario,
    system_prompt: systemPrompt,
    post_history_instructions: postHistory,
    alternate_greetings: normalizeGreetingList(alternateGreetingsRaw),
    lorebookEntries,
    depth_prompt: normalizeDepthPrompt(extensions),
    raw: data
  };

  if (!normalized.first_mes && normalized.alternate_greetings.length) {
    normalized.first_mes = normalized.alternate_greetings[0];
  }

  return normalized;
}

function normalizeGreetingList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(v => String(v || '').trim()).filter(Boolean);
}

function pickNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeLorebookEntries(book) {
  if (!book) return [];
  const rawEntries = Array.isArray(book.entries)
    ? book.entries
    : Array.isArray(book)
      ? book
      : Object.values(book.entries || {});

  return rawEntries
    .map((entry, index) => normalizeLorebookEntry(entry, index))
    .filter(Boolean)
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

function normalizeLorebookEntry(entry, index) {
  if (!entry) return null;

  const keys = Array.isArray(entry.keys)
    ? entry.keys
    : Array.isArray(entry.key)
      ? entry.key
      : typeof entry.key === 'string'
        ? [entry.key]
        : [];

  const secondaryKeys = Array.isArray(entry.secondary_keys)
    ? entry.secondary_keys
    : Array.isArray(entry.secondaryKeys)
      ? entry.secondaryKeys
      : [];

  const content = entry.content || entry.text || entry.value || '';
  if (!content) return null;

  return {
    id: entry.id ?? index,
    keys: keys.filter(Boolean),
    secondary_keys: secondaryKeys.filter(Boolean),
    content,
    enabled: entry.enabled !== false,
    constant: Boolean(entry.constant),
    selective: Boolean(entry.selective),
    insertion_order: entry.insertion_order ?? entry.insertionOrder ?? index,
    order: entry.order ?? entry.priority ?? 100,
    position: entry.position || 'before_char',
    comment: entry.comment || entry.memo || ''
  };
}

function normalizeDepthPrompt(extensions) {
  if (!extensions) return null;
  const raw =
    extensions.depth_prompt ||
    extensions.depthPrompt ||
    extensions.depthprompt ||
    extensions['depth-prompt'];

  if (!raw) return null;
  if (typeof raw === 'string') {
    return { prompt: raw, depth: 4, role: 'system' };
  }

  return {
    prompt: raw.prompt || raw.text || '',
    depth: Number.isFinite(raw.depth) ? raw.depth : 4,
    role: raw.role || 'system'
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
    const compressionFlag = chunk[idx];
    idx += 1;
    idx += 1;
    const langEnd = chunk.indexOf(0, idx);
    if (langEnd === -1) return null;
    idx = langEnd + 1;
    const translatedEnd = chunk.indexOf(0, idx);
    if (translatedEnd === -1) return null;
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
    return JSON.parse(text);
  } catch (_) {}
  try {
    return JSON.parse(atob(text));
  } catch (_) {}
  return null;
}

function readUint32(bytes, offset) {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function getPreferredFirstMessage(character) {
  if (!character) return '';
  if (character.first_mes && character.first_mes.trim()) return character.first_mes.trim();
  if (Array.isArray(character.alternate_greetings) && character.alternate_greetings.length) {
    return character.alternate_greetings[0];
  }
  return '';
}

function insertFirstMessage() {
  const first = getPreferredFirstMessage(state.character);
  if (!first) return alert('当前角色没有开场白。');
  els.userInput.value = applyTemplateVars(first);
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
  const systemContent = buildSystemPrompt(existingMessages);
  if (systemContent) arr.push({ role: 'system', content: systemContent });

  for (const m of existingMessages.filter(m => !m.pending)) {
    arr.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }

  return injectDepthPrompt(arr);
}

function buildSystemPrompt(existingMessages) {
  const c = state.character;
  const template = state.settings.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
  const loreEntries = selectLorebookEntries(c?.lorebookEntries || [], existingMessages);

  const lorebookBlock = loreEntries.length
    ? '世界书 / Lorebook：\n' + loreEntries.map((entry, index) => {
        const keys = entry.keys?.length ? ` [keys: ${entry.keys.join(', ')}]` : '';
        return `${index + 1}. ${entry.content}${keys}`;
      }).join('\n')
    : '';

  const replacements = {
    char: c?.name || '未命名角色',
    description_block: c?.description ? `角色描述：${applyTemplateVars(c.description)}` : '',
    personality_block: c?.personality ? `性格：${applyTemplateVars(c.personality)}` : '',
    scenario_block: c?.scenario ? `场景：${applyTemplateVars(c.scenario)}` : '',
    system_prompt_block: c?.system_prompt ? `角色卡 System Prompt：${applyTemplateVars(c.system_prompt)}` : '',
    post_history_block: c?.post_history_instructions ? `角色卡 Post-History Instructions：${applyTemplateVars(c.post_history_instructions)}` : '',
    depth_prompt_block: c?.depth_prompt?.prompt ? `角色卡 Depth Prompt：${applyTemplateVars(c.depth_prompt.prompt)}` : '',
    lorebook_block: lorebookBlock ? applyTemplateVars(lorebookBlock) : '',
    user_persona_block: buildUserPersonaBlock(),
    custom_system_prompt_block: state.settings.systemPrompt ? `用户追加 System Prompt：${applyTemplateVars(state.settings.systemPrompt)}` : '',
  };

  const compiled = template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => replacements[key] || '');
  return cleanupPrompt(compiled);
}

function selectLorebookEntries(entries, existingMessages) {
  if (!entries.length) return [];

  const transcript = existingMessages
    .filter(m => !m.pending)
    .map(m => m.content)
    .join('\n')
    .toLowerCase();

  return entries.filter(entry => {
    if (!entry.enabled) return false;
    if (entry.constant) return true;
    if (!entry.keys?.length) return false;

    const primaryHit = entry.keys.some(key => transcript.includes(String(key).toLowerCase()));
    if (!entry.selective) return primaryHit;

    const secondaryHit = !entry.secondary_keys?.length || entry.secondary_keys.some(key => transcript.includes(String(key).toLowerCase()));
    return primaryHit && secondaryHit;
  });
}

function injectDepthPrompt(messages) {
  const depth = state.character?.depth_prompt;
  if (!depth?.prompt) return messages;

  const output = [...messages];
  const assistantAndUserIndexes = output
    .map((m, index) => ({ m, index }))
    .filter(item => item.m.role !== 'system');

  const insertionAfterCount = Math.max(0, Number(depth.depth) || 0);
  const target = assistantAndUserIndexes[insertionAfterCount - 1];
  const promptMessage = {
    role: depth.role === 'assistant' ? 'assistant' : 'system',
    content: applyTemplateVars(depth.prompt)
  };

  if (!target) {
    output.splice(1, 0, promptMessage);
    return output;
  }

  output.splice(target.index + 1, 0, promptMessage);
  return output;
}

function buildUserPersonaBlock() {
  const userName = state.settings.userName?.trim();
  const userPersona = state.settings.userPersona?.trim();
  if (!userName && !userPersona) return '';

  const parts = [];
  if (userName) parts.push(`用户名：${userName}`);
  if (userPersona) parts.push(`用户画像：${userPersona}`);
  return `关于 {{user}} / User：${parts.join('；')}`;
}

function cleanupPrompt(text) {
  return text
    .split('\n')
    .map(line => line.trimEnd())
    .filter((line, index, arr) => !(line === '' && arr[index - 1] === ''))
    .join('\n')
    .trim();
}

function applyTemplateVars(text) {
  const userName = state.settings.userName?.trim() || 'User';
  const charName = state.character?.name || '角色';
  const userPersona = state.settings.userPersona?.trim() || '';

  return String(text || '')
    .replace(/{{\s*user\s*}}/gi, userName)
    .replace(/<user>/gi, userName)
    .replace(/{{\s*char\s*}}/gi, charName)
    .replace(/<char>/gi, charName)
    .replace(/{{\s*persona\s*}}/gi, userPersona)
    .replace(/{{\s*bot\s*}}/gi, charName);
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
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.createdAt - b.createdAt));
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
    version: 2.2,
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

    state = {
      ...state,
      ...data.state,
      settings: {
        ...state.settings,
        ...(data.state.settings || {}),
        promptTemplate: data?.state?.settings?.promptTemplate || DEFAULT_PROMPT_TEMPLATE,
      }
    };

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