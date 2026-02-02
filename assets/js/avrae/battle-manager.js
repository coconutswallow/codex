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
import { getResizelyUrl } from '../utils/resizely-helper.js';

import {
    openMapSetupModal,
    closeMapSetupModal,
    toggleVisionField,
    handleMapUrlChange,
    updateMapCalculations,
    generateResizedMap,
    toggleMapSearch,
    searchMapsModal,
    updateMapSummary,
    applyMapConfig
} from './map-setup.js';

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
            id === "mapW" ||
            id === "mapH" ||
            id === "visRange") {
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
    updateMapSummary();

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

// Map Setup Modal
window.openMapSetupModal = openMapSetupModal;
window.closeMapSetupModal = closeMapSetupModal;
window.toggleVisionField = toggleVisionField;
window.handleMapUrlChange = handleMapUrlChange;
window.updateMapCalculations = updateMapCalculations;
window.generateResizedMap = generateResizedMap;
window.toggleMapSearch = toggleMapSearch;
window.searchMapsModal = searchMapsModal;
window.updateMapSummary = updateMapSummary;
window.applyMapConfig = applyMapConfig;

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
            updateMapSummary(); // Initial summary update
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
