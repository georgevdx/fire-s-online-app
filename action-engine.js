/* Fire-S Sprint103 Action Engine Foundation */

const FireSActionEngine=(function(){

function nextActionId(){
 const y=new Date().getFullYear();
 const key="fires_action_counter_"+y;
 let n=parseInt(localStorage.getItem(key)||"0",10)+1;
 localStorage.setItem(key,String(n));
 return `AC-${y}-${String(n).padStart(6,"0")}`;
}

function loadRules(){
 try{return JSON.parse(fetchRulesCache||"{}");}catch(e){return {};}
}

function createAction(data){
 return {
   actionId: nextActionId(),
   premisesId:data.premisesId||"",
   inspectionId:data.inspectionId||"",
   question:data.question||"",
   finding:data.finding||"",
   priority:data.priority||"Medium",
   responsible:data.responsible||"",
   dueDate:data.dueDate||"",
   status:"Open",
   created:new Date().toISOString(),
   history:[{event:"Created",date:new Date().toISOString()}]
 };
}

return {createAction,nextActionId,loadRules};

})();
