/**
 * @file bestiary-builder-core.js
 * @description Core logic for searching monsters in /bestiary, selecting monsters,
 * and converting them into a CritterDB Bestiary JSON format with '.' prepended to monster names.
 */

import { convertSingleMonster, generateObjectId } from './bestiary-converter.js';

/**
 * Designated authorized user ID for the Custom Bestiary Builder (CCS_discord_users.user_id).
 * @type {string}
 */
export const ALLOWED_USER_ID = 'c565b7c8-5bdb-4bf4-a56e-663c1f50fa13';

/**
 * Validates whether the given user ID is authorized to access DM Tools.
 * Requires user to have approved === true in CCS_discord_users.
 * 
 * @param {string|null|undefined} userId - User UUID to check.
 * @param {object|null} [client=null] - Supabase client.
 * @returns {Promise<{ authorized: boolean, reason?: string, user?: object }>}
 */
export async function verifyUserAuthorization(userId, client = null) {
    if (!userId) {
        return { authorized: false, reason: 'not_logged_in' };
    }

    if (!client) {
        // Fallback for offline/mock tests: owner is approved by default
        const isOwner = userId === ALLOWED_USER_ID;
        return {
            authorized: isOwner,
            reason: isOwner ? undefined : 'unauthorized_id'
        };
    }

    try {
        const query = client
            .from('CCS_discord_users')
            .select('user_id, display_name, discord_id, approved, roles')
            .eq('user_id', userId);

        let { data, error } = typeof query.maybeSingle === 'function'
            ? await query.maybeSingle()
            : await query.single();

        // Fallback for pending migration where approved column does not exist yet
        if (error && (error.message?.includes('approved') || error.code === '42703' || error.code === 'PGRST204')) {
            try {
                const fallbackQuery = client
                    .from('CCS_discord_users')
                    .select('user_id, display_name, discord_id, roles')
                    .eq('user_id', userId);
                const fallbackRes = typeof fallbackQuery.maybeSingle === 'function'
                    ? await fallbackQuery.maybeSingle()
                    : await fallbackQuery.single();

                if (!fallbackRes.error && fallbackRes.data) {
                    const roles = Array.isArray(fallbackRes.data.roles) ? fallbackRes.data.roles : [];
                    data = {
                        ...fallbackRes.data,
                        approved: roles.includes('Admin') || roles.includes('Contributor')
                    };
                    error = null;
                }
            } catch (_) {}
        }

        if (error || !data) {
            return { authorized: false, reason: 'db_record_not_found', error };
        }

        if (data.approved === true || data.user_id === ALLOWED_USER_ID) {
            return { authorized: true, user: data };
        }

        return { authorized: false, reason: 'unapproved', user: data };
    } catch (err) {
        return { authorized: false, error: err.message };
    }
}

/**
 * Calculates a fuzzy match score for a given search query against a monster entry.
 * Higher scores indicate better relevance.
 * 
 * @param {string} query - Cleaned lowercased search query.
 * @param {object} monster - Monster index entry { name, source, cr, type, ... }.
 * @returns {number} Score (0 = no match).
 */
export function scoreMonsterMatch(query, monster) {
    if (!query || !monster) return 0;

    const name = String(monster.name || '').toLowerCase();
    const type = typeof monster.type === 'string'
        ? monster.type.toLowerCase()
        : (monster.type ? String(monster.type).toLowerCase() : '');
    const source = String(monster.source || '').toLowerCase();

    // 1. Exact match on name
    if (name === query) return 1000;

    // 2. Name starts with query
    if (name.startsWith(query)) return 600 + Math.max(0, 50 - name.length);

    // 3. Word within name starts with query (e.g., "dragon" in "Adult Black Dragon")
    const words = name.split(/[\s\-()]+/);
    for (const w of words) {
        if (w === query) return 450;
        if (w.startsWith(query)) return 350 + Math.max(0, 30 - name.length);
    }

    // 4. Substring match within name
    const substrIndex = name.indexOf(query);
    if (substrIndex !== -1) {
        return 200 - substrIndex;
    }

    // 5. Fuzzy subsequence match across name
    let pIdx = 0;
    let seqScore = 0;
    let prevMatchedIndex = -2;
    for (let i = 0; i < name.length && pIdx < query.length; i++) {
        if (name[i] === query[pIdx]) {
            pIdx++;
            seqScore += (prevMatchedIndex === i - 1) ? 12 : 3;
            prevMatchedIndex = i;
        }
    }

    if (pIdx === query.length) {
        return Math.max(20, seqScore);
    }

    // 6. Fallback matches on creature type or source
    if (type.includes(query)) return 40;
    if (source === query) return 30;

    return 0;
}

/**
 * Performs fuzzy search over the monster index with optional filtering and ranking.
 * 
 * @param {string} query - User search string.
 * @param {Array<object>} index - Monster index list.
 * @param {object} [options={}] - Filter and limit options.
 * @param {string} [options.source] - Filter by specific source book.
 * @param {string} [options.cr] - Filter by specific CR.
 * @param {number} [options.limit=50] - Maximum results to return.
 * @returns {Array<object>} Filtered and sorted monster list.
 */
export function fuzzySearchMonsters(query, index, options = {}) {
    if (!Array.isArray(index)) return [];

    const cleanQuery = (query || '').trim().toLowerCase();
    const filterSource = options.source ? options.source.toUpperCase() : null;
    const filterCr = options.cr !== undefined && options.cr !== '' ? String(options.cr) : null;
    const limit = options.limit || 50;

    const scored = [];

    for (let i = 0; i < index.length; i++) {
        const item = index[i];

        // Apply explicit source filter if specified
        if (filterSource && (item.source || '').toUpperCase() !== filterSource) {
            continue;
        }

        // Apply explicit CR filter if specified
        if (filterCr && String(item.cr) !== filterCr) {
            continue;
        }

        // If no query is typed, show matches by filters (or top entries)
        if (!cleanQuery) {
            scored.push({ item, score: 1 });
            if (scored.length >= limit) break;
            continue;
        }

        const score = scoreMonsterMatch(cleanQuery, item);
        if (score > 0) {
            scored.push({ item, score });
        }
    }

    // Sort by descending score, then alphabetically
    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (a.item.name || '').localeCompare(b.item.name || '');
    });

    return scored.slice(0, limit).map((s) => s.item);
}

/**
 * Ensures that a monster name has a leading dot appended (e.g. "Skeleton" -> ".Skeleton").
 * If the name already starts with a dot, it remains intact.
 * 
 * @param {string} name - Raw monster name.
 * @returns {string} Dot-prefixed monster name.
 */
export function prependMonsterName(name) {
    if (!name) return '.Unnamed Creature';
    const trimmed = String(name).trim();
    return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

/**
 * Creates a complete CritterDB Bestiary JSON object containing multiple monsters.
 * Prepend a "." before each monster's name in accordance with CritterDB custom bestiary spec.
 * 
 * @param {Array<object>} rawMonsters - List of 5e.tools monster objects.
 * @param {object} [options={}] - Bestiary options (name, description, custom IDs).
 * @param {string} [options.name] - Bestiary name (defaults to "Custom Bestiary").
 * @param {string} [options.description] - Bestiary description.
 * @param {string} [options.bestiaryId] - Optional 24-character hexadecimal ObjectId.
 * @returns {object} CritterDB Bestiary JSON object containing `creatures` array.
 */
export function buildCritterDBBestiary(rawMonsters, options = {}) {
    if (!Array.isArray(rawMonsters)) {
        throw new Error('rawMonsters must be an array of monster objects');
    }

    const bestiaryId = options.bestiaryId || generateObjectId();
    const bestiaryName = (options.name && options.name.trim()) ? options.name.trim() : 'Custom Bestiary';
    const bestiaryDesc = (options.description && options.description.trim()) ? options.description.trim() : '';

    const convertedCreatures = rawMonsters.map((monster) => {
        const rawName = monster.name || 'Unnamed Creature';
        const dotName = prependMonsterName(rawName);

        // Convert monster to CritterDB format using the core converter
        const creature = convertSingleMonster(monster, {
            bestiaryId: bestiaryId,
            _id: monster._id || generateObjectId()
        });

        // Ensure name is dot-prefixed
        creature.name = dotName;
        return creature;
    });

    return {
        _id: bestiaryId,
        name: bestiaryName,
        description: bestiaryDesc,
        creatures: convertedCreatures
    };
}

/**
 * Triggers a browser download of text data as a JSON file.
 * 
 * @param {string|object} data - JSON string or object to download.
 * @param {string} [filename="custom-bestiary.json"] - Name of the output file.
 */
export function downloadJsonFile(data, filename = 'custom-bestiary.json') {
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}
