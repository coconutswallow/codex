/**
 * /assets/js/avrae/canvas-manager.js
 * Canvas rendering and map interaction
 * Map loading and rendering
 * Click handlers
 * Fog of war visualization
 */

import { $ } from './ui-helpers.js';
import { state } from './state-manager.js';
import { updateFowOutputs } from './command-generator.js';

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
 * Get default visibility range from UI
 */
/**
 * Get current cell size based on container width
 */
function getCurrentCellSize() {
    const canvas = $("mapCanvas");
    const container = canvas?.parentElement;
    if (!canvas || !container || container.clientWidth === 0) return MIN_CELL_SIZE;

    const { w } = gridDims();
    const padding = 20 + GUTTER_W; // 10px each side in CSS + Gutters
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
 * Reveal a circle of tiles
 */
function revealCircle(cx, cy, radius) {
    const { w, h } = gridDims();
    const rr = radius * radius;

    for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
            if (x < 0 || y < 0 || x >= w || y >= h) continue;

            const dx = x - cx;
            const dy = y - cy;

            if (dx * dx + dy * dy <= rr) {
                state.addRevealedTile(x, y);
            }
        }
    }
}

/**
 * Reset fog of war
 */
export function resetFog() {
    state.clearRevealed();
    drawMap();
    updateFowOutputs();

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

    // Use anonymous crossOrigin for external http(s) URLs
    // This is required for drawing to a canvas if the host allows it.
    if (url.startsWith('http')) {
        img.crossOrigin = "anonymous";
    }

    console.info("[canvas-manager] Attempting to load image:", url);

    img.onload = () => {
        console.info("[canvas-manager] Image loaded successfully:", url);
        state.setMapImage(img);
        drawMap();
    };

    img.onerror = () => {
        // If it failed and we haven't tried the proxy yet, retry with wsrv.nl proxy
        // This solves CORS issues for hosts like iili.io or discord.
        if (!img.src.includes("wsrv.nl") && url.startsWith("http")) {
            console.warn("[canvas-manager] CORS/Load failure, retrying with proxy:", url);
            img.src = `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
            return;
        }

        state.setMapImage(null);
        drawMap();
        console.error("[canvas-manager] Failed to load image after proxy attempt:", url);
        alert(`Could not load map image.\n\nURL: ${url}\n\nThis may be a CORS issue or the image no longer exists.`);
    };

    img.src = url;
}


/**
 * Draw the map canvas
 */
export function drawMap() {
    const canvas = $("mapCanvas");
    if (!canvas) return;

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

        // Calculate drawing size so that 'userPPC' pixels in source = 'cell' pixels on canvas
        const scale = cell / userPPC;
        const dWidth = img.naturalWidth * scale;
        const dHeight = img.naturalHeight * scale;

        ctx.drawImage(img, offX + GUTTER_W, offY + GUTTER_H, dWidth, dHeight);
        console.info("[canvas-manager] Map image drawn at scale:", scale, "Size:", dWidth, "x", dHeight);
    } else {
        console.warn("[canvas-manager] No map image found in state during drawMap.");
    }

    // 3. Draw Fog of War (tile by tile)
    const isFowEnabled = $("mapFow")?.checked;
    if (isFowEnabled) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)"; // 80% black for unrevealed areas
        ctx.globalAlpha = 1.0;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!state.isRevealed(x, y)) {
                    ctx.fillRect(x * cell + GUTTER_W, y * cell + GUTTER_H, cell, cell);
                }
            }
        }
    }

    // 4. Grid lines
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

    // 5. Draw labels (A-Z, 1-N)
    ctx.globalAlpha = 1.0;
    ctx.font = "bold 10px sans-serif";

    // Draw horizontal axis background (top row)
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, GUTTER_H);

    // Draw horizontal labels
    ctx.fillStyle = "#fff";
    for (let x = 0; x < w; x++) {
        const label = getExcelColName(x);
        const textWidth = ctx.measureText(label).width;
        ctx.fillText(label, x * cell + GUTTER_W + (cell / 2) - (textWidth / 2), GUTTER_H - 4);
    }

    // Draw vertical axis background (left column)
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, GUTTER_W, canvas.height);

    // Draw vertical labels
    ctx.fillStyle = "#fff";
    for (let y = 0; y < h; y++) {
        const label = (y + 1).toString();
        const textWidth = ctx.measureText(label).width;
        ctx.fillText(label, (GUTTER_W / 2) - (textWidth / 2), y * cell + GUTTER_H + (cell / 2) + 4);
    }

    // 6. Draw player markers
    drawPlayerMarkers(ctx, cell);

    ctx.globalAlpha = 1.0;
}

/**
 * Draw player position markers and visibility circles
 */
function drawPlayerMarkers(ctx, cell) {
    const players = getPlayerEntities();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#5865f2";

    for (const p of players) {
        if (!p.loc) continue;

        const vis = Math.max(0, parseInt(p.vis || visDefault(), 10)) || visDefault();

        // Draw position marker
        ctx.beginPath();
        ctx.arc(
            (p.loc.x + 0.5) * cell + GUTTER_W,
            (p.loc.y + 0.5) * cell + GUTTER_H,
            Math.max(4, cell * 0.18),
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Draw visibility circle (faint)
        ctx.globalAlpha = 0.10;
        ctx.beginPath();
        ctx.arc(
            (p.loc.x + 0.5) * cell + GUTTER_W,
            (p.loc.y + 0.5) * cell + GUTTER_H,
            vis * cell,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.globalAlpha = 0.9;
    }
}

/**
 * Get player entities with locations
 */
function getPlayerEntities() {
    const players = [];

    document.querySelectorAll('input[id^="player_sel_"]').forEach((chk) => {
        if (!chk.checked) return;

        const idx = chk.id.split("_").pop();
        const nameEl = $(`player_name_${idx}`);
        const locEl = $(`player_loc_${idx}`);
        const visEl = $(`player_extra_${idx}`);

        const name = nameEl?.value?.trim();
        const locStr = locEl?.value?.trim();
        const vis = visEl?.value?.trim();

        if (!name || !locStr) return;

        const loc = parseXY(locStr);
        if (loc) {
            players.push({ name, loc, vis });
        }
    });

    return players;
}

/**
 * Parse x,y location string
 */
function parseXY(str) {
    if (!str) return null;
    const parts = str.split(",").map((s) => s.trim());
    if (parts.length !== 2) return null;

    const x = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);

    if (isNaN(x) || isNaN(y)) return null;
    return { x, y };
}

/**
 * Initialize canvas click interactions
 */
export function initCanvasInteractions() {
    const canvas = $("mapCanvas");
    if (!canvas) return;

    canvas.addEventListener("click", (e) => {
        // Interaction logic (if any) can be added here
        // Currently, FOW revealing on click is disabled per user request
    });

    // Handle resizing to keep "fill width" behavior
    window.addEventListener('resize', () => {
        drawMap();
    });
}

/**
 * Helper to get Excel-style column name (A, B, C... Z, AA, AB...)
 */
function getExcelColName(n) {
    let name = "";
    while (n >= 0) {
        name = String.fromCharCode((n % 26) + 65) + name;
        n = Math.floor(n / 26) - 1;
    }
    return name;
}