import { supabase } from './supabaseClient.js';

/**
 * Checks if a user has a specific role.
 * @param {string} userId - The UUID of the user.
 * @param {string|string[]} requiredRole - The role (or array of roles) to check for.
 * @returns {Promise<boolean>}
 * 
 * Documentation:  https://github.com/hawthorneguild/HawthorneTeams/issues/17
 */
export async function checkAccess(userId, requiredRole) {
    if (!userId) return false;

    try {
        const { data, error } = await supabase
            .from('discord_users')
            .select('roles')
            .eq('user_id', userId)
            .single();

        if (error || !data || !data.roles) {
            console.warn("AuthGuard: Could not fetch roles for user.");
            return false;
        }

        // Handle single string or array of required roles
        // If we pass an array (e.g. ['Admin', 'Mod']), we check if they have ANY of them.
        const required = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        
        // "Does the user's role list include any of the required roles?"
        const hasPermission = required.some(r => data.roles.includes(r));
        
        return hasPermission;

    } catch (e) {
        console.error("AuthGuard Error:", e);
        return false;
    }
}