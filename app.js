let currentFilter = 'all';
function setFilter(filter) {
  currentFilter =
    currentFilter === filter && filter !== 'all'
      ? 'all'
      : filter;
  renderProjectsList();
  updateDashboardSelection();
}
let occupancies = [];
let requirements = [];
let checklists = [];
let inspectionTemplates = {};
let currentProjectId = null;
let currentPhotos = [];
let currentUserProfile = null;
let currentCompanyAccess = null;

const APP_VERSION = 'v77';

const SUPABASE_URL = "https://ispsdmglyylcwkufphnv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzcHNkbWdseXlsY3drdWZwaG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzkwNDUsImV4cCI6MjA5MTc1NTA0NX0.Uy_DcmodOBvZf_WMOtnZwAh4ZQeJIbS9ojBw8DzNXhk";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

window.supabaseClient = supabaseClient;

function buildStreetAddress(address = {}) {

  const streetNumber =
    address.house_number ||
    address.building_number ||
    '';

  const streetName =
    address.road ||
    address.street ||
    address.pedestrian ||
    address.footway ||
    '';

  const suburb =
    address.suburb ||
    address.neighbourhood ||
    address.residential ||
    address.quarter ||
    '';

  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    '';

  const province =
    address.state ||
    '';

  return [
    [streetNumber, streetName].filter(Boolean).join(' '),
    suburb,
    city,
    province
  ]
    .filter(Boolean)
    .join(', ');
}

function getStreetNumberFromAddress(address = {}) {
  return (
    address.house_number ||
    address.building_number ||
    address.unit ||
    ''
  );
}

function buildAddressLineWithoutStreetNumber(address = {}) {
  const streetName =
    address.road ||
    address.street ||
    address.pedestrian ||
    address.footway ||
    '';

  const suburb =
    address.suburb ||
    address.neighbourhood ||
    address.residential ||
    address.quarter ||
    '';

  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    '';

  const province =
    address.state ||
    '';

  return [
    streetName,
    suburb,
    city,
    province
  ]
    .filter(Boolean)
    .join(', ');
}

function combineStreetAddress(streetNumber, addressLine) {
  return [streetNumber, addressLine]
    .map(value => (value || '').trim())
    .filter(Boolean)
    .join(' ');
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed to load: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function getEl(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing HTML element with id="${id}"`);
  }
  return el;
}

function clearInputValue(id) {
  const field = getEl(id);
  field.value = '';
  field.defaultValue = '';
  field.setAttribute('value', '');
}

let autoSaveTimer = null;

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  updateProjectReadinessPanel();

  autoSaveTimer = setTimeout(() => {
    autoSaveProject();
  }, 800);
}

function autoSaveProject() {
  
  const inspectorNameField = document.getElementById('inspectorName');
  const occupancyField = document.getElementById('occupancySelect');
  const projectAddressField = document.getElementById('projectAddress');
  const gpsField = document.getElementById('gps');
  const inMallField = document.getElementById('inMall');
  const mallNameField = document.getElementById('mallName');
  const unitNumberField = document.getElementById('unitNumber');
  const contactPerson = getEl('contactPerson').value.trim();
  const contactTel = getEl('contactTel').value.trim();
  const contactEmail = getEl('contactEmail').value.trim();
  const organisationName = getEl('organisationName').value.trim();
  const siteName = getEl('siteName').value.trim();

  if (!siteName) return;

  if (
    !projectAddressField ||
    !gpsField ||
    !inMallField ||
    !mallNameField ||
    !unitNumberField ||
    !inspectorNameField ||
    !occupancyField
  ) return;

  const projectName =
    [organisationName, siteName]
      .filter(Boolean)
      .join(' ');

  const inspectorName = inspectorNameField.value.trim();
  const occupancy = occupancyField.value;
  const streetNumber = getEl('streetNumber').value.trim();
  const addressLine = projectAddressField.value.trim();
  const projectAddress = combineStreetAddress(streetNumber, addressLine);
  const gps = gpsField.value.trim();

  const inMall = inMallField.value;
  const mallName = mallNameField.value.trim();
  const unitNumber = unitNumberField.value.trim();
  const productType = normalizeProductType(getEl('productType').value);
  const inspectionType = getEl('inspectionType').value;

  const accessMetadata = getAccessMetadata();
  
  const siteId = [
    projectAddress?.toLowerCase().trim(),
    mallName?.toLowerCase().trim(),
    unitNumber?.toLowerCase().trim()
  ]
    .filter(Boolean)
    .join('|');

  if (!projectName && !inspectorName) return;

  const answers = [];
  const selectedChecklist =
    getActiveTemplateChecklist() || [];

  document.querySelectorAll('.answer-select').forEach((field, index) => {
    const noteField = document.getElementById(`note_${index}`);
    const expiryField =
      document.querySelector(`.expiry-date[data-index="${index}"]`); 

    answers.push({
      itemIndex: index,

      itemNumber:
        selectedChecklist[index]?.["Item Number"] ||
        String(index + 1),

      answer: field.value,

      note:
        noteField
          ? noteField.value.trim()
          : '',

      expiryDate: expiryField ? expiryField.value : null
    });
  });

  const projects = getProjects();

  if (currentProjectId) {
    const index = projects.findIndex(p => p.id === currentProjectId);

    if (index !== -1) {
      projects[index] = {
        ...projects[index],

        companyId: accessMetadata.companyId,
        companyName: accessMetadata.companyName,

        createdByUserId:
          projects[index].createdByUserId ||
          accessMetadata.createdByUserId,

        createdByEmail:
          projects[index].createdByEmail ||
          accessMetadata.createdByEmail,

        lastEditedByUserId:
          accessMetadata.createdByUserId,

        lastEditedByEmail:
          accessMetadata.createdByEmail,

        userRoleAtSave:
          accessMetadata.userRole,

        companyAccessStatus:
          accessMetadata.companyAccessStatus,

        siteId,

        inspectionNumber:
          projects[index].inspectionNumber ||
          generateInspectionNumber(),

        syncPending: true,
        syncError: false,

        projectName,
        organisationName,
        siteName,
        streetNumber,
        addressLine,
        projectAddress,
        gps,
        inMall,
        mallName,
        unitNumber,
        contactPerson,
        contactTel,
        contactEmail,
        productType,
        inspectionType,
        inspectorName,
        occupancy,
        answers,
        followUpRequired: getEl('followUpRequired').value,
        followUpDate: getEl('followUpDate').value,
        followUpNotes: getEl('followUpNotes').value.trim(),
        photos: currentPhotos,      
        lastSaved: new Date().toISOString()
      };
    }
  } else {
    const newProject = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),

      companyId: accessMetadata.companyId,
      companyName: accessMetadata.companyName,

      createdByUserId:
        accessMetadata.createdByUserId,

      createdByEmail:
        accessMetadata.createdByEmail,

      lastEditedByUserId:
        accessMetadata.createdByUserId,

      lastEditedByEmail:
        accessMetadata.createdByEmail,

      userRoleAtSave:
        accessMetadata.userRole,

      companyAccessStatus:
        accessMetadata.companyAccessStatus,
      
      siteId,
      inspectionNumber: generateInspectionNumber(),

      syncPending: true,
      syncError: false,

      projectName,
      organisationName,
      siteName,
      streetNumber,
      addressLine,
      projectAddress,
      gps,
      inMall,
      mallName,
      unitNumber,
      contactPerson,
      contactTel,
      contactEmail,
      productType,
      inspectionType,
      inspectorName,
      occupancy,
      answers,

      followUpRequired: getEl('followUpRequired').value,
      followUpDate: getEl('followUpDate').value,
      followUpNotes: getEl('followUpNotes').value.trim(),

      photos: currentPhotos,
      lastSaved: new Date().toISOString()
    };

    currentProjectId = newProject.id;

    projects.push(newProject);

    const previousSiteInspections = projects.filter(
      p =>
        p.siteId === newProject.siteId &&
        p.id !== newProject.id
    );

    newProject.previousInspectionCount =
      previousSiteInspections.length;

    newProject.hasSiteHistory =
      previousSiteInspections.length > 0;

    const previousNoAnswers =
      previousSiteInspections.flatMap(
        p => (p.answers || [])
          .filter(a => a.answer === 'No')
          .map(a => a.itemNumber)
      );

    newProject.repeatFindings =
      (answers || [])
        .filter(a =>
          a.answer === 'No' &&
          previousNoAnswers.includes(a.itemNumber)
        )
        .map(a => a.itemNumber);
  }

  setProjects(projects);
  renderProjectsList();
  
  const saveMessage = document.getElementById('saveMessage');

  if (saveMessage) {
    saveMessage.textContent = `Last saved: ${formatLastSaved()}`;
  }

  const savedProject = projects.find(p => p.id === currentProjectId);

  if (savedProject) {
    uploadSingleInspection(savedProject)
      .catch(error => {
        console.error('Auto upload after autosave failed:', error);
      });
  } else {
    console.warn('Auto upload skipped: autosaved project not found.');
  }
}

  function formatLastSaved(date = new Date()) {
    return date.toLocaleString();
}

function formatProjectDate(value) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString();
}

  function exportReport() {

  if (!canViewReports()) {
    alert(
      'Your company access does not allow exporting reports. Please contact your company admin or FireyeSA support.'
    );
    return;
  }

  generateReport(); // maak seker report is nuut
  getEl('reportSection').style.display = 'block';

  const element = document.getElementById('reportContent');

  const currentProject = getProjects().find(
    p => p.id === currentProjectId
  );

  const projectName =
    currentProject?.projectName || 'Inspection';
  const reportDate =
    new Date().toISOString().slice(0, 10);
  const safeProjectName =
    sanitizeFileName(projectName);

  const opt = {
  margin: [15, 12, 15, 12],

  filename: `FireyeSA_Report_${safeProjectName}_${reportDate}.pdf`,

  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: {
  scale: 1,
  useCORS: true,
  scrollY: 0,
  windowWidth: document.getElementById('reportContent').scrollWidth
  },
  jsPDF: {
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait'
  },
  pagebreak: {
    mode: ['avoid-all', 'css', 'legacy']
  }
};
  setTimeout(() => {
  html2pdf().set(opt).from(element).save();
}, 300);
}

async function reverseLookupAddress(lat, lon) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
  );

  if (!response.ok) {
    throw new Error(`Address lookup failed: ${response.status}`);
  }

  return response.json();
}

function parseGpsInput(value) {
  const match = (value || '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lon = Number(match[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return { lat, lon };
}

function applyAddressLookupResult(data, fallbackText) {
  const streetNumber = getStreetNumberFromAddress(data.address || {});
  const addressLine = buildAddressLineWithoutStreetNumber(data.address || {});

  getEl('streetNumber').value = streetNumber;
  getEl('projectAddress').value =
    addressLine || data.display_name || fallbackText;

  getEl('saveMessage').textContent = streetNumber
    ? 'Street number and address found from GPS.'
    : 'Address found from GPS. Street number was not found, please add it manually.';

  scheduleAutoSave();
}

async function lookupAddressFromGpsInput() {
  const parsed = parseGpsInput(getEl('gps').value);

  if (!parsed) {
    getEl('saveMessage').textContent =
      'Enter GPS first, for example: -25.7479, 28.2293';
    return;
  }

  getEl('saveMessage').textContent = 'Finding address from GPS...';

  try {
    const data = await reverseLookupAddress(parsed.lat, parsed.lon);
    applyAddressLookupResult(data, `${parsed.lat}, ${parsed.lon}`);
  } catch (error) {
    console.error('GPS address lookup failed:', error);
    getEl('saveMessage').textContent =
      'Could not find address from GPS. Enter the address manually.';
  }
}

async function useCurrentLocation() {
  const geolocation = window.navigator && window.navigator.geolocation;

  if (!geolocation) {
    getEl('saveMessage').textContent =
      'GPS is not available in this browser. Use your phone, Chrome, or enter the GPS/address manually.';
    return;
  }

  getEl('saveMessage').textContent = 'Getting location...';

  geolocation.getCurrentPosition(
  async position => {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    const gpsText = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    getEl('gps').value = gpsText;

    try {
      const data = await reverseLookupAddress(lat, lon);
      applyAddressLookupResult(data, `${lat}, ${lon}`);
    } catch (err) {
      console.error("Address fetch failed:", err);

      document.getElementById("projectAddress").value = `${lat}, ${lon}`;

      getEl('saveMessage').textContent =
        'GPS captured, but address lookup failed. Address can be entered manually.';
    }

    scheduleAutoSave();
  },
  error => {
    console.error("GPS failed:", error);

    const messages = {
      1: 'GPS permission was denied. Allow location access, or enter the GPS/address manually.',
      2: 'GPS position is unavailable. Try again outside or enter the GPS/address manually.',
      3: 'GPS request timed out. Try again, or enter the GPS/address manually.'
    };

    getEl('saveMessage').textContent =
      messages[error.code] || 'GPS failed. Enter the GPS/address manually.';
  },
  {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 60000
  }
);
}

function toggleMallFields() {
  const inMall = getEl('inMall').value;
  const mallFields = getEl('mallFields');

  if (inMall === 'Yes') {
    mallFields.style.display = 'block';
  } else {
    mallFields.style.display = 'none';
  }
}

function toggleChecklistSection(sectionId) {
  const section = document.getElementById(sectionId);

  if (!section) return;

  if (section.style.display === 'none') {
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
}

function sanitizeFileName(value, fallback = 'Inspection') {
  const cleanName = String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70);

  return cleanName || fallback;
}

function getFileTimestamp() {
  return new Date()
    .toISOString()
    .slice(0, 16)
    .replace('T', '-')
    .replace(':', '');
}

function exportBackup() {
  const projects = getProjects();
  const timestamp = getFileTimestamp();
  const filename = sanitizeFileName(`fireyesa-backup-${timestamp}`, 'fireyesa-backup');
  const backupJson = createBackupJson(projects);

  downloadBackupJson(backupJson, `${filename}.json`);
  saveBackupSnapshot(backupJson, `${filename}.json`, projects.length, 'download');

  const message =
    `Backup exported as ${filename}.json (${projects.length} inspection${projects.length === 1 ? '' : 's'}). Check your Downloads folder.`;

  const saveMessage = document.getElementById('saveMessage');
  if (saveMessage) {
    saveMessage.textContent = message;
  }

  const syncStatus = document.getElementById('syncStatus');
  if (syncStatus) {
    syncStatus.textContent = message;
  }
}

function createBackupTextSnapshot() {
  const projects = getProjects();
  const timestamp = getFileTimestamp();
  const filename = sanitizeFileName(`fireyesa-backup-text-${timestamp}`, 'fireyesa-backup-text');
  const backupJson = createBackupJson(projects);
  saveBackupSnapshot(backupJson, `${filename}.json`, projects.length, 'manual-text');
  showManualBackupBox(
    backupJson,
    `Backup text created (${projects.length} inspection${projects.length === 1 ? '' : 's'}). Select all and copy it manually if needed.`
  );
}

function saveBackupSnapshot(backupJson, filename, count, source) {
  localStorage.setItem(
    'fireyesaLastBackup',
    JSON.stringify({
      filename,
      exportedAt: new Date().toISOString(),
      count,
      source
    })
  );
  localStorage.setItem('fireyesaLastBackupJson', backupJson);
  updateAppInfo();
}

function createBackupJson(projects) {
  const backup = {
    app: 'FireyeSA',
    version: 1,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    projects
  };

  return JSON.stringify(backup, null, 2);
}

function downloadBackupJson(backupJson, filename) {
  const blob = new Blob(
    [backupJson],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function downloadProjectsBackup(projects, filename) {
  downloadBackupJson(createBackupJson(projects), filename);
}

async function copyLastBackup() {
  const backupJson = localStorage.getItem('fireyesaLastBackupJson');
  const syncStatus = document.getElementById('syncStatus');

  if (!backupJson) {
    if (syncStatus) {
      syncStatus.textContent = 'No backup has been exported in this browser yet.';
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(backupJson);

    if (syncStatus) {
      syncStatus.textContent = 'Last backup text copied to clipboard.';
    }
  } catch (error) {
    console.error('Copy backup failed:', error);
    showManualBackupBox(backupJson);
  }
}

function showLastBackupText() {
  const backupJson = localStorage.getItem('fireyesaLastBackupJson');
  const syncStatus = document.getElementById('syncStatus');

  if (!backupJson) {
    if (syncStatus) {
      syncStatus.textContent = 'No backup has been exported in this browser yet.';
    }
    return;
  }

  showManualBackupBox(
    backupJson,
    'Backup text is shown below. Select all and copy it manually if Downloads does not appear.'
  );
}

function showManualBackupBox(backupJson, message) {
  const panel = document.getElementById('manualBackupPanel');
  const textarea = document.getElementById('manualBackupText');
  const syncStatus = document.getElementById('syncStatus');

  if (!panel || !textarea) {
    if (syncStatus) {
      syncStatus.textContent = 'Could not open manual backup box.';
    }
    return;
  }

  textarea.value = backupJson;
  panel.style.display = 'block';
  textarea.focus();
  textarea.select();

  if (syncStatus) {
    syncStatus.textContent =
      message ||
      'Clipboard blocked. Backup text is shown below. Select all and copy it manually.';
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function exportEmergencyBackup(reason) {
  const projects = getProjects();
  if (projects.length === 0) return;

  const timestamp = getFileTimestamp();
  const safeReason = sanitizeFileName(reason, 'backup').toLowerCase();
  const filename = sanitizeFileName(
    `fireyesa-before-${safeReason}-${timestamp}`,
    'fireyesa-before-backup'
  );

  downloadProjectsBackup(projects, `${filename}.json`);
}

function importBackupJsonText(backupText, sourceLabel = 'backup') {
  try {
    const backup = JSON.parse(backupText);

    if (!backup.projects || !Array.isArray(backup.projects)) {
      alert('Invalid backup file. No inspections list was found.');
      return false;
    }

    const confirmed = confirm(
      'Import Backup will replace all inspections currently saved on this device. Export a backup first if you are unsure. Continue?'
    );

    if (!confirmed) return false;

    exportEmergencyBackup(`import-${sourceLabel}`);

    setProjects(backup.projects);
    currentProjectId = null;
    currentPhotos = [];

    renderProjectsList();
    showProjectList();

    const message =
      `Backup imported successfully (${backup.projects.length} inspection${backup.projects.length === 1 ? '' : 's'}).`;
    const saveMessage = document.getElementById('saveMessage');
    if (saveMessage) {
      saveMessage.textContent = message;
    }

    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) {
      syncStatus.textContent = message;
    }

    return true;
  } catch (error) {
    console.error('Backup import failed:', error);
    alert('Could not import backup text.');
    return false;
  }
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function(e) {
    importBackupJsonText(e.target.result, 'file');
    event.target.value = '';
  };

  reader.readAsText(file);
}

function importPastedBackup() {
  const textarea = document.getElementById('manualBackupText');
  const syncStatus = document.getElementById('syncStatus');

  if (!textarea || !textarea.value.trim()) {
    if (syncStatus) {
      syncStatus.textContent = 'Paste backup JSON into the manual backup box first.';
    }
    return;
  }

  importBackupJsonText(textarea.value.trim(), 'pasted-text');
}

async function signupUser() {
  const email = getEl('loginEmail').value.trim();
  const password = getEl('loginPassword').value;

  const { error } = await supabaseClient.auth.signUp({ email, password });

  getEl('syncStatus').textContent = error
    ? `Sign up failed: ${error.message}`
    : 'Sign up successful. Check email if confirmation is enabled.';
}

async function loginUser() {
  const email = getEl('loginEmail').value.trim();
  const password = getEl('loginPassword').value;

  const syncStatus = document.getElementById('syncStatus');

  if (syncStatus) {
    syncStatus.textContent = 'Logging in...';
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    console.log('Login result:', { data, error });

    if (error) {
      alert(`Login failed: ${error.message}`);
      if (syncStatus) {
        syncStatus.textContent = `Login failed: ${error.message}`;
      }
      return;
    }

    if (syncStatus) {
      syncStatus.textContent = 'Logged in successfully.';
    }

    updateSyncUI();

    loadUserAccessProfile()
      .then(() => {
        renderProjectsList();
      })
      .catch(error => {
        console.error('Access profile load failed after login:', error);
      });

    safeDownloadNewerCloudInspections();
    uploadPendingInspections();

  } catch (error) {
    console.error('Login crashed:', error);

    if (syncStatus) {
      syncStatus.textContent = `Login crashed: ${error.message}`;
    }

    alert(`Login crashed: ${error.message}`);
  }
}

function initAuthStateListener() {
  if (!supabaseClient?.auth?.onAuthStateChange) return;

  supabaseClient.auth.onAuthStateChange(() => {
    updateSyncUI();
  });
}

  async function uploadSync() {
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !userData.user) {
      getEl('syncStatus').textContent = 'Please login before syncing.';
      return;
    }

    const projects = getProjects();

    const rows = projects.map(project => {
    const cloudMetadata =
      getProjectCloudMetadata(project, userData.user.id);

    return {
      id: project.id,
      user_id: userData.user.id,

      ...cloudMetadata,

      inspection_data: project,
      updated_at: new Date().toISOString()
    };
  });

    const { error } = await supabaseClient
      .from('inspections')
      .upsert(rows, { onConflict: 'id' });

    getEl('syncStatus').textContent = error
      ? `Sync failed: ${error.message}`
      : `Synced ${rows.length} inspection(s) to cloud.`;
}

async function downloadSync() {
  const { data: userData, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    getEl('syncStatus').textContent = 'Please login before downloading sync.';
    return;
  }

  const confirmed = confirm(
    'Download Sync will replace all inspections currently saved on this device with the cloud version. An emergency backup will be exported first. Continue?'
  );

  if (!confirmed) return;

  exportEmergencyBackup('cloud-download');

  let query = supabaseClient
  .from('inspections')
  .select('inspection_data, updated_at')
  .order('updated_at', { ascending: false });

  query = applyInspectionAccessFilter(
    query,
    userData.user.id
  );

  const { data, error } = await query;

  if (error) {
    getEl('syncStatus').textContent = `Download failed: ${error.message}`;
    return;
  }

  const projects = data.map(row => row.inspection_data);

  setProjects(projects);
  currentProjectId = null;
  currentPhotos = [];

  renderProjectsList();
  showProjectList();

  getEl('syncStatus').textContent = `Downloaded ${projects.length} inspection(s) from cloud.`;
}

async function mergeSync() {
  const { data: userData, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    getEl('syncStatus').textContent = 'Please login before merge sync.';
    return;
  }

  const localProjects = getProjects();

  let query = supabaseClient
  .from('inspections')
  .select('inspection_data, updated_at');

  query = applyInspectionAccessFilter(
    query,
    userData.user.id
  );

  const { data, error } = await query;

  if (error) {
    getEl('syncStatus').textContent = `Merge failed: ${error.message}`;
    return;
  }

  const cloudProjects = data.map(row => row.inspection_data);

  const mergedMap = new Map();

  localProjects.forEach(project => {
    mergedMap.set(project.id, project);
  });

  cloudProjects.forEach(cloudProject => {
    const localProject = mergedMap.get(cloudProject.id);

    if (!localProject) {
      mergedMap.set(cloudProject.id, cloudProject);
      return;
    }

    const localTime = localProject.lastSaved
      ? new Date(localProject.lastSaved).getTime()
      : 0;

    const cloudTime = cloudProject.lastSaved
      ? new Date(cloudProject.lastSaved).getTime()
      : 0;

    if (cloudTime > localTime) {
      mergedMap.set(cloudProject.id, cloudProject);
    }
  });

  const mergedProjects = Array.from(mergedMap.values());

  setProjects(mergedProjects);
  renderProjectsList();
  showProjectList();

  const rows = mergedProjects.map(project => {
  const cloudMetadata =
      getProjectCloudMetadata(project, userData.user.id);

    return {
      id: project.id,
      user_id: userData.user.id,

      ...cloudMetadata,

      inspection_data: project,
      updated_at: new Date().toISOString()
    };
  });

  const { error: uploadError } = await supabaseClient
    .from('inspections')
    .upsert(rows, { onConflict: 'id' });

  if (uploadError) {
    getEl('syncStatus').textContent = `Merged locally, but upload failed: ${uploadError.message}`;
    return;
  }

  getEl('syncStatus').textContent = `Merge complete. ${mergedProjects.length} inspection(s) synced.`;
}

async function autoSyncIfLoggedIn() {
  if (!navigator.onLine) return;
  if (typeof supabaseClient === 'undefined') return;

  const syncStatus = document.getElementById('syncStatus');

  try {
    const { data: userData, error } = await supabaseClient.auth.getUser();

    if (error || !userData || !userData.user) {
      return;
    }

    if (syncStatus) syncStatus.textContent = 'Auto syncing...';

    await mergeSync();

    if (syncStatus) syncStatus.textContent = 'Auto sync complete.';
  } catch (err) {
    console.error('Auto sync failed:', err);
    if (syncStatus) syncStatus.textContent = 'Auto sync failed.';
  }
}

async function autoMergeAfterSave() {
  if (window.mergeInProgress) return;
  if (!navigator.onLine) return;
  if (typeof supabaseClient === 'undefined') return;

  window.mergeInProgress = true;

  try {
    const { data: userData } = await supabaseClient.auth.getUser();

    if (!userData || !userData.user) {
      return;
    }

    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) syncStatus.textContent = 'Saving to cloud...';

    await mergeSync();

    if (syncStatus) syncStatus.textContent = 'Saved and synced to cloud.';
  } catch (error) {
    console.error('Auto merge after save failed:', error);

    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) syncStatus.textContent = 'Saved locally. Cloud sync failed.';
  } finally {
    window.mergeInProgress = false;
  }
}

async function updateSyncUI() {
  const connectedView = document.getElementById('cloudConnectedView');
  const syncTools = document.getElementById('syncTools');
  const backupTools = document.getElementById('backupTools');
  const syncStatus = document.getElementById('syncStatus');
  const cloudMenuBtn = document.getElementById('cloudMenuBtn');

  let isLoggedIn = false;

  try {
    const { data, error } = await supabaseClient.auth.getUser();
    isLoggedIn = !error && !!(data && data.user);
  } catch (error) {
    console.error('Cloud status check failed:', error);
  }

  if (cloudMenuBtn) {
    cloudMenuBtn.classList.toggle('connected', isLoggedIn);
    cloudMenuBtn.textContent = isLoggedIn ? 'Cloud connected' : 'Cloud';
  }

  if (connectedView) connectedView.style.display = isLoggedIn ? 'block' : 'none';
  if (syncTools) syncTools.style.display = isLoggedIn ? 'none' : 'block';

  // Keep technical backup tools hidden until Admin / Sync Tools is opened.
  if (backupTools) backupTools.style.display = 'none';

  if (syncStatus) {
    syncStatus.textContent = isLoggedIn
      ? 'Connected. Auto sync enabled.'
      : 'Not connected. Admin login required for cloud sync.';
  }
}

async function restoreCloudSession() {
  const syncStatus = document.getElementById('syncStatus');

  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      if (syncStatus) {
        syncStatus.textContent = `Cloud session check failed: ${error.message}`;
      }

      updateSyncUI();
      return;
    }

    updateSyncUI();

    loadUserAccessProfile()
      .then(() => {
        renderProjectsList();
      })
      .catch(error => {
        console.error('Access profile load failed after session restore:', error);
      });

    if (data && data.session) {
      safeDownloadNewerCloudInspections();
      uploadPendingInspections();
    }

  } catch (error) {
    console.error('Cloud session restore failed:', error);

    if (syncStatus) {
      syncStatus.textContent = 'Cloud session could not be restored.';
    }
  }
}

function showSyncTools() {
  const syncTools = document.getElementById('syncTools');
  const backupTools = document.getElementById('backupTools');

  if (syncTools) syncTools.style.display = 'block';
  if (backupTools) backupTools.style.display = 'grid';
}

async function safeDownloadNewerCloudInspections() {
  if (!navigator.onLine) return;
  if (typeof supabaseClient === 'undefined') return;

  const syncStatus = document.getElementById('syncStatus');

  try {
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError || !userData || !userData.user) {
      return;
    }

    let query = supabaseClient
      .from('inspections')
      .select('inspection_data, updated_at');

    query = applyInspectionAccessFilter(
      query,
      userData.user.id
    );

    const { data, error } = await query;

    if (error) {
      console.error('Safe download failed:', error);
      if (syncStatus) syncStatus.textContent = `Cloud download failed: ${error.message}`;
      return;
    }

    const localProjects = getProjects();
    const mergedMap = new Map();

    localProjects.forEach(project => {
      mergedMap.set(project.id, project);
    });

    data.forEach(row => {
      const cloudProject = row.inspection_data;
      const localProject = mergedMap.get(cloudProject.id);

      if (!localProject) {
        mergedMap.set(cloudProject.id, cloudProject);
        return;
      }

      const localTime = localProject.lastSaved
        ? new Date(localProject.lastSaved).getTime()
        : 0;

      const cloudTime = cloudProject.lastSaved
        ? new Date(cloudProject.lastSaved).getTime()
        : 0;

      if (cloudTime > localTime) {
        mergedMap.set(cloudProject.id, cloudProject);
      }
    });

    const mergedProjects = Array.from(mergedMap.values());

    setProjects(mergedProjects);
    renderProjectsList();

    if (syncStatus) {
      syncStatus.textContent = 'Cloud download check complete.';
    }
  } catch (err) {
    console.error('Safe download failed:', err);
    if (syncStatus) syncStatus.textContent = 'Cloud download failed.';
  }
}

async function loadData() {
  try {
    occupancies = await loadJson('occupancies.json');
    requirements = await loadJson('requirements.json');
    checklists = await loadJson('checklists.json');
    inspectionTemplates = await loadJson('templates.json');
    
    initApp();
    migrateLegacyProductTypes();
    initAuthStateListener();
    
    renderProjectsList();
    await restoreCloudSession();

  } catch (error) {
    console.error('Data loading error:', error);
    document.body.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 24px;">
        <h2>App data failed to load</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}



function updateAppInfo() {
  const appVersion = document.getElementById('appVersion');
  if (appVersion) {
    appVersion.textContent = `Version ${APP_VERSION}`;
  }

  const cloudAppVersion = document.getElementById('cloudAppVersion');
  if (cloudAppVersion) {
    cloudAppVersion.textContent = APP_VERSION;
  }

  const cloudProjectCount = document.getElementById('cloudProjectCount');
  if (cloudProjectCount) {
    const count = getProjects().length;
    cloudProjectCount.textContent =
      `${count} inspection${count === 1 ? '' : 's'}`;
  }

  const cloudLastBackup = document.getElementById('cloudLastBackup');
  if (cloudLastBackup) {
    const saved = localStorage.getItem('fireyesaLastBackup');

    if (!saved) {
      cloudLastBackup.textContent = 'Not exported yet';
      return;
    }

    try {
      const lastBackup = JSON.parse(saved);
      const dateText = lastBackup.exportedAt
        ? new Date(lastBackup.exportedAt).toLocaleString()
        : 'Unknown date';

      cloudLastBackup.textContent =
        `${lastBackup.filename || 'Backup file'} (${dateText})`;
    } catch (error) {
      cloudLastBackup.textContent = 'Unknown';
    }
  }

  const cloudBackupTextStatus = document.getElementById('cloudBackupTextStatus');
  if (cloudBackupTextStatus) {
    const backupJson = localStorage.getItem('fireyesaLastBackupJson');
    cloudBackupTextStatus.textContent = backupJson
      ? `Ready (${formatBytes(backupJson.length)})`
      : 'Not created yet';
  }
}

function initApp() {
  updateAppInfo();

  const showSyncToolsBtn = document.getElementById('showSyncToolsBtn');
  if (showSyncToolsBtn) {
    showSyncToolsBtn.addEventListener('click', showSyncTools);
  }
  const cloudMenuBtn = document.getElementById('cloudMenuBtn');
  const cloudDropdown = document.getElementById('cloudDropdown');

  if (cloudMenuBtn && cloudDropdown) {
    cloudMenuBtn.addEventListener('click', () => {
      cloudDropdown.style.display =
        cloudDropdown.style.display === 'none'
          ? 'block'
          : 'none';
    });
  }
  const actionMenuBtn =
  document.getElementById('actionMenuBtn');

  const actionDropdown =
    document.getElementById('actionDropdown');

  if (actionMenuBtn && actionDropdown) {

    actionMenuBtn.addEventListener('click', () => {

      actionDropdown.style.display =

        actionDropdown.style.display === 'none'
          ? 'block'
          : 'none';
    });
  }
  populateOccupancies();
  populateProductTypes();
  getEl('syncMergeBtn').addEventListener('click', mergeSync);
  getEl('syncDownloadBtn').addEventListener('click', downloadSync);
  getEl('loginBtn').addEventListener('click', loginUser);
  getEl('signupBtn').addEventListener('click', signupUser);
  getEl('syncUploadBtn').addEventListener('click', uploadSync);
  getEl('occupancySelect').addEventListener('change', updateDisplay);
  getEl('saveBtn').addEventListener('click', saveProject);
  getEl('finishBtn').addEventListener('click', finishInspection);
  getEl('reportBtn').addEventListener('click', generateReport);
  getEl('deleteBtn').addEventListener('click', deleteProject);
  getEl('newProjectBtn').addEventListener('click', createNewProject);
  getEl('backBtn').addEventListener('click', showProjectList);
  getEl('photoInput').addEventListener('change', handlePhotoUpload);
  getEl('organisationName').addEventListener('input', scheduleAutoSave);
  getEl('siteName').addEventListener('input', scheduleAutoSave);
  getEl('contactPerson').addEventListener('input', scheduleAutoSave);
  getEl('contactTel').addEventListener('input', scheduleAutoSave);
  getEl('contactEmail').addEventListener('input', scheduleAutoSave);
  getEl('inspectorName').addEventListener('input', scheduleAutoSave);
  getEl('occupancySelect').addEventListener('change', scheduleAutoSave);
  const exportBtn = document.getElementById('exportBtn');

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportReport();
    });
  }
  getEl('shareBtn').addEventListener('click', shareReport);
  getEl('followUpBtn').addEventListener('click', createFollowUpInspection);
  getEl('streetNumber').addEventListener('input', scheduleAutoSave);
  getEl('projectAddress').addEventListener('input', scheduleAutoSave);
  getEl('gps').addEventListener('input', scheduleAutoSave);
  getEl('useLocationBtn').addEventListener('click', useCurrentLocation);
  getEl('inMall').addEventListener('change', () => {
    toggleMallFields();
    scheduleAutoSave();
  });
  getEl('mallName').addEventListener('input', scheduleAutoSave);
  getEl('unitNumber').addEventListener('input', scheduleAutoSave);
  getEl('followUpRequired').addEventListener('change', scheduleAutoSave);
  getEl('followUpDate').addEventListener('input', scheduleAutoSave);
  getEl('followUpNotes').addEventListener('input', scheduleAutoSave);
  getEl('projectSearch').addEventListener('input', renderProjectsList);
  getEl('productType').addEventListener('change', () => {
    updateInspectionTypeOptions();
    updateDisplay();
    scheduleAutoSave();
  });
  getEl('exportBackupBtn').addEventListener('click', exportBackup);
  const adminExportBackupBtn = document.getElementById('adminExportBackupBtn');
  if (adminExportBackupBtn) {
    adminExportBackupBtn.addEventListener('click', exportBackup);
  }
  const copyLastBackupBtn = document.getElementById('copyLastBackupBtn');
  if (copyLastBackupBtn) {
    copyLastBackupBtn.addEventListener('click', copyLastBackup);
  }
  const createBackupTextBtn = document.getElementById('createBackupTextBtn');
  if (createBackupTextBtn) {
    createBackupTextBtn.addEventListener('click', createBackupTextSnapshot);
  }
  const showLastBackupBtn = document.getElementById('showLastBackupBtn');
  if (showLastBackupBtn) {
    showLastBackupBtn.addEventListener('click', showLastBackupText);
  }
  const importPastedBackupBtn = document.getElementById('importPastedBackupBtn');
  if (importPastedBackupBtn) {
    importPastedBackupBtn.addEventListener('click', importPastedBackup);
  }
  getEl('importBackupInput').addEventListener('change', importBackup);
  getEl('inspectionType').addEventListener('change', () => {
    updateDisplay();
    scheduleAutoSave();
  });
    updateInspectionTypeOptions();
    toggleMallFields();
  }

function populateOccupancies() {
  const select = getEl('occupancySelect');
  select.innerHTML = "";

  occupancies.forEach(o => {
    const option = document.createElement('option');
    option.value = o["Occupancy Code"];
    option.textContent = `${o["Occupancy Code"]} - ${o["Occupancy Name"]}`;
    select.appendChild(option);
  });
}

function getDefaultProductType() {
  const productTypes = Object.keys(inspectionTemplates || {});

  if (productTypes.includes('Fire Safety Compliance')) {
    return 'Fire Safety Compliance';
  }

  return productTypes[0] || '';
}

function normalizeProductType(productType) {
  if (productType === 'Fire Safety Officer') {
    return 'Fire Safety Compliance';
  }

  if (productType && inspectionTemplates[productType]) {
    return productType;
  }

  return getDefaultProductType();
}

function getModuleFilterKey(moduleName) {
  return `module-${String(moduleName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

function populateProductTypes(preferredProductType) {
  const select = getEl('productType');
  const productTypes = Object.keys(inspectionTemplates || {});
  const selectedProductType = normalizeProductType(
    preferredProductType || select.value
  );

  select.innerHTML = '';

  productTypes.forEach(moduleName => {
    const option = document.createElement('option');
    option.value = moduleName;
    option.textContent = moduleName;
    select.appendChild(option);
  });

  select.value = selectedProductType;
}

function getCurrentUserRole() {
  return currentUserProfile?.role || 'guest';
}

function isSuperAdmin() {
  return getCurrentUserRole() === 'super_admin';
}

function isCompanyOwner() {
  return getCurrentUserRole() === 'company_owner';
}

function isManager() {
  return getCurrentUserRole() === 'manager';
}

function isInspector() {
  return getCurrentUserRole() === 'inspector';
}

function isViewer() {
  return getCurrentUserRole() === 'viewer';
}

function hasActiveCompanyAccess() {
  if (isSuperAdmin()) return true;

  return currentCompanyAccess?.status === 'active' ||
    currentCompanyAccess?.status === 'trial';
}

function canCreateInspection() {
  if (!currentUserProfile) return true; // temporary while access system is being built

  if (isSuperAdmin()) return true;

  if (!hasActiveCompanyAccess()) return false;

  return ['company_owner', 'manager', 'inspector']
    .includes(getCurrentUserRole());
}

function canEditInspection() {
  if (!currentUserProfile) return true; // temporary while access system is being built

  if (isSuperAdmin()) return true;

  if (!hasActiveCompanyAccess()) return false;

  return ['company_owner', 'manager', 'inspector']
    .includes(getCurrentUserRole());
}

function canViewReports() {
  if (!currentUserProfile) return true; // temporary while access system is being built

  if (isSuperAdmin()) return true;

  if (!hasActiveCompanyAccess()) return false;

  return ['company_owner', 'manager', 'inspector', 'viewer']
    .includes(getCurrentUserRole());
}

function canManageCompany() {
  return isSuperAdmin() || isCompanyOwner();
}

function withTimeout(promise, timeoutMs = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Request timed out')),
        timeoutMs
      )
    )
  ]);
}

function withTimeout(promise, timeoutMs = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Request timed out')),
        timeoutMs
      )
    )
  ]);
}

async function loadUserAccessProfile() {
  currentUserProfile = null;
  currentCompanyAccess = null;

  try {
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError || !userData || !userData.user) {
      updateAccessUI();
      renderProjectsList();
      return;
    }

    const user = userData.user;

    const { data: profile, error: profileError } =
      await withTimeout(
        supabaseClient
          .from('profiles')
          .select('id, email, full_name, role')
          .eq('id', user.id)
          .single(),
        5000
      );

    if (profileError) {
      console.error('Profile load failed:', profileError);

      currentUserProfile = {
        id: user.id,
        email: user.email,
        fullName: user.email,
        role: 'inspector',
        companyId: null,
        companyName: 'Local / Personal Workspace'
      };

      currentCompanyAccess = {
        status: 'active',
        plan: 'development',
        source: 'fallback'
      };

      updateAccessUI();
      renderProjectsList();
      return;
    }

    const { data: membership, error: membershipError } =
      await withTimeout(
        supabaseClient
          .from('company_members')
          .select(`
            company_id,
            role,
            status,
            companies (
              id,
              name,
              status,
              plan
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle(),
        5000
      );

    if (membershipError) {
      console.error('Membership load failed:', membershipError);
    }

    const company =
      membership?.companies || null;

    currentUserProfile = {
      id: profile.id,
      email: profile.email || user.email,
      fullName: profile.full_name || profile.email || user.email,
      role: membership?.role || profile.role || 'inspector',
      companyId: company?.id || membership?.company_id || null,
      companyName: company?.name || 'Local / Personal Workspace'
    };

    currentCompanyAccess = {
      status: company?.status || 'active',
      plan: company?.plan || 'development',
      membershipStatus: membership?.status || 'active',
      source: company ? 'supabase' : 'fallback'
    };

    updateAccessUI();

  } catch (error) {
    console.error('Access profile load failed:', error);

    currentUserProfile = null;
    currentCompanyAccess = null;

    updateAccessUI();
  }
}

function updateAccessUI() {
  window.currentUserProfile = currentUserProfile;
  window.currentCompanyAccess = currentCompanyAccess;

  const syncStatus = document.getElementById('syncStatus');

  if (!syncStatus) return;

  if (!currentUserProfile) {
    syncStatus.textContent =
      'Not connected. Admin login required for cloud sync.';
    return;
  }

  syncStatus.textContent =
    `Access: ${currentUserProfile.role} | ${currentCompanyAccess?.status || 'unknown'}`;
}

function getAccessMetadata() {
  return {
    companyId:
      currentUserProfile?.companyId || null,

    companyName:
      currentUserProfile?.companyName || 'Local / Personal Workspace',

    createdByUserId:
      currentUserProfile?.id || null,

    createdByEmail:
      currentUserProfile?.email || '',

    userRole:
      currentUserProfile?.role || 'guest',

    companyAccessStatus:
      currentCompanyAccess?.status || 'unknown'
  };
}

function getProjectCloudMetadata(project, userId) {
  return {
    company_id:
      project.companyId ||
      currentUserProfile?.companyId ||
      null,

    created_by_user_id:
      project.createdByUserId ||
      currentUserProfile?.id ||
      userId,

    last_edited_by_user_id:
      project.lastEditedByUserId ||
      currentUserProfile?.id ||
      userId,

    company_access_status:
      project.companyAccessStatus ||
      currentCompanyAccess?.status ||
      null,

    created_by_email:
      project.createdByEmail ||
      currentUserProfile?.email ||
      '',

    last_edited_by_email:
      project.lastEditedByEmail ||
      currentUserProfile?.email ||
      ''
  };
}

function applyInspectionAccessFilter(query, userId) {
  if (currentUserProfile?.companyId) {
    return query.eq('company_id', currentUserProfile.companyId);
  }

  return query.eq('user_id', userId);
}

function applyInspectionDeleteFilter(query, userId) {
  if (currentUserProfile?.companyId) {
    return query.eq('company_id', currentUserProfile.companyId);
  }

  return query.eq('user_id', userId);
}

function getProjects() {
  const saved = localStorage.getItem('fireyeProjects');
  return saved ? JSON.parse(saved) : [];
}

function setProjects(projects) {
  localStorage.setItem('fireyeProjects', JSON.stringify(projects));
}

function migrateLegacyProductTypes() {
  const projects = getProjects();
  let changed = false;

  const migratedProjects = projects.map(project => {
    const normalizedProductType = normalizeProductType(project.productType);

    if (project.productType === normalizedProductType) {
      return project;
    }

    changed = true;

    return {
      ...project,
      productType: normalizedProductType
    };
  });

  if (changed) {
    setProjects(migratedProjects);
  }
}

function createNewProject() {

  if (!canCreateInspection()) {
    alert(
      'Your company access does not allow new inspections. Please contact your company admin or FireyeSA support.'
    );
    return;
  }

  clearTimeout(autoSaveTimer);
  currentProjectId = null;

  const existingHistoryPanel =
    document.getElementById('siteHistoryPanel');

  if (existingHistoryPanel) {
    existingHistoryPanel.remove();
  }

  populateProductTypes('Fire Safety Compliance');
  updateInspectionTypeOptions();
  clearInputValue('organisationName');
  clearInputValue('siteName');
  getEl('inspectionType').value = 'General Fire Inspection';
  clearInputValue('inspectorName');
  getEl('occupancySelect').selectedIndex = 0;
  getEl('saveMessage').textContent = '';
  clearInputValue('streetNumber');
  clearInputValue('projectAddress');
  clearInputValue('gps');
  getEl('inMall').value = 'No';
  clearInputValue('mallName');
  clearInputValue('unitNumber');
  clearInputValue('contactPerson');
  clearInputValue('contactTel');
  clearInputValue('contactEmail');  
  getEl('followUpRequired').value = 'No';
  clearInputValue('followUpDate');
  clearInputValue('followUpNotes');
  toggleMallFields();

  

  currentPhotos = [];
  renderPhotos();

  const reportSection = document.getElementById('reportSection');
  if (reportSection) {
    reportSection.style.display = 'none';
  }

  const reportContent = document.getElementById('reportContent');
  if (reportContent) {
    reportContent.innerHTML = '';
  }

  updateDisplay();

  showProjectForm();
}

function showProjectList() {
  const reportSection = document.getElementById('reportSection');
  if (reportSection) {
    reportSection.style.display = 'none';
  }

  getEl('projectListSection').style.display = 'block';
  getEl('projectFormSection').style.display = 'none';
  renderProjectsList();
}

function showProjectForm() {
  getEl('projectListSection').style.display = 'none';
  getEl('projectFormSection').style.display = 'block';
  updateProjectReadinessPanel();
}

function getFollowUpStatus(project) {
  if (project.followUpRequired !== 'Yes' || !project.followUpDate) {
    return { label: 'No Follow-up', class: 'status-none' };
  }

  const today = new Date();
  const dueDate = new Date(project.followUpDate);

  today.setHours(0,0,0,0);
  dueDate.setHours(0,0,0,0);

  const diffDays = (dueDate - today) / (1000 * 60 * 60 * 24);

  if (diffDays < 0) {
    return { label: 'Overdue', class: 'status-overdue' };
  }

  if (diffDays <= 2) {
    return { label: 'Due Soon', class: 'status-soon' };
  }

  return { label: 'Scheduled', class: 'status-scheduled' };
}

function renderReminderBanner(projects) {
  const banner = document.getElementById('reminderBanner');
  if (!banner) return;

  let overdue = 0;
  let soon = 0;

  let expiredEquipment = 0;
  let equipmentDueSoon = 0;

  projects.forEach(project => {
    const status = getFollowUpStatus(project);

    if (status.class === 'status-overdue') overdue++;
    if (status.class === 'status-soon') soon++;

    const expiryCounts =
      getProjectExpiryCounts(project);

    expiredEquipment += expiryCounts.overdue;
    equipmentDueSoon += expiryCounts.soon;
  });

  if (
  overdue === 0 &&
  soon === 0 &&
  expiredEquipment === 0 &&
  equipmentDueSoon === 0
) {
  banner.style.display = 'none';
  banner.innerHTML = '';
  return;
}

banner.style.display = 'block';

if (expiredEquipment > 0) {
  banner.innerHTML =
    `Attention: <strong>${expiredEquipment}</strong> equipment expiry item${expiredEquipment === 1 ? '' : 's'} expired.`;
  return;
}

if (overdue > 0) {
  banner.innerHTML =
    `Attention: You have <strong>${overdue}</strong> overdue inspection${overdue === 1 ? '' : 's'} requiring attention.`;
  return;
}

if (equipmentDueSoon > 0) {
  banner.innerHTML =
    `Reminder: <strong>${equipmentDueSoon}</strong> equipment expiry item${equipmentDueSoon === 1 ? '' : 's'} due soon.`;
  return;
}

banner.innerHTML =
  `Reminder: You have <strong>${soon}</strong> inspection${soon === 1 ? '' : 's'} due soon.`;
}

function getExpiryStatus(expiryDate) {

  if (!expiryDate) {
    return 'none';
  }

  const today = new Date();

  const expiry = new Date(expiryDate);

  const diffDays =
    Math.ceil(
      (expiry - today) /
      (1000 * 60 * 60 * 24)
    );

  if (diffDays < 0) {
    return 'overdue';
  }

  if (diffDays <= 30) {
    return 'soon';
  }

  return 'scheduled';
}

function isExpiryTrackedChecklistItem(checklistItem) {
  return (
    checklistItem?.["Track Expiry"] === true ||
    checklistItem?.TrackExpiry === true ||
    checklistItem?.trackExpiry === true
  );
}

function isExpiryApplicableAnswer(answerValue) {
  return String(answerValue || '').trim().toLowerCase() !== 'n/a';
}

function updateExpiryInputState(selectEl) {
  const row = selectEl.closest('.checklist-row');
  const expiryField = row?.querySelector('.expiry-date');
  const expiryWrapper = row?.querySelector('.expiry-wrapper');

  if (!expiryField || !expiryWrapper) return;

  const expiryApplies = isExpiryApplicableAnswer(selectEl.value);

  if (!expiryApplies) {
    expiryField.value = '';
  }

  expiryField.disabled = !expiryApplies;
  expiryWrapper.classList.toggle('expiry-disabled', !expiryApplies);
}

function getProjectExpiryCounts(project) {
  const counts = {
    overdue: 0,
    soon: 0,
    scheduled: 0,
    missing: 0
  };

  const checklist =
    getChecklistForProject(project);

  (project.answers || []).forEach(answer => {

    const checklistItem =
      checklist[answer.itemIndex];

    if (!isExpiryTrackedChecklistItem(checklistItem)) return;
    if (!isExpiryApplicableAnswer(answer.answer)) return;

    if (!answer.expiryDate) {
      counts.missing++;
      return;
    }

    const status =
      getExpiryStatus(answer.expiryDate);

    if (status === 'overdue') {
      counts.overdue++;
    }

    else if (status === 'soon') {
      counts.soon++;
    }

    else if (status === 'scheduled') {
      counts.scheduled++;
    }

  });

  counts.total =
  counts.overdue +
  counts.soon +
  counts.scheduled +
  counts.missing;

  return counts;
}

function getProjectExpiryAnswer(project, expiryStatus) {
  const checklist = getChecklistForProject(project);

  return (project.answers || []).find(answer => {
    const checklistItem = checklist[answer.itemIndex];

    if (!isExpiryTrackedChecklistItem(checklistItem)) return false;
    if (!isExpiryApplicableAnswer(answer.answer)) return false;

    if (expiryStatus === 'missing') {
      return !answer.expiryDate;
    }

    return getExpiryStatus(answer.expiryDate) === expiryStatus;
  });
}

function getProjectCompletionCounts(project) {
  const answers = project.answers || [];
  const total = answers.length;
  const answered = answers.filter(answer =>
    ['yes', 'no', 'n/a'].includes(
      String(answer.answer || '').trim().toLowerCase()
    )
  ).length;
  const noCount = answers.filter(answer =>
    String(answer.answer || '').trim().toLowerCase() === 'no'
  ).length;

  return {
    total,
    answered,
    unanswered: Math.max(total - answered, 0),
    noCount
  };
}

function getProjectDataQuality(project) {
  const missing = [];
  const projectTitle =
    project.projectName ||
    [project.organisationName, project.siteName].filter(Boolean).join(' ');
  const projectAddress =
    project.projectAddress ||
    combineStreetAddress(project.streetNumber, project.addressLine);

  if (!projectTitle) missing.push('Premises / Site');
  if (!project.inspectorName) missing.push('Inspector');
  if (!projectAddress) missing.push('Address');
  if (!project.contactPerson) missing.push('Contact Person');
  if (!project.contactTel && !project.contactEmail) {
    missing.push('Contact Tel/Email');
  }
  if (project.inMall === 'Yes' && !project.mallName) {
    missing.push('Mall/Centre Name');
  }
  if (project.inMall === 'Yes' && !project.unitNumber) {
    missing.push('Unit / Shop Number');
  }

  return {
    missing,
    count: missing.length
  };
}

function getProjectInspectionStatus(project) {
  const completion = getProjectCompletionCounts(project);
  const expiryCounts = getProjectExpiryCounts(project);
  const dataQuality = getProjectDataQuality(project);

  if (completion.noCount > 0 || expiryCounts.overdue > 0) {
    return {
      label: 'Needs Attention',
      class: 'inspection-attention',
      filter: 'inspection-attention',
      detail: `${completion.noCount} issue${completion.noCount === 1 ? '' : 's'}`
    };
  }

  if (expiryCounts.missing > 0 || dataQuality.count > 0) {
    const missingCount = expiryCounts.missing + dataQuality.count;

    return {
      label: 'Missing Data',
      class: 'inspection-warning',
      filter: 'inspection-warning',
      detail: `${missingCount} item${missingCount === 1 ? '' : 's'}`
    };
  }

  if (completion.total === 0 || completion.answered === 0) {
    return {
      label: 'Draft',
      class: 'inspection-draft',
      filter: 'inspection-draft',
      detail: 'Not started'
    };
  }

  if (completion.unanswered > 0) {
    return {
      label: 'In Progress',
      class: 'inspection-progress',
      filter: 'inspection-progress',
      detail: `${completion.answered}/${completion.total} answered`
    };
  }

  return {
    label: 'Completed',
    class: 'inspection-complete',
    filter: 'inspection-complete',
    detail: `${completion.answered}/${completion.total} answered`
  };
}

function getCurrentFormProjectSnapshot() {
  const organisationName = getEl('organisationName').value.trim();
  const siteName = getEl('siteName').value.trim();
  const streetNumber = getEl('streetNumber').value.trim();
  const addressLine = getEl('projectAddress').value.trim();
  const productType = normalizeProductType(getEl('productType').value);
  const inspectionType = getEl('inspectionType').value;
  const occupancy = getEl('occupancySelect').value;
  const selectedChecklist = getActiveTemplateChecklist() || [];

  const answers = [];

  document.querySelectorAll('.answer-select').forEach((field, index) => {
    const noteField = document.getElementById(`note_${index}`);
    const expiryField =
      document.querySelector(`.expiry-date[data-index="${index}"]`);

    answers.push({
      itemIndex: index,
      itemNumber:
        selectedChecklist[index]?.["Item Number"] ||
        String(index + 1),
      answer: field.value,
      note: noteField ? noteField.value.trim() : '',
      expiryDate: expiryField ? expiryField.value : null
    });
  });

  return {
    id: currentProjectId,
    organisationName,
    siteName,
    projectName:
      [organisationName, siteName]
        .filter(Boolean)
        .join(' '),
    streetNumber,
    addressLine,
    projectAddress: combineStreetAddress(streetNumber, addressLine),
    gps: getEl('gps').value.trim(),
    inMall: getEl('inMall').value || 'No',
    mallName: getEl('mallName').value.trim(),
    unitNumber: getEl('unitNumber').value.trim(),
    contactPerson: getEl('contactPerson').value.trim(),
    contactTel: getEl('contactTel').value.trim(),
    contactEmail: getEl('contactEmail').value.trim(),
    inspectorName: getEl('inspectorName').value.trim(),
    productType,
    inspectionType,
    occupancy,
    answers
  };
}

function updateProjectReadinessPanel() {
  const panel = document.getElementById('projectReadinessPanel');
  if (!panel) return;

  if (getEl('projectFormSection').style.display === 'none') {
    panel.innerHTML = '';
    return;
  }

  const project = getCurrentFormProjectSnapshot();
  const completion = getProjectCompletionCounts(project);
  const expiryCounts = getProjectExpiryCounts(project);
  const dataQuality = getProjectDataQuality(project);
  const status = getProjectInspectionStatus(project);
  const percent = completion.total
    ? Math.round((completion.answered / completion.total) * 100)
    : 0;

  const missingText = dataQuality.count > 0
    ? dataQuality.missing.join(', ')
    : 'None';
  const cardAction = (count, action) =>
    count > 0
      ? `button type="button" data-readiness-action="${action}"`
      : 'div';

  const cardEnd = count =>
    count > 0 ? 'button' : 'div';

  const cardClass = (count, stateClass = '') =>
    [
      'readiness-chip',
      count > 0 ? 'readiness-chip-action' : '',
      count > 0 ? stateClass : ''
    ]
      .filter(Boolean)
      .join(' ');

  const cardHint = count =>
    count > 0
      ? '<span class="readiness-review-hint">Review</span>'
      : '';

  panel.innerHTML = `
    <div class="readiness-top">
      <div>
        <div class="readiness-title">Inspection Readiness</div>
        <div class="readiness-subtitle">
          ${completion.answered}/${completion.total} checklist items answered (${percent}%)
        </div>
      </div>

      <span class="project-inspection-status ${escapeHtml(status.class)}">
        ${escapeHtml(status.label)}
        <small>${escapeHtml(status.detail)}</small>
      </span>
    </div>

    <div class="readiness-grid">
      <${cardAction(completion.noCount, 'finding')} class="${cardClass(completion.noCount, 'readiness-danger')}">
        <strong>${completion.noCount}</strong>
        <span>No / Findings</span>
        ${cardHint(completion.noCount)}
      </${cardEnd(completion.noCount)}>

      <${cardAction(completion.unanswered, 'unanswered')} class="${cardClass(completion.unanswered, 'readiness-progress')}">
        <strong>${completion.unanswered}</strong>
        <span>Unanswered</span>
        ${cardHint(completion.unanswered)}
      </${cardEnd(completion.unanswered)}>

      <${cardAction(expiryCounts.overdue, 'expiry-overdue')} class="${cardClass(expiryCounts.overdue, 'readiness-danger')}">
        <strong>${expiryCounts.overdue}</strong>
        <span>Expired</span>
        ${cardHint(expiryCounts.overdue)}
      </${cardEnd(expiryCounts.overdue)}>

      <${cardAction(expiryCounts.soon, 'expiry-soon')} class="${cardClass(expiryCounts.soon, 'readiness-warning-state')}">
        <strong>${expiryCounts.soon}</strong>
        <span>Due Soon</span>
        ${cardHint(expiryCounts.soon)}
      </${cardEnd(expiryCounts.soon)}>

      <${cardAction(expiryCounts.missing, 'expiry-missing')} class="${cardClass(expiryCounts.missing, 'readiness-warning-state')}">
        <strong>${expiryCounts.missing}</strong>
        <span>Expiry Missing</span>
        ${cardHint(expiryCounts.missing)}
      </${cardEnd(expiryCounts.missing)}>

      <${cardAction(dataQuality.count, 'info')} class="${cardClass(dataQuality.count, 'readiness-warning-state')}">
        <strong>${dataQuality.count}</strong>
        <span>Info Missing</span>
        ${cardHint(dataQuality.count)}
      </${cardEnd(dataQuality.count)}>
    </div>

    ${dataQuality.count > 0 ? `
      <div class="readiness-warning">
        Missing project info: ${escapeHtml(missingText)}
      </div>
    ` : ''}
  `;

  bindReadinessActionButtons(panel);
}

function getChecklistForProject(project) {
  const productType = normalizeProductType(project.productType);
  const inspectionType = project.inspectionType || '';
  const occupancy = project.occupancy || '';

  if (
    inspectionTemplates[productType] &&
    inspectionTemplates[productType][inspectionType]
  ) {
    const template = inspectionTemplates[productType][inspectionType];

    return template.flatMap(section =>
      section.items
        .filter(item => {
          const applicableToRaw = item["Applicable To"] || ["All"];
          const applicableTo = Array.isArray(applicableToRaw)
            ? applicableToRaw
            : [applicableToRaw];

          return (
            applicableTo.includes("All") ||
            applicableTo.includes(occupancy)
          );
        })
        .map(item => ({
          ...item,
          Section: section.sectionName
        }))
    );
  }

  return checklists.filter(item =>
    item["Applicable To"] === "All occupancies" ||
    item["Applicable To"] === occupancy
  );
}

function getHighRiskSummary(project) {
  const failedAnswers = (project.answers || []).filter(
    answer => answer.answer === 'No'
  );

  if (failedAnswers.length === 0) {
    return {
      count: 0,
      text: ''
    };
  }

  const checklist = getChecklistForProject(project);
  const firstFailed = failedAnswers[0];
  const matchedItem = checklist.find((item, index) =>
    index === firstFailed.itemIndex ||
    String(item["Item Number"]) === String(firstFailed.itemNumber)
  );

  return {
    count: failedAnswers.length,
    text:
      matchedItem?.["Non Compliance Text"] ||
      matchedItem?.["Checklist Item"] ||
      `Item ${firstFailed.itemNumber || firstFailed.itemIndex + 1}`
  };
}

function focusFirstProjectIssue(project) {
  const firstIssue = (project.answers || []).find(
    answer => answer.answer === 'No'
  );

  if (!firstIssue) return;

  const field = document.getElementById(`check_${firstIssue.itemIndex}`);
  const row = field?.closest('.checklist-row');

  if (!row) return;
  openChecklistRow(row, field);
}

function openChecklistRow(row, focusTarget) {
  if (!row) return;

  const section = row.closest('.section-group');

  if (section) {
    section.classList.remove('hidden');

    const sectionIndex = section.id.replace('section_', '');
    const arrow = document.getElementById(`arrow_${sectionIndex}`);

    if (arrow) {
      arrow.textContent = 'v';
    }
  }

  row.classList.add('issue-focus');

  row.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });

  if (focusTarget) {
    focusTarget.focus();
  }

  setTimeout(() => {
    row.classList.remove('issue-focus');
  }, 3000);
}

function focusFirstCurrentIssue() {
  focusFirstProjectIssue(getCurrentFormProjectSnapshot());
}

function focusFirstCurrentExpiry(expiryStatus) {
  focusFirstProjectExpiry(getCurrentFormProjectSnapshot(), expiryStatus);
}

function focusFirstUnansweredChecklistItem() {
  const field = Array.from(
    document.querySelectorAll('.answer-select')
  ).find(select => !select.value);

  if (!field) return;

  openChecklistRow(field.closest('.checklist-row'), field);
}

function focusInputField(field) {
  if (!field) return;

  field.classList.add('field-focus');
  field.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
  field.focus();

  setTimeout(() => {
    field.classList.remove('field-focus');
  }, 3000);
}

function focusFirstMissingProjectInfo() {
  const missingChecks = [
    () => !getEl('siteName').value.trim() && getEl('siteName'),
    () => !getEl('inspectorName').value.trim() && getEl('inspectorName'),
    () => !combineStreetAddress(
      getEl('streetNumber').value.trim(),
      getEl('projectAddress').value.trim()
    ) && getEl('projectAddress'),
    () => !getEl('contactPerson').value.trim() && getEl('contactPerson'),
    () => (
      !getEl('contactTel').value.trim() &&
      !getEl('contactEmail').value.trim()
    ) && getEl('contactTel'),
    () => (
      getEl('inMall').value === 'Yes' &&
      !getEl('mallName').value.trim()
    ) && getEl('mallName'),
    () => (
      getEl('inMall').value === 'Yes' &&
      !getEl('unitNumber').value.trim()
    ) && getEl('unitNumber')
  ];

  for (const check of missingChecks) {
    const field = check();
    if (field) {
      focusInputField(field);
      return;
    }
  }
}

function setReadinessMessage(message) {
  const saveMessage = document.getElementById('saveMessage');
  if (saveMessage) {
    saveMessage.textContent = message;
  }
}

function bindReadinessActionButtons(panel) {
  panel
    .querySelectorAll('[data-readiness-action]')
    .forEach(button => {
      button.addEventListener('click', () => {
        handleReadinessAction(button.dataset.readinessAction);
      });
    });
}

function handleReadinessAction(action) {
  if (action === 'finding') {
    focusFirstCurrentIssue();
    setReadinessMessage('Jumped to first finding.');
    return;
  }

  if (action === 'unanswered') {
    focusFirstUnansweredChecklistItem();
    setReadinessMessage('Jumped to first unanswered item.');
    return;
  }

  if (action === 'expiry-overdue') {
    focusFirstCurrentExpiry('overdue');
    setReadinessMessage('Jumped to first expired equipment item.');
    return;
  }

  if (action === 'expiry-soon') {
    focusFirstCurrentExpiry('soon');
    setReadinessMessage('Jumped to first equipment item due soon.');
    return;
  }

  if (action === 'expiry-missing') {
    focusFirstCurrentExpiry('missing');
    setReadinessMessage('Jumped to first missing expiry date.');
    return;
  }

  if (action === 'info') {
    focusFirstMissingProjectInfo();
    setReadinessMessage('Jumped to first missing project info field.');
  }
}

window.focusFirstCurrentIssue = focusFirstCurrentIssue;
window.focusFirstCurrentExpiry = focusFirstCurrentExpiry;
window.focusFirstUnansweredChecklistItem = focusFirstUnansweredChecklistItem;
window.focusFirstMissingProjectInfo = focusFirstMissingProjectInfo;

function focusFirstProjectExpiry(project, expiryStatus) {
  const firstExpiry = getProjectExpiryAnswer(project, expiryStatus);

  if (!firstExpiry) return;

  const expiryField = document.querySelector(
    `.expiry-date[data-index="${firstExpiry.itemIndex}"]`
  );
  const row = expiryField?.closest('.checklist-row');

  if (!row) return;

  const section = row.closest('.section-group');

  if (section) {
    section.classList.remove('hidden');

    const sectionIndex = section.id.replace('section_', '');
    const arrow = document.getElementById(`arrow_${sectionIndex}`);

    if (arrow) {
      arrow.textContent = 'v';
    }
  }

  row.classList.add('expiry-focus');

  row.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });

  if (expiryField) {
    expiryField.focus();
  }

  setTimeout(() => {
    row.classList.remove('expiry-focus');
  }, 3000);
}

function renderDashboard(projects) {
  const dashboard = document.getElementById('dashboardSummary');
  if (!dashboard) return;

  let total = projects.length;
  let overdue = 0;
  let soon = 0;
  let scheduled = 0;
  let none = 0;

  projects.forEach(project => {
    const status = getFollowUpStatus(project);

    if (status.class === 'status-overdue') overdue++;
    else if (status.class === 'status-soon') soon++;
    else if (status.class === 'status-scheduled') scheduled++;
    else none++;
  });

  dashboard.innerHTML = `
  <div class="dash-card">Total<br><strong>${total}</strong></div>

  <div class="dash-card dash-overdue">
    Overdue<br><strong>${overdue}</strong>
  </div>

  <div class="dash-card dash-soon">
    Due Soon<br><strong>${soon}</strong>
  </div>

  <div class="dash-card dash-scheduled">
    Scheduled<br><strong>${scheduled}</strong>
  </div>

  <div class="dash-card dash-none">
    No Follow-up<br><strong>${none}</strong>
  </div>
`;
}

function renderDashboardMetrics() {

  const container =
    document.getElementById('dashboardMetrics');

  if (!container) return;

  const projects = getProjects();

  let expiredItems = 0;
  let expiringSoonItems = 0;
  let scheduledItems = 0;
  let missingExpiryItems = 0;

  projects.forEach(project => {
    const counts = getProjectExpiryCounts(project);

    expiredItems += counts.overdue;
    expiringSoonItems += counts.soon;
    scheduledItems += counts.scheduled;
    missingExpiryItems += counts.missing;
  });

  const total = projects.length;

  const followUps = projects.filter(
    p => p.followUpRequired === 'Yes'
  );

  const overdue = followUps.filter(p => {

    if (!p.followUpDate) return false;

    return new Date(p.followUpDate) < new Date();

  }).length;

  const dueSoon = followUps.filter(p => {

    if (!p.followUpDate) return false;

    const today = new Date();

    const due = new Date(p.followUpDate);

    const diffDays =
      (due - today) / (1000 * 60 * 60 * 24);

    return diffDays >= 0 && diffDays <= 7;

  }).length;

  const highRisk = projects.filter(p =>
    p.answers?.some(a => a.answer === 'No')
  ).length;

  const inspectionStatusCounts = projects.reduce((counts, project) => {
    const status = getProjectInspectionStatus(project);
    counts[status.filter] = (counts[status.filter] || 0) + 1;
    return counts;
  }, {});

  container.innerHTML = `
    <div class="metric-group">
      <div class="metric-section-title">Tap to filter projects</div>
      <div class="metric-row">

        <div class="metric-card"
         data-filter="all"
         onclick="setFilter('all')">
          <div class="metric-number">${total}</div>
          <div class="metric-label">
            Total Inspections
          </div>
        </div>

        <div class="metric-card"
         data-filter="followups"
         onclick="setFilter('followups')">
          <div class="metric-number">${followUps.length}</div>
          <div class="metric-label">
            Follow-ups
          </div>
        </div>

        <div class="metric-card"
         data-filter="soon"
         onclick="setFilter('soon')">
          <div class="metric-number">${dueSoon}</div>
          <div class="metric-label">
            Due Soon
          </div>
        </div>

        <div class="metric-card"
         data-filter="overdue"
         onclick="setFilter('overdue')">
          <div class="metric-number">${overdue}</div>
          <div class="metric-label">
            Overdue
          </div>
        </div>

        <div class="metric-card"
          data-filter="risk"
          onclick="setFilter('risk')">
          <div class="metric-number">${highRisk}</div>
          <div class="metric-label">
            High Risk
          </div>
        </div>
      </div>
    </div>

    <div class="metric-group metric-group-secondary">
      <div class="metric-section-title">
        Inspection status
      </div>
      <div class="metric-row">

        <div class="metric-card"
          data-filter="inspection-attention"
          onclick="setFilter('inspection-attention')">
          <div class="metric-number">${inspectionStatusCounts['inspection-attention'] || 0}</div>
          <div class="metric-label">Attention</div>
        </div>

        <div class="metric-card"
          data-filter="inspection-warning"
          onclick="setFilter('inspection-warning')">
          <div class="metric-number">${inspectionStatusCounts['inspection-warning'] || 0}</div>
          <div class="metric-label">Missing Data</div>
        </div>

        <div class="metric-card"
          data-filter="inspection-progress"
          onclick="setFilter('inspection-progress')">
          <div class="metric-number">${inspectionStatusCounts['inspection-progress'] || 0}</div>
          <div class="metric-label">In Progress</div>
        </div>

        <div class="metric-card"
          data-filter="inspection-complete"
          onclick="setFilter('inspection-complete')">
          <div class="metric-number">${inspectionStatusCounts['inspection-complete'] || 0}</div>
          <div class="metric-label">Completed</div>
        </div>

        <div class="metric-card"
          data-filter="inspection-draft"
          onclick="setFilter('inspection-draft')">
          <div class="metric-number">${inspectionStatusCounts['inspection-draft'] || 0}</div>
          <div class="metric-label">Draft</div>
        </div>

      </div>
    </div>

    <div class="metric-group metric-group-secondary">
      <div class="metric-section-title">
        Equipment expiry summary
      </div>
      <div class="metric-row">

        <div class="metric-card"
          data-filter="expiry-overdue"
          onclick="setFilter('expiry-overdue')">
          <div class="metric-number">${expiredItems}</div>
          <div class="metric-label">Expired</div>
        </div>

        <div class="metric-card"
          data-filter="expiry-soon"
          onclick="setFilter('expiry-soon')">
          <div class="metric-number">${expiringSoonItems}</div>
          <div class="metric-label">Due Soon</div>
        </div>

        <div class="metric-card"
          data-filter="expiry-scheduled"
          onclick="setFilter('expiry-scheduled')">
          <div class="metric-number">${scheduledItems}</div>
          <div class="metric-label">Scheduled</div>
        </div>

        <div class="metric-card"
          data-filter="expiry-missing"
          onclick="setFilter('expiry-missing')">
          <div class="metric-number">${missingExpiryItems}</div>
          <div class="metric-label">Date Missing</div>
        </div>
        
      </div>
    </div>

  `;

  updateDashboardSelection();
}

function updateDashboardSelection() {

  document
    .querySelectorAll('.metric-card')
    .forEach(card => {

      card.classList.remove('metric-active');

      const filter =
        card.dataset.filter;

      if (filter === currentFilter) {
        card.classList.add('metric-active');
      }
    });
}

function getSyncStatus(project) {
  if (project.syncError) {
    return { label: 'Cloud Error', class: 'sync-error' };
  }

  if (project.syncPending) {
    return { label: 'Pending Upload', class: 'sync-pending' };
  }

  return { label: 'Synced', class: 'sync-synced' };
}

function renderProjectsList() {
  const projects = getProjects();
  updateAppInfo();
  
  // renderReminderBanner(projects);
  renderDashboardMetrics();

  const container = getEl('projectsList');
  const searchField = document.getElementById('projectSearch');
  const searchText = searchField ? searchField.value.trim().toLowerCase() : '';

  container.innerHTML = '';

 const filteredProjects = projects.filter(project => {

  const followStatus = getFollowUpStatus(project);

  // Search filter
  if (searchText) {
    const placeName = (project.projectName || '').toLowerCase();
    const address = (project.projectAddress || '').toLowerCase();
    const mallName = (project.mallName || '').toLowerCase();
    const unitNumber = (project.unitNumber || '').toLowerCase();
    const moduleName = normalizeProductType(project.productType).toLowerCase();
    const inspectionType = (project.inspectionType || '').toLowerCase();

    const matchesSearch =
      placeName.includes(searchText) ||
      address.includes(searchText) ||
      mallName.includes(searchText) ||
      unitNumber.includes(searchText) ||
      moduleName.includes(searchText) ||
      inspectionType.includes(searchText);

    if (!matchesSearch) return false;
  }

  // Follow-up filter
  if (currentFilter === 'overdue') {
    return followStatus.class === 'status-overdue';
  }

  if (currentFilter === 'soon') {
    return followStatus.class === 'status-soon';
  }

  if (currentFilter === 'none') {
    return followStatus.class === 'status-none';
  }

  if (currentFilter === 'followups') {
    return project.followUpRequired === 'Yes';
  }

  if (currentFilter === 'risk') {
    return project.answers?.some(
      a => a.answer === 'No'
    );
  }

  if (currentFilter.startsWith('module-')) {
    return getModuleFilterKey(normalizeProductType(project.productType)) === currentFilter;
  }

  if (currentFilter.startsWith('inspection-')) {
    return getProjectInspectionStatus(project).filter === currentFilter;
  }

  if (currentFilter === 'expiry-overdue') {
    return getProjectExpiryCounts(project).overdue > 0;
  }

  if (currentFilter === 'expiry-soon') {
    return getProjectExpiryCounts(project).soon > 0;
  }

  if (currentFilter === 'expiry-scheduled') {
    return getProjectExpiryCounts(project).scheduled > 0;
  }

  if (currentFilter === 'expiry-missing') {
    return getProjectExpiryCounts(project).missing > 0;
  }

  return true; // default = all
});

  filteredProjects.sort((a, b) => {
    const getProjectPriority = project => {
      const followStatus = getFollowUpStatus(project);
      const expiryCounts = getProjectExpiryCounts(project);
      const hasHighRisk = project.answers?.some(
        answer => answer.answer === 'No'
      );

      if (hasHighRisk) return 1;
      if (expiryCounts.overdue > 0) return 2;
      if (followStatus.class === 'status-overdue') return 3;
      if (expiryCounts.soon > 0) return 4;
      if (followStatus.class === 'status-soon') return 5;
      return 6;
    };

    const priorityDiff =
      getProjectPriority(a) - getProjectPriority(b);

    if (priorityDiff !== 0) return priorityDiff;

    const aTime = a.lastSaved ? new Date(a.lastSaved).getTime() : 0;
    const bTime = b.lastSaved ? new Date(b.lastSaved).getTime() : 0;

    return bTime - aTime;
  });

  if (filteredProjects.length === 0) {
    container.innerHTML = `<div class="empty-state">No matching inspections found.</div>`;
    return;
  }

  filteredProjects.forEach(project => {

    const syncStatus = getSyncStatus(project);
    const followStatus = getFollowUpStatus(project);
    const projectAddress =
      project.projectAddress ||
      combineStreetAddress(project.streetNumber, project.addressLine);
    const lastSaved = formatProjectDate(project.lastSaved);
    const projectTitle =
      project.projectName ||
      [project.organisationName, project.siteName].filter(Boolean).join(' ') ||
      'Untitled Project';
    const expiryCounts = getProjectExpiryCounts(project);
    const highRiskSummary = getHighRiskSummary(project);
    const inspectionStatus = getProjectInspectionStatus(project);
    const dataQuality = getProjectDataQuality(project);

    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-top">
        <div>
          <h3>${escapeHtml(projectTitle)}</h3>
          <div class="project-number">
            ${escapeHtml(project.inspectionNumber || '-')}
          </div>
        </div>

        <button class="small-btn project-open-btn" onclick="openProject('${project.id}')">Open</button>
      </div>

      <div class="project-badges">
        <span class="project-sync ${syncStatus.class}">
          ${syncStatus.label}
        </span>

        <span class="project-follow ${followStatus.class}">
          ${followStatus.label}
          ${project.followUpDate ? `(${project.followUpDate})` : ''}
        </span>

        <span class="project-inspection-status ${inspectionStatus.class}">
          ${inspectionStatus.label}
          <small>${inspectionStatus.detail}</small>
        </span>
      </div>

      ${project.hasSiteHistory ? `
      <div class="project-history">
        Site history: ${project.previousInspectionCount || 0} previous inspection(s)
      </div>
    ` : ''}

      ${dataQuality.count > 0 ? `
      <div class="project-data-quality">
        Missing project info: ${escapeHtml(dataQuality.missing.slice(0, 4).join(', '))}
        ${dataQuality.count > 4 ? `+ ${dataQuality.count - 4} more` : ''}
      </div>
      ` : ''}

      <div class="project-address">
        ${escapeHtml(projectAddress || 'No address captured')}
      </div>

      ${highRiskSummary.count > 0 ? `
      <div class="project-risk-summary">
        <div class="project-risk-count">
          High Risk: ${highRiskSummary.count} non-compliance item${highRiskSummary.count === 1 ? '' : 's'}
        </div>
        <div class="project-risk-text">
          ${escapeHtml(highRiskSummary.text)}
        </div>
        <button
          type="button"
          class="small-btn project-review-btn"
          onclick="openProject('${project.id}', 'issues')"
        >
          Review Issues
        </button>
      </div>
      ` : ''}

      ${expiryCounts.total > 0 ? `
      <div class="project-expiry-summary">
        <span class="project-expiry-label">Equipment</span>

        <span class="project-expiry-chip expiry-chip-overdue">
          Expired: ${expiryCounts.overdue}
        </span>

        <span class="project-expiry-chip expiry-chip-soon">
          Due soon: ${expiryCounts.soon}
        </span>

        <span class="project-expiry-chip expiry-chip-scheduled">
          Scheduled: ${expiryCounts.scheduled}
        </span>

        <span class="project-expiry-chip expiry-chip-missing">
          Date missing: ${expiryCounts.missing}
        </span>

        ${expiryCounts.overdue > 0 ? `
        <button
          type="button"
          class="small-btn project-expiry-review-btn expiry-review-overdue"
          onclick="openProject('${project.id}', 'expiry-overdue')"
        >
          Review Expired
        </button>
        ` : ''}
        ${expiryCounts.soon > 0 ? `
        <button
          type="button"
          class="small-btn project-expiry-review-btn expiry-review-soon"
          onclick="openProject('${project.id}', 'expiry-soon')"
        >
          Review Due Soon
        </button>
        ` : ''}
        ${expiryCounts.scheduled > 0 ? `
        <button
          type="button"
          class="small-btn project-expiry-review-btn expiry-review-scheduled"
          onclick="openProject('${project.id}', 'expiry-scheduled')"
        >
          Review Scheduled
        </button>
        ` : ''}
        ${expiryCounts.missing > 0 ? `
        <button
          type="button"
          class="small-btn project-expiry-review-btn expiry-review-missing"
          onclick="openProject('${project.id}', 'expiry-missing')"
        >
          Add Missing Dates
        </button>
        ` : ''}
      </div>
      ` : ''}

      <div class="project-meta-grid">
        <div>
          <span>Company</span>
          <strong>${escapeHtml(project.companyName || 'Local / Personal Workspace')}</strong>
        </div>
        <div>
          <span>Inspector</span>
          <strong>${escapeHtml(project.inspectorName || '-')}</strong>
        </div>
        <div>
          <span>Occupancy</span>
          <strong>${escapeHtml(project.occupancy || '-')}</strong>
        </div>
        <div>
          <span>Last saved</span>
          <strong>${escapeHtml(lastSaved)}</strong>
        </div>
        <div>
          <span>Saved by</span>
          <strong>${escapeHtml(project.lastEditedByEmail || project.createdByEmail || '-')}</strong>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}


function openProject(projectId, focusMode) {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  currentProjectId = project.id;
 
  populateProductTypes(project.productType);
  updateInspectionTypeOptions(project.inspectionType);
  getEl('organisationName').value = project.organisationName || '';
  getEl('siteName').value = project.siteName || '';
  const inspectionTypeSelect = getEl('inspectionType');
  if (
    project.inspectionType &&
    Array.from(inspectionTypeSelect.options).some(
      option => option.value === project.inspectionType
    )
  ) {
    inspectionTypeSelect.value = project.inspectionType;
  }
  getEl('inspectorName').value = project.inspectorName || '';
  getEl('occupancySelect').value = project.occupancy || occupancies[0]["Occupancy Code"];
  getEl('saveMessage').textContent = '';
  getEl('streetNumber').value = project.streetNumber || '';
  getEl('projectAddress').value = project.addressLine || project.projectAddress || '';
  getEl('gps').value = project.gps || '';
  getEl('inMall').value = project.inMall || 'No';
  getEl('mallName').value = project.mallName || '';
  getEl('unitNumber').value = project.unitNumber || '';
  getEl('contactPerson').value = project.contactPerson || '';
  getEl('contactTel').value = project.contactTel || '';
  getEl('contactEmail').value = project.contactEmail || '';
  getEl('followUpRequired').value = project.followUpRequired || 'No';
  getEl('followUpDate').value = project.followUpDate || '';
  getEl('followUpNotes').value = project.followUpNotes || '';
  toggleMallFields();

  currentPhotos = project.photos || [];
  renderPhotos();
  updateDisplay();

  if (project.answers) {
   project.answers.forEach(item => {
      const field = document.getElementById(`check_${item.itemIndex}`);
     if (field) {
        field.value = item.answer;
     }

      const noteField = document.getElementById(`note_${item.itemIndex}`);
      if (noteField) {
      noteField.value = item.note || '';
      }

      const expiryField =
        document.querySelector(`.expiry-date[data-index="${item.itemIndex}"]`);
      if (expiryField) {
        expiryField.value = item.expiryDate || '';
      }

      if (field) {
        handleAnswerChange(field, { skipAutoSave: true });
      }
    });
  }
  renderSiteHistory(project);
  showProjectForm();

  if (focusMode === 'issues') {
    setTimeout(() => {
      focusFirstProjectIssue(project);
    }, 80);

    return;
  }

  if (focusMode === 'expiry-overdue') {
    setTimeout(() => {
      focusFirstProjectExpiry(project, 'overdue');
    }, 80);

    return;
  }

  if (focusMode === 'expiry-soon') {
    setTimeout(() => {
      focusFirstProjectExpiry(project, 'soon');
    }, 80);

    return;
  }

  if (focusMode === 'expiry-scheduled') {
    setTimeout(() => {
      focusFirstProjectExpiry(project, 'scheduled');
    }, 80);

    return;
  }

  if (focusMode === 'expiry-missing') {
    setTimeout(() => {
      focusFirstProjectExpiry(project, 'missing');
    }, 80);

    return;
  }

    window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function generateInspectionNumber() {
  const projects = getProjects();

  const year = new Date().getFullYear();

  const numbers = projects
    .map(p => p.inspectionNumber)
    .filter(Boolean)
    .map(num => {
      const parts = num.split('-');
      return parseInt(parts[2], 10);
    })
    .filter(n => !isNaN(n));

  const nextNumber =
    numbers.length > 0
      ? Math.max(...numbers) + 1
      : 1;

  return `FIR-${year}-${String(nextNumber).padStart(4, '0')}`;
}

async function uploadSingleInspection(project) {
  if (!navigator.onLine) return;
  if (typeof supabaseClient === 'undefined') return;
  if (!project || !project.id) return;

  const syncStatus = document.getElementById('syncStatus');

  try {
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError || !userData || !userData.user) {
      if (syncStatus) syncStatus.textContent = 'Saved locally. Cloud not connected.';
      return;
    }

   if (syncStatus) syncStatus.textContent = 'Uploading saved inspection...';

const cloudMetadata =
  getProjectCloudMetadata(project, userData.user.id);

const { error } = await supabaseClient
  .from('inspections')
  .upsert({
    id: project.id,
    user_id: userData.user.id,

    ...cloudMetadata,

    inspection_data: project,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
    if (error) {
      console.error('Single upload failed:', error);
      if (syncStatus) syncStatus.textContent = `Cloud upload failed: ${error.message}`;
      return;
    }

    markInspectionSynced(project.id);

    if (syncStatus) syncStatus.textContent = 'Saved locally and uploaded to cloud.';
  } catch (err) {
    console.error('Single upload failed:', err);
    if (syncStatus) syncStatus.textContent = 'Saved locally. Cloud upload failed.';
  }
}

async function uploadPendingInspections() {

  if (!navigator.onLine) return;

  const projects = getProjects();

  const pendingProjects = projects.filter(
    p => p.syncPending
  );

  for (const project of pendingProjects) {
    await uploadSingleInspection(project);
  }
}

function markInspectionSynced(projectId) {
  const projects = getProjects();

  const index = projects.findIndex(
    p => p.id === projectId
  );

  if (index === -1) return;

  projects[index] = {
    ...projects[index],

    syncPending: false,
    syncError: false,

    syncedAt: new Date().toISOString()
  };

  setProjects(projects);

  renderProjectsList();
}

function saveProject() {
  
  if (!canEditInspection()) {
    alert(
      'Your company access does not allow editing inspections. Please contact your company admin or FireyeSA support.'
    );
    return;
  }

  const organisationName = getEl('organisationName').value.trim();
  const siteName = getEl('siteName').value.trim();
  
  const projectName =
    [organisationName, siteName]
      .filter(Boolean)
      .join(' ');

  const inspectorName = getEl('inspectorName').value.trim();
  const occupancy = getEl('occupancySelect').value;
  
  const streetNumber = getEl('streetNumber').value.trim();
  const addressLine = getEl('projectAddress').value.trim();
  const projectAddress = combineStreetAddress(streetNumber, addressLine);
  const gps = getEl('gps').value.trim();
  
  const inMall = getEl('inMall').value;
  const mallName = getEl('mallName').value.trim();
  const unitNumber = getEl('unitNumber').value.trim();
  
  const contactPerson = getEl('contactPerson').value.trim();
  const contactTel = getEl('contactTel').value.trim();
  const contactEmail = getEl('contactEmail').value.trim();
  
  const productType = normalizeProductType(getEl('productType').value);
  const inspectionType = getEl('inspectionType').value;
  
  const followUpRequired = getEl('followUpRequired').value;
  const followUpDate = getEl('followUpDate').value;
  const followUpNotes = getEl('followUpNotes').value.trim();
  
  const accessMetadata = getAccessMetadata();
  
  const answers = [];

  document.querySelectorAll('.answer-select').forEach((field, index) => {
    const noteField = document.getElementById(`note_${index}`);
    const expiryField =
    document.querySelector(`.expiry-date[data-index="${index}"]`);
    const selectedChecklist = getActiveTemplateChecklist() || [];

    answers.push({
      itemIndex: index,

      itemNumber:
        selectedChecklist[index]?.["Item Number"] ||
        String(index + 1),

      answer: field.value,

      note:
        noteField
          ? noteField.value.trim()
          : '',

      expiryDate: expiryField ? expiryField.value : null
    });
  });

  const projects = getProjects();

  if (currentProjectId) {
  const index = projects.findIndex(p => p.id === currentProjectId);

  if (index !== -1) {
    projects[index] = {
      ...projects[index],

      companyId: accessMetadata.companyId,
      companyName: accessMetadata.companyName,

      createdByUserId:
        projects[index].createdByUserId ||
        accessMetadata.createdByUserId,

      createdByEmail:
        projects[index].createdByEmail ||
        accessMetadata.createdByEmail,

      lastEditedByUserId:
        accessMetadata.createdByUserId,

      lastEditedByEmail:
        accessMetadata.createdByEmail,

      userRoleAtSave:
        accessMetadata.userRole,

      companyAccessStatus:
        accessMetadata.companyAccessStatus,
      siteId:
      [
        projectAddress?.toLowerCase().trim(),
        mallName?.toLowerCase().trim(),
        unitNumber?.toLowerCase().trim()
      ]
      .filter(Boolean)
      .join('|'),
      syncPending: true,
      syncError: false,

      inspectionNumber:
        projects[index].inspectionNumber ||
        generateInspectionNumber(),
      projectName,
      organisationName,
      siteName,
      streetNumber,
      addressLine,
      projectAddress,
      gps,
      inMall,
      mallName,
      unitNumber,
      contactPerson,
      contactTel,
      contactEmail,
      productType,
      inspectionType,
      inspectorName,
      occupancy,
      answers,
      followUpRequired,
      followUpDate,
      followUpNotes,
      photos: currentPhotos,
      lastSaved: new Date().toISOString()
    };
  }
} else {
    const newProject = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      
      companyId: accessMetadata.companyId,
      companyName: accessMetadata.companyName,

      createdByUserId:
        accessMetadata.createdByUserId,

      createdByEmail:
        accessMetadata.createdByEmail,

      lastEditedByUserId:
        accessMetadata.createdByUserId,

      lastEditedByEmail:
        accessMetadata.createdByEmail,

      userRoleAtSave:
        accessMetadata.userRole,

      companyAccessStatus:
        accessMetadata.companyAccessStatus,

      siteId:
        [
          projectAddress?.toLowerCase().trim(),
          mallName?.toLowerCase().trim(),
          unitNumber?.toLowerCase().trim()
        ]
        .filter(Boolean)
        .join('|'),
      
      syncPending: true,
      syncError: false,
      
      inspectionNumber: generateInspectionNumber(),
      projectName,
      organisationName,
      siteName,
      streetNumber,
      addressLine,
      projectAddress,
      gps,
      inMall,
      mallName,
      unitNumber,
      contactPerson,
      contactTel,
      contactEmail,
      productType,
      inspectionType,
      inspectorName,
      occupancy,
      answers,
      photos: currentPhotos,
      followUpRequired: getEl('followUpRequired').value,
      followUpDate: getEl('followUpDate').value,
      followUpNotes: getEl('followUpNotes').value.trim(),
      lastSaved: new Date().toISOString()
    };
      currentProjectId = newProject.id;
      projects.push(newProject);
      const previousSiteInspections = projects.filter(
      p =>
        p.siteId === newProject.siteId &&
        p.id !== newProject.id
    );

        newProject.previousInspectionCount =
          previousSiteInspections.length;

        newProject.hasSiteHistory =
          previousSiteInspections.length > 0;

        const previousNoAnswers =
          previousSiteInspections.flatMap(
            p => (p.answers || [])
              .filter(a => a.answer === 'No')
              .map(a => a.itemNumber)
          );

        newProject.repeatFindings =
          (answers || [])
            .filter(a =>
              a.answer === 'No' &&
              previousNoAnswers.includes(a.itemNumber)
            )
            .map(a => a.itemNumber);
  }
    
    
  setProjects(projects);
  getEl('saveMessage').textContent = `Last saved: ${formatLastSaved()}`;
  renderProjectsList();

  const savedProject = projects.find(p => p.id === currentProjectId);

  if (savedProject) {
    uploadSingleInspection(savedProject)
      .catch(error => {
        console.error('Auto upload after save failed:', error);
      });
  } else {
    console.warn('Auto upload skipped: saved project not found.');
  }



}

function finishInspection() {
  saveProject();
  showProjectList();
}

function createFollowUpInspection() {
  if (!canCreateInspection()) {
    alert(
      'Your company access does not allow creating follow-up inspections. Please contact your company admin or FireyeSA support.'
    );
    return;
  }
  if (!currentProjectId) {
    getEl('saveMessage').textContent = 'Open or save an inspection before creating a follow-up.';
    return;
  }
  
  const projects = getProjects();
  const original = projects.find(p => p.id === currentProjectId);

  if (!original) {
    getEl('saveMessage').textContent = 'Original inspection not found.';
    return;
  }

  const confirmed = confirm(
    'Create a new follow-up inspection from this inspection? The original inspection will remain saved, and a new linked follow-up will be created. Continue?'
  );

  if (!confirmed) return;

  const followUpProject = {
    ...original,

    id: crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()),

    inspectionNumber: generateInspectionNumber(),

    projectName: `${original.projectName || 'Inspection'} - Follow-up`,

    answers: [],
    photos: [],

    followUpRequired: 'No',
    followUpDate: '',
    followUpNotes: '',

    linkedToInspectionId: original.id,
    linkedToInspectionName: original.projectName || '',
    linkedToInspectionNumber: original.inspectionNumber || '',
    linkedToInspectionDate: original.lastSaved || '',

    lastSaved: new Date().toISOString()
  };

  projects.push(followUpProject);
  setProjects(projects);

  currentProjectId = followUpProject.id;
  currentPhotos = [];

  openProject(followUpProject.id);

  getEl('saveMessage').textContent =
    'Follow-up inspection created.';
}

async function deleteProject() {
  if (!canEditInspection()) {
    alert(
      'Your company access does not allow deleting inspections. Please contact your company admin or FireyeSA support.'
    );
    return;
  }
  if (!currentProjectId) {
    getEl('saveMessage').textContent = 'Save the project first before deleting.';
    return;
  }

  const confirmed = confirm(
    'Delete this project permanently from this device? Export a backup first if you are unsure. Continue?'
  );
  if (!confirmed) return;

  const idToDelete = currentProjectId;
  
  let projects = getProjects();
  projects = projects.filter(p => p.id !== currentProjectId);
  
  setProjects(projects);
  
  try {
  console.log('Deleting cloud inspection id:', idToDelete);

  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser();

  if (userError || !userData || !userData.user) {
    alert('Cloud delete skipped: user not logged in.');
    return;
  }

  let deleteQuery = supabaseClient
  .from('inspections')
  .delete()
  .eq('id', idToDelete);

  deleteQuery = applyInspectionDeleteFilter(
    deleteQuery,
    userData.user.id
  );

  const { data, error } = await deleteQuery.select();

  if (error) {
    console.error('Cloud delete failed:', error);
    alert(`Cloud delete failed: ${error.message}`);
    return;
  }

  console.log('Cloud deleted rows:', data);

  

} catch (err) {
  console.error('Cloud delete failed:', err);
  alert('Cloud delete failed. Check console.');
  return;
}

  currentProjectId = null;
  showProjectList();
}

function updateDisplay() {
  const selected = getEl('occupancySelect').value;

  const reqDiv = getEl('requirements');
  const requirementsSection = document.getElementById('requirementsSection');

  reqDiv.innerHTML = "";

  const selectedRequirements = requirements.filter(r => r["Occupancy Code"] === selected);

  if (selectedRequirements.length === 0) {
    reqDiv.innerHTML = '';

    if (requirementsSection) {
      requirementsSection.style.display = 'none';
    }

    renderChecklist(selected);
    return;
  }

  if (requirementsSection) {
    requirementsSection.style.display = 'block';
  }

  selectedRequirements.forEach(r => {
    reqDiv.innerHTML += `
      <div class="requirement-item">
        <div class="requirement-type">${r["Requirement Type"]}</div>
        <div>${r["Requirement"]}</div>
        <div class="note">Source: ${r["Source"]} | Access: ${r["Free or Paid"]}</div>
      </div>
    `;
  });

  renderChecklist(selected);
}

function updateInspectionTypeOptions(preferredInspectionType) {
  const productSelect = getEl('productType');
  const productType = normalizeProductType(productSelect.value);
  const inspectionSelect = getEl('inspectionType');
  const currentInspectionType =
    preferredInspectionType || inspectionSelect.value;

  if (productSelect.value !== productType) {
    productSelect.value = productType;
  }

  inspectionSelect.innerHTML = '';

  const inspectionTypes = inspectionTemplates[productType]
    ? Object.keys(inspectionTemplates[productType])
    : [];

  if (inspectionTypes.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No inspection types available';
    inspectionSelect.appendChild(option);
    return;
  }

  inspectionTypes.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    inspectionSelect.appendChild(option);
  });

  inspectionSelect.value = inspectionTypes.includes(currentInspectionType)
    ? currentInspectionType
    : inspectionTypes[0];
}

function getActiveTemplateChecklist() {
  const productType = normalizeProductType(getEl('productType').value);
  const inspectionType = getEl('inspectionType').value;
  const occupancy = getEl('occupancySelect').value;

  if (
    inspectionTemplates[productType] &&
    inspectionTemplates[productType][inspectionType]
  ) {
    const template = inspectionTemplates[productType][inspectionType];

    return template.flatMap(section =>
      section.items
        .filter(item => {
          const applicableToRaw = item["Applicable To"] || ["All"];
          const applicableTo = Array.isArray(applicableToRaw)
            ? applicableToRaw
            : [applicableToRaw];

          return (
            applicableTo.includes("All") ||
            applicableTo.includes(occupancy)
          );
        })
        .map(item => ({
          ...item,
          Section: section.sectionName
        }))
    );
  }

  return null;
}

function renderChecklist(selected) {
  const chkDiv = getEl('checklist');

  let html = `
    <div class="checklist-toolbar">
      <button type="button" onclick="expandAllSections()">Expand All</button>
      <button type="button" onclick="collapseAllSections()">Collapse All</button>
      <div id="answerSummary" class="answer-summary">Yes: 0 | No: 0 | N/A: 0</div>
    </div>
  `;

  const templateChecklist = getActiveTemplateChecklist();

  const selectedChecklist = templateChecklist || checklists.filter(c =>
    c["Applicable To"] === "All occupancies" || c["Applicable To"] === selected
  );

  if (selectedChecklist.length === 0) {
    chkDiv.innerHTML = `<div class="note">No checklist items found for this occupancy yet.</div>`;
    return;
  }

  let currentSection = null;
  let sectionIndex = -1;

  selectedChecklist.forEach((c, index) => {
    const sectionName = c.Section || "GENERAL";

    if (sectionName !== currentSection) {
      if (currentSection !== null) {
        html += `</div>`;
      }

      sectionIndex++;

      html += `
        <div class="section-header" onclick="toggleSection(${sectionIndex})">
          <span id="arrow_${sectionIndex}">&gt;</span>
          ${sectionName.toUpperCase()}
        </div>

        <div class="section-group hidden" id="section_${sectionIndex}">
      `;

      currentSection = sectionName;
    }

    const itemId = `check_${index}`;
    const trackExpiry = isExpiryTrackedChecklistItem(c);

    html += `
  <div class="checklist-row" data-index="${index}">
    <div>
      <strong>${c["Item Number"]}.</strong>
      ${c["Checklist Item"]}
    </div>

    <div class="note">
      Answer type: ${c["Answer Type"]}
    </div>

    <select
      class="answer-select"
      id="${itemId}"
      onchange="handleAnswerChange(this)"
    >
      <option value="">Select answer</option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
      <option value="N/A">N/A</option>
    </select>

    <textarea
      class="note-input"
      id="note_${index}"
      placeholder="Add note for this item..."
      oninput="scheduleAutoSave()"
    ></textarea>

    ${trackExpiry ? `
      <div class="expiry-wrapper">
        <label>Expiry Date</label>

        <input
          type="date"
          class="expiry-date"
          data-index="${index}"
          onchange="scheduleAutoSave()"
        >
      </div>
    ` : ''}

  </div>
`;
  });

  html += `</div>`;

  chkDiv.innerHTML = html;
  updateAnswerSummary();
  updateProjectReadinessPanel();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


function generateReport() {

  if (!canViewReports()) {
    alert(
      'Your company access does not allow viewing reports. Please contact your company admin or FireyeSA support.'
    );
    return;
  }

 const currentProject = getProjects().find(
    p => p.id === currentProjectId
  );

  const repeatFindings =
    currentProject?.repeatFindings || [];
  const projectName =
    currentProject?.projectName || 'Untitled Project';
  const inspectorName = getEl('inspectorName').value.trim() || '-';
  const finalComments = getEl('finalComments').value.trim();
  const occupancy = getEl('occupancySelect').value || '-';

  const streetNumber = getEl('streetNumber').value.trim();
  const addressLine = getEl('projectAddress').value.trim();
  const projectAddress = combineStreetAddress(streetNumber, addressLine);
  const gps = getEl('gps').value.trim();

  const inMall = getEl('inMall').value || 'No';
  const mallName = getEl('mallName').value.trim();
  const unitNumber = getEl('unitNumber').value.trim();
  const contactPerson = getEl('contactPerson').value.trim();
  const contactTel = getEl('contactTel').value.trim();
  const contactEmail = getEl('contactEmail').value.trim();
  const productType = normalizeProductType(getEl('productType').value);
  const inspectionType = getEl('inspectionType').value;

  const selectedChecklist = getActiveTemplateChecklist() || [];
  
  const inspectionNumber =
  currentProject?.inspectionNumber || '-';
  const reportContent = getEl('reportContent');

  const followUpRequired = getEl('followUpRequired').value;
  const followUpDate = getEl('followUpDate').value;
  const followUpNotes = getEl('followUpNotes').value.trim();

  let answersHtml = '';
  let actionSections = {};
  let nonCompliance = {};
  let expiryDetails = [];
  let missingExpiryDetails = [];
  let reportAnswers = [];
  let photosHtml = '';

  if (currentPhotos.length > 0) {

    photosHtml += `
      <div class="report-page-break"></div>

      <div class="report-block">
        <h2 class="appendix-title">
          APPENDIX A - PHOTO EVIDENCE
        </h2>
      </div>

      <div class="report-photos">
    `;
  }

  let yesCount = 0;
  let noCount = 0;
  let naCount = 0;

  let currentReportSection = '';
  let sectionYes = 0;
  let sectionNo = 0;
  let sectionHasItems = false;

  function closeReportSection() {
    if (!currentReportSection || !sectionHasItems) return;

    const sectionStatus =
      sectionNo > 0
        ? `Attention Required (${sectionNo} No / ${sectionYes} Yes)`
        : `Compliant (${sectionYes} Yes)`;

    answersHtml += `
      <div class="report-section-status">${sectionStatus}</div>
    `;
  }

  selectedChecklist.forEach((item, index) => {
    const field = document.getElementById(`check_${index}`);
    const rawAnswer = field ? (field.value || 'Not answered') : 'Not answered';
    const answer = rawAnswer.trim();

    const noteField = document.getElementById(`note_${index}`);
    const itemNote = noteField ? noteField.value.trim() : '';
    const expiryField =
      document.querySelector(`.expiry-date[data-index="${index}"]`);
    const expiryDate = expiryField ? expiryField.value : '';

    const trackExpiry = isExpiryTrackedChecklistItem(item);
    const expiryApplies = isExpiryApplicableAnswer(answer);

    reportAnswers.push({
      itemIndex: index,
      itemNumber: item["Item Number"] || String(index + 1),
      answer,
      note: itemNote,
      expiryDate: expiryField ? expiryField.value : null
    });

    if (trackExpiry && expiryApplies && expiryDate) {
      const expiryStatus = getExpiryStatus(expiryDate);
      const expiryLabel =
        expiryStatus === 'overdue'
          ? 'Expired'
          : expiryStatus === 'soon'
          ? 'Due Soon'
          : 'Scheduled';

      expiryDetails.push({
        itemNumber: item["Item Number"] || '',
        checklistItem: item["Checklist Item"] || '',
        expiryDate,
        status: expiryStatus,
        label: expiryLabel
      });
    }

    if (trackExpiry && expiryApplies && !expiryDate) {
      missingExpiryDetails.push({
        itemNumber: item["Item Number"] || '',
        checklistItem: item["Checklist Item"] || '',
        answer: answer || 'Not answered',
        note: itemNote
      });
    }

    if (rawAnswer === 'Not answered' && !itemNote) {
      return;
    }

    const sectionName = item.Section || 'General';

    if (sectionName !== currentReportSection) {
      closeReportSection();

      currentReportSection = sectionName;
      sectionYes = 0;
      sectionNo = 0;
      sectionHasItems = false;

      const reportSectionId = `report-section-${sectionName
        .toLowerCase()
        .replaceAll(' ', '-')
        .replaceAll('/', '-')
        .replaceAll('&', 'and')}`;

      answersHtml += `
        <div id="${reportSectionId}" class="report-section-heading">${escapeHtml(sectionName)}</div>
      `;
    }

    if (answer.toLowerCase() === 'yes') {
      yesCount++;
      sectionYes++;
    } else if (answer.toLowerCase() === 'no') {
      noCount++;
      sectionNo++;

      if (!actionSections[sectionName]) {
        actionSections[sectionName] = 0;
      }
      actionSections[sectionName]++;

      if (!nonCompliance[sectionName]) {
        nonCompliance[sectionName] = [];
      }

      nonCompliance[sectionName].push({
        itemNumber: item["Item Number"] || '',
        checklistItem: item["Checklist Item"] || '',
        text: item["Non Compliance Text"] || item["Checklist Item"],
        note: itemNote,
        reference: item["Reference"] || '',
        correctiveAction: item["Corrective Action"] || '',
        severity: item["Severity"] || 'Medium'
      });
    } else if (answer.toUpperCase() === 'N/A') {
      naCount++;
    }

    sectionHasItems = true;

    let answerClass = '';

    if (answer.toLowerCase() === 'no') {
      answerClass = 'answer-no';
    } else if (answer.toLowerCase() === 'yes') {
      answerClass = 'answer-yes';
    } else if (answer.toUpperCase() === 'N/A') {
      answerClass = 'answer-na';
    }

    answersHtml += `
    <div class="report-answer ${answerClass}">
      <strong>${item["Item Number"]}. ${item["Checklist Item"]}</strong><br>

      <strong>Answer:</strong> ${escapeHtml(rawAnswer)}

      ${itemNote ? `<br><strong>Note:</strong> ${escapeHtml(itemNote)}` : ''}

      ${
        trackExpiry && expiryApplies && expiryDate
          ? `<br><strong>Expiry Date:</strong> ${escapeHtml(expiryDate)}`
          : ''
      }

      ${
        trackExpiry && !expiryApplies
          ? `<br><strong>Expiry:</strong> Not applicable`
          : ''
      }
    </div>
  `;
  });

  closeReportSection();

  const totalItems = selectedChecklist.length;
  const answeredCount = yesCount + noCount + naCount;
  const notAnsweredCount = totalItems - answeredCount;

  let overallStatus = 'Compliant / Acceptable';

  if (noCount > 0) {
    overallStatus = 'Attention Required';
  } else if (notAnsweredCount > 0) {
    overallStatus = 'Incomplete Inspection';
  }

  let riskRating = 'LOW RISK';
  let riskComment = 'No significant fire safety risks identified.';

  if (noCount >= 5) {
    riskRating = 'HIGH RISK';
    riskComment = 'Immediate attention required. Multiple fire safety non-compliances identified.';
  } else if (noCount >= 1) {
    riskRating = 'MEDIUM RISK';
    riskComment = 'Fire safety deficiencies identified. Corrective action required.';
  }

  if (notAnsweredCount > 0 && noCount === 0) {
    riskRating = 'INCOMPLETE';
    riskComment = 'Inspection incomplete. Some items were not assessed.';
  }

  const highRiskCount = Object.values(nonCompliance)
    .flat()
    .filter(item => String(item.severity).toLowerCase() === 'high')
    .length;
  const reportProjectSnapshot = {
    ...(currentProject || {}),
    projectName,
    contactPerson,
    contactTel,
    contactEmail,
    streetNumber,
    addressLine,
    projectAddress,
    gps,
    inMall,
    mallName,
    unitNumber,
    inspectorName,
    productType,
    inspectionType,
    occupancy,
    answers: reportAnswers
  };
  const expiryCounts = getProjectExpiryCounts(reportProjectSnapshot);
  const reportInspectionStatus = getProjectInspectionStatus(reportProjectSnapshot);
  const reportDataQuality = getProjectDataQuality(reportProjectSnapshot);
  const repeatCount = repeatFindings.length;
  const summaryCardsHtml = `
    <div class="report-summary-grid">
      <div class="report-summary-card summary-risk">
        <span>High Risk</span>
        <strong>${highRiskCount}</strong>
      </div>
      <div class="report-summary-card summary-repeat">
        <span>Repeat Findings</span>
        <strong>${repeatCount}</strong>
      </div>
      <div class="report-summary-card summary-expired">
        <span>Expired Equipment</span>
        <strong>${expiryCounts.overdue}</strong>
      </div>
      <div class="report-summary-card summary-soon">
        <span>Due Soon</span>
        <strong>${expiryCounts.soon}</strong>
      </div>
      <div class="report-summary-card summary-missing">
        <span>Missing Expiry</span>
        <strong>${expiryCounts.missing}</strong>
      </div>
    </div>
  `;

  let actionHtml = '';
  let dataQualityHtml = '';

  const sections = Object.keys(actionSections)
    .sort((a, b) => actionSections[b] - actionSections[a]);

  if (sections.length > 0) {
    sections.forEach(section => {
      const count = actionSections[section];
      const label = count === 1 ? 'item' : 'items';

      const actionSectionId = `report-section-${section
        .toLowerCase()
        .replaceAll(' ', '-')
        .replaceAll('/', '-')
        .replaceAll('&', 'and')}`;

      actionHtml += `
        <a class="action-item action-link" href="#${actionSectionId}">
          - ${escapeHtml(section.toUpperCase())} - ${count} No ${label}
        </a>
      `;
    });
  } else {
    actionHtml = `<div class="note">No action required.</div>`;
  }

  if (missingExpiryDetails.length > 0) {
    actionHtml += `
      <div class="action-item action-missing-expiry">
        - EQUIPMENT EXPIRY - ${missingExpiryDetails.length} missing expiry date${missingExpiryDetails.length === 1 ? '' : 's'}
      </div>
    `;
  }

  if (reportDataQuality.count > 0) {
    actionHtml += `
      <div class="action-item action-missing-data">
        - PROJECT INFORMATION - ${reportDataQuality.count} missing field${reportDataQuality.count === 1 ? '' : 's'}
      </div>
    `;

    dataQualityHtml = `
      <div class="report-data-quality">
        <strong>Missing project information:</strong>
        ${escapeHtml(reportDataQuality.missing.join(', '))}
      </div>
    `;
  }

  let nonComplianceHtml = '';
  let actionPlanHtml = '';

  const ncSections = Object.keys(nonCompliance);

  if (ncSections.length > 0) {
    ncSections.forEach(section => {
      nonComplianceHtml += `
        <div class="nc-section">
          <div class="nc-heading">${escapeHtml(section.toUpperCase())}</div>
      `;

      nonCompliance[section].forEach(item => {
      nonComplianceHtml += `
        
      <div class="nc-item nc-${escapeHtml(item.severity.toLowerCase())}">

      <div><strong>Severity:</strong> 
        ${escapeHtml(item.severity)}
      </div>
        ${repeatFindings.map(String).includes(String(item.itemNumber)) ? `
      <div style="
        color:#b71c1c;
        font-weight:700;
        margin-bottom:6px;
      ">
        Repeat Non-Compliance Identified
      </div>
      ` : ''}

      <div>
        <strong>Finding:</strong>
        ${escapeHtml(item.text)}
      </div>

      ${item.note ? `
        <div>
          <strong>Inspector Note:</strong>
          ${escapeHtml(item.note)}
        </div>
      ` : ''}

      ${item.reference ? `
        <div class="note">
          <strong>Reference:</strong>
          ${escapeHtml(item.reference)}
        </div>
      ` : ''}

      ${item.correctiveAction ? `
        <div>
          <strong>Corrective Action:</strong>
          ${escapeHtml(item.correctiveAction)}
        </div>
      ` : ''}

    </div>
      `;
      actionPlanHtml += `
  <div class="nc-item nc-${escapeHtml(item.severity.toLowerCase())}">

    <div>
      <strong>Severity:</strong>
      ${escapeHtml(item.severity)}
    </div>

    <div>
      <strong>Required Action:</strong>
      ${escapeHtml(item.correctiveAction)}
    </div>

    ${item.reference ? `
      <div class="note">
        <strong>Reference:</strong>
        ${escapeHtml(item.reference)}
      </div>
    ` : ''}

  </div>
      `;
});

      nonComplianceHtml += `</div>`;
    });
  } else {
    nonComplianceHtml = `<div class="note">No non-compliances recorded.</div>`;
    actionPlanHtml = `<div class="note">No corrective action required.</div>`;
  }

  let expiryDetailsHtml = '';
  let missingExpiryHtml = '';

  if (expiryDetails.length > 0) {
    expiryDetails
      .sort((a, b) =>
        new Date(a.expiryDate).getTime() -
        new Date(b.expiryDate).getTime()
      )
      .forEach(item => {
        expiryDetailsHtml += `
          <div class="report-expiry-item report-expiry-${escapeHtml(item.status)}">
            <div>
              <strong>
                ${escapeHtml(item.itemNumber)}.
                ${escapeHtml(item.checklistItem)}
              </strong>
            </div>

            <div>
              <strong>Expiry Date:</strong>
              ${escapeHtml(item.expiryDate)}
            </div>

            <div>
              <strong>Status:</strong>
              <span>${escapeHtml(item.label)}</span>
            </div>
          </div>
        `;
      });
  } else {
    expiryDetailsHtml = `<div class="note">No equipment expiry dates captured.</div>`;
  }

  if (missingExpiryDetails.length > 0) {
    missingExpiryHtml = `
      <div class="report-expiry-subtitle">
        Missing Expiry Dates
      </div>
    `;

    missingExpiryDetails.forEach(item => {
      missingExpiryHtml += `
        <div class="report-expiry-item report-expiry-missing">
          <div>
            <strong>
              ${escapeHtml(item.itemNumber)}.
              ${escapeHtml(item.checklistItem)}
            </strong>
          </div>

          <div>
            <strong>Answer:</strong>
            ${escapeHtml(item.answer)}
          </div>

          ${item.note ? `
            <div>
              <strong>Note:</strong>
              ${escapeHtml(item.note)}
            </div>
          ` : ''}

          <div>
            <strong>Required:</strong>
            Capture the equipment expiry/service date or mark the item N/A if not applicable.
          </div>
        </div>
      `;
    });
  }

  if (currentPhotos.length > 0) {
    currentPhotos.forEach((photo, index) => {
      photosHtml += `
  <div class="report-photo-card">

    <div class="report-photo-header">
      Photo ${index + 1}
    </div>

    <div class="report-photo-time">
      Captured:
      ${photo.timestamp
        ? new Date(photo.timestamp).toLocaleString()
        : 'Not recorded'}
    </div>

    <img
      src="${photo.src}"
      class="report-photo-img"
      alt="Inspection photo ${index + 1}"
    >

    <div class="report-photo-note">
      <strong>Photo Note:</strong>
      ${escapeHtml(photo.note || 'No note added.')}
    </div>

  </div>
  `; 

  }); 
    photosHtml += `</div>`;
  } else {
    photosHtml = `<div class="note">No photo evidence added.</div>`;
  }

 reportContent.innerHTML = `
  <div class="report-header">

    <div class="report-brand">
      <div class="report-brand-row">
        <img
          class="report-logo"
          src="icon-192.png"
          alt="FireyeSA logo"
        >

        <h1>FIREYESA</h1>
      </div>

      <div class="report-subtitle">
        Fire Safety Inspection Report
      </div>
    </div>

    <div class="report-meta-card">
      <div>
        <strong>Inspection No:</strong>
        ${escapeHtml(inspectionNumber)}
      </div>

      <div>
        <strong>Date:</strong>
        ${new Date().toLocaleDateString()}
      </div>

      <div>
        <strong>Inspector:</strong>
        ${escapeHtml(inspectorName || '-')}
      </div>

      <div>
        <strong>App Version:</strong>
        ${escapeHtml(APP_VERSION)}
      </div>
    </div>

  </div>

    <div class="report-block">
      <h3>Premises Information</h3>
      <div class="report-line"><strong>Premises / Site:</strong> ${escapeHtml(projectName)}</div>
      <div class="report-line">
        <strong>Inspection Number:</strong>
        ${escapeHtml(inspectionNumber)}
      </div>
      <div class="report-line"><strong>Contact Person:</strong> ${escapeHtml(contactPerson || '-')}</div>
      <div class="report-line"><strong>Telephone:</strong> ${escapeHtml(contactTel || '-')}</div>
      <div class="report-line"><strong>Email:</strong> ${escapeHtml(contactEmail || '-')}</div>
      <div class="report-line"><strong>Compliance Area:</strong> ${escapeHtml(productType)}</div>
      <div class="report-line"><strong>Inspection Type:</strong> ${escapeHtml(inspectionType)}</div>
      ${currentProject && currentProject.linkedToInspectionId ? `
      <div class="report-line">
        <strong>Follow-up To:</strong>
        ${escapeHtml(currentProject.linkedToInspectionNumber || '-')}
        (${escapeHtml(currentProject.linkedToInspectionName || '-')})
      </div>

      <div class="report-line">
        <strong>Previous Inspection Date:</strong>
        ${
          currentProject.linkedToInspectionDate
            ? escapeHtml(
                new Date(
                  currentProject.linkedToInspectionDate
                ).toLocaleDateString()
              )
            : '-'
        }
      </div>
      ` : ''}
      <div class="report-line"><strong>Address:</strong> ${escapeHtml(projectAddress)}</div>
      <div class="report-line"><strong>GPS:</strong> ${escapeHtml(gps)}</div>
      <div class="report-line"><strong>Located in Mall/Centre:</strong> ${escapeHtml(inMall)}</div>
      ${inMall === 'Yes' ? `<div class="report-line"><strong>Mall/Centre Name:</strong> ${escapeHtml(mallName)}</div>` : ''}
      ${inMall === 'Yes' ? `<div class="report-line"><strong>Unit / Shop Number:</strong> ${escapeHtml(unitNumber)}</div>` : ''}
      <div class="report-line"><strong>Inspector Name:</strong> ${escapeHtml(inspectorName)}</div>
      <div class="report-line"><strong>Occupancy Classification:</strong> ${escapeHtml(occupancy)}</div>
      <div class="report-line"><strong>Inspection Date:</strong> ${new Date().toLocaleDateString()}</div>
      ${dataQualityHtml}
    </div>

    <div class="report-block">
      <h3>Executive Inspection Summary</h3>
      <div class="report-line">
        <strong>Inspection Status:</strong>
        <span class="report-status-pill ${escapeHtml(reportInspectionStatus.class)}">
          ${escapeHtml(reportInspectionStatus.label)}
          <small>${escapeHtml(reportInspectionStatus.detail)}</small>
        </span>
      </div>

      <div class="report-line"><strong>Overall Status:</strong> <span class="${
        overallStatus === 'Compliant / Acceptable'
          ? 'status-good'
          : overallStatus === 'Attention Required'
          ? 'status-warning'
          : 'status-incomplete'
      }">${overallStatus}</span></div>

      <div class="report-line">
        <strong>Risk Rating:</strong> 
        <span class="${
          riskRating === 'HIGH RISK'
            ? 'risk-high'
            : riskRating === 'MEDIUM RISK'
            ? 'risk-medium'
            : riskRating === 'INCOMPLETE'
            ? 'risk-incomplete'
            : 'risk-low'
        }">${riskRating}</span>
      </div>

      <div class="report-line note">${riskComment}</div>
      ${summaryCardsHtml}
    </div>

    <div class="report-block">
      <h3>Priority Actions Required</h3>
      ${actionHtml}
    </div>

    <div class="report-block">
      <h3>Non-Compliance Details</h3>
      ${nonComplianceHtml}
    </div>

    <div class="report-block">
      <h3>Recommended Corrective Action Plan</h3>
      ${actionPlanHtml}
    </div>

    <div class="report-block">
      <h3>Equipment Expiry Details</h3>
      ${expiryDetailsHtml}
      ${missingExpiryHtml}
    </div>
    
    <div class="report-block">
  <h3>Inspector Comments and Conclusion</h3>
  <div>${escapeHtml(finalComments || 'No comments provided.')}</div>
</div>

<div class="report-block">
  <h3>Follow-up / Re-inspection</h3>

  <div class="report-line">
    <strong>Follow-up Required:</strong> ${escapeHtml(followUpRequired)}
  </div>

  ${followUpRequired === 'Yes' ? `
    <div class="report-line">
      <strong>Follow-up Date:</strong> ${escapeHtml(followUpDate || 'Not specified')}
    </div>

    <div class="report-line">
      <strong>Reason:</strong> ${escapeHtml(followUpNotes || 'No reason provided')}
    </div>
  ` : ''}
</div>

<div class="report-signoff">
  <div>
    <strong>Inspector:</strong>
    ${escapeHtml(inspectorName || '-')}
  </div>

  <div>
    <strong>Report Date:</strong>
    ${new Date().toLocaleDateString()}
  </div>

  <div class="signature-line">
    Inspector Signature
  </div>

  <div class="report-disclaimer">
    This report records observations made at the time of inspection. It should be read together with applicable fire safety legislation, standards, municipal by-laws, and competent professional judgement where required.
  </div>

  <div class="report-generated">
    Generated by FireyeSA Fire Safety App | Version ${APP_VERSION}
  </div>
</div>

    ${photosHtml}
  `;

  getEl('reportSection').style.display = 'block';
}


function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const saveMessage = document.getElementById('saveMessage');
  if (saveMessage) {
    saveMessage.textContent = 'Preparing photo...';
  }

  const reader = new FileReader();

  reader.onload = function(e) {
    const img = new Image();

    img.onload = function() {
      const maxWidth = 1200;
      const maxHeight = 1200;

      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

      currentPhotos.push({
      src: compressedDataUrl,
      timestamp: new Date().toISOString(),
      note: ''
      });

      renderPhotos();
      scheduleAutoSave();

      if (saveMessage) {
        saveMessage.textContent = 'Photo added.';
      }
    };

    img.src = e.target.result;
  };

  reader.readAsDataURL(file);
  event.target.value = '';
}

function renderPhotos() {
  const container = getEl('photoPreview');
  container.innerHTML = '';

  if (currentPhotos.length === 0) {
    container.innerHTML = `<div class="note">No photo evidence added yet.</div>`;
    return;
  }

  currentPhotos.forEach((photo, index) => {
    const div = document.createElement('div');
    div.className = 'photo-item';

    const photoSrc = photo.src;
    const photoTime = new Date(photo.timestamp).toLocaleString();

    div.innerHTML = `
      <img src="${photoSrc}">
      <small class="photo-timestamp">Captured: ${photoTime}</small>

      <textarea
        class="photo-note"
        placeholder="Photo note..."
        oninput="updatePhotoNote(${index}, this.value)"
      >${escapeHtml(photo.note || '')}</textarea>

      <button class="photo-delete" type="button" onclick="deletePhoto(${index})">Delete</button>
    `;

    container.appendChild(div);
  });
}

function deletePhoto(index) {
  const confirmed = confirm(
    'Delete this photo from this inspection? This cannot be undone unless you restore a backup. Continue?'
  );
  if (!confirmed) return;

  currentPhotos.splice(index, 1);
  renderPhotos();
  scheduleAutoSave();
}

function updatePhotoNote(index, value) {
  if (!currentPhotos[index]) return;

  currentPhotos[index].note = value;
  scheduleAutoSave();
}

async function shareReport() {

  if (!canViewReports()) {
    alert(
      'Your company access does not allow sharing reports. Please contact your company admin or FireyeSA support.'
    );
    return;
  }

  const currentProject = getProjects().find(
    p => p.id === currentProjectId
  );

  const projectName =
    currentProject?.projectName || 'Untitled Project';
  const inspectorName = getEl('inspectorName').value.trim() || '-';
  const occupancy = getEl('occupancySelect').value || '-';

  const projectAddress = getEl('projectAddress').value.trim() || '-';
  const gps = getEl('gps').value.trim() || '-';

  const contactPerson = getEl('contactPerson').value.trim() || '-';
  const contactTel = getEl('contactTel').value.trim() || '-';
  const contactEmail = getEl('contactEmail').value.trim() || '-';

  const inMall = getEl('inMall').value || 'No';
  const mallName = getEl('mallName').value.trim() || '-';
  const unitNumber = getEl('unitNumber').value.trim() || '-';

  const productType = normalizeProductType(getEl('productType').value) || '-';
  const inspectionType = getEl('inspectionType').value || '-';

  const selectedChecklist = getActiveTemplateChecklist() || [];

  let yesCount = 0;
  let noCount = 0;
  let naCount = 0;

  let actionSections = {};
  let checklistText = '';
  let currentSection = '';

  selectedChecklist.forEach((item, index) => {
    const field = document.getElementById(`check_${index}`);
    const rawAnswer = field ? (field.value || 'Not answered') : 'Not answered';
    const answer = rawAnswer.trim();

    const noteField = document.getElementById(`note_${index}`);
    const itemNote = noteField ? noteField.value.trim() : '';

    const expiryField =
      document.querySelector(`.expiry-date[data-index="${index}"]`);

    const expiryDate =
      expiryField ? expiryField.value : '';

    const trackExpiry =
      isExpiryTrackedChecklistItem(item);

    const expiryApplies =
      isExpiryApplicableAnswer(answer);
      
    if (rawAnswer === 'Not answered' && !itemNote) {
      return;
    }

    const sectionName = item.Section || 'General';

    if (sectionName !== currentSection) {
      currentSection = sectionName;
      checklistText += `\n${sectionName.toUpperCase()}\n`;
    }

    if (answer.toLowerCase() === 'yes') {
      yesCount++;
    } else if (answer.toLowerCase() === 'no') {
      noCount++;

      if (!actionSections[sectionName]) {
        actionSections[sectionName] = 0;
      }

      actionSections[sectionName]++;
    } else if (answer.toUpperCase() === 'N/A') {
      naCount++;
    }

    checklistText += `${item["Item Number"]}. ${item["Checklist Item"]}\n`;
    checklistText += `Answer: ${rawAnswer}\n`;

    if (itemNote) {
      checklistText += `Note: ${itemNote}\n`;
    }

    if (trackExpiry && expiryApplies && expiryDate) {
      checklistText += `Expiry Date: ${expiryDate}\n`;
    }

    if (trackExpiry && !expiryApplies) {
      checklistText += `Expiry: Not applicable\n`;
    }

    if (trackExpiry && expiryApplies && !expiryDate) {
      checklistText += `Expiry Date: Missing\n`;
    }

    checklistText += `\n`;
  });

  const totalItems = selectedChecklist.length;
  const answeredCount = yesCount + noCount + naCount;
  const notAnsweredCount = totalItems - answeredCount;

  let overallStatus = 'Compliant / Acceptable';

  if (noCount > 0) {
    overallStatus = 'Attention Required';
  } else if (notAnsweredCount > 0) {
    overallStatus = 'Incomplete Inspection';
  }

  let riskRating = 'LOW RISK';
  let riskComment = 'No significant fire safety risks identified.';

  if (noCount >= 5) {
    riskRating = 'HIGH RISK';
    riskComment = 'Immediate attention required. Multiple fire safety non-compliances identified.';
  } else if (noCount >= 1) {
    riskRating = 'MEDIUM RISK';
    riskComment = 'Fire safety deficiencies identified. Corrective action required.';
  }

  if (notAnsweredCount > 0 && noCount === 0) {
    riskRating = 'INCOMPLETE';
    riskComment = 'Inspection incomplete. Some items were not assessed.';
  }

  let actionText = '';

  const sections = Object.keys(actionSections)
    .sort((a, b) => actionSections[b] - actionSections[a]);

  if (sections.length > 0) {
    sections.forEach(section => {
      const count = actionSections[section];
      const label = count === 1 ? 'item' : 'items';
      actionText += `- ${section.toUpperCase()} - ${count} No ${label}\n`;
    });
  } else {
    actionText = 'No action required.\n';
  }

  const shareText =
`FireyeSA Fire Safety Report

INSPECTION DETAILS
Place Name: ${projectName}
Contact Person: ${contactPerson}
Telephone: ${contactTel}
Email: ${contactEmail}
Compliance Area: ${productType}
Inspection Type: ${inspectionType}
Address: ${projectAddress}
GPS: ${gps}
In Mall/Centre: ${inMall}
${inMall === 'Yes' ? `Mall/Centre Name: ${mallName}
Unit / Shop Number: ${unitNumber}
` : ''}Inspector Name: ${inspectorName}
Occupancy: ${occupancy}
Inspection Date: ${new Date().toLocaleDateString()}

INSPECTION SUMMARY
Total Items: ${totalItems}
Answered: ${answeredCount}
Yes: ${yesCount}
No: ${noCount}
N/A: ${naCount}
Not Answered: ${notAnsweredCount}
Overall Status: ${overallStatus}
Risk Rating: ${riskRating}
${riskComment}

ACTION REQUIRED
${actionText}

CHECKLIST RESULTS
${checklistText || 'No checklist answers or notes captured.'}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `FireyeSA Report - ${projectName}`,
        text: shareText
      });

      getEl('saveMessage').textContent = 'Report shared.';
    } catch (error) {
      getEl('saveMessage').textContent = 'Share cancelled or failed.';
      console.error('Share error:', error);
    }
  } else {
    try {
      await navigator.clipboard.writeText(shareText);
      getEl('saveMessage').textContent = 'Share not supported. Report copied to clipboard.';
    } catch (error) {
      getEl('saveMessage').textContent = 'Share not supported on this device.';
      console.error('Clipboard error:', error);
    }
  }
}

function toggleSection(index) {
  const section = document.getElementById(`section_${index}`);
  const arrow = document.getElementById(`arrow_${index}`);

  if (!section) return;

  section.classList.toggle('hidden');

  if (arrow) {
    arrow.textContent = section.classList.contains('hidden') ? '>' : 'v';
  }
}

function expandAllSections() {
  document.querySelectorAll(".section-group").forEach(section => {
    section.classList.remove("hidden");
  });

  document.querySelectorAll("[id^='arrow_']").forEach(arrow => {
    arrow.textContent = "v";
  });
}

function collapseAllSections() {
  document.querySelectorAll(".section-group").forEach(section => {
    section.classList.add("hidden");
  });

  document.querySelectorAll("[id^='arrow_']").forEach(arrow => {
    arrow.textContent = ">";
  });
}

function handleAnswerChange(selectEl, options = {}) {
  const row = selectEl.closest(".checklist-row");

  if (row) {
    row.classList.remove("has-yes", "has-no", "has-na");

    if (selectEl.value === "Yes") row.classList.add("has-yes");
    if (selectEl.value === "No") row.classList.add("has-no");
    if (selectEl.value === "N/A") row.classList.add("has-na");
  }

  updateExpiryInputState(selectEl);
  updateAnswerSummary();

  if (!options.skipAutoSave) {
    scheduleAutoSave();
  }
}

function updateAnswerSummary() {
  const answers = document.querySelectorAll(".answer-select");

  let yes = 0;
  let no = 0;
  let na = 0;

  answers.forEach(a => {
    if (a.value === "Yes") yes++;
    if (a.value === "No") no++;
    if (a.value === "N/A") na++;
  });

  const summary = document.getElementById("answerSummary");
  if (summary) {
    summary.textContent = `Yes: ${yes} | No: ${no} | N/A: ${na}`;
  }

  updateProjectReadinessPanel();
}
function renderSiteHistory(project) {

  const existing =
    document.getElementById('siteHistoryPanel');

  if (existing) {
    existing.remove();
  }

  if (!project.siteId) return;

  const projects = getProjects();

  const related = projects.filter(
    p =>
      p.siteId === project.siteId &&
      p.id !== project.id
  );
    related.sort((a, b) =>
    new Date(b.lastSaved) -
    new Date(a.lastSaved)
  );
  if (related.length === 0) return;

  const panel = document.createElement('div');

  panel.id = 'siteHistoryPanel';

  panel.className = 'site-history-panel';

  const historyHtml = related
  .slice(0, 3)
  .map(p => {

    const risk =
      p.answers?.some(
        a => a.answer === 'No'
      )
        ? 'Attention Required'
        : 'Compliant';

    const riskClass =
      risk === 'Attention Required'
        ? '#ffe5e5'
        : '#e8f5e9';

    return `
      <div style="
        margin-top:8px;
        padding:8px;
        background:${riskClass};
        border-radius:6px;
      ">
        <strong>
          ${
            p.lastSaved
              ? new Date(
                  p.lastSaved
                ).toLocaleDateString()
              : '-'
          }
        </strong>

        - ${risk}
      </div>
    `;
  })
  .join('');

  const recurringIssues = {};

  related.forEach(p => {
    (p.answers || []).forEach(a => {

      if (a.answer === 'No') {

        recurringIssues[a.itemNumber] =
          (recurringIssues[a.itemNumber] || 0) + 1;
      }
    });
  });

  const recurringCount =
    Object.values(recurringIssues)
      .filter(count => count >= 2)
      .length;

  const recurringList =
    Object.entries(recurringIssues)
      .filter(([_, count]) => count >= 2)
      .map(([item]) => item);

  panel.innerHTML = `
    <h3>Site History</h3>

    <div>
      Previous inspections:
      <strong>${related.length}</strong>
    </div>

    <div style="margin-top:8px;">
      Recurring issues detected:
      <strong>${recurringCount}</strong>
    </div>

    ${
      recurringList.length > 0
        ? `
          <div style="margin-top:6px;">
            ${recurringList
              .map(item => {

              const match = related.find(p =>
                (p.answers || []).some(
                  a =>
                    String(a.itemNumber) === String(item) &&
                    a.answer === 'No'
                )
              );

              return `
                <div>
                  -
                  <a href="#"
                    onclick="window.openProject('${match?.id}')">
                    Item ${item}
                  </a>
                </div>
              `;
            })
              .join('')}
          </div>
        `
        : ''
    }

    <div style="margin-top:8px;">
      Previous company:
      <strong>
        ${related[0]?.organisationName || '-'}
      </strong>
    </div>
    <div style="margin-top:8px;">
      Previous risk:
      <strong>
        ${
          related[0]?.answers?.some(
            a => a.answer === 'No'
          )
            ? 'Attention Required'
            : 'Compliant'
        }
      </strong>
    </div>
    <div style="margin-top:8px;">
      Last inspection:
      ${
        related[0]?.lastSaved
          ? new Date(
              related[0].lastSaved
            ).toLocaleDateString()
          : '-'
      }
    </div>
    <div style="margin-top:12px;">
      <button
        class="small-btn"
        onclick="window.openProject('${related[0].id}')"
      >
        Open Previous Inspection
        (${new Date(
          related[0].lastSaved
        ).toLocaleDateString()})
      </button>
      <div style="margin-top:16px;">
      <strong>Recent Inspection History</strong>

      ${historyHtml}
    </div>
    </div>
  `;
  

  const form =
    document.getElementById(
      'projectFormSection'
    );

  form.prepend(panel);
}
loadData();
window.openProject = openProject;
window.scheduleAutoSave = scheduleAutoSave;
window.toggleChecklistSection = toggleChecklistSection;
window.toggleSection = toggleSection;
window.expandAllSections = expandAllSections;
window.collapseAllSections = collapseAllSections;
window.addEventListener('online', safeDownloadNewerCloudInspections);
window.addEventListener('online', uploadPendingInspections);
window.updatePhotoNote = updatePhotoNote;
