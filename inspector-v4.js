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
  function isInspector(){ 
    try {
      const clean = String(document.body?.dataset?.fireSCleanHomeRole || '').toLowerCase();
      if (clean) return clean === 'inspector';
    } catch(e){}
    try {
      if (document.body?.classList?.contains('fire-s-role-owner')) return false;
      if (document.body?.classList?.contains('fire-s-role-manager')) return false;
      if (document.body?.classList?.contains('fire-s-role-new-company')) return false;
      if (document.body?.classList?.contains('fire-s-role-pending-member')) return false;
      if (document.body?.classList?.contains('fire-s-role-guest')) return false;
    } catch(e){}
    return ['inspector','field_inspector','field-inspector','field inspector'].includes(role());
  }
  function projects(){
    let all=[]; try { all=Array.isArray(getProjects())?getProjects():[]; } catch(e){}
    try { if(typeof getVisibleProjectsForCurrentUser==='function' && currentUserProfile) return getVisibleProjectsForCurrentUser(all)||[]; } catch(e){}
    return all;
  }
  function text(v){ return String(v||'').trim(); }
  function name(p){ return text(p.projectName||p.organisationName||p.siteName||p.premisesName)||'Unnamed premises'; }
  function site(p){ return text(p.siteName||p.projectAddress||p.addressLine||p.address); }
  function haystack(p){
    return [
      name(p),
      site(p),
      p.organisationName,
      p.premisesName,
      p.inspectionNumber,
      p.inspectorName,
      p.projectAddress,
      p.addressLine,
      p.address,
      p.contactName,
      p.contactPerson
    ].map(text).join(' ').toLowerCase();
  }
  function isComplete(p){ return !!(p.completedAt||p.archivedAt||p.isArchived||String(p.status||'').toLowerCase()==='completed'||String(p.inspectionStatus||'').toLowerCase()==='completed'); }
  function scheduled(p){ return text(p.scheduledDate||p.followUpDate||p.nextInspectionDate); }
  function label(p){ if(!isComplete(p)) return 'Inspection in progress'; const d=scheduled(p); if(d) return 'Scheduled · '+d.slice(0,10); return 'Previous inspection available'; }
  function action(p){ return !isComplete(p)?'CONTINUE →':(scheduled(p)?'START →':'OPEN →'); }
  function esc(s){ return text(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function workflowScore(p){ if(!isComplete(p)) return 0; if(scheduled(p)) return 1; return 2; }
  function matchScore(p, q){
    if(!q) return workflowScore(p);
    const n=name(p).toLowerCase();
    const s=site(p).toLowerCase();
    const h=haystack(p);
    if(n===q || s===q) return 0;
    if(n.startsWith(q) || s.startsWith(q)) return 1;
    if(n.includes(q) || s.includes(q)) return 2;
    if(h.includes(q)) return 3;
    return 99;
  }
  function matchesQuery(p, q){
    if(!q) return true;
    return haystack(p).includes(q);
  }
  function open(p){
    if(!p) return;
    try { if(typeof window.openProject==='function') return window.openProject(p.id); } catch(e){}
    try { if(typeof openProject==='function') return openProject(p.id); } catch(e){}
  }
  function newPremises(){
    try { if(typeof showProjectList==='function') showProjectList(); } catch(e){}
    setTimeout(()=>{ const b=document.getElementById('newProjectBtn'); if(b) b.click(); },80);
  }
  function cardHtml(p, kind){
    const cls=kind==='next'?'inspector-v4-next':'inspector-v4-result';
    const head=kind==='next'?`<div class="inspector-v4-label">NEXT</div>`:'';
    return `<button type="button" class="${cls}" data-v4-open="${esc(p.id)}">${head}<div class="inspector-v4-title">${esc(name(p))}</div><div class="inspector-v4-meta">${esc(site(p))}${site(p)?' · ':''}${esc(label(p))}</div><span class="inspector-v4-action">${esc(action(p))}</span></button>`;
  }
  function build(){
    if(!isInspector()) {
      document.body.classList.remove('fire-s-inspector-v4');
      const shell=document.getElementById('inspectorV4Shell');
      if(shell){
        shell.style.setProperty('display','none','important');
        shell.setAttribute('hidden','true');
        shell.setAttribute('aria-hidden','true');
      }
      return;
    }
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
    shell.removeAttribute('hidden');
    shell.removeAttribute('aria-hidden');
    shell.style.setProperty('display','flex','important');
    render();
  }
  function render(){
    if(!isInspector()) return;
    const input=document.getElementById('inspectorV4Search'), next=document.getElementById('inspectorV4Next'), results=document.getElementById('inspectorV4Results');
    if(!input||!next||!results) return;
    const all=projects().slice();
    const q=text(input.value).toLowerCase();

    // Searching: only show records that match. Do not keep an unrelated NEXT card.
    if(q){
      const matches=all
        .filter(p=>matchesQuery(p,q))
        .sort((a,b)=>{
          const ms=matchScore(a,q)-matchScore(b,q);
          if(ms) return ms;
          return workflowScore(a)-workflowScore(b);
        })
        .slice(0,8);
      next.innerHTML='';
      results.innerHTML=matches.length
        ? matches.map(p=>cardHtml(p,'result')).join('')
        : `<div class="inspector-v4-empty">No premises match “${esc(q)}”. Try another name or use + NEW PREMISES.</div>`;
      document.querySelectorAll('[data-v4-open]').forEach(btn=>{
        btn.onclick=()=>open(all.find(p=>String(p.id)===String(btn.dataset.v4Open)));
      });
      return;
    }

    // No search: show NEXT priority, then nothing else until user searches.
    const ranked=all.slice().sort((a,b)=>workflowScore(a)-workflowScore(b));
    const priority=ranked.find(p=>!isComplete(p)) || ranked.find(p=>scheduled(p));
    next.innerHTML=priority?cardHtml(priority,'next'):'';
    results.innerHTML='';
    document.querySelectorAll('[data-v4-open]').forEach(btn=>{
      btn.onclick=()=>open(all.find(p=>String(p.id)===String(btn.dataset.v4Open)));
    });
  }
  function init(){ setTimeout(build,150); setTimeout(build,700); }
  document.addEventListener('DOMContentLoaded',init);
  document.addEventListener('click',e=>{ if(e.target.closest('#projectsHomeBtn,.back-home-btn')) setTimeout(build,100); });
  window.fireSInspectorV4=build;
})();
