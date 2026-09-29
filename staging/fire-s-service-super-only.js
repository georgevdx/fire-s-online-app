/* Keep saved requests, reported issues, feedback comments and the
   request archive visible only to the two service super users. */
(function fireSServiceSuperOnly(root) {
  'use strict';

  var SUPER_USERS = ['georgevdx@gmail.com', 'georgevdx@hotmail.com'];
  var LIST_IDS = [
    'serviceRequestsList',
    'betaFeedbackList',
    'feedbackCommentsList',
    'supportArchiveList'
  ];

  function emailOf(profile) {
    return String((profile && profile.email) || '')
      .trim()
      .toLowerCase();
  }

  function isServiceSuperUser(profile) {
    return SUPER_USERS.indexOf(emailOf(profile)) !== -1;
  }

  function currentProfile() {
    if (root.currentUserProfile) return root.currentUserProfile;
    try {
      if (typeof currentUserProfile !== 'undefined' && currentUserProfile) {
        return currentUserProfile;
      }
    } catch (_) {}
    return null;
  }

  function lockServiceSuperUserChrome(profile) {
    var allowed = isServiceSuperUser(
      profile === undefined ? currentProfile() : profile
    );
    var doc = root.document;
    if (!doc || !doc.body) return allowed;

    doc.body.classList.toggle('fire-s-service-super', allowed);
    var admin = doc.querySelector('#servicesSection .service-requests-admin');
    if (admin) {
      admin.hidden = !allowed;
      if (allowed) admin.removeAttribute('hidden');
      else admin.setAttribute('hidden', '');
    }
    if (!allowed) {
      LIST_IDS.forEach(function (id) {
        var list = doc.getElementById(id);
        if (!list) return;
        list.style.display = 'none';
        list.innerHTML = '';
      });
    }
    return allowed;
  }

  function wrap(name) {
    var original = root[name];
    if (typeof original !== 'function' || original.__fireSServiceSuperOnly) return;
    var wrapped = function fireSServiceSuperOnlyWrapped() {
      var result = original.apply(this, arguments);
      try { lockServiceSuperUserChrome(); } catch (_) {}
      return result;
    };
    wrapped.__fireSServiceSuperOnly = true;
    root[name] = wrapped;
    try {
      if (name === 'showServices') showServices = wrapped;
      if (name === 'showHome') showHome = wrapped;
    } catch (_) {}
  }

  root.fireSIsServiceSuperUser = isServiceSuperUser;
  root.fireSLockServiceSuperUserChrome = lockServiceSuperUserChrome;

  wrap('showServices');
  wrap('showHome');
  wrap('applyLoggedOutUi');
  try { lockServiceSuperUserChrome(); } catch (_) {}
  if (typeof root.setTimeout === 'function') {
    [0, 400, 1500].forEach(function (delay) {
      root.setTimeout(function () {
        try { lockServiceSuperUserChrome(); } catch (_) {}
      }, delay);
    });
  }
})(typeof window !== 'undefined' ? window : this);
