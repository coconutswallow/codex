/**
 * auth-manager.js
 * A reusable component to handle Supabase Auth for any project.
 */

// --- CONFIGURATION (Update this one place only) ---
const SUPABASE_CONFIG = {
    url: 'https://kcbvryvmcbfpsibxthhn.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjYnZyeXZtY2JmcHNpYnh0aGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTk1MzIsImV4cCI6MjA3OTE3NTUzMn0.9h81WHRCJfhouquG9tPHliY_5ezAbzKeDoLtGSARo5M'
};

class AuthManager {
    constructor() {
        // Initialize Supabase (assumes supabase-js script is loaded in HTML)
        if (typeof supabase === 'undefined') {
            console.error('Supabase JS SDK not found. Make sure to include the CDN script.');
            return;
        }
        this.db = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
        this.user = null;
    }

    /**
     * Initializes the auth listener.
     * @param {Function} onUserChange - Callback function (user) => { ... } runs whenever auth state changes.
     */
    init(onUserChange) {
        // 1. Check current session immediately
        this.db.auth.getSession().then(({ data }) => {
            this.handleSession(data.session, onUserChange);
        });

        // 2. Listen for future changes (login/logout/token refresh)
        this.db.auth.onAuthStateChange((event, session) => {
            this.handleSession(session, onUserChange);
        });
    }

    handleSession(session, callback) {
        this.user = session ? session.user : null;
        
        // Clean URL fragment (removes #access_token=... junk from URL bar after login)
        if (session && window.location.hash && window.location.hash.includes('access_token')) {
            const newUrl = window.location.origin + window.location.pathname + window.location.search;
            window.history.replaceState(null, null, newUrl);
        }

        if (callback) callback(this.user);
    }

    async login(provider = 'discord') {
        const redirectUrl = window.location.origin + window.location.pathname;
        await this.db.auth.signInWithOAuth({ 
            provider: provider, 
            options: { redirectTo: redirectUrl } 
        });
    }

    async logout() {
        await this.db.auth.signOut();
        window.location.reload();
    }

    // Helper to get formatted name
    getUserName() {
        if (!this.user) return "Guest";
        const meta = this.user.user_metadata;
        return meta.full_name || meta.custom_claims?.global_name || meta.name || "User";
    }

    // Expose the raw client if specific pages need data fetching (like select/insert)
    getClient() {
        return this.db;
    }
}

// Export a singleton instance globally
window.authManager = new AuthManager();