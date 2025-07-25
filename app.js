const camera = document.getElementById('camera');
const canvas = document.getElementById('canvas-preview');
const ctx = canvas.getContext('2d');
const gallery = document.getElementById('history-grid');
const toast = document.getElementById('status-toast');
let cameraStream = null;

function videoListo(video) {
    return video && video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;
}

async function iniciarCamara() {
    try {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            camera.srcObject = null;
        }
        const constraints = {
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        };
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        camera.srcObject = cameraStream;
        await camera.play();
        console.log('Camera started');
    } catch (err) {
        console.error('Camera error:', err);
        mostrarEstado('error', 'No se pudo acceder a la cámara: ' + err.message);
    }
}

async function generarCaptura() {
    try {
        if (!videoListo(camera)) {
            throw new Error('Cámara no lista');
        }
        canvas.width = camera.videoWidth || 640;
        canvas.height = camera.videoHeight || 480;
        ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
        const imagen = canvas.toDataURL('image/jpeg', 0.9);
        const ahora = new Date();
        const captura = {
            timestamp: ahora.getTime(),
            coords: await getCoordenadas(),
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
        try {
            if (typeof Tesseract !== 'undefined') {
                const ocrResult = await extraerFechaConOCR(canvas);
                captura.ocrResult = ocrResult;
            } else {
                captura.ocrError = 'Tesseract.js no está disponible';
            }
        } catch (ocrError) {
            captura.ocrError = 'No se pudo procesar el texto: ' + ocrError.message;
        }
        await guardarCaptura(captura);
        cargarHistorial();
        mostrarEstado('success', '✅ Captura registrada');
    } catch (error) {
        console.error('Capture error:', error);
        mostrarEstado('error', 'Error al capturar: ' + error.message);
    }
}

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
        const { data: { text, confidence } } = await Tesseract.recognize(imagenElement, 'spa+eng');
        console.log('OCR text:', text);
        // Expresión regular para detectar múltiples formatos de fecha y hora
        const fechaHora = text.match(
            /(?:(\d{1,2})[-\/](?:\d{1,2}|(?:jan|ene|feb|mar|apr|abr|may|jun|jul|ago|aug|sep|oct|nov|dic|dec)[a-z]*)[-\/](\d{4}))(?:\s+(?:lun|mar|mié|jue|vie|sáb|dom|mon|tue|wed|thu|fri|sat|sun))?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i
        );
        if (fechaHora) {
            const [_, dia, anio, hora, minuto, segundo] = fechaHora;
            return { fechaHora: `${dia}-${text.match(/(jan|ene|feb|mar|apr|abr|may|jun|jul|ago|aug|sep|oct|nov|dic|dec)/i)?.[0] || text.match(/\d{1,2}/)?.[0]}-${anio} ${hora}:${minuto}${segundo ? `:${segundo}` : ''}`, confianza: confidence };
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
    setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

function cargarHistorial() {
    cargarCapturas(capturas => {
        gallery.innerHTML = capturas.length ? '' : '<p class="no-data">No hay capturas guardadas</p>';
        capturas.reverse().forEach(captura => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.dataset.timestamp = captura.timestamp;
            const img = document.createElement('img');
            img.src = captura.src;
            img.className = 'gallery-image';
            img.alt = `Captura del ${new Date(captura.timestamp).toLocaleString('es-CL')}`;
            img.onclick = () => mostrarImagenEnVisor(captura);
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.onclick = () => eliminarCapturaDB(captura.timestamp, () => cargarHistorial());
            item.append(img, deleteBtn);
            gallery.appendChild(item);
        });
    });
}

function mostrarImagenEnVisor(captura) {
    const visor = document.getElementById('visor-modal');
    const img = document.getElementById('visor-img');
    const info = document.getElementById('visor-info');
    const mapsBtn = document.getElementById('maps-btn');
    img.src = captura.src;
    info.innerHTML = `
        <p><strong>Fecha y hora:</strong> ${captura.fechaCompleta}</p>
        <p><strong>Hora oficial:</strong> ${captura.horaOficial}</p>
        <p><strong>Ubicación:</strong> ${captura.coords.lat}, ${captura.coords.lon}</p>
        ${captura.ocrResult ? `<p><strong>OCR:</strong> ${captura.ocrResult.fechaHora} (${captura.ocrResult.confianza}%)</p>` : ''}
        ${captura.ocrError ? `<p><strong>Error OCR:</strong> ${captura.ocrError}</p>` : ''}
    `;
    mapsBtn.style.display = captura.coords.lat !== '?' ? 'inline-block' : 'none';
    mapsBtn.onclick = () => window.open(`https://www.google.com/maps?q=${captura.coords.lat},${captura.coords.lon}`, '_blank');
    document.getElementById('descargar-img').onclick = () => {
        const link = document.createElement('a');
        link.href = captura.src;
        link.download = `captura-${captura.timestamp}.jpg`;
        link.click();
    };
    visor.style.display = 'flex';
    document.getElementById('cerrar-visor').onclick = () => {
        visor.style.display = 'none';
    };
}

document.addEventListener('DOMContentLoaded', () => {
    iniciarCamara();
    cargarHistorial();
    document.getElementById('capture-btn').addEventListener('click', generarCaptura);
    document.getElementById('capture-btn').addEventListener('touchstart', (e) => {
        e.preventDefault();
        generarCaptura();
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const id = tab.getAttribute('aria-controls');
            mostrarSeccion(id);
        });
    });
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(() => console.log('Service Worker registered'))
            .catch(err => console.error('Service Worker error:', err));
    }
});

async function mostrarSeccion(id) {
    const vistas = document.querySelectorAll('.vista');
    const tabs = document.querySelectorAll('.tab');
    vistas.forEach(vista => {
        vista.classList.toggle('visible', vista.id === id);
        vista.setAttribute('aria-hidden', vista.id !== id);
    });
    tabs.forEach(tab => {
        const isActive = tab.getAttribute('aria-controls') === id;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive);
    });
    document.getElementById('tab-indicator').style.transform = `translateX(${id === 'captura' ? 0 : 100}%)`;
    if (id === 'captura') {
        await iniciarCamara();
    } else {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            camera.srcObject = null;
        }
        cargarHistorial();
    }
}