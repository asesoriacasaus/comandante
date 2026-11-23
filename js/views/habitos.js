// Sol y agua: lo que aporta vitamina D (el sol), calcio y magnesio (el agua) sin pasar por la comida. Se cuenta una vez y se usa cada día.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { parseNum } from '../lib/format.js';
import { borrar } from '../lib/cache.js';
import { fmtDec, perfilSolPorDefecto, PRESETS_AGUA, REGIONES_SOL, avisoSol } from '../lib/nutrition.js';

export function pantallaHabitos(el, ctx) {
  const vigente = () => el.dataset.route === 'comida';
  const sol = perfilSolPorDefecto(ctx.habits && ctx.habits.sun);
  const agua = Object.assign({ calciumMgL: 60, magnesiumMgL: 15, litersPerDay: 1.5 }, (ctx.habits && ctx.habits.water) || {});

  const refrescar = async () => { borrar('comida:' + ctx.hoy); try { return await call('nutrition.state', { date: ctx.hoy }, { timeoutMs: 60000, silent: true }); } catch (_) { return null; } };
  const guardar = async (patch) => { await call('settings.update', { patch: { nutrition: patch } }, { timeoutMs: 60000 }); };

  // ---------- Sol ----------
  const estadoSol = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const minutos = h('input', { inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Minutos de sol al día', value: String(sol.minutes) });
  const piel = h('select', { 'aria-label': 'Piel al descubierto' },
    ...[['face', 'Cara y manos'], ['arms', 'Cara, manos y brazos'], ['legs', 'Brazos y piernas']].map(([v, t]) => h('option', Object.assign({ value: v }, sol.skin === v ? { selected: true } : {}), t)));
  const region = h('select', { 'aria-label': 'Zona' },
    ...REGIONES_SOL.map((r) => h('option', Object.assign({ value: String(r.lat) }, sol.lat === r.lat ? { selected: true } : {}), r.etiqueta)));
  const mediodia = h('input', { type: 'checkbox', checked: sol.midday !== false });
  const protector = h('input', { type: 'checkbox', checked: !!sol.spf });
  const atajos = h('div', { class: 'porcentajes' }, ...[0, 15, 30, 60, 90].map((m) => h('button', { type: 'button', class: 'chip chip-boton', onClick: () => { minutos.value = String(m); } }, m + ' min')));
  const guardarSol = h('button', { type: 'button', class: 'btn' }, 'Guardar mi sol');
  guardarSol.addEventListener('click', async () => {
    const n = parseNum(minutos.value);
    if (n === null || n < 0 || n > 600) { estadoSol.className = 'estado error'; estadoSol.textContent = 'Escribe los minutos de sol al día (de 0 a 600).'; return; }
    guardarSol.disabled = true; estadoSol.className = 'estado'; estadoSol.textContent = 'Guardando…';
    try {
      await guardar({ sun: { minutes: n, skin: piel.value, midday: mediodia.checked, spf: protector.checked, lat: Number(region.value) } });
      const st = await refrescar();
      const habits = { sun: { minutes: n } };
      const aviso = st ? avisoSol(habits, st.extras) : null;
      estadoSol.className = 'estado ok';
      estadoSol.textContent = 'Guardado. ' + (st && st.extras && st.extras.vitDUg ? 'Con lo que me cuentas, el sol aporta unos ' + fmtDec(st.extras.vitDUg) + ' µg de vitamina D hoy (estimación muy gruesa).' : aviso ? aviso.texto : '');
    } catch (err) { console.error(err); estadoSol.className = 'estado error'; estadoSol.textContent = err.message; }
    guardarSol.disabled = false;
  });
  const quitarSol = h('button', { type: 'button', class: 'btn btn-sec' }, 'No contar el sol');
  quitarSol.addEventListener('click', async () => {
    quitarSol.disabled = true;
    try { await guardar({ sun: null }); await refrescar(); estadoSol.className = 'estado ok'; estadoSol.textContent = 'Listo: la vitamina D solo contará la comida y los suplementos.'; }
    catch (err) { console.error(err); estadoSol.className = 'estado error'; estadoSol.textContent = err.message; }
    quitarSol.disabled = false;
  });

  // ---------- Agua ----------
  const estadoAgua = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const calcio = h('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Calcio en mg por litro', value: fmtDec(agua.calciumMgL) });
  const magnesio = h('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Magnesio en mg por litro', value: fmtDec(agua.magnesiumMgL) });
  const litros = h('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Litros de agua al día', value: fmtDec(agua.litersPerDay) });
  const presets = h('div', { class: 'porcentajes' }, ...PRESETS_AGUA.map((p) => h('button', { type: 'button', class: 'chip chip-boton', onClick: () => { calcio.value = fmtDec(p.calciumMgL); magnesio.value = fmtDec(p.magnesiumMgL); } }, p.etiqueta)));
  const guardarAgua = h('button', { type: 'button', class: 'btn' }, 'Guardar mi agua');
  guardarAgua.addEventListener('click', async () => {
    const ca = parseNum(calcio.value); const mg = parseNum(magnesio.value); const l = parseNum(litros.value);
    if ([ca, mg, l].some((v) => v === null || v < 0) || ca > 600 || mg > 200 || l > 8) { estadoAgua.className = 'estado error'; estadoAgua.textContent = 'Revisa los números: calcio de 0 a 600, magnesio de 0 a 200 y litros de 0 a 8.'; return; }
    guardarAgua.disabled = true; estadoAgua.className = 'estado'; estadoAgua.textContent = 'Guardando…';
    try { await guardar({ water: { calciumMgL: ca, magnesiumMgL: mg, litersPerDay: l } }); await refrescar(); estadoAgua.className = 'estado ok'; estadoAgua.textContent = 'Guardado: el agua aporta unos ' + fmtDec(ca * l) + ' mg de calcio y ' + fmtDec(mg * l) + ' mg de magnesio al día.'; }
    catch (err) { console.error(err); estadoAgua.className = 'estado error'; estadoAgua.textContent = err.message; }
    guardarAgua.disabled = false;
  });
  const quitarAgua = h('button', { type: 'button', class: 'btn btn-sec' }, 'No contar el agua');
  quitarAgua.addEventListener('click', async () => {
    quitarAgua.disabled = true;
    try { await guardar({ water: null }); await refrescar(); estadoAgua.className = 'estado ok'; estadoAgua.textContent = 'Listo: el calcio y el magnesio solo contarán la comida.'; }
    catch (err) { console.error(err); estadoAgua.className = 'estado error'; estadoAgua.textContent = err.message; }
    quitarAgua.disabled = false;
  });

  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Comida'), h('h2', {}, 'Sol y agua'),
    h('p', { class: 'nota' }, 'Hay nutrientes que no vienen solo de lo que comes. Cuéntalo una vez y la app lo suma cada día. Son estimaciones orientativas.'),
    h('div', { class: 'bloque' }, h('h3', {}, 'Tu sol'),
      h('p', { class: 'nota' }, 'La mayor parte de la vitamina D se fabrica en la piel con el sol. Sin contarlo, casi todo el mundo parece tener poca.'),
      h('p', { class: 'aviso' }, 'Conducir o estar junto a una ventana no cuenta: el cristal del coche y de la oficina bloquea casi toda la radiación UVB, que es la que produce vitamina D. Sí cuentan pasear, la terraza o ir a pie.'),
      h('label', {}, 'Minutos de sol directo en un día normal, con la piel al descubierto', minutos), atajos,
      h('label', {}, '¿Cuánta piel está al descubierto?', piel),
      h('label', {}, 'Dónde vives', region),
      h('label', { class: 'casilla' }, mediodia, h('span', {}, 'Sobre todo hacia el mediodía (de 11 a 17 h)')),
      h('label', { class: 'casilla' }, protector, h('span', {}, 'Suelo llevar protector solar')),
      h('div', { class: 'acciones' }, guardarSol, quitarSol), estadoSol,
      h('p', { class: 'nota' }, 'De noviembre a febrero, en España, el sol produce muy poca vitamina D incluso al mediodía. Solo un análisis de sangre (25-hidroxivitamina D) dice tu nivel real.')),
    h('div', { class: 'bloque' }, h('h3', {}, 'Tu agua'),
      h('p', { class: 'nota' }, 'El agua puede aportar bastante calcio y magnesio, según la zona y la marca. Míralo en la etiqueta de la botella (calcio y magnesio, en mg/l) o en el análisis de agua de tu ayuntamiento, o elige una aproximación.'),
      presets,
      h('div', { class: 'rejilla' }, h('label', {}, 'Calcio (mg/l)', calcio), h('label', {}, 'Magnesio (mg/l)', magnesio)),
      h('label', {}, 'Litros que bebes al día', litros),
      h('div', { class: 'acciones' }, guardarAgua, quitarAgua), estadoAgua),
    h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: ctx.volver }, 'Volver a Comida'))));
  if (!vigente()) return;
}
