/**
 * @file bestiary-link.js
 * @description Frontend controller for the Bestiary Link application.
 * Manages UI interactions, drag-and-drop file ingestion, clipboard operations,
 * JSON transformation, and rendered D&D 5e statblock previews.
 */

import { convert5eToolsToCritterDB } from './bestiary-converter.js';

// Sample 5e.tools creature data (Adult Black Dragon)
const SAMPLE_5E_TOOLS_CREATURE = {
    name: "Adult Black Dragon",
    size: ["H"],
    type: "dragon",
    source: "CritterDB",
    alignment: ["C", "E"],
    ac: [{ ac: 19, from: [] }],
    hp: { average: 187, formula: "17d12 + 85" },
    speed: { walk: 40, fly: "80", swim: "40" },
    str: 23,
    dex: 14,
    con: 21,
    int: 14,
    wis: 13,
    cha: 17,
    passive: 10,
    cr: "14",
    senses: ["blindsight 60 ft.", "darkvision 120 ft."],
    senseTags: ["B", "D"],
    languages: ["Common", "Draconic"],
    save: { dex: "+7", con: "+10", wis: "+6", cha: "+8" },
    skill: { perception: "+11", stealth: "+7" },
    action: [
        {
            name: "Multiattack",
            entries: ["The dragon can use its Frightful Presence. It then makes three attacks: one with its bite and two with its claws."]
        },
        {
            name: "Bite",
            entries: ["Melee Weapon Attack: +11 to hit, reach 10 ft., one target. Hit: 17 (2d10 + 6) piercing damage plus 4 (1d8) acid damage."]
        },
        {
            name: "Claw",
            entries: ["Melee Weapon Attack: +11 to hit, reach 5 ft., one target. Hit: 13 (2d6 + 6) slashing damage."]
        },
        {
            name: "Tail",
            entries: ["Melee Weapon Attack: +11 to hit, reach 15 ft., one target. Hit: 15 (2d8 + 6) bludgeoning damage."]
        },
        {
            name: "Frightful Presence",
            entries: ["Each creature of the dragon's choice that is within 120 feet of the dragon and aware of it must succeed on a DC 16 Wisdom saving throw or become frightened for 1 minute. A creature can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success. If a creature's saving throw is successful or the effect ends for it, the creature is immune to the dragon's Frightful Presence for the next 24 hours."]
        },
        {
            name: "Acid Breath (Recharge 5-6)",
            entries: ["The dragon exhales acid in a 60-foot line that is 5 feet wide. Each creature in that line must make a DC 18 Dexterity saving throw, taking 54 (12d8) acid damage on a failed save, or half as much damage on a successful one."]
        }
    ],
    immune: ["acid"],
    vulnerable: [],
    resist: [],
    conditionImmune: [],
    trait: [
        {
            name: "Amphibious",
            entries: ["The dragon can breathe air and water."]
        },
        {
            name: "Legendary Resistance (3/Day)",
            entries: ["If the dragon fails a saving throw, it can choose to succeed instead."]
        }
    ],
    reaction: [],
    legendary: [
        {
            name: "Detect",
            entries: ["The dragon makes a Wisdom (Perception) check."]
        },
        {
            name: "Tail Attack",
            entries: ["The dragon makes a tail attack."]
        },
        {
            name: "Wing Attack (Costs 2 Actions)",
            entries: ["The dragon beats its wings. Each creature within 10 ft. of the dragon must succeed on a DC 19 Dexterity saving throw or take 13 (2d6 + 6) bludgeoning damage and be knocked prone. The dragon can then fly up to half its flying speed."]
        }
    ],
    environment: [""],
    isNamedCreature: false
};

// UI Element references
let inputArea;
let outputArea;
let errorBanner;
let inputStatus;
let outputStatus;
let bestiaryIdInput;
let compactToggle;
let statblockSection;
let statblockContainer;
let copyBtn;

let debounceTimer = null;
let lastConvertedResult = null;

/**
 * Initializes the application once the DOM is ready.
 */
export function initApp() {
    inputArea = document.getElementById('input-json');
    outputArea = document.getElementById('output-json');
    errorBanner = document.getElementById('error-banner');
    inputStatus = document.getElementById('input-status');
    outputStatus = document.getElementById('output-status');
    bestiaryIdInput = document.getElementById('bestiary-id-input');
    compactToggle = document.getElementById('compact-toggle');
    statblockSection = document.getElementById('preview-section');
    statblockContainer = document.getElementById('statblock-container');
    copyBtn = document.getElementById('copy-btn');

    if (!inputArea || !outputArea) return;

    // Attach event listeners
    inputArea.addEventListener('input', handleInput);
    document.getElementById('convert-btn')?.addEventListener('click', () => runConversion(true));
    document.getElementById('clear-btn')?.addEventListener('click', handleClear);
    document.getElementById('paste-btn')?.addEventListener('click', handlePaste);
    document.getElementById('sample-btn')?.addEventListener('click', handleLoadSample);
    copyBtn?.addEventListener('click', handleCopy);
    document.getElementById('download-btn')?.addEventListener('click', handleDownload);
    compactToggle?.addEventListener('change', () => runConversion(false));
    bestiaryIdInput?.addEventListener('input', () => runConversion(false));

    // File Drag & Drop support
    setupDragAndDrop(inputArea);

    // Initial state check
    if (inputArea.value.trim()) {
        runConversion(false);
    }
}

/**
 * Handles changes to the input textarea with debouncing.
 */
function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        runConversion(false);
    }, 250);
}

/**
 * Sets up drag and drop of .json files onto the input textarea.
 * @param {HTMLElement} dropZone - Drop target element.
 */
function setupDragAndDrop(dropZone) {
    ['dragenter', 'dragover'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.boxShadow = 'inset 0 0 0 2px var(--palette-brand-accent)';
        });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.boxShadow = '';
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                inputArea.value = event.target?.result || '';
                runConversion(true);
            };
            reader.readAsText(file);
        }
    });
}

/**
 * Runs the conversion from 5e.tools format to CritterDB format.
 * @param {boolean} isExplicit - Whether invoked explicitly via button click.
 */
export function runConversion(isExplicit = false) {
    const rawInput = inputArea.value.trim();

    if (!rawInput) {
        clearError();
        outputArea.value = '';
        lastConvertedResult = null;
        updateStatuses('', '');
        renderStatblock(null);
        return;
    }

    try {
        const customBestiaryId = bestiaryIdInput?.value.trim() || undefined;
        const result = convert5eToolsToCritterDB(rawInput, {
            bestiaryId: customBestiaryId
        });

        lastConvertedResult = result;
        clearError();

        // Format output JSON
        const isCompact = compactToggle?.checked || false;
        const formatted = isCompact ? JSON.stringify(result) : JSON.stringify(result, null, 2);
        outputArea.value = formatted;

        // Update status lines
        const isArray = Array.isArray(result);
        const count = isArray ? result.length : 1;
        const name = isArray ? (result[0]?.name || 'Creature') + ` (+${count - 1} more)` : result.name;
        const inBytes = new Blob([rawInput]).size;
        const outBytes = new Blob([formatted]).size;

        updateStatuses(
            `${inBytes} bytes | 5e.tools`,
            `${count} creature${count > 1 ? 's' : ''} converted (${name}) | ${outBytes} bytes`
        );

        // Render preview
        renderStatblock(isArray ? result[0] : result);
    } catch (err) {
        lastConvertedResult = null;
        showError(err.message);
        if (isExplicit) {
            outputArea.value = '';
            renderStatblock(null);
        }
    }
}

/**
 * Loads the Adult Black Dragon sample creature into the input area and converts it.
 */
function handleLoadSample() {
    inputArea.value = JSON.stringify(SAMPLE_5E_TOOLS_CREATURE, null, 2);
    runConversion(true);
}

/**
 * Clears the input and output editors.
 */
function handleClear() {
    inputArea.value = '';
    outputArea.value = '';
    lastConvertedResult = null;
    clearError();
    updateStatuses('', '');
    renderStatblock(null);
    inputArea.focus();
}

/**
 * Pastes clipboard content directly into the input editor.
 */
async function handlePaste() {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            inputArea.value = text;
            runConversion(true);
        }
    } catch (err) {
        showError('Unable to read clipboard. Please paste manually into the input box.');
    }
}

/**
 * Copies the converted output JSON to the system clipboard.
 */
async function handleCopy() {
    const text = outputArea.value;
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);
        if (copyBtn) {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span>✓ Copied!</span>';
            copyBtn.style.borderColor = 'var(--palette-success)';
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.style.borderColor = '';
            }, 2000);
        }
    } catch (err) {
        showError('Failed to copy text to clipboard.');
    }
}

/**
 * Initiates browser download of the converted JSON file.
 */
function handleDownload() {
    const text = outputArea.value;
    if (!text) return;

    let filename = 'critterdb-creature.json';
    if (lastConvertedResult) {
        if (Array.isArray(lastConvertedResult)) {
            filename = 'critterdb-bestiary.json';
        } else if (lastConvertedResult.name) {
            filename = `${lastConvertedResult.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-critterdb.json`;
        }
    }

    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Displays an error message banner.
 * @param {string} msg - Error description.
 */
function showError(msg) {
    if (errorBanner) {
        errorBanner.textContent = `⚠️ ${msg}`;
        errorBanner.style.display = 'block';
    }
}

/**
 * Hides the error banner.
 */
function clearError() {
    if (errorBanner) {
        errorBanner.textContent = '';
        errorBanner.style.display = 'none';
    }
}

/**
 * Updates status bar labels.
 * @param {string} inMsg - Input status text.
 * @param {string} outMsg - Output status text.
 */
function updateStatuses(inMsg, outMsg) {
    if (inputStatus) inputStatus.textContent = inMsg;
    if (outputStatus) outputStatus.textContent = outMsg;
}

/**
 * Renders an interactive D&D 5e statblock card for visual verification.
 * @param {object|null} creature - CritterDB creature object.
 */
function renderStatblock(creature) {
    if (!statblockContainer || !statblockSection) return;

    if (!creature || !creature.stats) {
        statblockSection.style.display = 'none';
        statblockContainer.innerHTML = '';
        return;
    }

    const s = creature.stats;
    const scores = s.abilityScores || { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
    const scoreStrs = s.abilityScoreStrs || {};

    const saves = (s.savingThrows || []).map((st) => st.modifierStr).join(', ');
    const skills = (s.skills || []).map((sk) => sk.modifierStr).join(', ');
    const imm = (s.damageImmunities || []).join(', ');
    const res = (s.damageResistances || []).join(', ');
    const vul = (s.damageVulnerabilities || []).join(', ');
    const cond = (s.conditionImmunities || []).join(', ');
    const senses = (s.senses || []).join(', ');
    const langs = (s.languages || []).join(', ');

    const renderList = (items, heading) => {
        if (!items || items.length === 0) return '';
        const entries = items
            .map(
                (item) => `
            <div class="statblock-entry">
                <span class="statblock-entry-name">${escapeHtml(item.name)}.</span>
                ${escapeHtml(item.description)}
            </div>`
            )
            .join('');
        return `
            <hr class="statblock-divider">
            <h3 style="margin: 0.5rem 0 0.25rem 0; font-size: 1.1rem; color: var(--color-primary);">${heading}</h3>
            ${entries}
        `;
    };

    statblockContainer.innerHTML = `
        <div class="statblock-card">
            <h2 class="statblock-name">${escapeHtml(creature.name || 'Unnamed Creature')}</h2>
            <div class="statblock-meta">${escapeHtml(s.size || 'Medium')} ${escapeHtml(s.race || '')}, ${escapeHtml(s.alignment || 'unaligned')}</div>
            <hr class="statblock-divider">
            
            <div class="statblock-line"><strong>Armor Class</strong> ${s.armorClass || 10} ${s.armorType ? `(${escapeHtml(s.armorType)})` : ''}</div>
            <div class="statblock-line"><strong>Hit Points</strong> ${escapeHtml(s.hitPointsStr || String(s.hitPoints || 10))}</div>
            <div class="statblock-line"><strong>Speed</strong> ${escapeHtml(s.speed || '30 ft.')}</div>
            
            <hr class="statblock-divider">
            <table class="statblock-abilities-table">
                <thead>
                    <tr>
                        <th>STR</th><th>DEX</th><th>CON</th><th>INT</th><th>WIS</th><th>CHA</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>${scoreStrs.strength || scores.strength}</td>
                        <td>${scoreStrs.dexterity || scores.dexterity}</td>
                        <td>${scoreStrs.constitution || scores.constitution}</td>
                        <td>${scoreStrs.intelligence || scores.intelligence}</td>
                        <td>${scoreStrs.wisdom || scores.wisdom}</td>
                        <td>${scoreStrs.charisma || scores.charisma}</td>
                    </tr>
                </tbody>
            </table>
            
            <hr class="statblock-divider">
            ${saves ? `<div class="statblock-line"><strong>Saving Throws</strong> ${escapeHtml(saves)}</div>` : ''}
            ${skills ? `<div class="statblock-line"><strong>Skills</strong> ${escapeHtml(skills)}</div>` : ''}
            ${vul ? `<div class="statblock-line"><strong>Damage Vulnerabilities</strong> ${escapeHtml(vul)}</div>` : ''}
            ${res ? `<div class="statblock-line"><strong>Damage Resistances</strong> ${escapeHtml(res)}</div>` : ''}
            ${imm ? `<div class="statblock-line"><strong>Damage Immunities</strong> ${escapeHtml(imm)}</div>` : ''}
            ${cond ? `<div class="statblock-line"><strong>Condition Immunities</strong> ${escapeHtml(cond)}</div>` : ''}
            <div class="statblock-line"><strong>Senses</strong> ${senses ? `${escapeHtml(senses)}, ` : ''}passive Perception ${s.passivePerception || 10}</div>
            <div class="statblock-line"><strong>Languages</strong> ${escapeHtml(langs || '—')}</div>
            <div class="statblock-line"><strong>Challenge</strong> ${escapeHtml(s.challengeRatingStr || '0')} (${(s.experiencePoints || 0).toLocaleString()} XP)</div>
            
            ${renderList(s.additionalAbilities, 'Traits')}
            ${renderList(s.actions, 'Actions')}
            ${renderList(s.reactions, 'Reactions')}
            ${renderList(s.legendaryActions, 'Legendary Actions')}
        </div>
    `;

    statblockSection.style.display = 'block';
}

/**
 * Escapes HTML characters for safe rendering.
 * @param {string} str - Raw string.
 * @returns {string} Escaped string.
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Automatically initialize if in browser environment
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
}
