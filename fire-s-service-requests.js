/* ============================================================
   Fire-S — save and view Additional services requests.
   Works before login (this phone) and after login (cloud + this phone).
   All three Access services use the same store.
   Followed-up rows leave the active list and stay in archive for 6 months.
   ============================================================ */
(function fireSServiceRequests(root) {
  'use strict';

  var KEY = 'fireS.serviceRequests.v1';
  var ARCHIVE_MONTHS = 6;

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeService(name) {
    var n = text(name);
    if (!n) return '';
    if (/^fire consultancy$/i.test(n) || /^fire safety consultancy$/i.test(n)) {
      return 'Fire Safety Consultancy';
    }
    if (/rational fire design/i.test(n)) {
      return 'Rational Fire Design Support';
    }
    if (/fire plan assistance/i.test(n)) {
      return 'Fire Plan Assistance (Assist with approval from Local Government)';
    }
    return n;
  }

  function newId() {
    try {
      if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    } catch (_) {}
    return 'local-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function loadLocal() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocal(list) {
    try {
      if (root.localStorage) {
        root.localStorage.setItem(KEY, JSON.stringify(list || []));
      }
    } catch (_) {}
  }

  function upsertLocal(row) {
    var list = loadLocal();
    var i = -1;
    var idx;
    for (idx = 0; idx < list.length; idx += 1) {
      if (list[idx] && list[idx].id === row.id) {
        i = idx;
        break;
      }
    }
    if (i >= 0) list[i] = row;
    else list.unshift(row);
    saveLocal(list);
    return row;
  }

  function getSb() {
    try {
      if (root.supabaseClient) return root.supabaseClient;
    } catch (_) {}
    return null;
  }

  function cloudPayload(row) {
    var payload = {
      selected_service: row.selected_service,
      client_name: row.client_name,
      client_phone: row.client_phone || null,
      client_email: row.client_email || null,
      message: row.message || null,
      status: row.status || 'new',
      created_by_email: row.created_by_email || null
    };
    if (row.created_by_user_id) {
      payload.created_by_user_id = row.created_by_user_id;
    }
    return payload;
  }

  function insertCloud(row) {
    var sb = getSb();
    if (!sb || !sb.from) return Promise.resolve({ ok: false, skipped: 'no-cloud' });
    return sb
      .from('service_requests')
      .insert(cloudPayload(row))
      .then(function (res) {
        if (res && res.error) {
          return { ok: false, error: res.error };
        }
        return { ok: true };
      })
      .catch(function (error) {
        return { ok: false, error: error };
      });
  }

  function saveRequest(info) {
    var service = normalizeService(info && info.service);
    var name = text(info && info.name);
    var phone = text(info && info.phone);
    var email = text(info && (info.email || info.clientEmail)).toLowerCase();
    var message = text(info && info.message);
    if (!service) {
      return Promise.resolve({ ok: false, error: 'Select a service first.' });
    }
    if (!name || (!phone && !email)) {
      return Promise.resolve({
        ok: false,
        error: 'Type your name and a phone number or email.'
      });
    }
    var row = {
      id: newId(),
      selected_service: service,
      client_name: name,
      client_phone: phone || null,
      client_email: email || null,
      message: message || null,
      status: 'new',
      created_at: new Date().toISOString(),
      created_by_user_id: (info && info.userId) || null,
      created_by_email: email || (info && info.userEmail) || null,
      source: (info && info.source) || 'app',
      cloud: false
    };
    upsertLocal(row);
    return insertCloud(row).then(function (result) {
      if (result && result.ok) {
        row.cloud = true;
        upsertLocal(row);
      }
      return {
        ok: true,
        row: row,
        cloud: !!(result && result.ok),
        cloudError: result && result.error
      };
    });
  }

  function statusOf(row) {
    return text(row && row.status).toLowerCase();
  }

  function isFollowedUp(row) {
    return statusOf(row) === 'followed_up';
  }

  function isClosedIssue(row) {
    var status = statusOf(row);
    return status === 'closed' || status === 'followed_up';
  }

  function archiveCutoff(now) {
    var cut = now ? new Date(now) : new Date();
    cut.setMonth(cut.getMonth() - ARCHIVE_MONTHS);
    return cut;
  }

  function archiveTime(row) {
    return (
      Date.parse((row && (row.followed_up_at || row.archived_at || row.created_at)) || '') || 0
    );
  }

  function isExpiredArchive(row, now) {
    var when = archiveTime(row);
    if (!when) return false;
    return when < archiveCutoff(now).getTime();
  }

  function sameRequest(a, b) {
    if (!a || !b) return false;
    if (text(a.id) && text(a.id) === text(b.id)) return true;
    return (
      text(a.selected_service || a.selectedService) ===
        text(b.selected_service || b.selectedService) &&
      text(a.client_name || a.clientName).toLowerCase() ===
        text(b.client_name || b.clientName).toLowerCase() &&
      text(a.client_email || a.clientEmail).toLowerCase() ===
        text(b.client_email || b.clientEmail).toLowerCase() &&
      text(a.message) === text(b.message)
    );
  }

  function purgeExpiredLocal(now) {
    var kept = loadLocal().filter(function (row) {
      if (!row) return false;
      if (!isFollowedUp(row)) return true;
      return !isExpiredArchive(row, now);
    });
    saveLocal(kept);
    return kept;
  }

  function listLocalActive() {
    purgeExpiredLocal();
    return loadLocal().filter(function (row) {
      return row && !isFollowedUp(row);
    });
  }

  function listLocalArchived(now) {
    purgeExpiredLocal(now);
    return loadLocal()
      .filter(function (row) {
        return row && isFollowedUp(row) && !isExpiredArchive(row, now);
      })
      .sort(function (a, b) {
        return String(b.followed_up_at || b.created_at || '').localeCompare(
          String(a.followed_up_at || a.created_at || '')
        );
      });
  }

  function markFollowedUpLocal(match, extra) {
    extra = extra || {};
    var nowIso = extra.followed_up_at || new Date().toISOString();
    var list = loadLocal();
    var changed = false;
    list.forEach(function (row) {
      if (!sameRequest(row, match)) return;
      row.status = 'followed_up';
      row.followed_up_at = nowIso;
      if (extra.followup_note) row.followup_note = extra.followup_note;
      changed = true;
    });
    if (changed) saveLocal(list);
    purgeExpiredLocal();
    return changed;
  }

  function mergeRows(cloudRows) {
    var out = [];
    var seen = {};
    var followed = loadLocal().filter(isFollowedUp);
    function locallyFollowed(row) {
      return followed.some(function (local) {
        return sameRequest(local, row);
      });
    }
    function keyOf(row) {
      return [
        text(row.selected_service),
        text(row.client_name).toLowerCase(),
        text(row.client_email).toLowerCase(),
        text(row.message),
        String(row.created_at || '').slice(0, 16)
      ].join('|');
    }
    function add(row) {
      if (!row || isFollowedUp(row) || locallyFollowed(row)) return;
      var id = text(row.id);
      var key = keyOf(row);
      if ((id && seen[id]) || seen[key]) return;
      if (id) seen[id] = true;
      seen[key] = true;
      out.push(row);
    }
    (cloudRows || []).forEach(add);
    listLocalActive().forEach(add);
    out.sort(function (a, b) {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    return out;
  }

  function mergeArchivedRows(cloudRows, now) {
    var out = [];
    var seen = {};
    function add(row) {
      if (!row || !isFollowedUp(row) || isExpiredArchive(row, now)) return;
      var id = text(row.id);
      var key = [
        text(row.selected_service),
        text(row.client_name).toLowerCase(),
        text(row.message),
        String(row.followed_up_at || row.created_at || '').slice(0, 16)
      ].join('|');
      if ((id && seen[id]) || seen[key]) return;
      if (id) seen[id] = true;
      seen[key] = true;
      out.push(row);
    }
    (cloudRows || []).forEach(add);
    listLocalArchived(now).forEach(add);
    out.sort(function (a, b) {
      return String(b.followed_up_at || b.created_at || '').localeCompare(
        String(a.followed_up_at || a.created_at || '')
      );
    });
    return out;
  }

  function flushLocalToCloud() {
    var pending = loadLocal().filter(function (row) {
      return row && !row.cloud && !isFollowedUp(row);
    });
    var chain = Promise.resolve();
    pending.forEach(function (row) {
      chain = chain.then(function () {
        return insertCloud(row).then(function (result) {
          if (result && result.ok) {
            row.cloud = true;
            upsertLocal(row);
          }
        });
      });
    });
    return chain.then(function () {
      return { ok: true, count: pending.length };
    });
  }

  root.fireSNormalizeServiceName = normalizeService;
  root.fireSSaveServiceRequest = saveRequest;
  root.fireSListLocalServiceRequests = listLocalActive;
  root.fireSListLocalArchivedServiceRequests = listLocalArchived;
  root.fireSMarkServiceRequestFollowedUp = markFollowedUpLocal;
  root.fireSMergeServiceRequests = mergeRows;
  root.fireSMergeArchivedServiceRequests = mergeArchivedRows;
  root.fireSFlushServiceRequests = flushLocalToCloud;
  root.fireSPurgeExpiredServiceRequests = purgeExpiredLocal;
  root.fireSSupportArchiveCutoff = archiveCutoff;
  root.fireSIsExpiredSupportArchive = isExpiredArchive;
  root.fireSIsClosedSupportIssue = isClosedIssue;
  root.fireSSupportArchiveMonths = ARCHIVE_MONTHS;
})(window);
