// app/static/js/melody_item.js
(function () {
  const container = document.getElementById('api-sidebar-content');
  if (!container) return;
  const datasetCfg = {
    API_URL: container.dataset.apiUrl || '',
    CONFIG_URL: container.dataset.configUrl || '',
    ITEM_URI: container.dataset.itemUri || '',
    // LANG: container.dataset.lang || ''
  };
  const cfg = (window.MELODY_CONFIG && Object.keys(window.MELODY_CONFIG).length)
    ? window.MELODY_CONFIG
    : datasetCfg;
  console.log('Melody item sidebar config:', cfg);
  if (!cfg.API_URL) {
    container.innerHTML = '<div class="small opacity-75">Missing API_URL</div>';
    return;
  }

  function deepReplace(obj, token, replacement) {
    if (obj == null) return obj;
    if (typeof obj === 'string') return obj.replaceAll(token, replacement);
    if (Array.isArray(obj)) return obj.map(v => deepReplace(v, token, replacement));
    if (typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) out[k] = deepReplace(v, token, replacement);
      return out;
    }
    return obj;
  }

  (async () => {
    let configObj = null;
    const lang = (window.MELODY_CONFIG && window.MELODY_CONFIG.LANG) || (container.dataset.lang || '');
    if (cfg.CONFIG_URL) {
      try {
        const r = await fetch(cfg.CONFIG_URL, { credentials: 'same-origin' });
        configObj = await r.json();
        if (lang) configObj = deepReplace(configObj, '$LANG$', String(lang));
      } catch (e) {
        console.warn('Failed to fetch/parse config file', e);
      }
    }

    const payload = {
      format: 'html',
      uri1: cfg.ITEM_URI || ''
    };
    if (configObj) payload.config_file = configObj;

    const res = await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || 'Request failed');
    container.innerHTML = text;
  })().catch(err => {
    console.error('Melody API error:', err);
    container.innerHTML = '<div class="small opacity-75">Failed to load sidebar data.</div>';
  });
})();
