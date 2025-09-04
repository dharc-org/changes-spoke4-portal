console.log("JavaScript loaded successfully.");

document.addEventListener("DOMContentLoaded", () => {
    if (window.Chart && window.ChartDataLabels) {
        Chart.register(ChartDataLabels);
    }
    document.querySelectorAll(".chart-card").forEach((card, index) => {
        const chartType = card.dataset.chartType;
        let sparqlQuery = card.dataset.sparql;
        // Inject dynamic language into SPARQL if placeholder present
        try {
            const pageLang = (document.documentElement.getAttribute('lang') || 'it').slice(0, 2);
            if (sparqlQuery && sparqlQuery.includes('$LANG$')) {
                sparqlQuery = sparqlQuery.replaceAll('$LANG$', pageLang);
            }
        } catch (e) { /* no-op */ }
        const endpoint = card.dataset.endpoint;
        const containerId = `chart-${index + 1}`;
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container with id '${containerId}' not found!`);
            return;  // Skip this chart
        }

        // Branch by chart type (D3 for packed bubble; timeline handled separately by charts.js)
        if (chartType === 'timeline') {
            // Skip here; charts.js will auto-initialize canvas.timeline-chart
            return;
        } else if (chartType === 'bubble') {
            // Set a reasonable height for bubble layout
            if (!container.style.height) container.style.height = '520px';
            // Clear container (SVG will be injected)
            container.innerHTML = '';
            fetchSparqlData(sparqlQuery, endpoint)
                .then(data => renderPackedBubbleD3(container, data))
                .catch(err => {
                    console.error(`Error loading chart ${containerId}:`, err);
                    container.innerHTML = "<p class='text-danger'>Error loading chart</p>";
                });
        } else {
            // Ensure a canvas exists for Chart.js charts
            let canvas = container.querySelector('canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = `${containerId}-canvas`;
                container.appendChild(canvas);
            }
            fetchSparqlData(sparqlQuery, endpoint)
                .then(data => renderChartJS(canvas, chartType, data))
                .catch(err => {
                    console.error(`Error loading chart ${containerId}:`, err);
                    container.innerHTML = "<p class='text-danger'>Error loading chart</p>";
                });
        }
    });
});

async function fetchSparqlData(query, endpoint) {
    const url = `${endpoint}?query=${encodeURIComponent(query)}`;
    return fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/sparql-results+json' }
    })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(json => transformSparqlResults(json))
        .catch(err => {
            console.error("SPARQL fetch error:", err);
            throw err;
        });
}

// Simplified transformer — map to usable array
function transformSparqlResults(json) {
    function cleanLabel(s) {
        const t = String(s || '').trim();
        return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
    }
    return json.results.bindings.map(b => {
        const out = {};
        for (const key in b) out[key] = b[key].value;
        // Prefer explicit type_label when present (new bubble query)
        if (out.type_label) out.label = cleanLabel(out.type_label);
        // Fallback: derive from URI if label still missing
        if (!out.label) {
            const t = out.type || '';
            const parts = t.split(/[\/#]/);
            out.label = cleanLabel(parts[parts.length - 1] || t);
        }
        return out;
    });
}

function renderChartJS(canvas, type, data) {
    if (type !== 'bubble') {
        const ctx = canvas.getContext('2d');
        ctx.font = '14px sans-serif';
        ctx.fillText(`Unsupported chart type: ${type}`, 10, 20);
    }
}

// Bubble chart via Chart.js removed; using D3 (see charts.js)

// bubble chart implementation moved to charts.js (window.renderPackedBubbleD3)
