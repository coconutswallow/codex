/**
 * /assets/js/avrae/monster-manager.js
 * Logic for managing the 'tokens' table in Supabase.
 * Restricted to site administrators.
 */

import { supabase } from '../supabaseClient.js';
import { updateToken, deleteToken, createToken } from './data-manager.js';

const MODULE = "MonsterManager";
let allTokens = [];
let filteredTokens = [];
let currentSearch = "";
let currentUser = null;
const baseUrl = window.siteBaseUrl || "";
const placeholder = `${baseUrl}/assets/images/tokens/coconut.png`;

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initApp());
} else {
    initApp();
}

async function initApp() {
    let pollCount = 0;
    const MAX_POLLS = 50;

    const checkAuth = async () => {
        if (window.authManager) {
            console.log(`[${MODULE}] authManager found, initializing...`);
            window.authManager.init(async (user) => {
                if (!user) {
                    console.log(`[${MODULE}] No user session found.`);
                    showGate("Please log in with Discord.");
                    return;
                }
                currentUser = user;
                console.log(`[${MODULE}] User authenticated: ${user.id}`);
                await checkAdminAccess(user.id);
            });
        } else {
            pollCount++;
            if (pollCount > MAX_POLLS) {
                console.error(`[${MODULE}] authManager not found after 5 seconds`);
                showGate("Initialization error: Auth Manager missing.");
                return;
            }
            setTimeout(checkAuth, 100);
        }
    };

    checkAuth();
}

/**
 * Creates a new token entry.
 */
window.createNewToken = async function() {
    const nameInput = document.getElementById('new-name');
    const typeInput = document.getElementById('new-type');
    const sizeInput = document.getElementById('new-size');

    const name = nameInput.value.trim();
    const type = typeInput.value;
    const size = sizeInput.value;

    if (!name) return alert("Please enter a name for the new token.");

    try {
        const newToken = await createToken({
            name: name,
            type: type,
            size: size,
            user_id: currentUser ? currentUser.id : null
        });

        // Add to local state
        allTokens.unshift(newToken);
        applyFilter();

        // Clear inputs
        nameInput.value = "";
        alert(`Token "${name}" created successfully!`);

    } catch (e) {
        console.error(`[${MODULE}] createNewToken failed`, e);
        alert("Failed to create new token.");
    }
}

/**
 * Verifies if the user is a site admin.
 */
async function checkAdminAccess(userId) {
    try {
        console.log(`[${MODULE}] Checking role for user: ${userId}`);
        const { data, error } = await supabase
            .from('CCS_discord_users')
            .select('roles')
            .eq('user_id', userId)
            .single();

        if (error) {
            console.error(`[${MODULE}] Admin check error:`, error);
            showGate(`Access Denied: Error verifying permissions (${error.message}).`);
            return;
        }

        console.log(`[${MODULE}] Retrieved roles:`, data?.roles);
        const isAdmin = data?.roles && Array.isArray(data.roles) && data.roles.includes('Admin');

        if (!isAdmin) {
            console.warn(`[${MODULE}] User is not an Admin.`);
            showGate("Access Denied: Administrator privileges required.");
            return;
        }

        console.log(`[${MODULE}] Admin access granted.`);
        // Access granted
        document.getElementById('auth-gate-panel').style.display = 'none';
        document.getElementById('manager-app-panel').style.display = 'flex';
        await fetchTokens();

    } catch (e) {
        console.error(`[${MODULE}] checkAdminAccess failed`, e);
        showGate("An error occurred while verifying access.");
    }
}

/**
 * Shows an error/instruction gate message.
 */
function showGate(message) {
    const gatePanel = document.getElementById('auth-gate-panel');
    const appPanel = document.getElementById('manager-app-panel');
    const gateMessage = document.getElementById('gate-message');

    if (gatePanel && appPanel && gateMessage) {
        gateMessage.textContent = message;
        gatePanel.style.display = 'flex';
        appPanel.style.display = 'none';
    }
}

/**
 * Fetches all tokens from Supabase.
 */
async function fetchTokens() {
    try {
        const { data, error } = await supabase
            .from('CCS_tokens')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        allTokens = (data || []).map(t => {
            // Safety check for ANY old hardcoded or placeholder paths in DB
            if (t.image_url && (t.image_url.includes("placeholder") || t.image_url.includes("assets/img"))) {
                console.warn(`[${MODULE}] Fixing broken/placeholder image URL for "${t.name}":`, t.image_url);
                t.image_url = ""; 
            }
            return t;
        });
        applyFilter();

    } catch (e) {
        console.error(`[${MODULE}] fetchTokens failed`, e);
        alert("Failed to fetch tokens from database.");
    }
}

/**
 * Filters the token list based on the search query.
 */
window.handleSearch = function(query) {
    currentSearch = query.toLowerCase();
    applyFilter();
}

function applyFilter() {
    filteredTokens = allTokens.filter(t => {
        return (t.name || "").toLowerCase().includes(currentSearch) ||
               (t.type || "").toLowerCase().includes(currentSearch);
    });
    renderTable();
}

/**
 * Renders the monster table.
 */
function renderTable() {
    const tableBody = document.getElementById('monster-table-body');
    if (!tableBody) return;

    if (filteredTokens.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="no-results">No monsters found matching "${currentSearch}"</td></tr>`;
        return;
    }

    tableBody.innerHTML = filteredTokens.map(token => {
        return `
            <tr id="row-${token.id}">
                <td style="width: 50px;">
                    <img src="${token.image_url || placeholder}" 
                         class="thumbnail" 
                         onerror="this.src='${placeholder}'">
                </td>
                <td class="item-control">
                    <input type="text" value="${token.name || ''}" 
                           onchange="markDirty('${token.id}')" 
                           id="name-${token.id}" 
                           style="font-weight: bold; color: var(--accent);">
                    <select onchange="markDirty('${token.id}')" id="type-${token.id}" style="margin-top: 4px; font-size: 0.8em; color: var(--blur);">
                        <option value="Monsters" ${token.type === 'Monsters' ? 'selected' : ''}>Monsters</option>
                        <option value="Players" ${token.type === 'Players' ? 'selected' : ''}>Players</option>
                    </select>
                </td>
                <td class="item-control">
                    <input type="text" value="${token.token_code || ''}" 
                           onchange="markDirty('${token.id}')" 
                           id="token_code-${token.id}" 
                           placeholder="Avrae Code/URL">
                </td>
                <td class="item-control" style="width: 120px;">
                    <select onchange="markDirty('${token.id}')" id="size-${token.id}">
                        <option value="Tiny" ${token.size === 'Tiny' ? 'selected' : ''}>Tiny</option>
                        <option value="Small" ${token.size === 'Small' ? 'selected' : ''}>Small</option>
                        <option value="Medium" ${token.size === 'Medium' ? 'selected' : ''}>Medium</option>
                        <option value="Large" ${token.size === 'Large' ? 'selected' : ''}>Large</option>
                        <option value="Huge" ${token.size === 'Huge' ? 'selected' : ''}>Huge</option>
                        <option value="Gargantuan" ${token.size === 'Gargantuan' ? 'selected' : ''}>Gargantuan</option>
                    </select>
                </td>
                <td class="item-control">
                    <input type="text" value="${token.image_url || ''}" 
                           onchange="markDirty('${token.id}')" 
                           id="image_url-${token.id}" 
                           placeholder="External Image URL">
                </td>
                <td style="display: flex; gap: 4px; align-items: center; justify-content: flex-start; height: 100%;">
                    <button class="save-btn" id="save-${token.id}" disabled onclick="saveToken('${token.id}')">Save</button>
                    <button class="save-btn" style="background: var(--danger); color: white;" onclick="confirmDelete('${token.id}', '${token.name}')">Del</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Enables the save button when an input changes.
 */
window.markDirty = function(id) {
    const saveBtn = document.getElementById(`save-${id}`);
    if (saveBtn) {
        saveBtn.disabled = false;
    }
}

/**
 * Saves changes to Supabase.
 */
window.saveToken = async function(id) {
    const saveBtn = document.getElementById(`save-${id}`);
    const name = document.getElementById(`name-${id}`).value;
    const type = document.getElementById(`type-${id}`).value;
    const tokenCode = document.getElementById(`token_code-${id}`).value;
    const size = document.getElementById(`size-${id}`).value;
    const imageUrl = document.getElementById(`image_url-${id}`).value;

    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;

    try {
        await updateToken(id, {
            name: name,
            type: type,
            token_code: tokenCode,
            size: size,
            image_url: imageUrl
        });

        // Update local state
        const token = allTokens.find(t => t.id === id);
        if (token) {
            token.name = name;
            token.type = type;
            token.token_code = tokenCode;
            token.size = size;
            token.image_url = imageUrl;
        }

        saveBtn.textContent = "Saved!";
        setTimeout(() => {
            saveBtn.textContent = "Save";
            saveBtn.disabled = true;
            // Re-render specifically for image update if needed
            const img = document.querySelector(`#row-${id} .thumbnail`);
            if (img) img.src = imageUrl || placeholder;
        }, 2000);

    } catch (e) {
        console.error(`[${MODULE}] saveToken failed`, e);
        alert(`Failed to save changes for "${id}".`);
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

/**
 * Deletes a token.
 */
window.confirmDelete = async function(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return;

    try {
        await deleteToken(id);
        allTokens = allTokens.filter(t => t.id !== id);
        applyFilter();
    } catch (e) {
        console.error(`[${MODULE}] deleteToken failed`, e);
        alert("Failed to delete token.");
    }
}
