/**
 * Módulo para manejar la funcionalidad de la cámara
 */

/**
 * Verifica si el video está listo para ser mostrado
 * @param {HTMLVideoElement} video - Elemento de video a verificar
 * @returns {boolean} - True si el video está listo, false en caso contrario
 */
export function videoListo(video) {
    return video && video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;
}

/**
 * Inicia la cámara del dispositivo
 * @param {HTMLVideoElement} videoElement - Elemento de video donde se mostrará la cámara
 * @returns {Promise<MediaStream>} - Stream de la cámara
 */
export async function iniciarCamara(videoElement) {
    try {
        // Detener cualquier stream existente
        if (videoElement.srcObject) {
            const tracks = videoElement.srcObject.getTracks();
            tracks.forEach(track => track.stop());
        }

        const constraints = {
            video: { 
                facingMode: 'environment', 
                width: { ideal: 1280 }, 
                height: { ideal: 720 } 
            },
            audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        
        // Esperar a que el video esté listo para reproducir
        await new Promise((resolve, reject) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play().then(resolve).catch(reject);
            };
            videoElement.onerror = reject;
        });

        console.log('Cámara iniciada correctamente');
        return stream;
    } catch (err) {
        console.error('Error al iniciar la cámara:', err);
        throw new Error('No se pudo acceder a la cámara: ' + err.message);
    }
}

/**
 * Detiene la transmisión de la cámara
 * @param {HTMLVideoElement} videoElement - Elemento de video que está utilizando la cámara
 */
export function detenerCamara(videoElement) {
    if (videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoElement.srcObject = null;
    }
}

/**
 * Toma una captura de la cámara y la devuelve como una URL de datos
 * @param {HTMLVideoElement} videoElement - Elemento de video de la cámara
 * @param {HTMLCanvasElement} canvasElement - Elemento canvas para dibujar la captura
 * @returns {string} - URL de datos de la imagen capturada
 */
export function capturarImagen(videoElement, canvasElement) {
    if (!videoListo(videoElement)) {
        throw new Error('El video no está listo para capturar');
    }

    // Ajustar el tamaño del canvas al del video
    canvasElement.width = videoElement.videoWidth || 640;
    canvasElement.height = videoElement.videoHeight || 480;
    
    // Dibujar el fotograma actual del video en el canvas
    const ctx = canvasElement.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // Devolver la imagen como URL de datos
    return canvasElement.toDataURL('image/jpeg', 0.9);
}
