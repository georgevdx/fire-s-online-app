
/* Fire-S Action Register v103.4 - Resolve Actions */
(function(){
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function project(){if(typeof currentProjectId==='undefined'||!currentProjectId||typeof getProjects!=='function')return null;return getProjects().find(p=>p.id===currentProjectId)||null;}
function open(a){return String(a?.status||'').toLowerCase()!=='closed';}
function pri(a){return String(a?.priority||'Medium').trim()||'Medium';}
function cls(p){p=String(p||'').toLowerCase();return p==='critical'?'critical':p==='high'?'high':p==='low'?'low':'medium';}
function date(v){if(!v)return'Not set';const d=new Date(v);return Number.isNaN(d.getTime())?String(v).slice(0,10):d.toLocaleDateString();}
function isoDate(){return new Date().toISOString().slice(0,10);}
function stats(actions){const o=actions.filter(open);return{open:o.length,critical:o.filter(a=>pri(a)==='Critical').length,high:o.filter(a=>pri(a)==='High').length,medium:o.filter(a=>pri(a)==='Medium').length,low:o.filter(a=>pri(a)==='Low').length,closed:actions.filter(a=>!open(a)).length};}
function filtered(actions,f){if(!f||f==='open')return actions.filter(open);if(f==='closed')return actions.filter(a=>!open(a));return actions.filter(a=>open(a)&&pri(a).toLowerCase()===f);}
function saveProjectActions(projectId, actions){
  const projects=getProjects();
  const i=projects.findIndex(p=>p.id===projectId);
  if(i===-1)return;
  projects[i]={...projects[i],actions,actionEngineUpdatedAt:new Date().toISOString(),syncPending:true,lastSaved:new Date().toISOString()};
  setProjects(projects);
  if(typeof currentProject!=='undefined'&&currentProject?.id===projectId){currentProject=projects[i];}
  if(typeof renderProjectsList==='function')renderProjectsList();
  if(typeof scheduleAutoSave==='function')setTimeout(scheduleAutoSave,50);
}
function updateAction(actionId,patch){
  const p=project(); if(!p)return;
  const actions=Array.isArray(p.actions)?p.actions:[];
  const updated=actions.map(a=>{
    if(a.actionId!==actionId)return a;
    const next={...a,...patch};
    next.history=[...(a.history||[]),{event:patch.status==='Closed'?'Resolved':'Updated',date:new Date().toISOString(),note:patch.closeComment||'Action updated'}];
    if(patch.status==='Closed'&&!next.closedDate)next.closedDate=new Date().toISOString();
    if(patch.status!=='Closed'){next.closedDate='';next.closedBy='';}
    return next;
  });
  saveProjectActions(p.id,updated);
}
function card(a){const p=pri(a);return `<div class="fire-s-action-card-v1033 priority-${cls(p)}">
  <div class="fire-s-action-top-v1033"><div><strong>${esc(a.actionId||'Action')}</strong><span>${esc(a.status||'Open')}</span></div><b>${esc(p)}</b></div>
  <div class="fire-s-action-question-v1033">${esc(a.question||a.finding||'Action item')}</div>
  ${a.finding&&a.finding!==a.question?`<div class="fire-s-action-finding-v1033">${esc(a.finding)}</div>`:''}
  <div class="fire-s-action-meta-v1033">
    <div><span>Responsible</span><strong>${esc(a.responsible||'Not assigned')}</strong></div>
    <div><span>Due</span><strong>${esc(date(a.dueDate))}</strong></div>
    <div><span>Section</span><strong>${esc(a.sectionName||'Checklist')}</strong></div>
    <div><span>Created</span><strong>${esc(date(a.createdDate||a.created))}</strong></div>
  </div>
  ${a.closeComment?`<div class="fire-s-action-corrective-v1033"><span>Close / Update Comment</span><p>${esc(a.closeComment)}</p></div>`:''}
  ${a.correctiveAction?`<div class="fire-s-action-corrective-v1033"><span>Corrective Action</span><p>${esc(a.correctiveAction)}</p></div>`:''}
  <div class="fire-s-action-buttons-v1034">
    <button type="button" data-edit-action="${esc(a.actionId)}">Update / Resolve</button>
  </div>
</div>`;}
function render(f='open'){const p=project(),panel=document.getElementById('fireSActionRegisterPanelV1033');if(!panel)return;if(!p){panel.innerHTML='<div class="fire-s-action-empty-v1033">No premises open.</div>';return;}const actions=Array.isArray(p.actions)?p.actions:[],s=stats(actions),list=filtered(actions,f);panel.dataset.filter=f;panel.innerHTML=`
 <div class="fire-s-action-summary-v1033">
  ${[['open','Open',s.open],['critical','Critical',s.critical],['high','High',s.high],['medium','Medium',s.medium],['low','Low',s.low],['closed','Closed',s.closed]].map(x=>`<button type="button" data-action-filter="${x[0]}" class="${f===x[0]?'active':''}"><span>${x[2]}</span><small>${x[1]}</small></button>`).join('')}
 </div>
 <div class="fire-s-action-list-v1033">${list.length?list.map(card).join(''):'<div class="fire-s-action-empty-v1033">No actions in this filter.</div>'}</div>`;
 panel.querySelectorAll('[data-action-filter]').forEach(b=>b.addEventListener('click',()=>render(b.dataset.actionFilter)));
 panel.querySelectorAll('[data-edit-action]').forEach(b=>b.addEventListener('click',()=>openEditor(b.dataset.editAction)));
}
function openEditor(actionId){
  const p=project(); if(!p)return;
  const a=(p.actions||[]).find(x=>x.actionId===actionId); if(!a)return;
  let modal=document.getElementById('fireSActionResolveModalV1034');
  if(!modal){
    document.body.insertAdjacentHTML('beforeend',`<div id="fireSActionResolveModalV1034" class="fire-s-action-modal-v1034" style="display:none;"><div class="fire-s-action-modal-card-v1034"><div class="fire-s-action-modal-head-v1034"><strong id="fireSActionModalTitleV1034">Action</strong><button type="button" id="fireSActionModalCloseV1034">×</button></div><div id="fireSActionModalBodyV1034"></div></div></div>`);
    modal=document.getElementById('fireSActionResolveModalV1034');
    document.getElementById('fireSActionModalCloseV1034')?.addEventListener('click',closeEditor);
    modal.addEventListener('click',e=>{if(e.target===modal)closeEditor();});
  }
  document.getElementById('fireSActionModalTitleV1034').textContent=`${a.actionId} · ${a.status||'Open'}`;
  document.getElementById('fireSActionModalBodyV1034').innerHTML=`
    <div class="fire-s-action-editor-summary-v1034">
      <b>${esc(a.question||a.finding||'Action')}</b>
      <p>${esc(a.finding||'')}</p>
    </div>
    <label>Status
      <select id="fireSActionStatusV1034">
        ${['Open','In Progress','Waiting','Closed'].map(s=>`<option value="${s}" ${String(a.status||'Open')===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </label>
    <label>Responsible
      <input id="fireSActionResponsibleV1034" value="${esc(a.responsible||'')}">
    </label>
    <label>Due Date
      <input id="fireSActionDueDateV1034" type="date" value="${esc(String(a.dueDate||'').slice(0,10))}">
    </label>
    <label>Completed By
      <input id="fireSActionClosedByV1034" value="${esc(a.closedBy||'')}">
    </label>
    <label>Completed Date
      <input id="fireSActionClosedDateV1034" type="date" value="${esc(String(a.closedDate||'').slice(0,10)||isoDate())}">
    </label>
    <label>Comment
      <textarea id="fireSActionCommentV1034">${esc(a.closeComment||'')}</textarea>
    </label>
    <div class="fire-s-action-modal-actions-v1034">
      <button type="button" id="fireSActionSaveV1034">Save</button>
      <button type="button" id="fireSActionCancelV1034" class="secondary-btn">Cancel</button>
    </div>`;
  document.getElementById('fireSActionCancelV1034')?.addEventListener('click',closeEditor);
  document.getElementById('fireSActionSaveV1034')?.addEventListener('click',()=>{
    const status=document.getElementById('fireSActionStatusV1034').value;
    updateAction(actionId,{
      status,
      responsible:document.getElementById('fireSActionResponsibleV1034').value.trim(),
      dueDate:document.getElementById('fireSActionDueDateV1034').value,
      closedBy:status==='Closed'?document.getElementById('fireSActionClosedByV1034').value.trim():'',
      closedDate:status==='Closed'?document.getElementById('fireSActionClosedDateV1034').value:'',
      closeComment:document.getElementById('fireSActionCommentV1034').value.trim()
    });
    closeEditor();
    render(document.getElementById('fireSActionRegisterPanelV1033')?.dataset.filter||'open');
  });
  modal.style.display='flex';
}
function closeEditor(){const m=document.getElementById('fireSActionResolveModalV1034');if(m)m.style.display='none';}
function inject(){const form=document.getElementById('projectFormSection'),ws=document.getElementById('fireSPremisesWorkspaceLiteV101');if(!form||form.style.display==='none'||!ws)return;if(!document.getElementById('fireSActionRegisterPanelV1033')){ws.insertAdjacentHTML('afterend',`<div class="fire-s-action-register-v1033"><div class="fire-s-action-register-header-v1033"><div><span>Action Register</span><strong>Premises Actions</strong></div><button type="button" id="fireSRefreshActionRegisterV1033">Refresh</button></div><div id="fireSActionRegisterPanelV1033"></div></div>`);document.getElementById('fireSRefreshActionRegisterV1033')?.addEventListener('click',()=>render());}render(document.getElementById('fireSActionRegisterPanelV1033')?.dataset.filter||'open');}
window.FireSActionRegister={inject,render,openEditor,updateAction};
setTimeout(inject,700);setInterval(inject,2000);
})();
