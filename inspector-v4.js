// Fire-S Inspector Simplification V4
// Isolated role-specific launcher. Management UI remains unchanged.
(function(){
  const ROLE_PREF_KEY='fireS.viewAsRole.v131';
  function actualRole(){
    try { return String(currentUserProfile?.role || window.currentUserProfile?.role || document.body?.dataset?.fireSResolvedRole || 'inspector').toLowerCase().trim(); } catch(e){ return 'inspector'; }
  }
  function role(){
    const real=actualRole();
    if(real==='super_admin') { try { return String(localStorage.getItem(ROLE_PREF_KEY)||real).toLowerCase().trim(); } catch(e){} }
    return real;
  }
  function isInspector(){ return ['inspector','field_inspector','field-inspector','field inspector','guest','local',''].includes(role()); }
  function projects(){
    let all=[]; try { all=Array.isArray(getProjects())?getProjects():[]; } catch(e){}
    try { if(typeof getVisibleProjectsForCurrentUser==='function' && currentUserProfile) return getVisibleProjectsForCurrentUser(all)||[]; } catch(e){}
    return all;
  }
  function text(v){ return String(v||'').trim(); }
  function name(p){ return text(p.projectName||p.organisationName||p.siteName||p.premisesName)||'Unnamed premises'; }
  function site(p){ return text(p.siteName||p.projectAddress||p.addressLine||p.address); }
  function isComplete(p){ return !!(p.completedAt||p.archivedAt||p.isArchived||String(p.status||'').toLowerCase()==='completed'||String(p.inspectionStatus||'').toLowerCase()==='completed'); }
  function scheduled(p){ return text(p.scheduledDate||p.followUpDate||p.nextInspectionDate); }
  function label(p){ if(!isComplete(p)) return 'Inspection in progress'; const d=scheduled(p); if(d) return 'Scheduled · '+d.slice(0,10); return 'Previous inspection available'; }
  function action(p){ return !isComplete(p)?'CONTINUE →':(scheduled(p)?'START →':'OPEN →'); }
  function esc(s){ return text(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function score(p){ if(!isComplete(p)) return 0; if(scheduled(p)) return 1; return 2; }
  function open(p){
    if(!p) return;
    try { if(typeof window.openProject==='function') return window.openProject(p.id); } catch(e){}
    try { if(typeof openProject==='function') return openProject(p.id); } catch(e){}
  }
  function newPremises(){
    try { if(typeof showProjectList==='function') showProjectList(); } catch(e){}
    setTimeout(()=>{ const b=document.getElementById('newProjectBtn'); if(b) b.click(); },80);
  }
  function build(){
    if(!isInspector()) { document.body.classList.remove('fire-s-inspector-v4'); return; }
    const centre=document.getElementById('mainCommandCentre'); if(!centre) return;
    document.body.classList.add('fire-s-inspector-v4');
    let shell=document.getElementById('inspectorV4Shell');
    if(!shell){
      shell=document.createElement('div'); shell.id='inspectorV4Shell'; shell.className='inspector-v4-shell';
      shell.innerHTML=`<div class="inspector-v4-brand"><div class="kicker">Fire-S</div><h2>INSPECT</h2></div>
        <input id="inspectorV4Search" class="inspector-v4-search" type="search" autocomplete="off" placeholder="Search premises or site…" aria-label="Search premises or site">
        <div id="inspectorV4Next"></div><div id="inspectorV4Results" class="inspector-v4-results"></div>
        <button id="inspectorV4New" class="inspector-v4-new" type="button">+ NEW PREMISES</button>
        <p class="inspector-v4-hint">Choose the premises. Fire-S takes you to the inspection.</p>`;
      centre.appendChild(shell);
      shell.querySelector('#inspectorV4Search').addEventListener('input',render);
      shell.querySelector('#inspectorV4New').addEventListener('click',newPremises);
    }
    render();
  }
  function render(){
    if(!isInspector()) return;
    const input=document.getElementById('inspectorV4Search'), next=document.getElementById('inspectorV4Next'), results=document.getElementById('inspectorV4Results');
    if(!input||!next||!results) return;
    const all=projects().slice().sort((a,b)=>score(a)-score(b));
    const q=text(input.value).toLowerCase();
    const matches=q?all.filter(p=>[name(p),site(p),p.inspectionNumber,p.inspectorName].join(' ').toLowerCase().includes(q)).slice(0,8):[];
    const priority=all.find(p=>!isComplete(p)) || all.find(p=>scheduled(p));
    next.innerHTML=priority?`<button type="button" class="inspector-v4-next" data-v4-open="${esc(priority.id)}"><div class="inspector-v4-label">NEXT</div><div class="inspector-v4-title">${esc(name(priority))}</div><div class="inspector-v4-meta">${esc(site(priority))}${site(priority)?' · ':''}${esc(label(priority))}</div><span class="inspector-v4-action">${esc(action(priority))}</span></button>`:'';
    results.innerHTML=q?(matches.length?matches.map(p=>`<button type="button" class="inspector-v4-result" data-v4-open="${esc(p.id)}"><div class="inspector-v4-title">${esc(name(p))}</div><div class="inspector-v4-meta">${esc(site(p))}${site(p)?' · ':''}${esc(label(p))}</div><span class="inspector-v4-action">${esc(action(p))}</span></button>`).join(''):`<div class="inspector-v4-empty">No premises found. Use + NEW PREMISES.</div>`):'';
    document.querySelectorAll('[data-v4-open]').forEach(btn=>btn.onclick=()=>open(all.find(p=>String(p.id)===String(btn.dataset.v4Open))));
  }
  function init(){ setTimeout(build,150); setTimeout(build,700); }
  document.addEventListener('DOMContentLoaded',init);
  document.addEventListener('click',e=>{ if(e.target.closest('#projectsHomeBtn,.back-home-btn')) setTimeout(build,100); });
  window.fireSInspectorV4=build;
})();
