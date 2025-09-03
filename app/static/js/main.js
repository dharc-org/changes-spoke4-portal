console.log("JavaScript loaded successfully.");

document.addEventListener("DOMContentLoaded", () => {
    if (window.Chart && window.ChartDataLabels) {
        Chart.register(ChartDataLabels);
    }
    document.querySelectorAll(".chart-card").forEach((card, index) => {
        const chartType = card.dataset.chartType;
        const sparqlQuery = card.dataset.sparql;
        const endpoint = card.dataset.endpoint;
        const containerId = `chart-${index + 1}`;
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container with id '${containerId}' not found!`);
            return;  // Skip this chart
        }

        // Branch by chart type (D3 for packed bubble; Chart.js for others)
        if (chartType === 'bubble') {
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
    return json.results.bindings.map(b => {
        const out = {};
        for (const key in b) out[key] = b[key].value;
        // Best-effort label extraction if only URI is present
        if (!out.label) {
            const t = out.type || '';
            const parts = t.split(/[\/#]/);
            out.label = parts[parts.length - 1] || t;
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
