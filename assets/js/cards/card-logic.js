/**
 * Business Logic for the Virtual Trading Card System (V2 Simplified)
 * Handles pull probability, combos, point deduction, and state management.
 */
import { supabase } from '../supabaseClient.js';
import { cardDataManager } from './card-data-manager.js';
import { logError } from '../error-logger.js';

class CardLogic {
    constructor() {
        this.db = supabase;
        this.cachedCost = null;
    }

    async getGlobalPointCost() {
        if (this.cachedCost !== null) return this.cachedCost;
        const { data, error } = await this.db.from('CCS_system').select('value').eq('setting', 'card_point_cost').single();
        if (error) {
            await logError('card-system', `Failed to fetch global point cost: ${error.message}`);
            return 10; // Fallback
        }
        this.cachedCost = parseInt(data.value);
        return this.cachedCost;
    }

    async getPlayerCollection(userId) {
        const { data, error } = await this.db.from('CCS_player_cards').select(`
            id, state, acquired_at, revealed_at,
            card:card_id (id, monster_type, name, card_number, rarity, flavor_text, bonus_description, set_bonus_text, image_url, image_credit)
        `).eq('user_id', userId).order('acquired_at');
        if (error) {
            await logError('card-system', `Failed to fetch collection: ${error.message}`);
            return [];
        }
        return data;
    }

    async pullCard(userId) {
        try {
            const cost = await this.getGlobalPointCost();
            const balance = await cardDataManager.getBalance(userId);

            if (balance < cost) {
                throw new Error("Insufficient points");
            }

            // 1. Get owned card IDs
            const { data: ownedData, error: ownedError } = await this.db.from('CCS_player_cards')
                .select('card_id').eq('user_id', userId);
            
            if (ownedError) throw ownedError;
            const ownedIds = ownedData.map(r => r.card_id);

            // 2. Query eligible cards (active and not owned)
            const { data: allActive, error: activeErr } = await this.db.from('CCS_cards').select('id').eq('is_active', true);
            if (activeErr) throw activeErr;
            
            const eligibleIds = allActive.map(c => c.id).filter(id => !ownedIds.includes(id));
            
            if (eligibleIds.length === 0) {
                throw new Error("You've collected every available card!");
            }

            // 3. Randomly select one
            const randomIndex = Math.floor(Math.random() * eligibleIds.length);
            const selectedId = eligibleIds[randomIndex];

            // 4. Update balance
            await cardDataManager.updateBalance(userId, balance - cost);
            
            // 5. Insert card
            const { error: insertErr } = await this.db.from('CCS_player_cards').insert([{
                user_id: userId,
                card_id: selectedId,
                state: 'unrevealed'
            }]);

            if (insertErr) {
                // Refund points if insert fails (basic manual rollback)
                await cardDataManager.updateBalance(userId, balance);
                throw insertErr;
            }

            return true;

        } catch (e) {
            await logError('card-system', `Pull card failed: ${e.message}`);
            throw e;
        }
    }

    async revealCard(playerCardId) {
        const { error } = await this.db.from('CCS_player_cards').update({
            state: 'revealed',
            revealed_at: new Date().toISOString()
        }).eq('id', playerCardId).eq('state', 'unrevealed');

        if (error) {
            await logError('card-system', `Reveal failed: ${error.message}`);
            throw error;
        }
    }

    async useCard(playerCardId) {
        // In V2, using a card just deletes it from the player's inventory
        const { error } = await this.db.from('CCS_player_cards').delete().eq('id', playerCardId);
        if (error) {
            await logError('card-system', `Use card failed: ${error.message}`);
            throw error;
        }
    }

    async triggerCombo(userId, cardInstanceIds) {
        if (cardInstanceIds.length !== 5) throw new Error("Exactly 5 cards are required for a mega bonus.");
        
        try {
            // In V2, triggering a combo simply consumes (deletes) the 5 cards
            const { error: deleteErr } = await this.db.from('CCS_player_cards')
                .delete()
                .in('id', cardInstanceIds)
                .eq('user_id', userId)
                .eq('state', 'revealed');

            if (deleteErr) throw deleteErr;
            return true;
        } catch (e) {
            await logError('card-system', `Trigger combo failed: ${e.message}`);
            throw e;
        }
    }
}

export const cardLogic = new CardLogic();
