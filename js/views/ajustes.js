// Ajustes de conexión. El resto (objetivo, material, avisos) llega en la Fase 1.
import { getConfig, saveConfig, clearConfig } from '../state.js';
import { parseNum } from '../lib/format.js';
import { ping, call } from '../api.js';
import { BUILD } from '../version.js';

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
      <h2>Entrenador</h2>
      <form id="form-coach" class="card" novalidate>
        <label>Intensidad del Comandante
          <select id="c-intensidad">
            <option value="baja">Baja: serena, poca arenga</option>
            <option value="media">Media: firme</option>
            <option value="alta">Alta: enérgica y combativa</option>
          </select>
        </label>
        <div class="acciones"><button type="submit" class="btn">Guardar</button></div>
        <p id="estado-coach" class="estado" role="status" aria-live="polite"></p>
      </form>
      <h2>Material</h2>
      <form id="form-material" class="card" novalidate>
        <label>Peso de la barra olímpica (kg)<input id="m-barra" inputmode="decimal" autocomplete="off"></label>
        <label>Peso de la barra Z (kg)<input id="m-z" inputmode="decimal" autocomplete="off"></label>
        <label>Salto entre mancuernas (kg)<input id="m-mancuerna" inputmode="decimal" autocomplete="off"></label>
        <label>Salto de las placas de la pila (kg)<input id="m-pila" inputmode="decimal" autocomplete="off"></label>
        <div class="acciones"><button type="submit" class="btn">Guardar material</button></div>
        <p id="estado-material" class="estado" role="status" aria-live="polite"></p>
      </form>
      <p class="nota">Versión de la app: ${BUILD.slice(0, 8)}</p>
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
  const campos = { barbellKg: '#m-barra', ezBarKg: '#m-z', dumbbellStepKg: '#m-mancuerna', stackStepKg: '#m-pila' };
  const estadoM = el.querySelector('#estado-material');
  const mostrarM = (msg, tipo = '') => { estadoM.textContent = msg; estadoM.className = 'estado ' + tipo; };
  if (cfg.apiUrl && cfg.token) {
    call('settings.get', {}, { timeoutMs: 60000 }).then((s) => {
      if (el.dataset.route !== 'ajustes') return;
      for (const [k, sel] of Object.entries(campos)) el.querySelector(sel).value = String(s.equipment[k]).replace('.', ',');
      if (s.coach && s.coach.intensity) el.querySelector('#c-intensidad').value = s.coach.intensity;
    }).catch((err) => { console.error(err); mostrarM('No se pudo leer el material: ' + err.message, 'error'); });
  }
  el.querySelector('#form-coach').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const e = el.querySelector('#estado-coach');
    e.textContent = 'Guardando…'; e.className = 'estado';
    try { await call('settings.update', { patch: { coach: { intensity: el.querySelector('#c-intensidad').value } } }, { timeoutMs: 60000 }); e.textContent = 'Guardado.'; e.className = 'estado ok'; }
    catch (err) { console.error(err); e.textContent = err.message; e.className = 'estado error'; }
  });
  el.querySelector('#form-material').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const equipment = {};
    for (const [k, sel] of Object.entries(campos)) equipment[k] = parseNum(el.querySelector(sel).value);
    if (Object.values(equipment).some((v) => v === null || v <= 0)) { mostrarM('Rellena los cuatro valores con números mayores que cero.', 'error'); return; }
    mostrarM('Guardando…');
    try { await call('settings.update', { patch: { equipment } }, { timeoutMs: 60000 }); mostrarM('Material guardado. Se aplica a las series nuevas.', 'ok'); }
    catch (err) { console.error(err); mostrarM(err.message, 'error'); }
  });

  el.querySelector('#btn-salir').addEventListener('click', () => {
    clearConfig();
    urlInput.value = ''; tokenInput.value = '';
    mostrar('Sesión cerrada en este dispositivo', 'ok');
  });
}
