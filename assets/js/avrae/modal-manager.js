/**
 * /assets/js/avrae/modal-manager.js
 * Manage token and NPC modals
 */

import { $ } from './ui-helpers.js';
import { state } from './state-manager.js';

/**
 * Open player token setup modal
 */
export function openTokenModal() {
    const body = $("tokenTableBody");
    if (!body) return;
    body.innerHTML = "";

    // Gather checked players
    const checked = Array.from(document.querySelectorAll('input[id^="player_sel_"]:checked'));
    if (!checked.length) return alert("No players selected.");

    const tokenData = state.getTokenData();

    for (const chk of checked) {
        const idx = chk.id.split("_").pop();
        const fullName = $(`player_full_${idx}`)?.value?.trim() || "";
        const loc = $(`player_loc_${idx}`)?.value?.trim() || "";
        let tokenVal = $(`player_token_${idx}`)?.value || "";

        // Auto-search token if empty
        if (!tokenVal && fullName) {
            const found = tokenData[fullName.toLowerCase()];
            if (found) {
                tokenVal = found.token;
                // Sync back to hidden field
                const el = $(`player_token_${idx}`);
                if (el) el.value = tokenVal;
            }
        }

        const tr = document.createElement("tr");

        // Full name -> Read-only
        tr.appendChild(createModalInput("bm_modal_full", "text", fullName, "Full name", null, true));

        // Location -> Syncs to player_loc_{idx}
        tr.appendChild(createModalInput("bm_modal_loc", "text", loc, "e.g., B12", (val) => {
            const el = $(`player_loc_${idx}`);
            if (el) el.value = val;
        }));

        // Size
        tr.appendChild(createModalInput("bm_modal_size", "text", "M", "M/L/H"));

        // Token URL -> Syncs to player_token_{idx}
        const tdToken = createModalInput("bm_modal_token", "text", tokenVal, "Token URL or code", (val) => {
            const el = $(`player_token_${idx}`);
            if (el) el.value = val;
        });
        // Make token input smaller via style
        tdToken.querySelector("input").style.width = "120px";
        tr.appendChild(tdToken);

        // Action column: Copy button
        const tdAction = document.createElement("td");
        const copyBtn = document.createElement("button");
        copyBtn.className = "action-btn";
        copyBtn.style.padding = "4px 8px";
        copyBtn.style.fontSize = "0.7em";
        copyBtn.innerText = "Copy";
        copyBtn.onclick = () => {
            const fName = tr.querySelector(".bm_modal_full").value;
            const tVal = tr.querySelector(".bm_modal_token").value;
            const sVal = tr.querySelector(".bm_modal_size").value || "M";
            const lVal = tr.querySelector(".bm_modal_loc").value;

            if (!fName || !tVal) return alert("Missing Full Name or Token.");

            const sizeMap = { "M": "medium", "L": "large", "S": "small", "H": "huge", "G": "gargantuan" };
            const fullSize = sizeMap[sVal?.toUpperCase()] || sVal || "medium";

            const locPart = lVal ? ` -move ${lVal}` : "";
            const cmd = `!map -t "${fName}" -token ${tVal} -size ${fullSize} -color c${locPart}`;
            navigator.clipboard.writeText(cmd);
            import('./ui-helpers.js').then(({ uiFlash }) => uiFlash(copyBtn, true));
        };
        tdAction.appendChild(copyBtn);
        tr.appendChild(tdAction);

        body.appendChild(tr);
    }

    $("tokenModal").style.display = "flex";
}

/**
 * Open NPC add modal (for !i add)
 */
export function openNpcModal() {
    const body = $("npcTableBody");
    if (!body) return;
    body.innerHTML = "";

    // Gather checked NPCs
    const checked = Array.from(document.querySelectorAll('input[id^="npc_sel_"]:checked'));
    if (!checked.length) return alert("No NPCs selected.");
    const rowCount = checked.length;

    for (let i = 0; i < rowCount; i++) {
        const tr = document.createElement("tr");
        let short = "", name = "", ac = "12", hp = "11", loc = "";

        if (checked[i]) {
            const idx = checked[i].id.split("_").pop();
            short = $(`npc_name_${idx}`)?.value || ""; // Note: name field is the short name
            name = $(`npc_full_${idx}`)?.value || "";
            ac = $(`npc_extra_${idx}`)?.value || "12";
            hp = $(`npc_hp_${idx}`)?.value || "11";
            loc = $(`npc_loc_${idx}`)?.value || "";
        }

        const onUpdate = () => {
            import('./command-generator.js').then(m => m.updateNpcAddCmd());
        };

        tr.appendChild(createModalInput("bm_npc_short", "text", short, "e.g., Guard1", null, true));
        tr.appendChild(createModalInput("bm_npc_name", "text", name, "e.g., City Guard", null, true));
        tr.appendChild(createModalInput("bm_npc_ac", "number", ac, "", onUpdate));
        tr.appendChild(createModalInput("bm_npc_hp", "number", hp, "", onUpdate));
        tr.appendChild(createModalInput("bm_npc_loc", "text", loc, "e.g., B12", null, true));

        body.appendChild(tr);
    }

    // Initial command generation
    import('./command-generator.js').then(m => m.updateNpcAddCmd());

    $("npcModal").style.display = "flex";
}

/**
 * Open NPC token setup modal (for !map -token)
 */
export function openNpcTokenModal() {
    const body = $("npcTokenTableBody");
    if (!body) return;
    body.innerHTML = "";

    // Gather checked NPCs
    const checked = Array.from(document.querySelectorAll('input[id^="npc_sel_"]:checked'));
    if (!checked.length) return alert("No NPCs selected.");

    const tokenData = state.getTokenData();

    for (const chk of checked) {
        const idx = chk.id.split("_").pop();
        const short = $(`npc_name_${idx}`)?.value?.trim() || "";
        const fullName = $(`npc_full_${idx}`)?.value?.trim() || "";
        const loc = $(`npc_loc_${idx}`)?.value?.trim() || "";
        let tokenVal = "";

        // Auto-search token if empty (using full name if possible)
        if (fullName) {
            const found = tokenData[fullName.toLowerCase()] || tokenData[short.toLowerCase()];
            if (found) tokenVal = found.token;
        }

        const tr = document.createElement("tr");

        // Short Name (the name used in Avrae combat) -> Read-only
        tr.appendChild(createModalInput("bm_modal_npc_short", "text", short, "Short", null, true));

        // Full Name -> Read-only (just for context)
        tr.appendChild(createModalInput("bm_modal_npc_full", "text", fullName, "Name", null, true));

        // Location -> Syncs to npc_loc_{idx}
        tr.appendChild(createModalInput("bm_modal_npc_loc", "text", loc, "e.g., B12", (val) => {
            const el = $(`npc_loc_${idx}`);
            if (el) el.value = val;
        }));

        // Size
        tr.appendChild(createModalInput("bm_modal_npc_size", "text", "M", "M/L/H"));

        // Token URL
        const tdToken = createModalInput("bm_modal_npc_token", "text", tokenVal, "Token URL or code");
        tdToken.querySelector("input").style.width = "120px";
        tr.appendChild(tdToken);

        // Action column: Copy button
        const tdAction = document.createElement("td");
        const copyBtn = document.createElement("button");
        copyBtn.className = "action-btn";
        copyBtn.style.padding = "4px 8px";
        copyBtn.style.fontSize = "0.7em";
        copyBtn.innerText = "Copy";
        copyBtn.onclick = () => {
            const sName = tr.querySelector(".bm_modal_npc_short").value;
            const tVal = tr.querySelector(".bm_modal_npc_token").value;
            const szVal = tr.querySelector(".bm_modal_npc_size").value || "M";
            const lVal = tr.querySelector(".bm_modal_npc_loc").value;

            if (!sName) return alert("Missing NPC Name.");

            const sizeMap = { "M": "medium", "L": "large", "S": "small", "H": "huge", "G": "gargantuan" };
            const fullSize = sizeMap[szVal?.toUpperCase()] || szVal || "medium";

            const locPart = lVal ? ` -move ${lVal}` : "";
            const tokenPart = tVal ? ` -token ${tVal}` : "";
            const cmd = `!map -t ${sName}${tokenPart} -size ${fullSize} -color y${locPart}`;
            navigator.clipboard.writeText(cmd);
            import('./ui-helpers.js').then(({ uiFlash }) => uiFlash(copyBtn, true));
        };
        tdAction.appendChild(copyBtn);
        tr.appendChild(tdAction);

        body.appendChild(tr);
    }

    $("npcTokenModal").style.display = "flex";
}

/**
 * Open Monster add modal (for !i madd)
 */
export function openMonsterModal() {
    const body = $("monsterTableBody");
    if (!body) return;
    body.innerHTML = "";

    // Gather checked monsters
    const checked = Array.from(document.querySelectorAll('input[id^="monster_sel_"]:checked'));
    if (!checked.length) return alert("No monsters selected.");

    for (const chk of checked) {
        const tr = document.createElement("tr");
        const idx = chk.id.split("_").pop();
        const short = $(`monster_name_${idx}`)?.value || "";
        const name = $(`monster_full_${idx}`)?.value || "";
        const loc = $(`monster_loc_${idx}`)?.value || "";

        const onUpdate = () => {
            import('./command-generator.js').then(m => m.updateMonsterAddCmd());
        };

        tr.appendChild(createModalInput("bm_monster_short", "text", short, "Short", null, true));
        tr.appendChild(createModalInput("bm_monster_name", "text", name, "Name", null, true));
        tr.appendChild(createModalInput("bm_monster_ac", "number", "12", "", onUpdate));
        tr.appendChild(createModalInput("bm_monster_loc", "text", loc, "Location", null, true));

        body.appendChild(tr);
    }

    // Initial command generation
    import('./command-generator.js').then(m => m.updateMonsterAddCmd());

    $("monsterModal").style.display = "flex";
}

/**
 * Open Monster token setup modal (for !map -t)
 */
export function openMonsterTokenModal() {
    const body = $("monsterTokenTableBody");
    if (!body) return;
    body.innerHTML = "";

    // Gather checked monsters
    const checked = Array.from(document.querySelectorAll('input[id^="monster_sel_"]:checked'));
    if (!checked.length) return alert("No monsters selected.");

    const tokenData = state.getTokenData();

    for (const chk of checked) {
        const idx = chk.id.split("_").pop();
        const short = $(`monster_name_${idx}`)?.value?.trim() || "";
        const fullName = $(`monster_full_${idx}`)?.value?.trim() || "";
        const loc = $(`monster_loc_${idx}`)?.value?.trim() || "";
        let tokenVal = "";

        // Auto-search token
        if (fullName) {
            const found = tokenData[fullName.toLowerCase()] || tokenData[short.toLowerCase()];
            if (found) tokenVal = found.token;
        }

        const tr = document.createElement("tr");

        // Display Name (for the command)
        tr.appendChild(createModalInput("bm_modal_monster_short", "text", short, "Short", null, true));

        // Location
        tr.appendChild(createModalInput("bm_modal_monster_loc", "text", loc, "Location", (val) => {
            const el = $(`monster_loc_${idx}`);
            if (el) el.value = val;
        }));

        // Size
        tr.appendChild(createModalInput("bm_modal_monster_size", "text", "M", "M/L/H"));

        // Token URL
        const tdToken = createModalInput("bm_modal_monster_token", "text", tokenVal, "Token URL or code");
        tdToken.querySelector("input").style.width = "120px";
        tr.appendChild(tdToken);

        // Action: Copy
        const tdAction = document.createElement("td");
        const copyBtn = document.createElement("button");
        copyBtn.className = "action-btn";
        copyBtn.style.padding = "4px 8px";
        copyBtn.style.fontSize = "0.7em";
        copyBtn.innerText = "Copy";
        copyBtn.onclick = () => {
            const sName = tr.querySelector(".bm_modal_monster_short").value;
            const tVal = tr.querySelector(".bm_modal_monster_token").value;
            const szVal = tr.querySelector(".bm_modal_monster_size").value || "M";
            const lVal = tr.querySelector(".bm_modal_monster_loc").value;

            const sizeMap = { "M": "medium", "L": "large", "S": "small", "H": "huge", "G": "gargantuan" };
            const fullSize = sizeMap[szVal?.toUpperCase()] || szVal || "medium";

            const locPart = lVal ? ` -move ${lVal}` : "";
            const tokenPart = tVal ? ` -token ${tVal}` : "";

            const cmd = `!map -t ${sName}${tokenPart} -size ${fullSize} -color r${locPart}`;

            navigator.clipboard.writeText(cmd);
            import('./ui-helpers.js').then(({ uiFlash }) => uiFlash(copyBtn, true));
        };
        tdAction.appendChild(copyBtn);
        tr.appendChild(tdAction);

        body.appendChild(tr);
    }

    $("monsterTokenModal").style.display = "flex";
}

/**
 * Helper: Create modal input cell
 */
function createModalInput(className, type, value, placeholder, onChangeCallback, readOnly = false) {
    const td = document.createElement("td");
    const input = document.createElement("input");

    input.className = className;
    input.type = type;
    if (value !== undefined) input.value = value;
    if (placeholder) input.placeholder = placeholder;
    if (readOnly) {
        input.readOnly = true;
        input.style.background = "transparent";
        input.style.border = "none";
        input.style.color = "var(--blur)";
    }

    if (onChangeCallback) {
        input.oninput = (e) => onChangeCallback(e.target.value);
    }

    td.appendChild(input);
    return td;
}

/**
 * Close modal by ID
 */
export function closeModal(modalId) {
    const modal = $(modalId);
    if (modal) modal.style.display = "none";
}