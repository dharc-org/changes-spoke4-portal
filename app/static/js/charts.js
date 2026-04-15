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

  const MIN_NATIVE_ISO_YEAR = -271821;
  const MAX_NATIVE_ISO_YEAR = 275760;

  function getPageLang() {
    if (typeof document === 'undefined') return 'it';
    const lang = (document.documentElement?.lang || '').toLowerCase();
    if (lang.startsWith('en')) return 'en';
    if (lang.startsWith('it')) return 'it';
    if (lang) return lang.slice(0, 2);
    return 'it';
  }

  function yearSuffix(year, lang) {
    const langCode = lang || getPageLang();
    const isBC = year < 0;
    if (langCode === 'en') return isBC ? 'BC' : 'AD';
    return isBC ? 'a.C.' : 'd.C.';
  }
  function formatYearNumber(absYear, lang) {
    const locale = lang === 'it' ? 'it-IT' : 'en-US';
    const useCompact = absYear >= 1000;
    try {
      const formatter = new Intl.NumberFormat(locale, {
        notation: useCompact ? 'compact' : 'standard',
        compactDisplay: 'short',
        maximumFractionDigits: useCompact ? 1 : 0
      });
      console.log('Formatter', absYear, formatter);
      return formatter.format(absYear);
    } catch (e) {
      return String(absYear);
    }
  }

  function hexToRgb(hex) {
    const m = (hex || '').replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function lerpColorRGB(a, b, t) {
    return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) };
  }
  function rgbToCss({ r, g, b }, alpha = 1) { return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`; }
  function coerceYearValue(value) {
    if (value == null || value === '') return NaN;
    if (typeof value === 'object' && value !== null && 'value' in value) return coerceYearValue(value.value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const str = String(value).trim();
    if (!str) return NaN;
    const edtf = str.match(/^Y(-?\d+)(?:-.*)?$/i);
    if (edtf) {
      const year = Number(edtf[1]);
      if (Number.isFinite(year)) return year;
    }
    if (/^-?\d+$/.test(str)) return Number(str);
    const d = new Date(str);
    return Number.isFinite(d.getTime()) ? d.getUTCFullYear() : NaN;
  }
  function getYearUTC(x) { return coerceYearValue(x); }
  function representativeYear(a, b) { return (a === b) ? a : Math.round((a + b) / 2); }
  function safeIsoFromYear(year, { endOfYear = false } = {}) {
    if (!Number.isFinite(year)) return null;
    if (year < MIN_NATIVE_ISO_YEAR || year > MAX_NATIVE_ISO_YEAR) return null;
    const month = endOfYear ? 11 : 0;
    const day = endOfYear ? 31 : 1;
    const hour = endOfYear ? 23 : 0;
    const minute = endOfYear ? 59 : 0;
    const second = endOfYear ? 59 : 0;
    const ms = endOfYear ? 999 : 0;
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, ms));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  function pickYear(...candidates) {
    for (const candidate of candidates) {
      const y = getYearUTC(candidate);
      if (Number.isFinite(y)) return y;
    }
    return NaN;
  }

  // Decide bin size from range aiming for a target number of bins.
  function chooseBinSize(minYear, maxYear, opts = {}) {
    const range = Math.max(0, (maxYear ?? 0) - (minYear ?? 0) + 1);
    const explicit = Number(opts.binSize);
    if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.floor(explicit));
    const target = Math.max(4, Number(opts.targetBins) || 64); // aim for ~64 bins by default
    const minBins = Math.max(3, Number(opts.minBins) || 24);
    const maxBins = Math.max(minBins, Number(opts.maxBins) || 128);
    const candidates = Array.isArray(opts.allowed)
      ? opts.allowed
      : [
        0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5,
        1, 2, 5, 10, 20, 25, 50, 75, 100,
        200, 250, 500, 1000, 2000, 2500, 5000, 7500, 10000,
        20000, 25000, 50000, 100000, 200000, 250000, 500000,
        1000000, 2000000, 2500000, 5000000,
        10000000, 20000000, 25000000, 50000000,
        100000000, 200000000, 250000000, 500000000,
        1000000000
      ];
    if (!range || range <= 1) return 1;
    let best = candidates[0];
    let bestScore = Infinity;
    for (const s of candidates) {
      if (!(Number.isFinite(s) && s > 0)) continue;
      const bins = Math.ceil(range / s);
      // Penalize outside [minBins, maxBins] harder
      const outside = (bins < minBins) ? (minBins - bins) : (bins > maxBins ? (bins - maxBins) : 0);
      const score = Math.abs(bins - target) + outside * 2;
      if (score < bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  function floorToBinStart(y, binSize) { return Math.floor(y / binSize) * binSize; }
  function makeBinLabel(start, end) {
    const s = Number.isFinite(start) ? Math.round(start) : null;
    const e = Number.isFinite(end) ? Math.round(end) : null;
    if (s === null && e === null) return '';
    if (e === null || s === e) return s !== null ? String(s) : String(e);
    if (s === null) return String(e);
    return `${s} \u2013 ${e}`;
  }

  function createYearTransform(years, opts = {}) {
    const spanRaw = Number(opts.logThreshold);
    const span = Number.isFinite(spanRaw) && spanRaw > 0 ? spanRaw : 1000;
    const compressPos = Boolean(opts.logCompressPositive);
    const forward = (year) => {
      if (!Number.isFinite(year)) return NaN;
      if (year < -span) {
        const ratio = Math.max(1, (-year) / span);
        return -1 - Math.log10(ratio);
      }
      if (compressPos && year > span) {
        const ratio = Math.max(1, year / span);
        return 1 + Math.log10(ratio);
      }
      return year / span;
    };
    const inverse = (value) => {
      if (!Number.isFinite(value)) return NaN;
      if (value < -1) {
        const ratio = Math.pow(10, -(value + 1));
        return -span * ratio;
      }
      if (compressPos && value > 1) {
        const ratio = Math.pow(10, value - 1);
        return span * ratio;
      }
      return value * span;
    };
    return { mode: compressPos ? 'bi-log' : 'neg-log', span, forward, inverse };
  }

  // Generalized bucketing (e.g., 10/20/30/50-year bins)
  function processToBins(data, opts = {}) {
    const years = [];
    let actualMin = Infinity;
    let actualMax = -Infinity;
    for (const obj of data) {
      const by = pickYear(obj.beginYear, obj.begin, obj?.begin?.value, obj.start, obj.dateBegin, obj.from);
      let ey = pickYear(obj.endYear, obj.end, obj?.end?.value, obj.finish, obj.dateEnd, obj.to);
      if (!Number.isFinite(by)) continue;
      if (!Number.isFinite(ey)) ey = by;
      actualMin = Math.min(actualMin, by, ey);
      actualMax = Math.max(actualMax, by, ey);
      years.push(representativeYear(by, ey));
    }
    if (!years.length) {
      return { starts: [], labels: [], counts: [], maxCount: 0, minYear: null, maxYear: null, binSize: 0 };
    }
    if (!Number.isFinite(actualMin) || !Number.isFinite(actualMax)) {
      return { starts: [], labels: [], counts: [], maxCount: 0, minYear: null, maxYear: null, binSize: 0 };
    }
    console.log('[Timeline] Year range:', { min: actualMin, max: actualMax });
    const transform = createYearTransform(years, opts);
    const transformedYears = years.map(transform.forward).filter(Number.isFinite);
    if (!transformedYears.length) {
      return { starts: [], labels: [], counts: [], maxCount: 0, minYear: null, maxYear: null, binSize: 0 };
    }
    const minTrans = Math.min(...transformedYears);
    const maxTrans = Math.max(...transformedYears);
    const binSize = chooseBinSize(minTrans, maxTrans, opts);
    const bucketCount = Math.max(1, Math.ceil((maxTrans - minTrans) / binSize));
    const countsByBucket = new Array(bucketCount + 1).fill(0);
    for (const value of transformedYears) {
      const idx = Math.max(0, Math.min(bucketCount, Math.floor((value - minTrans) / binSize)));
      countsByBucket[idx] = (countsByBucket[idx] || 0) + 1;
    }
    const starts = []; const labels = []; const counts = []; const ranges = [];
    for (let idx = 0; idx <= bucketCount; idx++) {
      const startTrans = minTrans + idx * binSize;
      const endTrans = Math.min(maxTrans, startTrans + binSize);
      let startActual = transform.inverse(startTrans);
      let endActual = transform.inverse(endTrans);
      if (Number.isFinite(startActual)) startActual = Math.max(actualMin, Math.min(actualMax, startActual));
      if (Number.isFinite(endActual)) endActual = Math.max(actualMin, Math.min(actualMax, endActual));
      if (Number.isFinite(startActual) && Number.isFinite(endActual) && endActual < startActual) {
        const tmp = startActual;
        startActual = endActual;
        endActual = tmp;
      }
      starts.push(startActual);
      labels.push(makeBinLabel(startActual, endActual));
      const count = countsByBucket[idx] || 0;
      counts.push(count);
      ranges.push({ start: startActual, end: endActual, count });
    }
    const maxCount = counts.length ? Math.max(...counts) : 0;
    return {
      starts,
      labels,
      counts,
      maxCount,
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
      binSize,
      ranges
    };
  }

  function buildEqualWidthDatasets(starts, labels, counts, maxCount, opts = {}) {
    const datasets = []; const rgbMin = hexToRgb('#fdf9fb'); const rgbMax = hexToRgb('#A62176');
    const denom = maxCount > 0 ? maxCount : 1;
    const displayLabels = Array.isArray(opts.displayLabels) && opts.displayLabels.length === labels.length ? opts.displayLabels : labels;
    for (let i = 0; i < starts.length; i++) {
      const c = counts[i]; const t = c / denom; const rgb = lerpColorRGB(rgbMin, rgbMax, t);
      const color = rgbToCss(rgb);
      const label = displayLabels[i] ?? labels[i];
      datasets.push({ label, data: [1], backgroundColor: color, borderWidth: 0, stack: 'halfcenturies', _realCount: c });
    }
    return datasets;
  }

  function formatYearCompact(year, lang = getPageLang()) {
    if (!Number.isFinite(year)) return '';
    const abs = Math.abs(year);
    const number = formatYearNumber(abs, lang);
    const suffix = yearSuffix(year, lang);
    return number ? `${number} ${suffix}` : suffix;
  }

  function formatRangeLabel(startYear, endYear, lang = getPageLang()) {
    const hasStart = Number.isFinite(startYear);
    const hasEnd = Number.isFinite(endYear);
    if (!hasStart && !hasEnd) return '';
    if (hasStart && hasEnd) {
      const suffixStart = yearSuffix(startYear, lang);
      const suffixEnd = yearSuffix(endYear, lang);
      const numStart = formatYearNumber(Math.abs(startYear), lang);
      const numEnd = formatYearNumber(Math.abs(endYear), lang);
      if (suffixStart === suffixEnd) {
        if (numStart === numEnd) return `${numStart} ${suffixStart}`.trim();
        return `${numStart}\u2013${numEnd} ${suffixStart}`.trim();
      }
      return `${numStart} ${suffixStart} \u2013 ${numEnd} ${suffixEnd}`.trim();
    }
    return hasStart ? formatYearCompact(startYear, lang) : formatYearCompact(endYear, lang);
  }

  function formatYearSpan(minYear, maxYear, lang = getPageLang()) {
    return formatRangeLabel(minYear, maxYear, lang);
  }

  function filterRowsByRange(rows, range) {
    if (!range) return [];
    const start = Number(range.start);
    const end = Number(range.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const minRange = Math.min(start, end);
    const maxRange = Math.max(start, end);
    return rows.filter(r => {
      const by = Number.isFinite(r.beginYear) ? r.beginYear : getYearUTC(r.begin);
      let ey = Number.isFinite(r.endYear) ? r.endYear : getYearUTC(r.end ?? r.begin);
      if (!Number.isFinite(by)) return false;
      if (!Number.isFinite(ey)) ey = by;
      const rowStart = Math.min(by, ey);
      const rowEnd = Math.max(by, ey);
      return rowEnd >= minRange && rowStart <= maxRange;
    });
  }

  function ensureDetailElements(canvas) {
    // Reuse cached detail if already resolved
    if (canvas._timelineDetail) return canvas._timelineDetail;

    // Find pre-rendered wrapper in the DOM
    const id = canvas.id;
    const wrap = document.querySelector(`.timeline-detail[data-detail-for="${id}"]`);

    if (!wrap) {
      console.warn('[Timeline] No .timeline-detail found for', id);
      return null;
    }

    const titleEl = wrap.querySelector('.timeline-detail-title');
    const detailCanvas = wrap.querySelector('.timeline-detail-canvas');

    // Set a default height for the detail canvas if none is specified
    if (detailCanvas && !detailCanvas.style.height) {
      detailCanvas.style.height = canvas.dataset.detailHeight || '140px';
    }

    const closeBtn = wrap.querySelector('.timeline-detail-close');
    if (closeBtn && !wrap._closeBound) {
      closeBtn.addEventListener('click', () => {
        wrap.classList.add('d-none');
        if (detailCanvas && detailCanvas._chart) {
          detailCanvas._chart.destroy();
          detailCanvas._chart = null;
        }
      });
      wrap._closeBound = true; // avoid double-binding if ensureDetailElements runs again
    }

    const detail = { wrap, titleEl, canvas: detailCanvas };
    canvas._timelineDetail = detail;
    return detail;
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

  function renderTimeline(canvas, labels, datasets, tickEvery = null, renderOpts = {}) {
    if (typeof Chart === 'undefined') { return; }
    Chart.register(barBackgroundPlugin);

    const ctx = canvas.getContext('2d');
    if (canvas._chart) {
      canvas._chart.destroy();
    }

    // Is this the detail chart?
    const isDetail = canvas.classList.contains('timeline-detail-canvas');

    // For the main (overview) chart we keep it responsive.
    // For the detail chart we give it a fixed height and disable responsiveness.
    if (!isDetail) {
      // Main timeline: height from data-height or default
      canvas.style.height = canvas.dataset.height || '160px';
    } else {
      // Detail timeline: fixed height; never let Chart.js resize based on parent
      if (!canvas.style.height) {
        canvas.style.height = canvas.dataset.height || '140px';
      }
    }

    Chart.defaults.devicePixelRatio = 2;

    const n = labels.length;
    const displayLabels = Array.isArray(renderOpts.displayLabels) && renderOpts.displayLabels.length === labels.length
      ? renderOpts.displayLabels
      : labels;
    const tickLabels = Array.isArray(renderOpts.tickLabels) && renderOpts.tickLabels.length === labels.length
      ? renderOpts.tickLabels
      : displayLabels;
    const tickStep = Math.max(1, tickEvery || Math.ceil(tickLabels.length / 5));

    const chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: [''], datasets },
      options: {
        // main chart responsive, detail chart not
        responsive: !isDetail,
        maintainAspectRatio: false,
        indexAxis: 'y',
        layout: { padding: 5 },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: n,
            stacked: true,
            position: 'top',
            ticks: {
              stepSize: 1,
              callback: (val) => {
                const i = Math.round(val - 0.5);
                if (!(i >= 0 && i < n)) return '';
                if (i % tickStep !== 0) return '';
                const lab = tickLabels[i];
                return lab != null ? String(lab) : '';
              },
              maxRotation: 0,
              minRotation: 0,
              align: 'center',
              crossAlign: 'center',
              padding: 5
            },
            grid: {
              drawOnChartArea: false,
              drawTicks: false,
              drawBorder: false
            },
            border: { display: false }
          },
          y: {
            stacked: true,
            ticks: { display: false },
            grid: {
              display: false,
              drawOnChartArea: false,
              drawTicks: false,
              drawBorder: false
            },
            border: { display: false }
          }
        },
        plugins: {
          barBackground: { color: '#faf5f8' },
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => items[0]?.dataset?.label || '',
              label: item => {
                const count = item.dataset?._realCount ?? 0;
                return getPageLang() === 'it'
                  ? `${count} oggetti provengono da questo periodo.`
                  : `${count} objects come from this period.`;
              }
            }
          }
        },
        animation: { duration: 0 }
      }
    });

    canvas._chart = chart;
    return chart;
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
      if (beginRaw == null || beginRaw === '') continue;
      const key = item || `range:${beginRaw}|${endRaw}`;
      const entry = byKey.get(key) || { item: item || null, minY: Infinity, maxY: -Infinity, minRaw: null, maxRaw: null };

      const by = getYearUTC(beginRaw);
      const ey = getYearUTC(endRaw);
      if (Number.isFinite(by)) {
        if (!(Number.isFinite(entry.minY)) || by < entry.minY) {
          entry.minY = by;
          entry.minRaw = beginRaw;
        }
      }
      if (Number.isFinite(ey)) {
        if (!(Number.isFinite(entry.maxY)) || ey > entry.maxY) {
          entry.maxY = ey;
          entry.maxRaw = endRaw;
        }
      }
      byKey.set(key, entry);
    }
    const result = [];
    for (const [key, v] of byKey.entries()) {
      if (!Number.isFinite(v.minY) || !Number.isFinite(v.maxY)) continue;
      const beginISO = safeIsoFromYear(v.minY) ?? (v.minRaw != null ? String(v.minRaw) : null) ?? String(v.minY);
      const endISO = safeIsoFromYear(v.maxY, { endOfYear: true }) ?? (v.maxRaw != null ? String(v.maxRaw) : null) ?? String(v.maxY);
      result.push({ item: v.item, begin: beginISO, end: endISO, beginYear: v.minY, endYear: v.maxY });
    }
    console.log('[Timeline] Normalized groups:', result.length);
    return result;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const pageLang = getPageLang();
    document.querySelectorAll('canvas.timeline-chart').forEach(async (canvas) => {
      canvas.style.cursor = 'pointer';
      const sparql = canvas.dataset.sparql || ''; const endpoint = canvas.dataset.endpoint || '';
      const dataJson = canvas.dataset.json || '';
      // Optional controls to influence binning behavior per chart
      const binSizeOpt = Number(canvas.dataset.binSize);
      const targetBinsOpt = Number(canvas.dataset.targetBins);
      const minBinsOpt = Number(canvas.dataset.minBins);
      const maxBinsOpt = Number(canvas.dataset.maxBins);
      const allowedBinsOpt = (canvas.dataset.allowedBins || '')
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isFinite(n) && n > 0);
      const logThresholdOpt = Number(canvas.dataset.logThreshold);
      const logCompressPositive = canvas.dataset.logCompressPositive === 'true';
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
        const {
          starts,
          labels,
          counts,
          binSize,
          ranges,
          maxCount: overviewMaxCount,
          minYear: overviewMinYear,
          maxYear: overviewMaxYear
        } = processToBins(normalized, {
          binSize: binSizeOpt,
          targetBins: targetBinsOpt,
          minBins: minBinsOpt,
          maxBins: maxBinsOpt,
          allowed: allowedBinsOpt && allowedBinsOpt.length ? allowedBinsOpt : undefined,
          logThreshold: logThresholdOpt,
          logCompressPositive
        });
        if (!starts.length) { return; }
        const rangeLabels = ranges?.length ? ranges.map(r => formatRangeLabel(r.start, r.end, pageLang)) : labels;
        const tickLabels = ranges?.length ? ranges.map(r => formatYearCompact(representativeYear(r.start, r.end), pageLang)) : rangeLabels;
        const datasets = buildEqualWidthDatasets(
          starts,
          labels,
          counts,
          overviewMaxCount || Math.max(...counts, 0),
          { displayLabels: rangeLabels }
        );
        const tickEvery = Math.max(1, Math.ceil(labels.length / 5));
        renderTimeline(canvas, labels, datasets, tickEvery, {
          displayLabels: rangeLabels,
          tickLabels,
          lang: pageLang
        });
        if (canvas._timelineDetailHandler) {
          canvas.removeEventListener('click', canvas._timelineDetailHandler);
        }
        canvas._timelineDetailHandler = (event) => {
          const chart = canvas._chart;
          if (!chart || !ranges?.length) return;

          const elements = chart.getElementsAtEventForMode(
            event, 'nearest', { intersect: true }, false
          );
          if (!elements.length) return;

          const datasetIndex = elements[0].datasetIndex;
          if (!(datasetIndex >= 0)) return;

          const dataset = chart.data.datasets[datasetIndex];
          const range = ranges[datasetIndex];
          if (!dataset || !range || (dataset._realCount ?? 0) <= 0) return;

          const rowsInRange = filterRowsByRange(normalized, range);
          if (!rowsInRange.length) return;

          const detailResult = processToBins(rowsInRange, {
            targetBins: Math.min(32, Math.max(12, ranges.length || 16)),
            minBins: 8,
            maxBins: 48,
            allowed: allowedBinsOpt && allowedBinsOpt.length ? allowedBinsOpt : undefined,
            logThreshold: logThresholdOpt,
            logCompressPositive
          });
          if (!detailResult.starts.length) return;

          const detailRangeLabels = detailResult.ranges?.length ? detailResult.ranges.map(r => formatRangeLabel(r.start, r.end, pageLang)) : detailResult.labels;
          const detailTickLabels = detailResult.ranges?.length ? detailResult.ranges.map(r => formatYearCompact(representativeYear(r.start, r.end), pageLang)) : detailRangeLabels;
          const detailDatasets = buildEqualWidthDatasets(
            detailResult.starts,
            detailResult.labels,
            detailResult.counts,
            detailResult.maxCount || Math.max(...detailResult.counts, 0),
            { displayLabels: detailRangeLabels }
          );
          const detailTick = Math.max(1, Math.ceil(detailResult.labels.length / 8));

          const detail = ensureDetailElements(canvas);
          if (!detail) return;

          if (detail.canvas._chart) {
            detail.canvas._chart.destroy();
            detail.canvas._chart = null;
          }

          const startLabel = Number.isFinite(range.start) ? range.start : overviewMinYear;
          const endLabel = Number.isFinite(range.end) ? range.end : overviewMaxYear;

          detail.titleEl.textContent = formatYearSpan(
            Math.round(Math.min(startLabel, endLabel)),
            Math.round(Math.max(startLabel, endLabel)),
            pageLang
          );

          renderTimeline(detail.canvas, detailResult.labels, detailDatasets, detailTick, {
            displayLabels: detailRangeLabels,
            tickLabels: detailTickLabels,
            lang: pageLang
          });
          detail.wrap.classList.remove('d-none');
        };

        canvas.addEventListener('click', canvas._timelineDetailHandler);
      } catch (e) { console.error('Timeline error:', e); }
    });
  });
})();
