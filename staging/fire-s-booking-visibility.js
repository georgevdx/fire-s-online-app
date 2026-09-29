/* ============================================================
   Fire-S — booked inspections stay with the right person.
   Load AFTER fire-s-schedule-assign.js on the toets-blad.
   Owner and manager book an inspector. That inspector gets the
   email (fireSNotifyInspectorAssignment) and sees it on Home.
   Owner and manager see who each booking is for.
   An inspector sees only their own work, plus bookings directed
   to them. Other inspectors' inspections stay off their lists.
   ============================================================ */
(function fireSBookingVisibility(root) {
  'use strict';

  var MANAGEMENT = {
    manager: true,
    company_owner: true,
    owner: true,
    super_admin: true,
    admin: true
  };

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

  function roleOf(explicit) {
    if (explicit && explicit.role) return lower(explicit.role);
    try {
      if (typeof root.getCurrentUserRole === 'function') {
        return lower(root.getCurrentUserRole());
      }
    } catch (_) {}
    try {
      return lower(root.currentUserProfile && root.currentUserProfile.role);
    } catch (_) {}
    return '';
  }

  function bodyHas(name) {
    try {
      var body = root.document && root.document.body;
      return !!(body && body.classList && body.classList.contains(name));
    } catch (_) {
      return false;
    }
  }

  function isFieldInspector(explicit) {
    if (!explicit) {
      if (bodyHas('fire-s-role-owner') || bodyHas('fire-s-role-manager')) return false;
      if (bodyHas('fire-s-role-viewer')) return false;
      if (bodyHas('fire-s-role-inspector')) return true;
    }
    var role = roleOf(explicit);
    if (!role) return false;
    if (MANAGEMENT[role] || role === 'viewer' || role === 'guest') return false;
    return (
      role === 'inspector' ||
      role === 'field_inspector' ||
      role === 'field-inspector' ||
      role === 'field inspector'
    );
  }

  function isManagement(explicit) {
    if (!explicit) {
      if (bodyHas('fire-s-role-inspector') && !bodyHas('fire-s-role-owner') && !bodyHas('fire-s-role-manager')) {
        return false;
      }
      if (bodyHas('fire-s-role-owner') || bodyHas('fire-s-role-manager')) return true;
    }
    return !!MANAGEMENT[roleOf(explicit)];
  }

  function identityFrom(explicit) {
    var source = explicit || {};
    if (!explicit) {
      try {
        source = root.currentUserProfile || {};
      } catch (_) {
        source = {};
      }
    }
    return {
      email: lower(source.email),
      id: text(source.id)
    };
  }

  function fallbackMine(project, identity) {
    if (!project) return false;
    var me = identity || { email: '', id: '' };
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

  function isMine(project, identity) {
    try {
      if (typeof root.fireSIsMyInspection === 'function') {
        return root.fireSIsMyInspection(project, identity);
      }
    } catch (_) {}
    return fallbackMine(project, identity);
  }

  function isFinalized(project) {
    try {
      if (typeof root.fireSIsFinalizedInspection === 'function') {
        return root.fireSIsFinalizedInspection(project);
      }
    } catch (_) {}
    if (!project) return false;
    var status = lower(project.status || project.inspectionStatus || project.archiveStatus);
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

  function visibleProjects(projects, explicitProfile) {
    var list = Array.isArray(projects) ? projects : [];
    if (!isFieldInspector(explicitProfile)) return list;
    var identity = identityFrom(explicitProfile || root.currentUserProfile);
    return list.filter(function (project) {
      return isMine(project, identity);
    });
  }

  function isBookedOut(project) {
    if (!project || isFinalized(project)) return false;
    var status = lower(project.scheduledStatus);
    if (status === 'completed' || status === 'cancelled' || status === 'canceled') return false;
    var assigned = lower(
      project.assignedInspectorEmail || project.assigned_inspector_email
    );
    var assignedId = text(
      project.assignedInspectorUserId || project.assigned_inspector_user_id
    );
    if (status === 'scheduled' || assigned || assignedId) return true;
    return !!text(project.scheduledDate || project.followUpDate);
  }

  function premisesName(project) {
    var org = text(project && (project.organisationName || project.organizationName));
    var site = text(project && project.siteName);
    return (
      [org, site].filter(Boolean).join(' — ') ||
      text(project && project.projectName) ||
      'Untitled premises'
    );
  }

  function inspectorLabel(project) {
    var name = text(project && project.assignedInspectorName);
    var email = lower(
      project && (project.assignedInspectorEmail || project.assigned_inspector_email)
    );
    if (email || name) {
      if (name && email && name.toLowerCase() !== email) return name + ' (' + email + ')';
      return name || email;
    }
    var createdEmail = lower(
      project && (project.createdByEmail || project.created_by_email)
    );
    var createdName = text(project && project.inspectorName);
    if (createdEmail || createdName) {
      var who =
        createdName && createdEmail && createdName.toLowerCase() !== createdEmail
          ? createdName + ' (' + createdEmail + ')'
          : createdName || createdEmail;
      return 'Not assigned · created by ' + who;
    }
    return 'Not assigned yet';
  }

  function visitDate(project) {
    return text(
      project &&
        (project.scheduledDate || project.followUpDate || project.nextInspectionDate)
    ).slice(0, 10);
  }

  function rosterRows(projects) {
    return (Array.isArray(projects) ? projects : [])
      .filter(isBookedOut)
      .map(function (project) {
        return {
          id: text(project.id),
          name: premisesName(project),
          date: visitDate(project),
          inspector: inspectorLabel(project)
        };
      })
      .sort(function (a, b) {
        var ad = a.date || '9999-99-99';
        var bd = b.date || '9999-99-99';
        if (ad !== bd) return ad < bd ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  function companyProjects() {
    var list = [];
    try {
      list = typeof root.getProjects === 'function' ? root.getProjects() || [] : [];
    } catch (_) {
      list = [];
    }
    try {
      if (typeof root.getVisibleProjectsForCurrentUser === 'function') {
        var visible = root.getVisibleProjectsForCurrentUser(list);
        if (Array.isArray(visible)) return visible;
      }
    } catch (_) {}
    return Array.isArray(list) ? list : [];
  }

  function byId(id) {
    try {
      return root.document && root.document.getElementById(id);
    } catch (_) {
      return null;
    }
  }

  function ensurePanel() {
    var doc = root.document;
    if (!doc || !doc.createElement) return null;
    var panel = byId('fireSBookedOut');
    if (panel) return panel;
    panel = doc.createElement('section');
    panel.id = 'fireSBookedOut';
    panel.className = 'fire-s-booked-out';
    panel.setAttribute('aria-label', 'Scheduled for inspectors');
    panel.hidden = true;
    panel.innerHTML =
      '<h4>Scheduled for inspectors</h4>' +
      '<p class="fire-s-booked-out-hint">Each inspection booked for an inspector, who must visit, and the date.</p>' +
      '<div class="fire-s-booked-out-scroll">' +
      '<table class="fire-s-booked-out-table">' +
      '<thead><tr><th scope="col">Inspection</th><th scope="col">Inspector</th><th scope="col">Date</th></tr></thead>' +
      '<tbody id="fireSBookedOutBody"></tbody>' +
      '</table></div>';
    panel.addEventListener('click', function (event) {
      var row = event.target && event.target.closest && event.target.closest('[data-project-id]');
      if (!row) return;
      event.preventDefault();
      openBooked(row.getAttribute('data-project-id'));
    });
    return panel;
  }

  function openBooked(projectId) {
    var id = text(projectId);
    if (!id) return;
    try {
      if (typeof root.openProject === 'function') {
        root.openProject(id);
        return;
      }
    } catch (_) {}
    try {
      if (typeof root.fireSOpenProjectCard === 'function') {
        root.fireSOpenProjectCard(id);
      }
    } catch (_) {}
  }

  function inScheduleView() {
    return bodyHas('fire-s-schedule-view');
  }

  function placePanel(panel) {
    if (!panel || !panel.parentNode && !root.document) return;
    var doc = root.document;
    if (!doc) return;
    if (inScheduleView()) {
      var heading = byId('scheduleBookedHeading');
      if (heading && heading.parentNode) {
        if (panel.previousSibling !== heading) {
          heading.parentNode.insertBefore(panel, heading.nextSibling);
        }
        return;
      }
      var listSection = byId('projectListSection');
      if (listSection) listSection.insertBefore(panel, listSection.firstChild);
      return;
    }
    var lists = byId('fireSOwnerLists');
    if (lists && lists.parentNode) {
      if (panel.nextSibling !== lists) {
        lists.parentNode.insertBefore(panel, lists);
      }
      return;
    }
    var centre = byId('mainCommandCentre');
    if (centre && panel.parentNode !== centre) centre.appendChild(panel);
  }

  function hidePanel(panel) {
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    try {
      panel.style.removeProperty('display');
    } catch (_) {}
  }

  function showPanel(panel) {
    if (!panel) return;
    panel.hidden = false;
    panel.removeAttribute('aria-hidden');
    try {
      panel.style.removeProperty('display');
    } catch (_) {}
  }

  function paintBookedList() {
    var doc = root.document;
    if (!doc) return;
    var panel = ensurePanel();
    if (!panel) return;
    placePanel(panel);
    if (!isManagement()) {
      hidePanel(panel);
      return;
    }
    var rows = rosterRows(companyProjects());
    var body = byId('fireSBookedOutBody');
    if (body) {
      body.innerHTML = rows.length
        ? rows
            .map(function (row) {
              return (
                '<tr class="fire-s-booked-out-row" data-project-id="' +
                esc(row.id) +
                '" tabindex="0" role="button">' +
                '<td>' +
                esc(row.name) +
                '</td><td>' +
                esc(row.inspector) +
                '</td><td>' +
                esc(row.date || 'No date') +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr class="fire-s-booked-out-empty"><td colspan="3">No inspections are booked out yet. Use Schedule, pick the inspector, and save.</td></tr>';
    }
    showPanel(panel);
    decorateCards();
  }

  function projectMap() {
    var map = {};
    var list = [];
    try {
      list = typeof root.getProjects === 'function' ? root.getProjects() || [] : [];
    } catch (_) {
      list = [];
    }
    (Array.isArray(list) ? list : []).forEach(function (project) {
      if (project && project.id != null) map[String(project.id)] = project;
    });
    return map;
  }

  function decorateCards() {
    var doc = root.document;
    if (!doc || !doc.querySelectorAll) return;
    var map = projectMap();
    var cards = doc.querySelectorAll('#projectsList [data-project-id]');
    Array.prototype.forEach.call(cards, function (card) {
      var id = String(card.getAttribute('data-project-id') || '').replace(/^"+|"+$/g, '');
      var project = map[id];
      var line = card.querySelector && card.querySelector('.fire-s-booked-for');
      if (!project || !isBookedOut(project)) {
        if (line && line.parentNode) line.parentNode.removeChild(line);
        return;
      }
      if (!line && doc.createElement) {
        line = doc.createElement('div');
        line.className = 'fire-s-booked-for';
        var host =
          (card.querySelector && card.querySelector('.ultra-premises-body, .smart-premises-body')) ||
          card;
        host.appendChild(line);
      }
      if (line) line.textContent = 'Booked for ' + inspectorLabel(project);
    });
  }

  function installVisibility() {
    var current = root.getVisibleProjectsForCurrentUser;
    if (typeof current !== 'function' || current.__fireSBookingVisibility) return;
    function wrapped(projects) {
      var list = projects;
      try {
        list = current.apply(this, arguments);
      } catch (_) {}
      return visibleProjects(list, null);
    }
    wrapped.__fireSBookingVisibility = true;
    root.getVisibleProjectsForCurrentUser = wrapped;
  }

  function guardOpen(name) {
    var current = root[name];
    if (typeof current !== 'function' || current.__fireSBookingOpen) return;
    function wrapped(id) {
      if (isFieldInspector(null)) {
        var found = null;
        try {
          var list = typeof root.getProjects === 'function' ? root.getProjects() || [] : [];
          found = (Array.isArray(list) ? list : []).filter(function (project) {
            return String(project && project.id) === String(id);
          })[0];
        } catch (_) {}
        if (found && !isMine(found, identityFrom(root.currentUserProfile))) {
          try {
            if (typeof root.alert === 'function') {
              root.alert('This inspection is booked for another inspector.');
            }
          } catch (_) {}
          return;
        }
      }
      return current.apply(this, arguments);
    }
    wrapped.__fireSBookingOpen = true;
    root[name] = wrapped;
  }

  var SCHEDULE_FIELDS = [
    'scheduleOrganisationName',
    'scheduleSiteName',
    'scheduleDate',
    'scheduleOccupancy',
    'scheduleAddress',
    'scheduleContactPerson',
    'scheduleContactTel',
    'scheduleExistingPremisesSearch'
  ];

  function discardUnsavedSchedule() {
    var doc = root.document;
    if (!doc || !doc.getElementById) return;
    SCHEDULE_FIELDS.forEach(function (id) {
      var field = doc.getElementById(id);
      if (field) field.value = '';
    });
    var inspectorSelect = doc.getElementById('scheduleInspectorSelect');
    if (inspectorSelect) inspectorSelect.value = '';
    var premisesSelect = doc.getElementById('scheduleExistingPremisesSelect');
    if (premisesSelect) premisesSelect.value = '';
    var summary = doc.getElementById('scheduleExistingPremisesSummary');
    if (summary) {
      summary.hidden = true;
      summary.textContent = '';
    }
    var typeField = doc.getElementById('scheduleInspectionType');
    if (typeField) typeField.value = 'General Fire Inspection';
    try {
      if (typeof root.cancelScheduleNewInspection === 'function') {
        root.cancelScheduleNewInspection();
      }
    } catch (_) {}
  }

  function backFromSchedule(event) {
    if (event && event.preventDefault) event.preventDefault();
    discardUnsavedSchedule();
    try {
      if (root.document && root.document.body && root.document.body.classList) {
        root.document.body.classList.remove('fire-s-schedule-view');
      }
    } catch (_) {}
    var panel = byId('scheduleNewPanel');
    if (panel && panel.style) {
      try {
        panel.style.setProperty('display', 'none', 'important');
      } catch (_) {
        panel.style.display = 'none';
      }
    }
    var list = byId('projectListSection');
    if (list && list.style) list.style.display = 'none';
    try {
      if (typeof root.showHome === 'function') root.showHome();
    } catch (_) {}
    var home = byId('homeSection');
    if (home && home.style) home.style.display = 'block';
  }

  function bindScheduleBack() {
    var btn = byId('cancelScheduledInspectionBtn');
    if (!btn || btn.__fireSScheduleBack) return;
    btn.__fireSScheduleBack = true;
    btn.textContent = 'Back';
    btn.setAttribute('aria-label', 'Back to Home');
    btn.addEventListener('click', backFromSchedule);
  }

  function wrapPaint(name) {
    var current = root[name];
    if (typeof current !== 'function' || current.__fireSBookingPaint) return;
    function wrapped() {
      if (name === 'showHome' && bodyHas('fire-s-schedule-view')) {
        try {
          discardUnsavedSchedule();
        } catch (_) {}
      }
      var result = current.apply(this, arguments);
      try {
        paintBookedList();
      } catch (_) {}
      return result;
    }
    wrapped.__fireSBookingPaint = true;
    root[name] = wrapped;
  }

  function bind() {
    installVisibility();
    guardOpen('openProject');
    guardOpen('fireSOpenProjectCard');
    wrapPaint('showHome');
    wrapPaint('fireSApplyCleanHomeRoles');
    wrapPaint('refreshCleanHomeRoles');
    wrapPaint('renderHomeCommandCentre');
    wrapPaint('renderProjectsList');
    wrapPaint('fireSRefreshOwnerLists');
    wrapPaint('fireSKeepScheduleBookedCards');
    bindScheduleBack();
    try {
      paintBookedList();
    } catch (_) {}
  }

  root.fireSBookingVisibleProjects = visibleProjects;
  root.fireSBookingRoster = rosterRows;
  root.fireSBookingInspectorLabel = inspectorLabel;
  root.fireSIsFieldInspectorForBooking = isFieldInspector;
  root.fireSPaintBookedInspections = paintBookedList;
  root.fireSBackFromSchedule = backFromSchedule;

  if (root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', bind, { once: true });
    } else {
      bind();
    }
    setTimeout(bind, 0);
    setTimeout(bind, 500);
    setTimeout(bind, 1600);
  } else {
    bind();
  }
})(typeof window !== 'undefined' ? window : this);
