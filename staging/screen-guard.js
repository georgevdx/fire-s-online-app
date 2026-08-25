/* =====================================================
   FIRE-S MANUAL SPRINT 201 - DEV DIAGNOSTICS
   Purpose:
   - Provide a small on-device diagnostics panel for manual testing.
   - Track navigation/render events without changing inspection data.
   - Make bounce/render problems visible during testing.
   Toggle: press Ctrl + Shift + D
   ===================================================== */
(function fireSDevDiagnosticsModule() {
  'use strict';

  if (window.__fireSDevDiagnostics201) return;
  window.__fireSDevDiagnostics201 = true;

  const VERSION = 'Manual Sprint 201 - Dev Diagnostics';
  const MAX_EVENTS = 30;
  const events = [];

  function visible(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function activeScreen() {
    if (visible('projectFormSection')) return 'inspection';
    if (visible('projectListSection')) return 'premises';
    if (visible('reportSection')) return 'report';
    if (visible('servicesSection')) return 'services';
    if (visible('homeSection')) return 'home';
    return 'unknown';
  }

  function log(type, detail) {
    events.unshift({
      time: new Date().toLocaleTimeString(),
      type,
      screen: activeScreen(),
      detail: detail || ''
    });
    events.splice(MAX_EVENTS);
    render();
  }

  function ensurePanel() {
    let panel = document.getElementById('fireSDevDiagnosticsPanel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'fireSDevDiagnosticsPanel';
    panel.style.cssText = [
      'position:fixed',
      'right:10px',
      'bottom:10px',
      'z-index:99999',
      'width:min(360px, calc(100vw - 20px))',
      'max-height:45vh',
      'overflow:auto',
      'background:rgba(20,20,20,0.92)',
      'color:#fff',
      'font:12px/1.35 system-ui, sans-serif',
      'border-radius:12px',
      'box-shadow:0 8px 30px rgba(0,0,0,0.35)',
      'padding:10px',
      'display:none'
    ].join(';');
    document.body.appendChild(panel);
    return panel;
  }

  function render() {
    const panel = document.getElementById('fireSDevDiagnosticsPanel');
    if (!panel || panel.style.display === 'none') return;

    const screen = activeScreen();
    const homeVisible = visible('homeSection');
    const premisesVisible = visible('projectListSection');
    const inspectionVisible = visible('projectFormSection');

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px;">
        <strong>Fire-S Diagnostics</strong>
        <button id="fireSDiagClose" type="button" style="font:inherit;border:0;border-radius:8px;padding:3px 8px;">Close</button>
      </div>
      <div><strong>Version:</strong> ${VERSION}</div>
      <div><strong>Screen:</strong> ${screen}</div>
      <div><strong>Layers:</strong> home=${homeVisible} premises=${premisesVisible} inspection=${inspectionVisible}</div>
      <hr style="border:0;border-top:1px solid rgba(255,255,255,0.2);margin:8px 0;">
      <div><strong>Recent events</strong></div>
      ${events.map(e => `<div style="margin-top:4px;"><span style="opacity:.75">${e.time}</span> ${e.type} <em style="opacity:.75">${e.screen}</em> ${e.detail}</div>`).join('') || '<div style="opacity:.75">No events yet.</div>'}
    `;

    const close = document.getElementById('fireSDiagClose');
    if (close) close.onclick = () => { panel.style.display = 'none'; };
  }

  function toggle() {
    const panel = ensurePanel();
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    log('toggle', 'diagnostics');
    render();
  }

  document.addEventListener('keydown', event => {
    if (event.ctrlKey && event.shiftKey && String(event.key).toLowerCase() === 'd') {
      event.preventDefault();
      toggle();
    }
  });

  ['fire-s:navigation:changed', 'fire-s:state:changed', 'fire-s:render:executed', 'fire-s:render:blocked'].forEach(name => {
    document.addEventListener(name, event => {
      log(name.replace('fire-s:', ''), event && event.detail && event.detail.key ? event.detail.key : '');
    });
  });

  window.FireSModules = window.FireSModules || {};
  window.FireSModules.devDiagnostics = {
    version: VERSION,
    toggle,
    log,
    get activeScreen() { return activeScreen(); },
    get events() { return events.slice(); }
  };

  window.addEventListener('load', () => {
    log('load', 'manual sprint diagnostics ready');
  });
})();
