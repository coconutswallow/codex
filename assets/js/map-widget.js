/**
 * map-widget.js
 * Optimized for Top-Left (0,0) coordinates to prevent Vertical Drift
 */

import { supabase } from './supabaseClient.js';

class MapComponent {
    constructor(container) {
        this.container = container;
        this.mapId = container.dataset.mapId;
        this.mapName = container.dataset.mapName;
        this.isEditable = container.dataset.editable === 'true';
        this.map = null;
        this.currentMapData = null;
        this.markers = new Map(); // Using a Map object for easier management
        
        this.init();
    }

    async init() {
        // Fix for "offsetWidth" error: ensure container is ready
        if (!this.container || this.container.offsetWidth === 0) {
            setTimeout(() => this.init(), 100);
            return;
        }

        try {
            if (this.mapId) {
                await this.loadMapById(this.mapId);
            } else if (this.mapName) {
                await this.loadMapByName(this.mapName);
            } else {
                this.renderError("No map ID or name provided.");
            }
        } catch (err) {
            console.error("Initialization error:", err);
            this.renderError("Failed to initialize map.");
        }
    }

    async loadMapById(id) {
        const { data, error } = await supabase
            .from('location_maps')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        this.renderMap(data);
    }

    async loadMapByName(name) {
        const { data, error } = await supabase
            .from('location_maps')
            .select('*')
            .eq('name', name)
            .single();
        if (error) throw error;
        this.renderMap(data);
    }

    renderMap(mapData) {
        this.currentMapData = mapData;
        this.container.innerHTML = ''; 
        this.container.style.height = mapData.display_height || '600px';

        const w = mapData.width;
        const h = mapData.height;

        // THE VERTICAL DRIFT KILLER: 
        // We set the coordinate system so [0,0] is top-left and [-h, w] is bottom-right.
        const bounds = [[-h, 0], [0, w]]; 

        this.map = L.map(this.container.id, {
            crs: L.CRS.Simple,
            minZoom: -2,
            maxBounds: bounds,
            maxBoundsViscosity: 1.0,
            attributionControl: false
        });

        L.imageOverlay(mapData.map_file_url, bounds, {
            crossOrigin: true,
            interactive: true
        }).addTo(this.map);

        if (mapData.initial_x !== null && mapData.initial_y !== null) {
            this.map.setView([mapData.initial_y, mapData.initial_x], mapData.initial_zoom || 0);
        } else {
            this.map.fitBounds(bounds);
        }

        // Fixed: loadLocations is now correctly scoped
        this.loadLocations();

        if (this.isEditable) {
            this.setupEditorControls();
        }
    }

    async loadLocations() {
        const { data, error } = await supabase
            .from('locations')
            .select('*')
            .eq('map_id', this.currentMapData.id);

        if (error) return console.error("Error loading pins:", error);
        data.forEach(loc => this.addMarker(loc));
    }

    addMarker(location) {
        const y = parseFloat(location.y);
        const x = parseFloat(location.x);

        // Map relative position: ensures Y is always negative for Top-Down logic
        const marker = L.marker([y > 0 ? -y : y, x]).addTo(this.map);
        
        let popupContent = `
            <div class="location-display">
                <h3 class="map-component-title">${location.name}</h3>
                <p>${location.description || ''}</p>
                ${location.link_url ? `<a href="${location.link_url}" target="_blank">View Details</a>` : ''}
            </div>
        `;

        if (this.isEditable) {
            popupContent += `<button class="delete-btn" onclick="window.mapComponents['${this.container.id}'].deletePin(${location.id})">Delete</button>`;
        }

        marker.bindPopup(popupContent);
        this.markers.set(location.id, marker);
    }

    setupEditorControls() {
        this.map.on('contextmenu', (e) => {
            const { lat, lng } = e.latlng;
            L.popup()
                .setLatLng(e.latlng)
                .setContent(`
                    <div class="pin-form">
                        <label>Name</label><input type="text" id="new-pin-name">
                        <button onclick="window.mapComponents['${this.container.id}'].savePin(${lat}, ${lng})">Save Pin</button>
                    </div>
                `).openOn(this.map);
        });
    }

    async savePin(lat, lng) {
        const name = document.getElementById('new-pin-name').value;
        const { data, error } = await supabase
            .from('locations')
            .insert([{ map_id: this.currentMapData.id, name, x: lng, y: lat }])
            .select();

        if (error) return alert(error.message);
        this.addMarker(data[0]);
        this.map.closePopup();
    }

    async deletePin(id) {
        if (!confirm("Delete this pin?")) return;
        const { error } = await supabase.from('locations').delete().eq('id', id);
        if (error) return alert(error.message);
        
        this.map.removeLayer(this.markers.get(id));
        this.markers.delete(id);
    }

    renderError(msg) {
        this.container.innerHTML = `<div class="error" style="display:block">${msg}</div>`;
    }
}

window.mapComponents = window.mapComponents || {};
export function initMapComponents() {
    document.querySelectorAll('[data-map-component]').forEach(el => {
        if (!window.mapComponents[el.id]) {
            window.mapComponents[el.id] = new MapComponent(el);
        }
    });
}