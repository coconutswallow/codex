/**
 * Data Manager for the Virtual Trading Card System (V2 Simplified)
 * Handles CRUD operations for cards and participants.
 */
import { supabase } from '../supabaseClient.js';
import { logError } from '../error-logger.js';

class CardDataManager {
    constructor() {
        this.db = supabase;
    }

    // ==========================================
    // CARDS
    // ==========================================

    async getCards(includeInactive = false) {
        let query = this.db.from('CCS_cards').select(`
            *,
            creator:created_by (display_name)
        `).order('monster_type').order('card_number');

        if (!includeInactive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;
        if (error) {
            await logError('card-system', `Failed to fetch cards: ${error.message}`);
            return [];
        }
        return data;
    }

    async saveCard(cardData) {
        if (cardData.id) {
            // Update
            const { error } = await this.db.from('CCS_cards').update(cardData).eq('id', cardData.id);
            if (error) throw error;
        } else {
            // Insert
            const { error } = await this.db.from('CCS_cards').insert([cardData]);
            if (error) throw error;
        }
    }

    async toggleCardActive(id, isActive) {
        const { error } = await this.db.from('CCS_cards').update({ is_active: isActive }).eq('id', id);
        if (error) {
            await logError('card-system', `Failed to toggle card active state: ${error.message}`);
            throw error;
        }
    }

    // ==========================================
    // PARTICIPANTS
    // ==========================================

    async getParticipants() {
        const { data, error } = await this.db.from('CCS_card_participants').select(`
            *,
            user:user_id (display_name, discord_id)
        `).order('enrolled_at', { ascending: false });

        if (error) {
            await logError('card-system', `Failed to fetch participants: ${error.message}`);
            return [];
        }
        return data;
    }

    async enrollParticipant(userId, enrolledBy, notes = null) {
        const payload = {
            user_id: userId,
            enrolled_by: enrolledBy,
            enabled: true,
            points: 0
        };
        // Don't overwrite points if they already exist
        const { data: existing } = await this.db.from('CCS_card_participants').select('user_id').eq('user_id', userId).single();
        
        if (existing) {
            // Just update enrolled_by and enabled
            const { error } = await this.db.from('CCS_card_participants').update({ enabled: true, enrolled_by: enrolledBy }).eq('user_id', userId);
            if (error) throw error;
        } else {
            const { error } = await this.db.from('CCS_card_participants').insert([payload]);
            if (error) {
                await logError('card-system', `Failed to enroll participant: ${error.message}`);
                throw error;
            }
        }
    }

    async toggleParticipantAccess(userId, enabled) {
        const { error } = await this.db.from('CCS_card_participants').update({ enabled: enabled }).eq('user_id', userId);
        if (error) {
            await logError('card-system', `Failed to toggle participant access: ${error.message}`);
            throw error;
        }
    }

    // ==========================================
    // POINTS (Simplified)
    // ==========================================

    async getBalance(userId) {
        const { data, error } = await this.db.from('CCS_card_participants').select('points').eq('user_id', userId).single();
        if (error) {
            await logError('card-system', `Failed to fetch balance: ${error.message}`);
            return 0;
        }
        return data ? data.points : 0;
    }

    async updateBalance(userId, newBalance) {
        const { error } = await this.db.from('CCS_card_participants').update({ points: newBalance }).eq('user_id', userId);
        if (error) {
            await logError('card-system', `Failed to update balance: ${error.message}`);
            throw error;
        }
    }
}

export const cardDataManager = new CardDataManager();
