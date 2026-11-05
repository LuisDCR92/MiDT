// =====================================================================
// MiDT · Capa de nube (Supabase)
// - Inicio de sesión, alta de academia / canje de código
// - Carga los datos a la misma estructura que usa la app (teams) y guarda solo lo que cambió
// - Copia en este dispositivo para trabajar sin señal; se sube al volver la conexión
// - Vista para padres (solo su hijo)
// =====================================================================
(function () {
'use strict';

const NUBE = window.NUBE = {
  sb: null, user: null, modo: 'carga', academias: [], academiaId: null, rol: null,
  snap: {}, sucio: false, sincronizando: false, repetir: false, error: null
};
const CACHE_KEY = 'midt_cache_v2';
const $ = id => document.getElementById(id);

// Orden de dependencias (para insertar); al borrar se usa el orden inverso
const TABLAS = [
  { t: 'equipos' },
  { t: 'jugadores' },
  { t: 'consentimientos', soloInsertar: true, sinBorrar: true },
  { t: 'partidos' },
  { t: 'partido_stats' },
  { t: 'entrenos' },
  { t: 'asistencias', opcional: true },   // opcional: si falta el parche 03 en la base, la app sigue funcionando
  { t: 'ejercicios' },
  { t: 'evaluaciones' },
  { t: 'evaluacion_resultados' }
];

// ---------------------------------------------------------------- utilidades
const esErrorRed = e => !navigator.onLine ||
  /failed to fetch|networkerror|load failed|network request failed|fetch/i.test(String((e && (e.message || e)) || ''));

function traducirError(msg) {
  msg = String(msg || '');
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(msg)) return 'Primero confirma tu correo (revisa tu bandeja de entrada y spam).';
  if (/already registered|already been registered/i.test(msg)) return 'Ese correo ya tiene cuenta. Usa "Entrar".';
  if (/password should be at least|weak password/i.test(msg)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (/c[oó]digo de alta/i.test(msg)) return 'El código de alta no es válido, ya se usó o venció. Pide uno nuevo.';
  if (/c[oó]digo inv[aá]lido/i.test(msg)) return 'El código no es válido, ya se usó o venció. Pide uno nuevo.';
  if (/invalid api key/i.test(msg)) return 'La clave pública de la app no es válida (revisa config.js).';
  if (esErrorRed(msg)) return 'Sin conexión con el servidor. Revisa tu internet.';
  return msg;
}
function setModo(m) { NUBE.modo = m; document.body.dataset.modo = m; }
function estadoSync(txt, clase) {
  const e = $('estadoSync'); if (!e) return;
  e.textContent = txt || ''; e.className = clase ? 'sync-' + clase : ''; e.style.display = txt ? 'block' : 'none';
}
function descargarJSON(nombre, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function urlApp() { return MIDT_CONFIG.APP_URL || (location.origin + location.pathname.replace(/[^/]*$/, '')); }

// Diálogo sencillo
function dialogo(titulo, nodoOHtml, botones) {
  const dlg = $('dlg'); dlg.innerHTML = '';
  const h = document.createElement('h3'); h.style.marginTop = '0'; h.textContent = titulo; dlg.appendChild(h);
  const cuerpo = document.createElement('div');
  if (typeof nodoOHtml === 'string') cuerpo.innerHTML = nodoOHtml; else cuerpo.appendChild(nodoOHtml);
  dlg.appendChild(cuerpo);
  const fila = document.createElement('div'); fila.className = 'acciones'; fila.style.marginTop = '1rem';
  (botones || [{ txt: 'Cerrar' }]).forEach(b => {
    const bt = document.createElement('button'); bt.type = 'button'; bt.className = b.clase || 'btn-primary'; bt.textContent = b.txt;
    bt.onclick = () => { if (!b.mantener) dlg.close(); if (b.fn) b.fn(); };
    fila.appendChild(bt);
  });
  dlg.appendChild(fila);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

// ---------------------------------------------------------------- copia local (sin señal)
function cacheEscribir() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      uid: NUBE.user && NUBE.user.id, email: NUBE.user && NUBE.user.email,
      academiaId: NUBE.academiaId, rol: NUBE.rol, academias: NUBE.academias,
      teams, activeTeamId, snap: NUBE.snap, sucio: NUBE.sucio
    }));
    if (activeTeamId) localStorage.setItem('midt_equipo', activeTeamId);
  } catch (e) { console.warn('No se pudo escribir la copia local', e); }
}
function cacheLeer() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; } }
function cacheBorrar() { localStorage.removeItem(CACHE_KEY); }

// ---------------------------------------------------------------- app → filas de la base de datos
function filasDesdeApp() {
  const A = NUBE.academiaId;
  const R = {}; TABLAS.forEach(d => R[d.t] = []);
  teams.forEach(t => {
    ensureTeamDefaults(t);
    R.equipos.push({ id: t.id, academia_id: A, nombre: t.nombre,
      contacto_nombre: (t.entrenador && t.entrenador.nombre) || null,
      contacto_tel: (t.entrenador && t.entrenador.tel) || null, uniformes: t.uniformes || [] });
    const idsJ = new Set(t.jugadores.map(j => j.id));
    t.jugadores.forEach(j => {
      R.jugadores.push({ id: j.id, academia_id: A, equipo_id: t.id, nombre: j.nombre,
        anio_nacimiento: j.anio || null, posicion: j.posicion || null,
        dia_cumple: j.diaCumple || null, mes_cumple: j.mesCumple || null,
        tel_tutor: j.tel || null, estado: j.estado === 'baja' ? 'baja' : 'activo',
        baja_fecha: j.bajaFecha || null, baja_motivo: j.bajaMotivo || null });
      const c = j.consentimiento;
      if (c && c.id) R.consentimientos.push({ id: c.id, academia_id: A, jugador_id: j.id,
        tutor_nombre: c.tutor, version_aviso: c.version, via: c.via || 'presencial', aceptado_en: c.fecha });
    });
    t.historial.forEach(p => {
      R.partidos.push({ id: p.id, academia_id: A, equipo_id: t.id, fecha: p.fecha, rival: p.rival || '',
        favor: p.favor || 0, contra: p.contra || 0, minutos_contra: p.minutosContra || [] });
      (p.stats || []).forEach(s => {
        if (!idsJ.has(s.jugadorId)) return;           // jugador ya borrado definitivamente
        if (!s.id) s.id = nuevoId();
        R.partido_stats.push({ id: s.id, academia_id: A, partido_id: p.id, jugador_id: s.jugadorId,
          jugo: s.jugo !== false, goles: s.goles || 0, minutos_goles: s.minutosGoles || [], asist: s.asist || 0,
          minutos: s.minutos || 0, duelos: s.duelos || 0, amarilla: s.amarilla || 0, roja: s.roja || 0 });
      });
    });
    t.entrenos.forEach(e => R.entrenos.push({ id: e.id, academia_id: A, equipo_id: t.id, fecha: e.fecha,
      hora: e.hora, lugar: e.lugar || '', notas: e.notas || null, recordatorio: !!e.rec }));
    // asistencia: una fila por jugador del equipo (si el jugador ya no está, se descarta; una sola por jugador y entreno)
    t.entrenos.forEach(e => {
      const vistos = new Set();
      (e.asistencia || []).forEach(a => {
        if (!a || !a.id || !idsJ.has(a.jugadorId) || vistos.has(a.jugadorId)) return;
        vistos.add(a.jugadorId);
        R.asistencias.push({ id: a.id, academia_id: A, entreno_id: e.id, jugador_id: a.jugadorId, asistio: a.asistio !== false });
      });
    });
    t.ejercicios.forEach(x => R.ejercicios.push({ id: x.id, academia_id: A, equipo_id: t.id, nombre: x.nombre,
      tipo: x.tipo || 'personalizado', unidad: x.unidad || '', descripcion: x.descripcion || null }));
    t.evaluaciones.forEach(v => {
      R.evaluaciones.push({ id: v.id, academia_id: A, equipo_id: t.id, ejercicio_id: v.ejercicioId, fecha: v.fecha });
      (v.resultados || []).forEach(r => {
        if (!idsJ.has(r.jugadorId)) return;
        if (!r.id) r.id = nuevoId();
        R.evaluacion_resultados.push({ id: r.id, academia_id: A, evaluacion_id: v.id, jugador_id: r.jugadorId, valor: r.valor });
      });
    });
  });
  return R;
}
function snapDeFilas(R) {
  const s = {}; TABLAS.forEach(({ t }) => { s[t] = {}; R[t].forEach(r => s[t][r.id] = JSON.stringify(r)); });
  return s;
}

// ---------------------------------------------------------------- filas de la base de datos → app
function appDesdeFilas(D, A) {
  const g = (arr, k) => { const m = new Map(); arr.forEach(r => { if (!m.has(r[k])) m.set(r[k], []); m.get(r[k]).push(r); }); return m; };
  const nombreJ = new Map(D.jugadores.map(j => [j.id, j.nombre]));
  const consent = new Map(D.consentimientos.map(c => [c.jugador_id, c]));
  const jPorE = g(D.jugadores, 'equipo_id'), pPorE = g(D.partidos, 'equipo_id'), enPorE = g(D.entrenos, 'equipo_id'), asPorEn = g(D.asistencias || [], 'entreno_id');
  const ejPorE = g(D.ejercicios, 'equipo_id'), evPorE = g(D.evaluaciones, 'equipo_id');
  const sPorP = g(D.partido_stats, 'partido_id'), rPorV = g(D.evaluacion_resultados, 'evaluacion_id');
  return D.equipos.map(e => ({
    id: e.id, nombre: e.nombre, uniformes: e.uniformes || [],
    entrenador: (e.contacto_nombre || e.contacto_tel) ? { nombre: e.contacto_nombre || '', tel: e.contacto_tel || '' } : null,
    jugadores: (jPorE.get(e.id) || []).map(j => ({
      id: j.id, nombre: j.nombre, tel: j.tel_tutor || '', anio: j.anio_nacimiento, posicion: j.posicion,
      diaCumple: j.dia_cumple, mesCumple: j.mes_cumple, estado: j.estado, bajaFecha: j.baja_fecha, bajaMotivo: j.baja_motivo,
      consentimiento: consent.has(j.id) ? { id: consent.get(j.id).id, tutor: consent.get(j.id).tutor_nombre,
        version: consent.get(j.id).version_aviso, via: consent.get(j.id).via, fecha: consent.get(j.id).aceptado_en } : null
    })),
    entrenos: (enPorE.get(e.id) || []).map(x => ({ id: x.id, fecha: x.fecha, hora: String(x.hora || '').slice(0, 5),
      lugar: x.lugar, notas: x.notas || '', rec: !!x.recordatorio,
      asistencia: (asPorEn.get(x.id) || []).map(a => ({ id: a.id, jugadorId: a.jugador_id, asistio: a.asistio })) })),
    historial: (pPorE.get(e.id) || []).map(p => ({ id: p.id, fecha: p.fecha, rival: p.rival, favor: p.favor, contra: p.contra,
      minutosContra: p.minutos_contra || [],
      stats: (sPorP.get(p.id) || []).map(s => ({ id: s.id, jugadorId: s.jugador_id, nombre: nombreJ.get(s.jugador_id) || '',
        jugo: s.jugo, goles: s.goles, minutosGoles: s.minutos_goles || [], asist: s.asist, minutos: s.minutos,
        duelos: s.duelos, amarilla: s.amarilla, roja: s.roja })) })),
    ejercicios: (ejPorE.get(e.id) || []).map(x => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, unidad: x.unidad, descripcion: x.descripcion || '' })),
    evaluaciones: (evPorE.get(e.id) || []).map(v => ({ id: v.id, ejercicioId: v.ejercicio_id, fecha: v.fecha,
      resultados: (rPorV.get(v.id) || []).map(r => ({ id: r.id, jugadorId: r.jugador_id, nombre: nombreJ.get(r.jugador_id) || '', valor: Number(r.valor) })) }))
  }));
}

async function traerTodo(tabla, filtrarAcademia) {
  const out = [];
  for (let d = 0; ; d += 1000) {
    let q = NUBE.sb.from(tabla).select('*');
    if (filtrarAcademia) q = q.eq('academia_id', NUBE.academiaId);
    const { data, error } = await q.order('id').range(d, d + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// Tabla que puede no existir todavía (si no se ha ejecutado el parche correspondiente): se trata como vacía
async function traerOpcional(tabla, filtrarAcademia) {
  try { const r = await traerTodo(tabla, filtrarAcademia); NUBE.sinAsistencia = false; return r; }
  catch (e) {
    const m = String((e && (e.message || e.code)) || '');
    if (/PGRST205|42P01|asistencias/i.test(m + ' ' + (e && e.code))) { NUBE.sinAsistencia = true; return []; }
    throw e;
  }
}

// ---------------------------------------------------------------- sincronización
window.cloudSave = function () {
  NUBE.sucio = true;
  if (NUBE.sincronizando) NUBE.repetir = true;
  cacheEscribir();
  if (NUBE.modo === 'staff') { estadoSync(navigator.onLine ? '⏳ Guardando…' : '📴 Sin conexión · cambios guardados en este dispositivo', navigator.onLine ? 'work' : 'offline'); programarSync(); }
};
let _timerSync = null;
function programarSync(ms) { clearTimeout(_timerSync); _timerSync = setTimeout(sincronizar, ms || 700); }

async function escribir(def, filas, prev) {
  const t = def.t, sb = NUBE.sb;
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200);
    if (def.soloInsertar) { const r = await sb.from(t).insert(lote); if (r.error) throw r.error; continue; }
    if (t === 'equipos') {
      // El coach puede editar equipos pero no crearlos: se separa insertar de actualizar
      for (const f of lote) {
        const r = prev[f.id]
          ? await sb.from(t).update({ nombre: f.nombre, contacto_nombre: f.contacto_nombre, contacto_tel: f.contacto_tel, uniformes: f.uniformes }).eq('id', f.id)
          : await sb.from(t).insert(f);
        if (r.error) throw r.error;
      }
      continue;
    }
    const r = await sb.from(t).upsert(lote, { onConflict: 'id' });
    if (r.error) throw r.error;
  }
}

async function sincronizar() {
  if (NUBE.modo !== 'staff' || !NUBE.sb || !NUBE.sucio) return;
  if (NUBE.sincronizando) { NUBE.repetir = true; return; }
  if (!navigator.onLine) { estadoSync('📴 Sin conexión · cambios guardados en este dispositivo', 'offline'); return; }
  NUBE.sincronizando = true; NUBE.repetir = false; NUBE.error = null;
  estadoSync('⏳ Guardando…', 'work');
  try {
    const filas = filasDesdeApp(), cur = snapDeFilas(filas);
    for (const def of TABLAS) {
      if (def.opcional && NUBE.sinAsistencia) continue;
      const prev = NUBE.snap[def.t] || {};
      const cambiadas = filas[def.t].filter(r => prev[r.id] !== cur[def.t][r.id]);
      if (cambiadas.length) await escribir(def, cambiadas, prev);
    }
    for (const def of [...TABLAS].reverse()) {
      if (def.sinBorrar || (def.opcional && NUBE.sinAsistencia)) continue;
      const prev = NUBE.snap[def.t] || {};
      const ids = Object.keys(prev).filter(id => !(id in cur[def.t]));
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await NUBE.sb.from(def.t).delete().in('id', ids.slice(i, i + 100));
        if (error) throw error;
      }
    }
    NUBE.snap = cur;
    NUBE.sucio = NUBE.repetir;
    cacheEscribir();
    estadoSync(NUBE.sucio ? '⏳ Guardando…' : '☁️ Guardado', NUBE.sucio ? 'work' : 'ok');
    if (!NUBE.sucio) setTimeout(() => { if (!NUBE.sucio && !NUBE.sincronizando) estadoSync('', ''); }, 2500);
  } catch (e) {
    console.error('Error al sincronizar', e);
    if (esErrorRed(e)) estadoSync('📴 Sin conexión · cambios guardados en este dispositivo', 'offline');
    else { NUBE.error = e; estadoSync('⚠️ No se pudo guardar — toca para reintentar', 'error'); }
  } finally {
    NUBE.sincronizando = false;
    if (NUBE.sucio && NUBE.repetir) programarSync(150);
  }
}
async function asegurarSincronizado() {
  for (let i = 0; i < 3 && NUBE.sucio; i++) { await sincronizar(); await new Promise(r => setTimeout(r, 50)); }
  return !NUBE.sucio;
}
window.addEventListener('online', () => { if (NUBE.sucio) sincronizar(); else if (NUBE.modo === 'staff') estadoSync('', ''); });
window.addEventListener('offline', () => { if (NUBE.modo === 'staff') estadoSync('📴 Sin conexión · cambios guardados en este dispositivo', 'offline'); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && NUBE.sucio) sincronizar(); });
setInterval(() => { if (NUBE.sucio && !NUBE.error) sincronizar(); }, 30000);
document.addEventListener('click', e => { if (e.target && e.target.id === 'estadoSync' && NUBE.error) { NUBE.error = null; NUBE.sucio = true; sincronizar(); } });

// ---------------------------------------------------------------- arranque y sesión
async function arrancar() {
  setModo('carga');
  if (!window.supabase) return arrancarSinLibreria();
  NUBE.sb = window.supabase.createClient(MIDT_CONFIG.SUPABASE_URL, MIDT_CONFIG.SUPABASE_KEY,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'midt-auth' } });
  NUBE.sb.auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY') setTimeout(mostrarCambioPassword, 0);
  });
  let sesion = null;
  try { const r = await NUBE.sb.auth.getSession(); sesion = r.data && r.data.session; } catch (e) { /* sin red */ }
  if (!sesion) {
    const c = cacheLeer();
    if (c && c.uid && !navigator.onLine) return arrancarDesdeCache('Sin conexión.');
    return setModo('auth');
  }
  await entrarConSesion(sesion);
}
function arrancarSinLibreria() {
  const c = cacheLeer();
  if (c && c.uid) return arrancarDesdeCache('No se pudo cargar la conexión con el servidor.');
  setModo('auth');
  $('authMsg').textContent = 'No se pudo cargar la conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
}

async function entrarConSesion(sesion) {
  NUBE.user = sesion.user; setModo('carga');
  try {
    const [mi, tu] = await Promise.all([
      NUBE.sb.from('miembros').select('academia_id, rol, nombre, academias(nombre)').eq('user_id', NUBE.user.id),
      NUBE.sb.from('tutores').select('jugador_id, academia_id').eq('user_id', NUBE.user.id)
    ]);
    if (mi.error) throw mi.error;
    if (tu.error) throw tu.error;
    NUBE.academias = (mi.data || []).map(m => ({ id: m.academia_id, rol: m.rol,
      nombre: (m.academias && m.academias.nombre) || 'Academia' }));
    if (NUBE.academias.length) {
      const guardada = localStorage.getItem('midt_academia');
      const a = NUBE.academias.find(x => x.id === guardada) || NUBE.academias[0];
      NUBE.academiaId = a.id; NUBE.rol = a.rol;
      await cargarStaff();
    } else if ((tu.data || []).length) {
      await cargarPadre();
    } else {
      setModo('onb');
    }
  } catch (e) {
    console.error(e);
    if (esErrorRed(e) && cacheLeer()) return arrancarDesdeCache('Sin conexión.');
    setModo('auth');
    $('authMsg').textContent = traducirError(e.message || e);
  }
}

function aplicarCache(c) {
  teams = c.teams || []; teams.forEach(ensureTeamDefaults);
  activeTeamId = c.activeTeamId || (teams[0] && teams[0].id) || null;
  NUBE.snap = c.snap || {}; NUBE.sucio = !!c.sucio; NUBE.academias = c.academias || [];
  NUBE.academiaId = c.academiaId; NUBE.rol = c.rol || 'entrenador';
}
function arrancarDesdeCache(motivo) {
  const c = cacheLeer();
  if (!c || !c.uid) { setModo('auth'); $('authMsg').textContent = motivo + ' No hay datos guardados en este dispositivo.'; return; }
  NUBE.user = { id: c.uid, email: c.email };
  aplicarCache(c); mostrarStaff();
  estadoSync('📴 Sin conexión · trabajando con la copia de este dispositivo', 'offline');
}

async function cargarStaff() {
  const c = cacheLeer();
  if (c && c.uid === NUBE.user.id && c.academiaId === NUBE.academiaId && c.sucio) {
    aplicarCache(c);                       // hay cambios sin subir: no los pisamos con lo de la nube
    mostrarStaff(); sincronizar(); return;
  }
  const D = {};
  const [eq, ju, co, pa, ps, en, ej, ev, er, asi] = await Promise.all(
    ['equipos', 'jugadores', 'consentimientos', 'partidos', 'partido_stats', 'entrenos', 'ejercicios', 'evaluaciones', 'evaluacion_resultados']
      .map(t => traerTodo(t, true)).concat([traerOpcional('asistencias', true)]));
  Object.assign(D, { equipos: eq, jugadores: ju, consentimientos: co, partidos: pa, partido_stats: ps, entrenos: en,
    ejercicios: ej, evaluaciones: ev, evaluacion_resultados: er, asistencias: asi });
  teams = appDesdeFilas(D, NUBE.academiaId); teams.forEach(ensureTeamDefaults);
  const pref = localStorage.getItem('midt_equipo');
  activeTeamId = (teams.find(t => t.id === pref) || teams[0] || {}).id || null;
  NUBE.snap = snapDeFilas(filasDesdeApp()); NUBE.sucio = false;
  cacheEscribir();
  mostrarStaff();
}

function mostrarStaff() {
  document.body.dataset.rol = NUBE.rol;
  setModo('staff');
  renderTeamSelector(); renderAll(); renderCuenta(); renderEquipoTrabajo(); renderMigrar();
  abrirTabDesdeHash(); checkRecordatorios();
  if (NUBE.sucio) sincronizar();
  ofrecerMigracion();
}

// ---------------------------------------------------------------- pantalla de acceso
let authModo = 'entrar';
function ponerAuthModo(m) {
  authModo = m;
  $('authTitulo').textContent = m === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta';
  $('btnAuth').textContent = m === 'entrar' ? 'Entrar' : 'Crear cuenta';
  $('linkAuthModo').textContent = m === 'entrar' ? '¿No tienes cuenta? Crear cuenta' : '¿Ya tienes cuenta? Entrar';
  $('authPass').autocomplete = m === 'entrar' ? 'current-password' : 'new-password';
  $('authMsg').textContent = '';
}
$('linkAuthModo').onclick = () => ponerAuthModo(authModo === 'entrar' ? 'registro' : 'entrar');
$('formAuth').addEventListener('submit', async e => {
  e.preventDefault();
  if (!NUBE.sb) return ($('authMsg').textContent = 'No se pudo cargar la conexión con el servidor. Revisa tu internet y recarga.');
  const email = $('authEmail').value.trim(), password = $('authPass').value;
  $('authMsg').textContent = 'Un momento…'; $('btnAuth').disabled = true;
  try {
    if (authModo === 'registro') {
      const { data, error } = await NUBE.sb.auth.signUp({ email, password, options: { emailRedirectTo: urlApp() } });
      if (error) throw error;
      if (data.session) return await entrarConSesion(data.session);
      $('authMsg').textContent = '✅ Te enviamos un correo para confirmar tu cuenta. Ábrelo y después vuelve aquí a iniciar sesión.';
      ponerAuthModo('entrar'); $('authMsg').textContent = '✅ Te enviamos un correo para confirmar tu cuenta. Ábrelo y después inicia sesión aquí.';
    } else {
      const { data, error } = await NUBE.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await entrarConSesion(data.session);
    }
  } catch (err) { $('authMsg').textContent = traducirError(err.message || err); }
  finally { $('btnAuth').disabled = false; }
});
$('linkOlvide').onclick = async () => {
  const email = $('authEmail').value.trim();
  if (!email) return ($('authMsg').textContent = 'Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".');
  const { error } = await NUBE.sb.auth.resetPasswordForEmail(email, { redirectTo: urlApp() });
  $('authMsg').textContent = error ? traducirError(error.message) : '✅ Si ese correo tiene cuenta, te enviamos un enlace para crear una nueva contraseña.';
};
function mostrarCambioPassword() {
  setModo('auth'); $('formAuth').style.display = 'none'; $('formNuevaPass').style.display = 'block';
}
$('formNuevaPass').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await NUBE.sb.auth.updateUser({ password: $('nuevaPass').value });
  if (error) return ($('authMsg').textContent = traducirError(error.message));
  location.href = urlApp();
});
$('btnDiag').onclick = async () => {
  const out = []; const salida = $('diagOut'); salida.textContent = 'Probando…';
  out.push(window.supabase ? '✅ Librería de conexión cargada' : '❌ No se cargó la librería de conexión (¿sin internet?)');
  if (NUBE.sb) {
    try {
      const r = await NUBE.sb.from('academias').select('id').limit(1);
      const c = (r.error && r.error.code) || '', m = (r.error && r.error.message) || '';
      if (!r.error) out.push('✅ Conectado (sin sesión no se ve ningún dato: es lo correcto)');
      else if (c === '42501' || /permission denied/i.test(m)) out.push('✅ Conectado y protegido: las tablas existen y exigen sesión');
      else if (c === 'PGRST205' || c === '42P01' || /could not find the table|does not exist/i.test(m)) out.push('❌ Conectó, pero las tablas no existen: falta ejecutar el esquema SQL en Supabase');
      else if (/invalid api key/i.test(m) || c === 'PGRST301') out.push('❌ La clave pública no es válida (revisa config.js)');
      else if (esErrorRed(m)) out.push('❌ Sin conexión con Supabase (revisa internet o la dirección en config.js)');
      else out.push('⚠️ Respuesta inesperada: ' + (c ? c + ' · ' : '') + m);
    } catch (e) { out.push('❌ Error: ' + e.message); }
  }
  out.push('Dirección: ' + MIDT_CONFIG.SUPABASE_URL);
  salida.textContent = out.join('\n');
};

// ---------------------------------------------------------------- alta de academia / código
$('formCrearAcademia').addEventListener('submit', async e => {
  e.preventDefault();
  const nombre = $('onbNombreAcademia').value.trim(); if (nombre.length < 2) return;
  const codigoAlta = $('onbCodigoAlta').value.trim(); if (!codigoAlta) return ($('onbMsg').textContent = 'Escribe el código de alta de academia.');
  $('onbMsg').textContent = 'Creando…';
  const { error } = await NUBE.sb.rpc('crear_academia', { p_nombre: nombre, p_codigo: codigoAlta });
  if (error) return ($('onbMsg').textContent = traducirError(error.message));
  const { data } = await NUBE.sb.auth.getSession(); await entrarConSesion(data.session);
});
$('formCodigo').addEventListener('submit', async e => {
  e.preventDefault();
  $('onbMsg').textContent = 'Verificando código…';
  const { error } = await NUBE.sb.rpc('canjear_invitacion', { p_codigo: $('onbCodigo').value });
  if (error) return ($('onbMsg').textContent = traducirError(error.message));
  const { data } = await NUBE.sb.auth.getSession(); await entrarConSesion(data.session);
});

// ---------------------------------------------------------------- cuenta y cierre de sesión
async function cerrarSesion() {
  if (NUBE.sucio) {
    await sincronizar();
    if (NUBE.sucio && !(await uiConfirm('Hay cambios que todavía no se han subido a la nube y se perderían al salir. ¿Salir de todos modos?', { peligro: true, aceptar: 'Salir' }))) return;
  }
  try { await NUBE.sb.auth.signOut(); } catch (e) { /* sin red */ }
  cacheBorrar(); localStorage.removeItem('midt_academia'); localStorage.removeItem('midt_equipo');
  location.reload();
}
window.cloudCerrarSesion = cerrarSesion;
$('btnSalirPadre').onclick = cerrarSesion;

function renderCuenta() {
  const c = $('cuentaInfo'); if (!c) return;
  const a = NUBE.academias.find(x => x.id === NUBE.academiaId);
  c.innerHTML = `<p style="margin:0 0 .4rem"><strong>${esc((NUBE.user && NUBE.user.email) || '')}</strong></p>
    <p style="margin:0;font-size:.9rem;color:#64748b">${esc(a ? a.nombre : '')} · ${NUBE.rol === 'director' ? 'Director' : 'Entrenador'}</p>`;
  const sel = $('selAcademia'); sel.innerHTML = '';
  NUBE.academias.forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.nombre; if (x.id === NUBE.academiaId) o.selected = true; sel.appendChild(o); });
  $('filaAcademia').style.display = NUBE.academias.length > 1 ? 'block' : 'none';
}
$('selAcademia').addEventListener('change', async () => {
  if (!(await asegurarSincronizado())) return alert('Primero hay que subir tus cambios (necesitas conexión).');
  localStorage.setItem('midt_academia', $('selAcademia').value); location.reload();
});
$('btnCerrarSesion').onclick = cerrarSesion;

// ---------------------------------------------------------------- invitaciones
async function crearInvitacion(tipo, equipoId, jugadorId) {
  if (!(await asegurarSincronizado())) { alert('Para invitar necesitas conexión: primero hay que subir tus cambios a la nube.'); return null; }
  const { data, error } = await NUBE.sb.rpc('crear_invitacion', { p_tipo: tipo, p_academia: NUBE.academiaId, p_equipo: equipoId || null, p_jugador: jugadorId || null });
  if (error) { alert('No se pudo crear la invitación: ' + traducirError(error.message)); return null; }
  return data;
}
function mostrarCodigo(titulo, codigo, texto, telefono) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<p style="margin:.2rem 0">Código (vence en 7 días y sirve una sola vez):</p>
    <p style="font-size:1.6rem;letter-spacing:.15em;font-weight:800;text-align:center;margin:.5rem 0">${esc(codigo)}</p>
    <pre style="white-space:pre-wrap;font-size:.85rem;background:#f1f5f9;padding:.7rem;border-radius:10px;margin:.6rem 0 0">${esc(texto)}</pre>`;
  dialogo(titulo, wrap, [
    { txt: '📱 Enviar por WhatsApp', clase: 'btn-whatsapp', fn: () => {
        const tel = telefono ? telWA(telefono) : '';
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener'); } },
    { txt: '📋 Copiar', clase: 'btn-mini', mantener: true, fn: () => { navigator.clipboard && navigator.clipboard.writeText(texto); } },
    { txt: 'Cerrar', clase: 'btn-mini' }
  ]);
}
window.cloudInvitarPadre = async function (jugadorId) {
  const t = getTeam(); const j = t && t.jugadores.find(x => x.id === jugadorId); if (!j) return;
  const codigo = await crearInvitacion('padre', null, jugadorId); if (!codigo) return;
  const texto = `Hola 👋 Te invito a MiDT para que puedas ver el avance de ${j.nombre} en ${t.nombre}.\n\n1) Abre: ${urlApp()}\n2) Crea tu cuenta con tu correo.\n3) Elige "Tengo un código" y escribe: ${codigo}\n\nEl código vence en 7 días.`;
  mostrarCodigo('Invitar a la familia de ' + j.nombre, codigo, texto, j.tel);
};
$('btnInvitarEntrenador').onclick = async () => {
  const eq = $('selEquipoInvitar').value || null;
  const codigo = await crearInvitacion('entrenador', eq, null); if (!codigo) return;
  const tn = eq ? (teams.find(t => t.id === eq) || {}).nombre : null;
  const texto = `Hola 👋 Te invito a MiDT${tn ? ' como entrenador de ' + tn : ''}.\n\n1) Abre: ${urlApp()}\n2) Crea tu cuenta con tu correo.\n3) Elige "Tengo un código" y escribe: ${codigo}\n\nEl código vence en 7 días.`;
  mostrarCodigo('Invitar a un entrenador', codigo, texto, '');
};

async function renderEquipoTrabajo() {
  const card = $('cardEquipoTrabajo'); if (!card) return;
  card.style.display = NUBE.rol === 'director' ? 'block' : 'none';
  if (NUBE.rol !== 'director') return;
  const sel = $('selEquipoInvitar'); sel.innerHTML = '<option value="">Sin equipo asignado todavía</option>';
  teams.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.nombre; sel.appendChild(o); });
  const lista = $('listaMiembros'); lista.innerHTML = '<p style="color:#64748b">Cargando…</p>';
  if (!navigator.onLine || !NUBE.sb) { lista.innerHTML = '<p style="color:#64748b">Disponible con conexión.</p>'; return; }
  const [m, a] = await Promise.all([
    NUBE.sb.from('miembros').select('user_id, rol, nombre').eq('academia_id', NUBE.academiaId),
    NUBE.sb.from('equipo_entrenadores').select('equipo_id, user_id').eq('academia_id', NUBE.academiaId)]);
  if (m.error || a.error) { lista.innerHTML = '<p style="color:#b91c1c">No se pudo cargar la lista.</p>'; return; }
  lista.innerHTML = '';
  m.data.forEach(x => {
    const fila = document.createElement('div'); fila.className = 'card'; fila.style.padding = '.8rem';
    const asignados = a.data.filter(r => r.user_id === x.user_id);
    const nombre = x.nombre || (x.user_id === NUBE.user.id ? 'Tú' : 'Entrenador ' + x.user_id.slice(0, 6));
    fila.innerHTML = `<strong>${esc(nombre)}</strong> <span class="badge ${x.rol === 'director' ? 'badge-amarillo' : 'badge-verde'}">${x.rol === 'director' ? 'Director' : 'Entrenador'}</span>`;
    if (x.rol === 'entrenador') {
      const chips = document.createElement('div'); chips.style.margin = '.4rem 0';
      if (!asignados.length) chips.innerHTML = '<small style="color:#b91c1c">Sin equipos asignados: no verá nada todavía</small>';
      asignados.forEach(r => {
        const eq = teams.find(t => t.id === r.equipo_id);
        const ch = document.createElement('span'); ch.className = 'chip-eq'; ch.textContent = (eq ? eq.nombre : 'Equipo') + ' ✕';
        ch.onclick = async () => { if (!(await uiConfirm('¿Quitar este equipo al entrenador?'))) return;
          const { error } = await NUBE.sb.from('equipo_entrenadores').delete().eq('equipo_id', r.equipo_id).eq('user_id', r.user_id);
          if (error) alert(traducirError(error.message)); renderEquipoTrabajo(); };
        chips.appendChild(ch);
      });
      fila.appendChild(chips);
      const s = document.createElement('select'); s.innerHTML = '<option value="">+ Asignar equipo…</option>';
      teams.filter(t => !asignados.some(r => r.equipo_id === t.id)).forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.nombre; s.appendChild(o); });
      s.onchange = async () => { if (!s.value) return;
        if (!(await asegurarSincronizado())) return alert('Primero hay que subir tus cambios (necesitas conexión).');
        const { error } = await NUBE.sb.from('equipo_entrenadores').insert({ equipo_id: s.value, user_id: x.user_id, academia_id: NUBE.academiaId });
        if (error) alert(traducirError(error.message)); renderEquipoTrabajo(); };
      fila.appendChild(s);
      const q = document.createElement('button'); q.className = 'btn-danger'; q.style.marginLeft = '.5rem'; q.textContent = 'Quitar de la academia';
      q.onclick = async () => { if (!(await uiConfirm('¿Quitar a este entrenador de la academia? Dejará de ver todos los equipos.', { peligro: true, aceptar: 'Quitar' }))) return;
        const { error } = await NUBE.sb.from('miembros').delete().eq('academia_id', NUBE.academiaId).eq('user_id', x.user_id);
        if (error) alert(traducirError(error.message)); renderEquipoTrabajo(); };
      fila.appendChild(q);
    }
    lista.appendChild(fila);
  });
}

// ---------------------------------------------------------------- baja / borrado / consentimiento
window.cloudAnonimizar = async function (jugadorId) {
  if (!(await uiConfirm('Se borrarán el nombre, teléfono y fecha de nacimiento de este jugador, y se quitará el acceso de sus padres. Las estadísticas del equipo se conservan de forma anónima. No se puede deshacer. ¿Continuar?', { peligro: true, aceptar: 'Borrar datos' }))) return;
  if (!(await asegurarSincronizado())) return alert('Primero hay que subir tus cambios (necesitas conexión).');
  const { error } = await NUBE.sb.rpc('anonimizar_jugador', { p_jugador: jugadorId });
  if (error) return alert(traducirError(error.message));
  NUBE.sucio = false; cacheBorrar(); await cargarStaff();
};

// ---------------------------------------------------------------- migración de datos de la versión local
function convertirEquipoLegacy(t) {
  const mapJ = new Map(), mapEj = new Map();
  const nuevo = { id: nuevoId(), nombre: t.nombre || 'Equipo', uniformes: [...(t.uniformes || [])],
    entrenador: t.entrenador || null, jugadores: [], entrenos: [], historial: [], ejercicios: [], evaluaciones: [] };
  (t.jugadores || []).forEach(j => {
    const id = nuevoId(); if (j.id != null) mapJ.set('i:' + j.id, id); if (!mapJ.has('n:' + j.nombre)) mapJ.set('n:' + j.nombre, id);
    nuevo.jugadores.push({ id, nombre: String(j.nombre || 'Jugador'), tel: String(j.tel || '').replace(/\D/g, ''), anio: j.anio || null,
      posicion: j.posicion || null, diaCumple: j.diaCumple || null, mesCumple: j.mesCumple || null, estado: j.estado === 'baja' ? 'baja' : 'activo',
      bajaFecha: j.bajaFecha || null, bajaMotivo: j.bajaMotivo || null, consentimiento: null });
  });
  const idJ = r => (r.jugadorId != null && mapJ.get('i:' + r.jugadorId)) || mapJ.get('n:' + r.nombre) || null;
  (t.entrenos || []).forEach(e => nuevo.entrenos.push({ id: nuevoId(), fecha: e.fecha, hora: e.hora, lugar: e.lugar || '', notas: e.notas || '', rec: !!e.rec }));
  (t.historial || []).forEach(p => nuevo.historial.push({ id: nuevoId(), fecha: p.fecha, rival: p.rival || '', favor: p.favor || 0, contra: p.contra || 0,
    minutosContra: p.minutosContra || [],
    stats: (p.stats || []).map(s => ({ ...s, id: nuevoId(), jugadorId: idJ(s) })).filter(s => s.jugadorId) }));
  (t.ejercicios || []).forEach(x => { const id = nuevoId(); mapEj.set(x.id, id); nuevo.ejercicios.push({ id, nombre: x.nombre, tipo: x.tipo, unidad: x.unidad, descripcion: x.descripcion || '' }); });
  (t.evaluaciones || []).forEach(v => { if (!mapEj.has(v.ejercicioId)) return;
    nuevo.evaluaciones.push({ id: nuevoId(), ejercicioId: mapEj.get(v.ejercicioId), fecha: v.fecha,
      resultados: (v.resultados || []).map(r => ({ id: nuevoId(), jugadorId: idJ(r), nombre: r.nombre, valor: Number(r.valor) })).filter(r => r.jugadorId) }); });
  return nuevo;
}
window.cloudImportarEquipos = function (lista) {
  if (NUBE.rol !== 'director') { alert('Solo el director puede importar equipos.'); return 0; }
  let n = 0;
  lista.forEach(t => {
    const c = convertirEquipoLegacy(t);
    if (teams.some(x => x.nombre === c.nombre)) c.nombre += ' (importado)';
    teams.push(c); n++;
  });
  if (n) { activeTeamId = teams[teams.length - 1].id; save(); renderTeamSelector(); renderAll(); renderEquipoTrabajo(); }
  return n;
};
function datosLocalesViejos() {
  try { const v = JSON.parse(localStorage.getItem('teams') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function ofrecerMigracion() {
  if (NUBE.rol !== 'director' || teams.length || localStorage.getItem('midt_migracion_rechazada') || localStorage.getItem('midt_migrado')) return;
  const viejos = datosLocalesViejos(); if (!viejos.length) return;
  setTimeout(async () => {
    if (await uiConfirm(`Encontré datos de la versión anterior de MiDT en este dispositivo (${viejos.length} equipo(s)).\n¿Subirlos a tu academia en la nube?`)) {
      const n = cloudImportarEquipos(viejos);
      if (n) { localStorage.setItem('midt_migrado', '1'); renderMigrar(); }
      if (n) alert(`✅ Se importaron ${n} equipo(s). Revisa la plantilla: falta registrar el consentimiento de los padres de cada jugador.`);
    } else localStorage.setItem('midt_migracion_rechazada', '1');
  }, 600);
}
function renderMigrar() {
  const c = $('cardMigrar'); if (!c) return;
  const viejos = localStorage.getItem('midt_migrado') ? [] : datosLocalesViejos();
  c.style.display = viejos.length ? 'block' : 'none';
  $('migrarTexto').textContent = `Hay ${viejos.length} equipo(s) de la versión anterior guardados solo en este dispositivo.`;
}
$('btnMigrarLocal').onclick = async () => {
  if (localStorage.getItem('midt_migrado') && !(await uiConfirm('Estos datos ya se subieron antes. ¿Subirlos otra vez? (quedarán equipos duplicados)'))) return;
  const n = cloudImportarEquipos(datosLocalesViejos());
  if (n) { localStorage.setItem('midt_migrado', '1'); alert(`✅ Se importaron ${n} equipo(s).`); renderMigrar(); }
};
$('btnBorrarLocalViejo').onclick = async () => {
  if (!(await uiConfirm('Se borrará del dispositivo la copia ANTERIOR (sin nube). Asegúrate de que los datos ya estén en la nube. ¿Borrar?', { peligro: true, aceptar: 'Borrar' }))) return;
  ['teams', 'activeTeamId', 'plantilla', 'entrenos', 'historial'].forEach(k => localStorage.removeItem(k)); renderMigrar();
};

// ---------------------------------------------------------------- vista para padres
async function cargarPadre() {
  const D = {};
  const tablas = ['equipos', 'jugadores', 'partidos', 'partido_stats', 'entrenos', 'ejercicios', 'evaluaciones', 'evaluacion_resultados'];
  const res = await Promise.all(tablas.map(t => traerTodo(t, false)).concat([traerOpcional('asistencias', false)]));
  tablas.forEach((t, i) => D[t] = res[i]);
  D.asistencias = res[tablas.length];
  const ac = await NUBE.sb.from('academias').select('id, nombre'); D.academias = ac.data || [];
  NUBE.datosPadre = D;
  setModo('padre'); renderPadre();
}
function renderPadre() {
  const D = NUBE.datosPadre, cont = $('contenidoPadre'); cont.innerHTML = '';
  $('padreCorreo').textContent = (NUBE.user && NUBE.user.email) || '';
  if (!D.jugadores.length) { cont.innerHTML = '<div class="card">Aún no hay información disponible.</div>'; return; }
  const hoy = fechaLocalISO();
  D.jugadores.forEach(h => {
    const eq = D.equipos.find(e => e.id === h.equipo_id), ac = D.academias.find(a => a.id === h.academia_id);
    const mis = D.partido_stats.filter(s => s.jugador_id === h.id);
    const jugados = mis.filter(s => s.jugo);
    const suma = k => jugados.reduce((a, s) => a + (s[k] || 0), 0);
    const partidos = D.partidos.filter(p => p.equipo_id === h.equipo_id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const entrenos = D.entrenos.filter(e => e.equipo_id === h.equipo_id && e.fecha >= hoy).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).slice(0, 3);
    const card = document.createElement('div'); card.className = 'card';
    let html = `<h2 style="margin-top:0">⚽ ${esc(h.nombre)}</h2>
      <p style="margin:.2rem 0;color:#64748b">${esc([h.posicion, eq && eq.nombre, ac && ac.nombre].filter(Boolean).join(' · '))}</p>
      <div class="padre-totales">
        <div><strong>${jugados.length}</strong><small>Partidos</small></div>
        <div><strong>${suma('goles')}</strong><small>Goles</small></div>
        <div><strong>${suma('asist')}</strong><small>Asistencias</small></div>
        <div><strong>${suma('minutos')}</strong><small>Minutos</small></div></div>`;
    const misAs = (D.asistencias || []).filter(a => a.jugador_id === h.id);
    if (misAs.length) {
      const pres = misAs.filter(a => a.asistio).length;
      html += `<p class="padre-fila">✅ <strong>Asistencia a entrenamientos:</strong> ${Math.round(pres * 100 / misAs.length)}% (${pres} de ${misAs.length})</p>`;
    }
    html += '<h3>Próximos entrenamientos</h3>';
    html += entrenos.length ? entrenos.map(e => `<p class="padre-fila">📅 <strong>${esc(e.fecha)}</strong> ${esc(String(e.hora).slice(0, 5))} · ${esc(e.lugar)}${e.notas ? ' — ' + esc(e.notas) : ''}</p>`).join('')
      : '<p class="hint">No hay entrenamientos programados.</p>';
    html += '<h3>Últimos partidos</h3>';
    html += partidos.slice(0, 5).map(p => {
      const s = mis.find(x => x.partido_id === p.id);
      const res = p.favor > p.contra ? '✅' : (p.favor < p.contra ? '❌' : '➖');
      const det = s && s.jugo ? `⚽ ${s.goles} · 🎯 ${s.asist} · ⏱️ ${s.minutos}'` : 'No jugó';
      return `<p class="padre-fila">${res} <strong>${esc(p.fecha)}</strong> vs ${esc(p.rival)} <strong>${p.favor}-${p.contra}</strong><br><small>${det}</small></p>`;
    }).join('') || '<p class="hint">Todavía no hay partidos registrados.</p>';
    html += '<h3>Evaluaciones físicas / técnicas</h3>';
    const evs = D.evaluacion_resultados.filter(r => r.jugador_id === h.id).map(r => {
      const v = D.evaluaciones.find(x => x.id === r.evaluacion_id); const ej = v && D.ejercicios.find(x => x.id === v.ejercicio_id);
      return v && ej ? { fecha: v.fecha, ej, valor: Number(r.valor) } : null; }).filter(Boolean);
    const porEj = new Map(); evs.forEach(x => { if (!porEj.has(x.ej.id)) porEj.set(x.ej.id, []); porEj.get(x.ej.id).push(x); });
    html += porEj.size ? [...porEj.values()].map(arr => {
      arr.sort((a, b) => a.fecha.localeCompare(b.fecha)); const ej = arr[0].ej;
      const mejor = ej.tipo === 'tiempo' ? arr[arr.length - 1].valor < arr[0].valor : arr[arr.length - 1].valor > arr[0].valor;
      const flecha = arr.length < 2 ? '' : (arr[arr.length - 1].valor === arr[0].valor ? ' ➡️' : (mejor ? ' 📈 mejoró' : ' 📉'));
      return `<p class="padre-fila"><strong>${esc(ej.nombre)}</strong>${flecha}<br><small>${arr.map(x => `${esc(x.fecha.slice(5))}: ${x.valor} ${esc(ej.unidad)}`).join(' → ')}</small></p>`;
    }).join('') : '<p class="hint">Aún no hay evaluaciones.</p>';
    html += `<div class="acciones" style="margin-top:1rem">
      <button class="btn-primary" data-act="ficha" data-id="${esc(h.id)}">📄 Descargar ficha completa</button>
      <button class="btn-mini" data-act="tel" data-id="${esc(h.id)}">📱 Actualizar mi teléfono</button></div>`;
    card.innerHTML = html; cont.appendChild(card);
  });
}
$('contenidoPadre').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.act === 'ficha') {
    const { data, error } = await NUBE.sb.rpc('exportar_ficha', { p_jugador: id });
    if (error) return alert(traducirError(error.message));
    descargarJSON(`Ficha_${(data.jugador.nombre || 'jugador').replace(/\s+/g, '_')}_${fechaLocalISO()}.json`, data);
  } else if (b.dataset.act === 'tel') {
    const tel = await uiPrompt('Tu número de WhatsApp (con lada):', ''); if (tel === null) return;
    const { error } = await NUBE.sb.rpc('actualizar_contacto_tutor', { p_jugador: id, p_tel: tel });
    alert(error ? traducirError(error.message) : '✅ Teléfono actualizado');
  }
});

// ---------------------------------------------------------------- arrancar
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
window.cloudSincronizar = sincronizar;
window.cloudAsegurarSincronizado = asegurarSincronizado;
window.cloudMostrarDialogo = dialogo;
})();
