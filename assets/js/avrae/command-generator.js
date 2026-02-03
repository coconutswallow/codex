/**
 * /assets/js/avrae/command-generator.js
 * Generate Avrae commands for various operations
 */

import { $ } from './ui-helpers.js';
import { state } from './state-manager.js';


/**
 * Helper: Convert column letter to number (A=1)
 */
function colToNum(col) {
    let n = 0;
    for (let i = 0; i < col.length; i++) {
        n = n * 26 + (col.toUpperCase().charCodeAt(i) - 64);
    }
    return n;
}

/**
 * Helper: Convert number to column letter (1=A)
 */
function numToCol(n) {
    let c = '';
    while (n > 0) {
        let m = (n - 1) % 26;
        c = String.fromCharCode(65 + m) + c;
        n = Math.floor((n - m) / 26);
    }
    return c;
}

/**
 * Helper: Convert 0-based x,y to A1 style
 */
function toA1(x, y) {
    return `${numToCol(x + 1)}${y + 1}`;
}

/**
 * Show output in console (for commands)
 */
function showInConsole(text) {
    console.log("=== COMMAND OUTPUT ===");
    console.log(text);
    console.log("======================");
    alert("Commands logged to console (F12)");
}

/**
 * Parse location string (A1 style)
 */
export function parseXY(str) {
    if (!str) return null;
    str = str.trim().toUpperCase();

    // Only support A1 style (Excel style)
    const match = str.match(/^([A-Z]+)(\d+)$/);
    if (match) {
        let x = colToNum(match[1]) - 1;
        let y = parseInt(match[2], 10) - 1;
        return { x, y };
    }

    return null;
}

/**
 * Update FOW and View outputs for players
 */
export function updateFowOutputs() {
    const mapW = parseInt($("mapW")?.value || "40", 10);
    const mapH = parseInt($("mapH")?.value || "40", 10);
    const globalVis = parseInt($("visRange")?.value || "6", 10);

    const revealed = state.getRevealedTiles();
    const currentTurnTiles = new Set();
    const newReveal = [];

    const playerRows = document.querySelectorAll(".player-row").length;

    for (let i = 1; i <= playerRows; i++) {
        const nameEl = $(`player_name_${i}`);
        const locEl = $(`player_loc_${i}`);

        if (!nameEl || !locEl) continue;

        const name = nameEl.value.trim();
        const locStr = locEl.value.trim();
        if (!name || !locStr) continue;

        const pos = parseXY(locStr);
        if (!pos) continue;

        const vis = globalVis;
        const tiles = computeVisibleTiles(pos.x, pos.y, vis, mapW, mapH);

        tiles.forEach((t) => {
            const key = `${t.x},${t.y}`;
            currentTurnTiles.add(key);
            if (!revealed.has(key)) {
                newReveal.push(key);
            }
        });
    }

    state.setCurrentTurnTiles(currentTurnTiles);

    // Build FOW command
    const fow = $("fow-out");
    if (fow) {
        if (newReveal.length > 0) {
            const tileSet = new Set(newReveal);
            const rects = optimize2D(tileSet);
            const fowCmd = `!map -fow ${rects.map(r => `${toA1(r.x1, r.y1)}:${toA1(r.x2, r.y2)}`).join(',')}`;

            fow.innerText = fowCmd;
            fow.onclick = () => {
                import('./ui-helpers.js').then(({ uiFlash }) => uiFlash(fow, true));
                navigator.clipboard.writeText(fow.innerText);
                // Permanently reveal these tiles in state
                newReveal.forEach(key => {
                    const [x, y] = key.split(',').map(Number);
                    state.addRevealedTile(x, y);
                });
                // Redraw map to show permanent reveal
                import('./canvas-manager.js').then(({ drawMap }) => drawMap());
                updateFowOutputs(); // Refresh outputs
            };
        } else {
            fow.innerText = "!map -fow ... (no new tiles)";
            fow.onclick = null;
        }
    }

    const view = $("view-out");
    if (view) {
        const playerCoords = [];
        const playerRows = document.querySelectorAll(".player-row").length;
        for (let i = 1; i <= playerRows; i++) {
            const name = $(`player_name_${i}`)?.value?.trim();
            const locStr = $(`player_loc_${i}`)?.value?.trim();
            if (name && locStr) {
                const pos = parseXY(locStr);
                if (pos) playerCoords.push(pos);
            }
        }

        if (playerCoords.length > 0) {
            // Replicate prototype !view logic: calculate visible bounds
            let minX = Math.max(0, Math.min(...playerCoords.map(p => p.x)) - globalVis);
            let maxX = Math.min(mapW - 1, Math.max(...playerCoords.map(p => p.x)) + globalVis);
            let minY = Math.max(0, Math.min(...playerCoords.map(p => p.y)) - globalVis);
            let maxY = Math.min(mapH - 1, Math.max(...playerCoords.map(p => p.y)) + globalVis);

            view.innerText = `!map -view ${toA1(minX, minY)}:${toA1(maxX, maxY)}`;
            view.onclick = () => {
                import('./ui-helpers.js').then(({ uiFlash }) => uiFlash(view, true));
                navigator.clipboard.writeText(view.innerText);
            };
        } else {
            view.innerText = "!map -view ...";
            view.onclick = null;
        }
    }

    // Build Map Setup Command
    const mapSetup = $("setup-cmd-out");
    if (mapSetup) {
        mapSetup.innerText = generateMapSetupCmd();
    }
}

/**
 * Generate the master map setup command
 */
export function generateMapSetupCmd() {
    const url = $("mapImgUrl")?.value?.trim() || "URL_HERE";
    const w = $("mapW")?.value || "20";
    const h = $("mapH")?.value || "20";
    const ppc = $("mapPPC")?.value || "30";

    return `!multiline
!i begin
!i add 50 DM -p

!map -bg "${url}" -mapsize ${w}x${h} -options dc${ppc} -t DM`;
}

/**
 * Optimize a set of tiles into rectangles (from prototype)
 */
function optimize2D(tileSet) {
    let spans = [], sorted = Array.from(tileSet).map(t => {
        const [x, y] = t.split(',').map(Number);
        return { x, y };
    }).sort((a, b) => a.y - b.y || a.x - b.x);

    let cur = null;
    for (let t of sorted) {
        if (cur && t.y === cur.y && t.x === cur.x2 + 1) cur.x2 = t.x;
        else {
            if (cur) spans.push(cur);
            cur = { x1: t.x, x2: t.x, y: t.y };
        }
    }
    if (cur) spans.push(cur);

    let rects = [];
    while (spans.length > 0) {
        let s = spans.shift();
        let y2 = s.y;
        for (let i = 0; i < spans.length; i++) {
            if (spans[i].y === y2 + 1 && spans[i].x1 === s.x1 && spans[i].x2 === s.x2) {
                y2 = spans[i].y;
                spans.splice(i, 1);
                i--;
            }
        }
        rects.push({ x1: s.x1, y1: s.y, x2: s.x2, y2: y2 });
    }
    return rects;
}

/**
 * Compute visible tiles from a position (Square area per prototype)
 */
function computeVisibleTiles(cx, cy, radius, mapW, mapH) {
    const tiles = [];
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            // Square logic (no dx*dx + dy*dy > radius*radius check)
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
            tiles.push({ x, y });
        }
    }
    return tiles;
}

/**
 * Generate token setup commands for players
 */
export function generateTokenCommands() {
    const rows = Array.from(document.querySelectorAll("#tokenTableBody tr"));
    if (!rows.length) return;

    const lines = [];
    for (const tr of rows) {
        const full = tr.querySelector(".bm_modal_full")?.value?.trim();
        const loc = tr.querySelector(".bm_modal_loc")?.value?.trim();
        const size = tr.querySelector(".bm_modal_size")?.value?.trim() || "M";
        const tok = tr.querySelector(".bm_modal_token")?.value?.trim();

        if (!full || !tok) {
            lines.push(`# Missing full name/token for one row`);
            continue;
        }

        const locPart = loc ? ` -loc ${loc}` : "";
        lines.push(`!map -token add "${full}" "${tok}" -size ${size}${locPart}`);
    }

    $("tokenModal").style.display = "none";
    showInConsole(lines.join("\n"));
}

/**
 * Generate NPC add commands
 */
export function generateNpcAddCmds() {
    const npcs = readNpcModalRows();
    if (!npcs.length) return alert("No NPCs to add.");

    const lines = [];
    for (const n of npcs) {
        const locPart = n.loc ? ` -p ${n.loc}` : "";
        lines.push(`!i add 0 "${n.name}" -p ${n.ac} -hp ${n.hp} -name "${n.short}"${locPart}`);
    }

    $("npcModal").style.display = "none";
    showInConsole(lines.join("\n"));
}

/**
 * Generate NPC token setup commands
 */
export function generateNpcTokenCmds() {
    const npcs = readNpcModalRows();
    if (!npcs.length) return alert("No NPCs to set up.");

    const lines = [];
    for (const n of npcs) {
        const locPart = n.loc ? ` -loc ${n.loc}` : "";
        lines.push(`!map -token add "${n.short}" "" -size M${locPart}`);
    }

    $("npcModal").style.display = "none";
    showInConsole(lines.join("\n"));
}

/**
 * Read NPC modal rows
 */
function readNpcModalRows() {
    const rows = Array.from(document.querySelectorAll("#npcTableBody tr"));
    const out = [];

    for (const tr of rows) {
        const short = tr.querySelector(".bm_npc_short")?.value?.trim();
        const name = tr.querySelector(".bm_npc_name")?.value?.trim();
        const ac = tr.querySelector(".bm_npc_ac")?.value?.trim();
        const hp = tr.querySelector(".bm_npc_hp")?.value?.trim();
        const loc = tr.querySelector(".bm_npc_loc")?.value?.trim();

        if (!short || !name) continue;
        out.push({ short, name, ac, hp, loc });
    }

    return out;
}

/**
 * Batch command generation for monsters
 */
export function batchCmd(type, action) {
    const sel = Array.from(document.querySelectorAll(`input[id^="${type}_sel_"]:checked`));
    if (!sel.length) return alert("Nothing selected.");

    const lines = [];

    for (const chk of sel) {
        const idx = chk.id.split("_").pop();
        const name = $(`${type}_name_${idx}`)?.value?.trim();
        const qty = parseInt($(`${type}_full_${idx}`)?.value || "1", 10);
        const loc = $(`${type}_loc_${idx}`)?.value?.trim();
        const ac = $(`${type}_extra_${idx}`)?.value?.trim();

        if (!name) continue;

        const tokenInfo = state.getTokenInfo(name);
        if (!tokenInfo && action === "setup-token") {
            lines.push(`# No token for ${name}`);
            continue;
        }

        const locPart = loc ? ` -p ${loc}` : "";

        if (action === "setup-monster") {
            // !i madd
            const args = [];
            if (qty > 1) args.push(`-n ${qty}`);
            if (ac) args.push(`-ac ${ac}`);
            if (loc) args.push(`-p ${loc}`);
            lines.push(`!i madd "${name}" ${args.join(" ")}`);
        } else if (action === "setup-token") {
            // !map -token
            const size = tokenInfo.size || "M";
            const token = tokenInfo.token || "";
            const display = tokenInfo.display || name;

            for (let i = 1; i <= qty; i++) {
                const suffix = qty > 1 ? `${i}` : "";
                const finalName = `${display}${suffix}`;
                const finalLoc = loc ? ` -loc ${loc}` : "";
                lines.push(`!map -token add "${finalName}" "${token}" -size ${size}${finalLoc}`);
            }
        }
    }

    if (lines.length) showInConsole(lines.join("\n"));
}