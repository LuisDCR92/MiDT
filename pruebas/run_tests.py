import json, sys, os
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__))
APP='file://'+os.path.abspath(os.path.join(HERE,'..','app','index.html'))
MOCK=open(os.path.join(HERE,'mock_supabase.js')).read()
STUB="window.Chart=function(){this.destroy=function(){};this.update=function(){}};window.jspdf={jsPDF:function(){}};"
errors=[]; res=[]
def ok(n,c,extra=''):
    res.append((n,bool(c))); print(('PASS' if c else 'FAIL'),n,extra)
def nuevo(b, state=None):
    ctx=b.new_context(storage_state=state) if state else b.new_context()
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errors.append(str(e)))
    pg.on('console',lambda m: errors.append('console:'+m.text) if m.type=='error' and 'Service Worker' not in m.text else None)
    def dlg(d):          # los cuadros nativos ya no se deben usar: si aparece uno, la prueba lo registra
        errors.append('NATIVO:'+d.type+':'+d.message); d.accept('Sub-10') if d.type=='prompt' else d.accept()
    pg.on('dialog',dlg)
    def ruta(r):
        u=r.request.url
        if 'supabase-js' in u: r.fulfill(body=MOCK,content_type='application/javascript')
        elif u.startswith('http'): r.fulfill(body=STUB,content_type='application/javascript')
        else: r.continue_()
    pg.route('**/*',ruta)
    pg.add_init_script("window.__ans=null;setInterval(()=>{const d=document.querySelector('dialog.dlg-ui[open]');if(!d||window.__manual)return;const i=d.querySelector('input');if(i)i.value=(window.__ans!=null?window.__ans:'Sub-10');const b=d.querySelector('[data-ok]');if(b)b.click();},40);")
    pg.add_init_script("window.open=(u)=>{(window.__op=window.__op||[]).push(u);return null}")
    return ctx,pg
with sync_playwright() as p:
    b=p.chromium.launch()
    # ---- 1) director: registro, academia, jugador con consentimiento
    ctx,pg=nuevo(b); pg.goto(APP); pg.wait_for_timeout(600)
    ok('pantalla de acceso al inicio', pg.evaluate("document.body.dataset.modo")=='auth')
    ok('app oculta sin sesión', not pg.is_visible('#appStaff'))
    pg.fill('#authEmail','dir@test.mx'); pg.fill('#authPass','secreto123')
    pg.click('#linkAuthModo'); pg.click('#btnAuth'); pg.wait_for_timeout(600)
    ok('pasa a elegir academia', pg.evaluate("document.body.dataset.modo")=='onb', pg.inner_text('#authMsg') if pg.evaluate("document.body.dataset.modo")=='auth' else '')
    pg.evaluate("(()=>{__mock.S.t.codigos_alta=[{codigo:'ALTA1'}];localStorage.setItem('__mockdb',JSON.stringify(__mock.S))})()"); pg.fill('#onbCodigoAlta','alta1'); pg.fill('#onbNombreAcademia','Academia Águilas'); pg.click('#formCrearAcademia button'); pg.wait_for_timeout(800)
    ok('entra como director', pg.evaluate("document.body.dataset.modo+'/'+document.body.dataset.rol")=='staff/director', pg.evaluate("document.body.dataset.modo"))
    pg.click('#btnNuevoEquipo'); pg.wait_for_timeout(300)
    ok('equipo creado', pg.evaluate("teams.length")==1)
    pg.evaluate("document.querySelector('[data-tab=plantilla]').click()")
    pg.fill('#nombreJugador','Beto'); pg.fill('#telJugador','5216181234567'); pg.fill('#anioJugador','2015')
    pg.evaluate("document.getElementById('formJugador').requestSubmit()")
    ok('sin consentimiento no se registra', pg.evaluate("getTeam().jugadores.length")==0)
    pg.fill('#tutorJugador','Mamá de Beto'); pg.check('#consentJugador')
    pg.evaluate("document.getElementById('formJugador').requestSubmit()"); pg.wait_for_timeout(300)
    j=pg.evaluate("getTeam().jugadores[0]")
    ok('jugador con consentimiento y uuid', j and j['consentimiento']['tutor']=='Mamá de Beto' and len(j['id'])==36)
    pg.wait_for_timeout(1800)
    ok('sincronizó con la nube', pg.evaluate("__mock.S.t.jugadores&&__mock.S.t.jugadores.length")==1 and 'Sincronizado' in pg.inner_text('#estadoSync') or pg.evaluate("__mock.S.t.jugadores.length")==1, pg.inner_text('#estadoSync'))
    ok('consentimiento en la nube', pg.evaluate("(__mock.S.t.consentimientos||[]).length")==1)
    # partido con stats, baja, edición conserva stats
    pg.evaluate("""(()=>{const t=getTeam();const j=t.jugadores[0];
      t.historial.push({id:nuevoId(),fecha:'2026-10-20',rival:'R',favor:2,contra:0,minutosContra:[],stats:[{id:nuevoId(),jugadorId:j.id,nombre:j.nombre,jugo:true,goles:2,minutosGoles:[1,2],asist:0,minutos:60,duelos:0,amarilla:0,roja:0}]});save()})()""")
    pg.wait_for_timeout(1500)
    ok('partido y stats en la nube', pg.evaluate("(__mock.S.t.partidos||[]).length")==1 and pg.evaluate("(__mock.S.t.partido_stats||[]).length")==1)
    pg.click('#listaPlantilla button[title^="Dar de baja"]'); pg.wait_for_timeout(1500)
    ok('baja: sale de la plantilla activa', pg.evaluate("getTeam().jugadores[0].estado")=='baja' and pg.is_visible('#bajasWrap'))
    ok('baja: conserva sus stats', pg.evaluate("calcularStats(getTeam(), getTeam().historial).stats.some(s=>s.goles==2)"))
    ok('baja en la nube', pg.evaluate("__mock.S.t.jugadores[0].estado")=='baja')
    pg.click('#bajasWrap button:has-text("Reactivar")'); pg.wait_for_timeout(1200)
    ok('reactivar', pg.evaluate("getTeam().jugadores[0].estado")=='activo')
    # invitación de padre
    pg.click('#listaPlantilla button[title^="Invitar"]'); pg.wait_for_timeout(1500)
    code=pg.evaluate("(__mock.S.t.invitaciones||[]).slice(-1)[0]&&__mock.S.t.invitaciones.slice(-1)[0].codigo")
    ok('código de invitación para padre', bool(code), str(code))
    pg.keyboard.press('Escape')
    # modo sin conexión: cambios se guardan en el dispositivo y suben al volver
    pg.evaluate("__mock.offline=true")
    pg.evaluate("(()=>{getTeam().jugadores[0].posicion='🧤 Portero';save()})()"); pg.wait_for_timeout(1800)
    ok('offline: no se pierde el cambio local', 'Portero' in (pg.evaluate("localStorage.getItem('midt_cache_v2')")or''))
    pg.evaluate("__mock.offline=false"); pg.evaluate("cloudSincronizar()"); pg.wait_for_timeout(1500)
    ok('al volver la red sube el cambio', pg.evaluate("__mock.S.t.jugadores[0].posicion")=='🧤 Portero')
    # recarga: datos vuelven desde la nube
    pg.reload(); pg.wait_for_timeout(1200)
    ok('tras recargar sigue sesión y datos', pg.evaluate("document.body.dataset.modo")=='staff' and pg.evaluate("getTeam().jugadores.length")==1)
    state=ctx.storage_state()
    # ---- 2) padre con el código
    ctx2,pg2=nuevo(b); pg2.add_init_script("localStorage.getItem('__mockdb')||localStorage.setItem('__mockdb',%s)"%json.dumps(json.dumps({**pg.evaluate("__mock.S"),"session":None})))
    pg2.goto(APP); pg2.wait_for_timeout(500)
    pg2.fill('#authEmail','mama@test.mx'); pg2.fill('#authPass','secreto123'); pg2.click('#linkAuthModo'); pg2.click('#btnAuth'); pg2.wait_for_timeout(600)
    pg2.fill('#onbCodigo',code); pg2.click('#formCodigo button'); pg2.wait_for_timeout(1000)
    ok('padre entra a su vista', pg2.evaluate("document.body.dataset.modo")=='padre', pg2.evaluate("document.body.dataset.modo"))
    ok('padre no ve el panel del entrenador', not pg2.is_visible('#appStaff'))
    txt=pg2.inner_text('#contenidoPadre'); ok('padre ve a su hijo y sus goles', 'Beto' in txt and '2' in txt)
    # ---- 3) entrenador invitado: no puede crear equipos
    pg.evaluate("document.querySelector('[data-tab=ajustes]').click()")
    ok('director ve sección de entrenadores', pg.is_visible('#cardEquipoTrabajo'))
    pg.click('#btnInvitarEntrenador'); pg.wait_for_timeout(1500)
    cc=pg.evaluate("__mock.S.t.invitaciones.slice(-1)[0].codigo"); pg.keyboard.press('Escape')
    ctx3,pg3=nuevo(b); pg3.add_init_script("localStorage.getItem('__mockdb')||localStorage.setItem('__mockdb',%s)"%json.dumps(json.dumps({**pg.evaluate("__mock.S"),"session":None})))
    pg3.goto(APP); pg3.wait_for_timeout(500)
    pg3.fill('#authEmail','coach@test.mx'); pg3.fill('#authPass','secreto123'); pg3.click('#linkAuthModo'); pg3.click('#btnAuth'); pg3.wait_for_timeout(600)
    pg3.fill('#onbCodigo',cc); pg3.click('#formCodigo button'); pg3.wait_for_timeout(1200)
    ok('entrenador entra', pg3.evaluate("document.body.dataset.modo+'/'+document.body.dataset.rol")=='staff/entrenador', pg3.evaluate("document.body.dataset.modo"))
    ok('entrenador no ve crear/eliminar equipo', not pg3.is_visible('#btnNuevoEquipo') and not pg3.is_visible('#btnEliminarEquipo'))
    ok('entrenador ve su equipo', pg3.evaluate("teams.length")==1)
    # ---- 4) cerrar sesión limpia el caché
    pg.evaluate("document.querySelector('[data-tab=ajustes]').click()"); pg.click('#btnCerrarSesion'); pg.wait_for_timeout(800)
    ok('cerrar sesión borra copia local y vuelve al acceso', pg.evaluate("localStorage.getItem('midt_cache_v2')")is None and pg.evaluate("document.body.dataset.modo")=='auth')
    b.close()
print('ERRORES JS:',errors)
print('RESUMEN: %d/%d'%(sum(1 for _,c in res if c),len(res)))
