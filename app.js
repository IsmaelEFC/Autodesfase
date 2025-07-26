// Configuración global de Tesseract
Tesseract.initialize({
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
  langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js-data@4',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm.js',
});

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
    
    try {
        // Mostrar loader
        resultsDiv.innerHTML = `
            <div style="text-align: center;">
                <div class="loader"></div>
                <p class="loading">Procesando imagen...</p>
            </div>
        `;
        
        captureBtn.disabled = true;
        
        // Verificar que Tesseract esté cargado
        if (typeof Tesseract === 'undefined') {
            throw new Error('Tesseract.js no se cargó correctamente. Por favor recarga la página.');
        }
        
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
        console.error('Error en captureAndProcess:', error);
        showMessage(`Error: ${error.message}`, 'error');
        
        // Reintentar automáticamente después de un segundo
        setTimeout(() => {
            if (confirm('Hubo un error al procesar. ¿Quieres intentarlo nuevamente?')) {
                captureAndProcess();
            }
        }, 1000);
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
      'eng+spa',
      {
        logger: m => console.log(m),
        tessedit_char_whitelist: '0123456789:-/. ',
        preserve_interword_spaces: '1'
      }
    );
    return text;
  } catch (error) {
    console.error('Error en OCR:', error);
    throw new Error('Error al procesar la imagen con OCR');
  }
}

// Función para extraer fecha y hora del texto OCR
function extraerFechaHoraDVR(texto) {
    // Limpieza mejorada del texto
    const textoLimpio = texto.trim()
        .replace(/[^a-z0-9:\-\/\s]/gi, '')
        .replace(/\s+/g, ' ');

    // Patrones prioritarios con estructura consistente
    const patterns = [
        // 1. Formato especial hora:año (01:01:2023 fri 14:30:45)
        {
            name: 'formato_especial',
            regex: /(\d{2}):(\d{2}):(\d{4})\s+[a-z]+\s+(\d{2}):(\d{2}):(\d{2})/i,
            parser: (match) => ({
                dia: 0,
                mes: 0,
                año: parseInt(match[3]),  // Año viene del tercer grupo
                horas: parseInt(match[4]),
                minutos: parseInt(match[5]),
                segundos: parseInt(match[6])
            })
        },
        // 2. Formatos con fecha completa (dd-mm-aaaa o aaaa-mm-dd)
        {
            name: 'fecha_completa',
            regex: /(\d{2,4})([-\.\/])(\d{2})\2(\d{2,4})\s+(?:[a-z]+\s+)?(\d{2}):(\d{2})(?::(\d{2}))?/i,
            parser: (match) => {
                // Determinar si es formato dd-mm-aaaa o aaaa-mm-dd
                const esFormatoISO = match[1].length === 4;
                return {
                    dia: esFormatoISO ? parseInt(match[4]) : parseInt(match[1]),
                    mes: parseInt(match[3]),
                    año: esFormatoISO ? parseInt(match[1]) : parseInt(match[4]),
                    horas: parseInt(match[5]),
                    minutos: parseInt(match[6]),
                    segundos: match[7] ? parseInt(match[7]) : 0
                };
            }
        },
        // 3. Formatos solo hora
        {
            name: 'hora_con_segundos',
            regex: /(?:^|\s)(\d{2}):(\d{2}):(\d{2})(?:\s|$)/i,
            parser: (match) => ({
                dia: 0,
                mes: 0,
                año: 0,
                horas: parseInt(match[1]),
                minutos: parseInt(match[2]),
                segundos: parseInt(match[3])
            })
        },
        {
            name: 'hora_sin_segundos',
            regex: /(?:^|\s)(\d{2}):(\d{2})(?:\s|$)(?!\d)/i,
            parser: (match) => ({
                dia: 0,
                mes: 0,
                año: 0,
                horas: parseInt(match[1]),
                minutos: parseInt(match[2]),
                segundos: 0
            })
        }
    ];

    for (const { name, regex, parser } of patterns) {
        const match = textoLimpio.match(regex);
        if (match) {
            try {
                const result = parser(match);
                
                // Validación estricta
                if (result.horas >= 0 && result.horas < 24 && 
                    result.minutos >= 0 && result.minutos < 60 && 
                    result.segundos >= 0 && result.segundos < 60) {
                    return result;
                }
            } catch (e) {
                console.warn(`Error parsing with ${name} pattern:`, e);
            }
        }
    }
    
    return null;
}

function testFormats() {
    const tests = [
        {
            input: "01:01:2023 fri 14:30:45",
            expected: { dia: 0, mes: 0, año: 2023, horas: 14, minutos: 30, segundos: 45 },
            description: "Formato especial hora:año con día en inglés"
        },
        {
            input: "2023-01-01 14:30:45",
            expected: { dia: 1, mes: 1, año: 2023, horas: 14, minutos: 30, segundos: 45 },
            description: "Formato ISO"
        },
        {
            input: "14:30",
            expected: { dia: 0, mes: 0, año: 0, horas: 14, minutos: 30, segundos: 0 },
            description: "Solo hora sin segundos"
        },
        { 
            input: "14:30:45", 
            expected: { dia: 0, mes: 0, año: 0, horas: 14, minutos: 30, segundos: 45 },
            description: "Solo hora con segundos"
        },
        { 
            input: "01-01-2023 vie 14:30:45", 
            expected: { dia: 1, mes: 1, año: 2023, horas: 14, minutos: 30, segundos: 45 },
            description: "Fecha con día de semana en español"
        }
    ];

    console.log("=== Iniciando pruebas definitivas ===");
    let allPassed = true;
    
    tests.forEach(test => {
        console.log(`\nTest: ${test.description}`);
        console.log(`Input: "${test.input}"`);
        
        const result = extraerFechaHoraDVR(test.input);
        const passed = JSON.stringify(result) === JSON.stringify(test.expected);
        
        if (!passed) {
            allPassed = false;
            console.error("❌ Falló");
            console.log("Obtenido:", result);
            console.log("Esperado:", test.expected);
        } else {
            console.log("✓ Pasó");
        }
    });

    console.log("\n=== Resumen Final ===");
    if (allPassed) {
        console.log("✅ ¡Todas las pruebas pasaron correctamente!");
    } else {
        console.error("⚠️ Algunas pruebas fallaron - Revisar implementación");
    }
}

function debugMatching(input) {
    const textoLimpio = input.trim()
        .replace(/[^a-z0-9:\-\/\s]/gi, '')
        .replace(/\s+/g, ' ');
    
    console.log(`Texto limpio: "${textoLimpio}"`);
    
    const patterns = [
        /(?:^|\s)(\d{2}):(\d{2})(?:\s|$)(?!\d)/,
        /(?:^|\s)(\d{2}):(\d{2}):(\d{2})(?:\s|$)/
    ];
    
    patterns.forEach((pattern, i) => {
        const match = textoLimpio.match(pattern);
        console.log(`Patrón ${i+1}:`, pattern.toString());
        console.log("Resultado match:", match);
        if (match) {
            console.log("Grupos capturados:", 
                Array.from(match).slice(1).map((v, i) => `Grupo ${i+1}: ${v}`));
        }
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

// Verificar dependencias al cargar
function verificarDependencias() {
  const dependencias = [
    'Tesseract',
    'caches',
    'serviceWorker',
    'mediaDevices'
  ];

  let todasCargadas = true;
  
  dependencias.forEach(dep => {
    if (!window[dep]) {
      todasCargadas = false;
      console.error(`Falta dependencia: ${dep}`);
      showMessage(`Error: El navegador no soporta ${dep} o no se cargó`, 'error');
    }
  });

  if (typeof Tesseract !== 'undefined') {
    console.log('Versión de Tesseract:', Tesseract.version);
  }
  
  return todasCargadas;
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
    // Verificar dependencias antes de continuar
    if (!verificarDependencias()) {
        showMessage('Algunas funciones podrían no estar disponibles. Por favor recarga la página.', 'warning');
    }
    
    initCamera();
    captureBtn.addEventListener('click', captureAndProcess);
    document.getElementById('clear-history').addEventListener('click', () => {
        dvrHistory.clear();
        mostrarHistorial();
    });
    
    // Mostrar historial al cargar
    mostrarHistorial();
    
    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('SW registrado:', registration.scope);
                    registration.update(); // Forzar actualización
                })
                .catch(err => console.error('Error SW:', err));
        });
    }
});

// Hacer funciones disponibles globalmente para los botones HTML
window.shareViaWhatsApp = shareViaWhatsApp;
window.shareViaEmail = shareViaEmail;
window.shareResult = shareResult;