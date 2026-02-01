/**
 * /assets/js/avrae/autocomplete.js
 * Autocomplete functionality for monster names
 */

import { state } from './state-manager.js';

/**
 * Attach autocomplete to an input element
 */
export function attachAutocomplete(input) {
    let currentFocus = -1;

    input.addEventListener("input", function () {
        closeAllLists();
        currentFocus = -1;

        const val = this.value.trim();
        if (!val) return;

        const matches = filterMatches(val);
        if (!matches.length) return;

        const list = createAutocompleteList(this);
        matches.forEach((name) => {
            const item = createAutocompleteItem(name, val, () => {
                input.value = name;
                closeAllLists();
            });
            list.appendChild(item);
        });
    });

    input.addEventListener("keydown", function (e) {
        const list = this.parentNode.querySelector(".autocomplete-list");
        if (!list) return;

        const items = list.querySelectorAll(".autocomplete-item");

        if (e.key === "ArrowDown") {
            currentFocus++;
            setActive(items, currentFocus);
            e.preventDefault();
        } else if (e.key === "ArrowUp") {
            currentFocus--;
            setActive(items, currentFocus);
            e.preventDefault();
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (currentFocus > -1 && items[currentFocus]) {
                items[currentFocus].click();
            }
        }
    });

    function closeAllLists(except) {
        document.querySelectorAll(".autocomplete-list").forEach((el) => {
            if (el !== except) el.remove();
        });
    }

    document.addEventListener("click", (e) => {
        closeAllLists(e.target);
    });
}

/**
 * Filter monster names based on input
 */
function filterMatches(val) {
    const lower = val.toLowerCase();
    return state.getMonsterNames()
        .filter((name) => name.toLowerCase().includes(lower))
        .slice(0, 8);
}

/**
 * Create autocomplete list container
 */
function createAutocompleteList(input) {
    const list = document.createElement("div");
    list.className = "autocomplete-list";
    input.parentNode.appendChild(list);
    return list;
}

/**
 * Create individual autocomplete item
 */
function createAutocompleteItem(name, searchVal, onClick) {
    const item = document.createElement("div");
    item.className = "autocomplete-item";

    // Highlight matching part
    const lower = name.toLowerCase();
    const lowerSearch = searchVal.toLowerCase();
    const idx = lower.indexOf(lowerSearch);

    if (idx >= 0) {
        const before = name.substring(0, idx);
        const match = name.substring(idx, idx + searchVal.length);
        const after = name.substring(idx + searchVal.length);
        item.innerHTML = `${before}<strong>${match}</strong>${after}`;
    } else {
        item.textContent = name;
    }

    item.addEventListener("click", onClick);
    return item;
}

/**
 * Set active item in autocomplete list
 */
function setActive(items, index) {
    if (!items.length) return;

    items.forEach((item) => item.classList.remove("autocomplete-active"));

    // Wrap around
    if (index >= items.length) index = 0;
    if (index < 0) index = items.length - 1;

    if (items[index]) {
        items[index].classList.add("autocomplete-active");
        items[index].scrollIntoView({ block: "nearest" });
    }
}