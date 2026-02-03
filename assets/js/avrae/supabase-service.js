/**
 * /assets/js/avrae/supabase-service.js
 * Supabase database operations with structured JSONB storage
 */

import { supabase } from "/codex/assets/js/supabaseClient.js";
import { state } from './state-manager.js';
import { updateFileStatus } from './ui-helpers.js';
import { logError } from '/codex/assets/js/error-logger.js';

const MODULE = "avrae-supabase-service";

/**
 * Load monster tokens from Supabase
 */
export async function refreshTokensFromSupabase() {
    try {
        const { data, error } = await supabase
            .from("tokens")
            .select("name,type,token_code,size,image_url");

        if (error) throw error;

        const tokenData = {};
        const monsterNames = [];

        (data || []).forEach((r) => {
            const name = (r.name || "").trim();
            if (!name) return;

            tokenData[name.toLowerCase()] = {
                token: r.token_code || r.image_url || "",
                size: r.size || "M",
                display: name,
                type: r.type
            };

            if (r.type === "Monsters") {
                monsterNames.push(name);
            }
        });

        state.setTokenData(tokenData);
        state.setMonsterNames(monsterNames);

        console.info(`[${MODULE}] Loaded ${monsterNames.length} monsters from Supabase`);

    } catch (e) {
        console.error(`[${MODULE}] refreshTokensFromSupabase failed`, e);
        await logError(MODULE, `refreshTokensFromSupabase failed: ${e.message}`);
        alert("Failed to load tokens from Supabase.");
    }
}

/**
 * Transform flat inputs object to structured JSONB format
 * @param {Object} inputs - Flat inputs object from state.serialize()
 * @returns {Object} Structured data for database
 */
function transformToStructured(inputs) {
    // Extract map configuration with transformation fields
    const map_config = {
        imageUrl: inputs.mapImgUrl || "",
        transformedImageUrl: inputs.mapTransformedUrl || "",
        width: parseInt(inputs.mapW) || 40,
        height: parseInt(inputs.mapH) || 40,
        transformedWidth: parseInt(inputs.mapTransformedW) || 0,
        transformedHeight: parseInt(inputs.mapTransformedH) || 0,
        pixelsPerCell: parseInt(inputs.mapPPC) || 30,
        offsetX: parseInt(inputs.mapOffsetX) || 0,
        offsetY: parseInt(inputs.mapOffsetY) || 0,
        visibilityRange: parseInt(inputs.visRange) || 6,
        fowEnabled: !!inputs.mapFow,
        autoViewEnabled: !!inputs.mapAutoView
    };

    // Extract players (Dynamic count based on player-row presence in HTML)
    const players = [];
    const playerRows = document.querySelectorAll(".player-row").length;
    for (let i = 1; i <= playerRows; i++) {
        const shortName = inputs[`player_name_${i}`] || "";
        const fullName = inputs[`player_full_${i}`] || "";
        const location = inputs[`player_loc_${i}`] || "";
        const tokenCode = inputs[`player_token_${i}`] || "";
        const checked = inputs[`player_sel_${i}`] || false;
        if (shortName || fullName || location || tokenCode) {
            players.push({ shortName, fullName, location, tokenCode, checked });
        }
    }

    // Extract NPCs (DEFAULT_NPC_ROWS = 6)
    const npcs = [];
    for (let i = 1; i <= 6; i++) {
        const shortName = inputs[`npc_name_${i}`] || "";
        const fullName = inputs[`npc_full_${i}`] || "";
        const location = inputs[`npc_loc_${i}`] || "";
        const ac = inputs[`npc_extra_${i}`];
        const hp = inputs[`npc_hp_${i}`];
        const checked = inputs[`npc_sel_${i}`] || false;

        if (shortName || fullName || location) {
            npcs.push({ shortName, fullName, location, ac, hp, checked });
        }
    }

    // Extract monsters (DEFAULT_MONSTER_ROWS = 10)
    const monsters = [];
    for (let i = 1; i <= 10; i++) {
        const shortName = inputs[`monster_name_${i}`] || "";
        const qty = inputs[`monster_full_${i}`] || "1";
        const location = inputs[`monster_loc_${i}`] || "";
        const ac = inputs[`monster_extra_${i}`];
        const tokenCode = inputs[`monster_token_${i}`] || "";
        const checked = inputs[`monster_sel_${i}`] || false;

        if (shortName || location || tokenCode) {
            monsters.push({ shortName, qty, location, ac, tokenCode, checked });
        }
    }

    return {
        map_config,
        players,
        npcs,
        monsters
    };
}

/**
 * Transform structured JSONB format back to flat inputs object
 * @param {Object} structured - Structured data from database
 * @returns {Object} Flat inputs object for state.deserialize()
 */
function transformToFlat(structured) {
    const inputs = {};

    // Map configuration
    if (structured.map_config) {
        inputs.mapImgUrl = structured.map_config.imageUrl || "";
        inputs.mapTransformedUrl = structured.map_config.transformedImageUrl || "";
        inputs.mapW = String(structured.map_config.width || 40);
        inputs.mapH = String(structured.map_config.height || 40);
        inputs.mapTransformedW = String(structured.map_config.transformedWidth || 0);
        inputs.mapTransformedH = String(structured.map_config.transformedHeight || 0);
        inputs.mapPPC = String(structured.map_config.pixelsPerCell || 30);
        inputs.mapOffsetX = String(structured.map_config.offsetX || 0);
        inputs.mapOffsetY = String(structured.map_config.offsetY || 0);
        inputs.visRange = String(structured.map_config.visibilityRange || 6);
        inputs.mapFow = !!structured.map_config.fowEnabled;
    }

    // Players
    const players = structured.players || [];
    players.forEach((p, i) => {
        const idx = i + 1;
        inputs[`player_name_${idx}`] = p.shortName || "";
        inputs[`player_full_${idx}`] = p.fullName || "";
        inputs[`player_loc_${idx}`] = p.location || "";
        inputs[`player_token_${idx}`] = p.tokenCode || "";
        inputs[`player_sel_${idx}`] = p.checked || false;
    });

    // NPCs
    const npcs = structured.npcs || [];
    for (let i = 1; i <= 6; i++) {
        const n = npcs[i - 1] || {};
        inputs[`npc_name_${i}`] = n.shortName || "";
        inputs[`npc_full_${i}`] = n.fullName || "";
        inputs[`npc_loc_${i}`] = n.location || "";
        inputs[`npc_sel_${i}`] = n.checked || false;
        if (n.ac !== undefined) inputs[`npc_extra_${i}`] = n.ac;
        if (n.hp !== undefined) inputs[`npc_hp_${i}`] = n.hp;
    }

    // Monsters
    const monsters = structured.monsters || [];
    for (let i = 1; i <= 10; i++) {
        const m = monsters[i - 1] || {};
        inputs[`monster_name_${i}`] = m.shortName || "";
        inputs[`monster_full_${i}`] = m.qty || "1";
        inputs[`monster_loc_${i}`] = m.location || "";
        inputs[`monster_sel_${i}`] = m.checked || false;
        if (m.ac !== undefined) inputs[`monster_extra_${i}`] = m.ac;
        if (m.tokenCode !== undefined) inputs[`monster_token_${i}`] = m.tokenCode;
    }

    return inputs;
}

/**
 * Save current session to Supabase
 */
export async function saveSessionToSupabase() {
    try {
        const { data: u } = await supabase.auth.getUser();
        const user = u?.user;

        if (!user) {
            return alert("You must be logged in.");
        }

        const name = prompt("Session name:", "Avrae Session");
        if (!name) return;

        const sessionState = state.serialize();
        const sessionId = state.getSessionId();

        // Transform to structured format
        const structured = transformToStructured(sessionState.inputs);

        const sessionData = {
            name,
            user_id: user.id,
            map_config: structured.map_config,
            players: structured.players,
            npcs: structured.npcs,
            monsters: structured.monsters,
            revealed_tiles: sessionState.revealed || []
        };

        if (!sessionId) {
            // Create new session
            const { data, error } = await supabase
                .from("avrae_sessions")
                .insert([sessionData])
                .select("id")
                .single();

            if (error) throw error;

            state.setSessionId(data.id);
            updateFileStatus(`Session: Saved (${name})`);
        } else {
            // Update existing session
            const { error } = await supabase
                .from("avrae_sessions")
                .update({
                    ...sessionData,
                    updated_at: new Date().toISOString()
                })
                .eq("id", sessionId);

            if (error) throw error;
            updateFileStatus(`Session: Updated (${name})`);
        }

    } catch (e) {
        console.error(`[${MODULE}] saveSessionToSupabase failed`, e);
        await logError(MODULE, `saveSessionToSupabase failed: ${e.message}`);
        alert("Failed to save session.");
    }
}

/**
 * Load a session from Supabase
 */
export async function loadSessionPrompt() {
    try {
        const { data: u } = await supabase.auth.getUser();
        const user = u?.user;

        if (!user) {
            return alert("You must be logged in.");
        }

        // Get user's sessions
        const { data, error } = await supabase
            .from("avrae_sessions")
            .select("id,name,updated_at")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!data?.length) {
            return alert("No saved sessions found.");
        }

        // Show modal with session list
        const modal = document.getElementById('loadSessionModal');
        const sessionList = document.getElementById('sessionList');

        sessionList.innerHTML = data.map(session => {
            const date = new Date(session.updated_at).toLocaleString();
            return `
                <div class="session-item" onclick="loadSession('${session.id}')" 
                     style="padding: 12px; margin-bottom: 8px; background: #2f3136; border-radius: 4px; cursor: pointer; border-left: 3px solid var(--accent);">
                    <div style="font-weight: bold; margin-bottom: 4px;">${session.name}</div>
                    <div style="font-size: 0.75em; color: var(--blur);">Last updated: ${date}</div>
                </div>
            `;
        }).join('');

        modal.style.display = 'flex';

    } catch (e) {
        console.error(`[${MODULE}] loadSessionPrompt failed`, e);
        alert("Failed to load sessions list.");
    }
}

/**
 * Load a specific session by ID
 */
async function loadSession(sessionId) {
    try {
        // Close the modal
        document.getElementById('loadSessionModal').style.display = 'none';

        // Load the session
        const { data: row, error } = await supabase
            .from("avrae_sessions")
            .select("id,name,map_config,players,npcs,monsters,revealed_tiles")
            .eq("id", sessionId)
            .single();

        if (error) throw error;

        // Transform structured data back to flat format
        const flatInputs = transformToFlat({
            map_config: row.map_config,
            players: row.players,
            npcs: row.npcs,
            monsters: row.monsters
        });

        // Ensure we have enough player rows for the loaded session
        if (row.players?.length && window.ensureRows) {
            window.ensureRows('player', row.players.length);
        }

        // Deserialize into state
        state.setSessionId(row.id);
        state.deserialize({
            revealed: row.revealed_tiles || [],
            inputs: flatInputs
        });

        // Reload image and redraw
        const { loadImage, drawMap } = await import('./canvas-manager.js');
        loadImage();
        drawMap();

        const { updateMapSummary } = await import('./map-setup.js');
        updateMapSummary();

        const { updateFowOutputs } = await import('./command-generator.js');
        updateFowOutputs();

        updateFileStatus(`Session: Loaded (${row.name})`);

    } catch (e) {
        console.error(`[${MODULE}] loadSession failed`, e);
        alert("Failed to load session.");
    }
}

// Expose loadSession to window for onclick handlers
window.loadSession = loadSession;

/**
 * Search battlemaps in database
 * @param {string} query - Search term
 * @returns {Promise<Array>} List of battlemaps
 */
export async function searchBattlemaps(query) {
    try {
        if (!query || query.trim().length < 2) return [];

        const { data, error } = await supabase
            .from("battlemaps")
            .select("id,name,grid_width,grid_height,cell_size_px,thumbnail_url,source_url,image_url,optimized_url")
            .or(`name.ilike.%${query}%,keywords.ilike.%${query}%`)
            .eq("is_approved", true)
            .limit(10);

        if (error) throw error;
        return data || [];

    } catch (e) {
        console.error(`[${MODULE}] searchBattlemaps failed`, e);
        await logError(MODULE, `searchBattlemaps failed: ${e.message}`);
        return [];
    }
}
