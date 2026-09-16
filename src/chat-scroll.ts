export const CHAT_AUTOSCROLL_THRESHOLD_PX = 80;

// D11: pura y sin DOM real para poder probarla -- recibe las 3 medidas de scroll ya leidas.
export function isNearChatBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  thresholdPx: number = CHAT_AUTOSCROLL_THRESHOLD_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= thresholdPx;
}
