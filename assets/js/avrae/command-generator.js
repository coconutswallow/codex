/**
 * /assets/js/avrae/command-generator.js
 * Generate Avrae commands for various operations
 */

import { $ } from './ui-helpers.js';
import { state } from './state-manager.js';

// getResizelyUrl removed - imported from utils/resizely-helper.js


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
 * Parse x,y location string
 */
export function parseXY(str) {
    if (!str) return null;
    const parts = str.split(",").map((s) => s.trim());
    if (parts.length !== 2) return null;
    const x = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    if (isNaN(x) || isNaN(y)) return null;
    return { x, y };
}

/**
 * Update FOW and View outputs for players
 */
export function updateFowOutputs() {
    const mapW = parseInt($("mapW")?.value || "40", 10);
    const mapH = parseInt($("mapH")?.value || "40", 10);
    const globalVis = parseInt($("visRange")?.value || "6", 10);

    const revealed = state.getRevealedTiles();
    const newReveal = [];

    for (let i = 1; i <= 20; i++) {
        const nameEl = $(`player_name_${i}`);
        const locEl = $(`player_loc_${i}`);
        const visEl = $(`player_extra_${i}`);

        if (!nameEl || !locEl) continue;

        const name = nameEl.value.trim();
        const locStr = locEl.value.trim();
        if (!name || !locStr) continue;

        const pos = parseXY(locStr);
        if (!pos) continue;

        const vis = parseInt(visEl?.value || globalVis, 10);
        const tiles = computeVisibleTiles(pos.x, pos.y, vis, mapW, mapH);

        tiles.forEach((t) => {
            const key = `${t.x},${t.y}`;
            if (!revealed.has(key)) {
                newReveal.push(key);
                state.addRevealedTile(t.x, t.y);
            }
        });
    }

    // Build FOW command
    const fow = $("fow-out");
    if (fow) {
        if (newReveal.length) {
            fow.innerText = `!map -fow ${newReveal.join(" ")}`;
        } else {
            fow.innerText = "!map -fow ... (no new tiles)";
        }
    }

    // Build view command
    const view = $("view-out");
    if (view) {
        const playerLocs = [];
        for (let i = 1; i <= 20; i++) {
            const name = $(`player_name_${i}`)?.value?.trim();
            const loc = $(`player_loc_${i}`)?.value?.trim();
            if (name && loc) playerLocs.push(loc);
        }

        if (playerLocs.length) {
            view.innerText = `!map -view ${playerLocs.join(" ")}`;
        } else {
            view.innerText = "!map -view ...";
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
 * Compute visible tiles from a position
 */
function computeVisibleTiles(cx, cy, radius, mapW, mapH) {
    const tiles = [];
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > radius * radius) continue;
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