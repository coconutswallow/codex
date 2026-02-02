/**
 * /assets/js/avrae/map-setup.js
 * Logic for Map Configuration
 */

import { $ } from './ui-helpers.js';
import { state } from './state-manager.js';
import { searchBattlemaps } from './supabase-service.js';
import { loadImage, drawMap } from './canvas-manager.js';
import { updateFowOutputs } from './command-generator.js';

let originalWidth = 0;
let originalHeight = 0;

/**
 * Toggle the vision field based on FOW or Auto-View checkboxes
 */
export function toggleVisionField() {
    const fow = $('mapFow').checked;
    const autoView = $('mapAutoView').checked;
    const group = $('visionFieldGroup');

    if (fow || autoView) {
        group.style.display = 'block';
    } else {
        group.style.display = 'none';
    }
}

/**
 * Handle Map URL change - fetch dimensions and show preview
 */
export async function handleMapUrlChange(forceDefault = false) {
    const url = $('mapImgUrl').value.trim();
    const preview = $('mapPreviewImg');
    const placeholder = $('mapPreviewPlaceholder');
    const dimText = $('mapNaturalDims');

    if (!url) {
        preview.style.display = 'none';
        placeholder.style.display = 'block';
        dimText.innerText = 'Original: 0 x 0 px';
        originalWidth = 0;
        originalHeight = 0;
        updateMapCalculations();
        return;
    }

    const img = new Image();
    img.onload = () => {
        originalWidth = img.naturalWidth;
        originalHeight = img.naturalHeight;

        preview.src = url;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        dimText.innerText = `Original: ${originalWidth} x ${originalHeight} px`;

        // Default logic: Set Width to 30, calculate Height and PPC
        // Only if forceDefault is true OR if current values are empty/0
        const currentW = parseInt($('mapW').value) || 0;
        if (originalWidth > 0 && originalHeight > 0 && (forceDefault || currentW === 0)) {
            const defaultW = 30;
            const calcPPC = Math.floor(originalWidth / defaultW);
            const calcH = Math.floor(originalHeight / calcPPC);

            $('mapW').value = defaultW;
            $('mapH').value = calcH;
            $('mapPPC').value = calcPPC;
        }

        updateMapCalculations();
    };
    img.onerror = () => {
        preview.style.display = 'none';
        placeholder.style.display = 'block';
        placeholder.innerText = 'Error loading image';
        dimText.innerText = 'Original: 0 x 0 px';
        originalWidth = 0;
        originalHeight = 0;
        updateMapCalculations();
    };
    img.src = url;
}

/**
 * Calculate PPC based on Width (or vice-versa in cropping mode)
 * In this new mode, changing dimensions (W/H) doesn't change PPC, 
 * it just changes how many cells we draw (cropping).
 * Changing PPC changes how many pixels are in one cell.
 */
export function updateMapCalculations() {
    const gridW = parseInt($('mapW').value) || 1;
    const ppc = parseFloat($('mapPPC').value) || 30;
    const alertPPC = $('ppcAlert');

    // In cropping mode, PPC is the primary scalar.
    // We just update the color of the PPC input based on value.
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
    const ppc = parseFloat($('mapPPC').value) || 40;
    if (ppc <= 0) return;

    if (originalWidth > 0) {
        $('mapW').value = Math.floor(originalWidth / ppc);
    }
    if (originalHeight > 0) {
        $('mapH').value = Math.floor(originalHeight / ppc);
    }
    updateMapCalculations();
}

/**
 * Toggle Search Area
 */
export function toggleMapSearch() {
    const area = $('modalMapSearchArea');
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

/**
 * Search maps
 */
let searchTimeout = null;
export async function searchMapsModal(query) {
    const resultsDiv = $("modalMapSearchResults");
    if (!resultsDiv) return;

    if (!query || query.trim().length < 1) {
        resultsDiv.innerHTML = '<div style="padding:10px; text-align:center; color:var(--blur); font-size:0.8em;">Type to search...</div>';
        return;
    }

    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        resultsDiv.innerHTML = '<div style="padding:20px; text-align:center; color:var(--blur); font-size:0.8em;">Searching...</div>';

        const maps = await searchBattlemaps(query);

        if (!maps || maps.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:20px; text-align:center; color:var(--blur); font-size:0.8em;">No maps found.</div>';
            return;
        }

        resultsDiv.innerHTML = maps.map(m => {
            const mapData = JSON.stringify(m).replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
                <div class="map-result" onclick="selectMapModal('${mapData}')">
                    <img src="${m.thumbnail_url || m.image_url || '/assets/images/placeholder-map.webp'}" class="map-result-thumb" style="width:40px; height:40px;">
                    <div class="map-result-info">
                        <div class="map-result-name" style="font-size:0.8em;">${m.name}</div>
                        <div class="map-result-meta" style="font-size:0.7em;">${m.grid_width}x${m.grid_height}</div>
                    </div>
                </div>
            `;
        }).join('');
    }, 300);
}

/**
 * Select map from results
 */
window.selectMapModal = (mapDataStr) => {
    try {
        const m = JSON.parse(mapDataStr.replace(/&quot;/g, '"'));
        const url = m.optimized_url || m.image_url || m.source_url || "";
        $('mapImgUrl').value = url;

        // handleMapUrlChange will fetch dimensions and apply the 30w default
        handleMapUrlChange(true);
        toggleMapSearch();
    } catch (e) {
        console.error("Select map error:", e);
    }
};

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
    $('summary-map-dims').innerText = `${w || 0} x ${h || 0} Cells`;

    try {
        const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
        $('summary-map-name').innerText = urlObj.pathname.split('/').pop() || "Active Map";
    } catch (e) {
        $('summary-map-name').innerText = "Active Map";
    }
}

/**
 * Apply configuration and render
 */
export function applyMapConfig() {
    updateMapSummary();

    // Trigger render
    loadImage();
    drawMap();
    updateFowOutputs();
}
