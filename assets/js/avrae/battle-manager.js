/**
 * /assets/js/avrae/battle-manager.js
 * Main coordinator for Avrae Battle Manager (modular version)
 * 
 * This file imports and coordinates all the individual modules.
 * Each module has a single, clear responsibility.
 */

// Import modules
import {
    $,
    uiFlash,
    toggleMenu,
    openTab,
    selectAll,
    clearChecked,
    setupMenuClickHandler,
    setMapTab
} from './ui-helpers.js';

import { initLists } from './row-builder.js';
import { centerOn, drawMap, loadImage, initCanvasInteractions, resetFog } from './canvas-manager.js';
import { updateFowOutputs, batchCmd, generateTokenCommands, generateNpcAddCmds, generateNpcTokenCmds, parseXY } from './command-generator.js';
import { openTokenModal, openNpcModal } from './modal-manager.js';
import { refreshTokensFromSupabase, saveSessionToSupabase, loadSessionPrompt, searchBattlemaps } from './supabase-service.js';

/**
 * Search and display battlemaps
 */
let searchTimeout = null;
async function searchMaps(query) {
    const resultsDiv = $("mapSearchResults");
    if (!resultsDiv) return;

    if (!query || query.trim().length < 2) {
        resultsDiv.innerHTML = '<div style="padding:20px; text-align:center; color:var(--blur); font-size:0.8em;">Type to search battlemaps...</div>';
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
            let hostname = "Database";
            try {
                if (m.source_url) {
                    // Handle relative URLs or strings that aren't full URLs
                    const urlStr = m.source_url.startsWith('http') ? m.source_url : 'https://' + m.source_url;
                    hostname = new URL(urlStr).hostname;
                }
            } catch (e) {
                hostname = "Source";
            }

            // Escape the object for the onclick handler more safely
            const mapData = JSON.stringify(m).replace(/'/g, "\\'").replace(/"/g, '&quot;');

            return `
                <div class="map-result" onclick="selectMap('${mapData}')">
                    <img src="${m.thumbnail_url || m.image_url || '/assets/images/placeholder-map.webp'}" class="map-result-thumb">
                    <div class="map-result-info">
                        <div class="map-result-name">${m.name}</div>
                        <div class="map-result-meta">${m.grid_width}x${m.grid_height} • ${hostname}</div>
                    </div>
                </div>
            `;
        }).join('');
    }, 300);
}

/**
 * Select a map from search results
 */
function selectMap(mapDataStr) {
    try {
        const m = JSON.parse(mapDataStr.replace(/&quot;/g, '"'));
        console.info("[battle-manager] Selecting map:", m);

        const urlInput = $("mapImgUrl");
        const widthInput = $("mapW");
        const heightInput = $("mapH");
        const pxcInput = $("mapPixelsPerCell");

        // The correct field for the direct image is image_url
        let targetUrl = m.image_url || m.source_url || "";

        // Handle local paths that might be missing the baseurl (/codex)
        if (targetUrl.startsWith('/') && !targetUrl.startsWith('/codex')) {
            targetUrl = '/codex' + targetUrl;
        }

        if (urlInput) urlInput.value = targetUrl;

        if (widthInput) widthInput.value = m.grid_width || 40;
        if (heightInput) heightInput.value = m.grid_height || 40;
        if (pxcInput) pxcInput.value = m.cell_size_px || 30;

        // Reset transformations
        const transUrl = $("mapTransformedUrl");
        if (transUrl) transUrl.value = "";

        // Switch back to manual tab to show the URL and trigger load
        setMapTab('manual');

        // Wait a tiny bit for the tab switch to render (though not strictly necessary)
        setTimeout(() => {
            loadImage();
            drawMap();
            updateFowOutputs();
        }, 10);

    } catch (e) {
        console.error("[battle-manager] Failed to select map:", e);
        alert("Error selecting map from database.");
    }
}

/**
 * Handle location jump from row button
 */
function handleLocationJump(locStr) {
    const pos = parseXY(locStr);
    if (!pos) {
        alert("Enter location as x,y");
        return;
    }
    centerOn(pos.x, pos.y);
}

/**
 * Setup input event listeners
 */
function setupEventListeners() {
    document.addEventListener("input", (e) => {
        const id = e.target?.id || "";

        // Redraw and update outputs when relevant inputs change
        if (id.startsWith("player_") ||
            id.startsWith("mapW") ||
            id.startsWith("mapH") ||
            id.startsWith("visRange")) {
            drawMap();
            updateFowOutputs();
        }
    });
}

/**
 * Initialize the application
 */
function init() {
    // Initialize UI components
    initLists(handleLocationJump);
    initCanvasInteractions();
    setupMenuClickHandler();
    setupEventListeners();

    // Initial draw
    drawMap();
    updateFowOutputs();

    console.info("[battle-manager] Initialized (modular version)");
}

/**
 * Expose functions to window for HTML onclick handlers
 * This must happen immediately (not on load) so onclick handlers work
 */
// UI helpers
window.uiFlash = uiFlash;
window.toggleMenu = toggleMenu;
window.openTab = openTab;
window.selectAll = selectAll;
window.clearChecked = (type) => clearChecked(type, updateFowOutputs);
window.setMapTab = setMapTab;
window.searchMaps = searchMaps;
window.selectMap = selectMap;

// Canvas
window.loadImage = loadImage;
window.drawMap = drawMap;
window.resetFog = resetFog;

// Commands
window.batchCmd = batchCmd;
window.generateTokenCommands = generateTokenCommands;
window.generateNpcAddCmds = generateNpcAddCmds;
window.generateNpcTokenCmds = generateNpcTokenCmds;

// Modals
window.openTokenModal = openTokenModal;
window.openNpcModal = openNpcModal;

// Supabase
window.refreshTokensFromSupabase = refreshTokensFromSupabase;
window.saveSessionToSupabase = saveSessionToSupabase;
window.loadSessionPrompt = loadSessionPrompt;

/**
 * Handle page-wide authentication state
 * This is called by auth-header.html when the user state changes
 */
window.handlePageAuth = async (user) => {
    const mainContent = document.querySelector('.main-content');
    const authGate = document.getElementById('auth-gate');

    if (user) {
        // User is logged in - show the app
        if (mainContent) mainContent.style.display = 'flex';
        if (authGate) authGate.style.display = 'none';

        // Initial data load if we haven't already
        if (!window.battleManagerInitialized) {
            window.battleManagerInitialized = true;
            await refreshTokensFromSupabase();
        }
    } else {
        // User is logged out - show the gate
        if (mainContent) mainContent.style.display = 'none';
        if (authGate) authGate.style.display = 'flex';
        window.battleManagerInitialized = false;
    }
};

/**
 * Application bootstrap
 */
window.addEventListener("load", () => {
    init();
});
