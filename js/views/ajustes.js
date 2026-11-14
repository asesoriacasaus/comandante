// Ajustes de conexión. El resto (objetivo, material, avisos) llega en la Fase 1.
import { getConfig, saveConfig, clearConfig } from '../state.js';
import { ping, call } from '../api.js';

export function render(el) {
  el.innerHTML = `
    <section>
      <p class="etiqueta">Ajustes</p>
      <h2>Conexión</h2>
      <form id="form-conexion" class="card" novalidate>
        <label>URL del Web App
          <input id="api-url" type="url" inputmode="url" autocomplete="off">
        </label>
        <label>Token de la app
          <input id="api-token" type="password" autocomplete="off">
        </label>
        <div class="acciones">
          <button type="submit" class="btn">Guardar</button>
          <button type="button" id="btn-ping" class="btn btn-sec">Probar servidor</button>
          <button type="button" id="btn-ai" class="btn btn-sec">Probar IA</button>
        </div>
        <p id="estado" class="estado" role="status" aria-live="polite"></p>
      </form>
      <p class="nota">El token se guarda solo en este dispositivo. Cambiarlo en el servidor invalida todos los clientes.</p>
      <div class="acciones"><button type="button" id="btn-salir" class="btn btn-sec">Cerrar sesión en este dispositivo</button></div>
    </section>`;

  const cfg = getConfig();
  const urlInput = el.querySelector('#api-url');
  const tokenInput = el.querySelector('#api-token');
  const estado = el.querySelector('#estado');
  urlInput.value = cfg.apiUrl;
  tokenInput.value = cfg.token;
  const mostrar = (msg, tipo = '') => { estado.textContent = msg; estado.className = 'estado ' + tipo; };
  const guardar = () => saveConfig({ apiUrl: urlInput.value, token: tokenInput.value });

  el.querySelector('#form-conexion').addEventListener('submit', (ev) => {
    ev.preventDefault();
    guardar();
    mostrar('Ajustes guardados', 'ok');
  });
  el.querySelector('#btn-ping').addEventListener('click', async () => {
    guardar(); mostrar('Probando servidor…');
    try { const d = await ping(); mostrar('Servidor correcto. Versión ' + d.version, 'ok'); }
    catch (err) { mostrar(err.message, 'error'); }
  });
  el.querySelector('#btn-ai').addEventListener('click', async () => {
    guardar(); mostrar('Probando la IA…');
    try { const d = await call('ping.ai', {}, { timeoutMs: 60000 }); mostrar('IA correcta (' + d.model + ', ' + d.ms + ' ms)', 'ok'); }
    catch (err) { mostrar(err.message, 'error'); }
  });
  el.querySelector('#btn-salir').addEventListener('click', () => {
    clearConfig();
    urlInput.value = ''; tokenInput.value = '';
    mostrar('Sesión cerrada en este dispositivo', 'ok');
  });
}
