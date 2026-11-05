import json
from playwright.sync_api import sync_playwright
import os
HERE=os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE,'run_tests.py')).read().split('with sync_playwright()')[0])
OLD={"id":1,"nombre":"Sub-10","uniformes":[],"entrenador":{"nombre":"Luis","tel":"6181111111"},
 "jugadores":[{"nombre":"Ana","tel":"6181234567","anio":2016},{"nombre":"Beto","tel":"6187654321","anio":2015}],
 "entrenos":[{"id":5,"fecha":"2026-11-02","hora":"17:00","lugar":"Campo","notas":"","rec":False}],
 "historial":[{"id":9,"fecha":"2026-10-20","rival":"Rival A","favor":3,"contra":1,"minutosContra":[],
   "stats":[{"nombre":"Beto","jugo":True,"goles":2,"minutosGoles":[10,20],"asist":1,"minutos":60,"duelos":3,"amarilla":0,"roja":0}]}],
 "ejercicios":[{"id":7,"nombre":"Sprint","tipo":"tiempo","unidad":"s","descripcion":""}],
 "evaluaciones":[{"id":8,"ejercicioId":7,"fecha":"2026-10-10","resultados":[{"nombre":"Beto","valor":9.5}]}]}
with sync_playwright() as p:
    b=p.chromium.launch(); ctx,pg=nuevo(b)
    pg.add_init_script("localStorage.getItem('seeded')||(localStorage.setItem('teams',%s),localStorage.setItem('seeded','1'))"%json.dumps(json.dumps([OLD])))
    pg.goto(APP); pg.wait_for_timeout(500)
    pg.fill('#authEmail','dir@test.mx'); pg.fill('#authPass','secreto123'); pg.click('#linkAuthModo'); pg.click('#btnAuth'); pg.wait_for_timeout(500)
    pg.evaluate("(()=>{__mock.S.t.codigos_alta=[{codigo:'ALTA1'}];localStorage.setItem('__mockdb',JSON.stringify(__mock.S))})()"); pg.fill('#onbCodigoAlta','alta1'); pg.fill('#onbNombreAcademia','Águilas'); pg.click('#formCrearAcademia button'); pg.wait_for_timeout(900)
    pg.evaluate("document.querySelector('[data-tab=ajustes]').click()")
    pg.wait_for_timeout(2500)
    ok('migración automática y sin tarjeta repetida', not pg.is_visible('#cardMigrar'))
    t=pg.evaluate("teams"); print('DBG',len(t),[x['nombre'] for x in t],[len(x['jugadores']) for x in t],{k:len(v) for k,v in pg.evaluate('__mock.S.t').items()})
    ok('equipo migrado', len(t)==1 and t[0]['nombre']=='Sub-10' and len(t[0]['jugadores'])==2)
    ok('ids ahora uuid', all(len(j['id'])==36 for j in t[0]['jugadores']) and len(t[0]['historial'][0]['id'])==36)
    st=t[0]['historial'][0]['stats'][0]; beto=[j for j in t[0]['jugadores'] if j['nombre']=='Beto'][0]
    ok('stats ligadas al jugador correcto', st['jugadorId']==beto['id'] and st['goles']==2)
    ok('evaluación ligada', t[0]['evaluaciones'][0]['resultados'][0]['jugadorId']==beto['id'] and t[0]['evaluaciones'][0]['ejercicioId']==t[0]['ejercicios'][0]['id'])
    ok('jugadores migrados marcados sin consentimiento', all(not j.get('consentimiento') for j in t[0]['jugadores']))
    ok('subido a la nube', pg.evaluate("__mock.S.t.jugadores.length")==2 and pg.evaluate("__mock.S.t.partido_stats.length")==1 and pg.evaluate("__mock.S.t.evaluacion_resultados.length")==1)
    b.close()
print('ERRORES JS:',errors); print('RESUMEN: %d/%d'%(sum(1 for _,c in res if c),len(res)))
