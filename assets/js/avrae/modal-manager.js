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
        tr.appendChild(createModalInput("bm_modal_loc", "text", loc, "x,y", (val) => {
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

            const locPart = lVal ? ` -loc ${lVal}` : "";
            const cmd = `!map -token add "${fName}" "${tVal}" -size ${sVal}${locPart}`;
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
 * Open NPC add modal
 */
export function openNpcModal() {
    const body = $("npcTableBody");
    if (!body) return;
    body.innerHTML = "";

    // Start with 5 blank rows
    // Note: NPCs in the modal are usually for NEW NPCs to be added via !i add
    // So they don't necessarily sync back to existing rows.
    for (let i = 0; i < 5; i++) {
        const tr = document.createElement("tr");

        tr.appendChild(createModalInput("bm_npc_short", "text", "", "e.g., Guard1"));
        tr.appendChild(createModalInput("bm_npc_name", "text", "", "e.g., City Guard"));
        tr.appendChild(createModalInput("bm_npc_ac", "number", "12", ""));
        tr.appendChild(createModalInput("bm_npc_hp", "number", "11", ""));
        tr.appendChild(createModalInput("bm_npc_loc", "text", "", "x,y"));

        body.appendChild(tr);
    }

    $("npcModal").style.display = "flex";
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