/**
 * Módulo para manejar la funcionalidad de geolocalización
 */

/**
 * Obtiene las coordenadas actuales del dispositivo
 * @returns {Promise<{lat: string, lon: string}>} - Objeto con latitud y longitud
 */
export function getCoordenadas() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.warn('Geolocalización no soportada por el navegador');
            resolve({ lat: "?", lon: "?" });
            return;
        }

        const opciones = {
            enableHighAccuracy: true,  // Intentar obtener la mejor precisión posible
            timeout: 10000,           // Tiempo máximo de espera (10 segundos)
            maximumAge: 0             // No usar caché, obtener posición actual
        };

        navigator.geolocation.getCurrentPosition(
            // Éxito
            (pos) => {
                resolve({
                    lat: pos.coords.latitude.toFixed(6),
                    lon: pos.coords.longitude.toFixed(6)
                });
            },
            // Error
            (error) => {
                console.error('Error al obtener la ubicación:', error);
                // Devolver valores por defecto en caso de error
                resolve({ lat: "?", lon: "?" });
            },
            opciones
        );
    });
}

/**
 * Obtiene la dirección a partir de coordenadas utilizando la API de Nominatim (OpenStreetMap)
 * @param {number} lat - Latitud
 * @param {number} lon - Longitud
 * @returns {Promise<string>} - Dirección formateada o mensaje de error
 */
export async function getDireccion(lat, lon) {
    try {
        if (lat === "?" || lon === "?") {
            return "Ubicación no disponible";
        }

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
        );
        
        if (!response.ok) {
            throw new Error('Error al obtener la dirección');
        }

        const data = await response.json();
        
        // Formatear la dirección según los datos disponibles
        if (data.address) {
            const { road, suburb, city, state, country } = data.address;
            const direccion = [road, suburb, city, state, country]
                .filter(Boolean)  // Eliminar valores nulos o undefined
                .join(', ');
            
            return direccion || 'Dirección no disponible';
        }
        
        return 'Dirección no disponible';
    } catch (error) {
        console.error('Error al obtener la dirección:', error);
        return 'Error al obtener la dirección';
    }
}
