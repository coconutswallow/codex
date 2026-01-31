import { supabase } from './supabaseClient.js';

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
        this.client.auth.getSession().then(({ data }) => {
            this.handleSession(data.session, onUserReady);
        });

        this.client.auth.onAuthStateChange((event, session) => {
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
                console.error("Auth: Sync failed.", error);
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

            if (error || !data || !data.last_seen) return false;

            const lastSeenDate = new Date(data.last_seen);
            const now = new Date();
            const ageInMs = now - lastSeenDate;

            return ageInMs < MAX_SESSION_AGE;
        } catch (e) {
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

        // The RPC function typically handles updating 'last_seen' to NOW()
        // Ensure your Postgres function 'link_discord_account' accepts these arguments.
        // We pass an empty array for roles as we are no longer retrieving them.
        const { error } = await this.client.rpc('link_discord_account', {
            arg_discord_id: session.user.user_metadata.provider_id,
            arg_display_name: session.user.user_metadata.full_name,
            arg_roles: [] 
        });

        if (error) throw error;
    }

    /**
     * Triggers the OAuth sign-in flow with Discord.
     * Redirects the user back to the current page origin.
     */
    async login() {
        const cleanUrl = window.location.origin + window.location.pathname;
        await this.client.auth.signInWithOAuth({
            provider: 'discord',
            options: { 
                redirectTo: cleanUrl,
                // Removed 'guilds' and 'guilds.members.read' scopes
            }
        });
    }

    /**
     * Signs the user out of Supabase and reloads the page.
     */
    async logout() {
        await this.client.auth.signOut();
        window.location.reload();
    }
}

window.authManager = new AuthManager();