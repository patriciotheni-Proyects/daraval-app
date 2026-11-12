// Servidor sin dependencias: sirve la PWA y guarda los datos en un archivo JSON.
// Pensado para un solo usuario, sin login: no lo expongas a internet sin protección.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3100;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'datos.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 400 * 1024;
const TIPOS = ['desayuno', 'almuerzo', 'merienda', 'cena', 'colacion'];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

let datos = { config: { limite: 2000 }, comidas: [] };
if (fs.existsSync(DATA_FILE)) {
  // Si el archivo está corrupto preferimos fallar al arrancar antes que pisarlo con datos vacíos.
  datos = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function guardar() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(datos));
  fs.renameSync(tmp, DATA_FILE);
}

function responder(res, status, cuerpo) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
}

function leerJSON(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > MAX_BODY) {
        reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const esNumero = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

function validarComida(b) {
  if (!esFecha(b.fecha)) return 'fecha inválida';
  if (!TIPOS.includes(b.tipo)) return 'tipo de comida inválido';
  if (typeof b.nombre !== 'string' || !b.nombre.trim() || b.nombre.length > 100) return 'nombre inválido';
  if (!esNumero(b.kcal, 0, 10000)) return 'kcal inválidas';
  if (!esNumero(b.porciones, 0.1, 50)) return 'porciones inválidas';
  if (b.gramos != null && !esNumero(b.gramos, 0, 10000)) return 'gramos inválidos';
  if (b.alimentoId != null && (typeof b.alimentoId !== 'string' || b.alimentoId.length > 40)) return 'alimento inválido';
  if (b.foto != null && (typeof b.foto !== 'string' || !b.foto.startsWith('data:image/jpeg;base64,'))) return 'foto inválida';
  return null;
}

function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function api(req, res, url) {
  const ruta = url.pathname;

  if (ruta === '/api/config' && req.method === 'GET') return responder(res, 200, datos.config);

  if (ruta === '/api/config' && req.method === 'PUT') {
    const b = await leerJSON(req);
    if (!esNumero(b.limite, 500, 10000)) return responder(res, 400, { error: 'El límite debe estar entre 500 y 10000 kcal' });
    datos.config.limite = Math.round(b.limite);
    guardar();
    return responder(res, 200, datos.config);
  }

  if (ruta === '/api/comidas' && req.method === 'GET') {
    const fecha = url.searchParams.get('fecha');
    if (!esFecha(fecha)) return responder(res, 400, { error: 'fecha inválida' });
    return responder(res, 200, datos.comidas.filter((c) => c.fecha === fecha));
  }

  if (ruta === '/api/comidas' && req.method === 'POST') {
    const b = await leerJSON(req);
    const error = validarComida(b);
    if (error) return responder(res, 400, { error });
    const comida = {
      id: crypto.randomUUID(),
      fecha: b.fecha,
      tipo: b.tipo,
      nombre: b.nombre.trim(),
      kcal: Math.round(b.kcal),
      porciones: b.porciones,
      gramos: b.gramos ?? null,
      alimentoId: b.alimentoId ?? null,
      foto: b.foto ?? null,
      creado: new Date().toISOString(),
    };
    datos.comidas.push(comida);
    guardar();
    return responder(res, 201, comida);
  }

  const m = ruta.match(/^\/api\/comidas\/([0-9a-f-]{36})$/);
  if (m && req.method === 'DELETE') {
    const antes = datos.comidas.length;
    datos.comidas = datos.comidas.filter((c) => c.id !== m[1]);
    if (datos.comidas.length === antes) return responder(res, 404, { error: 'No existe' });
    guardar();
    return responder(res, 200, { ok: true });
  }

  if (ruta === '/api/resumen' && req.method === 'GET') {
    const hasta = url.searchParams.get('hasta');
    const dias = Math.min(Math.max(parseInt(url.searchParams.get('dias'), 10) || 7, 1), 60);
    if (!esFecha(hasta)) return responder(res, 400, { error: 'fecha inválida' });
    const totales = {};
    for (let i = dias - 1; i >= 0; i--) totales[sumarDias(hasta, -i)] = 0;
    for (const c of datos.comidas) if (c.fecha in totales) totales[c.fecha] += c.kcal;
    return responder(res, 200, Object.entries(totales).map(([fecha, kcal]) => ({ fecha, kcal })));
  }

  return responder(res, 404, { error: 'Ruta no encontrada' });
}

function estatico(res, url) {
  const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const archivo = path.join(PUBLIC_DIR, rel);
  if (!archivo.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(archivo, (err, contenido) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No encontrado');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(contenido);
  });
}

http
  .createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (url.pathname.startsWith('/api/')) {
      api(req, res, url).catch((e) => {
        if (!e.status) console.error(e);
        if (!res.headersSent) responder(res, e.status || 500, { error: e.status ? e.message : 'Error interno' });
      });
    } else if (req.method === 'GET') {
      estatico(res, url);
    } else {
      res.writeHead(405);
      res.end();
    }
  })
  .listen(PORT, () => console.log(`Calorías escuchando en http://localhost:${PORT}`));
