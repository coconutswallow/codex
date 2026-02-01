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

    for (const chk of checked) {
        const idx = chk.id.split("_").pop();
        const refName = $(`player_name_${idx}`)?.value?.trim() || "";
        const fullName = $(`player_full_${idx}`)?.value?.trim() || "";
        const loc = $(`player_loc_${idx}`)?.value?.trim() || "";

        const tr = document.createElement("tr");

        // Ref name (read-only display)
        const tdRef = document.createElement("td");
        tdRef.textContent = refName;
        tr.appendChild(tdRef);

        // Full name
        tr.appendChild(createModalInput("bm_modal_full", "text", fullName, "Full name"));

        // Location
        tr.appendChild(createModalInput("bm_modal_loc", "text", loc, "x,y"));

        // Size
        tr.appendChild(createModalInput("bm_modal_size", "text", "M", "M/L/H"));

        // Token URL
        tr.appendChild(createModalInput("bm_modal_token", "text", "", "Token URL or code"));

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
function createModalInput(className, type, value, placeholder) {
    const td = document.createElement("td");
    const input = document.createElement("input");

    input.className = className;
    input.type = type;
    if (value !== undefined) input.value = value;
    if (placeholder) input.placeholder = placeholder;

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