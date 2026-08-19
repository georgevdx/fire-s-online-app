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

  function noCount(project) {
    return answers(project).filter(item => answerValue(item) === 'no').length;
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

  function categoryOf(item) {
    const t = lower(item?.question || item?.text || item?.title);
    if (/escape|egress|exit|stair|corridor|route/.test(t)) return 'Means of Escape';
    if (/sprinkler|pump|hydrant|hose|water|booster|valve/.test(t)) return 'Fire Water';
    if (/alarm|detect|detector|mcp|call point|sounder|panel/.test(t)) return 'Detection / Alarm';
    if (/extinguisher|equipment|service tag/.test(t)) return 'Fire Equipment';
    if (/emergency light|exit sign|signage/.test(t)) return 'Lighting / Signage';
    if (/door|self closing|smoke seal/.test(t)) return 'Fire Doors';
    if (/hazard|flammable|chemical|fuel|gas/.test(t)) return 'Hazards';
    if (/electrical|distribution board|cable|generator/.test(t)) return 'Electrical';
    if (/housekeeping|storage|combustible|waste/.test(t)) return 'Housekeeping';
    if (/document|certificate|coc|logbook|drill|plan/.test(t)) return 'Documentation';
    return 'General';
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

      answers(project).forEach(item => {
        if (answerValue(item) === 'no') increment(categories, categoryOf(item));
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

  function barChart(items, color) {
    const rows = (items || []).slice(0, 10);
    if (!rows.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const width = 420;
    const rowH = 22;
    const height = Math.max(80, rows.length * rowH + 8);
    const max = maxValue(rows);
    const bars = rows.map((item, index) => {
      const y = 4 + index * rowH;
      const w = Math.max(2, Math.round((item.value / max) * 260));
      return `
        <text x="0" y="${y + 12}" font-size="10" fill="#605e5c">${esc(item.label).slice(0, 18)}</text>
        <rect x="130" y="${y + 2}" width="${w}" height="14" fill="${color || PALETTE[index % PALETTE.length]}" rx="2"></rect>
        <text x="${140 + w}" y="${y + 13}" font-size="10" fill="#252423">${item.value}</text>
      `;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${Math.min(280, height)}" role="img">${bars}</svg>`;
  }

  function columnChart(items, color) {
    const rows = items || [];
    if (!rows.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const width = 440;
    const height = 180;
    const max = maxValue(rows);
    const gap = 6;
    const barW = Math.max(8, Math.min(28, (width - 40) / rows.length - gap));
    const bars = rows.map((item, index) => {
      const h = Math.max(2, Math.round((item.value / max) * 130));
      const x = 24 + index * (barW + gap);
      const y = 150 - h;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color || PALETTE[index % PALETTE.length]}" rx="2"></rect>
        <text x="${x + barW / 2}" y="168" font-size="8" text-anchor="middle" fill="#605e5c">${esc(String(item.label).replace(/^\d{4}-/, ''))}</text>
      `;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="180" role="img">${bars}</svg>`;
  }

  function lineChart(items, color) {
    const rows = items || [];
    if (!rows.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const width = 440;
    const height = 180;
    const max = maxValue(rows);
    const step = rows.length > 1 ? 400 / (rows.length - 1) : 0;
    const points = rows.map((item, index) => {
      const x = 20 + index * step;
      const y = 150 - Math.round((item.value / max) * 130);
      return `${x},${y}`;
    }).join(' ');
    const dots = rows.map((item, index) => {
      const x = 20 + index * step;
      const y = 150 - Math.round((item.value / max) * 130);
      return `<circle cx="${x}" cy="${y}" r="3" fill="${color || '#118DFF'}"></circle>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="180" role="img">
      <polyline fill="none" stroke="${color || '#118DFF'}" stroke-width="2.5" points="${points}"></polyline>
      ${dots}
    </svg>`;
  }

  function donutChart(map) {
    const rows = Object.keys(map).map(label => ({ label, value: map[label] })).filter(item => item.value > 0);
    if (!rows.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const total = rows.reduce((sum, item) => sum + item.value, 0) || 1;
    const r = 54;
    const c = 2 * Math.PI * r;
    let offset = 0;
    const rings = rows.map((item, index) => {
      const len = (item.value / total) * c;
      const dash = `${len} ${c - len}`;
      const el = `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${PALETTE[index % PALETTE.length]}" stroke-width="18" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"></circle>`;
      offset += len;
      return el;
    }).join('');
    const legend = rows.map((item, index) =>
      `<span><i class="pbi-swatch" style="background:${PALETTE[index % PALETTE.length]}"></i>${esc(item.label)} (${item.value})</span>`
    ).join('');
    return `<svg viewBox="0 0 160 160" width="160" height="160" role="img">${rings}
      <text x="80" y="84" text-anchor="middle" font-size="18" font-weight="700" fill="#252423">${total}</text>
    </svg><div class="pbi-legend">${legend}</div>`;
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
      answers(project).forEach(item => {
        if (answerValue(item) !== 'no') return;
        rows.push({
          site: siteName(project),
          inspector: inspectorName(project),
          category: categoryOf(item),
          question: text(item?.question || item?.text || item?.title),
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

  function kpi(label, value, extra) {
    return `<div class="pbi-kpi ${extra || ''}"><span class="pbi-kpi-label">${esc(label)}</span><span class="pbi-kpi-value">${esc(String(value))}</span></div>`;
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
        ${kpi('Inspections', stats.total)}
        ${kpi('Completed', stats.status.Completed, 'is-ok')}
        ${kpi('Overdue', stats.status.Overdue, 'is-warn')}
        ${kpi('Findings (No)', stats.no, stats.no ? 'is-warn' : '')}
        ${kpi('Compliance', `${stats.compliance}%`, 'is-gold')}
        ${kpi('Q&A complete', `${stats.qaRate}%`)}
        ${kpi('Photos', stats.photoTotal)}
        ${kpi('Avg photos', stats.avgPhotos)}
      </div>
      <div class="pbi-grid">
        <div class="pbi-tile">
          <h4>Inspection status mix</h4>
          ${donutChart(stats.status)}
        </div>
        <div class="pbi-tile">
          <h4>Yes / No / N/A answers</h4>
          ${donutChart({ Yes: stats.yes, No: stats.no, 'N/A': stats.na })}
        </div>
        <div class="pbi-tile is-wide">
          <h4>Inspections over the last 12 months</h4>
          ${lineChart(stats.months, '#118DFF')}
        </div>
        <div class="pbi-tile">
          <h4>Inspections by inspector</h4>
          ${barChart(stats.inspectors, '#F2C811')}
        </div>
        <div class="pbi-tile">
          <h4>Findings by inspector</h4>
          ${barChart(stats.inspectorFindings, '#b71c1c')}
        </div>
        <div class="pbi-tile">
          <h4>Findings by fire-safety category</h4>
          ${barChart(stats.categories, '#CA5010')}
        </div>
        <div class="pbi-tile">
          <h4>Occupancy types</h4>
          ${barChart(stats.occupancy, '#5C2D91')}
        </div>
        <div class="pbi-tile">
          <h4>Weekday pattern</h4>
          ${columnChart(stats.weekdays, '#00B7C3')}
        </div>
        <div class="pbi-tile">
          <h4>GPS captured vs missing</h4>
          ${donutChart({ 'GPS yes': stats.gpsYes, 'GPS no': stats.gpsNo })}
        </div>
        <div class="pbi-tile">
          <h4>Photos by inspector</h4>
          ${barChart(stats.inspectorPhotos, '#0F7B0F')}
        </div>
        <div class="pbi-tile">
          <h4>Completed vs overdue by inspector</h4>
          ${barChart(stats.inspectorDone.map(item => ({
            label: `${item.label} done`,
            value: item.value
          })).concat(stats.inspectorOverdue.map(item => ({
            label: `${item.label} overdue`,
            value: item.value
          }))), '#118DFF')}
        </div>
        <div class="pbi-tile">
          <h4>Follow-up and recurring</h4>
          ${donutChart({
            'Follow-up set': stats.followUp,
            Recurring: stats.recurring,
            'One-off': Math.max(0, stats.total - stats.followUp)
          })}
        </div>
        <div class="pbi-tile is-wide">
          <h4>Sites needing attention</h4>
          ${tableHtml(stats.sites)}
        </div>
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
        ? `Graphs generated from ${count} inspection(s). Turn a tablet sideways or use a PC for the full wall. Download CSV for Microsoft Power BI Desktop.`
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
