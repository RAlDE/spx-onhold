(() => {
  'use strict';
  if (window.__SPX_ONHOLD_ACTIVE__) return;
  window.__SPX_ONHOLD_ACTIVE__ = true;

  const PANEL_ID = 'spx-onhold-panel';
  const TOGGLE_ID = 'spx-onhold-toggle';
  const POSITION_KEY = 'spx-onhold-position-v1';
  const ROUTE_FRAGMENT = '/delivery-assignment/list';
  const MODULE_VERSION = '0.1.9';

  let lastTracking = '';
  let activeSearchUntil = 0;
  let panelOpen = true;
  let scanBuffer = '';
  let scanLastKeyAt = 0;
  let lastRenderSignature = '';
  let diagnosticView = false;

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

  const DIAG_KEY = 'spx-onhold-network-source-v1';

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

  function saveDiagnosticSource(meta, parsed, rawText) {
    const items = findStatusObjects(parsed);
    const text = String(rawText || '');
    if (!items.length && !/\bOnHold\b|\bDelivering\b/i.test(text)) return;

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
      if (!text || (!/OnHold|Delivering/i.test(text))) return;

      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      saveDiagnosticSource(meta, parsed, text);
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

          if (/OnHold|Delivering/i.test(text)) {
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

  function renderDiagnosticSummary() {
    const diag = getSavedDiagnostic();
    if (!diag) return false;

    diagnosticView = true;
    lastRenderSignature = '';
    const panel = ensurePanel();
    const content = panel.querySelector('[data-content]');
    panel.style.display = panelOpen ? 'block' : 'none';

    content.innerHTML = `
      <div style="font-size:13px;color:#aaa;font-weight:700">DIAGNÓSTICO CAPTURADO</div>
      <div style="font-size:15px;margin-top:8px"><b>Método:</b> ${esc(diag.method || '—')}</div>
      <div style="font-size:13px;margin-top:6px;word-break:break-all"><b>URL:</b> ${esc(diag.url || '—')}</div>
      <div style="font-size:15px;margin-top:8px"><b>AT:</b> ${esc(diag.at || '—')}</div>
      <div style="font-size:15px;margin-top:6px"><b>OnHold encontrados:</b> ${esc(diag.onHoldInResponse ?? '—')}</div>
      <div style="font-size:15px;margin-top:4px"><b>Delivering encontrados:</b> ${esc(diag.deliveringInResponse ?? '—')}</div>
      <div style="font-size:12px;color:#999;margin-top:10px">Envie uma foto desta caixa para eu ligar a consulta automática.</div>`;
    return true;
  }

  function renderDriver(data) {
    if (diagnosticView) return;
    setContent(
      `<div style="font-size:13px;color:#aaa;font-weight:700">MOTORISTA</div>
       <div style="font-size:19px;font-weight:800;margin-top:2px">${esc(data.driver.name)}</div>
       <div style="font-size:17px;margin-top:2px"><b>ID:</b> ${esc(data.driver.id || 'Sem informação')}</div>
       <div style="font-size:13px;color:#777;margin-top:4px">AT: ${esc(data.assignmentId || '—')}</div>
       <div style="height:1px;background:#333;margin:12px 0"></div>
       <div style="font-size:18px"><b>Ocorrências:</b> — <span style="float:right">▾</span></div>
       <div style="font-size:15px;color:#aaa;margin-top:5px"><b>Último OnHold:</b> aguardando consulta</div>
       <div style="font-size:18px;margin-top:10px"><b>Em rota:</b> —</div>`,
      `driver:${data.assignmentId}:${data.driver.id}:${data.driver.name}`
    );
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

  function findFilteredAssignment() {
    // Só lemos a tabela durante uma busca ativa por BR.
    if (!lastTracking || Date.now() > activeSearchUntil) return null;

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

      // Antes do bip aparecem várias ATs. Só aceitamos o estado filtrado,
      // quando o SPX deixa uma única linha de resultado.
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

  function beginTracking(br) {
    const value = String(br || '').trim().toUpperCase();
    if (!looksLikeTracking(value)) return;
    if (value === lastTracking && Date.now() < activeSearchUntil) return;

    lastTracking = value;
    activeSearchUntil = Date.now() + 6000;
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

  installNetworkDiagnostic();
  enableTrackingInputCapture();
  enableScannerCapture();
  setInterval(mainTick, 100);

  if (isTargetPage()) {
    ensureToggle();
    ensurePanel();
    renderDiagnosticSummary();
  }
})();
