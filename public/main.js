// Marca link ativo via URL
(function(){
  const path = location.pathname.replace('/','') || 'index.html';
  document.querySelectorAll('nav a').forEach(a => {
    if (a.getAttribute('href').endsWith(path)) a.classList.add('active');
  });
})();

// Função genérica para consumir a API
async function api(path, options={}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

// ---------------- Booking page ----------------
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let msg = document.getElementById('bookingMsg');
    if(!msg){
      msg = document.createElement('div');
      msg.id = 'bookingMsg';
      msg.className = 'message';
      bookingForm.prepend(msg);
    }
    msg.style.display='block'; msg.className='message'; msg.textContent='Enviando...';
    const payload = {
      name: document.getElementById('name').value,
      phone: document.getElementById('phone')?.value || '',
      service: document.getElementById('service').value,
      date: document.getElementById('date').value,
      time: document.getElementById('time').value
    };
    try {
      await api('/api/appointments', { method: 'POST', body: JSON.stringify(payload) });
      msg.classList.add('success'); msg.textContent='Agendamento realizado com sucesso!';
      bookingForm.reset();
    } catch (e) {
      msg.classList.add('error'); msg.textContent='Erro: ' + e.message;
    }
  });
}

// ---------------- Contact page ----------------
const contactForm = document.getElementById('contactForm');
if(contactForm){
  contactForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    let msg = document.getElementById('contactMsg');
    if(!msg){
      msg = document.createElement('div');
      msg.id = 'contactMsg';
      msg.className = 'message';
      contactForm.prepend(msg);
    }
    msg.style.display='block'; msg.className='message'; msg.textContent='Enviando...';
    const payload = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      message: document.getElementById('message').value
    };
    try {
      await api('/api/contacts', { method:'POST', body: JSON.stringify(payload) });
      msg.classList.add('success'); msg.textContent='Mensagem enviada com sucesso!';
      contactForm.reset();
    } catch(e){
      msg.classList.add('error'); msg.textContent='Erro: '+e.message;
    }
  });
}

// ---------------- Admin page: Clientes ----------------
async function loadClients() {
  const table = document.querySelector('#clientsTable tbody'); if (!table) return;
  const data = await api('/api/clients');
  table.innerHTML = data.map(c => `
    <tr>
      <td>${c.id}</td>
      <td><input value="${c.name}" data-id="${c.id}" data-field="name"/></td>
      <td><input value="${c.phone}" data-id="${c.id}" data-field="phone"/></td>
      <td>
        <button onclick="saveClient(${c.id})">Salvar</button>
        <button class="btn-danger" onclick="deleteClient(${c.id})">Excluir</button>
      </td>
    </tr>
  `).join('');
}

async function saveClient(id) {
  const inputs = [...document.querySelectorAll(`[data-id="${id}"]`)];
  const payload = Object.fromEntries(inputs.map(i => [i.dataset.field, i.value]));
  await api('/api/clients?id='+id, { method:'PUT', body: JSON.stringify(payload) });
  showMsg('clientsMsg','Cliente atualizado com sucesso','success');
  await loadClients();
}

async function deleteClient(id) {
  if (!confirm('Deseja excluir este cliente?')) return;
  await api('/api/clients?id='+id, { method:'DELETE' });
  showMsg('clientsMsg','Cliente excluído','success');
  await loadClients();
}

// ---------------- Admin page: Agendamentos ----------------
async function loadAppts() {
  const table = document.querySelector('#apptsTable tbody'); if (!table) return;
  const data = await api('/api/appointments');
  table.innerHTML = data.map(a => `
    <tr>
      <td>${a.id}</td>
      <td>${a.client_name}</td>
      <td>${a.client_phone}</td>
      <td><input value="${a.service}" data-aid="${a.id}" data-field="service"/></td>
      <td><input type="date" value="${a.date?.slice(0,10)}" data-aid="${a.id}" data-field="date"/></td>
      <td><input type="time" value="${a.time?.slice(0,5)}" data-aid="${a.id}" data-field="time"/></td>
      <td>
        <button onclick="saveAppt(${a.id})">Salvar</button>
        <button class="btn-danger" onclick="deleteAppt(${a.id})">Excluir</button>
      </td>
    </tr>
  `).join('');
}

async function saveAppt(id) {
  const inputs = [...document.querySelectorAll(`[data-aid="${id}"]`)];
  const payload = Object.fromEntries(inputs.map(i => [i.dataset.field, i.value]));
  await api('/api/appointments?id='+id, { method:'PUT', body: JSON.stringify(payload) });
  showMsg('apptsMsg','Agendamento atualizado','success');
  await loadAppts();
}

async function deleteAppt(id) {
  if (!confirm('Deseja excluir este agendamento?')) return;
  await api('/api/appointments?id='+id, { method:'DELETE' });
  showMsg('apptsMsg','Agendamento excluído','success');
  await loadAppts();
}

// ---------------- Admin page: Contatos ----------------
async function loadContacts() {
  const table = document.querySelector('#contactsTable tbody'); if(!table) return;
  const data = await api('/api/contacts');
  table.innerHTML = data.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${c.name}</td>
      <td>${c.email}</td>
      <td>${c.message}</td>
      <td>
        <button class="btn-danger" onclick="deleteContact(${c.id})">Excluir</button>
      </td>
    </tr>
  `).join('');
}

async function deleteContact(id){
  if(!confirm('Deseja excluir esta mensagem?')) return;
  await api('/api/contacts?id='+id, { method:'DELETE' });
  showMsg('contactsMsg','Mensagem excluída','success');
  await loadContacts();
}

// ---------------- Utilitário ----------------
function showMsg(id, text, type) {
  const box = document.getElementById(id);
  if (!box) return;
  box.style.display='block';
  box.className = 'message ' + (type||'');
  box.textContent = text;
}

// ---------------- Inicialização ----------------
window.addEventListener('DOMContentLoaded', () => {
  loadClients();
  loadAppts();
  loadContacts();

  // Animação dos cards de serviços
  const cards = document.querySelectorAll(".service-card");
  const reveal = () => {
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      if (rect.top < window.innerHeight - 50) {
        card.classList.add("show");
      }
    });
  };
  window.addEventListener("scroll", reveal);
  reveal();
});
