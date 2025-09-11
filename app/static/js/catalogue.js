// app/static/js/catalogue.js

let currentPage = 1;
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
        currentPage++;
        await loadCards();
    });
});

async function loadFilters() {
    const container = document.getElementById("filter-groups");
    container.innerHTML = "";

    // Phase 1: Render empty filter groups
    const structureRes = await fetch(`/api/${COLLECTION_ID}/filters?structureOnly=true`);
    const groups = await structureRes.json();

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

        // Placeholder content
        wrapper.innerHTML = `<div class="small fst-italic py-2">Caricamento...</div>`;

        section.appendChild(header);
        section.appendChild(wrapper);
        container.appendChild(section);
    }

    // Phase 2: Fetch actual filter values
    const fullRes = await fetch(`/api/${COLLECTION_ID}/filters`);
    const fullGroups = await fullRes.json();

    fullGroups.forEach(group => {
        const groupId = `group-${group.key}`;
        const wrapper = document.getElementById(groupId);
        if (!wrapper) return;

        wrapper.innerHTML = "";  // Clear loading message

        if (group.options.length === 0) {
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



async function loadCards() {
    const selectedFilters = {};
    document.querySelectorAll("#filter-groups input:checked").forEach(input => {
        const key = input.name;
        if (!selectedFilters[key]) selectedFilters[key] = [];
        selectedFilters[key].push(input.value);
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
    document.getElementById("page-number").textContent = `${currentPage} / ${totalPages}`;

    const container = document.getElementById("cards-container");
    container.innerHTML = "";

    console.log(cards);

    cards.forEach(card => {
        const col = document.createElement("div");
        col.className = "col-md-4 mb-3";
        col.innerHTML = `
      <div class="card h-100 hover-shadow">
        <div class="card-body">
          <h5 class="card-title">${card.title}</h5>
          <p class="card-text">${card.summary}</p>
        </div>
      </div>`;
        container.appendChild(col);
    });
}
