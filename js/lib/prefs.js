// Preferencias de este dispositivo (no viajan al servidor). La voz y el chat se pueden ocultar si no se usan.
const KEY = 'comandante.vozChat';

export function vozYChatActivos(storage) {
  try { return (storage || localStorage).getItem(KEY) !== 'off'; } catch (_) { return true; }
}

export function fijarVozYChat(activo, storage) {
  try { (storage || localStorage).setItem(KEY, activo ? 'on' : 'off'); } catch (_) { /* sin almacenamiento */ }
}
