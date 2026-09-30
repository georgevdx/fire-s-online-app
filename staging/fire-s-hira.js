/* ============================================================
   Fire-S toets-blad · OHS HIRA (module 1)
   Separate from fire inspections. Records stay in this browser
   under fireS.hira.v1. Live Fire-S does not load this file.
   ============================================================ */
(function fireSHira(root) {
  'use strict';

  var STORE_KEY = 'fireS.hira.v1';

  var LIBRARY = [
    { id: 'physical', name: 'Physical', examples: ['Noise', 'Vibration', 'Heat', 'Cold', 'Radiation'] },
    { id: 'mechanical', name: 'Mechanical', examples: ['Moving machinery', 'Crushing', 'Cutting', 'Entanglement'] },
    { id: 'electrical', name: 'Electrical', examples: ['Shock', 'Arc flash', 'Damaged cables'] },
    { id: 'fire', name: 'Fire & Explosion', examples: ['Ignition', 'Flammables', 'LPG', 'Hot work'] },
    { id: 'chemical', name: 'Chemical', examples: ['Solvents', 'Gases', 'Corrosives', 'Dust'] },
    { id: 'biological', name: 'Biological', examples: ['Bacteria', 'Viruses', 'Contaminated waste'] },
    { id: 'ergonomic', name: 'Ergonomic', examples: ['Lifting', 'Repetitive work', 'Workstation design'] },
    { id: 'height', name: 'Working at Height', examples: ['Ladders', 'Roofs', 'Scaffolding'] },
    { id: 'slips', name: 'Slips/Trips/Falls', examples: ['Floors', 'Stairs', 'Obstructions'] },
    { id: 'vehicles', name: 'Vehicles', examples: ['Forklifts', 'Trucks', 'Reversing vehicles'] },
    { id: 'pressure', name: 'Pressure Systems', examples: ['Compressors', 'Cylinders', 'Pressure vessels'] },
    { id: 'confined', name: 'Confined Spaces', examples: ['Tanks', 'Pits', 'Chambers'] },
    { id: 'environmental', name: 'Environmental', examples: ['Spills', 'Emissions', 'Waste'] },
    { id: 'psychosocial', name: 'Psychosocial', examples: ['Fatigue', 'Workload', 'Violence'] },
    { id: 'workplace', name: 'Workplace', examples: ['Lighting', 'Ventilation', 'Housekeeping'] },
    { id: 'emergency', name: 'Emergency', examples: ['Fire', 'Evacuation', 'Medical emergency'] },
    { id: 'security', name: 'Security', examples: ['Violence', 'Unauthorised access'] },
    { id: 'public', name: 'Public/Visitor', examples: ['Interaction with workplace activities'] }
  ];

  var LIKELIHOOD = [
    { score: 1, name: 'Rare', detail: 'Highly unlikely to occur' },
    { score: 2, name: 'Unlikely', detail: 'Could occur, but not expected' },
    { score: 3, name: 'Possible', detail: 'May occur occasionally' },
    { score: 4, name: 'Likely', detail: 'Expected to occur' },
    { score: 5, name: 'Almost Certain', detail: 'Expected frequently' }
  ];

  var SEVERITY = [
    { score: 1, name: 'Insignificant', detail: 'No injury / negligible impact' },
    { score: 2, name: 'Minor', detail: 'First-aid injury / minor damage' },
    { score: 3, name: 'Moderate', detail: 'Medical treatment / lost-time injury' },
    { score: 4, name: 'Major', detail: 'Serious injury / permanent disability / major loss' },
    { score: 5, name: 'Catastrophic', detail: 'Fatality / multiple serious injuries / catastrophic loss' }
  ];

  var HIERARCHY = ['Eliminate', 'Substitute', 'Engineering', 'Administrative', 'PPE'];
  var EXPOSED = [
    ['employees', 'Employees'],
    ['contractors', 'Contractors'],
    ['visitors', 'Visitors'],
    ['public', 'Public'],
    ['vulnerable', 'Vulnerable employees'],
    ['other', 'Other']
  ];
  var TRIGGERS = [
    ['incident', 'Incident'],
    ['nearMiss', 'Near miss'],
    ['equipment', 'New equipment'],
    ['process', 'Process change'],
    ['chemicals', 'Chemicals change'],
    ['layout', 'Workplace layout change'],
    ['control', 'Control found ineffective'],
    ['legislation', 'Legislation or requirements change'],
    ['scheduled', 'Scheduled review date reached']
  ];

  function score(likelihood, severity) {
    var l = Number(likelihood) || 0;
    var s = Number(severity) || 0;
    if (l < 1 || l > 5 || s < 1 || s > 5) return 0;
    return l * s;
  }

  function band(rating) {
    var r = Number(rating) || 0;
    if (r <= 0) return '';
    if (r <= 4) return 'Low';
    if (r <= 9) return 'Moderate';
    if (r <= 16) return 'High';
    return 'Critical';
  }

  function responseFor(rating) {
    var name = band(rating);
    if (name === 'Low') return 'Maintain controls';
    if (name === 'Moderate') return 'Monitor and improve where reasonably practicable';
    if (name === 'High') return 'Further controls required; management attention';
    if (name === 'Critical') return 'Activity not to proceed until risk is reduced';
    return '';
  }

  function bandClass(name) {
    return String(name || '').toLowerCase();
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function esc(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uid() {
    return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function plusYear(iso) {
    var parts = text(iso).split('-');
    var year = Number(parts[0]);
    if (!year) return '';
    return (year + 1) + '-' + (parts[1] || '01') + '-' + (parts[2] || '01');
  }

  function showDate(iso) {
    var parts = text(iso).split('-');
    if (parts.length !== 3) return text(iso);
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function blankExposed() {
    return { employees: false, contractors: false, visitors: false, public: false, vulnerable: false, other: false };
  }

  function blankTriggers() {
    var out = {};
    TRIGGERS.forEach(function (row) { out[row[0]] = false; });
    return out;
  }

  function blankControl() {
    return { text: '', hierarchy: 'Engineering' };
  }

  function blankAction() {
    return {
      id: uid(),
      finding: '',
      required: '',
      person: '',
      priority: 'High',
      target: '',
      status: 'Open',
      evidenceRequired: true,
      evidenceNote: '',
      completed: '',
      verifiedBy: ''
    };
  }

  function blankHazard() {
    return {
      id: uid(),
      category: 'mechanical',
      example: '',
      activity: '',
      hazard: '',
      event: '',
      consequence: '',
      who: blankExposed(),
      existingControls: [blankControl()],
      initialL: 3,
      initialS: 3,
      additionalControls: [blankControl()],
      residualL: 2,
      residualS: 3,
      actions: []
    };
  }

  function blankAssessment(list) {
    var year = new Date().getFullYear();
    var n = (list || []).length + 1;
    var seq = String(n);
    while (seq.length < 3) seq = '0' + seq;
    var company = '';
    try {
      company = text(root.currentUserProfile && root.currentUserProfile.companyName);
    } catch (_) {}
    var date = todayISO();
    return {
      id: uid(),
      number: 'HIRA-' + year + '-' + seq,
      company: company,
      site: '',
      department: '',
      area: '',
      type: 'baseline',
      activity: '',
      date: date,
      assessor: '',
      manager: '',
      consulted: '',
      reviewDate: plusYear(date),
      status: 'draft',
      exposed: blankExposed(),
      exposedOther: '',
      hazards: [blankHazard()],
      triggers: blankTriggers()
    };
  }

  function load() {
    try {
      var raw = root.localStorage.getItem(STORE_KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (!data || !Array.isArray(data.assessments)) return { assessments: [] };
      return data;
    } catch (_) {
      return { assessments: [] };
    }
  }

  function save(data) {
    root.localStorage.setItem(STORE_KEY, JSON.stringify(data));
    return data;
  }

  function hazardScore(hazard, which) {
    if (which === 'residual') return score(hazard.residualL, hazard.residualS);
    return score(hazard.initialL, hazard.initialS);
  }

  function countBands(hazards, which) {
    var counts = { Critical: 0, High: 0, Moderate: 0, Low: 0 };
    (hazards || []).forEach(function (hazard) {
      var name = band(hazardScore(hazard, which));
      if (counts[name] != null) counts[name] += 1;
    });
    return counts;
  }

  function openActions(assessment) {
    var n = 0;
    var overdue = 0;
    var today = todayISO();
    (assessment.hazards || []).forEach(function (hazard) {
      (hazard.actions || []).forEach(function (action) {
        if (text(action.status) === 'Open') {
          n += 1;
          if (text(action.target) && text(action.target) < today) overdue += 1;
        }
      });
    });
    return { open: n, overdue: overdue };
  }

  function summarise(list) {
    var activeHazards = 0;
    var counts = { Critical: 0, High: 0, Moderate: 0, Low: 0 };
    var initialSum = 0;
    var residualSum = 0;
    var open = 0;
    var overdue = 0;
    (list || []).forEach(function (assessment) {
      if (text(assessment.status) === 'closed') return;
      (assessment.hazards || []).forEach(function (hazard) {
        activeHazards += 1;
        var initial = hazardScore(hazard, 'initial');
        var residual = hazardScore(hazard, 'residual');
        initialSum += initial;
        residualSum += residual;
        var name = band(residual || initial);
        if (counts[name] != null) counts[name] += 1;
      });
      var actions = openActions(assessment);
      open += actions.open;
      overdue += actions.overdue;
    });
    var reduction = initialSum > 0 ? Math.round(((initialSum - residualSum) / initialSum) * 1000) / 10 : 0;
    return {
      activeHazards: activeHazards,
      counts: counts,
      open: open,
      overdue: overdue,
      initialSum: initialSum,
      residualSum: residualSum,
      reduction: reduction
    };
  }

  var api = {
    LIBRARY: LIBRARY,
    LIKELIHOOD: LIKELIHOOD,
    SEVERITY: SEVERITY,
    HIERARCHY: HIERARCHY,
    score: score,
    band: band,
    responseFor: responseFor,
    blankAssessment: blankAssessment,
    summarise: summarise,
    load: load,
    save: save,
    countBands: countBands
  };
  root.fireSHira = api;

  function doc() {
    return root.document;
  }

  function byId(id) {
    var document = doc();
    if (!document || typeof document.getElementById !== 'function') return null;
    return document.getElementById(id);
  }

  if (!doc() || typeof doc().getElementById !== 'function') return;

  var view = 'register';
  var editingId = '';

  function store() {
    return load();
  }

  function findAssessment(id) {
    var data = store();
    for (var i = 0; i < data.assessments.length; i += 1) {
      if (data.assessments[i].id === id) return data.assessments[i];
    }
    return null;
  }

  function categoryById(id) {
    for (var i = 0; i < LIBRARY.length; i += 1) {
      if (LIBRARY[i].id === id) return LIBRARY[i];
    }
    return LIBRARY[0];
  }

  function options(list, selected, valueKey, labelKey) {
    return list.map(function (item) {
      var value = valueKey ? item[valueKey] : item;
      var label = labelKey ? item[labelKey] : item;
      var on = String(value) === String(selected) ? ' selected' : '';
      return '<option value="' + esc(value) + '"' + on + '>' + esc(label) + '</option>';
    }).join('');
  }

  function scoreOptions(selected, scale) {
    return (scale || []).map(function (item) {
      var on = Number(selected) === item.score ? ' selected' : '';
      return '<option value="' + item.score + '"' + on + '>' + item.score + ' ' + esc(item.name) + ' — ' + esc(item.detail) + '</option>';
    }).join('');
  }

  function matrixTable(likelihood, severity, hazardIndex, which) {
    var html = '<table class="fire-s-hira-matrix"><thead><tr><th>Likelihood \\ Severity</th>';
    SEVERITY.forEach(function (item) {
      html += '<th>' + item.score + ' ' + esc(item.name) + '</th>';
    });
    html += '</tr></thead><tbody>';
    for (var l = 5; l >= 1; l -= 1) {
      var row = LIKELIHOOD[l - 1];
      html += '<tr><th>' + l + ' ' + esc(row.name) + '</th>';
      for (var s = 1; s <= 5; s += 1) {
        var rating = score(l, s);
        var name = band(rating);
        var picked = Number(likelihood) === l && Number(severity) === s ? ' is-picked' : '';
        html += '<td class="is-' + bandClass(name) + picked + '"><button type="button" class="hira-matrix" data-hazard="' + hazardIndex + '" data-which="' + which + '" data-l="' + l + '" data-s="' + s + '">' + rating + '</button></td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function badge(likelihood, severity) {
    var rating = score(likelihood, severity);
    var name = band(rating);
    if (!name) return '';
    return '<span class="fire-s-hira-badge is-' + bandClass(name) + '">' + rating + ' ' + name + '</span><span>' + esc(responseFor(rating)) + '</span>';
  }

  function hideSection() {
    var section = byId('fireSHiraSection');
    if (!section) return;
    section.hidden = true;
    if (section.style) section.style.display = 'none';
  }

  function showSection() {
    var section = byId('fireSHiraSection');
    var home = byId('homeSection');
    if (home && home.style) home.style.display = 'none';
    if (!section) return;
    section.hidden = false;
    if (section.style) section.style.display = 'block';
    try { section.scrollIntoView({ block: 'start' }); } catch (_) {}
  }

  function paint() {
    var mount = byId('fireSHiraRoot');
    if (!mount) return;
    mount.innerHTML = view === 'edit' ? editHtml() : registerHtml();
  }

  function openRegister() {
    view = 'register';
    editingId = '';
    showSection();
    paint();
  }

  function openEditor(id) {
    view = 'edit';
    editingId = id;
    showSection();
    paint();
  }

  function registerHtml() {
    var data = store();
    var summary = summarise(data.assessments);
    var rows = data.assessments.map(function (assessment) {
      var counts = countBands(assessment.hazards, 'residual');
      var actions = openActions(assessment);
      return '<tr>' +
        '<td>' + esc(assessment.number) + '</td>' +
        '<td>' + esc(assessment.area || assessment.site || '—') + '</td>' +
        '<td>' + (assessment.hazards || []).length + '</td>' +
        '<td>' + counts.Critical + '</td>' +
        '<td>' + counts.High + '</td>' +
        '<td>' + counts.Moderate + '</td>' +
        '<td>' + counts.Low + '</td>' +
        '<td>' + actions.open + '</td>' +
        '<td><button type="button" class="hira-btn secondary" data-hira-open="' + esc(assessment.id) + '">Open</button></td>' +
        '</tr>';
    }).join('');
    var empty = data.assessments.length
      ? ''
      : '<p class="fire-s-hira-empty">No HIRA yet. Start a baseline, issue-based or task-based assessment.</p>';
    return '<p class="fire-s-hira-kicker">Toets-blad · Module 1</p>' +
      '<p class="fire-s-hira-lead">Hazard identification and risk assessment. Fire inspections stay separate. These HIRA records stay in this browser.</p>' +
      '<div class="fire-s-hira-tiles">' +
      tile(summary.activeHazards, 'Active risks') +
      tile(summary.counts.Critical, 'Critical', 'is-critical') +
      tile(summary.counts.High, 'High', 'is-high') +
      tile(summary.overdue, 'Overdue actions', 'is-critical') +
      tile(summary.reduction + '%', 'Risk reduction', 'is-good') +
      '</div>' +
      '<p class="fire-s-hira-note">Initial risk total ' + summary.initialSum + ' → residual ' + summary.residualSum + '. The 1–4 / 5–9 / 10–16 / 17–25 bands are this toets method, not a number fixed by the OHS Act.</p>' +
      '<div class="fire-s-hira-toolbar"><button type="button" class="hira-btn" id="fireSHiraNewBtn">New HIRA</button></div>' +
      (rows
        ? '<table class="fire-s-hira-table"><thead><tr><th>HIRA</th><th>Area</th><th>Hazards</th><th>Critical</th><th>High</th><th>Moderate</th><th>Low</th><th>Open actions</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
        : empty);
  }

  function tile(value, label, cls) {
    return '<div class="fire-s-hira-tile ' + (cls || '') + '"><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span></div>';
  }

  function checks(name, selected, hazardIndex) {
    var prefix = hazardIndex == null ? '' : ' data-hazard="' + hazardIndex + '"';
    return EXPOSED.map(function (row) {
      var on = selected && selected[row[0]] ? ' checked' : '';
      return '<label><input type="checkbox" data-check="' + row[0] + '"' + prefix + on + '> ' + esc(row[1]) + '</label>';
    }).join('');
  }

  function controlsHtml(list, hazardIndex, which) {
    return (list || []).map(function (control, index) {
      return '<div class="fire-s-hira-grid">' +
        '<label>Control<input data-hazard="' + hazardIndex + '" data-list="' + which + '" data-index="' + index + '" data-part="text" value="' + esc(control.text) + '"></label>' +
        '<label>Hierarchy<select data-hazard="' + hazardIndex + '" data-list="' + which + '" data-index="' + index + '" data-part="hierarchy">' + options(HIERARCHY, control.hierarchy) + '</select></label>' +
        '</div>';
    }).join('') + '<button type="button" class="hira-btn secondary" data-add-control="' + which + '" data-hazard="' + hazardIndex + '">Add ' + (which === 'existing' ? 'existing' : 'additional') + ' control</button>';
  }

  function actionsHtml(hazard, hazardIndex) {
    var rows = (hazard.actions || []).map(function (action, index) {
      return '<div class="fire-s-hira-grid">' +
        field('Finding', '<input data-hazard="' + hazardIndex + '" data-action="' + index + '" data-part="finding" value="' + esc(action.finding) + '">') +
        field('Required action', '<input data-hazard="' + hazardIndex + '" data-action="' + index + '" data-part="required" value="' + esc(action.required) + '">') +
        field('Responsible person', '<input data-hazard="' + hazardIndex + '" data-action="' + index + '" data-part="person" value="' + esc(action.person) + '">') +
        field('Priority', '<select data-hazard="' + hazardIndex + '" data-action="' + index + '" data-part="priority">' + options(['Low', 'Moderate', 'High', 'Critical'], action.priority) + '</select>') +
        field('Target date', '<input type="date" data-hazard="' + hazardIndex + '" data-action="' + index + '" data-part="target" value="' + esc(action.target) + '">') +
        field('Status', '<select data-hazard="' + hazardIndex + '" data-action="' + index + '" data-part="status">' + options(['Open', 'Done'], action.status) + '</select>') +
        field('Evidence', '<input data-hazard="' + hazardIndex + '" data-action="' + index + '" data-part="evidenceNote" value="' + esc(action.evidenceNote) + '" placeholder="Photo or document">') +
        field('Completed date', '<input type="date" data-hazard="' + hazardIndex + '" data-action="' + index + '" data-part="completed" value="' + esc(action.completed) + '">') +
        field('Verified by', '<input data-hazard="' + hazardIndex + '" data-action="' + index + '" data-part="verifiedBy" value="' + esc(action.verifiedBy) + '">') +
        '</div>' +
        '<label><input type="checkbox" data-hazard="' + hazardIndex + '" data-action="' + index + '" data-part="evidenceRequired"' + (action.evidenceRequired ? ' checked' : '') + '> Evidence required</label>';
    }).join('');
    return rows + '<button type="button" class="hira-btn secondary" data-add-action="' + hazardIndex + '">Add action</button>';
  }

  function field(label, control) {
    return '<label>' + esc(label) + control + '</label>';
  }

  function editHtml() {
    var assessment = findAssessment(editingId) || blankAssessment(store().assessments);
    var hazards = (assessment.hazards || []).map(function (hazard, index) {
      var category = categoryById(hazard.category);
      var initial = score(hazard.initialL, hazard.initialS);
      var residual = score(hazard.residualL, hazard.residualS);
      return '<article class="fire-s-hira-card">' +
        '<h3>Hazard ' + (index + 1) + '</h3>' +
        '<div class="fire-s-hira-grid">' +
        field('Category', '<select data-hazard="' + index + '" data-field="category">' + options(LIBRARY, hazard.category, 'id', 'name') + '</select>') +
        field('Library example', '<select data-hazard="' + index + '" data-field="example"><option value="">Choose an example</option>' + options(category.examples, hazard.example) + '</select>') +
        field('Activity', '<input data-hazard="' + index + '" data-field="activity" value="' + esc(hazard.activity) + '">') +
        field('Hazard', '<input data-hazard="' + index + '" data-field="hazard" value="' + esc(hazard.hazard) + '">') +
        field('Potential event', '<input data-hazard="' + index + '" data-field="event" value="' + esc(hazard.event) + '">') +
        field('Consequence', '<input data-hazard="' + index + '" data-field="consequence" value="' + esc(hazard.consequence) + '">') +
        '</div>' +
        '<h4>Who may be harmed?</h4><div class="fire-s-hira-checks">' + checks('who', hazard.who, index) + '</div>' +
        '<h4>Existing controls</h4>' + controlsHtml(hazard.existingControls, index, 'existing') +
        '<h4>Initial risk</h4>' +
        '<div class="fire-s-hira-grid">' +
        field('Likelihood', '<select data-hazard="' + index + '" data-field="initialL">' + scoreOptions(hazard.initialL, LIKELIHOOD) + '</select>') +
        field('Severity', '<select data-hazard="' + index + '" data-field="initialS">' + scoreOptions(hazard.initialS, SEVERITY) + '</select>') +
        '</div>' + badge(hazard.initialL, hazard.initialS) + matrixTable(hazard.initialL, hazard.initialS, index, 'initial') +
        '<h4>Additional controls</h4><p class="fire-s-hira-note">Prefer eliminate, then substitute, engineering, administrative, and PPE last.</p>' +
        controlsHtml(hazard.additionalControls, index, 'additional') +
        '<h4>Residual risk</h4>' +
        '<div class="fire-s-hira-grid">' +
        field('Likelihood', '<select data-hazard="' + index + '" data-field="residualL">' + scoreOptions(hazard.residualL, LIKELIHOOD) + '</select>') +
        field('Severity', '<select data-hazard="' + index + '" data-field="residualS">' + scoreOptions(hazard.residualS, SEVERITY) + '</select>') +
        '</div>' + badge(hazard.residualL, hazard.residualS) + matrixTable(hazard.residualL, hazard.residualS, index, 'residual') +
        '<p class="fire-s-hira-flow">INITIAL RISK: ' + initial + ' ' + band(initial) + ' → RESIDUAL RISK: ' + residual + ' ' + band(residual) + '</p>' +
        '<h4>Action items</h4>' + actionsHtml(hazard, index) +
        '</article>';
    }).join('');
    return '<p class="fire-s-hira-kicker">' + esc(assessment.number) + '</p>' +
      '<div class="fire-s-hira-toolbar"><button type="button" class="hira-btn secondary" id="fireSHiraCancelBtn">Back to register</button></div>' +
      '<div class="fire-s-hira-grid">' +
      field('HIRA No.', '<input data-field="number" value="' + esc(assessment.number) + '">') +
      field('Company', '<input data-field="company" value="' + esc(assessment.company) + '">') +
      field('Site / Premises', '<input data-field="site" value="' + esc(assessment.site) + '">') +
      field('Department', '<input data-field="department" value="' + esc(assessment.department) + '">') +
      field('Area', '<input data-field="area" value="' + esc(assessment.area) + '">') +
      field('HIRA type', '<select data-field="type">' + options([['baseline', 'Baseline'], ['issue', 'Issue-Based'], ['task', 'Task-Based']], assessment.type, '0', '1') + '</select>') +
      field('Activity / Process', '<input data-field="activity" value="' + esc(assessment.activity) + '">') +
      field('Assessment date', '<input type="date" data-field="date" value="' + esc(assessment.date) + '">') +
      field('Assessor', '<input data-field="assessor" value="' + esc(assessment.assessor) + '">') +
      field('Responsible manager', '<input data-field="manager" value="' + esc(assessment.manager) + '">') +
      field('Employees consulted', '<input data-field="consulted" value="' + esc(assessment.consulted) + '">') +
      field('Review date', '<input type="date" data-field="reviewDate" value="' + esc(assessment.reviewDate) + '">') +
      field('Status', '<select data-field="status">' + options([['draft', 'Draft'], ['active', 'Active'], ['review_due', 'Review Due'], ['closed', 'Closed']], assessment.status, '0', '1') + '</select>') +
      '</div>' +
      '<h3>Persons potentially exposed</h3><div class="fire-s-hira-checks">' + checks('exposed', assessment.exposed, null) + '</div>' +
      field('Other exposed persons', '<input data-field="exposedOther" value="' + esc(assessment.exposedOther) + '">') +
      hazards +
      '<div class="fire-s-hira-toolbar"><button type="button" class="hira-btn secondary" id="fireSHiraAddHazard">Add hazard</button></div>' +
      '<h3>Review triggers</h3><div class="fire-s-hira-checks">' + TRIGGERS.map(function (row) {
        var on = assessment.triggers && assessment.triggers[row[0]] ? ' checked' : '';
        return '<label><input type="checkbox" data-trigger="' + row[0] + '"' + on + '> ' + esc(row[1]) + '</label>';
      }).join('') + '</div>' +
      '<div class="fire-s-hira-actions"><button type="button" class="hira-btn" id="fireSHiraSaveBtn">Save HIRA</button></div>';
  }

  function readEditor() {
    var mount = byId('fireSHiraRoot');
    var current = findAssessment(editingId) || blankAssessment([]);
    var copy = JSON.parse(JSON.stringify(current));
    if (!mount) return copy;
    mount.querySelectorAll('[data-field]').forEach(function (el) {
      if (el.getAttribute('data-hazard') != null) return;
      copy[el.getAttribute('data-field')] = el.value;
    });
    copy.exposed = blankExposed();
    mount.querySelectorAll('[data-check]').forEach(function (el) {
      if (el.getAttribute('data-hazard') != null) return;
      copy.exposed[el.getAttribute('data-check')] = !!el.checked;
    });
    copy.triggers = blankTriggers();
    mount.querySelectorAll('[data-trigger]').forEach(function (el) {
      copy.triggers[el.getAttribute('data-trigger')] = !!el.checked;
    });
    copy.hazards = (copy.hazards || []).map(function (hazard, index) {
      var next = JSON.parse(JSON.stringify(hazard));
      mount.querySelectorAll('[data-hazard="' + index + '"][data-field]').forEach(function (el) {
        var key = el.getAttribute('data-field');
        next[key] = el.type === 'number' || /L$|S$/.test(key) ? Number(el.value) : el.value;
      });
      next.who = blankExposed();
      mount.querySelectorAll('[data-hazard="' + index + '"][data-check]').forEach(function (el) {
        next.who[el.getAttribute('data-check')] = !!el.checked;
      });
      ['existing', 'additional'].forEach(function (which) {
        var key = which === 'existing' ? 'existingControls' : 'additionalControls';
        next[key] = (hazard[key] || []).map(function (control, controlIndex) {
          var textEl = mount.querySelector('[data-hazard="' + index + '"][data-list="' + which + '"][data-index="' + controlIndex + '"][data-part="text"]');
          var rankEl = mount.querySelector('[data-hazard="' + index + '"][data-list="' + which + '"][data-index="' + controlIndex + '"][data-part="hierarchy"]');
          return {
            text: textEl ? textEl.value : control.text,
            hierarchy: rankEl ? rankEl.value : control.hierarchy
          };
        });
      });
      next.actions = (hazard.actions || []).map(function (action, actionIndex) {
        var nextAction = JSON.parse(JSON.stringify(action));
        mount.querySelectorAll('[data-hazard="' + index + '"][data-action="' + actionIndex + '"]').forEach(function (el) {
          var part = el.getAttribute('data-part');
          nextAction[part] = el.type === 'checkbox' ? !!el.checked : el.value;
        });
        return nextAction;
      });
      if (next.example && !text(next.hazard)) next.hazard = next.example;
      return next;
    });
    return copy;
  }

  function persistEditor() {
    var copy = readEditor();
    var data = store();
    var replaced = false;
    data.assessments = data.assessments.map(function (assessment) {
      if (assessment.id !== copy.id) return assessment;
      replaced = true;
      return copy;
    });
    if (!replaced) data.assessments.push(copy);
    save(data);
    editingId = copy.id;
    return copy;
  }

  function onClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('#cmdHiraBtn')) {
      event.preventDefault();
      openRegister();
      return;
    }
    if (target.closest('#fireSHiraBackBtn') || target.closest('#fireSHiraCancelBtn')) {
      event.preventDefault();
      if (view === 'edit') openRegister();
      else {
        hideSection();
        var home = byId('homeSection');
        if (home && home.style) home.style.display = 'block';
        try {
          if (typeof root.showHome === 'function' && !root.showHome.__fireSHiraWrapped) root.showHome();
        } catch (_) {}
      }
      return;
    }
    if (target.closest('#fireSHiraNewBtn')) {
      event.preventDefault();
      var created = blankAssessment(store().assessments);
      var data = store();
      data.assessments.push(created);
      save(data);
      openEditor(created.id);
      return;
    }
    var openBtn = target.closest('[data-hira-open]');
    if (openBtn) {
      event.preventDefault();
      openEditor(openBtn.getAttribute('data-hira-open'));
      return;
    }
    if (target.closest('#fireSHiraAddHazard')) {
      event.preventDefault();
      var withHazard = persistEditor();
      withHazard.hazards.push(blankHazard());
      var pack = store();
      pack.assessments = pack.assessments.map(function (assessment) {
        return assessment.id === withHazard.id ? withHazard : assessment;
      });
      save(pack);
      paint();
      return;
    }
    var addControl = target.closest('[data-add-control]');
    if (addControl) {
      event.preventDefault();
      var edited = persistEditor();
      var hazardIndex = Number(addControl.getAttribute('data-hazard'));
      var listName = addControl.getAttribute('data-add-control') === 'existing' ? 'existingControls' : 'additionalControls';
      edited.hazards[hazardIndex][listName].push(blankControl());
      replaceAssessment(edited);
      paint();
      return;
    }
    var addAction = target.closest('[data-add-action]');
    if (addAction) {
      event.preventDefault();
      var actionHost = persistEditor();
      actionHost.hazards[Number(addAction.getAttribute('data-add-action'))].actions.push(blankAction());
      replaceAssessment(actionHost);
      paint();
      return;
    }
    if (target.closest('#fireSHiraSaveBtn')) {
      event.preventDefault();
      persistEditor();
      openRegister();
      return;
    }
    var cell = target.closest('.hira-matrix');
    if (cell) {
      event.preventDefault();
      var model = findAssessment(editingId);
      if (!model) return;
      syncWithoutPaint();
      var hIndex = Number(cell.getAttribute('data-hazard'));
      var which = cell.getAttribute('data-which');
      model = findAssessment(editingId);
      if (which === 'residual') {
        model.hazards[hIndex].residualL = Number(cell.getAttribute('data-l'));
        model.hazards[hIndex].residualS = Number(cell.getAttribute('data-s'));
      } else {
        model.hazards[hIndex].initialL = Number(cell.getAttribute('data-l'));
        model.hazards[hIndex].initialS = Number(cell.getAttribute('data-s'));
      }
      replaceAssessment(model);
      paint();
    }
  }

  function syncWithoutPaint() {
    if (view !== 'edit' || !editingId) return;
    persistEditor();
  }

  function replaceAssessment(assessment) {
    var data = store();
    data.assessments = data.assessments.map(function (item) {
      return item.id === assessment.id ? assessment : item;
    });
    save(data);
  }

  function bind() {
    var document = doc();
    if (!document || document.__fireSHiraBound) return;
    document.__fireSHiraBound = true;
    document.addEventListener('click', onClick, true);
    if (typeof root.showHome === 'function' && !root.showHome.__fireSHiraWrapped) {
      var previous = root.showHome;
      var wrapped = function () {
        hideSection();
        return previous.apply(this, arguments);
      };
      wrapped.__fireSHiraWrapped = true;
      root.showHome = wrapped;
    }
  }

  if (doc().readyState === 'loading') {
    doc().addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})(typeof window !== 'undefined' ? window : globalThis);
