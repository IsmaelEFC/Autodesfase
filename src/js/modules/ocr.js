/**
 * Módulo para manejar el reconocimiento óptico de caracteres (OCR) con Tesseract.js
 */

/**
 * Extrae texto de una imagen utilizando Tesseract.js
 * @param {HTMLCanvasElement|string} fuente - Elemento canvas o URL de la imagen
 * @param {Object} opciones - Opciones de configuración para el reconocimiento
 * @param {string} [opciones.idioma='spa'] - Idioma para el reconocimiento
 * @param {Object} [opciones.roi] - Región de interés {x, y, width, height}
 * @returns {Promise<string>} - Texto reconocido
 */
export async function reconocerTexto(fuente, opciones = {}) {
    const configuracion = {
        idioma: 'spa',  // Español por defecto
        ...opciones
    };

    try {
        // Verificar si Tesseract está disponible
        if (typeof Tesseract === 'undefined') {
            throw new Error('Tesseract.js no está cargado');
        }

        // Configuración para el reconocimiento
        const configTesseract = {
            lang: configuracion.idioma,
            logger: m => console.log(m)  // Opcional: registrar el progreso
        };

        // Si se especificó una región de interés, recortar la imagen
        let imagen = fuente;
        if (configuracion.roi && fuente instanceof HTMLCanvasElement) {
            const { x, y, width, height } = configuracion.roi;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(fuente, x, y, width, height, 0, 0, width, height);
            
            imagen = canvas;
        }

        // Realizar el reconocimiento de texto
        const { data: { text } } = await Tesseract.recognize(imagen, configTesseract);
        
        // Procesar el texto extraído
        return procesarTextoReconocido(text);
    } catch (error) {
        console.error('Error en reconocimiento OCR:', error);
        throw new Error(`No se pudo reconocer el texto: ${error.message}`);
    }
}

/**
 * Procesa el texto reconocido para limpiarlo y formatearlo
 * @param {string} texto - Texto crudo reconocido por Tesseract
 * @returns {string} - Texto procesado
 */
function procesarTextoReconocido(texto) {
    if (!texto) return '';
    
    // Eliminar espacios en blanco al inicio y final
    let resultado = texto.trim();
    
    // Reemplazar múltiples espacios o saltos de línea por un solo espacio
    resultado = resultado.replace(/\s+/g, ' ');
    
    // Eliminar caracteres no deseados (ajustar según necesidades)
    resultado = resultado.replace(/[^\w\sáéíóúÁÉÍÓÚñÑ.,:;!?()\-]/g, '');
    
    return resultado;
}

/**
 * Extrae una fecha u hora del texto reconocido
 * @param {string} texto - Texto reconocido
 * @returns {Date|null} - Objeto Date si se encontró una fecha/hora, null en caso contrario
 */
export function extraerFechaHora(texto) {
    if (!texto) return null;
    
    // Patrones comunes para fechas y horas
    const patrones = [
        // Formato 24h: HH:MM:SS o HH:MM
        /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?:\s|$)/,
        // Formato 12h: hh:MM:SS am/pm o hh:MM am/pm
        /(?:^|\s)(0?[1-9]|1[0-2]):([0-5]\d)(?::([0-5]\d))?\s*([ap]m?)(?:\s|$)/i
    ];
    
    // Buscar coincidencias con los patrones
    for (const patron of patrones) {
        const coincidencia = texto.match(patron);
        if (coincidencia) {
            const ahora = new Date();
            let horas, minutos, segundos = 0;
            
            if (patron === patrones[0]) {
                // Formato 24h
                horas = parseInt(coincidencia[1], 10);
                minutos = parseInt(coincidencia[2], 10);
                if (coincidencia[3]) {
                    segundos = parseInt(coincidencia[3], 10);
                }
            } else {
                // Formato 12h
                horas = parseInt(coincidencia[1], 10);
                minutos = parseInt(coincidencia[2], 10);
                if (coincidencia[3]) {
                    segundos = parseInt(coincidencia[3], 10);
                }
                
                // Ajustar para formato 24h
                const esPM = coincidencia[4].toLowerCase().startsWith('p');
                if (esPM && horas < 12) {
                    horas += 12;
                } else if (!esPM && horas === 12) {
                    horas = 0;
                }
            }
            
            // Crear objeto Date con la hora actual y la hora extraída
            const fecha = new Date();
            fecha.setHours(horas, minutos, segundos, 0);
            
            return fecha;
        }
    }
    
    return null;
}
