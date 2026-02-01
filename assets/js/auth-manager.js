import { supabase } from './supabaseClient.js';
import { logError } from './error-logger.js';

// 24 Hours in milliseconds
const MAX_SESSION_AGE = 24 * 60 * 60 * 1000;

/**
 * Manages Supabase authentication state.
 * Updated: Guild checks and Role synchronization have been removed.
 */
class AuthManager {
    constructor() {
        this.client = supabase;
        this.user = null;
    }

    /**
     * Initializes the auth listener.
     * Checks for an existing session immediately, then listens for changes.
     * @param {Function} onUserReady - Callback function executed when the user state is resolved. 
     * Receives the `user` object or `null`.
     */
    init(onUserReady) {
        this.client.auth.getSession().then(({ data, error }) => {
            if (error) {
                logError('auth-manager', `getSession failed: ${error.message}`);
                onUserReady(null);
                return;
            }
            this.handleSession(data.session, onUserReady);
        });

        this.client.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') {
                this.user = null;
                if (onUserReady) onUserReady(null);
                return;
            }
            this.handleSession(session, onUserReady);
        });
    }

    /**
     * Internal handler to validate session freshness.
     * If the session is stale (db 'last_seen' > 24h), it triggers a sync.
     * @param {Object|null} session - The Supabase session object.
     * @param {Function} callback - The UI update callback.
     */
    async handleSession(session, callback) {
        if (!session) {
            this.user = null;
            if (callback) callback(null);
            return;
        }

        // 1. Check the DB for 'last_seen'
        const isFresh = await this.checkSessionFreshness(session.user.id);

        if (isFresh) {
            // DB is fresh (sync happened < 24h ago). We are good.
            this.user = session.user;
            if (callback) callback(this.user);
        } else {
            // DB is stale. We must Sync to update last_seen and basic info.
            console.log("Auth: Session stale or missing. Syncing...");
            try {
                await this.syncDiscordToDB(session);
                this.user = session.user;
                if (callback) callback(this.user);
            } catch (error) {
                await logError('auth-manager', `Sync failed: ${error.message || error}`);
                await this.logout();
            }
        }
    }

    /**
     * Verifies if the user's data in the `discord_users` table is recent.
     * @param {string} userId - The Supabase User UUID.
     * @returns {Promise<boolean>} TRUE if last_seen is < 24 hours ago, FALSE otherwise.
     */
    async checkSessionFreshness(userId) {
        try {
            const { data, error } = await this.client
                .from('discord_users')
                .select('last_seen')
                .eq('user_id', userId)
                .single();

            if (error) {
                // PGRST116 is "no rows returned", which is expected for new users
                if (error.code !== 'PGRST116') {
                    logError('auth-manager', `Freshness check query failed: ${error.message}`);
                }
                return false;
            }

            if (!data || !data.last_seen) return false;

            const lastSeenDate = new Date(data.last_seen);
            const now = new Date();
            const ageInMs = now - lastSeenDate;

            return ageInMs < MAX_SESSION_AGE;
        } catch (e) {
            logError('auth-manager', `Critical failure in freshness check: ${e.message}`);
            return false; // Fail safe: assume stale
        }
    }

    /**
     * Synchronizes basic Discord profile data to the Supabase DB.
     * Required if the local database record is stale or missing.
     * @param {Object} session - The active Supabase session.
     */
    async syncDiscordToDB(session) {
        // We no longer need the provider_token for guild fetching.
        // We simply use the metadata attached to the session.

        // Replaced RPC structure with direct DB upsert
        // We do not modify 'roles' here.
        const updates = {
            discord_id: session.user.user_metadata.provider_id || session.user.identities?.[0]?.id,
            display_name: session.user.user_metadata.name || session.user.user_metadata.full_name,
            user_id: session.user.id,
            last_seen: new Date().toISOString()
        };

        const { error } = await this.client
            .from('discord_users')
            .upsert(updates, { onConflict: 'discord_id' });

        if (error) {
            console.error("Auth: Direct sync failed.", error);
            throw error;
        }
    }

    /**
     * Triggers the OAuth sign-in flow with Discord.
     * Redirects the user back to the current page origin.
     */
    async login() {
        try {
            const cleanUrl = window.location.origin + window.location.pathname;
            const { error } = await this.client.auth.signInWithOAuth({
                provider: 'discord',
                options: {
                    redirectTo: cleanUrl,
                }
            });
            if (error) throw error;
        } catch (error) {
            logError('auth-manager', `Login flow failed: ${error.message}`);
            alert('Failed to initiate login. Please try again.');
        }
    }

    /**
     * Signs the user out of Supabase and reloads the page.
     */
    async logout() {
        try {
            const { error } = await this.client.auth.signOut();
            if (error) throw error;
            window.location.reload();
        } catch (error) {
            logError('auth-manager', `Logout failed: ${error.message}`);
            // Force reload anyway to clear state if possible
            window.location.reload();
        }
    }
}

window.authManager = new AuthManager();