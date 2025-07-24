# Autodesfase

**Autodesfase** es una aplicación web progresiva (PWA) diseñada para capturar evidencia fotográfica con metadatos de tiempo y ubicación. La aplicación registra automáticamente la hora oficial de Chile y las coordenadas GPS en cada captura, creando un registro confiable para documentación técnica y legal.

---

## 📷 ¿Qué hace Autodesfase?

- Captura fotos con la cámara trasera del dispositivo móvil
- Registra automáticamente la hora oficial de Chile (CLT/CLST)
- Incluye coordenadas GPS en cada captura (si están disponibles)
- Almacena un historial local de todas las capturas
- Permite visualizar la ubicación en Google Maps
- Interfaz limpia y fácil de usar

---

## 🚀 Características

- **Captura Inteligente**: Toma fotos con metadatos de tiempo y ubicación
- **Hora Oficial**: Muestra la hora exacta según la hora oficial de Chile
- **Geolocalización**: Registra automáticamente las coordenadas GPS
- **Historial Local**: Almacena todas las capturas en el navegador
- **Diseño Responsivo**: Se adapta a diferentes tamaños de pantalla
- **Modo Claro/Oscuro**: Se ajusta automáticamente según la preferencia del sistema
- **Sin Servidores**: Todo se procesa localmente en tu dispositivo

---

## 📲 Cómo usar

1. Abre la aplicación en tu navegador móvil o instálala como PWA
2. Otorga los permisos de cámara y ubicación cuando se soliciten
3. Presiona el botón **Capturar evidencia** para tomar una foto
4. La captura se guardará automáticamente con:
   - Hora oficial de Chile
   - Fecha completa
   - Coordenadas GPS (si están disponibles)
5. Revisa tus capturas en la pestaña de **Historial**
6. Toca cualquier imagen para ver su ubicación en Google Maps

---

## 📁 Estructura del proyecto

```
Autodesfase/
├── index.html          # Interfaz de usuario principal
├── style.css           # Estilos y diseño responsivo
├── app.js              # Lógica principal de la aplicación
├── captura-db.js       # Manejo del almacenamiento local
└── README.md           # Documentación
```

## 🛠️ Requisitos

- Navegador web moderno (Chrome, Edge, Firefox, Safari)
- Dispositivo con cámara
- Permisos de cámara y ubicación
- Opcional: Instalación como PWA para mejor experiencia

---

## ✨ Características Técnicas

- **Almacenamiento**: Usa localStorage para guardar las capturas
- **Rendimiento**: Optimizado para funcionar en dispositivos móviles
- **Seguridad**: Todo el procesamiento se realiza localmente
- **Offline**: Funciona sin conexión después de la instalación

---

## 🧭 Licencia

Este proyecto es de código abierto y puede ser utilizado, modificado y compartido libremente según tus necesidades.

---

## 🐛 Reportar problemas

Si encuentras algún problema o tienes sugerencias, por favor abre un [issue](https://github.com/tu-usuario/TimeCam/issues) en el repositorio del proyecto.
