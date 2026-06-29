/* Fire-S v2 Workspace Module */
(function(){ window.FireS && window.FireS.registerModule('workspace',{init(core){ window.FireS.workspace={open(id){ return typeof fireSRenderPremisesWorkspace==='function' ? fireSRenderPremisesWorkspace(id) : core.openInspectionForm(id);},startInspection(id){return core.openInspectionForm(id);}}; }}); })();
