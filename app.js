const camera = document.getElementById('camera');
const canvas = document.getElementById('canvas-preview');
const ctx = canvas.getContext('2d');
const gallery = document.getElementById('history-grid');
const toast = document.getElementById('status-toast');

// Variables para el rectángulo de selección
let selectionRect = document.getElementById('selection-rectangle');
let selectionOverlay = document.getElementById('selection-overlay');
let cameraContainer = document.getElementById('camera-container');

// Inicializar variables globales
let isSelecting = false; // Estado del modo selección

// Tamaño fijo del área de selección (relativo al video)
const SELECTION_WIDTH_RATIO = 0.8; // 80% del ancho del contenedor
const SELECTION_ASPECT_RATIO = 16/9; // Relación de aspecto del área de selección

let coordenadas = null;

// Inicializar cámara
let cameraStream = null;

// Función para verificar si estamos en un dispositivo móvil
function esDispositivoMovil() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Función para verificar si estamos en un dispositivo móvil
function esDispositivoMovil() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Función para verificar si el video está listo
function videoListo(video) {
  return video && 
         video.readyState >= video.HAVE_CURRENT_DATA && 
         video.videoWidth > 0 && 
         video.videoHeight > 0;
}

// Función para iniciar la cámara
async function iniciarCamara() {
  console.log('Iniciando cámara...');
  try {
    // Detener la cámara actual si existe
    await detenerCamara();
    
    // Limpiar cualquier error previo
    const statusToast = document.getElementById('status-toast');
    if (statusToast) {
      statusToast.textContent = '';
      statusToast.className = '';
    }
    
    // Verificar si el navegador soporta getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Tu navegador no soporta el acceso a la cámara');
    }
    
    // Verificar si estamos en HTTPS o localhost (requerido para la cámara en móviles)
    if (esDispositivoMovil() && window.location.protocol !== 'https:' && 
        window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const mensaje = 'Para usar la cámara en móviles, la aplicación debe cargarse a través de HTTPS o localhost';
      console.warn(mensaje);
      mostrarEstado('advertencia', mensaje);
    }
    
    // Configuración de la cámara con valores más compatibles
    const constraints = {
      video: {
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        facingMode: { ideal: 'environment' },
        frameRate: { ideal: 24, max: 30 },
        aspectRatio: { ideal: 16/9 }
      },
      audio: false
    };
    
    // Configuración adicional para iOS
    if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
      // iOS necesita un enfoque diferente - usar solo configuraciones básicas
      constraints.video = {
        width: { min: 640, ideal: 1280 },
        height: { min: 480, ideal: 720 },
        facingMode: { ideal: 'environment' },
        frameRate: { ideal: 24 }
      };
      
      // Aplicar configuración específica para iOS 15+
      if (navigator.userAgent.match(/OS 1[5-9]|OS [2-9]\d/)) {
        constraints.video = {
          ...constraints.video,
          advanced: [
            { width: 1280, height: 720 },
            { width: 1920, height: 1080 },
            { width: 640, height: 480 }
          ]
        };
      }
    }
    
    // Intentar con la configuración ideal primero
    try {
      console.log('Intentando iniciar cámara con configuración:', JSON.stringify(constraints));
      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Cámara trasera iniciada con éxito');
      
      // Verificar si el stream tiene pistas de video
      const videoTracks = cameraStream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('No se encontraron pistas de video en el stream');
      }
      
      // Configurar el elemento de video
      camera.srcObject = cameraStream;
      await new Promise((resolve) => {
        camera.onloadedmetadata = () => {
          console.log('Metadatos de video cargados:', {
            videoWidth: camera.videoWidth,
            videoHeight: camera.videoHeight,
            readyState: camera.readyState
          });
          resolve();
        };
      });
      
      // Esperar a que el video esté realmente listo
      await new Promise((resolve) => {
        if (videoListo(camera)) {
          resolve();
        } else {
          const checkVideo = setInterval(() => {
            if (videoListo(camera)) {
              clearInterval(checkVideo);
              resolve();
            }
          }, 100);
        }
      });
      
      console.log('Reproducción de cámara iniciada');
      return;
      
    } catch (e) {
      console.error('Error al iniciar la cámara:', e);
      
      // Si falla, intentar con configuración más básica
      console.warn('Intentando con configuración alternativa...');
      constraints.video = {
        width: { min: 320, ideal: 640 },
        height: { min: 240, ideal: 480 },
        facingMode: { ideal: 'environment' }
      };
      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Cámara frontal iniciada con éxito');
    }
    
    if (camera) {
      camera.srcObject = cameraStream;
      
      // Esperar a que la cámara esté lista
      return new Promise((resolve) => {
        const onLoaded = () => {
          camera.removeEventListener('loadedmetadata', onLoaded);
          console.log('Metadatos de la cámara cargados');
          camera.play()
            .then(() => {
              console.log('Reproducción de cámara iniciada');
              resolve();
            })
            .catch(err => {
              console.error('Error al reproducir la cámara:', err);
              mostrarEstado('error', 'Error al iniciar la cámara: ' + err.message);
              resolve(); // Resolvemos igual para no bloquear la interfaz
            });
        };
        
        camera.addEventListener('loadedmetadata', onLoaded);
        
        // Timeout por si la cámara tarda demasiado en cargar
        setTimeout(() => {
          camera.removeEventListener('loadedmetadata', onLoaded);
          resolve(); // Resolvemos para no bloquear la interfaz
        }, 5000);
      });
    }
  } catch (err) {
    console.error('Error al acceder a la cámara:', err);
    mostrarEstado('error', 'No se pudo acceder a la cámara: ' + (err.message || 'Error desconocido'));
    return Promise.reject(err);
  }
}

// Función para detener la cámara
async function detenerCamara() {
  console.log('Deteniendo cámara...');
  
  // Detener todos los tracks de la cámara
  if (cameraStream) {
    try {
      const tracks = cameraStream.getTracks();
      console.log(`Deteniendo ${tracks.length} pistas de la cámara`);
      
      tracks.forEach(track => {
        try {
          track.stop();
          console.log('Pista detenida:', track.kind);
        } catch (trackError) {
          console.warn('Error al detener pista de la cámara:', trackError);
        }
      });
      
      cameraStream = null;
    } catch (err) {
      console.error('Error al detener la cámara:', err);
      return Promise.reject(err);
    }
  }
  
  // Limpiar el elemento de video
  if (camera) {
    try {
      // Pausar el video
      if (!camera.paused) {
        camera.pause();
      }
      
      // Limpiar srcObject de manera segura
      if (camera.srcObject) {
        camera.srcObject = null;
      }
      
      // Limpiar atributos de fuente
      if (camera.hasAttribute('src')) {
        camera.removeAttribute('src');
      }
      
      // Limpiar cualquier buffer de video
      if (camera.load) {
        camera.load();
      }
      
      console.log('Elemento de cámara limpiado correctamente');
    } catch (err) {
      console.error('Error al limpiar el elemento de cámara:', err);
      // Continuamos a pesar del error
    }
  }
  
  // Forzar recolección de basura (sugerencia para el motor de JavaScript)
  if (window.gc) {
    window.gc();
  }
  
  console.log('Cámara detenida correctamente');
  return Promise.resolve();
}

// Iniciar cámara al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  // Esperar a que todo el DOM esté listo
  setTimeout(() => {
    iniciarCamara()
      .then(() => {
        console.log('Cámara iniciada correctamente');
        initSelectionHandlers();
      })
      .catch(error => {
        console.error('Error al iniciar la cámara:', error);
        mostrarEstado('error', 'Error al iniciar la cámara: ' + error.message);
      });
  }, 500); // Pequeño retraso para asegurar que todo esté listo
});

// Función para activar/desactivar el modo de selección
function toggleSelectionMode() {
  isSelecting = !isSelecting;
  const selectionBtn = document.getElementById('toggle-selection-btn');
  
  if (selectionBtn) {
    selectionBtn.setAttribute('aria-pressed', isSelecting);
    selectionBtn.classList.toggle('active', isSelecting);
  }
  
  // Mostrar/ocultar el área de selección
  if (selectionOverlay) {
    selectionOverlay.style.display = isSelecting ? 'block' : 'none';
  }
  
  mostrarEstado('info', `Modo selección ${isSelecting ? 'activado' : 'desactivado'}`);
}

// Inicializar manejadores de eventos para la selección
function initSelectionHandlers() {
  // Obtener referencia al botón de selección
  const toggleSelectionBtn = document.getElementById('toggle-selection-btn');
  
  // Verificar que el botón existe antes de agregar el event listener
  if (toggleSelectionBtn) {
    toggleSelectionBtn.addEventListener('click', toggleSelectionMode);
    // Inicializar estado del botón
    toggleSelectionBtn.setAttribute('aria-pressed', 'false');
  } else {
    console.warn('No se encontró el botón de selección');
  }
  
  // Verificar que el overlay de selección existe
  if (!selectionOverlay) {
    console.error('No se encontró el elemento de selección');
    return;
  }
  
  // Manejadores para el rectángulo de selección
  selectionOverlay.addEventListener('mousedown', startSelection);
  selectionOverlay.addEventListener('touchstart', handleTouchStart, { passive: false });
  
  // Para móviles: prevenir el desplazamiento al tocar la pantalla
  selectionOverlay.addEventListener('touchmove', handleTouchMove, { passive: false });
  selectionOverlay.addEventListener('touchend', handleTouchEnd);
}

// Activar/desactivar el modo de selección
function toggleSelectionMode() {
  isSelecting = !isSelecting;
  
  if (isSelecting) {
    selectionOverlay.classList.add('active');
    toggleSelectionBtn.classList.add('active');
    toggleSelectionBtn.innerHTML = '<span class="btn-icon">✖️</span> Cancelar selección';
    document.getElementById('selection-instructions').style.display = 'block';
    mostrarEstado('info', 'Arrastra para seleccionar el área de la hora');
  } else {
    resetSelection();
  }
}

// Iniciar selección
function startSelection(e) {
  if (!isSelecting) return;
  
  e.preventDefault();
  
  const rect = camera.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;
  
  // Asegurar que las coordenadas estén dentro de los límites del video
  startX = Math.max(0, Math.min(startX, rect.width));
  startY = Math.max(0, Math.min(startY, rect.height));
  
  selectionRect.style.left = `${startX}px`;
  selectionRect.style.top = `${startY}px`;
  selectionRect.style.width = '0';
  selectionRect.style.height = '0';
  selectionRect.classList.add('visible');
  
  document.addEventListener('mousemove', updateSelection);
  document.addEventListener('mouseup', endSelection);
}

// Actualizar selección mientras se arrastra
function updateSelection(e) {
  if (!isSelecting) return;
  
  const rect = camera.getBoundingClientRect();
  let currentX = e.clientX - rect.left;
  let currentY = e.clientY - rect.top;
  
  // Asegurar que las coordenadas estén dentro de los límites del video
  currentX = Math.max(0, Math.min(currentX, rect.width));
  currentY = Math.max(0, Math.min(currentY, rect.height));
  
  // Calcular dimensiones del rectángulo
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  
  // Actualizar estilos del rectángulo
  selectionRect.style.left = `${left}px`;
  selectionRect.style.top = `${top}px`;
  selectionRect.style.width = `${width}px`;
  selectionRect.style.height = `${height}px`;
}

// Finalizar selección
function endSelection() {
  if (!isSelecting) return;
  
  document.removeEventListener('mousemove', updateSelection);
  document.removeEventListener('mouseup', endSelection);
  
  // Verificar si el área seleccionada es lo suficientemente grande
  const width = parseInt(selectionRect.style.width);
  const height = parseInt(selectionRect.style.height);
  
  if (width < 20 || height < 20) {
    mostrarEstado('info', 'Selecciona un área más grande para mejorar la precisión del OCR');
    resetSelection();
  } else {
    mostrarEstado('success', 'Área seleccionada. Ahora puedes capturar la imagen.');
  }
}

// Manejadores para pantallas táctiles
function handleTouchStart(e) {
  if (!isSelecting) return;
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousedown', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  startSelection(mouseEvent);
}

function handleTouchMove(e) {
  if (!isSelecting) return;
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousemove', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  updateSelection(mouseEvent);
}

function handleTouchEnd() {
  if (!isSelecting) return;
  endSelection();
}

// Reiniciar selección
function resetSelection() {
  isSelecting = false;
  selectionOverlay.classList.remove('active');
  selectionRect.classList.remove('visible');
  selectionRect.style.width = '0';
  selectionRect.style.height = '0';
  toggleSelectionBtn.classList.remove('active');
  toggleSelectionBtn.innerHTML = '<span class="btn-icon">🖱️</span> Seleccionar área';
  document.getElementById('selection-instructions').style.display = 'none';
}

// Captura + coordenadas + hora oficial
document.getElementById('capture-btn').addEventListener('click', () => {
  navigator.geolocation.getCurrentPosition(pos => {
    coordenadas = {
      lat: pos.coords.latitude.toFixed(6),
      lon: pos.coords.longitude.toFixed(6)
    };
    generarCaptura();
  }, () => {
    coordenadas = { lat: "?", lon: "?" };
    generarCaptura();
  });
});

// Función para verificar si el video está listo
function videoListo(video) {
  return video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0;
}

// Función para verificar si el video está listo
function videoListo(video) {
  return video && 
         video.readyState >= video.HAVE_CURRENT_DATA && 
         video.videoWidth > 0 && 
         video.videoHeight > 0;
}

// Variables para el control de captura
let isCapturing = false;

// Función para capturar un frame del video con reintentos
async function captureFrame(video, maxAttempts = 3, delay = 100) {
  let attempts = 0;
  let lastError = null;
  
  while (attempts < maxAttempts) {
    try {
      // Verificar que el video tenga dimensiones válidas
      if (!video.videoWidth || !video.videoHeight) {
        throw new Error('Dimensiones de video no válidas');
      }
      
      // Crear un nuevo canvas para cada intento
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      // Dibujar el frame actual
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Verificar que el canvas tenga contenido
      const imageData = ctx.getImageData(0, 0, 1, 1).data;
      if (imageData[3] === 0) { // Si el canal alpha es 0, la imagen está vacía
        throw new Error('La imagen capturada está vacía');
      }
      
      // Verificar que el canvas tenga dimensiones válidas
      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error('Dimensiones del canvas no válidas');
      }
      
      // Si llegamos aquí, la captura fue exitosa
      console.log('Captura exitosa en el intento', attempts + 1);
      return canvas.toDataURL('image/jpeg', 0.9);
      
    } catch (error) {
      console.warn(`Intento ${attempts + 1} fallido:`, error.message);
      lastError = error;
      attempts++;
      
      // Esperar antes de reintentar
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // Si llegamos aquí, todos los intentos fallaron
  throw new Error(`No se pudo capturar el frame después de ${maxAttempts} intentos: ${lastError?.message || 'Error desconocido'}`);
}

async function generarCaptura() {
  // Evitar múltiples capturas simultáneas
  if (isCapturing) {
    console.log('Ya hay una captura en progreso');
    return;
  }
  
  isCapturing = true;
  let capturedFrame = null;
  
  try {
    console.log('Iniciando generación de captura...');
    
    // Verificar que la cámara esté disponible
    if (!camera || !camera.srcObject) {
      throw new Error('La cámara no está disponible');
    }
    
    // Esperar a que el video esté listo
    if (camera.readyState < 2) { // MENOS que HAVE_CURRENT_DATA
      await new Promise((resolve) => {
        const onLoadedData = () => {
          camera.removeEventListener('loadeddata', onLoadedData);
          resolve();
        };
        camera.addEventListener('loadeddata', onLoadedData);
      });
    }
    
    // Verificar dimensiones del video
    if (camera.videoWidth === 0 || camera.videoHeight === 0) {
      throw new Error('Las dimensiones del video no son válidas');
    }
    
    // Capturar el frame con reintentos
    console.log('Iniciando captura de frame...');
    capturedFrame = await captureFrame(camera, 5, 200); // 5 intentos, 200ms entre intentos
    
    // Verificar que la captura sea válida
    if (!capturedFrame || capturedFrame.startsWith('data:,') || capturedFrame.length < 100) {
      throw new Error('La captura no generó una imagen válida');
    }
    
    // Crear una imagen para verificar la captura
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => {
        console.log('Imagen capturada con dimensiones:', img.width, 'x', img.height);
        if (img.width === 0 || img.height === 0) {
          reject(new Error('La imagen capturada tiene dimensiones inválidas'));
        } else {
          resolve();
        }
      };
      img.onerror = () => reject(new Error('Error al cargar la imagen capturada'));
      img.src = capturedFrame;
    });
    
    console.log('Captura verificada correctamente');

    // Función para esperar a que el video esté listo
    const waitForVideoReady = async (maxAttempts = 10, delay = 200) => {
      for (let i = 0; i < maxAttempts; i++) {
        if (videoListo(camera)) {
          console.log(`Video listo en el intento ${i + 1}`);
          return true;
        }
        console.log(`Esperando a que el video esté listo... (intento ${i + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return false;
    };

    // Esperar a que el video esté listo
    console.log('Verificando estado del video...');
    const isVideoReady = await waitForVideoReady();
    
    if (!isVideoReady) {
      console.warn('El video no está listo después de varios intentos, intentando continuar...');
      
      // Intentar forzar dimensiones si son cero
      if (camera.videoWidth === 0 || camera.videoHeight === 0) {
        console.warn('Usando dimensiones del contenedor como respaldo');
        camera.videoWidth = camera.offsetWidth || 640;
        camera.videoHeight = camera.offsetHeight || 480;
      }
      
      // Verificar nuevamente después de forzar dimensiones
      if (camera.videoWidth === 0 || camera.videoHeight === 0) {
        throw new Error('No se pudieron determinar las dimensiones del video');
      }
    }

    // Obtener dimensiones del video con múltiples fuentes de respaldo
    let videoWidth = camera.videoWidth || camera.offsetWidth || 640;
    let videoHeight = camera.videoHeight || camera.offsetHeight || 480;
    
    // Asegurar dimensiones válidas
    videoWidth = Math.max(100, Math.min(videoWidth, 4096)); // Máximo 4K para evitar problemas de rendimiento
    videoHeight = Math.max(100, Math.min(videoHeight, 2160));
    
    console.log(`Dimensiones del video: ${videoWidth}x${videoHeight}`);
    
    // Crear un nuevo canvas temporal
    const tempCanvas = document.createElement('canvas');
    
    // Asegurarse de que las dimensiones sean números enteros
    tempCanvas.width = Math.floor(videoWidth);
    tempCanvas.height = Math.floor(videoHeight);
    
    // Obtener el contexto 2D con willReadFrequently para mejor rendimiento
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) {
      throw new Error('No se pudo obtener el contexto 2D temporal');
    }
    
    // Configurar el canvas principal
    canvas.width = Math.floor(videoWidth);
    canvas.height = Math.floor(videoHeight);
    
    // Obtener el contexto del canvas principal
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('No se pudo obtener el contexto 2D del canvas principal');
    }
    
    // Dibujar el frame actual
    try {
      console.log('Dibujando frame...');
      
      // 1. Verificar que las dimensiones sean válidas
      if (tempCanvas.width <= 0 || tempCanvas.height <= 0) {
        throw new Error(`Dimensiones inválidas del canvas temporal: ${tempCanvas.width}x${tempCanvas.height}`);
      }
      
      if (canvas.width <= 0 || canvas.height <= 0) {
        throw new Error(`Dimensiones inválidas del canvas principal: ${canvas.width}x${canvas.height}`);
      }
      
      // 2. Limpiar el canvas temporal con un color conocido
      tempCtx.fillStyle = 'rgba(0, 0, 0, 1)';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      
      // 3. Dibujar la imagen de la cámara en el canvas temporal
      try {
        // Usar un try-catch separado para drawImage
        tempCtx.drawImage(
          camera,
          0, 0, Math.max(1, camera.videoWidth), Math.max(1, camera.videoHeight),  // Fuente (asegurar dimensiones mínimas)
          0, 0, tempCanvas.width, tempCanvas.height                               // Destino
        );
      } catch (drawError) {
        console.error('Error al dibujar en canvas temporal:', drawError);
        throw new Error(`No se pudo dibujar la imagen: ${drawError.message}`);
      }
      
      // 4. Verificar que el canvas temporal tenga contenido
      try {
        const tempImageData = tempCtx.getImageData(0, 0, 1, 1).data;
        console.log('Datos de píxel en canvas temporal:', tempImageData);
      } catch (checkError) {
        console.warn('No se pudo verificar el canvas temporal:', checkError);
      }
      
      // 5. Limpiar el canvas principal
      ctx.fillStyle = 'rgba(0, 0, 0, 1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 6. Dibujar la imagen del canvas temporal al canvas principal
      try {
        ctx.drawImage(tempCanvas, 0, 0);
      } catch (drawError) {
        console.error('Error al dibujar en canvas principal:', drawError);
        throw new Error(`No se pudo copiar al canvas principal: ${drawError.message}`);
      }
      
      // 7. Verificar que el canvas principal tenga contenido
      try {
        const mainImageData = ctx.getImageData(0, 0, 1, 1).data;
        console.log('Datos de píxel en canvas principal:', mainImageData);
      } catch (checkError) {
        console.warn('No se pudo verificar el canvas principal:', checkError);
      }
      
    } catch (drawError) {
      console.error('Error al dibujar la imagen:', drawError);
      throw new Error('No se pudo capturar la imagen de la cámara: ' + drawError.message);
    } finally {
      // Siempre asegurarse de limpiar el estado de captura
      isCapturing = false;
      
      // Forzar la recolección de basura para liberar recursos
      if (typeof window.gc === 'function') {
        window.gc();
      }
      
      // Liberar recursos del canvas temporal
      if (tempCanvas) {
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        tempCtx.clearRect(0, 0, 1, 1);
      }
    }
    
    // Detener la cámara después de capturar el frame
    const stream = camera.srcObject;
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      camera.srcObject = null;
    }
    
    // Calcular las dimensiones del área de selección
    const videoRect = camera.getBoundingClientRect();
    const containerRect = cameraContainer.getBoundingClientRect();
    
    // Calcular la relación entre el tamaño del video y el tamaño mostrado
    const scaleX = camera.videoWidth / videoRect.width;
    const scaleY = camera.videoHeight / videoRect.height;
    
    // Calcular las dimensiones del rectángulo de selección
    const selectionWidth = containerRect.width * SELECTION_WIDTH_RATIO;
    const selectionHeight = selectionWidth / SELECTION_ASPECT_RATIO;
    
    // Calcular la posición del rectángulo (centrado)
    const offsetX = (containerRect.width - selectionWidth) / 2;
    const offsetY = (containerRect.height - selectionHeight) / 2;
    
    // Calcular las coordenadas y dimensiones del recorte
    const x = (offsetX + containerRect.left - videoRect.left) * scaleX;
    const y = (offsetY + containerRect.top - videoRect.top) * scaleY;
    const width = selectionWidth * scaleX;
    const height = selectionHeight * scaleY;
    
    // Crear un nuevo canvas para la imagen recortada
    const croppedCanvas = document.createElement('canvas');
    const croppedCtx = croppedCanvas.getContext('2d');
    
    // Establecer el tamaño del canvas recortado
    croppedCanvas.width = width;
    croppedCanvas.height = height;
    
    // Dibujar solo la región seleccionada
    croppedCtx.drawImage(
      canvas,
      x, y, width, height,  // Coordenadas de origen (recorte)
      0, 0, width, height  // Coordenadas de destino (tamaño completo)
    );
    
    // Reemplazar el canvas original con el recortado
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(croppedCanvas, 0, 0);
    
    mostrarEstado('info', 'Imagen recortada del área seleccionada');
    
    // Obtener la hora oficial del dispositivo
    const ahora = new Date();
    const opcionesHora = { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false,
      timeZone: 'America/Santiago'
    };
    
    const opcionesFecha = { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    
    // Obtener la imagen como base64
    const imagen = canvas.toDataURL('image/jpeg', 0.9);
    
    // Crear objeto con los datos de la captura
    const captura = {
      timestamp: ahora.getTime(),
      coords: coordenadas,
      src: imagen,
      horaOficial: ahora.toLocaleTimeString('es-CL', opcionesHora),
      fechaCompleta: ahora.toLocaleDateString('es-CL', { ...opcionesFecha, ...opcionesHora })
    };
    
    // Procesar OCR en la imagen capturada
    try {
      const ocrResult = await extraerFechaConOCR(canvas);
      if (ocrResult && ocrResult.fechaHora) {
        captura.ocrResult = ocrResult;
        mostrarEstado('info', `OCR: ${ocrResult.fechaHora} (${ocrResult.confianza}% de confianza)`);
      }
    } catch (ocrError) {
      console.error('Error en el procesamiento OCR:', ocrError);
      captura.ocrError = 'No se pudo procesar el texto en la imagen';
    }
    
    // Guardar la captura con los resultados del OCR
    guardarCaptura(captura);
    cargarHistorial();
    
    // Volver a iniciar la cámara
    await iniciarCamara();
    
    mostrarEstado('success', '✅ Captura registrada' + (captura.ocrResult ? ` (OCR: ${captura.ocrResult.fechaHora})` : ''));
    
  } catch (error) {
    console.error('Error al generar la captura:', error);
    mostrarEstado('error', 'Error al generar la captura: ' + error.message);
    
    // Intentar reiniciar la cámara en caso de error
    try {
      await iniciarCamara();
    } catch (e) {
      console.error('Error al reiniciar la cámara:', e);
    }
  }
}

// Guardado local (usando localStorage)
function guardarCaptura(data) {
  try {
    // Validar los datos de entrada
    if (!data || typeof data !== 'object') {
      throw new Error('Datos de captura no válidos');
    }
    
    // Verificar que la fuente de la imagen sea válida
    if (!data.src || !data.src.startsWith('data:image')) {
      console.error('Fuente de imagen no válida en los datos de captura:', 
        data.src ? data.src.substring(0, 100) + '...' : 'undefined');
      throw new Error('La imagen capturada no es válida');
    }
    
    // Obtener capturas existentes
    let capturas = [];
    try {
      const capturasGuardadas = localStorage.getItem("capturas");
      if (capturasGuardadas) {
        capturas = JSON.parse(capturasGuardadas);
        if (!Array.isArray(capturas)) {
          console.warn('Las capturas guardadas no son un array, inicializando nuevo array');
          capturas = [];
        }
      }
    } catch (e) {
      console.error('Error al cargar capturas existentes:', e);
      capturas = [];
    }
    
    console.log('Guardando captura. Total previo:', capturas.length);
    console.log('Datos de la captura:', {
      timestamp: data.timestamp,
      srcLength: data.src ? data.src.length : 'no src',
      srcStart: data.src ? data.src.substring(0, 30) + '...' : 'no src',
      coords: data.coords ? 'con coordenadas' : 'sin coordenadas'
    });
    
    // Agregar la nueva captura
    capturas.push(data);
    
    // Guardar en localStorage
    try {
      localStorage.setItem("capturas", JSON.stringify(capturas));
      console.log('Captura guardada correctamente. Total actual:', capturas.length);
      
      // Verificar que se guardó correctamente
      const verificar = JSON.parse(localStorage.getItem("capturas") || "[]");
      console.log('Verificación de guardado:', {
        totalGuardado: verificar.length,
        ultimaCaptura: verificar.length > 0 ? {
          timestamp: verificar[verificar.length - 1].timestamp,
          srcLength: verificar[verificar.length - 1].src.length
        } : 'sin capturas'
      });
      
    } catch (e) {
      console.error('Error al guardar en localStorage:', e);
      if (e.name === 'QuotaExceededError') {
        throw new Error('No hay suficiente espacio en el almacenamiento local. Por favor, elimina algunas capturas antiguas.');
      }
      throw e;
    }
  } catch (error) {
    console.error('Error al guardar la captura:', error);
    mostrarEstado('error', 'Error al guardar la captura: ' + error.message);
    throw error;
  }
}

// Obtener historial de capturas
function obtenerHistorial() {
  try {
    const capturasGuardadas = localStorage.getItem("capturas");
    
    if (!capturasGuardadas) {
      console.log('No se encontraron capturas guardadas en localStorage');
      return [];
    }
    
    // Verificar si el string es un JSON válido
    let capturas;
    try {
      capturas = JSON.parse(capturasGuardadas);
    } catch (e) {
      console.error('Error al analizar las capturas guardadas:', e);
      console.error('Contenido no válido:', capturasGuardadas.substring(0, 200) + '...');
      return [];
    }
    
    if (!Array.isArray(capturas)) {
      console.error('Las capturas guardadas no son un array:', typeof capturas);
      return [];
    }
    
    // Filtrar solo elementos válidos
    const capturasValidas = capturas.filter((captura, index) => {
      const esValida = captura && 
                      typeof captura === 'object' && 
                      'src' in captura && 
                      captura.src && 
                      captura.src.startsWith('data:image');
      
      if (!esValida) {
        console.warn(`Captura inválida en el índice ${index}:`, captura);
      }
      
      return esValida;
    });
    
    if (capturasValidas.length !== capturas.length) {
      console.warn(`Se filtraron ${capturas.length - capturasValidas.length} capturas inválidas`);
    }
    
    console.log(`Se cargaron ${capturasValidas.length} capturas válidas`);
    return capturasValidas;
    
  } catch (error) {
    console.error("Error inesperado al obtener el historial:", error);
    return [];
  }
}

// Función para mostrar una imagen en el visor modal
function mostrarImagenEnVisor(src, info) {
  const visor = document.getElementById('visor-modal');
  const img = document.getElementById('visor-img');
  const infoElement = document.getElementById('visor-info');
  const botonMaps = document.getElementById('maps-btn');
  const botonDescargar = document.getElementById('descargar-img');
  
  if (!visor || !img || !infoElement) {
    console.error('Elementos del visor no encontrados');
    return;
  }
  
  // Configurar la imagen y la información
  img.src = src;
  infoElement.innerHTML = info || '';
  
  // Configurar botón de Google Maps si hay coordenadas
  if (info && info.coords) {
    botonMaps.style.display = 'inline-block';
    botonMaps.onclick = () => {
      const { latitude, longitude } = info.coords;
      window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, '_blank');
    };
  } else {
    botonMaps.style.display = 'none';
  }
  
  // Configurar botón de descarga
  botonDescargar.onclick = () => {
    const link = document.createElement('a');
    link.href = src;
    link.download = `captura-${new Date().toISOString().slice(0, 10)}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Mostrar el visor
  visor.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  
  // Configurar botón de cierre
  const cerrarBtn = document.getElementById('cerrar-visor');
  if (cerrarBtn) {
    cerrarBtn.onclick = () => {
      visor.style.display = 'none';
      document.body.style.overflow = '';
    };
  }
  
  // Cerrar al hacer clic fuera de la imagen
  visor.onclick = (e) => {
    if (e.target === visor) {
      visor.style.display = 'none';
      document.body.style.overflow = '';
    }
  };
  
  // Cerrar con tecla Escape
  document.onkeydown = (e) => {
    if (e.key === 'Escape' && visor.style.display === 'flex') {
      visor.style.display = 'none';
      document.body.style.overflow = '';
    }
  };
}

// Cargar y mostrar el historial en la galería
function cargarHistorial() {
  try {
    console.log('Cargando historial...');
    const historial = obtenerHistorial();
    const grid = document.getElementById("history-grid");
    
    if (!grid) {
      console.error('No se encontró el elemento con ID "history-grid"');
      return;
    }
    
    console.log('Total de capturas en el historial:', historial.length);
    
    if (!historial || historial.length === 0) {
      console.log('No hay capturas para mostrar');
      grid.innerHTML = '<p class="no-data">No hay capturas guardadas</p>';
      return;
    }
    
    grid.innerHTML = '';
    
    // Mostrar en orden cronológico inverso (más recientes primero)
    historial.reverse().forEach((captura, index) => {
      console.log(`Procesando captura ${index + 1}/${historial.length}:`, {
        timestamp: new Date(captura.timestamp).toISOString(),
        srcLength: captura.src ? captura.src.length : 'no src',
        srcStart: captura.src ? captura.src.substring(0, 30) + '...' : 'no src'
      });
      
      // Crear contenedor para la imagen y el botón
      const itemContainer = document.createElement('div');
      itemContainer.className = 'gallery-item';
      itemContainer.dataset.timestamp = captura.timestamp;
      
      // Crear imagen
      const img = document.createElement('img');
      
      // Verificar que la fuente de la imagen sea válida
      if (captura.src && captura.src.startsWith('data:image')) {
        img.src = captura.src;
        console.log('Imagen cargada correctamente');
      } else {
        console.error('Fuente de imagen no válida:', captura.src ? captura.src.substring(0, 100) + '...' : 'undefined');
        img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f0f0f0"/><text x="100" y="100" font-family="Arial" font-size="14" text-anchor="middle" dominant-baseline="middle" fill="%23999">Imagen no disponible</text></svg>';
      }
      
      img.alt = `Captura del ${new Date(captura.timestamp).toLocaleString("es-CL")}`;
      img.loading = 'lazy';
      img.className = 'gallery-image';
      img.tabIndex = 0;
      
      // Crear botón de eliminar
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.title = 'Eliminar esta captura';
      deleteBtn.setAttribute('aria-label', `Eliminar captura del ${new Date(captura.timestamp).toLocaleString("es-CL")}`);
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        eliminarCaptura(captura.timestamp);
      };
      
      // Agregar elementos al contenedor
      itemContainer.appendChild(img);
      itemContainer.appendChild(deleteBtn);
      
      // Agregar el contenedor al grid
      grid.appendChild(itemContainer);
      
      // Configurar el manejador de clic para la imagen
      img.onclick = (e) => {
        e.stopPropagation();
        console.log('Mostrando imagen en visor:', captura.timestamp);
        
        // Crear información detallada para mostrar en el visor
        const fechaHora = new Date(captura.timestamp).toLocaleString('es-CL', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        
        let infoHTML = `
          <p><strong>Fecha y hora:</strong> ${fechaHora}</p>
        `;
        
        if (captura.coords && captura.coords.latitude && captura.coords.longitude) {
          const { latitude, longitude, accuracy } = captura.coords;
          const lat = typeof latitude === 'number' ? latitude.toFixed(6) : 'N/A';
          const lng = typeof longitude === 'number' ? longitude.toFixed(6) : 'N/A';
          const acc = typeof accuracy === 'number' ? Math.round(accuracy) : 'N/A';
          
          infoHTML += `
            <p><strong>Ubicación:</strong> 
              ${lat}, ${lng}
              ${acc !== 'N/A' ? `<small> (precisión: ${acc}m)</small>` : ''}
            </p>
          `;
        }
        
        if (captura.horaOficial) {
          infoHTML += `<p><strong>Hora oficial:</strong> ${captura.horaOficial}</p>`;
        }
        
        // Mostrar la imagen en el visor con información adicional del OCR si está disponible
        if (captura.ocrResult) {
          infoHTML += `
            <div class="ocr-result">
              <h3>Resultado OCR</h3>
              <p><strong>Fecha/Hora detectada:</strong> ${captura.ocrResult.fechaHora}</p>
              <p><strong>Confianza:</strong> ${captura.ocrResult.confianza}%</p>
              ${captura.ocrResult.textoCompleto ? `<p><strong>Texto detectado:</strong><br>${captura.ocrResult.textoCompleto}</p>` : ''}
            </div>
          `;
        } else if (captura.ocrError) {
          infoHTML += `
            <div class="ocr-error">
              <h3>Error en OCR</h3>
              <p>${captura.ocrError}</p>
            </div>
          `;
        } else {
          infoHTML += `
            <div class="ocr-info">
              <p>No se procesó OCR para esta imagen.</p>
            </div>
          `;
        }
        
        // Mostrar la imagen en el visor
        mostrarImagenEnVisor(captura.src, infoHTML);
      };
    });
  } catch (error) {
    console.error('Error al cargar el historial:', error);
    const grid = document.getElementById("history-grid");
    if (grid) {
      grid.innerHTML = '<p class="error">Error al cargar el historial. Por favor, recarga la página.</p>';
    }
  }
}

// Función para eliminar una captura
function eliminarCaptura(timestamp) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta captura?')) {
    return;
  }
  
  try {
    let historial = obtenerHistorial();
    historial = historial.filter(item => item.timestamp !== timestamp);
    localStorage.setItem('capturas', JSON.stringify(historial));
    
    // Eliminar el elemento del DOM
    const itemToRemove = document.querySelector(`.gallery-item[data-timestamp="${timestamp}"]`);
    if (itemToRemove) {
      // Agregar animación de salida
      itemToRemove.style.transform = 'scale(0.8)';
      itemToRemove.style.opacity = '0';
      
      // Esperar a que termine la animación antes de eliminar
      setTimeout(() => {
        itemToRemove.remove();
        
        // Verificar si no quedan más elementos
        const grid = document.getElementById("history-grid");
        if (grid && grid.children.length === 0) {
          grid.innerHTML = '<p class="no-data">No hay capturas guardadas</p>';
        }
      }, 300);
    }
    
    mostrarEstado("success", "Captura eliminada correctamente");
    
    // Recargar el historial después de eliminar
    cargarHistorial();
  } catch (error) {
    console.error("Error al eliminar la captura:", error);
    mostrarEstado("error", "Error al eliminar la captura");
  }
}

// Navegación mejorada con accesibilidad
document.addEventListener('DOMContentLoaded', () => {
  // Asegurarse de que solo una vista esté visible al cargar
  const vistas = document.querySelectorAll('.vista');
  const hash = window.location.hash.substring(1);
  const initialSection = ['captura', 'historial'].includes(hash) ? hash : 'captura';
  
  // Ocultar todas las vistas excepto la inicial
  vistas.forEach(vista => {
    if (vista.id === initialSection) {
      vista.style.display = 'block';
      vista.style.opacity = '1';
      vista.style.visibility = 'visible';
      vista.classList.add('visible');
      vista.setAttribute('aria-hidden', 'false');
    } else {
      vista.style.display = 'none';
      vista.style.opacity = '0';
      vista.style.visibility = 'hidden';
      vista.classList.remove('visible');
      vista.setAttribute('aria-hidden', 'true');
    }
  });
});

async function mostrarSeccion(id) {
  console.log(`Cambiando a sección: ${id}`);
  
  // Validar ID de sección
  const validSections = ['captura', 'historial'];
  if (!validSections.includes(id)) {
    console.error('Sección no válida:', id);
    return;
  }

  // Obtener la sección actual y la nueva
  const seccionActual = document.querySelector('.vista.visible');
  const seccionNueva = document.getElementById(id);
  
  // Si ya está en la sección solicitada, no hacer nada
  if (seccionActual === seccionNueva) {
    console.log('Ya está en la sección solicitada');
    return;
  }
  
  // Configurar la transición
  if (seccionActual) {
    console.log(`Ocultando sección actual: ${seccionActual.id}`);
    seccionActual.style.opacity = '0';
    seccionActual.classList.remove('visible');
    seccionActual.setAttribute('aria-hidden', 'true');
    
    // Ocultar completamente después de la animación
    setTimeout(() => {
      seccionActual.style.display = 'none';
      seccionActual.style.visibility = 'hidden';
      console.log(`Sección ${seccionActual.id} oculta`);
    }, 300); // Coincidir con la duración de la transición CSS
  }
  
  // Mostrar la nueva sección
  if (seccionNueva) {
    console.log(`Mostrando sección: ${id}`);
    
    // Manejar la cámara según la sección a la que se está cambiando
    try {
      if (id === 'captura') {
        console.log('Iniciando cámara para la vista de captura...');
        await detenerCamara(); // Asegurarse de que la cámara esté detenida antes de iniciar
        await new Promise(resolve => setTimeout(resolve, 100)); // Pequeña pausa
        await iniciarCamara();
        console.log('Cámara iniciada correctamente');
      } else if (id === 'historial') {
        console.log('Deteniendo cámara para la vista de historial...');
        await detenerCamara();
        console.log('Cámara detenida correctamente');
      }
    } catch (error) {
      console.error('Error al manejar la cámara:', error);
      // Continuar a pesar del error para no bloquear la interfaz
    }
    
    // Mostrar la nueva sección
    seccionNueva.style.display = 'block';
    seccionNueva.style.visibility = 'visible';
    seccionNueva.setAttribute('aria-hidden', 'false');
    
    // Forzar el reflow para que la animación funcione
    void seccionNueva.offsetHeight;
    
    // Iniciar la animación de entrada
    setTimeout(() => {
      seccionNueva.style.opacity = '1';
      seccionNueva.classList.add('visible');
      console.log(`Sección ${id} completamente visible`);
      
      // Enfocar el primer elemento interactivo
      const focusable = seccionNueva.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
      if (focusable) {
        focusable.focus({ preventScroll: true });
        console.log('Elemento enfocado:', focusable);
      }
    }, 10);
  }
  
  // Actualizar pestañas
  const tabs = document.querySelectorAll('.tab[role="tab"]');
  tabs.forEach(tab => {
    const isSelected = tab.getAttribute('aria-controls') === id;
    tab.classList.toggle('active', isSelected);
    tab.setAttribute('aria-selected', isSelected.toString());
    
    if (isSelected) {
      tab.focus({ preventScroll: true });
    }
  });
  
  // Actualizar indicador visual
  const tabIndicator = document.getElementById("tab-indicator");
  const activeTab = document.querySelector(`.tab[aria-controls="${id}"]`);
  if (activeTab && tabIndicator) {
    const tabIndex = Array.from(tabs).indexOf(activeTab);
    tabIndicator.style.transform = `translateX(${tabIndex * 100}%)`;
  }
  
  // Cargar historial si es necesario
  if (id === 'historial') {
    cargarHistorial();
  }
  
  // Actualizar la URL sin recargar la página
  history.pushState({ section: id }, '', `#${id}`);
}

// Función para inicializar los botones
function initButtons() {
  // Botón de captura
  const captureBtn = document.getElementById('capture-btn');
  if (captureBtn) {
    captureBtn.addEventListener('click', () => {
      console.log('Botón de captura presionado');
      navigator.geolocation.getCurrentPosition(pos => {
        coordenadas = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy
        };
        generarCaptura();
      }, (err) => {
        console.warn('Error al obtener ubicación:', err);
        generarCaptura(); // Continuar sin ubicación
      });
    });
  } else {
    console.error('No se encontró el botón de captura');
  }

  // Botón de alternar selección
  const toggleBtn = document.getElementById('toggle-selection-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSelectionMode);
  }
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar los botones
  initButtons();
  
  // Manejar navegación con teclado en las pestañas
  const tabs = document.querySelectorAll('.tab[role="tab"]');
  tabs.forEach(tab => {
    // Navegación con teclado (flechas izquierda/derecha)
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const currentIndex = Array.from(tabs).indexOf(tab);
        let nextIndex;
        
        if (e.key === 'ArrowRight') {
          nextIndex = (currentIndex + 1) % tabs.length;
        } else {
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        }
        
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
        e.preventDefault();
      } else if (e.key === 'Home') {
        tabs[0].focus();
        tabs[0].click();
        e.preventDefault();
      } else if (e.key === 'End') {
        tabs[tabs.length - 1].focus();
        tabs[tabs.length - 1].click();
        e.preventDefault();
      }
    });
  });
  
  // Manejar el botón de captura con teclado
  const captureBtn = document.getElementById('capture-btn');
  if (captureBtn) {
    captureBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        captureBtn.click();
      }
    });
  }
  
  // Cargar la sección correcta basada en el hash de la URL
  const loadSectionFromHash = () => {
    const hash = window.location.hash.substring(1);
    if (hash && ['captura', 'historial'].includes(hash)) {
      mostrarSeccion(hash);
    } else {
      mostrarSeccion('captura');
    }
  };
  
  // Manejar el botón de retroceso/avance del navegador
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.section) {
      mostrarSeccion(e.state.section);
    } else {
      loadSectionFromHash();
    }
  });
  
  // Cargar la sección inicial
  loadSectionFromHash();
});

// Estado visual (toast)
function mostrarEstado(tipo = "success", mensaje = "Operación exitosa") {
  toast.className = "";
  toast.classList.add(`toast-${tipo}`);
  toast.textContent = mensaje;
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
  }, 2500);
}

// Manejo del modal
const modal = document.getElementById("visor-modal");
const modalContent = document.getElementById("visor-contenido");
const closeButton = document.getElementById("cerrar-visor");
const downloadButton = document.getElementById("descargar-img");
let lastFocusedElement = null;
let currentImageSrc = '';

// Cerrar modal
function closeModal() {
  modal.style.display = "none";
  document.body.style.overflow = "auto";
  
  // Restaurar foco al elemento que abrió el modal
  if (lastFocusedElement) {
    lastFocusedElement.focus();
  }
  
  // Eliminar manejadores de eventos
  document.removeEventListener('keydown', handleKeyDown);
  modal.removeEventListener('click', handleOutsideClick);
}

// Manejar teclado
function handleKeyDown(e) {
  if (e.key === 'Escape') {
    closeModal();
  } else if (e.key === 'Tab') {
    // Mantener el foco dentro del modal
    const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }
}

// Cerrar al hacer clic fuera del contenido
function handleOutsideClick(e) {
  if (!modalContent.contains(e.target)) {
    closeModal();
  }
}

// Configurar manejadores de eventos del modal
closeButton.addEventListener('click', closeModal);

// Función para descargar la imagen actual
function downloadImage() {
  if (!currentImageSrc) return;
  
  try {
    const link = document.createElement('a');
    link.href = currentImageSrc;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `timecam-${timestamp}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarEstado("success", "✅ Imagen descargada");
  } catch (error) {
    console.error("Error al descargar la imagen:", error);
    mostrarEstado("error", "Error al descargar la imagen");
  }
}

// Función para extraer fecha y hora usando OCR
async function extraerFechaConOCR(imagenElement) {
  console.log('Iniciando procesamiento OCR...');
  
  // Mostrar estado de carga
  mostrarEstado('info', 'Procesando texto en la imagen...');
    try {
        // Mostrar mensaje de carga
        mostrarEstado('info', 'Procesando imagen para extraer fecha/hora...');
        
        // Procesar la imagen con Tesseract
        const { data: { text } } = await Tesseract.recognize(
            imagenElement,
            'spa+eng', // Idiomas: español e inglés
            { 
                logger: m => console.log(m) 
            }
        );
        
        console.log('Texto extraído por OCR:', text);
        
        // Buscar patrones de fecha y hora en el texto extraído
        const fechaHoraEncontrada = encontrarFechaHoraEnTexto(text);
        
        if (fechaHoraEncontrada) {
            return {
                fechaHora: fechaHoraEncontrada,
                textoExtraido: text,
                exito: true
            };
        } else {
            throw new Error('No se pudo detectar un patrón de fecha/hora en la imagen');
        }
    } catch (error) {
        console.error('Error en OCR:', error);
        mostrarEstado('error', 'Error al procesar la imagen con OCR');
        return {
            fechaHora: null,
            textoExtraido: '',
            exito: false,
            error: error.message
        };
    }
}

// Función para encontrar patrones de fecha y hora en el texto
function encontrarFechaHoraEnTexto(texto) {
    // Patrones comunes de fecha/hora (DD-MM-YYYY HH:MM:SS, DD/MM/YYYY HH:MM, etc.)
    const patrones = [
        // DD-MM-YYYY [día de semana] HH:MM:SS
        /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})\s+(?:lun|mar|mi[ée]|jue|vie|s[áa]b|dom|mon|tue|wed|thu|fri|sat|sun)\w*\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i,
        // DD-MM-YYYY HH:MM:SS
        /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
        // YYYY-MM-DD [día de semana] HH:MM:SS
        /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(?:lun|mar|mi[ée]|jue|vie|s[áa]b|dom|mon|tue|wed|thu|fri|sat|sun)\w*\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i,
        // YYYY-MM-DD HH:MM:SS
        /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
        // HH:MM:SS (solo hora)
        /(\d{1,2}):(\d{2})(?::(\d{2}))?/,
    ];

    for (const patron of patrones) {
        const match = texto.match(patron);
        if (match) {
            // Intentar crear una fecha con los valores coincidentes
            try {
                let fechaHora;
                
                if (match[3] && match[3].length >= 2) { // Tiene año
                    const anio = match[3].length === 2 ? `20${match[3]}` : match[3];
                    const mes = parseInt(match[2], 10) - 1; // Los meses van de 0 a 11
                    const dia = parseInt(match[1], 10);
                    const hora = parseInt(match[4] || 0, 10);
                    const minuto = parseInt(match[5] || 0, 10);
                    const segundo = parseInt(match[6] || 0, 10);
                    
                    fechaHora = new Date(anio, mes, dia, hora, minuto, segundo);
                } else { // Solo hora
                    const ahora = new Date();
                    const hora = parseInt(match[1], 10);
                    const minuto = parseInt(match[2], 10);
                    const segundo = match[3] ? parseInt(match[3], 10) : 0;
                    
                    fechaHora = new Date(
                        ahora.getFullYear(),
                        ahora.getMonth(),
                        ahora.getDate(),
                        hora,
                        minuto,
                        segundo
                    );
                }
                
                // Verificar si la fecha es válida
                if (!isNaN(fechaHora.getTime())) {
                    return fechaHora;
                }
            } catch (e) {
                console.error('Error al analizar fecha/hora:', e);
            }
        }
    }
    
    return null;
}

// Función para formatear la diferencia de tiempo
function formatearDiferenciaTiempo(ms) {
    const segundos = Math.floor(ms / 1000);
    const minutos = Math.floor(segundos / 60);
    const horas = Math.floor(minutos / 60);
    const dias = Math.floor(horas / 24);

    const segRestantes = segundos % 60;
    const minRestantes = minutos % 60;
    const horasRestantes = horas % 24;

    const partes = [];
    
    if (dias > 0) partes.push(`${dias} día${dias !== 1 ? 's' : ''}`);
    if (horasRestantes > 0) partes.push(`${horasRestantes} hora${horasRestantes !== 1 ? 's' : ''}`);
    if (minRestantes > 0) partes.push(`${minRestantes} minuto${minRestantes !== 1 ? 's' : ''}`);
    if (segRestantes > 0 && dias === 0) partes.push(`${segRestantes} segundo${segRestantes !== 1 ? 's' : ''}`);

    if (partes.length === 0) return '0 segundos';
    return partes.join(', ');
}

// Función para extraer la fecha de los metadatos EXIF
function extraerFechaExif(archivo, callback) {
    EXIF.getData(archivo, function() {
        try {
            const fechaExif = EXIF.getTag(this, 'DateTimeOriginal') || 
                            EXIF.getTag(this, 'DateTime') || 
                            EXIF.getTag(this, 'DateTimeDigitized');
            
            if (fechaExif) {
                // Formato común en EXIF: "YYYY:MM:DD HH:MM:SS"
                const [fecha, tiempo] = fechaExif.split(' ');
                const [anio, mes, dia] = fecha.split(':');
                const [hora, minuto, segundo] = tiempo.split(':');
                
                const fechaExifObj = new Date(
                    parseInt(anio), 
                    parseInt(mes) - 1, 
                    parseInt(dia), 
                    parseInt(hora), 
                    parseInt(minuto), 
                    parseInt(segundo)
                );
                
                callback(null, fechaExifObj);
            } else {
                callback(new Error('No se encontró información de fecha en los metadatos EXIF'));
            }
        } catch (error) {
            callback(error);
        }
    });
}

// Función para abrir el modal
function openModal() {
  lastFocusedElement = document.activeElement;
  
  // Forzar el renderizado antes de mostrar para la animación
  modal.style.display = "flex";
  // Pequeño retraso para asegurar que el navegador procese el cambio de display
  requestAnimationFrame(() => {
    modal.style.opacity = "1";
  });
  
  document.body.style.overflow = "hidden";
  
  // Configurar el botón de descarga
  const descargarBtn = document.getElementById('descargar-img');
  if (descargarBtn) {
    descargarBtn.onclick = downloadImage;
  }
  
  // Enfocar el primer elemento interactivo
  closeButton.focus();
  
  // Agregar manejadores de eventos
  document.addEventListener('keydown', handleKeyDown);
  modal.addEventListener('click', handleOutsideClick);
}

// Actualizar el manejador de clic en las imágenes de la galería
function setupGalleryImageClickHandler(img, captura) {
  img.addEventListener('click', async () => {
    const visorImg = document.getElementById('visor-img');
    visorImg.src = captura.imagenUrl;
    
    // Mostrar información de la captura
    const infoElement = document.getElementById('visor-info');
    infoElement.innerHTML = `
      <p><strong>Hora de captura:</strong> ${captura.horaOficial}</p>
      <p><strong>Fecha:</strong> ${captura.fechaCompleta}</p>
      <p><strong>Ubicación:</strong> ${captura.coordenadas.lat}, ${captura.coordenadas.lon}</p>
    `;
    
    // Crear elementos para mostrar el resultado del OCR
    const ocrContainer = document.createElement('div');
    ocrContainer.style.marginTop = '15px';
    ocrContainer.style.padding = '10px';
    ocrContainer.style.backgroundColor = '#f8f9fa';
    ocrContainer.style.borderRadius = '4px';
    
    const ocrStatus = document.createElement('div');
    ocrStatus.innerHTML = '🔍 Analizando imagen para detectar fecha/hora visual...';
    ocrContainer.appendChild(ocrStatus);
    
    const ocrResult = document.createElement('div');
    ocrResult.style.marginTop = '8px';
    ocrContainer.appendChild(ocrResult);
    
    infoElement.appendChild(ocrContainer);
    
    // Abrir el modal mientras se procesa la imagen
    openModal();
    
    try {
      // Procesar la imagen con OCR
      const { fechaHora, textoExtraido, exito, error } = await extraerFechaConOCR(visorImg);
      
      if (exito && fechaHora) {
        // Calcular diferencia con la hora actual
        const ahora = new Date();
        const diferenciaMs = ahora - fechaHora;
        const esAdelanto = diferenciaMs < 0;
        const diferenciaAbsoluta = Math.abs(diferenciaMs);
        
        // Formatear la fecha/hora detectada
        const opcionesFecha = { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        };
        
        const fechaFormateada = fechaHora.toLocaleString('es-CL', opcionesFecha);
        const textoDiferencia = formatearDiferenciaTiempo(diferenciaAbsoluta);
        
        // Actualizar la interfaz con los resultados
        ocrStatus.innerHTML = '✅ Análisis completado';
        ocrResult.innerHTML = `
          <p><strong>Fecha/Hora detectada:</strong> ${fechaFormateada}</p>
          <p><strong>Desfase horario:</strong> La cámara está 
          <span style="color: ${esAdelanto ? '#e74c3c' : '#27ae60'}; font-weight: bold;">
            ${esAdelanto ? 'adelantada' : 'atrasada'}
          </span> 
          ${textoDiferencia} con respecto a la hora actual del dispositivo</p>
          <details style="margin-top: 8px;">
            <summary style="cursor: pointer; color: #666; font-size: 0.9em;">Ver texto extraído</summary>
            <div style="margin-top: 5px; padding: 5px; background: white; border: 1px solid #ddd; border-radius: 3px; font-family: monospace; white-space: pre-wrap;">${textoExtraido || 'No se pudo extraer texto'}</div>
          </details>
        `;
        
        // Resaltar si hay un desfase significativo (más de 1 minuto)
        if (diferenciaAbsoluta > 60000) { // 1 minuto en milisegundos
          ocrContainer.style.borderLeft = '4px solid #e74c3c';
          ocrContainer.style.paddingLeft = '6px';
        }
      } else {
        ocrStatus.innerHTML = '⚠️ No se pudo detectar fecha/hora';
        ocrResult.innerHTML = `
          <p>No se pudo extraer una fecha/hora válida de la imagen.</p>
          ${error ? `<p style="color: #e74c3c;">Error: ${error}</p>` : ''}
          <details style="margin-top: 8px;">
            <summary style="cursor: pointer; color: #666; font-size: 0.9em;">Ver texto extraído</summary>
            <div style="margin-top: 5px; padding: 5px; background: white; border: 1px solid #ddd; border-radius: 3px; font-family: monospace; white-space: pre-wrap;">${textoExtraido || 'No se pudo extraer texto'}</div>
          </details>
        `;
      }
    } catch (error) {
      console.error('Error en el proceso OCR:', error);
      ocrStatus.innerHTML = '❌ Error en el análisis';
      ocrResult.innerHTML = `
        <p>Ocurrió un error al procesar la imagen con OCR.</p>
        <p style="color: #e74c3c;">${error.message || 'Error desconocido'}</p>
      `;
    }
    
    // Configurar botón de Google Maps
    const mapsBtn = document.getElementById('maps-btn');
    mapsBtn.onclick = () => {
      const { lat, lon } = captura.coordenadas;
      if (lat !== '?' && lon !== '?') {
        window.open(`https://www.google.com/maps?q=${lat},${lon}`, '_blank');
      } else {
        mostrarEstado('info', 'Ubicación no disponible');
      }
    };
  });
}
