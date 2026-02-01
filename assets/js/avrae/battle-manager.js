/**
 * /assets/js/avrae/battle-manager.js
 * Supabase-backed Avrae Manager (ported from offline prototype)
 *
 * Notes:
 * - Expects /avrae-manager/index.html to include the UI markup (tabs, lists, modals, canvas).
 * - Uses Supabase ES module client: /assets/js/supabaseClient.js
 */

import { supabase } from "/assets/js/supabaseClient.js";

const MODULE = "avrae-battle-manager";

// -----------------------------
// State
// -----------------------------
let tokenData = {};        // { "goblin": {token,size,display}, ... } populated from Supabase tokens table
let monsterNames = [];     // ["Goblin", "Orc", ...] for autocomplete
let currentSessionId = null;

let revealedTiles = new Set(); // Set of "x,y"
let img = null;

// -----------------------------
// DOM helpers
// -----------------------------
const $ = (id) => document.getElementById(id);

function uiFlash(el) {
    try {
        el.classList.add("clicked-flash");
        setTimeout(() => el.classList.remove("clicked-flash"), 350);
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(el.innerText).catch(() => { });
    } catch (_) { }
}
window.uiFlash = uiFlash;

// -----------------------------
// Menu / Tabs
// -----------------------------
function toggleMenu() {
    const m = $("navMenu");
    if (!m) return;
    m.classList.toggle("active");
}
window.toggleMenu = toggleMenu;

function openTab(evt, tabId) {
    document.querySelectorAll(".tab-content").forEach((el) => el.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((el) => el.classList.remove("active"));
    const tab = $(tabId);
    if (tab) tab.classList.add("active");
    if (evt?.currentTarget) evt.currentTarget.classList.add("active");
}
window.openTab = openTab;

// Close dropdown menu on outside click
document.addEventListener("click", (e) => {
    const menu = $("navMenu");
    if (!menu) return;
    const container = e.target.closest(".menu-container");
    if (!container) menu.classList.remove("active");
});

// -----------------------------
// List row builders
// -----------------------------
const DEFAULT_PLAYER_ROWS = 8;
const DEFAULT_NPC_ROWS = 6;
const DEFAULT_MONSTER_ROWS = 10;

function makeRow({ type, index }) {
    // type: "player" | "npc" | "monster"
    const row = document.createElement("div");
    row.className = `grid-row ${type}-row`;

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.id = `${type}_sel_${index}`;
    chk.title = "Select";

    const nameWrap = document.createElement("div");
    const nameLabel = document.createElement("label");
    nameLabel.innerText =
        type === "player" ? "Ref Name" :
            type === "npc" ? "Short" : "Monster";
    const name = document.createElement("input");
    name.type = "text";
    name.id = `${type}_name_${index}`;
    name.placeholder =
        type === "player" ? "e.g., Bob" :
            type === "npc" ? "e.g., Guard1" : "e.g., Goblin";

    nameWrap.appendChild(nameLabel);
    nameWrap.appendChild(name);

    // Monster autocomplete
    if (type === "monster") attachAutocomplete(name);

    const fullWrap = document.createElement("div");
    const fullLabel = document.createElement("label");
    fullLabel.innerText = type === "player" ? "Full Name" : (type === "npc" ? "Name" : "Qty");
    const full = document.createElement("input");
    full.type = type === "monster" ? "number" : "text";
    full.id = `${type}_full_${index}`;
    full.placeholder = type === "player" ? "e.g., Bob the Brave" : (type === "npc" ? "e.g., City Guard" : "1");
    if (type === "monster") {
        full.min = "1";
        full.value = "1";
    }
    fullWrap.appendChild(fullLabel);
    fullWrap.appendChild(full);

    const locWrap = document.createElement("div");
    const locLabel = document.createElement("label");
    locLabel.innerText = "Location (x,y)";
    const loc = document.createElement("input");
    loc.type = "text";
    loc.id = `${type}_loc_${index}`;
    loc.placeholder = "e.g., 10,12";
    locWrap.appendChild(locLabel);
    locWrap.appendChild(loc);

    // For NPC rows we want AC/HP; for players we want Vis; for monsters we want AC
    let extraWrap = document.createElement("div");
    let extraLabel = document.createElement("label");
    let extra = document.createElement("input");
    extra.id = `${type}_extra_${index}`;
    extra.type = "number";

    if (type === "player") {
        extraLabel.innerText = "Vis";
        extra.placeholder = "6";
        extra.value = "6";
    } else if (type === "npc") {
        extraLabel.innerText = "AC";
        extra.placeholder = "12";
        extra.value = "12";
    } else {
        extraLabel.innerText = "AC";
        extra.placeholder = "12";
        extra.value = "12";
    }

    extraWrap.appendChild(extraLabel);
    extraWrap.appendChild(extra);

    const btnWrap = document.createElement("div");
    btnWrap.className = "btn-group";
    const moveBtn = document.createElement("button");
    moveBtn.className = "move-btn";
    moveBtn.innerText = "↺";
    moveBtn.title = "Jump on map";
    moveBtn.onclick = () => {
        const p = parseXY(loc.value);
        if (!p) return alert("Enter location as x,y");
        centerOn(p.x, p.y);
    };
    btnWrap.appendChild(moveBtn);

    // Layout differs by type (to match your CSS grid templates)
    row.appendChild(chk);

    if (type === "player") {
        row.appendChild(nameWrap);
        row.appendChild(locWrap);
        row.appendChild(extraWrap);
        row.appendChild(btnWrap);
    } else if (type === "npc") {
        row.appendChild(nameWrap);
        row.appendChild(fullWrap);
        row.appendChild(extraWrap);  // AC
        row.appendChild(locWrap);
        row.appendChild(btnWrap);
    } else {
        // monster
        row.appendChild(nameWrap);   // monster
        row.appendChild(fullWrap);   // qty
        row.appendChild(locWrap);
        row.appendChild(extraWrap);  // AC
        row.appendChild(btnWrap);
    }

    return row;
}

function initLists() {
    const players = $("player-list");
    const npcs = $("npc-list");
    const monsters = $("monster-list");

    if (players && !players.dataset.ready) {
        for (let i = 1; i <= DEFAULT_PLAYER_ROWS; i++) players.appendChild(makeRow({ type: "player", index: i }));
        players.dataset.ready = "1";
    }
    if (npcs && !npcs.dataset.ready) {
        for (let i = 1; i <= DEFAULT_NPC_ROWS; i++) npcs.appendChild(makeRow({ type: "npc", index: i }));
        npcs.dataset.ready = "1";
    }
    if (monsters && !monsters.dataset.ready) {
        for (let i = 1; i <= DEFAULT_MONSTER_ROWS; i++) monsters.appendChild(makeRow({ type: "monster", index: i }));
        monsters.dataset.ready = "1";
    }
}

// -----------------------------
// Select / Clear
// -----------------------------
function selectAll(type, checked) {
    document.querySelectorAll(`input[id^="${type}_sel_"]`).forEach((el) => (el.checked = !!checked));
}
window.selectAll = selectAll;

function clearChecked(type) {
    const sel = document.querySelectorAll(`input[id^="${type}_sel_"]`);
    sel.forEach((chk) => {
        if (!chk.checked) return;
        const idx = chk.id.split("_").pop();
        const ids = [
            `${type}_name_${idx}`,
            `${type}_full_${idx}`,
            `${type}_loc_${idx}`,
            `${type}_extra_${idx}`,
        ];
        ids.forEach((id) => {
            const el = $(id);
            if (el) {
                if (el.type === "checkbox") el.checked = false;
                else el.value = "";
            }
        });
        chk.checked = false;
    });
    updateFowOutputs();
}
window.clearChecked = clearChecked;

// -----------------------------
// Autocomplete (Monsters)
// -----------------------------
function attachAutocomplete(input) {
    let listEl = null;

    function closeList() {
        if (listEl && listEl.parentNode) listEl.parentNode.removeChild(listEl);
        listEl = null;
    }

    input.addEventListener("input", () => {
        closeList();
        const q = (input.value || "").trim().toLowerCase();
        if (!q) return;

        const hits = monsterNames
            .filter((n) => n.toLowerCase().includes(q))
            .slice(0, 20);

        if (!hits.length) return;

        listEl = document.createElement("div");
        listEl.className = "autocomplete-list";

        hits.forEach((name) => {
            const item = document.createElement("div");
            item.className = "autocomplete-item";
            const i = name.toLowerCase().indexOf(q);
            if (i >= 0) {
                const before = name.slice(0, i);
                const mid = name.slice(i, i + q.length);
                const after = name.slice(i + q.length);
                item.innerHTML = `${escapeHtml(before)}<strong>${escapeHtml(mid)}</strong>${escapeHtml(after)}`;
            } else {
                item.innerText = name;
            }
            item.addEventListener("click", () => {
                input.value = name;
                closeList();
            });
            listEl.appendChild(item);
        });

        // attach to row container
        input.parentElement.parentElement.appendChild(listEl);
    });

    input.addEventListener("blur", () => setTimeout(closeList, 150));
    document.addEventListener("click", (e) => {
        if (e.target === input) return;
        if (listEl && listEl.contains(e.target)) return;
        closeList();
    });
}

function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// -----------------------------
// Map / Fog-of-war
// -----------------------------
function parseXY(s) {
    if (!s) return null;
    const m = s.split(",").map((x) => x.trim());
    if (m.length !== 2) return null;
    const x = parseInt(m[0], 10);
    const y = parseInt(m[1], 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
}

function gridDims() {
    const w = parseInt($("mapW")?.value || "40", 10);
    const h = parseInt($("mapH")?.value || "40", 10);
    return { w: Math.max(1, w), h: Math.max(1, h) };
}

function visDefault() {
    const v = parseInt($("visRange")?.value || "6", 10);
    return Math.max(0, v);
}

function tileKey(x, y) {
    return `${x},${y}`;
}

function revealCircle(cx, cy, r) {
    const { w, h } = gridDims();
    const rr = r * r;
    for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const dx = x - cx, dy = y - cy;
            if (dx * dx + dy * dy <= rr) revealedTiles.add(tileKey(x, y));
        }
    }
}

function resetFog() {
    revealedTiles = new Set();
    drawMap();
    updateFowOutputs();
    $("fileStatus").innerText = "Session: Fog Reset";
}
window.resetFog = resetFog;

function centerOn(x, y) {
    // simple: scroll map area so tile is visible
    const canvas = $("mapCanvas");
    const area = canvas?.parentElement;
    if (!canvas || !area) return;
    const { w, h } = gridDims();
    const cell = getCellSize();
    const px = x * cell;
    const py = y * cell;
    area.scrollLeft = Math.max(0, px - area.clientWidth / 2);
    area.scrollTop = Math.max(0, py - area.clientHeight / 2);
}

function getCellSize() {
    // Keep reasonable size; prefer square cells
    const base = 22;
    return base;
}

function loadImage() {
    const url = ($("mapImgUrl")?.value || "").trim();
    if (!url) {
        img = null;
        drawMap();
        return;
    }

    img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => drawMap();
    img.onerror = () => {
        img = null;
        drawMap();
        alert("Could not load map image (check URL / CORS).");
    };
    img.src = url;
}
window.loadImage = loadImage;

function drawMap() {
    const canvas = $("mapCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { w, h } = gridDims();
    const cell = getCellSize();

    canvas.width = w * cell;
    canvas.height = h * cell;

    // background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // map image
    if (img) {
        ctx.globalAlpha = 1.0;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    // fog overlay
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // clear revealed cells
    ctx.globalAlpha = 1.0;
    revealedTiles.forEach((k) => {
        const [x, y] = k.split(",").map((n) => parseInt(n, 10));
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        ctx.clearRect(x * cell, y * cell, cell, cell);
    });

    // grid lines
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

    // player markers (selected + with location)
    const players = getEntities("player");
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#5865f2";
    for (const p of players) {
        if (!p.loc) continue;
        const r = Math.max(0, parseInt(p.extra || `${visDefault()}`, 10)) || visDefault();
        // draw marker
        ctx.beginPath();
        ctx.arc((p.loc.x + 0.5) * cell, (p.loc.y + 0.5) * cell, Math.max(4, cell * 0.18), 0, Math.PI * 2);
        ctx.fill();
        // optional: draw vis circle faint
        ctx.globalAlpha = 0.10;
        ctx.beginPath();
        ctx.arc((p.loc.x + 0.5) * cell, (p.loc.y + 0.5) * cell, r * cell, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
    }

    ctx.globalAlpha = 1.0;
}
window.drawMap = drawMap;

function initCanvasInteractions() {
    const canvas = $("mapCanvas");
    if (!canvas) return;

    canvas.addEventListener("click", (e) => {
        const rect = canvas.getBoundingClientRect();
        const cell = getCellSize();
        const x = Math.floor((e.clientX - rect.left) / cell);
        const y = Math.floor((e.clientY - rect.top) / cell);

        // reveal around click using global visRange
        const r = visDefault();
        revealCircle(x, y, r);
        drawMap();
        updateFowOutputs();
    });
}

// -----------------------------
// Entity parsing
// -----------------------------
function getEntities(type) {
    const out = [];
    document.querySelectorAll(`input[id^="${type}_sel_"]`).forEach((chk) => {
        const idx = chk.id.split("_").pop();
        const name = ($(`${type}_name_${idx}`)?.value || "").trim();
        const full = ($(`${type}_full_${idx}`)?.value || "").trim();
        const locStr = ($(`${type}_loc_${idx}`)?.value || "").trim();
        const extra = ($(`${type}_extra_${idx}`)?.value || "").trim();
        const loc = parseXY(locStr);
        out.push({ idx, checked: chk.checked, name, full, loc, extra, locStr });
    });
    return out;
}

// -----------------------------
// Avrae-ish command outputs
// (kept simple so you can refine to match your exact Avrae workflow)
// -----------------------------
function updateFowOutputs() {
    const players = getEntities("player").filter((p) => p.checked && p.loc);
    if (!players.length) {
        if ($("fow-out")) $("fow-out").innerText = "!map -fow (select players with locations)";
        if ($("view-out")) $("view-out").innerText = "!map -view (select players with locations)";
        return;
    }

    // Build a "new-only" list by emitting revealed tiles as coords
    // Format is intentionally simple; adjust to match your Avrae alias later.
    const tiles = Array.from(revealedTiles).join(" ");
    const centers = players.map((p) => `${p.loc.x},${p.loc.y}`).join(" ");

    if ($("fow-out")) $("fow-out").innerText = `!map -fow --new "${tiles}"`;
    if ($("view-out")) $("view-out").innerText = `!map -view --centers "${centers}"`;
}

// Basic command generators
function batchCmd(type, cmd) {
    if (type === "monster") {
        if (cmd === "setup-monster") return generateMonsterSetup();
        if (cmd === "setup-token") return generateMonsterTokens();
    }
    alert("Unknown batch command.");
}
window.batchCmd = batchCmd;

function generateMonsterSetup() {
    const mons = getEntities("monster").filter((m) => m.checked && m.name);
    if (!mons.length) return alert("Select monsters and enter names.");

    // Example: !i add <name> -n <qty> -ac <ac>
    const lines = [];
    for (const m of mons) {
        const qty = Math.max(1, parseInt($(`monster_full_${m.idx}`)?.value || "1", 10) || 1);
        const ac = Math.max(0, parseInt(m.extra || "0", 10) || 0);
        const loc = m.loc ? ` -loc ${m.loc.x},${m.loc.y}` : "";
        lines.push(`!i add "${m.name}" -n ${qty} -ac ${ac}${loc}`);
    }
    showInConsole(lines.join("\n"));
}

function generateMonsterTokens() {
    const mons = getEntities("monster").filter((m) => m.checked && m.name);
    if (!mons.length) return alert("Select monsters and enter names.");

    // Example: !map -token add "<name>" "<token>"
    const lines = [];
    for (const m of mons) {
        const key = m.name.toLowerCase();
        const t = tokenData[key]?.token;
        const size = tokenData[key]?.size || "M";
        if (!t) {
            lines.push(`# Missing token for "${m.name}"`);
            continue;
        }
        lines.push(`!map -token add "${m.name}" "${t}" -size ${size}`);
    }
    showInConsole(lines.join("\n"));
}

function generateNpcAddCmds() {
    const npcs = readNpcModalRows();
    if (!npcs.length) return alert("Add at least one NPC row in the modal.");

    const lines = [];
    for (const n of npcs) {
        // Example: !i add "<short>" -name "<name>" -ac <ac> -hp <hp> -loc x,y
        const ac = n.ac ? ` -ac ${n.ac}` : "";
        const hp = n.hp ? ` -hp ${n.hp}` : "";
        const loc = n.loc ? ` -loc ${n.loc}` : "";
        lines.push(`!i add "${n.short}" -name "${n.name}"${ac}${hp}${loc}`);
    }
    showInConsole(lines.join("\n"));
}
window.generateNpcAddCmds = generateNpcAddCmds;

function generateNpcTokenCmds() {
    // Token setup for NPC list (sidebar checked)
    const npcs = getEntities("npc").filter((n) => n.checked && n.name);
    if (!npcs.length) return alert("Select NPCs and enter Short codes.");

    const lines = [];
    for (const n of npcs) {
        // placeholder: token URL is left to you; you can add token field later if needed
        lines.push(`# NPC token: ${n.name} (add token field if desired)`);
    }
    showInConsole(lines.join("\n"));
}
window.generateNpcTokenCmds = generateNpcTokenCmds;

function showInConsole(text) {
    // For now: use a simple modal-ish alert fallback, and console
    console.log(text);

    // Put it somewhere visible if you want—right now we re-use fow-out box if present
    const out = $("fow-out");
    if (out) out.innerText = text.length > 4000 ? text.slice(0, 3990) + " ..." : text;
    if (out) uiFlash(out);
}

// -----------------------------
// Player token modal (v1 minimal)
// -----------------------------
function openTokenModal() {
    // Build rows based on checked players
    const body = $("tokenTableBody");
    if (!body) return;
    body.innerHTML = "";

    const players = getEntities("player").filter((p) => p.checked && p.name);
    if (!players.length) {
        alert("Select at least one player (checkbox) and enter a Ref Name.");
        return;
    }

    players.forEach((p) => {
        const tr = document.createElement("tr");

        const tdRef = document.createElement("td");
        tdRef.innerText = p.name;

        const tdFull = document.createElement("td");
        const inFull = document.createElement("input");
        inFull.type = "text";
        inFull.value = p.full || p.name;
        inFull.dataset.ref = p.name;
        inFull.className = "bm_modal_full";
        tdFull.appendChild(inFull);

        const tdLoc = document.createElement("td");
        const inLoc = document.createElement("input");
        inLoc.type = "text";
        inLoc.value = p.locStr || "";
        inLoc.className = "bm_modal_loc";
        tdLoc.appendChild(inLoc);

        const tdSize = document.createElement("td");
        const inSize = document.createElement("input");
        inSize.type = "text";
        inSize.value = "M";
        inSize.className = "bm_modal_size";
        tdSize.appendChild(inSize);

        const tdTok = document.createElement("td");
        const inTok = document.createElement("input");
        inTok.type = "text";
        inTok.placeholder = "Token URL or code";
        inTok.className = "bm_modal_token";
        tdTok.appendChild(inTok);

        tr.appendChild(tdRef);
        tr.appendChild(tdFull);
        tr.appendChild(tdLoc);
        tr.appendChild(tdSize);
        tr.appendChild(tdTok);

        body.appendChild(tr);
    });

    $("tokenModal").style.display = "flex";
}
window.openTokenModal = openTokenModal;

function generateTokenCommands() {
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
window.generateTokenCommands = generateTokenCommands;

// -----------------------------
// NPC modal (v1 minimal)
// -----------------------------
function openNpcModal() {
    const body = $("npcTableBody");
    if (!body) return;
    body.innerHTML = "";

    // Start with 5 rows
    for (let i = 0; i < 5; i++) {
        const tr = document.createElement("tr");

        tr.appendChild(tdInput("bm_npc_short", "text", "", "e.g., Guard1"));
        tr.appendChild(tdInput("bm_npc_name", "text", "", "e.g., City Guard"));
        tr.appendChild(tdInput("bm_npc_ac", "number", "12", ""));
        tr.appendChild(tdInput("bm_npc_hp", "number", "11", ""));
        tr.appendChild(tdInput("bm_npc_loc", "text", "", "x,y"));

        body.appendChild(tr);
    }

    $("npcModal").style.display = "flex";
}
window.openNpcModal = openNpcModal;

function tdInput(cls, type, value, placeholder) {
    const td = document.createElement("td");
    const i = document.createElement("input");
    i.className = cls;
    i.type = type;
    if (value !== undefined) i.value = value;
    if (placeholder) i.placeholder = placeholder;
    td.appendChild(i);
    return td;
}

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

// -----------------------------
// Supabase: Tokens
// -----------------------------
async function refreshTokensFromSupabase() {
    try {
        const { data, error } = await supabase
            .from("tokens")
            .select("name,type,token_code,size,image_url")
            .eq("type", "Monsters");

        if (error) throw error;

        tokenData = {};
        monsterNames = [];

        (data || []).forEach((r) => {
            const name = (r.name || "").trim();
            if (!name) return;
            tokenData[name.toLowerCase()] = {
                token: r.token_code || r.image_url || "",
                size: r.size || "M",
                display: name
            };
            monsterNames.push(name);
        });

        console.info(`[${MODULE}] Loaded ${monsterNames.length} monsters from Supabase`);
        const fs = $("fileStatus");
        if (fs && fs.innerText.includes("Unsaved")) {
            // leave it
        }
    } catch (e) {
        console.error(`[${MODULE}] refreshTokensFromSupabase failed`, e);
        alert("Failed to load tokens from Supabase.");
    }
}
window.refreshTokensFromSupabase = refreshTokensFromSupabase;

// -----------------------------
// Supabase: Sessions
// -----------------------------
function collectStateBlob() {
    const state = { revealed: Array.from(revealedTiles), inputs: {} };
    document.querySelectorAll("input").forEach((el) => {
        if (!el.id) return;
        state.inputs[el.id] = el.type === "checkbox" ? el.checked : el.value;
    });
    return state;
}

function applyStateBlob(state) {
    revealedTiles = new Set(state?.revealed || []);
    const inputs = state?.inputs || {};
    Object.keys(inputs).forEach((id) => {
        const el = $(id);
        if (!el) return;
        if (el.type === "checkbox") el.checked = !!inputs[id];
        else el.value = inputs[id];
    });
    loadImage();
    drawMap();
    updateFowOutputs();
}

async function saveSessionToSupabase() {
    try {
        const { data: u } = await supabase.auth.getUser();
        const user = u?.user;
        if (!user) return alert("You must be logged in.");

        const name = prompt("Session name:", "Avrae Session");
        if (!name) return;

        const state = collectStateBlob();

        if (!currentSessionId) {
            const { data, error } = await supabase
                .from("avrae_sessions")
                .insert([{ name, user_id: user.id, state }])
                .select("id")
                .single();
            if (error) throw error;
            currentSessionId = data.id;
        } else {
            const { error } = await supabase
                .from("avrae_sessions")
                .update({ name, state, updated_at: new Date().toISOString() })
                .eq("id", currentSessionId);
            if (error) throw error;
        }

        $("fileStatus").innerText = `Session: Saved (${name})`;
    } catch (e) {
        console.error(`[${MODULE}] saveSessionToSupabase failed`, e);
        alert("Failed to save session.");
    }
}
window.saveSessionToSupabase = saveSessionToSupabase;

async function loadSessionPrompt() {
    try {
        const { data: u } = await supabase.auth.getUser();
        const user = u?.user;
        if (!user) return alert("You must be logged in.");

        const { data, error } = await supabase
            .from("avrae_sessions")
            .select("id,name,updated_at")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(20);

        if (error) throw error;
        if (!data?.length) return alert("No saved sessions found.");

        const menu = data.map((s, i) => `${i + 1}) ${s.name}`).join("\n");
        const pickRaw = prompt(`Pick a session:\n${menu}`, "1");
        if (!pickRaw) return;

        const idx = Math.max(1, Math.min(data.length, parseInt(pickRaw, 10))) - 1;
        const chosen = data[idx];

        const { data: row, error: e2 } = await supabase
            .from("avrae_sessions")
            .select("id,name,state")
            .eq("id", chosen.id)
            .single();
        if (e2) throw e2;

        currentSessionId = row.id;
        applyStateBlob(row.state);
        $("fileStatus").innerText = `Session: Loaded (${row.name})`;
    } catch (e) {
        console.error(`[${MODULE}] loadSessionPrompt failed`, e);
        alert("Failed to load session.");
    }
}
window.loadSessionPrompt = loadSessionPrompt;

// -----------------------------
// Init
// -----------------------------
function init() {
    initLists();
    initCanvasInteractions();

    // Update outputs when locations/vis change
    document.addEventListener("input", (e) => {
        const id = e.target?.id || "";
        if (id.startsWith("player_") || id.startsWith("mapW") || id.startsWith("mapH") || id.startsWith("visRange")) {
            drawMap();
            updateFowOutputs();
        }
    });

    // Ensure canvas draws even before image load
    drawMap();
    updateFowOutputs();
}
window.init = init;

// Boot
window.addEventListener("load", async () => {
    init();
    await refreshTokensFromSupabase();
});
