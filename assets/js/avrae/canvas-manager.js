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

const CELL_SIZE = 22; // Base cell size in pixels

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

    const px = x * CELL_SIZE;
    const py = y * CELL_SIZE;

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
    const cell = CELL_SIZE;

    // Set canvas size
    canvas.width = w * cell;
    canvas.height = h * cell;

    // 1. Black background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw map image if loaded
    const img = state.getMapImage();
    const offX = parseInt($("mapOffsetX")?.value || "0", 10);
    const offY = parseInt($("mapOffsetY")?.value || "0", 10);

    if (img) {
        ctx.globalAlpha = 1.0;
        ctx.drawImage(img, offX, offY, canvas.width, canvas.height);
        console.info("[canvas-manager] Map image drawn with offset:", offX, offY, "Size:", canvas.width, "x", canvas.height);
    } else {
        console.warn("[canvas-manager] No map image found in state during drawMap.");
    }

    // 3. Draw Fog of War (tile by tile)
    // Instead of one big block + clearRect (which clears the image),
    // we draw fog everywhere that ISN'T revealed.
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)"; // 80% black for unrevealed areas
    ctx.globalAlpha = 1.0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!state.isRevealed(x, y)) {
                ctx.fillRect(x * cell, y * cell, cell, cell);
            }
        }
    }

    // 4. Grid lines
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;

    for (let x = 0; x <= w; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cell + 0.5, 0);
        ctx.lineTo(x * cell + 0.5, h * cell);
        ctx.stroke();
    }

    for (let y = 0; y <= h; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cell + 0.5);
        ctx.lineTo(w * cell, y * cell + 0.5);
        ctx.stroke();
    }

    // 5. Draw labels (A-Z, 1-N)
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#fff";
    ctx.font = "10px sans-serif";
    for (let x = 0; x < w; x++) {
        ctx.fillText(String.fromCharCode(65 + (x % 26)), x * cell + 2, 10);
    }
    for (let y = 0; y < h; y++) {
        ctx.fillText(y + 1, 2, y * cell + 10);
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
            (p.loc.x + 0.5) * cell,
            (p.loc.y + 0.5) * cell,
            Math.max(4, cell * 0.18),
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Draw visibility circle (faint)
        ctx.globalAlpha = 0.10;
        ctx.beginPath();
        ctx.arc(
            (p.loc.x + 0.5) * cell,
            (p.loc.y + 0.5) * cell,
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
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
        const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);

        // Reveal tiles around click
        const radius = visDefault();
        revealCircle(x, y, radius);

        drawMap();
        updateFowOutputs();
    });
}