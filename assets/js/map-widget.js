/**
 * Map Component - Reusable map viewer/editor
 * 
 * Usage:
 * 
 * 1. Add Leaflet CSS to your HTML head:
 *    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
 * 
 * 2. Add required scripts before closing body tag:
 *    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
 *    <script type="module" src="./assets/js/map-component.js"></script>
 * 
 * 3. Add a container div with data attributes:
 *    <div id="my-map" 
 *         data-map-component
 *         data-map-name="ansalon"
 *         data-editable="false"
 *         data-height="600px">
 *    </div>
 * 
 * Attributes:
 * - data-map-component: Required to identify the container
 * - data-map-name: Map name or ID to load
 * - data-map-id: Alternative to data-map-name, use numeric ID
 * - data-editable: "true" or "false" (default: false)
 * - data-height: CSS height value (default: "500px")
 * - data-show-title: "true" or "false" - show map title above (default: false)
 */

import { supabase } from './supabaseClient.js';

class MapComponent {
    constructor(container) {
        this.container = container;
        this.map = null;
        this.markers = new Map();
        this.currentMapData = null;
        
        // Get configuration from data attributes
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
        await this.loadMap();
    }

    setupContainer() {
        // Apply styles
        this.container.style.position = 'relative';
        this.container.style.width = '100%';
        
        // Create structure
        let html = '';
        
        if (this.config.showTitle) {
            html += `<div class="map-title" style="
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
                color: #333;
            "></div>`;
        }

        html += `
            <div class="map-error" style="
                display: none;
                background: #fee;
                color: #c33;
                padding: 12px;
                border-radius: 4px;
                margin-bottom: 10px;
                border: 1px solid #fcc;
            "></div>
            <div class="map-wrapper" style="
                width: 100%;
                height: ${this.config.height};
                border: 2px solid #ddd;
                border-radius: 8px;
                overflow: hidden;
                background: #f5f5f5;
            "></div>
        `;

        this.container.innerHTML = html;
        
        // Add Leaflet styles if not already present
        if (!document.querySelector('link[href*="leaflet.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        // Add custom popup styles
        this.addStyles();
    }

    addStyles() {
        if (document.getElementById('map-component-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'map-component-styles';
        styles.textContent = `
            .leaflet-popup-content-wrapper {
                background: #ffffff !important; 
                color: #333333 !important;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-family: inherit;
                font-size: 14px;
            }
            
            .leaflet-popup-content h3 {
                color: #58180D;
                margin: 0 0 10px 0;
                padding-bottom: 8px;
                border-bottom: 1px solid #eee;
            }

            .leaflet-popup-content p {
                margin: 8px 0;
                color: #333;
            }

            .leaflet-popup-content a {
                color: #58180D;
                text-decoration: none;
                font-weight: 600;
            }

            .leaflet-popup-content a:hover {
                text-decoration: underline;
            }

            .map-pin-form {
                display: flex;
                flex-direction: column;
                gap: 10px;
                min-width: 250px;
            }

            .map-pin-form strong {
                font-size: 16px;
                color: #333;
                margin-bottom: 5px;
            }

            .map-pin-form label {
                font-weight: 600;
                font-size: 13px;
                color: #555;
                margin-bottom: -5px;
            }

            .map-pin-form input,
            .map-pin-form textarea {
                width: 100%;
                padding: 8px;
                border: 1px solid #ccc;
                border-radius: 4px;
                background: #fff;
                color: #000;
                font-family: inherit;
                font-size: 14px;
                box-sizing: border-box;
            }

            .map-pin-form button {
                background: #58180D;
                color: white;
                border: none;
                padding: 10px;
                cursor: pointer;
                border-radius: 4px;
                font-weight: bold;
                font-size: 14px;
                margin-top: 5px;
            }

            .map-pin-form button:hover {
                opacity: 0.85;
            }

            .map-pin-form .delete-btn {
                background: #c0392b;
            }

            .map-pin-form .button-group {
                display: flex;
                gap: 8px;
            }

            .map-pin-form .button-group button {
                flex: 1;
            }
        `;
        document.head.appendChild(styles);
    }

    showError(message) {
        const errorDiv = this.container.querySelector('.map-error');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    hideError() {
        const errorDiv = this.container.querySelector('.map-error');
        errorDiv.style.display = 'none';
    }

    async loadMap() {
        this.hideError();

        if (!this.config.mapName && !this.config.mapId) {
            this.showError('No map specified. Use data-map-name or data-map-id.');
            return;
        }

        try {
            let query = supabase.from('location_maps').select('*');

            if (this.config.mapId) {
                query = query.eq('id', this.config.mapId);
            } else if (this.config.mapName) {
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
            await this.renderMap(mapData);

        } catch (err) {
            console.error('Error loading map:', err);
            this.showError('Failed to load map: ' + err.message);
        }
    }

    async renderMap(mapData) {
        const mapWidth = mapData.width;
        const mapHeight = mapData.height;
        const mapUrl = mapData.map_file_url;

        if (!mapWidth || !mapHeight) {
            this.showError('Map dimensions (width/height) are missing in the database.');
            return;
        }

        // Update title if shown
        if (this.config.showTitle) {
            const titleDiv = this.container.querySelector('.map-title');
            titleDiv.textContent = mapData.name || 'Map';
        }

        // Create map
        const mapWrapper = this.container.querySelector('.map-wrapper');
        this.map = L.map(mapWrapper, {
            crs: L.CRS.Simple,
            minZoom: -2,
            maxZoom: 3,
            zoomSnap: 0.5,
            scrollWheelZoom: true,
            attributionControl: false
        });

        const bounds = [[0, 0], [mapHeight, mapWidth]];
        
        L.imageOverlay(mapUrl, bounds).addTo(this.map);
        this.map.fitBounds(bounds);
        this.map.setMaxBounds(bounds);

        // Add click handler if editable
        if (this.config.editable) {
            this.map.on('click', (e) => this.handleMapClick(e));
        }

        await this.loadPins(mapData.id);
    }

    async loadPins(mapId) {
        try {
            const { data: locations, error } = await supabase
                .from('locations')
                .select('*')
                .eq('map_id', mapId);

            if (error) throw error;

            if (locations) {
                locations.forEach(loc => this.addMarker(loc));
            }

        } catch (err) {
            console.error('Error loading pins:', err);
            this.showError('Failed to load location pins: ' + err.message);
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
            marker.setIcon(L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            }));
        }
    }

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
        return `
            <div style="min-width: 200px;">
                <h3>${loc.name || 'Unnamed Location'}</h3>
                ${loc.description ? `<p>${loc.description}</p>` : ''}
                ${loc.link_url ? `<p><a href="${loc.link_url}" target="_blank">${loc.link_url}</a></p>` : ''}
                ${loc.is_home ? `<p><strong>Home Location</strong></p>` : ''}
                <p style="font-size: 12px; color: #666;">X: ${loc.x}, Y: ${loc.y}</p>
                <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button onclick="window.mapComponents['${this.container.id}'].editPin(${loc.id})" style="flex: 1; background: #58180D; color: white; border: none; padding: 6px; cursor: pointer; border-radius: 4px; font-size: 13px;">Edit</button>
                    <button onclick="window.mapComponents['${this.container.id}'].deletePin(${loc.id})" style="flex: 1; background: #c0392b; color: white; border: none; padding: 6px; cursor: pointer; border-radius: 4px; font-size: 13px;">Delete</button>
                </div>
            </div>
        `;
    }

    handleMapClick(e) {
        const x = e.latlng.lng.toFixed(2);
        const y = e.latlng.lat.toFixed(2);

        const formHtml = `
            <div class="map-pin-form">
                <strong>Add New Location</strong>
                <label>Name *</label>
                <input type="text" id="new-name-${this.container.id}" placeholder="Location name" required />
                
                <label>Description</label>
                <textarea id="new-desc-${this.container.id}" placeholder="Optional description" rows="3"></textarea>
                
                <label>Link URL</label>
                <input type="text" id="new-link-${this.container.id}" placeholder="https://..." />
                
                <label>
                    <input type="checkbox" id="new-home-${this.container.id}" style="width: auto; margin-right: 5px;" />
                    Mark as home location
                </label>
                
                <button onclick="window.mapComponents['${this.container.id}'].savePin(${x}, ${y})">Save Location</button>
            </div>
        `;

        L.popup()
            .setLatLng(e.latlng)
            .setContent(formHtml)
            .openOn(this.map);
    }

    async savePin(x, y) {
        const name = document.getElementById(`new-name-${this.container.id}`).value.trim();
        const desc = document.getElementById(`new-desc-${this.container.id}`).value.trim();
        const link = document.getElementById(`new-link-${this.container.id}`).value.trim();
        const isHome = document.getElementById(`new-home-${this.container.id}`).checked;

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
            alert('Failed to save location: ' + err.message);
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

            const editForm = `
                <div class="map-pin-form">
                    <strong>Edit Location</strong>
                    <label>Name *</label>
                    <input type="text" id="edit-name-${this.container.id}" value="${data.name || ''}" required />
                    
                    <label>Description</label>
                    <textarea id="edit-desc-${this.container.id}" rows="3">${data.description || ''}</textarea>
                    
                    <label>Link URL</label>
                    <input type="text" id="edit-link-${this.container.id}" value="${data.link_url || ''}" />
                    
                    <label>
                        <input type="checkbox" id="edit-home-${this.container.id}" ${data.is_home ? 'checked' : ''} style="width: auto; margin-right: 5px;" />
                        Mark as home location
                    </label>
                    
                    <div class="button-group">
                        <button onclick="window.mapComponents['${this.container.id}'].saveEdit(${locationId})">Save</button>
                        <button onclick="window.mapComponents['${this.container.id}'].cancelEdit(${locationId})">Cancel</button>
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
            alert('Failed to load location: ' + err.message);
        }
    }

    async saveEdit(locationId) {
        const name = document.getElementById(`edit-name-${this.container.id}`).value.trim();
        const desc = document.getElementById(`edit-desc-${this.container.id}`).value.trim();
        const link = document.getElementById(`edit-link-${this.container.id}`).value.trim();
        const isHome = document.getElementById(`edit-home-${this.container.id}`).checked;

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
                        marker.setIcon(L.icon({
                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                            iconSize: [25, 41],
                            iconAnchor: [12, 41],
                            popupAnchor: [1, -34],
                            shadowSize: [41, 41]
                        }));
                    } else {
                        marker.setIcon(new L.Icon.Default());
                    }
                }
            }

        } catch (err) {
            console.error('Error updating location:', err);
            alert('Failed to update location: ' + err.message);
        }
    }

    async cancelEdit(locationId) {
        try {
            const { data, error } = await supabase
                .from('locations')
                .select('*')
                .eq('id', locationId)
                .single();

            if (error) throw error;

            const marker = this.markers.get(locationId);
            if (marker) {
                marker.setPopupContent(this.createEditablePopup(data));
            }

        } catch (err) {
            console.error('Error:', err);
        }
    }

    async deletePin(locationId) {
        if (!confirm('Are you sure you want to delete this location?')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('locations')
                .delete()
                .eq('id', locationId);

            if (error) throw error;

            const marker = this.markers.get(locationId);
            if (marker) {
                this.map.removeLayer(marker);
                this.markers.delete(locationId);
            }

        } catch (err) {
            console.error('Error deleting location:', err);
            alert('Failed to delete location: ' + err.message);
        }
    }
}

// Initialize all map components on page load
window.mapComponents = window.mapComponents || {};

function initMapComponents() {
    const containers = document.querySelectorAll('[data-map-component]');
    containers.forEach(container => {
        if (!container.id) {
            container.id = 'map-' + Math.random().toString(36).substr(2, 9);
        }
        window.mapComponents[container.id] = new MapComponent(container);
    });
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMapComponents);
} else {
    initMapComponents();
}

export { MapComponent, initMapComponents };