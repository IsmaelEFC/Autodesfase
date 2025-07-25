// Importar módulos
import { capturarImagen, iniciarCamara, detenerCamara, videoListo } from './modules/camera.js';
import { getCoordenadas, getDireccion } from './modules/geolocation.js';
import { mostrarEstado, mostrarCargando, mostrarNotificacion } from './modules/ui.js';
import { reconocerTexto } from './modules/ocr.js';
import { inicializarNotificaciones, mostrarNotificacion as mostrarNotif } from './modules/notifications.js';
import { guardarCaptura, cargarTodasCapturas, eliminarCaptura } from './modules/captura-db.js';
import { 
    ERROR_TYPES, 
    SEVERITY, 
    handleError, 
    withErrorHandling, 
    withErrorHandlingEvent 
} from './modules/error-handler.js';

// Referencias a elementos del DOM
const camera = document.getElementById('camera');
const canvas = document.getElementById('canvas-preview');
const ctx = canvas.getContext('2d');
const gallery = document.getElementById('history-grid');
const btnCapturar = document.getElementById('capture-btn');
const btnCerrarVisor = document.getElementById('cerrar-visor');
const visorModal = document.getElementById('visor-modal');
const visorImg = document.getElementById('visor-img');
const visorInfo = document.getElementById('visor-info');
const btnMaps = document.getElementById('maps-btn');
const btnDescargar = document.getElementById('descargar-img');
const toast = document.getElementById('status-toast');

// Variables de estado
let capturaActual = null;

/**
 * Genera una nueva captura de la cámara con metadatos
 */
const generarCaptura = withErrorHandlingEvent(async () => {
    // Mostrar estado de procesamiento
    mostrarEstado('processing', 'Procesando captura...');
    
    // Verificar que la cámara esté lista
    if (!videoListo(camera)) {
        throw new Error('La cámara no está lista para tomar una captura');
    }
    
    // Capturar imagen de la cámara
    const { imagen, width, height } = await capturarImagen(camera, canvas);
    
    // Obtener coordenadas de ubicación
    const coords = await getCoordenadas().catch(error => {
        console.warn('No se pudieron obtener las coordenadas:', error);
        return { lat: '?', lon: '?', error: error.message };
    });
    
    // Crear objeto de captura con metadatos
    const ahora = new Date();
    const captura = {
        timestamp: ahora.getTime(),
        coords: coords,
        src: imagen,
        horaOficial: ahora.toLocaleTimeString('es-CL', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            hour12: false, 
            timeZone: 'America/Santiago' 
        }),
        fechaCompleta: ahora.toLocaleDateString('es-CL', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        })
    };
    
    // Procesar OCR en el recuadro de la cámara
    try {
        const ocrResult = await reconocerHoraEnRecuadro(camera);
        if (ocrResult && ocrResult.success) {
            captura.ocrResult = {
                fechaHora: ocrResult.time.time.toLocaleString(),
                confianza: ocrResult.confidence
            };
        }
    } catch (ocrError) {
        console.warn('Error en OCR:', ocrError);
        captura.ocrError = 'No se pudo procesar el texto en la imagen';
    }
    
    // Guardar la captura en la base de datos
    await guardarCaptura(captura);
    
    // Actualizar la interfaz
    mostrarEstado('success', '¡Captura guardada correctamente!');
    await cargarHistorial();
    
    // Mostrar notificación si está permitido
    if (Notification.permission === 'granted') {
        mostrarNotificacion('TimeCam', '¡Captura guardada correctamente!');
    }
    
    return captura;
}, {
    type: 'CAMERA',
    showToUser: true,
    defaultReturn: null
});

async function getCoordenadas() {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            pos => resolve({
                lat: pos.coords.latitude.toFixed(6),
                lon: pos.coords.longitude.toFixed(6)
            }),
            () => resolve({ lat: "?", lon: "?" })
        );
    });
}

async function extraerFechaConOCR(imagenElement) {
    try {
        // Crear un canvas temporal para recortar el área del recuadro verde
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        // Obtener dimensiones del recuadro verde (#selection-rectangle)
        const rectangle = document.getElementById('selection-rectangle');
        const rectStyles = getComputedStyle(rectangle);
        const rectWidthPercent = parseFloat(rectStyles.width) / 100; // 80% del contenedor
        const rectAspectRatio = 16 / 9; // Definido en CSS
        const videoWidth = imagenElement.width;
        const videoHeight = imagenElement.height;

        // Calcular dimensiones y posición del recuadro en píxeles
        const rectWidth = videoWidth * rectWidthPercent;
        const rectHeight = rectWidth / rectAspectRatio;
        const rectX = (videoWidth - rectWidth) / 2; // Centrado horizontalmente
        const rectY = (videoHeight - rectHeight) / 2; // Centrado verticalmente

        // Configurar el canvas temporal con las dimensiones del recuadro
        tempCanvas.width = rectWidth;
        tempCanvas.height = rectHeight;

        // Recortar la imagen al área del recuadro
        tempCtx.drawImage(
            imagenElement,
            rectX, rectY, rectWidth, rectHeight, // Área fuente (recuadro)
            0, 0, rectWidth, rectHeight // Área destino (canvas temporal)
        );

        // Preprocesamiento: Aplicar escala de grises y aumentar contraste
        tempCtx.filter = 'grayscale(100%) contrast(150%)';
        tempCtx.drawImage(tempCanvas, 0, 0);

        // Aumentar la resolución del canvas temporal para mejorar la detección
        const scaleFactor = 2; // Duplicar la resolución
        const scaledCanvas = document.createElement('canvas');
        const scaledCtx = scaledCanvas.getContext('2d');
        scaledCanvas.width = rectWidth * scaleFactor;
        scaledCanvas.height = rectHeight * scaleFactor;
        scaledCtx.imageSmoothingEnabled = true;
        scaledCtx.drawImage(tempCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);

        // Configurar Tesseract.js con parámetros optimizados
        const { data: { text, confidence } } = await Tesseract.recognize(scaledCanvas, 'spa+eng', {
            tessedit_pageseg_mode: '6', // Asume un bloque de texto uniforme
            tessedit_char_whitelist: '0123456789-:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
            tessedit_ocr_engine_mode: '1' // Usa modo LSTM solo (más preciso para texto claro)
        });
        console.log('OCR text:', text);

        // Expresión regular para detectar múltiples formatos de fecha y hora
        const fechaHora = text.match(
            /(?:(\d{1,2})[-\/](?:\d{1,2}|(?:jan|ene|feb|mar|apr|abr|may|jun|jul|ago|aug|sep|oct|nov|dic|dec)[a-z]*)[-\/](\d{4}))(?:\s+(?:lun|mar|mié|jue|vie|sáb|dom|mon|tue|wed|thu|fri|sat|sun))?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i
        );
        if (fechaHora) {
            const [_, dia, anio, hora, minuto, segundo] = fechaHora;
            const mesMatch = text.match(/(jan|ene|feb|mar|apr|abr|may|jun|jul|ago|aug|sep|oct|nov|dic|dec)/i)?.[0] || text.match(/\d{1,2}/)?.[0];
            return {
                fechaHora: `${dia}-${mesMatch}-${anio} ${hora}:${minuto}${segundo ? `:${segundo}` : ''}`,
                confianza: confidence
            };
        }
        return { fechaHora: null, confianza: 0 };
    } catch (error) {
        throw new Error('Error en OCR: ' + error.message);
    }
}

function mostrarEstado(tipo, mensaje) {
    toast.className = `toast-${tipo}`;
    toast.textContent = mensaje;
    toast.style.opacity = '1';
    if (tipo === 'processing') {
        toast.style.animation = 'spin 1s linear infinite';
    } else {
        toast.style.animation = 'none';
    }
    setTimeout(() => {
        if (tipo !== 'processing') {
            toast.style.opacity = '0';
        }
    }, tipo === 'processing' ? 0 : 2500);
}

/**
 * Carga y muestra el historial de capturas
 */
const cargarHistorial = withErrorHandling(async () => {
    // Mostrar estado de carga
    mostrarCargando(true);
    
    try {
        // Obtener todas las capturas usando el módulo
        const capturas = await cargarTodasCapturas();
        
        // Limpiar la galería
        gallery.innerHTML = capturas.length ? '' : '<p class="no-data">No hay capturas guardadas</p>';
        
        // Ordenar capturas por fecha (más recientes primero)
        capturas.sort((a, b) => b.timestamp - a.timestamp);
        
        // Crear elementos para cada captura
        for (const captura of capturas) {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.tabIndex = 0; // Hacer que sea enfocable para accesibilidad
            item.dataset.timestamp = captura.timestamp;
            
            // Crear imagen en miniatura
            const img = document.createElement('img');
            img.src = captura.src;
            img.className = 'gallery-image';
            img.alt = `Captura del ${new Date(captura.timestamp).toLocaleString('es-CL')}`;
            img.loading = 'lazy'; // Lazy loading para mejor rendimiento
            img.draggable = false; // Evitar arrastrar la imagen
            
            // Mostrar captura en el visor al hacer clic o presionar Enter
            const mostrarCaptura = () => mostrarImagenEnVisor(captura);
            img.addEventListener('click', mostrarCaptura);
            
            // Hacer que el ítem completo sea interactivo para teclado
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    mostrarCaptura();
                }
            });
            
            // Botón para eliminar captura
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Eliminar captura';
            deleteBtn.setAttribute('aria-label', `Eliminar captura del ${new Date(captura.timestamp).toLocaleString('es-CL')}`);
            
            // Manejador para eliminar captura
            const handleEliminar = withErrorHandlingEvent(async (e) => {
                e.stopPropagation();
                await eliminarCaptura(captura.timestamp);
                item.remove();
                
                // Actualizar mensaje si no hay más capturas
                if (!gallery.querySelector('.gallery-item')) {
                    gallery.innerHTML = '<p class="no-data">No hay capturas guardadas</p>';
                }
                
                mostrarEstado('success', 'Captura eliminada correctamente');
            }, {
                type: 'STORAGE',
                customMessage: 'No se pudo eliminar la captura',
                showToUser: true
            });
            
            deleteBtn.addEventListener('click', handleEliminar);
            
            // Añadir elementos al DOM
            item.append(img, deleteBtn);
            gallery.appendChild(item);
        }
        
        return capturas.length; // Retornar el número de capturas cargadas
    } finally {
        // Ocultar indicador de carga
        mostrarCargando(false);
    }
}, {
    type: 'STORAGE',
    customMessage: 'No se pudo cargar el historial de capturas',
    showToUser: true
});

/**
 * Muestra una captura en el visor de imágenes con sus metadatos
 * @param {Object} captura - Objeto con los datos de la captura a mostrar
 */
const mostrarImagenEnVisor = withErrorHandling(async (captura) => {
    // Validar entrada
    if (!captura || !captura.src) {
        throw new Error('Datos de captura no válidos');
    }
    
    // Mostrar estado de carga
    mostrarCargando(true);
    
    try {
        // Actualizar la imagen en el visor
        visorImg.src = captura.src;
        
        // Cargar la dirección si hay coordenadas disponibles
        let direccion = 'Ubicación no disponible';
        if (captura.coords && captura.coords.lat !== '?') {
            try {
                const dir = await getDireccion(captura.coords.lat, captura.coords.lon);
                if (dir) direccion = dir;
            } catch (error) {
                console.warn('No se pudo obtener la dirección:', error);
                direccion = `${captura.coords.lat}, ${captura.coords.lon}`;
            }
        }
        
        // Construir el HTML de la información
        const infoHTML = [
            `<p><strong>Fecha y hora:</strong> ${captura.fechaCompleta || 'No disponible'}</p>`,
            captura.horaOficial ? `<p><strong>Hora oficial:</strong> ${captura.horaOficial}</p>` : '',
            `<p><strong>Ubicación:</strong> ${direccion}</p>`,
            captura.ocrResult ? `<p><strong>Texto detectado:</strong> ${captura.ocrResult.fechaHora || 'No reconocido'}</p>` : '',
            captura.ocrResult?.confianza ? `<p><strong>Confianza OCR:</strong> ${Math.round(captura.ocrResult.confianza * 10) / 10}%</p>` : '',
            captura.ocrError ? `<p class="error"><strong>Error OCR:</strong> ${captura.ocrError}</p>` : ''
        ].filter(Boolean).join('');
        
        // Actualizar la información en el visor
        visorInfo.innerHTML = infoHTML;
        
        // Configurar botón de mapa si hay coordenadas
        if (captura.coords && captura.coords.lat !== '?') {
            btnMaps.style.display = 'inline-block';
            btnMaps.onclick = withErrorHandlingEvent(() => {
                window.open(`https://www.google.com/maps?q=${captura.coords.lat},${captura.coords.lon}`, '_blank');
            }, {
                type: 'NETWORK',
                showToUser: true,
                customMessage: 'No se pudo abrir el mapa con la ubicación'
            });
        } else {
            btnMaps.style.display = 'none';
        }
        
        // Configurar descarga de la imagen
        const handleDescargar = withErrorHandlingEvent(() => {
            const link = document.createElement('a');
            link.href = captura.src;
            link.download = `timecam-${new Date(captura.timestamp).toISOString().replace(/[:.]/g, '-')}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, {
            type: 'STORAGE',
            showToUser: true,
            customMessage: 'No se pudo descargar la imagen'
        });
        
        btnDescargar.onclick = handleDescargar;
        
        // Mostrar el visor
        visorModal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Deshabilitar scroll
        
        // Configurar cierre del visor
        const cerrarVisor = () => {
            visorModal.style.display = 'none';
            document.body.style.overflow = ''; // Restaurar scroll
            btnCerrarVisor.onclick = null;
            document.removeEventListener('keydown', handleKeyDown);
        };
        
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                cerrarVisor();
            }
        };
        
        btnCerrarVisor.onclick = cerrarVisor;
        document.addEventListener('keydown', handleKeyDown);
        
        // Establecer la captura actual
        capturaActual = captura;
        
        // Enfocar el botón de cierre para accesibilidad
        setTimeout(() => btnCerrarVisor.focus(), 100);
        
    } finally {
        mostrarCargando(false);
    }
}, {
    type: 'UI',
    showToUser: true,
    customMessage: 'No se pudo cargar la imagen en el visor'
});

// Inicializar la aplicación cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Inicializar notificaciones
        await inicializarNotificaciones();
        
        // Registrar el Service Worker para PWA
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('../service-worker.js');
                console.log('ServiceWorker registrado con éxito:', registration.scope);
                
                // Verificar actualizaciones del Service Worker
                if (registration.waiting) {
                    console.log('Nueva versión del Service Worker en espera');
                    // Aquí podrías mostrar un mensaje al usuario para actualizar la aplicación
                }
                
                // Escuchar actualizaciones del Service Worker
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('Nueva versión disponible. Por favor, actualiza la página.');
                            // Aquí podrías mostrar un mensaje al usuario para actualizar la aplicación
                        }
                    });
                });
                
                // Comprobar actualizaciones periódicamente
                setInterval(() => registration.update(), 60 * 60 * 1000); // Cada hora
                
            } catch (error) {
                console.error('Error al registrar el Service Worker:', error);
            }
        }
        
        // Configurar eventos de los botones de captura
        const setupCaptureButton = (elementId) => {
            const element = document.getElementById(elementId);
            if (!element) return;
            
            // Para clics con ratón
            element.addEventListener('click', (e) => {
                e.preventDefault();
                generarCaptura().catch(error => {
                    console.error('Error en captura:', error);
                });
            });
            
            // Para toques en pantalla táctil
            element.addEventListener('touchstart', (e) => {
                e.preventDefault();
                generarCaptura().catch(error => {
                    console.error('Error en captura táctil:', error);
                });
            }, { passive: false });
        };
        
        // Configurar botones de captura
        setupCaptureButton('capture-btn');
        
        // Configurar pestañas
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const id = tab.getAttribute('aria-controls');
                mostrarSeccion(id);
            });
            
            // Soporte para teclado (accesibilidad)
            tab.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const id = tab.getAttribute('aria-controls');
                    mostrarSeccion(id);
                }
            });
        });
        
        // Cargar la última sección visitada o la sección de captura por defecto
        const ultimaSeccion = localStorage.getItem('ultimaSeccion') || 'captura';
        await mostrarSeccion(ultimaSeccion);
        
        // Mostrar mensaje de bienvenida
        mostrarEstado('info', '¡Bienvenido a TimeCam!');
        
        // Verificar si la aplicación se instaló recientemente
        window.addEventListener('appinstalled', () => {
            console.log('¡TimeCam se ha instalado correctamente!');
            mostrarNotificacion('TimeCam', '¡Aplicación instalada correctamente!');
        });
        
        // Verificar si estamos en modo offline
        window.addEventListener('offline', () => {
            mostrarEstado('warning', 'Estás trabajando sin conexión. Algunas funciones pueden estar limitadas.');
        });
        
        window.addEventListener('online', () => {
            mostrarEstado('success', '¡Conexión restablecida!');
            
            // Registrar el Service Worker
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', async () => {
                    try {
                        const registration = await navigator.serviceWorker.register('/service-worker.js');
                        console.log('ServiceWorker registrado con éxito:', registration.scope);
                        
                        // Verificar actualizaciones del Service Worker
                        registration.addEventListener('updatefound', () => {
                            const newWorker = registration.installing;
                            newWorker.addEventListener('statechange', () => {
                                // Cuando el nuevo service worker esté instalado
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    // Mostrar notificación al usuario sobre la actualización
                                    mostrarNotificacion(
                                        'Actualización disponible', 
                                        'Hay una nueva versión de TimeCam disponible. Por favor, recarga la página para actualizar.',
                                        () => {
                                            // Recargar la página cuando el usuario haga clic en la notificación
                                            window.location.reload();
                                        }
                                    );
                                }
                            });
                        });
                        
                        // Verificar si hay una nueva versión del service worker
                        if (registration.waiting) {
                            mostrarNotificacion(
                                'Actualización lista', 
                                'Una nueva versión está lista. Por favor, cierra todas las pestañas de TimeCam para actualizar.',
                                () => { window.location.reload(); }
                            );
                        }
                        
                        // Escuchar mensajes del service worker
                        navigator.serviceWorker.addEventListener('message', (event) => {
                            if (event.data && event.data.type === 'NEW_VERSION_AVAILABLE') {
                                mostrarNotificacion(
                                    'Nueva versión', 
                                    '¡Hay una nueva versión disponible! Recarga para actualizar.',
                                    () => { window.location.reload(); }
                                );
                            }
                        });
                        
                    } catch (error) {
                        console.error('Error al registrar el Service Worker:', error);
                    }
                });
            }
            // Recargar datos si es necesario
            if (document.querySelector('#historial.visible')) {
                cargarHistorial();
            }
        });
        
        // Verificar estado de conexión al cargar
        if (!navigator.onLine) {
            mostrarEstado('warning', 'Estás trabajando sin conexión. Algunas funciones pueden estar limitadas.');
        }
        
    } catch (error) {
        console.error('Error en la inicialización de la aplicación:', error);
        mostrarEstado('error', 'Error al iniciar la aplicación. Por favor, recarga la página.');
    }
});

async function mostrarSeccion(id) {
    try {
        // Validar ID de sección
        if (!['captura', 'historial'].includes(id)) {
            console.warn(`Sección no válida: ${id}`);
            return;
        }
        
        // Actualizar clases de las vistas
        const vistas = document.querySelectorAll('.vista');
        const tabs = document.querySelectorAll('.tab');
        
        vistas.forEach(vista => {
            const esVisible = vista.id === id;
            vista.classList.toggle('visible', esVisible);
            vista.setAttribute('aria-hidden', !esVisible);
            
            // Mejorar accesibilidad
            if (esVisible) {
                vista.removeAttribute('inert');
                // Enfocar el primer elemento interactivo al cambiar de sección
                const focusElement = vista.querySelector('button, [href], [tabindex]');
                if (focusElement) {
                    setTimeout(() => focusElement.focus(), 100);
                }
            } else {
                vista.setAttribute('inert', 'true');
            }
        });
        
        // Actualizar pestañas
        tabs.forEach(tab => {
            const isActive = tab.getAttribute('aria-controls') === id;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive);
            tab.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        
        // Actualizar indicador de pestaña
        const tabIndicator = document.getElementById('tab-indicator');
        if (tabIndicator) {
            tabIndicator.style.transform = `translateX(${id === 'captura' ? 0 : 100}%)`;
        }
        
        // Gestionar lógica específica de cada sección
        if (id === 'captura') {
            // Iniciar cámara para la sección de captura
            try {
                await iniciarCamara();
                // Enfocar el botón de captura después de iniciar la cámara
                const captureBtn = document.getElementById('capture-btn');
                if (captureBtn) captureBtn.focus();
            } catch (error) {
                console.error('Error al iniciar la cámara:', error);
                mostrarEstado('error', 'No se pudo acceder a la cámara');
                // Cambiar a la pestaña de historial si hay un error con la cámara
                if (id === 'captura') {
                    setTimeout(() => mostrarSeccion('historial'), 1000);
                }
            }
        } else if (id === 'historial') {
            // Detener la cámara al cambiar a la sección de historial
            try {
                await detenerCamara();
                // Cargar el historial
                await cargarHistorial();
                // Enfocar el primer elemento del historial si existe
                const firstItem = document.querySelector('.gallery-item');
                if (firstItem) firstItem.focus();
            } catch (error) {
                console.error('Error al cargar el historial:', error);
                mostrarEstado('error', 'Error al cargar el historial');
            }
        }
        
        // Guardar la última sección visitada en localStorage
        localStorage.setItem('ultimaSeccion', id);
        
    } catch (error) {
        console.error('Error en mostrarSeccion:', error);
        mostrarEstado('error', 'Error al cambiar de sección');
    }
}