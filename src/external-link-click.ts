import { openUrl } from '@tauri-apps/plugin-opener';

// Un enlace generado por markdown-it dentro de un webview navega la ventana entera si no se intercepta.
export function openExternalLinkOnClick(event: MouseEvent): void {
  const link = (event.target as HTMLElement).closest('a[href]');
  if (!link) return;
  event.preventDefault();
  void openUrl(link.getAttribute('href')!);
}
