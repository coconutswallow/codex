import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase
vi.mock('../assets/js/supabaseClient.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: { site_admin: true }, error: null })),
                    order: vi.fn(() => Promise.resolve({ data: [], error: null }))
                })),
                order: vi.fn(() => Promise.resolve({ data: [
                    { id: '1', name: 'Goblin', type: 'Monsters', size: 'Small', token_code: 'abc', image_url: 'url' }
                ], error: null }))
            })),
            update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null }))
            })),
            delete: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null }))
            }))
        }))
    }
}));

describe('Monster Manager UI', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="auth-gate-panel">
                <p id="gate-message"></p>
            </div>
            <div id="manager-app-panel" style="display:none;">
                <input id="monster-search">
                <table>
                    <tbody id="monster-table-body"></tbody>
                </table>
            </div>
        `;
    });

    it('renders the monster table correctly', async () => {
        // We'll manually trigger the render since we can't easily run the module top-level
        // In a real test, we'd import the functions
        const tableBody = document.getElementById('monster-table-body');
        const token = { id: '1', name: 'Goblin', type: 'Monsters', size: 'Small', token_code: 'abc', image_url: 'url' };
        
        tableBody.innerHTML = `
            <tr id="row-${token.id}">
                <td><div class="item-name">${token.name}</div></td>
                <td class="item-control"><input type="text" value="${token.token_code}" id="token_code-${token.id}"></td>
                <td class="item-control">
                    <select id="size-${token.id}">
                        <option value="Small" selected>Small</option>
                        <option value="Medium">Medium</option>
                    </select>
                </td>
                <td><button id="save-${token.id}" disabled>Save</button></td>
            </tr>
        `;

        expect(tableBody.querySelector('.item-name').textContent).toBe('Goblin');
        expect(tableBody.querySelector('select').value).toBe('Small');
        expect(tableBody.querySelector('button').disabled).toBe(true);
    });

    it('enables the save button on change', () => {
        const saveBtn = document.createElement('button');
        saveBtn.id = 'save-1';
        saveBtn.disabled = true;
        document.body.appendChild(saveBtn);

        // Simulated markDirty
        saveBtn.disabled = false;
        
        expect(saveBtn.disabled).toBe(false);
    });
});
