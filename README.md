# Yu-Gi-Oh! GOAT Format — Versión iPad 10 (PWA Táctil)

Esta carpeta contiene la adaptación completa de **GOAT Local Lab** para **iPad 10 (10.9" Liquid Retina)** y dispositivos táctiles iPadOS, configurada como una **Progressive Web App (PWA)** independiente y compatible con despliegue continuo mediante **GitHub Actions / GitHub Pages**.

---

## 📱 Características y Optimizaciones Táctiles

1. **Pantalla Completa y Formato 1.44:1:**
   - Diseñado específicamente para el ratio de aspecto y resolución del iPad 10 ($2360 \times 1640$).
   - Soporte para **Safe Areas** (`env(safe-area-inset-bottom)`) que protege la mano del jugador frente a la barra de gestos inferior de iPadOS (*Home Indicator*).
2. **Sistema de Control Táctil (Touch-First):**
   - **Pulsación Prolongada (Long-Press):** Mantén pulsada cualquier carta en el campo, mano o cementerio durante ~400 ms para abrir inmediatamente el Inspector de Detalles con vibración háptica.
   - **Pulsación Simple:** Abre el menú flotante con botones de acción grandes ($\ge 44\text{px}$) y accesibles para los pulgares ("Invocar", "Colocar", "Activar efecto", "Ver Detalles").
   - **Toque fuera:** Tocar cualquier zona vacía del tapete deselecciona cartas y cierra menús limpiamente sin necesidad de pulsar la 'X'.
   - **Constructor de Mazos Táctil:** Botones táctiles directos `+` y `×` para añadir y retirar cartas con fluidez en pantalla táctil sin depender del arrastre de ratón.
3. **Audio WebKit Safari:**
   - Desbloqueo automático del `AudioContext` en el primer toque táctil (`touchstart`/`pointerdown`) para reproducción instantánea de efectos de sonido.
4. **Modo Offline con Service Worker:**
   - El archivo `sw.js` almacena en caché el motor WebAssembly OCGCore, los scripts de cartas, los sonidos y las texturas para que el juego funcione sin conexión a internet.

---

## 🚀 Despliegue Automático con GitHub Pages

El proyecto incluye el workflow de GitHub Actions [`.github/workflows/deploy-ipad-pwa.yml`](../.github/workflows/deploy-ipad-pwa.yml).

### Pasos para habilitarlo en tu repositorio de GitHub:
1. Sube los cambios a tu repositorio en GitHub (`git push origin main`).
2. En GitHub, ve a **Settings** $\rightarrow$ **Pages**.
3. En la sección **Build and deployment**, en **Source**, selecciona **GitHub Actions**.
4. Cada vez que hagas `git push`, GitHub Actions compilará la versión iPad y la publicará automáticamente en tu URL de GitHub Pages (ej: `https://tu-usuario.github.io/tu-repo/`).

---

## 📲 Cómo Instalar en tu iPad 10

1. Abre **Safari** en tu iPad 10 y entra en la URL de tu GitHub Pages.
2. Toca el botón de **Compartir** (icono con cuadrado y flecha hacia arriba en la barra de Safari).
3. Selecciona **"Añadir a pantalla de inicio"** (*Add to Home Screen*).
4. Toca **Añadir**.
5. ¡Listo! Se creará un icono en tu iPad que abre el simulador a **pantalla completa**, sin marcos de navegador, con rendimiento nativo de WebAssembly y soporte offline.

---

## 🛠️ Comandos de Desarrollo Local

Desde la raíz del proyecto:

```powershell
# Iniciar servidor de desarrollo para iPad
npm run dev:ipad

# Compilar la versión de producción para iPad
npm run build:ipad

# Previsualizar el paquete compilado
npm run preview:ipad
```
