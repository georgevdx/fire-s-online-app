/* ============================================================
   Fire-S test samples
   Owner / Manager can load 50 labelled sample inspections across
   5 test inspectors, then delete that batch later.
   ============================================================ */
(function fireSTestSamplesModule(root) {
  'use strict';

  const BATCH_ID = 'fires-test-sample-v1';
  const WORKSPACE_IDS = [
    'homeSection',
    'servicesSection',
    'projectListSection',
    'projectFormSection',
    'findingsCentreSection',
    'companyTeamSection',
    'companyLetterheadSection',
    'inspectorBoardSection',
    'reportSection'
  ];

  const TEST_INSPECTORS = [
    { name: 'TEST Inspector Ann Petersen', email: 'test.ann.petersen@fires-sample.invalid' },
    { name: 'TEST Inspector Ben Molefe', email: 'test.ben.molefe@fires-sample.invalid' },
    { name: 'TEST Inspector Carla Naidoo', email: 'test.carla.naidoo@fires-sample.invalid' },
    { name: 'TEST Inspector Dawie Botha', email: 'test.dawie.botha@fires-sample.invalid' },
    { name: 'TEST Inspector Esiwe Dlamini', email: 'test.esiwe.dlamini@fires-sample.invalid' }
  ];

  const SITES = [
    'Hatfield', 'Brooklyn', 'Arcadia', 'Sunnyside', 'Pretoria CBD',
    'Centurion', 'Lynnwood', 'Menlyn', 'Faerie Glen', 'Garsfontein',
    'Waterkloof', 'Valhalla', 'Wierdapark', 'Erasmuskloof', 'Moreleta Park',
    'Silverton', 'Waltloo', 'Gezina', 'Wonderboom', 'Pretoria North',
    'Akasia', 'Montana', 'Doornpoort', 'The Reeds', 'Highveld',
    'Irene', 'Clubview', 'Lyttelton', 'Pierre van Ryneveld', 'Wingate Park',
    'Elarduspark', 'Constantia Park', 'Newlands', 'Daspoort', 'Pretoria West',
    'Atteridgeville', 'Laudium', 'Eldoraigne', 'Raslouw', 'Midstream',
    'Olifantsfontein', 'Mamelodi', 'Nellmapius', 'Eersterust', 'Colbyn',
    'Riviera', 'Muckleneuk', 'Groenkloof', 'Monument Park', 'Ashlea Gardens'
  ];

  const OCCUPANCIES = [
    'A1', 'A3', 'B2', 'B3', 'C1', 'D2', 'D3', 'E1', 'E2', 'F1',
    'F2', 'G1', 'H1', 'H3', 'J2'
  ];

  const PHOTO_COLORS = ['#b71c1c', '#1e3a8a', '#0f766e', '#9a3412', '#334155'];

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value || '').trim();
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, list) {
    return list[Math.floor(rng() * list.length) % list.length];
  }

  function pad(value, width) {
    return String(value).padStart(width, '0');
  }

  function isoDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  function dateDaysAgo(days) {
    return isoDaysAgo(days).slice(0, 10);
  }

  function dateDaysAhead(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function isTestSample(project) {
    return !!(
      project &&
      (project.isFireSTestSample === true ||
        project.testBatchId === BATCH_ID ||
        String(project.id || '').indexOf('fires-test-sample-') === 0 ||
        String(project.organisationName || '').indexOf('TEST ·') === 0)
    );
  }

  function testPhotoSrc(label, color) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">' +
      '<rect width="320" height="240" fill="' + color + '"/>' +
      '<text x="160" y="110" text-anchor="middle" fill="#fff" font-family="Arial" font-size="18">TEST PHOTO</text>' +
      '<text x="160" y="138" text-anchor="middle" fill="#fff" font-family="Arial" font-size="13">' +
      String(label).replace(/[<>&]/g, '') +
      '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function checklistFor(occupancy) {
    try {
      if (typeof getChecklistForProject === 'function') {
        const rows = getChecklistForProject({
          productType: 'Fire Safety Compliance',
          inspectionType: 'General Fire Inspection',
          occupancy: occupancy || 'B3'
        });
        if (Array.isArray(rows) && rows.length) return rows;
      }
    } catch (_) {}
    return [
      { 'Item Number': '1', 'Checklist Item': 'Are fire extinguishers provided?' },
      { 'Item Number': '2', 'Checklist Item': 'Are escape routes unobstructed?' },
      { 'Item Number': '3', 'Checklist Item': 'Are exit signs visible?' }
    ];
  }

  function answerValue(rng, kind, index, total) {
    if (kind === 'scheduled') return '';
    if (kind === 'in-progress' && index > Math.floor(total * 0.55)) return '';
    const roll = rng();
    if (kind === 'clear') return roll < 0.08 ? 'N/A' : 'Yes';
    if (kind === 'attention' || kind === 'overdue') {
      if (index % 7 === 0) return 'No';
      if (roll < 0.12) return 'N/A';
      return 'Yes';
    }
    if (roll < 0.12) return 'No';
    if (roll < 0.22) return 'N/A';
    return 'Yes';
  }

  function assessmentFor(answer) {
    if (answer === 'Yes') return 'Compliant';
    if (answer === 'No') return 'Action Required';
    if (answer === 'N/A') return 'N/A';
    return '';
  }

  function kindForIndex(index) {
    if (index < 12) return 'clear';
    if (index < 28) return 'attention';
    if (index < 36) return 'in-progress';
    if (index < 42) return 'scheduled';
    return 'overdue';
  }

  function buildAnswers(rng, occupancy, kind) {
    const checklist = checklistFor(occupancy);
    return checklist.map((item, index) => {
      const answer = answerValue(rng, kind, index, checklist.length);
      return {
        itemIndex: index,
        itemNumber: item['Item Number'] || String(index + 1),
        answer,
        note: answer === 'No' ? 'TEST finding: corrective action required.' : '',
        expiryDate: null,
        assessment: assessmentFor(answer)
      };
    });
  }

  function buildPhotos(rng, projectLabel, answers) {
    const count = 1 + Math.floor(rng() * 3);
    const noItem = (answers || []).find(row => row.answer === 'No');
    const photos = [];
    for (let i = 0; i < count; i += 1) {
      const color = PHOTO_COLORS[i % PHOTO_COLORS.length];
      const src = testPhotoSrc(projectLabel + ' P' + (i + 1), color);
      photos.push({
        id: 'fires-test-photo-' + projectLabel + '-' + (i + 1),
        src,
        previewSrc: src,
        thumbnailSrc: src,
        timestamp: isoDaysAgo(Math.floor(rng() * 40)),
        note: i === 0 && noItem
          ? 'TEST photo linked to a No answer.'
          : 'TEST sample photo ' + (i + 1) + '.',
        category: i === 0 ? 'Finding' : 'General',
        area: pick(rng, ['Store room', 'Escape route', 'Reception', 'Plant room', 'Parking']),
        linkedQuestion: noItem && i === 0 ? String(noItem.itemNumber) : '',
        uploadFallback: true
      });
    }
    return photos;
  }

  function buildOneProject(index, options) {
    const rng = mulberry32(20260819 + index * 97);
    const inspector = TEST_INSPECTORS[index % TEST_INSPECTORS.length];
    const kind = kindForIndex(index);
    const occupancy = OCCUPANCIES[index % OCCUPANCIES.length];
    const suburb = SITES[index % SITES.length];
    const n = index + 1;
    const organisationName = 'TEST · Sample ' + pad(n, 2) + ' ' + suburb;
    const siteName = 'Site ' + pad(n, 2);
    const streetNumber = String(10 + Math.floor(rng() * 980));
    const addressLine = streetNumber + ' Sample Street, ' + suburb + ', Pretoria';
    const answers = buildAnswers(rng, occupancy, kind);
    const photos = kind === 'scheduled' ? [] : buildPhotos(rng, pad(n, 2), answers);
    const daysAgo = 3 + Math.floor(rng() * 70);
    const inspectionDate = dateDaysAgo(daysAgo);
    const nowIso = isoDaysAgo(Math.max(0, daysAgo - 1));
    const completed = kind === 'clear' || kind === 'attention' || kind === 'overdue';
    const lat = (-25.7479 + (rng() - 0.5) * 0.18).toFixed(6);
    const lng = (28.2293 + (rng() - 0.5) * 0.18).toFixed(6);
    const companyId = text(options && options.companyId);
    const companyName = text(options && options.companyName) || 'Company S';
    const ownerId = text(options && options.userId);
    const ownerEmail = text(options && options.userEmail);

    return {
      id: 'fires-test-sample-' + pad(n, 2),
      isFireSTestSample: true,
      testBatchId: BATCH_ID,
      companyId: companyId || null,
      company_id: companyId || null,
      companyName,
      createdByUserId: ownerId || inspector.email,
      createdByEmail: inspector.email,
      lastEditedByUserId: ownerId || inspector.email,
      lastEditedByEmail: ownerEmail || inspector.email,
      userRoleAtSave: 'inspector',
      siteId: 'test-sample|' + pad(n, 2) + '|' + suburb.toLowerCase(),
      inspectionNumber: 'TEST-2026-' + pad(n, 4),
      projectName: organisationName + ' ' + siteName,
      organisationName,
      siteName,
      premisesIdentityName: organisationName,
      premisesIdentitySite: siteName,
      premisesIdentityVersion: 3,
      streetNumber,
      addressLine,
      projectAddress: addressLine,
      gps: lat + ', ' + lng,
      inMall: index % 11 === 0 ? 'Yes' : 'No',
      mallName: index % 11 === 0 ? 'TEST Mall ' + suburb : '',
      unitNumber: index % 11 === 0 ? 'U' + (10 + (index % 40)) : '',
      contactPerson: 'TEST Contact ' + pad(n, 2),
      contactTel: '012 55' + pad(100 + index, 4),
      contactEmail: 'contact.sample' + pad(n, 2) + '@fires-sample.invalid',
      productType: 'Fire Safety Compliance',
      inspectionType: 'General Fire Inspection',
      inspectorName: inspector.name,
      occupancy,
      answers,
      photos,
      followUpRequired: kind === 'overdue' || kind === 'attention' ? 'Yes' : 'No',
      followUpDate: kind === 'overdue'
        ? dateDaysAgo(5 + (index % 10))
        : kind === 'attention'
          ? dateDaysAhead(14 + (index % 20))
          : '',
      followUpNotes: kind === 'overdue' || kind === 'attention'
        ? 'TEST follow-up for sample findings.'
        : '',
      finalComments: completed
        ? 'TEST sample inspection. Delete this batch when testing is done.'
        : '',
      scheduledDate: kind === 'scheduled' ? dateDaysAhead(7 + (index % 21)) : '',
      scheduledStatus: kind === 'scheduled' ? 'scheduled' : completed ? 'completed' : 'created',
      scheduleType: kind === 'scheduled' ? 'new_site' : '',
      completedAt: completed ? nowIso : null,
      archivedAt: null,
      status: completed ? 'completed' : kind === 'scheduled' ? 'scheduled' : 'active',
      inspectionStatus: completed ? 'completed' : kind === 'scheduled' ? 'scheduled' : 'in_progress',
      inspectionDate,
      inspectionHistory: [],
      syncPending: true,
      syncError: false,
      lastSaved: nowIso
    };
  }

  function buildTestSampleProjects(options) {
    const projects = [];
    for (let i = 0; i < 50; i += 1) {
      projects.push(buildOneProject(i, options || {}));
    }
    return projects;
  }

  function canManage() {
    try {
      if (typeof window.canEditCompanyDetails === 'function') {
        return !!window.canEditCompanyDetails();
      }
    } catch (_) {}
    const role = text(
      (typeof window.getCurrentUserRole === 'function'
        ? window.getCurrentUserRole()
        : window.currentUserProfile && window.currentUserProfile.role) || ''
    ).toLowerCase();
    return (
      role === 'super_admin' ||
      role === 'company_owner' ||
      role === 'owner' ||
      role === 'manager'
    );
  }

  function setMessage(message, isError) {
    const el = byId('testSamplesMessage');
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      el.classList.remove('is-error');
      return;
    }
    el.style.display = 'block';
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
  }

  function existingTestCount() {
    try {
      const projects = typeof getProjects === 'function' ? getProjects() : [];
      return (projects || []).filter(isTestSample).length;
    } catch (_) {
      return 0;
    }
  }

  function paintStatus() {
    const meta = byId('testSamplesMeta');
    const list = byId('testSamplesInspectorList');
    const count = existingTestCount();
    if (meta) {
      meta.textContent = count
        ? count + ' test inspections are loaded right now.'
        : 'No test inspections loaded yet.';
    }
    if (list) {
      list.innerHTML = TEST_INSPECTORS.map(function (person) {
        return '<li><strong>' + person.name + '</strong><div>' + person.email + '</div></li>';
      }).join('');
    }
  }

  function hideOtherSections() {
    WORKSPACE_IDS.forEach(function (id) {
      const el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function refreshViews() {
    try {
      if (typeof renderProjectsList === 'function') renderProjectsList();
    } catch (_) {}
    try {
      if (typeof renderHomeCommandCentre === 'function') renderHomeCommandCentre();
    } catch (_) {}
    try {
      if (typeof window.fireSApplyCleanHomeRoles === 'function') {
        window.fireSApplyCleanHomeRoles();
      }
    } catch (_) {}
    try {
      if (typeof window.fireSRefreshInspectorBoard === 'function') {
        window.fireSRefreshInspectorBoard();
      }
    } catch (_) {}
    paintStatus();
  }

  async function uploadBatch(projects) {
    if (typeof uploadSingleInspection !== 'function') return;
    const previousQuiet = window.__fireSQuietCloudUpload;
    window.__fireSQuietCloudUpload = true;
    try {
      for (let i = 0; i < projects.length; i += 1) {
        try {
          await uploadSingleInspection(projects[i]);
        } catch (_) {}
      }
    } finally {
      window.__fireSQuietCloudUpload = previousQuiet;
    }
  }

  async function deleteCloudIds(ids) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
      const session = await supabaseClient.auth.getUser();
      if (!session?.data?.user) return;
    } catch (_) {
      return;
    }
    for (let i = 0; i < ids.length; i += 1) {
      try {
        await supabaseClient.from('inspections').delete().eq('id', ids[i]);
      } catch (_) {}
    }
  }

  async function loadSamples() {
    if (!canManage()) {
      setMessage('Only the owner or manager can load test inspections.', true);
      return;
    }
    if (typeof getProjects !== 'function' || typeof setProjects !== 'function') {
      setMessage('Could not reach inspection storage on this phone.', true);
      return;
    }
    const confirmed = window.confirm(
      'Load 50 TEST sample inspections for 5 test inspectors? You can delete this whole batch later.'
    );
    if (!confirmed) return;

    setMessage('Loading 50 test inspections…');
    const current = getProjects() || [];
    const kept = current.filter(function (project) {
      return !isTestSample(project);
    });
    const samples = buildTestSampleProjects({
      companyId: window.currentUserProfile && window.currentUserProfile.companyId,
      companyName:
        (window.currentUserProfile && window.currentUserProfile.companyName) ||
        'Company S',
      userId: window.currentUserProfile && window.currentUserProfile.id,
      userEmail: window.currentUserProfile && window.currentUserProfile.email
    });
    setProjects(kept.concat(samples));
    refreshViews();
    setMessage('Saved 50 test inspections on this phone. Copying to the cloud if you are signed in…');
    await uploadBatch(samples);
    setMessage(
      '50 TEST inspections are loaded across 5 test inspectors. Open Inspection Gateway or Inspectors to see them. Use Delete all test samples when you are done.'
    );
  }

  async function deleteSamples() {
    if (!canManage()) {
      setMessage('Only the owner or manager can delete test inspections.', true);
      return;
    }
    if (typeof getProjects !== 'function' || typeof setProjects !== 'function') {
      setMessage('Could not reach inspection storage on this phone.', true);
      return;
    }
    const current = getProjects() || [];
    const samples = current.filter(isTestSample);
    if (!samples.length) {
      setMessage('There are no test inspections to delete.');
      return;
    }
    const confirmed = window.confirm(
      'Delete all ' + samples.length + ' TEST sample inspections from this phone and the cloud?'
    );
    if (!confirmed) return;

    const ids = samples.map(function (project) {
      return project.id;
    });
    ids.forEach(function (id) {
      try {
        if (typeof markProjectDeleted === 'function') markProjectDeleted(id);
      } catch (_) {}
    });
    setProjects(current.filter(function (project) {
      return !isTestSample(project);
    }));
    refreshViews();
    setMessage('Removed test inspections from this phone. Removing cloud copies…');
    await deleteCloudIds(ids);
    setMessage('All TEST sample inspections are deleted.');
  }

  function openSamples() {
    if (!canManage()) {
      alert('Only the owner or manager can load or delete test inspections.');
      return;
    }
    hideOtherSections();
    const section = byId('testSamplesSection');
    if (section) section.style.display = 'block';
    try {
      if (typeof window.updateFloatingBackButton === 'function') {
        window.updateFloatingBackButton();
      }
    } catch (_) {}
    paintStatus();
    setMessage('Use Load to fill 50 sample inspections, or Delete when testing is finished.');
  }

  function goHome() {
    const section = byId('testSamplesSection');
    if (section) section.style.display = 'none';
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
  }

  function bind() {
    const back = byId('testSamplesBackBtn');
    const loadBtn = byId('testSamplesLoadBtn');
    const deleteBtn = byId('testSamplesDeleteBtn');
    const homeBtn = byId('cmdTestSamplesBtn');
    if (back && !back.__fireSBound) {
      back.__fireSBound = true;
      back.addEventListener('click', goHome);
    }
    if (loadBtn && !loadBtn.__fireSBound) {
      loadBtn.__fireSBound = true;
      loadBtn.addEventListener('click', function () {
        loadSamples().catch(function (error) {
          setMessage((error && error.message) || 'Could not load test inspections.', true);
        });
      });
    }
    if (deleteBtn && !deleteBtn.__fireSBound) {
      deleteBtn.__fireSBound = true;
      deleteBtn.addEventListener('click', function () {
        deleteSamples().catch(function (error) {
          setMessage((error && error.message) || 'Could not delete test inspections.', true);
        });
      });
    }
    if (homeBtn && !homeBtn.__fireSBound) {
      homeBtn.__fireSBound = true;
      homeBtn.addEventListener('click', function (event) {
        if (event) event.preventDefault();
        openSamples();
      });
    }
  }

  function boot() {
    bind();
    paintStatus();
  }

  root.fireSTestInspectors = TEST_INSPECTORS;
  root.fireSIsTestSample = isTestSample;
  root.fireSBuildTestSampleProjects = buildTestSampleProjects;
  root.fireSOpenTestSamples = openSamples;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      BATCH_ID,
      TEST_INSPECTORS,
      isTestSample,
      buildTestSampleProjects,
      testPhotoSrc
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
