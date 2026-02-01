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
    img.crossOrigin = "anonymous";

    img.onload = () => {
        state.setMapImage(img);
        drawMap();
    };

    img.onerror = () => {
        state.setMapImage(null);
        drawMap();
        alert("Could not load map image (check URL / CORS).");
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

    // Black background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw map image if loaded
    const img = state.getMapImage();
    if (img) {
        ctx.globalAlpha = 1.0;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    // Fog overlay
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clear revealed tiles
    ctx.globalAlpha = 1.0;
    const revealed = state.getRevealedTiles();
    revealed.forEach((key) => {
        const [x, y] = key.split(",").map((n) => parseInt(n, 10));
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        ctx.clearRect(x * cell, y * cell, cell, cell);
    });

    // Grid lines
    ctx.globalAlpha = 0.18;
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

    // Draw player markers
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