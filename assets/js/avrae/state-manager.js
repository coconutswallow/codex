/**
 * /assets/js/avrae/state-manager.js
 * Centralized state management for Avrae Battle Manager
 */

class StateManager {
    constructor() {
        this.tokenData = {};           // { "goblin": {token, size, display}, ... }
        this.monsterNames = [];        // ["Goblin", "Orc", ...] for autocomplete
        this.currentSessionId = null;  // Current session ID from Supabase
        this.currentSessionName = null; // Current session Name from Supabase
        this.revealedTiles = new Set(); // Set of "x,y" strings
        this.currentTurnTiles = new Set(); // Temporary visibility for current positions
        this.mapImage = null;          // Loaded map image
        this.effects = {};             // { "player_1": { type, color, size, loc, persistent, ... } }
    }

    // Effect management
    setEffect(id, effect) {
        if (!effect) {
            delete this.effects[id];
        } else {
            this.effects[id] = effect;
        }
    }

    getEffect(id) {
        return this.effects[id];
    }

    getAllEffects() {
        return this.effects;
    }

    // Token data
    setTokenData(data) {
        this.tokenData = data;
    }

    getTokenData() {
        return this.tokenData;
    }

    getTokenInfo(monsterName) {
        return this.tokenData[monsterName.toLowerCase()];
    }

    // Monster names
    setMonsterNames(names) {
        this.monsterNames = names;
    }

    getMonsterNames() {
        return this.monsterNames;
    }

    // Session
    setSessionId(id) {
        this.currentSessionId = id;
    }

    getSessionId() {
        return this.currentSessionId;
    }

    setSessionName(name) {
        this.currentSessionName = name;
    }

    getSessionName() {
        return this.currentSessionName;
    }

    // Fog of War
    addRevealedTile(x, y) {
        this.revealedTiles.add(`${x},${y}`);
    }

    isRevealed(x, y) {
        return this.revealedTiles.has(`${x},${y}`);
    }

    clearRevealed() {
        this.revealedTiles.clear();
    }

    getRevealedTiles() {
        return this.revealedTiles;
    }

    setRevealedTiles(tiles) {
        this.revealedTiles = new Set(tiles);
    }

    setCurrentTurnTiles(tiles) {
        this.currentTurnTiles = new Set(tiles);
    }

    getCurrentTurnTiles() {
        return this.currentTurnTiles;
    }

    isCurrentlyVisible(x, y) {
        return this.currentTurnTiles.has(`${x},${y}`);
    }

    // Map image
    setMapImage(img) {
        this.mapImage = img;
    }

    getMapImage() {
        return this.mapImage;
    }

    // Serialization for save/load
    serialize() {
        const state = {
            revealed: Array.from(this.revealedTiles),
            effects: this.effects,
            inputs: {}
        };

        // Collect all input values
        document.querySelectorAll("input").forEach((el) => {
            if (!el.id) return;
            state.inputs[el.id] = el.type === "checkbox" ? el.checked : el.value;
        });

        return state;
    }

    deserialize(state) {
        this.revealedTiles = new Set(state?.revealed || []);
        this.effects = state?.effects || {};

        const inputs = state?.inputs || {};
        Object.keys(inputs).forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === "checkbox") {
                el.checked = !!inputs[id];
            } else {
                el.value = inputs[id];
            }
        });
    }

    reset() {
        this.currentSessionId = null;
        this.currentSessionName = null;
        this.revealedTiles.clear();
        this.effects = {};
    }
}

// Export singleton instance
export const state = new StateManager();