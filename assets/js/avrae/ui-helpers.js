/**
 * /assets/js/avrae/ui-helpers.js
 * DOM helpers and UI utilities
 */

// DOM shorthand
export const $ = (id) => document.getElementById(id);

/**
 * Flash animation and optional copy to clipboard
 */
export function uiFlash(el, skipCopy = false) {
    try {
        el.classList.add("clicked-flash");
        setTimeout(() => el.classList.remove("clicked-flash"), 350);
        if (!skipCopy && navigator.clipboard?.writeText) {
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
            `${type}_note_${idx}`,
            `${type}_dead_${idx}`,
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

        const row = chk.closest(".grid-row");
        if (row) {
            row.classList.remove("combatant-dead");
        }

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
    const settingsContainer = $("map-settings-container");
    const btnManual = $("btn-manual-map");
    const btnSearch = $("btn-search-map");

    if (type === 'manual') {
        if (manualContainer) manualContainer.style.display = 'block';
        if (searchContainer) searchContainer.style.display = 'none';
        if (settingsContainer) settingsContainer.style.display = 'block';
        if (btnManual) btnManual.classList.add('active');
        if (btnSearch) btnSearch.classList.remove('active');
    } else {
        if (manualContainer) manualContainer.style.display = 'none';
        if (searchContainer) searchContainer.style.display = 'block';
        if (settingsContainer) settingsContainer.style.display = 'none';
        if (btnManual) btnManual.classList.remove('active');
        if (btnSearch) btnSearch.classList.add('active');
    }
}

export const DRAWER_STORAGE_KEY = 'avrae_drawer_collapsed';

/**
 * Check if the controls drawer is currently open
 * @returns {boolean} True if open, false if collapsed
 */
export function isDrawerOpen() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return false;
    return !sidebar.classList.contains('collapsed');
}

/**
 * Open the controls drawer
 * @param {boolean} [persist=true] - Whether to save preference to localStorage
 */
export function openDrawer(persist = true) {
    setDrawerState(true, persist);
}

/**
 * Close / hide the controls drawer
 * @param {boolean} [persist=true] - Whether to save preference to localStorage
 */
export function closeDrawer(persist = true) {
    setDrawerState(false, persist);
}

/**
 * Toggle the controls drawer between open and collapsed
 * @param {boolean} [persist=true] - Whether to save preference to localStorage
 */
export function toggleDrawer(persist = true) {
    setDrawerState(!isDrawerOpen(), persist);
}

/**
 * Set drawer open/collapsed state and update corresponding UI elements
 * @param {boolean} open - True to open drawer, false to collapse
 * @param {boolean} [persist=true] - Whether to persist state to localStorage
 */
export function setDrawerState(open, persist = true) {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = $('drawerToggleBtn');
    const toggleIcon = $('drawerToggleIcon');
    const toggleText = $('drawerToggleText');
    const floatingBtn = $('floatingDrawerOpenBtn');
    const backdrop = $('drawerBackdrop');

    if (!sidebar) return;

    if (open) {
        sidebar.classList.remove('collapsed');
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'true');
            toggleBtn.setAttribute('title', 'Hide Controls Drawer');
        }
        if (toggleIcon) toggleIcon.innerText = '◀';
        if (toggleText) toggleText.innerText = 'Controls';
        if (floatingBtn) floatingBtn.style.display = 'none';
        if (backdrop) backdrop.classList.remove('hidden');
    } else {
        sidebar.classList.add('collapsed');
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.setAttribute('title', 'Show Controls Drawer');
        }
        if (toggleIcon) toggleIcon.innerText = '▶';
        if (toggleText) toggleText.innerText = 'Controls';
        if (floatingBtn) floatingBtn.style.display = 'inline-flex';
        if (backdrop) backdrop.classList.add('hidden');
    }

    if (persist) {
        try {
            localStorage.setItem(DRAWER_STORAGE_KEY, open ? 'open' : 'collapsed');
        } catch (_) { }
    }

    // Trigger canvas redraw after layout changes so the map scales to container width
    if (typeof window !== 'undefined' && window.drawMap) {
        window.drawMap();
        setTimeout(() => {
            if (typeof window !== 'undefined' && window.drawMap) window.drawMap();
        }, 320);
    }
}

/**
 * Initialize drawer state based on screen size or stored user preference
 */
export function initDrawer() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Check localStorage preference
    let storedState = null;
    try {
        storedState = localStorage.getItem(DRAWER_STORAGE_KEY);
    } catch (_) { }

    let shouldBeOpen = true;
    if (storedState === 'open') {
        shouldBeOpen = true;
    } else if (storedState === 'collapsed') {
        shouldBeOpen = false;
    } else {
        // If no preference saved, on mobile/tablet (<= 768px), default to collapsed so map is visible
        // On desktop (> 768px), default to open
        shouldBeOpen = typeof window !== 'undefined' ? window.innerWidth > 768 : true;
    }

    setDrawerState(shouldBeOpen, false);

    // Close drawer when ESC is pressed (if open and no modal is active)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDrawerOpen()) {
            const anyModalOpen = document.querySelector('.modal.active, .modal[style*="display: block"], .modal[style*="display: flex"]');
            if (!anyModalOpen) {
                closeDrawer();
            }
        }
    });

    // Also handle transitionend on sidebar to ensure map redraw
    sidebar.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'margin-left' || e.propertyName === 'transform') {
            if (typeof window !== 'undefined' && window.drawMap) window.drawMap();
        }
    });
}