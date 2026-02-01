import { supabase } from './supabaseClient.js';

let debugCache = null;
let errorCount = 0;
const MAX_ERRORS_PER_SESSION = 50;
/**
 * Logs errors to the database if the system debug setting is "true".
 * If debug is false or not set, logs to console only.
 * @param {string} moduleName - The script/module name (e.g., 'auth-manager').
 * @param {string} errorMessage - The error details.
 */
export async function logError(moduleName, errorMessage) {
    // 1. Safety check to prevent log flooding
    if (errorCount >= MAX_ERRORS_PER_SESSION) {
        console.warn(`[error-logger] Max errors (${MAX_ERRORS_PER_SESSION}) reached, skipping DB write`);
        return;
    }

    try {
        // 2. Check Cache/SessionStorage for the "debug" setting
        if (debugCache === null) {
            const cachedValue = sessionStorage.getItem('hawt_debug_enabled');
            if (cachedValue !== null) {
                debugCache = (cachedValue === 'true');
            }
        }

        // 3. If not cached, fetch from 'system' table
        if (debugCache === null) {
            const { data, error: fetchError } = await supabase
                .from('system')
                .select('value')
                .eq('setting', 'debug')
                .single();

            if (fetchError) {
                console.error("Logger: Error fetching debug setting", fetchError);
                // Default to false if we can't fetch
                debugCache = false;
                sessionStorage.setItem('hawt_debug_enabled', 'false');
            } else {
                debugCache = (data?.value === 'true');
                sessionStorage.setItem('hawt_debug_enabled', debugCache.toString());
            }
        }

        // 4. Log based on debug mode
        if (debugCache === true) {
            // DEBUG MODE: Log to database AND console
            console.log(`[${moduleName}] ${errorMessage}`);

            // NEW: Attempt to capture authenticated user id (works fine if unauthenticated)
            let userId = null;
            try {
                const { data: authData } = await supabase.auth.getUser();
                userId = authData?.user?.id || null;
            } catch (_) {
                userId = null;
            }

            // NEW: Include user_id only when present
            const payload = {
                module: moduleName,
                error: errorMessage
            };
            if (userId) payload.user_id = userId;

            const { error: insertError } = await supabase
                .from('errors')
                .insert([payload]);

            if (insertError) {
                console.error("Logger: Failed to write to database", insertError);
            } else {
                errorCount++;
            }
        } else {
            // PRODUCTION MODE: Log to console only
            console.log(`[${moduleName}] ${errorMessage}`);
        }
    } catch (err) {
        console.error("Logger: Critical failure", err);
        // Fallback to console
        console.log(`[${moduleName}] ${errorMessage}`);
    }
}
