/* ============================================================
   Fire-S — schedule a new inspection and assign an inspector.
   Load AFTER fire-s-company-team.js.
   NEXT on Inspector Home uses fireSIsMyInspection.
   ============================================================ */
(function fireSScheduleAssign(root) {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function lower(value) {
    return text(value).toLowerCase();
  }

  function esc(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return (
        {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[ch] || ch
      );
    });
  }

  function currentIdentity(explicit) {
    if (explicit && (explicit.email || explicit.id)) {
      return {
        email: lower(explicit.email),
        id: text(explicit.id)
      };
    }
    var profile = {};
    try {
      profile = root.currentUserProfile || {};
    } catch (_) {}
    return {
      email: lower(profile.email),
      id: text(profile.id)
    };
  }

  function isMyInspection(project, identity) {
    if (!project) return false;
    var me = currentIdentity(identity);
    var assignedEmail = lower(
      project.assignedInspectorEmail || project.assigned_inspector_email
    );
    var assignedId = text(
      project.assignedInspectorUserId || project.assigned_inspector_user_id
    );
    if (assignedEmail || assignedId) {
      if (assignedEmail && me.email && assignedEmail === me.email) return true;
      if (assignedId && me.id && assignedId === me.id) return true;
      return false;
    }
    var createdEmail = lower(project.createdByEmail || project.created_by_email);
    var createdId = text(project.createdByUserId || project.created_by_user_id);
    if (createdEmail && me.email && createdEmail === me.email) return true;
    if (createdId && me.id && createdId === me.id) return true;
    return false;
  }

  function isFinalizedInspection(project) {
    if (!project) return false;
    var status = lower(
      project.status || project.inspectionStatus || project.archiveStatus
    );
    return !!(
      project.completedAt ||
      project.finalisedAt ||
      project.finalizedAt ||
      project.archivedAt ||
      project.isArchived ||
      status === 'completed' ||
      status === 'finalised' ||
      status === 'finalized'
    );
  }

  function scheduleStamp(project) {
    var d = text(
      (project && (project.scheduledDate || project.followUpDate || project.nextInspectionDate)) ||
        ''
    ).slice(0, 10);
    return d || '0000-01-01';
  }

  function scheduledPriorityList(projects, identity) {
    return (Array.isArray(projects) ? projects : [])
      .filter(function (project) {
        return isMyInspection(project, identity) && !isFinalizedInspection(project);
      })
      .slice()
      .sort(function (a, b) {
        var ad = scheduleStamp(a);
        var bd = scheduleStamp(b);
        if (ad !== bd) return ad < bd ? -1 : 1;
        var an = text(a.projectName || a.siteName || a.organisationName);
        var bn = text(b.projectName || b.siteName || b.organisationName);
        return an.localeCompare(bn);
      });
  }

  function readScheduleAssignee() {
    var doc = root.document;
    if (!doc) {
      return { email: '', name: '', userId: '' };
    }
    var select = doc.getElementById('scheduleInspectorSelect');
    if (!select || !text(select.value)) {
      return { email: '', name: '', userId: '' };
    }
    var opt = select.options[select.selectedIndex];
    return {
      email: lower(select.value),
      name: text(
        (opt && (opt.getAttribute('data-name') || opt.textContent)) || ''
      ),
      userId: text(opt && opt.getAttribute('data-user-id'))
    };
  }

  function optionLabel(person) {
    var name = text(person && person.name) || lower(person && person.email);
    var email = lower(person && person.email);
    var role = text(person && person.roleLabel) || text(person && person.role);
    var pending = person && person.pending ? ' · waiting to login' : '';
    if (email && name && name.toLowerCase() !== email) {
      return name + ' (' + email + ') · ' + role + pending;
    }
    return (email || name) + (role ? ' · ' + role : '') + pending;
  }

  function fillInspectorSelect() {
    var doc = root.document;
    if (!doc) return Promise.resolve([]);
    var select = doc.getElementById('scheduleInspectorSelect');
    if (!select) return Promise.resolve([]);
    var previous = lower(select.value);
    var loader =
      typeof root.fireSListAssignableInspectors === 'function'
        ? root.fireSListAssignableInspectors()
        : Promise.resolve([]);
    return Promise.resolve(loader)
      .then(function (people) {
        var list = Array.isArray(people) ? people : [];
        var html =
          '<option value="">Not assigned — inspector books their own</option>';
        list.forEach(function (person) {
          var email = lower(person && person.email);
          if (!email) return;
          html +=
            '<option value="' +
            esc(email) +
            '" data-user-id="' +
            esc(person.userId) +
            '" data-name="' +
            esc(person.name || email) +
            '"' +
            (email === previous ? ' selected' : '') +
            '>' +
            esc(optionLabel(person)) +
            '</option>';
        });
        select.innerHTML = html;
        if (previous) select.value = previous;
        var help = doc.getElementById('scheduleInspectorHelp');
        if (help && !list.length) {
          help.textContent =
            'No inspectors yet. Add someone in Personnel, then assign them here.';
        }
        return list;
      })
      .catch(function () {
        return [];
      });
  }

  function premisesScheduleLabel(project) {
    var org = text(project && (project.organisationName || project.organizationName));
    var site = text(project && project.siteName);
    var address = text(
      project && (project.addressLine || project.projectAddress)
    );
    var title =
      [org, site].filter(Boolean).join(' — ') ||
      text(project && project.projectName) ||
      'Untitled site';
    return address ? title + ' · ' + address : title;
  }

  function premisesIdentityKey(project) {
    var org = lower(
      project &&
        (project.organisationName ||
          project.organizationName ||
          project.premisesName)
    );
    var site = lower(project && project.siteName);
    if (!org && !site) org = lower(project && project.projectName);
    return org + '|' + site;
  }

  function uniqueSchedulablePremises(projects) {
    var map = {};
    (Array.isArray(projects) ? projects : []).forEach(function (project) {
      if (!project || !text(project.id)) return;
      var key = premisesIdentityKey(project);
      if (key === '|') return;
      var prev = map[key];
      var time = Date.parse(project.lastSaved || project.completedAt || '') || 0;
      var prevTime = prev
        ? Date.parse(prev.lastSaved || prev.completedAt || '') || 0
        : -1;
      if (!prev || time >= prevTime) map[key] = project;
    });
    return Object.keys(map)
      .map(function (key) {
        return map[key];
      })
      .sort(function (a, b) {
        return premisesScheduleLabel(a).localeCompare(premisesScheduleLabel(b));
      });
  }

  function hasInspectionWorkStarted(project) {
    if (!project) return false;
    var answers = Array.isArray(project.answers) ? project.answers : [];
    var answered = answers.some(function (answer) {
      var value = lower(answer && answer.answer);
      return value === 'yes' || value === 'no' || value === 'n/a' || value === 'na';
    });
    var photos = Array.isArray(project.photos) && project.photos.length > 0;
    return answered || photos || !!text(project.finalComments);
  }

  function canBookExistingPremises(project) {
    if (!project) return { ok: false, reason: 'missing' };
    var scheduled = lower(project.scheduledStatus) === 'scheduled';
    var fresh = project.scheduleFreshInspection === true;
    if (
      hasInspectionWorkStarted(project) &&
      !isFinalizedInspection(project) &&
      !(scheduled && fresh)
    ) {
      return { ok: false, reason: 'in_progress' };
    }
    return { ok: true, alreadyBooked: scheduled };
  }

  function stampExistingSiteSchedule(project, fields) {
    var details = fields || {};
    var assigned = details.assigned || {};
    var next = {};
    Object.keys(project || {}).forEach(function (key) {
      next[key] = project[key];
    });
    var started = hasInspectionWorkStarted(project);
    var finalized = isFinalizedInspection(project);
    next.scheduledDate = text(details.date).slice(0, 10);
    next.scheduledStatus = 'scheduled';
    next.scheduleType = 'existing_site';
    next.scheduledReason = 'existing_site';
    next.scheduledNote = 'Inspection booked for existing site';
    next.scheduleFreshInspection = !!(started || finalized);
    next.completedAt = null;
    next.archiveStatus = '';
    next.archivedAt = null;
    if (text(details.inspectionType)) {
      next.inspectionType = text(details.inspectionType);
    }
    next.assignedInspectorEmail = lower(assigned.email);
    next.assignedInspectorName = text(assigned.name);
    next.assignedInspectorUserId = text(assigned.userId);
    if (text(assigned.name)) next.inspectorName = text(assigned.name);
    next.syncPending = true;
    next.syncError = false;
    next.lastSaved = new Date().toISOString();
    return next;
  }

  function wrapOpener(name) {
    var orig = root[name];
    if (typeof orig !== 'function' || orig.__fireSAssignWrapped) return;
    function wrapped() {
      var result = orig.apply(this, arguments);
      fillInspectorSelect();
      return result;
    }
    wrapped.__fireSAssignWrapped = true;
    root[name] = wrapped;
  }

  function bind() {
    wrapOpener('openScheduleCommand');
    wrapOpener('scheduleNewInspection');
    wrapOpener('scheduleExistingInspection');
    wrapOpener('openSchedulePanel');
    var doc = root.document;
    if (!doc) return;
    [
      'cmdScheduleBtn',
      'scheduleNewInspectionBtn',
      'scheduleExistingInspectionBtn',
      'scheduleModeNewBtn',
      'scheduleModeExistingBtn'
    ].forEach(function (id) {
      var btn = doc.getElementById(id);
      if (!btn || btn.__fireSAssignBound) return;
      btn.__fireSAssignBound = true;
      btn.addEventListener('click', function () {
        setTimeout(fillInspectorSelect, 80);
        setTimeout(fillInspectorSelect, 400);
      });
    });
  }

  root.fireSIsMyInspection = isMyInspection;
  root.fireSIsFinalizedInspection = isFinalizedInspection;
  root.fireSScheduledPriorityList = scheduledPriorityList;
  root.fireSReadScheduleAssignee = readScheduleAssignee;
  root.fireSFillScheduleInspectorSelect = fillInspectorSelect;
  root.fireSPremisesScheduleLabel = premisesScheduleLabel;
  root.fireSUniqueSchedulablePremises = uniqueSchedulablePremises;
  root.fireSCanBookExistingPremises = canBookExistingPremises;
  root.fireSStampExistingSiteSchedule = stampExistingSiteSchedule;

  if (root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', bind, { once: true });
    } else {
      bind();
    }
    setTimeout(bind, 400);
  }
})(typeof window !== 'undefined' ? window : this);
