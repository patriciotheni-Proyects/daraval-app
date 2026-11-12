/* global ALIMENTOS, POR_ID, UNIDAD */
const $ = (id) => document.getElementById(id);
const TIPOS = [
  ['desayuno', 'Desayuno'],
  ['almuerzo', 'Almuerzo'],
  ['merienda', 'Merienda'],
  ['cena', 'Cena'],
  ['colacion', 'Colaciones'],
];
const CIRCUNFERENCIA = 326.7;

const estado = { fecha: hoy(), limite: 2000, comidas: [] };
let seleccion = null; // alimento elegido en el diálogo (null = carga a mano)
let fotoPendiente = null;

// ---------- utilidades ----------
function hoy() {
  const d = new Date();
  return fechaISO(d);
}
function fechaISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function moverFecha(fecha, dias) {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return fechaISO(d);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function normalizar(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
const kcalPorcion = (a) => (a.kcal100 * a.g) / 100;
const num = (n) => Math.round(n).toLocaleString('es-AR');
const cant = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    ...opciones,
    headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(cuerpo.error || `Error ${r.status}`);
  return cuerpo;
}
function fallo(e) {
  alert('No se pudo completar la operación: ' + e.message);
}

// ---------- sugerencias para reducir ----------
// Opciones para bajar calorías de una comida ya cargada, de mayor a menor ahorro.
function opcionesDeReduccion(c) {
  const out = [];
  const a = c.alimentoId && POR_ID[c.alimentoId];
  if (a) {
    for (const id of a.swaps) {
      const alt = POR_ID[id];
      if (!alt) continue;
      const kcalAlt = Math.round(kcalPorcion(alt) * c.porciones);
      const ahorro = c.kcal - kcalAlt;
      if (ahorro >= 20) {
        out.push({
          tipo: 'cambio',
          texto: `Cambiar por ${alt.nombre} (${cant(c.porciones)} × ${alt.porcion}, ${num(kcalAlt)} kcal)`,
          ahorro,
        });
      }
    }
  }
  if (c.kcal >= 100) out.push({ tipo: 'porcion', texto: 'Comer la mitad de la porción', ahorro: Math.round(c.kcal / 2) });
  return out.sort((x, y) => y.ahorro - x.ahorro);
}

// Elige la mejor opción (según filtro) de cada comida y acumula hasta cubrir el exceso.
function armarCombinacion(comidas, exceso, filtro) {
  const candidatos = comidas
    .map((c) => ({ c, o: opcionesDeReduccion(c).filter(filtro)[0] }))
    .filter((x) => x.o)
    .sort((x, y) => y.o.ahorro - x.o.ahorro);
  const pasos = [];
  let ahorro = 0;
  for (const cand of candidatos) {
    if (ahorro >= exceso) break;
    pasos.push(cand);
    ahorro += cand.o.ahorro;
  }
  return { pasos, ahorro };
}

function combinaciones(comidas, exceso) {
  const variantes = [
    ['Con la menor cantidad de cambios', () => true],
    ['Solo cambiando alimentos', (o) => o.tipo === 'cambio'],
    ['Solo achicando porciones', (o) => o.tipo === 'porcion'],
  ];
  const vistas = new Set();
  const out = [];
  for (const [titulo, filtro] of variantes) {
    const combo = armarCombinacion(comidas, exceso, filtro);
    if (!combo.pasos.length) continue;
    const firma = combo.pasos.map((p) => p.c.id + p.o.texto).sort().join('|');
    if (vistas.has(firma)) continue;
    vistas.add(firma);
    out.push({ titulo, ...combo, alcanza: combo.ahorro >= exceso });
  }
  // Primero las que alcanzan a cubrir el exceso.
  return out.sort((x, y) => y.alcanza - x.alcanza);
}

// ---------- render ----------
function total() {
  return estado.comidas.reduce((s, c) => s + c.kcal, 0);
}

function renderResumen() {
  const t = total();
  const resto = estado.limite - t;
  const fraccion = Math.min(t / estado.limite, 1);
  const avance = $('anilloAvance');
  avance.style.strokeDashoffset = CIRCUNFERENCIA * (1 - fraccion);
  const clase = resto < 0 ? 'pasado' : fraccion >= 0.85 ? 'cerca' : 'ok';
  avance.style.stroke = `var(--${clase === 'pasado' ? 'rojo' : clase === 'cerca' ? 'ambar' : 'verde'})`;
  $('anilloNumero').textContent = num(t);
  $('anilloTexto').textContent = `de ${num(estado.limite)} kcal`;
  $('limiteValor').textContent = num(estado.limite);
  const e = $('estado');
  e.className = 'estado ' + clase;
  e.textContent = resto < 0 ? `Te pasaste por ${num(-resto)} kcal` : resto === 0 ? 'Llegaste justo al límite' : `Te quedan ${num(resto)} kcal`;
}

function renderExceso() {
  const panel = $('panelExceso');
  const exceso = total() - estado.limite;
  if (exceso <= 0) {
    panel.hidden = true;
    return;
  }
  const t = total();
  const top = [...estado.comidas].sort((a, b) => b.kcal - a.kcal).slice(0, 4);
  let html = `<h2>Te pasaste por ${num(exceso)} kcal</h2>
    <p>Estas son las comidas que más pesaron hoy y cómo podrías bajarlas (hoy mismo si todavía no las comiste, o la próxima vez).</p>
    <h3>Dónde reducir</h3>`;
  for (const c of top) {
    const ops = opcionesDeReduccion(c).slice(0, 3);
    html += `<div class="reducir">
      <div class="reducir-cab"><span>${esc(c.nombre)}</span><span>${num(c.kcal)} kcal · ${Math.round((c.kcal / t) * 100)}%</span></div>
      ${ops.length ? `<ul>${ops.map((o) => `<li>${esc(o.texto)} <span class="ahorro">−${num(o.ahorro)} kcal</span></li>`).join('')}</ul>` : '<p class="tenue chico">Sin alternativas cargadas para este alimento.</p>'}
    </div>`;
  }
  const combos = combinaciones(estado.comidas, exceso);
  if (combos.length) {
    html += '<h3>Combinaciones para volver al límite</h3>';
    for (const combo of combos) {
      const queda = t - combo.ahorro;
      html += `<div class="combo"><strong>${esc(combo.titulo)}</strong>
        <ul>${combo.pasos.map((p) => `<li>${esc(p.c.nombre)}: ${esc(p.o.texto.charAt(0).toLowerCase() + p.o.texto.slice(1))} <span class="ahorro">−${num(p.o.ahorro)} kcal</span></li>`).join('')}</ul>
        <p class="chico ${combo.alcanza ? '' : 'tenue'}">${combo.alcanza ? `Quedarías en ${num(queda)} kcal, dentro del límite.` : `No alcanza: quedarías en ${num(queda)} kcal, ${num(queda - estado.limite)} por encima.`}</p>
      </div>`;
    }
  }
  panel.innerHTML = html;
  panel.hidden = false;
}

function renderLista() {
  const cont = $('listaComidas');
  if (!estado.comidas.length) {
    cont.innerHTML = '<p class="vacio">Todavía no cargaste comidas en este día.</p>';
    return;
  }
  cont.innerHTML = TIPOS.map(([tipo, titulo]) => {
    const items = estado.comidas.filter((c) => c.tipo === tipo);
    if (!items.length) return '';
    const sub = items.reduce((s, c) => s + c.kcal, 0);
    return `<section class="tarjeta grupo"><h2>${titulo} <span>${num(sub)} kcal</span></h2>
      ${items
        .map((c) => {
          const a = c.alimentoId && POR_ID[c.alimentoId];
          const detalle = a ? `${cant(c.porciones)} × ${esc(a.porcion)}${c.gramos ? ` · ${num(c.gramos)} ${UNIDAD(a)}` : ''}` : 'Carga manual';
          return `<div class="comida">
            ${c.foto ? `<img src="${esc(c.foto)}" alt="">` : ''}
            <div class="comida-texto">${esc(c.nombre)}<small>${detalle}</small></div>
            <span class="comida-kcal">${num(c.kcal)} kcal</span>
            <button class="borrar" data-borrar="${esc(c.id)}" aria-label="Borrar ${esc(c.nombre)}">🗑</button>
          </div>`;
        })
        .join('')}</section>`;
  }).join('');
}

function renderFecha() {
  const d = new Date(estado.fecha + 'T12:00:00');
  const esHoy = estado.fecha === hoy();
  const texto = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('fechaTitulo').textContent = esHoy ? `Hoy, ${texto}` : texto;
  $('irHoy').hidden = esHoy;
  $('diaSiguiente').disabled = esHoy;
}

async function renderHistorial() {
  const dias = await api(`/api/resumen?hasta=${hoy()}&dias=7`);
  const max = Math.max(estado.limite, ...dias.map((d) => d.kcal)) || 1;
  $('historial').innerHTML = dias
    .map((d) => {
      const fecha = new Date(d.fecha + 'T12:00:00');
      const alto = Math.round((d.kcal / max) * 100);
      return `<div class="dia"><span class="dia-valor">${d.kcal ? num(d.kcal) : '–'}</span>
        <div class="dia-barra ${d.kcal > estado.limite ? 'pasado' : ''}" style="height:${alto}%"></div>
        <span>${fecha.toLocaleDateString('es-AR', { weekday: 'short' })} ${fecha.getDate()}</span></div>`;
    })
    .join('');
}

function render() {
  renderFecha();
  renderResumen();
  renderExceso();
  renderLista();
  renderHistorial().catch(fallo);
}

async function cargarDia() {
  estado.comidas = await api(`/api/comidas?fecha=${estado.fecha}`);
  render();
}

// ---------- diálogo de carga ----------
function tipoPorHora() {
  const h = new Date().getHours();
  return h < 11 ? 'desayuno' : h < 15 ? 'almuerzo' : h < 19 ? 'merienda' : 'cena';
}

function renderResultados() {
  const q = normalizar($('buscar').value.trim());
  const lista = q ? ALIMENTOS.filter((a) => normalizar(a.nombre + ' ' + a.cat).includes(q)) : ALIMENTOS;
  $('resultados').innerHTML = lista.length
    ? lista
        .map(
          (a) => `<li><button type="button" data-alimento="${a.id}">
            <span>${esc(a.nombre)}<small>${esc(a.cat)} · ${esc(a.porcion)} (${a.g} ${UNIDAD(a)})</small></span>
            <span class="kcal">${num(kcalPorcion(a))} kcal</span></button></li>`
        )
        .join('')
    : '<li class="vacio">Sin resultados. Podés cargarlo a mano.</li>';
}

function kcalActual() {
  if (!seleccion) return Number($('perKcal').value) || 0;
  return Math.round(kcalPorcion(seleccion) * (Number($('detPorciones').value) || 0));
}

function renderTotalDetalle() {
  const kcal = kcalActual();
  $('detTotal').textContent = `${num(kcal)} kcal`;
  const aviso = $('detAviso');
  const nuevoTotal = total() + kcal;
  const exceso = nuevoTotal - estado.limite;
  if (exceso <= 0 || !kcal) {
    aviso.hidden = true;
    return;
  }
  const porciones = Number($('detPorciones').value) || 1;
  const alternativas = seleccion
    ? seleccion.swaps
        .map((id) => POR_ID[id])
        .filter(Boolean)
        .map((alt) => ({ alt, kcal: Math.round(kcalPorcion(alt) * porciones) }))
        .filter((x) => x.kcal < kcal)
        .sort((x, y) => x.kcal - y.kcal)
    : [];
  aviso.innerHTML =
    `Con esto llegarías a <strong>${num(nuevoTotal)} kcal</strong>: ${num(exceso)} por encima del límite.` +
    (alternativas.length
      ? ' Opciones más livianas:' +
        alternativas
          .map(
            (x) =>
              `<button type="button" data-alimento="${x.alt.id}">${esc(x.alt.nombre)} — ${num(x.kcal)} kcal ` +
              `<span class="ahorro">(−${num(kcal - x.kcal)})</span>${total() + x.kcal <= estado.limite ? ' · entra en el límite' : ''}</button>`
          )
          .join('')
      : ' Podés reducir la porción.');
  aviso.hidden = false;
}

function mostrarDetalle(alimento, porciones = 1) {
  seleccion = alimento;
  $('pasoBuscar').hidden = true;
  $('pasoDetalle').hidden = false;
  $('camposPersonalizado').hidden = !!alimento;
  $('camposCantidad').hidden = !alimento;
  if (alimento) {
    $('detNombre').textContent = alimento.nombre;
    $('detInfo').textContent = `${alimento.kcal100} kcal cada 100 ${UNIDAD(alimento)} · porción: ${alimento.porcion} (${alimento.g} ${UNIDAD(alimento)})`;
    $('detUnidad').textContent = UNIDAD(alimento) === 'ml' ? 'Mililitros' : 'Gramos';
    $('detPorciones').value = porciones;
    $('detGramos').value = Math.round(alimento.g * porciones);
  } else {
    $('detNombre').textContent = 'Carga a mano';
    $('detInfo').textContent = 'Usá el valor del rótulo del envase o una estimación propia.';
    $('perNombre').value = '';
    $('perKcal').value = '';
  }
  renderTotalDetalle();
}

function abrirDialogo() {
  seleccion = null;
  $('buscar').value = '';
  $('detTipo').value = tipoPorHora();
  $('pasoBuscar').hidden = false;
  $('pasoDetalle').hidden = true;
  mostrarFoto();
  renderResultados();
  $('dlgAgregar').showModal();
}

function mostrarFoto() {
  $('detFotoVista').hidden = !fotoPendiente;
  if (fotoPendiente) $('detFotoVista').src = fotoPendiente;
  $('detFotoTexto').textContent = fotoPendiente ? 'Cambiar foto' : 'Adjuntar foto';
}

// Achica la foto en el navegador: solo se guarda una miniatura JPEG.
async function reducirFoto(archivo) {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, 360 / Math.max(img.width, img.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL('image/jpeg', 0.7);
}

async function alElegirFoto(input) {
  const archivo = input.files[0];
  input.value = '';
  if (!archivo) return false;
  try {
    fotoPendiente = await reducirFoto(archivo);
    return true;
  } catch {
    alert('No se pudo leer la imagen.');
    return false;
  }
}

async function guardar() {
  const kcal = kcalActual();
  const nombre = seleccion ? seleccion.nombre : $('perNombre').value.trim();
  const porciones = seleccion ? Number($('detPorciones').value) : 1;
  if (!nombre) return alert('Poné un nombre para la comida.');
  if (!(porciones > 0)) return alert('Indicá una cantidad mayor a cero.');
  if (!seleccion && !(Number($('perKcal').value) >= 0 && $('perKcal').value !== '')) return alert('Indicá las calorías.');
  const boton = $('btnGuardar');
  boton.disabled = true;
  try {
    await api('/api/comidas', {
      method: 'POST',
      body: JSON.stringify({
        fecha: estado.fecha,
        tipo: $('detTipo').value,
        nombre,
        kcal,
        porciones,
        gramos: seleccion ? Math.round(seleccion.g * porciones) : null,
        alimentoId: seleccion ? seleccion.id : null,
        foto: fotoPendiente,
      }),
    });
    fotoPendiente = null;
    $('dlgAgregar').close();
    await cargarDia();
  } catch (e) {
    fallo(e);
  } finally {
    boton.disabled = false;
  }
}

// ---------- eventos ----------
$('btnAgregar').addEventListener('click', () => {
  fotoPendiente = null;
  abrirDialogo();
});
$('fotoRapida').addEventListener('change', async (e) => {
  if (await alElegirFoto(e.target)) abrirDialogo();
});
$('detFoto').addEventListener('change', async (e) => {
  if (await alElegirFoto(e.target)) mostrarFoto();
});
$('buscar').addEventListener('input', renderResultados);
$('resultados').addEventListener('click', (e) => {
  const b = e.target.closest('[data-alimento]');
  if (b) mostrarDetalle(POR_ID[b.dataset.alimento]);
});
$('detAviso').addEventListener('click', (e) => {
  const b = e.target.closest('[data-alimento]');
  if (b) mostrarDetalle(POR_ID[b.dataset.alimento], Number($('detPorciones').value) || 1);
});
$('btnPersonalizado').addEventListener('click', () => mostrarDetalle(null));
$('volverBuscar').addEventListener('click', () => {
  $('pasoBuscar').hidden = false;
  $('pasoDetalle').hidden = true;
});
$('detPorciones').addEventListener('input', () => {
  if (seleccion) $('detGramos').value = Math.round(seleccion.g * (Number($('detPorciones').value) || 0));
  renderTotalDetalle();
});
$('detGramos').addEventListener('input', () => {
  if (seleccion) $('detPorciones').value = Math.round(((Number($('detGramos').value) || 0) / seleccion.g) * 100) / 100;
  renderTotalDetalle();
});
$('perKcal').addEventListener('input', renderTotalDetalle);
$('btnGuardar').addEventListener('click', guardar);

$('listaComidas').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-borrar]');
  if (!b || !confirm('¿Borrar esta comida?')) return;
  try {
    await api('/api/comidas/' + b.dataset.borrar, { method: 'DELETE' });
    await cargarDia();
  } catch (err) {
    fallo(err);
  }
});

$('editarLimite').addEventListener('click', async () => {
  const valor = prompt('Límite diario de calorías (kcal):', estado.limite);
  if (valor === null) return;
  const limite = Number(valor);
  if (!(limite >= 500 && limite <= 10000)) return alert('Ingresá un número entre 500 y 10000.');
  try {
    estado.limite = (await api('/api/config', { method: 'PUT', body: JSON.stringify({ limite }) })).limite;
    render();
  } catch (e) {
    fallo(e);
  }
});

$('diaAnterior').addEventListener('click', () => cambiarDia(moverFecha(estado.fecha, -1)));
$('diaSiguiente').addEventListener('click', () => cambiarDia(moverFecha(estado.fecha, 1)));
$('irHoy').addEventListener('click', () => cambiarDia(hoy()));
function cambiarDia(fecha) {
  if (fecha > hoy()) return;
  estado.fecha = fecha;
  cargarDia().catch(fallo);
}

(async () => {
  try {
    estado.limite = (await api('/api/config')).limite;
    await cargarDia();
  } catch (e) {
    fallo(e);
  }
})();
