
/* Fire-S v106.0 New Inspection Flow
   Separates "open existing inspection" from "start new inspection from same premises".
   Old inspection is archived into inspectionHistory before the fresh inspection starts.
*/

(function () {
  function currentProjectSafe() {
    if (typeof currentProjectId === 'undefined' || !currentProjectId) return null;
    if (typeof getProjects !== 'function') return null;
    return getProjects().find(project => project.id === currentProjectId) || null;
  }

  function getProjectName(project) {
    return (
      project?.projectName ||
      [project?.organisationName, project?.siteName].filter(Boolean).join(' - ') ||
      project?.siteName ||
      'Premises'
    );
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function makeInspectionArchive(project) {
    return {
      archivedAt: new Date().toISOString(),
      inspectionNumber: project.inspectionNumber || '',
      inspectionDate: project.inspectionDate || '',
      completedAt: project.completedAt || '',
      inspectorName: project.inspectorName || '',
      occupancy: project.occupancy || '',
      answers: Array.isArray(project.answers) ? project.answers : [],
      photos: Array.isArray(project.photos) ? project.photos : [],
      finalComments: project.finalComments || '',
      followUpRequired: project.followUpRequired || '',
      followUpDate: project.followUpDate || '',
      followUpNotes: project.followUpNotes || '',
      complianceScore: calculateScore(project),
      source: 'new-inspection-flow'
    };
  }

  function calculateScore(project) {
    const answers = Array.isArray(project?.answers) ? project.answers : [];
    const answered = answers.filter(answer => String(answer.answer || '').trim()).length;
    const no = answers.filter(answer => String(answer.answer || '').trim().toLowerCase() === 'no').length;

    if (!answered) return 0;

    return Math.max(0, Math.round(((answered - no) / answered) * 100));
  }

  function resetAnswers(project, mode) {
    const oldAnswers = Array.isArray(project.answers) ? project.answers : [];

    return oldAnswers.map(answer => {
      if (mode === 'copy-notes') {
        return {
          ...answer,
          answer: '',
          expiryDate: answer.expiryDate || null
        };
      }

      if (mode === 'copy-answers') {
        return {
          ...answer,
          previousAnswer: answer.answer || '',
          previousNote: answer.note || '',
          answer: '',
          note: '',
          expiryDate: answer.expiryDate || null
        };
      }

      return {
        itemIndex: answer.itemIndex,
        itemNumber: answer.itemNumber,
        answer: '',
        note: '',
        expiryDate: answer.expiryDate || null
      };
    });
  }

  function nextInspectionNumber() {
    if (typeof generateInspectionNumber === 'function') {
      return generateInspectionNumber();
    }

    return `IN-${Date.now()}`;
  }

  function startNewInspection(mode = 'blank') {
    const projects = getProjects();
    const index = projects.findIndex(project => project.id === currentProjectId);
    if (index === -1) return;

    const project = projects[index];

    const ok = confirm(
      `Start new inspection for:\n\n${getProjectName(project)}\n\n` +
      `The current inspection will be archived in History and a fresh inspection will be opened.`
    );

    if (!ok) return;

    const archive = makeInspectionArchive(project);

    projects[index] = {
      ...project,

      inspectionHistory: [
        ...(Array.isArray(project.inspectionHistory) ? project.inspectionHistory : []),
        archive
      ],

      inspectionNumber: nextInspectionNumber(),
      inspectionDate: today(),
      completedAt: '',
      archivedReportContext: null,

      answers: resetAnswers(project, mode),
      photos: [],
      finalComments: '',

      followUpRequired: '',
      followUpDate: '',
      followUpNotes: '',

      currentInspectionStartedAt: new Date().toISOString(),
      lastSaved: new Date().toISOString(),
      syncPending: true
    };

    setProjects(projects);
    currentPhotos = [];
    currentProjectId = projects[index].id;

    if (typeof currentProject !== 'undefined') {
      currentProject = projects[index];
    }

    if (typeof openProject === 'function') {
      openProject(projects[index].id);
    } else if (typeof renderProjectsList === 'function') {
      renderProjectsList();
    }

    setTimeout(() => {
      if (typeof renderPhotos === 'function') renderPhotos();
      if (window.FireSPremisesWorkspace?.inject) window.FireSPremisesWorkspace.inject(true);
      if (window.FireSBuildingPassport?.inject) window.FireSBuildingPassport.inject(true);
    }, 400);
  }

  function injectButton() {
    const form = document.getElementById('projectFormSection');
    if (!form || form.style.display === 'none') return;

    const workspace =
      document.getElementById('fireSPremisesWorkspaceV105') ||
      document.getElementById('fireSBuildingPassportV104Wrapper') ||
      document.getElementById('fireSPremisesWorkspaceLiteV101');

    if (!workspace) return;

    if (document.getElementById('fireSNewInspectionPanelV106')) return;

    const panel = document.createElement('div');
    panel.id = 'fireSNewInspectionPanelV106';
    panel.className = 'fire-s-new-inspection-panel-v106';
    panel.innerHTML = `
      <div>
        <span>Inspection Control</span>
        <strong>Start a new inspection for this premises</strong>
        <p>The current inspection is archived first. Site details remain, but the checklist and photos start fresh.</p>
      </div>
      <div class="fire-s-new-inspection-actions-v106">
        <button type="button" id="fireSStartBlankInspectionV106">New Inspection</button>
        <button type="button" id="fireSStartInspectionCopyAnswersV106">New + Previous Reference</button>
      </div>
    `;

    workspace.insertAdjacentElement('afterend', panel);

    document
      .getElementById('fireSStartBlankInspectionV106')
      ?.addEventListener('click', () => startNewInspection('blank'));

    document
      .getElementById('fireSStartInspectionCopyAnswersV106')
      ?.addEventListener('click', () => startNewInspection('copy-answers'));
  }

  function patchOpenProjectEvent() {
    if (typeof openProject === 'function' && !window.fireSOriginalOpenProject1060) {
      window.fireSOriginalOpenProject1060 = openProject;

      openProject = function fireSOpenProjectWithNewInspectionControl1060() {
        const result = window.fireSOriginalOpenProject1060.apply(this, arguments);

        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('fireSProjectOpened'));
          injectButton();
        }, 500);

        return result;
      };
    }
  }

  window.FireSNewInspectionFlow = {
    startNewInspection,
    injectButton
  };

  patchOpenProjectEvent();

  setTimeout(injectButton, 900);
  setTimeout(injectButton, 1800);
})();
