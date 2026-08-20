/* ============================================================
   Fire-S Management dashboard (Owner / Manager)
   Power BI-style graph wall for tablet, laptop and PC.
   Charts are generated from live inspection data.
   CSV export is for Microsoft Power BI Desktop.
   ============================================================ */
(function fireSManagementDashboard() {
  'use strict';

  const PALETTE = ['#F2C811', '#b71c1c', '#118DFF', '#0F7B0F', '#5C2D91', '#CA5010', '#00B7C3', '#334155'];
  const WORKSPACE_IDS = [
    'homeSection',
    'servicesSection',
    'projectListSection',
    'projectFormSection',
    'findingsCentreSection',
    'companyTeamSection',
    'companyLetterheadSection',
    'testSamplesSection',
    'inspectorBoardSection',
    'userManualSection',
    'reportSection'
  ];

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

  function currentRole() {
    try {
      if (typeof window.resolveFireSHomeRole === 'function') {
        return lower(window.resolveFireSHomeRole());
      }
    } catch (_) {}
    return lower(window.currentUserProfile?.role);
  }

  function canOpen() {
    return ['manager', 'company_owner', 'owner', 'super_admin', 'admin'].includes(currentRole());
  }

  function projects() {
    let list = [];
    try {
      list = typeof getProjects === 'function' ? getProjects() : [];
    } catch (_) {}
    try {
      if (typeof getVisibleProjectsForCurrentUser === 'function' && window.currentUserProfile) {
        list = getVisibleProjectsForCurrentUser(list) || list;
      }
    } catch (_) {}
    return Array.isArray(list) ? list : [];
  }

  function isCompleted(project) {
    return !!(
      project?.completedAt ||
      project?.archivedAt ||
      project?.isArchived ||
      lower(project?.status) === 'completed' ||
      lower(project?.inspectionStatus) === 'completed'
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
    const due = dateKey(
      project?.scheduledDate ||
        project?.followUpDate ||
        project?.nextInspectionDate ||
        project?.inspectionDueDate
    );
    if (!due || isCompleted(project)) return false;
    return due < dateKey(new Date());
  }

  function answers(project) {
    return Array.isArray(project?.answers) ? project.answers : [];
  }

  function photos(project) {
    return Array.isArray(project?.photos) ? project.photos : [];
  }

  function answerValue(item) {
    return lower(item?.answer || item?.value);
  }

  function checklistForProject(project) {
    try {
      if (typeof getChecklistForProject === 'function') {
        const rows = getChecklistForProject(project);
        if (Array.isArray(rows) && rows.length) return rows;
      }
    } catch (_) {}
    return [];
  }

  function checklistItemFor(item, checklist) {
    const list = Array.isArray(checklist) ? checklist : [];
    const idx = Number(item?.itemIndex);
    if (Number.isFinite(idx) && idx >= 0 && list[idx]) return list[idx];
    const number = text(item?.itemNumber);
    if (number) {
      const byNumber = list.find(row => String(row['Item Number']) === number);
      if (byNumber) return byNumber;
    }
    const question = text(item?.question || item?.text || item?.title || item?.['Checklist Item']);
    if (question) {
      const byText = list.find(row => text(row['Checklist Item']) === question);
      if (byText) return byText;
    }
    return null;
  }

  function isGateChecklistItem(row) {
    return !!(row && (row['Gate Question'] === true || row.gateQuestion === true));
  }

  function isFindingItem(item, checklist) {
    const value = answerValue(item);
    const assessment = lower(item?.assessment);
    const flagged = value === 'no' || assessment === 'action required';
    if (!flagged) return false;
    return !isGateChecklistItem(checklistItemFor(item, checklist));
  }

  function noCount(project) {
    const checklist = checklistForProject(project);
    return answers(project).filter(item => isFindingItem(item, checklist)).length;
  }

  function yesCount(project) {
    return answers(project).filter(item => answerValue(item) === 'yes').length;
  }

  function naCount(project) {
    return answers(project).filter(item => ['n/a', 'na'].includes(answerValue(item))).length;
  }

  function answeredCount(project) {
    return answers(project).filter(item =>
      ['yes', 'no', 'n/a', 'na'].includes(answerValue(item))
    ).length;
  }

  function categoryOf(item, checklist) {
    const named = text(item?.Section || item?.sectionName || item?.section);
    if (named) return named;
    const row = checklistItemFor(item, checklist);
    const fromRow = text(row?.Section || row?.sectionName);
    if (fromRow) return fromRow;
    return 'Unspecified category';
  }

  function inspectorName(project) {
    return (
      text(project?.inspectorName) ||
      text(project?.createdByEmail) ||
      'Unknown inspector'
    );
  }

  function siteName(project) {
    return (
      text(project?.siteName) ||
      text(project?.projectName) ||
      text(project?.organisationName) ||
      'Unnamed premises'
    );
  }

  function occupancyOf(project) {
    return text(project?.occupancy) || 'Unspecified';
  }

  function hasGps(project) {
    const gps = project?.gps || project?.location || '';
    if (typeof gps === 'object') {
      return !!(gps.lat || gps.latitude || gps.lng || gps.longitude);
    }
    return !!text(gps);
  }

  function dateKey(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function activityDate(project) {
    return (
      project?.completedAt ||
      project?.inspectionDate ||
      project?.lastSaved ||
      project?.updatedAt ||
      project?.createdAt ||
      ''
    );
  }

  function monthKey(value) {
    const key = dateKey(value);
    return key ? key.slice(0, 7) : '';
  }

  function increment(map, key, amount) {
    const label = key || 'Unknown';
    map[label] = (map[label] || 0) + (amount || 1);
  }

  function toPairs(map) {
    return Object.keys(map)
      .map(label => ({ label, value: map[label] }))
      .sort((a, b) => b.value - a.value);
  }

  function filterProjects(list, filter, inspector) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return list.filter(project => {
      if (inspector && inspector !== 'all' && inspectorName(project) !== inspector) {
        return false;
      }
      if (filter === 'month') return monthKey(activityDate(project)) === month;
      if (filter === 'overdue') return isOverdue(project);
      if (filter === 'completed') return isCompleted(project);
      if (filter === 'action') return noCount(project) > 0;
      return true;
    });
  }

  function compute(list) {
    const status = { Completed: 0, Overdue: 0, Draft: 0, 'In progress': 0 };
    const occupancy = {};
    const inspectors = {};
    const inspectorDone = {};
    const inspectorOverdue = {};
    const inspectorFindings = {};
    const inspectorPhotos = {};
    const categories = {};
    const months = {};
    const weekdays = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
    const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let yes = 0;
    let no = 0;
    let na = 0;
    let answered = 0;
    let questions = 0;
    let photoTotal = 0;
    let gpsYes = 0;
    let followUp = 0;
    let recurring = 0;
    const sites = [];

    const now = new Date();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = 0;
    }

    list.forEach(project => {
      const name = inspectorName(project);
      increment(inspectors, name);
      if (isOverdue(project)) {
        status.Overdue += 1;
        increment(inspectorOverdue, name);
      } else if (isCompleted(project)) {
        status.Completed += 1;
        increment(inspectorDone, name);
      } else if (answeredCount(project) === 0) {
        status.Draft += 1;
      } else {
        status['In progress'] += 1;
      }

      increment(occupancy, occupancyOf(project));
      const nos = noCount(project);
      increment(inspectorFindings, name, nos);
      increment(inspectorPhotos, name, photos(project).length);
      photoTotal += photos(project).length;
      if (hasGps(project)) gpsYes += 1;
      if (project?.followUpRequired || project?.followUpDate) followUp += 1;
      if (project?.recurringCycleEnabled) recurring += 1;

      yes += yesCount(project);
      no += nos;
      na += naCount(project);
      answered += answeredCount(project);
      questions += answers(project).length;

      const checklist = checklistForProject(project);
      answers(project).forEach(item => {
        if (isFindingItem(item, checklist)) {
          increment(categories, categoryOf(item, checklist));
        }
      });

      const when = activityDate(project);
      const mk = monthKey(when);
      if (mk && Object.prototype.hasOwnProperty.call(months, mk)) months[mk] += 1;
      if (when) {
        const day = new Date(when);
        if (!Number.isNaN(day.getTime())) {
          const label = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getDay()];
          weekdays[label] += 1;
        }
      }

      if (nos > 0 || isOverdue(project)) {
        sites.push({
          site: siteName(project),
          inspector: name,
          findings: nos,
          photos: photos(project).length,
          overdue: isOverdue(project) ? 'Yes' : 'No',
          status: isCompleted(project) ? 'Completed' : isOverdue(project) ? 'Overdue' : 'Open'
        });
      }
    });

    sites.sort((a, b) => b.findings - a.findings || (a.overdue === 'Yes' ? -1 : 1));

    const total = list.length;
    const compliance = total ? Math.round((status.Completed / total) * 100) : 0;
    const qaRate = questions ? Math.round((answered / questions) * 100) : 0;

    return {
      total,
      status,
      occupancy: toPairs(occupancy),
      inspectors: toPairs(inspectors),
      inspectorDone: toPairs(inspectorDone),
      inspectorOverdue: toPairs(inspectorOverdue),
      inspectorFindings: toPairs(inspectorFindings),
      inspectorPhotos: toPairs(inspectorPhotos),
      categories: toPairs(categories),
      months: Object.keys(months).map(label => ({ label, value: months[label] })),
      weekdays: weekdayOrder.map(label => ({ label, value: weekdays[label] })),
      yes,
      no,
      na,
      answered,
      questions,
      photoTotal,
      gpsYes,
      gpsNo: Math.max(0, total - gpsYes),
      followUp,
      recurring,
      sites: sites.slice(0, 12),
      compliance,
      qaRate,
      avgPhotos: total ? Math.round((photoTotal / total) * 10) / 10 : 0
    };
  }

  function maxValue(items) {
    return Math.max(1, ...items.map(item => Number(item.value) || 0));
  }

  function niceCeiling(value) {
    const n = Math.max(1, Number(value) || 1);
    if (n <= 4) return 4;
    if (n <= 5) return 5;
    if (n <= 8) return 8;
    if (n <= 10) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(n)));
    const norm = n / pow;
    const nice = norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return nice * pow;
  }

  function axisTicks(max) {
    const top = niceCeiling(max);
    const ticks = [];
    for (let i = 0; i <= 4; i += 1) {
      ticks.push(Math.round((top * i) / 4));
    }
    return { top, ticks };
  }

  function shortAxisLabel(label) {
    const raw = String(label || '');
    const ym = raw.match(/^(\d{4})-(\d{2})$/);
    if (ym) {
      const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return names[Number(ym[2]) - 1] || ym[2];
    }
    return raw.length > 14 ? `${raw.slice(0, 13)}…` : raw;
  }

  function yGrid(padL, padT, plotW, plotH, ticks, top) {
    return ticks.map(tick => {
      const y = padT + plotH - (tick / top) * plotH;
      return `
        <line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#edebe9" stroke-width="1"></line>
        <text class="pbi-tick" x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#605e5c">${tick}</text>
      `;
    }).join('');
  }

  function barFill(color, index) {
    if (Array.isArray(color)) return color[index % color.length];
    return color || PALETTE[index % PALETTE.length];
  }

  function formatTickLabel(label, maxChars) {
    const raw = String(label || '');
    const limit = Number(maxChars) > 0 ? Number(maxChars) : 14;
    if (raw.length <= limit) return raw;
    return `${raw.slice(0, Math.max(1, limit - 1))}…`;
  }

  function barChart(items, color, axis, options) {
    const maxRows = Number(options && options.maxRows) > 0 ? Number(options.maxRows) : 8;
    const labelMax = Number(options && options.labelMax) > 0 ? Number(options.labelMax) : 14;
    const rows = (items || []).slice(0, maxRows);
    if (!rows.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const yTitle = (axis && axis.y) || 'Count';
    const xTitle = (axis && axis.x) || 'Value';
    const width = 460;
    const rowH = Number(options && options.rowH) > 0 ? Number(options.rowH) : 20;
    const padL = Number(options && options.padL) > 0 ? Number(options.padL) : 108;
    const padR = 28;
    const padT = 6;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = Math.max(48, rows.length * rowH);
    const height = padT + plotH + padB;
    const { top, ticks } = axisTicks(maxValue(rows));
    const bars = rows.map((item, index) => {
      const y = padT + index * rowH;
      const w = Math.max(2, Math.round((item.value / top) * plotW));
      return `
        <text class="pbi-tick" x="${padL - 8}" y="${y + 13}" text-anchor="end" font-size="9" fill="#605e5c">${esc(formatTickLabel(item.label, labelMax))}</text>
        <rect x="${padL}" y="${y + 4}" width="${w}" height="12" fill="${barFill(color, index)}" rx="1.5"></rect>
        <text x="${padL + w + 4}" y="${y + 14}" font-size="9" fill="#252423">${item.value}</text>
      `;
    }).join('');
    const xTicks = ticks.map(tick => {
      const x = padL + (tick / top) * plotW;
      return `
        <line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="#f3f2f1" stroke-width="1"></line>
        <text class="pbi-tick" x="${x}" y="${padT + plotH + 12}" text-anchor="middle" font-size="9" fill="#605e5c">${tick}</text>
      `;
    }).join('');
    return `<svg class="pbi-chart" viewBox="0 0 ${width} ${height}" width="100%" height="${Math.min(210, height)}" role="img" aria-label="${esc(yTitle)} by ${esc(xTitle)}">
      ${xTicks}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
      <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
      ${bars}
      <text class="pbi-axis-title" x="${padL + plotW / 2}" y="${height - 4}" text-anchor="middle" font-size="10" font-weight="600" fill="#323130">${esc(xTitle)}</text>
    </svg>`;
  }

  function columnChart(items, color, axis) {
    const rows = items || [];
    if (!rows.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const yTitle = (axis && axis.y) || 'Count';
    const xTitle = (axis && axis.x) || 'Category';
    const width = 480;
    const height = 188;
    const padL = 42;
    const padR = 10;
    const padT = 16;
    const padB = 40;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const { top, ticks } = axisTicks(maxValue(rows));
    const gap = 5;
    const barW = Math.max(10, Math.min(26, plotW / rows.length - gap));
    const bars = rows.map((item, index) => {
      const h = Math.max(2, Math.round((item.value / top) * plotH));
      const x = padL + index * (plotW / rows.length) + (plotW / rows.length - barW) / 2;
      const y = padT + plotH - h;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${barFill(color, index)}" rx="1.5"></rect>
        <text x="${x + barW / 2}" y="${y - 3}" font-size="8" text-anchor="middle" fill="#323130">${item.value}</text>
        <text class="pbi-tick" x="${x + barW / 2}" y="${padT + plotH + 12}" font-size="8" text-anchor="middle" fill="#605e5c">${esc(shortAxisLabel(item.label))}</text>
      `;
    }).join('');
    return `<svg class="pbi-chart" viewBox="0 0 ${width} ${height}" width="100%" height="176" role="img" aria-label="${esc(yTitle)} by ${esc(xTitle)}">
      ${yGrid(padL, padT, plotW, plotH, ticks, top)}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
      <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
      ${bars}
      <text class="pbi-axis-title" transform="rotate(-90 ${14} ${padT + plotH / 2})" x="14" y="${padT + plotH / 2}" text-anchor="middle" font-size="10" font-weight="600" fill="#323130">${esc(yTitle)}</text>
      <text class="pbi-axis-title" x="${padL + plotW / 2}" y="${height - 6}" text-anchor="middle" font-size="10" font-weight="600" fill="#323130">${esc(xTitle)}</text>
    </svg>`;
  }

  function lineChart(items, color, axis) {
    const rows = items || [];
    if (!rows.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const yTitle = (axis && axis.y) || 'Count';
    const xTitle = (axis && axis.x) || 'Period';
    const width = 480;
    const height = 188;
    const padL = 42;
    const padR = 10;
    const padT = 16;
    const padB = 40;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const { top, ticks } = axisTicks(maxValue(rows));
    const step = rows.length > 1 ? plotW / (rows.length - 1) : 0;
    const points = rows.map((item, index) => {
      const x = padL + index * step;
      const y = padT + plotH - Math.round((item.value / top) * plotH);
      return `${x},${y}`;
    }).join(' ');
    const dots = rows.map((item, index) => {
      const x = padL + index * step;
      const y = padT + plotH - Math.round((item.value / top) * plotH);
      const showTick = rows.length <= 12 || index === 0 || index === rows.length - 1 || index % 2 === 0;
      return `
        <circle cx="${x}" cy="${y}" r="2.5" fill="${color || '#118DFF'}"></circle>
        ${showTick ? `<text class="pbi-tick" x="${x}" y="${padT + plotH + 12}" font-size="8" text-anchor="middle" fill="#605e5c">${esc(shortAxisLabel(item.label))}</text>` : ''}
      `;
    }).join('');
    return `<svg class="pbi-chart" viewBox="0 0 ${width} ${height}" width="100%" height="176" role="img" aria-label="${esc(yTitle)} by ${esc(xTitle)}">
      ${yGrid(padL, padT, plotW, plotH, ticks, top)}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
      <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
      <polyline fill="none" stroke="${color || '#118DFF'}" stroke-width="2" points="${points}"></polyline>
      ${dots}
      <text class="pbi-axis-title" transform="rotate(-90 14 ${padT + plotH / 2})" x="14" y="${padT + plotH / 2}" text-anchor="middle" font-size="10" font-weight="600" fill="#323130">${esc(yTitle)}</text>
      <text class="pbi-axis-title" x="${padL + plotW / 2}" y="${height - 6}" text-anchor="middle" font-size="10" font-weight="600" fill="#323130">${esc(xTitle)}</text>
    </svg>`;
  }

  function groupedColumnChart(rows, series, axis) {
    const list = (rows || []).slice(0, 8);
    const seriesList = Array.isArray(series) && series.length
      ? series
      : [
          { key: 'Completed', color: '#0F7B0F' },
          { key: 'Overdue', color: '#b71c1c' }
        ];
    if (!list.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const yTitle = (axis && axis.y) || 'Inspections';
    const xTitle = (axis && axis.x) || 'Inspector';
    const width = 480;
    const height = 210;
    const padL = 42;
    const padR = 10;
    const padT = 16;
    const padB = 56;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const peak = maxValue(list.flatMap(row => seriesList.map(item => ({
      value: Number(row[item.key] != null ? row[item.key] : row.values && row.values[item.key]) || 0
    }))));
    const { top, ticks } = axisTicks(peak);
    const groupW = plotW / Math.max(1, list.length);
    const gap = 3;
    const barW = Math.max(6, Math.min(18, (groupW - 10) / seriesList.length - gap));
    const bars = list.map((row, groupIndex) => {
      const groupX = padL + groupIndex * groupW;
      const seriesBars = seriesList.map((item, seriesIndex) => {
        const value = Number(row[item.key] != null ? row[item.key] : row.values && row.values[item.key]) || 0;
        const h = value ? Math.max(2, Math.round((value / top) * plotH)) : 0;
        const x = groupX + (groupW - (seriesList.length * (barW + gap) - gap)) / 2 + seriesIndex * (barW + gap);
        const y = padT + plotH - h;
        return `
          <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${item.color || barFill(null, seriesIndex)}" rx="1.5"></rect>
          <text x="${x + barW / 2}" y="${y - 3}" font-size="8" text-anchor="middle" fill="#323130">${value}</text>
        `;
      }).join('');
      return `
        ${seriesBars}
        <text class="pbi-tick" x="${groupX + groupW / 2}" y="${padT + plotH + 12}" font-size="8" text-anchor="middle" fill="#605e5c">${esc(formatTickLabel(row.label, 16))}</text>
      `;
    }).join('');
    const legend = seriesList.map(item =>
      `<span><i class="pbi-swatch" style="background:${item.color}"></i>${esc(item.key)}</span>`
    ).join('');
    return `<div>
      <svg class="pbi-chart" viewBox="0 0 ${width} ${height}" width="100%" height="196" role="img" aria-label="${esc(seriesList.map(item => item.key).join(' vs '))} by ${esc(xTitle)}">
        ${yGrid(padL, padT, plotW, plotH, ticks, top)}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
        <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
        ${bars}
        <text class="pbi-axis-title" transform="rotate(-90 14 ${padT + plotH / 2})" x="14" y="${padT + plotH / 2}" text-anchor="middle" font-size="10" font-weight="600" fill="#323130">${esc(yTitle)}</text>
        <text class="pbi-axis-title" x="${padL + plotW / 2}" y="${height - 22}" text-anchor="middle" font-size="10" font-weight="600" fill="#323130">${esc(xTitle)}</text>
      </svg>
      <div class="pbi-legend pbi-series-legend">${legend}</div>
    </div>`;
  }

  function statusBarItems(status) {
    return ['Completed', 'Overdue', 'In progress', 'Draft'].map(label => ({
      label,
      value: Number(status && status[label]) || 0
    }));
  }

  function completedVsOverdueRows(stats) {
    const names = Array.from(new Set(
      []
        .concat((stats.inspectorDone || []).map(item => item.label))
        .concat((stats.inspectorOverdue || []).map(item => item.label))
        .concat((stats.inspectors || []).map(item => item.label))
    ));
    const doneMap = Object.fromEntries((stats.inspectorDone || []).map(item => [item.label, item.value]));
    const overdueMap = Object.fromEntries((stats.inspectorOverdue || []).map(item => [item.label, item.value]));
    const rows = names.map(label => ({
      label,
      Completed: Number(doneMap[label]) || 0,
      Overdue: Number(overdueMap[label]) || 0
    })).filter(row => row.Completed || row.Overdue);
    rows.sort((a, b) => (b.Completed + b.Overdue) - (a.Completed + a.Overdue));
    if (rows.length) return rows;
    return [{
      label: 'Company',
      Completed: Number(stats.status && stats.status.Completed) || 0,
      Overdue: Number(stats.status && stats.status.Overdue) || 0
    }];
  }

  function donutChart(map) {
    const rows = Object.keys(map).map(label => ({ label, value: map[label] })).filter(item => item.value > 0);
    if (!rows.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const total = rows.reduce((sum, item) => sum + item.value, 0) || 1;
    const r = 46;
    const c = 2 * Math.PI * r;
    let offset = 0;
    const rings = rows.map((item, index) => {
      const len = (item.value / total) * c;
      const dash = `${len} ${c - len}`;
      const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${PALETTE[index % PALETTE.length]}" stroke-width="14" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"></circle>`;
      offset += len;
      return el;
    }).join('');
    const legend = rows.map((item, index) => {
      const pct = Math.round((item.value / total) * 100);
      return `<span><i class="pbi-swatch" style="background:${PALETTE[index % PALETTE.length]}"></i>${esc(item.label)} ${item.value} · ${pct}%</span>`;
    }).join('');
    return `<div class="pbi-donut">
      <svg class="pbi-chart" viewBox="0 0 140 140" width="118" height="118" role="img">
        ${rings}
        <text x="70" y="66" text-anchor="middle" font-size="16" font-weight="700" fill="#252423">${total}</text>
        <text x="70" y="82" text-anchor="middle" font-size="9" fill="#605e5c">total</text>
      </svg>
      <div class="pbi-legend">${legend}</div>
    </div>`;
  }

  function tableHtml(rows) {
    if (!rows.length) return '<div class="pbi-empty">No attention sites in this filter.</div>';
    const body = rows.map(row => `
      <tr>
        <td>${esc(row.site)}</td>
        <td>${esc(row.inspector)}</td>
        <td>${row.findings}</td>
        <td>${row.photos}</td>
        <td>${esc(row.status)}</td>
      </tr>
    `).join('');
    return `<div style="overflow-x:auto"><table class="pbi-table">
      <thead><tr><th>Site</th><th>Inspector</th><th>Findings</th><th>Photos</th><th>Status</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
  }

  function csvEscape(value) {
    const raw = String(value ?? '');
    if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
    return raw;
  }

  function downloadCsv(filename, headers, rows) {
    const lines = [headers.join(',')].concat(
      rows.map(row => headers.map(key => csvEscape(row[key])).join(','))
    );
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function inspectionRows(list) {
    return list.map(project => ({
      site: siteName(project),
      organisation: text(project?.organisationName),
      inspector: inspectorName(project),
      occupancy: occupancyOf(project),
      status: isOverdue(project) ? 'Overdue' : isCompleted(project) ? 'Completed' : answeredCount(project) ? 'In progress' : 'Draft',
      inspectionDate: dateKey(project?.inspectionDate || activityDate(project)),
      completedAt: dateKey(project?.completedAt),
      overdue: isOverdue(project) ? 'Yes' : 'No',
      findings: noCount(project),
      yesAnswers: yesCount(project),
      naAnswers: naCount(project),
      questions: answers(project).length,
      photos: photos(project).length,
      gps: hasGps(project) ? 'Yes' : 'No',
      followUp: project?.followUpDate ? dateKey(project.followUpDate) : '',
      recurring: project?.recurringCycleEnabled ? 'Yes' : 'No',
      company: text(project?.companyName || window.currentUserProfile?.companyName)
    }));
  }

  function findingRows(list) {
    const rows = [];
    list.forEach(project => {
      const checklist = checklistForProject(project);
      answers(project).forEach(item => {
        if (!isFindingItem(item, checklist)) return;
        const row = checklistItemFor(item, checklist);
        rows.push({
          site: siteName(project),
          inspector: inspectorName(project),
          category: categoryOf(item, checklist),
          question: text(item?.question || item?.text || item?.title || row?.['Checklist Item']),
          inspectionDate: dateKey(project?.inspectionDate || activityDate(project))
        });
      });
    });
    return rows;
  }

  function fillInspectorFilter(list) {
    const select = byId('pbiInspectorFilter');
    if (!select) return;
    const current = select.value || 'all';
    const names = Array.from(new Set(list.map(inspectorName))).sort();
    select.innerHTML = `<option value="all">All inspectors</option>${
      names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('')
    }`;
    if ([...select.options].some(option => option.value === current)) {
      select.value = current;
    }
  }

  function kpi(label, value, extra, hint) {
    return `<div class="pbi-kpi ${extra || ''}"><span class="pbi-kpi-label">${esc(label)}</span><span class="pbi-kpi-value">${esc(String(value))}</span>${hint ? `<span class="pbi-kpi-hint">${esc(hint)}</span>` : ''}</div>`;
  }

  function tile(title, insight, body, extraClass) {
    return `<div class="pbi-tile ${extraClass || ''}">
      <h4>${esc(title)}</h4>
      ${insight ? `<p class="pbi-insight">${esc(insight)}</p>` : ''}
      ${body}
    </div>`;
  }

  function render() {
    const host = byId('managementDashboardBody');
    if (!host) return;
    const all = projects();
    fillInspectorFilter(all);
    const filter = byId('pbiRangeFilter')?.value || 'all';
    const inspector = byId('pbiInspectorFilter')?.value || 'all';
    const list = filterProjects(all, filter, inspector);
    const stats = compute(list);
    const company = text(window.currentUserProfile?.companyName) || 'Company';

    const title = byId('pbiCompanyLabel');
    if (title) title.textContent = `${company} · live inspection data`;

    host.innerHTML = `
      <div class="pbi-kpi-row">
        ${kpi('Inspections', stats.total, '', 'In this filter')}
        ${kpi('Completed', stats.status.Completed, 'is-ok', `${stats.compliance}% of total`)}
        ${kpi('Overdue', stats.status.Overdue, 'is-warn', 'Past due date')}
        ${kpi('Findings', stats.no, stats.no ? 'is-warn' : '', 'Action required')}
        ${kpi('Q&A complete', `${stats.qaRate}%`, '', `${stats.answered}/${stats.questions || 0}`)}
        ${kpi('Photos', stats.photoTotal, '', `${stats.avgPhotos} avg`)}
      </div>
      <div class="pbi-grid">
        ${tile(
          'Inspection status',
          'Completed, overdue, in progress and draft as a bar chart',
          columnChart(statusBarItems(stats.status), ['#0F7B0F', '#b71c1c', '#118DFF', '#605e5c'], {
            y: 'Inspections',
            x: 'Status'
          })
        )}
        ${tile(
          '12-month inspection volume',
          'How many inspections were worked in each month',
          lineChart(stats.months, '#118DFF', { y: 'Inspections', x: 'Month' }),
          'is-wide'
        )}
        ${tile(
          'Inspections by inspector',
          'Workload count for each inspector',
          barChart(stats.inspectors, '#F2C811', { y: 'Inspector', x: 'Inspections' })
        )}
        ${tile(
          'Findings by category',
          'Action required answers grouped by checklist section',
          barChart(stats.categories, '#CA5010', { y: 'Category', x: 'Findings' }, {
            maxRows: 16,
            labelMax: 32,
            padL: 186
          }),
          'is-wide'
        )}
        ${tile(
          'Occupancy mix',
          'Inspections by occupancy type',
          barChart(stats.occupancy, '#5C2D91', { y: 'Occupancy', x: 'Inspections' })
        )}
        ${tile(
          'Weekday pattern',
          'When inspection work is dated',
          columnChart(stats.weekdays, '#00B7C3', { y: 'Inspections', x: 'Day of week' })
        )}
        ${tile(
          'Completed vs overdue',
          'Green is Completed. Red is Overdue. Counted per inspector.',
          groupedColumnChart(
            completedVsOverdueRows(stats),
            [
              { key: 'Completed', color: '#0F7B0F' },
              { key: 'Overdue', color: '#b71c1c' }
            ],
            { y: 'Inspections', x: 'Inspector' }
          ),
          'is-wide'
        )}
        ${tile('Sites needing attention', 'Highest findings first, then overdue', tableHtml(stats.sites), 'is-wide')}
      </div>
    `;
  }

  function setMessage(message) {
    const el = byId('managementDashboardMessage');
    if (!el) return;
    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';
  }

  function hideOtherSections() {
    WORKSPACE_IDS.forEach(id => {
      const el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function goHome() {
    const section = byId('managementDashboardSection');
    if (section) section.style.display = 'none';
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
  }

  function openDashboard() {
    if (!canOpen()) {
      alert('Only the owner or manager can open the Management dashboard.');
      return;
    }
    hideOtherSections();
    const section = byId('managementDashboardSection');
    if (section) section.style.display = 'block';
    render();
    const count = projects().length;
    setMessage(
      count
        ? `${count} inspection(s) in this view. Axis labels show what each graph is counting.`
        : 'No inspections yet. Load Test samples (Home) to see graphs, or complete field inspections.'
    );
    try {
      if (typeof window.updateFloatingBackButton === 'function') {
        window.updateFloatingBackButton();
      }
    } catch (_) {}
  }

  function exportPowerBi() {
    const list = projects();
    downloadCsv(
      'Fire-S-PowerBI-inspections.csv',
      [
        'site', 'organisation', 'inspector', 'occupancy', 'status', 'inspectionDate',
        'completedAt', 'overdue', 'findings', 'yesAnswers', 'naAnswers', 'questions',
        'photos', 'gps', 'followUp', 'recurring', 'company'
      ],
      inspectionRows(list)
    );
    downloadCsv(
      'Fire-S-PowerBI-findings.csv',
      ['site', 'inspector', 'category', 'question', 'inspectionDate'],
      findingRows(list)
    );
    const m = `// Fire-S → Power BI Desktop
// 1. Open Power BI Desktop
// 2. Get data → Text/CSV
// 3. Choose Fire-S-PowerBI-inspections.csv
// 4. Repeat for Fire-S-PowerBI-findings.csv
// 5. Manage relationships: inspections[site] to findings[site]
let
  Inspections = Csv.Document(File.Contents("Fire-S-PowerBI-inspections.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
  Promoted = Table.PromoteHeaders(Inspections)
in
  Promoted
`;
    const blob = new Blob([m], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Fire-S-PowerBI-query.pq';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setMessage('Saved inspections CSV, findings CSV, and a Power Query file for Power BI Desktop.');
  }

  async function enterFullscreen() {
    const shell = byId('pbiShell');
    if (!shell) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (shell.requestFullscreen) await shell.requestFullscreen();
    } catch (_) {}
  }

  function bind() {
    const back = byId('managementDashboardBackBtn');
    const csv = byId('pbiExportBtn');
    const full = byId('pbiFullscreenBtn');
    const range = byId('pbiRangeFilter');
    const inspector = byId('pbiInspectorFilter');
    if (back && !back.__fireSBound) {
      back.__fireSBound = true;
      back.addEventListener('click', goHome);
    }
    if (csv && !csv.__fireSBound) {
      csv.__fireSBound = true;
      csv.addEventListener('click', exportPowerBi);
    }
    if (full && !full.__fireSBound) {
      full.__fireSBound = true;
      full.addEventListener('click', () => {
        enterFullscreen().catch(() => {});
      });
    }
    if (range && !range.__fireSBound) {
      range.__fireSBound = true;
      range.addEventListener('change', render);
    }
    if (inspector && !inspector.__fireSBound) {
      inspector.__fireSBound = true;
      inspector.addEventListener('change', render);
    }
  }

  function boot() {
    bind();
    const btn = byId('cmdManagementDashboardBtn');
    if (btn && !btn.__fireSBound) {
      btn.__fireSBound = true;
      btn.addEventListener('click', event => {
        if (event) event.preventDefault();
        openDashboard();
      });
    }
  }

  window.fireSOpenManagementDashboard = openDashboard;
  window.fireSRenderManagementDashboard = render;
  window.fireSDashboardCharts = {
    barChart,
    columnChart,
    groupedColumnChart,
    lineChart,
    donutChart,
    shortAxisLabel,
    categoryOf,
    isFindingItem,
    compute,
    statusBarItems,
    completedVsOverdueRows
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
