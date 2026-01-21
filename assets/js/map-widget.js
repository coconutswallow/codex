import { supabase } from './supabaseClient.js';

/**
 * Helper: Fetch list of maps for dropdowns
 */
export async function fetchMapList() {
    const { data, error } = await supabase
        .from('location_maps')
        .select('id, name, description')
        .order('name');
    
    if (error) throw error;
    return data;
}

export class MapComponent {
    constructor(container) {
        this.container = container;
        this.map = null;
        this.markers = new Map();
        this.currentMapData = null;
        
        // Configuration
        this.config = {
            mapName: container.dataset.mapName || null,
            mapId: container.dataset.mapId ? parseInt(container.dataset.mapId) : null,
            editable: container.dataset.editable === 'true',
            height: container.dataset.height || '500px',
            showTitle: container.dataset.showTitle === 'true'
        };

        this.init();
    }

    async init() {
        this.setupContainer();
        
        // Add Leaflet CSS if missing
        if (!document.querySelector('link[href*="leaflet.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        if (this.config.mapName || this.config.mapId) {
            await this.loadMap();
        }
    }

    setupContainer() {
        this.container.style.position = 'relative';
        this.container.style.width = '100%';
        
        let html = '';
        if (this.config.showTitle) {
            html += `<div class="map-component-title"></div>`;
        }
        
        html += `
            <div class="map-component-error error" style="display: none;"></div>
            <div class="map-component-wrapper" style="width: 100%; height: ${this.config.height};"></div>
        `;

        this.container.innerHTML = html;
    }

    showError(message) {
        const errorDiv = this.container.querySelector('.map-component-error');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        } else {
            console.error(message);
        }
    }

    hideError() {
        const errorDiv = this.container.querySelector('.map-component-error');
        if (errorDiv) errorDiv.style.display = 'none';
    }

    // --- Loading Methods ---

    async loadMapById(mapId) {
        this.config.mapId = mapId;
        this.config.mapName = null;
        await this.loadMap();
    }

    async loadMapByName(mapName) {
        this.config.mapName = mapName;
        this.config.mapId = null;
        await this.loadMap();
    }

    async loadMap() {
        this.hideError();
        
        if (!this.config.mapName && !this.config.mapId) return;

        try {
            let query = supabase.from('location_maps').select('*');

            if (this.config.mapId) {
                query = query.eq('id', this.config.mapId);
            } else {
                query = query.ilike('name', this.config.mapName);
            }

            const { data: mapData, error } = await query.single();

            if (error) {
                if (error.code === 'PGRST116') {
                    this.showError(`Map not found: ${this.config.mapName || this.config.mapId}`);
                } else {
                    throw error;
                }
                return;
            }

            this.currentMapData = mapData;

            // Dispatch event for parent pages (e.g. Viewer title update)
            this.container.dispatchEvent(new CustomEvent('maploaded', { 
                detail: mapData,
                bubbles: true 
            }));

            if (this.config.showTitle) {
                const titleDiv = this.container.querySelector('.map-component-title');
                if (titleDiv) titleDiv.textContent = mapData.name;
            }

            await this.renderMap(mapData);

        } catch (err) {
            console.error('Error loading map:', err);
            this.showError('Failed to load map: ' + err.message);
        }
    }

    async renderMap(mapData) {
    const mapWrapper = this.container.querySelector('.map-component-wrapper');
    
    // Set widget height dynamically from DB if height isn't hardcoded in data-attributes
    if (mapData.display_height && !this.container.dataset.height) {
        mapWrapper.style.height = mapData.display_height;
    }

    if (this.map) {
        this.map.remove();
        this.markers.clear();
    }

    const bounds = [[0, 0], [mapData.height, mapData.width]];
    
    this.map = L.map(mapWrapper, {
        crs: L.CRS.Simple,
        minZoom: -3,
        maxZoom: 3,
        attributionControl: false
    });

    L.imageOverlay(mapData.map_file_url, bounds).addTo(this.map);

    // LOGIC: Use DB defaults if they exist, otherwise fit bounds
    if (mapData.initial_x !== null && mapData.initial_y !== null) {
        this.map.setView([mapData.initial_y, mapData.initial_x], mapData.initial_zoom || 0);
    } else {
        this.map.fitBounds(bounds);
    }

    if (this.config.editable) {
        this.map.on('click', (e) => this.handleMapClick(e));
    }

    await this.loadPins(mapData.id);
}

// NEW METHOD: Capture current view for the Editor
async saveCurrentViewAsDefault() {
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    const height = this.container.querySelector('.map-component-wrapper').style.height;

    const { error } = await supabase
        .from('location_maps')
        .update({
            initial_x: center.lng,
            initial_y: center.lat,
            initial_zoom: zoom,
            display_height: height // Optional: saves current UI height
        })
        .eq('id', this.currentMapData.id);

    if (error) throw error;
    alert('Default view saved!');
}

    async loadPins(mapId) {
        try {
            const { data: locations, error } = await supabase
                .from('locations')
                .select('*')
                .eq('map_id', mapId);

            if (error) throw error;
            if (locations) locations.forEach(loc => this.addMarker(loc));

        } catch (err) {
            console.error('Error loading pins:', err);
            this.showError('Failed to load locations');
        }
    }

    addMarker(loc) {
        const marker = L.marker([loc.y, loc.x]).addTo(this.map);
        this.markers.set(loc.id, marker);
        
        const popupContent = this.config.editable 
            ? this.createEditablePopup(loc)
            : this.createReadonlyPopup(loc);
        
        marker.bindPopup(popupContent);
        
        if (loc.is_home) {
            this.setHomeIcon(marker);
        }
    }

    setHomeIcon(marker) {
        marker.setIcon(L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        }));
    }

    // --- Popup Generators ---

    createReadonlyPopup(loc) {
        return `
            <div style="min-width: 180px;">
                <h3>${loc.name || 'Unnamed Location'}</h3>
                ${loc.description ? `<p>${loc.description}</p>` : ''}
                ${loc.link_url ? `<p><a href="${loc.link_url}" target="_blank">Read More &raquo;</a></p>` : ''}
            </div>
        `;
    }

    createEditablePopup(loc) {
        const id = this.container.id;
        return `
            <div class="location-display">
                <h3>${loc.name || 'Unnamed Location'}</h3>
                ${loc.description ? `<p><strong>Description:</strong> ${loc.description}</p>` : ''}
                ${loc.link_url ? `<p><strong>Link:</strong> <a href="${loc.link_url}" target="_blank">${loc.link_url}</a></p>` : ''}
                ${loc.is_home ? `<p><strong>Home Location:</strong> Yes</p>` : ''}
                <p><strong>Coordinates:</strong> X: ${loc.x}, Y: ${loc.y}</p>
                <div class="edit-actions">
                    <button onclick="window.mapComponents['${id}'].editPin(${loc.id})">Edit</button>
                    <button class="delete-btn" onclick="window.mapComponents['${id}'].deletePin(${loc.id})">Delete</button>
                </div>
            </div>
        `;
    }

    // --- Interaction Handlers ---

    handleMapClick(e) {
        const x = e.latlng.lng.toFixed(2);
        const y = e.latlng.lat.toFixed(2);
        const id = this.container.id;

        const formHtml = `
            <div class="pin-form">
                <strong>Add New Location</strong>
                <label>Name *</label>
                <input type="text" id="new-name-${id}" placeholder="Location name" required />
                
                <label>Description</label>
                <textarea id="new-desc-${id}" placeholder="Optional description" rows="3"></textarea>
                
                <label>Link URL</label>
                <input type="text" id="new-link-${id}" placeholder="https://..." />
                
                <label>
                    <input type="checkbox" id="new-home-${id}" style="width: auto; margin-right: 5px;" />
                    Mark as home location
                </label>
                
                <button onclick="window.mapComponents['${id}'].savePin(${x}, ${y})">Save Location</button>
            </div>
        `;

        L.popup().setLatLng(e.latlng).setContent(formHtml).openOn(this.map);
    }

    async savePin(x, y) {
        const id = this.container.id;
        const name = document.getElementById(`new-name-${id}`).value.trim();
        const desc = document.getElementById(`new-desc-${id}`).value.trim();
        const link = document.getElementById(`new-link-${id}`).value.trim();
        const isHome = document.getElementById(`new-home-${id}`).checked;

        if (!name) {
            alert('Location name is required');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('locations')
                .insert([{
                    map_id: this.currentMapData.id,
                    name: name,
                    x: parseFloat(x),
                    y: parseFloat(y),
                    description: desc || null,
                    link_url: link || null,
                    is_home: isHome
                }])
                .select();

            if (error) throw error;

            if (data && data[0]) {
                this.addMarker(data[0]);
                this.map.closePopup();
            }
        } catch (err) {
            console.error('Error saving pin:', err);
            alert('Failed to save: ' + err.message);
        }
    }

    async editPin(locationId) {
        try {
            const { data, error } = await supabase
                .from('locations')
                .select('*')
                .eq('id', locationId)
                .single();

            if (error) throw error;
            const id = this.container.id;

            const editForm = `
                <div class="pin-form">
                    <strong>Edit Location</strong>
                    <label>Name *</label>
                    <input type="text" id="edit-name-${id}" value="${data.name || ''}" required />
                    
                    <label>Description</label>
                    <textarea id="edit-desc-${id}" rows="3">${data.description || ''}</textarea>
                    
                    <label>Link URL</label>
                    <input type="text" id="edit-link-${id}" value="${data.link_url || ''}" />
                    
                    <label>
                        <input type="checkbox" id="edit-home-${id}" ${data.is_home ? 'checked' : ''} style="width: auto; margin-right: 5px;" />
                        Mark as home location
                    </label>
                    
                    <div class="button-group">
                        <button onclick="window.mapComponents['${id}'].saveEdit(${locationId})">Save</button>
                        <button onclick="window.mapComponents['${id}'].cancelEdit(${locationId})">Cancel</button>
                    </div>
                </div>
            `;

            const marker = this.markers.get(locationId);
            if (marker) {
                marker.setPopupContent(editForm);
                marker.openPopup();
            }

        } catch (err) {
            console.error('Error loading location:', err);
            alert('Failed to load location');
        }
    }

    async saveEdit(locationId) {
        const id = this.container.id;
        const name = document.getElementById(`edit-name-${id}`).value.trim();
        const desc = document.getElementById(`edit-desc-${id}`).value.trim();
        const link = document.getElementById(`edit-link-${id}`).value.trim();
        const isHome = document.getElementById(`edit-home-${id}`).checked;

        if (!name) {
            alert('Location name is required');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('locations')
                .update({
                    name: name,
                    description: desc || null,
                    link_url: link || null,
                    is_home: isHome
                })
                .eq('id', locationId)
                .select();

            if (error) throw error;

            if (data && data[0]) {
                const marker = this.markers.get(locationId);
                if (marker) {
                    marker.setPopupContent(this.createEditablePopup(data[0]));
                    
                    if (data[0].is_home) {
                        this.setHomeIcon(marker);
                    } else {
                        marker.setIcon(new L.Icon.Default());
                    }
                }
            }

        } catch (err) {
            console.error('Error updating:', err);
            alert('Failed to update: ' + err.message);
        }
    }

    async cancelEdit(locationId) {
        try {
            const { data, error } = await supabase
                .from('locations')
                .select('*')
                .eq('id', locationId)
                .single();

            if (!error && data) {
                const marker = this.markers.get(locationId);
                if (marker) marker.setPopupContent(this.createEditablePopup(data));
            }
        } catch (err) {
            console.error(err);
        }
    }

    async deletePin(locationId) {
        if (!confirm('Are you sure you want to delete this location?')) return;

        try {
            const { error } = await supabase.from('locations').delete().eq('id', locationId);
            if (error) throw error;

            const marker = this.markers.get(locationId);
            if (marker) {
                this.map.removeLayer(marker);
                this.markers.delete(locationId);
            }
        } catch (err) {
            console.error('Error deleting:', err);
            alert('Failed to delete: ' + err.message);
        }
    }
}

// Global initialization
window.mapComponents = window.mapComponents || {};

export function initMapComponents() {
    const containers = document.querySelectorAll('[data-map-component]');
    containers.forEach(container => {
        if (!container.id) {
            container.id = 'map-' + Math.random().toString(36).substr(2, 9);
        }
        if (!window.mapComponents[container.id]) {
            window.mapComponents[container.id] = new MapComponent(container);
        }
    });
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMapComponents);
} else {
    initMapComponents();
}