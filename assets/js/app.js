/* =====================================================
   CABALLEROS BARBERIA — app.js v2.0
   ===================================================== */

// Admin credentials
const ADMIN_CREDENTIALS = [
  { user: 'admin', pass: '@4dm1n123', name: 'Dueno - Admin' }
];

const COL_APPOINTMENTS  = 'citas';
const COL_BARBERS_CITAS = 'barberos_citas';

/* =====================================================
   ESTADO
   ===================================================== */
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

let _refreshIntervalAdmin = null;
let _refreshIntervalHome  = null;

/* =====================================================
   TEMA: BOGOTA — CLARO 6:00-18:00 / OSCURO resto
   ===================================================== */
function getBogotaHour() {
  const now = new Date();
  const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  return bogota.getHours();
}

function applyTheme() {
  const hour = getBogotaHour();
  const isDark = hour < 6 || hour >= 18;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// Aplica tema al cargar y revisa cada minuto
applyTheme();
setInterval(applyTheme, 60_000);

/* =====================================================
   TOAST
   ===================================================== */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(t._to);
  t._to = setTimeout(() => t.className = '', 3400);
}

/* =====================================================
   VALIDACIONES DE INPUT
   ===================================================== */
function onlyNumbers(input) {
  input.value = input.value.replace(/[^0-9]/g, '');
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = '';
}

function setFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function validateName(val) {
  if (!val) return 'El nombre es obligatorio.';
  if (val.length < 2) return 'El nombre debe tener al menos 2 caracteres.';
  if (/\d/.test(val)) return 'El nombre no puede contener numeros.';
  return '';
}

function validatePhone(val) {
  if (!val) return 'El telefono es obligatorio.';
  if (!/^\d+$/.test(val)) return 'Solo se permiten digitos.';
  if (val.length < 7 || val.length > 15) return 'Ingresa un numero valido (7-15 digitos).';
  return '';
}

/* =====================================================
   PREVIEW DE FOTO
   ===================================================== */
function previewPhoto(inputId, imgId, placeholderId) {
  const input = document.getElementById(inputId);
  const img   = document.getElementById(imgId);
  const ph    = document.getElementById(placeholderId);
  if (!input.files || !input.files[0]) return;

  const file = input.files[0];
  if (!file.type.startsWith('image/')) {
    showToast('Solo se permiten archivos de imagen.', 'error');
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('La imagen no puede superar 5 MB.', 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    img.src = e.target.result;
    img.style.display = 'block';
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

/* Convierte foto a base64 para guardar en Firestore */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* =====================================================
   FIREBASE HELPERS
   ===================================================== */
async function fbAdd(col, data) {
  const ref = await db.collection(col).add({
    ...data,
    _createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
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
async function fbDelete(col, id) { await db.collection(col).doc(id).delete(); }
async function fbQuery(col, field, op, val) {
  const snap = await db.collection(col).where(field, op, val).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* =====================================================
   FECHA / HORA  (zona Bogota)
   ===================================================== */
const DAYS_ES   = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function nowBogota() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
}

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
  const today = nowBogota();
  today.setHours(0,0,0,0);
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
    const val   = `${String(h).padStart(2,'0')}:00`;
    slots.push({ label, val, h });
  }
  return slots;
}

function buildTimeOptions(minDate, minHour) {
  return generateHours()
    .filter(s => !(minDate && minHour !== null && s.h <= minHour))
    .map(s => `<option value="${s.val}">${s.label}</option>`)
    .join('');
}

/* ¿El slot (dateKey + "HH:00") ya paso en Bogota? */
function isPastSlot(dateStr, timeVal) {
  const now  = nowBogota();
  const [y,m,d]   = dateStr.split('-').map(Number);
  const hour      = parseInt(timeVal.split(':')[0], 10);
  const slotDate  = new Date(y, m-1, d, hour, 0, 0);
  return slotDate <= now;
}

function todayKey() { return dateKey(nowBogota()); }

/* =====================================================
   RENDERIZAR AVATAR (imagen o inicial)
   ===================================================== */
function avatarHTML(barber, sizeClass = '') {
  if (barber.photo) {
    return `<div class="barber-avatar ${sizeClass}"><img src="${barber.photo}" alt="${barber.name}" /></div>`;
  }
  const letter = (barber.name || 'B')[0].toUpperCase();
  return `<div class="barber-avatar ${sizeClass}">${letter}</div>`;
}

/* =====================================================
   CARGAR BARBEROS (HOME)
   ===================================================== */
async function loadHomeBarbers() {
  try {
    const barbers = await getActiveBarbers();
    const el = document.getElementById('homeBarbers');
    if (!barbers.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:14px;width:100%;text-align:center">Proximamente mas informacion del equipo.</p>';
      return;
    }
    el.innerHTML = barbers.map(b => `
      <div class="barber-card" onclick="startBookingWith('${b.id}')">
        ${avatarHTML(b)}
        <div class="barber-name">${b.name}</div>
        <div class="barber-specialty">${b.specialty || 'Barbero profesional'}</div>
        <div class="barber-avail">Disponible</div>
      </div>
    `).join('');
  } catch(e) { console.error(e); }
}

async function getActiveBarbers() {
  try {
    const all = await fbGetAll(COL_BARBERS_CITAS);
    state.allBarbers = all.filter(b => !b._deleted);
    return state.allBarbers;
  } catch(e) { return []; }
}

/* =====================================================
   FLOW: INICIO
   ===================================================== */
function startBooking() { showFlow(); loadBarberStep(); }

function startBookingWith(barberId) { showFlow(); loadBarberStep(barberId); }

function showFlow() {
  document.getElementById('homeView').style.display = 'none';
  document.getElementById('successScreen').classList.remove('active');
  const flow = document.getElementById('flow');
  flow.style.display = 'block';
  goToStep(1);
}

function resetFlow() {
  stopHomeRefresh();
  state.step = 0;
  state.selectedBarber = state.selectedDate = state.selectedTime = null;
  document.getElementById('homeView').style.display = 'block';
  document.getElementById('flow').style.display = 'none';
  document.getElementById('successScreen').classList.remove('active');
  loadHomeBarbers();
  startHomeRefresh();
}

/* =====================================================
   STEP NAVIGATION
   ===================================================== */
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
    if (i < current) dot.innerHTML = '<i class="bi bi-check-lg" style="font-size:12px"></i>';
    else dot.textContent = i;
  }
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`line${i}`).className = 'step-line' + (i < current ? ' done' : '');
  }
}

/* =====================================================
   STEP 1: BARBEROS
   ===================================================== */
async function loadBarberStep(preselect = null) {
  const grid = document.getElementById('barberGrid');
  grid.innerHTML = '<div class="loader"><div class="spinner"></div> Cargando…</div>';
  const barbers = await getActiveBarbers();
  if (!barbers.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No hay barberos registrados aun.</p>';
    return;
  }
  grid.innerHTML = barbers.map(b => `
    <div class="barber-card ${preselect===b.id?'selected':''}" id="bc_${b.id}" onclick="selectBarber('${b.id}')">
      ${avatarHTML(b)}
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
  const el = document.getElementById(`bc_${id}`);
  if (el) el.classList.add('selected');
  setTimeout(() => { goToStep(2); buildDateStep(); }, 220);
}

/* =====================================================
   STEP 2: FECHA — no permite dias pasados
   ===================================================== */
function buildDateStep() {
  const row  = document.getElementById('dateRow');
  const days = getNextDays(14);
  const todayStr = todayKey();

  row.innerHTML = days.map(d => {
    const key     = dateKey(d);
    const isToday = key === todayStr;
    // no deshabilitar dias — desde hoy en adelante todos son validos
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

/* =====================================================
   STEP 3: HORA — oculta slots pasados
   ===================================================== */
async function loadTimeStep() {
  const grid = document.getElementById('timeGrid');
  grid.innerHTML = '<div class="loader"><div class="spinner"></div> Verificando disponibilidad…</div>';

  const taken = await fbQuery(COL_APPOINTMENTS, 'barberId', '==', state.selectedBarber.id);
  state.takenSlots = taken
    .filter(a => a.date === state.selectedDate && a.status !== 'cancelled')
    .map(a => a.time);

  const slots     = generateHours();
  const nowBog    = nowBogota();
  const todayStr  = todayKey();
  const nowHour   = nowBog.getHours();

  const available = slots.filter(s => {
    if (state.takenSlots.includes(s.val)) return false;
    if (state.selectedDate === todayStr && s.h <= nowHour) return false;
    return true;
  });

  if (!available.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--text-muted)">
        <i class="bi bi-clock-history" style="font-size:36px;display:block;margin-bottom:12px;color:var(--text-dim)"></i>
        No hay horarios disponibles para este dia. Por favor elige otra fecha.
        <br>
        <button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="goToStep(2)">
          <i class="bi bi-arrow-left"></i> Cambiar fecha
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = slots.map(s => {
    const isTaken = state.takenSlots.includes(s.val);
    const isPast  = state.selectedDate === todayStr && s.h <= nowHour;
    const period  = s.h < 12 ? 'AM' : 'PM';

    if (isPast) {
      return `
        <div class="time-slot past">
          ${s.label.replace(' AM','').replace(' PM','')}
          <div class="time-period">${period}</div>
          <div style="font-size:10px;color:var(--text-dim)">Pasado</div>
        </div>
      `;
    }
    return `
      <div class="time-slot ${isTaken?'taken':''} ${state.selectedTime===s.val&&!isTaken?'selected':''}"
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

/* =====================================================
   STEP 4: DATOS CLIENTE
   ===================================================== */
function buildSummary() {
  const hours = generateHours();
  const slot  = hours.find(h => h.val === state.selectedTime);
  document.getElementById('bookingSummary').innerHTML = `
    <div class="summary-row">
      <span class="summary-key"><i class="bi bi-person-fill"></i> Barbero</span>
      <span class="summary-val">${state.selectedBarber.name}</span>
    </div>
    <div class="summary-row">
      <span class="summary-key"><i class="bi bi-calendar3"></i> Fecha</span>
      <span class="summary-val">${formatDateLong(state.selectedDate)}</span>
    </div>
    <div class="summary-row">
      <span class="summary-key"><i class="bi bi-clock"></i> Hora</span>
      <span class="summary-val">${slot ? slot.label : state.selectedTime}</span>
    </div>
  `;
}

/* =====================================================
   CONFIRMAR CITA
   ===================================================== */
async function confirmBooking() {
  const nameVal  = document.getElementById('clientName').value.trim();
  const phoneVal = document.getElementById('clientPhone').value.trim();

  const nameErr  = validateName(nameVal);
  const phoneErr = validatePhone(phoneVal);

  setFieldError('errClientName',  nameErr);
  setFieldError('errClientPhone', phoneErr);

  if (nameErr || phoneErr) return;

  // Re-verificar que el slot no haya pasado justo antes de confirmar
  if (isPastSlot(state.selectedDate, state.selectedTime)) {
    showToast('Ese horario ya paso. Por favor elige otro.', 'error');
    goToStep(3);
    loadTimeStep();
    return;
  }

  const btn = document.querySelector('.btn-confirm');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;margin:0 auto"></div>';

  try {
    const apptData = {
      clientName  : nameVal,
      clientPhone : phoneVal,
      barberId    : state.selectedBarber.id,
      barberName  : state.selectedBarber.name,
      barberPhone : state.selectedBarber.phone || '',
      date        : state.selectedDate,
      time        : state.selectedTime,
      status      : 'pending',
    };

    const id = await fbAdd(COL_APPOINTMENTS, apptData);
    state.lastApptId = id;
    showSuccessScreen(apptData);
    showToast('Cita agendada exitosamente!', 'success');
  } catch(e) {
    console.error(e);
    showToast('Error al guardar la cita. Intenta de nuevo.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> CONFIRMAR CITA';
  }
}

/* =====================================================
   PANTALLA EXITO + WHATSAPP
   ===================================================== */
function showSuccessScreen(appt) {
  document.getElementById('flow').style.display = 'none';
  document.getElementById('homeView').style.display = 'none';

  const hours     = generateHours();
  const slot      = hours.find(h => h.val === appt.time);
  const timeLabel = slot ? slot.label : appt.time;
  const dateLabel = formatDateLong(appt.date);

  document.getElementById('successDetail').innerHTML = `
    <div class="summary-row"><span class="summary-key">Cliente</span><span class="summary-val">${appt.clientName}</span></div>
    <div class="summary-row"><span class="summary-key">Barbero</span><span class="summary-val">${appt.barberName}</span></div>
    <div class="summary-row"><span class="summary-key">Fecha</span><span class="summary-val">${dateLabel}</span></div>
    <div class="summary-row"><span class="summary-key">Hora</span><span class="summary-val">${timeLabel}</span></div>
    <div class="summary-row"><span class="summary-key">Telefono</span><span class="summary-val">${appt.clientPhone}</span></div>
  `;

  buildWhatsAppLink(appt, timeLabel, dateLabel);

  document.getElementById('successScreen').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function buildWhatsAppLink(appt, timeLabel, dateLabel) {
  const phone   = appt.barberPhone ? appt.barberPhone.replace(/\D/g,'') : '';
  const msg     = `Hola ${appt.barberName}, soy *${appt.clientName}*. Acabo de agendar una cita contigo para el dia *${dateLabel}* a las *${timeLabel}*. Mi numero de contacto es: ${appt.clientPhone}. Hasta entonces!`;
  const encoded = encodeURIComponent(msg);
  const url     = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  document.getElementById('whatsappLink').href = url;
}

/* =====================================================
   ADMIN: LOGIN
   ===================================================== */
function showAdminLogin() {
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('adminPanel').classList.remove('active');
  document.getElementById('loginScreen').classList.add('active');
  setTimeout(() => document.getElementById('loginUser').focus(), 100);
}

function showClientView() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('mainApp').style.display = 'block';
}

function doAdminLogin() {
  const u     = document.getElementById('loginUser').value.trim();
  const p     = document.getElementById('loginPass').value;
  const found = ADMIN_CREDENTIALS.find(c => c.user === u && c.pass === p);
  if (!found) { showToast('Credenciales incorrectas', 'error'); return; }

  state.adminSession = found;
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('adminPanel').classList.add('active');
  document.getElementById('adminNameDisplay').textContent = found.name;
  loadAdminPanel();
  startAdminRefresh();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').classList.contains('active')) doAdminLogin();
});

function adminLogout() {
  stopAdminRefresh();
  state.adminSession = null;
  document.getElementById('adminPanel').classList.remove('active');
  document.getElementById('mainApp').style.display = 'block';
}

/* =====================================================
   AUTO-REFRESH (cada segundo)
   ===================================================== */
function startAdminRefresh() {
  stopAdminRefresh();
  _refreshIntervalAdmin = setInterval(() => {
    if (!state.adminSession) return stopAdminRefresh();
    loadAdminStats();
    // Solo recarga la lista si no hay modal abierto
    if (!document.getElementById('editModal').classList.contains('open') &&
        !document.getElementById('editBarberModal').classList.contains('open')) {
      const activeTab = document.querySelector('.tab.active');
      if (activeTab && activeTab.textContent.trim().includes('Citas')) loadAdminAppointments();
      if (activeTab && activeTab.textContent.trim().includes('Barberos')) loadAdminBarbers();
    }
  }, 30000); // cada 5s para no saturar Firestore
}

function stopAdminRefresh() {
  if (_refreshIntervalAdmin) { clearInterval(_refreshIntervalAdmin); _refreshIntervalAdmin = null; }
}

function startHomeRefresh() {
  stopHomeRefresh();
  _refreshIntervalHome = setInterval(() => {
    if (document.getElementById('homeView').style.display !== 'none') loadHomeBarbers();
  }, 10000);
}

function stopHomeRefresh() {
  if (_refreshIntervalHome) { clearInterval(_refreshIntervalHome); _refreshIntervalHome = null; }
}

/* =====================================================
   ADMIN: PANEL
   ===================================================== */
async function loadAdminPanel() {
  await Promise.all([
    loadAdminStats(),
    loadAdminAppointments(),
    loadAdminBarbers(),
  ]);
}

async function loadAdminStats() {
  try {
    const all      = await fbGetAll(COL_APPOINTMENTS);
    const today    = todayKey();
    const todayA   = all.filter(a => a.date === today && a.status !== 'cancelled');
    const pending  = all.filter(a => a.status === 'pending' && a.date >= today);
    const total    = all.filter(a => a.status !== 'cancelled');

    document.getElementById('adminStats').innerHTML = `
      <div class="stat-card gold">
        <div class="stat-icon"><i class="bi bi-calendar-day"></i></div>
        <div class="stat-label">Citas hoy</div>
        <div class="stat-value">${todayA.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-hourglass-split"></i></div>
        <div class="stat-label">Pendientes</div>
        <div class="stat-value">${pending.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-calendar-check"></i></div>
        <div class="stat-label">Total citas</div>
        <div class="stat-value">${total.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-people"></i></div>
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
    const filterDate   = document.getElementById('filterDate').value;
    if (filterBarber) all = all.filter(a => a.barberId === filterBarber);
    if (filterDate)   all = all.filter(a => a.date === filterDate);

    all.sort((a,b) => {
      const ka = `${a.date}${a.time}`, kb = `${b.date}${b.time}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    if (!all.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="bi bi-calendar-x"></i></div>
          <div class="empty-text">No hay citas registradas</div>
        </div>`;
      return;
    }

    const today = todayKey();
    list.innerHTML = all.map(a => {
      const isPast  = a.date < today || (a.date === today && isPastSlot(a.date, a.time));
      const hours   = generateHours();
      const slot    = hours.find(h => h.val === a.time);
      const timeLbl = slot ? slot.label : a.time;
      return `
        <div class="appt-card ${isPast?'past':''}" id="appt_${a.id}">
          <div class="appt-info">
            <div class="appt-client">
              <i class="bi bi-person-circle"></i> ${a.clientName}
            </div>
            <div class="appt-meta">
              <span><i class="bi bi-telephone"></i> ${a.clientPhone}</span>
              <span><i class="bi bi-scissors"></i> ${a.barberName}</span>
              <span><i class="bi bi-calendar3"></i> ${formatDateLong(a.date)}</span>
              <span><i class="bi bi-clock"></i> ${timeLbl}</span>
            </div>
            <div style="margin-top:7px">
              <span class="appt-badge">${a.status==='cancelled'?'Cancelada':'Pendiente'}</span>
            </div>
          </div>
          <div class="appt-actions">
            <button class="btn btn-edit btn-sm" onclick="openEditAppt('${a.id}')">
              <i class="bi bi-pencil"></i> Editar
            </button>
            <button class="btn btn-del btn-sm" onclick="deleteAppt('${a.id}')">
              <i class="bi bi-trash"></i> Eliminar
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Repoblar filtro barberos
    const barbers = await getActiveBarbers();
    const sel     = document.getElementById('filterBarber');
    const curVal  = sel.value;
    sel.innerHTML = '<option value="">Todos los barberos</option>' +
      barbers.map(b => `<option value="${b.id}" ${curVal===b.id?'selected':''}>${b.name}</option>`).join('');
  } catch(e) {
    list.innerHTML = '<p style="color:var(--text-muted);padding:20px">Error al cargar las citas.</p>';
  }
}

function clearAdminFilter() {
  document.getElementById('filterBarber').value = '';
  document.getElementById('filterDate').value   = '';
  loadAdminAppointments();
}

/* =====================================================
   ADMIN: EDITAR CITA
   ===================================================== */
async function openEditAppt(id) {
  const appt = await fbGet(COL_APPOINTMENTS, id);
  if (!appt) return;

  document.getElementById('editApptId').value = id;
  document.getElementById('editClient').value = appt.clientName || '';
  document.getElementById('editPhone').value  = appt.clientPhone || '';
  document.getElementById('editDate').value   = appt.date || '';

  // Restriccion: fecha minima = hoy
  document.getElementById('editDate').min = todayKey();

  const barbers = await getActiveBarbers();
  document.getElementById('editBarberSel').innerHTML =
    barbers.map(b => `<option value="${b.id}" ${appt.barberId===b.id?'selected':''}>${b.name}</option>`).join('');

  document.getElementById('editTime').innerHTML = buildTimeOptions();
  document.getElementById('editTime').value     = appt.time || '';

  openModal('editModal');
}

async function saveEditAppointment() {
  const id      = document.getElementById('editApptId').value;
  const name    = document.getElementById('editClient').value.trim();
  const phone   = document.getElementById('editPhone').value.trim();
  const dateVal = document.getElementById('editDate').value;
  const timeVal = document.getElementById('editTime').value;

  if (!name || !phone || !dateVal || !timeVal) {
    showToast('Completa todos los campos.', 'error'); return;
  }
  if (validatePhone(phone)) { showToast(validatePhone(phone), 'error'); return; }

  // No permitir fechas pasadas
  if (dateVal < todayKey()) {
    showToast('No puedes asignar una cita en una fecha pasada.', 'error'); return;
  }

  const barbers  = await getActiveBarbers();
  const barberId = document.getElementById('editBarberSel').value;
  const barber   = barbers.find(b => b.id === barberId);

  await fbPut(COL_APPOINTMENTS, id, {
    clientName  : name,
    clientPhone : phone,
    barberId,
    barberName  : barber ? barber.name : '',
    barberPhone : barber ? (barber.phone||'') : '',
    date        : dateVal,
    time        : timeVal,
  });
  closeModal('editModal');
  showToast('Cita actualizada', 'success');
  loadAdminAppointments();
  loadAdminStats();
}

async function deleteAppt(id) {
  if (!confirm('Eliminar esta cita? Esta accion no se puede deshacer.')) return;
  await fbDelete(COL_APPOINTMENTS, id);
  showToast('Cita eliminada', 'success');
  loadAdminAppointments();
  loadAdminStats();
}

/* =====================================================
   ADMIN: BARBEROS
   ===================================================== */
async function loadAdminBarbers() {
  const list = document.getElementById('adminBarbersList');
  list.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  try {
    const barbers = await getActiveBarbers();
    if (!barbers.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="bi bi-people"></i></div>
          <div class="empty-text">Sin barberos registrados</div>
        </div>`;
      return;
    }
    list.innerHTML = barbers.map(b => {
      const avatarHtml = b.photo
        ? `<div class="barber-admin-avatar"><img src="${b.photo}" alt="${b.name}" /></div>`
        : `<div class="barber-admin-avatar">${(b.name||'B')[0].toUpperCase()}</div>`;
      return `
        <div class="barber-admin-row">
          ${avatarHtml}
          <div class="barber-admin-info">
            <div class="barber-admin-name">${b.name}</div>
            <div class="barber-admin-meta"><i class="bi bi-star"></i> ${b.specialty||'—'}</div>
            ${b.phone
              ? `<div class="barber-admin-phone"><i class="bi bi-whatsapp"></i> ${b.phone}</div>`
              : `<div class="barber-admin-meta" style="color:var(--danger)"><i class="bi bi-exclamation-circle"></i> Sin WhatsApp</div>`
            }
          </div>
          <div class="appt-actions">
            <button class="btn btn-edit btn-sm" onclick="openEditBarber('${b.id}')">
              <i class="bi bi-pencil"></i> Editar
            </button>
            <button class="btn btn-del btn-sm" onclick="deleteBarberAdmin('${b.id}')">
              <i class="bi bi-trash"></i> Eliminar
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch(e) {
    list.innerHTML = '<p style="color:var(--text-muted)">Error al cargar.</p>';
  }
}

async function addAdminBarber() {
  const name      = document.getElementById('nb_name').value.trim();
  const specialty = document.getElementById('nb_specialty').value.trim();
  const phone     = document.getElementById('nb_phone').value.trim();
  const photoFile = document.getElementById('nb_photo').files[0];

  if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
  if (phone && validatePhone(phone)) { showToast(validatePhone(phone), 'error'); return; }

  let photoBase64 = '';
  if (photoFile) {
    try { photoBase64 = await fileToBase64(photoFile); }
    catch(e) { showToast('Error al procesar la foto.', 'error'); return; }
  }

  try {
    await fbAdd(COL_BARBERS_CITAS, { photo: photoBase64, name, specialty, phone });
    // Reset form
    document.getElementById('nb_photo').value = '';
    document.getElementById('nb_photoImg').style.display = 'none';
    document.getElementById('nb_photoPreview').style.display = 'flex';
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

  document.getElementById('editBarberId').value    = id;
  document.getElementById('editBarberName').value  = b.name || '';
  document.getElementById('editBarberSpec').value  = b.specialty || '';
  document.getElementById('editBarberPhone').value = b.phone || '';

  // Mostrar foto actual si existe
  const img = document.getElementById('edit_photoImg');
  const ph  = document.getElementById('edit_photoPreview');
  if (b.photo) {
    img.src = b.photo;
    img.style.display = 'block';
    if (ph) ph.style.display = 'none';
  } else {
    img.style.display = 'none';
    if (ph) ph.style.display = 'flex';
  }
  // Limpiar input archivo
  document.getElementById('edit_photo').value = '';

  openModal('editBarberModal');
}

async function saveEditBarber() {
  const id       = document.getElementById('editBarberId').value;
  const name     = document.getElementById('editBarberName').value.trim();
  const spec     = document.getElementById('editBarberSpec').value.trim();
  const phone    = document.getElementById('editBarberPhone').value.trim();
  const photoFile= document.getElementById('edit_photo').files[0];

  if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
  if (phone && validatePhone(phone)) { showToast(validatePhone(phone), 'error'); return; }

  const updateData = { name, specialty: spec, phone };

  if (photoFile) {
    try { updateData.photo = await fileToBase64(photoFile); }
    catch(e) { showToast('Error al procesar la foto.', 'error'); return; }
  }

  await fbPut(COL_BARBERS_CITAS, id, updateData);
  closeModal('editBarberModal');
  showToast('Barbero actualizado', 'success');
  await getActiveBarbers();
  loadAdminBarbers();
  loadHomeBarbers();
}

async function deleteBarberAdmin(id) {
  if (!confirm('Eliminar este barbero? Sus citas existentes no se borraran.')) return;
  await fbDelete(COL_BARBERS_CITAS, id);
  showToast('Barbero eliminado', 'success');
  await getActiveBarbers();
  loadAdminBarbers();
  loadAdminStats();
  loadHomeBarbers();
}

/* =====================================================
   ADMIN: TABS
   ===================================================== */
function adminTab(name, el) {
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tabCitas').classList.remove('active');
  document.getElementById('tabBarberos').classList.remove('active');
  document.getElementById(`tab${name.charAt(0).toUpperCase()+name.slice(1)}`).classList.add('active');
  if (name === 'barberos') loadAdminBarbers();
  if (name === 'citas')    loadAdminAppointments();
}

/* =====================================================
   MODALS
   ===================================================== */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

/* =====================================================
   INIT
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  loadHomeBarbers();
  startHomeRefresh();

  // Restriccion de fecha minima en inputs de fecha del modal
  document.getElementById('editDate').min = todayKey();
});
