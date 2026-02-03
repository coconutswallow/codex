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
        console.log("[canvas-manager] FOW enabled:", isFowEnabled);

        if (isFowEnabled) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.globalAlpha = 1.0;

            let darkTileCount = 0;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (!state.isRevealed(x, y) && !state.isCurrentlyVisible(x, y)) {
                        ctx.fillRect(x * cell + GUTTER_W, y * cell + GUTTER_H, cell, cell);
                        darkTileCount++;
                    }
                }
            }
            console.log("[canvas-manager] Drew", darkTileCount, "dark tiles out of", w * h, "total");
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

        // 6. Draw player markers (always on top)
        drawPlayerMarkers(ctx, cell);
        ctx.globalAlpha = 1.0;
    } catch (error) {
        console.error("[canvas-manager] Error in drawMap:", error);
    }
}

/**
 * Draw player markers
 */
function drawPlayerMarkers(ctx, cell) {
    const players = getPlayerEntities();
    if (players.length === 0) return;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#5865f2";

    for (const p of players) {
        const cx = (p.loc.x + 0.5) * cell + GUTTER_W;
        const cy = (p.loc.y + 0.5) * cell + GUTTER_H;

        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(6, cell * 0.4), 0, Math.PI * 2);
        ctx.fill();

        if (p.name) {
            ctx.fillStyle = "#fff";
            ctx.font = `bold ${Math.max(9, cell * 0.4)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(p.name, cx, cy);
            ctx.fillStyle = "#5865f2";
        }
    }
    ctx.restore();
}

/**
 * Get player entities
 */
function getPlayerEntities() {
    const players = [];
    const playerRows = document.querySelectorAll(".player-row").length;

    for (let i = 1; i <= playerRows; i++) {
        const nameEl = $(`player_name_${i}`);
        const locEl = $(`player_loc_${i}`);
        const name = nameEl?.value?.trim();
        const locStr = locEl?.value?.trim();

        if (!name || !locStr) continue;

        const loc = parseXY(locStr);
        if (loc) {
            players.push({ name, loc });
        }
    }
    return players;
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