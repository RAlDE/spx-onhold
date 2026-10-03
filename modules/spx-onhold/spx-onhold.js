(() => {
  'use strict';
  if (window.__SPX_ONHOLD_ACTIVE__) return;
  window.__SPX_ONHOLD_ACTIVE__ = true;

  const PANEL_ID = 'spx-onhold-panel';
  const TOGGLE_ID = 'spx-onhold-toggle';
  const POSITION_KEY = 'spx-onhold-position-v1';
  const ROUTE_FRAGMENT = '/delivery-assignment/list';
  const MODULE_VERSION = '0.1.6';

  let lastTracking = '';
  let activeSearchUntil = 0;
  let panelOpen = true;
  let scanBuffer = '';
  let scanLastKeyAt = 0;
  let lastRenderSignature = '';

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
        <button data-close style="border:0;background:transparent;font-size:21px;font-weight:900;cursor:pointer">−</button>
      </div>
      <div data-content style="padding:15px;font-size:16px;line-height:1.45">
        <b>Sem informação</b>
      </div>`;

    document.documentElement.appendChild(panel);

    panel.querySelector('[data-close]').addEventListener('click', () => {
      panelOpen = false;
      panel.style.display = 'none';
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
    setContent(
      `<div style="font-size:13px;color:#aaa;font-weight:700">BR DETECTADO</div>
       <div style="font-size:18px;font-weight:800;margin-top:3px">${esc(br)}</div>
       <div style="margin-top:10px;font-size:15px;color:#aaa">Aguardando AT...</div>`,
      `waiting:${br}`
    );
  }

  function renderNoInfo() {
    setContent(
      '<b style="font-size:18px">Sem informação</b>',
      'no-info'
    );
  }

  function renderDriver(data) {
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

  enableTrackingInputCapture();
  enableScannerCapture();
  setInterval(mainTick, 100);

  if (isTargetPage()) {
    ensureToggle();
    ensurePanel();
  }
})();
