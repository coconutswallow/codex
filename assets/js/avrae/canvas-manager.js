/**
 * /assets/js/avrae/canvas-manager.js
 * Canvas (map) rendering and map interaction
 */

import { $ } from './ui-helpers.js';
import { state } from './state-manager.js';

const MIN_CELL_SIZE = 22; // Minimum cell size in pixels
const GUTTER_W = 20;      // Width of the vertical coordinate gutter
const GUTTER_H = 16;      // Height of the horizontal coordinate gutter

/**
 * Get grid dimensions from UI
 */
function gridDims() {
    const w = parseInt($("mapW")?.value || "40", 10);
    const h = parseInt($("mapH")?.value || "40", 10);
    return { w: Math.max(1, w), h: Math.max(1, h) };
}

/**
 * Get current cell size based on container width
 */
function getCurrentCellSize() {
    const canvas = $("mapCanvas");
    const container = canvas?.parentElement;
    if (!canvas || !container || container.clientWidth === 0) return MIN_CELL_SIZE;

    const { w } = gridDims();
    const padding = 20 + GUTTER_W;
    const availableWidth = container.clientWidth - padding;

    const scaleToFit = availableWidth / w;
    return Math.max(MIN_CELL_SIZE, scaleToFit);
}

/**
 * Get default visibility range from UI
 */
function visDefault() {
    const v = parseInt($("visRange")?.value || "6", 10);
    return Math.max(0, v);
}

/**
 * Reset fog of war
 */
export function resetFog() {
    state.clearRevealed();
    // Update outputs via battle-manager to avoid circular dependency
    if (window.updateFowOutputs) window.updateFowOutputs();
    drawMap();

    const fs = $("fileStatus");
    if (fs) fs.innerText = "Session: Fog Reset";
}

/**
 * Center map view on a specific tile
 */
export function centerOn(x, y) {
    const canvas = $("mapCanvas");
    const area = canvas?.parentElement;
    if (!canvas || !area) return;

    const cell = getCurrentCellSize();
    const px = x * cell + GUTTER_W;
    const py = y * cell + GUTTER_H;

    area.scrollLeft = Math.max(0, px - area.clientWidth / 2);
    area.scrollTop = Math.max(0, py - area.clientHeight / 2);
}

/**
 * Load map image from URL
 */
export function loadImage() {
    const url = ($("mapImgUrl")?.value || "").trim();

    if (!url) {
        state.setMapImage(null);
        drawMap();
        return;
    }

    const img = new Image();
    if (url.startsWith('http')) {
        img.crossOrigin = "anonymous";
    }

    img.onload = () => {
        state.setMapImage(img);
        drawMap();
    };

    img.onerror = () => {
        if (!img.src.includes("wsrv.nl") && url.startsWith("http")) {
            img.src = `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
            return;
        }
        state.setMapImage(null);
        drawMap();
        console.error("[canvas-manager] Failed to load image:", url);
    };

    img.src = url;
}

/**
 * Draw the map canvas
 */
export function drawMap() {
    try {
        const canvas = $("mapCanvas");
        if (!canvas) {
            console.error("[canvas-manager] Canvas element not found");
            return;
        }

        const ctx = canvas.getContext("2d");
        const { w, h } = gridDims();
        const cell = getCurrentCellSize();

        // Set canvas size (Grid + Gutters)
        canvas.width = w * cell + GUTTER_W;
        canvas.height = h * cell + GUTTER_H;

        // 1. Black background
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Draw map image if loaded
        const img = state.getMapImage();
        const offX = parseInt($("mapOffsetX")?.value || "0", 10);
        const offY = parseInt($("mapOffsetY")?.value || "0", 10);
        const userPPC = parseFloat($("mapPPC")?.value || "30", 10);

        if (img) {
            ctx.globalAlpha = 1.0;
            const scale = cell / userPPC;
            const dWidth = img.naturalWidth * scale;
            const dHeight = img.naturalHeight * scale;
            ctx.drawImage(img, offX + GUTTER_W, offY + GUTTER_H, dWidth, dHeight);
        }

        // 3. Grid lines (draw before FOW so FOW can cover them)
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;

        for (let x = 0; x <= w; x++) {
            ctx.beginPath();
            ctx.moveTo(x * cell + GUTTER_W + 0.5, GUTTER_H);
            ctx.lineTo(x * cell + GUTTER_W + 0.5, h * cell + GUTTER_H);
            ctx.stroke();
        }
        for (let y = 0; y <= h; y++) {
            ctx.beginPath();
            ctx.moveTo(GUTTER_W, y * cell + GUTTER_H + 0.5);
            ctx.lineTo(w * cell + GUTTER_W, y * cell + GUTTER_H + 0.5);
            ctx.stroke();
        }

        // 4. Draw Fog of War (after grid, before labels)
        const isFowEnabled = $("mapFow")?.checked;
        if (isFowEnabled) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.globalAlpha = 1.0;

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (!state.isRevealed(x, y) && !state.isCurrentlyVisible(x, y)) {
                        ctx.fillRect(x * cell + GUTTER_W, y * cell + GUTTER_H, cell, cell);
                    }
                }
            }
        }

        // 5. Draw labels (after FOW so they're always visible)
        ctx.globalAlpha = 1.0;
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, GUTTER_H);
        ctx.fillRect(0, 0, GUTTER_W, canvas.height);

        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let x = 0; x < w; x++) {
            const label = getExcelColName(x);
            ctx.fillText(label, x * cell + GUTTER_W + (cell / 2), GUTTER_H / 2);
        }
        for (let y = 0; y < h; y++) {
            const label = (y + 1).toString();
            ctx.fillText(label, GUTTER_W / 2, y * cell + GUTTER_H + (cell / 2));
        }

        // 6. Draw Effects (below tokens)
        drawEffects(ctx, cell);

        // 7. Draw combatant markers (always on top)
        drawCombatantMarkers(ctx, cell);
        ctx.globalAlpha = 1.0;
    } catch (error) {
        console.error("[canvas-manager] Error in drawMap:", error);
    }
}

/**
 * Draw all active effects on the map
 */
function drawEffects(ctx, cell) {
    const effects = state.getAllEffects();
    ctx.save();
    ctx.globalAlpha = 0.3;

    const colorMap = {
        'r': '#f00', 'b': '#00f', 'g': '#0f0', 'y': '#ff0',
        'white': '#fff', 'black': '#000', 'p': '#800080', 'o': '#ffa500'
    };

    for (const rowId in effects) {
        const ef = effects[rowId];
        const color = colorMap[ef.color] || ef.color;

        // Auras move with the token, others stay where they were cast
        let originStr = ef.origin;
        if (ef.type === 'aura') {
            const parts = rowId.split('_');
            const currentLoc = $(`${parts[0]}_loc_${parts[1]}`)?.value?.trim();
            if (currentLoc) originStr = currentLoc;
        }

        const origin = parseXY(originStr);
        if (!origin) continue;

        const ox = (origin.x + 0.5) * cell + GUTTER_W;
        const oy = (origin.y + 0.5) * cell + GUTTER_H;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        switch (ef.type) {
            case "circle":
            case "aura":
                const radius = (ef.size / 5) * cell;
                ctx.beginPath();
                ctx.arc(ox, oy, radius, 0, Math.PI * 2);
                ctx.fill();
                break;
            case "circletop":
                const rt = (ef.size / 5) * cell;
                const otx = origin.x * cell + GUTTER_W;
                const oty = origin.y * cell + GUTTER_H;
                ctx.beginPath();
                ctx.arc(otx, oty, rt, 0, Math.PI * 2);
                ctx.fill();
                break;
            case "square":
                const s = (ef.size / 5) * cell;
                ctx.fillRect(ox - s / 2, oy - s / 2, s, s);
                break;
            case "cone":
            case "line":
            case "arrow":
                const target = parseXY(ef.target);
                if (!target) break;
                const tx = (target.x + 0.5) * cell + GUTTER_W;
                const ty = (target.y + 0.5) * cell + GUTTER_H;

                if (ef.type === "line" || ef.type === "arrow") {
                    ctx.beginPath();
                    ctx.moveTo(ox, oy);
                    ctx.lineTo(tx, ty);
                    ctx.stroke();
                    if (ef.type === "line") {
                        const lw = (ef.width / 5) * cell;
                        ctx.lineWidth = lw;
                        ctx.stroke();
                    }
                } else if (ef.type === "cone") {
                    const angle = Math.atan2(ty - oy, tx - ox);
                    const length = (ef.size / 5) * cell;
                    ctx.beginPath();
                    ctx.moveTo(ox, oy);
                    ctx.arc(ox, oy, length, angle - Math.PI / 6, angle + Math.PI / 6);
                    ctx.closePath();
                    ctx.fill();
                }
                break;
        }
    }
    ctx.restore();
}

/**
 * Draw markers for all combatants
 */
function drawCombatantMarkers(ctx, cell) {
    const list = getCombatantEntities();
    if (list.length === 0) return;

    ctx.save();

    for (const c of list) {
        const cx = (c.loc.x + 0.5) * cell + GUTTER_W;
        const cy = (c.loc.y + 0.5) * cell + GUTTER_H;

        // Color based on type
        let color = "#5865f2"; // Player (Blurple)
        if (c.type === "npc") color = "#fee75c"; // NPC (Yellow)
        if (c.type === "monster") color = "#ed4245"; // Monster (Red)

        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;

        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(6, cell * 0.4), 0, Math.PI * 2);
        ctx.fill();

        if (c.name) {
            ctx.fillStyle = "#000"; // Contrast text for NPC (Yellow)
            if (c.type !== "npc") ctx.fillStyle = "#fff";

            ctx.font = `bold ${Math.max(9, cell * 0.4)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(c.name, cx, cy);
        }
    }
    ctx.restore();
}

/**
 * Get all entities (Players, NPCs, Monsters) from the UI
 */
function getCombatantEntities() {
    const list = [];
    // Select all combatant rows
    const rows = document.querySelectorAll('.grid-row');

    rows.forEach(row => {
        const type = row.classList.contains('player-row') ? 'player' :
            (row.classList.contains('npc-row') ? 'npc' : 'monster');

        // Find the index from input IDs like player_name_1
        const nameInput = row.querySelector(`input[id^="${type}_name_"]`);
        if (!nameInput) return;

        const parts = nameInput.id.split('_');
        const idx = parts[parts.length - 1];

        const name = nameInput.value?.trim();
        const locStr = $(`${type}_loc_${idx}`)?.value?.trim();

        if (!name || !locStr) return;

        const loc = parseXY(locStr);
        if (loc) {
            list.push({ name, loc, type });
        }
    });

    return list;
}

/**
 * Parse location string (ONLY Excel style A1, B10, etc.)
 */
function parseXY(str) {
    if (!str) return null;
    str = str.trim().toUpperCase();

    // Only support A1 style (Excel style)
    const match = str.match(/^([A-Z]+)(\d+)$/);
    if (match) {
        let alpha = match[1];
        let y = parseInt(match[2], 10) - 1;
        let x = 0;
        for (let i = 0; i < alpha.length; i++) {
            x = x * 26 + (alpha.charCodeAt(i) - 64);
        }
        return { x: x - 1, y };
    }

    return null;
}

/**
 * Initialize interactions
 */
export function initCanvasInteractions() {
    window.addEventListener('resize', () => drawMap());
}

/**
 * Helper to get Excel labels
 */
function getExcelColName(n) {
    let name = "";
    while (n >= 0) {
        name = String.fromCharCode((n % 26) + 65) + name;
        n = Math.floor(n / 26) - 1;
    }
    return name;
}