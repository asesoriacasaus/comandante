// Mensajes del indicador de actividad según el tiempo que lleva esperando. Función pura.
// null = no mostrar nada todavía (las respuestas rápidas no deben parpadear); '' = solo la barra.
export function mensajeActividad(ms) {
  if (ms < 400) return null;
  if (ms < 3000) return '';
  if (ms < 12000) return 'Trabajando… Puedes seguir moviéndote por la app.';
  if (ms < 60000) return 'Esto tarda más de lo normal. Sigue en marcha: puedes cambiar de sección sin perderlo.';
  return 'Sigue sin respuesta. Si no llega pronto, revisa tu conexión y reintenta.';
}
