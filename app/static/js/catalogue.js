// app/static/js/catalogue.js

let currentPage = 1;
let TOTAL_PAGES = 1;
const cardsPerPage = 24;
const UI_LOCALE = document.documentElement?.lang || 'it';

function capitalizeFirst(str, locale = UI_LOCALE) {
    if (typeof str !== 'string') return str;
    // Preserve leading whitespace, capitalize the first visible character
    const trimmedStart = str.trimStart();
    const startIdx = str.length - trimmedStart.length;
    if (trimmedStart.length === 0) return str;
    const first = trimmedStart[0].toLocaleUpperCase(locale);
    return str.slice(0, startIdx) + first + trimmedStart.slice(1);
}

let FILTER_GROUPS = [];

function getRangeI18n() {
    // Simple client-side i18n for range labels
    switch ((UI_LOCALE || 'it').toLowerCase()) {
        case 'en':
            return { from: 'From', to: 'To' };
        case 'it':
        default:
            return { from: 'Da', to: 'A' };
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await loadFilters();
    await loadCards();
    document.getElementById("apply-filters").addEventListener("click", async () => {
        currentPage = 1;
        await loadCards();
    });
    const clearBtn = document.getElementById("clear-filters");
    if (clearBtn) {
        clearBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            document.querySelectorAll('#filter-groups input[type="checkbox"]').forEach(cb => { cb.checked = false; });
            // Clear range inputs
            document.querySelectorAll('#filter-groups input[type="number"]').forEach(inp => { inp.value = ''; });
            currentPage = 1;
            await loadCards();
        });
    }
    document.getElementById("prev-page").addEventListener("click", async () => {
        if (currentPage > 1) {
            currentPage--;
            await loadCards();
        }
    });
    document.getElementById("next-page").addEventListener("click", async () => {
        if (currentPage < TOTAL_PAGES) {
            currentPage++;
            await loadCards();
        }
    });
});

async function loadFilters() {
    const container = document.getElementById("filter-groups");
    container.innerHTML = "";

    // Phase 1: Render empty filter groups
    const structureRes = await fetch(`/api/${COLLECTION_ID}/filters?structureOnly=true`);
    const groups = await structureRes.json();
    FILTER_GROUPS = groups;

    for (const group of groups) {
        const groupId = `group-${group.key}`;
        const section = document.createElement("div");
        section.classList.add("mb-2", "border-bottom");

        const header = document.createElement("div");
        header.className = "d-flex justify-content-between align-items-center px-2 py-2 bg-dark text-light filter-toggle";
        header.setAttribute("data-bs-toggle", "collapse");
        header.setAttribute("data-bs-target", `#${groupId}`);
        header.setAttribute("role", "button");
        header.setAttribute("aria-expanded", "false");
        header.setAttribute("aria-controls", groupId);

        header.innerHTML = `
      <span class="text-uppercase small filter-group-title">${group.label}</span>
      <span class="arrow" data-arrow><i class="bi bi-chevron-down"></i></span>
    `;

        const wrapper = document.createElement("div");
        wrapper.className = "collapse ps-2";
        wrapper.id = groupId;

        // Placeholder content or special UI for range
        if ((group.type || 'checkbox') === 'range') {
            const minId = `range-${group.key}-min`;
            const maxId = `range-${group.key}-max`;
            const i18n = getRangeI18n();
            wrapper.innerHTML = `
              <div class="py-2 pe-3">
                <div class="range-fields d-flex align-items-center gap-2 flex-wrap">
                  <label class="form-label m-0 small" for="${minId}">${i18n.from}</label>
                  <input type="number" inputmode="numeric" class="form-control form-control-sm year-input" id="${minId}" placeholder="min">
                  <label class="form-label m-0 small" for="${maxId}">${i18n.to}</label>
                  <input type="number" inputmode="numeric" class="form-control form-control-sm year-input" id="${maxId}" placeholder="max">
                </div>
              </div>`;
        } else {
            wrapper.innerHTML = `<div class="small fst-italic py-2">Caricamento...</div>`;
        }

        section.appendChild(header);
        section.appendChild(wrapper);
        container.appendChild(section);
    }

    // Phase 2: Fetch actual filter values
    const fullRes = await fetch(`/api/${COLLECTION_ID}/filters`);
    const fullGroups = await fullRes.json();
    FILTER_GROUPS = fullGroups;

    fullGroups.forEach(group => {
        const groupId = `group-${group.key}`;
        const wrapper = document.getElementById(groupId);
        if (!wrapper) return;

        wrapper.innerHTML = "";  // Clear loading message

        if ((group.type || 'checkbox') === 'range') {
            // Ensure the inputs exist even if Phase 1 didn't render them
            const minId = `range-${group.key}-min`;
            const maxId = `range-${group.key}-max`;
            if (!wrapper.querySelector(`#${minId}`)) {
                const i18n = getRangeI18n();
                wrapper.innerHTML = `
                  <div class="py-2 pe-3">
                    <div class="range-fields d-flex align-items-center gap-2 flex-wrap">
                      <label class="form-label m-0 small" for="${minId}">${i18n.from}</label>
                      <input type="number" inputmode="numeric" class="form-control form-control-sm year-input" id="${minId}" placeholder="min">
                      <label class="form-label m-0 small" for="${maxId}">${i18n.to}</label>
                      <input type="number" inputmode="numeric" class="form-control form-control-sm year-input" id="${maxId}" placeholder="max">
                    </div>
                  </div>`;
            }
            const minEl = document.getElementById(minId);
            const maxEl = document.getElementById(maxId);
            const r = group.range || {};
            if (minEl && typeof r.min === 'number') {
                minEl.setAttribute('min', r.min);
                minEl.setAttribute('placeholder', r.min);
            }
            if (maxEl && typeof r.max === 'number') {
                maxEl.setAttribute('max', r.max);
                maxEl.setAttribute('placeholder', r.max);
            }
            return;
        }

        if (!group.options || group.options.length === 0) {
            wrapper.innerHTML = `<div class="small fst-italic py-2">Nessun filtro disponibile</div>`;
        } else {
            group.options.forEach(opt => {
                const id = `filter-${btoa(opt.uri)}`;
                wrapper.innerHTML += `
                <div class="form-check checkbox-right pe-2">
                    <label class="form-check-label" for="${id}">${capitalizeFirst(opt.label)}</label>
                    <input class="form-check-input" type="checkbox" value="${opt.uri}" id="${id}" name="${group.key}">
                </div>`;

            });
        }
    });

    // Attach arrow listeners after all groups are populated
    attachArrowListeners();
}

function attachArrowListeners() {
    document.querySelectorAll('.filter-toggle').forEach(toggle => {
        const targetId = toggle.getAttribute('data-bs-target');
        const target = document.querySelector(targetId);
        const arrowIcon = toggle.querySelector('[data-arrow] i');

        // Initial state
        if (target.classList.contains('show')) {
            arrowIcon.classList.remove('bi-chevron-down');
            arrowIcon.classList.add('bi-chevron-up');
        } else {
            arrowIcon.classList.remove('bi-chevron-up');
            arrowIcon.classList.add('bi-chevron-down');
        }

        // Toggle events
        target.addEventListener('shown.bs.collapse', () => {
            arrowIcon.classList.remove('bi-chevron-down');
            arrowIcon.classList.add('bi-chevron-up');
        });

        target.addEventListener('hidden.bs.collapse', () => {
            arrowIcon.classList.remove('bi-chevron-up');
            arrowIcon.classList.add('bi-chevron-down');
        });
    });
}



function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function yearOnly(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    // Expecting e.g. 1500-01-01T00:00:00+00:00 -> take leading year part
    const m = dateStr.match(/^(-?\d{1,4})/);
    return m ? m[1] : null;
}

function formatDateRange(begin, end) {
    const y1 = yearOnly(begin);
    const y2 = yearOnly(end);
    if (y1 && y2) {
        return y1 === y2 ? y1 : `${y1}${y2}`.replace('\u0016', '–');
    }
    return y1 || y2 || null;
}

async function loadCards() {
    const selectedFilters = {};
    document.querySelectorAll("#filter-groups input:checked").forEach(input => {
        const key = input.name;
        if (!selectedFilters[key]) selectedFilters[key] = [];
        selectedFilters[key].push(input.value);
    });

    // Gather range filters
    FILTER_GROUPS.forEach(g => {
        if ((g.type || 'checkbox') !== 'range') return;
        const minEl = document.getElementById(`range-${g.key}-min`);
        const maxEl = document.getElementById(`range-${g.key}-max`);
        if (!minEl && !maxEl) return;
        const minV = minEl && minEl.value ? parseInt(minEl.value, 10) : null;
        const maxV = maxEl && maxEl.value ? parseInt(maxEl.value, 10) : null;
        if (minV != null || maxV != null) {
            selectedFilters[g.key] = { min: minV, max: maxV };
        }
    });

    const res = await fetch(`/api/${COLLECTION_ID}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: selectedFilters, page: currentPage })
    });

    if (!res.ok) {
        console.error("Error loading cards:", await res.text());
        return;
    }

    const { cards, totalPages } = await res.json();
    TOTAL_PAGES = Math.max(1, Number(totalPages) || 1);
    document.getElementById("page-number").textContent = `${currentPage} / ${TOTAL_PAGES}`;

    // Update pagination buttons state
    const prevBtn = document.getElementById("prev-page");
    const nextBtn = document.getElementById("next-page");
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= TOTAL_PAGES;
    prevBtn.setAttribute('aria-disabled', prevBtn.disabled ? 'true' : 'false');
    nextBtn.setAttribute('aria-disabled', nextBtn.disabled ? 'true' : 'false');

    const container = document.getElementById("cards-container");
    container.innerHTML = "";

    console.log(cards);

    cards.forEach(card => {
        const col = document.createElement("div");
        col.className = "col-md-4 mb-3";
        const date = formatDateRange(card.begin, card.end);
        const tech = card.technique_label ? capitalizeFirst(card.technique_label) : null;
        const metaParts = [tech, date, card.conservation_org_label]
            .filter(Boolean)
            .map(escapeHtml);
        const meta = metaParts.join(' • ');
        col.innerHTML = `
      <div class="card h-100 hover-shadow">
        <div class="card-body">
          <h5 class="card-title">${escapeHtml(card.title)}</h5>
          ${meta ? `<p class="card-text card-meta">${meta}</p>` : ''}
        </div>
      </div>`;
        container.appendChild(col);
    });
}
