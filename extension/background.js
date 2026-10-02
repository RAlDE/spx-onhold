const CATALOG_URL = 'https://raw.githubusercontent.com/RAlDE/spx-onhold/main/catalog.json';
const SCRIPT_PREFIX = 'spx-onhold:';

async function getCatalog() {
  const response = await fetch(`${CATALOG_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Falha ao carregar catálogo (${response.status})`);
  return response.json();
}

async function clearScripts() {
  const scripts = await chrome.userScripts.getScripts();
  const ids = scripts.filter(s => s.id.startsWith(SCRIPT_PREFIX)).map(s => s.id);
  if (ids.length) await chrome.userScripts.unregister({ ids });
}

async function syncScripts() {
  await clearScripts();
  const { enabled = true } = await chrome.storage.local.get('enabled');
  if (!enabled) return;

  const catalog = await getCatalog();
  for (const module of catalog.modules || []) {
    if (!module.enabled) continue;
    const js = [];
    for (const url of module.scripts || []) {
      const response = await fetch(`${url}?v=${encodeURIComponent(module.version)}&t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Falha ao baixar ${module.name}`);
      js.push({ code: await response.text() });
    }
    await chrome.userScripts.register([{
      id: `${SCRIPT_PREFIX}${module.id}`,
      matches: module.matches || ['https://spx.shopee.com.br/*'],
      js,
      runAt: 'document_idle',
      world: 'MAIN'
    }]);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get('enabled');
  if (typeof current.enabled !== 'boolean') await chrome.storage.local.set({ enabled: true });
  syncScripts().catch(console.error);
});
chrome.runtime.onStartup.addListener(() => syncScripts().catch(console.error));
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'sync') {
    syncScripts().then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
