/**
 * /assets/js/avrae/row-builder.js
 * Create and manage player/NPC/monster rows
 * makeRow function
 * initLists function
 * Row creation logic for players/NPCs/monsters
 */

import { $ } from './ui-helpers.js';
import { attachAutocomplete } from './autocomplete.js';

const DEFAULT_PLAYER_ROWS = 8;
const DEFAULT_NPC_ROWS = 6;
const DEFAULT_MONSTER_ROWS = 10;

/**
 * Create a single row for player/NPC/monster
 */
export function makeRow({ type, index, onLocationJump }) {
    const row = document.createElement("div");
    row.className = `grid-row ${type}-row`;

    // Checkbox
    const chk = createCheckbox(type, index);

    // Name field
    const nameWrap = createField({
        type,
        index,
        field: "name",
        label: type === "player" ? "Ref Name" : (type === "npc" ? "Short" : "Monster"),
        placeholder: type === "player" ? "e.g., Bob" : (type === "npc" ? "e.g., Guard1" : "e.g., Goblin"),
        inputType: "text"
    });

    // Autocomplete for monsters
    if (type === "monster") {
        const input = nameWrap.querySelector("input");
        attachAutocomplete(input);
    }

    // Full name / Qty field
    const fullWrap = createField({
        type,
        index,
        field: "full",
        label: type === "player" ? "Full Name" : (type === "npc" ? "Name" : "Qty"),
        placeholder: type === "player" ? "e.g., Bob the Brave" : (type === "npc" ? "e.g., City Guard" : "1"),
        inputType: type === "monster" ? "number" : "text",
        defaultValue: type === "monster" ? "1" : undefined,
        min: type === "monster" ? "1" : undefined
    });

    // Location field
    const locWrap = createField({
        type,
        index,
        field: "loc",
        label: "Location (x,y)",
        placeholder: "e.g., 10,12",
        inputType: "text"
    });

    // Extra field (Vis/AC/HP)
    const extraWrap = createExtraField(type, index);

    // Jump button
    const btnWrap = createJumpButton(type, index, onLocationJump);

    // Assemble row based on type
    row.appendChild(chk);

    if (type === "player") {
        row.appendChild(nameWrap);
        row.appendChild(locWrap);
        row.appendChild(extraWrap);
        row.appendChild(btnWrap);
    } else if (type === "npc") {
        row.appendChild(nameWrap);
        row.appendChild(fullWrap);
        row.appendChild(extraWrap);
        row.appendChild(locWrap);
        row.appendChild(btnWrap);
    } else {
        // monster
        row.appendChild(nameWrap);
        row.appendChild(fullWrap);
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
 * Helper: Create jump button
 */
function createJumpButton(type, index, onLocationJump) {
    const btnWrap = document.createElement("div");
    btnWrap.className = "btn-group";

    const moveBtn = document.createElement("button");
    moveBtn.className = "move-btn";
    moveBtn.innerText = "↺";
    moveBtn.title = "Jump on map";

    moveBtn.onclick = () => {
        const locInput = $(`${type}_loc_${index}`);
        if (onLocationJump && locInput) {
            onLocationJump(locInput.value);
        }
    };

    btnWrap.appendChild(moveBtn);
    return btnWrap;
}