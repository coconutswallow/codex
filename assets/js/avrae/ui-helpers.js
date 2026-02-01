/**
 * /assets/js/avrae/ui-helpers.js
 * DOM helpers and UI utilities
 */

// DOM shorthand
export const $ = (id) => document.getElementById(id);

/**
 * Flash animation and copy to clipboard
 */
export function uiFlash(el) {
    try {
        el.classList.add("clicked-flash");
        setTimeout(() => el.classList.remove("clicked-flash"), 350);
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(el.innerText).catch(() => { });
        }
    } catch (_) { }
}

/**
 * Toggle dropdown menu
 */
export function toggleMenu() {
    const menu = $("navMenu");
    if (!menu) return;
    menu.classList.toggle("active");
}

/**
 * Tab switching
 */
export function openTab(evt, tabId) {
    document.querySelectorAll(".tab-content").forEach((el) => {
        el.classList.remove("active");
    });
    document.querySelectorAll(".tab").forEach((el) => {
        el.classList.remove("active");
    });

    const tab = $(tabId);
    if (tab) tab.classList.add("active");

    if (evt?.currentTarget) {
        evt.currentTarget.classList.add("active");
    }
}

/**
 * Select all checkboxes of a given type
 */
export function selectAll(type, checked) {
    document.querySelectorAll(`input[id^="${type}_sel_"]`).forEach((el) => {
        el.checked = !!checked;
    });
}

/**
 * Clear checked rows
 */
export function clearChecked(type, updateCallback) {
    const sel = document.querySelectorAll(`input[id^="${type}_sel_"]`);

    sel.forEach((chk) => {
        if (!chk.checked) return;

        const idx = chk.id.split("_").pop();
        const ids = [
            `${type}_name_${idx}`,
            `${type}_full_${idx}`,
            `${type}_loc_${idx}`,
            `${type}_extra_${idx}`,
        ];

        ids.forEach((id) => {
            const el = $(id);
            if (el) {
                if (el.type === "checkbox") {
                    el.checked = false;
                } else {
                    el.value = "";
                }
            }
        });

        chk.checked = false;
    });

    if (updateCallback) updateCallback();
}

/**
 * Update file status display
 */
export function updateFileStatus(text) {
    const fs = $("fileStatus");
    if (fs) fs.innerText = text;
}

/**
 * Setup outside click handler for menu
 */
export function setupMenuClickHandler() {
    document.addEventListener("click", (e) => {
        const menu = $("navMenu");
        if (!menu) return;
        const container = e.target.closest(".menu-container");
        if (!container) {
            menu.classList.remove("active");
        }
    });
}

/**
 * Switch between manual and search map modes
 */
export function setMapTab(type) {
    const manualContainer = $("map-manual-container");
    const searchContainer = $("map-search-container");
    const btnManual = $("btn-manual-map");
    const btnSearch = $("btn-search-map");

    if (type === 'manual') {
        if (manualContainer) manualContainer.style.display = 'block';
        if (searchContainer) searchContainer.style.display = 'none';
        if (btnManual) btnManual.classList.add('active');
        if (btnSearch) btnSearch.classList.remove('active');
    } else {
        if (manualContainer) manualContainer.style.display = 'none';
        if (searchContainer) searchContainer.style.display = 'block';
        if (btnManual) btnManual.classList.remove('active');
        if (btnSearch) btnSearch.classList.add('active');
    }
}