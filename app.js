// Configuración optimizada de Tesseract
const TESSERACT_CONFIG = {
    lang: 'eng+spa',
    oem: 1,  // OCR Engine Mode: LSTM only
    psm: 7,  // Page Segmentation Mode: Treat image as single text line
    tessedit_char_whitelist: '0123456789:-/. ',
    preserve_interword_spaces: '1',
    tessedit_ocr_engine_mode: '1',
    tessedit_pageseg_mode: '7',
    user_defined_dpi: '300'
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
const captureBtn = document.getElementById('capture-btn');
const resultsDiv = document.getElementById('results');
const rectangle = document.getElementById('selection-rectangle');
const cameraContainer = document.getElementById('camera-container');
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
    if (!checkCameraSupport()) {
        showMessage('Tu navegador no soporta acceso a la cámara o esta función está desactivada. Por favor usa Chrome, Firefox o Edge.', 'error');
        cameraPlaceholder.innerHTML = '<p><i class="fas fa-video-slash"></i> Navegador no compatible con la cámara</p>';
        return;
    }

    try {
        showMessage('Solicitando acceso a la cámara...', 'loading');
        cameraPlaceholder.innerHTML = '<div class="loader"></div><p>Esperando permisos de cámara...</p>';
        
        stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        
        camera.srcObject = stream;
        camera.style.display = 'block';
        rectangle.style.display = 'block';
        cameraPlaceholder.style.display = 'none';
        captureBtn.disabled = false;
        
        showMessage('Cámara lista. Enfoca la pantalla del DVR en el rectángulo verde.', 'info');
        
    } catch (err) {
        handleCameraError(err);
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
    
    try {
        // Mostrar loader
        resultsDiv.innerHTML = `
            <div style="text-align: center;">
                <div class="loader"></div>
                <p class="loading">Procesando imagen...</p>
            </div>
        `;
        
        captureBtn.disabled = true;
        
        // Crear canvas temporal
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Obtener dimensiones del rectángulo
        const rect = rectangle.getBoundingClientRect();
        const videoRect = camera.getBoundingClientRect();
        
        // Calcular posición relativa
        const scaleX = camera.videoWidth / videoRect.width;
        const scaleY = camera.videoHeight / videoRect.height;
        
        const x = (rect.left - videoRect.left) * scaleX;
        const y = (rect.top - videoRect.top) * scaleY;
        const width = rect.width * scaleX;
        const height = rect.height * scaleY;
        
        // Configurar canvas y dibujar la región de interés
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(camera, x, y, width, height, 0, 0, width, height);
        
        // Procesar OCR con Tesseract
        updateLoaderMessage('Analizando texto...');
        const text = await procesarImagenConOCR(canvas);
        
        // Extraer fecha/hora del texto reconocido
        updateLoaderMessage('Extrayendo hora...');
        const horaDVR = extraerFechaHoraDVR(text);
        if (!horaDVR) {
            throw new Error("No se pudo reconocer la hora en el DVR. Asegúrate de que la hora sea visible en el rectángulo verde.");
        }
        
        // Obtener hora oficial de Chile
        updateLoaderMessage('Obteniendo hora oficial...');
        const horaOficial = await obtenerHoraOficial();
        
        // Calcular diferencia
        const diferencia = calcularDiferencia(horaDVR, horaOficial);
        
        // Mostrar resultados
        mostrarResultados(horaDVR, horaOficial, diferencia, text);
        
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
        console.error('Error en captureAndProcess:', error);
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
    // Preprocesamiento de imagen para mejorar OCR
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Aumentar contraste
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = data[i + 1] = data[i + 2] = avg < 128 ? 0 : 255;
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Ejecutar OCR con configuración optimizada
    const { data: { text } } = await Tesseract.recognize(
        canvas,
        TESSERACT_CONFIG
    );
    
    return text;
}

// Función para extraer fecha y hora del texto OCR
function extraerFechaHoraDVR(texto) {
    // Eliminar ruido y normalizar
    const textoLimpio = texto.toLowerCase()
        .replace(/[^a-z0-9:\-\/\s]/g, '')  // Eliminar caracteres especiales
        .replace(/\s+/g, ' ')              // Normalizar espacios
        .trim();

    // Patrones para fecha y hora (incluyendo los nuevos formatos)
    const patterns = [
        // dd-mm-aaaa hh:mm:ss
        /(\d{2})[-\.](\d{2})[-\.](\d{4})\s+(\d{2}):(\d{2}):(\d{2})/,
        // dd/mm/aaaa hh:mm:ss
        /(\d{2})[\/\.](\d{2})[\/\.](\d{4})\s+(\d{2}):(\d{2}):(\d{2})/,
        // aaaa-mm-dd hh:mm:ss
        /(\d{4})[-\.](\d{2})[-\.](\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
        // aaaa-dd-mm hh:mm:ss
        /(\d{4})[-\.](\d{2})[-\.](\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
        // dd-mm-aaaa vie hh:mm:ss (con día de semana)
        /(\d{2})[-\.](\d{2})[-\.](\d{4})\s+(?:lun|mar|mié|jue|vie|sáb|dom)\s+(\d{2}):(\d{2}):(\d{2})/,
        // dd:mm:aaaa fri hh:mm:ss (con día en inglés)
        /(\d{2})[:\.](\d{2})[:\.](\d{4})\s+(?:mon|tue|wed|thu|fri|sat|sun)\s+(\d{2}):(\d{2}):(\d{2})/,
        // Formatos solo hora
        /(\d{2}):(\d{2}):(\d{2})/,
        /(\d{2}):(\d{2})/
    ];

    for (const pattern of patterns) {
        const match = textoLimpio.match(pattern);
        if (match) {
            // Determinar el formato encontrado
            let dia, mes, año, horas, minutos, segundos;
            
            if (match[4] && match[5] && match[6]) { // Tiene fecha y hora
                if (pattern === patterns[4] || pattern === patterns[5]) {
                    // Formatos con día de semana (vie/fri)
                    [, dia, mes, año, horas, minutos, segundos] = match;
                } else if (pattern === patterns[2] || pattern === patterns[3]) {
                    // Formatos con año primero
                    [, año, mes, dia, horas, minutos, segundos] = match;
                } else {
                    // Formatos normales
                    [, dia, mes, año, horas, minutos, segundos] = match;
                }
            } else if (match[1] && match[2] && match[3]) {
                // Solo hora con segundos
                [, horas, minutos, segundos] = match;
            } else {
                // Solo hora sin segundos
                [, horas, minutos] = match;
                segundos = 0;
            }

            // Validar valores
            dia = parseInt(dia || 0);
            mes = parseInt(mes || 0);
            año = parseInt(año || 0);
            horas = parseInt(horas);
            minutos = parseInt(minutos);
            segundos = parseInt(segundos || 0);

            // Ajustar año corto (ej: 23 -> 2023)
            if (año < 100) año += 2000;

            // Validación básica
            if (horas >= 0 && horas < 24 && 
                minutos >= 0 && minutos < 60 && 
                segundos >= 0 && segundos < 60) {
                
                const resultado = {
                    horas,
                    minutos,
                    segundos
                };

                // Solo incluir fecha si se detectó
                if (dia && mes && año) {
                    resultado.dia = dia;
                    resultado.mes = mes;
                    resultado.año = año;
                }

                return resultado;
            }
        }
    }
    
    return null;
}

function testFormats() {
    const tests = [
        {input: "01-01-2023 14:30:45", expected: {dia:1, mes:1, año:2023, horas:14, minutos:30, segundos:45}},
        {input: "01/01/2023 14:30:45", expected: {dia:1, mes:1, año:2023, horas:14, minutos:30, segundos:45}},
        {input: "2023-01-01 14:30:45", expected: {dia:1, mes:1, año:2023, horas:14, minutos:30, segundos:45}},
        {input: "2023-01-01 14:30:45", expected: {dia:1, mes:1, año:2023, horas:14, minutos:30, segundos:45}},
        {input: "01-01-2023 vie 14:30:45", expected: {dia:1, mes:1, año:2023, horas:14, minutos:30, segundos:45}},
        {input: "01:01:2023 fri 14:30:45", expected: {dia:1, mes:1, año:2023, horas:14, minutos:30, segundos:45}},
        {input: "14:30:45", expected: {horas:14, minutos:30, segundos:45}},
        {input: "14:30", expected: {horas:14, minutos:30, segundos:0}}
    ];

    tests.forEach(test => {
        const result = extraerFechaHoraDVR(test.input);
        console.assert(JSON.stringify(result) === JSON.stringify(test.expected), 
            `Falló: ${test.input}`, result);
    });
}

// Ejecutar pruebas al cargar
testFormats();

// Función para calcular diferencia de tiempo
function calcularDiferencia(horaDVR, horaOficial) {
    // Convertir a segundos para facilitar cálculo
    const segundosDVR = horaDVR.horas * 3600 + horaDVR.minutos * 60 + horaDVR.segundos;
    const segundosOficial = horaOficial.horas * 3600 + horaOficial.minutos * 60 + horaOficial.segundos;
    
    const diferenciaSegundos = segundosDVR - segundosOficial;
    
    // Convertir a formato legible
    const signo = diferenciaSegundos >= 0 ? '+' : '-';
    const absDiff = Math.abs(diferenciaSegundos);
    const horas = Math.floor(absDiff / 3600);
    const minutos = Math.floor((absDiff % 3600) / 60);
    const segundos = absDiff % 60;
    
    return {
        segundos: diferenciaSegundos,
        texto: `${signo} ${horas}h ${minutos}m ${segundos}s`,
        esExacto: diferenciaSegundos === 0
    };
}

// Función para formatear hora
function formatoHora(h) {
    return `${h.horas.toString().padStart(2, '0')}:${h.minutos.toString().padStart(2, '0')}:${h.segundos.toString().padStart(2, '0')}`;
}

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
        mensaje = "✅ El DVR está perfectamente sincronizado";
    } else if (diferencia.segundos > 0) {
        mensaje = `⏩ El DVR está ADELANTADO por ${diferencia.texto}`;
    } else {
        mensaje = `⏪ El DVR está RETRASADO por ${diferencia.texto}`;
    }
    
    resultsDiv.innerHTML = `
        <h3><i class="fas fa-check-circle"></i> Resultado:</h3>
        <p><strong><i class="fas fa-video"></i> Hora DVR:</strong> ${formatoHora(horaDVR)}</p>
        <p><strong><i class="fas fa-globe"></i> Hora Oficial:</strong> ${formatoHora(horaOficial)} <small>(${horaOficial.fuente.replace('https://', '')})</small></p>
        <p class="${diferencia.esExacto ? 'success' : 'error'}"><strong><i class="fas fa-clock"></i> Diferencia:</strong> ${mensaje}</p>
        
        <div class="share-buttons">
            <button class="share-btn whatsapp" onclick="shareViaWhatsApp()">
                <i class="fab fa-whatsapp"></i> WhatsApp
            </button>
            <button class="share-btn email" onclick="shareViaEmail()">
                <i class="fas fa-envelope"></i> Email
            </button>
            <button class="share-btn clipboard" onclick="shareResult()">
                <i class="fas fa-copy"></i> Copiar
            </button>
        </div>
    `;
    
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

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    captureBtn.addEventListener('click', captureAndProcess);
    document.getElementById('clear-history').addEventListener('click', () => {
        dvrHistory.clear();
        mostrarHistorial();
    });
    
    // Mostrar historial al cargar
    mostrarHistorial();
});

// Hacer funciones disponibles globalmente para los botones HTML
window.shareViaWhatsApp = shareViaWhatsApp;
window.shareViaEmail = shareViaEmail;
window.shareResult = shareResult;