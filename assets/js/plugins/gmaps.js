window.initMap = function () {
    const mapContainer = document.getElementById("google-map");
    if (!mapContainer) return;

    const points = JSON.parse(mapContainer.dataset.points);

    if (!points || points.length === 0) {
        console.error("No map points found.");
        return;
    }

    // Colores por tipo de transporte
    const modeColors = {
        walking: '#4285F4',    // Azul Google
        transit: '#EA4335',    // Rojo
        driving: '#34A853',    // Verde
        bicycling: '#FBBC04',  // Amarillo
    };

    // Iconos por tipo de punto (puedes personalizarlos según tus necesidades)
    const pointIcons = {
        restaurant: '🍽️',
        temple: '⛩️',
        museum: '🏛️',
        park: '🌳',
        station: '🚉',
        hotel: '🏨',
        shop: '🛍️',
        default: '📍',
    };

    const map = new google.maps.Map(mapContainer, {
        mapId: "DEMO_MAP_ID",
        center: { lat: points[0].lat, lng: points[0].lng },
        zoom: 5,
        gestureHandling: "none",
        zoomControl: true,
        clickableIcons: false,
        fullscreenControl: true,
        disableDefaultUI: true,
        streetViewControl: false,
        mapTypeControl: false,
        mapTypeId: "satellite"
    });

    map.addListener("click", () => {
        map.setOptions({ gestureHandling: "auto" });
    });

   // ---- Crear panel de información ----
    const infoPanel = document.createElement('div');
    infoPanel.id = 'route-info-panel';
    infoPanel.style.cssText = `
        position: absolute;
        opacity: 0
        top: 10px;
        left: 10px;
        background: white;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        max-width: 320px;
        max-height: 320px;
        overflow-y: auto;
        overflow-x: hidden;
        font-family: Arial, sans-serif;
        z-index: 1000;
        transition: transform 0.3s ease, opacity 0.3s ease;
    `;

    // Crear botón para ocultar/mostrar panel
    const toggleButton = document.createElement('button');
    toggleButton.id = 'toggle-panel-btn';
    toggleButton.innerHTML = '✕';
    toggleButton.style.cssText = `
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
    `;
    infoPanel.style.transform = 'translateX(350px)';
    infoPanel.style.opacity = '0';
    toggleButton.innerHTML = '☰';
    toggleButton.style.left = '10px';

    let isPanelVisible = false;

    toggleButton.addEventListener('click', () => {
        isPanelVisible = !isPanelVisible;
        
        if (isPanelVisible) {
            infoPanel.style.transform = 'translateX(0)';
            infoPanel.style.opacity = '1';
            toggleButton.innerHTML = '✕';
            toggleButton.style.left = '10px';
        } else {
            infoPanel.style.transform = 'translateX(350px)';
            infoPanel.style.opacity = '0';
            toggleButton.innerHTML = '☰';
            toggleButton.style.left = '10px';
        }
        
        // Reajustar el mapa cuando se oculta/muestra el panel
        setTimeout(() => {
            google.maps.event.trigger(map, 'resize');
            adjustMapBounds();
        }, 300);
    });

    toggleButton.addEventListener('mouseenter', () => {
        toggleButton.style.background = '#f1f3f4';
    });

    toggleButton.addEventListener('mouseleave', () => {
        toggleButton.style.background = 'white';
    });

    // Estilos personalizados para el scrollbar y responsive
    const style = document.createElement('style');
    style.textContent = `
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
        /* Para Firefox */
        #route-info-panel {
            scrollbar-width: thin;
            scrollbar-color: #888 #f1f1f1;
        }
        
        /* Responsive para móviles */
        @media (max-width: 768px) {
            #route-info-panel {
                top: auto !important;
                bottom: 0 !important;
                right: 0 !important;
                left: 0 !important;
                max-width: 100% !important;
                max-height: 50vh !important;
                border-radius: 16px 16px 0 0 !important;
                transform: translateY(0) !important;
            }
            
            #route-info-panel.hidden {
                transform: translateY(100%) !important;
            }
            
            #toggle-panel-btn {
                top: auto !important;
                bottom: 10px !important;
                left: 10px !important;
            }
        }
    `;
    document.head.appendChild(style);

    mapContainer.style.position = 'relative';
    mapContainer.appendChild(infoPanel);
    mapContainer.appendChild(toggleButton);

    // Variables para acumular totales
    let totalDistance = 0;
    let totalDuration = 0;
    let routesCalculated = 0;
    const totalRoutes = points.length - 1;

    // Inicializar array de detalles con el tamaño correcto
    const routeDetails = new Array(totalRoutes).fill(null);

    // ---- Marcadores modernos con números ----
    const markers = [];
    points.forEach((p, index) => {
        // Crear elemento HTML para el marcador personalizado
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
        `;
        markerContent.textContent = index + 1;
        
        const marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: p.lat, lng: p.lng },
            content: markerContent,
            title: `${index + 1}. ${p.name}`,
        });
        
        // Añadir info window con icono
        const icon = pointIcons[p.type] || pointIcons.default;
        const infoWindow = new google.maps.InfoWindow({
            content: `<div style="padding:5px;"><strong>${icon} ${p.name}</strong></div>`
        });
        
        marker.addListener('click', () => {
            infoWindow.open(map, marker);
        });
        
        markers.push(marker);
    });

    // ---- Ruta entre puntos (múltiples segmentos) ----
    const directionsService = new google.maps.DirectionsService();
    const renderers = [];

    // Función para calcular ruta entre dos puntos
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

        // Configurar opciones de la petición
        const requestOptions = {
            origin: { lat: origin.lat, lng: origin.lng },
            destination: { lat: destination.lat, lng: destination.lng },
            travelMode: actualMode.toUpperCase(),
            transitOptions: {
                modes: ["RAIL", "SUBWAY", "TRAIN"]
            }
        };

        // Para TRANSIT, añadir tiempo de salida (ahora + 1 hora)
        if (actualMode.toUpperCase() === 'TRANSIT') {
            const departureTime = new Date();
            departureTime.setHours(departureTime.getHours() + 1);
            requestOptions.transitOptions = {
                departureTime: departureTime,
            };
        }

        directionsService.route(requestOptions, (response, status) => {
            if (status === "OK") {
                renderer.setDirections(response);
                
                const route = response.routes[0];
                const leg = route.legs[0];
                
                // Guardar detalles de la ruta
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
                
                const warningMsg = isRetry ? ' [FALLBACK a driving]' : '';
                console.log(`✓ Ruta ${index + 1}:`, origin.name, '→', destination.name, 
                        `(${actualMode})${warningMsg} - ${leg.distance.text}, ${leg.duration.text}`);
                
                // Actualizar panel cuando todas las rutas estén calculadas
                if (routesCalculated === totalRoutes) {
                    updateInfoPanel();
                }
            } else {
                console.error(`✗ Error en ruta ${index + 1} (${origin.name} → ${destination.name}):`, 
                            status, actualMode.toUpperCase());
                
                // Si falla TRANSIT y no es un retry, intentar con DRIVING
                if (mode.toUpperCase() === 'TRANSIT' && !isRetry) {
                    console.log(`↻ Reintentando ruta ${index + 1} con DRIVING...`);
                    calculateRoute(origin, destination, mode, index, true);
                } else {
                    // Si ya es un retry o no es transit, marcar como error
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

    // Función para actualizar el panel de información
    function updateInfoPanel() {
        const totalDistanceKm = (totalDistance / 1000).toFixed(2);
        const totalHours = Math.floor(totalDuration / 3600);
        const totalMinutes = Math.floor((totalDuration % 3600) / 60);
        const totalTimeText = totalHours > 0 
            ? `${totalHours}h ${totalMinutes}min` 
            : `${totalMinutes}min`;
        
        let html = `
            <h3 style="margin-top:0; color:#202124; font-size:18px;">📍 Itinerario</h3>
            <div style="background:#f1f3f4; padding:10px; border-radius:5px; margin-bottom:15px;">
                <div style="font-weight:bold; color:#202124;">Total del recorrido:</div>
                <div style="color:#5f6368; margin-top:5px;">
                    📏 ${totalDistanceKm} km<br>
                    ⏱️ ${totalTimeText}
                </div>
            </div>
            <div style="font-size:13px;">
        `;
        
        // Usar bucle for en lugar de forEach para asegurar que se recorran todos los índices
        for (let i = 0; i < routeDetails.length; i++) {
            const detail = routeDetails[i];
            
            if (!detail) {
                // Si no hay detalle para este índice, mostrar mensaje de carga o error
                html += `
                    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #e8eaed;">
                        <div style="font-weight:bold; color:#F9AB00; margin-bottom:4px;">
                            ⏳ ${i + 1}. Calculando ruta...
                        </div>
                        <div style="color:#5f6368; font-size:12px; margin-left:10px;">
                            <em>Esperando respuesta del servidor</em>
                        </div>
                    </div>
                `;
                continue;
            }
            
            const modeEmoji = {
                walking: '🚶',
                transit: '🚇',
                driving: '🚗',
                bicycling: '🚴',
            };
            const emoji = modeEmoji[detail.mode.toLowerCase()] || '📍';
            const color = modeColors[detail.mode.toLowerCase()] || '#4285F4';
            
            if (detail.error) {
                html += `
                    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #e8eaed;">
                        <div style="font-weight:bold; color:#EA4335; margin-bottom:4px;">
                            ❌ ${i + 1}. ${detail.from} → ${detail.to}
                        </div>
                        <div style="color:#5f6368; font-size:12px; margin-left:10px;">
                            Error: ${detail.errorMessage}<br>
                            <em>No se pudo calcular esta ruta</em>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #e8eaed;">
                        <div style="font-weight:bold; color:#202124; margin-bottom:4px;">
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
        }
        
        html += '</div>';
        infoPanel.innerHTML = html;

        // Ajustar el zoom del mapa DESPUÉS de calcular todas las rutas
        adjustMapBounds();
    }

    // Función para ajustar el zoom del mapa
    function adjustMapBounds() {
        const bounds = new google.maps.LatLngBounds();
        
        // Incluir todos los puntos
        points.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
        
        // Incluir todos los puntos de las rutas calculadas
        renderers.forEach(renderer => {
            const directions = renderer.getDirections();
            if (directions) {
                const route = directions.routes[0];
                if (route && route.overview_path) {
                    route.overview_path.forEach(point => bounds.extend(point));
                }
            }
        });
        
        // Aplicar bounds con padding
        map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }

    // Calcular ruta entre cada par consecutivo de puntos
    for (let i = 0; i < points.length - 1; i++) {
        const origin = points[i];
        const destination = points[i + 1];
        const mode = destination.mode || 'walking';
        
        calculateRoute(origin, destination, mode, i);
    }
};