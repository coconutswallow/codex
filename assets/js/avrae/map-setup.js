/**
 * /assets/js/avrae/map-setup.js
 * Logic for Map Configuration, Map URL Validation, Battlemap Search, and Dimensions Setup.
 */

import { $ } from './ui-helpers.js';
import { state } from './state-manager.js';
import { searchBattlemaps } from './data-manager.js';
import { loadImage, drawMap } from './canvas-manager.js';
import { updateFowOutputs } from './command-generator.js';

let originalWidth = 0;
let originalHeight = 0;
let searchTimeout = null;
let currentSearchResults = [];

/**
 * Fallback SVG icon for map thumbnails to avoid 404 network requests.
 */
export const MAP_PLACEHOLDER_ICON = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='%2372767d' stroke-width='1.5'%3E%3Cpolygon points='3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21'/%3E%3Cline x1='9' y1='3' x2='9' y2='18'/%3E%3Cline x1='15' y1='6' x2='15' y2='21'/%3E%3C/svg%3E";

/**
 * Escape HTML special characters for safe rendering in DOM templates.
 * @param {string} str - Raw text string.
 * @returns {string} HTML-escaped string.
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Validate whether a string is a valid HTTP or HTTPS URL.
 * Prevents treating non-URL strings (like search terms) as relative paths.
 * @param {string} string - The candidate URL string to validate.
 * @returns {boolean} True if string is a valid http(s) URL.
 */
export function isValidHttpUrl(string) {
    if (!string || typeof string !== 'string') return false;
    try {
        const url = new URL(string.trim());
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

/**
 * Returns current cached search results.
 * @returns {Array} List of current search result objects.
 */
export function getCurrentSearchResults() {
    return currentSearchResults;
}

/**
 * Toggle the vision field based on FOW or Auto-View checkboxes
 */
export function toggleVisionField() {
    const fow = $('mapFow')?.checked;
    const group = $('visionFieldGroup');
    if (!group) return;

    if (fow) {
        group.style.display = 'block';
    } else {
        group.style.display = 'none';
    }
}

/**
 * Handle Map URL change - validates URL, fetches dimensions, and shows preview.
 * If input is non-URL text, automatically routes to battlemap search instead of failing.
 * @param {boolean} forceDefault - Whether to force recalibration of width/height/PPC.
 */
export async function handleMapUrlChange(forceDefault = false) {
    const rawVal = $('mapImgUrl')?.value || '';
    const url = rawVal.trim();
    const preview = $('mapPreviewImg');
    const placeholder = $('mapPreviewPlaceholder');
    const dimText = $('mapNaturalDims');

    if (!url) {
        if (preview) preview.style.display = 'none';
        if (placeholder) {
            placeholder.style.display = 'block';
            placeholder.innerText = 'No preview available';
        }
        if (dimText) dimText.innerText = 'Original: 0 x 0 px';
        originalWidth = 0;
        originalHeight = 0;
        updateMapCalculations();
        return;
    }

    // Check if the input is a valid HTTP/HTTPS URL
    if (!isValidHttpUrl(url)) {
        // Not a URL: do NOT set img.src (which triggers 404 requests like /avrae-manager/arena)
        if (preview) preview.style.display = 'none';
        if (placeholder) {
            placeholder.style.display = 'block';
            placeholder.innerText = 'Search query entered (see results below)';
        }
        if (dimText) dimText.innerText = 'Original: 0 x 0 px';
        originalWidth = 0;
        originalHeight = 0;
        updateMapCalculations();

        // If the user typed 2+ characters, treat as search query and show results
        if (url.length >= 2) {
            const area = $('modalMapSearchArea');
            if (area) area.style.display = 'block';
            const searchInput = $('modalMapSearchInput');
            if (searchInput && searchInput.value !== url) {
                searchInput.value = url;
            }
            searchMapsModal(url);
        }
        return;
    }

    // Valid URL: load image preview safely
    const img = new Image();
    if (url.startsWith('http')) {
        img.crossOrigin = "anonymous";
    }

    img.onload = () => {
        originalWidth = img.naturalWidth;
        originalHeight = img.naturalHeight;

        if (preview) {
            preview.src = url;
            preview.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
        if (dimText) dimText.innerText = `Original: ${originalWidth} x ${originalHeight} px`;

        // Default logic: Set Width to 30, calculate Height and PPC
        const currentW = parseInt($('mapW')?.value) || 0;
        if (originalWidth > 0 && originalHeight > 0 && (forceDefault || currentW === 0)) {
            const defaultW = 30;
            const calcPPC = Math.floor(originalWidth / defaultW);
            const calcH = Math.floor(originalHeight / calcPPC);

            if ($('mapW')) $('mapW').value = defaultW;
            if ($('mapH')) $('mapH').value = calcH;
            if ($('mapPPC')) $('mapPPC').value = calcPPC;
        }

        updateMapCalculations();
    };

    img.onerror = () => {
        if (preview) preview.style.display = 'none';
        if (placeholder) {
            placeholder.style.display = 'block';
            placeholder.innerText = 'Error loading image';
        }
        if (dimText) dimText.innerText = 'Original: 0 x 0 px';
        originalWidth = 0;
        originalHeight = 0;
        updateMapCalculations();
    };

    img.src = url;
}

/**
 * Calculate PPC based on Width (or vice-versa in cropping mode).
 * In cropping mode, changing PPC changes how many pixels are in one cell.
 */
export function updateMapCalculations() {
    const ppc = parseFloat($('mapPPC')?.value) || 30;
    const alertPPC = $('ppcAlert');

    // PPC color warning
    const ppcInput = $('mapPPC');
    if (ppcInput) {
        ppcInput.style.color = (ppc > 100 || ppc < 20) ? 'var(--danger)' : 'var(--success)';
    }

    if (alertPPC) {
        alertPPC.style.display = (ppc > 100) ? 'block' : 'none';
    }
}

/**
 * Update Grid dimensions from target PPC
 */
export function updateGridFromPPC() {
    const ppc = parseFloat($('mapPPC')?.value) || 40;
    if (ppc <= 0) return;

    if (originalWidth > 0 && $('mapW')) {
        $('mapW').value = Math.floor(originalWidth / ppc);
    }
    if (originalHeight > 0 && $('mapH')) {
        $('mapH').value = Math.floor(originalHeight / ppc);
    }
    updateMapCalculations();
}

/**
 * Toggle Search Area visibility and focus input
 */
export function toggleMapSearch() {
    const area = $('modalMapSearchArea');
    if (!area) return;
    const isHidden = area.style.display === 'none' || !area.style.display;
    area.style.display = isHidden ? 'block' : 'none';

    if (isHidden) {
        const searchInput = $('modalMapSearchInput');
        if (searchInput) {
            const mainVal = $('mapImgUrl')?.value?.trim() || '';
            // If the main input has a search query (not a URL), transfer it
            if (mainVal && !isValidHttpUrl(mainVal) && !searchInput.value) {
                searchInput.value = mainVal;
            }
            searchInput.focus();
            if (searchInput.value) {
                searchMapsModal(searchInput.value);
            }
        }
    }
}

/**
 * Search battlemaps in database and render results list
 * @param {string} query - Map search keyword
 */
export async function searchMapsModal(query) {
    const resultsDiv = $('modalMapSearchResults');
    if (!resultsDiv) return;

    if (!query || query.trim().length < 1) {
        resultsDiv.innerHTML = '<div style="padding:10px; text-align:center; color:var(--blur); font-size:0.8em;">Type to search...</div>';
        currentSearchResults = [];
        return;
    }

    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        resultsDiv.innerHTML = '<div style="padding:20px; text-align:center; color:var(--blur); font-size:0.8em;">Searching...</div>';

        const maps = await searchBattlemaps(query);
        currentSearchResults = maps || [];

        if (!currentSearchResults || currentSearchResults.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:20px; text-align:center; color:var(--blur); font-size:0.8em;">No maps found.</div>';
            return;
        }

        resultsDiv.innerHTML = currentSearchResults.map((m, index) => {
            const thumbUrl = m.thumbnail_url || m.optimized_url || m.image_url || MAP_PLACEHOLDER_ICON;
            const dims = (m.grid_width && m.grid_height) ? `${m.grid_width}x${m.grid_height}` : '';
            return `
                <div class="map-result" onclick="selectMapByIndex(${index})" title="${escapeHtml(m.name)}">
                    <img src="${escapeHtml(thumbUrl)}" class="map-result-thumb" style="width:40px; height:40px;" onerror="this.onerror=null;this.src='${MAP_PLACEHOLDER_ICON}'">
                    <div class="map-result-info">
                        <div class="map-result-name" style="font-size:0.8em;">${escapeHtml(m.name)}</div>
                        ${dims ? `<div class="map-result-meta" style="font-size:0.7em;">${dims}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }, 300);
}

/**
 * Apply selected map record to the configuration UI
 * @param {Object} m - Battlemap database record
 */
function applySelectedMap(m) {
    if (!m) return;

    // Pick best usable direct image URL
    let url = m.optimized_url || m.image_url || '';
    if (!url && m.thumbnail_url && isValidHttpUrl(m.thumbnail_url)) {
        url = m.thumbnail_url;
    }
    if (!url && m.source_url && isValidHttpUrl(m.source_url)) {
        if (m.source_url.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i)) {
            url = m.source_url;
        }
    }

    if (!url) {
        alert("This map does not have a direct image URL available.");
        return;
    }

    const mapInput = $('mapImgUrl');
    if (mapInput) mapInput.value = url;

    const searchInput = $('modalMapSearchInput');
    if (searchInput) searchInput.value = m.name;

    // Load preview and trigger calculations
    handleMapUrlChange(true);

    // Close search area
    const area = $('modalMapSearchArea');
    if (area) area.style.display = 'none';

    // Update active map summary
    const summary = $('active-map-summary');
    if (summary) summary.style.display = 'block';
    const summaryName = $('summary-map-name');
    if (summaryName) summaryName.innerText = m.name;
}

/**
 * Select map by index in cached search results.
 * @param {number} index - Index in currentSearchResults array.
 */
export function selectMapByIndex(index) {
    const m = currentSearchResults[index];
    if (!m) return;
    applySelectedMap(m);
}

/**
 * Select map from JSON string or object (backward compatibility).
 * @param {string|Object} mapData - JSON string or battlemap object.
 */
export function selectMapModal(mapData) {
    try {
        let m = mapData;
        if (typeof mapData === 'string') {
            m = JSON.parse(mapData.replace(/&quot;/g, '"'));
        }
        applySelectedMap(m);
    } catch (e) {
        console.error("Select map error:", e);
    }
}

// Expose handlers on window for onclick attributes
window.selectMapByIndex = selectMapByIndex;
window.selectMapModal = selectMapModal;

/**
 * Update the summary info
 */
export function updateMapSummary() {
    const url = $('mapImgUrl')?.value?.trim();
    const w = $('mapW')?.value;
    const h = $('mapH')?.value;
    const summary = $('active-map-summary');

    if (!summary) return;

    if (!url) {
        summary.style.display = 'none';
        return;
    }

    summary.style.display = 'block';
    if ($('summary-map-dims')) {
        $('summary-map-dims').innerText = `${w || 0} x ${h || 0} Cells`;
    }

    try {
        const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
        if ($('summary-map-name')) {
            $('summary-map-name').innerText = urlObj.pathname.split('/').pop() || "Active Map";
        }
    } catch (e) {
        if ($('summary-map-name')) {
            $('summary-map-name').innerText = "Active Map";
        }
    }
}

/**
 * Apply configuration and render
 */
export function applyMapConfig() {
    updateMapSummary();

    // Trigger render
    updateFowOutputs();
    loadImage();
    drawMap();
}
