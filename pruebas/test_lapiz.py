import os
HERE=os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE,'run_tests.py')).read().split('with sync_playwright()')[0])
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); ctx,pg=nuevo(b)
    pg.goto(APP); pg.wait_for_timeout(500)
    pg.fill('#authEmail','dir@test.mx'); pg.fill('#authPass','secreto123'); pg.click('#linkAuthModo'); pg.click('#btnAuth'); pg.wait_for_timeout(500)
    pg.evaluate("(()=>{__mock.S.t.codigos_alta=[{codigo:'ALTA1'}];localStorage.setItem('__mockdb',JSON.stringify(__mock.S))})()"); pg.fill('#onbCodigoAlta','alta1'); pg.fill('#onbNombreAcademia','Acad'); pg.click('#formCrearAcademia button'); pg.wait_for_timeout(800)
    pg.click('#btnNuevoEquipo'); pg.wait_for_timeout(1500)
    pg.on('dialog',lambda d: None)  # ya hay manejador que responde 'Sub-10'
    pg.evaluate("window.__ans='Renombrado'"); pg.click('#btnRenombrarEquipo'); pg.wait_for_timeout(1800)
    print('visible:',pg.is_visible('#btnRenombrarEquipo'),'| nombre local:',pg.evaluate("getTeam().nombre"),'| select:',pg.evaluate("document.getElementById('teamSelect').selectedOptions[0].textContent"),'| nube:',pg.evaluate("__mock.S.t.equipos[0].nombre"))
    b.close()
print(errors)
