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
            .select("name,type,token_code,size,image_url")
            .eq("type", "Monsters");

        if (error) throw error;

        const tokenData = {};
        const monsterNames = [];

        (data || []).forEach((r) => {
            const name = (r.name || "").trim();
            if (!name) return;

            tokenData[name.toLowerCase()] = {
                token: r.token_code || r.image_url || "",
                size: r.size || "M",
                display: name
            };

            monsterNames.push(name);
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
        pixelsPerCell: parseInt(inputs.mapPixelsPerCell) || 30,
        offsetX: parseInt(inputs.mapOffsetX) || 0,
        offsetY: parseInt(inputs.mapOffsetY) || 0,
        visibilityRange: parseInt(inputs.visRange) || 6
    };

    // Extract players (DEFAULT_PLAYER_ROWS = 8)
    const players = [];
    for (let i = 1; i <= 8; i++) {
        const name = inputs[`player_name_${i}`] || "";
        const location = inputs[`player_loc_${i}`] || "";
        const tokenCode = inputs[`player_token_${i}`] || "";
        const checked = inputs[`player_sel_${i}`] || false;
        const visibility = inputs[`player_extra_${i}`];

        if (name || location || tokenCode) {
            players.push({ name, location, tokenCode, checked, visibility });
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
        inputs.mapPixelsPerCell = String(structured.map_config.pixelsPerCell || 30);
        inputs.mapOffsetX = String(structured.map_config.offsetX || 0);
        inputs.mapOffsetY = String(structured.map_config.offsetY || 0);
        inputs.visRange = String(structured.map_config.visibilityRange || 6);
    }

    // Players
    const players = structured.players || [];
    for (let i = 1; i <= 8; i++) {
        const p = players[i - 1] || {};
        inputs[`player_name_${i}`] = p.name || "";
        inputs[`player_loc_${i}`] = p.location || "";
        inputs[`player_token_${i}`] = p.tokenCode || "";
        inputs[`player_sel_${i}`] = p.checked || false;
        if (p.visibility !== undefined) inputs[`player_extra_${i}`] = p.visibility;
    }

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

        // Prompt user to select
        const menu = data.map((s, i) => `${i + 1}) ${s.name}`).join("\n");
        const pickRaw = prompt(`Pick a session:\n${menu}`, "1");

        if (!pickRaw) return;

        const idx = Math.max(1, Math.min(data.length, parseInt(pickRaw, 10))) - 1;
        const chosen = data[idx];

        // Load the session
        const { data: row, error: e2 } = await supabase
            .from("avrae_sessions")
            .select("id,name,map_config,players,npcs,monsters,revealed_tiles")
            .eq("id", chosen.id)
            .single();

        if (e2) throw e2;

        // Transform structured data back to flat format
        const flatInputs = transformToFlat({
            map_config: row.map_config,
            players: row.players,
            npcs: row.npcs,
            monsters: row.monsters
        });

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

        const { updateFowOutputs } = await import('./command-generator.js');
        updateFowOutputs();

        updateFileStatus(`Session: Loaded (${row.name})`);

    } catch (e) {
        console.error(`[${MODULE}] loadSessionPrompt failed`, e);
        await logError(MODULE, `loadSessionPrompt failed: ${e.message}`);
        alert("Failed to load session.");
    }
}