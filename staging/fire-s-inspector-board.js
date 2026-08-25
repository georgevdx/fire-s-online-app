/* ============================================================
   Fire-S Inspector Board (management)
   Load AFTER app.js and fire-s-clean-home-roles.js.
   - Select one inspector: stats + inspection status
   - All inspectors: collective team stats
   - Compare: how inspectors stack up against each other
   ============================================================ */
(function fireSInspectorBoard() {
  'use strict';

  const FILTER_KEY = 'fireS.inspectorBoardFilter';
  const MODE_KEY = 'fireS.inspectorBoardMode';

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value || '').trim();
  }

  function lower(value) {
    return text(value).toLowerCase();
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

  function isManagementRole() {
    try {
      const role = lower(
        (typeof window.resolveFireSHomeRole === 'function'
          ? window.resolveFireSHomeRole()
          : '') ||
          window.currentUserProfile?.role ||
          ''
      );
      return [
        'manager',
        'company_owner',
        'owner',
        'super_admin',
        'admin'
      ].includes(role);
    } catch (_) {
      return false;
    }
  }

  function visibleProjects() {
    let list = [];
    try {
      list = typeof getProjects === 'function' ? getProjects() : [];
    } catch (_) {
      list = [];
    }
    try {
      if (typeof getVisibleProjectsForCurrentUser === 'function' && window.currentUserProfile) {
        return getVisibleProjectsForCurrentUser(list) || [];
      }
    } catch (_) {}
    return Array.isArray(list) ? list : [];
  }

  function inspectorIdentity(project) {
    const assignedEmail = lower(
      project?.assignedInspectorEmail || project?.assigned_inspector_email || ''
    );
    const assignedId = text(
      project?.assignedInspectorUserId || project?.assigned_inspector_user_id || ''
    );
    const assignedName = text(project?.assignedInspectorName);
    const email = assignedEmail || lower(
      project?.createdByEmail ||
        project?.created_by_email ||
        project?.lastEditedByEmail ||
        ''
    );
    const userId = assignedId || text(
      project?.createdByUserId || project?.created_by_user_id || ''
    );
    const name = assignedName || text(project?.inspectorName);
    const key = email || userId || lower(name) || 'unknown';
    return {
      key,
      email,
      userId,
      name: name || email || 'Unknown inspector'
    };
  }

  function isCompleted(project) {
    return !!(
      project?.completedAt ||
      project?.archivedAt ||
      project?.isArchived ||
      lower(project?.status) === 'completed' ||
      lower(project?.inspectionStatus) === 'completed' ||
      lower(project?.archiveStatus) === 'completed'
    );
  }

  function isOverdue(project) {
    try {
      if (typeof hasProjectOverdueActions === 'function' && hasProjectOverdueActions(project)) {
        return true;
      }
    } catch (_) {}
    try {
      if (typeof isCommandCentreOverdue === 'function' && isCommandCentreOverdue(project)) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function needsAction(project) {
    try {
      if (typeof hasProjectOpenActionItems === 'function') {
        return hasProjectOpenActionItems(project);
      }
    } catch (_) {}
    return (project?.answers || []).some(
      answer => lower(answer?.answer) === 'no'
    );
  }

  function isThisMonth(project) {
    try {
      if (typeof projectMatchesThisMonth === 'function') {
        return projectMatchesThisMonth(project);
      }
    } catch (_) {}
    return false;
  }

  function inspectionStatus(project) {
    try {
      if (typeof getProjectInspectionStatus === 'function') {
        const status = getProjectInspectionStatus(project);
        if (status?.label) {
          const key = isOverdue(project)
            ? 'overdue'
            : lower(status.filter || status.label).replace(/[^a-z]+/g, '_');
          return {
            key,
            label: isOverdue(project) ? 'Overdue' : status.label,
            detail: status.detail || ''
          };
        }
      }
    } catch (_) {}
    if (isOverdue(project)) return { key: 'overdue', label: 'Overdue', detail: '' };
    if (isCompleted(project)) return { key: 'completed', label: 'Completed', detail: '' };
    const answers = (project?.answers || []).filter(answer =>
      ['yes', 'no', 'n/a'].includes(lower(answer?.answer))
    );
    if (!answers.length) return { key: 'draft', label: 'Draft', detail: 'Not started' };
    return { key: 'in_progress', label: 'In progress', detail: '' };
  }

  function siteName(project) {
    return (
      text(project?.siteName) ||
      text(project?.projectName) ||
      text(project?.organisationName) ||
      'Unnamed premises'
    );
  }

  function lastActivity(project) {
    return (
      project?.lastSaved ||
      project?.updatedAt ||
      project?.completedAt ||
      project?.inspectionDate ||
      project?.createdAt ||
      ''
    );
  }

  function computeStats(projects) {
    const list = Array.isArray(projects) ? projects : [];
    const stats = {
      total: list.length,
      draft: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      actionRequired: 0,
      thisMonth: 0,
      lastActivity: ''
    };
    list.forEach(project => {
      const status = inspectionStatus(project);
      const key = status.key;
      if (key === 'draft' || key === 'inspection_draft') stats.draft += 1;
      else if (key === 'overdue') stats.overdue += 1;
      else if (
        isCompleted(project) ||
        key === 'completed' ||
        key === 'clear_completed' ||
        key === 'inspection_complete'
      ) {
        stats.completed += 1;
      } else stats.inProgress += 1;
      if (needsAction(project)) stats.actionRequired += 1;
      if (isThisMonth(project)) stats.thisMonth += 1;
      const stamp = lastActivity(project);
      if (stamp && (!stats.lastActivity || String(stamp) > String(stats.lastActivity))) {
        stats.lastActivity = stamp;
      }
    });
    return stats;
  }

  function groupByInspector(projects, directory) {
    const groups = new Map();
    (directory || []).forEach(person => {
      if (!person?.key) return;
      groups.set(person.key, {
        key: person.key,
        email: person.email || '',
        name: person.name || person.email || 'Inspector',
        role: person.role || 'inspector',
        projects: []
      });
    });
    (projects || []).forEach(project => {
      const id = inspectorIdentity(project);
      if (!groups.has(id.key)) {
        groups.set(id.key, {
          key: id.key,
          email: id.email,
          name: id.name,
          role: 'inspector',
          projects: []
        });
      }
      const row = groups.get(id.key);
      row.projects.push(project);
      if (!row.email && id.email) row.email = id.email;
      if (row.name === 'Inspector' || row.name === 'Unknown inspector') {
        row.name = id.name || row.email || row.name;
      }
    });
    return [...groups.values()].sort((a, b) =>
      text(a.name).localeCompare(text(b.name))
    );
  }

  function compareInspectors(groups) {
    const rows = (groups || []).map(group => {
      const stats = computeStats(group.projects);
      return Object.assign({ name: group.name, email: group.email, key: group.key }, stats);
    });
    const withWork = rows.filter(row => row.total > 0);
    const avgCompleted = withWork.length
      ? withWork.reduce((sum, row) => sum + row.completed, 0) / withWork.length
      : 0;
    const avgOverdue = withWork.length
      ? withWork.reduce((sum, row) => sum + row.overdue, 0) / withWork.length
      : 0;
    return rows
      .map(row =>
        Object.assign({}, row, {
          vsCompleted: row.completed - avgCompleted,
          vsOverdue: row.overdue - avgOverdue
        })
      )
      .sort((a, b) => b.completed - a.completed || b.total - a.total || a.name.localeCompare(b.name));
  }

  window.fireSInspectorIdentity = inspectorIdentity;
  window.fireSComputeInspectorStats = computeStats;
  window.fireSGroupInspectors = groupByInspector;
  window.fireSCompareInspectors = compareInspectors;

  function storedFilter() {
    try {
      return localStorage.getItem(FILTER_KEY) || 'all';
    } catch (_) {
      return 'all';
    }
  }

  function storedMode() {
    try {
      return localStorage.getItem(MODE_KEY) || 'team';
    } catch (_) {
      return 'team';
    }
  }

  function setStoredFilter(value) {
    try {
      localStorage.setItem(FILTER_KEY, value || 'all');
    } catch (_) {}
  }

  function setStoredMode(value) {
    try {
      localStorage.setItem(MODE_KEY, value || 'team');
    } catch (_) {}
  }

  function formatStamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toLocaleDateString();
  }

  function projectsForFilter(filter, groups, allProjects) {
    if (!filter || filter === 'all') return allProjects;
    const group = groups.find(item => item.key === filter);
    return group ? group.projects : allProjects.filter(project => inspectorIdentity(project).key === filter);
  }

  function applyHomeKpis(stats) {
    const map = [
      ['cmdOpenFindings', stats.actionRequired],
      ['cmdOverdueItems', stats.overdue],
      ['cmdTotalInspections', stats.completed],
      ['cmdPhotoCount', stats.thisMonth]
    ];
    map.forEach(([id, value]) => {
      const el = byId(id);
      if (el) el.textContent = String(value);
    });
  }

  function renderHomeStatus(stats, label) {
    const line = byId('inspectorBoardHomeStatus');
    if (!line) return;
    line.textContent =
      `${label}: ${stats.total} inspections · ${stats.inProgress} in progress · ${stats.completed} completed · ${stats.overdue} overdue · ${stats.actionRequired} need action`;
  }

  function fillSelect(select, groups, selected) {
    if (!select) return;
    const current = selected || 'all';
    const options = ['<option value="all">All inspectors</option>']
      .concat(
        groups.map(
          group =>
            `<option value="${esc(group.key)}">${esc(group.name)}${
              group.email && group.email !== lower(group.name) ? ` · ${esc(group.email)}` : ''
            }</option>`
        )
      )
      .join('');
    select.innerHTML = options;
    select.value = groups.some(group => group.key === current) || current === 'all' ? current : 'all';
  }

  let directoryCache = [];

  async function loadDirectory() {
    const companyId = window.currentUserProfile?.companyId;
    const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!companyId || !client) return directoryCache;
    try {
      const members = await client
        .from('company_members')
        .select('user_id, role, status')
        .eq('company_id', companyId)
        .eq('status', 'active');
      const rows = Array.isArray(members?.data) ? members.data : [];
      const ids = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
      let profiles = [];
      if (ids.length) {
        const result = await client
          .from('profiles')
          .select('id, email, full_name')
          .in('id', ids);
        profiles = Array.isArray(result?.data) ? result.data : [];
      }
      const byIdMap = Object.fromEntries(profiles.map(row => [row.id, row]));
      directoryCache = rows
        .map(row => {
          const profile = byIdMap[row.user_id] || {};
          const email = lower(profile.email);
          const role =
            typeof window.fireSCanonicalTeamRole === 'function'
              ? window.fireSCanonicalTeamRole(email, row.role)
              : row.role;
          if (lower(role) !== 'inspector') return null;
          return {
            key: email || text(row.user_id),
            email,
            name: text(profile.full_name) || email || 'Inspector',
            role: 'inspector',
            userId: row.user_id
          };
        })
        .filter(Boolean);
    } catch (_) {}
    return directoryCache;
  }

  function renderKpiGrid(stats) {
    return `
      <div class="inspector-board-kpis">
        <div class="inspector-board-kpi"><strong>${stats.total}</strong><span>Inspections</span></div>
        <div class="inspector-board-kpi"><strong>${stats.inProgress}</strong><span>In progress</span></div>
        <div class="inspector-board-kpi"><strong>${stats.completed}</strong><span>Completed</span></div>
        <div class="inspector-board-kpi warning"><strong>${stats.overdue}</strong><span>Overdue</span></div>
        <div class="inspector-board-kpi attention"><strong>${stats.actionRequired}</strong><span>Need action</span></div>
        <div class="inspector-board-kpi"><strong>${stats.thisMonth}</strong><span>This month</span></div>
      </div>`;
  }

  function renderInspectionList(projects) {
    if (!projects.length) {
      return '<div class="inspector-board-empty">No inspections for this selection yet.</div>';
    }
    return `<div class="inspector-board-list">${projects
      .slice()
      .sort((a, b) => String(lastActivity(b)).localeCompare(String(lastActivity(a))))
      .map(project => {
        const status = inspectionStatus(project);
        const who = inspectorIdentity(project);
        return `<button type="button" class="inspector-board-item" data-open-inspection="${esc(project.id)}">
          <span class="inspector-board-item-status ${esc(status.key)}">${esc(status.label)}</span>
          <span class="inspector-board-item-title">${esc(siteName(project))}</span>
          <span class="inspector-board-item-meta">${esc(who.name)} · ${esc(formatStamp(lastActivity(project)))}${
            status.detail ? ` · ${esc(status.detail)}` : ''
          }</span>
        </button>`;
      })
      .join('')}</div>`;
  }

  function renderCompareTable(rows) {
    if (!rows.length) {
      return '<div class="inspector-board-empty">No inspectors to compare yet.</div>';
    }
    const maxCompleted = Math.max(...rows.map(row => row.completed), 1);
    return `<div class="inspector-board-table-wrap"><table class="inspector-board-table">
      <thead>
        <tr>
          <th>Inspector</th>
          <th>Total</th>
          <th>In progress</th>
          <th>Completed</th>
          <th>Overdue</th>
          <th>Need action</th>
          <th>This month</th>
          <th>vs team</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(row => {
            const vs =
              row.vsCompleted >= 0
                ? `+${row.vsCompleted.toFixed(1)} completed`
                : `${row.vsCompleted.toFixed(1)} completed`;
            const width = Math.round((row.completed / maxCompleted) * 100);
            return `<tr data-inspector-key="${esc(row.key)}">
              <td>
                <strong>${esc(row.name)}</strong>
                <div class="inspector-board-bar"><span style="width:${width}%"></span></div>
                <small>${esc(row.email || '')}</small>
              </td>
              <td>${row.total}</td>
              <td>${row.inProgress}</td>
              <td>${row.completed}</td>
              <td class="${row.overdue ? 'is-warn' : ''}">${row.overdue}</td>
              <td>${row.actionRequired}</td>
              <td>${row.thisMonth}</td>
              <td>${esc(vs)}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table></div>`;
  }

  function currentState() {
    const allProjects = visibleProjects();
    const groups = groupByInspector(allProjects, directoryCache);
    const filter = storedFilter();
    const mode = storedMode();
    const selected = filter === 'all' ? null : groups.find(group => group.key === filter);
    const scoped = projectsForFilter(filter, groups, allProjects);
    const stats = computeStats(scoped);
    const compareRows = compareInspectors(groups);
    const label =
      filter === 'all' || !selected ? 'All inspectors' : selected.name;
    return { allProjects, groups, filter, mode, selected, scoped, stats, compareRows, label };
  }

  function paintHome(state) {
    const bar = byId('inspectorBoardHomeBar');
    const select = byId('inspectorBoardHomeSelect');
    if (!isManagementRole()) {
      if (bar) {
        bar.hidden = true;
        bar.style.setProperty('display', 'none', 'important');
      }
      return;
    }
    if (bar) {
      bar.hidden = false;
      bar.removeAttribute('aria-hidden');
      bar.removeAttribute('tabindex');
      bar.style.removeProperty('display');
    }
    fillSelect(select, state.groups, state.filter);
    applyHomeKpis(state.stats);
    renderHomeStatus(state.stats, state.label);
  }

  function paintBoard(state) {
    const section = byId('inspectorBoardSection');
    if (!section || section.style.display === 'none') return;
    const title = byId('inspectorBoardTitle');
    const subtitle = byId('inspectorBoardSubtitle');
    const meta = byId('inspectorBoardMeta');
    const body = byId('inspectorBoardBody');
    const select = byId('inspectorBoardSelect');
    fillSelect(select, state.groups, state.filter);
    document.querySelectorAll('[data-inspector-mode]').forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('data-inspector-mode') === state.mode);
    });
    if (title) title.textContent = state.mode === 'compare' ? 'Inspector comparison' : state.label;
    if (subtitle) {
      subtitle.textContent =
        state.mode === 'compare'
          ? 'How inspectors compare on volume, completion and overdue work.'
          : state.filter === 'all'
            ? 'Collective inspection stats and status for the whole field team.'
            : 'Stats and inspection status for the selected inspector.';
    }
    if (meta) {
      meta.textContent = `${state.groups.length} inspector${state.groups.length === 1 ? '' : 's'} · last activity ${formatStamp(state.stats.lastActivity)}`;
    }
    if (body) {
      body.innerHTML =
        state.mode === 'compare'
          ? renderKpiGrid(computeStats(state.allProjects)) + renderCompareTable(state.compareRows)
          : renderKpiGrid(state.stats) + renderInspectionList(state.scoped);
      body.querySelectorAll('[data-open-inspection]').forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-open-inspection');
          try {
            if (typeof window.openProject === 'function') window.openProject(id);
            else if (typeof openProject === 'function') openProject(id);
          } catch (_) {}
        };
      });
      body.querySelectorAll('[data-inspector-key]').forEach(row => {
        row.onclick = () => {
          setStoredFilter(row.getAttribute('data-inspector-key'));
          setStoredMode('team');
          refresh();
        };
      });
    }
  }

  function refresh() {
    const state = currentState();
    paintHome(state);
    paintBoard(state);
  }

  function hideOtherSections() {
    [
      'homeSection',
      'servicesSection',
      'projectListSection',
      'projectFormSection',
      'findingsCentreSection',
      'testSamplesSection',
      'companyLetterheadSection',
      'companyTeamSection',
      'userManualSection',
      'fireSSubscribeSection',
      'managementDashboardSection'
    ].forEach(id => {
      const el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function openBoard(mode) {
    if (!isManagementRole()) return;
    if (mode) setStoredMode(mode);
    hideOtherSections();
    const section = byId('inspectorBoardSection');
    if (section) section.style.display = 'block';
    try {
      if (typeof window.updateFloatingBackButton === 'function') {
        window.updateFloatingBackButton();
      }
    } catch (_) {}
    refresh();
    loadDirectory().then(refresh);
  }

  function goHome() {
    const section = byId('inspectorBoardSection');
    if (section) section.style.display = 'none';
    try {
      if (typeof window.showHome === 'function') window.showHome();
      else if (typeof showHome === 'function') showHome();
    } catch (_) {}
    setTimeout(refresh, 50);
  }

  function bind() {
    const homeSelect = byId('inspectorBoardHomeSelect');
    if (homeSelect && !homeSelect.__fireSBoardBound) {
      homeSelect.__fireSBoardBound = true;
      homeSelect.addEventListener('change', () => {
        setStoredFilter(homeSelect.value || 'all');
        refresh();
      });
    }
    const boardSelect = byId('inspectorBoardSelect');
    if (boardSelect && !boardSelect.__fireSBoardBound) {
      boardSelect.__fireSBoardBound = true;
      boardSelect.addEventListener('change', () => {
        setStoredFilter(boardSelect.value || 'all');
        if (boardSelect.value !== 'all') setStoredMode('team');
        refresh();
      });
    }
    document.querySelectorAll('[data-inspector-mode]').forEach(btn => {
      if (btn.__fireSBoardBound) return;
      btn.__fireSBoardBound = true;
      btn.addEventListener('click', () => {
        setStoredMode(btn.getAttribute('data-inspector-mode') || 'team');
        refresh();
      });
    });
    const compareHome = byId('inspectorBoardCompareBtn');
    if (compareHome && !compareHome.__fireSBoardBound) {
      compareHome.__fireSBoardBound = true;
      compareHome.addEventListener('click', () => openBoard('compare'));
    }
    const openHome = byId('inspectorBoardOpenBtn');
    if (openHome && !openHome.__fireSBoardBound) {
      openHome.__fireSBoardBound = true;
      openHome.addEventListener('click', () => openBoard('team'));
    }
    const back = byId('inspectorBoardBackBtn');
    if (back && !back.__fireSBoardBound) {
      back.__fireSBoardBound = true;
      back.addEventListener('click', goHome);
    }
    const card = byId('cmdInspectorsBtn');
    if (card && !card.__fireSBoardBound) {
      card.__fireSBoardBound = true;
      card.addEventListener(
        'click',
        event => {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          openBoard(storedMode() === 'compare' ? 'compare' : 'team');
        },
        true
      );
    }
  }

  window.fireSOpenInspectorBoard = openBoard;
  window.fireSRefreshInspectorBoard = refresh;

  if (typeof window.showHome === 'function' && !window.showHome.__fireSInspectorBoard) {
    const previousShowHome = window.showHome;
    const wrappedHome = function fireSShowHomeFromInspectorBoard() {
      const section = byId('inspectorBoardSection');
      if (section) section.style.display = 'none';
      return previousShowHome.apply(this, arguments);
    };
    wrappedHome.__fireSInspectorBoard = true;
    window.showHome = wrappedHome;
  }

  const previousRender =
    typeof window.renderHomeCommandCentre === 'function'
      ? window.renderHomeCommandCentre
      : null;
  if (previousRender && !previousRender.__fireSInspectorBoard) {
    const wrapped = function fireSInspectorBoardHomeRender() {
      const result = previousRender.apply(this, arguments);
      try {
        refresh();
      } catch (_) {}
      return result;
    };
    wrapped.__fireSInspectorBoard = true;
    window.renderHomeCommandCentre = wrapped;
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    setTimeout(refresh, 200);
    loadDirectory().then(refresh);
  });
  bind();
})();
