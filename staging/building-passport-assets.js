/* Fire-S v104.2 Building Passport Assets */
(function(){
window.FireSBuildingAssets={
 render:function(project){
  const assets=project.assets||{};
  return `
<section class="fire-s-assets-v1042">
<h3>Building Assets</h3>
<div class="asset-grid">
<div><strong>${assets.extinguishers||0}</strong><span>Extinguishers</span></div>
<div><strong>${assets.hydrants||0}</strong><span>Hydrants</span></div>
<div><strong>${assets.hoseReels||0}</strong><span>Hose Reels</span></div>
<div><strong>${assets.sprinklers?'Yes':'No'}</strong><span>Sprinklers</span></div>
<div><strong>${assets.fireAlarm?'Yes':'No'}</strong><span>Fire Alarm</span></div>
<div><strong>${assets.gasSuppression?'Yes':'No'}</strong><span>Gas Suppression</span></div>
</div>
</section>`;}
};
})();