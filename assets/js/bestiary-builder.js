/**
 * @file bestiary-builder.js
 * @description Frontend controller for the Custom Bestiary Builder.
 * Manages monster index search, list assembly, 5e.tools data retrieval,
 * CritterDB JSON transformation (with dot-prepending), and file export.
 */

import {
    fuzzySearchMonsters,
    prependMonsterName,
    buildCritterDBBestiary,
    downloadJsonFile,
    verifyUserAuthorization,
    ALLOWED_USER_ID
} from './bestiary-builder-core.js';
import { supabase } from './supabaseClient.js';

// Application state
const state = {
    index: [],
    selected: [],
    fileCache: new Map(),
    currentJson: null,
    baseUrl: ''
};

// UI Elements
let authGatePanel;
let builderAppPanel;
let gateMessage;
let gateLoginBtn;
let searchInput;
let clearSearchBtn;
let sourceFilter;
let crFilter;
let resultsContainer;
let resultsCountEl;
let selectedContainer;
let selectedCountBadge;
let clearSelectedBtn;
let bestiaryNameInput;
let bestiaryDescInput;
let createBestiaryBtn;
let outputSection;
let outputTextarea;
let downloadBtn;
let copyBtn;
let toastEl;

/**
 * Shows a brief floating toast message.
 * @param {string} message - Text to display.
 */
function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 2800);
}

/**
 * Initializes base URL for asset and bestiary fetches.
 */
function initBaseUrl() {
    const metaBase = document.querySelector('meta[name="baseurl"]')?.getAttribute('content');
    if (metaBase) {
        state.baseUrl = metaBase;
    } else if (window.location.pathname.startsWith('/codex')) {
        state.baseUrl = '/codex';
    } else {
        state.baseUrl = '';
    }
}

/**
 * Loads the precomputed monster index.
 */
async function loadMonsterIndex() {
    const paths = [
        `${state.baseUrl}/bestiary/monster-index.json`,
        `${state.baseUrl}/assets/data/monster-index.json`,
        '/codex/bestiary/monster-index.json',
        '/bestiary/monster-index.json'
    ];

    for (const url of paths) {
        try {
            const resp = await fetch(url);
            if (resp.ok) {
                state.index = await resp.json();
                console.log(`Loaded ${state.index.length} monsters from ${url}`);
                populateFilters();
                renderSearchResults();
                return;
            }
        } catch (e) {
            // Try next path
        }
    }

    resultsContainer.innerHTML = `
        <div class="empty-state">
            <span class="empty-state-icon">⚠️</span>
            <p>Could not load monster index. Please ensure <code>monster-index.json</code> is accessible.</p>
        </div>
    `;
}

/**
 * Populates Source and CR filter dropdowns based on available monsters.
 */
function populateFilters() {
    if (!state.index.length) return;

    const sources = new Set();
    const crs = new Set();

    for (const m of state.index) {
        if (m.source) sources.add(m.source);
        if (m.cr !== undefined && m.cr !== '') crs.add(String(m.cr));
    }

    // Populate Sources
    const sortedSources = Array.from(sources).sort();
    for (const src of sortedSources) {
        const opt = document.createElement('option');
        opt.value = src;
        opt.textContent = src;
        sourceFilter.appendChild(opt);
    }

    // Sort CRs naturally
    const crValue = (crStr) => {
        if (crStr.includes('/')) {
            const [num, den] = crStr.split('/').map(Number);
            return den ? num / den : 0;
        }
        return parseFloat(crStr) || 0;
    };

    const sortedCrs = Array.from(crs).sort((a, b) => crValue(a) - crValue(b));
    for (const cr of sortedCrs) {
        const opt = document.createElement('option');
        opt.value = cr;
        opt.textContent = `CR ${cr}`;
        crFilter.appendChild(opt);
    }
}

/**
 * Renders the search results based on current query and filters.
 */
function renderSearchResults() {
    const query = searchInput.value.trim();
    const source = sourceFilter.value;
    const cr = crFilter.value;

    clearSearchBtn.style.display = query ? 'block' : 'none';

    if (!state.index.length) return;

    const results = fuzzySearchMonsters(query, state.index, {
        source: source,
        cr: cr,
        limit: 60
    });

    resultsCountEl.textContent = `Found ${results.length} monsters`;

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon">🔍</span>
                <p>No monsters matching "<strong>${escapeHtml(query)}</strong>"</p>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const monster of results) {
        const itemEl = document.createElement('div');
        itemEl.className = 'monster-item';

        const infoEl = document.createElement('div');
        infoEl.className = 'monster-info';

        const nameRow = document.createElement('div');
        nameRow.className = 'monster-name-row';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'monster-name';
        nameSpan.textContent = monster.name;
        nameRow.appendChild(nameSpan);

        const tagList = document.createElement('div');
        tagList.className = 'tag-list';

        if (monster.cr !== undefined) {
            const crTag = document.createElement('span');
            crTag.className = 'tag tag-cr';
            crTag.textContent = `CR ${monster.cr}`;
            tagList.appendChild(crTag);
        }

        if (monster.source) {
            const srcTag = document.createElement('span');
            srcTag.className = 'tag tag-source';
            srcTag.textContent = monster.source;
            tagList.appendChild(srcTag);
        }

        if (monster.type) {
            const typeTag = document.createElement('span');
            typeTag.className = 'tag tag-type';
            typeTag.textContent = monster.type;
            tagList.appendChild(typeTag);
        }

        nameRow.appendChild(tagList);
        infoEl.appendChild(nameRow);

        const subInfo = document.createElement('div');
        subInfo.className = 'monster-stats-sub';
        subInfo.textContent = monster.file ? `File: ${monster.file}` : '';
        infoEl.appendChild(subInfo);

        const addBtn = document.createElement('button');
        addBtn.className = 'builder-btn builder-btn-sm';
        addBtn.innerHTML = '＋ Add';
        addBtn.title = `Add ${monster.name} to custom bestiary`;
        addBtn.addEventListener('click', () => {
            addMonsterToSelected(monster);
        });

        itemEl.appendChild(infoEl);
        itemEl.appendChild(addBtn);
        fragment.appendChild(itemEl);
    }

    resultsContainer.innerHTML = '';
    resultsContainer.appendChild(fragment);
}

/**
 * Adds a monster entry to the selected bestiary list.
 * @param {object} monster - Monster index item.
 */
function addMonsterToSelected(monster) {
    const item = {
        ...monster,
        id: `${monster.source}_${monster.name}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    };

    state.selected.push(item);
    renderSelectedList();
    showToast(`Added ${monster.name} to custom bestiary`);
}

/**
 * Removes an item from the selected list by unique id.
 * @param {string} id - Selected item id.
 */
function removeMonsterFromSelected(id) {
    const index = state.selected.findIndex((m) => m.id === id);
    if (index !== -1) {
        const removed = state.selected.splice(index, 1)[0];
        renderSelectedList();
        showToast(`Removed ${removed.name}`);
    }
}

/**
 * Clears all selected monsters.
 */
function clearAllSelected() {
    if (!state.selected.length) return;
    state.selected = [];
    renderSelectedList();
    showToast('Cleared all selected monsters');
}

/**
 * Renders the list of currently selected monsters for the bestiary.
 */
function renderSelectedList() {
    selectedCountBadge.textContent = `${state.selected.length}`;
    createBestiaryBtn.disabled = state.selected.length === 0;

    if (state.selected.length === 0) {
        selectedContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon">📋</span>
                <p>No monsters added yet.</p>
                <span style="font-size: 0.8rem; color: var(--color-text-muted);">
                    Use the search panel on the left and click <strong>"＋ Add"</strong> to build your list.
                </span>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();

    state.selected.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'selected-item';

        const leftCol = document.createElement('div');
        leftCol.className = 'monster-info';

        const nameRow = document.createElement('div');
        nameRow.className = 'monster-name-row';

        // Show dot-prefixed preview
        const dotPreview = document.createElement('span');
        dotPreview.className = 'dot-prefix-tag';
        dotPreview.textContent = prependMonsterName(item.name);
        nameRow.appendChild(dotPreview);

        const tags = document.createElement('div');
        tags.className = 'tag-list';

        if (item.cr !== undefined) {
            const crTag = document.createElement('span');
            crTag.className = 'tag tag-cr';
            crTag.textContent = `CR ${item.cr}`;
            tags.appendChild(crTag);
        }

        if (item.source) {
            const srcTag = document.createElement('span');
            srcTag.className = 'tag tag-source';
            srcTag.textContent = item.source;
            tags.appendChild(srcTag);
        }

        nameRow.appendChild(tags);
        leftCol.appendChild(nameRow);

        const actionsCol = document.createElement('div');
        actionsCol.className = 'selected-actions';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'builder-btn builder-btn-sm builder-btn-danger';
        removeBtn.innerHTML = '✕';
        removeBtn.title = 'Remove from list';
        removeBtn.addEventListener('click', () => {
            removeMonsterFromSelected(item.id);
        });

        actionsCol.appendChild(removeBtn);
        row.appendChild(leftCol);
        row.appendChild(actionsCol);
        fragment.appendChild(row);
    });

    selectedContainer.innerHTML = '';
    selectedContainer.appendChild(fragment);
}

/**
 * Fetches and caches a bestiary file from /bestiary/*.json.
 * @param {string} file - Bestiary filename (e.g. "bestiary-mm.json").
 * @returns {Promise<object>} Parsed 5e.tools bestiary JSON.
 */
async function fetchBestiaryFile(file) {
    if (state.fileCache.has(file)) {
        return state.fileCache.get(file);
    }

    const fetchPromise = (async () => {
        const urls = [
            `${state.baseUrl}/bestiary/${file}`,
            `/codex/bestiary/${file}`,
            `/bestiary/${file}`
        ];

        for (const url of urls) {
            try {
                const resp = await fetch(url);
                if (resp.ok) {
                    return await resp.json();
                }
            } catch (e) {
                // Try next
            }
        }
        throw new Error(`Failed to load bestiary file: ${file}`);
    })();

    state.fileCache.set(file, fetchPromise);
    return fetchPromise;
}

/**
 * Creates the custom bestiary JSON with dot-prefixed monster names.
 */
async function handleCreateCustomBestiary() {
    if (!state.selected.length) return;

    createBestiaryBtn.disabled = true;
    const originalText = createBestiaryBtn.innerHTML;
    createBestiaryBtn.innerHTML = '<span class="spinner"></span> Assembling Monsters...';

    try {
        // Group by bestiary file to minimize parallel lookups
        const rawMonsters = [];

        for (const selectedItem of state.selected) {
            const fileData = await fetchBestiaryFile(selectedItem.file);
            let raw = null;

            if (Array.isArray(fileData.monster)) {
                // Primary check by index
                if (selectedItem.index !== undefined && fileData.monster[selectedItem.index]) {
                    const candidate = fileData.monster[selectedItem.index];
                    if (candidate.name === selectedItem.name) {
                        raw = candidate;
                    }
                }

                // Fallback check by name if index shifted
                if (!raw) {
                    raw = fileData.monster.find((m) => m.name === selectedItem.name);
                }
            }

            if (!raw) {
                throw new Error(`Monster "${selectedItem.name}" not found in ${selectedItem.file}`);
            }

            // Deep clone so modifications do not affect cache
            rawMonsters.push(JSON.parse(JSON.stringify(raw)));
        }

        // Build the CritterDB Bestiary JSON
        const bestiaryName = bestiaryNameInput.value.trim() || 'Custom Bestiary';
        const bestiaryDesc = bestiaryDescInput.value.trim() || '';

        const critterDbBestiary = buildCritterDBBestiary(rawMonsters, {
            name: bestiaryName,
            description: bestiaryDesc
        });

        state.currentJson = JSON.stringify(critterDbBestiary, null, 2);

        // Display in output textarea
        outputTextarea.value = state.currentJson;
        outputSection.style.display = 'block';

        // Scroll to output section
        outputSection.scrollIntoView({ behavior: 'smooth' });

        showToast(`Bestiary "${bestiaryName}" created with ${critterDbBestiary.creatures.length} monsters!`);
    } catch (err) {
        console.error('Error creating bestiary:', err);
        alert(`Error creating custom bestiary: ${err.message}`);
    } finally {
        createBestiaryBtn.disabled = false;
        createBestiaryBtn.innerHTML = originalText;
    }
}

/**
 * Downloads the currently generated Bestiary JSON file.
 */
function handleDownload() {
    if (!state.currentJson) return;
    const rawName = bestiaryNameInput.value.trim() || 'custom-bestiary';
    const safeFilename = rawName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '');
    downloadJsonFile(state.currentJson, `${safeFilename || 'custom-bestiary'}.json`);
    showToast(`Downloaded ${safeFilename || 'custom-bestiary'}.json`);
}

/**
 * Copies the currently generated Bestiary JSON to clipboard.
 */
function handleCopy() {
    if (!state.currentJson) return;
    navigator.clipboard.writeText(state.currentJson).then(
        () => {
            showToast('Bestiary JSON copied to clipboard!');
        },
        () => {
            outputTextarea.select();
            document.execCommand('copy');
            showToast('Bestiary JSON copied to clipboard!');
        }
    );
}

/**
 * Helper to escape HTML characters in templates.
 * @param {string} str - Raw string.
 * @returns {string} Escaped string.
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Debounce utility for fast search typing.
 * @param {Function} fn - Function to debounce.
 * @param {number} delay - Milliseconds delay.
 * @returns {Function}
 */
function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Verifies Supabase Discord authentication and restricts access to ALLOWED_USER_ID.
 */
function initAuth() {
    window.addEventListener('dmToolsAccessGranted', () => {
        if (!state.index.length) {
            loadMonsterIndex();
        }
    });

    // If centralized DM tools gate is present, it manages the gate UI
    if (document.getElementById('dm-tools-gate')) {
        return;
    }

    let pollCount = 0;
    const MAX_POLLS = 50;

    const checkAuth = async () => {
        if (window.authManager) {
            window.authManager.init(async (user) => {
                if (!user) {
                    if (authGatePanel) authGatePanel.style.display = 'flex';
                    if (builderAppPanel) builderAppPanel.style.display = 'none';
                    if (gateMessage) gateMessage.textContent = 'Please log in with Discord to access the Custom Bestiary Builder.';
                    if (gateLoginBtn) gateLoginBtn.style.display = 'inline-flex';
                    return;
                }

                if (gateMessage) gateMessage.textContent = 'Verifying permissions...';
                if (gateLoginBtn) gateLoginBtn.style.display = 'none';

                const authResult = await verifyUserAuthorization(user.id, supabase);

                if (!authResult.authorized) {
                    if (authGatePanel) authGatePanel.style.display = 'flex';
                    if (builderAppPanel) builderAppPanel.style.display = 'none';
                    if (gateMessage) {
                        gateMessage.innerHTML = '⛔ <strong>Access Denied:</strong> This page is restricted to authorized DM accounts.';
                    }
                    if (gateLoginBtn) gateLoginBtn.style.display = 'none';
                    return;
                }

                // Authorized successfully!
                if (authGatePanel) authGatePanel.style.display = 'none';
                if (builderAppPanel) builderAppPanel.style.display = 'block';

                if (!state.index.length) {
                    loadMonsterIndex();
                }
            });
        } else {
            pollCount++;
            if (pollCount > MAX_POLLS) {
                if (gateMessage) gateMessage.textContent = 'Authentication service unavailable. Please refresh.';
                return;
            }
            setTimeout(checkAuth, 100);
        }
    };

    checkAuth();
}

/**
 * Main DOM setup and event bindings.
 */
document.addEventListener('DOMContentLoaded', () => {
    initBaseUrl();

    // Bind DOM elements
    authGatePanel = document.getElementById('auth-gate-panel');
    builderAppPanel = document.getElementById('builder-app-panel');
    gateMessage = document.getElementById('gate-message');
    gateLoginBtn = document.getElementById('gate-login-btn');

    searchInput = document.getElementById('search-input');
    clearSearchBtn = document.getElementById('clear-search-btn');
    sourceFilter = document.getElementById('source-filter');
    crFilter = document.getElementById('cr-filter');
    resultsContainer = document.getElementById('results-container');
    resultsCountEl = document.getElementById('results-count');
    selectedContainer = document.getElementById('selected-container');
    selectedCountBadge = document.getElementById('selected-count-badge');
    clearSelectedBtn = document.getElementById('clear-selected-btn');
    bestiaryNameInput = document.getElementById('bestiary-name-input');
    bestiaryDescInput = document.getElementById('bestiary-desc-input');
    createBestiaryBtn = document.getElementById('create-bestiary-btn');
    outputSection = document.getElementById('output-section');
    outputTextarea = document.getElementById('output-textarea');
    downloadBtn = document.getElementById('download-btn');
    copyBtn = document.getElementById('copy-btn');
    toastEl = document.getElementById('builder-toast');

    // Attach listeners
    if (gateLoginBtn) {
        gateLoginBtn.addEventListener('click', () => {
            window.authManager?.login();
        });
    }

    searchInput.addEventListener('input', debounce(renderSearchResults, 120));
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        renderSearchResults();
        searchInput.focus();
    });

    sourceFilter.addEventListener('change', renderSearchResults);
    crFilter.addEventListener('change', renderSearchResults);

    clearSelectedBtn.addEventListener('click', clearAllSelected);
    createBestiaryBtn.addEventListener('click', handleCreateCustomBestiary);
    downloadBtn.addEventListener('click', handleDownload);
    copyBtn.addEventListener('click', handleCopy);

    // Initial render & auth check
    renderSelectedList();
    initAuth();
});
