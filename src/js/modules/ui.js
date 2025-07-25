/**
 * Módulo para manejar la interfaz de usuario
 */

/**
 * Muestra un mensaje de estado al usuario
 * @param {string} tipo - Tipo de mensaje ('success', 'error', 'warning', 'info', 'processing')
 * @param {string} mensaje - Texto del mensaje a mostrar
 * @param {number} [duracion=5000] - Duración en milisegundos que se mostrará el mensaje
 */
export function mostrarEstado(tipo, mensaje, duracion = 5000) {
    const toast = document.getElementById('status-toast');
    if (!toast) return;

    // Crear el elemento del mensaje
    const mensajeElement = document.createElement('div');
    mensajeElement.className = `toast-message ${tipo}`;
    mensajeElement.textContent = mensaje;
    
    // Añadir icono según el tipo de mensaje
    const icono = {
        'success': '✅',
        'error': '❌',
        'warning': '⚠️',
        'info': 'ℹ️',
        'processing': '⏳'
    }[tipo] || '';
    
    if (icono) {
        mensajeElement.textContent = `${icono} ${mensaje}`;
    }

    // Añadir el mensaje al contenedor
    toast.appendChild(mensajeElement);
    
    // Hacer scroll al mensaje
    mensajeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    // Eliminar el mensaje después de la duración especificada
    if (duracion > 0) {
        setTimeout(() => {
            mensajeElement.style.opacity = '0';
            mensajeElement.style.transform = 'translateY(20px)';
            mensajeElement.style.transition = 'opacity 0.3s, transform 0.3s';
            
            // Eliminar el elemento después de la animación
            setTimeout(() => {
                if (toast.contains(mensajeElement)) {
                    toast.removeChild(mensajeElement);
                }
            }, 300);
        }, duracion);
    }
}

/**
 * Muestra u oculta un elemento de carga
 * @param {boolean} mostrar - True para mostrar, false para ocultar
 * @param {string} [mensaje='Cargando...'] - Mensaje a mostrar
 */
export function mostrarCargando(mostrar, mensaje = 'Cargando...') {
    let loader = document.getElementById('global-loader');
    
    if (mostrar) {
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.innerHTML = `
                <div class="loader-spinner"></div>
                <div class="loader-text">${mensaje}</div>
            `;
            document.body.appendChild(loader);
        }
        loader.style.display = 'flex';
    } else if (loader) {
        loader.style.display = 'none';
    }
}

/**
 * Muestra u oculta una sección específica de la interfaz
 * @param {string} id - ID de la sección a mostrar
 */
export function mostrarSeccion(id) {
    // Ocultar todas las secciones
    document.querySelectorAll('.vista').forEach(section => {
        section.classList.remove('visible');
    });
    
    // Desactivar todas las pestañas
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
    });
    
    // Mostrar la sección solicitada
    const seccion = document.getElementById(id);
    if (seccion) {
        seccion.classList.add('visible');
        
        // Activar la pestaña correspondiente
        const tab = document.querySelector(`[aria-controls="${id}"]`);
        if (tab) {
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
        }
        
        // Actualizar el indicador de pestaña
        actualizarIndicadorPestana();
    }
}

/**
 * Actualiza la posición y el ancho del indicador de pestaña activa
 */
function actualizarIndicadorPestana() {
    const tabActiva = document.querySelector('.tab.active');
    const indicador = document.getElementById('tab-indicator');
    
    if (tabActiva && indicador) {
        const rect = tabActiva.getBoundingClientRect();
        const containerRect = tabActiva.parentElement.getBoundingClientRect();
        
        indicador.style.width = `${rect.width}px`;
        indicador.style.transform = `translateX(${rect.left - containerRect.left}px)`;
    }
}

// Actualizar el indicador cuando la ventana cambie de tamaño
window.addEventListener('resize', actualizarIndicadorPestana);
