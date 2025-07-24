const camera = document.getElementById('camera');
const canvas = document.getElementById('canvas-preview');
const ctx = canvas.getContext('2d');
const gallery = document.getElementById('history-grid');
const toast = document.getElementById('status-toast');

// Variables para el rectángulo de selección
let selectionRect = document.getElementById('selection-rectangle');
let selectionOverlay = document.getElementById('selection-overlay');
let cameraContainer = document.getElementById('camera-container');

// Tamaño fijo del área de selección (relativo al video)
const SELECTION_WIDTH_RATIO = 0.8; // 80% del ancho del contenedor
const SELECTION_ASPECT_RATIO = 16/9; // Relación de aspecto del área de selección

let coordenadas = null;

// Inicializar cámara
let cameraStream = null;

// Función para iniciar la cámara
async function iniciarCamara() {
  try {
    // Detener la cámara actual si existe
    await detenerCamara();
    
    // Intentar con cámara trasera primero
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: "environment" } },
        audio: false
      });
    } catch (e) {
      // Si falla, intentar con cualquier cámara
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }
    
    if (camera) {
      camera.srcObject = cameraStream;
      // Esperar a que la cámara esté lista
      return new Promise((resolve) => {
        camera.onloadedmetadata = () => {
          camera.play().then(resolve).catch(console.error);
        };
      });
    }
  } catch (err) {
    console.error("Error al acceder a la cámara:", err);
    mostrarEstado("error", "No se pudo acceder a la cámara");
    return Promise.reject(err);
  }
}

// Función para detener la cámara
async function detenerCamara() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  if (camera) {
    camera.srcObject = null;
  }
  return Promise.resolve();
}

// Iniciar cámara al cargar la página
iniciarCamara().then(initSelectionHandlers).catch(console.error);

// Inicializar manejadores de eventos para la selección
function initSelectionHandlers() {
  // Activar/desactivar modo de selección
  toggleSelectionBtn.addEventListener('click', toggleSelectionMode);
  
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

async function generarCaptura() {
  try {
    // Detener la cámara temporalmente
    const stream = camera.srcObject;
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop());

    // Configurar el canvas con las dimensiones del video
    canvas.width = camera.videoWidth;
    canvas.height = camera.videoHeight;
    
    // Dibujar el frame actual en el canvas
    ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
    
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
    
    // Guardar la captura
    guardarCaptura(captura);
    cargarHistorial();
    
    // Volver a iniciar la cámara
    await iniciarCamara();
    
    mostrarEstado('success', '✅ Captura registrada');
    
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
  const prev = JSON.parse(localStorage.getItem("capturas") || "[]");
  prev.push(data);
  localStorage.setItem("capturas", JSON.stringify(prev));
}

// Obtener historial de capturas
function obtenerHistorial() {
  try {
    return JSON.parse(localStorage.getItem("capturas") || "[]");
  } catch (error) {
    console.error("Error al obtener el historial:", error);
    return [];
  }
}

// Cargar y mostrar el historial en la galería
function cargarHistorial() {
  const historial = obtenerHistorial();
  const grid = document.getElementById("history-grid");
  
  if (!grid) return;
  
  if (!historial || historial.length === 0) {
    grid.innerHTML = '<p class="no-data">No hay capturas guardadas</p>';
    return;
  }
  
  grid.innerHTML = '';
  
  // Mostrar en orden cronológico inverso (más recientes primero)
  historial.reverse().forEach((captura) => {
    // Crear contenedor para la imagen y el botón
    const itemContainer = document.createElement('div');
    itemContainer.className = 'gallery-item';
    itemContainer.dataset.timestamp = captura.timestamp;
    
    // Crear imagen
    const img = document.createElement('img');
    img.src = captura.src;
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
    setupGalleryImageClickHandler(img, captura);
  });
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

function mostrarSeccion(id) {
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
  if (seccionActual === seccionNueva) return;
  
  // Configurar la transición
  if (seccionActual) {
    seccionActual.style.opacity = '0';
    seccionActual.classList.remove('visible');
    seccionActual.setAttribute('aria-hidden', 'true');
    
    // Ocultar completamente después de la animación
    setTimeout(() => {
      seccionActual.style.display = 'none';
      seccionActual.style.visibility = 'hidden';
    }, 300); // Coincidir con la duración de la transición CSS
  }
  
  // Mostrar la nueva sección
  if (seccionNueva) {
    // Manejar la cámara según la sección a la que se está cambiando
    if (id === 'captura') {
      // Iniciar la cámara cuando volvemos a la vista de captura
      iniciarCamara().catch(console.error);
    } else if (id === 'historial') {
      // Detener la cámara cuando vamos al historial para ahorrar recursos
      detenerCamara().catch(console.error);
    }
    
    seccionNueva.style.display = 'block';
    seccionNueva.style.visibility = 'visible';
    seccionNueva.setAttribute('aria-hidden', 'false');
    
    // Forzar el reflow para que la animación funcione
    void seccionNueva.offsetHeight;
    
    // Iniciar la animación de entrada
    setTimeout(() => {
      seccionNueva.style.opacity = '1';
      seccionNueva.classList.add('visible');
      
      // Enfocar el primer elemento interactivo
      const focusable = seccionNueva.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
      if (focusable) {
        focusable.focus({ preventScroll: true });
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

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
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
