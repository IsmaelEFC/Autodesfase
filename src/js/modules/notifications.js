/**
 * Módulo para manejar las notificaciones push en la aplicación
 */

// Clave pública de VAPID - Deberías reemplazarla con tu propia clave
// Esta es una clave de ejemplo y no debe usarse en producción
const VAPID_PUBLIC_KEY = 'BP4QvU6XJYQZJZ1XQ2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q2Q';

/**
 * Verifica si las notificaciones están soportadas en el navegador
 * @returns {boolean} - True si las notificaciones están soportadas
 */
export function notificacionesSoportadas() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Solicita permiso al usuario para mostrar notificaciones
 * @returns {Promise<boolean>} - True si se otorgó el permiso
 */
export async function solicitarPermisoNotificaciones() {
    if (!notificacionesSoportadas()) {
        console.warn('Las notificaciones push no están soportadas en este navegador');
        return false;
    }

    try {
        const permiso = await Notification.requestPermission();
        return permiso === 'granted';
    } catch (error) {
        console.error('Error al solicitar permiso para notificaciones:', error);
        return false;
    }
}

/**
 * Registra el service worker para notificaciones push
 * @returns {Promise<ServiceWorkerRegistration>} - Instancia del service worker registrado
 */
export async function registrarServiceWorker() {
    try {
        const registro = await navigator.serviceWorker.register('/sw.js');
        console.log('ServiceWorker registrado con éxito');
        return registro;
    } catch (error) {
        console.error('Error al registrar el ServiceWorker:', error);
        throw error;
    }
}

/**
 * Suscribe al usuario a las notificaciones push
 * @param {ServiceWorkerRegistration} swRegistration - Instancia del service worker registrado
 * @returns {Promise<PushSubscription>} - Suscripción a notificaciones push
 */
export async function suscribirAPush(swRegistration) {
    try {
        // Convertir la clave pública VAPID al formato correcto
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        
        // Suscribir al usuario
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
        
        console.log('Usuario suscrito a notificaciones push');
        return subscription;
    } catch (error) {
        if (Notification.permission === 'denied') {
            console.warn('El usuario ha denegado el permiso para notificaciones');
        } else {
            console.error('Error al suscribir a notificaciones push:', error);
        }
        throw error;
    }
}

/**
 * Convierte una clave base64 a un Uint8Array
 * @param {string} base64String - Cadena en base64
 * @returns {Uint8Array} - Array de bytes
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    
    return outputArray;
}

/**
 * Muestra una notificación local
 * @param {string} titulo - Título de la notificación
 * @param {Object} opciones - Opciones de la notificación
 * @param {string} opciones.cuerpo - Cuerpo del mensaje
 * @param {string} opciones.icono - URL del icono a mostrar
 * @param {string} opciones.imagen - URL de la imagen a mostrar
 * @param {Array} opciones.acciones - Array de acciones (botones) a mostrar
 * @returns {Notification} - Instancia de la notificación mostrada
 */
export function mostrarNotificacion(titulo, opciones = {}) {
    if (!notificacionesSoportadas()) {
        console.warn('Las notificaciones no están soportadas en este navegador');
        return null;
    }
    
    if (Notification.permission !== 'granted') {
        console.warn('No se tiene permiso para mostrar notificaciones');
        return null;
    }
    
    const configuracion = {
        body: '',
        icon: '/src/assets/icons/icon-192x192.png',
        badge: '/src/assets/icons/icon-192x192.png',
        vibrate: [200, 100, 200],
        data: { fecha: new Date(Date.now()).toString() },
        ...opciones
    };
    
    return new Notification(titulo, configuracion);
}

/**
 * Inicializa las notificaciones push
 * @returns {Promise<boolean>} - True si la inicialización fue exitosa
 */
export async function inicializarNotificaciones() {
    if (!notificacionesSoportadas()) {
        console.warn('Las notificaciones push no están soportadas en este navegador');
        return false;
    }
    
    try {
        // Verificar si ya estamos suscritos
        const registro = await navigator.serviceWorker.ready;
        const suscripcion = await registro.pushManager.getSubscription();
        
        if (suscripcion) {
            console.log('Ya está suscrito a notificaciones push');
            return true;
        }
        
        // Solicitar permiso
        const permiso = await solicitarPermisoNotificaciones();
        if (!permiso) {
            console.warn('El usuario denegó el permiso para notificaciones');
            return false;
        }
        
        // Registrar service worker y suscribir
        await registrarServiceWorker();
        await suscribirAPush(registro);
        
        console.log('Notificaciones push configuradas correctamente');
        return true;
    } catch (error) {
        console.error('Error al inicializar notificaciones push:', error);
        return false;
    }
}

// Inicializar notificaciones cuando se cargue la página
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        if (notificacionesSoportadas() && Notification.permission === 'default') {
            console.log('Solicitando permiso para notificaciones...');
            // No solicitamos permiso automáticamente para mejor UX
            // Podemos mostrar un botón más adelante para que el usuario lo active
        }
    });
}
