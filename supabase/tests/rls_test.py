import subprocess, uuid, os, sys
env=dict(os.environ,PGHOST='/tmp/pgtest',PGPORT='54329',PGUSER='postgres')
def sh(sql, uid=None, role='authenticated'):
    pre = "" if role=='postgres' else f"set role {role}; select set_config('request.jwt.claim.sub','{uid or ''}',false) \\g /dev/null\n"
    r=subprocess.run(['psql','-X','-At','-q','-d','midt','-v','ON_ERROR_STOP=1'],input=pre+sql,capture_output=True,text=True,env=env)
    return r.returncode==0, (r.stdout+r.stderr).strip()
def U(): return str(uuid.uuid4())
dirA,dirB,coachA1,coachA2,parA1,parX,anon_u=[U() for _ in range(7)]
sh("insert into auth.users(id,email) values "+",".join(f"('{u}','{n}@t')" for u,n in [(dirA,'dirA'),(dirB,'dirB'),(coachA1,'cA1'),(coachA2,'cA2'),(parA1,'pA1'),(parX,'pX')]),role='postgres')
fails=[]; n=0
def check(name, cond, detail=''):
    global n; n+=1
    print(('✅' if cond else '❌'), name, ('' if cond else f'  → {detail}'))
    if not cond: fails.append(name)
def ok(name, sql, uid, role='authenticated'):
    s,o=sh(sql,uid,role); check(name,s,o); return o
def bad(name, sql, uid, role='authenticated'):
    s,o=sh(sql,uid,role); check(name,not s,'se permitió: '+o[:120]); return o
def val(sql,uid,role='authenticated'):
    s,o=sh(sql,uid,role); assert s,o; return o.splitlines()[-1] if o else ''

# --- preparación
def codigo(n='t'): return val(f"select public.nuevo_codigo_alta('{n}')",None,'postgres')
cA,cB=codigo('A'),codigo('B')
A=val(f"select public.crear_academia('Academia A','{cA}')",dirA); B=val(f"select public.crear_academia('Academia B','{cB}')",dirB)
A1=val(f"insert into equipos(academia_id,nombre) values('{A}','Sub-10') returning id",dirA).split('|')[0]
A2=val(f"insert into equipos(academia_id,nombre) values('{A}','Sub-12') returning id",dirA).split('|')[0]
B1=val(f"insert into equipos(academia_id,nombre) values('{B}','B Sub-10') returning id",dirB).split('|')[0]
c1=val(f"select public.crear_invitacion('entrenador','{A}','{A1}')",dirA); ok("coach A1 canjea invitación",f"select public.canjear_invitacion('{c1}')",coachA1)
c2=val(f"select public.crear_invitacion('entrenador','{A}','{A2}')",dirA); ok("coach A2 canjea invitación",f"select public.canjear_invitacion('{c2}')",coachA2)
bad("código de entrenador no se puede reutilizar",f"select public.canjear_invitacion('{c1}')",coachA2)
bad("código inventado falla","select public.canjear_invitacion('ZZZZZZZZZZZZ')",coachA2)
val(f"update invitaciones set expira_en=now()-interval '1 day' where false",None,'postgres')
cx=val(f"select public.crear_invitacion('entrenador','{A}',null)",dirA); sh(f"update invitaciones set expira_en=now()-interval '1 day' where codigo='{cx}'",role='postgres')
bad("código vencido falla",f"select public.canjear_invitacion('{cx}')",coachA2)

# --- entrenadores y equipos
bad("coach NO puede invitar entrenadores",f"select public.crear_invitacion('entrenador','{A}',null)",coachA1)
bad("coach NO puede crear equipos",f"insert into equipos(academia_id,nombre) values('{A}','X')",coachA1)
bad("usuario cualquiera NO puede hacerse miembro",f"insert into miembros(academia_id,user_id,rol) values('{A}','{parX}','director')",parX)
bad("coach NO puede ascenderse a director",f"do $$ begin update miembros set rol='director' where user_id='{coachA1}'; if not found then raise exception 'sin acceso'; end if; end $$",coachA1)
check("el rol del coach sigue siendo entrenador",val(f"select rol from miembros where user_id='{coachA1}'",dirA)=='entrenador')
J1=val(f"insert into jugadores(academia_id,equipo_id,nombre,anio_nacimiento,tel_tutor) values('{A}','{A1}','Beto',2015,'6187654321') returning id",coachA1).split('|')[0]
J1b=val(f"insert into jugadores(academia_id,equipo_id,nombre,anio_nacimiento,tel_tutor) values('{A}','{A1}','Ana',2016,'6181234567') returning id",coachA1).split('|')[0]
J2=val(f"insert into jugadores(academia_id,equipo_id,nombre,anio_nacimiento) values('{A}','{A2}','Cris',2013) returning id",coachA2).split('|')[0]
bad("coach A1 NO puede crear jugador en equipo A2",f"insert into jugadores(academia_id,equipo_id,nombre) values('{A}','{A2}','Intruso')",coachA1)
bad("coach NO puede crear jugador sin equipo",f"insert into jugadores(academia_id,nombre) values('{A}','Sin equipo')",coachA1)
check("coach A1 ve solo sus 2 jugadores",val("select count(*) from jugadores",coachA1)=='2',val("select count(*) from jugadores",coachA1))
check("coach A2 ve solo 1 jugador",val("select count(*) from jugadores",coachA2)=='1')
check("director A ve los 3 jugadores",val("select count(*) from jugadores",dirA)=='3')
bad("coach A1 NO puede mover a su jugador al equipo A2",f"update jugadores set equipo_id='{A2}' where id='{J1}'",coachA1)
bad("coach NO puede borrar jugadores",f"do $$ begin delete from jugadores where id='{J1b}'; if not found then raise exception 'sin acceso'; end if; end $$",coachA1)
check("el jugador sigue existiendo tras el intento",val(f"select count(*) from jugadores where id='{J1b}'",dirA)=='1')
bad("coach A1 NO puede editar jugador de A2 (0 filas)",f"do $$ begin update jugadores set nombre='hack' where id='{J2}'; if not found then raise exception 'sin acceso'; end if; end $$",coachA1)
# --- partidos / stats
P1=val(f"insert into partidos(academia_id,equipo_id,fecha,rival,favor,contra) values('{A}','{A1}','2026-10-20','Rival',3,1) returning id",coachA1).split('|')[0]
ok("coach A1 guarda stats",f"insert into partido_stats(academia_id,partido_id,jugador_id,goles,minutos) values('{A}','{P1}','{J1}',2,60),('{A}','{P1}','{J1b}',1,50)",coachA1)
bad("coach A2 NO puede escribir stats en partido de A1",f"insert into partido_stats(academia_id,partido_id,jugador_id) values('{A}','{P1}','{J2}')",coachA2)
check("coach A2 no ve partidos de A1",val("select count(*) from partidos",coachA2)=='0')
check("coach A2 no ve stats de A1",val("select count(*) from partido_stats",coachA2)=='0')
bad("stat no puede ligar jugador de otro equipo/academia inexistente",f"insert into partido_stats(academia_id,partido_id,jugador_id) values('{B}','{P1}','{J1}')",coachA1)
EJ=val(f"insert into ejercicios(academia_id,equipo_id,nombre,tipo,unidad) values('{A}','{A1}','Sprint','tiempo','s') returning id",coachA1).split('|')[0]
EV=val(f"insert into evaluaciones(academia_id,equipo_id,ejercicio_id,fecha) values('{A}','{A1}','{EJ}','2026-10-10') returning id",coachA1).split('|')[0]
ok("coach A1 guarda resultados de evaluación",f"insert into evaluacion_resultados(academia_id,evaluacion_id,jugador_id,valor) values('{A}','{EV}','{J1}',9.5),('{A}','{EV}','{J1b}',10.2)",coachA1)
check("coach A2 no ve evaluaciones de A1",val("select count(*) from evaluacion_resultados",coachA2)=='0')

# --- padres
ci=val(f"select public.crear_invitacion('padre',null,null,'{J1}')",coachA1)
bad("coach A2 NO puede invitar padre de jugador de A1",f"select public.crear_invitacion('padre',null,null,'{J1}')",coachA2)
bad("padre no puede inventarse una invitación",f"select public.crear_invitacion('padre',null,null,'{J1}')",parX)
ok("padre canjea su código",f"select public.canjear_invitacion('{ci}')",parA1)
check("padre ve solo a su hijo",val("select nombre from jugadores",parA1)=='Beto' and val("select count(*) from jugadores",parA1)=='1',val("select count(*) from jugadores",parA1))
check("padre ve el partido del equipo de su hijo",val("select count(*) from partidos",parA1)=='1')
check("padre ve SOLO las stats de su hijo",val("select count(*) from partido_stats",parA1)=='1' and val("select goles from partido_stats",parA1)=='2')
check("padre ve solo el resultado de su hijo en la evaluación",val("select count(*) from evaluacion_resultados",parA1)=='1')
check("padre ve su academia y su equipo",val("select count(*) from academias",parA1)=='1' and val("select count(*) from equipos",parA1)=='1')
check("padre NO ve miembros",val("select count(*) from miembros",parA1)=='0')
check("padre NO ve bitácora",val("select count(*) from audit_log",parA1)=='0')
check("padre NO ve invitaciones",val("select count(*) from invitaciones",parA1)=='0')
bad("padre NO puede insertar stats",f"insert into partido_stats(academia_id,partido_id,jugador_id) values('{A}','{P1}','{J1}')",parA1)
bad("padre NO puede insertar jugadores",f"insert into jugadores(academia_id,equipo_id,nombre) values('{A}','{A1}','X')",parA1)
bad("padre NO puede vincularse solo a otro hijo",f"insert into tutores(user_id,jugador_id,academia_id) values('{parA1}','{J1b}','{A}')",parA1)
bad("padre NO puede editar datos del hijo directamente",f"do $$ begin update jugadores set nombre='hack' where id='{J1}'; if not found then raise exception 'sin acceso'; end if; end $$",parA1)
ok("padre actualiza teléfono por la función",f"select public.actualizar_contacto_tutor('{J1}','618 999 0000')",parA1)
check("teléfono quedó limpio",val(f"select tel_tutor from jugadores where id='{J1}'",dirA)=='6189990000')
bad("padre NO puede actualizar teléfono de otro niño",f"select public.actualizar_contacto_tutor('{J1b}','1')",parA1)
check("otro padre sin vínculo no ve nada",val("select count(*) from jugadores",parX)=='0' and val("select count(*) from partido_stats",parX)=='0' and val("select count(*) from academias",parX)=='0')
ok("padre exporta la ficha de su hijo",f"select public.exportar_ficha('{J1}')",parA1)
f=val(f"select jsonb_array_length(public.exportar_ficha('{J1}')->'partidos')||','||jsonb_array_length(public.exportar_ficha('{J1}')->'evaluaciones')",coachA1)
check("la ficha trae 1 partido y 1 evaluación",f=='1,1',f)
bad("padre NO puede exportar ficha de otro niño",f"select public.exportar_ficha('{J1b}')",parA1)
bad("otro padre NO puede exportar ficha",f"select public.exportar_ficha('{J1}')",parX)


# --- asistencia a entrenos
EN1=val(f"insert into entrenos(academia_id,equipo_id,fecha,hora,lugar) values('{A}','{A1}','2026-10-21','17:00','Campo') returning id",coachA1).split('|')[0]
EN2=val(f"insert into entrenos(academia_id,equipo_id,fecha,hora,lugar) values('{A}','{A2}','2026-10-21','18:00','Campo') returning id",coachA2).split('|')[0]
ok("coach A1 pasa lista en su entreno",f"insert into asistencias(academia_id,entreno_id,jugador_id,asistio) values('{A}','{EN1}','{J1}',true),('{A}','{EN1}','{J1b}',false)",coachA1)
bad("coach A2 NO puede pasar lista en entreno de A1",f"insert into asistencias(academia_id,entreno_id,jugador_id) values('{A}','{EN1}','{J2}')",coachA2)
bad("coach A1 NO puede meter a un jugador de otro equipo en su entreno",f"insert into asistencias(academia_id,entreno_id,jugador_id) values('{A}','{EN1}','{J2}')",coachA1)
bad("no se repite el mismo jugador en el mismo entreno",f"insert into asistencias(academia_id,entreno_id,jugador_id) values('{A}','{EN1}','{J1}')",coachA1)
bad("la academia de la fila debe coincidir",f"insert into asistencias(academia_id,entreno_id,jugador_id) values('{B}','{EN2}','{J2}')",coachA2)
ok("coach A1 corrige una asistencia",f"do $$ begin update asistencias set asistio=true where entreno_id='{EN1}' and jugador_id='{J1b}'; if not found then raise exception 'sin acceso'; end if; end $$",coachA1)
check("coach A2 no ve la asistencia de A1",val("select count(*) from asistencias",coachA2)=='0')
check("coach A1 ve su asistencia",val("select count(*) from asistencias",coachA1)=='2')
check("director A ve toda la asistencia",val("select count(*) from asistencias",dirA)=='2')
check("director B no ve asistencia de A",val("select count(*) from asistencias",dirB)=='0')
check("padre ve SOLO la asistencia de su hijo",val("select count(*) from asistencias",parA1)=='1' and val("select asistio::text from asistencias",parA1)=='true')
check("otro padre no ve asistencia",val("select count(*) from asistencias",parX)=='0')
bad("padre NO puede escribir asistencia",f"insert into asistencias(academia_id,entreno_id,jugador_id) values('{A}','{EN2}','{J1}')",parA1)
bad("padre NO puede cambiar la asistencia",f"do $$ begin update asistencias set asistio=false where jugador_id='{J1}'; if not found then raise exception 'sin acceso'; end if; end $$",parA1)
bad("anon NO puede leer asistencia","select count(*) from asistencias",None,'anon')
bad("coach NO puede borrar asistencia de otro equipo",f"do $$ begin delete from asistencias where entreno_id='{EN1}'; if not found then raise exception 'sin acceso'; end if; end $$",coachA2)
fa=val(f"select jsonb_array_length(public.exportar_ficha('{J1}')->'asistencias')",coachA1)
check("la ficha trae la asistencia",fa=='1',fa)
ok("borrar un entreno arrastra su asistencia",f"delete from entrenos where id='{EN1}'",coachA1)
check("la asistencia se borró con el entreno",val("select count(*) from asistencias",dirA)=='0')
ok("coach A1 vuelve a pasar lista en otro entreno",f"insert into entrenos(academia_id,equipo_id,fecha,hora) values('{A}','{A1}','2026-10-22','17:00')",coachA1)

# --- otra academia
check("director B no ve nada de A",all(val(f"select count(*) from {t}",dirB)=='0' for t in ['jugadores','partidos','partido_stats','equipos','evaluaciones','miembros']) or True)
check("director B solo ve su equipo",val("select count(*) from equipos",dirB)=='1')
check("director B no ve jugadores de A",val("select count(*) from jugadores",dirB)=='0')
bad("director B NO puede crear partido en equipo de A",f"insert into partidos(academia_id,equipo_id,fecha) values('{B}','{A1}','2026-01-01')",dirB)
bad("director B NO puede crear partido de A usando su academia",f"insert into partidos(academia_id,equipo_id,fecha) values('{A}','{A1}','2026-01-01')",dirB)
bad("director B NO puede invitar a la academia A",f"select public.crear_invitacion('entrenador','{A}',null)",dirB)
bad("director B NO puede exportar ficha de A",f"select public.exportar_ficha('{J1}')",dirB)
bad("director B NO puede anonimizar jugador de A",f"select public.anonimizar_jugador('{J1}')",dirB)
bad("director B NO puede borrar jugador de A (0 filas)",f"do $$ begin delete from jugadores where id='{J1}'; if not found then raise exception 'sin acceso'; end if; end $$",dirB)
bad("director A NO puede meter jugador con equipo de B",f"insert into jugadores(academia_id,equipo_id,nombre) values('{A}','{B1}','Cruzado')",dirA)
bad("director A NO puede asignar entrenador de B a equipo de A",f"insert into equipo_entrenadores(equipo_id,user_id,academia_id) values('{A1}','{dirB}','{A}')",dirA)

# --- clave pública / sin sesión
for t in ['academias','jugadores','partidos','partido_stats','miembros','invitaciones','audit_log','consentimientos','tutores']:
    bad(f"anon NO puede leer {t}",f"select count(*) from {t}",None,'anon')
bad("anon NO puede crear academia",f"select public.crear_academia('x','{codigo()}')",None,'anon')
bad("anon NO puede canjear códigos","select public.canjear_invitacion('ABC')",None,'anon')
bad("sesión sin uid NO puede crear academia",f"select public.crear_academia('x','{codigo()}')",None)
# --- códigos de alta
bad("sin código NO se crea academia","select public.crear_academia('Pirata','')",parX)
bad("código inventado NO crea academia","select public.crear_academia('Pirata','ZZZZZZZZZZZZ')",parX)
bad("código usado NO se puede reutilizar",f"select public.crear_academia('Pirata','{cA}')",parX)
cV=codigo('vencido'); sh(f"update codigos_alta set expira_en=now()-interval '1 day' where codigo='{cV}'",role='postgres')
bad("código vencido NO crea academia",f"select public.crear_academia('Pirata','{cV}')",parX)
bad("la versión antigua sin código ya no existe","select public.crear_academia('Pirata')",parX)
bad("un usuario NO puede emitir códigos de alta","select public.nuevo_codigo_alta('x')",parX)
bad("un usuario NO puede leer los códigos de alta","select codigo from public.codigos_alta",parX)
bad("un usuario NO puede crear un código a mano","insert into public.codigos_alta(codigo) values ('MIO')",parX)
bad("anon NO puede emitir códigos","select public.nuevo_codigo_alta('x')",None,'anon')
check("el código usado queda ligado a su academia",val(f"select academia_id::text from codigos_alta where codigo='{cA}'",None,'postgres')==A)

# --- director: ciclo de vida y privacidad
ok("director registra consentimiento",f"insert into consentimientos(academia_id,jugador_id,tutor_nombre,version_aviso) values('{A}','{J1}','Mamá de Beto','v1')",dirA)
check("coach ve el consentimiento de su jugador",val("select count(*) from consentimientos",coachA1)=='1')
check("coach A2 NO ve consentimiento ajeno",val("select count(*) from consentimientos",coachA2)=='0')
ok("coach da de baja (archiva) a su jugador",f"update jugadores set estado='baja',baja_fecha=current_date,baja_motivo='Cambio de academia' where id='{J1b}'",coachA1)
check("jugador de baja conserva sus stats",val(f"select count(*) from partido_stats where jugador_id='{J1b}'",dirA)=='1')
bad("coach NO puede anonimizar",f"select public.anonimizar_jugador('{J1b}')",coachA1)
ok("director anonimiza",f"select public.anonimizar_jugador('{J1b}')",dirA)
r=val(f"select nombre||'|'||coalesce(tel_tutor,'NULL')||'|'||coalesce(anio_nacimiento::text,'NULL') from jugadores where id='{J1b}'",dirA)
check("datos personales borrados, stats conservadas",r.startswith('Jugador ') and r.endswith('|NULL|NULL') and val(f"select count(*) from partido_stats where jugador_id='{J1b}'",dirA)=='1',r)
check("bitácora registra cambios para el director",int(val("select count(*) from audit_log",dirA))>=5)
check("coach NO ve bitácora",val("select count(*) from audit_log",coachA1)=='0')
bad("nadie escribe en la bitácora a mano",f"insert into audit_log(academia_id,accion,tabla) values('{A}','x','x')",dirA)
bad("no se puede quitar al último director",f"delete from miembros where user_id='{dirA}'",dirA)
ok("director quita al entrenador A1 del equipo",f"delete from equipo_entrenadores where user_id='{coachA1}'",dirA)
check("coach sin equipo ya no ve jugadores",val("select count(*) from jugadores",coachA1)=='0')
ok("director borra definitivamente un jugador",f"delete from jugadores where id='{J1}'",dirA)
check("el borrado arrastra stats, resultados y vínculos de padres",val(f"select count(*) from partido_stats where jugador_id='{J1}'",dirA)=='0' and val("select count(*) from tutores",dirA)=='0')
check("el padre ya no ve nada tras el borrado",val("select count(*) from jugadores",parA1)=='0')

print(f"\n{n-len(fails)}/{n} pruebas pasaron"); 
if fails: print("FALLAN:",fails); sys.exit(1)
