(() => {
  'use strict';
  if (window.__SPX_ONHOLD_ACTIVE__) return;
  window.__SPX_ONHOLD_ACTIVE__ = true;

  const PANEL_ID = 'spx-onhold-panel';
  const TOGGLE_ID = 'spx-onhold-toggle';
  const POSITION_KEY = 'spx-onhold-position-v1';
  const ROUTE_FRAGMENT = '/delivery-assignment/list';
  const MODULE_VERSION = '0.1.3';

  let lastTracking = '';
  let panelOpen = true;
  let refreshTimer = null;
  let scanBuffer = '';
  let scanLastKeyAt = 0;

  const isTargetPage = () => location.hash.includes(ROUTE_FRAGMENT) || location.pathname.includes(ROUTE_FRAGMENT);

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function ensureToggle() {
    let button = document.getElementById(TOGGLE_ID);
    if (button) return button;
    button = document.createElement('button');
    button.id = TOGGLE_ID;
    button.textContent = '▣ OnHold';
    button.style.cssText = 'position:fixed;left:16px;bottom:18px;z-index:2147483647;background:#ff6b00;color:#111;border:0;border-radius:9px;padding:10px 14px;font:bold 14px Arial;box-shadow:0 4px 16px #0007;cursor:pointer';
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
    panel.style.cssText = 'position:fixed;left:16px;top:140px;width:330px;z-index:2147483646;background:#080808;color:#fff;border:1px solid #ff6b00;border-radius:12px;box-shadow:0 10px 35px #0009;overflow:hidden;font-family:Arial,sans-serif';
    panel.innerHTML = `
      <div data-drag style="background:#ff6b00;color:#111;padding:12px 14px;font-size:19px;font-weight:800;cursor:move;user-select:none;display:flex;justify-content:space-between;align-items:center">
        <span>SPX OnHold <small style="font-size:11px;font-weight:700;opacity:.75">v${MODULE_VERSION}</small></span><button data-close style="border:0;background:transparent;font-size:21px;font-weight:900;cursor:pointer">−</button>
      </div>
      <div data-content style="padding:15px;font-size:16px;line-height:1.45"><b>Sem informação</b></div>`;
    document.documentElement.appendChild(panel);
    panel.querySelector('[data-close]').addEventListener('click', () => { panelOpen = false; panel.style.display = 'none'; });
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
        const nextLeft = Math.max(0, Math.min(innerWidth - panel.offsetWidth, left + e.clientX - startX));
        const nextTop = Math.max(0, Math.min(innerHeight - 50, top + e.clientY - startY));
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        const rect2 = panel.getBoundingClientRect();
        localStorage.setItem(POSITION_KEY, JSON.stringify({ left: rect2.left, top: rect2.top }));
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  function getHeaders(table) {
    return [...table.querySelectorAll('thead th')].map(th => th.innerText.trim().toLowerCase());
  }

  function parseDriver(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    const m = raw.match(/\[(\d+)\]\s*(.+)/);
    return m ? { id: m[1], name: m[2].trim() } : { id: '', name: raw };
  }

  function findAssignmentResult() {
    const tables = [...document.querySelectorAll('table')];
    for (const table of tables) {
      const headers = getHeaders(table);
      const driverIndex = headers.findIndex(h => /^motorista$/.test(h) || (/motorista/.test(h) && !/estação|estacao/.test(h)) || /^driver$/.test(h));
      const actionIndex = headers.findIndex(h => /ação|acao|action/.test(h));

      const rows = [...table.querySelectorAll('tbody tr')]
        .filter(row => row.offsetParent !== null && row.querySelectorAll('td').length > 0);

      for (const row of rows) {
        const cells = [...row.querySelectorAll('td')];
        let driverText = '';

        if (driverIndex >= 0 && cells[driverIndex]) {
          driverText = cells[driverIndex].innerText || '';
        }

        if (!/\[\d+\]/.test(driverText)) {
          driverText = (row.innerText.match(/\[\d+\]\s*[^\n]+/) || [])[0] || driverText;
        }

        const driver = parseDriver(driverText);
        if (!driver.name) continue;

        const link = actionIndex >= 0 ? cells[actionIndex]?.querySelector('a') : row.querySelector('a');
        const assignmentId = (row.innerText.match(/AT[A-Z0-9]+/i) || [])[0] || '';

        return {
          tracking: lastTracking,
          driver,
          assignmentId,
          detailHref: link?.href || ''
        };
      }
    }
    return null;
  }

  function render(data) {
    ensureToggle();
    const panel = ensurePanel();
    const content = panel.querySelector('[data-content]');
    panel.style.display = panelOpen ? 'block' : 'none';

    if (!data?.driver?.name) {
      content.innerHTML = lastTracking
        ? `<div style="font-size:13px;color:#aaa;font-weight:700">BR DETECTADO</div><div style="font-size:18px;font-weight:800;margin-top:3px">${esc(lastTracking)}</div><div style="margin-top:10px;font-size:15px;color:#aaa">Aguardando retorno da tabela…</div>`
        : '<b style="font-size:18px">Sem informação</b>';
      return;
    }

    content.innerHTML = `
      <div style="font-size:13px;color:#aaa;font-weight:700">MOTORISTA</div>
      <div style="font-size:19px;font-weight:800;margin-top:2px">${esc(data.driver.name)}</div>
      <div style="font-size:17px;margin-top:2px"><b>ID:</b> ${esc(data.driver.id || 'Sem informação')}</div>
      <div style="height:1px;background:#333;margin:12px 0"></div>
      <div style="font-size:18px"><b>Ocorrências:</b> — <span style="float:right">▾</span></div>
      <div style="font-size:15px;color:#aaa;margin-top:5px"><b>Último OnHold:</b> aguardando consulta</div>
      <div style="font-size:18px;margin-top:10px"><b>Em rota:</b> —</div>`;
  }

  function looksLikeTracking(value) {
    return /^BR[A-Z0-9]{8,}$/i.test(String(value || '').trim());
  }

  function detectTrackingInput() {
    const inputs = [...document.querySelectorAll('input')];

    const byValue = inputs.find(input => looksLikeTracking(input.value));
    if (byValue) return byValue;

    const byMeta = inputs.find(input => {
      const own = `${input.placeholder || ''} ${input.getAttribute('aria-label') || ''} ${input.name || ''}`.toLowerCase();
      if (/rastreamento|tracking|slps/.test(own)) return true;

      let node = input.parentElement;
      for (let i = 0; node && i < 4; i++, node = node.parentElement) {
        const text = (node.innerText || '').toLowerCase();
        if (/slps.*rastreamento|rastreamento|tracking/.test(text)) return true;
      }
      return false;
    });

    return byMeta || null;
  }

  function scheduleRead(delay = 350) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      const result = findAssignmentResult();
      render(result || null);
    }, delay);
  }

  function processTracking(tracking) {
    const value = String(tracking || '').trim().toUpperCase();
    if (!looksLikeTracking(value)) return;
    lastTracking = value;
    render(null);

    [250, 600, 1000, 1600, 2400, 3500].forEach(delay => {
      setTimeout(() => {
        const result = findAssignmentResult();
        if (result?.driver?.name) render(result);
      }, delay);
    });
  }

  function bindInput() {
    const input = detectTrackingInput();
    if (!input) return;

    if (!input.dataset.spxOnholdBound) {
      input.dataset.spxOnholdBound = '1';
      const handler = () => setTimeout(() => processTracking(input.value), 30);
      input.addEventListener('input', handler, true);
      input.addEventListener('change', handler, true);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') handler();
      }, true);
    }

    if (looksLikeTracking(input.value) && input.value.trim() !== lastTracking) {
      processTracking(input.value);
    }
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
          processTracking(candidate);
        } else {
          const input = detectTrackingInput();
          if (input && looksLikeTracking(input.value)) processTracking(input.value);
        }
        return;
      }

      if (event.key && event.key.length === 1) {
        scanBuffer += event.key;
        if (scanBuffer.length > 40) scanBuffer = scanBuffer.slice(-40);
      }
    }, true);
  }

  function startTableWatcher() {
    setInterval(() => {
      if (!isTargetPage()) return;
      const result = findAssignmentResult();
      if (result?.driver?.name) {
        render(result);
      }
    }, 500);
  }

  const observer = new MutationObserver(() => {
    if (!isTargetPage()) return;
    ensureToggle();
    ensurePanel();
    bindInput();
    if (lastTracking) {
      const result = findAssignmentResult();
      if (result?.driver?.name) render(result);
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  enableScannerCapture();
  startTableWatcher();

  if (isTargetPage()) {
    ensureToggle();
    ensurePanel();
    bindInput();
  }
})();
