import { supabase } from './supabaseClient.js';

const REQUIRED_GUILD_ID = '308324031478890497';
// 24 Hours in milliseconds
const MAX_SESSION_AGE = 24 * 60 * 60 * 1000; 

/**
 * Manages Supabase authentication state and handles synchronization 
 * between the local session and the Discord database records.
 * 
 * Documentation: https://github.com/hawthorneguild/HawthorneTeams/issues/17
 */
class AuthManager {
    constructor() {
        this.client = supabase;
        this.user = null;
    }

    /**
     * Initializes the auth listener.
     * Checks for an existing session immediately, then listens for changes.
     * * @param {Function} onUserReady - Callback function executed when the user state is resolved. 
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
     * * @param {Object|null} session - The Supabase session object.
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
            // DB is stale. We must Sync.
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
     * * @param {string} userId - The Supabase User UUID.
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
     * Synchronizes Discord profile data (Roles, Nickname) to the Supabase DB.
     * Required if the local database record is stale or missing.
     * * @param {Object} session - The active Supabase session containing the provider token.
     * @throws {Error} If token is missing, user is not in the guild, or RPC fails.
     */
    async syncDiscordToDB(session) {
        const token = session.provider_token;
        if (!token) throw new Error("No token found");

        const isMember = await this.checkGuildMembership(token);
        if (!isMember) throw new Error("User not in required Discord Guild");

        const member = await this.fetchGuildMember(token);
        if (!member) throw new Error("Could not fetch Discord member data");

        // The RPC function typically handles updating 'last_seen' to NOW()
        // Ensure your Postgres function 'link_discord_account' does this!
        const { error } = await this.client.rpc('link_discord_account', {
            arg_discord_id: session.user.user_metadata.provider_id,
            arg_display_name: member.nick || session.user.user_metadata.full_name,
            arg_roles: member.roles
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
            options: { redirectTo: cleanUrl, scopes: 'guilds guilds.members.read' }
        });
    }

    /**
     * Signs the user out of Supabase and reloads the page.
     */
    async logout() {
        await this.client.auth.signOut();
        window.location.reload();
    }
    
    /**
     * Checks Discord API to see if the user is a member of the required Guild.
     * * @param {string} token - The Discord Provider Access Token.
     * @returns {Promise<boolean>}
     */
    async checkGuildMembership(token) {
         try {
            const r = await fetch('https://discord.com/api/users/@me/guilds', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (r.status === 429) return true; 
            const g = await r.json();
            return Array.isArray(g) && g.some(x => x.id === REQUIRED_GUILD_ID);
        } catch(e) { return false; }
    }

    /**
     * Fetches the specific member details (roles, nickname) from the Discord Guild.
     * * @param {string} token - The Discord Provider Access Token.
     * @returns {Promise<Object|null>} The Discord Member object or null on failure.
     */
    async fetchGuildMember(token) {
        try {
            const r = await fetch(`https://discord.com/api/users/@me/guilds/${REQUIRED_GUILD_ID}/member`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return r.ok ? await r.json() : null;
        } catch(e) { return null; }
    }
}

window.authManager = new AuthManager();