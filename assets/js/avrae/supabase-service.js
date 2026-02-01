/**
 * /assets/js/avrae/supabase-service.js
 * Supabase database operations
 */

import { supabase } from "/codex/assets/js/supabaseClient.js";
import { state } from './state-manager.js';
import { updateFileStatus } from './ui-helpers.js';

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
        alert("Failed to load tokens from Supabase.");
    }
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

        if (!sessionId) {
            // Create new session
            const { data, error } = await supabase
                .from("avrae_sessions")
                .insert([{
                    name,
                    user_id: user.id,
                    state: sessionState
                }])
                .select("id")
                .single();

            if (error) throw error;

            state.setSessionId(data.id);
        } else {
            // Update existing session
            const { error } = await supabase
                .from("avrae_sessions")
                .update({
                    name,
                    state: sessionState,
                    updated_at: new Date().toISOString()
                })
                .eq("id", sessionId);

            if (error) throw error;
        }

        updateFileStatus(`Session: Saved (${name})`);

    } catch (e) {
        console.error(`[${MODULE}] saveSessionToSupabase failed`, e);
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
            .select("id,name,state")
            .eq("id", chosen.id)
            .single();

        if (e2) throw e2;

        state.setSessionId(row.id);
        state.deserialize(row.state);

        // Reload image and redraw
        const { loadImage, drawMap } = await import('./canvas-manager.js');
        loadImage();
        drawMap();

        const { updateFowOutputs } = await import('./command-generator.js');
        updateFowOutputs();

        updateFileStatus(`Session: Loaded (${row.name})`);

    } catch (e) {
        console.error(`[${MODULE}] loadSessionPrompt failed`, e);
        alert("Failed to load session.");
    }
}