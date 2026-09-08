/* ============================================================
   Fire-S Owner building lists
   Home lists for Owner / Manager (not premises cards):
   - how many buildings are on the inspection list
   - name + last inspected
   - upcoming inspections in the next 30 days
   - buildings with deficiencies (No answers)
   Load AFTER app.js and fire-s-clean-home-roles.js.
   ============================================================ */
(function fireSOwnerLists(root) {
  'use strict';

  const LIST_ROLES = {
    company_owner: true,
    owner: true,
    manager: true,
    super_admin: true,
    viewer: true
  };

  const pullState = { loaded: 0, total: 0, loading: false, done: false };

  function applyPullProgress(loaded, total, done) {
    const nextLoaded = Math.max(0, Number(loaded) || 0);
    const nextDone = !!done;
    if (pullState.done && !nextDone) return;
    pullState.loaded = nextLoaded;
    pullState.done = nextDone;
    pullState.loading = !nextDone;
    pullState.total = 0;
    if (typeof root !== 'undefined') {
      root.__fireSOwnerListsPullProgress = {
        loaded: pullState.loaded,
        total: 0,
        loading: pullState.loading,
        done: pullState.done
      };
    }
    const countEl = byId('fireSOwnerListsCount');
    if (!countEl) return;
    writeCount(countEl, pullState.loaded);
  }

  function writeCount(countEl, visibleCount) {
    if (pullState.loading && !pullState.done) {
      const shown = Math.max(visibleCount || 0, pullState.loaded);
      if (shown <= 0) {
        countEl.textContent = 'Loading buildings…';
        return;
      }
      countEl.textContent = 'Loading buildings… ' + shown;
      return;
    }
    const n = visibleCount || 0;
    countEl.textContent = n
      ? n + (n === 1 ? ' building on your inspection list' : ' buildings on your inspection list')
      : 'No buildings on your inspection list yet.';
  }

  root.fireSSetOwnerListsPullProgress = applyPullProgress;

  function byId(id) {
    try {
      return root.document && root.document.getElementById(id);
    } catch (_) {
      return null;
    }
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function esc(value) {
    return text(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function dateKey(value) {
    const raw = text(value);
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(iso, days) {
    const key = dateKey(iso);
    if (!key) return '';
    const date = new Date(`${key}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + Number(days || 0));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function todayKey(now) {
    if (now) return dateKey(now);
    try {
      if (typeof root.getTodayDateString === 'function') {
        return dateKey(root.getTodayDateString());
      }
    } catch (_) {}
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDate(iso) {
    const key = dateKey(iso);
    if (!key) return 'Not inspected yet';
    const date = new Date(`${key}T00:00:00`);
    if (Number.isNaN(date.getTime())) return key;
    try {
      return date.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (_) {
      return key;
    }
  }

  function daysUntil(iso, today) {
    const due = dateKey(iso);
    const start = dateKey(today);
    if (!due || !start) return null;
    const dueDate = new Date(`${due}T00:00:00`);
    const startDate = new Date(`${start}T00:00:00`);
    if (Number.isNaN(dueDate.getTime()) || Number.isNaN(startDate.getTime())) return null;
    return Math.round((dueDate.getTime() - startDate.getTime()) / 86400000);
  }

  function buildingName(project) {
    try {
      if (typeof root.getProjectPremisesName === 'function' ||
          typeof root.getProjectPremisesSite === 'function') {
        const org = typeof root.getProjectPremisesName === 'function'
          ? text(root.getProjectPremisesName(project))
          : '';
        const site = typeof root.getProjectPremisesSite === 'function'
          ? text(root.getProjectPremisesSite(project))
          : '';
        if (org && site && org !== site) return `${org} – ${site}`;
        if (org) return org;
        if (site) return site;
      }
    } catch (_) {}
    const org = text(
      project && (
        project.organisationName ||
        project.organizationName ||
        project.businessName ||
        project.clientName ||
        project.premisesName ||
        (!project.siteName ? project.projectName : '')
      )
    );
    const site = text(project && (project.siteName || project.site_name || project.branchName));
    if (org && site && org !== site) return `${org} – ${site}`;
    return org || site || text(project && project.projectName) || 'Unnamed building';
  }

  function lastInspectedKey(project) {
    const historyDates = Array.isArray(project && project.inspectionHistory)
      ? project.inspectionHistory.map(item =>
          item && (item.completedAt || item.inspectionDate || item.archivedAt) || ''
        )
      : [];
    const dates = [
      project && project.completedAt,
      project && project.inspectionDate,
      ...historyDates
    ].map(dateKey).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : '';
  }

  function nextDueKey(project) {
    try {
      if (typeof root.fireSUltraNextInspectionDate === 'function') {
        const fromUltra = dateKey(root.fireSUltraNextInspectionDate(project));
        if (fromUltra) return fromUltra;
      }
    } catch (_) {}
    if (project && project.scheduledDate) return dateKey(project.scheduledDate);
    if (project && project.followUpDate) return dateKey(project.followUpDate);
    return '';
  }

  function isDeleted(project) {
    if (!project) return true;
    try {
      if (typeof root.fireSIsDeletedPremises === 'function') {
        return !!root.fireSIsDeletedPremises(project);
      }
    } catch (_) {}
    if (project.deletedAt || project.dataManagementDeletedAt) return true;
    const deleteType = text(project.deleteType).toLowerCase();
    if (deleteType === 'entire_premises' || deleteType === 'permanently_deleted') return true;
    const status = text(project.status || project.archiveStatus).toLowerCase();
    if (status === 'deleted' || status === 'permanently_deleted') return true;
    return false;
  }

  function isRecycleLeftover(project) {
    try {
      if (typeof root.fireSIsEmptyRecycleLeftoverPremises === 'function') {
        return !!root.fireSIsEmptyRecycleLeftoverPremises(project);
      }
    } catch (_) {}
    const bin = project && project.recycleBin;
    const recycled = !!(
      bin &&
      Array.isArray(bin.currentInspections) &&
      bin.currentInspections.length
    );
    if (!recycled) return false;
    const live = !!(
      (project && (project.currentInspectionId || project.inspectionId)) ||
      text(project && project.inspectionNumber) ||
      (Array.isArray(project && project.answers) && project.answers.length) ||
      (Array.isArray(project && project.photos) && project.photos.length)
    );
    const scheduled =
      text(project && project.scheduledStatus).toLowerCase() === 'scheduled' ||
      text(project && project.scheduleType).toLowerCase() === 'new_site' ||
      (project && project.scheduleFreshInspection === true);
    return !live && !scheduled;
  }

  function deficiencyCount(project) {
    try {
      if (typeof root.getProjectNoFindingCount === 'function') {
        return Number(root.getProjectNoFindingCount(project) || 0);
      }
    } catch (_) {}
    return (project && Array.isArray(project.answers) ? project.answers : []).filter(answer =>
      text(answer && answer.answer).toLowerCase() === 'no'
    ).length;
  }

  function compareName(a, b) {
    return text(a).localeCompare(text(b), undefined, { sensitivity: 'base' });
  }

  function buildModel(projects, today) {
    const todayIso = todayKey(today);
    const endIso = addDays(todayIso, 30);
    const active = (Array.isArray(projects) ? projects : []).filter(project =>
      !isDeleted(project) && !isRecycleLeftover(project)
    );

    const all = active
      .map(project => ({
        id: project && project.id,
        name: buildingName(project),
        lastInspected: lastInspectedKey(project)
      }))
      .sort((a, b) => compareName(a.name, b.name) || compareName(a.id, b.id));

    const upcoming = active
      .filter(project => {
        if (isRecycleLeftover(project)) return false;
        const due = nextDueKey(project);
        return !!(due && due >= todayIso && due <= endIso);
      })
      .map(project => {
        const due = nextDueKey(project);
        return {
          id: project && project.id,
          name: buildingName(project),
          due,
          days: daysUntil(due, todayIso)
        };
      })
      .sort((a, b) => compareName(a.due, b.due) || compareName(a.name, b.name));

    const deficiencies = active
      .map(project => ({
        id: project && project.id,
        name: buildingName(project),
        count: deficiencyCount(project)
      }))
      .filter(row => row.count > 0)
      .sort((a, b) => (b.count - a.count) || compareName(a.name, b.name));

    return {
      today: todayIso,
      until: endIso,
      count: all.length,
      all,
      upcoming,
      deficiencies
    };
  }

  function loadProjects() {
    let list = [];
    try {
      if (typeof root.getProjects === 'function') {
        list = root.getProjects() || [];
      }
    } catch (_) {
      list = [];
    }
    try {
      if (typeof root.getVisibleProjectsForCurrentUser === 'function') {
        list = root.getVisibleProjectsForCurrentUser(list) || list;
      }
    } catch (_) {}
    return Array.isArray(list) ? list : [];
  }

  function currentHomeRole() {
    try {
      if (typeof root.resolveFireSHomeRole === 'function') {
        return text(root.resolveFireSHomeRole()).toLowerCase();
      }
    } catch (_) {}
    try {
      return text(root.currentUserProfile && root.currentUserProfile.role).toLowerCase();
    } catch (_) {}
    return '';
  }

  function canShowLists() {
    const role = currentHomeRole();
    if (LIST_ROLES[role]) return true;
    try {
      const body = root.document && root.document.body;
      if (!body || !body.classList) return false;
      return (
        body.classList.contains('fire-s-role-owner') ||
        body.classList.contains('fire-s-role-manager') ||
        body.classList.contains('fire-s-role-viewer')
      );
    } catch (_) {
      return false;
    }
  }

  function hidePanel(panel) {
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.style.setProperty('display', 'none', 'important');
  }

  function showPanel(panel) {
    if (!panel) return;
    panel.hidden = false;
    panel.removeAttribute('aria-hidden');
    panel.style.setProperty('display', 'block', 'important');
  }

  function emptyRow(columns, message) {
    return `<tr class="fire-s-owner-lists-empty"><td colspan="${columns}">${esc(message)}</td></tr>`;
  }

  function rowHtml(projectId, cells) {
    const id = esc(projectId || '');
    const openLabel = id ? 'Open this building' : '';
    return `<tr class="fire-s-owner-lists-row"${id ? ` data-project-id="${id}" tabindex="0" role="button" aria-label="${esc(openLabel)}"` : ''}>${cells}</tr>`;
  }

  function daysLabel(days) {
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    if (typeof days === 'number') return `${days} days`;
    return '';
  }

  function renderModel(model) {
    const panel = byId('fireSOwnerLists');
    if (!panel) return;
    if (!canShowLists()) {
      hidePanel(panel);
      return;
    }

    const countEl = byId('fireSOwnerListsCount');
    const allBody = byId('fireSOwnerListsAllBody');
    const upcomingBody = byId('fireSOwnerListsUpcomingBody');
    const deficiencyBody = byId('fireSOwnerListsDeficiencyBody');

    if (root.__fireSOwnerListsPullProgress) {
      pullState.loaded = root.__fireSOwnerListsPullProgress.loaded || 0;
      pullState.total = root.__fireSOwnerListsPullProgress.total || 0;
      pullState.loading = !!root.__fireSOwnerListsPullProgress.loading;
      pullState.done = !!root.__fireSOwnerListsPullProgress.done;
    }

    if (countEl) {
      writeCount(countEl, model.count);
    }

    if (allBody) {
      allBody.innerHTML = model.all.length
        ? model.all.map(row => rowHtml(row.id, [
            `<td class="fire-s-owner-lists-name">${esc(row.name)}</td>`,
            `<td class="fire-s-owner-lists-meta">${esc(row.lastInspected ? formatDate(row.lastInspected) : 'Not inspected yet')}</td>`
          ].join(''))).join('')
        : emptyRow(2, 'No buildings on your inspection list yet.');
    }

    if (upcomingBody) {
      upcomingBody.innerHTML = model.upcoming.length
        ? model.upcoming.map(row => rowHtml(row.id, [
            `<td class="fire-s-owner-lists-name">${esc(row.name)}</td>`,
            `<td class="fire-s-owner-lists-meta"><span class="fire-s-owner-lists-date">${esc(formatDate(row.due))}</span><span class="fire-s-owner-lists-days">${esc(daysLabel(row.days))}</span></td>`
          ].join(''))).join('')
        : emptyRow(2, 'No inspections due in the next 30 days.');
    }

    if (deficiencyBody) {
      deficiencyBody.innerHTML = model.deficiencies.length
        ? model.deficiencies.map(row => rowHtml(row.id, [
            `<td class="fire-s-owner-lists-name">${esc(row.name)}</td>`,
            `<td class="fire-s-owner-lists-meta">${esc(String(row.count))}</td>`
          ].join(''))).join('')
        : emptyRow(2, 'No buildings with deficiencies.');
    }

    showPanel(panel);
  }

  function openBuilding(projectId) {
    const id = text(projectId);
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

  function bindPanel(panel) {
    if (!panel || panel.__fireSOwnerListsBound) return;
    panel.__fireSOwnerListsBound = true;
    panel.addEventListener('click', event => {
      const row = event.target && event.target.closest && event.target.closest('tr[data-project-id]');
      if (!row) return;
      event.preventDefault();
      openBuilding(row.getAttribute('data-project-id'));
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target && event.target.closest && event.target.closest('tr[data-project-id]');
      if (!row) return;
      event.preventDefault();
      openBuilding(row.getAttribute('data-project-id'));
    });
  }

  function refresh() {
    if (root.__fireSHomeCountsFrozen) return;
    const panel = byId('fireSOwnerLists');
    if (!panel) return;
    bindPanel(panel);
    if (!canShowLists()) {
      hidePanel(panel);
      return;
    }
    renderModel(buildModel(loadProjects(), todayKey()));
  }

  function wrapRefresh(name) {
    const original = root[name];
    if (typeof original !== 'function' || original.__fireSOwnerListsWrapped) return;
    const wrapped = function fireSOwnerListsAfter() {
      const result = original.apply(this, arguments);
      const after = function fireSOwnerListsAfterSync() {
        if (root.__fireSHomeCountsFrozen) return;
        try { refresh(); } catch (_) {}
        if (name !== 'setProjects' || wrapped.__fireSOwnerListsRefreshing) return;
        wrapped.__fireSOwnerListsRefreshing = true;
        try {
          if (typeof root.fireSProductionRenderKpis === 'function') {
            root.fireSProductionRenderKpis();
          }
        } catch (_) {}
        try {
          if (typeof root.renderHomeCommandCentre === 'function') {
            root.renderHomeCommandCentre();
          }
        } catch (_) {}
        wrapped.__fireSOwnerListsRefreshing = false;
      };
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).finally(after);
      } else {
        after();
      }
      return result;
    };
    wrapped.__fireSOwnerListsWrapped = true;
    root[name] = wrapped;
    try {
      if (name === 'setProjects') setProjects = wrapped;
    } catch (_) {}
  }

  function wrapRefreshTargets() {
    wrapRefresh('fireSApplyCleanHomeRoles');
    wrapRefresh('fireSProductionRenderKpis');
    wrapRefresh('renderHomeCommandCentre');
    wrapRefresh('setProjects');
  }

  root.fireSBuildOwnerListModel = buildModel;
  root.fireSOwnerListBuildingName = buildingName;
  root.fireSRefreshOwnerLists = refresh;

  wrapRefreshTargets();

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', refresh, { once: true });
  } else {
    try { refresh(); } catch (_) {}
  }
  [0, 250, 800, 1600, 3200, 5000].forEach(ms => {
    try {
      root.setTimeout(wrapRefreshTargets, ms);
    } catch (_) {}
  });
  [200, 800, 1600].forEach(ms => {
    try {
      root.setTimeout(refresh, ms);
    } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : this);
