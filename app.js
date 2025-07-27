// Debug visual del área de captura
let debugCanvas = null;
let debugInterval = null;

function initDebugVisualization() {
    // Crear canvas de depuración
    debugCanvas = document.createElement('canvas');
    debugCanvas.width = 200;  // Ancho fijo para la vista previa
    debugCanvas.height = 100; // Alto fijo para la vista previa
    debugCanvas.style.position = 'fixed';
    debugCanvas.style.bottom = '10px';
    debugCanvas.style.right = '10px';
    debugCanvas.style.border = '2px solid red';
    debugCanvas.style.zIndex = '9999';
    debugCanvas.style.backgroundColor = 'black';
    debugCanvas.style.display = 'none'; // Oculto por defecto
    document.body.appendChild(debugCanvas);

    // Solo activar en desarrollo
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        debugCanvas.style.display = 'block';
    }
}

function updateDebugVisualization(camera, captureX, captureY, captureWidth, captureHeight) {
    if (!debugCanvas) return;
    
    const ctx = debugCanvas.getContext('2d');
    ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    
    // Calcular relación de aspecto para mantener proporciones
    const aspectRatio = captureWidth / captureHeight;
    let drawWidth = debugCanvas.width;
    let drawHeight = debugCanvas.width / aspectRatio;
    
    if (drawHeight > debugCanvas.height) {
        drawHeight = debugCanvas.height;
        drawWidth = debugCanvas.height * aspectRatio;
    }
    
    // Dibujar la región capturada
    try {
        ctx.drawImage(
            camera, 
            captureX, captureY, 
            captureWidth, captureHeight,
            0, 0,
            drawWidth, drawHeight
        );
    } catch (e) {
        console.warn('No se pudo actualizar la vista previa de depuración:', e);
    }
}

// Configuración de Tesseract.js
if (typeof Tesseract !== 'undefined') {
    Tesseract.workerOptions = {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
        langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js-data@4',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm.js',
    };
}

// Función para cargar Tesseract dinámicamente
const loadTesseract = () => {
    return new Promise((resolve, reject) => {
        // Si ya está cargado, lo devolvemos inmediatamente
        if (window.Tesseract) {
            console.log('Tesseract ya está cargado, versión:', window.Tesseract.version);
            return resolve();
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4.1.1/dist/tesseract.min.js';
        script.integrity = 'sha384-...'; // Opcional: añadir SRI hash si es necesario
        script.crossOrigin = 'anonymous';
        
        script.onload = () => {
            if (!window.Tesseract) {
                return reject(new Error('Tesseract no se inicializó correctamente'));
            }
            console.log('Tesseract cargado dinámicamente, versión:', window.Tesseract.version);
            resolve();
        };
        
        script.onerror = (error) => {
            console.error('Error al cargar Tesseract:', error);
            reject(new Error('No se pudo cargar el procesador OCR. Verifica tu conexión a internet.'));
        };
        
        document.head.appendChild(script);
    });
};

// Servidores de tiempo alternativos
const TIME_SERVERS = [
    'https://worldtimeapi.org/api/timezone/America/Santiago',
    'https://timeapi.io/api/Time/current/zone?timeZone=America/Santiago',
    'https://www.timeapi.io/utc/now'
];

class DVRHistory {
    constructor() {
        this.history = JSON.parse(localStorage.getItem('dvrHistory')) || [];
    }

    addEntry(data) {
        this.history.unshift({
            date: new Date().toISOString(),
            ...data
        });
        if (this.history.length > 10) this.history.pop();
        this.save();
    }

    clear() {
        this.history = [];
        this.save();
    }

    save() {
        localStorage.setItem('dvrHistory', JSON.stringify(this.history));
    }

    getHistory() {
        return [...this.history];
    }
}

// Elementos del DOM
const camera = document.getElementById('camera');
const cameraContainer = document.getElementById('camera-container');
const captureBtn = document.getElementById('capture-btn');
const resultsDiv = document.getElementById('results');
const rectangle = document.getElementById('selection-rectangle');

// 1. Variables globales para trackear scroll
let scrollOffset = { x: 0, y: 0 };
let isScrolling = false;

// 2. Detectar scroll en el contenedor
if (cameraContainer) {
    cameraContainer.addEventListener('scroll', () => {
        isScrolling = true;
        scrollOffset = {
            x: cameraContainer.scrollLeft,
            y: cameraContainer.scrollTop
        };
        setTimeout(() => isScrolling = false, 100);
    });
}

// 3. Función de captura con posición fija (alternativa)
function fixedPositionCapture() {
    const video = camera;
    const selectionRect = rectangle.getBoundingClientRect();
    
    const canvas = document.createElement('canvas');
    canvas.width = selectionRect.width;
    canvas.height = selectionRect.height;
    const ctx = canvas.getContext('2d');
    
    ctx.drawImage(
        video,
        selectionRect.left, selectionRect.top,
        selectionRect.width, selectionRect.height,
        0, 0,
        selectionRect.width, selectionRect.height
    );
    
    return canvas;
}

// 4. Función de pre-procesamiento de imagen
function preprocessForOCR(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Aumentar contraste (conversión a escala de grises y binarización)
    for (let i = 0; i < imageData.data.length; i += 4) {
        // Convertir a escala de grises (promedio ponderado para percepción humana)
        const gray = Math.round(
            0.299 * imageData.data[i] + 
            0.587 * imageData.data[i + 1] + 
            0.114 * imageData.data[i + 2]
        );
        
        // Umbralización (binarización)
        const threshold = 128;
        const value = gray < threshold ? 0 : 255;
        
        imageData.data[i] = value;     // R
        imageData.data[i + 1] = value; // G
        imageData.data[i + 2] = value; // B
        // Alpha se mantiene igual
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}
const cameraPlaceholder = document.getElementById('camera-placeholder');

// Variables de estado
let stream = null;
let isProcessing = false;
const dvrHistory = new DVRHistory();
let currentResult = null;

// 1. Verificar compatibilidad con la cámara
function checkCameraSupport() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// 2. Iniciar cámara con manejo de permisos
async function initCamera() {
    // Verificar compatibilidad
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showMessage('Tu navegador no soporta la cámara o está bloqueado', 'error');
        cameraPlaceholder.innerHTML = '<p><i class="fas fa-video-slash"></i> Navegador no compatible con la cámara</p>';
        return;
    }

    try {
        // Mostrar mensaje de carga
        showMessage('Solicitando acceso a la cámara...', 'loading');
        cameraPlaceholder.innerHTML = '<div class="loader"></div><p>Esperando permisos de cámara...</p>';
        
        // Configuración optimizada para móviles
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };

        // Iniciar transmisión de la cámara
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        camera.srcObject = stream;
        
        // Esperar a que la cámara esté lista (especialmente en móviles)
        await new Promise((resolve) => {
            camera.onloadedmetadata = () => {
                camera.play().then(() => {
                    camera.style.display = 'block';
                    rectangle.style.display = 'block';
                    cameraPlaceholder.style.display = 'none';
                    captureBtn.disabled = false;
                    showMessage('Cámara lista. Enfoca la pantalla del DVR en el rectángulo verde.', 'info');
                    resolve();
                });
            };
        });

    } catch (error) {
        let errorMessage = 'Error al acceder a la cámara: ';
        if (error.name === 'NotAllowedError') {
            errorMessage += 'Permiso denegado. Por favor habilita los permisos de cámara en la configuración de tu navegador.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += 'No se encontró cámara trasera.';
        } else {
            errorMessage += error.message;
        }
        showMessage(errorMessage, 'error');
        cameraPlaceholder.innerHTML = `<p><i class="fas fa-video-slash"></i> ${errorMessage}</p>`;
    }
}

// 3. Manejo de errores de cámara
function handleCameraError(err) {
    console.error('Error en la cámara:', err);
    captureBtn.disabled = true;
    
    if (err.name === 'NotAllowedError') {
        cameraPlaceholder.innerHTML = `
            <div class="permission-denied">
                <p><strong><i class="fas fa-ban"></i> Permiso denegado:</strong> Has bloqueado el acceso a la cámara.</p>
                <p>Para usar esta aplicación, por favor:</p>
                <ol>
                    <li>Haz clic en el ícono de candado en la barra de direcciones</li>
                    <li>Selecciona "Configuración de sitios"</li>
                    <li>Habilita los permisos de cámara</li>
                    <li>Actualiza la página</li>
                </ol>
                <button class="retry-btn" onclick="window.location.reload()">
                    <i class="fas fa-sync-alt"></i> Reintentar
                </button>
            </div>
        `;
        showMessage('Permiso de cámara denegado. Por favor habilita los permisos y recarga la página.', 'error');
    } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        cameraPlaceholder.innerHTML = '<p><i class="fas fa-camera"></i> No se encontró cámara trasera o no cumple los requisitos.</p>';
        showMessage('Error: No se pudo acceder a la cámara trasera.', 'error');
    } else {
        cameraPlaceholder.innerHTML = '<p><i class="fas fa-exclamation-triangle"></i> Error al inicializar la cámara.</p>';
        showMessage('Error al acceder a la cámara: ' + err.message, 'error');
    }
}

// 4. Capturar y procesar imagen con indicador de carga
async function captureAndProcess() {
    if (isProcessing) return;
    isProcessing = true;
    captureBtn.disabled = true;

    try {
        // 1. Mostrar loader
        resultsDiv.innerHTML = `
            <div style="text-align: center;">
                <div class="loader"></div>
                <p class="loading">Procesando imagen...</p>
            </div>
        `;
        
        // 2. Obtener dimensiones exactas
        const video = document.getElementById('camera');
        const rectangle = document.getElementById('selection-rectangle');
        const rect = rectangle.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();

        // 3. Calcular región de captura (ajustada a scroll/zoom)
        const scaleX = video.videoWidth / videoRect.width;
        const scaleY = video.videoHeight / videoRect.height;
        
        const captureX = (rect.left - videoRect.left) * scaleX;
        const captureY = (rect.top - videoRect.top) * scaleY;
        const captureWidth = rect.width * scaleX;
        const captureHeight = rect.height * scaleY;

        // 4. Crear canvas con la región exacta
        const canvas = document.createElement('canvas');
        canvas.width = captureWidth;
        canvas.height = captureHeight;
        const ctx = canvas.getContext('2d');
        
        // 5. Dibujar la región seleccionada en el canvas
        ctx.drawImage(video, 
            captureX, captureY, 
            captureWidth, captureHeight, 
            0, 0, 
            captureWidth, captureHeight
        );
        
        // 5.1 Actualizar la vista previa de depuración
        updateDebugVisualization(video, captureX, captureY, captureWidth, captureHeight);
        
        // 6. Aplicar preprocesamiento para mejorar OCR
        const processedCanvas = preprocessForOCR(canvas);

        // 7. Configurar timeout para el procesamiento OCR
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Tiempo excedido (5s)")), 5000)
        );

        // 8. Procesar con Tesseract
        const ocrPromise = Tesseract.recognize(
            processedCanvas,
            'eng+spa',
            { 
                logger: m => console.log(m),
                tessedit_char_whitelist: '0123456789:-/. ',
                preserve_interword_spaces: 1
            }
        );

        const { data: { text } } = await Promise.race([ocrPromise, timeoutPromise]);
        
        // 9. Procesar resultados
        await procesarDVR(text);
        
    } catch (error) {
        console.error("Error en captura:", error);
        resultsDiv.innerHTML = `
            <div class="error">
                <p>Error al procesar: ${error.message}</p>
                <button onclick="captureAndProcess()" class="retry-btn">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    } finally {
        isProcessing = false;
        captureBtn.disabled = false;
    }
}

// Función optimizada para obtener hora oficial
async function obtenerHoraOficial() {
    let lastError = null;
    
    // Intentar con cada servidor hasta obtener una respuesta
    for (const server of TIME_SERVERS) {
        try {
            const response = await fetch(server, { cache: 'no-store' });
            if (!response.ok) continue;
            
            const data = await response.json();
            let date;
            
            if (server.includes('worldtimeapi')) {
                date = new Date(data.datetime);
            } else if (server.includes('timeapi.io')) {
                date = data.dateTime ? new Date(data.dateTime) : new Date(data.currentDateTime);
            }
            
            if (date && !isNaN(date.getTime())) {
                return {
                    horas: date.getHours(),
                    minutos: date.getMinutes(),
                    segundos: date.getSeconds(),
                    fuente: server
                };
            }
        } catch (error) {
            lastError = error;
            console.warn(`Error con servidor ${server}:`, error);
        }
    }
    
    console.error('Todos los servidores fallaron, usando hora local', lastError);
    const ahora = new Date();
    return {
        horas: ahora.getHours(),
        minutos: ahora.getMinutes(),
        segundos: ahora.getSeconds(),
        fuente: 'Hora local del dispositivo'
    };
}

// Función optimizada de procesamiento OCR
async function procesarImagenConOCR(canvas) {
  try {
    console.log('Iniciando reconocimiento OCR...');
    const { data: { text } } = await Tesseract.recognize(
      canvas,
      'eng+spa', // Idiomas
      { 
        logger: m => console.log(m), // Opcional para depuración
        tessedit_char_whitelist: '0123456789:-/. ',
        preserve_interword_spaces: '1'
      }
    );
    
    console.log('Texto reconocido:', text);
    if (!text || text.trim().length === 0) {
      throw new Error('No se detectó texto en la imagen');
    }
    
    return text.trim();
  } catch (error) {
    console.error('Error en OCR:', error);

// Función para extraer fecha y hora del texto OCR
function extraerFechaHoraDVR(texto) {
    // Patrones alternativos para diferentes formatos de fecha
    const patronesAlternativos = [
        // Formato estándar: dd-mm-aaaa hh:mm:ss
        {
            regex: /(\d{2})[-/.](\d{2})[-/.](\d{4})[\s-]+(\d{2}):(\d{2}):(\d{2})/,
            handler: (m) => ({
                dia: parseInt(m[1]),
                mes: parseInt(m[2]),
                año: parseInt(m[3]),
                horas: parseInt(m[4]),
                minutos: parseInt(m[5]),
                segundos: parseInt(m[6])
            })
        },
        // Formato americano: mm/dd/aaaa hh:mm:ss
        {
            regex: /(\d{2})[-/.](\d{2})[-/.](\d{4})[\s-]+(\d{2}):(\d{2}):(\d{2})/,
            handler: (m) => ({
                dia: parseInt(m[2]),
                mes: parseInt(m[1]),
                año: parseInt(m[3]),
                horas: parseInt(m[4]),
                minutos: parseInt(m[5]),
                segundos: parseInt(m[6])
            })
        },
        // Formato con día de semana: "Lun 15/06/2023 14:30:45"
        {
            regex: /(?:lun|mar|mi[eé]|jue|vie|s[áa]b|dom|mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?/i,
            handler: (texto) => {
                // Extraer la parte de fecha y hora después del día de la semana
                const match = texto.match(/\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?/i);
                if (!match) throw new Error("Formato de fecha/hora no reconocido");
                
                // Procesar la fecha y hora extraídas
                const partes = match[0].split(/[\s:./-]+/);
                return {
                    dia: parseInt(partes[0]),
                    mes: parseInt(partes[1]),
                    año: parseInt(partes[2].length === 2 ? '20' + partes[2] : partes[2]),
                    horas: parseInt(partes[3]),
                    minutos: parseInt(partes[4]),
                    segundos: partes[5] ? parseInt(partes[5]) : 0
                };
            }
        },
        // Formato solo hora: hh:mm:ss
        {
            regex: /(\d{1,2}):(\d{2})(?::(\d{2}))?/,
            handler: (m) => ({
                dia: 0,
                mes: 0,
                año: 0,
                horas: parseInt(m[1]),
                minutos: parseInt(m[2]),
                segundos: m[3] ? parseInt(m[3]) : 0
            })
        }
    ];

    // Intentar cada patrón hasta encontrar uno que coincida
    for (const patron of patronesAlternativos) {
        const match = texto.match(patron.regex);
        if (match) {
            try {
                const resultado = patron.handler(match.length > 1 ? match : texto);
                
                // Validar los valores extraídos
                if (resultado.horas < 0 || resultado.horas > 23 || 
                    resultado.minutos < 0 || resultado.minutos > 59 ||
                    resultado.segundos < 0 || resultado.segundos > 59) {
                    continue; // Intentar el siguiente patrón si los valores no son válidos
                }
                
                // Validar fecha si está presente
                if (resultado.año !== 0) {
                    const fecha = new Date(resultado.año, resultado.mes - 1, resultado.dia);
                    if (fecha.getDate() !== resultado.dia || 
                        fecha.getMonth() !== resultado.mes - 1 || 
                        fecha.getFullYear() !== resultado.año) {
                        continue; // Fecha inválida, intentar siguiente patrón
                    }
                }
                
                return resultado;
            } catch (e) {
                console.warn('Error al procesar formato de fecha:', e);
                continue; // Continuar con el siguiente patrón en caso de error
            }
        }
    }
    
    throw new Error("Formato de fecha/hora no reconocido. Formatos soportados:\n" +
                  "- dd-mm-aaaa hh:mm:ss\n" +
                  "- mm/dd/aaaa hh:mm:ss\n" +
                  "- [Día] dd/mm/aaaa hh:mm:ss\n" +
                  "- hh:mm:ss");
}

// ... (rest of the code remains the same)

// 1. Nueva función de cálculo de diferencia
function calcularDiferenciaCompleta(fechaDVR, fechaOficial) {
    // Convertir a objetos Date
    const dvrDate = new Date(
        fechaDVR.año, 
        fechaDVR.mes - 1, 
        fechaDVR.dia,
        fechaDVR.horas, 
        fechaDVR.minutos, 
        fechaDVR.segundos
    );
    
    const oficialDate = new Date(
        fechaOficial.año || new Date().getFullYear(),
        (fechaOficial.mes || new Date().getMonth() + 1) - 1,
        fechaOficial.dia || new Date().getDate(),
        fechaOficial.horas,
        fechaOficial.minutos,
        fechaOficial.segundos
    );

    // Calcular diferencia en milisegundos
    const diffMs = dvrDate - oficialDate;
    const absDiffMs = Math.abs(diffMs);

    // Descomponer diferencia
    const dias = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
    const horas = Math.floor((absDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((absDiffMs % (1000 * 60)) / 1000);

    return {
        diferenciaMs: diffMs,
        texto: `${diffMs >= 0 ? '+' : '-'} ${dias}d ${horas}h ${minutos}m ${segundos}s`,
        esExacto: diffMs === 0,
        componentes: { dias, horas, minutos, segundos }
    };
}

// Función para calcular diferencia de tiempo (compatibilidad con código existente)
function calcularDiferencia(horaDVR, horaOficial) {
    const resultado = calcularDiferenciaCompleta(horaDVR, horaOficial);
    return {
        ...resultado,
        delante: resultado.diferenciaMs > 0,
        atrasado: resultado.diferenciaMs < 0,
        segundos: Math.abs(Math.floor(resultado.diferenciaMs / 1000))
    };
}

// ... (rest of the code remains the same)

// Función para mostrar resultados
function mostrarResultados(horaDVR, horaOficial, diferencia, textoOCR) {
    currentResult = {
        date: new Date().toISOString(),
        horaDVR,
        horaOficial,
        diferencia,
        textoOCR
    };
    
    dvrHistory.addEntry(currentResult);
    
    let mensaje = "";
    if (diferencia.esExacto) {
        mensaje = "✅ Sincronización exacta";
    } else {
        const prefix = diferencia.diferenciaMs > 0 ? "⏩ Adelantado" : "⏪ Retrasado";
        mensaje = `${prefix} por ${diferencia.texto}`;
        
        // Mostrar advertencia si la diferencia es > 1 día
        if (Math.abs(diferencia.diferenciaMs) > 86400000) {
            mensaje += "<br><strong>¡Diferencia significativa!</strong>";
        }
    }
    
    resultsDiv.innerHTML = `
        <h3>Resultado de Verificación</h3>
        <p><strong>Fecha/Hora DVR:</strong> ${horaDVR.dia}/${horaDVR.mes}/${horaDVR.año} ${formatoHora(horaDVR)}</p>
        <p><strong>Hora Oficial:</strong> ${formatoHora(horaOficial)}</p>
        <div class="${diferencia.esExacto ? 'success' : 'error'}">${mensaje}</div>
        <div class="ocr-text">
            <p><small>Texto reconocido: "${textoOCR}"</small></p>
        </div>
        <div class="actions">
            <button onclick="shareResult()" class="share-btn">
                <i class="fas fa-share-alt"></i> Compartir
            </button>
            <button onclick="captureAndProcess()" class="refresh-btn">
                <i class="fas fa-sync-alt"></i> Verificar de nuevo
            </button>
        </div>
    `;
    
    // Mostrar historial
    mostrarHistorial();
}

// Función para mostrar historial
function mostrarHistorial() {
    const historyContainer = document.getElementById('history-container');
    const historySection = document.getElementById('history-section');
    const history = dvrHistory.getHistory();
    
    if (history.length > 0) {
        historySection.style.display = 'block';
        historyContainer.innerHTML = history.map((item, index) => `
            <div class="history-item">
                <strong>#${index + 1}</strong> - ${new Date(item.date).toLocaleString()}
                <div><i class="fas fa-video"></i> Hora DVR: ${formatoHora(item.horaDVR)}</div>
                <div><i class="fas fa-clock"></i> Diferencia: ${item.diferencia.texto}</div>
                <button onclick="shareResult(${index})" class="share-btn clipboard" style="margin-top: 5px; padding: 5px 8px;">
                    <i class="fas fa-share"></i> Compartir
                </button>
            </div>
        `).join('');
    } else {
        historySection.style.display = 'none';
    }
}

// Funciones para compartir resultados
async function shareResult(index = null) {
    const result = index !== null ? dvrHistory.getHistory()[index] : currentResult;
    if (!result) return;
    
    const textToShare = `Resultado Verificación DVR:\n` +
        `Hora DVR: ${formatoHora(result.horaDVR)}\n` +
        `Hora Oficial: ${formatoHora(result.horaOficial)}\n` +
        `Diferencia: ${result.diferencia.texto}\n` +
        `Fecha: ${new Date(result.date).toLocaleString()}`;
    
    try {
        if (navigator.share) {
            await navigator.share({
                title: 'Resultado Verificación DVR',
                text: textToShare
            });
        } else {
            // Fallback para navegadores sin Web Share API
            copyToClipboard(textToShare);
            showMessage('Resultado copiado al portapapeles!', 'success');
        }
    } catch (err) {
        console.log('Error al compartir:', err);
    }
}

function shareViaWhatsApp() {
    if (!currentResult) return;
    const text = `Resultado Verificación DVR:\n` +
        `Hora DVR: ${formatoHora(currentResult.horaDVR)}\n` +
        `Hora Oficial: ${formatoHora(currentResult.horaOficial)}\n` +
        `Diferencia: ${currentResult.diferencia.texto}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function shareViaEmail() {
    if (!currentResult) return;
    const subject = 'Resultado Verificación DVR';
    const body = `Resultado de la verificación:\n\n` +
        `Hora DVR: ${formatoHora(currentResult.horaDVR)}\n` +
        `Hora Oficial: ${formatoHora(currentResult.horaOficial)}\n` +
        `Diferencia: ${currentResult.diferencia.texto}\n\n` +
        `Fecha: ${new Date(currentResult.date).toLocaleString()}`;
    
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

// Verificar dependencias al cargar
function verificarDependencias() {
  const checks = {
    Tesseract: !!window.Tesseract,
    mediaDevices: !!navigator.mediaDevices,
    serviceWorker: 'serviceWorker' in navigator
  };

  // Mostrar advertencias para dependencias faltantes
  Object.entries(checks).forEach(([name, loaded]) => {
    if (!loaded) {
      console.warn(`Dependencia faltante: ${name}`);
      
      // Mostrar mensaje de error solo para Tesseract
      if (name === 'Tesseract') {
        showMessage(
          'Error: No se pudo cargar el procesador de texto. Por favor recarga la página.\n' +
          'Si el problema persiste, verifica tu conexión a internet.',
          'error'
        );
      }
    }
  });

  // Mostrar versión de Tesseract si está cargado
  if (checks.Tesseract) {
    console.log('Tesseract cargado correctamente, versión:', Tesseract.version);
  }
  
  return checks.Tesseract; // Solo requerimos Tesseract para iniciar
}

// Función para mejorar el contraste de la imagen
function mejorarContraste(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Aumentar contraste para displays de DVR
    for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        
        // Convertir a blanco y negro con alto contraste
        const avg = (r + g + b) / 3;
        const val = avg < 128 ? 0 : 255;
        
        imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = val;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

// Función para procesar el texto del DVR
async function procesarDVR() {
    try {
        // Obtener el canvas de la cámara
        const canvas = document.createElement('canvas');
        const video = document.querySelector('video');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Mejorar contraste para mejor reconocimiento OCR
        mejorarContraste(canvas);
        
        // Procesar la imagen con OCR
        const textoOCR = await procesarImagenConOCR(canvas);
        console.log("Texto reconocido por OCR:", textoOCR);
        
        // Extraer fecha y hora
        const fechaHora = extraerFechaHoraDVR(textoOCR);
        console.log("Fecha/hora reconocida:", fechaHora);
        
        // Obtener hora oficial
        const horaOficial = await obtenerHoraOficial();
        
        // Calcular diferencia
        const diferencia = calcularDiferencia(fechaHora, horaOficial);
        
        // Mostrar resultados
        mostrarResultados(fechaHora, horaOficial, diferencia, textoOCR);
        
    } catch (error) {
        console.error("Error al procesar:", error);
        document.getElementById("results").innerHTML = `
            <div class="error">
                <p>${error.message}</p>
                <p>Por favor, asegúrate de que la imagen del DVR esté clara y contenga la hora.</p>
                <button onclick="captureAndProcess()" class="retry-btn">
                    <i class="fas fa-redo"></i> Intentar de nuevo
                </button>
            </div>
        `;
    }
}

// Función para mostrar mensajes
function showMessage(message, type = 'info') {
    resultsDiv.className = type;
    resultsDiv.innerHTML = `<p><i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i> ${message}</p>`;
}

function updateLoaderMessage(message) {
    const loaderText = resultsDiv.querySelector('p');
    if (loaderText) {
        loaderText.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${message}`;
    }
}

// Función de captura mejorada para vista previa de depuración
function enhancedCapture() {
    try {
        const video = camera;
        const containerRect = cameraContainer.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();
        const selectionRect = rectangle.getBoundingClientRect();

        // Crear canvas para la vista previa
        const canvas = document.createElement('canvas');
        canvas.width = selectionRect.width;
        canvas.height = selectionRect.height;
        const ctx = canvas.getContext('2d');
        
        // Dibujar la región seleccionada
        ctx.drawImage(
            video,
            selectionRect.left - containerRect.left + cameraContainer.scrollLeft,
            selectionRect.top - containerRect.top + cameraContainer.scrollTop,
            selectionRect.width,
            selectionRect.height,
            0, 0,
            selectionRect.width,
            selectionRect.height
        );
        
        return canvas;
    } catch (error) {
        console.error('Error en enhancedCapture:', error);
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 30;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.fillText('Error', 10, 20);
        return canvas;
    }
}

// Configuración de la vista previa de depuración
let debugInitialized = false;
function initDebugPreview() {
    if (debugInitialized) return;
    
    // Crear contenedor de vista previa
    const debugPreview = document.createElement('div');
    debugPreview.id = 'debug-preview';
    debugPreview.style.position = 'fixed';
    debugPreview.style.bottom = '20px';
    debugPreview.style.right = '20px';
    debugPreview.style.width = '200px';
    debugPreview.style.height = '150px';
    debugPreview.style.border = '2px solid red';
    debugPreview.style.backgroundColor = 'black';
    debugPreview.style.overflow = 'hidden';
    debugPreview.style.zIndex = '10000';
    debugPreview.style.pointerEvents = 'none';
    
    // Estilo para las imágenes dentro del contenedor
    debugPreview.innerHTML = '<style>#debug-preview img { width: 100%; height: 100%; object-fit: contain; }</style>';
    
    document.body.appendChild(debugPreview);
    
    // Actualizar la vista previa periódicamente
    setInterval(() => {
        if (isProcessing) return; // No actualizar durante el procesamiento
        try {
            const capture = enhancedCapture();
            const img = new Image();
            img.src = capture.toDataURL('image/png');
            debugPreview.innerHTML = '';
            debugPreview.appendChild(img);
        } catch (e) {
            console.error('Error actualizando vista previa:', e);
        }
    }, 500);
    
    debugInitialized = true;
}

// Función para probar el reconocimiento de fechas
function testFechaCompleta() {
    const tests = [
        {
            input: "15-06-2023 14:30:00",
            expected: { dia: 15, mes: 6, año: 2023 }
        },
        {
            input: "02/12/2023-08:15:30",
            expected: { dia: 2, mes: 12, año: 2023 }
        },
        {
            input: "Lun 15/06/2023 14:30:00",
            expected: { dia: 15, mes: 6, año: 2023 }
        },
        {
            input: "12/31/2023 23:59:59",
            expected: { dia: 31, mes: 12, año: 2023 }
        }
    ];

    console.log("=== Iniciando pruebas de fecha ===");
    let exitosas = 0;
    
    tests.forEach((test, index) => {
        try {
            const result = extraerFechaHoraDVR(test.input);
            const fechaExtraida = { dia: result.dia, mes: result.mes, año: result.año };
            const esValida = JSON.stringify(fechaExtraida) === JSON.stringify(test.expected);
            
            if (esValida) {
                console.log(`✓ Prueba ${index + 1} PASADA: "${test.input}" -> ${JSON.stringify(fechaExtraida)}`);
                exitosas++;
            } else {
                console.error(`✗ Prueba ${index + 1} FALLIDA: "${test.input}"\n   Esperado: ${JSON.stringify(test.expected)}\n   Obtenido: ${JSON.stringify(fechaExtraida)}`);
            }
        } catch (error) {
            console.error(`✗ Prueba ${index + 1} ERROR: "${test.input}"\n   Error: ${error.message}`);
        }
    });
    
    console.log(`=== Pruebas completadas: ${exitosas}/${tests.length} exitosas ===`);
    return exitosas === tests.length;
}
}

// Función para mostrar la guía del usuario
function mostrarGuiaUsuario() {
    const guide = `
        <div id="capture-guide">
            <h3>Instrucciones para mejor captura:</h3>
            <ol>
                <li>Acerca el dispositivo hasta que la fecha/hora del DVR ocupe el rectángulo verde</li>
                <li>Asegúrate que se vea completo (ej: "01-01-2023 14:30:45")</li>
                <li>Mantén el dispositivo estable al capturar</li>
            </ol>
            <img src="ejemplo-correcto.jpg" alt="Ejemplo de posición correcta">
            <button onclick="document.getElementById('instructions').innerHTML = ''" class="help-btn" style="margin-top: 15px;">
                <i class="fas fa-times"></i> Cerrar
            </button>
        </div>
    `;
    document.getElementById('instructions').innerHTML = guide;
}

// Función de inicialización que se llama cuando Tesseract está listo
window.initApp = function() {
    // Mostrar mensaje de carga
    showMessage('Inicializando aplicación...', 'info');
    
    try {
        console.log('Tesseract está listo, versión:', Tesseract.version);
        
        // Configurar botón de ayuda
        const helpBtn = document.getElementById('help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', mostrarGuiaUsuario);
        }
        
        // Verificar dependencias
        if (!verificarDependencias()) {
            showMessage('Algunas funciones podrían no estar disponibles. Por favor recarga la página.', 'warning');
        }
        
        // Iniciar cámara
        initCamera();
        
        // Configurar eventos
        if (captureBtn) {
            captureBtn.addEventListener('click', captureAndProcess);
        }
        
        const clearHistoryBtn = document.getElementById('clear-history');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                dvrHistory.clear();
                mostrarHistorial();
            });
        }
        
        // Mostrar historial
        mostrarHistorial();
        
        // Registrar Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('SW registrado:', registration.scope);
                    registration.update();
                })
                .catch(error => {
                    console.error('Error al registrar el Service Worker:', error);
                });
        }
        
        showMessage('Aplicación lista para usar', 'success');
        
    } catch (error) {
        console.error('Error durante la inicialización:', error);
        showMessage('Ocurrió un error al inicializar la aplicación', 'error');
        
        const retryBtn = document.createElement('button');
        retryBtn.className = 'retry-btn';
        retryBtn.innerHTML = '<i class="fas fa-redo"></i> Reintentar';
        retryBtn.onclick = () => window.location.reload();
        (resultsDiv || document.body).appendChild(retryBtn);
    }
};

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar la visualización de depuración
    initDebugVisualization();
    // Iniciar la vista previa de depuración solo en desarrollo
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        initDebugPreview();
    }
    // Mostrar mensaje de carga inicial
    showMessage('Cargando motor de reconocimiento...', 'info');
    
    // Si Tesseract ya está cargado, inicializar la aplicación
    if (window.Tesseract) {
        console.log('Tesseract ya estaba cargado');
        window.initApp();
    }
});

// Hacer funciones disponibles globalmente para los botones HTML
window.shareViaWhatsApp = shareViaWhatsApp;
window.shareViaEmail = shareViaEmail;
window.shareResult = shareResult;