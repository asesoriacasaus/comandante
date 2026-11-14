// Ajustes de conexión (Hito 0). Resto de ajustes en hitos posteriores.
import { getConfig, saveConfig } from '../state.js';
import { ping } from '../api.js';

export function render(el) {
  el.innerHTML = `
    <section class="vista">
      <h2>Ajustes</h2>
      <form id="form-conexion" class="card" novalidate>
        <label>URL del Web App
          <input id="api-url" type="url" inputmode="url" autocomplete="off">
        </label>
        <label>Token de la app
          <input id="api-token" type="password" autocomplete="off">
        </label>
        <div class="acciones">
          <button type="submit" class="btn">Guardar</button>
          <button type="button" id="btn-ping" class="btn btn-sec">Probar conexión</button>
        </div>
        <p id="estado" class="estado" role="status" aria-live="polite"></p>
      </form>
      <p class="nota">El token se guarda solo en este dispositivo. Cambiarlo en el servidor invalida todos los clientes.</p>
    </section>`;

  const cfg = getConfig();
  const urlInput = el.querySelector('#api-url');
  const tokenInput = el.querySelector('#api-token');
  const estado = el.querySelector('#estado');
  urlInput.value = cfg.apiUrl;
  tokenInput.value = cfg.token;

  const mostrar = (msg, tipo = '') => {
    estado.textContent = msg;
    estado.className = 'estado ' + tipo;
  };

  el.querySelector('#form-conexion').addEventListener('submit', (ev) => {
    ev.preventDefault();
    saveConfig({ apiUrl: urlInput.value, token: tokenInput.value });
    mostrar('Ajustes guardados', 'ok');
  });

  el.querySelector('#btn-ping').addEventListener('click', async () => {
    saveConfig({ apiUrl: urlInput.value, token: tokenInput.value });
    mostrar('Probando conexión…');
    try {
      const datos = await ping();
      mostrar('Conexión correcta. Versión del servidor: ' + datos.version, 'ok');
    } catch (err) {
      console.error(err);
      mostrar(err.message, 'error');
    }
  });
}
