(() => {
  'use strict';
  if (window.__SPX_ONHOLD_ACTIVE__) return;
  window.__SPX_ONHOLD_ACTIVE__ = true;

  const PANEL_ID = 'spx-onhold-panel';
  const TOGGLE_ID = 'spx-onhold-toggle';
  const POSITION_KEY = 'spx-onhold-position-v1';
  const ROUTE_FRAGMENT = '/delivery-assignment/list';
  const MODULE_VERSION = '0.3.22';

  let lastTracking = '';
  let activeSearchUntil = 0;
  let panelOpen = true;
  let scanBuffer = '';
  let scanLastKeyAt = 0;
  let lastRenderSignature = '';
  let diagnosticView = false;
  let lastDriverData = null;
  let preSearchAssignmentSignature = '';
  let searchStartedAt = 0;
  const routeWeekdayCache = new Map();
  const routeWeekdayPending = new Set();

  const isTargetPage = () =>
    location.hash.includes(ROUTE_FRAGMENT) || location.pathname.includes(ROUTE_FRAGMENT);

  const norm = value =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[c]));
  }

  const reasonTranslations = new Map([
    ['cannot find address', 'Endereço não encontrado'],
    ['disaster', 'Chuva forte / Desastres naturais'],
    ['do not deliver', 'Não entregar'],
    ['incorrect/ missing verification', 'Palavra-chave incorreta ou não informada'],
    ['incorrect/missing verification', 'Palavra-chave incorreta ou não informada'],
    ['insufficient time', 'Motorista não teve tempo de entregar'],
    ['insufficient vehicle capacity', 'Não coube no veículo'],
    ['office closed', 'Comércio fechado'],
    ['parcel damaged, cannot attempt', 'Item danificado'],
    ['parcel damaged', 'Item danificado'],
    ['damaged parcel', 'Item danificado'],
    ['parcel lost', 'Item perdido'],
    ['lost parcel', 'Item perdido'],
    ['recipient change location', 'Mudança de endereço'],
    ['recipient reject', 'Recusado por terceiros'],
    ['recipient unavailable for parcel', 'Ausente'],
    ['reject - buyers change their mind', 'Rejeitado pelo comprador'],
    ['risky area of delivery', 'Área de risco'],
    ['robbery/assault', 'Roubo/Assalto'],
    ['robbery attempt', 'Tentativa de roubo/assalto'],
    ['attempted robbery/assault', 'Tentativa de roubo/assalto'],
    ['theft', 'Roubo/Assalto'],
    ['unforeseen circumstances', 'Motorista desistiu da rota'],
    ['vehicle breakdown', 'Problemas Mecânicos'],
    ['wrongly assigned', 'Fora de Rota'],
    ['out of route', 'Fora de Rota'],
    ['out of the route', 'Fora de Rota'],
    ['driver gave up on the route', 'Motorista desistiu da rota'],
    ['app/internet failure', 'Problemas com internet/app'],
    ['address incorrect', 'Endereço incorreto'],
    ['incorrect address', 'Endereço incorreto'],
    ['incomplete address', 'Endereço incompleto'],
    ['customer unreachable', 'Não foi possível contatar o destinatário'],
    ['recipient unreachable', 'Não foi possível contatar o destinatário'],
    ['customer not at home', 'Destinatário ausente'],
    ['recipient not at home', 'Destinatário ausente'],
    ['customer refused', 'Recusado pelo destinatário'],
    ['recipient refused', 'Recusado pelo destinatário'],
    ['customer requested reschedule', 'Destinatário solicitou reagendamento'],
    ['delivery rescheduled', 'Entrega reagendada'],
    ['bad weather', 'Condições climáticas adversas'],
    ['traffic jam', 'Congestionamento'],
    ['road blocked', 'Via bloqueada'],
    ['no access to location', 'Sem acesso ao local'],
    ['accident', 'Acidente'],
    ['driver accident', 'Acidente com o motorista'],
    ['security issue', 'Problema de segurança'],
    ['cash on delivery issue', 'Problema no pagamento na entrega'],
    ['incorrect otp', 'Código de confirmação incorreto'],
    ['missing otp', 'Código de confirmação não informado']
  ]);

  function translateReason(reason) {
    const raw = String(reason || '').trim().replace(/^\[[^\]]+\]\s*/, '');
    if (!raw) return '';
    return reasonTranslations.get(norm(raw)) || raw;
  }


  const DIAG_KEY = 'spx-onhold-network-source-v1';
  const DIAG_CANDIDATES_KEY = 'spx-onhold-network-candidates-v1';
  const ORDER_SHAPE_KEY = 'spx-onhold-order-shape-v1';
  const ORDER_ITEMS_KEY = 'spx-onhold-order-items-v1';
  const STATUS_MAP_KEY = 'spx-onhold-status-map-v1';
  const STATUS_SCAN_KEY = 'spx-onhold-status-scan-v1';
  const ONHOLD_DETAIL_KEY = 'spx-onhold-detail-v1';
  const BR_SCAN_KEY = 'spx-onhold-br-scan-v1';
  const TRACKING_DIAG_KEY = 'spx-onhold-tracking-diag-v1';

  function showDiagnosticToast(message) {
    let toast = document.getElementById('spx-onhold-diagnostic-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'spx-onhold-diagnostic-toast';
      toast.style.cssText =
        'position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#111;color:#fff;border:1px solid #ff6b00;border-radius:10px;padding:12px 14px;font:700 14px Arial;box-shadow:0 6px 22px #0008;max-width:360px';
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    clearTimeout(showDiagnosticToast.timer);
    showDiagnosticToast.timer = setTimeout(() => toast.remove(), 6000);
  }

  function findStatusObjects(value, out = []) {
    if (!value || typeof value !== 'object') return out;

    if (Array.isArray(value)) {
      for (const item of value) findStatusObjects(item, out);
      return out;
    }

    const entries = Object.entries(value);
    for (const [key, raw] of entries) {
      const k = norm(key);
      const v = norm(raw);
      if ((k.includes('status') || k === 'state') && (v === 'onhold' || v === 'delivering')) {
        let timestamp = '';
        for (const [tk, tv] of entries) {
          const nk = norm(tk);
          if (/time|date|created|updated|onhold/.test(nk) && (typeof tv === 'string' || typeof tv === 'number')) {
            timestamp = String(tv);
            break;
          }
        }
        out.push({ status: String(raw), timestamp, keys: entries.map(([name]) => name).slice(0, 25) });
        break;
      }
    }

    for (const [, child] of entries) {
      if (child && typeof child === 'object') findStatusObjects(child, out);
    }

    return out;
  }

  function collectPrimitiveHints(value, path = '', out = []) {
    if (!value || typeof value !== 'object') return out;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? path + '.' + key : key;
      if (child && typeof child === 'object') {
        collectPrimitiveHints(child, nextPath, out);
      } else {
        const nk = norm(key);
        if (/status|state|time|date|created|updated|hold|deliver|page|count|total/.test(nk)) {
          out.push({ path: nextPath, value: String(child).slice(0, 180) });
        }
      }
    }
    return out;
  }

  function findLargestObjectArray(value, path = 'root', best = { path: '', items: [] }) {
    if (!value || typeof value !== 'object') return best;

    if (Array.isArray(value)) {
      const objectItems = value.filter(item => item && typeof item === 'object' && !Array.isArray(item));
      if (objectItems.length > best.items.length) {
        best = { path, items: objectItems };
      }
      value.forEach((child, index) => {
        best = findLargestObjectArray(child, path + '[' + index + ']', best);
      });
      return best;
    }

    for (const [key, child] of Object.entries(value)) {
      best = findLargestObjectArray(child, path + '.' + key, best);
    }
    return best;
  }

  function extractOrderItems(parsed) {
    try {
      const list = parsed?.data?.list;
      if (!Array.isArray(list)) return [];
      return list.map(item => {
        const times = {};
        for (const [key, value] of Object.entries(item || {})) {
          if (/time|date|created|updated|hold/i.test(key) &&
              (typeof value === 'string' || typeof value === 'number')) {
            times[key] = value;
          }
        }
        return {
          shipment_id: item?.shipment_id || item?.tracking_number || item?.spx_tn || '',
          status: item?.status,
          on_hold_reason: item?.on_hold_reason,
          times
        };
      }).filter(item => item.shipment_id);
    } catch {
      return [];
    }
  }

  function saveOrderItems(parsed) {
    const items = extractOrderItems(parsed);
    if (!items.length) return;
    try {
      localStorage.setItem(ORDER_ITEMS_KEY, JSON.stringify(items));
    } catch {}
  }

  function getOrderItems() {
    try {
      const raw = localStorage.getItem(ORDER_ITEMS_KEY);
      const value = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function getStatusMap() {
    const known = { '2': 'Delivering', '4': 'Delivered', '5': 'OnHold', '10': 'Return_LMHub_Onhold' };
    try {
      const raw = localStorage.getItem(STATUS_MAP_KEY);
      const value = raw ? JSON.parse(raw) : {};
      return Object.assign({}, known, value && typeof value === 'object' ? value : {});
    } catch {
      return known;
    }
  }

  function saveStatusMap(map) {
    try {
      localStorage.setItem(STATUS_MAP_KEY, JSON.stringify(map));
    } catch {}
  }

  function learnStatusMapFromDetailPage() {
    const items = getOrderItems();
    if (!items.length) return;

    const map = getStatusMap();
    let changed = false;

    for (const item of items) {
      const shipment = String(item.shipment_id || '').trim();
      if (!shipment) continue;

      const rows = [...document.querySelectorAll('tr,[role="row"]')];
      const row = rows.find(r => (r.innerText || '').includes(shipment));
      if (!row) continue;

      const text = String(row.innerText || '');
      const match = text.match(/\b(OnHold|Delivering|Delivered)\b/i);
      if (!match) continue;

      const code = String(item.status);
      const label = match[1];
      if (map[code] !== label) {
        map[code] = label;
        changed = true;
      }
    }

    if (changed) {
      saveStatusMap(map);

    }
  }

  function saveOrderSearchShape(meta, parsed) {
    try {
      saveOrderItems(parsed);
      const urlText = String(meta.url || '');
      if (!/assignment_task\/detail\/order\/search/i.test(urlText)) return;
      if (!parsed || typeof parsed !== 'object') return;

      const largest = findLargestObjectArray(parsed);
      const samples = largest.items.slice(0, 3).map(item => ({
        keys: Object.keys(item).slice(0, 50),
        interesting: Object.entries(item)
          .filter(([key]) => /status|state|time|date|created|updated|hold|deliver|tracking|order/.test(norm(key)))
          .slice(0, 25)
          .map(([key, value]) => ({ key, value: String(value).slice(0, 180) }))
      }));

      const record = {
        capturedAt: new Date().toISOString(),
        method: meta.method || 'GET',
        url: urlText,
        topKeys: Array.isArray(parsed) ? ['<array>'] : Object.keys(parsed).slice(0, 30),
        arrayPath: largest.path,
        arrayLength: largest.items.length,
        hints: collectPrimitiveHints(parsed).slice(0, 60),
        samples
      };

      localStorage.setItem(ORDER_SHAPE_KEY, JSON.stringify(record));
      showDiagnosticToast('SPX OnHold: estrutura dos pedidos capturada.');
    } catch {}
  }

  function saveDiagnosticCandidate(meta, parsed, rawText) {
    try {
      const urlText = String(meta.url || '');
      const url = new URL(urlText, location.href);
      if (url.origin !== location.origin) return;
      if (/apollo\/get_config|feature|config\/by_cid|permission_tree|menu_tree|basicserver/i.test(urlText)) return;

      const text = String(rawText || '');
      const atMatch = text.match(/AT[A-Z0-9]+/i);
      const candidate = {
        capturedAt: new Date().toISOString(),
        method: meta.method || 'GET',
        url: urlText,
        size: text.length,
        at: atMatch ? atMatch[0] : '',
        hasOnHoldWord: /\bOnHold\b/i.test(text),
        hasDeliveringWord: /\bDelivering\b/i.test(text),
        topKeys: parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? Object.keys(parsed).slice(0, 12)
          : []
      };

      let list = [];
      try {
        list = JSON.parse(localStorage.getItem(DIAG_CANDIDATES_KEY) || '[]');
        if (!Array.isArray(list)) list = [];
      } catch {}

      const signature = candidate.method + '|' + candidate.url;
      list = list.filter(item => (item.method + '|' + item.url) !== signature);
      list.unshift(candidate);
      list = list.slice(0, 20);
      localStorage.setItem(DIAG_CANDIDATES_KEY, JSON.stringify(list));
    } catch {}
  }

  function saveBrScanCandidate(meta, parsed, rawText) {
    try {
      const text = String(rawText || '');
      const urlText = String(meta.url || '');
      if (!text || !urlText) return;

      const hasCurrentBr = lastTracking && text.includes(lastTracking);
      const hasReturnOnhold = /Return_LMHub_Onhold/i.test(text);
      if (!hasCurrentBr && !hasReturnOnhold) return;

      const hints = collectPrimitiveHints(parsed).filter(item =>
        /status|state|hold|return|lmhub|time|date|created|updated/i.test(item.path)
      ).slice(0, 40);

      const candidate = {
        capturedAt: new Date().toISOString(),
        method: meta.method || 'GET',
        url: urlText,
        size: text.length,
        hasCurrentBr: Boolean(hasCurrentBr),
        hasReturnOnhold: Boolean(hasReturnOnhold),
        hints
      };

      let list = [];
      try {
        list = JSON.parse(localStorage.getItem(BR_SCAN_KEY) || '[]');
        if (!Array.isArray(list)) list = [];
      } catch {}

      const signature = candidate.method + '|' + candidate.url;
      list = list.filter(item => (item.method + '|' + item.url) !== signature);
      list.unshift(candidate);
      list = list.slice(0, 20);
      localStorage.setItem(BR_SCAN_KEY, JSON.stringify(list));

      if (hasReturnOnhold) {

      }
    } catch {}
  }

  function saveTrackingDiagnostic(meta, parsed) {
    try {
      const urlText = String(meta.url || '');
      if (!/tracking_info/i.test(urlText)) return;
      const hints = [];
      const walk = (value, path = '', depth = 0) => {
        if (!value || typeof value !== 'object' || depth > 14 || hints.length >= 120) return;
        for (const [key, child] of Object.entries(value)) {
          const nextPath = path ? path + '.' + key : key;
          if (child && typeof child === 'object') {
            walk(child, nextPath, depth + 1);
          } else {
            const nk = norm(key);
            const sv = String(child ?? '');
            if (/status|state|event|message|desc|title|time|date|created|updated|driver|operator|staff/.test(nk) || /entrega|deliver|route|rota/i.test(sv)) {
              hints.push({ path: nextPath, value: sv.slice(0, 240) });
            }
          }
        }
      };
      walk(parsed);
      localStorage.setItem(TRACKING_DIAG_KEY, JSON.stringify({ capturedAt: new Date().toISOString(), url: urlText, hints }));
    } catch {}
  }

  function getTrackingDiagnostic() {
    try {
      const raw = localStorage.getItem(TRACKING_DIAG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveDiagnosticSource(meta, parsed, rawText) {
    saveTrackingDiagnostic(meta, parsed);
    saveBrScanCandidate(meta, parsed, rawText);
    saveOrderSearchShape(meta, parsed);
    saveDiagnosticCandidate(meta, parsed, rawText);
    const items = findStatusObjects(parsed);
    const text = String(rawText || '');
    const urlText = String(meta.url || '');

    // Ignora endpoints de configuração/feature flags, que podem conter
    // palavras como "onhold" apenas no nome das chaves.
    if (/apollo\/get_config|feature|config\/by_cid/i.test(urlText)) return;

    // Só aceitamos uma resposta quando encontramos objetos estruturados
    // cujo campo de status realmente tenha valor OnHold ou Delivering.
    if (!items.length) return;

    const atMatch = text.match(/AT[A-Z0-9]+/i);
    const record = {
      capturedAt: new Date().toISOString(),
      at: atMatch ? atMatch[0] : '',
      method: meta.method || 'GET',
      url: meta.url || '',
      body: typeof meta.body === 'string' ? meta.body.slice(0, 4000) : '',
      onHoldInResponse: items.filter(x => norm(x.status) === 'onhold').length,
      deliveringInResponse: items.filter(x => norm(x.status) === 'delivering').length,
      sample: items.slice(0, 5)
    };

    try {
      localStorage.setItem(DIAG_KEY, JSON.stringify(record));
    } catch {}

    showDiagnosticToast('SPX OnHold: fonte de dados encontrada.');
  }

  async function inspectFetchResponse(response, meta) {
    try {
      const url = new URL(meta.url, location.href);
      if (url.origin !== location.origin) return;

      const clone = response.clone();
      const text = await clone.text();
      if (!text) return;

      let parsed = null;
      try { parsed = JSON.parse(text); } catch { return; }
      saveDiagnosticSource(meta, parsed, text);
    } catch {}
  }

  function clearOldDiagnostic() {
    try {
      const current = JSON.parse(localStorage.getItem(DIAG_KEY) || 'null');
      if (current?.url && /apollo\/get_config|feature|config\/by_cid/i.test(current.url)) {
        localStorage.removeItem(DIAG_KEY);
      }
    } catch {}
  }

  function installNetworkDiagnostic() {
    if (window.__SPX_ONHOLD_NETWORK_DIAG__) return;
    window.__SPX_ONHOLD_NETWORK_DIAG__ = true;

    const originalFetch = window.fetch;
    window.fetch = function(input, init = {}) {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const method = init.method || (typeof input !== 'string' ? input?.method : '') || 'GET';
      const body = typeof init.body === 'string' ? init.body : '';
      const promise = originalFetch.apply(this, arguments);
      promise.then(response => inspectFetchResponse(response, { url, method, body }));
      return promise;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
      this.__spxOnholdMeta = { method: method || 'GET', url: String(url || ''), body: '' };
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      if (this.__spxOnholdMeta && typeof body === 'string') {
        this.__spxOnholdMeta.body = body.slice(0, 4000);
      }

      this.addEventListener('load', function() {
        try {
          const meta = this.__spxOnholdMeta || {};
          const url = new URL(meta.url || '', location.href);
          if (url.origin !== location.origin) return;

          let text = '';
          let parsed = null;

          if (this.responseType === 'json') {
            parsed = this.response;
            text = JSON.stringify(parsed);
          } else if (!this.responseType || this.responseType === 'text') {
            text = this.responseText || '';
            try { parsed = JSON.parse(text); } catch {}
          }

          if (parsed) {
            saveDiagnosticSource(meta, parsed, text);
          }
        } catch {}
      });

      return originalSend.apply(this, arguments);
    };
  }

  function looksLikeTracking(value) {
    return /^BR[A-Z0-9]{8,}$/i.test(String(value || '').trim());
  }

  function ensureToggle() {
    let button = document.getElementById(TOGGLE_ID);
    if (button) return button;

    button = document.createElement('button');
    button.id = TOGGLE_ID;
    button.textContent = '▣ OnHold';
    button.style.cssText =
      'position:fixed;left:16px;bottom:18px;z-index:2147483647;background:#ff6b00;color:#111;border:0;border-radius:9px;padding:10px 14px;font:bold 14px Arial;box-shadow:0 4px 16px #0007;cursor:pointer';

    button.addEventListener('click', () => {
      panelOpen = !panelOpen;
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.style.display = panelOpen ? 'block' : 'none';
    });

    document.documentElement.appendChild(button);
    return button;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.style.cssText =
      'position:fixed;left:16px;top:140px;width:330px;z-index:2147483646;background:#080808;color:#fff;border:1px solid #ff6b00;border-radius:12px;box-shadow:0 10px 35px #0009;overflow:hidden;font-family:Arial,sans-serif';

    panel.innerHTML = `
      <div data-drag style="background:#ff6b00;color:#111;padding:12px 14px;font-size:19px;font-weight:800;cursor:move;user-select:none;display:flex;justify-content:space-between;align-items:center">
        <span>SPX OnHold <small style="font-size:11px;font-weight:700;opacity:.75">v${MODULE_VERSION}</small></span>
        <span style="display:flex;gap:6px">
          <button data-diag title="Diagnóstico" style="border:1px solid #111;background:#111;color:#fff;border-radius:6px;width:28px;height:28px;font-size:15px;font-weight:900;cursor:pointer">i</button>
          <button data-close style="border:0;background:transparent;font-size:21px;font-weight:900;cursor:pointer">−</button>
        </span>
      </div>
      <div data-content style="padding:15px;font-size:16px;line-height:1.45">
        <b>Sem informação</b>
      </div>`;

    document.documentElement.appendChild(panel);

    panel.querySelector('[data-close]').addEventListener('click', () => {
      panelOpen = false;
      panel.style.display = 'none';
    });

    panel.querySelector('[data-diag]').addEventListener('click', () => {
      diagnosticView = !diagnosticView;
      if (diagnosticView) {
        if (!renderDiagnosticSummary()) {
          const content = panel.querySelector('[data-content]');
          content.innerHTML = '<b style="font-size:18px">Nenhum diagnóstico salvo</b><div style="margin-top:8px;color:#aaa;font-size:13px">Bipe um BR, clique em Visualizar e aguarde a mensagem de fonte encontrada.</div>';
        }
      } else {
        lastRenderSignature = '';
        if (lastTracking) {
          const result = findFilteredAssignment();
          if (result?.assignmentId && result?.driver?.name) renderDriver(result);
          else renderNoInfo();
        } else {
          renderNoInfo();
        }
      }
    });

    enableDragging(panel, panel.querySelector('[data-drag]'));
    restorePosition(panel);
    return panel;
  }

  function restorePosition(panel) {
    try {
      const pos = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        panel.style.left = `${pos.left}px`;
        panel.style.top = `${pos.top}px`;
      }
    } catch {}
  }

  function enableDragging(panel, handle) {
    let startX, startY, left, top;

    handle.addEventListener('mousedown', event => {
      if (event.target.closest('button')) return;
      event.preventDefault();

      const rect = panel.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      left = rect.left;
      top = rect.top;

      const move = e => {
        const nextLeft = Math.max(
          0,
          Math.min(innerWidth - panel.offsetWidth, left + e.clientX - startX)
        );
        const nextTop = Math.max(
          0,
          Math.min(innerHeight - 50, top + e.clientY - startY)
        );
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
      };

      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);

        const rect2 = panel.getBoundingClientRect();
        localStorage.setItem(
          POSITION_KEY,
          JSON.stringify({ left: rect2.left, top: rect2.top })
        );
      };

      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  function setContent(html, signature) {
    const panel = ensurePanel();
    panel.style.display = panelOpen ? 'block' : 'none';

    if (signature && signature === lastRenderSignature) return;
    lastRenderSignature = signature || '';

    const content = panel.querySelector('[data-content]');
    content.innerHTML = html;
  }

  function renderWaiting(br) {
    if (diagnosticView) return;
    setContent(
      `<div style="font-size:13px;color:#aaa;font-weight:700">BR DETECTADO</div>
       <div style="font-size:18px;font-weight:800;margin-top:3px">${esc(br)}</div>
       <div style="margin-top:10px;font-size:15px;color:#aaa">Aguardando AT...</div>`,
      `waiting:${br}`
    );
  }

  function renderNoInfo() {
    if (diagnosticView) return;
    setContent(
      '<b style="font-size:18px">Sem informação</b>',
      'no-info'
    );
  }

  function getSavedDiagnostic() {
    try {
      const raw = localStorage.getItem(DIAG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getDiagnosticCandidates() {
    try {
      const raw = localStorage.getItem(DIAG_CANDIDATES_KEY);
      const value = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function getOrderShape() {
    try {
      const raw = localStorage.getItem(ORDER_SHAPE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function renderLearnedStatusMap() {
    const map = getStatusMap();
    const items = getOrderItems();
    if (!Object.keys(map).length && !items.length) return '';

    const mappings = Object.entries(map).map(([code, label]) =>
      `<div style="padding:3px 0"><b>Status ${esc(code)}</b> = ${esc(label)}</div>`
    ).join('');

    const onHoldItems = items.filter(item => map[String(item.status)]?.toLowerCase() === 'onhold');
    const timeRows = onHoldItems.slice(0, 4).map(item => {
      const fields = Object.entries(item.times || {}).map(([key, value]) =>
        `<div style="padding:2px 0"><b>${esc(key)}</b>: ${esc(value)}</div>`
      ).join('');
      return `<div style="margin-top:6px;border-top:1px solid #333;padding-top:5px"><b>${esc(item.shipment_id)}</b>${fields}</div>`;
    }).join('');

    return `
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #444">
        <div style="font-size:12px;color:#aaa;font-weight:700">MAPA APRENDIDO</div>
        <div style="font-size:12px;margin-top:4px">${mappings || 'Ainda não identificado'}</div>
        ${timeRows ? `<div style="font-size:12px;color:#aaa;margin-top:8px"><b>Datas dos OnHold:</b></div><div style="font-size:11px">${timeRows}</div>` : ''}
        ${renderStatusScan()}
        ${renderOnHoldHints()}
      </div>`;
  }

  function renderOnHoldHints() {
    const scan = getStatusScan();
    const items = Array.isArray(scan?.onHoldItems) ? scan.onHoldItems : [];
    if (!items.length) return '';

    const rows = items.slice(0, 3).map(item => {
      const hints = (item.hints || []).map(h =>
        `<div style="padding:2px 0"><b>${esc(h.path)}</b>: ${esc(h.value)}</div>`
      ).join('');

      return `
        <div style="margin-top:7px;padding-top:6px;border-top:1px solid #333">
          <div style="font-weight:800">${esc(item.shipment_id || 'OnHold')}</div>
          <div style="font-size:11px">${hints}</div>
        </div>`;
    }).join('');

    return `
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #444">
        <div style="font-size:12px;color:#aaa;font-weight:700">CAMPOS INTERNOS DO ONHOLD</div>
        <div style="font-size:11px;max-height:260px;overflow:auto">${rows}</div>
      </div>`;
  }

  function getBrScan() {
    try {
      const raw = localStorage.getItem(BR_SCAN_KEY);
      const value = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function accordion(title, body, open = false) {
    return `
      <details ${open ? 'open' : ''} style="border:1px solid #2f2f2f;border-radius:7px;margin-bottom:7px;background:#111">
        <summary style="cursor:pointer;padding:9px 10px;font-size:12px;font-weight:800;color:#ff8a33;user-select:none">
          ${esc(title)}
        </summary>
        <div style="padding:8px 10px;border-top:1px solid #2f2f2f;font-size:11px;max-height:260px;overflow:auto">
          ${body || '<span style="color:#888">Sem dados</span>'}
        </div>
      </details>`;
  }

  function renderBrScanSection() {
    const items = getBrScan();
    if (!items.length) return '<span style="color:#888">Nenhuma requisição da visualização individual capturada ainda.</span>';

    return items.slice(0, 10).map((item, index) => {
      let path = item.url || '';
      try {
        const u = new URL(path, location.href);
        path = u.pathname + u.search;
      } catch {}

      const hints = (item.hints || []).slice(0, 12).map(h =>
        `<div style="padding:2px 0"><b>${esc(h.path)}</b>: ${esc(h.value)}</div>`
      ).join('');

      return `
        <div style="padding:6px 0;border-bottom:1px solid #292929">
          <div style="font-weight:800;color:#ddd">#${index + 1} ${esc(item.method)} · ${esc(item.size)} bytes</div>
          <div style="margin-top:3px;word-break:break-all;color:#bbb">${esc(path)}</div>
          <div style="margin-top:3px;color:#999">BR: ${item.hasCurrentBr ? 'sim' : 'não'} · Return_LMHub_Onhold: ${item.hasReturnOnhold ? 'sim' : 'não'}</div>
          ${hints ? `<div style="margin-top:5px">${hints}</div>` : ''}
        </div>`;
    }).join('');
  }

  function renderDiagnosticSummary() {
    const shape = getOrderShape();
    const diag = getSavedDiagnostic();
    const candidates = getDiagnosticCandidates();
    const brScan = getBrScan();
    const statusScan = getStatusScan();
    const trackingDiag = getTrackingDiagnostic();
    const map = getStatusMap();

    if (!shape && !diag && !candidates.length && !brScan.length && !statusScan && !trackingDiag) return false;

    diagnosticView = true;
    lastRenderSignature = '';

    const panel = ensurePanel();
    const content = panel.querySelector('[data-content]');
    panel.style.display = panelOpen ? 'block' : 'none';

    const summaryBody = `
      <div><b>BR:</b> ${esc(lastTracking || '—')}</div>
      <div><b>AT:</b> ${esc(lastDriverData?.assignmentId || statusScan?.assignmentId || '—')}</div>
      <div><b>Motorista:</b> ${esc(lastDriverData?.driver?.name || '—')}</div>
      <div><b>Versão:</b> ${esc(MODULE_VERSION)}</div>`;

    let orderBody = '<span style="color:#888">Sem captura do Order Search.</span>';
    if (shape) {
      const hints = (shape.hints || []).slice(0, 18).map(item =>
        `<div style="padding:2px 0"><b>${esc(item.path)}</b>: ${esc(item.value)}</div>`
      ).join('');
      orderBody = `
        <div><b>Array:</b> ${esc(shape.arrayPath || '—')} · ${esc(shape.arrayLength ?? '—')} itens</div>
        <div style="margin-top:5px">${hints}</div>`;
    }

    const mapBody = Object.entries(map).map(([code, label]) =>
      `<div style="padding:3px 0"><b>Status ${esc(code)}</b> = ${esc(label)}</div>`
    ).join('') || '<span style="color:#888">Sem mapa aprendido.</span>';

    let statusBody = '<span style="color:#888">Sem varredura da AT.</span>';
    if (statusScan?.byStatus) {
      const rows = Object.entries(statusScan.byStatus)
        .sort((a,b) => Number(a[0]) - Number(b[0]))
        .map(([code, info]) =>
          `<div style="padding:3px 0"><b>Status ${esc(code)}</b>: ${esc(info.count)} · ${esc(info.sampleShipment || '—')}</div>`
        ).join('');
      statusBody = `
        <div><b>Total API:</b> ${esc(statusScan.total ?? '—')}</div>
        <div><b>Ocorrências computadas:</b> ${esc(statusScan.occurrenceCount ?? '—')}</div>
        <div><b>Status do BR pesquisado:</b> ${esc(statusScan.searchedItemStatusCode || '—')}</div>
        <div><b>Código Return_LMHub_Onhold:</b> ${esc(statusScan.returnOnholdStatusCode || '—')}</div>
        <div style="margin-top:5px">${rows}</div>`;
    }

    let trackingBody = '<span style="color:#888">Nenhum tracking_info capturado ainda.</span>';
    if (trackingDiag) {
      let path = trackingDiag.url || '';
      try {
        const u = new URL(path, location.href);
        path = u.pathname + u.search;
      } catch {}
      const rows = (trackingDiag.hints || []).slice(0,80).map(item =>
        `<div style="padding:3px 0;border-bottom:1px solid #292929"><b>${esc(item.path)}</b>: <span style="color:#ddd;word-break:break-word">${esc(item.value)}</span></div>`
      ).join('');
      trackingBody = `<div style="word-break:break-all"><b>Endpoint:</b> ${esc(path || '—')}</div><div style="margin-top:5px">${rows || '<span style="color:#888">Sem campos interessantes.</span>'}</div>`;
    }

    let reqBody = '<span style="color:#888">Sem requisições candidatas.</span>';
    if (candidates.length) {
      reqBody = candidates.slice(0,10).map((item,index) => {
        let path = item.url || '';
        try {
          const u = new URL(path, location.href);
          path = u.pathname + u.search;
        } catch {}
        return `<div style="padding:4px 0;border-bottom:1px solid #292929">
          <b>#${index+1} ${esc(item.method)}</b>
          <div style="word-break:break-all">${esc(path)}</div>
          <div style="color:#999;margin-top:2px">Delivering: ${item.hasDeliveringWord ? 'sim' : 'não'} · OnHold: ${item.hasOnHoldWord ? 'sim' : 'não'} · ${esc(item.size || 0)} bytes</div>
        </div>`;
      }).join('');
    }

    let deliveringBody = '<span style="color:#888">Nenhuma fonte estruturada com Delivering encontrada ainda.</span>';
    if (diag) {
      let path = diag.url || '';
      try {
        const u = new URL(path, location.href);
        path = u.pathname + u.search;
      } catch {}
      const samples = Array.isArray(diag.sample) ? diag.sample.map((item, index) =>
        `<div style="padding:4px 0;border-bottom:1px solid #292929">
          <div><b>#${index + 1} Status:</b> ${esc(item.status || '—')}</div>
          <div><b>Horário:</b> ${esc(item.timestamp || '—')}</div>
          <div style="color:#888;word-break:break-word"><b>Chaves:</b> ${esc((item.keys || []).join(', '))}</div>
        </div>`
      ).join('') : '';

      deliveringBody = `
        <div><b>Endpoint:</b> <span style="word-break:break-all">${esc(path || '—')}</span></div>
        <div><b>Delivering encontrados:</b> ${esc(diag.deliveringInResponse ?? 0)}</div>
        <div><b>OnHold encontrados:</b> ${esc(diag.onHoldInResponse ?? 0)}</div>
        <div style="margin-top:5px">${samples || '<span style="color:#888">Sem amostra.</span>'}</div>`;
    }

    content.innerHTML = `
      <div style="font-size:12px;color:#aaa;font-weight:700;margin-bottom:8px">DIAGNÓSTICO</div>
      ${accordion('Resumo', summaryBody, true)}
      ${accordion('Order Search', orderBody)}
      ${accordion('Mapa de Status', mapBody)}
      ${accordion('Status da AT', statusBody)}
      ${accordion('Fonte Delivering', deliveringBody)}
      ${accordion('Tracking info bruto', trackingBody, true)}
      ${accordion('Varredura do BR', renderBrScanSection())}
      ${accordion('Requisições candidatas', reqBody)}
    `;

    return true;
  }

  function getStatusScan() {
    try {
      const raw = localStorage.getItem(STATUS_SCAN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function collectOnHoldTimeHints(value, path = '', out = []) {
    if (!value || typeof value !== 'object') return out;

    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? path + '.' + key : key;
      if (child && typeof child === 'object') {
        collectOnHoldTimeHints(child, nextPath, out);
      } else {
        const nk = norm(key);
        if (/time|date|created|updated|hold|status/.test(nk)) {
          out.push({ path: nextPath, value: child });
        }
      }
    }

    return out;
  }

  function formatOccurrenceDate(timestamp) {
    if (!Number(timestamp)) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(new Date(Number(timestamp) * 1000));
    } catch {
      return '—';
    }
  }

  function getOnHoldDetail() {
    try {
      const raw = localStorage.getItem(ONHOLD_DETAIL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function collectTrackingNodes(nodes, output = []) {
    if (!Array.isArray(nodes)) return output;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      output.push(node);
      collectTrackingNodes(node.children, output);
      collectTrackingNodes(node.event_children, output);
    }
    return output;
  }

  function extractReturnLmHubEvent(tracking) {
    const nodes = collectTrackingNodes(tracking?.data?.tracking_list);
    const matches = nodes.filter(node => {
      const text = [
        node?.status,
        node?.state,
        node?.event_code,
        node?.event_name,
        node?.title,
        node?.message,
        node?.description
      ].filter(Boolean).join(' ');
      return /retorno[_\s-]*lmhub[_\s-]*em[_\s-]*espera/i.test(text)
        || /return[_\s-]*lmhub[_\s-]*onhold/i.test(text);
    });

    const latest = matches
      .sort((a,b) => Number(b?.timestamp || b?.ctime || 0) - Number(a?.timestamp || a?.ctime || 0))[0];

    if (!latest) return null;

    const rawText = [
      latest?.message,
      latest?.description,
      latest?.title
    ].filter(Boolean).join(' ');

    let reason = '';
    const paren = rawText.match(/\(([^)]+)\)/);
    if (paren?.[1]) reason = paren[1].trim();

    return {
      ctime: Number(latest?.timestamp || latest?.ctime || 0),
      reason: translateReason(reason || rawText)
    };
  }

  async function fetchOnHoldDetails(assignmentId, shipments) {
    if (!assignmentId || !Array.isArray(shipments)) return;

    const unique = [...new Set(shipments.map(String).filter(Boolean))];
    const existing = getOnHoldDetail();
    if (existing?.assignmentId === assignmentId &&
        Date.now() - Number(existing.savedAt || 0) < 60000 &&
        Array.isArray(existing.items) &&
        existing.items.length === unique.length) {
      return existing;
    }

    const items = [];

    for (const shipmentId of unique) {
      try {
        const url = '/api/fleet_order/order/detail/recipient_info'
          + '?shipment_id=' + encodeURIComponent(shipmentId)
          + '&station_type=3';

        const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) continue;

        const parsed = await response.json();
        const attempts = Array.isArray(parsed?.data?.recipient?.On_Hold)
          ? parsed.data.recipient.On_Hold.filter(Boolean)
          : [];

        const ordered = [...attempts].sort((a, b) => Number(a?.ctime || 0) - Number(b?.ctime || 0));
        let latest = ordered.at(-1) || null;
        let latestCtime = Number(latest?.ctime || 0);
        let latestReason = translateReason(latest?.on_hold_reason__desc || latest?.reason_desc || '');

        // Return_LMHub_Onhold pode não aparecer em recipient.On_Hold.
        // Nesse caso usamos o rastreio individual e o evento Retorno_LMHub_Em_Espera.
        if (!latestCtime || !latestReason) {
          try {
            const trackingUrl = '/api/fleet_order/order/detail/tracking_info?shipment_id='
              + encodeURIComponent(shipmentId);
            const trackingResponse = await fetch(trackingUrl, { credentials: 'include', cache: 'no-store' });
            if (trackingResponse.ok) {
              const tracking = await trackingResponse.json();
              const returnEvent = extractReturnLmHubEvent(tracking);
              if (returnEvent) {
                if (!latestCtime) latestCtime = Number(returnEvent.ctime || 0);
                if (!latestReason) latestReason = returnEvent.reason || 'Return_LMHub_Onhold';
              }
            }
          } catch {}
        }

        items.push({
          shipmentId,
          latestCtime,
          latestReason,
          attempts: ordered.map(attempt => ({
            ctime: Number(attempt?.ctime || 0),
            reason: translateReason(attempt?.on_hold_reason__desc || attempt?.reason_desc || '')
          }))
        });
      } catch {}
    }

    const record = {
      assignmentId,
      savedAt: Date.now(),
      items
    };

    try {
      localStorage.setItem(ONHOLD_DETAIL_KEY, JSON.stringify(record));
    } catch {}

    if (lastDriverData?.assignmentId === assignmentId && !diagnosticView) {
      renderDriver(lastDriverData, getStatusScan());
    }

    return record;
  }

  function isReturnLmHubOnhold(item) {
    return objectContainsReturnLmHubOnhold(item);
  }

  function objectContainsReturnLmHubOnhold(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') {
      return /return[_\s-]*lmhub[_\s-]*onhold/i.test(value)
        || /retorno[_\s-]*lmhub[_\s-]*em[_\s-]*espera/i.test(value);
    }
    if (Array.isArray(value)) {
      return value.some(objectContainsReturnLmHubOnhold);
    }
    if (typeof value === 'object') {
      return Object.values(value).some(objectContainsReturnLmHubOnhold);
    }
    return false;
  }

  async function searchedBrIsReturnOnhold(shipmentId) {
    if (!shipmentId) return false;
    try {
      const url = '/api/fleet_order/order/detail/tracking_info?shipment_id='
        + encodeURIComponent(shipmentId);
      const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) return false;
      const parsed = await response.json();
      return objectContainsReturnLmHubOnhold(parsed);
    } catch {
      return false;
    }
  }

  async function scanAssignmentStatuses(assignmentId) {
    if (!assignmentId) return;

    try {
      const existing = getStatusScan();
      if (existing?.assignmentId === assignmentId && Date.now() - existing.savedAt < 60000) return;

      const count = 24;
      let page = 1;
      let total = 0;
      const byStatus = {};
      const shipmentsByStatus = {};
      const onHoldItems = [];
      const onHoldShipments = [];
      let occurrenceCount = 0;
      let searchedItemStatusCode = '';
      let safety = 0;

      while (safety++ < 50) {
        const url = '/spx_delivery/admin/assignment/assignment_task/detail/order/search'
          + '?assignment_task_id=' + encodeURIComponent(assignmentId)
          + '&pageno=' + page
          + '&count=' + count;

        const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) break;

        const parsed = await response.json();
        const list = Array.isArray(parsed?.data?.list) ? parsed.data.list : [];
        total = Number(parsed?.data?.total || total || 0);

        for (const item of list) {
          const code = String(item?.status ?? '');
          if (!code) continue;
          if (!byStatus[code]) {
            byStatus[code] = {
              count: 0,
              sampleShipment: item?.shipment_id || '',
              onHoldReason: item?.on_hold_reason ?? null
            };
          }
          byStatus[code].count += 1;

          const shipmentId = String(item?.shipment_id || '');
          if (!shipmentsByStatus[code]) shipmentsByStatus[code] = [];
          if (shipmentId) shipmentsByStatus[code].push(shipmentId);

          if (shipmentId && shipmentId === lastTracking) {
            searchedItemStatusCode = code;
          }

          const countsAsOccurrence = code === '5' || code === '10' || isReturnLmHubOnhold(item);
          if (countsAsOccurrence) {
            occurrenceCount += 1;
            onHoldItems.push({
              shipment_id: shipmentId,
              on_hold_reason: item?.on_hold_reason ?? null,
              return_lmhub_onhold: isReturnLmHubOnhold(item),
              hints: collectOnHoldTimeHints(item).slice(0, 80)
            });
            if (shipmentId) onHoldShipments.push(shipmentId);
          }
        }

        if (!list.length) break;
        if (page * count >= total) break;
        page += 1;
      }

      // Confirma o Return_LMHub_Onhold pelo rastreio individual.
      // Quando confirmado, aprendemos qual código numérico do Order Search
      // representa esse status e incluímos TODOS os BRs da AT com o mesmo código.
      const searchedReturnOnhold = await searchedBrIsReturnOnhold(lastTracking);
      let returnOnholdStatusCode = '';

      if (searchedItemStatusCode === '10') {
        returnOnholdStatusCode = '10';
      }

      if ((searchedReturnOnhold || searchedItemStatusCode === '10') && searchedItemStatusCode) {
        returnOnholdStatusCode = searchedItemStatusCode;

        const mapped = getStatusMap();
        if (mapped[returnOnholdStatusCode] !== 'Return_LMHub_Onhold') {
          mapped[returnOnholdStatusCode] = 'Return_LMHub_Onhold';
          saveStatusMap(mapped);
        }

        const returnShipments = shipmentsByStatus[returnOnholdStatusCode] || [];

        for (const shipmentId of returnShipments) {
          if (!onHoldShipments.includes(shipmentId)) {
            occurrenceCount += 1;
            onHoldShipments.push(shipmentId);
            onHoldItems.push({
              shipment_id: shipmentId,
              on_hold_reason: null,
              return_lmhub_onhold: true,
              hints: []
            });
          }
        }
      } else if (searchedReturnOnhold && lastTracking) {
        // Fallback: mesmo que o código não seja localizado, o BR pesquisado
        // ainda entra como ocorrência.
        if (!onHoldShipments.includes(lastTracking)) {
          occurrenceCount += 1;
          onHoldShipments.push(lastTracking);
          onHoldItems.push({
            shipment_id: lastTracking,
            on_hold_reason: null,
            return_lmhub_onhold: true,
            hints: []
          });
        }
      }

      const record = {
        assignmentId,
        savedAt: Date.now(),
        total,
        pagesRead: page,
        byStatus,
        onHoldItems,
        occurrenceCount,
        searchedReturnOnhold,
        searchedItemStatusCode,
        returnOnholdStatusCode
      };

      localStorage.setItem(STATUS_SCAN_KEY, JSON.stringify(record));

      void fetchOnHoldDetails(assignmentId, onHoldShipments);

      if (lastDriverData?.assignmentId === assignmentId && !diagnosticView) {
        renderDriver(lastDriverData, record);
      }


    } catch (error) {
      console.warn('[SPX OnHold] Falha ao analisar status da AT', error);
    }
  }

  function renderStatusScan() {
    const scan = getStatusScan();
    if (!scan?.byStatus) return '';

    const map = getStatusMap();
    const rows = Object.entries(scan.byStatus)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([code, info]) => {
        const label = map[code] || 'Não identificado';
        return `
          <div style="padding:5px 0;border-bottom:1px solid #2c2c2c">
            <b>Status ${esc(code)}</b> = ${esc(label)}
            <div style="font-size:11px;color:#aaa">Quantidade: ${esc(info.count)} · Exemplo: ${esc(info.sampleShipment || '—')}</div>
          </div>`;
      }).join('');

    return `
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #444">
        <div style="font-size:12px;color:#aaa;font-weight:700">STATUS DE TODA A AT</div>
        <div style="font-size:11px;color:#888;margin-top:3px">Total API: ${esc(scan.total ?? '—')}</div>
        <div style="font-size:12px;margin-top:5px">${rows || 'Nenhum status encontrado'}</div>
      </div>`;
  }

  function weekdayFromAssignmentId(assignmentId) {
    const match = String(assignmentId || '').match(/^AT(\d{4})(\d{2})(\d{2})/i);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(date).toLowerCase();
  }
  function routeTimestamp(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'object') {
      return routeTimestamp(value?.seconds ?? value?.timestamp ?? value?.time);
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
  }

  function collectRouteObjects(value, output = [], seen = new WeakSet(), depth = 0) {
    if (!value || typeof value !== 'object' || depth > 16 || seen.has(value)) return output;
    seen.add(value);
    if (!Array.isArray(value)) output.push(value);
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') collectRouteObjects(child, output, seen, depth + 1);
    }
    return output;
  }

  function routeObjectTimestamp(node) {
    const candidates = [
      node?.timestamp, node?.ctime, node?.event_time, node?.create_time,
      node?.created_at, node?.created_time, node?.event_timestamp,
      node?.update_time, node?.time, node?.date, node?.datetime
    ];

    for (const value of candidates) {
      const timestamp = routeTimestamp(value);
      if (timestamp >= 1577836800 && timestamp <= 4102444800) return timestamp;
    }

    for (const [key, value] of Object.entries(node || {})) {
      const nk = norm(key);
      if (!/timestamp|ctime|event.*time|create.*time|created|updated|date|datetime|occurred/.test(nk)) continue;
      if (value && typeof value === 'object') continue;
      const timestamp = routeTimestamp(value);
      if (timestamp >= 1577836800 && timestamp <= 4102444800) return timestamp;
    }

    return 0;
  }

  function nodeRepresentsDelivering(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;

    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') continue;

      const nk = norm(key);
      const nv = norm(value);

      // Se o próprio valor trouxer o nome interno, é Delivering.
      if (nv === 'delivering') return true;

      // Na SPX, status 2 = Delivering. Só aceitamos o 2 em campos de status/state,
      // para não confundir com outros números existentes no rastreio.
      if (/status|state/.test(nk) && String(value).trim() === '2') return true;
    }

    return false;
  }

  function realRouteWeekday(tracking) {
    const events = collectRouteObjects(tracking).map((node, index) => {
      if (!nodeRepresentsDelivering(node)) return null;

      const timestamp = routeObjectTimestamp(node);
      if (!timestamp) return null;

      return { timestamp, index };
    }).filter(Boolean);

    if (!events.length) return '';

    // O dia da rota é o Delivering mais recente encontrado na varredura do BR.
    const latest = events.sort((a, b) => b.timestamp - a.timestamp || b.index - a.index)[0];
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      timeZone: 'America/Sao_Paulo'
    }).format(new Date(latest.timestamp * 1000)).toLowerCase();
  }

  function updateRouteDayLine(key) {
    const panel = document.getElementById(PANEL_ID);
    const line = panel?.querySelector('[data-route-weekday]');
    if (!line || line.dataset.routeKey !== key) return;
    if (!routeWeekdayCache.has(key)) {
      line.textContent = 'Dia da rota: buscando...';
      return;
    }
    const day = routeWeekdayCache.get(key);
    line.textContent = day ? 'Dia da rota: ' + day : 'Dia da rota: não localizado';
  }

  async function fetchRealRouteWeekday(shipmentId) {
    if (!shipmentId) return;
    const key = shipmentId;
    if (routeWeekdayCache.has(key)) {
      updateRouteDayLine(key);
      return;
    }
    if (routeWeekdayPending.has(key)) return;
    routeWeekdayPending.add(key);
    updateRouteDayLine(key);
    try {
      const response = await fetch(
        '/api/fleet_order/order/detail/tracking_info?shipment_id=' + encodeURIComponent(shipmentId),
        { credentials: 'include', cache: 'no-store' }
      );
      if (!response.ok) throw new Error('Rastreio indisponível');
      const tracking = await response.json();
      routeWeekdayCache.set(key, realRouteWeekday(tracking));
    } catch (error) {
      routeWeekdayCache.set(key, '');
      console.warn('[SPX OnHold] Falha ao consultar dia real da rota', error);
    } finally {
      routeWeekdayPending.delete(key);
      updateRouteDayLine(key);
    }
  }
  function renderDriver(data, scanOverride = null) {
    lastDriverData = data;
    scanAssignmentStatuses(data.assignmentId);
    if (diagnosticView) return;

    const scan = scanOverride || getStatusScan();
    const sameAT = scan?.assignmentId === data.assignmentId;
    const occurrences = sameAT ? Number(scan?.occurrenceCount ?? scan?.byStatus?.['5']?.count ?? 0) : null;
    const delivering = sameAT ? Number(scan?.byStatus?.['2']?.count || 0) : null;

    const detail = getOnHoldDetail();
    const sameDetailAT = detail?.assignmentId === data.assignmentId;
    const occurrenceItems = sameDetailAT && Array.isArray(detail?.items) ? detail.items : [];

    const latestItem = [...occurrenceItems]
      .filter(item => Number(item?.latestCtime || 0) > 0)
      .sort((a, b) => Number(b.latestCtime) - Number(a.latestCtime))[0] || null;

    const occurrenceText = occurrences === null ? '...' : String(occurrences);
    const deliveringText = delivering === null ? '...' : String(delivering);
    const latestText = occurrences === null
      ? 'carregando...'
      : occurrences === 0
        ? '—'
        : latestItem
          ? formatOccurrenceDate(latestItem.latestCtime)
          : 'carregando horários...';

    const detailsHtml = occurrenceItems
      .sort((a, b) => Number(b.latestCtime || 0) - Number(a.latestCtime || 0))
      .map(item => {
        const reason = item.latestReason ? `<div style="color:#9ca3af;margin-top:2px">${esc(item.latestReason)}</div>` : '';
        return `
          <div style="padding:7px 0;border-bottom:1px solid #2b2b2b">
            <div style="font-weight:800">${esc(item.shipmentId)}</div>
            <div>${esc(formatOccurrenceDate(item.latestCtime))}</div>
            ${reason}
          </div>`;
      }).join('');

    const details = occurrences > 0
      ? `<div data-onhold-details style="display:none;margin-top:8px;padding:8px;background:#151515;border-radius:7px;font-size:12px;color:#ddd;max-height:260px;overflow:auto">
           ${detailsHtml || '<div>Carregando ocorrências...</div>'}
         </div>`
      : '';

    setContent(
      `<div style="font-size:13px;color:#aaa;font-weight:700">MOTORISTA</div>
       <div style="font-size:19px;font-weight:800;margin-top:2px">${esc(data.driver.name)}</div>
       <div style="font-size:17px;margin-top:2px"><b>ID:</b> ${esc(data.driver.id || 'Sem informação')}</div>
       <div style="font-size:13px;color:#777;margin-top:4px">${esc(data.assignmentId || '—')}</div>
       <div style="font-size:14px;color:#bbb;margin-top:3px">${esc(lastTracking || '—')}</div>
       <div data-route-weekday data-route-key="${esc(lastTracking)}" style="font-size:13px;color:#ddd;margin-top:4px">Dia da rota: buscando...</div>
       <div style="height:1px;background:#333;margin:12px 0"></div>
       <div data-toggle-onhold style="font-size:18px;cursor:${occurrences > 0 ? 'pointer' : 'default'}">
         <b>Ocorrências:</b> ${esc(occurrenceText)}
         ${occurrences > 0 ? '<span style="float:right">▾</span>' : ''}
       </div>
       <div style="font-size:15px;color:#aaa;margin-top:5px"><b>Último OnHold:</b> ${esc(latestText)}</div>
       ${details}
       ${delivering > 0 ? `<div style="font-size:18px;margin-top:10px"><b>Em rota:</b> ${esc(deliveringText)}</div>` : ''}`,
      `driver:${data.assignmentId}:${data.driver.id}:${data.driver.name}:${lastTracking}:${occurrenceText}:${deliveringText}:${latestText}:${occurrenceItems.length}`
    );

    const panel = ensurePanel();
    const toggle = panel.querySelector('[data-toggle-onhold]');
    const detailsEl = panel.querySelector('[data-onhold-details]');
    if (toggle && detailsEl) {
      toggle.addEventListener('click', () => {
        const open = detailsEl.style.display !== 'none';
        detailsEl.style.display = open ? 'none' : 'block';
        const arrow = toggle.querySelector('span');
        if (arrow) arrow.textContent = open ? '▾' : '▴';
      });
    }

    const routeKey = lastTracking;
    void fetchRealRouteWeekday(lastTracking);
    updateRouteDayLine(routeKey);
  }

  function getHeaderInfo(table, wanted) {
    const headers = [...table.querySelectorAll('thead th')];
    for (const th of headers) {
      const text = norm(th.innerText);
      if (wanted(text)) {
        const rect = th.getBoundingClientRect();
        return { th, centerX: rect.left + rect.width / 2 };
      }
    }
    return null;
  }

  function cellAtColumn(row, centerX) {
    const cells = [...row.querySelectorAll('td')];
    if (!cells.length) return null;

    let best = null;
    let bestDistance = Infinity;

    for (const cell of cells) {
      const rect = cell.getBoundingClientRect();
      if (rect.width <= 0) continue;

      if (centerX >= rect.left && centerX <= rect.right) return cell;

      const cellCenter = rect.left + rect.width / 2;
      const distance = Math.abs(cellCenter - centerX);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = cell;
      }
    }

    return best;
  }

  function parseDriver(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    const match = raw.match(/\[(\d+)\]\s*(.+)/);
    return match
      ? { id: match[1], name: match[2].trim() }
      : { id: '', name: raw };
  }

  function readSingleAssignment() {
    const tables = [...document.querySelectorAll('table')];

    for (const table of tables) {
      const headers = [...table.querySelectorAll('thead th')].map(th => norm(th.innerText));

      const atIndex = headers.findIndex(text =>
        text === 'id da at' || (text.includes('id') && text.includes('at'))
      );

      const driverIndex = headers.findIndex(text => text === 'motorista');
      const actionIndex = headers.findIndex(text => text === 'acao' || text === 'ação');

      if (atIndex < 0 || driverIndex < 0) continue;

      const rows = [...table.querySelectorAll('tbody tr')].filter(row => {
        if (row.offsetParent === null) return false;
        const cells = row.querySelectorAll('td');
        return cells.length > 0 && /AT[A-Z0-9]+/i.test(row.innerText || '');
      });

      if (rows.length !== 1) continue;

      const row = rows[0];
      const cells = [...row.querySelectorAll('td')];

      const assignmentId =
        ((cells[atIndex]?.innerText || '').match(/AT[A-Z0-9]+/i) || [])[0] || '';

      const driver = parseDriver(cells[driverIndex]?.innerText || '');
      const detailHref =
        actionIndex >= 0 ? (cells[actionIndex]?.querySelector('a')?.href || '') : '';

      if (!assignmentId) continue;

      return { assignmentId, driver, detailHref, row };
    }

    return null;
  }

  function assignmentSignature(result) {
    if (!result) return '';
    return [
      result.assignmentId || '',
      result.driver?.id || '',
      result.driver?.name || ''
    ].join('|');
  }

  function findFilteredAssignment() {
    if (!lastTracking || Date.now() > activeSearchUntil) return null;

    const result = readSingleAssignment();
    if (!result) return null;

    const signature = assignmentSignature(result);
    const elapsed = Date.now() - searchStartedAt;

    // Logo após o bip a tabela ainda pode conter o resultado anterior.
    // Enquanto a assinatura for igual à que existia antes da busca,
    // esperamos o SPX atualizar. Se o novo BR realmente pertencer à
    // mesma AT/motorista, liberamos após 1,6 s.
    if (preSearchAssignmentSignature &&
        signature === preSearchAssignmentSignature &&
        elapsed < 1600) {
      return null;
    }

    return result;
  }

  function beginTracking(br) {
    const value = String(br || '').trim().toUpperCase();
    if (!looksLikeTracking(value)) return;
    if (value === lastTracking && Date.now() < activeSearchUntil) return;

    const previous = readSingleAssignment();
    preSearchAssignmentSignature = assignmentSignature(previous);
    searchStartedAt = Date.now();

    lastTracking = value;
    routeWeekdayCache.clear();
    routeWeekdayPending.clear();
    activeSearchUntil = Date.now() + 6000;
    try {
      localStorage.removeItem(DIAG_KEY);
      localStorage.removeItem(DIAG_CANDIDATES_KEY);
      localStorage.removeItem(ORDER_SHAPE_KEY);
      localStorage.removeItem(ORDER_ITEMS_KEY);
      localStorage.removeItem(STATUS_SCAN_KEY);
      localStorage.removeItem(ONHOLD_DETAIL_KEY);
      localStorage.removeItem(BR_SCAN_KEY);
      localStorage.removeItem(TRACKING_DIAG_KEY);
    } catch {}
    lastRenderSignature = '';
    renderWaiting(value);
  }

  function findTrackingInput() {
    const inputs = [...document.querySelectorAll('input')];

    const withBR = inputs.find(input => looksLikeTracking(input.value));
    if (withBR) return withBR;

    for (const input of inputs) {
      let node = input.parentElement;
      for (let i = 0; node && i < 5; i++, node = node.parentElement) {
        const text = norm(node.innerText);
        if (text.includes('slps num de rastreamento')) return input;
      }
    }

    return null;
  }

  function pollTrackingField() {
    const input = findTrackingInput();
    if (!input) return;

    const value = String(input.value || '').trim();
    if (looksLikeTracking(value) && value.toUpperCase() !== lastTracking) {
      beginTracking(value);
    }
  }

  function enableTrackingInputCapture() {
    document.addEventListener('input', event => {
      if (!isTargetPage()) return;
      const value = String(event.target?.value || '').trim();
      if (looksLikeTracking(value)) beginTracking(value);
    }, true);

    document.addEventListener('change', event => {
      if (!isTargetPage()) return;
      const value = String(event.target?.value || '').trim();
      if (looksLikeTracking(value)) beginTracking(value);
    }, true);
  }

  function enableScannerCapture() {
    document.addEventListener('keydown', event => {
      if (!isTargetPage()) return;

      const now = Date.now();
      if (now - scanLastKeyAt > 120) scanBuffer = '';
      scanLastKeyAt = now;

      if (event.key === 'Enter') {
        const candidate = scanBuffer.trim().toUpperCase();
        scanBuffer = '';

        if (looksLikeTracking(candidate)) {
          beginTracking(candidate);
          return;
        }

        const input = findTrackingInput();
        if (input && looksLikeTracking(input.value)) {
          beginTracking(input.value);
        }
        return;
      }

      if (event.key && event.key.length === 1) {
        scanBuffer += event.key;
        if (scanBuffer.length > 40) {
          scanBuffer = scanBuffer.slice(-40);
        }
      }
    }, true);
  }

  function mainTick() {
    if (!isTargetPage()) return;

    ensureToggle();
    ensurePanel();
    pollTrackingField();

    if (!lastTracking || Date.now() > activeSearchUntil) return;

    const result = findFilteredAssignment();
    if (result?.assignmentId && result?.driver?.name) {
      renderDriver(result);
      activeSearchUntil = 0;
      return;
    }

    if (Date.now() > activeSearchUntil - 500) {
      renderNoInfo();
    }
  }

  clearOldDiagnostic();
  installNetworkDiagnostic();
  enableTrackingInputCapture();
  enableScannerCapture();
  setInterval(mainTick, 100);
  setInterval(learnStatusMapFromDetailPage, 500);

  if (isTargetPage()) {
    diagnosticView = false;
    ensureToggle();
    ensurePanel();
    renderNoInfo();
  }
})();
