import os
HERE=os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE,'run_tests.py')).read().split('with sync_playwright()')[0])
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); ctx,pg=nuevo(b)
    pg.goto(APP); pg.wait_for_timeout(500)
    pg.fill('#authEmail','dir@test.mx'); pg.fill('#authPass','secreto123'); pg.click('#linkAuthModo'); pg.click('#btnAuth'); pg.wait_for_timeout(500)
    pg.evaluate("(()=>{__mock.S.t.codigos_alta=[{codigo:'ALTA1'}];localStorage.setItem('__mockdb',JSON.stringify(__mock.S))})()"); pg.fill('#onbCodigoAlta','alta1'); pg.fill('#onbNombreAcademia','Acad'); pg.click('#formCrearAcademia button'); pg.wait_for_timeout(800)
    pg.click('#btnNuevoEquipo'); pg.wait_for_timeout(1000)
    ok('crear equipo usa cuadro propio', pg.evaluate("teams.length")==1)
    pg.evaluate("window.__manual=true")
    # cancelar renombrar
    pg.click('#btnRenombrarEquipo'); pg.wait_for_selector('dialog.dlg-ui[open]')
    ok('el cuadro propio es visible y trae el nombre actual', pg.input_value('dialog.dlg-ui input')=='Sub-10')
    pg.fill('dialog.dlg-ui input','Otro'); pg.click('dialog.dlg-ui [data-cancel]'); pg.wait_for_timeout(200)
    ok('cancelar no cambia el nombre', pg.evaluate("getTeam().nombre")=='Sub-10' and pg.locator('dialog.dlg-ui').count()==0)
    # Esc = cancelar
    pg.click('#btnRenombrarEquipo'); pg.wait_for_selector('dialog.dlg-ui[open]'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok('Esc cancela', pg.evaluate("getTeam().nombre")=='Sub-10' and pg.locator('dialog.dlg-ui').count()==0)
    # Enter acepta
    pg.click('#btnRenombrarEquipo'); pg.wait_for_selector('dialog.dlg-ui[open]'); pg.fill('dialog.dlg-ui input','Nuevo'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    ok('Enter acepta y renombra', pg.evaluate("getTeam().nombre")=='Nuevo')
    # confirmar eliminar: cancelar conserva
    pg.click('#btnEliminarEquipo'); pg.wait_for_selector('dialog.dlg-ui[open]')
    ok('el aviso de eliminar muestra el nombre del equipo', 'Nuevo' in pg.inner_text('dialog.dlg-ui .dlg-ui-msg'))
    pg.click('dialog.dlg-ui [data-cancel]'); pg.wait_for_timeout(200)
    ok('cancelar eliminar conserva el equipo', pg.evaluate("teams.length")==1)
    pg.click('#btnEliminarEquipo'); pg.wait_for_selector('dialog.dlg-ui[open]'); pg.click('dialog.dlg-ui [data-ok]'); pg.wait_for_timeout(300)
    ok('aceptar elimina', pg.evaluate("teams.length")==0)
    # alert propio, sin interpretar HTML, y en cola
    pg.evaluate("alert('<b>hola</b> uno'); alert('dos')"); pg.wait_for_selector('dialog.dlg-ui[open]')
    ok('alert no interpreta HTML', pg.inner_text('dialog.dlg-ui .dlg-ui-msg')=='<b>hola</b> uno' and pg.locator('dialog.dlg-ui b').count()==0)
    pg.click('dialog.dlg-ui [data-ok]'); pg.wait_for_timeout(200)
    ok('el segundo aviso aparece después', pg.inner_text('dialog.dlg-ui .dlg-ui-msg')=='dos')
    pg.click('dialog.dlg-ui [data-ok]'); pg.wait_for_timeout(200)
    ok('no quedan cuadros abiertos', pg.locator('dialog.dlg-ui').count()==0)
    b.close()
print('ERRORES JS:',errors); print('RESUMEN: %d/%d'%(sum(1 for _,c in res if c),len(res)))
