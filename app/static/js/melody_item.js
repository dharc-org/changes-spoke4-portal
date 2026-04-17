// app/static/js/melody_item.js
(function () {
  const container = document.getElementById('api-sidebar-content');
  if (!container) return;

  function detectTimelineLang() {
    const explicit = (window.MELODY_CONFIG && window.MELODY_CONFIG.LANG)
      || container.dataset.lang
      || (typeof document !== 'undefined' ? document.documentElement?.lang : '')
      || '';
    const normalized = String(explicit).trim().toLowerCase();
    if (!normalized) return 'it';
    if (normalized.startsWith('en')) return 'en';
    if (normalized.startsWith('it')) return 'it';
    return normalized.slice(0, 2) || 'it';
  }
  const timelineLang = detectTimelineLang();
  const datasetCfg = {
    API_URL: container.dataset.apiUrl || '',
    CONFIG_URL: container.dataset.configUrl || '',
    ITEM_URI: container.dataset.itemUri || '',
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

  function normalizeItemUri(value) {
    return String(value || '').trim().replace(/[\\/#]+$/, '').toLowerCase();
  }

  function parseJsonSafe(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Unable to parse melody data-config JSON', err);
      return null;
    }
  }

  function copyScriptAttributes(from, to) {
    if (!from || !to) return;
    for (const attr of Array.from(from.attributes || [])) {
      to.setAttribute(attr.name, attr.value);
    }
  }

  function copyElementAttributes(from, to) {
    if (!from || !to) return;
    for (const attr of Array.from(from.attributes || [])) {
      to.setAttribute(attr.name, attr.value);
    }
  }

  function loadScriptSequential(scriptEl) {
    return new Promise((resolve, reject) => {
      const src = scriptEl.getAttribute('src');
      if (!src) {
        resolve();
        return;
      }
      scriptEl.onload = () => resolve();
      scriptEl.onerror = () => reject(new Error('Failed to load script: ' + src));
    });
  }

  function assetSignature(el) {
    if (!el || !el.tagName) return '';
    const tag = el.tagName.toLowerCase();
    if (tag === 'link') {
      return [
        tag,
        el.getAttribute('rel') || '',
        el.getAttribute('href') || '',
        el.getAttribute('media') || ''
      ].join('|');
    }
    if (tag === 'style') return `${tag}|${el.textContent || ''}`;
    if (tag === 'script') return `${tag}|${el.getAttribute('src') || ''}|${el.textContent || ''}`;
    return `${tag}|${el.outerHTML || ''}`;
  }

  function syncHeadAssets(sourceDoc, apiUrl) {
    if (!sourceDoc || !sourceDoc.head) return [];
    const pendingScripts = [];
    const nodes = Array.from(sourceDoc.head.children || []);
    for (const node of nodes) {
      if (!node || !node.tagName) continue;
      const tag = node.tagName.toLowerCase();
      if (tag === 'meta' || tag === 'title' || tag === 'base') continue;

      if (tag === 'script') {
        const script = document.createElement('script');
        copyScriptAttributes(node, script);
        script.text = node.text || node.textContent || '';
        const signature = assetSignature(script);
        if (signature && document.head.querySelector(`script[data-melody-signature="${CSS.escape(signature)}"]`)) {
          continue;
        }
        if (signature) script.dataset.melodySignature = signature;
        pendingScripts.push(script);
        continue;
      }

      const clone = document.createElement(tag);
      copyElementAttributes(node, clone);
      clone.textContent = node.textContent || '';
      const signature = assetSignature(clone);
      if (!signature) continue;
      if (document.head.querySelector(`[data-melody-signature="${CSS.escape(signature)}"]`)) {
        continue;
      }
      clone.dataset.melodySignature = signature;
      rewriteMelodyAssetUrls(clone, apiUrl, isLikelyMelodyAsset);
      document.head.appendChild(clone);
    }
    return pendingScripts;
  }

  function extractMelodyFragment(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const fragment = document.createDocumentFragment();
    const bodyChildren = Array.from(doc.body ? doc.body.childNodes : []);
    const sourceNodes = bodyChildren.length ? bodyChildren : Array.from(doc.childNodes || []);
    sourceNodes.forEach(node => fragment.appendChild(node.cloneNode(true)));
    return { doc, fragment };
  }

  function detachExecutableNodes(root) {
    if (!root) return { styles: [], scripts: [] };
    const styles = [];
    const scripts = [];
    const nodes = Array.from(root.querySelectorAll('link[rel="stylesheet"], style, script'));
    for (const node of nodes) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'script') {
        scripts.push(node);
      } else {
        styles.push(node);
      }
      node.remove();
    }
    return { styles, scripts };
  }

  function appendStylesToHead(nodes, apiUrl) {
    for (const node of nodes || []) {
      const tag = node.tagName.toLowerCase();
      const clone = document.createElement(tag);
      copyElementAttributes(node, clone);
      clone.textContent = node.textContent || '';
      const signature = assetSignature(clone);
      if (!signature) continue;
      if (document.head.querySelector(`[data-melody-signature="${CSS.escape(signature)}"]`)) {
        continue;
      }
      clone.dataset.melodySignature = signature;
      rewriteMelodyAssetUrls(clone, apiUrl, isLikelyMelodyAsset);
      document.head.appendChild(clone);
    }
  }

  function getMelodyBase(apiUrl) {
    try {
      const url = new URL(apiUrl, window.location.href);
      const origin = url.origin;
      let path = url.pathname || '/';
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
      let basePath = path;
      if (path.endsWith('/api')) {
        basePath = path.slice(0, -4) || '/';
      } else if (path.includes('/')) {
        basePath = path.replace(/\/[^/]*$/, '') || '/';
      }
      return { origin, basePath };
    } catch (err) {
      return { origin: window.location.origin, basePath: '/' };
    }
  }

  function resolveMelodyAssetUrl(rawUrl, apiUrl) {
    if (!rawUrl) return rawUrl;
    const trimmed = String(rawUrl).trim();
    if (!trimmed) return rawUrl;
    if (/^(?:data|blob|javascript):/i.test(trimmed)) return trimmed;
    const base = getMelodyBase(apiUrl);
    if (/^(?:https?:)?\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed, window.location.href);
        if (url.pathname.includes('/melody/')) {
          return `${base.origin}${url.pathname}${url.search}${url.hash}`;
        }
      } catch (err) {
        return trimmed;
      }
      return trimmed;
    }
    if (trimmed.startsWith('/')) return `${base.origin}${trimmed}`;
    const baseForRelative = `${base.origin}${base.basePath.endsWith('/') ? base.basePath : base.basePath + '/'}`;
    try {
      return new URL(trimmed, baseForRelative).toString();
    } catch (err) {
      return trimmed;
    }
  }

  function isLikelyMelodyAsset(rawUrl, apiUrl) {
    if (!rawUrl) return false;
    const trimmed = String(rawUrl).trim();
    if (!trimmed) return false;
    if (/^(?:data|blob|javascript):/i.test(trimmed)) return false;
    if (/^(?:https?:)?\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed, window.location.href);
        return url.pathname.includes('/melody/');
      } catch (err) {
        return false;
      }
    }
    if (trimmed.includes('/melody/')) return true;
    if (trimmed.startsWith('melody/')) return true;
    const base = getMelodyBase(apiUrl);
    if (base.basePath && base.basePath !== '/' && trimmed.startsWith(base.basePath + '/')) return true;
    return false;
  }

  function rewriteMelodyAssetUrls(fragment, apiUrl, shouldRewrite) {
    if (!fragment || !apiUrl) return;
    const elements = fragment.querySelectorAll('[src], [href], [srcset]');
    for (const el of elements) {
      if (el.hasAttribute('src')) {
        const src = el.getAttribute('src');
        if (shouldRewrite && !shouldRewrite(src, apiUrl)) continue;
        const resolved = resolveMelodyAssetUrl(src, apiUrl);
        if (resolved && resolved !== src) el.setAttribute('src', resolved);
      }
      if (el.hasAttribute('href')) {
        const href = el.getAttribute('href');
        if (shouldRewrite && !shouldRewrite(href, apiUrl)) continue;
        const resolved = resolveMelodyAssetUrl(href, apiUrl);
        if (resolved && resolved !== href) el.setAttribute('href', resolved);
      }
      if (el.hasAttribute('srcset')) {
        const rawSet = el.getAttribute('srcset');
        if (rawSet) {
          const rewritten = rawSet.split(',')
            .map(part => {
              const trimmed = part.trim();
              if (!trimmed) return trimmed;
              const [url, descriptor] = trimmed.split(/\s+/, 2);
              if (shouldRewrite && !shouldRewrite(url, apiUrl)) return trimmed;
              const resolved = resolveMelodyAssetUrl(url, apiUrl);
              return descriptor ? `${resolved} ${descriptor}` : resolved;
            })
            .join(', ');
          if (rewritten && rewritten !== rawSet) el.setAttribute('srcset', rewritten);
        }
      }
    }
  }

  function setupMelodyAssetObserver(rootEl, apiUrl, shouldRewrite) {
    if (!rootEl || !apiUrl || rootEl._melodyAssetObserver) return;
    const rewriteElement = (node) => {
      if (!node || node.nodeType !== 1) return;
      rewriteMelodyAssetUrls(node, apiUrl, shouldRewrite);
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(rewriteElement);
        } else if (mutation.type === 'attributes' && mutation.target) {
          rewriteElement(mutation.target);
        }
      }
    });
    observer.observe(rootEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'srcset']
    });
    rootEl._melodyAssetObserver = observer;
  }

  function scheduleMelodyRewrites(target, apiUrl, shouldRewrite) {
    if (!target || !apiUrl) return;
    let runs = 0;
    const maxRuns = 5;
    const tick = () => {
      rewriteMelodyAssetUrls(target, apiUrl, shouldRewrite);
      rewriteMelodyAssetUrls(document.head, apiUrl, isLikelyMelodyAsset);
      runs += 1;
      if (runs < maxRuns) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function installMelodyAssetRewriter(apiUrl) {
    if (!apiUrl || window._melodyAssetRewriterInstalled) return;
    const shouldRewrite = (value) => isLikelyMelodyAsset(value, apiUrl);
    const rewriteValue = (value) => resolveMelodyAssetUrl(value, apiUrl);

    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if ((name === 'src' || name === 'href') && shouldRewrite(value)) {
        return originalSetAttribute.call(this, name, rewriteValue(value));
      }
      return originalSetAttribute.call(this, name, value);
    };

    const patchProp = (proto, prop) => {
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.set) return;
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get ? desc.get.bind(proto) : undefined,
        set(value) {
          const next = shouldRewrite(value) ? rewriteValue(value) : value;
          return desc.set.call(this, next);
        }
      });
    };

    patchProp(HTMLLinkElement.prototype, 'href');
    patchProp(HTMLScriptElement.prototype, 'src');

    window._melodyAssetRewriterInstalled = true;
  }

  async function renderMelodyHtml(target, html, apiUrl) {
    if (!target) return;
    const { doc, fragment } = extractMelodyFragment(html);
    const headScripts = syncHeadAssets(doc, apiUrl);
    rewriteMelodyAssetUrls(fragment, apiUrl);
    const { styles, scripts: bodyScripts } = detachExecutableNodes(fragment);
    appendStylesToHead(styles, apiUrl);
    target.innerHTML = '';
    target.appendChild(fragment);

    installMelodyAssetRewriter(apiUrl);
    setupMelodyAssetObserver(target, apiUrl);
    setupMelodyAssetObserver(document.head, apiUrl, isLikelyMelodyAsset);
    setupMelodyAssetObserver(document.documentElement, apiUrl, isLikelyMelodyAsset);

    const scripts = [...headScripts, ...bodyScripts];
    if (!scripts.length) return;

    for (const oldScript of scripts) {
      const newScript = document.createElement('script');
      copyScriptAttributes(oldScript, newScript);
      if (!newScript.hasAttribute('async')) newScript.async = false;
      newScript.text = oldScript.text || oldScript.textContent || '';
      const signature = assetSignature(newScript);
      if (signature && document.head.querySelector(`script[data-melody-signature="${CSS.escape(signature)}"]`)) {
        continue;
      }
      if (signature) newScript.dataset.melodySignature = signature;
      document.head.appendChild(newScript);
      await loadScriptSequential(newScript);
    }
    rewriteMelodyAssetUrls(target, apiUrl);
    rewriteMelodyAssetUrls(document.head, apiUrl, isLikelyMelodyAsset);
    scheduleMelodyRewrites(target, apiUrl);
    scheduleMelodyRewrites(document.documentElement, apiUrl, isLikelyMelodyAsset);
  }

  (async () => {
    let configObj = null;
    const lang = timelineLang;
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
    await renderMelodyHtml(container, text, cfg.API_URL);
  })().catch(err => {
    console.error('Melody API error:', err);
    container.innerHTML = '<div class="small opacity-75">Failed to load sidebar data.</div>';
  });
})();
