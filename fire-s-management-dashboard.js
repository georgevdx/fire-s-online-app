/* ============================================================
   Fire-S Management dashboard (Owner / Manager)
   Power BI-style graph wall for tablet, laptop and PC.
   Charts are generated from live inspection data.
   CSV export is for Microsoft Power BI Desktop.
   ============================================================ */
(function fireSManagementDashboard() {
  'use strict';

  const PALETTE = ['#F2C811', '#b71c1c', '#118DFF', '#0F7B0F', '#5C2D91', '#CA5010', '#00B7C3', '#334155'];
  const AGE_BUCKETS = [
    { key: '0-7', label: '0–7 days', short: '0–7', min: 0, max: 7 },
    { key: '8-30', label: '8–30 days', short: '8–30', min: 8, max: 30 },
    { key: '31-60', label: '31–60 days', short: '31–60', min: 31, max: 60 },
    { key: '61-90', label: '61–90 days', short: '61–90', min: 61, max: 90 },
    { key: '90+', label: 'More than 90 days', short: '>90', min: 91, max: 99999 }
  ];
  const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
  const PRIORITY_COLORS = {
    Critical: '#7f1d1d',
    High: '#b71c1c',
    Medium: '#CA5010',
    Low: '#F2C811'
  };
  const COMPLIANCE_STATUSES = ['Compliant', 'Action Required', 'Overdue', 'Not Yet Inspected'];
  const COMPLIANCE_COLORS = {
    Compliant: '#0F7B0F',
    'Action Required': '#CA5010',
    Overdue: '#b71c1c',
    'Not Yet Inspected': '#605e5c'
  };
  const DUE_DAYS = { Critical: 7, High: 21, Medium: 30, Low: 60 };
  let activeDrill = null;
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

  function addDaysKey(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }

  function daysBetween(fromKey, toKey) {
    const from = new Date(`${fromKey}T00:00:00`);
    const to = new Date(`${toKey}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
  }

  function previousMonthKey(month) {
    const [year, mon] = String(month || '').split('-').map(Number);
    if (!year || !mon) return '';
    const date = new Date(year, mon - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function projectDueDate(project) {
    return dateKey(
      project?.scheduledDate ||
        project?.followUpDate ||
        project?.nextInspectionDate ||
        project?.inspectionDueDate
    );
  }

  function normalisePriority(value) {
    const raw = lower(value);
    if (raw === 'critical') return 'Critical';
    if (raw === 'high') return 'High';
    if (raw === 'medium') return 'Medium';
    if (raw === 'low') return 'Low';
    return 'High';
  }

  function ageBucketFor(days) {
    const age = Number(days) || 0;
    return AGE_BUCKETS.find(bucket => age >= bucket.min && age <= bucket.max) || AGE_BUCKETS[AGE_BUCKETS.length - 1];
  }

  function isActionClosed(action) {
    return ['closed', 'resolved', 'complete', 'completed'].includes(lower(action?.status));
  }

  function addCalendarDays(key, days) {
    if (!key) return '';
    const date = new Date(`${key}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + Number(days || 0));
    return dateKey(date);
  }

  function complianceStatus(project) {
    if (isOverdue(project)) return 'Overdue';
    if (noCount(project) > 0) return 'Action Required';
    if (isCompleted(project) && answeredCount(project) > 0) return 'Compliant';
    return 'Not Yet Inspected';
  }

  function actionRecords(project) {
    const checklist = checklistForProject(project);
    const saved = Array.isArray(project?.actions) ? project.actions : [];
    const today = dateKey(new Date());
    const createdFallback = dateKey(activityDate(project) || project?.inspectionDate || project?.createdAt);
    const records = [];

    answers(project).forEach((item, index) => {
      if (!isFindingItem(item, checklist)) return;
      const row = checklistItemFor(item, checklist);
      const itemIndex = Number.isFinite(Number(item?.itemIndex)) ? Number(item.itemIndex) : index;
      const match = saved.find(action =>
        Number(action?.itemIndex) === itemIndex ||
        (text(action?.itemNumber) && text(action.itemNumber) === text(item?.itemNumber))
      );
      if (match && isActionClosed(match)) return;
      const priority = normalisePriority(match?.priority || row?.Severity || row?.severity);
      const created = dateKey(match?.createdDate || match?.createdAt || createdFallback) || today;
      const due = dateKey(match?.dueDate) || addCalendarDays(created, DUE_DAYS[priority] || 30);
      const ageDays = daysBetween(created, today);
      const bucket = ageBucketFor(ageDays);
      records.push({
        projectId: project?.id || '',
        site: siteName(project),
        inspector: inspectorName(project),
        responsible: text(match?.responsible) || inspectorName(project),
        occupancy: occupancyOf(project),
        itemIndex,
        itemNumber: text(item?.itemNumber || row?.['Item Number'] || String(itemIndex + 1)),
        category: categoryOf(item, checklist),
        question: text(item?.question || item?.text || row?.['Checklist Item']),
        priority,
        ageDays,
        ageKey: bucket.key,
        ageLabel: bucket.label,
        overdue: !!(due && due < today),
        created,
        due,
        status: text(match?.status) || 'Open'
      });
    });
    return records;
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

  function computeOps(list) {
    const today = dateKey(new Date());
    const thisMonth = today.slice(0, 7);
    const lastMonth = previousMonthKey(thisMonth);
    const weekEnd = addDaysKey(6);
    const monthEnd = (() => {
      const date = new Date();
      return dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    })();

    const portfolio = {
      Compliant: 0,
      'Action Required': 0,
      Overdue: 0,
      'Not Yet Inspected': 0
    };
    const months = {};
    const monthCompleted = {};
    const monthCompliant = {};
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = 0;
      monthCompleted[key] = 0;
      monthCompliant[key] = 0;
    }

    const allActions = [];
    const siteMap = {};
    const categoryPremises = {};
    const categoryCounts = {};
    const feed = [];
    let dueToday = 0;
    let dueWeek = 0;
    let dueMonth = 0;
    let closedDays = 0;
    let closedCount = 0;

    list.forEach(project => {
      const status = complianceStatus(project);
      portfolio[status] = (portfolio[status] || 0) + 1;
      const actions = actionRecords(project);
      allActions.push(...actions);
      const findings = actions.length;
      const critical = actions.filter(item => item.priority === 'Critical').length;
      const high = actions.filter(item => item.priority === 'High').length;
      const site = siteName(project);
      siteMap[project.id || site] = {
        projectId: project.id || '',
        site,
        inspector: inspectorName(project),
        status,
        findings,
        critical,
        high,
        overdue: isOverdue(project),
        score: critical * 4 + high * 2 + (findings - critical - high) + (isOverdue(project) ? 5 : 0)
      };

      actions.forEach(item => {
        increment(categoryCounts, item.category);
        if (!categoryPremises[item.category]) categoryPremises[item.category] = new Set();
        categoryPremises[item.category].add(project.id || site);
      });

      const when = activityDate(project);
      const mk = monthKey(when);
      if (mk && Object.prototype.hasOwnProperty.call(months, mk)) {
        months[mk] += 1;
        if (isCompleted(project)) {
          monthCompleted[mk] += 1;
          if (status === 'Compliant') monthCompliant[mk] += 1;
        }
      }

      const due = projectDueDate(project);
      if (due && !isCompleted(project)) {
        if (due === today) dueToday += 1;
        if (due >= today && due <= weekEnd) dueWeek += 1;
        if (due >= today && due <= monthEnd) dueMonth += 1;
      }

      (Array.isArray(project?.actions) ? project.actions : []).forEach(action => {
        if (!isActionClosed(action)) return;
        const opened = dateKey(action.createdDate || action.createdAt);
        const closed = dateKey(action.closedDate || action.closedAt);
        if (opened && closed) {
          closedDays += daysBetween(opened, closed);
          closedCount += 1;
        }
      });

      if (isCompleted(project) && when) {
        feed.push({
          date: dateKey(when),
          projectId: project.id || '',
          text: `${site} · inspection completed`,
          kind: 'completed'
        });
      } else if (findings) {
        feed.push({
          date: dateKey(when) || today,
          projectId: project.id || '',
          text: `${site} · ${findings} open action item${findings === 1 ? '' : 's'}`,
          kind: 'actions'
        });
      }
      if (isOverdue(project)) {
        feed.push({
          date: due || today,
          projectId: project.id || '',
          text: `${site} · overdue inspection`,
          kind: 'overdue'
        });
      } else if (due && due >= today && due <= weekEnd) {
        feed.push({
          date: due,
          projectId: project.id || '',
          text: `${site} · due ${due}`,
          kind: 'due'
        });
      }
    });

    const total = list.length;
    const compliancePct = total ? Math.round((portfolio.Compliant / total) * 100) : 0;
    const thisCompleted = monthCompleted[thisMonth] || 0;
    const lastCompleted = monthCompleted[lastMonth] || 0;
    const thisRate = thisCompleted ? Math.round((monthCompliant[thisMonth] / thisCompleted) * 100) : null;
    const lastRate = lastCompleted ? Math.round((monthCompliant[lastMonth] / lastCompleted) * 100) : null;
    const delta = thisRate != null && lastRate != null ? thisRate - lastRate : null;

    const trend = Object.keys(months).map(label => {
      const completed = monthCompleted[label] || 0;
      return {
        label,
        value: completed ? Math.round((monthCompliant[label] / completed) * 100) : 0,
        completed,
        drill: { type: 'month', key: label }
      };
    });

    const ageRows = AGE_BUCKETS.map(bucket => {
      const row = { label: bucket.short || bucket.label, key: bucket.key };
      PRIORITIES.forEach(priority => {
        row[priority] = allActions.filter(item => item.ageKey === bucket.key && item.priority === priority).length;
      });
      return row;
    });

    const priorityCounts = {};
    PRIORITIES.forEach(priority => {
      priorityCounts[priority] = allActions.filter(item => item.priority === priority).length;
    });

    const worst = Object.keys(siteMap)
      .map(id => siteMap[id])
      .filter(row => row.findings > 0 || row.overdue)
      .sort((a, b) => b.score - a.score || b.findings - a.findings)
      .slice(0, 8)
      .map(row => ({
        label: row.site,
        value: row.findings || (row.overdue ? 1 : 0),
        drill: { type: 'site', projectId: row.projectId, site: row.site }
      }));

    const recurring = Object.keys(categoryPremises)
      .map(label => ({
        label,
        value: categoryPremises[label].size,
        findings: categoryCounts[label] || 0,
        drill: { type: 'category', key: label }
      }))
      .filter(row => row.value > 0)
      .sort((a, b) => b.value - a.value || b.findings - a.findings)
      .slice(0, 8);

    feed.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return {
      total,
      portfolio,
      compliancePct,
      delta,
      thisRate,
      lastRate,
      trend,
      actions: allActions,
      ageRows,
      priorityCounts,
      criticalHigh: allActions.filter(item => item.priority === 'Critical' || item.priority === 'High').length,
      overdueInspections: portfolio.Overdue,
      dueToday,
      dueWeek,
      dueMonth,
      worst,
      recurring,
      avgCloseDays: closedCount ? Math.round((closedDays / closedCount) * 10) / 10 : null,
      feed: feed.slice(0, 12),
      list
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

  function drillAttr(drill) {
    if (!drill) return '';
    return `data-pbi-drill="${esc(JSON.stringify(drill))}" class="pbi-hit"`;
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
        <g ${drillAttr(item.drill)} style="cursor:${item.drill ? 'pointer' : 'default'}">
          <text class="pbi-tick" x="${padL - 8}" y="${y + 13}" text-anchor="end" font-size="9" fill="#605e5c">${esc(formatTickLabel(item.label, labelMax))}</text>
          <rect x="${padL}" y="${y + 4}" width="${w}" height="12" fill="${barFill(color, index)}" rx="1.5"></rect>
          <text x="${padL + w + 4}" y="${y + 14}" font-size="9" fill="#252423">${item.value}</text>
        </g>
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
      const h = Number(item.value) ? Math.max(2, Math.round((item.value / top) * plotH)) : 0;
      const x = padL + index * (plotW / rows.length) + (plotW / rows.length - barW) / 2;
      const y = padT + plotH - h;
      return `
        <g ${drillAttr(item.drill)} style="cursor:${item.drill ? 'pointer' : 'default'}">
          <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${barFill(color, index)}" rx="1.5"></rect>
          <text x="${x + barW / 2}" y="${y - 3}" font-size="8" text-anchor="middle" fill="#323130">${item.value}</text>
          <text class="pbi-tick" x="${x + barW / 2}" y="${padT + plotH + 12}" font-size="8" text-anchor="middle" fill="#605e5c">${esc(shortAxisLabel(item.label))}</text>
        </g>
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
    const { top, ticks } = axis && Number(axis.top) > 0
      ? { top: Number(axis.top), ticks: [0, 25, 50, 75, 100].map(v => Math.round((Number(axis.top) * v) / 100)) }
      : axisTicks(maxValue(rows));
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
        <g ${drillAttr(item.drill)} style="cursor:${item.drill ? 'pointer' : 'default'}">
          <circle cx="${x}" cy="${y}" r="6" fill="${color || '#118DFF'}" fill-opacity="0.01"></circle>
          <circle cx="${x}" cy="${y}" r="2.5" fill="${color || '#118DFF'}"></circle>
          ${showTick ? `<text class="pbi-tick" x="${x}" y="${padT + plotH + 12}" font-size="8" text-anchor="middle" fill="#605e5c">${esc(shortAxisLabel(item.label))}</text>` : ''}
        </g>
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

  function stackedColumnChart(rows, series, axis) {
    const list = rows || [];
    const seriesList = Array.isArray(series) ? series : [];
    if (!list.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const yTitle = (axis && axis.y) || 'Action items';
    const xTitle = (axis && axis.x) || 'Age';
    const width = 640;
    const height = 210;
    const padL = 42;
    const padR = 10;
    const padT = 16;
    const padB = 56;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const totals = list.map(row => seriesList.reduce((sum, item) => sum + (Number(row[item.key]) || 0), 0));
    const { top, ticks } = axisTicks(Math.max(1, ...totals));
    const groupW = plotW / Math.max(1, list.length);
    const barW = Math.max(16, Math.min(42, groupW - 12));
    const columns = list.map((row, groupIndex) => {
      const x = padL + groupIndex * groupW + (groupW - barW) / 2;
      let yCursor = padT + plotH;
      const stacks = seriesList.map((item, seriesIndex) => {
        const value = Number(row[item.key]) || 0;
        const h = value ? Math.max(2, Math.round((value / top) * plotH)) : 0;
        yCursor -= h;
        const drill = { type: 'agePriority', age: row.key, priority: item.key };
        return `
          <g ${drillAttr(drill)} style="cursor:pointer">
            <rect x="${x}" y="${yCursor}" width="${barW}" height="${h}" fill="${item.color || barFill(null, seriesIndex)}" rx="${h ? 1 : 0}"></rect>
          </g>
        `;
      }).join('');
      const total = totals[groupIndex];
      return `
        ${stacks}
        <text x="${x + barW / 2}" y="${yCursor - 3}" font-size="8" text-anchor="middle" fill="#323130">${total}</text>
        <text class="pbi-tick" x="${x + barW / 2}" y="${padT + plotH + 14}" font-size="9" text-anchor="middle" fill="#605e5c">${esc(row.label)}</text>
      `;
    }).join('');
    const legend = seriesList.map(item =>
      `<button type="button" class="pbi-legend-btn" ${drillAttr({ type: 'priority', key: item.key })}><i class="pbi-swatch" style="background:${item.color}"></i>${esc(item.key)}</button>`
    ).join('');
    return `<div>
      <svg class="pbi-chart" viewBox="0 0 ${width} ${height}" width="100%" height="196" role="img" aria-label="${esc(yTitle)} by ${esc(xTitle)}">
        ${yGrid(padL, padT, plotW, plotH, ticks, top)}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
        <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
        ${columns}
        <text class="pbi-axis-title" transform="rotate(-90 14 ${padT + plotH / 2})" x="14" y="${padT + plotH / 2}" text-anchor="middle" font-size="10" font-weight="600" fill="#323130">${esc(yTitle)}</text>
        <text class="pbi-axis-title" x="${padL + plotW / 2}" y="${height - 22}" text-anchor="middle" font-size="10" font-weight="600" fill="#323130">${esc(xTitle)}</text>
      </svg>
      <div class="pbi-legend pbi-series-legend">${legend}</div>
    </div>`;
  }

  function paretoChart(items, color, axis) {
    const rows = (items || []).slice(0, 8);
    if (!rows.length) return '<div class="pbi-empty">No repeating findings yet.</div>';
    const yTitle = (axis && axis.y) || 'Premises';
    const xTitle = (axis && axis.x) || 'Finding';
    const width = 460;
    const padL = 168;
    const padR = 36;
    const padT = 8;
    const padB = 34;
    const rowH = 22;
    const plotW = width - padL - padR;
    const plotH = Math.max(48, rows.length * rowH);
    const height = padT + plotH + padB;
    const { top, ticks } = axisTicks(maxValue(rows));
    const total = rows.reduce((sum, item) => sum + (Number(item.value) || 0), 0) || 1;
    let running = 0;
    const bars = rows.map((item, index) => {
      const y = padT + index * rowH;
      const w = Math.max(2, Math.round((item.value / top) * plotW));
      running += Number(item.value) || 0;
      const pct = Math.round((running / total) * 100);
      const cumX = padL + (running / total) * plotW;
      return `
        <g ${drillAttr(item.drill)} style="cursor:${item.drill ? 'pointer' : 'default'}">
          <text class="pbi-tick" x="${padL - 8}" y="${y + 13}" text-anchor="end" font-size="9" fill="#605e5c">${esc(formatTickLabel(item.label, 28))}</text>
          <rect x="${padL}" y="${y + 4}" width="${w}" height="12" fill="${color || '#CA5010'}" rx="1.5"></rect>
          <text x="${padL + w + 4}" y="${y + 14}" font-size="9" fill="#252423">${item.value}</text>
          <circle cx="${cumX}" cy="${y + 10}" r="2.5" fill="#118DFF"></circle>
          <text x="${Math.min(width - 4, cumX + 8)}" y="${y + 13}" font-size="8" fill="#118DFF">${pct}%</text>
        </g>
      `;
    }).join('');
    return `<svg class="pbi-chart" viewBox="0 0 ${width} ${height}" width="100%" height="${Math.min(230, height)}" role="img" aria-label="${esc(yTitle)} by ${esc(xTitle)}">
      ${ticks.map(tick => {
        const x = padL + (tick / top) * plotW;
        return `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="#f3f2f1" stroke-width="1"></line>
          <text class="pbi-tick" x="${x}" y="${padT + plotH + 12}" text-anchor="middle" font-size="9" fill="#605e5c">${tick}</text>`;
      }).join('')}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
      <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#c8c6c4" stroke-width="1"></line>
      ${bars}
      <text class="pbi-axis-title" x="${padL + plotW / 2}" y="${height - 4}" text-anchor="middle" font-size="10" font-weight="600" fill="#323130">${esc(xTitle)}</text>
    </svg>`;
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

  function donutChart(map, colors) {
    const rows = Object.keys(map).map(label => ({ label, value: map[label] })).filter(item => item.value > 0);
    if (!rows.length) return '<div class="pbi-empty">No data for this graph yet.</div>';
    const total = rows.reduce((sum, item) => sum + item.value, 0) || 1;
    const r = 46;
    const c = 2 * Math.PI * r;
    let offset = 0;
    const rings = rows.map((item, index) => {
      const len = (item.value / total) * c;
      const dash = `${len} ${c - len}`;
      const fill = (colors && colors[item.label]) || PALETTE[index % PALETTE.length];
      const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${fill}" stroke-width="14" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"></circle>`;
      offset += len;
      return el;
    }).join('');
    const legend = rows.map((item, index) => {
      const pct = Math.round((item.value / total) * 100);
      const fill = (colors && colors[item.label]) || PALETTE[index % PALETTE.length];
      return `<button type="button" class="pbi-legend-btn" ${drillAttr({ type: 'status', key: item.label })}><i class="pbi-swatch" style="background:${fill}"></i>${esc(item.label)} ${item.value} · ${pct}%</button>`;
    }).join('');
    return `<div class="pbi-donut">
      <svg class="pbi-chart" viewBox="0 0 140 140" width="118" height="118" role="img">
        ${rings}
        <text x="70" y="66" text-anchor="middle" font-size="16" font-weight="700" fill="#252423">${total}</text>
        <text x="70" y="82" text-anchor="middle" font-size="9" fill="#605e5c">premises</text>
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

  function kpi(label, value, extra, hint, drill) {
    const tag = drill ? 'button' : 'div';
    const extraAttr = drill ? `type="button" ${drillAttr(drill)}` : '';
    return `<${tag} class="pbi-kpi ${extra || ''} ${drill ? 'is-clickable' : ''}" ${extraAttr}><span class="pbi-kpi-label">${esc(label)}</span><span class="pbi-kpi-value">${esc(String(value))}</span>${hint ? `<span class="pbi-kpi-hint">${esc(hint)}</span>` : ''}</${tag}>`;
  }

  function tile(title, insight, body, extraClass) {
    return `<div class="pbi-tile ${extraClass || ''}">
      <h4>${esc(title)}</h4>
      ${insight ? `<p class="pbi-insight">${esc(insight)}</p>` : ''}
      <div class="pbi-tile-body">${body}</div>
    </div>`;
  }

  function deltaHint(delta) {
    if (delta == null) return 'No last-month comparison yet';
    if (delta === 0) return 'Same as last month';
    if (delta > 0) return `Up ${delta} pts vs last month`;
    return `Down ${Math.abs(delta)} pts vs last month`;
  }

  function describeDrill(drill) {
    if (!drill) return '';
    if (drill.type === 'status') return `${drill.key} premises`;
    if (drill.type === 'priority') return `${drill.key} action items`;
    if (drill.type === 'age') return `Action items aged ${drill.key}`;
    if (drill.type === 'agePriority') {
      const bucket = AGE_BUCKETS.find(item => item.key === drill.age);
      return `${drill.priority} · ${bucket ? bucket.label : drill.age}`;
    }
    if (drill.type === 'category') return `Findings in ${drill.key}`;
    if (drill.type === 'site') return drill.site || 'Selected premises';
    if (drill.type === 'overdue') return 'Overdue inspections';
    if (drill.type === 'criticalHigh') return 'Critical and High action items';
    if (drill.type === 'dueWeek') return 'Inspections due this week';
    if (drill.type === 'dueToday') return 'Inspections due today';
    if (drill.type === 'compliant') return 'Compliant premises';
    if (drill.type === 'month') return `Inspections in ${shortAxisLabel(drill.key)}`;
    if (drill.type === 'activity') return 'Selected activity';
    return 'Filtered list';
  }

  function matchesDrill(project, actions, drill) {
    if (!drill) return { project: true, actions };
    if (drill.type === 'status') return { project: complianceStatus(project) === drill.key, actions };
    if (drill.type === 'compliant') return { project: complianceStatus(project) === 'Compliant', actions };
    if (drill.type === 'overdue') return { project: isOverdue(project), actions };
    if (drill.type === 'dueWeek') {
      const due = projectDueDate(project);
      const today = dateKey(new Date());
      return { project: !!(due && !isCompleted(project) && due >= today && due <= addDaysKey(6)), actions };
    }
    if (drill.type === 'dueToday') {
      const due = projectDueDate(project);
      return { project: !!(due && !isCompleted(project) && due === dateKey(new Date())), actions };
    }
    if (drill.type === 'month') return { project: monthKey(activityDate(project)) === drill.key, actions };
    if (drill.type === 'site') {
      const hit = (drill.projectId && project.id === drill.projectId) || siteName(project) === drill.site;
      return { project: hit, actions };
    }
    if (drill.type === 'activity') return { project: project.id === drill.projectId, actions };
    if (drill.type === 'priority') {
      const rows = actions.filter(item => item.priority === drill.key);
      return { project: rows.length > 0, actions: rows };
    }
    if (drill.type === 'criticalHigh') {
      const rows = actions.filter(item => item.priority === 'Critical' || item.priority === 'High');
      return { project: rows.length > 0, actions: rows };
    }
    if (drill.type === 'age') {
      const rows = actions.filter(item => item.ageKey === drill.key);
      return { project: rows.length > 0, actions: rows };
    }
    if (drill.type === 'agePriority') {
      const rows = actions.filter(item => item.ageKey === drill.age && item.priority === drill.priority);
      return { project: rows.length > 0, actions: rows };
    }
    if (drill.type === 'category') {
      const rows = actions.filter(item => item.category === drill.key);
      return { project: rows.length > 0, actions: rows };
    }
    return { project: true, actions };
  }

  function drillMode(drill) {
    if (!drill) return 'projects';
    if (['priority', 'criticalHigh', 'age', 'agePriority', 'category'].includes(drill.type)) return 'actions';
    return 'projects';
  }

  function openInspectionFromDashboard(projectId, itemIndex) {
    const section = byId('managementDashboardSection');
    if (section) section.style.display = 'none';
    try {
      if (itemIndex != null && itemIndex !== '' && typeof openFindingInspection === 'function') {
        openFindingInspection(projectId, Number(itemIndex));
        return;
      }
      if (typeof openProjectAndReviewFindings === 'function' && drillMode(activeDrill) === 'actions') {
        openProjectAndReviewFindings(projectId);
        return;
      }
      if (typeof openProject === 'function') openProject(projectId);
    } catch (_) {}
  }

  function drillPanelHtml(ops) {
    if (!activeDrill) {
      return `<div class="pbi-drill is-idle">Tap any number or graph segment to open the exact premises or Action Items.</div>`;
    }
    const mode = drillMode(activeDrill);
    const actionRows = [];
    const projectRows = [];
    ops.list.forEach(project => {
      const localActions = ops.actions.filter(item => item.projectId === project.id);
      const match = matchesDrill(project, localActions, activeDrill);
      if (!match.project) return;
      if (mode === 'actions') {
        match.actions.forEach(item => actionRows.push(item));
      } else {
        projectRows.push({
          projectId: project.id,
          site: siteName(project),
          inspector: inspectorName(project),
          status: complianceStatus(project),
          findings: localActions.length,
          due: projectDueDate(project) || '—'
        });
      }
    });
    const title = describeDrill(activeDrill);
    const count = mode === 'actions' ? actionRows.length : projectRows.length;
    const body = mode === 'actions'
      ? (actionRows.length
        ? `<div style="overflow-x:auto"><table class="pbi-table">
            <thead><tr><th>Site</th><th>Item</th><th>Priority</th><th>Age</th><th>Responsible</th><th></th></tr></thead>
            <tbody>${actionRows.slice(0, 20).map(row => `
              <tr>
                <td>${esc(row.site)}</td>
                <td>${esc(row.category)} · ${esc(row.question || row.itemNumber)}</td>
                <td>${esc(row.priority)}</td>
                <td>${row.ageDays}d</td>
                <td>${esc(row.responsible)}</td>
                <td><button type="button" class="pbi-open-btn" data-pbi-open="${esc(row.projectId)}" data-pbi-item="${row.itemIndex}">Open</button></td>
              </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="pbi-empty">No Action Items in this slice.</div>')
      : (projectRows.length
        ? `<div style="overflow-x:auto"><table class="pbi-table">
            <thead><tr><th>Site</th><th>Inspector</th><th>Status</th><th>Actions</th><th>Due</th><th></th></tr></thead>
            <tbody>${projectRows.slice(0, 20).map(row => `
              <tr>
                <td>${esc(row.site)}</td>
                <td>${esc(row.inspector)}</td>
                <td>${esc(row.status)}</td>
                <td>${row.findings}</td>
                <td>${esc(row.due)}</td>
                <td><button type="button" class="pbi-open-btn" data-pbi-open="${esc(row.projectId)}">Open</button></td>
              </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="pbi-empty">No premises in this slice.</div>');
    return `<div class="pbi-drill" id="pbiDrillPanel">
      <div class="pbi-drill-head">
        <h4>${esc(String(count))} · ${esc(title)}</h4>
        <button type="button" class="pbi-clear-btn" data-pbi-drill-clear>Show all</button>
      </div>
      ${body}
    </div>`;
  }

  function activityHtml(rows) {
    if (!rows.length) return '<div class="pbi-empty">No recent activity in this filter.</div>';
    return `<ul class="pbi-feed">${rows.map(row => `
      <li>
        <button type="button" class="pbi-feed-btn" ${drillAttr({ type: 'activity', projectId: row.projectId })}>
          <span class="pbi-feed-date">${esc(row.date)}</span>
          <span>${esc(row.text)}</span>
        </button>
      </li>`).join('')}</ul>`;
  }

  function render() {
    const host = byId('managementDashboardBody');
    if (!host) return;
    const all = projects();
    fillInspectorFilter(all);
    const filter = byId('pbiRangeFilter')?.value || 'all';
    const inspector = byId('pbiInspectorFilter')?.value || 'all';
    const list = filterProjects(all, filter, inspector);
    const ops = computeOps(list);
    const company = text(window.currentUserProfile?.companyName) || 'Company';

    const title = byId('pbiCompanyLabel');
    if (title) title.textContent = `${company} · live inspection data`;

    host.innerHTML = `
      <div class="pbi-ops">
        <div class="pbi-kpi-row is-four">
          ${kpi('Portfolio compliance', `${ops.compliancePct}%`, ops.compliancePct >= 70 ? 'is-ok' : 'is-warn', deltaHint(ops.delta), { type: 'compliant' })}
          ${kpi('Critical / High open', ops.criticalHigh, ops.criticalHigh ? 'is-warn' : 'is-ok', 'Open action items', { type: 'criticalHigh' })}
          ${kpi('Overdue inspections', ops.overdueInspections, ops.overdueInspections ? 'is-warn' : 'is-ok', 'Past due date', { type: 'overdue' })}
          ${kpi('Due this week', ops.dueWeek, ops.dueWeek ? 'is-gold' : '', `Today ${ops.dueToday} · This month ${ops.dueMonth}`, { type: 'dueWeek' })}
        </div>
        <div class="pbi-row pbi-row-2">
          ${tile(
            'Compliance status',
            'Tap a colour to open those premises',
            donutChart(ops.portfolio, COMPLIANCE_COLORS),
            'is-chart'
          )}
          ${tile(
            'Compliance trend',
            'Compliant share of completed inspections each month',
            lineChart(ops.trend, '#0F7B0F', { y: 'Compliance %', x: 'Month', top: 100 }),
            'is-chart'
          )}
        </div>
        <div class="pbi-row pbi-row-1">
          ${tile(
            'Actions by priority and age',
            'Critical, High, Medium and Low stacked by how long the item has been open. Tap a block or colour.',
            stackedColumnChart(
              ops.ageRows,
              PRIORITIES.map(key => ({ key, color: PRIORITY_COLORS[key] })),
              { y: 'Action items', x: 'Age (days)' }
            ),
            'is-chart'
          )}
        </div>
        <div class="pbi-row pbi-row-2">
          ${tile(
            'Worst performing premises',
            'Highest open actions and overdue first. Tap a bar.',
            barChart(ops.worst, '#b71c1c', { y: 'Premises', x: 'Open actions' }, { maxRows: 8, labelMax: 22, padL: 128 }),
            'is-chart'
          )}
          ${tile(
            'Recurring findings',
            'How many premises share the same section. Blue is the running %.',
            paretoChart(ops.recurring, '#CA5010', { y: 'Premises', x: 'Section' }),
            'is-chart'
          )}
        </div>
        <div class="pbi-row pbi-row-1">
          ${tile('Activity', 'Latest completions, action items and due dates. Tap a line.', activityHtml(ops.feed), 'is-feed')}
        </div>
        ${activeDrill ? `<div class="pbi-row pbi-row-1">${tile('Filtered list', '', drillPanelHtml(ops), 'is-drill')}</div>` : ''}
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
    activeDrill = null;
    const section = byId('managementDashboardSection');
    if (section) section.style.display = 'block';
    render();
    const count = projects().length;
    setMessage(
      count
        ? `${count} inspection(s) in this view. Tap a number or graph to open the filtered list.`
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

  function onDashboardClick(event) {
    const clear = event.target.closest('[data-pbi-drill-clear]');
    if (clear) {
      event.preventDefault();
      activeDrill = null;
      render();
      return;
    }
    const openBtn = event.target.closest('[data-pbi-open]');
    if (openBtn) {
      event.preventDefault();
      openInspectionFromDashboard(
        openBtn.getAttribute('data-pbi-open'),
        openBtn.getAttribute('data-pbi-item')
      );
      return;
    }
    const hit = event.target.closest('[data-pbi-drill]');
    if (!hit) return;
    event.preventDefault();
    try {
      activeDrill = JSON.parse(hit.getAttribute('data-pbi-drill'));
    } catch (_) {
      return;
    }
    render();
    const panel = byId('pbiDrillPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function bind() {
    const back = byId('managementDashboardBackBtn');
    const csv = byId('pbiExportBtn');
    const full = byId('pbiFullscreenBtn');
    const range = byId('pbiRangeFilter');
    const inspector = byId('pbiInspectorFilter');
    const host = byId('managementDashboardBody');
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
    if (host && !host.__fireSBound) {
      host.__fireSBound = true;
      host.addEventListener('click', onDashboardClick);
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
    stackedColumnChart,
    paretoChart,
    lineChart,
    donutChart,
    shortAxisLabel,
    categoryOf,
    isFindingItem,
    compute,
    computeOps,
    complianceStatus,
    actionRecords,
    statusBarItems,
    completedVsOverdueRows
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
