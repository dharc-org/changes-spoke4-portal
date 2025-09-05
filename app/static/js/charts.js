// Global charts helpers: packed bubble (D3) + timeline (Chart.js)
// Exposes window.renderPackedBubbleD3 and auto-initializes timeline canvases.

// Packed bubble (D3)
(function () {
  if (typeof window === 'undefined') return;

  function renderPackedBubbleD3(containerEl, data) {
    if (typeof d3 === 'undefined') {
      console.warn('D3 not found. Expected at /static/vendor/d3/d3.v7.min.js');
      if (containerEl) {
        containerEl.innerHTML = "<p class='text-danger'>D3 library missing. Please add vendor/d3/d3.v7.min.js</p>";
      }
      return;
    }
    const values = data.map(d => ({ label: d.label || d.type, value: Number(d.count) || 0 }));
    const width = containerEl.clientWidth || 700;
    const height = containerEl.clientHeight || 520;

    // Clear existing and prepare positioning context for tooltip
    containerEl.innerHTML = '';
    d3.select(containerEl).style('position', 'relative');

    const root = d3.pack()
      .size([width, height])
      .padding(4)(
        d3.hierarchy({ children: values })
          .sum(d => d.value)
          .sort((a, b) => (b.value || 0) - (a.value || 0)) // larger more central
      );

    const svg = d3.select(containerEl)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .style('max-width', '100%')
      .style('height', '100%')
      .style('display', 'block');

    const colors = ['#A62176', '#436179', '#C07F6B', '#7D725F', '#9D8F7F', '#6A9FB5', '#B77FBD', '#D2A679', '#6F9E6E', '#B55A5A', '#CDBFB0', '#EFE7DC'];
    const color = (i) => colors[i % colors.length];

    const leaves = root.leaves();
    const nodes = svg.append('g')
      .selectAll('g')
      .data(leaves)
      .join('g')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // Helper to measure and truncate text so it fits inside the circle
    const measureCtx = document.createElement('canvas').getContext('2d');
    function truncateToWidth(text, maxPx, fontCss) {
      const str = String(text ?? '');
      if (!str) return '';
      measureCtx.font = fontCss;
      if (measureCtx.measureText(str).width <= maxPx) return str;
      let low = 0, high = str.length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = str.slice(0, mid) + '…';
        if (measureCtx.measureText(candidate).width <= maxPx) low = mid + 1; else high = mid;
      }
      const finalTxt = str.slice(0, Math.max(0, low - 1)) + '…';
      return finalTxt;
    }

    nodes.append('circle')
      .attr('r', d => d.r)
      .attr('fill', (d, i) => color(i))
      .attr('fill-opacity', 0.85);

    // Labels: big bubbles -> multi-line label + count below
    function wrapLines(text, maxWidth, fontCss, maxLines) {
      measureCtx.font = fontCss;
      const words = String(text || '').split(/\s+/).filter(Boolean);
      const lines = [];
      let line = '';
      for (let i = 0; i < words.length; i++) {
        const test = line ? line + ' ' + words[i] : words[i];
        if (measureCtx.measureText(test).width <= maxWidth) {
          line = test;
        } else {
          if (line) lines.push(line);
          // If a single word is longer than maxWidth, hard-truncate it
          if (measureCtx.measureText(words[i]).width > maxWidth) {
            lines.push(truncateToWidth(words[i], maxWidth, fontCss));
            line = '';
          } else {
            line = words[i];
          }
        }
      }
      if (line) lines.push(line);
      if (lines.length > maxLines) {
        const kept = lines.slice(0, maxLines - 1);
        const rest = lines.slice(maxLines - 1).join(' ');
        kept.push(truncateToWidth(rest, maxWidth, fontCss));
        return kept;
      }
      return lines;
    }

    nodes.filter(d => d.r >= 26).each(function (d) {
      const g = d3.select(this);
      const pad = 6;
      const maxWidth = Math.max(0, 2 * (d.r - pad));
      // Slightly smaller fonts to improve centering and fit
      const fsLabel = Math.min(15, Math.max(9, d.r / 3.6));
      const fsCount = Math.min(16, Math.max(10, d.r / 3.5));
      const lineHeight = fsLabel * 1.15;
      const gap = Math.max(2, fsLabel * 0.25);
      const availH = Math.max(0, 2 * (d.r - pad));
      const maxLines = Math.max(1, Math.floor((availH - fsCount - gap) / lineHeight));
      const fontCss = `${400} ${fsLabel}px Work Sans, system-ui, sans-serif`;
      const lines = wrapLines(d.data.label, maxWidth, fontCss, maxLines);
      const totalH = lines.length * lineHeight + gap + fsCount;
      // Center the block: use middle baseline for more consistent alignment
      const startY = -totalH / 2 + lineHeight / 2;

      // Render label lines
      lines.forEach((ln, i) => {
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', startY + i * lineHeight)
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#fff')
          .style('font-family', 'Work Sans, system-ui, sans-serif')
          .style('font-weight', 400)
          .style('font-size', `${fsLabel}px`)
          .text(ln);
      });

      // Render count under label block
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('y', startY + lines.length * lineHeight + gap + fsCount / 2)
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#fff')
        .style('font-family', 'Work Sans, system-ui, sans-serif')
        .style('font-weight', 700)
        .style('font-size', `${fsCount}px`)
        .text(d.data.value);
    });

    nodes.filter(d => d.r >= 16 && d.r < 26).append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', d => d.r >= 20 ? '#fff' : '#1E1E1E')
      .style('font-family', 'Work Sans, system-ui, sans-serif')
      .style('font-weight', 700)
      .style('font-size', d => `${Math.min(15, Math.max(10, d.r / 3.6))}px`)
      .text(d => d.data.value);

    // Tooltip on hover
    const tooltip = d3.select(containerEl)
      .append('div')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', 'rgba(30,30,30,0.9)')
      .style('color', '#fff')
      .style('padding', '4px 8px')
      .style('border-radius', '4px')
      .style('font', '12px Work Sans, system-ui, sans-serif')
      .style('opacity', 0);

    nodes.on('mousemove', (event, d) => {
      const [x, y] = d3.pointer(event, containerEl);
      tooltip
        .style('left', `${x + 12}px`)
        .style('top', `${y + 12}px`)
        .style('opacity', 1)
        .html(`${d.data.label}<br><strong>${d.data.value}</strong>`);
    }).on('mouseleave', () => tooltip.style('opacity', 0));
  }

  window.renderPackedBubbleD3 = renderPackedBubbleD3;
})();

// Timeline (Chart.js)
(function () {
  if (typeof window === 'undefined') return;

  function hexToRgb(hex) {
    const m = (hex || '').replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function lerpColorRGB(a, b, t) {
    return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) };
  }
  function rgbToCss({ r, g, b }, alpha = 1) { return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`; }
  function getYearUTC(x) { const d = new Date(x); return Number.isFinite(d.getTime()) ? d.getUTCFullYear() : NaN; }
  function representativeYear(a, b) { return (a === b) ? a : Math.round((a + b) / 2); }
  function toHalfCenturyStart(y) { return Math.floor(y / 50) * 50; }
  function halfCenturyLabel(s) { return `${s}–${s + 49}`; }

  function processToHalfCenturies(data) {
    const years = [];
    for (const obj of data) {
      // Support both mapped bindings (begin/end as strings) and nested .value
      const beginRaw = obj.begin ?? obj?.begin?.value ?? obj.start ?? obj.dateBegin ?? obj.from;
      const endRaw = obj.end ?? obj?.end?.value ?? obj.finish ?? obj.dateEnd ?? obj.to ?? beginRaw;
      if (!beginRaw || !endRaw) continue;
      const by = getYearUTC(beginRaw), ey = getYearUTC(endRaw);
      if (!Number.isFinite(by) || !Number.isFinite(ey)) continue;
      years.push(representativeYear(by, ey));
    }
    const buckets = years.map(toHalfCenturyStart);
    if (!buckets.length) return { starts: [], labels: [], counts: [], maxCount: 0, minYear: null, maxYear: null };
    const minB = Math.min(...buckets), maxB = Math.max(...buckets), countMap = {};
    for (const b of buckets) countMap[b] = (countMap[b] || 0) + 1;
    const starts = [], labels = [], counts = [];
    for (let b = minB; b <= maxB; b += 50) { starts.push(b); labels.push(halfCenturyLabel(b)); counts.push(countMap[b] ?? 0); }
    const maxCount = counts.length ? Math.max(...counts) : 0;
    const minYear = Math.min(...years), maxYear = Math.max(...years);
    return { starts, labels, counts, maxCount, minYear, maxYear };
  }

  function buildEqualWidthDatasets(starts, labels, counts, maxCount) {
    const datasets = []; const rgbWhite = { r: 255, g: 255, b: 255 }; const rgbMax = hexToRgb('#A62176');
    const denom = maxCount > 0 ? maxCount : 1;
    for (let i = 0; i < starts.length; i++) {
      const c = counts[i]; const t = c / denom; const rgb = lerpColorRGB(rgbWhite, rgbMax, t);
      datasets.push({ label: labels[i], data: [1], backgroundColor: rgbToCss(rgb), borderWidth: 0, stack: 'halfcenturies', _realCount: c });
    }
    return datasets;
  }

  const equalWidthLabelPlugin = {
    id: 'equalWidthLabelPlugin',
    afterBuildTicks(chart, args, opts) {
      const xScale = chart.scales.x; if (!xScale || !opts || !Array.isArray(opts.labels)) return;
      const n = opts.labels.length;
      xScale.ticks = Array.from({ length: n }, (_, i) => ({ value: i + 0.5, label: (i % 4 === 0) ? opts.labels[i] : '' }));
      xScale.max = n; xScale.min = 0;
    }
  };
  const barBackgroundPlugin = {
    id: 'barBackground',
    beforeDatasetsDraw(chart, args, opts) {
      const { ctx, scales } = chart; const x = scales.x;
      let el; for (let i = 0; i < chart.data.datasets.length; i++) { const meta = chart.getDatasetMeta(i); if (!meta.hidden && meta.data && meta.data[0]) { el = meta.data[0]; break; } }
      if (!el) return; const y = el.y; const h = el.height ?? 0; const top = y - h / 2;
      ctx.save(); ctx.fillStyle = opts.color || '#faf5f8'; ctx.fillRect(x.left, top, x.right - x.left, h); ctx.restore();
    }
  };

  function renderTimeline(canvas, labels, datasets) {
    if (typeof Chart === 'undefined') { return; }
    Chart.register(barBackgroundPlugin);
    const ctx = canvas.getContext('2d'); if (canvas._chart) { canvas._chart.destroy(); }
    // Reduce height; allow override via data-height
    canvas.style.height = canvas.dataset.height || '160px';
    Chart.defaults.devicePixelRatio = 2;
    const n = labels.length;
    canvas._chart = new Chart(ctx, {
      type: 'bar', data: { labels: [''], datasets }, options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y', layout: { padding: 5 },
        scales: {
          x: {
            type: 'linear', min: 0, max: n, stacked: true, position: 'top',
            ticks: {
              stepSize: 1,
              callback: (val) => {
                const i = Math.round(val - 0.5);
                if (!(i >= 0 && i < n)) return '';
                if (i % 4 !== 0) return '';
                const lab = labels[i] || '';
                const start = String(lab).split(/[^0-9]/)[0] || lab;
                return start;
              },
              maxRotation: 0,
              minRotation: 0,
              align: 'center',
              crossAlign: 'center',
              padding: 5
            },
            grid: { drawOnChartArea: false, drawTicks: false, drawBorder: false }, border: { display: false }
          },
          y: { stacked: true, ticks: { display: false }, grid: { display: false, drawOnChartArea: false, drawTicks: false, drawBorder: false }, border: { display: false } }
        },
        plugins: { barBackground: { color: '#faf5f8' }, legend: { display: false }, tooltip: { callbacks: { title: items => items[0]?.dataset?.label || '', label: item => `Count: ${item.dataset?._realCount ?? 0}` } } },
        animation: { duration: 0 }
      }
    });
  }

  async function fetchTimelineSparql(query, endpoint) {
    const url = `${endpoint}?query=${encodeURIComponent(query)}`;
    // Log the outgoing request for debugging
    console.log('[Timeline] SPARQL request:', { endpoint, query });
    const res = await fetch(url, { headers: { 'Accept': 'application/sparql-results+json' } });
    if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
    const json = await res.json();
    // Log raw bindings to inspect actual keys/shape
    console.log('[Timeline] SPARQL raw bindings:', json.results && json.results.bindings);
    const rows = json.results.bindings.map(b => { const out = {}; for (const k in b) out[k] = b[k].value; return out; });
    // Log the mapped rows (first few for brevity)
    console.log('[Timeline] Mapped rows (sample):', rows.slice(0, 10), 'total:', rows.length);
    return rows;
  }

  // De-duplicate rows. Prefer unique by item URI when present; otherwise by begin|end
  function dedupeTimelineRows(rows) {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const item = r.item || r.id || r.uri;
      const b = r.begin ?? r.start ?? r.dateBegin ?? r.from;
      const e = r.end ?? r.finish ?? r.dateEnd ?? r.to ?? b;
      if (!b) continue;
      const key = item ? `item:${item}` : `range:${b}|${e}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    console.log('[Timeline] Deduped rows:', out.length, '(from', rows.length, ')');
    return out;
  }

  // Group rows by item (or by identical begin|end when no item), and collapse
  // multiple entries into a single begin/end range per group. This guards against
  // cartesian products caused by joins and produces one record per logical item.
  function normalizeTimelineRows(rows) {
    const byKey = new Map();
    for (const r of rows) {
      const item = r.item || r.id || r.uri;
      const beginRaw = r.begin ?? r.start ?? r.dateBegin ?? r.from;
      const endRaw = r.end ?? r.finish ?? r.dateEnd ?? r.to ?? beginRaw;
      if (!beginRaw) continue;
      const key = item || `range:${beginRaw}|${endRaw}`;
      const entry = byKey.get(key) || { item: item || null, minY: Infinity, maxY: -Infinity };

      const by = getYearUTC(beginRaw);
      const ey = getYearUTC(endRaw);
      if (Number.isFinite(by)) entry.minY = Math.min(entry.minY, by);
      if (Number.isFinite(ey)) entry.maxY = Math.max(entry.maxY, ey);
      byKey.set(key, entry);
    }
    const result = [];
    for (const [key, v] of byKey.entries()) {
      if (!Number.isFinite(v.minY) || !Number.isFinite(v.maxY)) continue;
      // Rebuild ISO strings from years for downstream parsing/display
      const beginISO = new Date(Date.UTC(v.minY, 0, 1)).toISOString();
      const endISO = new Date(Date.UTC(v.maxY, 11, 31, 23, 59, 59)).toISOString();
      result.push({ item: v.item, begin: beginISO, end: endISO });
    }
    console.log('[Timeline] Normalized groups:', result.length);
    return result;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('canvas.timeline-chart').forEach(async (canvas) => {
      const sparql = canvas.dataset.sparql || ''; const endpoint = canvas.dataset.endpoint || '';
      const dataJson = canvas.dataset.json || '';
      try {
        let raw;
        if (dataJson) {
          // Load precomputed rows from static JSON
          const res = await fetch(dataJson, { headers: { 'Accept': 'application/json' } });
          if (!res.ok) throw new Error(`Static JSON HTTP ${res.status}`);
          const json = await res.json();
          if (json && json.results && Array.isArray(json.results.bindings)) {
            const rows = json.results.bindings.map(b => { const out = {}; for (const k in b) out[k] = b[k].value; return out; });
            raw = rows;
          } else if (Array.isArray(json)) {
            raw = json;
          } else if (Array.isArray(json.rows)) {
            raw = json.rows;
          } else {
            throw new Error('Unsupported static JSON shape');
          }
        } else {
          if (!sparql || !endpoint) return;
          raw = await fetchTimelineSparql(sparql, endpoint);
        }
        const deduped = dedupeTimelineRows(raw);
        const normalized = normalizeTimelineRows(deduped);
        const { starts, labels, counts } = processToHalfCenturies(normalized);
        if (!starts.length) { return; }
        const datasets = buildEqualWidthDatasets(starts, labels, counts, Math.max(...counts, 0));
        renderTimeline(canvas, labels, datasets);
      } catch (e) { console.error('Timeline error:', e); }
    });
  });
})();
