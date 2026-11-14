# Comandante

Entrenador personal con IA para el iPhone: plan del día, registro del entreno por voz, comidas, peso y medidas, y carreras. App web instalable (GitHub Pages) con servidor en Google Apps Script y datos en Google Drive.

El plan de desarrollo completo está en [`PLAN.md`](PLAN.md).

## Seguridad

Este repositorio es público. No contiene claves, tokens ni datos personales:

- Las claves (Gemini, token de la app) viven en las Propiedades del script de Apps Script.
- Los datos del usuario viven en su Google Drive.
- Las credenciales de despliegue viven en los secretos del entorno `production` de GitHub, con aprobación obligatoria.

Si encuentras algo que parezca un secreto, abre un issue sin copiarlo.
