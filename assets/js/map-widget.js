/**
 * map-widget.js
 * 
 * OVERVIEW:
 * Interactive map component using Leaflet.js with Simple CRS (Coordinate Reference System)
 * for displaying custom map images with location pins. Supports both view-only and 
 * editable modes with full CRUD operations.
 * 
 * KEY FEATURES:
 * - Top-left (0,0) coordinate system matching image coordinates
 * - Rich pin editing with name, description, URL, and home icon support
 * - Customizable default view saving for all users
 * - Two icon types: standard pins and home/HQ icons
 * - Integrated with Supabase for database operations
 * 
 * COORDINATE SYSTEM:
 * - Database stores: X (horizontal 0 to width), Y (vertical 0 to height)
 * - Leaflet uses: [latitude, longitude] where lat is negative Y, lng is X
 * - Bounds: Top-left [0,0] → Bottom-right [-height, width]
 * 
 * DEPENDENCIES:
 * - Leaflet.js 1.9.4+
 * - Supabase client
 * 
 * DATABASE SCHEMA EXPECTATIONS:
 * - location_maps: id, name, map_file_url, width, height, display_height, 
 *                  initial_x, initial_y, initial_zoom
 * - locations: id, map_id, name, description, link_url, is_home, x, y
 */

import { supabase } from './supabaseClient.js';

// ============================================================================
// ICON DEFINITIONS
// ============================================================================

/**
 * Default Leaflet marker icon
 * Standard blue pin used for regular locations
 */
const defaultIcon = new L.Icon.Default();

/**
 * Custom home/HQ icon
 * Black house icon using inline SVG data URI to avoid external file dependencies
 * 
 * Properties:
 * - iconSize: [32, 32] - Display size in pixels
 * - iconAnchor: [16, 30] - Point that corresponds to marker's location (bottom-center)
 * - popupAnchor: [0, -30] - Point from which popup opens relative to iconAnchor
 */
const homeIcon = L.icon({
    iconUrl: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22black%22%20width%3D%2232%22%20height%3D%2232%22%3E%3Cpath%20d%3D%22M10%2020v-6h4v6h5v-8h3L12%203%202%2012h3v8z%22%2F%3E%3Cpath%20d%3D%22M0%200h24v24H0z%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E',
    iconSize: [32, 32],
    iconAnchor: [16, 30],
    popupAnchor: [0, -30]
});

// ============================================================================
// MAP COMPONENT CLASS
// ============================================================================

/**
 * MapComponent
 * 
 * Manages a single interactive map instance with location markers.
 * Can be initialized in view-only or editable mode.
 * 
 * INITIALIZATION:
 * Maps are initialized via data attributes on container elements:
 * - data-map-component: Marks element as map container
 * - data-map-id: Database ID to load map by ID
 * - data-map-name: Database name to load map by name
 * - data-editable: "true" to enable editing controls
 * 
 * USAGE EXAMPLE:
 * <div id="my-map" 
 *      data-map-component 
 *      data-map-name="Hawthorne-Location" 
 *      data-editable="false">
 * </div>
 */
class MapComponent {
    /**
     * Constructor
     * @param {HTMLElement} container - DOM element to render map into
     */
    constructor(container) {
        this.container = container;
        this.mapId = container.dataset.mapId;           // Optional: DB ID to load
        this.mapName = container.dataset.mapName;       // Optional: DB name to load
        this.isEditable = container.dataset.editable === 'true'; // Enable edit mode
        this.map = null;                                // Leaflet map instance
        this.currentMapData = null;                     // Current map database record
        this.markers = new Map();                       // Map of location ID → Leaflet marker
        
        this.init();
    }

    /**
     * Initialize the map component
     * 
     * Waits for container to have dimensions (needed for Leaflet),
     * then loads map data from database and renders it.
     * 
     * LOADING PRIORITY:
     * 1. Load by ID if data-map-id is present
     * 2. Load by name if data-map-name is present
     * 3. Show error if neither is provided
     */
    async init() {
        // Wait for container to be sized (Leaflet requires dimensions)
        if (!this.container || this.container.offsetWidth === 0) {
            setTimeout(() => this.init(), 100);
            return;
        }

        try {
            if (this.mapId) await this.loadMapById(this.mapId);
            else if (this.mapName) await this.loadMapByName(this.mapName);
            else this.renderError("No map ID provided.");
        } catch (err) {
            console.error(err);
            this.renderError("Map failed to load.");
        }
    }

    /**
     * Load map by database ID
     * @param {string|number} id - Primary key of location_maps record
     */
    async loadMapById(id) {
        const { data, error } = await supabase
            .from('location_maps')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        this.renderMap(data);
    }

    /**
     * Load map by unique name
     * @param {string} name - Unique name field of location_maps record
     */
    async loadMapByName(name) {
        const { data, error } = await supabase
            .from('location_maps')
            .select('*')
            .eq('name', name)
            .single();
        
        if (error) throw error;
        this.renderMap(data);
    }

    /**
     * Render the Leaflet map with custom image overlay
     * 
     * COORDINATE SYSTEM EXPLANATION:
     * - Leaflet Simple CRS uses [lat, lng] coordinates
     * - We map image coordinates to: Top-left [0,0] → Bottom-right [-height, width]
     * - This puts origin at top-left, matching standard image coordinate systems
     * - Y values are negative in Leaflet to flip vertical axis
     * 
     * MAP CONFIGURATION:
     * - minZoom: -2, maxZoom: 2 (allows zoom out and in)
     * - zoomSnap/Delta: 0.25 (smooth zooming in quarter increments)
     * - maxBounds: Constrains panning to image boundaries
     * - maxBoundsViscosity: 1.0 (hard stop at edges, no "bounce")
     * 
     * @param {Object} mapData - Database record from location_maps table
     */
    renderMap(mapData) {
        this.currentMapData = mapData;
        this.container.innerHTML = '';
        
        // Set container height from database or default
        // Skip if using responsive CSS classes
        if (!this.container.style.height && !this.container.classList.contains('responsive-map-frame')) {
             this.container.style.height = mapData.display_height || '600px';
        }

        // Calculate bounds for Simple CRS
        // Origin at top-left [0,0], extends to [-height, width]
        const w = mapData.width;
        const h = mapData.height;
        const bounds = [[-h, 0], [0, w]];

        // Initialize Leaflet map with Simple CRS
        this.map = L.map(this.container.id, {
            crs: L.CRS.Simple,              // Use pixel-based coordinate system
            minZoom: -2,                    // Allow zooming out
            maxZoom: 2,                     // Allow zooming in
            zoomSnap: 0.25,                 // Smooth zoom increments
            zoomDelta: 0.25,                // Mouse wheel zoom step
            maxBounds: bounds,              // Constrain view to image
            maxBoundsViscosity: 1.0,        // Hard boundary (no bounce)
            attributionControl: false       // Hide Leaflet attribution
        });

        // Add map image as overlay layer
        L.imageOverlay(mapData.map_file_url, bounds).addTo(this.map);
        
        // Set initial view from database settings or fit to bounds
        if (mapData.initial_x !== null && mapData.initial_y !== null) {
            // Use saved default view
            this.map.setView(
                [mapData.initial_y, mapData.initial_x], 
                mapData.initial_zoom || 0
            );
        } else {
            // Auto-fit to show entire map
            this.map.fitBounds(bounds);
        }

        // Load and display location pins
        this.loadLocations();

        // Add editing controls if in editable mode
        if (this.isEditable) {
            this.setupEditorControls();
        }
    }

    /**
     * Load all location pins for current map from database
     * Queries locations table and creates a marker for each record
     */
    async loadLocations() {
        const { data } = await supabase
            .from('locations')
            .select('*')
            .eq('map_id', this.currentMapData.id);
        
        if (data) data.forEach(loc => this.addMarker(loc));
    }

    /**
     * Add a location marker to the map
     * 
     * COORDINATE CONVERSION:
     * - Database stores Y as positive (0 to height)
     * - Leaflet needs negative Y for top-left origin
     * - Conversion: if Y > 0, negate it; otherwise keep as-is
     * 
     * MARKER CONTENT:
     * - View mode: Shows name, description, and optional link
     * - Edit mode: Adds delete button in popup
     * 
     * @param {Object} location - Database record from locations table
     */
    addMarker(location) {
        const y = parseFloat(location.y);
        const x = parseFloat(location.x);
        
        // Convert positive Y to negative for Leaflet's coordinate system
        const lat = y > 0 ? -y : y;

        // Choose icon based on is_home flag
        const icon = location.is_home ? homeIcon : defaultIcon;

        // Create and add marker to map
        const marker = L.marker([lat, x], { icon: icon }).addTo(this.map);
        
        // Build popup content
        let content = `
            <div class="location-display">
                <h3 class="map-component-title">${location.name}</h3>
                ${location.description ? `<p>${location.description}</p>` : ''}
                ${location.link_url ? `<a href="${location.link_url}" target="_blank">View Details</a>` : ''}
            </div>
        `;

        // Add delete button in edit mode
        if (this.isEditable) {
            content += `
                <hr style="margin: 8px 0; border-top: 1px solid #eee;">
                <div class="edit-actions">
                    <button class="delete-btn" onclick="window.mapComponents['${this.container.id}'].deletePin(${location.id})">Delete Pin</button>
                </div>
            `;
        }

        marker.bindPopup(content);
        
        // Store marker reference for later removal if needed
        this.markers.set(location.id, marker);
    }

    /**
     * Setup interactive editing controls for editable maps
     * 
     * FEATURES ADDED:
     * 1. Right-click context menu to add new pins with form
     * 2. Top-right button to save current view as default
     * 
     * FORM FIELDS:
     * - Location Name* (required)
     * - Description (optional textarea)
     * - Link URL (optional)
     * - Is Home/HQ checkbox (optional, uses home icon)
     */
    setupEditorControls() {
        // ========================================
        // Feature 1: Right-click to Add Pin
        // ========================================
        this.map.on('contextmenu', (e) => {
            const { lat, lng } = e.latlng;
            
            // Convert Leaflet coordinates back to database format
            // Database expects positive Y values (0 to height)
            const dbY = Math.abs(Math.round(lat)); 
            const dbX = Math.round(lng);

            // Show popup with pin creation form
            L.popup()
                .setLatLng(e.latlng)
                .setContent(`
                    <div class="pin-form">
                        <label>Location Name*</label>
                        <input type="text" id="new-pin-name" placeholder="Name">
                        
                        <label>Description</label>
                        <textarea id="new-pin-desc" rows="2"></textarea>
                        
                        <label>Link URL</label>
                        <input type="text" id="new-pin-link" placeholder="https://...">
                        
                        <label class="checkbox-label" style="display:flex; align-items:center; gap:5px; margin-top:5px; cursor:pointer;">
                            <input type="checkbox" id="new-pin-home"> 
                            <strong>Set as Home/HQ</strong>
                        </label>
                        
                        <button onclick="window.mapComponents['${this.container.id}'].savePin(${dbY}, ${dbX})">Save Pin</button>
                    </div>
                `).openOn(this.map);
        });

        // ========================================
        // Feature 2: Save Default View Button
        // ========================================
        
        /**
         * Custom Leaflet control for saving map view
         * Positioned in top-right corner
         * Saves current center point and zoom level to database
         */
        const SaveViewControl = L.Control.extend({
            onAdd: () => {
                const btn = L.DomUtil.create('button', 'save-view-btn');
                btn.innerHTML = '💾 Set Default View';
                btn.title = "Save current zoom and position as default for all users";
                
                // Inline styles to avoid CSS dependencies
                Object.assign(btn.style, {
                    padding: '6px 10px',
                    cursor: 'pointer',
                    backgroundColor: 'white',
                    color: '#333',
                    border: '2px solid rgba(0,0,0,0.2)',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    fontFamily: 'sans-serif',
                    fontSize: '12px',
                    boxShadow: '0 1px 5px rgba(0,0,0,0.4)'
                });
                
                btn.onclick = (e) => {
                    L.DomEvent.stopPropagation(e); // Prevent map click
                    this.saveCurrentView();
                };
                return btn;
            },
            onRemove: () => {}
        });
        
        this.map.addControl(new SaveViewControl({ position: 'topright' }));
    }

    /**
     * Save a new location pin to database
     * Called from popup form submit button
     * 
     * VALIDATION:
     * - Name is required
     * - Other fields are optional (null if empty)
     * 
     * @param {number} dbY - Y coordinate in database format (positive)
     * @param {number} dbX - X coordinate in database format
     */
    async savePin(dbY, dbX) {
        // Get form values
        const name = document.getElementById('new-pin-name').value;
        const desc = document.getElementById('new-pin-desc').value;
        const link = document.getElementById('new-pin-link').value;
        const isHome = document.getElementById('new-pin-home').checked;

        // Validate required field
        if (!name) return alert("Name is required.");

        // Insert new location record
        const { data, error } = await supabase
            .from('locations')
            .insert([{
                map_id: this.currentMapData.id,
                name: name,
                description: desc || null,
                link_url: link || null,
                is_home: isHome,
                x: dbX,
                y: dbY
            }])
            .select();

        if (error) {
            alert("Error saving: " + error.message);
        } else {
            // Add marker to map immediately
            this.addMarker(data[0]);
            this.map.closePopup();
        }
    }

    /**
     * Save current map view as default for all users
     * Updates location_maps record with current center and zoom
     * 
     * This becomes the initial view when map loads for any user
     */
    async saveCurrentView() {
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();

        const { error } = await supabase
            .from('location_maps')
            .update({
                initial_x: center.lng,  // X coordinate
                initial_y: center.lat,  // Y coordinate (negative in Leaflet)
                initial_zoom: zoom
            })
            .eq('id', this.currentMapData.id);

        if (error) alert("Error saving view: " + error.message);
        else alert("Default map view saved!");
    }

    /**
     * Delete a location pin
     * 
     * @param {number} id - Primary key of location to delete
     */
    async deletePin(id) {
        if (!confirm("Delete this pin?")) return;
        
        const { error } = await supabase
            .from('locations')
            .delete()
            .eq('id', id);
        
        if (!error) {
            // Remove marker from map
            this.map.removeLayer(this.markers.get(id));
            this.markers.delete(id);
        } else {
            alert(error.message);
        }
    }

    /**
     * Render an error message in the container
     * @param {string} msg - Error message to display
     */
    renderError(msg) {
        this.container.innerHTML = `<div class="error" style="display:block">${msg}</div>`;
    }
}

// ============================================================================
// GLOBAL INITIALIZATION
// ============================================================================

/**
 * Global registry of map component instances
 * Keyed by container element ID
 * Used for accessing components from onclick handlers
 */
window.mapComponents = window.mapComponents || {};

/**
 * Initialize all map components on the page
 * 
 * Finds all elements with [data-map-component] attribute
 * and creates a MapComponent instance for each.
 * 
 * Can be called multiple times safely - only initializes new components
 * 
 * USAGE:
 * Import and call after DOM is ready and Leaflet is loaded:
 * 
 * import { initMapComponents } from './map-widget.js';
 * initMapComponents();
 */
export function initMapComponents() {
    document.querySelectorAll('[data-map-component]').forEach(el => {
        if (!window.mapComponents[el.id]) {
            window.mapComponents[el.id] = new MapComponent(el);
        }
    });
}

export async function fetchMapList() {
    const { data, error } = await supabase
        .from('location_maps')
        .select('id, name')
        .order('name');
    
    if (error) {
        console.error('Error fetching maps:', error);
        return [];
    }
    return data;
}