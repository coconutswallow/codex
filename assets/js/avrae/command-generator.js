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

    // Build Map Setup Commands
    const initSetup = $("init-setup-out");
    const mapSetup = $("map-setup-out");

    if (initSetup && mapSetup) {
        const url = $("mapImgUrl")?.value?.trim() || "URL_HERE";
        const w = $("mapW")?.value || "20";
        const h = $("mapH")?.value || "20";
        const ppc = $("mapPPC")?.value || "30";

        initSetup.innerText = `!multiline\n!i begin\n!i add 50 DM -p`;
        mapSetup.innerText = `!map -bg "${url}" -mapsize ${w}x${h} -options dc${ppc} -t DM`;
    }
}

/**
 * Generate the master map setup command (Legacy/Internal helper)
 */
export function generateMapSetupCmd() {
    const url = $("mapImgUrl")?.value?.trim() || "URL_HERE";
    const w = $("mapW")?.value || "20";
    const h = $("mapH")?.value || "20";
    const ppc = $("mapPPC")?.value || "30";

    return `!multiline\n!i begin\n!i add 50 DM -p\n\n!map -bg "${url}" -mapsize ${w}x${h} -options dc${ppc} -t DM`;
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

        const sizeMap = { "M": "medium", "L": "large", "S": "small", "H": "huge", "G": "gargantuan" };
        const fullSize = sizeMap[size?.toUpperCase()] || size || "medium";

        const locPart = loc ? ` -move ${loc}` : "";
        lines.push(`!map -t "${full}" -token ${tok} -size ${fullSize} -color c${locPart}`);
    }

    $("tokenModal").style.display = "none";
    showInConsole(lines.join("\n"));
}

/**
 * Update NPC add command output box
 */
export function updateNpcAddCmd() {
    const npcs = readNpcModalRows();
    const out = $("npc-add-out");
    if (!out) return;

    if (!npcs.length) {
        out.innerText = "# No NPCs selected or configured";
        return;
    }

    const lines = ["!multiline"];
    for (const n of npcs) {
        // Transform Full Name: replace _ with space and trim
        const displayName = n.name.replace(/_/g, ' ').trim();
        const note = `Name:${displayName} AC:${n.ac}| Location: ${n.loc || '??'}`;
        lines.push(`!i add 0 ${n.short} -ac ${n.ac} -hp ${n.hp} -note "${note}"`);
    }

    out.innerText = lines.join("\n");
}

/**
 * Generate NPC token setup commands
 */
export function generateNpcTokenCmds() {
    const npcs = readNpcModalRows();
    if (!npcs.length) return alert("No NPCs to set up.");

    const lines = [];
    for (const n of npcs) {
        let tokenPart = "";
        // If we have token data in state, try to find it
        const tokenInfo = state.getTokenData()[n.name.toLowerCase()] || state.getTokenData()[n.short.toLowerCase()];
        if (tokenInfo && tokenInfo.token) {
            tokenPart = ` -token ${tokenInfo.token}`;
        }

        const locPart = n.loc ? ` -move ${n.loc}` : "";
        lines.push(`!map -t ${n.short}${tokenPart} -size medium -color y${locPart}`);
    }

    $("npcModal").style.display = "none";
    showInConsole(lines.join("\n"));
}

/**
 * Read NPC modal rows or selected list rows
 */
function readNpcModalRows() {
    const modalRows = Array.from(document.querySelectorAll("#npcTableBody tr"));
    const out = [];

    // If modal is visible, read from it
    if ($("npcModal").style.display === "flex") {
        for (const tr of modalRows) {
            const short = tr.querySelector(".bm_npc_short")?.value?.trim();
            const name = tr.querySelector(".bm_npc_name")?.value?.trim();
            const ac = tr.querySelector(".bm_npc_ac")?.value?.trim();
            const hp = tr.querySelector(".bm_npc_hp")?.value?.trim();
            const loc = tr.querySelector(".bm_npc_loc")?.value?.trim();

            if (!short || !name) continue;
            out.push({ short, name, ac, hp, loc });
        }
    } else {
        // Otherwise grab from checked rows in main list
        const checked = Array.from(document.querySelectorAll('input[id^="npc_sel_"]:checked'));
        for (const chk of checked) {
            const idx = chk.id.split("_").pop();
            const short = $(`npc_name_${idx}`)?.value?.trim();
            const name = $(`npc_full_${idx}`)?.value?.trim();
            const ac = $(`npc_extra_${idx}`)?.value?.trim();
            const hp = $(`npc_hp_${idx}`)?.value?.trim() || "11";
            const loc = $(`npc_loc_${idx}`)?.value?.trim();

            if (!short || !name) continue;
            out.push({ short, name, ac, hp, loc });
        }
    }

    return out;
}

/**
 * Generate OTFBM effect command
 */
export function generateEffectCommand(effect) {
    const { type, color, size, width, origin, target, persistent, caster } = effect;
    let cmd = "!map ";

    const layer = (type === "aura" || ["circle", "circletop", "square"].includes(type)) ? "-under" : "-over";

    let effectPart = "";
    switch (type) {
        case "arrow":
            effectPart = `arrow,${color},${origin},${target}`;
            break;
        case "circle":
            effectPart = `circle,${size},${color},${origin}`;
            break;
        case "circletop":
            effectPart = `circletop,${size},${color},${origin}`;
            break;
        case "cone":
            effectPart = `cone,${size},${color},${origin},${target}`;
            break;
        case "line":
            effectPart = `line,${size},${width},${color},${origin},${target}`;
            break;
        case "square":
            effectPart = `square,${size},${color},${origin}`;
            break;
        case "aura":
            // Aura uses circle syntax but persistent
            effectPart = `circle,${size},${color},{targ}`;
            break;
    }

    cmd += `${layer} ${effectPart}`;

    if (persistent || type === "aura") {
        cmd += ` -t ${caster}`;
    }

    return cmd;
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
        const short = $(`${type}_name_${idx}`)?.value?.trim();
        const name = $(`${type}_full_${idx}`)?.value?.trim();
        const loc = $(`${type}_loc_${idx}`)?.value?.trim();

        if (!name) continue;

        if (action === "setup-monster") {
            lines.push(`!i madd "${name}" -name ${short} -h`);
        } else if (action === "setup-token") {
            const tokenInfo = state.getTokenData()[name.toLowerCase()] || state.getTokenData()[short.toLowerCase()];
            const token = tokenInfo?.token || "";
            const tokenPart = token ? ` -token ${token}` : "";
            lines.push(`!map -t ${short}${tokenPart} -size medium -color r -move ${loc || ''}`);
        }
    }

    if (lines.length) showInConsole(lines.join("\n"));
}

/**
 * Update Monster add command output box
 */
export function updateMonsterAddCmd() {
    const monsters = readMonsterModalRows();
    const out = $("monster-add-out");
    if (!out) return;

    if (!monsters.length) {
        out.innerText = "# No monsters selected or configured";
        return;
    }

    const lines = ["!multiline"];
    for (const m of monsters) {
        let cmd = `!i madd "${m.name}"`;
        if (m.short) cmd += ` -name ${m.short}`;
        cmd += ` -h`;
        lines.push(cmd);
    }

    out.innerText = lines.join("\n");
}

/**
 * Read monster data from modal rows
 */
function readMonsterModalRows() {
    const modalRows = Array.from(document.querySelectorAll("#monsterTableBody tr"));
    const out = [];

    for (const tr of modalRows) {
        const short = tr.querySelector(".bm_monster_short")?.value?.trim();
        const name = tr.querySelector(".bm_monster_name")?.value?.trim();
        const ac = tr.querySelector(".bm_monster_ac")?.value?.trim();
        const loc = tr.querySelector(".bm_monster_loc")?.value?.trim();

        if (!name) continue;
        out.push({ short, name, ac, loc });
    }

    return out;
}