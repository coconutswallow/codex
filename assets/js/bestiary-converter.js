/**
 * @file bestiary-converter.js
 * @description Core conversion utility transforming 5e.tools monster JSON data into CritterDB monster JSON format.
 * Supports single monster objects, arrays of monsters, and 5e.tools bestiary containers (with { monster: [...] }).
 */

/**
 * 5e Challenge Rating to Experience Points (XP) lookup table according to the 5e Dungeon Master's Guide.
 * @type {Record<string, number>}
 */
export const CR_XP_MAP = {
    '0': 10,
    '1/8': 25,
    '1/4': 50,
    '1/2': 100,
    '1': 200,
    '2': 450,
    '3': 700,
    '4': 1100,
    '5': 1800,
    '6': 2300,
    '7': 2900,
    '8': 3900,
    '9': 5000,
    '10': 5900,
    '11': 7200,
    '12': 8400,
    '13': 10000,
    '14': 11500,
    '15': 13000,
    '16': 15000,
    '17': 18000,
    '18': 20000,
    '19': 22000,
    '20': 25000,
    '21': 33000,
    '22': 41000,
    '23': 50000,
    '24': 62000,
    '25': 75000,
    '26': 90000,
    '27': 105000,
    '28': 120000,
    '29': 135000,
    '30': 155000
};

/**
 * Monster size letter mapping to full size names.
 * @type {Record<string, string>}
 */
export const SIZE_MAP = {
    'T': 'Tiny',
    'S': 'Small',
    'M': 'Medium',
    'L': 'Large',
    'H': 'Huge',
    'G': 'Gargantuan'
};

/**
 * Alignment abbreviations mapping to full words.
 * @type {Record<string, string>}
 */
export const ALIGNMENT_MAP = {
    'L': 'Lawful',
    'C': 'Chaotic',
    'N': 'Neutral',
    'G': 'Good',
    'E': 'Evil',
    'U': 'Unaligned',
    'A': 'Any'
};

/**
 * Full ability names mapped from standard 3-letter abbreviations.
 * @type {Record<string, string>}
 */
export const FULL_ABILITY_NAMES = {
    str: 'strength',
    dex: 'dexterity',
    con: 'constitution',
    int: 'intelligence',
    wis: 'wisdom',
    cha: 'charisma'
};

/**
 * Short capitalized 3-letter abbreviations mapped from full ability names.
 * @type {Record<string, string>}
 */
export const SHORT_ABILITY_NAMES = {
    strength: 'Str',
    dexterity: 'Dex',
    constitution: 'Con',
    intelligence: 'Int',
    wisdom: 'Wis',
    charisma: 'Cha'
};

/**
 * Generates a 24-character hexadecimal MongoDB-compatible ObjectID.
 * Composed of an 8-character hex timestamp followed by 16 random hex characters.
 * @returns {string} 24-character hex string.
 */
export function generateObjectId() {
    const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
    let randomPart = '';
    for (let i = 0; i < 16; i++) {
        randomPart += Math.floor(Math.random() * 16).toString(16);
    }
    return (timestamp + randomPart).toLowerCase();
}

/**
 * Cleans 5e.tools formatting tags from string entries (e.g., {@hit 11}, {@damage 2d10 + 6}, {@atk mw}).
 * Converts them into clean, human-readable text.
 * @param {string} text - Raw 5e.tools text containing markup tags.
 * @returns {string} Sanitized plain text representation.
 */
export function clean5eToolsTags(text) {
    if (typeof text !== 'string') return text == null ? '' : String(text);

    return text
        // Attack type tags: {@atk mw}, {@atk rw}, etc.
        .replace(/\{@atk\s+([^}]+)\}/g, (_, types) => {
            const isMelee = types.includes('mw') || types.includes('ms');
            const isRanged = types.includes('rw') || types.includes('rs');
            const isSpell = types.includes('ms') || types.includes('rs');
            if (isMelee && isRanged) {
                return isSpell ? 'Melee or Ranged Spell Attack:' : 'Melee or Ranged Weapon Attack:';
            }
            if (isMelee) {
                return isSpell ? 'Melee Spell Attack:' : 'Melee Weapon Attack:';
            }
            if (isRanged) {
                return isSpell ? 'Ranged Spell Attack:' : 'Ranged Weapon Attack:';
            }
            return 'Attack:';
        })
        // Hit bonus: {@hit 11} -> +11
        .replace(/\{@hit\s+([+-]?\d+)\}/g, (_, bonus) => (bonus.startsWith('+') || bonus.startsWith('-') ? bonus : `+${bonus}`))
        // Damage expressions: {@damage 2d10 + 6} -> 2d10 + 6
        .replace(/\{@damage\s+([^}]+)\}/g, '$1')
        // Dice rolls: {@dice 1d8} -> 1d8
        .replace(/\{@dice\s+([^}]+)\}/g, '$1')
        // D20 rolls: {@d20 5} -> +5
        .replace(/\{@d20\s+([^}]+)\}/g, '$1')
        // DC saving throw tags: {@dc 16} -> DC 16
        .replace(/\{@dc\s+([^}]+)\}/g, 'DC $1')
        // Recharge tags: {@recharge 5} -> (Recharge 5–6), {@recharge} -> (Recharge 6)
        .replace(/\{@recharge\s*([^}]*)\}/g, (_, rechargeVal) => {
            const val = rechargeVal.trim();
            return val ? `(Recharge ${val}–6)` : '(Recharge 6)';
        })
        // Referenced entities with optional custom label: {@creature goblin|phb|Custom Goblin} -> Custom Goblin or goblin
        .replace(/\{@(creature|spell|item|condition|skill|sense|action|hazard|background|race|class|table|book)\s+([^}]+)\}/g, (_, _tag, content) => {
            const parts = content.split('|');
            return parts[parts.length > 2 && parts[2] ? 2 : 0];
        })
        // Bold, italic, note, quickref tags
        .replace(/\{@(b|bold|i|italic|note)\s+([^}]+)\}/g, '$2')
        // Any other unrecognized 5e.tools tag
        .replace(/\{@[a-zA-Z0-9_-]+\s+([^}]+)\}/g, '$1');
}

/**
 * Recursively formats 5e.tools entries (which can be strings, lists, tables, or sub-entries).
 * @param {Array<string|object>|string} entries - Entries to format.
 * @returns {string} Clean multi-line text representation.
 */
export function formatEntries(entries) {
    if (!entries) return '';
    if (typeof entries === 'string') return clean5eToolsTags(entries);

    if (Array.isArray(entries)) {
        return entries
            .map((entry) => {
                if (typeof entry === 'string') {
                    return clean5eToolsTags(entry);
                }
                if (entry && typeof entry === 'object') {
                    // Nested list
                    if (Array.isArray(entry.items)) {
                        return entry.items.map((item) => `• ${formatEntries(item)}`).join('\n');
                    }
                    // Sub-entry with name
                    if (entry.name && entry.entries) {
                        return `${clean5eToolsTags(entry.name)}: ${formatEntries(entry.entries)}`;
                    }
                    // Entries block
                    if (entry.entries) {
                        return formatEntries(entry.entries);
                    }
                    return JSON.stringify(entry);
                }
                return String(entry);
            })
            .filter(Boolean)
            .join('\n\n');
    }

    return String(entries);
}

/**
 * Calculates standard ability modifier from raw ability score.
 * Formula: Math.floor((score - 10) / 2)
 * @param {number} score - Ability score (e.g. 10, 14, 23).
 * @returns {number} Modifier integer.
 */
export function calculateModifier(score) {
    const numericScore = typeof score === 'number' && !isNaN(score) ? score : 10;
    return Math.floor((numericScore - 10) / 2);
}

/**
 * Formats an ability score and modifier into a standard string: "23 (+6)".
 * @param {number} score - Ability score.
 * @returns {string} Formatted string.
 */
export function formatAbilityScoreStr(score) {
    const mod = calculateModifier(score);
    return `${score} (${mod >= 0 ? '+' : ''}${mod})`;
}

/**
 * Parses a 5e.tools speed definition into CritterDB's single speed string representation.
 * Example: { walk: 40, fly: "80", swim: "40" } -> "40 ft., fly 80 ft., swim 40 ft."
 * @param {object|string} speedObj - 5e.tools speed object or string.
 * @returns {string} Formatted speed string.
 */
export function parseSpeed(speedObj) {
    if (!speedObj) return '30 ft.';
    if (typeof speedObj === 'string') return speedObj;

    if (typeof speedObj === 'object') {
        const parts = [];

        // Walking speed comes first without "walk" prefix
        if (speedObj.walk !== undefined) {
            const walkVal = typeof speedObj.walk === 'object' && speedObj.walk !== null ? speedObj.walk.number : speedObj.walk;
            if (walkVal !== undefined && walkVal !== null) {
                parts.push(`${walkVal} ft.`);
            }
        }

        // Other speeds in object order (burrow, climb, fly, swim, etc.)
        for (const [mode, val] of Object.entries(speedObj)) {
            if (mode === 'walk' || mode === 'canHover' || val === undefined || val === null) continue;
            if (typeof val === 'object') {
                const num = val.number ?? val.value ?? '';
                const cond = val.condition ? ` ${val.condition}` : '';
                parts.push(`${mode} ${num} ft.${cond}`);
            } else {
                parts.push(`${mode} ${val} ft.`);
            }
        }

        // Hover condition check if set at top-level
        if (speedObj.canHover && parts.some((p) => p.startsWith('fly')) && !parts.some((p) => p.includes('hover'))) {
            const flyIndex = parts.findIndex((p) => p.startsWith('fly'));
            parts[flyIndex] += ' (hover)';
        }

        return parts.length > 0 ? parts.join(', ') : '30 ft.';
    }

    return String(speedObj);
}

/**
 * Parses HP formula and extracts numHitDie, hitDieSize, extraHealth, and calculated total.
 * @param {object} hpObj - 5e.tools HP object (e.g. { average: 187, formula: "17d12 + 85" }).
 * @returns {{ numHitDie: number, hitDieSize: number, extraHealth: number, hitPoints: number, hitPointsStr: string }}
 */
export function parseHitPoints(hpObj) {
    let numHitDie = 0;
    let hitDieSize = 8;
    let extraHealth = 0;
    let hitPoints = 0;
    let hitPointsStr = '';

    if (hpObj) {
        const formula = typeof hpObj.formula === 'string' ? hpObj.formula.trim() : '';
        if (formula) {
            const match = formula.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
            if (match) {
                numHitDie = parseInt(match[1], 10) || 0;
                hitDieSize = parseInt(match[2], 10) || 8;
                const sign = match[3] === '-' ? -1 : 1;
                extraHealth = match[4] ? parseInt(match[4], 10) * sign : 0;
                // Standard D&D average formula: floor(numHitDie * ((dieSize + 1) / 2)) + extraHealth
                hitPoints = Math.floor(numHitDie * ((hitDieSize + 1) / 2)) + extraHealth;
                hitPointsStr = `${hitPoints} (${formula})`;
            }
        }

        // Fallback to explicit average if formula was absent or didn't yield HP
        if (!hitPoints) {
            hitPoints = typeof hpObj.average === 'number' ? hpObj.average : (parseInt(hpObj.average, 10) || 10);
            hitPointsStr = formula ? `${hitPoints} (${formula})` : `${hitPoints}`;
        }
    } else {
        hitPoints = 10;
        hitPointsStr = '10 (2d8 + 2)';
        numHitDie = 2;
        hitDieSize = 8;
        extraHealth = 2;
    }

    return {
        numHitDie,
        hitDieSize,
        extraHealth,
        hitPoints,
        hitPointsStr
    };
}

/**
 * Converts a single 5e.tools monster object into CritterDB format.
 * @param {object} monster - Raw 5e.tools monster object.
 * @param {object} [options={}] - Optional configuration (e.g. custom IDs).
 * @param {string} [options._id] - Override _id hex string.
 * @param {string} [options.bestiaryId] - Override bestiaryId hex string.
 * @returns {object} CritterDB monster JSON object.
 */
export function convertSingleMonster(monster, options = {}) {
    if (!monster || typeof monster !== 'object') {
        throw new Error('Invalid monster data: input must be a JSON object');
    }

    // 1. Size
    let size = 'Medium';
    if (Array.isArray(monster.size) && monster.size.length > 0) {
        size = SIZE_MAP[monster.size[0]] || monster.size[0];
    } else if (typeof monster.size === 'string') {
        size = SIZE_MAP[monster.size] || monster.size;
    }

    // 2. Race / Type
    let race = '';
    if (typeof monster.type === 'string') {
        race = monster.type;
    } else if (monster.type && typeof monster.type === 'object') {
        race = monster.type.type || '';
        if (Array.isArray(monster.type.tags) && monster.type.tags.length > 0) {
            race += ` (${monster.type.tags.join(', ')})`;
        }
    }

    // 3. Alignment
    let alignment = '';
    if (Array.isArray(monster.alignment)) {
        if (monster.alignment.length === 1 && monster.alignment[0] === 'N') {
            alignment = 'Neutral';
        } else if (monster.alignment.length === 2 && monster.alignment[0] === 'N' && monster.alignment[1] === 'N') {
            alignment = 'Neutral';
        } else {
            alignment = monster.alignment.map((a) => ALIGNMENT_MAP[a] || a).join(' ');
        }
    } else if (typeof monster.alignment === 'string') {
        alignment = monster.alignment;
    }

    // 4. Armor Class & Armor Type
    let armorClass = 10;
    let armorType = '';
    if (Array.isArray(monster.ac) && monster.ac.length > 0) {
        const primaryAc = monster.ac[0];
        if (typeof primaryAc === 'number') {
            armorClass = primaryAc;
        } else if (primaryAc && typeof primaryAc === 'object') {
            armorClass = typeof primaryAc.ac === 'number' ? primaryAc.ac : 10;
            if (Array.isArray(primaryAc.from) && primaryAc.from.length > 0) {
                armorType = primaryAc.from.join(', ');
            } else if (typeof primaryAc.from === 'string') {
                armorType = primaryAc.from;
            }
        }
    } else if (typeof monster.ac === 'number') {
        armorClass = monster.ac;
    }

    // 5. Ability Scores & Modifiers
    const str = typeof monster.str === 'number' ? monster.str : 10;
    const dex = typeof monster.dex === 'number' ? monster.dex : 10;
    const con = typeof monster.con === 'number' ? monster.con : 10;
    const int = typeof monster.int === 'number' ? monster.int : 10;
    const wis = typeof monster.wis === 'number' ? monster.wis : 10;
    const cha = typeof monster.cha === 'number' ? monster.cha : 10;

    const abilityScores = {
        strength: str,
        dexterity: dex,
        constitution: con,
        intelligence: int,
        wisdom: wis,
        charisma: cha
    };

    const abilityScoreModifiers = {
        strength: calculateModifier(str),
        dexterity: calculateModifier(dex),
        constitution: calculateModifier(con),
        intelligence: calculateModifier(int),
        wisdom: calculateModifier(wis),
        charisma: calculateModifier(cha)
    };

    const abilityScoreStrs = {
        strength: formatAbilityScoreStr(str),
        dexterity: formatAbilityScoreStr(dex),
        constitution: formatAbilityScoreStr(con),
        intelligence: formatAbilityScoreStr(int),
        wisdom: formatAbilityScoreStr(wis),
        charisma: formatAbilityScoreStr(cha)
    };

    // 6. Hit Points
    const hpData = parseHitPoints(monster.hp);

    // 7. Speed
    const speed = parseSpeed(monster.speed);

    // 8. Challenge Rating & XP
    let crRaw = monster.cr !== undefined ? monster.cr : '0';
    let challengeRatingStr = typeof crRaw === 'object' && crRaw !== null ? String(crRaw.cr ?? '0') : String(crRaw);
    let challengeRating = 0;
    if (challengeRatingStr.includes('/')) {
        const [num, den] = challengeRatingStr.split('/').map(Number);
        challengeRating = den ? num / den : 0;
    } else {
        challengeRating = parseFloat(challengeRatingStr) || 0;
    }
    const experiencePoints =
        typeof crRaw === 'object' && crRaw !== null && typeof crRaw.xp === 'number'
            ? crRaw.xp
            : (CR_XP_MAP[challengeRatingStr] ?? 0);

    // 9. Saving Throws
    let hashIndex = 18000;
    const savingThrows = [];
    if (monster.save && typeof monster.save === 'object') {
        for (const [k, v] of Object.entries(monster.save)) {
            const keyLower = k.toLowerCase();
            const full = FULL_ABILITY_NAMES[keyLower] || keyLower;
            const val = parseInt(v, 10) || 0;
            const short = SHORT_ABILITY_NAMES[full] || k.toUpperCase();
            savingThrows.push({
                ability: full,
                value: val,
                proficient: false,
                modifier: val,
                modifierStr: `${short} ${val >= 0 ? '+' : ''}${val}`,
                '$$hashKey': `object:${hashIndex++}`
            });
        }
    }

    // 10. Skills & Passive Perception
    const skills = [];
    let perceptionMod = null;
    if (monster.skill && typeof monster.skill === 'object') {
        for (const [k, v] of Object.entries(monster.skill)) {
            const name = k
                .split(' ')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
            const val = parseInt(v, 10) || 0;
            if (k.toLowerCase() === 'perception') {
                perceptionMod = val;
            }
            skills.push({
                name: name,
                value: val,
                proficient: false,
                modifier: val,
                modifierStr: `${name} ${val >= 0 ? '+' : ''}${val}`,
                '$$hashKey': `object:${hashIndex++}`
            });
        }
    }

    let passivePerception = 10 + abilityScoreModifiers.wisdom;
    if (perceptionMod !== null) {
        passivePerception = 10 + perceptionMod;
    } else if (typeof monster.passive === 'number' && monster.passive > 10) {
        passivePerception = monster.passive;
    }

    // Helper for entry-based ability lists (traits, actions, reactions, legendary)
    const convertActionList = (items) => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => {
            let desc = '';
            if (item.entries) {
                desc = formatEntries(item.entries);
            }
            return {
                name: item.name || '',
                description: desc,
                descriptionHtml: {},
                '$$hashKey': `object:${hashIndex++}`
            };
        });
    };

    const additionalAbilities = convertActionList(monster.trait);
    const actions = convertActionList(monster.action);
    const reactions = convertActionList(monster.reaction);
    const legendaryActions = convertActionList(monster.legendary);

    // Helper to sanitize array of strings (immunities, resistances, etc.)
    const cleanStringArray = (list) => {
        if (!Array.isArray(list)) return [];
        const result = [];
        for (const item of list) {
            if (typeof item === 'string') {
                result.push(item);
            } else if (item && typeof item === 'object') {
                const sub = item.immune || item.resist || item.vulnerable || item.conditionImmune;
                if (Array.isArray(sub)) {
                    result.push(...sub.filter((s) => typeof s === 'string'));
                } else if (typeof sub === 'string') {
                    result.push(sub);
                }
            }
        }
        return result;
    };

    // Identifiers
    const creatureId = options._id || monster._id || generateObjectId();
    const bestiaryId = options.bestiaryId || monster.bestiaryId || generateObjectId();

    // Flavor information
    const fluffEntries = monster.fluff && Array.isArray(monster.fluff.entries) ? monster.fluff.entries : [];
    const fluffImages = monster.fluff && Array.isArray(monster.fluff.images) ? monster.fluff.images : [];
    const imageUrl =
        fluffImages[0] && fluffImages[0].href && fluffImages[0].href.url ? fluffImages[0].href.url : '';

    return {
        flavor: {
            faction: '',
            environment: Array.isArray(monster.environment) ? monster.environment.filter(Boolean).join(', ') : (monster.environment || ''),
            description: fluffEntries.filter(Boolean).map(clean5eToolsTags).join('\n\n'),
            nameIsProper: Boolean(monster.isNamedCreature),
            imageUrl: imageUrl,
            descriptionHtml: ''
        },
        stats: {
            size: size,
            race: race,
            alignment: alignment,
            armorType: armorType,
            armorClass: armorClass,
            numHitDie: hpData.numHitDie,
            speed: speed,
            abilityScores: abilityScores,
            proficiencyBonus: 0,
            damageVulnerabilities: cleanStringArray(monster.vulnerable),
            damageResistances: cleanStringArray(monster.resist),
            damageImmunities: cleanStringArray(monster.immune),
            conditionImmunities: cleanStringArray(monster.conditionImmune),
            senses: cleanStringArray(monster.senses),
            languages: cleanStringArray(monster.languages),
            challengeRating: challengeRating,
            experiencePoints: experiencePoints,
            legendaryActionsPerRound: legendaryActions.length > 0 ? 3 : 0,
            legendaryActionsDescription: '',
            savingThrows: savingThrows,
            skills: skills,
            additionalAbilities: additionalAbilities,
            actions: actions,
            reactions: reactions,
            legendaryActions: legendaryActions,
            hitDieSize: hpData.hitDieSize,
            abilityScoreModifiers: abilityScoreModifiers,
            abilityScoreStrs: abilityScoreStrs,
            extraHealthFromConstitution: hpData.extraHealth,
            hitPoints: hpData.hitPoints,
            hitPointsStr: hpData.hitPointsStr,
            passivePerception: passivePerception,
            challengeRatingStr: challengeRatingStr
        },
        sharing: {
            linkSharingEnabled: false
        },
        _id: creatureId,
        name: monster.name || 'Unnamed Creature',
        __v: 0,
        bestiaryId: bestiaryId
    };
}

/**
 * Top-level converter function accepting either a JSON string, a single 5e.tools monster object,
 * an array of monsters, or a container object with a `monster` array.
 * @param {string|object|Array} input - Input data.
 * @param {object} [options={}] - Conversion options.
 * @returns {object|Array<object>} Converted CritterDB creature object or array of creature objects.
 */
export function convert5eToolsToCritterDB(input, options = {}) {
    let parsed = input;

    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) {
            throw new Error('Input is empty. Please paste valid 5e.tools monster JSON.');
        }
        try {
            parsed = JSON.parse(trimmed);
        } catch (err) {
            throw new Error(`Invalid JSON syntax: ${err.message}`);
        }
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Expected JSON object or array of monsters.');
    }

    // Shared Bestiary ID if multiple creatures are converted together
    const sharedBestiaryId = options.bestiaryId || generateObjectId();
    const creatureOptions = { ...options, bestiaryId: sharedBestiaryId };

    // Case 1: 5e.tools bestiary container { monster: [...] }
    if (parsed.monster && Array.isArray(parsed.monster)) {
        if (parsed.monster.length === 1 && !options.alwaysArray) {
            return convertSingleMonster(parsed.monster[0], creatureOptions);
        }
        return parsed.monster.map((m) => convertSingleMonster(m, creatureOptions));
    }

    // Case 2: Array of monsters [ { ... }, { ... } ]
    if (Array.isArray(parsed)) {
        if (parsed.length === 1 && !options.alwaysArray) {
            return convertSingleMonster(parsed[0], creatureOptions);
        }
        return parsed.map((m) => convertSingleMonster(m, creatureOptions));
    }

    // Case 3: Single monster object { name: "...", ... }
    return convertSingleMonster(parsed, creatureOptions);
}
