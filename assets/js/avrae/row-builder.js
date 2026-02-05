/**
 * /assets/js/avrae/row-builder.js
 * Create and manage player/NPC/monster rows
 * makeRow function
 * initLists function
 * Row creation logic for players/NPCs/monsters
 */

import { $ } from './ui-helpers.js';
import { attachAutocomplete } from './autocomplete.js';

const DEFAULT_PLAYER_ROWS = 4;
const DEFAULT_NPC_ROWS = 4;
const DEFAULT_MONSTER_ROWS = 4;

/**
 * Create a single row for player/NPC/monster
 */
export function makeRow({ type, index, onLocationJump }) {
    const row = document.createElement("div");
    row.className = `grid-row ${type}-row`;

    // Checkbox
    const chk = createCheckbox(type, index);

    // Name field (Short Name for players, Short for NPCs, Monster for monsters)
    const nameWrap = createField({
        type,
        index,
        field: "name",
        label: type === "player" ? "Short Name" : (type === "npc" ? "Short" : "Short"),
        placeholder: type === "player" ? "e.g., PP" : (type === "npc" ? "e.g., TS" : "e.g., GO1"),
        inputType: "text"
    });

    // Full name / Qty field
    const fullWrap = createField({
        type,
        index,
        field: "full",
        label: type === "player" ? "Name" : (type === "npc" ? "Name" : "Name"),
        placeholder: type === "player" ? "e.g., Peter Pan" : (type === "npc" ? "e.g., City Guard" : "e.g., Goblin"),
        inputType: "text"
    });

    // Autocomplete for monsters
    if (type === "monster") {
        const input = fullWrap.querySelector("input");
        attachAutocomplete(input);
    }

    // Location field
    const locWrap = createField({
        type,
        index,
        field: "loc",
        label: "Location",
        placeholder: "e.g. C15",
        inputType: "text"
    });

    // Extra field (Vis/AC/HP)
    const extraWrap = createExtraField(type, index);

    // Hidden Token field for players/monsters
    let tokenHidden;
    if (type === "player" || type === "monster") {
        tokenHidden = document.createElement("input");
        tokenHidden.type = "hidden";
        tokenHidden.id = `${type}_token_${index}`;
        row.appendChild(tokenHidden);
    }

    // Hidden HP field for NPCs (AC is already visible)
    if (type === "npc") {
        const hpHidden = document.createElement("input");
        hpHidden.type = "hidden";
        hpHidden.id = `npc_hp_${index}`;
        hpHidden.value = "11";
        row.appendChild(hpHidden);
    }

    // Action button (Move/Copy for player, Jump for others)
    const btnWrap = createActionButton(type, index, onLocationJump);

    // Assemble row based on type
    row.appendChild(chk);
    row.appendChild(nameWrap);
    row.appendChild(fullWrap);

    if (type === "player") {
        row.appendChild(locWrap);
        row.appendChild(btnWrap);
    } else if (type === "npc" || type === "monster") {
        row.appendChild(locWrap);
        row.appendChild(btnWrap);
    } else {
        // Fallback or future types
        row.appendChild(locWrap);
        row.appendChild(extraWrap);
        row.appendChild(btnWrap);
    }

    return row;
}

/**
 * Initialize all lists with default rows
 */
export function initLists(onLocationJump) {
    const players = $("player-list");
    const npcs = $("npc-list");
    const monsters = $("monster-list");

    if (players && !players.dataset.ready) {
        for (let i = 1; i <= DEFAULT_PLAYER_ROWS; i++) {
            players.appendChild(makeRow({ type: "player", index: i, onLocationJump }));
        }
        players.dataset.ready = "1";
    }

    if (npcs && !npcs.dataset.ready) {
        for (let i = 1; i <= DEFAULT_NPC_ROWS; i++) {
            npcs.appendChild(makeRow({ type: "npc", index: i, onLocationJump }));
        }
        npcs.dataset.ready = "1";
    }

    if (monsters && !monsters.dataset.ready) {
        for (let i = 1; i <= DEFAULT_MONSTER_ROWS; i++) {
            monsters.appendChild(makeRow({ type: "monster", index: i, onLocationJump }));
        }
        monsters.dataset.ready = "1";
    }
}

/**
 * Add a new row dynamically
 */
export function addRow(type, onLocationJump) {
    const list = $(`${type}-list`);
    if (!list) return;

    // Determine next index
    const existing = list.querySelectorAll(`.${type}-row`).length;
    const nextIdx = existing + 1;

    list.appendChild(makeRow({ type, index: nextIdx, onLocationJump }));
}

/**
 * Ensure at least N rows exist for a type
 */
export function ensureRows(type, count, onLocationJump) {
    const list = $(`${type}-list`);
    if (!list) return;

    const existing = list.querySelectorAll(`.${type}-row`).length;
    for (let i = existing + 1; i <= count; i++) {
        list.appendChild(makeRow({ type, index: i, onLocationJump }));
    }
}

/**
 * Helper: Create checkbox
 */
function createCheckbox(type, index) {
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.id = `${type}_sel_${index}`;
    chk.title = "Select";
    return chk;
}

/**
 * Helper: Create labeled input field
 */
function createField({ type, index, field, label, placeholder, inputType, defaultValue, min }) {
    const wrap = document.createElement("div");
    const lbl = document.createElement("label");
    lbl.innerText = label;

    const input = document.createElement("input");
    input.type = inputType;
    input.id = `${type}_${field}_${index}`;
    input.placeholder = placeholder;

    if (defaultValue !== undefined) input.value = defaultValue;
    if (min !== undefined) input.min = min;

    wrap.appendChild(lbl);
    wrap.appendChild(input);
    return wrap;
}

/**
 * Helper: Create extra field (Vis/AC/HP)
 */
function createExtraField(type, index) {
    const wrap = document.createElement("div");
    const lbl = document.createElement("label");
    const input = document.createElement("input");
    input.id = `${type}_extra_${index}`;
    input.type = "number";

    if (type === "player") {
        lbl.innerText = "Vis";
        input.placeholder = "6";
        input.value = "6";
    } else if (type === "npc") {
        lbl.innerText = "AC";
        input.placeholder = "12";
        input.value = "12";
    } else {
        lbl.innerText = "AC";
        input.placeholder = "12";
        input.value = "12";
    }

    wrap.appendChild(lbl);
    wrap.appendChild(input);
    return wrap;
}

/**
 * Helper: Create action button (Move/Copy for player, Jump for others)
 */
function createActionButton(type, index, onLocationJump) {
    const btnWrap = document.createElement("div");
    btnWrap.className = "btn-group";

    const actionBtn = document.createElement("button");
    actionBtn.className = "move-btn";

    if (type === "player" || type === "npc" || type === "monster") {
        actionBtn.innerText = "➜"; // Arrow icon
        actionBtn.title = `Copy ${type} move command`;
        actionBtn.onclick = () => {
            const shortName = $(`${type}_name_${index}`)?.value?.trim();
            const fullName = $(`${type}_full_${index}`)?.value?.trim();
            const loc = $(`${type}_loc_${index}`)?.value?.trim();

            if (loc) {
                let target = (type === "player") ? fullName : shortName;
                if (!target) return alert(`Missing ${type === "player" ? "Full Name" : "Short Name"}`);

                let color = "c";
                if (type === "npc") color = "y";
                if (type === "monster") color = "r";

                const cmd = `!map -t ${target} -move ${loc} -color ${color}`;
                navigator.clipboard.writeText(cmd);
                import('./ui-helpers.js').then(({ uiFlash }) => {
                    uiFlash(actionBtn, true);
                });
            } else {
                alert("Please enter a Location.");
            }
        };
    } else {
        actionBtn.innerText = "↺";
        actionBtn.title = "Jump on map";
        actionBtn.onclick = () => {
            const locInput = $(`${type}_loc_${index}`);
            if (onLocationJump && locInput) {
                onLocationJump(locInput.value);
            }
        };
    }

    btnWrap.appendChild(actionBtn);
    return btnWrap;
}