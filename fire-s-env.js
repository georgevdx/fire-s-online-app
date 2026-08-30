/* ============================================================
   Fire-S environment fence
   Production = live app + live Supabase.
   Staging = toets-blad + Fire-S Test Supabase (keys empty until Johan sends them).
   Staging never falls back to the live cloud.
   ============================================================ */
(function fireSEnv(root) {
  'use strict';

  var PROD_URL = 'https://ispsdmglyylcwkufphnv.supabase.co';
  var PROD_ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzcHNkbWdseXlsY3drdWZwaG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzkwNDUsImV4cCI6MjA5MTc1NTA0NX0.Uy_DcmodOBvZf_WMOtnZwAh4ZQeJIbS9ojBw8DzNXhk';

  var STAGING_URL = 'https://ejqgzpkfcwocmtvwufwp.supabase.co';
  var STAGING_ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqcWd6cGtmY3dvY210dnd1ZndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDEwNzYsImV4cCI6MjEwMzA3NzA3Nn0.-sBT1bmd0TdVcaKGmw9Qcpt9cQDow2T94aHKJxtIUcA';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function bounceLegacyToetsQuery() {
    try {
      var path = String((root.location && root.location.pathname) || '').toLowerCase();
      if (path.indexOf('/staging') !== -1) return;
      var search = String((root.location && root.location.search) || '').toLowerCase();
      if (search.indexOf('env=staging') === -1) return;
      var dest = String((root.location && root.location.pathname) || '/');
      dest = dest.replace(/index\.html$/i, '');
      if (dest.charAt(dest.length - 1) !== '/') dest += '/';
      root.location.replace(dest + 'staging/');
    } catch (_) {}
  }
  bounceLegacyToetsQuery();

  function isStagingHere() {
    try {
      var path = String((root.location && root.location.pathname) || '').toLowerCase();
      if (path.indexOf('/staging') !== -1) return true;
      var search = String((root.location && root.location.search) || '').toLowerCase();
      if (search.indexOf('env=staging') !== -1) return true;
    } catch (_) {}
    return false;
  }

  var staging = isStagingHere();
  var stagingUrl = text(STAGING_URL);
  var stagingAnon = text(STAGING_ANON);
  var stagingCloudReady = !!(stagingUrl && stagingAnon);

  var env = {
    name: staging ? 'staging' : 'production',
    isStaging: staging,
    isProduction: !staging,
    appVersion: staging ? '1.3.27-toets' : '1.3.40',
    supabaseUrl: staging ? stagingUrl : PROD_URL,
    supabaseAnonKey: staging ? stagingAnon : PROD_ANON,
    cloudReady: staging ? stagingCloudReady : true,
    notifyCompanyS: !staging,
    storageKey: staging ? 'sb-fires-staging-auth' : 'sb-fires-production-auth'
  };

  function paintVersion() {
    try {
      var nodes = root.document && root.document.querySelectorAll('#appVersion, .brand-version');
      if (!nodes || !nodes.length) return;
      var label = 'Version ' + env.appVersion;
      for (var i = 0; i < nodes.length; i += 1) {
        if (nodes[i]) nodes[i].textContent = label;
      }
    } catch (_) {}
  }

  function paintBanner() {
    paintVersion();
    if (!staging) return;
    if (root.document && root.document.getElementById('fireSStagingBanner')) return;
    var bar = root.document.createElement('div');
    bar.id = 'fireSStagingBanner';
    bar.setAttribute('role', 'status');
    bar.style.cssText =
      'position:sticky;top:0;z-index:100001;padding:10px 14px;background:#7c2d12;color:#fff;' +
      'font-family:Arial,sans-serif;font-size:0.95rem;line-height:1.35;text-align:center;';
    if (stagingCloudReady) {
      bar.textContent =
        'TOETS-BLAD — nie vir kliënte. Data sit in Fire-S Test, nie in die regte wolk nie.';
    } else {
      bar.textContent =
        'TOETS-BLAD — nie vir kliënte. Die toets-wolk is nog nie gekoppel nie. Moenie hier Subscribe asof dit live is nie.';
    }
    var body = root.document.body;
    if (body) body.insertBefore(bar, body.firstChild);
    try {
      root.document.title = 'Fire-S TOETS';
    } catch (_) {}
  }

  root.FIRE_S_ENV = env;
  root.fireSIsStaging = function () {
    return !!env.isStaging;
  };

  if (root.document && root.document.body) {
    paintBanner();
  } else if (root.document) {
    root.document.addEventListener('DOMContentLoaded', paintBanner);
  }
})(window);
