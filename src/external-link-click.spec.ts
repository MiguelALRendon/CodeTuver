import { describe, expect, it, vi } from 'vitest';

const openUrl = vi.fn();
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (url: string) => openUrl(url),
}));

const { openExternalLinkOnClick } = await import('./external-link-click');

function fakeTarget(
  closestResult: { getAttribute(name: string): string | null } | null,
): HTMLElement {
  return { closest: () => closestResult } as unknown as HTMLElement;
}

function clickEventOn(target: HTMLElement): MouseEvent {
  return { target, preventDefault: vi.fn() } as unknown as MouseEvent;
}

describe('openExternalLinkOnClick', () => {
  it('abre el enlace real con el navegador del sistema y cancela la navegacion del webview', () => {
    const link = { getAttribute: () => 'https://example.com' };
    const event = clickEventOn(fakeTarget(link));

    openExternalLinkOnClick(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('ignora clics que no vienen de un enlace', () => {
    const event = clickEventOn(fakeTarget(null));
    openUrl.mockClear();

    openExternalLinkOnClick(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });
});
