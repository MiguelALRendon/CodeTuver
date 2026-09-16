import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export interface AttentionNotification {
  title: string;
  body: string;
}

async function hasNotificationPermission(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === 'granted';
}

// R4: sin permiso del SO la notificacion simplemente no sale; las demas señales de atencion siguen funcionando.
export async function sendAttentionNotification(
  notification: AttentionNotification,
): Promise<void> {
  try {
    if (!(await hasNotificationPermission())) return;
    sendNotification(notification);
  } catch (err) {
    console.error(
      '[atencion] no se pudo enviar la notificacion del sistema:',
      err,
    );
  }
}
