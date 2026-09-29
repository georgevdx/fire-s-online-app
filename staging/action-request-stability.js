/* Fire-S action request stability
   One path for checklist actions on the toets-blad:
   1. A NO answer keeps a single action for that checklist item.
   2. Refreshing the register must not reset the due date, responsible person,
      priority, or a resolve the inspector already saved.
   3. Changing the answer away from NO removes that generated action.
   4. A later NO starts a new open action.
   5. A background sync must not replace a filled checklist with an empty one.
*/
(function fireSActionRequestStability(root) {
  'use strict';

  var FIELDS = [
    'actionId', 'actionKey', 'premisesId', 'inspectionId', 'inspectionNumber',
    'itemIndex', 'itemNumber', 'sectionName', 'category', 'question', 'finding',
    'correctiveAction', 'reference', 'priority', 'responsible', 'dueDate', 'status',
    'createdDate', 'createdBy', 'closedDate', 'closedBy', 'closeComment', 'source',
    'generatedBy', 'photosBefore', 'photosAfter', 'comments', 'history', 'userNotes'
  ];

  function norm(value) {
    return String(value || '').trim().toLowerCase();
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function canonicalKey(project, itemIndex, itemNumber, question) {
    var idx = Number.isFinite(Number(itemIndex)) ? Number(itemIndex) : '';
    var number = clean(itemNumber || (idx === '' ? '' : String(idx + 1)));
    return [
      (project && project.id) || 'premises',
      idx,
      number,
      norm(question)
    ].join('|');
  }

  function isGenerated(action) {
    if (!action || action.manual === true) return false;
    if (action.liveOnly) return true;
    if (action.source === 'NO answer' || action.generatedBy) return true;
    var id = String(action.actionId || '');
    return /^ACT-/.test(id) || /^AC-/.test(id) || /^LIVE-/.test(id);
  }

  function isClosed(action) {
    return /^(closed|complete|completed|resolved|done)$/i.test(norm(action && action.status));
  }

  function finiteIndex(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function sameItem(a, b) {
    if (!a || !b) return false;
    if (a.actionKey && b.actionKey && a.actionKey === b.actionKey) return true;
    var aIdx = finiteIndex(a.itemIndex);
    var bIdx = finiteIndex(b.itemIndex);
    if (aIdx != null && bIdx != null && aIdx === bIdx) return true;
    var an = norm(a.itemNumber);
    var bn = norm(b.itemNumber);
    var aq = norm(a.question || a.finding || '');
    var bq = norm(b.question || b.finding || '');
    return Boolean(an && bn && an === bn && aq && bq && aq === bq);
  }

  function uniqueNoItems(noItems) {
    var byIdentity = new Map();
    (Array.isArray(noItems) ? noItems : []).forEach(function (item) {
      if (!item) return;
      var idx = finiteIndex(item.itemIndex);
      var id = idx != null
        ? 'idx:' + idx
        : 'key:' + canonicalKey(null, '', item.itemNumber, item.question);
      var current = byIdentity.get(id);
      if (!current || clean(item.question).length > clean(current.question).length) {
        byIdentity.set(id, item);
      }
    });
    return Array.from(byIdentity.values());
  }

  function userEdited(previous, incoming) {
    var prevHistory = Array.isArray(previous && previous.history) ? previous.history : [];
    var nextHistory = Array.isArray(incoming && incoming.history) ? incoming.history : [];
    return nextHistory.slice(prevHistory.length).some(function (entry) {
      var event = String(entry && entry.event || '');
      return /updated|resolved/i.test(event) && !/reopened/i.test(event);
    });
  }

  function finalise(action) {
    var out = {};
    FIELDS.forEach(function (field) {
      if (field === 'photosBefore' || field === 'photosAfter' || field === 'comments' || field === 'history') {
        out[field] = Array.isArray(action && action[field]) ? action[field] : [];
        return;
      }
      if (field === 'itemIndex') {
        out[field] = action && action.itemIndex != null ? action.itemIndex : null;
        return;
      }
      if (field === 'userNotes') {
        out[field] = (action && (action.userNotes || action.notes)) || '';
        return;
      }
      if (field === 'category') {
        out[field] = (action && (action.category || action.sectionName)) || '';
        return;
      }
      if (field === 'status') {
        out[field] = (action && action.status) || 'Open';
        return;
      }
      if (field === 'priority') {
        out[field] = (action && action.priority) || 'Medium';
        return;
      }
      out[field] = action && action[field] != null ? action[field] : '';
    });
    if (action && typeof action === 'object') {
      Object.keys(action).forEach(function (key) {
        if (key === 'liveOnly' || key === 'notes') return;
        if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = action[key];
      });
    }
    return out;
  }

  function keepUserEdits(previous, incoming) {
    if (!previous) return incoming ? finalise(incoming) : null;
    if (!incoming) return finalise(previous);
    var edited = userEdited(previous, incoming);
    var merged = finalise(Object.assign({}, previous, incoming));
    if (!edited) {
      merged.status = previous.status || merged.status || 'Open';
      merged.responsible = previous.responsible || merged.responsible;
      merged.dueDate = previous.dueDate || merged.dueDate;
      merged.priority = previous.priority || merged.priority;
      merged.closeComment = previous.closeComment || '';
      merged.closedBy = previous.closedBy || '';
      merged.closedDate = previous.closedDate || '';
      merged.history = Array.isArray(previous.history) ? previous.history : [];
      merged.comments = Array.isArray(previous.comments) ? previous.comments : (merged.comments || []);
      merged.photosBefore = Array.isArray(previous.photosBefore) ? previous.photosBefore : [];
      merged.photosAfter = Array.isArray(previous.photosAfter) ? previous.photosAfter : [];
      merged.userNotes = previous.userNotes || previous.notes || '';
      if (previous.actionId && !/^LIVE-/.test(String(previous.actionId))) {
        merged.actionId = previous.actionId;
      }
      merged.createdDate = previous.createdDate || merged.createdDate;
    }
    if (isClosed(previous) && !isClosed(merged) && !edited) {
      merged.status = previous.status;
      merged.closedDate = previous.closedDate || '';
      merged.closedBy = previous.closedBy || '';
      merged.closeComment = previous.closeComment || '';
    }
    return finalise(merged);
  }

  function findUnused(list, item, used) {
    for (var i = 0; i < list.length; i += 1) {
      if (used[i]) continue;
      if (!isGenerated(list[i])) continue;
      if (sameItem(list[i], item)) {
        used[i] = true;
        return list[i];
      }
    }
    return null;
  }

  function createFromItem(project, item, key, createId, pool) {
    var created = new Date().toISOString();
    var actionId = item.actionId;
    if (!actionId && typeof createId === 'function') {
      try { actionId = createId(pool || []); } catch (_) { actionId = ''; }
    }
    if (!actionId) actionId = 'ACT-' + String((Number(item.itemIndex) || 0) + 1).padStart(4, '0');
    return finalise({
      actionId: actionId,
      actionKey: key,
      premisesId: (project && project.id) || '',
      inspectionId: (project && (project.currentInspectionId || project.inspectionId || project.id)) || '',
      inspectionNumber: (project && project.inspectionNumber) || '',
      itemIndex: item.itemIndex,
      itemNumber: item.itemNumber || '',
      sectionName: item.sectionName || '',
      category: item.category || item.sectionName || '',
      question: item.question || '',
      finding: item.finding || item.question || '',
      correctiveAction: item.correctiveAction || '',
      reference: item.reference || '',
      priority: item.priority || 'Medium',
      responsible: item.responsible || 'Building Owner',
      dueDate: item.dueDate || '',
      status: 'Open',
      createdDate: created,
      createdBy: (project && project.inspectorName) || '',
      closedDate: '',
      closedBy: '',
      closeComment: '',
      source: 'NO answer',
      generatedBy: 'action-request-stability',
      photosBefore: [],
      photosAfter: [],
      comments: [],
      history: [{ event: 'Created', date: created, note: 'Created automatically from NO checklist answer.' }],
      userNotes: ''
    });
  }

  function absorb(project, existingActions, noItems, createId) {
    noItems = uniqueNoItems(noItems);
    var incoming = (Array.isArray(existingActions) ? existingActions : []).filter(function (action) {
      return action && !action.liveOnly;
    });
    var manual = [];
    var seenManual = {};
    incoming.forEach(function (action) {
      if (isGenerated(action)) return;
      var id = String(action.actionId || canonicalKey(project, action.itemIndex, action.itemNumber, action.question));
      if (seenManual[id]) return;
      seenManual[id] = true;
      manual.push(finalise(action));
    });

    var used = {};
    var result = manual.slice();
    (Array.isArray(noItems) ? noItems : []).forEach(function (item) {
      if (!item) return;
      var key = canonicalKey(project, item.itemIndex, item.itemNumber, item.question);
      var previous = findUnused(incoming, item, used);
      if (!previous) {
        if (typeof createId !== 'function' && !item.actionId) return;
        result.push(createFromItem(project, item, key, createId, incoming));
        return;
      }
      var merged = keepUserEdits(previous, Object.assign({}, item, {
        actionKey: key,
        source: previous.source || 'NO answer',
        generatedBy: previous.generatedBy || 'action-request-stability'
      }));
      merged.actionKey = key;
      result.push(finalise(merged));
    });
    return result;
  }

  function absorbPair(project, previousActions, incomingActions, noItems, createId) {
    noItems = uniqueNoItems(noItems);
    var previous = Array.isArray(previousActions) ? previousActions : [];
    var incoming = Array.isArray(incomingActions) ? incomingActions : [];
    var pool = previous.concat(incoming).filter(function (action) {
      return action && !action.liveOnly;
    });
    var manual = [];
    var seenManual = {};
    pool.forEach(function (action) {
      if (isGenerated(action)) return;
      var id = String(action.actionId || canonicalKey(project, action.itemIndex, action.itemNumber, action.question));
      if (seenManual[id]) return;
      seenManual[id] = true;
      manual.push(finalise(action));
    });

    var usedPrev = {};
    var usedNext = {};
    var result = manual.slice();
    (Array.isArray(noItems) ? noItems : []).forEach(function (item) {
      if (!item) return;
      var key = canonicalKey(project, item.itemIndex, item.itemNumber, item.question);
      var stored = findUnused(previous, item, usedPrev);
      var incomingMatch = findUnused(incoming, item, usedNext);
      if (!stored && !incomingMatch) {
        if (typeof createId !== 'function') return;
        result.push(createFromItem(project, item, key, createId, pool));
        return;
      }
      var merged = keepUserEdits(
        stored,
        Object.assign({}, item, incomingMatch || stored || {}, { actionKey: key })
      );
      if (!merged) return;
      merged.actionKey = key;
      result.push(finalise(merged));
    });
    return result;
  }

  function answerFilled(list) {
    return (list || []).some(function (answer) {
      return /^(yes|no|n\/a|na|not applicable)$/i.test(norm(answer && answer.answer));
    });
  }

  function sameCycle(prev, next) {
    if (!prev || !next) return false;
    if (String(prev.id) !== String(next.id)) return false;
    var prevNumber = String(prev.inspectionNumber || '');
    var nextNumber = String(next.inspectionNumber || '');
    if (prevNumber && nextNumber && prevNumber !== nextNumber) return false;
    var prevCycle = String(prev.currentInspectionId || prev.inspectionId || '');
    var nextCycle = String(next.currentInspectionId || next.inspectionId || '');
    if (prevCycle && nextCycle && prevCycle !== nextCycle) return false;
    return true;
  }

  function mergeAnswers(prev, next) {
    var prevAnswers = Array.isArray(prev && prev.answers) ? prev.answers : [];
    var nextAnswers = Array.isArray(next && next.answers) ? next.answers : [];
    if (!sameCycle(prev, next)) return nextAnswers;
    if (!prevAnswers.length) return nextAnswers;
    if (!nextAnswers.length) return prevAnswers.slice();
    if (answerFilled(prevAnswers) && !answerFilled(nextAnswers)) return prevAnswers.slice();
    if (nextAnswers.length >= prevAnswers.length) return nextAnswers;
    var byIndex = new Map();
    prevAnswers.forEach(function (answer, index) {
      var idx = Number.isFinite(Number(answer && answer.itemIndex)) ? Number(answer.itemIndex) : index;
      byIndex.set(idx, answer);
    });
    nextAnswers.forEach(function (answer, index) {
      var idx = Number.isFinite(Number(answer && answer.itemIndex)) ? Number(answer.itemIndex) : index;
      var old = byIndex.get(idx) || {};
      byIndex.set(idx, Object.assign({}, old, answer, { itemIndex: idx }));
    });
    return Array.from(byIndex.values());
  }

  function noItemsFromAnswers(project, answers) {
    var items = [];
    (answers || []).forEach(function (answer, index) {
      if (norm(answer && answer.answer) !== 'no') return;
      var idx = Number.isFinite(Number(answer.itemIndex)) ? Number(answer.itemIndex) : index;
      var question = clean(answer.question || answer.item || '');
      var number = clean(answer.itemNumber || String(idx + 1));
      items.push({
        itemIndex: idx,
        itemNumber: number,
        question: question,
        finding: answer.note || question,
        sectionName: answer.sectionName || answer.category || '',
        actionKey: canonicalKey(project, idx, number, question)
      });
    });
    return items;
  }

  function snapshotProject(project) {
    if (!project || typeof project !== 'object') return null;
    return {
      id: project.id,
      inspectionNumber: project.inspectionNumber,
      currentInspectionId: project.currentInspectionId,
      inspectionId: project.inspectionId,
      inspectionStatus: project.inspectionStatus,
      status: project.status,
      answers: Array.isArray(project.answers) ? project.answers.slice() : [],
      actions: Array.isArray(project.actions) ? project.actions.map(function (action) {
        return Object.assign({}, action);
      }) : []
    };
  }

  function stabiliseProject(prev, next) {
    if (!next || typeof next !== 'object') return next;
    if (!prev || !sameCycle(prev, next)) return next;
    var hasAnswers = Array.isArray(next.answers);
    var hasActions = Array.isArray(next.actions);
    if (!hasAnswers && !hasActions) return next;
    var answers = hasAnswers ? mergeAnswers(prev, next) : (Array.isArray(prev.answers) ? prev.answers.slice() : []);
    var actions = next.actions;
    if (hasActions && answers.length) {
      actions = absorbPair(next, prev.actions, next.actions, noItemsFromAnswers(next, answers));
    } else if (hasActions) {
      actions = next.actions.filter(function (action) {
        return action && !action.liveOnly;
      });
    }
    var sameAnswers = !hasAnswers || JSON.stringify(answers) === JSON.stringify(next.answers || []);
    var sameActions = !hasActions || JSON.stringify(actions) === JSON.stringify(next.actions || []);
    if (sameAnswers && sameActions) return next;
    var copy = Object.assign({}, next);
    if (hasAnswers) copy.answers = answers;
    if (hasActions) copy.actions = actions;
    return copy;
  }

  function stabiliseList(previousList, nextList) {
    if (!Array.isArray(nextList)) return nextList;
    var prevMap = {};
    (previousList || []).forEach(function (project) {
      if (project && project.id != null) prevMap[String(project.id)] = project;
    });
    return nextList.map(function (project) {
      if (!project || project.id == null) return project;
      return stabiliseProject(prevMap[String(project.id)], project);
    });
  }

  var lastSnapshot = null;

  function install() {
    var current = root.setProjects;
    if (typeof current !== 'function' || current.__fireSActionStability) return false;
    if (!lastSnapshot) {
      try {
        lastSnapshot = typeof root.getProjects === 'function'
          ? root.getProjects().map(snapshotProject).filter(Boolean)
          : [];
      } catch (_) {
        lastSnapshot = [];
      }
    }

    function stableSetProjects(list) {
      var stable = list;
      if (Array.isArray(list)) {
        try {
          stable = stabiliseList(lastSnapshot, list);
        } catch (error) {
          if (root.console && root.console.warn) {
            root.console.warn('Fire-S action stability skipped a save:', error);
          }
          stable = list;
        }
      }
      if (Array.isArray(stable)) {
        lastSnapshot = stable.map(snapshotProject).filter(Boolean);
      }
      return current.apply(this, [stable]);
    }

    stableSetProjects.__fireSActionStability = true;
    root.setProjects = stableSetProjects;
    try { root.setProjects = stableSetProjects; } catch (_) {}
    return true;
  }

  root.FireSActionRequestStability = {
    canonicalKey: canonicalKey,
    sameItem: sameItem,
    isGenerated: isGenerated,
    isClosed: isClosed,
    keepUserEdits: keepUserEdits,
    absorb: absorb,
    absorbPair: absorbPair,
    mergeAnswers: mergeAnswers,
    sameCycle: sameCycle,
    stabiliseProject: stabiliseProject,
    stabiliseList: stabiliseList,
    install: install
  };

  try { install(); } catch (_) {}
  if (typeof root.setTimeout === 'function') {
    [0, 400, 1600].forEach(function (delay) {
      root.setTimeout(install, delay);
    });
  }
})(typeof window !== 'undefined' ? window : this);
