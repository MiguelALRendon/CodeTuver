import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';

const PET_WINDOW_LABEL = 'pet';
const PET_WINDOW_URL = 'index.html';

let petWindow: WebviewWindow | null = null;

// Devuelve una promesa resuelta hasta que el webview real termina de crearse: llamar setSize/setPosition antes (sincrono tras `new WebviewWindow`) corre contra un handle que Tauri aun no genero, y las llamadas se pierden en silencio -- confirmado en vivo (CDP): la primera apertura de la sesion se quedaba en el tamaño por omision de Tauri (800x600) pese a pedir 100x100.
function createPetWindow(alwaysOnTop: boolean): Promise<WebviewWindow> {
  const win = new WebviewWindow(PET_WINDOW_LABEL, {
    url: PET_WINDOW_URL,
    transparent: true,
    decorations: false,
    // Confirmado por la documentacion de Tauri (window.d.ts): en Windows, una ventana sin decoracion con shadow:true (o sin setear) dibuja un borde blanco de 1px -- exactamente el borde reportado (D10 hipotesis i).
    shadow: false,
    alwaysOnTop,
    focusable: false,
    resizable: false,
    skipTaskbar: true,
    visible: false,
  });
  return new Promise((resolve, reject) => {
    win.once('tauri://created', () => resolve(win));
    win.once('tauri://error', (event) =>
      reject(new Error(String(event.payload))),
    );
  });
}

// `petWindow` (variable de modulo) no sobrevive un recargo del frontend, pero el webview real en Tauri si -- sin este chequeo, un segundo `new WebviewWindow('pet', ...)` para la misma etiqueta rechaza con "a webview with label `pet` already exists" en vez de reusarlo.
async function getOrCreatePetWindow(
  alwaysOnTop: boolean,
): Promise<WebviewWindow> {
  const existing = await WebviewWindow.getByLabel(PET_WINDOW_LABEL);
  return existing ?? createPetWindow(alwaysOnTop);
}

export async function showPetWindow(
  position: { x: number; y: number },
  size: { width: number; height: number },
  alwaysOnTop: boolean,
): Promise<void> {
  if (!petWindow) {
    petWindow = await getOrCreatePetWindow(alwaysOnTop);
    // El menu nativo (`setAsAppMenu()` en native-menu.ts) se aplicaria por omision a esta ventana igual que a `main`; sin quitarlo, Windows reserva la fila del menu pese a `decorations: false` (D10 hipotesis ii, confirmado en vivo).
    await invoke('clear_pet_window_menu').catch(() => undefined);
  }
  await petWindow.setAlwaysOnTop(alwaysOnTop);
  await petWindow.setSize(new PhysicalSize(size.width, size.height));
  await petWindow.setPosition(new PhysicalPosition(position.x, position.y));
  await petWindow.show();
}

export async function hidePetWindow(): Promise<void> {
  await petWindow?.hide();
}
