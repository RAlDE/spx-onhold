const toggle = document.getElementById('toggle');
const sync = document.getElementById('sync');
const status = document.getElementById('status');

async function render() {
  const { enabled = true } = await chrome.storage.local.get('enabled');
  toggle.textContent = enabled ? 'Ativado' : 'Desativado';
  toggle.dataset.enabled = String(enabled);
}

toggle.addEventListener('click', async () => {
  const enabled = toggle.dataset.enabled !== 'true';
  await chrome.storage.local.set({ enabled });
  const response = await chrome.runtime.sendMessage({ type: 'sync' });
  status.textContent = response?.ok ? 'Módulo sincronizado.' : response?.error || 'Falha ao sincronizar.';
  render();
});

sync.addEventListener('click', async () => {
  status.textContent = 'Atualizando…';
  const response = await chrome.runtime.sendMessage({ type: 'sync' });
  status.textContent = response?.ok ? 'Atualizado.' : response?.error || 'Falha ao atualizar.';
});

render();
