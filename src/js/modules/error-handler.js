/**
 * Módulo para el manejo centralizado de errores
 * Proporciona funciones para registrar, notificar y manejar errores de manera consistente
 */

// Tipos de errores conocidos
export const ERROR_TYPES = {
    CAMERA: 'camera',
    GEOLOCATION: 'geolocation',
    STORAGE: 'storage',
    NETWORK: 'network',
    OCR: 'ocr',
    VALIDATION: 'validation',
    UNKNOWN: 'unknown'
};

// Niveles de severidad
export const SEVERITY = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
};

// Configuración de errores
const errorConfig = {
    [ERROR_TYPES.CAMERA]: {
        title: 'Error de Cámara',
        defaultMessage: 'No se pudo acceder a la cámara',
        severity: SEVERITY.ERROR,
        userFriendly: true
    },
    [ERROR_TYPES.GEOLOCATION]: {
        title: 'Error de Geolocalización',
        defaultMessage: 'No se pudo obtener la ubicación',
        severity: SEVERITY.WARNING,
        userFriendly: true
    },
    [ERROR_TYPES.STORAGE]: {
        title: 'Error de Almacenamiento',
        defaultMessage: 'Error al guardar o cargar datos',
        severity: SEVERITY.ERROR,
        userFriendly: true
    },
    [ERROR_TYPES.NETWORK]: {
        title: 'Error de Red',
        defaultMessage: 'Error de conexión. Verifica tu conexión a Internet',
        severity: SEVERITY.WARNING,
        userFriendly: true
    },
    [ERROR_TYPES.OCR]: {
        title: 'Error de Reconocimiento',
        defaultMessage: 'No se pudo procesar el texto en la imagen',
        severity: SEVERITY.WARNING,
        userFriendly: true
    },
    [ERROR_TYPES.VALIDATION]: {
        title: 'Error de Validación',
        defaultMessage: 'Datos no válidos',
        severity: SEVERITY.WARNING,
        userFriendly: true
    },
    [ERROR_TYPES.UNKNOWN]: {
        title: 'Error',
        defaultMessage: 'Ha ocurrido un error inesperado',
        severity: SEVERITY.ERROR,
        userFriendly: true
    }
};

// Almacenamiento de errores (últimos 100 errores)
const errorHistory = [];
const MAX_ERROR_HISTORY = 100;

/**
 * Registra un error en el sistema
 * @param {string} type - Tipo de error (de ERROR_TYPES)
 * @param {Error|string} error - Objeto de error o mensaje
 * @param {Object} [context] - Contexto adicional del error
 * @param {string} [customMessage] - Mensaje personalizado para el usuario
 * @returns {Object} Información del error registrado
 */
export function logError(type, error, context = {}, customMessage = null) {
    const timestamp = new Date().toISOString();
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    
    const errorInfo = {
        id: errorId,
        timestamp,
        type,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : new Error().stack,
        context,
        ...errorConfig[type] || errorConfig[ERROR_TYPES.UNKNOWN]
    };
    
    if (customMessage) {
        errorInfo.userMessage = customMessage;
    }
    
    // Añadir al historial
    errorHistory.unshift(errorInfo);
    if (errorHistory.length > MAX_ERROR_HISTORY) {
        errorHistory.pop();
    }
    
    // Registrar en consola
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${errorInfo.message}`;
    if (errorInfo.severity === SEVERITY.ERROR || errorInfo.severity === SEVERITY.CRITICAL) {
        console.error(logMessage, errorInfo);
    } else if (errorInfo.severity === SEVERITY.WARNING) {
        console.warn(logMessage, errorInfo);
    } else {
        console.log(logMessage, errorInfo);
    }
    
    return errorInfo;
}

/**
 * Obtiene el historial de errores
 * @param {number} [limit=10] - Número máximo de errores a devolver
 * @returns {Array} Lista de errores
 */
export function getErrorHistory(limit = 10) {
    return errorHistory.slice(0, limit);
}

/**
 * Maneja un error y muestra un mensaje al usuario si es necesario
 * @param {string} type - Tipo de error (de ERROR_TYPES)
 * @param {Error|string} error - Objeto de error o mensaje
 * @param {Object} [options] - Opciones adicionales
 * @param {string} [options.customMessage] - Mensaje personalizado para el usuario
 * @param {boolean} [options.showToUser] - Si se debe mostrar el error al usuario
 * @param {Function} [options.onError] - Callback a ejecutar con el error
 * @returns {Object} Información del error registrado
 */
export function handleError(type, error, options = {}) {
    const {
        customMessage = null,
        showToUser = true,
        onError = null,
        ...context
    } = options;
    
    const errorInfo = logError(type, error, context, customMessage);
    
    // Mostrar al usuario si es necesario
    if (showToUser && errorInfo.userFriendly) {
        const { title, userMessage = errorInfo.defaultMessage } = errorInfo;
        // Usar el módulo de UI para mostrar el error
        if (typeof mostrarEstado === 'function') {
            mostrarEstado(errorInfo.severity, userMessage, title);
        } else {
            console.warn('UI module not available to show error to user');
        }
    }
    
    // Llamar al callback si se proporcionó
    if (typeof onError === 'function') {
        try {
            onError(errorInfo);
        } catch (callbackError) {
            console.error('Error en el callback de manejo de errores:', callbackError);
        }
    }
    
    return errorInfo;
}

/**
 * Crea un envoltorio para manejar errores en funciones asíncronas
 * @param {Function} asyncFunction - Función asíncrona a envolver
 * @param {Object} [options] - Opciones para el manejo de errores
 * @returns {Function} Función envuelta con manejo de errores
 */
export function withErrorHandling(asyncFunction, options = {}) {
    return async function(...args) {
        try {
            return await asyncFunction.apply(this, args);
        } catch (error) {
            const errorInfo = handleError(
                options.type || ERROR_TYPES.UNKNOWN, 
                error, 
                { ...options, context: { ...options.context, args } }
            );
            
            // Si se especificó un valor de retorno por defecto para errores
            if ('defaultReturn' in options) {
                return options.defaultReturn;
            }
            
            // Si no hay valor por defecto, propagar el error
            throw errorInfo;
        }
    };
}

/**
 * Crea un manejador de eventos con manejo de errores
 * @param {Function} eventHandler - Manejador de eventos
 * @param {Object} [options] - Opciones para el manejo de errores
 * @returns {Function} Manejador de eventos envuelto con manejo de errores
 */
export function withErrorHandlingEvent(eventHandler, options = {}) {
    return function(event) {
        try {
            // Prevenir el comportamiento por defecto para errores
            if (event && typeof event.preventDefault === 'function') {
                event.preventDefault();
            }
            
            const result = eventHandler.call(this, event);
            
            // Manejar promesas retornadas
            if (result && typeof result.catch === 'function') {
                return result.catch(error => {
                    handleError(
                        options.type || ERROR_TYPES.UNKNOWN, 
                        error, 
                        { ...options, context: { event } }
                    );
                    
                    // Evitar que el error se propague a window.onerror
                    if (event && typeof event.stopPropagation === 'function') {
                        event.stopPropagation();
                    }
                    
                    // No propagar el error
                    return options.defaultReturn;
                });
            }
            
            return result;
        } catch (error) {
            handleError(
                options.type || ERROR_TYPES.UNKNOWN, 
                error, 
                { ...options, context: { event } }
            );
            
            // Evitar que el error se propague a window.onerror
            if (event && typeof event.stopPropagation === 'function') {
                event.stopPropagation();
            }
            
            // No propagar el error
            return options.defaultReturn;
        }
    };
}

// Manejar errores globales no capturados
if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
        const error = event.error || event;
        handleError(ERROR_TYPES.UNKNOWN, error, {
            showToUser: false,
            context: {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            }
        });
    });
    
    // Manejar promesas rechazadas no manejadas
    window.addEventListener('unhandledrejection', (event) => {
        const error = event.reason || new Error('Promise rechazada sin razón');
        handleError(ERROR_TYPES.UNKNOWN, error, {
            showToUser: false,
            context: {
                isUnhandledRejection: true
            }
        });
    });
}

export default {
    ERROR_TYPES,
    SEVERITY,
    logError,
    getErrorHistory,
    handleError,
    withErrorHandling,
    withErrorHandlingEvent
};
