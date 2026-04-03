/**
 * /assets/js/avrae/battle-manager.js
 * Main coordinator for Avrae Battle Manager
 * 
 * This file imports and coordinates all the individual modules.
 */

import { supabase } from '../supabaseClient.js';
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

import { initLists, addRow, ensureRows } from './row-builder.js';
import { centerOn, drawMap, loadImage, initCanvasInteractions, resetFog } from './canvas-manager.js';
import { updateFowOutputs, batchCmd, generateTokenCommands, generateNpcTokenCmds, parseXY } from './command-generator.js';
import { openTokenModal, openNpcModal, openNpcTokenModal, openMonsterModal, openMonsterTokenModal } from './modal-manager.js';
import { refreshTokensFromSupabase, saveSessionToSupabase, loadSessionPrompt, searchBattlemaps } from './data-manager.js';

import {
    toggleVisionField,
    handleMapUrlChange,
    updateMapCalculations,
    updateGridFromPPC,
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
        alert("Enter location as A1 style (e.g., B12)");
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
            id === "mapPPC" ||
            id === "mapOffsetX" ||
            id === "mapOffsetY" ||
            id === "mapImgUrl" ||
            id === "visRange") {
            updateFowOutputs();
            drawMap();
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

    // Fail-safe check for admin status in case handlePageAuth was called before battle-manager.js loaded
    if (window.authManager?.user) {
        window.handlePageAuth(window.authManager.user);
    }

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

// Map Setup
window.toggleVisionField = toggleVisionField;
window.handleMapUrlChange = handleMapUrlChange;
window.updateMapCalculations = updateMapCalculations;
window.updateGridFromPPC = updateGridFromPPC;
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
window.generateNpcTokenCmds = generateNpcTokenCmds;
window.updateFowOutputs = updateFowOutputs;

// Modals
window.openTokenModal = openTokenModal;
window.openNpcModal = openNpcModal;
window.openNpcTokenModal = openNpcTokenModal;
window.openMonsterModal = openMonsterModal;
window.openMonsterTokenModal = openMonsterTokenModal;
window.openEffectModal = (type, index) => {
    import('./modal-manager.js').then(m => m.openEffectModal(type, index));
};
window.saveEffect = () => {
    import('./modal-manager.js').then(m => m.saveEffect());
};
window.closeModal = (id) => {
    import('./modal-manager.js').then(m => m.closeModal(id));
};

// Supabase
window.refreshTokensFromSupabase = refreshTokensFromSupabase;
window.saveSessionToSupabase = saveSessionToSupabase;
window.loadSessionPrompt = loadSessionPrompt;

// Row Actions
window.addRow = (type) => addRow(type, handleLocationJump);
window.ensureRows = (type, count) => ensureRows(type, count, handleLocationJump);

/**
 * Handle page-wide authentication state
 * This is called by auth-header.html when the user state changes
 */
window.handlePageAuth = async (user) => {
    const mainContent = document.querySelector('.main-content');
    const authGate = document.getElementById('auth-gate');
    const adminBtn = document.getElementById('admin-monster-mgr');

    if (user) {
        console.log(`[battle-manager] User authenticated: ${user.id}`);
        // User is logged in - show the app
        if (mainContent) mainContent.style.display = 'flex';
        if (authGate) authGate.style.display = 'none';

        // Check for admin status to show extra menu items
        try {
            const { data, error } = await supabase
                .from('discord_users')
                .select('roles')
                .eq('user_id', user.id)
                .single();

            if (error) {
                console.warn(`[battle-manager] Admin check error:`, error);
            } else {
                const isAdmin = data?.roles && Array.isArray(data.roles) && data.roles.includes('Admin');
                console.log(`[battle-manager] Admin status (Admin role):`, isAdmin);
                if (isAdmin && adminBtn) {
                    console.log(`[battle-manager] Showing admin menu button`);
                    adminBtn.style.display = 'block';
                }
            }
        } catch (e) {
            console.error(`[battle-manager] Admin check failed:`, e);
        }

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
        if (adminBtn) adminBtn.style.display = 'none';
        window.battleManagerInitialized = false;
    }
};

/**
 * Application bootstrap
 */
window.addEventListener("load", () => {
    init();
});
