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
      countEl.textContent = 'Loading buildings…';
      return;
    }
    const n = visibleCount || 0;
    countEl.textContent = n
      ? n + (n === 1 ? ' building on the company inspection list' : ' buildings on the company inspection list')
      : 'No buildings on the company inspection list yet.';
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
      if (typeof root.fireSIsHiddenFromCurrentLists === 'function') {
        return !!root.fireSIsHiddenFromCurrentLists(project);
      }
    } catch (_) {}
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
      if (typeof root.fireSIsHiddenFromCurrentLists === 'function') {
        return !!root.fireSIsHiddenFromCurrentLists(project);
      }
    } catch (_) {}
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

  function uniqueActive(projects) {
    const source = Array.isArray(projects) ? projects : [];
    try {
      if (typeof root.fireSFilterToCloudBuildings === 'function') {
        const unique = root.fireSFilterToCloudBuildings(source);
        if (Array.isArray(unique)) return unique;
      }
      if (typeof root.fireSUniqueCurrentBuildings === 'function') {
        const unique = root.fireSUniqueCurrentBuildings(source);
        if (Array.isArray(unique)) return unique;
      }
    } catch (_) {}
    const seen = Object.create(null);
    return source.filter(project => {
      if (!project || isDeleted(project) || isRecycleLeftover(project)) return false;
      const key = text(buildingName(project)).toLowerCase() || ('id:' + text(project.id));
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function companyCloudListReady() {
    try {
      if (root.__fireSCloudPullSettled !== true) return false;
      if (typeof root.fireSFilterToCloudBuildings !== 'function') return true;
      const filter = root.__fireSCloudBuildingFilter;
      return !!(filter && filter.ready === true);
    } catch (_) {
      return false;
    }
  }

  function buildModel(projects, today) {
    const todayIso = todayKey(today);
    const endIso = addDays(todayIso, 30);
    const active = uniqueActive(projects);

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

  function inspectionHomeLocked() {
    try {
      if (root.fireSEntitlement && typeof root.fireSEntitlement.homeWorkAllowed === 'function') {
        return root.fireSEntitlement.homeWorkAllowed() !== true;
      }
      return !!(
        root.fireSEntitlement &&
        typeof root.fireSEntitlement.inspectionAccessLocked === 'function' &&
        root.fireSEntitlement.inspectionAccessLocked()
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

  function rowHtml(projectId, cells, extraClass) {
    const id = esc(projectId || '');
    const openLabel = id ? 'Open this building' : '';
    const klass = extraClass ? ` fire-s-owner-lists-row ${esc(extraClass)}` : ' fire-s-owner-lists-row';
    return `<tr class="${klass.trim()}"${id ? ` data-project-id="${id}" tabindex="0" role="button" aria-label="${esc(openLabel)}"` : ''}>${cells}</tr>`;
  }

  let lastModel = null;

  function lookupNeedle() {
    return text(byId('fireSOwnerListsLookup') && byId('fireSOwnerListsLookup').value);
  }

  function nameMatchesLookup(name, needle) {
    const q = text(needle).toLowerCase();
    if (!q) return true;
    return text(name).toLowerCase().indexOf(q) !== -1;
  }

  function lookupScore(name, needle) {
    const n = text(name).toLowerCase();
    const q = text(needle).toLowerCase();
    if (!q || !n) return 99;
    if (n === q) return 0;
    if (n.indexOf(q) === 0) return 1;
    if (n.indexOf(q) !== -1) return 2;
    return 99;
  }

  function rankedLookupMatches(rows, needle) {
    const q = text(needle);
    if (!q) return [];
    return (rows || [])
      .filter(row => nameMatchesLookup(row && row.name, q))
      .map(row => ({
        id: row && row.id,
        name: row && row.name,
        lastInspected: row && row.lastInspected,
        score: lookupScore(row && row.name, q)
      }))
      .sort((a, b) => a.score - b.score || compareName(a.name, b.name) || compareName(a.id, b.id));
  }

  function pickLookupTarget(rows, needle, requireExact) {
    const ranked = rankedLookupMatches(rows, needle);
    if (!ranked.length) return null;
    const best = ranked[0];
    if (requireExact && best.score !== 0) return null;
    const same = ranked.filter(row => row.score === best.score);
    if (same.length !== 1) return null;
    return best;
  }

  function renderLookupMatches(matches, needle) {
    const host = byId('fireSOwnerListsLookupMatches');
    const hint = byId('fireSOwnerListsLookupHint');
    const q = text(needle);
    if (hint) {
      if (!q) {
        hint.textContent = 'Type a premises. All buildings jumps to that site. Enter or tap a match to open it.';
      } else if (!matches.length) {
        hint.textContent = 'No building matches “' + q + '”.';
      } else if (matches.length === 1) {
        hint.textContent = 'All buildings is on this premises. Enter or tap to open it.';
      } else {
        hint.textContent = matches.length + ' buildings match. Type more of the name, then Enter or tap one.';
      }
    }
    if (!host) return;
    if (!q || !matches.length) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.innerHTML = matches.slice(0, 8).map(row =>
      `<button type="button" class="fire-s-owner-lists-lookup-hit" data-project-id="${esc(row.id)}">${esc(row.name)}</button>`
    ).join('');
  }

  function renderAllRows(model) {
    const allBody = byId('fireSOwnerListsAllBody');
    if (!allBody || !model) return;
    const needle = lookupNeedle();
    const matches = needle ? rankedLookupMatches(model.all, needle) : [];
    const rows = needle ? matches : model.all;
    renderLookupMatches(matches, needle);
    if (!rows.length) {
      allBody.innerHTML = emptyRow(
        2,
        needle ? 'No building matches that lookup.' : 'No buildings on the company inspection list yet.'
      );
      return;
    }
    allBody.innerHTML = rows.map((row, index) => rowHtml(row.id, [
      `<td class="fire-s-owner-lists-name">${esc(row.name)}</td>`,
      `<td class="fire-s-owner-lists-meta">${esc(row.lastInspected ? formatDate(row.lastInspected) : 'Not inspected yet')}</td>`
    ].join(''), needle && index === 0 ? 'is-lookup-hit' : '')).join('');
    try {
      const first = allBody.querySelector && allBody.querySelector('tr[data-project-id]');
      if (needle && first && typeof first.scrollIntoView === 'function') {
        first.scrollIntoView({ block: 'nearest' });
      }
    } catch (_) {}
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
    const upcomingBody = byId('fireSOwnerListsUpcomingBody');
    const deficiencyBody = byId('fireSOwnerListsDeficiencyBody');

    if (root.__fireSOwnerListsPullProgress) {
      pullState.loaded = root.__fireSOwnerListsPullProgress.loaded || 0;
      pullState.total = root.__fireSOwnerListsPullProgress.total || 0;
      pullState.loading = !!root.__fireSOwnerListsPullProgress.loading;
      pullState.done = !!root.__fireSOwnerListsPullProgress.done;
    }
    if (root.__fireSCloudPullSettled === true && companyCloudListReady()) {
      pullState.loading = false;
      pullState.done = true;
    }

    if (countEl) {
      writeCount(countEl, model.count);
    }

    lastModel = model;
    renderAllRows(model);

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

  function applyLookup() {
    if (!lastModel) return;
    renderAllRows(lastModel);
  }

  function navigateLookup(force) {
    if (!lastModel) return null;
    const target = pickLookupTarget(lastModel.all, lookupNeedle(), !force);
    if (!target) {
      applyLookup();
      return null;
    }
    applyLookup();
    openBuilding(target.id);
    return target;
  }

  function bindLookup() {
    const input = byId('fireSOwnerListsLookup');
    if (!input || input.__fireSOwnerListsLookupBound) return;
    input.__fireSOwnerListsLookupBound = true;
    input.addEventListener('input', function fireSOwnerListsLookupInput() {
      applyLookup();
    });
    input.addEventListener('change', function fireSOwnerListsLookupChange() {
      navigateLookup(false);
    });
    input.addEventListener('keydown', function fireSOwnerListsLookupKey(event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      navigateLookup(true);
    });
  }

  function bindPanel(panel) {
    if (!panel || panel.__fireSOwnerListsBound) return;
    panel.__fireSOwnerListsBound = true;
    panel.addEventListener('click', event => {
      const row = event.target && event.target.closest && event.target.closest('[data-project-id]');
      if (!row) return;
      event.preventDefault();
      openBuilding(row.getAttribute('data-project-id'));
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target && event.target.id === 'fireSOwnerListsLookup') return;
      const row = event.target && event.target.closest && event.target.closest('[data-project-id]');
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
    bindLookup();
    if (inspectionHomeLocked() || !canShowLists()) {
      hidePanel(panel);
      return;
    }
    // Laptop leftover locals must not paint 7 while the phone still has the
    // company cloud's 5. Wait until that cloud building list is ready.
    if (!companyCloudListReady()) {
      pullState.loading = true;
      pullState.done = false;
      const countEl = byId('fireSOwnerListsCount');
      if (countEl) writeCount(countEl, pullState.loaded);
      showPanel(panel);
      return;
    }
    pullState.loading = false;
    pullState.done = true;
    renderModel(buildModel(loadProjects(), todayKey()));
  }

  function wrapRefresh(name) {
    const original = root[name];
    if (typeof original !== 'function' || original.__fireSOwnerListsWrapped) return;
    const wrapped = function fireSOwnerListsAfter() {
      const result = original.apply(this, arguments);
      const after = function fireSOwnerListsAfterSync() {
        if (root.__fireSHomeCountsFrozen) return;
        if (inspectionHomeLocked()) {
          try { refresh(); } catch (_) {}
          return;
        }
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
  root.fireSPickOwnerListLookupTarget = pickLookupTarget;
  root.fireSRankOwnerListLookupMatches = rankedLookupMatches;
  root.fireSApplyOwnerListLookup = applyLookup;
  root.fireSNavigateOwnerListLookup = navigateLookup;

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
