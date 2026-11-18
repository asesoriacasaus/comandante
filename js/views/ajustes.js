// Ajustes de conexión. El resto (objetivo, material, avisos) llega en la Fase 1.
import { getConfig, saveConfig, clearConfig } from '../state.js';
import { parseNum } from '../lib/format.js';
import { limpiarCache } from '../lib/cache.js';
import { ping, call, getUltimoTiempo } from '../api.js';
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
      <h3 class="seccion">Entrenador</h3>
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
      <h3 class="seccion">Velocidad</h3>
      <div class="card">
        <p class="nota">Mide cuánto tarda cada paso: «Total» es lo que esperas tú; «servidor» es el tiempo dentro del servidor. La diferencia es la red y el arranque en frío. Si ves tiempos altos, mándamelos.</p>
        <div class="acciones"><button type="button" id="btn-velocidad" class="btn btn-sec">Medir velocidad</button></div>
        <pre id="vista-velocidad" class="salida" hidden></pre>
      </div>
      <h3 class="seccion">Correo semanal</h3>
      <div class="card">
        <p class="nota">Cada domingo recibes el balance y el plan de la semana siguiente. Aquí puedes ver cómo sería ahora mismo o enviarlo ya.</p>
        <div class="acciones">
          <button type="button" id="btn-prev" class="btn btn-sec">Vista previa</button>
          <button type="button" id="btn-enviar" class="btn btn-sec">Enviar ahora</button>
        </div>
        <p id="estado-semanal" class="estado" role="status" aria-live="polite"></p>
        <pre id="vista-semanal" class="salida" hidden></pre>
      </div>
      <h3 class="seccion">Copia de seguridad</h3>
      <div class="card">
        <p class="nota">Descarga todos tus datos en un archivo para guardarlo tú. Para restaurarlos, elige ese archivo: se fusionan con lo que ya tienes y no se borra nada.</p>
        <div class="acciones"><button type="button" id="btn-exportar" class="btn btn-sec">Exportar mis datos</button></div>
        <label>Importar una copia <input id="f-importar" type="file" accept="application/json,.json"></label>
        <p id="estado-copia" class="estado" role="status" aria-live="polite"></p>
      </div>
      <h3 class="seccion">Material</h3>
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
  el.querySelector('#btn-velocidad').addEventListener('click', async (ev) => {
    const salida = el.querySelector('#vista-velocidad');
    const btn = ev.currentTarget; btn.disabled = true; salida.hidden = false; salida.textContent = 'Midiendo…';
    const lineas = [];
    const pasos = [['ping', 'Servidor despierto (ping)'], ['ping', 'Segundo ping'], ['settings.get', 'Leer ajustes (1.ª vez)'], ['settings.get', 'Leer ajustes (2.ª vez)'], ['plan.state', 'Estado del plan']];
    for (const [accion, nombre] of pasos) {
      try {
        await call(accion, {}, { timeoutMs: 60000 });
        const t = getUltimoTiempo();
        lineas.push(nombre.padEnd(28) + ' total ' + String(t.total).padStart(5) + ' ms · servidor ' + (t.server === null ? '   ?' : String(t.server).padStart(5)) + ' ms');
      } catch (err) { lineas.push(nombre.padEnd(28) + ' error: ' + err.message); }
      salida.textContent = lineas.join('\n');
    }
    btn.disabled = false;
  });

  const estS = el.querySelector('#estado-semanal');
  const salidaS = el.querySelector('#vista-semanal');
  const semanal = async (dryRun) => {
    estS.className = 'estado'; estS.textContent = dryRun ? 'Preparando la vista previa…' : 'Enviando…'; salidaS.hidden = true;
    try {
      const r = await call('weekly.review', { dryRun, force: !dryRun }, { timeoutMs: 170000 });
      estS.className = 'estado ok'; estS.textContent = dryRun ? 'Vista previa de ' + r.subject : 'Enviado: ' + r.subject;
      salidaS.hidden = false; salidaS.textContent = r.text || '';
    } catch (err) { console.error(err); estS.className = 'estado error'; estS.textContent = err.message; }
  };
  el.querySelector('#btn-prev').addEventListener('click', () => semanal(true));
  el.querySelector('#btn-enviar').addEventListener('click', () => { if (confirm('¿Enviar ahora el correo semanal?')) semanal(false); });

  const estC = el.querySelector('#estado-copia');
  const copia = (m, t = '') => { estC.textContent = m; estC.className = 'estado ' + t; };
  el.querySelector('#btn-exportar').addEventListener('click', async () => {
    copia('Preparando la copia…');
    try {
      const data = await call('export.all', {}, { timeoutMs: 170000 });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const enlace = document.createElement('a');
      enlace.href = url; enlace.download = 'comandante-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.append(enlace); enlace.click(); enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      copia('Copia generada.', 'ok');
    } catch (err) { console.error(err); copia(err.message, 'error'); }
  });
  el.querySelector('#f-importar').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    if (f.size > 5.5 * 1024 * 1024) { copia('El archivo es demasiado grande para importarlo de una vez (máximo 5,5 MB).', 'error'); return; }
    let data;
    try { data = JSON.parse(await f.text()); } catch (_) { copia('El archivo no es un JSON válido.', 'error'); return; }
    if (!confirm('¿Importar esta copia? Se fusionará con tus datos actuales.')) { ev.target.value = ''; return; }
    copia('Importando…');
    try {
      const r = await call('import.all', { data }, { timeoutMs: 170000 });
      copia('Importado: ' + r.sessions + ' sesiones, ' + r.runs + ' carreras, ' + r.meals + ' comidas y ' + r.body + ' registros de cuerpo.', 'ok');
    } catch (err) { console.error(err); copia(err.message, 'error'); }
    ev.target.value = '';
  });

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
    limpiarCache();
    urlInput.value = ''; tokenInput.value = '';
    mostrar('Sesión cerrada en este dispositivo', 'ok');
  });
}
