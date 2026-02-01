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
    setupMenuClickHandler
} from './ui-helpers.js';

import { initLists } from './row-builder.js';
import { centerOn, drawMap, loadImage, initCanvasInteractions, resetFog } from './canvas-manager.js';
import { updateFowOutputs, batchCmd, generateTokenCommands, generateNpcAddCmds, generateNpcTokenCmds, parseXY } from './command-generator.js';
import { openTokenModal, openNpcModal } from './modal-manager.js';
import { refreshTokensFromSupabase, saveSessionToSupabase, loadSessionPrompt } from './supabase-service.js';

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
 * Application bootstrap
 */
window.addEventListener("load", async () => {
    init();
    await refreshTokensFromSupabase();
});