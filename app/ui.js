// =====================================================================
// MiDT · Cuadros propios (reemplazan alert / confirm / prompt del navegador)
// Los del navegador se bloquean en muchos celulares ("evitar que esta página cree cuadros adicionales").
//   uiAlert(msg)                 → avisa (no bloquea; los avisos se encolan)
//   await uiConfirm(msg, opts)   → true / false
//   await uiPrompt(msg, valor)   → texto, o null si cancelan
// Además, window.alert pasa a usar uiAlert.
// =====================================================================
(function () {
'use strict';
const cola = []; let abierto = false;
const nativoAlert = window.alert ? window.alert.bind(window) : null;

function pedir(cfg) {
  return new Promise(resolve => { cola.push({ cfg, resolve }); siguiente(); });
}

function siguiente() {
  if (abierto || !cola.length) return;
  if (!document.body) { document.addEventListener('DOMContentLoaded', siguiente, { once: true }); return; }
  abierto = true;
  const { cfg, resolve } = cola.shift();
  const d = document.createElement('dialog');
  d.className = 'dlg-ui';
  d.setAttribute('role', cfg.tipo === 'alert' ? 'alertdialog' : 'dialog');

  const p = document.createElement('p');
  p.className = 'dlg-ui-msg';
  p.textContent = String(cfg.msg == null ? '' : cfg.msg);   // textContent: nunca interpreta HTML
  d.appendChild(p);

  let input = null;
  if (cfg.tipo === 'prompt') {
    input = document.createElement('input');
    input.type = 'text'; input.className = 'dlg-ui-input'; input.value = cfg.valor == null ? '' : String(cfg.valor);
    input.autocomplete = 'off';
    d.appendChild(input);
  }

  const fila = document.createElement('div');
  fila.className = 'dlg-ui-botones';
  let cerrado = false;
  function cerrar(valor) {
    if (cerrado) return; cerrado = true;
    try { d.close(); } catch (e) { /* ya cerrado */ }
    d.remove(); abierto = false;
    resolve(valor);
    siguiente();
  }
  const cancelValor = cfg.tipo === 'confirm' ? false : cfg.tipo === 'prompt' ? null : undefined;
  const okValor = () => cfg.tipo === 'confirm' ? true : cfg.tipo === 'prompt' ? input.value : undefined;

  if (cfg.tipo !== 'alert') {
    const bc = document.createElement('button');
    bc.type = 'button'; bc.className = 'btn-mini'; bc.textContent = cfg.cancelar || 'Cancelar';
    bc.dataset.cancel = '1'; bc.onclick = () => cerrar(cancelValor);
    fila.appendChild(bc);
  }
  const bo = document.createElement('button');
  bo.type = 'button'; bo.className = cfg.peligro ? 'btn-danger' : 'btn-primary';
  bo.textContent = cfg.aceptar || (cfg.tipo === 'alert' ? 'Entendido' : 'Aceptar');
  bo.dataset.ok = '1'; bo.onclick = () => cerrar(okValor());
  fila.appendChild(bo);
  d.appendChild(fila);

  d.addEventListener('cancel', ev => { ev.preventDefault(); cerrar(cancelValor); });   // tecla Esc
  if (input) input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); cerrar(input.value); } });

  document.body.appendChild(d);
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  if (input) { input.focus(); input.select(); } else bo.focus();
}

window.uiAlert = function (msg, opts) { return pedir(Object.assign({ tipo: 'alert', msg }, opts || {})); };
window.uiConfirm = function (msg, opts) { return pedir(Object.assign({ tipo: 'confirm', msg }, opts || {})); };
window.uiPrompt = function (msg, valor, opts) { return pedir(Object.assign({ tipo: 'prompt', msg, valor }, opts || {})); };

// alert() ya no bloquea ni se puede suprimir por el navegador
window.alert = function (msg) { window.uiAlert(msg); };
window.__alertNativo = nativoAlert;
})();
