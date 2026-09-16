import { open } from '@tauri-apps/plugin-dialog';

const CHARACTER_FILE_FILTERS = [
  { name: 'Personaje', extensions: ['vrm', 'glb', 'json'] },
];

export async function pickCharacterFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: CHARACTER_FILE_FILTERS,
  });
  return typeof selected === 'string' ? selected : null;
}
