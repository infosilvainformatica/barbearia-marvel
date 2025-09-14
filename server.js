import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { fileURLToPath } from 'url';
import pkg from 'pg';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://admin:mNwic1xZSII9i0SxyiU5GjpRgzCcOVCk@dpg-d2lp9hbipnbc738h70bg-a.oregon-postgres.render.com/testes_yaal';

// Conexão com o banco
const db = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      service TEXT NOT NULL,
      date DATE NOT NULL,
      time TIME NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const ct = req.headers['content-type'] || '';
        if (ct.includes('application/json')) resolve(JSON.parse(body || '{}'));
        else if (ct.includes('application/x-www-form-urlencoded')) {
          const p = new URLSearchParams(body); const o = {};
          for (const [k, v] of p) o[k] = v;
          resolve(o);
        } else resolve({ raw: body });
      } catch (e) { reject(e); }
    });
  });
}

function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  const rel = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  const filePath = path.join(__dirname, 'public', rel);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403); res.end('Forbidden'); return true;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    const ct = map[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
}

// API: health, clients, appointments
async function handleHealth(req, res) {
  try {
    await db.query('select 1');
    sendJSON(res, 200, { ok: true });
  } catch (e) {
    sendJSON(res, 500, { ok: false, error: e.message });
  }
}

async function handleClients(req, res) {
  const parsed = url.parse(req.url, true);
  const id = parsed.query.id ? parseInt(parsed.query.id) : null;

  if (req.method === 'GET') {
    const q = id ? 'select * from clients where id=$1' : 'select * from clients order by created_at desc';
    const p = id ? [id] : [];
    const { rows } = await db.query(q, p);
    return sendJSON(res, 200, id ? rows[0] || null : rows);
  }
  if (req.method === 'POST') {
    const b = await parseBody(req);
    if (!b.name || !b.phone) return sendJSON(res, 400, { error: 'name e phone são obrigatórios' });
    const { rows } = await db.query('insert into clients(name,phone) values ($1,$2) returning *', [b.name.trim(), b.phone.trim()]);
    return sendJSON(res, 201, rows[0]);
  }
  if (req.method === 'PUT') {
    if (!id) return sendJSON(res, 400, { error: 'id é obrigatório' });
    const b = await parseBody(req);
    const { rows } = await db.query('update clients set name=$1, phone=$2 where id=$3 returning *', [b.name || '', b.phone || '', id]);
    return sendJSON(res, 200, rows[0]);
  }
  if (req.method === 'DELETE') {
    if (!id) return sendJSON(res, 400, { error: 'id é obrigatório' });
    await db.query('delete from clients where id=$1', [id]);
    return sendJSON(res, 204, {});
  }
  sendJSON(res, 405, { error: 'Método não permitido' });
}

async function handleAppointments(req, res) {
  const parsed = url.parse(req.url, true);
  const id = parsed.query.id ? parseInt(parsed.query.id) : null;

  if (req.method === 'GET') {
    const base = `select a.*, c.name as client_name, c.phone as client_phone 
                  from appointments a join clients c on c.id=a.client_id`;
    if (id) {
      const { rows } = await db.query(base + ' where a.id=$1', [id]);
      return sendJSON(res, 200, rows[0] || null);
    }
    const { rows } = await db.query(base + ' order by a.date desc, a.time desc');
    return sendJSON(res, 200, rows);
  }
  if (req.method === 'POST') {
    const b = await parseBody(req);
    const { name, phone, service, date, time } = b;
    if (!name || !phone || !service || !date || !time) return sendJSON(res, 400, { error: 'Campos obrigatórios faltando' });

    let client = await db.query('select * from clients where phone=$1', [phone]);
    let cid;
    if (client.rows.length) {
      cid = client.rows[0].id;
      if (client.rows[0].name !== name) await db.query('update clients set name=$1 where id=$2', [name, cid]);
    } else {
      const { rows } = await db.query('insert into clients(name, phone) values ($1,$2) returning id', [name, phone]);
      cid = rows[0].id;
    }

    const { rows } = await db.query('insert into appointments(client_id,service,date,time) values ($1,$2,$3,$4) returning *', [cid, service, date, time]);
    return sendJSON(res, 201, rows[0]);
  }
  if (req.method === 'PUT') {
    if (!id) return sendJSON(res, 400, { error: 'id é obrigatório' });
    const b = await parseBody(req);
    const { rows } = await db.query('update appointments set service=$1, date=$2, time=$3 where id=$4 returning *', [b.service || '', b.date || '', b.time || '', id]);
    return sendJSON(res, 200, rows[0]);
  }
  if (req.method === 'DELETE') {
    if (!id) return sendJSON(res, 400, { error: 'id é obrigatório' });
    await db.query('delete from appointments where id=$1', [id]);
    return sendJSON(res, 204, {});
  }
  sendJSON(res, 405, { error: 'Método não permitido' });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url);
    if (parsed.pathname === '/api/health') return await handleHealth(req, res);
    if (parsed.pathname.startsWith('/api/clients')) return await handleClients(req, res);
    if (parsed.pathname.startsWith('/api/appointments')) return await handleAppointments(req, res);
    const ok = serveStatic(req, res);
    if (!ok) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 - Página não encontrada'); }
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Erro interno', detail: e.message }));
  }
});

initDb()
  .then(() => server.listen(PORT, () => console.log('Running on port', PORT)))
  .catch(e => { console.error('DB init fail', e); process.exit(1); });

