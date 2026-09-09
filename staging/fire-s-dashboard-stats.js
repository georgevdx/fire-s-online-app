/* ============================================================
   Fire-S dashboard snapshot, server statistics, Gateway pages
   Load AFTER app.js.

   Root cause this module replaces:
   Home and Inspection Gateway counted local arrays while
   fetchCompanyInspectionsFromCloud downloaded full inspection_data
   in pages of 100. The inventory count:exact included deleted and
   Recycle leftover rows (e.g. 124). Visible premises after client
   filters climbed 86 → 110. Those were two different questions,
   painted as if they were the same total.

   Rules:
   - Database RPC is the source of truth.
   - localStorage snapshot is a speed cache, never authoritative.
   - Never paint a partial array length as a final total.
   - Gateway lists a page; search hits the database; open loads one row.
   ============================================================ */
(function fireSDashboardStats(root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'fireS.dashboardSnapshot.v1';
  const PAGE_SIZE = 25;
  const OWNER_LIST_CAP = 40;

  const api = {
    schemaVersion: SCHEMA_VERSION,
    pageSize: PAGE_SIZE,
    isDeletedPremise: isDeletedPremise,
    isRecycleLeftover: isRecycleLeftover,
    isActivePremise: isActivePremise,
    normalizeStats: normalizeStats,
    formatPremisesHeadline: formatPremisesHeadline,
    statsFromProjects: statsFromProjects,
    readSnapshot: readSnapshot,
    writeSnapshot: writeSnapshot,
    clearSnapshot: clearSnapshot,
    getCompanyDashboardStats: getCompanyDashboardStats,
    listCompanyPremises: listCompanyPremises,
    searchCompanyPremises: searchCompanyPremises,
    ensurePremiseLoaded: ensurePremiseLoaded,
    getState: getState,
    refresh: refreshDashboardStats,
    clearAll: clearAllForSession
  };

  let state = {
    companyId: '',
    stats: null,
    status: 'idle',
    source: '',
    fromCache: false,
    stale: false,
    error: '',
    lastVerifiedAt: '',
    inFlight: null,
    callCount: 0,
    lastDurationMs: 0
  };
  let gatewayToken = 0;
  let gatewayInFlightKey = '';
  let gatewayInFlight = null;
  let searchTimer = 0;
  let statsDebounce = 0;
  let installed = false;

  function text(value) {
    return String(value == null ? '' : value).trim();
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

  function isDev() {
    try {
      if (root.FIRE_S_ENV && root.FIRE_S_ENV.isStaging) return true;
      if (root.localStorage && root.localStorage.getItem('fireS.debugStats') === '1') return true;
    } catch (_) {}
    return false;
  }

  function diag(event, detail) {
    if (!isDev()) return;
    try {
      const safe = detail && typeof detail === 'object' ? Object.assign({}, detail) : { value: detail };
      delete safe.items;
      delete safe.inspection_data;
      delete safe.statsRaw;
      root.console.info('[Fire-S stats]', event, safe);
    } catch (_) {}
  }

  function currentCompanyId() {
    try {
      return text(root.currentUserProfile && root.currentUserProfile.companyId);
    } catch (_) {
      return '';
    }
  }

  function currentEmail() {
    try {
      return lower(root.currentUserProfile && root.currentUserProfile.email);
    } catch (_) {
      return '';
    }
  }

  function supabaseOk() {
    return !!(root.supabaseClient && root.supabaseClient.rpc && root.supabaseClient.from);
  }

  function isDeletedPremise(project) {
    if (!project) return true;
    try {
      if (typeof root.fireSIsDeletedPremises === 'function') {
        return !!root.fireSIsDeletedPremises(project);
      }
    } catch (_) {}
    if (project.deletedAt || project.dataManagementDeletedAt) return true;
    const deleteType = lower(project.deleteType);
    if (deleteType === 'entire_premises' || deleteType === 'permanently_deleted') return true;
    const status = lower(project.status || project.archiveStatus);
    return status === 'deleted' || status === 'permanently_deleted';
  }

  function isRecycleLeftover(project) {
    try {
      if (typeof root.fireSIsEmptyRecycleLeftoverPremises === 'function') {
        return !!root.fireSIsEmptyRecycleLeftoverPremises(project);
      }
    } catch (_) {}
    const bin = project && project.recycleBin;
    const recycled = !!(bin && Array.isArray(bin.currentInspections) && bin.currentInspections.length);
    if (!recycled) return false;
    const live = !!(
      (project && (project.currentInspectionId || project.inspectionId)) ||
      text(project && project.inspectionNumber) ||
      (Array.isArray(project && project.answers) && project.answers.length) ||
      (Array.isArray(project && project.photos) && project.photos.length)
    );
    const scheduled =
      lower(project && project.scheduledStatus) === 'scheduled' ||
      lower(project && project.scheduleType) === 'new_site' ||
      lower(project && project.scheduleType) === 'existing_site' ||
      !!(project && project.scheduleFreshInspection) ||
      (Array.isArray(project && project.inspectionHistory) && project.inspectionHistory.length);
    return !live && !scheduled;
  }

  function isActivePremise(project) {
    return !isDeletedPremise(project) && !isRecycleLeftover(project);
  }

  function asInt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeStats(raw, companyId) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      companyId: text(src.companyId || src.company_id || companyId),
      totalPremises: asInt(src.totalPremises != null ? src.totalPremises : src.total_premises),
      premisesInspected: asInt(src.premisesInspected != null ? src.premisesInspected : src.premises_inspected),
      totalInspections: asInt(src.totalInspections != null ? src.totalInspections : src.total_inspections),
      scheduledInspections: asInt(src.scheduledInspections != null ? src.scheduledInspections : src.scheduled_inspections),
      compliantPremises: asInt(src.compliantPremises != null ? src.compliantPremises : src.compliant_premises),
      premisesWithOpenActions: asInt(
        src.premisesWithOpenActions != null ? src.premisesWithOpenActions : src.premises_with_open_actions
      ),
      openActionItems: asInt(src.openActionItems != null ? src.openActionItems : src.open_action_items),
      overdueInspections: asInt(src.overdueInspections != null ? src.overdueInspections : src.overdue_inspections),
      inspectionsThisMonth: asInt(
        src.inspectionsThisMonth != null ? src.inspectionsThisMonth : src.inspections_this_month
      ),
      lastUpdated: text(src.lastUpdated || src.last_updated || src.lastVerifiedAt || '')
    };
  }

  function statsEqual(a, b) {
    if (!a || !b) return false;
    return [
      'totalPremises',
      'premisesInspected',
      'totalInspections',
      'scheduledInspections',
      'compliantPremises',
      'premisesWithOpenActions',
      'openActionItems',
      'overdueInspections',
      'inspectionsThisMonth'
    ].every(key => asInt(a[key]) === asInt(b[key]));
  }

  function formatPremisesHeadline(total, status) {
    if (status === 'loading') return 'Loading premises…';
    if (status === 'error') return 'Premises total unavailable';
    const n = asInt(total);
    if (n === 1) return 'Total premises: 1';
    return 'Total premises: ' + n;
  }

  function kpiMatches(project, filter) {
    const expiry = root.fireSMatchesEquipmentExpiryFilter
      ? root.fireSMatchesEquipmentExpiryFilter(project, filter)
      : null;
    if (expiry !== null && expiry !== undefined) return !!expiry;
    try {
      if (typeof root.fireSProductionKpiMatches === 'function') {
        return !!root.fireSProductionKpiMatches(project, filter);
      }
    } catch (_) {}
    return false;
  }

  function statsFromProjects(list) {
    const active = (Array.isArray(list) ? list : []).filter(isActivePremise);
    let openActionItems = 0;
    active.forEach(project => {
      const answers = Array.isArray(project && project.answers) ? project.answers : [];
      openActionItems += answers.filter(answer => lower(answer && (answer.answer || answer.value)) === 'no').length;
    });
    return normalizeStats({
      totalPremises: active.length,
      premisesInspected: active.filter(project =>
        !!(project.completedAt || project.inspectionDate ||
          (Array.isArray(project.inspectionHistory) && project.inspectionHistory.length))
      ).length,
      totalInspections: active.reduce((sum, project) => {
        const history = Array.isArray(project.inspectionHistory) ? project.inspectionHistory.length : 0;
        return sum + history + (project.completedAt || project.finalisedAt ? 1 : 0);
      }, 0),
      scheduledInspections: active.filter(project => kpiMatches(project, 'scheduled-new')).length,
      compliantPremises: active.filter(project => kpiMatches(project, 'compliant')).length,
      premisesWithOpenActions: active.filter(project => kpiMatches(project, 'inspection-attention')).length,
      openActionItems: openActionItems,
      overdueInspections: active.filter(project => kpiMatches(project, 'overdue')).length,
      inspectionsThisMonth: active.filter(project => kpiMatches(project, 'month')).length
    }, currentCompanyId());
  }

  function storageGet() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function storageSet(payload) {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function readSnapshot(companyId) {
    const id = text(companyId || currentCompanyId());
    const stored = storageGet();
    if (!stored || stored.schemaVersion !== SCHEMA_VERSION) return null;
    if (!id || text(stored.companyId) !== id) return null;
    if (!stored.stats) return null;
    return {
      companyId: id,
      stats: normalizeStats(stored.stats, id),
      lastVerifiedAt: text(stored.lastVerifiedAt),
      schemaVersion: SCHEMA_VERSION
    };
  }

  function writeSnapshot(companyId, stats) {
    const id = text(companyId || currentCompanyId());
    if (!id || !stats) return;
    storageSet({
      schemaVersion: SCHEMA_VERSION,
      companyId: id,
      lastVerifiedAt: new Date().toISOString(),
      stats: normalizeStats(stats, id)
    });
  }

  function clearSnapshot(companyId) {
    const id = text(companyId);
    const stored = storageGet();
    if (!stored) return;
    if (!id || text(stored.companyId) === id) {
      try { root.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }
  }

  function clearAllForSession() {
    clearSnapshot(state.companyId || currentCompanyId());
    state = {
      companyId: '',
      stats: null,
      status: 'idle',
      source: '',
      fromCache: false,
      stale: false,
      error: '',
      lastVerifiedAt: '',
      inFlight: null,
      callCount: state.callCount,
      lastDurationMs: 0
    };
    diag('cache-cleared', { reason: 'session' });
  }

  function getState() {
    return {
      companyId: state.companyId,
      stats: state.stats,
      status: state.status,
      source: state.source,
      fromCache: state.fromCache,
      stale: state.stale,
      error: state.error,
      lastVerifiedAt: state.lastVerifiedAt,
      callCount: state.callCount,
      lastDurationMs: state.lastDurationMs
    };
  }

  function rpcMissing(error) {
    const message = lower(error && (error.message || error.details || error.hint || error));
    return /could not find the function|pgrst202|404|does not exist|schema cache/i.test(message);
  }

  async function rpcCall(name, args) {
    if (!supabaseOk()) return { ok: false, missing: true, error: { message: 'No Supabase client' } };
    const started = Date.now();
    let result;
    try {
      result = await root.supabaseClient.rpc(name, args || {});
    } catch (error) {
      return { ok: false, missing: rpcMissing(error), error: error, durationMs: Date.now() - started };
    }
    const durationMs = Date.now() - started;
    if (result && result.error) {
      return {
        ok: false,
        missing: rpcMissing(result.error),
        error: result.error,
        durationMs: durationMs
      };
    }
    return { ok: true, data: result && result.data, durationMs: durationMs };
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
  }

  async function fetchStatsRpc(companyId) {
    const args = {};
    if (isUuid(companyId)) args.p_company_id = companyId;
    const res = await rpcCall('fire_s_company_dashboard_stats', args);
    if (!res.ok) return res;
    const payload = res.data && res.data.totalPremises == null && res.data[0] ? res.data[0] : res.data;
    return {
      ok: true,
      data: normalizeStats(payload, companyId),
      durationMs: res.durationMs,
      recordsReturned: 1
    };
  }

  function applyAccessFilter(query) {
    if (typeof root.applyInspectionAccessFilter === 'function') {
      const uid = root.currentUserProfile && root.currentUserProfile.id;
      return root.applyInspectionAccessFilter(query, uid);
    }
    const cid = currentCompanyId();
    if (cid) return query.eq('company_id', cid);
    return query;
  }

  async function fetchStatsByCompleteScan() {
    if (!supabaseOk()) return { ok: false, error: { message: 'No Supabase client' } };
    const started = Date.now();
    const rows = [];
    const page = 100;
    for (let offset = 0; offset < 4000; offset += page) {
      let query = root.supabaseClient
        .from('inspections')
        .select('id, company_id, inspection_data')
        .order('updated_at', { ascending: false })
        .range(offset, offset + page - 1);
      query = applyAccessFilter(query);
      const result = await query;
      if (result && result.error) {
        return { ok: false, error: result.error, durationMs: Date.now() - started };
      }
      const chunk = Array.isArray(result && result.data) ? result.data : [];
      chunk.forEach(row => {
        const project = row && row.inspection_data && typeof row.inspection_data === 'object'
          ? Object.assign({ id: row.id, companyId: row.company_id }, row.inspection_data)
          : row;
        rows.push(project);
      });
      if (chunk.length < page) break;
    }
    return {
      ok: true,
      data: statsFromProjects(rows),
      durationMs: Date.now() - started,
      recordsReturned: rows.length,
      fallback: true
    };
  }

  async function fetchAuthoritativeStats(companyId) {
    const rpc = await fetchStatsRpc(companyId);
    if (rpc.ok) {
      diag('stats-rpc', { durationMs: rpc.durationMs, totalPremises: rpc.data && rpc.data.totalPremises });
      return Object.assign({ source: 'rpc' }, rpc);
    }
    if (!rpc.missing) {
      diag('stats-rpc-failed', { durationMs: rpc.durationMs });
      return rpc;
    }
    diag('stats-rpc-missing', { fallback: 'complete-scan' });
    const scan = await fetchStatsByCompleteScan();
    if (scan.ok) scan.source = 'scan';
    return scan;
  }

  function publishState(next) {
    state = Object.assign({}, state, next);
    try {
      root.__fireSDashboardStatsState = getState();
    } catch (_) {}
    paintHome();
    try {
      if (typeof root.fireSProductionRenderKpis === 'function') root.fireSProductionRenderKpis();
    } catch (_) {}
    try {
      if (typeof root.fireSRefreshOwnerLists === 'function') root.fireSRefreshOwnerLists();
    } catch (_) {}
  }

  function authoritativeKpiCounts() {
    if (!state.stats) {
      if (state.status === 'error') return { unavailable: true };
      if (state.status === 'loading' || currentCompanyId()) return { pending: true };
      return null;
    }
    if (state.status === 'loading' && !state.fromCache) return { pending: true };
    if (state.status === 'error' && !state.stats) return { unavailable: true };
    return {
      compliant: state.stats.compliantPremises,
      scheduled: state.stats.scheduledInspections,
      overdue: state.stats.overdueInspections,
      month: state.stats.inspectionsThisMonth,
      action: state.stats.premisesWithOpenActions,
      totalPremises: state.stats.totalPremises,
      premisesInspected: state.stats.premisesInspected,
      stale: !!state.stale
    };
  }

  async function getCompanyDashboardStats(options) {
    const opts = options || {};
    const companyId = text(opts.companyId || currentCompanyId());
    if (!companyId) {
      publishState({ status: 'idle', stats: null, source: '', fromCache: false, error: 'No company' });
      return getState();
    }
    if (state.companyId && state.companyId !== companyId) {
      state.stats = null;
      state.fromCache = false;
    }

    const cached = readSnapshot(companyId);
    if (cached && cached.stats) {
      publishState({
        companyId: companyId,
        stats: cached.stats,
        status: 'loading',
        source: 'cache',
        fromCache: true,
        stale: false,
        error: '',
        lastVerifiedAt: cached.lastVerifiedAt
      });
      diag('cache-hit', { totalPremises: cached.stats.totalPremises });
    } else {
      publishState({
        companyId: companyId,
        stats: null,
        status: 'loading',
        source: '',
        fromCache: false,
        stale: false,
        error: ''
      });
      diag('cache-miss', { companyScoped: true });
    }

    if (state.inFlight && state.companyId === companyId && !opts.force) {
      return state.inFlight;
    }

    const request = (async function () {
      state.callCount += 1;
      const fetched = await fetchAuthoritativeStats(companyId);
      if (text(currentCompanyId()) !== companyId) {
        return getState();
      }
      if (fetched.ok && fetched.data) {
        const changed = !statsEqual(state.stats, fetched.data);
        writeSnapshot(companyId, fetched.data);
        publishState({
          companyId: companyId,
          stats: fetched.data,
          status: 'ready',
          source: fetched.source || 'rpc',
          fromCache: false,
          stale: false,
          error: '',
          lastVerifiedAt: fetched.data.lastUpdated || new Date().toISOString(),
          lastDurationMs: fetched.durationMs || 0
        });
        diag('stats-ready', {
          durationMs: fetched.durationMs,
          source: fetched.source,
          changed: changed,
          recordsReturned: fetched.recordsReturned || 1,
          totalPremises: fetched.data.totalPremises
        });
      } else if (state.stats) {
        publishState({
          status: 'error',
          stale: true,
          error: text(fetched.error && fetched.error.message) || 'Refresh failed',
          lastDurationMs: fetched.durationMs || 0
        });
        diag('stats-stale-cache', { durationMs: fetched.durationMs });
      } else {
        publishState({
          status: 'error',
          stats: null,
          error: text(fetched.error && fetched.error.message) || 'Statistics unavailable',
          lastDurationMs: fetched.durationMs || 0
        });
        diag('stats-unavailable', { durationMs: fetched.durationMs });
      }
      return getState();
    })();

    state.inFlight = request.finally(function () {
      if (state.inFlight === request) state.inFlight = null;
    });
    return state.inFlight;
  }

  function refreshDashboardStats(options) {
    return getCompanyDashboardStats(Object.assign({ force: false }, options || {}));
  }

  function scheduleStatsRefresh() {
    try { root.clearTimeout(statsDebounce); } catch (_) {}
    statsDebounce = root.setTimeout(function () {
      getCompanyDashboardStats({ reason: 'invalidate' }).catch(function () {});
    }, 400);
  }

  async function listCompanyPremises(options) {
    const opts = options || {};
    const companyId = text(opts.companyId || currentCompanyId());
    const search = text(opts.search);
    const filter = text(opts.filter || 'all') || 'all';
    const dateFrom = text(opts.dateFrom);
    const dateTo = text(opts.dateTo);
    const limit = Math.min(50, Math.max(1, asInt(opts.limit || PAGE_SIZE) || PAGE_SIZE));
    const offset = Math.max(0, asInt(opts.offset || 0));
    const sort = text(opts.sort || 'updated_desc') || 'updated_desc';
    const args = {
      p_search: search,
      p_filter: filter,
      p_limit: limit,
      p_offset: offset,
      p_sort: sort
    };
    if (isUuid(companyId)) args.p_company_id = companyId;
    if (opts.inspectorEmail) args.p_inspector_email = lower(opts.inspectorEmail);
    if (dateFrom) args.p_date_from = dateFrom;
    if (dateTo) args.p_date_to = dateTo;

    const rpc = await rpcCall('fire_s_list_company_premises', args);
    if (rpc.ok) {
      const payload = rpc.data && rpc.data.items ? rpc.data : (rpc.data && rpc.data[0]) || {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      diag('list-rpc', {
        durationMs: rpc.durationMs,
        recordsReturned: items.length,
        total: payload.total,
        filter: filter,
        dateFrom: dateFrom,
        dateTo: dateTo,
        searched: !!search
      });
      return {
        ok: true,
        source: 'rpc',
        total: asInt(payload.total),
        limit: limit,
        offset: offset,
        filter: payload.filter || filter,
        search: search,
        dateFrom: dateFrom,
        dateTo: dateTo,
        items: items.map(summaryToProject)
      };
    }
    if (!rpc.missing) return { ok: false, error: rpc.error, items: [], total: 0 };

    return listPremisesFallback({
      search: search,
      filter: filter,
      dateFrom: dateFrom,
      dateTo: dateTo,
      limit: limit,
      offset: offset,
      inspectorEmail: opts.inspectorEmail
    });
  }

  function summaryToProject(item) {
    if (!item) return null;
    if (item.answers || item.inspectionHistory) return item;
    const name = text(item.organisationName || item.projectName || item.name);
    const site = text(item.siteName);
    return {
      id: item.id,
      organisationName: name,
      projectName: text(item.projectName) || name,
      siteName: site,
      projectAddress: text(item.projectAddress || item.address),
      inspectionNumber: text(item.inspectionNumber),
      scheduledDate: text(item.scheduledDate),
      completedAt: text(item.completedAt),
      inspectionDate: text(item.inspectionDate),
      openActionCount: asInt(item.openActionCount),
      photos: new Array(asInt(item.photoCount)).fill(null),
      overdue: !!item.overdue,
      scheduledStatus: item.scheduled ? 'scheduled' : '',
      _fireSSummaryOnly: true
    };
  }

  function listPremisesFallback(opts) {
    let list = [];
    try {
      list = typeof root.getProjects === 'function' ? root.getProjects() : [];
    } catch (_) {
      list = [];
    }
    try {
      if (typeof root.getVisibleProjectsForCurrentUser === 'function') {
        list = root.getVisibleProjectsForCurrentUser(list) || list;
      }
    } catch (_) {}
    list = (Array.isArray(list) ? list : []).filter(isActivePremise);
    const search = lower(opts.search);
    const filter = lower(opts.filter || 'all');
    const email = lower(opts.inspectorEmail);
    const dateFrom = text(opts.dateFrom);
    const dateTo = text(opts.dateTo);
    const filtered = list.filter(project => {
      if (search) {
        const haystack = [
          project.projectName, project.organisationName, project.siteName,
          project.projectAddress, project.addressLine, project.inspectionNumber,
          project.inspectorName, project.contactPerson, project.contactTel,
          project.contactEmail, project.gps
        ].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }
      if (dateFrom || dateTo) {
        if (typeof root.projectMatchesInspectionDateFilter === 'function') {
          if (!root.projectMatchesInspectionDateFilter(project)) return false;
        } else {
          const d = text(project.inspectionDate || project.completedAt || project.lastSaved).slice(0, 10);
          if (!d) return false;
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
        }
      }
      if (filter === 'all' || filter === 'gateway') return true;
      if (filter === 'scheduled-priority') {
        const assigned = lower(project.assignedInspectorEmail || project.createdByEmail);
        const mine = !email || assigned === email;
        return mine && kpiMatches(project, 'scheduled-new');
      }
      return kpiMatches(project, filter);
    });
    const offset = opts.offset || 0;
    const limit = opts.limit || PAGE_SIZE;
    return {
      ok: true,
      source: 'local-complete-only',
      total: filtered.length,
      limit: limit,
      offset: offset,
      filter: filter,
      search: opts.search || '',
      items: filtered.slice(offset, offset + limit),
      partial: false
    };
  }

  function searchCompanyPremises(options) {
    return listCompanyPremises(options);
  }

  function mergePremiseIntoProjects(project) {
    if (!project || !project.id) return project;
    let list = [];
    try {
      list = typeof root.getProjects === 'function' ? root.getProjects() : [];
    } catch (_) {
      list = [];
    }
    if (!Array.isArray(list)) list = [];
    const index = list.findIndex(row => String(row && row.id) === String(project.id));
    if (index === -1) list.push(project);
    else list[index] = Object.assign({}, list[index], project, { _fireSSummaryOnly: false });
    try {
      if (typeof root.setProjects === 'function') root.setProjects(list);
    } catch (_) {}
    return project;
  }

  async function ensurePremiseLoaded(projectId) {
    const id = text(projectId);
    if (!id) return null;
    let existing = null;
    try {
      if (typeof root.resolveProjectOpenIdentifier === 'function') {
        existing = root.resolveProjectOpenIdentifier(id);
      }
    } catch (_) {}
    if (!existing) {
      try {
        const list = typeof root.getProjects === 'function' ? root.getProjects() : [];
        existing = (Array.isArray(list) ? list : []).find(row => String(row && row.id) === id) || null;
      } catch (_) {}
    }
    if (existing && !existing._fireSSummaryOnly) return existing;

    const rpc = await rpcCall('fire_s_get_company_premise', { p_id: id });
    if (rpc.ok && rpc.data) {
      const row = rpc.data.inspection_data ? rpc.data : (rpc.data[0] || rpc.data);
      const data = row && row.inspection_data ? row.inspection_data : row;
      if (data && typeof data === 'object') {
        const project = Object.assign({ id: row.id || id }, data, {
          id: row.id || data.id || id,
          companyId: row.company_id || data.companyId
        });
        diag('premise-loaded', { durationMs: rpc.durationMs, recordsReturned: 1 });
        return mergePremiseIntoProjects(project);
      }
    }

    if (supabaseOk()) {
      try {
        let query = root.supabaseClient
          .from('inspections')
          .select('id, company_id, updated_at, inspection_data')
          .eq('id', id)
          .maybeSingle();
        query = applyAccessFilter(query);
        const result = await query;
        const row = result && result.data;
        if (row && row.inspection_data) {
          const project = Object.assign({ id: row.id, companyId: row.company_id }, row.inspection_data);
          return mergePremiseIntoProjects(project);
        }
      } catch (_) {}
    }
    return existing || null;
  }

  function paintKpiSkeleton(row) {
    const html = ['compliant', 'scheduled', 'overdue', 'month'].map(function (type, index) {
      const titles = ['Compliant Sites', 'Scheduled Inspections', 'Overdue Inspections', 'Inspections This Month'];
      const icons = ['✅', '🗓️', '⚠️', '📆'];
      return `<button type="button" class="fs-prod-kpi-card fs-prod-kpi-${type} fs-prod-kpi-loading" disabled>
        <span class="fs-prod-kpi-icon">${icons[index]}</span>
        <span class="fs-prod-kpi-number fs-prod-kpi-skeleton">…</span>
        <span class="fs-prod-kpi-title">${titles[index]}</span>
        <span class="fs-prod-kpi-action">Loading</span>
      </button>`;
    }).join('');
    row.classList.add('fs-prod-kpi-row', 'fire-s-owner-kpi-row');
    row.setAttribute('data-fire-s-prod-kpis', 'skeleton');
    row.innerHTML = html;
    row.hidden = false;
    row.style.setProperty('display', 'grid', 'important');
  }

  function paintKpiError(row) {
    row.setAttribute('data-fire-s-prod-kpis', 'error');
    row.innerHTML = `<div class="fs-prod-kpi-unavailable">Dashboard statistics are unavailable. Fire-S will not guess a total.</div>`;
    row.hidden = false;
    row.style.setProperty('display', 'block', 'important');
  }

  function paintHome() {
    const countEl = root.document && root.document.getElementById('fireSOwnerListsCount');
    const row = root.document && root.document.getElementById('fireSOwnerKpiRow');
    const subtitle = root.document && (root.document.getElementById('mainCommandSubtitle') ||
      root.document.querySelector('.main-command-top p'));

    if (countEl) {
      if (state.status === 'loading' && !state.stats) {
        countEl.textContent = formatPremisesHeadline(0, 'loading');
        countEl.setAttribute('data-fire-s-count-state', 'loading');
      } else if (state.status === 'error' && !state.stats) {
        countEl.textContent = formatPremisesHeadline(0, 'error');
        countEl.setAttribute('data-fire-s-count-state', 'error');
      } else if (state.stats) {
        const inspected = asInt(state.stats.premisesInspected);
        const total = asInt(state.stats.totalPremises);
        countEl.textContent = formatPremisesHeadline(total, 'ready') +
          (total ? ` · Premises inspected: ${inspected}` : '');
        countEl.setAttribute('data-fire-s-count-state', state.stale ? 'stale' : 'ready');
        if (state.stale) countEl.setAttribute('title', 'Last confirmed total. Live refresh could not be confirmed.');
        else countEl.removeAttribute('title');
      }
    }

    if (row && state.status === 'loading' && !state.stats) {
      paintKpiSkeleton(row);
    } else if (row && state.status === 'error' && !state.stats) {
      paintKpiError(row);
    }

    if (subtitle && state.stats && /premises require action|overdue|scheduled|compliant|this month|loading/i.test(subtitle.textContent || '')) {
      const s = state.stats;
      subtitle.textContent =
        `${s.premisesWithOpenActions} premises require action · ${s.overdueInspections} overdue · ${s.scheduledInspections} scheduled · ${s.compliantPremises} compliant · ${s.inspectionsThisMonth} this month.`;
      if (state.stale) subtitle.textContent += ' Last confirmed totals shown.';
    }
  }

  function gatewayOpen() {
    const list = root.document && root.document.getElementById('projectListSection');
    const form = root.document && root.document.getElementById('projectFormSection');
    if (!list) return false;
    try {
      const style = root.getComputedStyle(list);
      if (style.display === 'none' || list.hidden) return false;
    } catch (_) {
      if (list.style && list.style.display === 'none') return false;
    }
    if (form) {
      try {
        if (root.getComputedStyle(form).display !== 'none' && !form.hidden) return false;
      } catch (_) {}
    }
    return true;
  }

  function activeGatewayFilter() {
    return text(
      root.__fireS136A11ActiveFilter ||
      root.__fireSAuthoritativeFilter ||
      root.currentFilter ||
      'all'
    ) || 'all';
  }

  function currentSearchText() {
    const field = root.document && root.document.getElementById('projectSearch');
    return text(field && field.value);
  }

  function statusLabel(project) {
    if (project && project.overdue) return 'OVERDUE';
    if (project && (project.scheduledStatus === 'scheduled' || project.scheduled)) return 'SCHEDULED';
    if (asInt(project && project.openActionCount) > 0) return 'ACTION';
    if (project && (project.compliant || project.completedAt)) return 'COMPLIANT';
    return 'NOT ASSESSED';
  }

  function statusClass(project) {
    const label = statusLabel(project);
    if (label === 'OVERDUE') return 'overdue';
    if (label === 'SCHEDULED') return 'scheduled';
    if (label === 'ACTION') return 'action';
    if (label === 'COMPLIANT') return 'compliant';
    return 'neutral';
  }

  function titleOf(project) {
    const org = text(project && (project.organisationName || project.projectName));
    const site = text(project && project.siteName);
    if (org && site && org !== site) return org + ' – ' + site;
    return org || site || 'Unnamed premises';
  }

  function cardHtml(project) {
    const id = JSON.stringify(project && project.id || '');
    const actions = asInt(project && (project.openActionCount != null ? project.openActionCount : (
      Array.isArray(project && project.answers)
        ? project.answers.filter(a => lower(a && a.answer) === 'no').length
        : 0
    )));
    const photos = Array.isArray(project && project.photos) ? project.photos.length : asInt(project && project.photoCount);
    const last = text(project && (project.inspectionDate || project.completedAt)) || 'Not set';
    const next = text(project && project.scheduledDate) || 'Not set';
    const address = text(project && (project.projectAddress || project.addressLine));
    return `<article class="fire-s-136a8-card ${statusClass(project)}" data-project-id="${esc(project && project.id || '')}" role="button" tabindex="0" onclick='fireSOpenProjectCard136A8(${id})' onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();fireSOpenProjectCard136A8(${id});}'><div class="fire-s-136a8-strip"></div><div class="fire-s-136a8-card-body"><div class="fire-s-136a8-card-top"><strong>${esc(titleOf(project))}</strong><span>${esc(statusLabel(project))}</span></div>${address ? `<p>${esc(address)}</p>` : ''}<div class="fire-s-136a8-card-meta"><div><small>Last</small><b>${esc(last)}</b></div><div><small>Next</small><b>${esc(next)}</b></div><div><small>Actions</small><b>${actions}</b></div><div><small>Photos</small><b>${photos}</b></div></div><div class="fire-s-136a8-open">Open →</div></div></article>`;
  }

  const FILTER_LABELS = {
    all: 'All',
    'inspection-attention': 'Action Required',
    compliant: 'Compliant',
    'scheduled-new': 'Scheduled',
    overdue: 'Overdue',
    month: 'This Month',
    'expiry-overdue': 'Expired Equipment',
    'expiry-soon': 'Equipment Due Soon',
    'expiry-scheduled': 'Valid Equipment',
    'expiry-missing': 'Equipment Date Missing'
  };

  function filterButtonHtml(stats, active, exclusive) {
    const s = stats || {};
    const items = [
      ['all', s.totalPremises, 'All'],
      ['inspection-attention', s.premisesWithOpenActions, 'Action Required'],
      ['compliant', s.compliantPremises, 'Compliant'],
      ['scheduled-new', s.scheduledInspections, 'Scheduled'],
      ['overdue', s.overdueInspections, 'Overdue'],
      ['month', s.inspectionsThisMonth, 'This Month']
    ];
    const shown = exclusive ? items.filter(function (row) { return row[0] === active; }) : items;
    return `<div class="fire-s-136a8-filter-grid fire-s-136a11-filter-grid${exclusive ? ' is-exclusive' : ''}" aria-label="Mission Control KPI filters">${shown.map(function (row) {
      const key = row[0];
      const n = row[1];
      const label = row[2];
      const count = n == null ? '…' : asInt(n);
      return `<button type="button" class="fire-s-136a8-filter ${active === key ? 'active' : ''}" data-filter="${esc(key)}" onclick="fireSApplyMissionFilter136A11('${esc(key)}')"><strong>${count}</strong><span>${esc(label)}</span></button>`;
    }).join('')}</div>`;
  }

  function currentDateRange() {
    const fromEl = root.document && root.document.getElementById('inspectionDateFrom');
    const toEl = root.document && root.document.getElementById('inspectionDateTo');
    return {
      from: text(fromEl && fromEl.value),
      to: text(toEl && toEl.value)
    };
  }

  function dateRangeNote(from, to) {
    if (!from && !to) return '';
    if (from && to) {
      return `<div class="fire-s-136a8-result-note">Inspection dates ${esc(from)} to ${esc(to)}.</div>`;
    }
    if (from) return `<div class="fire-s-136a8-result-note">Inspection dates from ${esc(from)}.</div>`;
    return `<div class="fire-s-136a8-result-note">Inspection dates up to ${esc(to)}.</div>`;
  }

  function exclusiveFilterChrome(stats, filter, search, total) {
    const key = text(filter || 'all') || 'all';
    const q = text(search);
    const range = currentDateRange();
    const n = total == null ? null : asInt(total);
    const countBit = n == null ? '' : (' · ' + n + ' matching card' + (n === 1 ? '' : 's'));
    const dateBit = dateRangeNote(range.from, range.to);
    if (key !== 'all') {
      const label = FILTER_LABELS[key] || key;
      const searchBit = q
        ? `<div class="fire-s-136a8-result-note">Search within ${esc(label)}: “${esc(q)}”.</div>`
        : '';
      return (
        `<div id="fireSCurrentKpiFilterBanner" class="fire-s-current-kpi-filter-banner fire-s-136a8-banner">` +
        `<div><strong>Current filter</strong><span>${esc(label)}${esc(countBit)}</span></div>` +
        `<button type="button" onclick="fireSApplyMissionFilter136A11('all')">Clear filter</button></div>` +
        filterButtonHtml(stats, key, true) +
        searchBit +
        dateBit
      );
    }
    if (q) {
      return (
        `<div id="fireSCurrentKpiFilterBanner" class="fire-s-current-kpi-filter-banner fire-s-136a8-banner">` +
        `<div><strong>Current filter</strong><span>Search “${esc(q)}”${esc(countBit)}</span></div>` +
        `<button type="button" onclick="fireSApplyMissionFilter136A11('all')">Clear filter</button></div>` +
        dateBit
      );
    }
    if (dateBit) {
      return (
        `<div id="fireSCurrentKpiFilterBanner" class="fire-s-current-kpi-filter-banner fire-s-136a8-banner">` +
        `<div><strong>Current filter</strong><span>Inspection dates${esc(countBit)}</span></div>` +
        `<button type="button" onclick="applyInspectionQuickDateFilter('all')">Clear dates</button></div>` +
        filterButtonHtml(stats, key, false) +
        dateBit
      );
    }
    return filterButtonHtml(stats, key, false);
  }

  function competingGatewayFiltersOff() {
    try {
      if (typeof root.closeFilterPanel === 'function') root.closeFilterPanel();
    } catch (_) {}
    // Inspection date and equipment expiry stay as sub-filters.
  }

  function clearGatewaySearchBox() {
    try {
      const field = root.document && root.document.getElementById('projectSearch');
      if (field) field.value = '';
    } catch (_) {}
  }

  function syncExclusiveGatewayClass(filter, search) {
    const on = (text(filter) && text(filter) !== 'all') || !!text(search);
    try {
      if (root.document && root.document.body) {
        root.document.body.classList.toggle('fire-s-exclusive-gateway-filter', on);
      }
    } catch (_) {}
  }

  async function renderServerGateway() {
    if (!gatewayOpen()) return false;
    if (!currentCompanyId()) return false;
    const filter = activeGatewayFilter();
    const search = currentSearchText();
    const range = currentDateRange();
    const page = Math.max(1, asInt(root.currentProjectPage || 1) || 1);
    const key = [filter, search, range.from, range.to, page, currentCompanyId()].join('|');
    if (gatewayInFlight && gatewayInFlightKey === key) return gatewayInFlight;
    const token = ++gatewayToken;
    gatewayInFlightKey = key;
    const run = renderServerGatewayOnce(token, filter, search, page);
    gatewayInFlight = run.finally(function () {
      if (gatewayInFlightKey === key) gatewayInFlight = null;
    });
    return gatewayInFlight;
  }

  async function renderServerGatewayOnce(token, filter, search, page) {
    const container = root.document.getElementById('projectsList');
    const paging = root.document.getElementById('projectPagingControls');
    if (!container) return false;
    const offset = (page - 1) * PAGE_SIZE;

    syncExclusiveGatewayClass(filter, search);
    if (!container.dataset.fireSGatewayPaint) {
      container.innerHTML = `${exclusiveFilterChrome(state.stats, filter, search, null)}<div class="empty-state">Loading premises…</div>`;
    }

    const pageData = await listCompanyPremises({
      search: search,
      filter: filter,
      dateFrom: currentDateRange().from,
      dateTo: currentDateRange().to,
      limit: PAGE_SIZE,
      offset: offset
    });
    if (token !== gatewayToken) return true;
    if (!pageData.ok) return false;

    const total = asInt(pageData.total);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    if (safePage !== page) {
      root.currentProjectPage = safePage;
      return renderServerGateway();
    }
    const start = total === 0 ? 0 : offset + 1;
    const end = Math.min(offset + pageData.items.length, total);
    root.currentProjectsListView = pageData.items;
    root.__fireSGatewayServerPage = pageData;

    const nextPaging =
      `<button type="button" onclick="previousProjectPage()" ${safePage <= 1 ? 'disabled' : ''}>Previous</button>` +
      `<span>Showing ${total === 0 ? 0 : start}–${end} of ${total}</span>` +
      `<button type="button" onclick="nextProjectPage()" ${safePage >= totalPages ? 'disabled' : ''}>Next</button>`;
    if (paging && paging.innerHTML !== nextPaging) paging.innerHTML = nextPaging;

    const chrome = exclusiveFilterChrome(state.stats, filter, search, total);
    const cards = pageData.items.length
      ? `<div id="projectListView" class="fire-s-136a8-card-list">${pageData.items.map(cardHtml).join('')}</div>`
      : '<div class="empty-state">No matching premises found.</div>';
    container.innerHTML = `${chrome}${cards}<div id="projectSummaryDetailCard" class="project-summary-detail-card" style="display:none;"></div>`;
    container.dataset.fireSGatewayPaint = [filter, search, currentDateRange().from, currentDateRange().to, safePage, total, pageData.items.map(p => p && p.id).join('|')].join('::');
    diag('gateway-page', {
      durationMs: state.lastDurationMs,
      recordsReturned: pageData.items.length,
      total: total,
      source: pageData.source
    });
    return true;
  }

  function wrapGatewayRenderer() {
    const previous = root.renderProjectsList;
    if (typeof previous !== 'function' || previous.__fireSDashboardStatsGateway) return;
    const wrapped = function fireSRenderProjectsListFromServer() {
      const args = arguments;
      const self = this;
      if (!navigator.onLine || !currentCompanyId()) {
        return previous.apply(self, args);
      }
      renderServerGateway().then(function (handled) {
        if (!handled) previous.apply(self, args);
      }).catch(function () {
        previous.apply(self, args);
      });
    };
    wrapped.__fireSDashboardStatsGateway = true;
    root.renderProjectsList = wrapped;
    try { if (typeof renderProjectsList !== 'undefined') renderProjectsList = wrapped; } catch (_) {}

    function applyServerFilter(filter, alreadyInProjects) {
      const key = text(filter || 'all') || 'all';
        if (key === 'all') {
          competingGatewayFiltersOff();
          clearGatewaySearchBox();
          try { root.__fireSGatewayFiltersCleared = true; } catch (_) {}
        } else {
          competingGatewayFiltersOff();
          const previous = text(root.currentFilter || root.__fireSAuthoritativeFilter || 'all') || 'all';
          if (key !== previous) clearGatewaySearchBox();
          try { root.__fireSGatewayFiltersCleared = false; } catch (_) {}
        }
      try {
        root.__fireS136A11ActiveFilter = key;
        root.__fireS136A8ActiveFilter = key;
        root.__fireSAuthoritativeFilter = key;
        root.__fireSAuthoritativeKpiFilter = key;
        root.__fireSActiveKpiFilter = key;
        root.__fireSPendingKpiFilter = key;
        root.currentFilter = key;
        root.currentProjectPage = 1;
      } catch (_) {}
      syncExclusiveGatewayClass(key, key === 'all' ? '' : currentSearchText());
      if (!alreadyInProjects) {
        try {
          if (typeof root.showProjectList === 'function') root.showProjectList();
        } catch (_) {}
      }
      if (!navigator.onLine || !currentCompanyId()) {
        if (typeof previous === 'function') return previous.call(root);
        return;
      }
      return renderServerGateway();
    }
    root.fireSApplyMissionFilter136A11 = applyServerFilter;
    root.fireSApplyMissionFilter136A8 = applyServerFilter;
    root.fireSApplyMissionFilter136A6 = applyServerFilter;
    root.fireSApplyMissionFilter136A5 = applyServerFilter;

    const prevNext = root.nextProjectPage;
    root.nextProjectPage = function () {
      root.currentProjectPage = asInt(root.currentProjectPage || 1) + 1;
      if (typeof wrapped === 'function') wrapped();
      else if (typeof prevNext === 'function') prevNext();
    };
    const prevPrev = root.previousProjectPage;
    root.previousProjectPage = function () {
      root.currentProjectPage = Math.max(1, asInt(root.currentProjectPage || 1) - 1);
      if (typeof wrapped === 'function') wrapped();
      else if (typeof prevPrev === 'function') prevPrev();
    };
  }

  function wrapOpenProject() {
    const previous = root.openProject;
    if (typeof previous !== 'function' || previous.__fireSDashboardStatsOpen) return;
    const wrapped = function fireSOpenProjectAfterLoad(projectId, focusMode, options) {
      const opts = options || {};
      if (opts.premiseFetchAttempted) return previous.apply(this, arguments);
      let existing = null;
      try {
        existing = typeof root.resolveProjectOpenIdentifier === 'function'
          ? root.resolveProjectOpenIdentifier(projectId)
          : null;
      } catch (_) {}
      if (existing && !existing._fireSSummaryOnly) return previous.apply(this, arguments);
      Promise.resolve(ensurePremiseLoaded(projectId)).then(function (loaded) {
        previous.call(root, projectId, focusMode, Object.assign({}, opts, { premiseFetchAttempted: true }));
        if (!loaded) {
          diag('premise-open-miss', { attempted: true });
        }
      }).catch(function () {
        previous.call(root, projectId, focusMode, Object.assign({}, opts, { premiseFetchAttempted: true }));
      });
    };
    wrapped.__fireSDashboardStatsOpen = true;
    root.openProject = wrapped;
    try { if (typeof openProject !== 'undefined') openProject = wrapped; } catch (_) {}
  }

  function wrapInspectorSearch() {
    const input = root.document && root.document.getElementById('inspectorV4Search');
    const next = root.document && root.document.getElementById('inspectorV4Next');
    const results = root.document && root.document.getElementById('inspectorV4Results');
    if (!input || input.__fireSServerSearch) return;
    input.__fireSServerSearch = true;
    input.addEventListener('input', function () {
      const q = text(input.value);
      try { root.clearTimeout(searchTimer); } catch (_) {}
      if (!q) return;
      searchTimer = root.setTimeout(function () {
        if (next) next.innerHTML = '';
        if (results) results.innerHTML = '<div class="inspector-v4-empty">Searching the company database…</div>';
        listCompanyPremises({ search: q, filter: 'all', limit: 8, offset: 0 }).then(function (page) {
          if (text(input.value) !== q) return;
          if (!results) return;
          if (!page.ok || !page.items.length) {
            results.innerHTML = `<div class="inspector-v4-empty">No premises match “${esc(q)}”. Try another name or use + NEW PREMISES.</div>`;
            return;
          }
          results.innerHTML = page.items.map(function (p) {
            return `<button type="button" class="inspector-v4-result" data-v4-open="${esc(p.id)}"><div class="inspector-v4-title">${esc(titleOf(p))}</div><div class="inspector-v4-meta">${esc(p.projectAddress || '')}</div><span class="inspector-v4-action">Open</span></button>`;
          }).join('');
          results.querySelectorAll('[data-v4-open]').forEach(function (btn) {
            btn.onclick = function () {
              const id = btn.getAttribute('data-v4-open');
              if (typeof root.fireSOpenProjectCard === 'function') root.fireSOpenProjectCard(id);
              else if (typeof root.openProject === 'function') root.openProject(id);
            };
          });
        }).catch(function () {});
      }, 180);
    });
  }

  function wrapLogoutAndCompany() {
    const previousLogout = root.applyLoggedOutUi;
    if (typeof previousLogout === 'function' && !previousLogout.__fireSDashboardStatsLogout) {
      const wrapped = function () {
        clearAllForSession();
        return previousLogout.apply(this, arguments);
      };
      wrapped.__fireSDashboardStatsLogout = true;
      root.applyLoggedOutUi = wrapped;
      try { if (typeof applyLoggedOutUi !== 'undefined') applyLoggedOutUi = wrapped; } catch (_) {}
    }
    const previousClear = root.fireSClearCompanyCacheIfMismatch;
    if (typeof previousClear === 'function' && !previousClear.__fireSDashboardStatsCompany) {
      const wrappedClear = function (companyId) {
        const nextId = text(companyId);
        const cached = readSnapshot(state.companyId || currentCompanyId());
        if (cached && nextId && cached.companyId !== nextId) clearSnapshot(cached.companyId);
        if (state.companyId && nextId && state.companyId !== nextId) {
          state.stats = null;
          state.fromCache = false;
        }
        return previousClear.apply(this, arguments);
      };
      wrappedClear.__fireSDashboardStatsCompany = true;
      root.fireSClearCompanyCacheIfMismatch = wrappedClear;
    }
  }

  function wrapSetProjectsCountGuard() {
    const previous = root.setProjects;
    if (typeof previous !== 'function' || previous.__fireSDashboardStatsSet) return;
    const wrapped = function (list) {
      const result = previous.apply(this, arguments);
      if (state.stats && state.status === 'ready') {
        root.setTimeout(paintHome, 0);
      }
      return result;
    };
    wrapped.__fireSDashboardStatsSet = true;
    root.setProjects = wrapped;
    try { if (typeof setProjects !== 'undefined') setProjects = wrapped; } catch (_) {}
  }

  function afterProfileReady() {
    const id = currentCompanyId();
    if (!id) return;
    getCompanyDashboardStats({ reason: 'profile' }).catch(function () {});
  }

  function install() {
    if (installed) return;
    installed = true;
    root.fireSAuthoritativeKpiCounts = authoritativeKpiCounts;
    root.fireSGetCompanyDashboardStats = getCompanyDashboardStats;
    root.fireSRefreshDashboardStats = refreshDashboardStats;
    root.fireSListCompanyPremises = listCompanyPremises;
    root.fireSSearchCompanyPremises = searchCompanyPremises;
    root.fireSEnsurePremiseLoaded = ensurePremiseLoaded;
    root.FireSDashboardStats = api;
    wrapGatewayRenderer();
    wrapOpenProject();
    wrapLogoutAndCompany();
    wrapSetProjectsCountGuard();
    wrapInspectorSearch();
    afterProfileReady();
    [400, 1200, 2500].forEach(function (ms) {
      root.setTimeout(function () {
        wrapGatewayRenderer();
        wrapOpenProject();
        wrapInspectorSearch();
        afterProfileReady();
      }, ms);
    });
    try {
      root.document.addEventListener('click', function (event) {
        const gateway = event.target && event.target.closest && event.target.closest('#cmdInspectionsBtn, #inspectorV4Gateway');
        if (gateway) {
          root.setTimeout(function () { renderServerGateway().catch(function () {}); }, 40);
        }
        const dateBtn = event.target && event.target.closest && event.target.closest('[data-date-filter]');
        if (dateBtn) {
          root.setTimeout(function () { renderServerGateway().catch(function () {}); }, 30);
        }
        const expiryBtn = event.target && event.target.closest && event.target.closest('#dashboardMetrics [data-filter^="expiry-"]');
        if (expiryBtn) {
          root.setTimeout(function () { renderServerGateway().catch(function () {}); }, 30);
        }
      }, true);
      root.document.addEventListener('change', function (event) {
        const id = event.target && event.target.id;
        if (id === 'inspectionDateFrom' || id === 'inspectionDateTo') {
          root.currentProjectPage = 1;
          renderServerGateway().catch(function () {});
        }
      }, true);
    } catch (_) {}
  }

  function hydrateFromCacheIfPossible() {
    const id = currentCompanyId();
    if (!id) return;
    const cached = readSnapshot(id);
    if (!cached || !cached.stats) return;
    state.companyId = id;
    state.stats = cached.stats;
    state.status = 'loading';
    state.source = 'cache';
    state.fromCache = true;
    state.lastVerifiedAt = cached.lastVerifiedAt || '';
    try { root.__fireSDashboardStatsState = getState(); } catch (_) {}
  }
  hydrateFromCacheIfPossible();

  root.FireSDashboardStats = api;
  root.fireSAuthoritativeKpiCounts = authoritativeKpiCounts;
  root.fireSGetCompanyDashboardStats = getCompanyDashboardStats;
  root.fireSRefreshDashboardStats = refreshDashboardStats;
  root.fireSListCompanyPremises = listCompanyPremises;
  root.fireSSearchCompanyPremises = searchCompanyPremises;
  root.fireSEnsurePremiseLoaded = ensurePremiseLoaded;
  root.fireSScheduleDashboardStatsRefresh = scheduleStatsRefresh;
  api.exclusiveFilterChrome = exclusiveFilterChrome;
  api.filterLabel = function (key) { return FILTER_LABELS[text(key) || 'all'] || key; };

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})(typeof window !== 'undefined' ? window : this);
