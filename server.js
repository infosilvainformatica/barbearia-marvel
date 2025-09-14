import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://admin:mNwic1xZSII9i0SxyiU5GjpRgzCcOVCk@dpg-d2lp9hbipnbc738h70bg-a.oregon-postgres.render.com/testes_yaal';

const db = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ---------------- Init DB ----------------
async function initDb() {
  await db.connect();

  // Cria tabela de clientes
  await db.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Cria tabela de agendamentos
  await db.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      client_id INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      service VARCHAR(100) NOT NULL,
      date DATE NOT NULL,
      time TIME NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

// ---------------- Utilitários ----------------
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});
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
          const p = new URLSearchParams(body); const o={}; for (const [k,v] of p) o[k]=v; resolve(o);
        } else resolve({raw: body});
      } catch(e){ reject(e); }
    });
  });
}

function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  const rel = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  const filePath = path.join(__dirname, 'public', rel);
  if (!filePath.startsWith(path.join(__dirname,'public'))) { res.writeHead(403); res.end('Forbidden'); return true; }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
    const ct = map[ext] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type': ct});
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
}

// ---------------- Endpoints ----------------

// Health check
async function handleHealth(req,res){
  try{
    await db.query('SELECT 1');
    sendJSON(res,200,{ok:true});
  }catch(e){
    sendJSON(res,500,{ok:false,error:e.message});
  }
}

// Clients CRUD
async function handleClients(req,res){
  const parsed = url.parse(req.url,true);
  const id = parsed.query.id ? parseInt(parsed.query.id) : null;

  if(req.method==='GET'){
    if(id){
      const {rows} = await db.query('SELECT * FROM clients WHERE id=$1',[id]);
      return sendJSON(res,200,rows[0]||null);
    } else {
      const {rows} = await db.query('SELECT * FROM clients ORDER BY created_at DESC');
      return sendJSON(res,200,rows);
    }
  }

  if(req.method==='POST'){
    const b = await parseBody(req);
    if(!b.name || !b.phone) return sendJSON(res,400,{error:'name e phone são obrigatórios'});
    const {rows} = await db.query('INSERT INTO clients(name,phone) VALUES ($1,$2) RETURNING *',[b.name.trim(), b.phone.trim()]);
    return sendJSON(res,201,rows[0]);
  }

  if(req.method==='PUT'){
    if(!id) return sendJSON(res,400,{error:'id é obrigatório'});
    const b = await parseBody(req);
    const {rows} = await db.query('UPDATE clients SET name=$1, phone=$2 WHERE id=$3 RETURNING *',[b.name||'', b.phone||'', id]);
    return sendJSON(res,200,rows[0]);
  }

  if(req.method==='DELETE'){
    if(!id) return sendJSON(res,400,{error:'id é obrigatório'});
    await db.query('DELETE FROM clients WHERE id=$1',[id]);
    return sendJSON(res,204,{});
  }

  sendJSON(res,405,{error:'Método não permitido'});
}

// Appointments CRUD
async function handleAppointments(req,res){
  const parsed = url.parse(req.url,true);
  const id = parsed.query.id ? parseInt(parsed.query.id) : null;

  if(req.method==='GET'){
    const base = `SELECT a.*, c.name AS client_name, c.phone AS client_phone FROM appointments a JOIN clients c ON c.id=a.client_id`;
    if(id){
      const {rows} = await db.query(base+' WHERE a.id=$1',[id]);
      return sendJSON(res,200,rows[0]||null);
    } else {
      const {rows} = await db.query(base+' ORDER BY a.date DESC, a.time DESC');
      return sendJSON(res,200,rows);
    }
  }

  if(req.method==='POST'){
    const b = await parseBody(req);
    const {name, phone, service, date, time} = b;
    if(!name || !phone || !service || !date || !time) return sendJSON(res,400,{error:'Campos obrigatórios faltando'});

    // Verifica se cliente já existe
    let client = await db.query('SELECT * FROM clients WHERE phone=$1',[phone]);
    let cid;
    if(client.rows.length){
      cid = client.rows[0].id;
      if(client.rows[0].name !== name){
        await db.query('UPDATE clients SET name=$1 WHERE id=$2',[name,cid]);
      }
    } else {
      const {rows} = await db.query('INSERT INTO clients(name, phone) VALUES ($1,$2) RETURNING id',[name,phone]);
      cid = rows[0].id;
    }

    // Cria agendamento
    const {rows} = await db.query('INSERT INTO appointments(client_id, service, date, time) VALUES ($1,$2,$3,$4) RETURNING *',[cid, service, date, time]);
    return sendJSON(res,201,rows[0]);
  }

  if(req.method==='PUT'){
    if(!id) return sendJSON(res,400,{error:'id é obrigatório'});
    const b = await parseBody(req);
    const {rows} = await db.query('UPDATE appointments SET service=$1, date=$2, time=$3 WHERE id=$4 RETURNING *',[b.service||'', b.date||'', b.time||'', id]);
    return sendJSON(res,200,rows[0]);
  }

  if(req.method==='DELETE'){
    if(!id) return sendJSON(res,400,{error:'id é obrigatório'});
    await db.query('DELETE FROM appointments WHERE id=$1',[id]);
    return sendJSON(res,204,{});
  }

  sendJSON(res,405,{error:'Método não permitido'});
}

// ---------------- Server ----------------
const server = http.createServer(async (req,res)=>{
  try{
    const parsed = url.parse(req.url);

    if(parsed.pathname==='/api/health') return await handleHealth(req,res);
    if(parsed.pathname.startsWith('/api/clients')) return await handleClients(req,res);
    if(parsed.pathname.startsWith('/api/appointments')) return await handleAppointments(req,res);

    const ok = serveStatic(req,res);
    if(!ok){ 
      res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
      res.end('404 - Página não encontrada');
    }

  }catch(e){
    console.error(e);
    res.writeHead(500,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'Erro interno', detail:e.message}));
  }
});

// ---------------- Start ----------------
initDb()
  .then(()=>server.listen(PORT,()=>console.log('Server running on port',PORT)))
  .catch(e=>{
    console.error('DB init fail',e);
    process.exit(1);
  });
