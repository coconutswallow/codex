/**
 * /assets/js/avrae/map-setup.js
 * Logic for the Map Configuration Modal
 */

import { $ } from './ui-helpers.js';
import { getResizelyUrl } from '../utils/resizely-helper.js';
import { state } from './state-manager.js';
import { searchBattlemaps } from './supabase-service.js';
import { loadImage, drawMap } from './canvas-manager.js';
import { updateFowOutputs } from './command-generator.js';

let originalWidth = 0;
let originalHeight = 0;

/**
 * Open the Map Setup Modal and populate with current state
 */
export function openMapSetupModal() {
    const modal = $('mapSetupModal');
    if (!modal) return;

    modal.style.display = 'flex';

    // Toggle vision field visibility based on checkboxes
    toggleVisionField();
    updateMapCalculations();
}

/**
 * Close the Map Setup Modal
 */
export function closeMapSetupModal() {
    const modal = $('mapSetupModal');
    if (modal) modal.style.display = 'none';
}

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
export async function handleMapUrlChange() {
    const url = $('mapImgUrl').value.trim();
    const preview = $('mapPreviewImg');
    const placeholder = $('mapPreviewPlaceholder');
    const dimText = $('mapNaturalDims');

    if (!url) {
        preview.style.display = 'none';
        placeholder.style.display = 'block';
        dimText.innerText = 'Original size: 0 x 0 px';
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
        dimText.innerText = `Original size: ${originalWidth} x ${originalHeight} px`;

        updateMapCalculations();
    };
    img.onerror = () => {
        preview.style.display = 'none';
        placeholder.style.display = 'block';
        placeholder.innerText = 'Error loading image';
        dimText.innerText = 'Original size: 0 x 0 px';
        originalWidth = 0;
        originalHeight = 0;
        updateMapCalculations();
    };
    img.src = url;
}

/**
 * Calculate PPC and Recommended Dimensions
 */
export function updateMapCalculations() {
    const gridW = parseInt($('mapW').value) || 1;
    const gridH = parseInt($('mapH').value) || 1;
    const targetPPC = parseInt($('targetPPC').value) || 40;

    // Pixels Per Cell (current)
    const ppc = originalWidth > 0 ? Math.round(originalWidth / gridW) : 0;
    const displayPPC = $('displayPPC');
    const alertPPC = $('ppcAlert');

    if (displayPPC) {
        displayPPC.innerText = `${ppc} px`;
        displayPPC.style.color = (ppc > 100 || ppc < 20) ? 'var(--danger)' : 'var(--success)';
    }

    if (alertPPC) {
        alertPPC.style.display = (ppc > 100) ? 'block' : 'none';
    }

    // Recommended Dims
    const recW = gridW * targetPPC;
    const recH = gridH * targetPPC;
    const recDims = $('recommendedDims');
    if (recDims) {
        recDims.innerText = `${recW} x ${recH} px`;
    }
}

/**
 * Generate Resizely URL
 */
export function generateResizedMap() {
    const url = $('mapImgUrl').value.trim();
    const gridW = parseInt($('mapW').value) || 1;
    const targetPPC = parseInt($('targetPPC').value) || 40;

    if (!url || !url.startsWith('http')) {
        alert('Please enter a valid HTTP(S) URL first.');
        return;
    }

    const targetWidth = gridW * targetPPC;
    const resizedUrl = getResizelyUrl(url, targetWidth);

    if (resizedUrl) {
        // Populate it back to the map image URL as per instructions
        $('mapImgUrl').value = resizedUrl;
        $('mapTransformedUrl').value = resizedUrl;

        // Automatically fetch new dimensions and update preview/calculations
        handleMapUrlChange();
    }
}

/**
 * Toggle Search Area in Modal
 */
export function toggleMapSearch() {
    const area = $('modalMapSearchArea');
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

/**
 * Search maps from modal
 */
let searchTimeout = null;
export async function searchMapsModal(query) {
    const resultsDiv = $("modalMapSearchResults");
    if (!resultsDiv) return;

    if (!query || query.trim().length < 2) {
        resultsDiv.innerHTML = '<div style="padding:10px; text-align:center; color:var(--blur); font-size:0.8em;">Type to search battlemaps...</div>';
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
 * Select map from results in modal
 */
window.selectMapModal = (mapDataStr) => {
    try {
        const m = JSON.parse(mapDataStr.replace(/&quot;/g, '"'));
        $('mapImgUrl').value = m.image_url || m.source_url || "";
        $('mapW').value = m.grid_width || 40;
        $('mapH').value = m.grid_height || 40;

        handleMapUrlChange();
        toggleMapSearch();
    } catch (e) {
        console.error("Select map error:", e);
    }
};

/**
 * Update the side tab summary info
 */
export function updateMapSummary() {
    const url = $('mapImgUrl')?.value?.trim();
    const w = $('mapW')?.value;
    const h = $('mapH')?.value;
    const summary = $('active-map-summary');

    if (!summary || !url) return;

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
 * Apply configuration and close modal
 */
export function applyMapConfig() {
    updateMapSummary();
    closeMapSetupModal();

    // Trigger render
    loadImage();
    drawMap();
    updateFowOutputs();
}
