# Comandante

Entrenador personal con IA para el iPhone: plan del día según los días que han pasado y lo último que hiciste, registro del entreno por voz, comidas con macros y micronutrientes, peso y medidas, carreras y un correo semanal con el balance.

App web instalable (GitHub Pages) con servidor en Google Apps Script y datos en el Google Drive del propietario. IA: Gemini.

El plan de desarrollo, las decisiones y el estado están en [`PLAN.md`](PLAN.md).

## Desarrollo

```bash
npm test        # tests del frontend y del servidor (Apps Script) en Node
npm run scan    # busca claves o tokens en los archivos versionados
```

Un push a `main` ejecuta los tests, publica la web en Pages y, tras la aprobación del propietario en el entorno `production`, sube el servidor con `clasp`.

## Seguridad

Este repositorio es público. No contiene claves, tokens ni datos personales:

- Las claves (Gemini, token de la app) y el texto de la personalidad del entrenador viven en las Propiedades del script de Apps Script.
- Los datos del usuario (perfil, medidas, sesiones, comidas) viven en su Google Drive.
- Las credenciales de despliegue viven en los secretos del entorno `production` de GitHub, con aprobación obligatoria.

Si encuentras algo que parezca un secreto, abre un issue sin copiarlo.
