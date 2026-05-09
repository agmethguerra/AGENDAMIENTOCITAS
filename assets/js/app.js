/* ======================================================
   FIREBASE CONFIG — mismo proyecto del sistema original
   ====================================================== */


// Credenciales admin para el módulo de citas
const ADMIN_CREDENTIALS = [
  { user: 'admin', pass: '@4dm1n123', name: 'Dueño - Admin' }
];

/* ======================================================
   FIREBASE INIT
   ====================================================== */


const COL_APPOINTMENTS = 'citas';
const COL_BARBERS_CITAS = 'barberos_citas'; // colección propia para barberos del módulo citas

/* ======================================================
   ESTADO DE LA APP
   ====================================================== */
let state = {
  step: 0,
  selectedBarber: null,
  selectedDate: null,
  selectedTime: null,
  allBarbers: [],
  takenSlots: [],
  adminSession: null,
  lastApptId: null,
};

/* ======================================================
   TOAST
   ====================================================== */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(t._to);
  t._to = setTimeout(() => t.className = '', 3200);
}

/* ======================================================
   FIREBASE HELPERS
   ====================================================== */
async function fbAdd(col, data) {
  const ref = await db.collection(col).add({ ...data, _createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  return ref.id;
}
async function fbGetAll(col) {
  const snap = await db.collection(col).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fbGet(col, id) {
  const doc = await db.collection(col).doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}
async function fbPut(col, id, data) {
  await db.collection(col).doc(id).set(
    { ...data, _updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}
async function fbDelete(col, id) {
  await db.collection(col).doc(id).delete();
}
async function fbQuery(col, field, op, val) {
  const snap = await db.collection(col).where(field, op, val).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ======================================================
   HELPERS DE FECHA / HORA
   ====================================================== */
const DAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateLong(dateStr) {
  const [y,m,day] = dateStr.split('-').map(Number);
  const d = new Date(y, m-1, day);
  return `${DAYS_ES[d.getDay()]} ${day} de ${MONTHS_FULL[m-1]} ${y}`;
}

function getNextDays(n = 14) {
  const days = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function generateHours() {
  const slots = [];
  for (let h = 8; h < 20; h++) {
    const label = `${h > 12 ? h-12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`;
    const val = `${String(h).padStart(2,'0')}:00`;
    slots.push({ label, val });
  }
  return slots;
}

function buildTimeOptions() {
  return generateHours().map(s => `<option value="${s.val}">${s.label}</option>`).join('');
}

/* ======================================================
   CARGAR BARBEROS (HOME)
   ====================================================== */
async function loadHomeBarbers() {
  try {
    const barbers = await getActiveBarbers();
    const el = document.getElementById('homeBarbers');
    if (!barbers.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:14px">Próximamente más información del equipo.</p>';
      return;
    }
    el.innerHTML = barbers.map(b => `
      <div class="barber-card" onclick="startBookingWith('${b.id}')">
        <div class="barber-avatar">${(b.name||'B')[0].toUpperCase()}</div>
        <div class="barber-name">${b.name}</div>
        <div class="barber-specialty">${b.specialty||'Barbero profesional'}</div>
        <div class="barber-avail">Disponible</div>
      </div>
    `).join('');
  } catch(e) {
    console.error(e);
  }
}

async function getActiveBarbers() {
  try {
    const all = await fbGetAll(COL_BARBERS_CITAS);
    state.allBarbers = all.filter(b => !b._deleted);
    return state.allBarbers;
  } catch(e) { return []; }
}

/* ======================================================
   FLOW: INICIO
   ====================================================== */
function startBooking() {
  showFlow();
  loadBarberStep();
}

function startBookingWith(barberId) {
  showFlow();
  loadBarberStep(barberId);
}

function showFlow() {
  document.getElementById('homeView').style.display = 'none';
  document.getElementById('successScreen').classList.remove('active');
  const flow = document.getElementById('flow');
  flow.style.display = 'block';
  flow.classList.add('active');
  goToStep(1);
}

function resetFlow() {
  state.step = 0;
  state.selectedBarber = null;
  state.selectedDate = null;
  state.selectedTime = null;
  document.getElementById('homeView').style.display = 'block';
  document.getElementById('flow').style.display = 'none';
  document.getElementById('flow').classList.remove('active');
  document.getElementById('successScreen').classList.remove('active');
  loadHomeBarbers();
}

/* ======================================================
   STEP NAVIGATION
   ====================================================== */
function goToStep(n) {
  state.step = n;
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`step${i}`).style.display = i === n ? 'block' : 'none';
  }
  updateStepDots(n);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepDots(current) {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`dot${i}`);
    dot.className = 'step-dot' + (i < current ? ' done' : i === current ? ' active' : '');
    dot.textContent = i < current ? '✓' : i;
  }
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`line${i}`).className = 'step-line' + (i < current ? ' done' : '');
  }
}

/* ======================================================
   STEP 1: BARBEROS
   ====================================================== */
async function loadBarberStep(preselect = null) {
  const grid = document.getElementById('barberGrid');
  grid.innerHTML = '<div class="loader"><div class="spinner"></div> Cargando…</div>';
  const barbers = await getActiveBarbers();
  if (!barbers.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No hay barberos registrados aún.</p>';
    return;
  }
  grid.innerHTML = barbers.map(b => `
    <div class="barber-card ${preselect===b.id?'selected':''}" id="bc_${b.id}" onclick="selectBarber('${b.id}')">
      <div class="barber-avatar">${(b.name||'B')[0].toUpperCase()}</div>
      <div class="barber-name">${b.name}</div>
      <div class="barber-specialty">${b.specialty||'Barbero profesional'}</div>
      <div class="barber-avail">Disponible hoy</div>
    </div>
  `).join('');

  if (preselect) {
    const b = barbers.find(x => x.id === preselect);
    if (b) { state.selectedBarber = b; goToStep(2); buildDateStep(); }
  }
}

function selectBarber(id) {
  state.selectedBarber = state.allBarbers.find(b => b.id === id);
  if (!state.selectedBarber) return;
  document.querySelectorAll('.barber-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`bc_${id}`).classList.add('selected');
  setTimeout(() => { goToStep(2); buildDateStep(); }, 220);
}

/* ======================================================
   STEP 2: FECHA
   ====================================================== */
function buildDateStep() {
  const row = document.getElementById('dateRow');
  const days = getNextDays(14);
  row.innerHTML = days.map(d => {
    const key = dateKey(d);
    const isToday = dateKey(new Date()) === key;
    return `
      <div class="date-chip ${state.selectedDate===key?'selected':''}" id="dc_${key}" onclick="selectDate('${key}')">
        <div class="date-chip-day">${isToday ? 'Hoy' : DAYS_ES[d.getDay()]}</div>
        <div class="date-chip-num">${d.getDate()}</div>
        <div class="date-chip-mon">${MONTHS_ES[d.getMonth()]}</div>
      </div>
    `;
  }).join('');
}

async function selectDate(key) {
  state.selectedDate = key;
  document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('selected'));
  const el = document.getElementById(`dc_${key}`);
  if (el) el.classList.add('selected');
  setTimeout(() => { goToStep(3); loadTimeStep(); }, 220);
}

/* ======================================================
   STEP 3: HORA
   ====================================================== */
async function loadTimeStep() {
  const grid = document.getElementById('timeGrid');
  grid.innerHTML = '<div class="loader"><div class="spinner"></div> Verificando disponibilidad…</div>';

  // Obtener citas tomadas para este barbero y fecha
  const taken = await fbQuery(COL_APPOINTMENTS, 'barberId', '==', state.selectedBarber.id);
  state.takenSlots = taken.filter(a => a.date === state.selectedDate && a.status !== 'cancelled').map(a => a.time);

  const slots = generateHours();
  const available = slots.filter(s => !state.takenSlots.includes(s.val));

  if (!available.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--text-muted)">
        <div>No hay horarios disponibles para este día.<br>Por favor elige otra fecha.</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="goToStep(2)">← Cambiar fecha</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = slots.map(s => {
    const isTaken = state.takenSlots.includes(s.val);
    const period = parseInt(s.val) < 12 ? 'AM' : 'PM';
    return `
      <div class="time-slot ${isTaken?'taken':''} ${state.selectedTime===s.val?'selected':''}" 
           id="ts_${s.val.replace(':','')}" 
           onclick="${isTaken?'':` selectTime('${s.val}')`}">
        ${s.label.replace(' AM','').replace(' PM','')}
        <div class="time-period">${period}</div>
        ${isTaken?'<div style="font-size:10px;color:var(--text-dim)">Ocupado</div>':''}
      </div>
    `;
  }).join('');
}

function selectTime(val) {
  state.selectedTime = val;
  document.querySelectorAll('.time-slot').forEach(c => c.classList.remove('selected'));
  const el = document.getElementById(`ts_${val.replace(':','')}`);
  if (el) el.classList.add('selected');
  setTimeout(() => { goToStep(4); buildSummary(); }, 220);
}

/* ======================================================
   STEP 4: DATOS CLIENTE
   ====================================================== */
function buildSummary() {
  const hours = generateHours();
  const slot = hours.find(h => h.val === state.selectedTime);
  const sb = document.getElementById('bookingSummary');
  sb.innerHTML = `
    <div class="summary-row">
      <span class="summary-key">Barbero</span>
      <span class="summary-val">${state.selectedBarber.name}</span>
    </div>
    <div class="summary-row">
      <span class="summary-key">Fecha</span>
      <span class="summary-val">${formatDateLong(state.selectedDate)}</span>
    </div>
    <div class="summary-row">
      <span class="summary-key">Hora</span>
      <span class="summary-val">${slot ? slot.label : state.selectedTime}</span>
    </div>
  `;
}

/* ======================================================
   CONFIRMAR CITA
   ====================================================== */
async function confirmBooking() {
  const name = document.getElementById('clientName').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();

  if (!name) { showToast('Por favor ingresa tu nombre', 'error'); return; }
  if (!phone || phone.length < 7) { showToast('Ingresa un número de teléfono válido', 'error'); return; }

  const btn = document.querySelector('.btn-confirm');
  btn.textContent = 'Guardando…';
  btn.disabled = true;

  try {
    const apptData = {
      clientName: name,
      clientPhone: phone,
      barberId: state.selectedBarber.id,
      barberName: state.selectedBarber.name,
      barberPhone: state.selectedBarber.phone || '',
      date: state.selectedDate,
      time: state.selectedTime,
      status: 'pending',
    };

    const id = await fbAdd(COL_APPOINTMENTS, apptData);
    state.lastApptId = id;

    showSuccessScreen(apptData);
    showToast('¡Cita agendada exitosamente!', 'success');
  } catch(e) {
    console.error(e);
    showToast('Error al guardar la cita. Intenta de nuevo.', 'error');
  } finally {
    btn.textContent = 'CONFIRMAR CITA';
    btn.disabled = false;
  }
}

/* ======================================================
   PANTALLA ÉXITO + WHATSAPP
   ====================================================== */
function showSuccessScreen(appt) {
  document.getElementById('flow').style.display = 'none';
  document.getElementById('homeView').style.display = 'none';

  const hours = generateHours();
  const slot = hours.find(h => h.val === appt.time);
  const timeLabel = slot ? slot.label : appt.time;
  const dateLabel = formatDateLong(appt.date);

  // Success detail
  document.getElementById('successDetail').innerHTML = `
    <div class="summary-row"><span class="summary-key">Cliente</span><span class="summary-val">${appt.clientName}</span></div>
    <div class="summary-row"><span class="summary-key">Barbero</span><span class="summary-val">${appt.barberName}</span></div>
    <div class="summary-row"><span class="summary-key">Fecha</span><span class="summary-val">${dateLabel}</span></div>
    <div class="summary-row"><span class="summary-key">Hora</span><span class="summary-val">${timeLabel}</span></div>
    <div class="summary-row"><span class="summary-key">Teléfono</span><span class="summary-val">${appt.clientPhone}</span></div>
  `;

  // WhatsApp link
  buildWhatsAppLink(appt, timeLabel, dateLabel);

  const ss = document.getElementById('successScreen');
  ss.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function buildWhatsAppLink(appt, timeLabel, dateLabel) {
  const phone = appt.barberPhone ? appt.barberPhone.replace(/\D/g,'') : '';
  const msg = `Hola ${appt.barberName}, soy *${appt.clientName}*. Acabo de agendar una cita contigo para el día *${dateLabel}* a las *${timeLabel}*. Mi número de contacto es: ${appt.clientPhone}. ¡Hasta entonces!`;
  const encoded = encodeURIComponent(msg);
  const url = phone
    ? `https://wa.me/${phone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  document.getElementById('whatsappLink').href = url;
}

/* ======================================================
   ADMIN: LOGIN
   ====================================================== */
function showAdminLogin() {
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('adminPanel').classList.remove('active');
  const ls = document.getElementById('loginScreen');
  ls.classList.add('active');
  setTimeout(() => document.getElementById('loginUser').focus(), 100);
}

function showClientView() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('mainApp').style.display = 'block';
}

function doAdminLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const found = ADMIN_CREDENTIALS.find(c => c.user === u && c.pass === p);
  if (!found) { showToast('Credenciales incorrectas', 'error'); return; }
  state.adminSession = found;
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('mainApp').style.display = 'none';
  const ap = document.getElementById('adminPanel');
  ap.classList.add('active');
  document.getElementById('adminNameDisplay').textContent = found.name;
  loadAdminPanel();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').classList.contains('active')) doAdminLogin();
});

function adminLogout() {
  state.adminSession = null;
  document.getElementById('adminPanel').classList.remove('active');
  document.getElementById('mainApp').style.display = 'block';
}

/* ======================================================
   ADMIN: PANEL
   ====================================================== */
async function loadAdminPanel() {
  await Promise.all([
    loadAdminStats(),
    loadAdminAppointments(),
    loadAdminBarbers(),
  ]);
}

async function loadAdminStats() {
  try {
    const all = await fbGetAll(COL_APPOINTMENTS);
    const today = dateKey(new Date());
    const todayAppts = all.filter(a => a.date === today && a.status !== 'cancelled');
    const pending = all.filter(a => a.status === 'pending' && a.date >= today);
    const total = all.filter(a => a.status !== 'cancelled');

    document.getElementById('adminStats').innerHTML = `
      <div class="stat-card gold">
        <div class="stat-label">Citas hoy</div>
        <div class="stat-value">${todayAppts.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pendientes</div>
        <div class="stat-value">${pending.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total citas</div>
        <div class="stat-value">${total.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Barberos activos</div>
        <div class="stat-value">${state.allBarbers.length}</div>
      </div>
    `;
  } catch(e) {}
}

async function loadAdminAppointments() {
  const list = document.getElementById('adminApptList');
  list.innerHTML = '<div class="loader"><div class="spinner"></div> Cargando…</div>';

  try {
    let all = await fbGetAll(COL_APPOINTMENTS);
    const filterBarber = document.getElementById('filterBarber').value;
    const filterDate = document.getElementById('filterDate').value;
    if (filterBarber) all = all.filter(a => a.barberId === filterBarber);
    if (filterDate) all = all.filter(a => a.date === filterDate);

    // Ordenar por fecha+hora
    all.sort((a,b) => {
      const ka = `${a.date}${a.time}`, kb = `${b.date}${b.time}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    if (!all.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-text">No hay citas registradas</div></div>';
      return;
    }

    const today = dateKey(new Date());
    list.innerHTML = all.map(a => {
      const isPast = a.date < today;
      const hours = generateHours();
      const slot = hours.find(h => h.val === a.time);
      const timeLabel = slot ? slot.label : a.time;
      return `
        <div class="appt-card ${isPast?'past':''}" id="appt_${a.id}">
          <div class="appt-info">
            <div class="appt-client">👤 ${a.clientName}</div>
            <div class="appt-meta">
              <span>${a.clientPhone}</span>
              <span>${a.barberName}</span>
              <span>${formatDateLong(a.date)}</span>
              <span>${timeLabel}</span>
            </div>
            <div style="margin-top:7px">
              <span class="appt-badge">${a.status==='cancelled'?'Cancelada':'Pendiente'}</span>
            </div>
          </div>
          <div class="appt-actions">
            <button class="btn btn-edit btn-sm" onclick="openEditAppt('${a.id}')">Editar</button>
            <button class="btn btn-del btn-sm" onclick="deleteAppt('${a.id}')">Eliminar</button>
          </div>
        </div>
      `;
    }).join('');

    // Repoblar filtro barberos
    const barbers = await getActiveBarbers();
    const sel = document.getElementById('filterBarber');
    const curVal = sel.value;
    sel.innerHTML = '<option value="">Todos los barberos</option>' +
      barbers.map(b => `<option value="${b.id}" ${curVal===b.id?'selected':''}>${b.name}</option>`).join('');
  } catch(e) {
    list.innerHTML = '<p style="color:var(--text-muted);padding:20px">Error al cargar las citas.</p>';
  }
}

function clearAdminFilter() {
  document.getElementById('filterBarber').value = '';
  document.getElementById('filterDate').value = '';
  loadAdminAppointments();
}

/* ======================================================
   ADMIN: EDITAR CITA
   ====================================================== */
async function openEditAppt(id) {
  const appt = await fbGet(COL_APPOINTMENTS, id);
  if (!appt) return;
  document.getElementById('editApptId').value = id;
  document.getElementById('editClient').value = appt.clientName || '';
  document.getElementById('editPhone').value = appt.clientPhone || '';
  document.getElementById('editDate').value = appt.date || '';

  // Barberos select
  const barbers = await getActiveBarbers();
  document.getElementById('editBarberSel').innerHTML =
    barbers.map(b => `<option value="${b.id}" ${appt.barberId===b.id?'selected':''}>${b.name}</option>`).join('');

  // Tiempo select
  document.getElementById('editTime').innerHTML = buildTimeOptions();
  document.getElementById('editTime').value = appt.time || '';

  openModal('editModal');
}

async function saveEditAppointment() {
  const id = document.getElementById('editApptId').value;
  const barbers = await getActiveBarbers();
  const barberId = document.getElementById('editBarberSel').value;
  const barber = barbers.find(b => b.id === barberId);
  await fbPut(COL_APPOINTMENTS, id, {
    clientName: document.getElementById('editClient').value.trim(),
    clientPhone: document.getElementById('editPhone').value.trim(),
    barberId,
    barberName: barber ? barber.name : '',
    barberPhone: barber ? (barber.phone||'') : '',
    date: document.getElementById('editDate').value,
    time: document.getElementById('editTime').value,
  });
  closeModal('editModal');
  showToast('Cita actualizada', 'success');
  loadAdminAppointments();
  loadAdminStats();
}

async function deleteAppt(id) {
  if (!confirm('¿Eliminar esta cita? Esta acción no se puede deshacer.')) return;
  await fbDelete(COL_APPOINTMENTS, id);
  showToast('Cita eliminada', 'success');
  loadAdminAppointments();
  loadAdminStats();
}

/* ======================================================
   ADMIN: BARBEROS
   ====================================================== */
async function loadAdminBarbers() {
  const list = document.getElementById('adminBarbersList');
  list.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  try {
    const barbers = await getActiveBarbers();
    if (!barbers.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-text">Sin barberos registrados</div></div>';
      return;
    }
    list.innerHTML = barbers.map(b => `
      <div class="barber-admin-row">
        <div class="barber-admin-avatar">${(b.name||'B')[0].toUpperCase()}</div>
        <div class="barber-admin-info">
          <div class="barber-admin-name">${b.name}</div>
          <div class="barber-admin-meta">${b.specialty||'—'}</div>
          ${b.phone ? `<div class="barber-admin-phone">${b.phone}</div>` : '<div class="barber-admin-meta" style="color:var(--danger)">Sin WhatsApp registrado</div>'}
        </div>
        <div class="appt-actions">
          <button class="btn btn-edit btn-sm" onclick="openEditBarber('${b.id}')">Editar</button>
          <button class="btn btn-del btn-sm" onclick="deleteBarberAdmin('${b.id}')">Eliminar</button>
        </div>
      </div>
    `).join('');
  } catch(e) {
    list.innerHTML = '<p style="color:var(--text-muted)">Error al cargar.</p>';
  }
}

async function addAdminBarber() {
  const name = document.getElementById('nb_name').value.trim();
  const specialty = document.getElementById('nb_specialty').value.trim();
  const phone = document.getElementById('nb_phone').value.trim();
  if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
  try {
    await fbAdd(COL_BARBERS_CITAS, { name, specialty, phone });
    document.getElementById('nb_name').value = '';
    document.getElementById('nb_specialty').value = '';
    document.getElementById('nb_phone').value = '';
    showToast('Barbero agregado', 'success');
    await getActiveBarbers();
    loadAdminBarbers();
    loadAdminStats();
  } catch(e) {
    showToast('Error al agregar barbero', 'error');
  }
}

async function openEditBarber(id) {
  const b = await fbGet(COL_BARBERS_CITAS, id);
  if (!b) return;
  document.getElementById('editBarberId').value = id;
  document.getElementById('editBarberName').value = b.name || '';
  document.getElementById('editBarberSpec').value = b.specialty || '';
  document.getElementById('editBarberPhone').value = b.phone || '';
  openModal('editBarberModal');
}

async function saveEditBarber() {
  const id = document.getElementById('editBarberId').value;
  await fbPut(COL_BARBERS_CITAS, id, {
    name: document.getElementById('editBarberName').value.trim(),
    specialty: document.getElementById('editBarberSpec').value.trim(),
    phone: document.getElementById('editBarberPhone').value.trim(),
  });
  closeModal('editBarberModal');
  showToast('Barbero actualizado', 'success');
  await getActiveBarbers();
  loadAdminBarbers();
  loadHomeBarbers();
}

async function deleteBarberAdmin(id) {
  if (!confirm('¿Eliminar este barbero? Sus citas existentes no se borrarán.')) return;
  await fbDelete(COL_BARBERS_CITAS, id);
  showToast('Barbero eliminado', 'success');
  await getActiveBarbers();
  loadAdminBarbers();
  loadAdminStats();
  loadHomeBarbers();
}

/* ======================================================
   ADMIN: TABS
   ====================================================== */
function adminTab(name, el) {
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tabCitas').classList.remove('active');
  document.getElementById('tabBarberos').classList.remove('active');
  document.getElementById(`tab${name.charAt(0).toUpperCase()+name.slice(1)}`).classList.add('active');
  if (name === 'barberos') loadAdminBarbers();
}

/* ======================================================
   MODALS
   ====================================================== */
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
// Cerrar modal al hacer click fuera
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

/* ======================================================
   INIT
   ====================================================== */
document.addEventListener('DOMContentLoaded', () => {
  loadHomeBarbers();
});