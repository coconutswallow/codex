import { supabase } from './supabaseClient.js';

let debugCache = null;
let errorCount = 0;
const MAX_ERRORS_PER_SESSION = 50;
/**
 * Logs errors to the database if the system debug setting is "true".
 * If debug is false or not set, logs to console only.
 * @param {string} moduleName - The script/module name (e.g., 'auth-manager').
 * @param {string} errorMessage - The error details.
 * @param {string} level - Severity: 'info', 'warning', 'error', 'critical'. Defaults to 'error'.
 */
export async function logError(moduleName, errorMessage, level = 'error') {
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

        // 4. Console output based on level
        const logMsg = `[${moduleName}] [${level.toUpperCase()}] ${errorMessage}`;
        switch (level) {
            case 'info': console.info(logMsg); break;
            case 'warning': console.warn(logMsg); break;
            case 'critical': console.error(`!!! CRITICAL !!! ${logMsg}`); break;
            default: console.error(logMsg); break;
        }

        // 5. Log to database if debug mode is on
        if (debugCache === true) {
            // Attempt to capture authenticated user id (works fine if unauthenticated)
            let userId = null;
            try {
                const { data: authData } = await supabase.auth.getUser();
                userId = authData?.user?.id || null;
            } catch (_) {
                userId = null;
            }

            const payload = {
                module: moduleName,
                error: errorMessage,
                level: level
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
        }
    } catch (err) {
        console.error("Logger: Critical failure", err);
        // Fallback to console
        console.log(`[${moduleName}] [${level}] ${errorMessage}`);
    }
}
