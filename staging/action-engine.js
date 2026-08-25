/* Fire-S Action Engine v103.2 - Auto Action Creation */

const FireSActionEngine = (function () {
  const COUNTER_PREFIX = 'fires_action_counter_';

  const DEFAULT_RULES = {
    'Fire Doors': { priority: 'High', responsible: 'Building Owner', dueDays: 30 },
    'Fire Extinguishers': { priority: 'Critical', responsible: 'Approved Contractor', dueDays: 14 },
    'Fire Equipment': { priority: 'High', responsible: 'Approved Contractor', dueDays: 14 },
    'Emergency Lighting': { priority: 'High', responsible: 'Electrical Contractor', dueDays: 21 },
    'Exit Signage and Emergency Lighting': { priority: 'High', responsible: 'Electrical Contractor', dueDays: 21 },
    'Means of Escape': { priority: 'Critical', responsible: 'Building Owner', dueDays: 7 },
    'Housekeeping': { priority: 'Medium', responsible: 'Site Manager', dueDays: 30 },
    'Signage': { priority: 'Low', responsible: 'Site Manager', dueDays: 60 },
    'Fire Detection and Alarm': { priority: 'High', responsible: 'Approved Contractor', dueDays: 21 },
    'Fixed Fire Suppression Systems': { priority: 'Critical', responsible: 'Approved Contractor', dueDays: 14 },
    'Documentation': { priority: 'Medium', responsible: 'Building Owner', dueDays: 30 }
  };

  let rulesCache = null;

  function getYear() {
    return new Date().getFullYear();
  }

  function nextActionId(existingActions = []) {
    const year = getYear();
    const key = `${COUNTER_PREFIX}${year}`;

    const highestExisting = (existingActions || [])
      .map(action => String(action.actionId || action.id || ''))
      .map(id => {
        const match = id.match(new RegExp(`AC-${year}-(\\d+)`));
        return match ? Number(match[1]) : 0;
      })
      .reduce((max, number) => Math.max(max, number), 0);

    const stored = Number(localStorage.getItem(key) || '0');
    const next = Math.max(stored, highestExisting) + 1;

    localStorage.setItem(key, String(next));

    return `AC-${year}-${String(next).padStart(6, '0')}`;
  }

  function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 30));
    return date.toISOString().slice(0, 10);
  }

  async function loadRules() {
    if (rulesCache) return rulesCache;

    try {
      const response = await fetch('rules.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`rules.json failed: ${response.status}`);
      rulesCache = await response.json();
    } catch (error) {
      console.warn('Fire-S Action Engine using default rules:', error);
      rulesCache = DEFAULT_RULES;
    }

    return rulesCache;
  }

  function getRulesSync() {
    return rulesCache || DEFAULT_RULES;
  }

  function normalise(value) {
    return String(value || '').trim().toLowerCase();
  }

  function findRule(sectionName = '', question = '', item = {}) {
    const rules = getRulesSync();
    const section = String(sectionName || item.sectionName || '').trim();
    const text = String(question || item['Checklist Item'] || '').trim();

    if (rules[section]) return rules[section];

    const haystack = `${section} ${text}`.toLowerCase();

    const tests = [
      ['Fire Doors', ['fire door', 'doors']],
      ['Fire Extinguishers', ['extinguisher', 'extinguishers']],
      ['Fire Equipment', ['fire equipment', 'hose reel', 'hydrant', 'fire brigade']],
      ['Emergency Lighting', ['emergency lighting']],
      ['Exit Signage and Emergency Lighting', ['exit sign', 'signage']],
      ['Means of Escape', ['escape', 'exit door', 'stairway', 'corridor', 'lobby']],
      ['Housekeeping', ['housekeeping', 'storage', 'combustible']],
      ['Fire Detection and Alarm', ['detection', 'alarm', 'detector', 'call point', 'sounder', 'panel']],
      ['Fixed Fire Suppression Systems', ['sprinkler', 'suppression', 'fixed firefighting', 'valve']],
      ['Documentation', ['certificate', 'document', 'logbook', 'record']]
    ];

    for (const [ruleName, keywords] of tests) {
      if (keywords.some(keyword => haystack.includes(keyword)) && rules[ruleName]) {
        return rules[ruleName];
      }
    }

    return { priority: item.Severity || 'Medium', responsible: 'Building Owner', dueDays: 30 };
  }

  function actionKey(data = {}) {
    return [
      data.premisesId || '',
      data.inspectionId || '',
      data.itemIndex ?? '',
      data.itemNumber || '',
      normalise(data.question || data.finding || '')
    ].join('|');
  }

  function createAction(data = {}, existingActions = []) {
    const rule = data.rule || findRule(data.sectionName, data.question, data.item || {});
    const created = new Date().toISOString();
    const dueDate = data.dueDate || addDays(rule.dueDays);

    return {
      actionId: data.actionId || nextActionId(existingActions),
      actionKey: data.actionKey || actionKey(data),
      premisesId: data.premisesId || '',
      inspectionId: data.inspectionId || '',
      inspectionNumber: data.inspectionNumber || '',
      itemIndex: data.itemIndex ?? null,
      itemNumber: data.itemNumber || '',
      sectionName: data.sectionName || '',
      question: data.question || '',
      finding: data.finding || data.nonComplianceText || data.question || '',
      correctiveAction: data.correctiveAction || '',
      reference: data.reference || '',
      priority: data.priority || rule.priority || 'Medium',
      responsible: data.responsible || rule.responsible || 'Building Owner',
      dueDate,
      status: data.status || 'Open',
      createdDate: data.createdDate || created,
      createdBy: data.createdBy || '',
      closedDate: data.closedDate || '',
      closedBy: data.closedBy || '',
      closeComment: data.closeComment || '',
      photosBefore: data.photosBefore || [],
      photosAfter: data.photosAfter || [],
      comments: data.comments || [],
      history: data.history || [
        { event: 'Created', date: created, note: 'Created automatically from NO checklist answer.' }
      ]
    };
  }

  function closeAction(action, reason = 'Answer changed from NO') {
    if (!action || action.status === 'Closed') return action;

    return {
      ...action,
      status: 'Closed',
      closedDate: new Date().toISOString(),
      closeComment: action.closeComment || reason,
      history: [
        ...(action.history || []),
        { event: 'Closed', date: new Date().toISOString(), note: reason }
      ]
    };
  }

  function reopenAction(action, reason = 'Answer changed back to NO') {
    if (!action) return action;

    return {
      ...action,
      status: 'Open',
      closedDate: '',
      closeComment: '',
      history: [
        ...(action.history || []),
        { event: 'Reopened', date: new Date().toISOString(), note: reason }
      ]
    };
  }

  function syncProjectActions(project, checklist = [], options = {}) {
    if (!project) return project;

    const existingActions = Array.isArray(project.actions) ? project.actions : [];
    let actions = [...existingActions];
    const answers = Array.isArray(project.answers) ? project.answers : [];
    const seenNoKeys = new Set();

    answers.forEach(answer => {
      const answerValue = normalise(answer.answer);
      const itemIndex = Number.isFinite(Number(answer.itemIndex)) ? Number(answer.itemIndex) : answers.indexOf(answer);
      const item = checklist[itemIndex] || {};
      const sectionName = item.sectionName || item._sectionName || answer.sectionName || '';
      const question = item['Checklist Item'] || answer.question || answer.item || `Checklist item ${itemIndex + 1}`;
      const key = actionKey({
        premisesId: project.id,
        inspectionId: project.id,
        itemIndex,
        itemNumber: answer.itemNumber || item['Item Number'] || String(itemIndex + 1),
        question
      });

      if (answerValue === 'no') {
        seenNoKeys.add(key);
        const existingIndex = actions.findIndex(action => action.actionKey === key && action.status !== 'Closed');

        if (existingIndex === -1) {
          const closedIndex = actions.findIndex(action => action.actionKey === key && action.status === 'Closed');

          if (closedIndex !== -1) {
            actions[closedIndex] = reopenAction(actions[closedIndex]);
          } else {
            actions.push(createAction({
              premisesId: project.id,
              inspectionId: project.id,
              inspectionNumber: project.inspectionNumber || '',
              itemIndex,
              itemNumber: answer.itemNumber || item['Item Number'] || String(itemIndex + 1),
              sectionName,
              question,
              finding: item['Non Compliance Text'] || answer.note || question,
              correctiveAction: item['Corrective Action'] || '',
              reference: item.Reference || '',
              priority: item.Severity || '',
              createdBy: project.inspectorName || '',
              item,
              actionKey: key
            }, actions));
          }
        }
      }
    });

    actions = actions.map(action => {
      if (
        action.status !== 'Closed' &&
        action.inspectionId === project.id &&
        action.actionKey &&
        !seenNoKeys.has(action.actionKey)
      ) {
        return closeAction(action, 'Checklist answer is no longer NO.');
      }

      return action;
    });

    return {
      ...project,
      actions,
      actionEngineUpdatedAt: new Date().toISOString()
    };
  }

  function getOpenActions(project) {
    return (project?.actions || []).filter(action => action.status !== 'Closed');
  }

  function getStats(project) {
    const open = getOpenActions(project);
    return {
      total: (project?.actions || []).length,
      open: open.length,
      critical: open.filter(a => a.priority === 'Critical').length,
      high: open.filter(a => a.priority === 'High').length,
      medium: open.filter(a => a.priority === 'Medium').length,
      low: open.filter(a => a.priority === 'Low').length,
      closed: (project?.actions || []).filter(action => action.status === 'Closed').length
    };
  }

  loadRules();

  return {
    loadRules,
    getRulesSync,
    nextActionId,
    createAction,
    closeAction,
    reopenAction,
    syncProjectActions,
    getOpenActions,
    getStats,
    findRule
  };
})();

window.FireSActionEngine = FireSActionEngine;
