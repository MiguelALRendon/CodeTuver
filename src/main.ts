import { createApp } from 'vue';
import App from './App.vue';
import PetView from './components/PetView.vue';
import { getCurrentWindowLabel } from './desktop-window-manager';
import './assets/styles/constants.css';
import './assets/styles/shared-controls.css';
import './assets/styles/scrollbar.css';

// Sin runtime Tauri (ej. npm run dev en un navegador puro, sin tauri dev), getCurrentWindowLabel() lanza — la sesion no debe quedar en blanco por eso (CLAUDE.md, "ninguna capa puede matar la sesion").
async function resolveWindowLabel(): Promise<string> {
  try {
    return await getCurrentWindowLabel();
  } catch {
    return 'main';
  }
}

async function bootstrap(): Promise<void> {
  const label = await resolveWindowLabel();
  createApp(label === 'pet' ? PetView : App).mount('#app');
}

void bootstrap();
