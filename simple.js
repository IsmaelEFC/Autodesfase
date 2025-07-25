// Elementos del DOM
const camera = document.getElementById('camera');
const captureBtn = document.getElementById('capture-btn');
const resultsDiv = document.getElementById('results');
const rectangle = document.getElementById('selection-rectangle');

// Variables de estado
let stream = null;

// Inicializar la cámara al cargar la página
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        camera.srcObject = stream;
        showMessage('Cámara lista. Enfoca la pantalla del DVR en el rectángulo verde.', 'info');
    } catch (err) {
        showMessage('Error al acceder a la cámara: ' + err.message, 'error');
        console.error('Error al acceder a la cámara:', err);
    }
}

// Función para capturar la imagen dentro del rectángulo
async function captureAndProcess() {
    if (!stream) {
        showMessage('La cámara no está lista.', 'error');
        return;
    }

    try {
        showMessage('Procesando...', 'loading');
        
        // 1. Capturar la imagen
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Tamaño del canvas igual al video
        canvas.width = camera.videoWidth;
        canvas.height = camera.videoHeight;
        
        // Dibujar el frame actual del video en el canvas
        ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
        
        // 2. Obtener las coordenadas del rectángulo de selección
        const rect = rectangle.getBoundingClientRect();
        const containerRect = document.getElementById('selection-overlay').getBoundingClientRect();
        
        // Calcular la posición relativa al video
        const scaleX = canvas.width / containerRect.width;
        const scaleY = canvas.height / containerRect.height;
        
        const x = (rect.left - containerRect.left) * scaleX;
        const y = (rect.top - containerRect.top) * scaleY;
        const width = rect.width * scaleX;
        const height = rect.height * scaleY;
        
        // 3. Recortar la imagen al área del rectángulo
        const imageData = ctx.getImageData(x, y, width, height);
        
        // Crear un nuevo canvas para el recorte
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = width;
        croppedCanvas.height = height;
        const croppedCtx = croppedCanvas.getContext('2d');
        croppedCtx.putImageData(imageData, 0, 0);
        
        // 4. Procesar con OCR
        showMessage('Leyendo texto...', 'loading');
        
        // Usar Tesseract.js para el reconocimiento de texto
        const { data: { text } } = await Tesseract.recognize(
            croppedCanvas.toDataURL('image/jpeg', 0.9),
            'eng+spa', // Idiomas: inglés y español
            { 
                logger: m => console.log(m) 
            }
        );
        
        // 5. Extraer fecha y hora del texto
        const dateTime = extractDateTime(text);
        if (!dateTime) {
            showMessage('No se pudo detectar una fecha/hora válida en la imagen.', 'error');
            return;
        }
        
        // 6. Obtener la hora oficial
        showMessage('Obteniendo hora oficial...', 'loading');
        const officialTime = await getOfficialTime();
        
        if (!officialTime) {
            showMessage('No se pudo obtener la hora oficial. Verifica tu conexión a internet.', 'error');
            return;
        }
        
        // 7. Calcular la diferencia
        const timeDiff = calculateTimeDifference(dateTime, officialTime);
        
        // 8. Mostrar resultados
        showResults({
            detectedText: text,
            detectedDateTime: dateTime,
            officialTime: officialTime,
            timeDifference: timeDiff
        });
        
    } catch (err) {
        console.error('Error al procesar la imagen:', err);
        showMessage('Error al procesar la imagen: ' + err.message, 'error');
    }
}

// Función para extraer fecha y hora del texto
function extractDateTime(text) {
    // Expresiones regulares para detectar formatos de fecha/hora comunes
    const dateTimePatterns = [
        // Formato: 25/07/2023 14:30:45
        /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4} \d{1,2}:\d{2}(?::\d{2})?)/,
        // Formato: 2023-07-25 14:30:45
        /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2} \d{1,2}:\d{2}(?::\d{2})?)/,
        // Formato: 14:30:45 25-07-2023
        /(\d{1,2}:\d{2}(?::\d{2})?[ \-]\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
        // Solo hora: 14:30:45 o 2:30 PM
        /(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?)/i
    ];
    
    for (const pattern of dateTimePatterns) {
        const match = text.match(pattern);
        if (match) {
            // Intentar parsear la fecha/hora
            const date = new Date(match[0].replace(/[\/\-\.]/g, '/'));
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
    }
    
    return null;
}

// Función para obtener la hora oficial
async function getOfficialTime() {
    try {
        // Usar un endpoint CORS proxy para evitar problemas de CORS
        const response = await fetch('https://cors-anywhere.herokuapp.com/http://www.horaoficial.cl/reloj_servidor.php', {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (!response.ok) {
            throw new Error('Error al obtener la hora oficial');
        }
        
        // La respuesta es un string de fecha/hora en formato ISO 8601
        const dateTimeStr = await response.text();
        return new Date(dateTimeStr);
        
    } catch (err) {
        console.error('Error al obtener la hora oficial:', err);
        // Si falla, devolver la hora actual como respaldo
        return new Date();
    }
}

// Función para calcular la diferencia de tiempo
function calculateTimeDifference(detectedTime, officialTime) {
    const diffMs = detectedTime - officialTime;
    const diffSeconds = Math.round(diffMs / 1000);
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    
    return {
        milliseconds: diffMs,
        seconds: diffSeconds,
        minutes: diffMinutes,
        isAhead: diffMs > 0,
        isOnTime: Math.abs(diffMs) < 1000, // Considerar a tiempo si la diferencia es menor a 1 segundo
        formatted: formatTimeDifference(diffMs)
    };
}

// Función para formatear la diferencia de tiempo
function formatTimeDifference(ms) {
    const absMs = Math.abs(ms);
    const seconds = Math.floor(absMs / 1000) % 60;
    const minutes = Math.floor(absMs / (1000 * 60)) % 60;
    const hours = Math.floor(absMs / (1000 * 60 * 60));
    
    let result = [];
    if (hours > 0) result.push(`${hours} hora${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) result.push(`${minutes} minuto${minutes !== 1 ? 's' : ''}`);
    if (seconds > 0 || result.length === 0) result.push(`${seconds} segundo${seconds !== 1 ? 's' : ''}`);
    
    const diffStr = result.join(' y ');
    return ms >= 0 ? `${diffStr} adelantado` : `${diffStr} atrasado`;
}

// Función para mostrar los resultados
function showResults(data) {
    const { detectedText, detectedDateTime, officialTime, timeDifference } = data;
    
    const formattedDetected = detectedDateTime.toLocaleString('es-CL');
    const formattedOfficial = officialTime.toLocaleString('es-CL');
    
    let html = `
        <h3>Resultado del Análisis</h3>
        <p><strong>Texto detectado:</strong> ${detectedText.replace(/\n/g, '<br>')}</p>
        <p><strong>Fecha/Hora detectada:</strong> ${formattedDetected}</p>
        <p><strong>Hora oficial:</strong> ${formattedOfficial}</p>
        <p class="${timeDifference.isOnTime ? 'success' : 'error'}">
            <strong>Diferencia:</strong> ${timeDifference.formatted}
        </p>
    `;
    
    resultsDiv.innerHTML = html;
}

// Función para mostrar mensajes de estado
function showMessage(message, type = 'info') {
    resultsDiv.className = type;
    resultsDiv.innerHTML = `<p>${message}</p>`;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar la cámara
    initCamera();
    
    // Configurar el botón de captura
    captureBtn.addEventListener('click', captureAndProcess);
    
    // Permitir recargar la página si hay un error
    resultsDiv.addEventListener('click', (e) => {
        if (resultsDiv.classList.contains('error')) {
            window.location.reload();
        }
    });
});
