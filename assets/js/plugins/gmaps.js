/**
 * Google Maps Route Manager con integración NAVITIME
 * Gestiona visualización de rutas multi-punto con soporte para transporte japonés
 * @version 4.1.0 - Refactorizado con Dynamic Library Import (Google Best Practices)
 */

(function(window) {
  'use strict';

  // ============================================================================
  // CONFIGURACIÓN GLOBAL
  // ============================================================================

  const CONFIG = {
    MAP: {
      MAP_ID: 'DEMO_MAP_ID',
      DEFAULT_ZOOM: 5,
      MAP_TYPE: 'satellite',
      TILT: 0,
      HEADING: 0,
      MOBILE_BREAKPOINT: 768
    },
    
    JAPAN_BOUNDS: {
      LAT_MIN: 24,
      LAT_MAX: 46,
      LNG_MIN: 122,
      LNG_MAX: 154
    },
    
    COLORS: {
      walking: '#4285F4',
      transit: '#EA4335',
      driving: '#34A853',
      bicycling: '#FBBC04',
      navitime: '#EA4335'
    },
    
    ICONS: {
      restaurant: '🍽️',
      temple: '⛩️',
      castle: '🏰',
      museum: '🏛️',
      monument: '🏛️',
      park: '🌳',
      square: '📍',
      station: '🚉',
      hotel: '🏨',
      shop: '🛍️',
      default: '📍'
    },
    
    EMOJI: {
      walking: '🚶',
      transit: '🚇',
      driving: '🚗',
      bicycling: '🚴',
      navitime: '🚇'
    },
    
    NAVITIME: {
      API_URL: 'https://navitime-route-totalnavi.p.rapidapi.com/route_transit',
      API_HOST: 'navitime-route-totalnavi.p.rapidapi.com',
      TRANSIT_TYPES: [
        'domestic_flight',
        'ferry',
        'superexpress_train',
        'sleeper_ultraexpress',
        'ultraexpress_train',
        'express_train',
        'rapid_train',
        'semiexpress_train',
        'local_train',
        'shuttle_bus',
        'local_bus',
        'highway_bus'
      ],
      TRANSIT_ALIASES: {
        'train': ['local_train', 'rapid_train', 'semiexpress_train', 'express_train', 'sleeper_ultraexpress', 'ultraexpress_train'],
        'subway': ['local_train'],
        'shinkansen': ['superexpress_train'],
        'bus': ['local_bus', 'shuttle_bus', 'highway_bus'],
        'flight': ['domestic_flight'],
        'ferry': ['ferry'],
        'all': []
      },
      TIMEOUT: 10000,
      RETRY_ATTEMPTS: 2,
      RETRY_DELAY: 1000
    },
    
    UI: {
      PANEL_MAX_HEIGHT_DESKTOP: '30vh',
      PANEL_MAX_HEIGHT_MOBILE: '50vh',
      ANIMATION_DURATION: 300,
      RESIZE_DEBOUNCE: 200
    }
  };

  // ============================================================================
  // UTILIDADES
  // ============================================================================

  const Utils = {
    /**
     * Verifica si las coordenadas están dentro de Japón
     * @param {number} lat - Latitud
     * @param {number} lng - Longitud
     * @returns {boolean}
     */
    isInJapan(lat, lng) {
      return lat >= CONFIG.JAPAN_BOUNDS.LAT_MIN && 
             lat <= CONFIG.JAPAN_BOUNDS.LAT_MAX && 
             lng >= CONFIG.JAPAN_BOUNDS.LNG_MIN && 
             lng <= CONFIG.JAPAN_BOUNDS.LNG_MAX;
    },

    /**
     * Valida coordenadas geográficas
     * @param {number} lat - Latitud
     * @param {number} lng - Longitud
     * @returns {boolean}
     */
    isValidCoordinate(lat, lng) {
      return typeof lat === 'number' && 
             typeof lng === 'number' &&
             lat >= -90 && lat <= 90 && 
             lng >= -180 && lng <= 180;
    },

    /**
     * Detecta si es dispositivo móvil
     * @returns {boolean}
     */
    isMobileDevice() {
      return window.innerWidth <= CONFIG.MAP.MOBILE_BREAKPOINT;
    },

    /**
     * Debounce function
     * @param {Function} func - Función a ejecutar
     * @param {number} wait - Tiempo de espera en ms
     * @returns {Function}
     */
    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    /**
     * Formatea fecha para NAVITIME API
     * @returns {string} Fecha en formato YYYY-MM-DDThh:mm:ss
     */
    formatDateForNavitime() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    },

    /**
     * Sanitiza texto para evitar XSS
     * @param {string} text - Texto a sanitizar
     * @returns {string}
     */
    sanitizeText(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    /**
     * Espera un tiempo determinado (para reintentos)
     * @param {number} ms - Milisegundos a esperar
     * @returns {Promise}
     */
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  };

  // ============================================================================
  // GESTOR DE NAVITIME API
  // ============================================================================

  class NavitimeAPI {
    constructor(apiKey) {
      this.apiKey = apiKey;
      this.isEnabled = apiKey && apiKey.length > 0;
    }

    /**
     * Obtiene parámetro 'unuse' basado en tipos de transporte permitidos
     * @param {Array<string>} allowedTypes - Tipos de transporte permitidos
     * @returns {string}
     */
    getUnuseParam(allowedTypes) {
      if (!allowedTypes || allowedTypes.length === 0) {
        return '';
      }

      const expanded = new Set();
      allowedTypes.forEach(type => {
        const fullTypes = CONFIG.NAVITIME.TRANSIT_ALIASES[type] || [type];
        fullTypes.forEach(t => expanded.add(t));
      });

      const allowedTypesArray = Array.from(expanded);
      const unusedTypes = CONFIG.NAVITIME.TRANSIT_TYPES.filter(
        type => !allowedTypesArray.includes(type)
      );

      return unusedTypes.join('.');
    }

    /**
     * Realiza petición a NAVITIME API con reintentos
     * @param {Object} origin - Punto de origen
     * @param {Object} destination - Punto de destino
     * @param {number} attempt - Intento actual
     * @returns {Promise<Object|null>}
     */
    async getRoute(origin, destination, attempt = 0) {
      if (!this.isEnabled) {
        console.warn('[NAVITIME] API key no configurada');
        return null;
      }

      try {
        const startPoint = JSON.stringify({
          lat: origin.lat,
          lon: origin.lng,
          name: origin.name || 'Start'
        });

        const goalPoint = JSON.stringify({
          lat: destination.lat,
          lon: destination.lng,
          name: destination.name || 'Goal'
        });

        const params = new URLSearchParams({
          start: startPoint,
          goal: goalPoint,
          start_time: Utils.formatDateForNavitime(),
          coord_unit: 'degree',
          order: 'transit',
          datum: 'wgs84',
          term: '1440',
          limit: '1',
          sort: 'time',
          shape: 'true'
        });

        const unuseParam = this.getUnuseParam(destination.transit_types || []);
        if (unuseParam) {
          params.set('unuse', unuseParam);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.NAVITIME.TIMEOUT);

        const response = await fetch(`${CONFIG.NAVITIME.API_URL}?${params}`, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': this.apiKey,
            'X-RapidAPI-Host': CONFIG.NAVITIME.API_HOST
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data || !data.items || data.items.length === 0) {
          console.warn('[NAVITIME] No se encontraron rutas');
          return null;
        }

        return data;

      } catch (error) {
        console.error(`[NAVITIME] Error en intento ${attempt + 1}:`, error.message);

        // Reintentar si no hemos alcanzado el límite
        if (attempt < CONFIG.NAVITIME.RETRY_ATTEMPTS) {
          await Utils.sleep(CONFIG.NAVITIME.RETRY_DELAY * (attempt + 1));
          return this.getRoute(origin, destination, attempt + 1);
        }

        return null;
      }
    }
  }

  // ============================================================================
  // GESTOR DE UI
  // ============================================================================

  class UIManager {
    constructor(mapContainer) {
      this.mapContainer = mapContainer;
      this.infoPanel = null;
      this.toggleButton = null;
      this.isPanelVisible = false;
      
      this.init();
    }

    /**
     * Inicializa elementos de UI
     */
    init() {
      this.injectStyles();
      this.createElements();
      this.attachEventListeners();
    }

    /**
     * Inyecta estilos CSS en el documento
     */
    injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        #route-info-panel {
          position: absolute;
          top: 10px;
          left: 10px;
          background: white;
          padding: 15px;
          border-radius: 8px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          max-width: 320px;
          max-height: ${CONFIG.UI.PANEL_MAX_HEIGHT_DESKTOP};
          overflow-y: auto;
          overflow-x: hidden;
          font-family: 'Roboto', Arial, sans-serif;
          z-index: 1000;
          transition: transform 0.3s ease, opacity 0.3s ease;
        }

        #route-info-panel::-webkit-scrollbar {
          width: 8px;
        }

        #route-info-panel::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }

        #route-info-panel::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }

        #route-info-panel::-webkit-scrollbar-thumb:hover {
          background: #555;
        }

        #toggle-panel-btn {
          position: absolute;
          top: 10px;
          left: 10px;
          background: white;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          font-size: 20px;
          cursor: pointer;
          z-index: 1001;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: #5f6368;
          transition: all 0.3s ease;
        }

        #toggle-panel-btn:hover {
          background: #f1f3f4;
          transform: scale(1.05);
        }

        #toggle-panel-btn:active {
          transform: scale(0.95);
        }

        #toggle-panel-btn:focus {
          outline: 2px solid #4285F4;
          outline-offset: 2px;
        }

        #route-info-panel.hidden {
          transform: translateX(-350px);
          opacity: 0;
          pointer-events: none;
        }

        @media (max-width: ${CONFIG.MAP.MOBILE_BREAKPOINT}px) {
          #route-info-panel {
            top: auto !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            max-width: 100% !important;
            max-height: ${CONFIG.UI.PANEL_MAX_HEIGHT_MOBILE} !important;
            border-radius: 16px 16px 0 0 !important;
            padding: 20px 15px 15px 15px !important;
            transform: translateY(0) !important;
          }

          #route-info-panel.hidden {
            transform: translateY(calc(100% + 10px)) !important;
            opacity: 1 !important;
          }

          #toggle-panel-btn {
            top: auto !important;
            bottom: 10px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            width: 50px !important;
            height: 50px !important;
            font-size: 24px !important;
          }

          #toggle-panel-btn:hover {
            transform: translateX(-50%) scale(1.05) !important;
          }

          #toggle-panel-btn:active {
            transform: translateX(-50%) scale(0.95) !important;
          }

          #toggle-panel-btn:focus {
            transform: translateX(-50%) !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    /**
     * Crea elementos del DOM
     */
    createElements() {
      this.mapContainer.style.position = 'relative';

      this.infoPanel = document.createElement('div');
      this.infoPanel.id = 'route-info-panel';
      this.infoPanel.classList.add('hidden');
      this.infoPanel.setAttribute('role', 'complementary');
      this.infoPanel.setAttribute('aria-label', 'Panel de información de ruta');

      this.toggleButton = document.createElement('button');
      this.toggleButton.id = 'toggle-panel-btn';
      this.toggleButton.innerHTML = '☰';
      this.toggleButton.setAttribute('aria-label', 'Mostrar panel de itinerario');
      this.toggleButton.setAttribute('aria-expanded', 'false');

      this.mapContainer.appendChild(this.infoPanel);
      this.mapContainer.appendChild(this.toggleButton);
    }

    /**
     * Adjunta event listeners
     */
    attachEventListeners() {
      this.toggleButton.addEventListener('click', () => this.togglePanel());
      
      // Soporte de teclado
      this.toggleButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.togglePanel();
        }
      });
    }

    /**
     * Alterna visibilidad del panel
     */
    togglePanel() {
      this.isPanelVisible = !this.isPanelVisible;

      if (this.isPanelVisible) {
        this.infoPanel.classList.remove('hidden');
        this.toggleButton.innerHTML = '✕';
        this.toggleButton.setAttribute('aria-label', 'Cerrar panel de itinerario');
        this.toggleButton.setAttribute('aria-expanded', 'true');
      } else {
        this.infoPanel.classList.add('hidden');
        this.toggleButton.innerHTML = '☰';
        this.toggleButton.setAttribute('aria-label', 'Mostrar panel de itinerario');
        this.toggleButton.setAttribute('aria-expanded', 'false');
      }
    }

    /**
     * Actualiza contenido del panel de información
     * @param {Array} routeDetails - Detalles de las rutas
     * @param {number} totalDistance - Distancia total en metros
     * @param {number} totalDuration - Duración total en segundos
     */
    updatePanel(routeDetails, totalDistance, totalDuration) {
      const totalDistanceKm = (totalDistance / 1000).toFixed(2);
      const totalHours = Math.floor(totalDuration / 3600);
      const totalMinutes = Math.floor((totalDuration % 3600) / 60);
      const totalTimeText = totalHours > 0 
        ? `${totalHours}h ${totalMinutes}min` 
        : `${totalMinutes}min`;

      let html = `
        <h3 style="margin-top:0; color:#202124; font-size:18px; font-weight:500;">🗺️ Itinerario</h3>
        <div style="background:#f1f3f4; padding:10px; border-radius:5px; margin-bottom:15px;">
          <div style="font-weight:600; color:#202124;">Total del recorrido:</div>
          <div style="color:#5f6368; margin-top:5px;">
            📏 ${totalDistanceKm} km<br>
            ⏱️ ${totalTimeText}
          </div>
        </div>
        <div style="font-size:13px;">
      `;

      routeDetails.forEach((detail, i) => {
        if (!detail) {
          html += this.renderLoadingRoute(i);
        } else if (detail.error) {
          html += this.renderErrorRoute(i, detail);
        } else {
          html += this.renderSuccessRoute(i, detail);
        }
      });

      html += '</div>';
      this.infoPanel.innerHTML = html;
    }

    /**
     * Renderiza ruta en estado de carga
     * @param {number} index - Índice de la ruta
     * @returns {string}
     */
    renderLoadingRoute(index) {
      return `
        <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #e8eaed;">
          <div style="font-weight:600; color:#F9AB00; margin-bottom:4px;">
            ⏳ ${index + 1}. Calculando ruta...
          </div>
        </div>
      `;
    }

    /**
     * Renderiza ruta con error
     * @param {number} index - Índice de la ruta
     * @param {Object} detail - Detalles de la ruta
     * @returns {string}
     */
    renderErrorRoute(index, detail) {
      const fromSafe = Utils.sanitizeText(detail.from || 'Origen');
      const toSafe = Utils.sanitizeText(detail.to || 'Destino');
      const errorSafe = Utils.sanitizeText(detail.errorMessage || 'Error desconocido');

      return `
        <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #e8eaed;">
          <div style="font-weight:600; color:#EA4335; margin-bottom:4px;">
            ❌ ${index + 1}. ${fromSafe} → ${toSafe}
          </div>
          <div style="color:#5f6368; font-size:12px; margin-left:10px;">
            Error: ${errorSafe}
          </div>
        </div>
      `;
    }

    /**
     * Renderiza ruta exitosa
     * @param {number} index - Índice de la ruta
     * @param {Object} detail - Detalles de la ruta
     * @returns {string}
     */
    renderSuccessRoute(index, detail) {
      const emoji = CONFIG.EMOJI[detail.mode.toLowerCase()] || '📍';
      const color = CONFIG.COLORS[detail.mode.toLowerCase()] || '#4285F4';
      const fromSafe = Utils.sanitizeText(detail.from);
      const toSafe = Utils.sanitizeText(detail.to);
      const modeName = detail.mode === 'navitime' ? 'transit (NAVITIME)' : detail.mode;

      let transportInfo = '';
      if (detail.transportDetails && detail.transportDetails.length > 0) {
        const lines = detail.transportDetails.map(t => Utils.sanitizeText(t.line)).join(' → ');
        transportInfo = `<br><span style="font-size:11px;">🚉 ${lines}</span>`;
      }

      const fareInfo = detail.fare ? `<br>💴 Tarifa: ${Utils.sanitizeText(detail.fare)}` : '';
      const warningInfo = detail.warning ? `<br><span style="color:#F9AB00;">${Utils.sanitizeText(detail.warning)}</span>` : '';

      return `
        <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #e8eaed;">
          <div style="font-weight:600; color:#202124; margin-bottom:4px;">
            ${index + 1}. ${fromSafe} → ${toSafe}
          </div>
          <div style="color:#5f6368; font-size:12px; margin-left:10px;">
            ${emoji} <span style="color:${color}; font-weight:500;">${modeName}</span><br>
            ${detail.distanceText} · ${detail.durationText}
            ${fareInfo}
            ${transportInfo}
            ${warningInfo}
          </div>
        </div>
      `;
    }
  }

  // ============================================================================
  // GESTOR DE RUTAS
  // ============================================================================

  class RouteManager {
    constructor(map, points, navitimeAPI, uiManager) {
      this.map = map;
      this.points = points;
      this.navitimeAPI = navitimeAPI;
      this.uiManager = uiManager;
      
      this.directionsService = null;
      this.renderers = [];
      this.navitimePolylines = [];
      this.markers = [];
      
      this.totalDistance = 0;
      this.totalDuration = 0;
      this.routesCalculated = 0;
      this.totalRoutes = points.length - 1;
      this.routeDetails = new Array(this.totalRoutes).fill(null);
    }

    /**
     * Inicializa DirectionsService (carga bajo demanda)
     */
    async initDirectionsService() {
      if (!this.directionsService) {
        const { DirectionsService } = await google.maps.importLibrary('routes');
        this.directionsService = new DirectionsService();
      }
    }

    /**
     * Crea marcadores en el mapa
     */
    createMarkers() {
      this.points.forEach((point, index) => {
        const markerContent = this.createMarkerElement(index);
        
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: this.map,
          position: { lat: point.lat, lng: point.lng },
          content: markerContent,
          title: `${index + 1}. ${point.name}`
        });

        const icon = CONFIG.ICONS[point.type] || CONFIG.ICONS.default;
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="padding:5px;"><strong>${icon} ${Utils.sanitizeText(point.name)}</strong></div>`
        });

        marker.addListener('click', () => {
          infoWindow.open(this.map, marker);
        });

        this.markers.push(marker);
      });
    }

    /**
     * Crea elemento DOM para marcador
     * @param {number} index - Índice del punto
     * @returns {HTMLElement}
     */
    createMarkerElement(index) {
      const markerContent = document.createElement('div');
      markerContent.style.cssText = `
        background: white;
        border: 3px solid #4285F4;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        color: #4285F4;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
      `;
      markerContent.textContent = index + 1;
      return markerContent;
    }

    /**
     * Calcula todas las rutas
     */
    async calculateAllRoutes() {
      await this.initDirectionsService();

      for (let i = 0; i < this.points.length - 1; i++) {
        const origin = this.points[i];
        const destination = this.points[i + 1];
        
        // Validar coordenadas
        if (!Utils.isValidCoordinate(origin.lat, origin.lng) || 
            !Utils.isValidCoordinate(destination.lat, destination.lng)) {
          console.error(`Coordenadas inválidas para ruta ${i + 1}`);
          this.handleRouteError(i, origin, destination, 'INVALID_COORDINATES');
          continue;
        }

        const mode = destination.mode || 'walking';
        const originInJapan = Utils.isInJapan(origin.lat, origin.lng);
        const destinationInJapan = Utils.isInJapan(destination.lat, destination.lng);

        if (originInJapan && destinationInJapan && 
            mode.toLowerCase() === 'transit' && 
            this.navitimeAPI.isEnabled) {
          await this.calculateNavitimeRoute(origin, destination, i);
        } else {
          this.calculateGoogleRoute(origin, destination, mode, i);
        }
      }
    }

    /**
     * Calcula ruta usando NAVITIME
     * @param {Object} origin - Punto de origen
     * @param {Object} destination - Punto de destino
     * @param {number} index - Índice de la ruta
     */
    async calculateNavitimeRoute(origin, destination, index) {
      console.log(`[NAVITIME] Calculando ruta ${index + 1}: ${origin.name} → ${destination.name}`);

      const navitimeData = await this.navitimeAPI.getRoute(origin, destination);

      if (!navitimeData || !navitimeData.items || navitimeData.items.length === 0) {
        console.warn(`[NAVITIME] Sin resultados, usando walking como fallback`);
        this.calculateGoogleRoute(origin, destination, 'walking', index);
        return;
      }

      const route = navitimeData.items[0];
      const summary = route.summary;

      // Calcular tarifa
      let totalFare = 0;
      if (summary.move && summary.move.fare) {
        totalFare = summary.move.fare.unit_0 || 0;
      }

      // Dibujar ruta
      if (route.shapes) {
        this.drawNavitimeShapes(route.shapes);
      }

      // Extraer detalles de transporte
      const transportDetails = this.extractTransportDetails(route.sections);

      this.routeDetails[index] = {
        from: origin.name,
        to: destination.name,
        mode: 'navitime',
        distance: summary.move.distance,
        duration: summary.move.time * 60,
        distanceText: `${(summary.move.distance / 1000).toFixed(2)} km`,
        durationText: `${summary.move.time} min`,
        fare: totalFare > 0 ? `¥${totalFare}` : null,
        transportDetails: transportDetails,
        warning: null
      };

      this.totalDistance += summary.move.distance;
      this.totalDuration += summary.move.time * 60;
      this.onRouteCalculated();
    }

    /**
     * Extrae detalles de transporte desde secciones de NAVITIME
     * @param {Array} sections - Secciones de la ruta
     * @returns {Array}
     */
    extractTransportDetails(sections) {
      const details = [];
      if (!sections) return details;

      sections.forEach(section => {
        if (section.type === 'move' && section.transport) {
          details.push({
            line: section.transport.name || section.line_name || 'Unknown',
            from: '',
            to: '',
            type: section.move || 'transit'
          });
        }
      });

      return details;
    }

    /**
     * Dibuja formas de NAVITIME en el mapa
     * @param {Object} shapes - Objeto GeoJSON con formas
     */
    drawNavitimeShapes(shapes) {
      if (!shapes || !shapes.features) {
        console.warn('[NAVITIME] No hay información de formas');
        return;
      }

      shapes.features.forEach(feature => {
        if (feature.geometry && feature.geometry.type === 'LineString') {
          const coordinates = feature.geometry.coordinates;
          let strokeColor = CONFIG.COLORS.navitime;

          // Determinar color basado en tipo de movimiento
          if (feature.properties) {
            const moveType = feature.properties.ways;
            if (moveType === 'walk') {
              strokeColor = CONFIG.COLORS.walking;
            } else if (feature.properties.inline && feature.properties.inline.color) {
              strokeColor = feature.properties.inline.color;
            }
          }

          // Convertir coordenadas [lng, lat] a {lat, lng}
          const pathCoordinates = coordinates.map(coord => ({
            lat: coord[1],
            lng: coord[0]
          }));

          if (pathCoordinates.length > 0) {
            const polyline = new google.maps.Polyline({
              path: pathCoordinates,
              geodesic: true,
              strokeColor: strokeColor,
              strokeOpacity: 0.9,
              strokeWeight: 7,
              map: this.map
            });

            this.navitimePolylines.push(polyline);
          }
        }
      });
    }

    /**
     * Calcula ruta usando Google Maps
     * @param {Object} origin - Punto de origen
     * @param {Object} destination - Punto de destino
     * @param {string} mode - Modo de transporte
     * @param {number} index - Índice de la ruta
     */
    calculateGoogleRoute(origin, destination, mode, index) {
      const actualMode = mode || 'walking';
      const color = CONFIG.COLORS[actualMode.toLowerCase()] || '#4285F4';

      const renderer = new google.maps.DirectionsRenderer({
        map: this.map,
        suppressMarkers: true,
        preserveViewport: index > 0,
        polylineOptions: {
          strokeColor: color,
          strokeWeight: 7,
          strokeOpacity: 0.9
        }
      });

      this.renderers.push(renderer);

      const requestOptions = {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: actualMode.toUpperCase()
      };

      // Configuración especial para TRANSIT
      if (actualMode.toUpperCase() === 'TRANSIT') {
        const departureTime = new Date();
        const hours = departureTime.getHours();
        
        // Si es muy temprano o muy tarde, ajustar a 9 AM
        if (hours < 6 || hours > 23) {
          departureTime.setHours(9, 0, 0, 0);
        }

        requestOptions.transitOptions = {
          departureTime: departureTime,
          modes: ['RAIL', 'SUBWAY', 'TRAIN', 'BUS', 'TRAM'],
          routingPreference: 'FEWER_TRANSFERS'
        };
      }

      this.directionsService.route(requestOptions, (response, status) => {
        if (status === 'OK') {
          renderer.setDirections(response);

          const route = response.routes[0];
          const leg = route.legs[0];

          this.routeDetails[index] = {
            from: origin.name,
            to: destination.name,
            mode: actualMode,
            distance: leg.distance.value,
            duration: leg.duration.value,
            distanceText: leg.distance.text,
            durationText: leg.duration.text
          };

          this.totalDistance += leg.distance.value;
          this.totalDuration += leg.duration.value;
          this.onRouteCalculated();

        } else {
          console.error(`[Google Maps] Error en ruta ${index + 1}:`, status);
          this.handleRouteError(index, origin, destination, status);
        }
      });
    }

    /**
     * Maneja errores en cálculo de ruta
     * @param {number} index - Índice de la ruta
     * @param {Object} origin - Punto de origen
     * @param {Object} destination - Punto de destino
     * @param {string} errorStatus - Estado del error
     */
    handleRouteError(index, origin, destination, errorStatus) {
      this.routeDetails[index] = {
        from: origin.name,
        to: destination.name,
        mode: destination.mode || 'unknown',
        error: true,
        errorMessage: errorStatus
      };
      this.onRouteCalculated();
    }

    /**
     * Callback cuando se calcula una ruta
     */
    onRouteCalculated() {
      this.routesCalculated++;

      if (this.routesCalculated === this.totalRoutes) {
        this.uiManager.updatePanel(this.routeDetails, this.totalDistance, this.totalDuration);
        this.adjustMapBounds();
      }
    }

    /**
     * Ajusta límites del mapa para mostrar toda la ruta
     */
    adjustMapBounds() {
      const bounds = new google.maps.LatLngBounds();

      // Incluir todos los puntos
      this.points.forEach(p => {
        bounds.extend({ lat: p.lat, lng: p.lng });
      });

      // Incluir rutas de Google
      this.renderers.forEach(renderer => {
        const directions = renderer.getDirections();
        if (directions && directions.routes[0] && directions.routes[0].overview_path) {
          directions.routes[0].overview_path.forEach(point => bounds.extend(point));
        }
      });

      // Incluir polylines de NAVITIME
      this.navitimePolylines.forEach(polyline => {
        const path = polyline.getPath();
        path.forEach(point => bounds.extend(point));
      });

      const isMobile = Utils.isMobileDevice();
      const padding = isMobile 
        ? { top: 20, right: 20, bottom: 20, left: 20 }
        : { top: 50, right: 50, bottom: 50, left: 50 };

      this.map.fitBounds(bounds, padding);
    }

    /**
     * Limpia recursos (útil para reinicialización)
     */
    cleanup() {
      this.renderers.forEach(renderer => renderer.setMap(null));
      this.navitimePolylines.forEach(polyline => polyline.setMap(null));
      this.markers.forEach(marker => marker.map = null);
      
      this.renderers = [];
      this.navitimePolylines = [];
      this.markers = [];
    }
  }

  // ============================================================================
  // CLASE PRINCIPAL - MAP MANAGER
  // ============================================================================

  class MapManager {
    constructor(mapContainerId) {
      this.mapContainer = document.getElementById(mapContainerId);
      if (!this.mapContainer) {
        throw new Error(`Contenedor del mapa no encontrado: ${mapContainerId}`);
      }

      this.points = this.parsePoints();
      if (!this.points || this.points.length === 0) {
        throw new Error('No se encontraron puntos del mapa');
      }

      this.validatePoints();

      const navitimeKey = this.mapContainer.dataset.navitimekey || '';
      this.navitimeAPI = new NavitimeAPI(navitimeKey);
      
      this.map = null;
      this.uiManager = null;
      this.routeManager = null;
    }

    /**
     * Parsea puntos desde dataset
     * @returns {Array}
     */
    parsePoints() {
      try {
        const pointsData = this.mapContainer.dataset.points;
        if (!pointsData) {
          console.error('No se encontró dataset.points en el contenedor');
          return null;
        }
        return JSON.parse(pointsData);
      } catch (error) {
        console.error('Error al parsear puntos del mapa:', error);
        return null;
      }
    }

    /**
     * Valida que los puntos tengan datos correctos
     */
    validatePoints() {
      this.points.forEach((point, index) => {
        if (!Utils.isValidCoordinate(point.lat, point.lng)) {
          console.warn(`Punto ${index + 1} tiene coordenadas inválidas:`, point);
        }
        if (!point.name || point.name.trim() === '') {
          console.warn(`Punto ${index + 1} no tiene nombre`);
          point.name = `Punto ${index + 1}`;
        }
      });
    }

    /**
     * Inicializa el mapa usando Dynamic Library Import
     */
    async initMap() {
      try {
        const isMobile = Utils.isMobileDevice();

        // Cargar bibliotecas necesarias bajo demanda
        const { Map } = await google.maps.importLibrary('maps');
        const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

        this.map = new Map(this.mapContainer, {
          mapId: CONFIG.MAP.MAP_ID,
          center: { lat: this.points[0].lat, lng: this.points[0].lng },
          zoom: CONFIG.MAP.DEFAULT_ZOOM,
          gestureHandling: isMobile ? 'greedy' : 'cooperative',
          zoomControl: true,
          clickableIcons: false,
          fullscreenControl: !isMobile,
          disableDefaultUI: true,
          streetViewControl: false,
          mapTypeControl: false,
          mapTypeId: CONFIG.MAP.MAP_TYPE,
          tilt: CONFIG.MAP.TILT,
          heading: CONFIG.MAP.HEADING,
          rotateControl: false
        });

        this.uiManager = new UIManager(this.mapContainer);
        this.routeManager = new RouteManager(
          this.map, 
          this.points, 
          this.navitimeAPI, 
          this.uiManager
        );

        this.routeManager.createMarkers();
        await this.routeManager.calculateAllRoutes();

        this.attachWindowListeners();

      } catch (error) {
        console.error('[MapManager] Error al inicializar mapa:', error);
        this.showError(error.message);
      }
    }

    /**
     * Muestra error en el contenedor del mapa
     * @param {string} message - Mensaje de error
     */
    showError(message) {
      this.mapContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f9fa; padding: 20px; text-align: center;">
          <div>
            <h3 style="color: #EA4335; margin-bottom: 10px;">⚠️ Error al cargar el mapa</h3>
            <p style="color: #5f6368;">${Utils.sanitizeText(message)}</p>
            <p style="color: #5f6368; font-size: 12px; margin-top: 10px;">Por favor, recarga la página o contacta al administrador.</p>
          </div>
        </div>
      `;

      // Mostrar también en el div de error si existe
      const errorDiv = document.getElementById('google-map-error');
      if (errorDiv) {
        errorDiv.style.display = 'block';
        errorDiv.innerHTML = `
          <div style="padding: 15px; background: #fef7f7; border-left: 4px solid #EA4335; margin: 10px 0;">
            <strong style="color: #EA4335;">Error:</strong> ${Utils.sanitizeText(message)}
          </div>
        `;
      }
    }

    /**
     * Adjunta listeners globales
     */
    attachWindowListeners() {
      const debouncedResize = Utils.debounce(() => {
        google.maps.event.trigger(this.map, 'resize');
        if (this.routeManager) {
          this.routeManager.adjustMapBounds();
        }
      }, CONFIG.UI.RESIZE_DEBOUNCE);

      window.addEventListener('resize', debouncedResize);
    }
  }

  // ============================================================================
  // VALIDACIÓN DE API KEY
  // ============================================================================

  /**
   * Valida que exista una API key de Google Maps
   * @returns {boolean}
   */
  function validateGoogleMapsApiKey() {
    const mapContainer = document.getElementById('google-map');
    if (!mapContainer) {
      console.warn('[Google Maps] Contenedor #google-map no encontrado');
      return false;
    }

    const apiKey = mapContainer.dataset.gmaps_key;
    
    if (!apiKey || apiKey.trim() === '' || apiKey === 'undefined' || apiKey === 'null') {
      console.error('[Google Maps] API key no configurada o inválida');
      
      // Ocultar el contenedor del mapa
      mapContainer.style.display = 'none';
      
      // Mostrar error en el div de error si existe
      const errorDiv = document.getElementById('google-map-error');
      if (errorDiv) {
        errorDiv.style.display = 'block';
        errorDiv.innerHTML = `
          <div style="padding: 20px; background: #fef7f7; border: 1px solid #f5c6cb; border-radius: 8px; margin: 20px 0; color: #721c24;">
            <h3 style="margin-top: 0; color: #721c24; font-size: 18px;">
              ⚠️ Error de Configuración: Google Maps API Key
            </h3>
            <p style="margin: 10px 0; font-size: 12px; color: #856404;">
              <strong>Nota:</strong> Este mensaje solo aparece en desarrollo. En producción, asegúrate de tener la API key configurada.
            </p>
          </div>
        `;
      } else {
        // Si no hay div de error, mostrar en el contenedor del mapa
        mapContainer.style.display = 'block';
        mapContainer.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; height: 500px; background: #f8f9fa; border: 2px dashed #dee2e6; border-radius: 8px; padding: 20px; text-align: center;">
            <div>
              <h3 style="color: #EA4335; margin-bottom: 10px;">⚠️ Google Maps API Key no configurada</h3>
              <p style="color: #5f6368; margin: 10px 0;">Por favor, configura <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">google_maps_api_key</code> en tu <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">_config.yml</code></p>
            </div>
          </div>
        `;
      }
      
      return false;
    }
    return true;
  }

  // ============================================================================
  // PUNTO DE ENTRADA GLOBAL
  // ============================================================================

  /**
   * Función global para inicializar el mapa
   * Se ejecuta automáticamente cuando Google Maps API está lista
   */
  window.initGoogleMap = async function() {
    if (!validateGoogleMapsApiKey()) {
      console.warn('[Google Maps] Inicialización cancelada: API key no válida');
      return;
    }

    try {
      const mapManager = new MapManager('google-map');
      await mapManager.initMap();
    } catch (error) {
      console.error('[initGoogleMap] Error crítico:', error);
      
      const mapContainer = document.getElementById('google-map');
      if (mapContainer) {
        try {
          const manager = new MapManager('google-map');
          manager.showError(error.message);
        } catch (e) {
          mapContainer.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f9fa; padding: 20px; text-align: center;">
              <div>
                <h3 style="color: #EA4335; margin-bottom: 10px;">⚠️ Error al cargar el mapa</h3>
                <p style="color: #5f6368;">${Utils.sanitizeText(error.message)}</p>
              </div>
            </div>
          `;
        }
      }
    }
  };

  // Auto-inicializar cuando el DOM esté listo si google.maps ya está disponible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (validateGoogleMapsApiKey() && window.google && window.google.maps) {
        window.initGoogleMap();
      }
    });
  } else if (validateGoogleMapsApiKey() && window.google && window.google.maps) {
    window.initGoogleMap();
  }
})(window);