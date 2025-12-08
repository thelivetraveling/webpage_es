window.initMap = function () {
    const mapContainer = document.getElementById("google-map");
    if (!mapContainer) return;

    const points = JSON.parse(mapContainer.dataset.points);

    if (!points || points.length === 0) {
        console.error("No map points found.");
        return;
    }

    // ========== CONFIGURACIÓN ==========
    const modeColors = {
        walking: '#4285F4',
        transit: '#EA4335',
        driving: '#34A853',
        bicycling: '#FBBC04',
    };

    const pointIcons = {
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
        default: '📍',
    };

    const modeEmoji = {
        walking: '🚶',
        transit: '🚇',
        driving: '🚗',
        bicycling: '🚴',
    };

    // Detectar si es móvil
    const isMobile = window.innerWidth <= 768;

    // ========== INICIALIZAR MAPA ==========
    const map = new google.maps.Map(mapContainer, {
        mapId: "DEMO_MAP_ID",
        center: { lat: points[0].lat, lng: points[0].lng },
        zoom: 5,
        gestureHandling: isMobile ? "greedy" : "cooperative", // Mejor UX en móvil
        zoomControl: true,
        clickableIcons: false,
        fullscreenControl: !isMobile, // Ocultar en móvil
        disableDefaultUI: true,
        streetViewControl: false,
        mapTypeControl: false,
        mapTypeId: "satellite"
    });

    // ========== ESTILOS GLOBALES ==========
    const style = document.createElement('style');
    style.textContent = `
        /* Panel de información */
        #route-info-panel {
            position: absolute;
            top: 10px;
            left: 10px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            max-width: 320px;
            max-height: 30vh;
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

        #route-info-panel {
            scrollbar-width: thin;
            scrollbar-color: #888 #f1f1f1;
        }

        /* Botón toggle */
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

        /* Estados del panel */
        #route-info-panel.hidden {
            transform: translateX(-350px);
            opacity: 0;
            pointer-events: none;
        }

        /* ========== RESPONSIVE MÓVIL ========== */
        @media (max-width: 768px) {
            #route-info-panel {
                top: auto !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                max-width: 100% !important;
                max-height: 50vh !important;
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

            /* Indicador visual de panel oculto */
            #toggle-panel-btn::after {
                content: '';
                position: absolute;
                bottom: -5px;
                left: 50%;
                transform: translateX(-50%);
                width: 30px;
                height: 4px;
                background: #5f6368;
                border-radius: 2px;
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            #route-info-panel.hidden ~ #toggle-panel-btn::after {
                opacity: 1;
            }
        }

        /* Animaciones suaves */
        @media (prefers-reduced-motion: reduce) {
            #route-info-panel,
            #toggle-panel-btn {
                transition: none !important;
            }
        }
    `;
    document.head.appendChild(style);

    // ========== CREAR PANEL Y BOTÓN ==========
    mapContainer.style.position = 'relative';

    const infoPanel = document.createElement('div');
    infoPanel.id = 'route-info-panel';
    infoPanel.classList.add('hidden'); // Empezar oculto

    const toggleButton = document.createElement('button');
    toggleButton.id = 'toggle-panel-btn';
    toggleButton.innerHTML = isMobile ? '☰' : '☰';
    toggleButton.setAttribute('aria-label', 'Mostrar/Ocultar itinerario');

    mapContainer.appendChild(infoPanel);
    mapContainer.appendChild(toggleButton);

    // ========== LÓGICA TOGGLE PANEL ==========
    let isPanelVisible = false;

    toggleButton.addEventListener('click', () => {
        isPanelVisible = !isPanelVisible;
        
        if (isPanelVisible) {
            infoPanel.classList.remove('hidden');
            toggleButton.innerHTML = '✕';
            toggleButton.setAttribute('aria-label', 'Cerrar itinerario');
        } else {
            infoPanel.classList.add('hidden');
            toggleButton.innerHTML = '☰';
            toggleButton.setAttribute('aria-label', 'Mostrar itinerario');
        }
        
        // Reajustar mapa después de la animación
        setTimeout(() => {
            google.maps.event.trigger(map, 'resize');
            adjustMapBounds();
        }, 300);
    });

    // ========== MARCADORES ==========
    const markers = [];
    points.forEach((p, index) => {
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
        
        const marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: p.lat, lng: p.lng },
            content: markerContent,
            title: `${index + 1}. ${p.name}`,
        });
        
        const icon = pointIcons[p.type] || pointIcons.default;
        const infoWindow = new google.maps.InfoWindow({
            content: `<div style="padding:5px;"><strong>${icon} ${p.name}</strong></div>`
        });
        
        marker.addListener('click', () => {
            infoWindow.open(map, marker);
        });
        
        markers.push(marker);
    });

    // ========== CÁLCULO DE RUTAS ==========
    const directionsService = new google.maps.DirectionsService();
    const renderers = [];

    let totalDistance = 0;
    let totalDuration = 0;
    let routesCalculated = 0;
    const totalRoutes = points.length - 1;
    const routeDetails = new Array(totalRoutes).fill(null);

    function calculateRoute(origin, destination, mode, index, isRetry = false) {
        const actualMode = isRetry ? 'driving' : mode;
        const color = modeColors[actualMode.toLowerCase()] || '#4285F4';
        
        const renderer = new google.maps.DirectionsRenderer({
            map: map,
            suppressMarkers: true,
            preserveViewport: index > 0,
            polylineOptions: {
                strokeColor: color,
                strokeWeight: 7,
                strokeOpacity: 0.9,
            }
        });
        
        renderers.push(renderer);

        const requestOptions = {
            origin: { lat: origin.lat, lng: origin.lng },
            destination: { lat: destination.lat, lng: destination.lng },
            travelMode: actualMode.toUpperCase(),
        };

        if (actualMode.toUpperCase() === 'TRANSIT') {
            const departureTime = new Date();
            departureTime.setHours(departureTime.getHours() + 1);
            requestOptions.transitOptions = {
                departureTime: departureTime,
                modes: ["RAIL", "SUBWAY", "TRAIN"]
            };
        }

        directionsService.route(requestOptions, (response, status) => {
            if (status === "OK") {
                renderer.setDirections(response);
                
                const route = response.routes[0];
                const leg = route.legs[0];
                
                routeDetails[index] = {
                    from: origin.name,
                    to: destination.name,
                    mode: actualMode,
                    distance: leg.distance.value,
                    duration: leg.duration.value,
                    distanceText: leg.distance.text,
                    durationText: leg.duration.text,
                    warning: isRetry ? `⚠️ Transit no disponible, usando driving` : null,
                };
                
                totalDistance += leg.distance.value;
                totalDuration += leg.duration.value;
                routesCalculated++;
                
                if (routesCalculated === totalRoutes) {
                    updateInfoPanel();
                }
            } else {
                console.error(`Error en ruta ${index + 1}:`, status);
                
                if (mode.toUpperCase() === 'TRANSIT' && !isRetry) {
                    calculateRoute(origin, destination, mode, index, true);
                } else {
                    routeDetails[index] = {
                        from: origin.name,
                        to: destination.name,
                        mode: actualMode,
                        error: true,
                        errorMessage: status,
                    };
                    routesCalculated++;
                    if (routesCalculated === totalRoutes) {
                        updateInfoPanel();
                    }
                }
            }
        });
    }

    function updateInfoPanel() {
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
                html += `
                    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #e8eaed;">
                        <div style="font-weight:600; color:#F9AB00; margin-bottom:4px;">
                            ⏳ ${i + 1}. Calculando ruta...
                        </div>
                    </div>
                `;
                return;
            }
            
            const emoji = modeEmoji[detail.mode.toLowerCase()] || '📍';
            const color = modeColors[detail.mode.toLowerCase()] || '#4285F4';
            
            if (detail.error) {
                html += `
                    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #e8eaed;">
                        <div style="font-weight:600; color:#EA4335; margin-bottom:4px;">
                            ❌ ${i + 1}. ${detail.from} → ${detail.to}
                        </div>
                        <div style="color:#5f6368; font-size:12px; margin-left:10px;">
                            Error: ${detail.errorMessage}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #e8eaed;">
                        <div style="font-weight:600; color:#202124; margin-bottom:4px;">
                            ${i + 1}. ${detail.from} → ${detail.to}
                        </div>
                        <div style="color:#5f6368; font-size:12px; margin-left:10px;">
                            ${emoji} <span style="color:${color}; font-weight:500;">${detail.mode}</span><br>
                            ${detail.distanceText} · ${detail.durationText}
                            ${detail.warning ? `<br><span style="color:#F9AB00;">${detail.warning}</span>` : ''}
                        </div>
                    </div>
                `;
            }
        });
        
        html += '</div>';
        infoPanel.innerHTML = html;

        adjustMapBounds();
    }

    function adjustMapBounds() {
        const bounds = new google.maps.LatLngBounds();
        
        points.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
        
        renderers.forEach(renderer => {
            const directions = renderer.getDirections();
            if (directions && directions.routes[0] && directions.routes[0].overview_path) {
                directions.routes[0].overview_path.forEach(point => bounds.extend(point));
            }
        });
        
        const padding = isMobile ? { top: 20, right: 20, bottom: 20, left: 20 } : { top: 50, right: 50, bottom: 50, left: 50 };
        map.fitBounds(bounds, padding);
    }

    // Calcular todas las rutas
    for (let i = 0; i < points.length - 1; i++) {
        const origin = points[i];
        const destination = points[i + 1];
        const mode = destination.mode || 'walking';
        
        calculateRoute(origin, destination, mode, i);
    }

    // Reajustar mapa al cambiar orientación
    window.addEventListener('resize', () => {
        setTimeout(() => {
            google.maps.event.trigger(map, 'resize');
            adjustMapBounds();
        }, 200);
    });
};