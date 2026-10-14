/**
 * @file dm-tools-gate.js
 * @description Centralized authentication & approval gate for all "My DM Tools" pages.
 * Requires users to be logged in via Discord AND have `approved: true` in `CCS_discord_users`.
 * If unapproved (approved: false or missing), renders a prompt to message coconutswallow on Discord.
 */

import { supabase } from './supabaseClient.js';
import './auth-manager.js';

/**
 * Checks whether a user is logged in and marked as approved in CCS_discord_users.
 * 
 * @param {object|null} user - Supabase user object.
 * @param {object} [client=supabase] - Supabase client instance.
 * @returns {Promise<{ status: 'approved'|'unapproved'|'unauthenticated'|'error', user?: object, message?: string }>}
 */
export async function verifyDmToolsAccess(user, client = supabase) {
    if (!user || !user.id) {
        return { status: 'unauthenticated', message: 'User not logged in' };
    }

    try {
        const { data, error } = await client
            .from('CCS_discord_users')
            .select('user_id, display_name, discord_id, approved, roles')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            console.error('Error fetching user approval status:', error);
            return { status: 'error', message: error.message };
        }

        if (!data) {
            const fallbackName = user.user_metadata?.full_name || user.user_metadata?.name || 'Adventurer';
            return {
                status: 'unapproved',
                user: {
                    user_id: user.id,
                    display_name: fallbackName,
                    discord_id: user.user_metadata?.provider_id || ''
                }
            };
        }

        if (data.approved === true) {
            return { status: 'approved', user: data };
        }

        return { status: 'unapproved', user: data };
    } catch (err) {
        console.error('Unexpected error checking approval status:', err);
        return { status: 'error', message: err.message };
    }
}

/**
 * Initializes the DM Tools Gate on the active page.
 */
export function initDmToolsGate() {
    const gatePanel = document.getElementById('dm-tools-gate');
    const contentPanels = document.querySelectorAll('.dm-tool-content, [data-dm-tool-protected]');

    if (!gatePanel) return;

    const gateLoading = document.getElementById('dm-gate-loading');
    const gateUnauth = document.getElementById('dm-gate-unauth');
    const gateUnapproved = document.getElementById('dm-gate-unapproved');
    const gateLoginBtn = document.getElementById('dm-gate-login-btn');
    const gateLogoutBtn = document.getElementById('dm-gate-logout-btn');
    const copyDetailsBtn = document.getElementById('dm-gate-copy-details');
    const userInfoEl = document.getElementById('dm-gate-user-info');

    // Attach button actions
    if (gateLoginBtn) {
        gateLoginBtn.addEventListener('click', () => {
            window.authManager?.login();
        });
    }

    if (gateLogoutBtn) {
        gateLogoutBtn.addEventListener('click', () => {
            window.authManager?.logout();
        });
    }

    let pollCount = 0;
    const MAX_POLLS = 50;

    const checkAuth = async () => {
        if (window.authManager) {
            window.authManager.init(async (user) => {
                if (!user) {
                    // Not logged in
                    setGateState('unauth');
                    return;
                }

                // Check approved field in CCS_discord_users
                setGateState('loading');
                const result = await verifyDmToolsAccess(user, supabase);

                if (result.status === 'approved') {
                    // Access granted!
                    hideGate();
                    window.dispatchEvent(new CustomEvent('dmToolsAccessGranted', { detail: result.user }));
                } else if (result.status === 'unapproved') {
                    // Logged in but not approved
                    renderUnapprovedState(result.user || user);
                    setGateState('unapproved');
                } else {
                    // Error state
                    renderErrorState(result.message);
                }
            });
        } else {
            pollCount++;
            if (pollCount > MAX_POLLS) {
                renderErrorState('Authentication service timed out. Please refresh the page.');
                return;
            }
            setTimeout(checkAuth, 100);
        }
    };

    function setGateState(state) {
        gatePanel.style.display = 'flex';
        contentPanels.forEach((el) => (el.style.display = 'none'));

        if (gateLoading) gateLoading.style.display = state === 'loading' ? 'flex' : 'none';
        if (gateUnauth) gateUnauth.style.display = state === 'unauth' ? 'flex' : 'none';
        if (gateUnapproved) gateUnapproved.style.display = state === 'unapproved' ? 'flex' : 'none';
    }

    function hideGate() {
        gatePanel.style.display = 'none';
        contentPanels.forEach((el) => {
            // Restore default or flex display
            el.style.display = el.getAttribute('data-display') || 'block';
        });
    }

    function renderUnapprovedState(userData) {
        if (!userInfoEl) return;
        const name = userData.display_name || userData.user_metadata?.full_name || 'Adventurer';
        const uid = userData.user_id || userData.id || '';

        userInfoEl.innerHTML = `
            <div class="dm-gate-user-badge">
                <strong>Logged In As:</strong> ${escapeHtml(name)}<br>
                <small>User ID: <code>${escapeHtml(uid)}</code></small>
            </div>
        `;

        if (copyDetailsBtn) {
            copyDetailsBtn.onclick = () => {
                const text = `Hello coconutswallow, I am requesting access to DM Tools for my account: ${name} (User ID: ${uid})`;
                navigator.clipboard.writeText(text).then(() => {
                    const original = copyDetailsBtn.textContent;
                    copyDetailsBtn.textContent = '✓ Copied request to clipboard!';
                    setTimeout(() => {
                        copyDetailsBtn.textContent = original;
                    }, 2500);
                });
            };
        }
    }

    function renderErrorState(msg) {
        setGateState('unapproved');
        if (userInfoEl) {
            userInfoEl.innerHTML = `
                <div style="color: var(--palette-danger, #ef4444); padding: 0.5rem;">
                    ⚠️ Error verifying authorization: ${escapeHtml(msg || 'Unknown error')}
                </div>
            `;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    checkAuth();
}

// Auto-run if DOM is ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDmToolsGate);
    } else {
        initDmToolsGate();
    }
}
