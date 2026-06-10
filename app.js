let currentFilter = 'all';
let currentProjectPage = 1;

let activeChecklistSectionIndex = null;
let activeChecklistQuestionPosition = 0;
const PROJECTS_PER_PAGE = 10;
function setFilter(filter) {
  currentFilter =
    currentFilter === filter && filter !== 'all'
      ? 'all'
      : filter;

  currentProjectPage = 1;
  renderProjectsList();
  updateDashboardSelection();
  closeFilterPanel();
  scrollToFirstVisibleProject();
}
let occupancies = [];
let requirements = [];
let checklists = [];
let inspectionTemplates = {};
let currentProjectId = null;
let currentProjectSummaryId = null;
let siteReadyPreflightOpen = false;
let currentPhotos = [];
let archivedReportContext = null;
let currentUserProfile = null;
let currentCompanyAccess = null;

const APP_VERSION = 'v90-beta-feedback-autofill1';
const MAX_PHOTOS_PER_INSPECTION = 10;
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
    address.house_name ||
    address.unit ||
    ''
  );
}

function getStreetNumberFromDisplayName(displayName = '') {
  const firstPart = String(displayName)
    .split(',')[0]
    .trim();

  const match = firstPart.match(/^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)/);
  return match ? match[1] : '';
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

  const finalComments = getEl('finalComments').value.trim();

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
  const inspectionDate =
  getEl('inspectionDate').value ||
  new Date().toISOString().slice(0, 10);
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

  if (!currentProjectId) {
    return;
  }

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
        inspectionDate,
        occupancy,
        answers,        
        followUpRequired: getEl('followUpRequired').value,
        followUpDate: getEl('followUpDate').value,
        followUpNotes: getEl('followUpNotes').value.trim(),
        finalComments,
        photos: currentPhotos,
        lastSaved: new Date().toISOString()
      };
    }
  }

  setProjects(projects);
  renderProjectsList();
  
  const saveMessage = document.getElementById('saveMessage');
  

  if (saveMessage) {
    saveMessage.textContent = `Last saved: ${formatLastSaved()}`;
  }

  const savedProject = projects.find(p => p.id === currentProjectId);

  if (savedProject) {
  if (!navigator.onLine) {
    setSyncStatusMessage('Autosaved offline. Will sync when signal returns.');
    return;
  }

  uploadSingleInspection(savedProject)
    .catch(error => {
      console.error('Auto upload after autosave failed:', error);
      setSyncStatusMessage('Autosaved locally. Cloud upload failed.');
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

function formatInspectionDate(value) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function getProjectInspectionDate(project) {
  return (
    project?.inspectionDate ||
    project?.completedAt?.slice(0, 10) ||
    project?.lastSaved?.slice(0, 10) ||
    ''
  );
}

  function exportReport() {

  if (!canViewReports()) {
    alert(
      'Your company access does not allow exporting reports. Please contact your company admin or Fire-S support.'
    );
    return;
  }

  if (!archivedReportContext) {
    generateReport(); // maak seker gewone report is nuut
  }
  getEl('reportSection').style.display = 'block';

  const element = document.getElementById('reportContent');

  const currentProject = getProjects().find(
    p => p.id === currentProjectId
  );

  const projectName =
    archivedReportContext?.projectName ||
    currentProject?.projectName ||
    'Inspection';

  const reportDate =
    new Date().toISOString().slice(0, 10);

  const reportPrefix =
    archivedReportContext
      ? 'Fire-S_Archived_Report'
      : 'Fire-S_Report';

  const safeProjectName =
    sanitizeFileName(projectName);

  const opt = {
  margin: [15, 12, 15, 12],

  filename: `${reportPrefix}_${safeProjectName}_${reportDate}.pdf`,

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
    mode: ['css', 'legacy']
  }
};
  setTimeout(() => {
  html2pdf().set(opt).from(element).save();
}, 300);
}

async function reverseLookupAddress(lat, lon, zoom = 19) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=${zoom}&addressdetails=1&namedetails=1&extratags=1`
  );

  if (!response.ok) {
    throw new Error(`Address lookup failed: ${response.status}`);
  }

  return response.json();
}

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRadians = value => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildAddressFromOsmTags(tags = {}) {
  const address = {
    house_number: tags['addr:housenumber'] || '',
    road: tags['addr:street'] || '',
    suburb:
      tags['addr:suburb'] ||
      tags['addr:neighbourhood'] ||
      '',
    city:
      tags['addr:city'] ||
      tags['addr:town'] ||
      tags['addr:village'] ||
      '',
    state: tags['addr:province'] || tags['addr:state'] || '',
    postcode: tags['addr:postcode'] || ''
  };

  return {
    address,
    display_name: buildStreetAddress(address)
  };
}

async function lookupNearestNumberedAddress(lat, lon) {
  const query = `
    [out:json][timeout:8];
    (
      node(around:45,${lat},${lon})["addr:housenumber"];
      way(around:45,${lat},${lon})["addr:housenumber"];
      relation(around:45,${lat},${lon})["addr:housenumber"];
    );
    out center tags 20;
  `;
  const response = await fetch(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error(`Nearest numbered address lookup failed: ${response.status}`);
  }

  const data = await response.json();
  const candidates = (data.elements || [])
    .map(element => {
      const candidateLat = element.lat || element.center?.lat;
      const candidateLon = element.lon || element.center?.lon;

      if (!candidateLat || !candidateLon || !element.tags?.['addr:housenumber']) {
        return null;
      }

      return {
        ...buildAddressFromOsmTags(element.tags),
        distance: getDistanceInMeters(lat, lon, candidateLat, candidateLon)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0] || null;
}

async function reverseLookupBestAddress(lat, lon) {
  const zoomLevels = [19, 18, 17];
  let bestResult = null;

  for (const zoom of zoomLevels) {
    const result = await reverseLookupAddress(lat, lon, zoom);
    const streetNumber =
      getStreetNumberFromAddress(result.address || {}) ||
      getStreetNumberFromDisplayName(result.display_name);

    if (!bestResult) {
      bestResult = result;
    }

    if (streetNumber) {
      return result;
    }
  }

  try {
    const nearestNumberedAddress =
      await lookupNearestNumberedAddress(lat, lon);

    if (nearestNumberedAddress) {
      return nearestNumberedAddress;
    }
  } catch (error) {
    console.warn('Nearest numbered address lookup failed:', error);
  }

  return bestResult;
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

function getGpsMapUrls(gpsValue) {
  const parsed = parseGpsInput(gpsValue);

  if (!parsed) return null;

  const { lat, lon } = parsed;
  const mapRange = 0.003;
  const bbox = [
    lon - mapRange,
    lat - mapRange,
    lon + mapRange,
    lat + mapRange
  ].map(value => value.toFixed(6)).join('%2C');
  const marker = `${lat.toFixed(6)}%2C${lon.toFixed(6)}`;
  const query = encodeURIComponent(`${lat.toFixed(6)},${lon.toFixed(6)}`);

  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`,
    maps: `https://www.google.com/maps/search/?api=1&query=${query}`
  };
}

function updateGpsMapPreview() {
  const preview = document.getElementById('gpsMapPreview');
  const frame = document.getElementById('gpsMapFrame');
  const link = document.getElementById('openMapsLink');
  const status = document.getElementById('gpsMapStatus');

  if (!preview || !frame || !link) return;

  const urls = getGpsMapUrls(getEl('gps').value);

  if (!urls) {
    preview.hidden = false;
    frame.hidden = true;
    frame.removeAttribute('src');
    link.href = '#';
    link.classList.add('disabled-link');
    if (status) {
      status.hidden = false;
      status.textContent = 'Map will show here after GPS is captured.';
    }
    return;
  }

  preview.hidden = false;
  frame.hidden = false;
  frame.src = urls.embed;
  link.href = urls.maps;
  link.classList.remove('disabled-link');
  if (status) {
    status.hidden = true;
  }
}

function applyAddressLookupResult(data, fallbackText) {
  const streetNumber =
    getStreetNumberFromAddress(data.address || {}) ||
    getStreetNumberFromDisplayName(data.display_name);
  const addressLine = buildAddressLineWithoutStreetNumber(data.address || {});

  getEl('streetNumber').value = streetNumber || '';
  getEl('projectAddress').value =
    addressLine || data.display_name || fallbackText;

  getEl('saveMessage').textContent = streetNumber
    ? 'Precise address found with street number from GPS.'
    : 'Street number was not found. Please add the street number manually before saving this inspection.';

  scheduleAutoSave();
}

function projectNeedsOfflineAddressLookup(project) {
  if (!project || !parseGpsInput(project.gps)) return false;

  const gpsText = String(project.gps || '').trim();

  const addressLine =
    String(project.addressLine || project.projectAddress || '').trim();

  const streetNumber =
    String(project.streetNumber || '').trim();

  // If there is no address yet, we must still resolve it.
  if (!addressLine) return true;

  // If the address field still contains only the GPS coordinates,
  // it means GPS was captured offline and address lookup still needs to run.
  if (addressLine === gpsText) return true;

  // If the address looks like raw coordinates, try again when online.
  if (parseGpsInput(addressLine)) return true;

  // If there is an address but no street number, keep trying.
  // Some sites will never return a number, but this gives the app a fair chance
  // when signal comes back.
  if (!streetNumber) return true;

  return false;
}

function applyAddressLookupToProject(project, data) {
  const streetNumber =
    getStreetNumberFromAddress(data.address || {}) ||
    getStreetNumberFromDisplayName(data.display_name);
  const addressLine =
    buildAddressLineWithoutStreetNumber(data.address || {}) ||
    data.display_name ||
    project.addressLine ||
    project.projectAddress ||
    '';

  return {
    ...project,
    streetNumber: streetNumber || project.streetNumber || '',
    addressLine,
    projectAddress: combineStreetAddress(
      streetNumber || project.streetNumber || '',
      addressLine
    ),
    gpsAddressResolvedAt: new Date().toISOString(),
    syncPending: true,
    syncError: false,
    lastSaved: new Date().toISOString()
  };
}

async function resolvePendingGpsAddresses() {
  if (!navigator.onLine) return;

  const projects = getProjects();
  let changed = false;
  let updatedCurrentProject = null;

  for (let index = 0; index < projects.length; index++) {
    const project = projects[index];

    if (!projectNeedsOfflineAddressLookup(project)) continue;

    const parsed = parseGpsInput(project.gps);
    if (!parsed) continue;

    try {
      const data = await reverseLookupBestAddress(parsed.lat, parsed.lon);

      const updatedProject =
        applyAddressLookupToProject(project, data);

      projects[index] = updatedProject;
      changed = true;

      if (updatedProject.id === currentProjectId) {
        updatedCurrentProject = updatedProject;
      }

    } catch (error) {
      console.warn('Pending GPS address lookup failed:', project.id, error);
    }
  }

  if (!changed) return;

  setProjects(projects);

  if (updatedCurrentProject) {
    getEl('streetNumber').value =
      updatedCurrentProject.streetNumber || '';

    getEl('projectAddress').value =
      updatedCurrentProject.addressLine ||
      updatedCurrentProject.projectAddress ||
      '';

    getEl('saveMessage').textContent =
      'Address updated from saved GPS after signal returned.';

    updateGpsMapPreview();
  }

  renderProjectsList();

  uploadPendingInspections()
    .catch(error => {
      console.warn('Upload after GPS address lookup failed:', error);
    });
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
    const data = await reverseLookupBestAddress(parsed.lat, parsed.lon);
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
    updateGpsMapPreview();

    try {
      const data = await reverseLookupBestAddress(lat, lon);
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
    timeout: 25000,
    maximumAge: 0
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

function getChecklistSectionRows(sectionIndex) {
  return Array.from(
    document.querySelectorAll(
      `.checklist-row[data-section-index="${sectionIndex}"]`
    )
  );
}

function closeChecklistSection(sectionIndex) {
  const section = document.getElementById(`section_${sectionIndex}`);
  const arrow = document.getElementById(`arrow_${sectionIndex}`);
  const nav = document.getElementById(`sectionNav_${sectionIndex}`);

  if (section) {
    section.classList.add('hidden');
  }

  if (arrow) {
    arrow.textContent = '>';
  }

  if (nav) {
    nav.style.display = 'none';
  }

  getChecklistSectionRows(sectionIndex).forEach(row => {
    row.classList.remove('active-checklist-question');
    row.classList.remove('question-hidden');
  });

  if (activeChecklistSectionIndex === sectionIndex) {
    activeChecklistSectionIndex = null;
    activeChecklistQuestionPosition = 0;
  }
}

function closeAllChecklistSections() {
  document.querySelectorAll('.section-group').forEach(section => {
    section.classList.add('hidden');
  });

  document.querySelectorAll('[id^="arrow_"]').forEach(arrow => {
    arrow.textContent = '>';
  });

  document.querySelectorAll('.checklist-question-nav').forEach(nav => {
    nav.style.display = 'none';
  });

  document.querySelectorAll('.checklist-row').forEach(row => {
    row.classList.remove('active-checklist-question');
    row.classList.remove('question-hidden');
  });

  activeChecklistSectionIndex = null;
  activeChecklistQuestionPosition = 0;
}

function openChecklistSection(sectionIndex, focusFirstQuestion = false) {
  closeAllChecklistSections();

  const section = document.getElementById(`section_${sectionIndex}`);
  const arrow = document.getElementById(`arrow_${sectionIndex}`);
  const nav = document.getElementById(`sectionNav_${sectionIndex}`);

  if (!section) return;

  document
    .querySelectorAll('.checklist-section-tab')
    .forEach(tab => tab.classList.remove('active-section-tab'));

  const activeTab =
    document.querySelector(`.checklist-section-tab[data-section-index="${sectionIndex}"]`);

  if (activeTab) {
    activeTab.classList.add('active-section-tab');
  }

  section.classList.remove('hidden');

  if (arrow) {
    arrow.textContent = 'v';
  }

  if (nav) {
    nav.style.display = 'flex';
  }

  activeChecklistSectionIndex = sectionIndex;
  activeChecklistQuestionPosition = 0;

  showChecklistQuestion(sectionIndex, 0, focusFirstQuestion);
}

function toggleSection(sectionIndex) {
  const section = document.getElementById(`section_${sectionIndex}`);

  if (!section) return;

  const isClosed = section.classList.contains('hidden');

  if (isClosed) {
    openChecklistSection(sectionIndex, true);
  } else {
    closeChecklistSection(sectionIndex);
  }
}

function showChecklistQuestion(sectionIndex, position, shouldScroll = true) {
  const rows = getChecklistSectionRows(sectionIndex);

  if (rows.length === 0) return;

  const safePosition = Math.max(
    0,
    Math.min(position, rows.length - 1)
  );

  activeChecklistSectionIndex = sectionIndex;
  activeChecklistQuestionPosition = safePosition;

  rows.forEach((row, index) => {
    row.classList.toggle('question-hidden', index !== safePosition);
    row.classList.toggle('active-checklist-question', index === safePosition);
  });

  const status = document.getElementById(`sectionNavStatus_${sectionIndex}`);

  if (status) {
    status.textContent =
      `Question ${safePosition + 1} of ${rows.length}`;
  }

  if (shouldScroll) {
  const checklistCard = document.getElementById('checklist')?.closest('.card');
  const tabs = document.querySelector('.checklist-section-tabs');
  const nav = document.getElementById(`sectionNav_${sectionIndex}`);

  const target = tabs || nav || checklistCard || rows[safePosition];

  const topOffset = 90;

  const targetTop =
    target.getBoundingClientRect().top +
    window.pageYOffset -
    topOffset;

  window.scrollTo({
    top: Math.max(targetTop, 0),
    behavior: 'smooth'
  });
}
}

function nextChecklistQuestion(sectionIndex) {
  const rows = getChecklistSectionRows(sectionIndex);

  if (rows.length === 0) return;

  if (activeChecklistQuestionPosition >= rows.length - 1) {
    closeChecklistSection(sectionIndex);
    setReadinessMessage('Section completed and closed.');
    return;
  }

  showChecklistQuestion(
    sectionIndex,
    activeChecklistQuestionPosition + 1,
    true
  );
}

function previousChecklistQuestion(sectionIndex) {
  if (activeChecklistQuestionPosition <= 0) {
    showChecklistQuestion(sectionIndex, 0, true);
    return;
  }

  showChecklistQuestion(
    sectionIndex,
    activeChecklistQuestionPosition - 1,
    true
  );
}

function autoCloseSectionIfCompleted(selectEl) {
  const row = selectEl.closest('.checklist-row');

  if (!row) return;

  const sectionIndex = Number(row.dataset.sectionIndex);
  const rows = getChecklistSectionRows(sectionIndex);

  if (rows.length === 0) return;

  const lastRow = rows[rows.length - 1];

  if (row !== lastRow) return;

  const allAnswered = rows.every(sectionRow => {
    const answerField = sectionRow.querySelector('.answer-select');
    return answerField && answerField.value;
  });

  if (!allAnswered) return;

  closeChecklistSection(sectionIndex);
  setReadinessMessage('Section completed and closed.');
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
  const filename = sanitizeFileName(`fire-s-backup-${timestamp}`, 'fire-s-backup');
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
  const filename = sanitizeFileName(`fire-s-backup-text-${timestamp}`, 'fire-s-backup-text');
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
    app: 'Fire-S',
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
    `fire-s-before-${safeReason}-${timestamp}`,
    'fire-s-before-backup'
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

    const importedProjects = filterDeletedProjects(backup.projects);

    setProjects(importedProjects);
    currentProjectId = null;
    currentPhotos = [];

    renderProjectsList();
    showProjectList();

    const message =
      `Backup imported successfully (${importedProjects.length} inspection${importedProjects.length === 1 ? '' : 's'}).`;
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
    const loginPasswordField = document.getElementById('loginPassword');

    if (loginPasswordField) {
      loginPasswordField.value = '';
    }

    alert(`Login failed: ${error.message}`);

    if (syncStatus) {
      syncStatus.textContent = `Login failed: ${error.message}`;
    }

    return;
  }

    if (syncStatus) {
      syncStatus.textContent = 'Logged in successfully.';
    }

    const loginEmailField = document.getElementById('loginEmail');
    const loginPasswordField = document.getElementById('loginPassword');

    if (loginEmailField) {
      loginEmailField.value = '';
    }

    if (loginPasswordField) {
      loginPasswordField.value = '';
    }

    closeCloudDropdown();
    updateHomeAccessCards();

    updateSyncUI();

    loadUserAccessProfile()
    .then(async () => {
      await refreshSyncData();
      renderProjectsList();
    })
    .catch(error => {
      console.error('Access profile load failed after login:', error);
    });

  } catch (error) {
    console.error('Login crashed:', error);

    if (syncStatus) {
      syncStatus.textContent = `Login crashed: ${error.message}`;
    }

    alert(`Login crashed: ${error.message}`);
  }
}

async function logoutUser() {
  const syncStatus = document.getElementById('syncStatus');

  if (syncStatus) {
    syncStatus.textContent = 'Logging out...';
  }

  try {
  await refreshSyncData();

  const { error } = await supabaseClient.auth.signOut();

    if (error) {
      if (syncStatus) {
        syncStatus.textContent = `Logout failed: ${error.message}`;
      }

      alert(`Logout failed: ${error.message}`);
      return;
    }

    currentUserProfile = null;
    currentCompanyAccess = null;

    updateHomeAccessCards();
    updateAccessUI();
    updateSyncUI();

    const projectsList = document.getElementById('projectsList');
    const dashboardMetrics = document.getElementById('dashboardMetrics');
    const projectPagingControls = document.getElementById('projectPagingControls');

    if (projectsList) projectsList.innerHTML = '';
    if (dashboardMetrics) dashboardMetrics.innerHTML = '';
    if (projectPagingControls) projectPagingControls.innerHTML = '';

    showHome();

    const cloudDropdown = document.getElementById('cloudDropdown');

    if (cloudDropdown) {
      cloudDropdown.style.display = 'none';
    }

    if (syncStatus) {
      syncStatus.textContent = 'Logged out.';
    }
  } catch (error) {
    console.error('Logout crashed:', error);

    if (syncStatus) {
      syncStatus.textContent = `Logout crashed: ${error.message}`;
    }

    alert(`Logout crashed: ${error.message}`);
  }
}

function initAuthStateListener() {
  if (!supabaseClient?.auth?.onAuthStateChange) return;

  supabaseClient.auth.onAuthStateChange(() => {
    updateSyncUI();
  });
}

let backgroundSyncInProgress = false;

function setSyncStatusMessage(message) {
  const syncStatus = document.getElementById('syncStatus');
  const saveMessage = document.getElementById('saveMessage');

  if (syncStatus) {
    syncStatus.textContent = message;
  }

  if (saveMessage) {
    saveMessage.textContent = message;
  }
}

async function runBackgroundSync(reason = 'background') {
  if (backgroundSyncInProgress) return;

  if (!navigator.onLine) {
    setSyncStatusMessage('Offline. Changes will sync when signal returns.');
    return;
  }

  if (typeof supabaseClient === 'undefined') {
    setSyncStatusMessage('Cloud sync unavailable. Saved locally.');
    return;
  }

  backgroundSyncInProgress = true;

  try {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data?.user) {
      setSyncStatusMessage('Saved locally. Login required for cloud sync.');
      return;
    }

    if (reason !== 'autosave' && reason !== 'background') {
      setSyncStatusMessage(`Syncing changes... (${reason})`);
    }

    await uploadPendingInspections();
    await safeDownloadNewerCloudInspections();
    await uploadPendingInspections();

    renderProjectsList();
    reloadCurrentOpenInspectionAfterSync();

    if (reason !== 'autosave' && reason !== 'background') {
      setSyncStatusMessage('All changes synced.');
    }
  } catch (error) {
    console.warn(`Background sync failed (${reason}):`, error);
    setSyncStatusMessage('Saved locally. Cloud sync failed.');
  } finally {
    backgroundSyncInProgress = false;
  }
}

function reloadCurrentOpenInspectionAfterSync() {
  if (!currentProjectId) return;

  const projects = getProjects();
  const refreshedProject = projects.find(
    project => project.id === currentProjectId
  );

  if (!refreshedProject) return;

  currentPhotos = refreshedProject.photos || [];
  renderPhotos();

  const saveMessage = document.getElementById('saveMessage');

  
}

async function refreshSyncData() {
  const syncStatus = document.getElementById('syncStatus');

  if (syncStatus) {
    syncStatus.textContent = 'Refreshing cloud data...';
  }

  try {
    await uploadPendingInspections();
    await safeDownloadNewerCloudInspections();
    await uploadPendingInspections();

    renderProjectsList();
    reloadCurrentOpenInspectionAfterSync();

    if (syncStatus) {
      syncStatus.textContent = 'Data refreshed and synced.';
    }
  } catch (error) {
    console.error('Refresh sync failed:', error);

    if (syncStatus) {
      syncStatus.textContent = 'Refresh failed. Check connection or login.';
    }
  }
}
 
async function uploadSync() {
  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser();

  if (userError || !userData.user) {
    getEl('syncStatus').textContent =
      'Please login before syncing.';
    return;
  }

  const projects = getProjects();

  getEl('syncStatus').textContent =
    `Uploading ${projects.length} inspection(s)...`;

  try {
    for (const project of projects) {
      await uploadSingleInspection(project);
    }

    getEl('syncStatus').textContent =
      `Synced ${projects.length} inspection(s) to cloud.`;
  } catch (error) {
    console.error('Manual upload sync failed:', error);

    getEl('syncStatus').textContent =
      `Sync failed: ${error.message}`;
  }
}

async function debugSyncCounts() {
  const syncStatus = document.getElementById('syncStatus');

  const localProjects = getProjects();
  const visibleProjects = getVisibleProjectsForCurrentUser(localProjects);

  let cloudCount = 'not checked';
  let cloudError = '';
  let userInfo = {
    userId: null,
    email: null,
    companyId: currentUserProfile?.companyId || null,
    role: currentUserProfile?.role || null
  };

  try {
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError || !userData?.user) {
      cloudError = userError?.message || 'No logged-in user';
    } else {
      userInfo.userId = userData.user.id;
      userInfo.email = userData.user.email;

      let query = supabaseClient
        .from('inspections')
        .select('id, user_id, company_id, created_by_email, updated_at');

      query = applyInspectionAccessFilter(
        query,
        userData.user.id
      );

      const { data, error } = await query;

      if (error) {
        cloudError = error.message;
      } else {
        cloudCount = data?.length || 0;
      }
    }
  } catch (error) {
    cloudError = error.message;
  }

  const message =
    `Debug Sync Counts:
Local inspections: ${localProjects.length}
Visible inspections: ${visibleProjects.length}
Cloud returned: ${cloudCount}
User ID: ${userInfo.userId || '-'}
Email: ${userInfo.email || '-'}
Company ID: ${userInfo.companyId || '-'}
Role: ${userInfo.role || '-'}
Cloud error: ${cloudError || 'none'}`;

  console.log(message);

  if (syncStatus) {
    syncStatus.textContent =
      `Local ${localProjects.length} | Visible ${visibleProjects.length} | Cloud ${cloudCount}`;
  }

  alert(message);
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

  const projects = filterDeletedProjects(
    data.map(row => row.inspection_data)
  );

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

  const cloudProjects = filterDeletedProjects(
    data.map(row => row.inspection_data)
  );

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

const localHasStrippedPhotos =
  (localProject.photos || []).some(photo => !photo.src);

const cloudHasRealPhotos =
  (cloudProject.photos || []).some(photo => photo.src);

if (localHasStrippedPhotos && cloudHasRealPhotos) {
  mergedMap.set(cloudProject.id, {
    ...localProject,
    photos: cloudProject.photos
  });
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
  const loginToolsPanel = document.getElementById('loginToolsPanel');
  const syncButtonsSection = document.getElementById('syncButtonsSection');
  const syncButtonsPanel = document.getElementById('syncButtonsPanel');
  const cloudAdminPanel = document.getElementById('cloudAdminPanel');
  const syncStatus = document.getElementById('syncStatus');
  const cloudMenuBtn = document.getElementById('cloudMenuBtn');
  const showSyncToolsBtn = document.getElementById('showSyncToolsBtn');

  let isLoggedIn = false;
  let authEmail = '';

  try {
    const { data, error } = await supabaseClient.auth.getUser();

    isLoggedIn = !error && !!data?.user;
    authEmail = data?.user?.email || '';
  } catch (error) {
    console.error('Cloud status check failed:', error);
  }

  const isAdmin =
    isLoggedIn && canUseAdminSyncTools(authEmail);

  // Cloud top button text only
  if (cloudMenuBtn) {
    cloudMenuBtn.classList.toggle('connected', isLoggedIn);
    cloudMenuBtn.textContent = isLoggedIn ? 'Cloud connected' : 'Cloud';
  }

  // Main cloud dropdown sections
  if (connectedView) {
    connectedView.style.display = isLoggedIn ? 'block' : 'none';
  }

  if (syncTools) {
    syncTools.style.display = 'block';
  }

  // Login fields only when logged out
  if (loginToolsPanel) {
    loginToolsPanel.style.display = isLoggedIn ? 'none' : 'block';
  }

  // Admin button only when logged in as admin
  if (showSyncToolsBtn) {
    showSyncToolsBtn.style.display = isAdmin ? 'block' : 'none';
  }

  // These must NEVER show automatically
  if (syncButtonsSection) {
    syncButtonsSection.style.display = 'none';
  }

  if (syncButtonsPanel) {
    syncButtonsPanel.style.display = 'none';
  }

  if (cloudAdminPanel) {
    cloudAdminPanel.style.display = 'none';
  }

  if (syncStatus) {
    syncStatus.textContent = isLoggedIn
      ? 'Connected. Auto sync enabled.'
      : 'Not connected. Login required.';
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
      refreshSyncData();
    }

  } catch (error) {
    console.error('Cloud session restore failed:', error);

    if (syncStatus) {
      syncStatus.textContent = 'Cloud session could not be restored.';
    }
  }
}

function showSyncTools() {
  if (!canUseAdminSyncTools()) {
    alert('Admin / Sync Tools are only available to authorised users.');
    return;
  }

  const syncButtonsSection = document.getElementById('syncButtonsSection');
  const syncButtonsPanel = document.getElementById('syncButtonsPanel');
  const cloudAdminPanel = document.getElementById('cloudAdminPanel');
  
  if (syncButtonsSection) {
    syncButtonsSection.style.display = 'block';
  }

  if (syncButtonsPanel) {
    syncButtonsPanel.style.display = 'block';
  }

  if (cloudAdminPanel) {
    cloudAdminPanel.style.display = 'block';
  }

  // Old top-page backup tools must stay hidden.
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
      if (isProjectDeleted(cloudProject?.id)) return;
      const localProject = mergedMap.get(cloudProject.id);

      if (!localProject) {
  mergedMap.set(cloudProject.id, cloudProject);
  return;
}

const localHasStrippedPhotos =
  (localProject.photos || []).some(photo => !photo.src);

const cloudHasRealPhotos =
  (cloudProject.photos || []).some(photo => photo.src);

if (localHasStrippedPhotos && cloudHasRealPhotos) {
  mergedMap.set(cloudProject.id, {
    ...localProject,
    photos: cloudProject.photos
  });
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
    resolvePendingGpsAddresses();

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

  const refreshSyncBtn = document.getElementById('refreshSyncBtn');

  if (refreshSyncBtn) {
    refreshSyncBtn.addEventListener('click', refreshSyncData);
  }

  const showSyncToolsBtn = document.getElementById('showSyncToolsBtn');
  if (showSyncToolsBtn) {
    showSyncToolsBtn.addEventListener('click', showSyncTools);
  }
  const homeLoginRouteBtn = document.getElementById('homeLoginRouteBtn');
  if (homeLoginRouteBtn) {
    homeLoginRouteBtn.addEventListener('click', openLoginRoute);
  }

  const homeInspectionRouteBtn = document.getElementById('homeInspectionRouteBtn');
  if (homeInspectionRouteBtn) {
    homeInspectionRouteBtn.addEventListener('click', showProjectList);
  }

  const projectsHomeBtn = document.getElementById('projectsHomeBtn');

  if (projectsHomeBtn) {
    projectsHomeBtn.addEventListener('click', showHome);
  }

  const homeServicesRouteBtn = document.getElementById('homeServicesRouteBtn');
  if (homeServicesRouteBtn) {
    homeServicesRouteBtn.addEventListener('click', showServices);
  }

  const servicesBackBtn = document.getElementById('servicesBackBtn');
  if (servicesBackBtn) {
    servicesBackBtn.addEventListener('click', showHome);
  }

  document.querySelectorAll('[data-service]').forEach(button => {
    button.addEventListener('click', () => {
      requestAdditionalService(button.dataset.service);
    });
  });

  const submitServiceRequestBtn = document.getElementById('submitServiceRequestBtn');
  if (submitServiceRequestBtn) {
    submitServiceRequestBtn.addEventListener('click', submitServiceRequest);
  }

  const viewServiceRequestsBtn = document.getElementById('viewServiceRequestsBtn');

  if (viewServiceRequestsBtn) {
    viewServiceRequestsBtn.addEventListener('click', renderServiceRequestsList);
  }

  const viewBetaFeedbackBtn = document.getElementById('viewBetaFeedbackBtn');

  if (viewBetaFeedbackBtn) {
    viewBetaFeedbackBtn.addEventListener('click', renderBetaFeedbackList);
  }

  const cancelServiceRequestBtn = document.getElementById('cancelServiceRequestBtn');
  if (cancelServiceRequestBtn) {
    cancelServiceRequestBtn.addEventListener('click', cancelServiceRequest);
  }

  const openBetaFeedbackBtn = document.getElementById('openBetaFeedbackBtn');

  if (openBetaFeedbackBtn) {
    openBetaFeedbackBtn.addEventListener('click', openBetaFeedbackForm);
  }

  const submitBetaFeedbackBtn = document.getElementById('submitBetaFeedbackBtn');

  if (submitBetaFeedbackBtn) {
    submitBetaFeedbackBtn.addEventListener('click', submitBetaFeedback);
  }

  const cancelBetaFeedbackBtn = document.getElementById('cancelBetaFeedbackBtn');

  if (cancelBetaFeedbackBtn) {
    cancelBetaFeedbackBtn.addEventListener('click', cancelBetaFeedback);
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
  const inspectionMenuToggleBtn =
  document.getElementById('inspectionMenuToggleBtn');

  if (inspectionMenuToggleBtn) {
    inspectionMenuToggleBtn.addEventListener('click', toggleInspectionCommandMenu);
  }

  document
    .querySelectorAll('[data-section-target]')
    .forEach(button => {
      button.addEventListener('click', () => {
        openInspectionCommandSection(button.dataset.sectionTarget);
      });
    });
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
  
  const logoutBtn = document.getElementById('logoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUser);
  }

  const homeLogoutBtn = document.getElementById('homeLogoutBtn');

  if (homeLogoutBtn) {
    homeLogoutBtn.addEventListener('click', logoutUser);
  }

  getEl('syncUploadBtn').addEventListener('click', uploadSync);
  getEl('occupancySelect').addEventListener('change', updateDisplay);
  getEl('saveBtn').addEventListener('click', saveProject);
  getEl('finishBtn').addEventListener('click', finishInspection);
  getEl('reportBtn').addEventListener('click', generateReport);
  getEl('deleteBtn').addEventListener('click', deleteProject);
  getEl('newProjectBtn').addEventListener('click', createNewProject);
  
  const scheduleNewInspectionBtn =
    document.getElementById('scheduleNewInspectionBtn');

  if (scheduleNewInspectionBtn) {
    scheduleNewInspectionBtn.addEventListener('click', scheduleNewInspection);
  }
  const saveScheduledInspectionBtn =
  document.getElementById('saveScheduledInspectionBtn');

if (saveScheduledInspectionBtn) {
  saveScheduledInspectionBtn.addEventListener('click', saveScheduledNewInspection);
}

const cancelScheduledInspectionBtn =
  document.getElementById('cancelScheduledInspectionBtn');

if (cancelScheduledInspectionBtn) {
  cancelScheduledInspectionBtn.addEventListener('click', cancelScheduleNewInspection);
}
  const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');

  if (toggleFiltersBtn) {
    toggleFiltersBtn.addEventListener('click', toggleFilterPanel);
  }
  
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', showProjectList);
  }

  const topBackBtn = document.getElementById('topBackBtn');
  if (topBackBtn) {
    topBackBtn.addEventListener('click', showProjectList);
  }
  const floatingBackToProjectsBtn =
    document.getElementById('floatingBackToProjectsBtn');

  if (floatingBackToProjectsBtn) {
    floatingBackToProjectsBtn.addEventListener('click', showProjectList);
  }
  getEl('photoInput').addEventListener('change', handlePhotoUpload);
  const downloadAllPhotosBtn =
    document.getElementById('downloadAllPhotosBtn');

  if (downloadAllPhotosBtn) {
    downloadAllPhotosBtn.addEventListener('click', downloadAllInspectionPhotos);
  }
  getEl('organisationName').addEventListener('input', scheduleAutoSave);
  getEl('siteName').addEventListener('input', scheduleAutoSave);
  getEl('contactPerson').addEventListener('input', scheduleAutoSave);
  getEl('contactTel').addEventListener('input', scheduleAutoSave);
  getEl('contactEmail').addEventListener('input', scheduleAutoSave);
  getEl('inspectorName').addEventListener('input', scheduleAutoSave);
  getEl('inspectionDate').addEventListener('input', scheduleAutoSave);
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
  getEl('gps').addEventListener('input', () => {
    updateGpsMapPreview();
    scheduleAutoSave();
  });
  getEl('useLocationBtn').addEventListener('click', useCurrentLocation);
  getEl('inMall').addEventListener('change', () => {
    toggleMallFields();
    scheduleAutoSave();
  });
  getEl('mallName').addEventListener('input', scheduleAutoSave);
  getEl('unitNumber').addEventListener('input', scheduleAutoSave);
  getEl('followUpRequired').addEventListener('change', () => {
  if (getEl('followUpRequired').value === 'No') {
      getEl('followUpDate').value = '';
      getEl('followUpNotes').value = '';
    }

    scheduleAutoSave();
  });
  getEl('followUpDate').addEventListener('input', () => {
  const followUpDate = getEl('followUpDate').value;
  const followUpRequired = getEl('followUpRequired');

  if (followUpDate && followUpRequired.value !== 'Yes') {
    followUpRequired.value = 'Yes';
  }

  scheduleAutoSave();
});
  getEl('followUpNotes').addEventListener('input', scheduleAutoSave);
  getEl('projectSearch').addEventListener('input', () => {
    currentProjectPage = 1;
    renderProjectsList();
    scrollToFirstVisibleProject();
  });
  getEl('productType').addEventListener('change', () => {
    updateInspectionTypeOptions();
    updateDisplay();
    scheduleAutoSave();
  });
  const exportBackupBtn = document.getElementById('exportBackupBtn');

if (exportBackupBtn) {
  exportBackupBtn.addEventListener('click', exportBackup);
}

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
  const importBackupInput = document.getElementById('importBackupInput');

  if (importBackupInput) {
    importBackupInput.addEventListener('change', importBackup);
  }
  getEl('inspectionType').addEventListener('change', () => {
    updateDisplay();
    scheduleAutoSave();
  });
    updateInspectionTypeOptions();
    toggleMallFields();
    showHome();
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
  if (!currentUserProfile) return false;

  if (isSuperAdmin()) return true;

  if (!hasActiveCompanyAccess()) return false;

  return ['company_owner', 'manager', 'inspector']
    .includes(getCurrentUserRole());
}

function canEditInspection() {
  if (!currentUserProfile) return false;

  if (isSuperAdmin()) return true;

  if (!hasActiveCompanyAccess()) return false;

  return ['company_owner', 'manager', 'inspector']
    .includes(getCurrentUserRole());
}

function canViewReports() {
  if (!currentUserProfile) return false;

  if (isSuperAdmin()) return true;

  if (!hasActiveCompanyAccess()) return false;

  return ['company_owner', 'manager', 'inspector', 'viewer']
    .includes(getCurrentUserRole());
}
function canManageCompany() {
  return isSuperAdmin() || isCompanyOwner();
}

function isAllowedAdminEmail(email) {
  const allowedEmails = [
    'georgevdx@gmail.com',
    'johandb1974ik@gmail.com',
    'johandb@live.com'
  ];

  return allowedEmails.includes(
    String(email || '').toLowerCase()
  );
}

function canUseAdminSyncTools(emailOverride) {
  const currentEmail =
    emailOverride ||
    currentUserProfile?.email ||
    '';

  return (
    isSuperAdmin() ||
    isCompanyOwner() ||
    isManager() ||
    isAllowedAdminEmail(currentEmail)
  );
}

function canViewServiceRequests(emailOverride) {
  const currentEmail =
    emailOverride ||
    currentUserProfile?.email ||
    '';

  return (
    isSuperAdmin() ||
    isAllowedAdminEmail(currentEmail)
  );
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
      updateSyncUI();
      updateHomeAccessCards();
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
      updateSyncUI();
      updateHomeAccessCards();
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
    updateSyncUI();
    updateHomeAccessCards();

  } catch (error) {
    console.error('Access profile load failed:', error);

    currentUserProfile = null;
    currentCompanyAccess = null;

    updateAccessUI();
    updateSyncUI();
    updateHomeAccessCards();
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

function getVisibleProjectsForCurrentUser(projects) {
  if (!currentUserProfile) {
    return [];
  }

  if (isSuperAdmin()) {
    return projects;
  }

  if (currentUserProfile.companyId) {
    return projects.filter(project =>
      project.companyId === currentUserProfile.companyId
    );
  }

  const currentEmail =
    String(currentUserProfile.email || '').toLowerCase();

  return projects.filter(project =>
    project.createdByUserId === currentUserProfile.id ||
    String(project.createdByEmail || '').toLowerCase() === currentEmail
  );
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
  try {
    localStorage.setItem('fireyeProjects', JSON.stringify(projects));
  } catch (error) {
    if (error && error.name === 'QuotaExceededError') {
      const compactProjects =
        stripHeavyPhotoDataFromProjects(projects);

      localStorage.setItem(
        'fireyeProjects',
        JSON.stringify(compactProjects)
      );

      console.warn(
        'Storage quota reached. Saved compact inspections without heavy photo data.',
        error
      );

      const syncStatus = document.getElementById('syncStatus');

      if (syncStatus) {
        syncStatus.textContent =
          'Storage limit reached. Inspections saved without large photo data on this device.';
      }

      return;
    }

    throw error;
  }
}

function getDeletedProjectIds() {
  try {
    const raw = localStorage.getItem('fireyeDeletedProjectIds');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Could not read deleted inspection register:', error);
    return {};
  }
}

function markProjectDeleted(projectId) {
  if (!projectId) return;

  const deleted = getDeletedProjectIds();
  deleted[projectId] = new Date().toISOString();
  localStorage.setItem('fireyeDeletedProjectIds', JSON.stringify(deleted));
}

function isProjectDeleted(projectId) {
  if (!projectId) return false;
  return !!getDeletedProjectIds()[projectId];
}

function filterDeletedProjects(projects) {
  return (projects || []).filter(project =>
    project && !isProjectDeleted(project.id)
  );
}

function stripHeavyPhotoData(project) {
  if (!project) return project;

  return {
    ...project,
    photos: (project.photos || []).map(photo => ({
      timestamp: photo.timestamp || null,
      note: photo.note || '',
      src: photo.src && photo.src.length < 5000 ? photo.src : ''
    }))
  };
}

function stripHeavyPhotoDataFromProjects(projects) {
  return (projects || []).map(stripHeavyPhotoData);
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

function scheduleNewInspection() {
  const panel = document.getElementById('scheduleNewPanel');

  if (!panel) {
    alert('Schedule panel was not found.');
    return;
  }

  panel.style.display =
    panel.style.display === 'none' || panel.style.display === ''
      ? 'block'
      : 'none';

  if (panel.style.display === 'block') {
    const dateField = document.getElementById('scheduleDate');

    if (dateField && !dateField.value) {
      dateField.value = new Date().toISOString().slice(0, 10);
    }

    panel.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
}

function saveScheduledNewInspection() {
  if (!canCreateInspection()) {
    alert(
      'Your company access does not allow scheduling new inspections. Please contact your company admin or Fire-S support.'
    );
    return;
  }

  const organisationName =
    document.getElementById('scheduleOrganisationName')?.value.trim() || '';

  const siteName =
    document.getElementById('scheduleSiteName')?.value.trim() || '';

  const scheduledDate =
    document.getElementById('scheduleDate')?.value || '';

  const inspectionType =
    document.getElementById('scheduleInspectionType')?.value.trim() ||
    'General Fire Inspection';

  const occupancy =
    document.getElementById('scheduleOccupancy')?.value.trim() || '';

  const addressLine =
    document.getElementById('scheduleAddress')?.value.trim() || '';

  const contactPerson =
    document.getElementById('scheduleContactPerson')?.value.trim() || '';

  const contactTel =
    document.getElementById('scheduleContactTel')?.value.trim() || '';

  if (!organisationName && !siteName) {
    alert('Enter at least a client / organisation or site / premises name.');
    return;
  }

  if (!scheduledDate) {
    alert('Select a scheduled inspection date.');
    return;
  }

  const accessMetadata = getAccessMetadata();

  const projectName =
    [organisationName, siteName]
      .filter(Boolean)
      .join(' ') ||
    'Scheduled New Inspection';

  const siteId =
    [
      addressLine.toLowerCase(),
      organisationName.toLowerCase(),
      siteName.toLowerCase()
    ]
      .filter(Boolean)
      .join('|') ||
    `scheduled-new-site-${Date.now()}`;

  const newProject = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),

    companyId: accessMetadata.companyId,
    companyName: accessMetadata.companyName,

    createdByUserId: accessMetadata.createdByUserId,
    createdByEmail: accessMetadata.createdByEmail,

    lastEditedByUserId: accessMetadata.createdByUserId,
    lastEditedByEmail: accessMetadata.createdByEmail,

    userRoleAtSave: accessMetadata.userRole,
    companyAccessStatus: accessMetadata.companyAccessStatus,

    siteId,
    inspectionNumber: generateInspectionNumber(),

    projectName,
    organisationName,
    siteName,

    streetNumber: '',
    addressLine,
    projectAddress: addressLine,
    gps: '',

    inMall: 'No',
    mallName: '',
    unitNumber: '',

    contactPerson,
    contactTel,
    contactEmail: '',

    productType: getDefaultProductType(),
    inspectionType,
    inspectorName: '',
    occupancy,

    answers: [],
    photos: [],

    followUpRequired: 'No',
    followUpDate: '',
    followUpNotes: '',

    finalComments: '',

    scheduledDate,
    scheduledStatus: 'scheduled',
    scheduleType: 'new_site',
    scheduleFreshInspection: false,
    scheduledReason: 'New inspection scheduled',

    completedAt: null,
    archiveStatus: '',
    archivedAt: null,

    inspectionHistory: [],

    syncPending: true,
    syncError: false,
    lastSaved: new Date().toISOString()
  };

  const projects = getProjects();
  projects.push(newProject);

  setProjects(projects);
  clearScheduleNewInspectionForm();

  const panel = document.getElementById('scheduleNewPanel');
  if (panel) panel.style.display = 'none';

  currentFilter = 'scheduled-new';
  currentProjectPage = 1;

  renderProjectsList();
  updateDashboardSelection();

  uploadSingleInspection(newProject)
    .catch(error => {
      console.warn('Scheduled new inspection upload failed:', error);
    });

  const saveMessage = document.getElementById('saveMessage');
  if (saveMessage) {
    saveMessage.textContent =
      `New inspection scheduled for ${scheduledDate}.`;
  }
}

function clearScheduleNewInspectionForm() {
  [
    'scheduleOrganisationName',
    'scheduleSiteName',
    'scheduleDate',
    'scheduleOccupancy',
    'scheduleAddress',
    'scheduleContactPerson',
    'scheduleContactTel'
  ].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.value = '';
  });

  const typeField = document.getElementById('scheduleInspectionType');
  if (typeField) typeField.value = 'General Fire Inspection';
}

function cancelScheduleNewInspection() {
  clearScheduleNewInspectionForm();

  const panel = document.getElementById('scheduleNewPanel');
  if (panel) panel.style.display = 'none';
}

function createNewProject() {

  if (!canCreateInspection()) {
    alert(
      'Your company access does not allow new inspections. Please contact your company admin or Fire-S support.'
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

  const existingArchivePanel =
  document.getElementById('inspectionArchivePanel');

if (existingArchivePanel) {
  existingArchivePanel.remove();
}

  populateProductTypes('Fire Safety Compliance');
  updateInspectionTypeOptions();
  clearInputValue('organisationName');
  clearInputValue('siteName');
  getEl('inspectionType').value = 'General Fire Inspection';
  clearInputValue('inspectorName');
  getEl('inspectionDate').value =
  new Date().toISOString().slice(0, 10);
  getEl('occupancySelect').selectedIndex = 0;
  getEl('saveMessage').textContent = '';
  clearInputValue('streetNumber');
  clearInputValue('projectAddress');
  clearInputValue('gps');
  updateGpsMapPreview();
  getEl('inMall').value = 'No';
  clearInputValue('mallName');
  clearInputValue('unitNumber');
  clearInputValue('contactPerson');
  clearInputValue('contactTel');
  clearInputValue('contactEmail');  
  getEl('followUpRequired').value = 'No';
  clearInputValue('followUpDate');
  clearInputValue('followUpNotes');
  clearInputValue('finalComments');
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

function toggleFilterPanel() {
  const filterPanel = document.getElementById('filterPanel');
  const toggleBtn = document.getElementById('toggleFiltersBtn');

  if (!filterPanel || !toggleBtn) return;

  const isHidden =
    filterPanel.style.display === 'none' ||
    filterPanel.style.display === '';

  filterPanel.style.display = isHidden ? 'block' : 'none';
  toggleBtn.textContent = isHidden ? 'Hide Filters' : 'Show Filters';
}

function closeFilterPanel() {
  const filterPanel = document.getElementById('filterPanel');
  const toggleBtn = document.getElementById('toggleFiltersBtn');

  if (!filterPanel || !toggleBtn) return;

  filterPanel.style.display = 'none';
  toggleBtn.textContent = 'Show Filters';
}

function updateOfflineReadinessBanner() {
  const banner = document.getElementById('offlineReadinessBanner');

  if (!banner) return;

  const projects =
    getVisibleProjectsForCurrentUser(getProjects());

  const isOnline =
    navigator.onLine;

  const hasLocalInspections =
    projects.length > 0;

  const offlineCapable =
    'serviceWorker' in navigator;

  const pendingUploads =
    projects.filter(project => project.syncPending).length;

  const lastSavedTimes = projects
    .map(project =>
      project.syncedAt ||
      project.lastSaved ||
      project.updatedAt ||
      ''
    )
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(time => !Number.isNaN(time));

  const lastSavedText =
    lastSavedTimes.length > 0
      ? new Date(Math.max(...lastSavedTimes)).toLocaleString()
      : 'Not available';

  const readyForField =
    offlineCapable &&
    hasLocalInspections &&
    pendingUploads === 0;

  const partiallyReady =
    offlineCapable &&
    hasLocalInspections &&
    pendingUploads > 0;

  banner.className =
    `offline-readiness-banner ${
      readyForField
        ? 'offline-ready'
        : partiallyReady
          ? 'offline-warning'
          : 'offline-not-ready'
    }`;

  banner.innerHTML = `
    <div>
      <strong>
        ${
          readyForField
            ? 'Field Ready'
            : partiallyReady
              ? 'Almost Field Ready'
              : 'Not Field Ready'
        }
      </strong>

      <span>
        ${isOnline ? 'Online now' : 'Offline now'} |
        Local inspections: ${projects.length} |
        Pending uploads: ${pendingUploads} |
        Last save/sync: ${escapeHtml(lastSavedText)}
      </span>
    </div>

    <small>
      ${
        readyForField
          ? 'Ready for site use. Inspections are available locally and no pending uploads are waiting.'
          : partiallyReady
            ? 'Inspections are available locally, but some changes still need cloud upload. Open online and tap Sync / Refresh before going to site.'
            : 'Before site work: login online, open inspections list, tap Sync / Refresh, and confirm this banner changes to Field Ready.'
      }
    </small>
  `;
}

function updateSiteReadyPreflightChecklist() {
  const panel =
    document.getElementById('siteReadyPreflightChecklist');

  if (!panel) return;

  const projects =
    getVisibleProjectsForCurrentUser(getProjects());

  const isOnline =
    navigator.onLine;

  const hasLocalInspections =
    projects.length > 0;

  const offlineCapable =
    'serviceWorker' in navigator;

  const pendingUploads =
    projects.filter(project => project.syncPending).length;

  const hasLoggedInProfile =
    !!currentUserProfile;

  const lastSavedTimes = projects
    .map(project =>
      project.syncedAt ||
      project.lastSaved ||
      project.updatedAt ||
      ''
    )
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(time => !Number.isNaN(time));

  const lastSavedText =
    lastSavedTimes.length > 0
      ? new Date(Math.max(...lastSavedTimes)).toLocaleString()
      : 'Not available';

  const checks = [
    {
      label: 'User access checked',
      pass: hasLoggedInProfile,
      detail: hasLoggedInProfile
        ? `Logged in as ${currentUserProfile.email || currentUserProfile.fullName || 'user'}`
        : 'Login online before going to site.'
    },
    {
      label: 'Inspections loaded locally',
      pass: hasLocalInspections,
      detail: hasLocalInspections
        ? `${projects.length} inspection${projects.length === 1 ? '' : 's'} available on this device.`
        : 'Open/sync the inspection list before going offline.'
    },
    {
      label: 'Offline capability available',
      pass: offlineCapable,
      detail: offlineCapable
        ? 'Browser supports offline app cache.'
        : 'This browser may not support offline use.'
    },
    {
      label: 'Pending uploads checked',
      pass: pendingUploads === 0,
      detail: pendingUploads === 0
        ? 'No pending uploads.'
        : `${pendingUploads} inspection${pendingUploads === 1 ? '' : 's'} still waiting to upload.`
    },
    {
      label: 'Last save / sync visible',
      pass: lastSavedTimes.length > 0,
      detail: `Last save/sync: ${lastSavedText}`
    },
    {
      label: 'Connection status known',
      pass: true,
      detail: isOnline
        ? 'Online now.'
        : 'Offline now. Confirm required inspections are already loaded.'
    }
  ];

  const allCriticalPassed =
    hasLoggedInProfile &&
    hasLocalInspections &&
    offlineCapable &&
    pendingUploads === 0;

  panel.className =
    `site-ready-preflight ${
      allCriticalPassed
        ? 'site-ready-pass'
        : 'site-ready-warning'
    } ${siteReadyPreflightOpen ? 'site-ready-open' : 'site-ready-collapsed'}`;

  panel.innerHTML = `
    <div class="site-ready-header">
      <div>
        <strong>Ready for Site?</strong>
        <span>
          ${
            allCriticalPassed
              ? 'Preflight passed'
              : 'Preflight needs attention'
          }
          ${
            pendingUploads > 0
              ? ` | ${pendingUploads} pending upload${pendingUploads === 1 ? '' : 's'}`
              : ''
          }
        </span>
      </div>

      <button
        type="button"
        onclick="toggleSiteReadyPreflight()"
      >
        ${siteReadyPreflightOpen ? 'Hide' : 'Open'}
      </button>
    </div>

    ${
      siteReadyPreflightOpen
        ? `
          <div class="site-ready-checks">
            ${checks.map(check => `
              <div class="site-ready-check ${check.pass ? 'check-pass' : 'check-warning'}">
                <strong>
                  ${check.pass ? '✓' : '!'} ${escapeHtml(check.label)}
                </strong>
                <span>${escapeHtml(check.detail)}</span>
              </div>
            `).join('')}

            <button
              type="button"
              class="site-ready-recheck-btn"
              onclick="runSiteReadyPreflight()"
            >
              Recheck
            </button>
          </div>
        `
        : ''
    }
  `;
}

function toggleSiteReadyPreflight() {
  siteReadyPreflightOpen = !siteReadyPreflightOpen;
  updateSiteReadyPreflightChecklist();
}

function runSiteReadyPreflight() {
  updateOfflineReadinessBanner();
  updateSiteReadyPreflightChecklist();
}

function getPendingUploadCount() {
  return getVisibleProjectsForCurrentUser(getProjects())
    .filter(project => project.syncPending).length;
}

function updatePostSiteSyncReminder() {
  const reminder =
    document.getElementById('postSiteSyncReminder');

  if (!reminder) return;

  const pendingUploads =
    getPendingUploadCount();

  if (pendingUploads === 0) {
    reminder.innerHTML = '';
    reminder.className = '';
    return;
  }

  reminder.className = 'post-site-sync-reminder';

  reminder.innerHTML = `
    <div>
      <strong>Post-site sync reminder</strong>
      <span>
        ${pendingUploads} inspection${pendingUploads === 1 ? '' : 's'}
        still waiting to upload. Sync before closing the app.
      </span>
    </div>

    <div class="post-site-sync-actions">
      <button
        type="button"
        onclick="refreshSyncData()"
      >
        Sync / Refresh
      </button>

      <button
        type="button"
        onclick="dismissPostSiteSyncReminder()"
      >
        Dismiss
      </button>
    </div>
  `;
}

function dismissPostSiteSyncReminder() {
  const reminder =
    document.getElementById('postSiteSyncReminder');

  if (!reminder) return;

  reminder.innerHTML = '';
  reminder.className = '';
}

function updateFloatingBackButton() {
  const button =
    document.getElementById('floatingBackToProjectsBtn');

  if (!button) return;

  const projectFormSection =
    document.getElementById('projectFormSection');

  const isInProjectForm =
    projectFormSection &&
    projectFormSection.style.display !== 'none';

  button.style.display =
    isInProjectForm ? 'block' : 'none';
}

function showProjectList() {
   if (!currentUserProfile) {
  showHome();

  const syncStatus = document.getElementById('syncStatus');

  if (syncStatus) {
    syncStatus.textContent =
      'Please login or register from the home page to view inspections.';
  }

  const homeLoginRouteBtn = document.getElementById('homeLoginRouteBtn');

  if (homeLoginRouteBtn) {
    homeLoginRouteBtn.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    homeLoginRouteBtn.focus();
  }

  return;
}

  setCloudMenuVisible(false);

  const reportSection = document.getElementById('reportSection');
  if (reportSection) {
    reportSection.style.display = 'none';
  }

  const homeSection = document.getElementById('homeSection');
  const servicesSection = document.getElementById('servicesSection');

  if (homeSection) homeSection.style.display = 'none';
  if (servicesSection) servicesSection.style.display = 'none';
  getEl('projectListSection').style.display = 'block';
  getEl('projectFormSection').style.display = 'none';
  renderProjectsList();
  updateFloatingBackButton();
}

const INSPECTION_SECTION_FLOW = [
  {
    id: 'inspectionQuickActions',
    label: 'Quick Actions'
  },
  {
    id: 'projectDetailsCard',
    label: 'Inspection Information'
  },
  {
    id: 'requirementsSection',
    label: 'Occupancy Requirements'
  },
  {
    id: 'checklistCard',
    label: 'Q&A Checklist'
  },
  {
    id: 'photoEvidenceCard',
    label: 'Photo Evidence'
  },
  {
    id: 'inspectorCommentsCard',
    label: 'Inspector Comments'
  },
  {
    id: 'nextInspectionCard',
    label: 'Schedule Next Inspection'
  }
];

let activeInspectionSectionId = null;

function updateInspectionCommandHeader() {
  const companyEl = document.getElementById('inspectionCommandCompany');
  const siteEl = document.getElementById('inspectionCommandSite');

  if (!companyEl || !siteEl) return;

  const projects = getProjects();
  const project = projects.find(p => p.id === currentProjectId);

  const companyName =
    project?.companyName ||
    project?.organisationName ||
    currentUserProfile?.companyName ||
    'Company';

  const siteName =
    project?.siteName ||
    project?.projectName ||
    'Site';

  companyEl.textContent = companyName;
  siteEl.textContent = siteName;
}

function toggleInspectionCommandMenu() {
  const menu = document.getElementById('inspectionCommandMenu');
  const button = document.getElementById('inspectionMenuToggleBtn');

  if (!menu) return;

  const willOpen =
    menu.style.display === 'none' ||
    menu.style.display === '';

  menu.style.display = willOpen ? 'grid' : 'none';

  if (button) {
    button.textContent = willOpen ? 'Close Menu' : 'Menu';
  }

  updateInspectionCommandHeader();
}

function closeInspectionCommandMenu() {
  const menu = document.getElementById('inspectionCommandMenu');
  const button = document.getElementById('inspectionMenuToggleBtn');

  if (menu) {
    menu.style.display = 'none';
  }

  if (button) {
    button.textContent = 'Menu';
  }
}

function openInspectionCommandSection(sectionId) {
  const target = document.getElementById(sectionId);

  if (!target) {
    alert('This inspection section is not available yet.');
    return;
  }

  closeInspectionCommandMenu();
  focusInspectionSection(sectionId);
}

function getInspectionSectionIndex(sectionId) {
  return INSPECTION_SECTION_FLOW.findIndex(section => section.id === sectionId);
}

function removeInspectionSectionFocus() {
  document
    .querySelectorAll('.inspection-section-focused')
    .forEach(section => {
      section.classList.remove('inspection-section-focused');
    });

  document
    .querySelectorAll('.inspection-section-focus-toolbar')
    .forEach(toolbar => {
      toolbar.remove();
    });

  activeInspectionSectionId = null;
}

function focusInspectionSection(sectionId) {
  const target = document.getElementById(sectionId);

  if (!target) return;

  removeInspectionSectionFocus();

  activeInspectionSectionId = sectionId;
  target.classList.add('inspection-section-focused');

  const sectionIndex = getInspectionSectionIndex(sectionId);
  const sectionMeta = INSPECTION_SECTION_FLOW[sectionIndex];

  const toolbar = document.createElement('div');
  toolbar.className = 'inspection-section-focus-toolbar';

  toolbar.innerHTML = `
    <div class="inspection-section-focus-title">
      ${escapeHtml(sectionMeta?.label || 'Inspection Section')}
    </div>

    <div class="inspection-section-focus-actions">
      <button
        type="button"
        onclick="goToPreviousInspectionSection()"
        ${sectionIndex <= 0 ? 'disabled' : ''}
      >
        Previous
      </button>

      <button
        type="button"
        onclick="goToNextInspectionSection()"
        ${sectionIndex >= INSPECTION_SECTION_FLOW.length - 1 ? 'disabled' : ''}
      >
        Next
      </button>

      <button
        type="button"
        onclick="closeInspectionSectionFocus()"
      >
        Close
      </button>
    </div>
  `;

  target.prepend(toolbar);

  setTimeout(() => {
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }, 40);
}

function goToPreviousInspectionSection() {
  if (!activeInspectionSectionId) return;

  const currentIndex = getInspectionSectionIndex(activeInspectionSectionId);

  if (currentIndex <= 0) return;

  focusInspectionSection(
    INSPECTION_SECTION_FLOW[currentIndex - 1].id
  );
}

function goToNextInspectionSection() {
  if (!activeInspectionSectionId) return;

  const currentIndex = getInspectionSectionIndex(activeInspectionSectionId);

  if (
    currentIndex === -1 ||
    currentIndex >= INSPECTION_SECTION_FLOW.length - 1
  ) {
    return;
  }

  focusInspectionSection(
    INSPECTION_SECTION_FLOW[currentIndex + 1].id
  );
}

function closeInspectionSectionFocus() {
  removeInspectionSectionFocus();
}

function showProjectForm() {
  setCloudMenuVisible(false);

  updateInspectionCommandHeader();

  const homeSection = document.getElementById('homeSection');
  const servicesSection = document.getElementById('servicesSection');

  if (homeSection) homeSection.style.display = 'none';
  if (servicesSection) servicesSection.style.display = 'none';

  getEl('projectListSection').style.display = 'none';
  getEl('projectFormSection').style.display = 'block';

  ensureInspectionQuickActions();
  updateProjectReadinessPanel();
  updateFloatingBackButton();
}

function ensureInspectionQuickActions() {
  const formSection = document.getElementById('projectFormSection');

  if (!formSection) return;

  let panel = document.getElementById('inspectionQuickActions');

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'inspectionQuickActions';
    panel.className = 'inspection-quick-actions';

    formSection.prepend(panel);
  }

  panel.innerHTML = `
    <div class="quick-actions-title">
      Quick Links / Action Items
    </div>

    <div id="quickReadinessSummary" class="quick-readiness-summary">
      Loading quick links...
    </div>
  `;

  updateProjectReadinessPanel();
}
function closeCloudDropdown() {
  const cloudDropdown = document.getElementById('cloudDropdown');

  if (cloudDropdown) {
    cloudDropdown.style.display = 'none';
  }
}

function setCloudMenuVisible(isVisible) {
  const cloudMenuBtn = document.getElementById('cloudMenuBtn');

  if (cloudMenuBtn) {
    cloudMenuBtn.style.display = isVisible ? 'inline-block' : 'none';
  }

  if (!isVisible) {
    closeCloudDropdown();
  }
}

function updateHomeAccessCards() {
  const homeLoginRouteBtn = document.getElementById('homeLoginRouteBtn');
  const homeLogoutBtn = document.getElementById('homeLogoutBtn');
  const cloudMenuBtn = document.getElementById('cloudMenuBtn');

  const isLoggedIn = !!currentUserProfile;

  if (homeLoginRouteBtn) {
    homeLoginRouteBtn.style.display = isLoggedIn ? 'none' : 'inline-block';
  }

  if (homeLogoutBtn) {
    homeLogoutBtn.style.display = isLoggedIn ? 'inline-block' : 'none';
  }

  if (cloudMenuBtn) {
    cloudMenuBtn.style.display = 'inline-block';
  }
}
function showHome() {
  const homeSection = document.getElementById('homeSection');
  const servicesSection = document.getElementById('servicesSection');

  setCloudMenuVisible(true);
  updateHomeAccessCards();

  if (homeSection) homeSection.style.display = 'block';
  if (servicesSection) servicesSection.style.display = 'none';

  getEl('projectListSection').style.display = 'none';
  getEl('projectFormSection').style.display = 'none';
  updateFloatingBackButton();
}

function showServices() {
  setCloudMenuVisible(false);
  const homeSection = document.getElementById('homeSection');
  const servicesSection = document.getElementById('servicesSection');

  if (homeSection) homeSection.style.display = 'none';
  if (servicesSection) servicesSection.style.display = 'block';

  getEl('projectListSection').style.display = 'none';
  getEl('projectFormSection').style.display = 'none';

  const viewServiceRequestsBtn =
  document.getElementById('viewServiceRequestsBtn');

const viewBetaFeedbackBtn =
  document.getElementById('viewBetaFeedbackBtn');

const serviceRequestsList =
  document.getElementById('serviceRequestsList');

const betaFeedbackList =
  document.getElementById('betaFeedbackList');

const canViewAdminSupport =
  canViewServiceRequests();

if (viewServiceRequestsBtn) {
  viewServiceRequestsBtn.style.display =
    canViewAdminSupport ? 'block' : 'none';
}

if (viewBetaFeedbackBtn) {
  viewBetaFeedbackBtn.style.display =
    canViewAdminSupport ? 'block' : 'none';
}

if (serviceRequestsList && !canViewAdminSupport) {
  serviceRequestsList.style.display = 'none';
}

if (betaFeedbackList && !canViewAdminSupport) {
  betaFeedbackList.style.display = 'none';
}
  updateFloatingBackButton();
}

function openLoginRoute() {
  if (currentUserProfile) {
    closeCloudDropdown();
    updateHomeAccessCards();

    const syncStatus = document.getElementById('syncStatus');

    if (syncStatus) {
      syncStatus.textContent = 'You are already logged in.';
    }

    return;
  }

  const cloudDropdown = document.getElementById('cloudDropdown');
  const loginToolsPanel = document.getElementById('loginToolsPanel');
  const loginEmail = document.getElementById('loginEmail');

  if (cloudDropdown) {
    cloudDropdown.style.display = 'block';
  }

  if (loginToolsPanel) {
    loginToolsPanel.style.display = 'block';
  }

  if (loginEmail) {
    loginEmail.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    loginEmail.focus();
  }
}

function requestAdditionalService(serviceName) {
  const form = document.getElementById('serviceRequestForm');
  const selectedService = document.getElementById('selectedService');
  const status = document.getElementById('serviceRequestStatus');

  if (!form || !selectedService) return;

  selectedService.value = serviceName || '';

  if (status) {
    status.textContent = '';
  }

  form.style.display = 'block';

  form.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function cancelServiceRequest() {
  const form = document.getElementById('serviceRequestForm');
  const status = document.getElementById('serviceRequestStatus');

  if (form) {
    form.style.display = 'none';
  }

  if (status) {
    status.textContent = '';
  }
}

async function submitServiceRequest() {
  const selectedService = document.getElementById('selectedService')?.value.trim();
  const clientName = document.getElementById('serviceClientName')?.value.trim();
  const clientPhone = document.getElementById('serviceClientPhone')?.value.trim();
  const clientEmail = document.getElementById('serviceClientEmail')?.value.trim();
  const message = document.getElementById('serviceMessage')?.value.trim();
  const status = document.getElementById('serviceRequestStatus');

  if (!selectedService) {
    if (status) status.textContent = 'Select a service first.';
    return;
  }

  if (!clientName || (!clientPhone && !clientEmail)) {
    if (status) {
      status.textContent =
        'Enter your name/company and at least a phone number or email.';
    }
    return;
  }

  if (status) {
    status.textContent = 'Saving service request...';
  }

  let authUser = null;

  try {
    const { data } = await supabaseClient.auth.getUser();
    authUser = data?.user || null;
  } catch (error) {
    console.warn('Could not read logged-in user for service request:', error);
  }

  const requestPayload = {
    selected_service: selectedService,
    client_name: clientName,
    client_phone: clientPhone || null,
    client_email: clientEmail || null,
    message: message || null,
    status: 'new',
    created_by_user_id: authUser?.id || null,
    created_by_email: authUser?.email || clientEmail || null
  };

  const { error } = await supabaseClient
    .from('service_requests')
    .insert(requestPayload);

  if (error) {
    console.error('Service request cloud save failed:', error);

    if (status) {
      status.textContent =
        `Service request could not be saved: ${error.message}`;
    }

    return;
  }

  if (status) {
    status.textContent =
      'Service request saved. Fire-S can follow up from this request.';
  }

  document.getElementById('serviceClientName').value = '';
  document.getElementById('serviceClientPhone').value = '';
  document.getElementById('serviceClientEmail').value = '';
  document.getElementById('serviceMessage').value = '';

  const serviceRequestsList =
    document.getElementById('serviceRequestsList');

  if (serviceRequestsList && serviceRequestsList.style.display !== 'none') {
    serviceRequestsList.style.display = 'none';
    renderServiceRequestsList();
  }
}

function getBrowserDeviceHint() {
  const userAgent =
    navigator.userAgent || '';

  const isMobile =
    /Android|iPhone|iPad|iPod/i.test(userAgent);

  const browser =
    userAgent.includes('Edg')
      ? 'Edge'
      : userAgent.includes('Chrome')
        ? 'Chrome'
        : userAgent.includes('Safari')
          ? 'Safari'
          : userAgent.includes('Firefox')
            ? 'Firefox'
            : 'Browser';

  return `${isMobile ? 'Mobile' : 'Desktop'} / ${browser}`;
}

function getCurrentInspectionNumberForFeedback() {
  if (!currentProjectId) {
    return '';
  }

  const project =
    getProjects().find(p => p.id === currentProjectId);

  return project?.inspectionNumber || '';
}

function openBetaFeedbackForm() {
  const form = document.getElementById('betaFeedbackForm');
  const status = document.getElementById('betaFeedbackStatus');

  if (!form) return;

  if (status) {
    status.textContent = '';
  }

  const inspectionField =
  document.getElementById('betaInspectionNumber');

if (inspectionField) {
  inspectionField.value =
    getCurrentInspectionNumberForFeedback();
}

const deviceField =
  document.getElementById('betaDevice');

if (deviceField && !deviceField.value.trim()) {
  deviceField.value =
    getBrowserDeviceHint();
}

const browserField =
  document.getElementById('betaBrowser');

if (browserField && !browserField.value.trim()) {
  browserField.value =
    navigator.userAgent || 'Not available';
}

const onlineStatus =
  document.getElementById('betaOnlineStatus');

if (onlineStatus) {
  onlineStatus.value =
    navigator.onLine ? 'Online' : 'Offline';
}

  form.style.display = 'block';

  form.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function cancelBetaFeedback() {
  const form = document.getElementById('betaFeedbackForm');
  const status = document.getElementById('betaFeedbackStatus');

  if (form) {
    form.style.display = 'none';
  }

  if (status) {
    status.textContent = '';
  }
}

function clearBetaFeedbackForm() {
  const ids = [
    'betaDevice',
    'betaBrowser',
    'betaInspectionNumber',
    'betaWhatHappened',
    'betaExpectedResult'
  ];

  ids.forEach(id => {
    const field = document.getElementById(id);

    if (field) {
      field.value = '';
    }
  });

  const issueType = document.getElementById('betaIssueType');

  if (issueType) {
    issueType.value = 'Bug';
  }

  const priority = document.getElementById('betaPriority');

  if (priority) {
    priority.value = 'Medium';
  }

  const onlineStatus = document.getElementById('betaOnlineStatus');

  if (onlineStatus) {
    onlineStatus.value = navigator.onLine ? 'Online' : 'Offline';
  }
}

async function submitBetaFeedback() {
  const status = document.getElementById('betaFeedbackStatus');

  const issueType =
    document.getElementById('betaIssueType')?.value || '';

  const priority =
    document.getElementById('betaPriority')?.value || '';

  const device =
    document.getElementById('betaDevice')?.value.trim() || '';

  const browser =
    document.getElementById('betaBrowser')?.value.trim() || '';

  const onlineStatus =
    document.getElementById('betaOnlineStatus')?.value || '';

  const inspectionNumber =
    document.getElementById('betaInspectionNumber')?.value.trim() || '';

  const whatHappened =
    document.getElementById('betaWhatHappened')?.value.trim() || '';

  const expectedResult =
    document.getElementById('betaExpectedResult')?.value.trim() || '';

  if (!whatHappened) {
    if (status) {
      status.textContent = 'Please describe what happened.';
    }

    return;
  }

  if (status) {
    status.textContent = 'Submitting feedback...';
  }

  try {
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError || !userData?.user) {
      if (status) {
        status.textContent = 'Please login before submitting beta feedback.';
      }

      return;
    }

    const payload = {
      app_version: APP_VERSION,
      issue_type: issueType,
      priority,
      device,
      browser,
      online_status: onlineStatus,
      inspection_number: inspectionNumber,
      what_happened: whatHappened,
      expected_result: expectedResult,
      reported_by_user_id: userData.user.id,
      reported_by_email: userData.user.email,
      status: 'new'
    };

    const { error } = await supabaseClient
      .from('beta_feedback')
      .insert(payload);

    if (error) {
      console.error('Beta feedback submit failed:', error);

      if (status) {
        status.textContent =
          `Feedback could not be submitted: ${error.message}`;
      }

      return;
    }

    if (status) {
      status.textContent = 'Feedback submitted. Thank you.';
    }

    clearBetaFeedbackForm();

  } catch (error) {
    console.error('Beta feedback crashed:', error);

    if (status) {
      status.textContent =
        `Feedback submit failed: ${error.message}`;
    }
  }
}

async function renderServiceRequestsList() {
  if (!canViewServiceRequests()) {
    alert('Service requests are only available to Fire-S admin.');
    return;
  }

  const list = document.getElementById('serviceRequestsList');

  if (!list) return;

  if (list.style.display === 'block') {
    list.style.display = 'none';
    return;
  }

  list.style.display = 'block';
  list.innerHTML =
    '<div class="empty-state">Loading service requests...</div>';

  const { data, error } = await supabaseClient
    .from('service_requests')
    .select(`
      id,
      selected_service,
      client_name,
      client_phone,
      client_email,
      message,
      status,
      created_at,
      followed_up_at,
      created_by_email
    `)
    .neq('status', 'followed_up')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Service requests load failed:', error);

    list.innerHTML =
      `<div class="empty-state">Could not load service requests: ${escapeHtml(error.message)}</div>`;

    return;
  }

  const activeRequests = data || [];

  if (activeRequests.length === 0) {
    list.innerHTML =
      '<div class="empty-state">No active service requests.</div>';
    return;
  }

  const normalizedRequests = activeRequests.map(request => ({
    id: request.id,
    selectedService: request.selected_service,
    clientName: request.client_name,
    clientPhone: request.client_phone,
    clientEmail: request.client_email,
    message: request.message,
    status: request.status,
    createdAt: request.created_at,
    followedUpAt: request.followed_up_at,
    createdByEmail: request.created_by_email
  }));

  window.currentServiceRequestsView = normalizedRequests;

  list.innerHTML = `
    <div id="serviceRequestListView" class="service-request-list">
      ${normalizedRequests.map((request, index) => `
        <button
          type="button"
          class="service-request-list-item"
          onclick="openServiceRequestCard(${index})"
        >
          <span class="service-request-list-category">
            ${escapeHtml(request.selectedService || 'Service Request')}
          </span>

          <span class="service-request-list-main">
            ${escapeHtml(request.clientName || 'Unknown client')}
          </span>

          <span class="service-request-list-date">
            ${
              request.createdAt
                ? escapeHtml(new Date(request.createdAt).toLocaleString())
                : '-'
            }
          </span>
        </button>
      `).join('')}
    </div>

    <div
      id="serviceRequestDetailCard"
      class="service-request-detail-card"
      style="display:none;"
    ></div>
  `;
}

async function renderBetaFeedbackList() {
  if (!canViewServiceRequests()) {
    alert('Beta feedback is only available to Fire-S admin.');
    return;
  }

  const list = document.getElementById('betaFeedbackList');
  const serviceRequestsList = document.getElementById('serviceRequestsList');

  if (!list) return;

  if (serviceRequestsList) {
    serviceRequestsList.style.display = 'none';
  }

  if (list.style.display === 'block') {
    list.style.display = 'none';
    return;
  }

  list.style.display = 'block';
  list.innerHTML =
    '<div class="empty-state">Loading beta feedback...</div>';

  const { data, error } = await supabaseClient
    .from('beta_feedback')
    .select(`
      id,
      created_at,
      app_version,
      issue_type,
      priority,
      device,
      browser,
      online_status,
      inspection_number,
      what_happened,
      expected_result,
      reported_by_email,
      status,
      followup_note
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Beta feedback load failed:', error);

    list.innerHTML =
      `<div class="empty-state">Could not load beta feedback: ${escapeHtml(error.message)}</div>`;

    return;
  }

  const feedbackItems = data || [];

  if (feedbackItems.length === 0) {
    list.innerHTML =
      '<div class="empty-state">No beta feedback submitted yet.</div>';
    return;
  }

  list.innerHTML = `
    <div class="beta-feedback-list">
      ${feedbackItems.map(item => `
        <div class="beta-feedback-item beta-feedback-${escapeHtml(String(item.priority || 'Medium').toLowerCase())}">
          <div class="beta-feedback-top">
            <strong>
              ${escapeHtml(item.issue_type || 'Feedback')}
            </strong>

            <span class="beta-feedback-priority">
              ${escapeHtml(item.priority || 'Medium')}
            </span>
          </div>

          <div class="beta-feedback-meta">
            <span>${escapeHtml(item.status || 'new')}</span>
            <span>${item.created_at ? escapeHtml(new Date(item.created_at).toLocaleString()) : '-'}</span>
            <span>${escapeHtml(item.app_version || '-')}</span>
          </div>

          <div class="beta-feedback-line">
            <strong>Inspection:</strong>
            ${escapeHtml(item.inspection_number || '-')}
          </div>

          <div class="beta-feedback-line">
            <strong>Device:</strong>
            ${escapeHtml(item.device || '-')}
            |
            <strong>Browser:</strong>
            ${escapeHtml(item.browser || '-')}
            |
            <strong>Status:</strong>
            ${escapeHtml(item.online_status || '-')}
          </div>

          <div class="beta-feedback-message">
            <strong>What happened:</strong>
            <span>${escapeHtml(item.what_happened || '-')}</span>
          </div>

          <div class="beta-feedback-message">
            <strong>Expected:</strong>
            <span>${escapeHtml(item.expected_result || '-')}</span>
          </div>

          <div class="beta-feedback-line">
            <strong>Reported by:</strong>
            ${escapeHtml(item.reported_by_email || '-')}
          </div>

          ${
            item.followup_note
              ? `
                <div class="beta-feedback-followup">
                  <strong>Follow-up:</strong>
                  ${escapeHtml(item.followup_note)}
                </div>
              `
              : ''
          }

          <div class="beta-feedback-admin-actions">
            <label>
              Status
              <select id="betaFeedbackStatus_${escapeHtml(item.id)}">
                <option value="new" ${item.status === 'new' ? 'selected' : ''}>New</option>
                <option value="reviewed" ${item.status === 'reviewed' ? 'selected' : ''}>Reviewed</option>
                <option value="closed" ${item.status === 'closed' ? 'selected' : ''}>Closed</option>
              </select>
            </label>

            <label>
              Follow-up note
              <textarea
                id="betaFeedbackNote_${escapeHtml(item.id)}"
                placeholder="Example: Fixed in v90-beta-feedback3, need screenshot, could not reproduce..."
              >${escapeHtml(item.followup_note || '')}</textarea>
            </label>

            <button
              type="button"
              onclick="updateBetaFeedbackStatus('${escapeHtml(item.id)}')"
            >
              Save Feedback Update
            </button>
          </div>

        </div>
      `).join('')}
    </div>
  `;
}

async function updateBetaFeedbackStatus(feedbackId) {
  if (!canViewServiceRequests()) {
    alert('Only Fire-S admin can update beta feedback.');
    return;
  }

  const statusField =
    document.getElementById(`betaFeedbackStatus_${feedbackId}`);

  const noteField =
    document.getElementById(`betaFeedbackNote_${feedbackId}`);

  const status = statusField ? statusField.value : 'new';
  const followupNote = noteField ? noteField.value.trim() : '';

  console.log('Updating beta feedback:', {
    feedbackId,
    status,
    followupNote
  });

  try {
    const { data, error } = await supabaseClient
      .from('beta_feedback')
      .update({
        status: status,
        followup_note: followupNote
      })
      .eq('id', feedbackId)
      .select('id, status, followup_note')
      .maybeSingle();

    if (error) {
      console.error('Beta feedback update failed:', error);
      alert(`Could not update feedback: ${error.message}`);
      return;
    }

    if (!data) {
      alert(
        'Feedback was not updated. Supabase allowed the request but no row was changed. Check RLS update policy.'
      );
      return;
    }

    console.log('Beta feedback updated:', data);

    alert('Beta feedback updated.');

    const list = document.getElementById('betaFeedbackList');

    if (list) {
      list.style.display = 'none';
    }

    renderBetaFeedbackList();

  } catch (error) {
    console.error('Beta feedback update crashed:', error);
    alert(`Feedback update failed: ${error.message}`);
  }
}

function openServiceRequestCard(index) {
  const requests = window.currentServiceRequestsView || [];
  const request = requests[index];

  const listView = document.getElementById('serviceRequestListView');
  const detailCard = document.getElementById('serviceRequestDetailCard');

  if (!request || !detailCard) return;

  if (listView) {
    listView.style.display = 'none';
  }

  detailCard.style.display = 'block';

  detailCard.innerHTML = `
    <div class="service-request-detail-actions">
      <button
        type="button"
        class="secondary-btn service-request-back-btn"
        onclick="backToServiceRequestList()"
      >
        Back to Request List
      </button>

      <button
        type="button"
        class="secondary-btn service-request-close-btn"
        onclick="backToServiceRequestList()"
      >
        Close
      </button>
    </div>

    <div class="service-request-card">
      <div class="service-request-category">
        ${escapeHtml(request.selectedService || 'Service Request')}
      </div>

      <div class="service-request-title">
        ${escapeHtml(request.clientName || 'Unknown client')}
      </div>

      <div class="service-request-detail-row">
        <strong>Category:</strong>
        <span>${escapeHtml(request.selectedService || '-')}</span>
      </div>

      <div class="service-request-detail-row">
        <strong>Name / Company:</strong>
        <span>${escapeHtml(request.clientName || '-')}</span>
      </div>

      <div class="service-request-detail-row">
        <strong>Phone:</strong>
        <span>${escapeHtml(request.clientPhone || '-')}</span>
      </div>

      <div class="service-request-detail-row">
        <strong>Email:</strong>
        <span>${escapeHtml(request.clientEmail || '-')}</span>
      </div>

      <div class="service-request-message">
        <strong>Message:</strong>
        <span>${escapeHtml(request.message || '-')}</span>
      </div>

      <div class="note">
        Saved:
        ${request.createdAt ? escapeHtml(new Date(request.createdAt).toLocaleString()) : '-'}
      </div>

      <div class="service-followup-box">
      <label for="serviceFollowupNote">
        Follow-up Note
      </label>

      <textarea
        id="serviceFollowupNote"
        class="service-followup-note"
        placeholder="Example: Client called, quote requested, technician to arrange visit..."
      ></textarea>
    </div>

      <button
        type="button"
        class="service-request-followed-btn"
        onclick="markServiceRequestFollowedUp('${escapeHtml(request.id)}')"
      >
        Mark as Followed Up
      </button>
    </div>
    </div>
  `;

  detailCard.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function backToServiceRequestList() {
  const listView = document.getElementById('serviceRequestListView');
  const detailCard = document.getElementById('serviceRequestDetailCard');

  if (detailCard) {
    detailCard.style.display = 'none';
    detailCard.innerHTML = '';
  }

  if (listView) {
    listView.style.display = 'grid';

    listView.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
}

async function markServiceRequestFollowedUp(requestId) {
  const noteField = document.getElementById('serviceFollowupNote');
  const followupNote = noteField ? noteField.value.trim() : '';

  const confirmed = confirm(
    followupNote
      ? 'Mark this service request as followed up?'
      : 'No follow-up note added. Mark this service request as followed up anyway?'
  );

  if (!confirmed) return;

  const updatePayload = {
    status: 'followed_up',
    followed_up_at: new Date().toISOString()
  };

  if (followupNote) {
    updatePayload.followup_note = followupNote;
  }

  const { error } = await supabaseClient
    .from('service_requests')
    .update(updatePayload)
    .eq('id', requestId);

  if (error) {
    console.error('Follow-up update failed:', error);
    alert(`Could not update service request: ${error.message}`);
    return;
  }

  const list = document.getElementById('serviceRequestsList');

  if (list) {
    list.style.display = 'none';
  }

  renderServiceRequestsList();
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

function getActiveScheduledDate(project) {
  if (!project) return '';

  // A completed inspection may still have a newly selected future follow-up.
  // Do not hide follow-up dates just because completedAt exists.
  if (
    project.followUpRequired === 'Yes' &&
    project.followUpDate
  ) {
    return project.followUpDate;
  }

  if (
    project.scheduledStatus === 'scheduled' &&
    project.scheduledDate &&
    !project.completedAt
  ) {
    return project.scheduledDate;
  }

  if (
    project.scheduleFreshInspection === true &&
    project.scheduledDate &&
    !project.completedAt
  ) {
    return project.scheduledDate;
  }

  return '';
}

function getActiveScheduleLabel(project) {
  const activeScheduledDate = getActiveScheduledDate(project);

  if (!activeScheduledDate) {
    return '';
  }

  if (project.scheduleType === 'new_site') {
    return `Scheduled new inspection: ${activeScheduledDate}`;
  }

  if (
    project.scheduledReason === 'follow_up' ||
    project.followUpRequired === 'Yes'
  ) {
    return `Scheduled follow-up: ${activeScheduledDate}`;
  }

  if (project.scheduleFreshInspection === true) {
    return `Next inspection: ${activeScheduledDate}`;
  }

  return `Scheduled inspection: ${activeScheduledDate}`;
}

function getProjectInspectionStatus(project) {
  if (
  project.scheduledStatus === 'scheduled' &&
  project.scheduleType === 'new_site' &&
  !project.completedAt
) {
  return {
    label: 'Scheduled',
    class: 'inspection-scheduled',
    filter: 'scheduled-new',
    detail: project.scheduledDate || 'Future inspection'
  };
}

  if (isCompletedAllClearInspection(project)) {
    const completion = getProjectCompletionCounts(project);

    return {
      label: 'Clear Completed',
      class: 'inspection-clear-completed',
      filter: 'clear-completed',
      detail: `${completion.answered}/${completion.total} answered`
    };
  }

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
    inspectionDate:
      getEl('inspectionDate').value ||
      new Date().toISOString().slice(0, 10),
    productType,
    inspectionType,
    occupancy,
    answers
  };
}

function updateProjectReadinessPanel() {
  const quickSummary =
    document.getElementById('quickReadinessSummary');

  const oldPanel =
    document.getElementById('projectReadinessPanel');

  if (!quickSummary && !oldPanel) return;

  if (getEl('projectFormSection').style.display === 'none') {
    if (quickSummary) quickSummary.innerHTML = '';
    if (oldPanel) oldPanel.innerHTML = '';
    return;
  }

  const project = getCurrentFormProjectSnapshot();
  const completion = getProjectCompletionCounts(project);
  const expiryCounts = getProjectExpiryCounts(project);
  const dataQuality = getProjectDataQuality(project);

  const percent = completion.total
    ? Math.round((completion.answered / completion.total) * 100)
    : 0;

  const quickLinks = [];

  if (dataQuality.count > 0) {
    quickLinks.push({
      group: 'inspection',
      type: 'warning',
      label: 'Complete inspection info',
      count: dataQuality.count,
      detail: `Missing: ${dataQuality.missing.join(', ')}`,
      action: 'missing-info'
    });
  }

  if (completion.unanswered > 0) {
    quickLinks.push({
      group: 'inspection',
      type: 'progress',
      label: 'Continue Q&A checklist',
      count: completion.unanswered,
      detail: 'Tap to continue with the first unanswered question.',
      action: 'unanswered'
    });
  }

  if (completion.noCount > 0) {
    quickLinks.push({
      group: 'inspection',
      type: 'danger',
      label: 'Review findings',
      count: completion.noCount,
      detail: 'Items marked “No” may need corrective action.',
      action: 'finding'
    });
  }

  if (expiryCounts.overdue > 0) {
    quickLinks.push({
      group: 'equipment',
      type: 'danger',
      label: 'Expired equipment',
      count: expiryCounts.overdue,
      detail: 'Expiry date has already passed.',
      action: 'expiry-overdue'
    });
  }

  if (expiryCounts.soon > 0) {
    quickLinks.push({
      group: 'equipment',
      type: 'warning',
      label: 'Equipment due soon',
      count: expiryCounts.soon,
      detail: 'Expiry date is approaching.',
      action: 'expiry-soon'
    });
  }

  if (expiryCounts.missing > 0) {
    quickLinks.push({
      group: 'equipment',
      type: 'warning',
      label: 'Missing equipment expiry dates',
      count: expiryCounts.missing,
      detail: 'Enter expiry dates where applicable.',
      action: 'expiry-missing'
    });
  }

  const renderQuickLink = link => `
    <button
      type="button"
      class="quick-link-chip quick-link-${escapeHtml(link.type)}"
      onclick="handleSmartQuickLink('${escapeHtml(link.action)}')"
    >
      <span class="quick-link-main">
        ${escapeHtml(link.label)}
      </span>

      <strong>${link.count}</strong>

      <small>${escapeHtml(link.detail)}</small>
    </button>
  `;

  const inspectionLinks =
    quickLinks.filter(link => link.group === 'inspection');

  const equipmentLinks =
    quickLinks.filter(link => link.group === 'equipment');

  const summaryHtml = `
    <div class="quick-progress-line">
      <strong>Progress:</strong>
      ${completion.answered}/${completion.total} checklist items answered (${percent}%)
    </div>

    ${
      inspectionLinks.length > 0
        ? `
          <div class="quick-link-section-title">
            Inspection action items
          </div>

          <div class="quick-link-list">
            ${inspectionLinks.map(renderQuickLink).join('')}
          </div>
        `
        : `
          <div class="quick-clear-line">
            No inspection action items.
          </div>
        `
    }

    ${
      equipmentLinks.length > 0
        ? `
          <div class="quick-link-section-title">
            Equipment status
          </div>

          <div class="quick-link-list">
            ${equipmentLinks.map(renderQuickLink).join('')}
          </div>
        `
        : `
          <div class="quick-clear-line">
            No expired or due equipment items.
          </div>
        `
    }
  `;

  if (quickSummary) {
    quickSummary.innerHTML = summaryHtml;
  }

  if (oldPanel) {
    oldPanel.innerHTML = '';
    oldPanel.style.display = 'none';
  }
}

function handleSmartQuickLink(action) {
  if (action === 'missing-info') {
    focusFirstMissingProjectInfo();
    setReadinessMessage('Jumped to missing inspection information.');
    return;
  }

  if (action === 'unanswered') {
    focusFirstUnansweredChecklistItem();
    setReadinessMessage('Jumped to first unanswered checklist item.');
    return;
  }

  if (action === 'finding') {
    focusFirstCurrentIssue();
    setReadinessMessage('Jumped to first finding / No answer.');
    return;
  }

  if (action === 'expiry-overdue') {
    focusFirstCurrentExpiry('overdue');
    setReadinessMessage('Jumped to expired equipment item.');
    return;
  }

  if (action === 'expiry-soon') {
    focusFirstCurrentExpiry('soon');
    setReadinessMessage('Jumped to equipment item due soon.');
    return;
  }

  if (action === 'expiry-missing') {
    focusFirstCurrentExpiry('missing');
    setReadinessMessage('Jumped to missing equipment expiry date.');
  }
}

function showBackToQuickLinksButton(targetElement) {
  if (!targetElement) return;

  removeBackToQuickLinksButtons();

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'back-to-quick-links-btn';
  button.textContent = 'Back to Quick Links';
  button.onclick = scrollBackToQuickLinks;

  targetElement.insertAdjacentElement('afterbegin', button);
}

function removeBackToQuickLinksButtons() {
  document
    .querySelectorAll('.back-to-quick-links-btn')
    .forEach(button => button.remove());
}

function scrollBackToQuickLinks() {
  const quickLinks =
    document.getElementById('inspectionQuickActions');

  if (!quickLinks) return;

  quickLinks.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
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

function getReportChecklistRows(project) {
  const checklist =
    getChecklistForProject(project);

  const answers =
    project?.answers || [];

  return answers
    .map(answer => {
      const checklistItem =
        checklist.find((item, index) =>
          index === answer.itemIndex ||
          String(item["Item Number"]) === String(answer.itemNumber)
        );

      if (!checklistItem) {
        return null;
      }

      return {
        answer,
        checklistItem,
        itemNumber:
          answer.itemNumber ||
          checklistItem["Item Number"] ||
          String(answer.itemIndex + 1),
        question:
          checklistItem["Checklist Item"] ||
          checklistItem.Requirement ||
          checklistItem.Question ||
          'Checklist item',
        section:
          checklistItem.Section || '',
        answerValue:
          answer.answer || '',
        note:
          answer.note || '',
        expiryDate:
          answer.expiryDate || ''
      };
    })
    .filter(Boolean)
    .filter(row =>
      row.answerValue ||
      row.note ||
      row.expiryDate
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

  showBackToQuickLinksButton(row);

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

  showBackToQuickLinksButton(field.closest('.card') || field.parentElement);

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
    () => !getEl('organisationName').value.trim() && getEl('organisationName'),
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
window.updateBetaFeedbackStatus = updateBetaFeedbackStatus;
window.goToPreviousInspectionSection = goToPreviousInspectionSection;
window.goToNextInspectionSection = goToNextInspectionSection;
window.closeInspectionSectionFocus = closeInspectionSectionFocus;
window.runSiteReadyPreflight = runSiteReadyPreflight;
window.toggleSiteReadyPreflight = toggleSiteReadyPreflight;

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
  showBackToQuickLinksButton(row);

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

function renderDashboardMetrics(projectsOverride) {

  const container =
    document.getElementById('dashboardMetrics');

  if (!container) return;

  const projects =
    projectsOverride || getVisibleProjectsForCurrentUser(getProjects());

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

  const scheduledNewInspections = projects.filter(
  p =>
    p.scheduledStatus === 'scheduled' &&
    p.scheduleType === 'new_site' &&
    !p.completedAt
);

  const clearCompletedInspections = projects.filter(
    p => isCompletedAllClearInspection(p)
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
        data-filter="scheduled-new"
        onclick="setFilter('scheduled-new')">
          <div class="metric-number">${scheduledNewInspections.length}</div>
          <div class="metric-label">
            Scheduled New
          </div>
        </div>

        <div class="metric-card"
        data-filter="clear-completed"
        onclick="setFilter('clear-completed')">
          <div class="metric-number">${clearCompletedInspections.length}</div>
          <div class="metric-label">
            Clear Completed
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
          data-filter="inspection-complete"
          onclick="setFilter('inspection-complete')">
          <div class="metric-number">${inspectionStatusCounts['inspection-complete'] || 0}</div>
          <div class="metric-label">Completed</div>
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
          <div class="metric-label">Valid</div>
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

function scrollToFirstVisibleProject() {
  setTimeout(() => {
    const firstCard = document.querySelector('.project-card');

    if (firstCard) {
      firstCard.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      return;
    }

    const listSection = document.getElementById('projectListSection');
    if (listSection) {
      listSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }, 80);
}

function nextProjectPage() {
  currentProjectPage += 1;
  renderProjectsList();
  scrollToFirstVisibleProject();
}

function previousProjectPage() {
  currentProjectPage = Math.max(1, currentProjectPage - 1);
  renderProjectsList();
  scrollToFirstVisibleProject();
}

function getFilterLabel(filter) {
  const labels = {
    all: 'All inspections',
    followups: 'Follow-ups',
    soon: 'Due soon',
    overdue: 'Overdue',
    risk: 'High risk',
    'scheduled-new': 'Scheduled new inspections',
    'clear-completed': 'Clear completed inspections',
    'inspection-attention': 'Needs attention',
    'inspection-warning': 'Missing data',
    'inspection-progress': 'In progress',
    'inspection-complete': 'Completed',
    'inspection-draft': 'Draft',
    'expiry-overdue': 'Expired equipment',
    'expiry-soon': 'Equipment due soon',
    'expiry-scheduled': 'Valid equipment',
    'expiry-missing': 'Equipment date missing'
  };

  return labels[filter] || 'Filtered inspections';
}

function updateActiveFilterStatus(resultCount) {
  const status = document.getElementById('activeFilterStatus');
  const searchField = document.getElementById('projectSearch');
  const searchText = searchField ? searchField.value.trim() : '';

  if (!status) return;

  if (currentFilter === 'all' && !searchText) {
    status.style.display = 'none';
    status.innerHTML = '';
    return;
  }

  const parts = [];

  if (currentFilter !== 'all') {
    parts.push(`Filter: <strong>${escapeHtml(getFilterLabel(currentFilter))}</strong>`);
  }

  if (searchText) {
    parts.push(`Search: <strong>"${escapeHtml(searchText)}"</strong>`);
  }

  status.style.display = 'flex';
  status.innerHTML = `
    <span>
      ${parts.join(' | ')}
      (${resultCount})
    </span>

    <button type="button" onclick="clearProjectSearchAndFilter()">
      Clear
    </button>
  `;
}

function clearProjectSearchAndFilter() {
  const searchField = document.getElementById('projectSearch');

  if (searchField) {
    searchField.value = '';
  }

  currentFilter = 'all';
  currentProjectPage = 1;

  renderProjectsList();
  updateDashboardSelection();
  closeFilterPanel();
  scrollToFirstVisibleProject();
}

function normalizeSiteKeyText(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '');
}

function getSiteMergeKey(project) {
  if (project.siteId) {
    return normalizeSiteKeyText(project.siteId);
  }

  const name =
    project.projectName ||
    [project.organisationName, project.siteName]
      .filter(Boolean)
      .join(' ');

  const address =
    project.projectAddress ||
    combineStreetAddress(project.streetNumber, project.addressLine) ||
    project.addressLine ||
    '';

  return [
    normalizeSiteKeyText(name),
    normalizeSiteKeyText(address),
    normalizeSiteKeyText(project.mallName),
    normalizeSiteKeyText(project.unitNumber)
  ]
    .filter(Boolean)
    .join('|');
}

function convertProjectToArchivedInspection(project) {
  return {
    archivedAt: new Date().toISOString(),

    inspectionNumber: project.inspectionNumber || '',
    lastSaved: project.lastSaved || '',
    inspectorName: project.inspectorName || '',
    inspectionDate: project.inspectionDate || '',

    projectName: project.projectName || '',
    organisationName: project.organisationName || '',
    siteName: project.siteName || '',

    streetNumber: project.streetNumber || '',
    addressLine: project.addressLine || '',
    projectAddress: project.projectAddress || '',
    gps: project.gps || '',

    inMall: project.inMall || 'No',
    mallName: project.mallName || '',
    unitNumber: project.unitNumber || '',

    contactPerson: project.contactPerson || '',
    contactTel: project.contactTel || '',
    contactEmail: project.contactEmail || '',

    productType: project.productType || '',
    inspectionType: project.inspectionType || '',
    occupancy: project.occupancy || '',

    answers: project.answers || [],
    photos: project.photos || [],

    finalComments: project.finalComments || '',
    followUpRequired: project.followUpRequired || '',
    followUpDate: project.followUpDate || '',
    followUpNotes: project.followUpNotes || ''
  };
}

function consolidateDuplicateSiteCards() {
  const confirmed = confirm(
    'This will merge duplicate cards for the same premises into one card and move older inspections into Previous Inspection Archive. Export a backup first. Continue?'
  );

  if (!confirmed) return;

  const projects = getProjects();
  const groups = new Map();

  projects.forEach(project => {
    const key = getSiteMergeKey(project);

    if (!key) return;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(project);
  });

  const mergedProjects = [];
  const removedIds = [];
  const processedIds = new Set();

  groups.forEach(group => {
    if (group.length === 1) {
      mergedProjects.push(group[0]);
      processedIds.add(group[0].id);
      return;
    }

    const sorted = group
      .slice()
      .sort((a, b) => {
        const aTime = a.lastSaved ? new Date(a.lastSaved).getTime() : 0;
        const bTime = b.lastSaved ? new Date(b.lastSaved).getTime() : 0;

        return bTime - aTime;
      });

    const primary = sorted[0];
    const olderCards = sorted.slice(1);

    const archiveFromOlderCards =
      olderCards.map(convertProjectToArchivedInspection);

    const existingHistory =
      primary.inspectionHistory || [];

    const mergedHistory = [
      ...existingHistory,
      ...archiveFromOlderCards
    ].sort((a, b) => {
      const aTime = a.lastSaved ? new Date(a.lastSaved).getTime() : 0;
      const bTime = b.lastSaved ? new Date(b.lastSaved).getTime() : 0;

      return bTime - aTime;
    });

    mergedProjects.push({
      ...primary,
      inspectionHistory: mergedHistory,
      hasSiteHistory: mergedHistory.length > 0,
      previousInspectionCount: mergedHistory.length,
      syncPending: true,
      syncError: false,
      lastSaved: new Date().toISOString()
    });

    olderCards.forEach(project => {
      removedIds.push(project.id);
      markProjectDeleted(project.id);
    });

    sorted.forEach(project => {
      processedIds.add(project.id);
    });
  });

  projects.forEach(project => {
    if (!processedIds.has(project.id)) {
      mergedProjects.push(project);
    }
  });

  setProjects(mergedProjects);
  renderProjectsList();

  runBackgroundSync('duplicate site cards consolidated')
    .catch(error => {
      console.warn('Consolidation sync failed:', error);
    });

  alert(
    `Done. Merged duplicate site cards. Removed ${removedIds.length} duplicate card(s).`
  );
}

function isCompletedAllClearInspection(project) {
  if (!project) return false;

  if (
    project.scheduledStatus === 'scheduled' ||
    project.scheduleFreshInspection === true
  ) {
    return false;
  }

  if (project.followUpRequired === 'Yes') {
    return false;
  }

  const completion = getProjectCompletionCounts(project);
  const expiryCounts = getProjectExpiryCounts(project);
  const dataQuality = getProjectDataQuality(project);

  const hasChecklistCompleted =
    completion.total > 0 &&
    completion.unanswered === 0;

  const hasNoFindings =
    completion.noCount === 0;

  const hasNoExpiryIssues =
    expiryCounts.overdue === 0 &&
    expiryCounts.soon === 0 &&
    expiryCounts.missing === 0;

  const hasNoMissingProjectInfo =
    dataQuality.count === 0;

  return (
    hasChecklistCompleted &&
    hasNoFindings &&
    hasNoExpiryIssues &&
    hasNoMissingProjectInfo
  );
}

function renderProjectsList() {
  const container = getEl('projectsList');

  if (!currentUserProfile) {
    container.innerHTML = '';

    const dashboardMetrics = document.getElementById('dashboardMetrics');
    const projectPagingControls = document.getElementById('projectPagingControls');
    const activeFilterStatus = document.getElementById('activeFilterStatus');

    if (dashboardMetrics) dashboardMetrics.innerHTML = '';
    if (projectPagingControls) projectPagingControls.innerHTML = '';

    if (activeFilterStatus) {
      activeFilterStatus.style.display = 'none';
      activeFilterStatus.innerHTML = '';
    }

    return;
  }

  const allProjects = getProjects();
  const projects = getVisibleProjectsForCurrentUser(allProjects);

  updateAppInfo();

  // renderReminderBanner(projects);
  renderDashboardMetrics(projects);
  updateOfflineReadinessBanner();
  updateSiteReadyPreflightChecklist();
  updatePostSiteSyncReminder();

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

  if (currentFilter === 'scheduled-new') {
  return (
    project.scheduledStatus === 'scheduled' &&
    project.scheduleType === 'new_site' &&
    !project.completedAt
  );
}

  if (currentFilter === 'clear-completed') {
    return isCompletedAllClearInspection(project);
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

  updateActiveFilterStatus(filteredProjects.length);

  filteredProjects.sort((a, b) => {
      if (currentFilter === 'scheduled-new') {
      const aDate = a.scheduledDate || a.followUpDate || a.lastSaved || '';
      const bDate = b.scheduledDate || b.followUpDate || b.lastSaved || '';

      const aTime = aDate ? new Date(aDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = bDate ? new Date(bDate).getTime() : Number.MAX_SAFE_INTEGER;

      return aTime - bTime;
    }

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
 
  const totalPages = Math.max(
  1,
  Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE)
);

  if (currentProjectPage > totalPages) {
    currentProjectPage = totalPages;
  }

  const startIndex = (currentProjectPage - 1) * PROJECTS_PER_PAGE;
  const visibleProjects = filteredProjects.slice(
    startIndex,
    startIndex + PROJECTS_PER_PAGE
  );

  const pagingControls = document.getElementById('projectPagingControls');

  if (pagingControls) {
    pagingControls.innerHTML = `
      <button
        type="button"
        onclick="previousProjectPage()"
        ${currentProjectPage === 1 ? 'disabled' : ''}
      >
        Previous
      </button>

      <span>
        Showing ${filteredProjects.length === 0 ? 0 : startIndex + 1}
        -
        ${Math.min(startIndex + PROJECTS_PER_PAGE, filteredProjects.length)}
        of ${filteredProjects.length}
      </span>

      <button
        type="button"
        onclick="nextProjectPage()"
        ${currentProjectPage >= totalPages ? 'disabled' : ''}
      >
        Next
      </button>
    `;
  }

  if (filteredProjects.length === 0) {
    container.innerHTML = `<div class="empty-state">No matching inspections found.</div>`;
    return;
  }

  window.currentProjectsListView = visibleProjects;

container.innerHTML = `
  <div id="projectListView" class="inspection-project-list">
    ${visibleProjects.map((project, index) => {
      const followStatus = getFollowUpStatus(project);
      const inspectionStatus = getProjectInspectionStatus(project);

      const activeScheduleLabel =
  getActiveScheduleLabel(project);

const scheduledLabel =
  activeScheduleLabel || followStatus.label;
      const projectTitle =
        project.projectName ||
        [project.organisationName, project.siteName]
          .filter(Boolean)
          .join(' ') ||
        'Untitled Project';

      const projectAddress =
        project.projectAddress ||
        combineStreetAddress(project.streetNumber, project.addressLine) ||
        'No address captured';

      const inspectionDate =
        getProjectInspectionDate(project);

      return `
        <button
          type="button"
          class="inspection-project-list-item"
          onclick="openProjectSummaryCard(${index})"
        >
          <span class="inspection-project-list-title">
            ${escapeHtml(projectTitle)}
          </span>

          <span class="inspection-project-list-meta">
            ${escapeHtml(project.inspectionNumber || '-')}
            ${inspectionDate ? ` | Inspection date: ${escapeHtml(formatInspectionDate(inspectionDate))}` : ''}
          </span>

          ${
            activeScheduleLabel
              ? ''
              : `
                <span class="inspection-project-list-status ${escapeHtml(inspectionStatus.class)}">
                  ${escapeHtml(inspectionStatus.label)}
                </span>
              `
          }

            <span class="inspection-project-list-follow ${escapeHtml(activeScheduleLabel ? 'status-scheduled' : followStatus.class)}">
              ${escapeHtml(scheduledLabel)}
            </span>

          <span class="inspection-project-list-address">
            ${escapeHtml(projectAddress)}
          </span>
        </button>
      `;
    }).join('')}
  </div>

  <div
    id="projectSummaryDetailCard"
    class="project-summary-detail-card"
    style="display:none;"
  ></div>
`;
  if (currentProjectSummaryId) {
    const restoredIndex = visibleProjects.findIndex(
      project => project.id === currentProjectSummaryId
    );

    if (restoredIndex !== -1) {
      setTimeout(() => {
        openProjectSummaryCard(restoredIndex, false);
      }, 0);
    }
  }
}

function getProjectPrimaryAction(project) {
    if (
      project.scheduledStatus === 'scheduled' &&
      project.scheduleType === 'new_site'
    ) {
      return {
        label: 'Start Scheduled Inspection',
        focusMode: '',
        className: 'action-primary'
      };
    }

    if (
      project.scheduleFreshInspection === true ||
      project.scheduledStatus === 'scheduled'
    ) {
      return {
        label: 'Start Scheduled Follow-up',
        focusMode: '',
        className: 'action-primary'
      };
    }
  const completion = getProjectCompletionCounts(project);
  const expiryCounts = getProjectExpiryCounts(project);
  const highRiskSummary = getHighRiskSummary(project);
  const dataQuality = getProjectDataQuality(project);

  if (highRiskSummary.count > 0) {
    return {
      label: 'Review Findings',
      focusMode: 'issues',
      className: 'action-danger'
    };
  }

  if (expiryCounts.overdue > 0) {
    return {
      label: 'Review Expired',
      focusMode: 'expiry-overdue',
      className: 'action-danger'
    };
  }

  if (expiryCounts.soon > 0) {
    return {
      label: 'Review Due Soon',
      focusMode: 'expiry-soon',
      className: 'action-warning'
    };
  }

  if (completion.unanswered > 0) {
    return {
      label: 'Continue Inspection',
      focusMode: 'unanswered',
      className: 'action-primary'
    };
  }

  if (dataQuality.count > 0) {
    return {
      label: 'Complete Info',
      focusMode: 'missing-info',
      className: 'action-warning'
    };
  }

  return {
    label: 'Open Inspection',
    focusMode: '',
    className: 'action-primary'
  };
}

function openProjectSummaryCard(index, shouldScroll = true) {
  const projects = window.currentProjectsListView || [];
  const project = projects[index];
  if (project) {
  currentProjectSummaryId = project.id;
}
  const listView = document.getElementById('projectListView');
  const detailCard = document.getElementById('projectSummaryDetailCard');

  if (!project || !detailCard) return;

const syncStatus = getSyncStatus(project);
const followStatus = getFollowUpStatus(project);

const isScheduledNew =
  project.scheduledStatus === 'scheduled' &&
  project.scheduleType === 'new_site' &&
  !project.completedAt;

const activeScheduledDate = getActiveScheduledDate(project);

const scheduledLabel =
  isScheduledNew
    ? `Scheduled new inspection${activeScheduledDate ? ` (${activeScheduledDate})` : ''}`
    : (
        project.scheduleFreshInspection === true ||
        (
          project.scheduledStatus === 'scheduled' &&
          !project.completedAt
        )
      )
    ? `Open to start follow-up${activeScheduledDate ? ` (${activeScheduledDate})` : ''}`
    : followStatus.label;
  const inspectionStatus = getProjectInspectionStatus(project);
  const expiryCounts = getProjectExpiryCounts(project);
  const highRiskSummary = getHighRiskSummary(project);
  const dataQuality = getProjectDataQuality(project);
  const primaryAction = getProjectPrimaryAction(project);

  const projectTitle =
    project.projectName ||
    [project.organisationName, project.siteName]
      .filter(Boolean)
      .join(' ') ||
    'Untitled Project';

  const projectAddress =
    project.projectAddress ||
    combineStreetAddress(project.streetNumber, project.addressLine) ||
    'No address captured';

  const lastSaved = formatProjectDate(project.lastSaved);

  const inspectionDate =
    getProjectInspectionDate(project);

  if (listView) {
    listView.style.display = 'none';
  }

  detailCard.style.display = 'block';

  detailCard.innerHTML = `
    <div class="project-summary-actions">
      <button
        type="button"
        class="secondary-btn project-summary-close-btn"
        onclick="closeProjectSummaryCard()"
      >
        Close
      </button>

      <button
        type="button"
        class="project-summary-open-btn ${escapeHtml(primaryAction.className)}"
        onclick="openProject('${escapeHtml(project.id)}', '${escapeHtml(primaryAction.focusMode)}')"
      >
        ${escapeHtml(primaryAction.label)}
      </button>
    </div>

    <div class="project-card">
      <div class="project-card-top">
        <div>
          <h3>${escapeHtml(projectTitle)}</h3>

        <div class="project-number">
          ${escapeHtml(project.inspectionNumber || '-')}
        </div>

        <div class="project-address project-address-compact">
          ${escapeHtml(projectAddress)}
        </div>
        </div>
      </div>

      <div class="project-badges">
        ${
          syncStatus.class !== 'sync-synced'
            ? `
              <span class="project-sync ${escapeHtml(syncStatus.class)}">
                ${escapeHtml(syncStatus.label)}
              </span>
            `
            : ''
        }

        <span class="project-follow ${escapeHtml(followStatus.class)}">
          ${escapeHtml(scheduledLabel)}
        </span>

        ${
          isScheduledNew || project.scheduleFreshInspection === true
            ? ''
            : `
              <span class="project-inspection-status ${escapeHtml(inspectionStatus.class)}">
                ${escapeHtml(inspectionStatus.label)}
                <small>${escapeHtml(inspectionStatus.detail)}</small>
              </span>
            `
        }
      </div>

      ${dataQuality.count > 0 ? `
        <div class="project-data-quality">
          Missing project info:
          ${escapeHtml(dataQuality.missing.slice(0, 4).join(', '))}
          ${dataQuality.count > 4 ? `+ ${dataQuality.count - 4} more` : ''}
        </div>
      ` : ''}

      

      ${highRiskSummary.count > 0 ? `
        <div class="project-risk-summary">
          <div class="project-risk-count">
            High Risk:
            ${highRiskSummary.count}
            non-compliance item${highRiskSummary.count === 1 ? '' : 's'}
          </div>

          <div class="project-risk-text">
            ${escapeHtml(highRiskSummary.text)}
          </div>
        </div>
      ` : ''}

     ${expiryCounts.total > 0 ? `
  <div class="project-expiry-summary">
    <span class="project-expiry-label">Equipment Maintenance</span>

    ${expiryCounts.overdue > 0 ? `
      <span class="project-expiry-chip expiry-chip-overdue">
        Expired
      </span>
    ` : ''}

    ${expiryCounts.soon > 0 ? `
      <span class="project-expiry-chip expiry-chip-soon">
        Due soon
      </span>
    ` : ''}

    ${expiryCounts.scheduled > 0 ? `
      <span class="project-expiry-chip expiry-chip-scheduled">
        Valid
      </span>
    ` : ''}

    ${expiryCounts.missing > 0 ? `
      <span class="project-expiry-chip expiry-chip-missing">
        Date to be entered
      </span>
    ` : ''}
  </div>
` : ''}

      <div class="project-meta-grid">
        <div>
          <span>Platform</span>
          <strong>Fire-S</strong>
        </div>

        <div>
          <span>Inspector</span>
          <strong>${escapeHtml(project.inspectorName || '-')}</strong>
        </div>

        <div>
          <span>Inspection Date</span>
          <strong>${escapeHtml(formatInspectionDate(inspectionDate))}</strong>
        </div>

        <div>
          <span>Occupancy</span>
          <strong>${escapeHtml(project.occupancy || '-')}</strong>
        </div>

        <div>
          <span>Last saved</span>
          <strong>${escapeHtml(lastSaved)}</strong>
        </div>
      </div>
    </div>
  `;

  if (shouldScroll) {
  detailCard.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}
}

function closeProjectSummaryCard() {
  currentProjectSummaryId = null;
  const listView = document.getElementById('projectListView');
  const detailCard = document.getElementById('projectSummaryDetailCard');

  if (detailCard) {
    detailCard.style.display = 'none';
    detailCard.innerHTML = '';
  }

  if (listView) {
    listView.style.display = 'grid';

    listView.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
}

function archiveCurrentInspectionCycle(project, archiveReason = 'cycle_start') {
  const existingHistory = project.inspectionHistory || [];

  const hasInspectionData =
    (project.answers || []).length > 0 ||
    (project.photos || []).length > 0 ||
    project.finalComments ||
    project.followUpNotes;

  if (!hasInspectionData) {
    return existingHistory;
  }

  const inspectionKey =
    project.inspectionNumber ||
    project.id ||
    '';

  const alreadyArchived =
    existingHistory.some(item => {
      const itemKey =
        item.inspectionNumber ||
        item.sourceInspectionNumber ||
        '';

      return (
        inspectionKey &&
        itemKey === inspectionKey
      );
    });

  if (alreadyArchived) {
    return existingHistory;
  }

  const previousInspectionSnapshot = {
    archiveReason,
    archivedAt: new Date().toISOString(),

    sourceProjectId: project.id || '',
    sourceInspectionNumber: project.inspectionNumber || '',

    inspectionNumber: project.inspectionNumber || '',
    completedAt: project.completedAt || '',
    lastSaved: project.lastSaved || '',
    inspectorName: project.inspectorName || '',
    inspectionDate: project.inspectionDate || '',

    projectName: project.projectName || '',
    organisationName: project.organisationName || '',
    siteName: project.siteName || '',

    streetNumber: project.streetNumber || '',
    addressLine: project.addressLine || '',
    projectAddress: project.projectAddress || '',
    gps: project.gps || '',

    inMall: project.inMall || 'No',
    mallName: project.mallName || '',
    unitNumber: project.unitNumber || '',

    contactPerson: project.contactPerson || '',
    contactTel: project.contactTel || '',
    contactEmail: project.contactEmail || '',

    productType: project.productType || '',
    inspectionType: project.inspectionType || '',
    occupancy: project.occupancy || '',

    answers: project.answers || [],
    photos: project.photos || [],

    finalComments: project.finalComments || '',
    followUpRequired: project.followUpRequired || '',
    followUpDate: project.followUpDate || '',
    followUpNotes: project.followUpNotes || ''
  };

  return [
    ...existingHistory,
    previousInspectionSnapshot
  ];
}

function openProject(projectId, focusMode) {
  closeFinishSummaryBanner();
  currentProjectSummaryId = null;
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  currentProjectId = project.id;
 
  const shouldStartFreshScheduledInspection =
  project.scheduleFreshInspection === true;

if (shouldStartFreshScheduledInspection) {
  const projectIndex = projects.findIndex(p => p.id === project.id);

  if (projectIndex !== -1) {
    const inspectionHistory =
      archiveCurrentInspectionCycle(projects[projectIndex]);

    projects[projectIndex] = {
      ...projects[projectIndex],

      inspectionHistory,

      answers: [],
      photos: [],
      finalComments: '',

      followUpRequired: 'No',
      followUpDate: '',
      followUpNotes: '',

      scheduledStatus: 'in_progress',
      scheduleFreshInspection: false,

      inspectionNumber: generateInspectionNumber(),

      syncPending: true,
      syncError: false,
      lastSaved: new Date().toISOString()
    };

    setProjects(projects);

    Object.assign(project, projects[projectIndex]);
  }
}

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
  getEl('inspectionDate').value =
    project.inspectionDate ||
    project.completedAt?.slice(0, 10) ||
    project.lastSaved?.slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  getEl('occupancySelect').value = project.occupancy || occupancies[0]["Occupancy Code"];
  getEl('saveMessage').textContent = '';
  getEl('streetNumber').value = project.streetNumber || '';
  getEl('projectAddress').value = project.addressLine || project.projectAddress || '';
  getEl('gps').value = project.gps || '';
  updateGpsMapPreview();
  getEl('inMall').value = project.inMall || 'No';
  getEl('mallName').value = project.mallName || '';
  getEl('unitNumber').value = project.unitNumber || '';
  getEl('contactPerson').value = project.contactPerson || '';
  getEl('contactTel').value = project.contactTel || '';
  getEl('contactEmail').value = project.contactEmail || '';
  getEl('followUpRequired').value = project.followUpRequired || 'No';
  getEl('followUpDate').value = project.followUpDate || '';
  getEl('followUpNotes').value = project.followUpNotes || '';
  getEl('finalComments').value = project.finalComments || '';
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

  showProjectForm();
  prepareInspectionArchiveButton(project);

  if (focusMode === 'issues') {
    setTimeout(() => {
      focusFirstProjectIssue(project);
    }, 80);

    return;
  }

  if (focusMode === 'unanswered') {
  setTimeout(() => {
    focusFirstUnansweredChecklistItem();
  }, 120);

  return;
}

if (focusMode === 'missing-info') {
  setTimeout(() => {
    focusFirstMissingProjectInfo();
  }, 120);

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

function compressPhotoFile(file, maxWidth = 1200, maxHeight = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No photo file selected.'));
      return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
      const img = new Image();

      img.onload = function() {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(
            maxWidth / width,
            maxHeight / height
          );

          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('Photo compression failed.'));
              return;
            }

            const compressedFile = new File(
              [blob],
              'inspection-photo.jpg',
              { type: 'image/jpeg' }
            );

            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = function() {
        reject(new Error('Photo could not be loaded for compression.'));
      };

      img.src = e.target.result;
    };

    reader.onerror = function() {
      reject(new Error('Photo could not be read from device.'));
    };

    reader.readAsDataURL(file);
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

function withPhotoTimeout(promise, timeoutMs = 30000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Photo upload timed out. Please try again.'));
      }, timeoutMs);
    })
  ]);
}

async function uploadPhotoToStorage(file, projectId) {
  if (!file || !projectId) {
    throw new Error('Photo file and project ID are required.');
  }

  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser();

  if (userError || !userData?.user) {
    throw new Error('Please login before uploading photos.');
  }

  const compressedFile =
    await compressPhotoFile(file, 1200, 1200, 0.82);

  const safeProjectId =
    String(projectId).replace(/[^a-zA-Z0-9_-]/g, '');

  const filePath =
    `${userData.user.id}/${safeProjectId}/${Date.now()}.jpg`;

  console.log('Starting compressed photo storage upload:', {
    bucket: 'inspection-photos',
    filePath,
    originalName: file.name,
    originalType: file.type,
    originalSize: file.size,
    compressedType: compressedFile.type,
    compressedSize: compressedFile.size,
    projectId
  });

  const { data: uploadData, error: uploadError } =
    await supabaseClient
      .storage
      .from('inspection-photos')
      .upload(filePath, compressedFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg'
      });

  console.log('Compressed photo storage upload result:', {
    uploadData,
    uploadError
  });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabaseClient
    .storage
    .from('inspection-photos')
    .getPublicUrl(filePath);

  return {
    src: publicUrlData.publicUrl,
    storagePath: filePath,
    timestamp: new Date().toISOString(),
    note: '',
    originalSize: file.size,
    compressedSize: compressedFile.size
  };
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

   if (syncStatus && project.syncPending === false) {
      syncStatus.textContent = 'Uploading saved inspection...';
    }

const cloudMetadata =
  getProjectCloudMetadata(project, userData.user.id);

let projectToUpload = project;

const hasStrippedPhotos =
  (project.photos || []).some(photo => !photo.src);

if (hasStrippedPhotos) {
  const { data: existingRows, error: existingError } = await supabaseClient
    .from('inspections')
    .select('inspection_data')
    .eq('id', project.id)
    .limit(1);

  if (!existingError && existingRows && existingRows[0]?.inspection_data?.photos) {
    projectToUpload = {
      ...project,
      photos: existingRows[0].inspection_data.photos
    };
  }
}

const { error } = await supabaseClient
  .from('inspections')
  .upsert({
    id: project.id,
    user_id: userData.user.id,

    ...cloudMetadata,

    inspection_data: projectToUpload,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
    if (error) {
      console.error('Single upload failed:', error);
      if (syncStatus) syncStatus.textContent = `Cloud upload failed: ${error.message}`;
      return;
    }

    markInspectionSynced(project.id);

    if (syncStatus && project.syncPending === false) {
      syncStatus.textContent = 'Saved locally and uploaded to cloud.';
    }
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

async function uploadAllLocalInspections() {
  if (!navigator.onLine) return;
  if (typeof supabaseClient === 'undefined') return;

  const projects = getProjects();

  for (const project of projects) {
    await uploadSingleInspection({
      ...project,
      syncPending: true,
      syncError: false
    });
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
  updateOfflineReadinessBanner();
  updateSiteReadyPreflightChecklist();
  updatePostSiteSyncReminder();
}

function saveProject() {
  
  if (!canEditInspection()) {
    alert(
      'Your company access does not allow editing inspections. Please contact your company admin or Fire-S support.'
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
  const inspectionDate =
    getEl('inspectionDate').value ||
    new Date().toISOString().slice(0, 10);
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
  
  const finalComments = getEl('finalComments').value.trim();
  
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
      inspectionDate,
      occupancy,
      answers,
      followUpRequired,
      followUpDate,
      followUpNotes,
      finalComments,
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
      inspectionDate,
      occupancy,
      answers,
      photos: currentPhotos,
      followUpRequired: getEl('followUpRequired').value,
      followUpDate: getEl('followUpDate').value,
      followUpNotes: getEl('followUpNotes').value.trim(),
      finalComments,
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
  if (!navigator.onLine) {
    setSyncStatusMessage('Saved offline. Will sync when signal returns.');
    return;
  }

  uploadSingleInspection(savedProject)
    .catch(error => {
      console.error('Auto upload after save failed:', error);
      setSyncStatusMessage('Saved locally. Cloud upload failed.');
    });
} else {
  console.warn('Auto upload skipped: saved project not found.');
}



}

function buildFinishSummaryMessage(project) {
  if (!project) {
    return 'Inspection finished.';
  }

  const historyCount =
    (project.inspectionHistory || []).length;

  const photoCount =
    (project.photos || []).length;

  const hasFollowUp =
    project.followUpRequired === 'Yes' &&
    project.followUpDate;

  const inspectionNumber =
    project.inspectionNumber || '-';

  const inspectionDate =
    project.inspectionDate ||
    project.completedAt?.slice(0, 10) ||
    project.lastSaved?.slice(0, 10) ||
    '-';

  const summaryLines = [
    `Inspection finished successfully: ${inspectionNumber}`,
    `Inspection date: ${inspectionDate}`,
    `Archived previous inspection record: ${historyCount > 0 ? 'Yes' : 'No'}`,
    hasFollowUp
      ? `Follow-up scheduled: ${project.followUpDate}`
      : 'Follow-up scheduled: No',
    `Photos saved: ${photoCount}`,
    'Report available from the inspection or archive.'
  ];

  return summaryLines.join(' | ');
}

function showFinishSummaryBanner(message) {
  const listSection =
    document.getElementById('projectListSection');

  if (!listSection || !message) return;

  const existingBanner =
    document.getElementById('finishSummaryBanner');

  if (existingBanner) {
    existingBanner.remove();
  }

  const banner = document.createElement('div');
  banner.id = 'finishSummaryBanner';
  banner.className = 'finish-summary-banner';

  const summaryItems =
    String(message)
      .split('|')
      .map(item => item.trim())
      .filter(Boolean);

  banner.innerHTML = `
    <div class="finish-summary-content">
      <div class="finish-summary-title">
        Inspection completed
      </div>

      <div class="finish-summary-list">
        ${summaryItems.map(item => `
          <div class="finish-summary-line">
            ${escapeHtml(item)}
          </div>
        `).join('')}
      </div>
    </div>

    <button
      type="button"
      class="finish-summary-close-btn"
      onclick="closeFinishSummaryBanner()"
    >
      Close
    </button>
  `;

  const projectsList =
    document.getElementById('projectsList');

  if (projectsList) {
    listSection.insertBefore(banner, projectsList);
  } else {
    listSection.prepend(banner);
  }

  banner.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function closeFinishSummaryBanner() {
  const banner =
    document.getElementById('finishSummaryBanner');

  if (banner) {
    banner.remove();
  }
}

function getFinishInspectionWarnings(project) {
  const completion =
    getProjectCompletionCounts(project);

  const expiryCounts =
    getProjectExpiryCounts(project);

  const dataQuality =
    getProjectDataQuality(project);

  const warnings = [];

  if (completion.unanswered > 0) {
    warnings.push(
      `${completion.unanswered} checklist item${completion.unanswered === 1 ? '' : 's'} still unanswered`
    );
  }

  if (completion.noCount > 0) {
    warnings.push(
      `${completion.noCount} finding${completion.noCount === 1 ? '' : 's'} / No answer${completion.noCount === 1 ? '' : 's'} recorded`
    );
  }

  if (expiryCounts.overdue > 0) {
    warnings.push(
      `${expiryCounts.overdue} expired equipment item${expiryCounts.overdue === 1 ? '' : 's'}`
    );
  }

  if (expiryCounts.soon > 0) {
    warnings.push(
      `${expiryCounts.soon} equipment item${expiryCounts.soon === 1 ? '' : 's'} due soon`
    );
  }

  if (expiryCounts.missing > 0) {
    warnings.push(
      `${expiryCounts.missing} missing equipment expiry date${expiryCounts.missing === 1 ? '' : 's'}`
    );
  }

  if (dataQuality.count > 0) {
    warnings.push(
      `${dataQuality.count} missing inspection info item${dataQuality.count === 1 ? '' : 's'}: ${dataQuality.missing.join(', ')}`
    );
  }

  return warnings;
}

function confirmFinishInspectionWithWarnings(project) {
  const warnings =
    getFinishInspectionWarnings(project);

  if (warnings.length === 0) {
    return true;
  }

  const message = [
    'This inspection still has items that may need attention:',
    '',
    ...warnings.map(item => `- ${item}`),
    '',
    'Finish inspection anyway?'
  ].join('\n');

  return confirm(message);
}

function finishInspection() {
  saveProject();

  if (!currentProjectId) {
    return;
  }

  const savedProjectForGuardrail =
    getProjects().find(
      project => project.id === currentProjectId
    );

  if (
    savedProjectForGuardrail &&
    !confirmFinishInspectionWithWarnings(savedProjectForGuardrail)
  ) {
    const saveMessage =
      document.getElementById('saveMessage');

    if (saveMessage) {
      saveMessage.textContent =
        'Finish cancelled. Review the Quick Links action items before finishing.';
    }

    return;
  }

  if (currentProjectId) {
    const projects = getProjects();
    const index = projects.findIndex(
      project => project.id === currentProjectId
    );

    if (index !== -1) {
      const completedProjectBeforeUpdate = projects[index];

      const completedAt = new Date().toISOString();

      const hasNextScheduledInspection =
        completedProjectBeforeUpdate.followUpRequired === 'Yes' &&
        completedProjectBeforeUpdate.followUpDate;

      const completedProjectForArchive = {
        ...completedProjectBeforeUpdate,
        completedAt
      };

      const inspectionHistory =
        archiveCurrentInspectionCycle(completedProjectForArchive);

      projects[index] = {
        ...completedProjectForArchive,

        inspectionHistory,

        scheduledDate: hasNextScheduledInspection
          ? completedProjectBeforeUpdate.followUpDate
          : '',

        scheduledStatus: hasNextScheduledInspection
          ? 'scheduled'
          : 'completed',

        scheduleFreshInspection: hasNextScheduledInspection,

        scheduledReason: hasNextScheduledInspection
          ? 'follow_up'
          : '',

        scheduledNote: hasNextScheduledInspection
          ? completedProjectBeforeUpdate.followUpNotes || ''
          : '',

        scheduleType: hasNextScheduledInspection
          ? 'Follow-up'
          : completedProjectBeforeUpdate.scheduleType || '',

        syncPending: true,
        syncError: false,
        lastSaved: new Date().toISOString()
      };

      setProjects(projects);

      const completedProject = projects[index];

      if (navigator.onLine) {
        uploadSingleInspection(completedProject)
          .catch(error => {
            console.warn('Completed inspection upload failed:', error);
          });
      }
    }
  }
  const finishedProject =
  getProjects().find(
    project => project.id === currentProjectId
  );

const finishSummaryText =
  buildFinishSummaryMessage(finishedProject);

showProjectList();

showFinishSummaryBanner(finishSummaryText);

const finishMessage =
  document.getElementById('syncStatus');

if (finishMessage) {
  finishMessage.textContent =
    `${finishSummaryText} Sync will continue in the background.`;
}
}

function createFollowUpInspection() {
  if (!canCreateInspection()) {
    alert(
      'Your company access does not allow creating follow-up inspections. Please contact your company admin or Fire-S support.'
    );
    return;
  }

  if (!currentProjectId) {
    getEl('saveMessage').textContent =
      'Open or save an inspection before scheduling a follow-up.';
    return;
  }

  const projects = getProjects();
  const index = projects.findIndex(p => p.id === currentProjectId);

  if (index === -1) {
    getEl('saveMessage').textContent =
      'Original inspection not found.';
    return;
  }

  const original = projects[index];

  const followUpDate = prompt(
    'Enter follow-up inspection date in YYYY-MM-DD format:',
    original.followUpDate || new Date().toISOString().slice(0, 10)
  );

  if (!followUpDate) return;

  const confirmed = confirm(
    'Schedule the next inspection cycle on this same site card? This will not create a duplicate card. The current inspection will remain available in Previous Inspection Archive when the next cycle starts.'
  );

  if (!confirmed) return;

  projects[index] = {
    ...original,

    followUpRequired: 'Yes',
    followUpDate,
    followUpNotes:
      original.followUpNotes ||
      'Follow-up inspection scheduled.',

    scheduledDate: followUpDate,
    scheduledStatus: 'scheduled',
    scheduleFreshInspection: true,
    scheduledReason: 'follow_up',

    completedAt: null,
    archiveStatus: '',
    archivedAt: null,

    syncPending: true,
    syncError: false,
    lastSaved: new Date().toISOString()
  };

  setProjects(projects);
  renderProjectsList();

  const updatedProject = projects[index];

  uploadSingleInspection(updatedProject)
    .catch(error => {
      console.warn('Follow-up schedule upload failed:', error);
    });

  getEl('saveMessage').textContent =
  `Next inspection cycle scheduled for ${followUpDate}. No duplicate card was created.`;
}

async function deleteProject() {
  if (!canEditInspection()) {
    alert(
      'Your company access does not allow deleting inspections. Please contact your company admin or Fire-S support.'
    );
    return;
  }
  if (!currentProjectId) {
    getEl('saveMessage').textContent = 'Save the project first before deleting.';
    return;
  }

  const confirmed = confirm(
    'Delete this inspection from this device and cloud sync? Export a backup first if you are unsure. Continue?'
  );
  if (!confirmed) return;

  const idToDelete = currentProjectId;
  markProjectDeleted(idToDelete);
  
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

  const groupedSections = new Map();

selectedChecklist.forEach((item, originalIndex) => {
  const sectionName = item.Section || 'GENERAL';

  if (!groupedSections.has(sectionName)) {
    groupedSections.set(sectionName, []);
  }

  groupedSections.get(sectionName).push({
    item,
    originalIndex
  });
});

const sectionNames = Array.from(groupedSections.keys());

const orderedSectionNames = [
  ...sectionNames.filter(name =>
    String(name).toLowerCase().includes('fire equipment')
  ),
  ...sectionNames.filter(name =>
    !String(name).toLowerCase().includes('fire equipment')
  )
];

html += `
  <div class="checklist-section-tabs">
    ${orderedSectionNames.map((sectionName, sectionIndex) => `
      <button
        type="button"
        class="checklist-section-tab"
        data-section-index="${sectionIndex}"
        onclick="openChecklistSection(${sectionIndex}, true)"
      >
        ${sectionIndex === activeChecklistSectionIndex ? '∨' : '›'}
        ${escapeHtml(sectionName.toUpperCase())}
      </button>
    `).join('')}
  </div>

  <div class="checklist-tab-hint">
    Slide left for next checklist sections →
  </div>
`;

orderedSectionNames.forEach((sectionName, sectionIndex) => {
  const sectionItems = groupedSections.get(sectionName) || [];

  html += `
    <div
      class="section-group hidden"
      id="section_${sectionIndex}"
      data-section-name="${escapeHtml(sectionName)}"
    >

      <div
        id="sectionNav_${sectionIndex}"
        class="checklist-question-nav"
        style="display:none;"
      >
        <button
          type="button"
          onclick="previousChecklistQuestion(${sectionIndex})"
        >
          Back
        </button>

        <span id="sectionNavStatus_${sectionIndex}">
          Question 1 of ${sectionItems.length}
        </span>

        <button
          type="button"
          onclick="nextChecklistQuestion(${sectionIndex})"
        >
          Next
        </button>
      </div>
  `;

  sectionItems.forEach(({ item: c, originalIndex }) => {
    const itemId = `check_${originalIndex}`;
    const trackExpiry = isExpiryTrackedChecklistItem(c);

    html += `
      <div
        class="checklist-row"
        data-index="${originalIndex}"
        data-section-index="${sectionIndex}"
      >
        <div>
          <strong>${c["Item Number"]}.</strong>
          ${escapeHtml(c["Checklist Item"])}
        </div>

        <div class="note">
          Answer type: ${escapeHtml(c["Answer Type"])}
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
          id="note_${originalIndex}"
          placeholder="Add note for this item..."
          oninput="scheduleAutoSave()"
        ></textarea>

        ${trackExpiry ? `
          <div class="expiry-wrapper">
            <label>Expiry Date</label>

            <input
              type="date"
              class="expiry-date"
              data-index="${originalIndex}"
              onchange="scheduleAutoSave()"
            >
          </div>
        ` : ''}
      </div>
    `;
  });

  html += `</div>`;
});
       
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
      'Your company access does not allow viewing reports. Please contact your company admin or Fire-S support.'
    );
    return;
  }

  archivedReportContext = null;

 const currentProject = getProjects().find(
    p => p.id === currentProjectId
  );

  const repeatFindings =
    currentProject?.repeatFindings || [];
  const projectName =
    currentProject?.projectName || 'Untitled Project';

  const reportCompanyName = 'Fire-S';

  const reportCompanyLogo =
  currentProject?.companyLogo || 'icon-192.png';
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
  const inspectionDate =
  formatInspectionDate(
    getProjectInspectionDate(currentProject)
  );
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

      <div class="report-photos report-photo-grid">
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
          : 'Valid';

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
  
   const executiveFindingText =
  noCount > 0
    ? `${noCount} non-compliance item${noCount === 1 ? '' : 's'} recorded during the inspection.`
    : 'No non-compliance items were recorded during the inspection.';

const executiveCompletionText =
  notAnsweredCount > 0
    ? `${notAnsweredCount} checklist item${notAnsweredCount === 1 ? '' : 's'} remain not answered.`
    : 'All applicable answered checklist items have been recorded.';

const executiveEquipmentText =
  expiryCounts && expiryCounts.total > 0
    ? [
        expiryCounts.overdue > 0
          ? `${expiryCounts.overdue} expired equipment maintenance item${expiryCounts.overdue === 1 ? '' : 's'}`
          : '',
        expiryCounts.soon > 0
          ? `${expiryCounts.soon} equipment maintenance item${expiryCounts.soon === 1 ? '' : 's'} due soon`
          : '',
        expiryCounts.missing > 0
          ? `${expiryCounts.missing} equipment maintenance date${expiryCounts.missing === 1 ? '' : 's'} to be entered`
          : ''
      ]
        .filter(Boolean)
        .join(', ') || 'No equipment maintenance concerns were highlighted.'
    : 'No equipment maintenance concerns were highlighted.';

const executiveFollowUpText =
  followUpRequired === 'Yes'
    ? `Follow-up / next inspection is recommended${followUpDate ? ` for ${followUpDate}` : ''}.`
    : 'No follow-up inspection date was recorded at the time of reporting.';

const executiveSummaryHtml = `
  <div class="executive-summary-grid">
    <div class="executive-summary-card">
      <span>Inspection Status</span>
      <strong>${escapeHtml(overallStatus)}</strong>
    </div>

    <div class="executive-summary-card">
      <span>Risk Rating</span>
      <strong>${escapeHtml(riskRating)}</strong>
    </div>

    <div class="executive-summary-card">
      <span>Findings</span>
      <strong>${noCount}</strong>
    </div>

    <div class="executive-summary-card">
      <span>Not Answered</span>
      <strong>${notAnsweredCount}</strong>
    </div>
  </div>

  <div class="executive-summary-text">
    <p>
      This fire safety inspection was completed for
      <strong>${escapeHtml(projectName)}</strong>.
      The overall inspection status is
      <strong>${escapeHtml(overallStatus)}</strong>
      with a risk rating of
      <strong>${escapeHtml(riskRating)}</strong>.
    </p>

    <p>
      ${escapeHtml(executiveFindingText)}
      ${escapeHtml(executiveCompletionText)}
    </p>

    <p>
      Equipment maintenance summary:
      ${escapeHtml(executiveEquipmentText)}.
    </p>

    <p>
      ${escapeHtml(executiveFollowUpText)}
    </p>

    <p class="executive-risk-comment">
      ${escapeHtml(riskComment)}
    </p>
  </div>
`;
  
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
          ${escapeHtml(section.toUpperCase())} — ${count} action ${count === 1 ? 'item' : 'items'}
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
  photosHtml = '';

  for (let pageStart = 0; pageStart < currentPhotos.length; pageStart += 4) {
    const pagePhotos = currentPhotos.slice(pageStart, pageStart + 4);
    const isFirstPhotoPage = pageStart === 0;

    photosHtml += `
      <div class="report-photo-page">
        ${
          isFirstPhotoPage
            ? `
              <h2 class="appendix-title">
                APPENDIX A - PHOTO EVIDENCE
              </h2>
            `
            : ''
        }

        <div class="report-photo-grid">
    `;

    for (let rowStart = 0; rowStart < 4; rowStart += 2) {
      photosHtml += `<div class="report-photo-row">`;

      for (let cellIndex = 0; cellIndex < 2; cellIndex++) {
        const photo = pagePhotos[rowStart + cellIndex];

        photosHtml += `<div class="report-photo-cell">`;

        if (photo) {
          const photoNumber = pageStart + rowStart + cellIndex + 1;

          photosHtml += `
            <div class="report-photo-card">

              <div class="report-photo-header">
                Photo ${photoNumber}
              </div>

              <div class="report-photo-time">
                Captured:
                ${
                  photo.timestamp
                    ? new Date(photo.timestamp).toLocaleString()
                    : 'Not recorded'
                }
              </div>

              <div class="report-photo-image-box">
                <img
                  src="${photo.src}"
                  class="report-photo-img"
                  alt="Inspection photo ${photoNumber}"
                >
              </div>

              <div class="report-photo-note">
                <strong>Photo Note:</strong>
                ${escapeHtml(photo.note || 'No note added.')}
              </div>

            </div>
          `;
        }

        photosHtml += `</div>`;
      }

      photosHtml += `</div>`;
    }

    photosHtml += `
        </div>
      </div>
    `;
  }
} else {
  photosHtml = `
    <div class="report-photo-page">
      <h2 class="appendix-title">
        APPENDIX A - PHOTO EVIDENCE
      </h2>

      <div class="note">
        No photo evidence was added to this inspection.
      </div>
    </div>
  `;
}

 reportContent.innerHTML = `
  <div class="report-header report-client-header">

    <div class="report-client-brand">
      <img
        class="report-client-logo"
        src="${escapeHtml(reportCompanyLogo)}"
        alt="${escapeHtml(reportCompanyName)} logo"
      >

      <div>
        <h1>${escapeHtml(reportCompanyName)}</h1>
        <div class="report-title">Fire Safety Inspection Report</div>

        <div class="report-platform-note">
          Generated by Fire-S Fire Safety App | Version ${escapeHtml(APP_VERSION)}
        </div>
      </div>
    </div>

    <div class="report-meta-card">
      <div>
        <strong>Inspection No:</strong>
        ${escapeHtml(inspectionNumber)}
      </div>

      <div>
        <strong>Inspection Date:</strong>
        ${escapeHtml(inspectionDate)}
      </div>

      <div>
        <strong>Inspector:</strong>
        ${escapeHtml(inspectorName || '-')}
      </div>

      <div>
        <strong>Inspection Date:</strong>
        ${escapeHtml(inspectionDate)}
      </div>

      <div>
        <strong>Premises / Site:</strong>
        ${escapeHtml(projectName || '-')}
      </div>

      <div>
        <strong>Occupancy:</strong>
        ${escapeHtml(occupancy || '-')}
      </div>

      <div>
        <strong>Inspection Type:</strong>
        ${escapeHtml(inspectionType || '-')}
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
      <div class="report-line"><strong>Inspection Date:</strong> ${escapeHtml(inspectionDate)}</div>
      ${dataQualityHtml}
    </div>

        <div class="report-block">
      <h2>Executive Summary</h2>
      ${executiveSummaryHtml}
    </div>

<div class="report-block">
  <h3>Next Inspection Cycle / Re-inspection</h3>

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
    Generated by Fire-S Fire Safety App | Version ${APP_VERSION}
  </div>
</div>

    ${photosHtml}
  `;

  getEl('reportSection').style.display = 'block';
}

function getRemainingPhotoSlots() {
  return Math.max(
    0,
    MAX_PHOTOS_PER_INSPECTION - currentPhotos.length
  );
}

function updatePhotoUploadStatus(messageOverride) {
  const photoUploadStatus =
    document.getElementById('photoUploadStatus');

  if (!photoUploadStatus) return;

  const used = currentPhotos.length;
  const remaining = getRemainingPhotoSlots();

  const counterText =
    `Photos: ${used} / ${MAX_PHOTOS_PER_INSPECTION} (${remaining} remaining)`;

  photoUploadStatus.textContent =
    messageOverride
      ? `${messageOverride} | ${counterText}`
      : counterText;
}

function saveCurrentPhotosToOpenProject() {
  if (!currentProjectId) return;

  const projects = getProjects();

  const index = projects.findIndex(
    project => project.id === currentProjectId
  );

  if (index === -1) return;

  projects[index] = {
    ...projects[index],
    photos: currentPhotos,
    syncPending: true,
    syncError: false,
    lastSaved: new Date().toISOString()
  };

  setProjects(projects);
}

function createLocalPhotoFallback(file) {
  return new Promise((resolve, reject) => {
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

        const compressedDataUrl =
          canvas.toDataURL('image/jpeg', 0.85);

        resolve({
          id: crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),
          src: compressedDataUrl,
          timestamp: new Date().toISOString(),
          note: '',
          uploadFallback: true,
          uploadPending: true
        });
      };

      img.onerror = function() {
        reject(new Error('Photo could not be processed.'));
      };

      img.src = e.target.result;
    };

    reader.onerror = function() {
      reject(new Error('Photo could not be read from device.'));
    };

    reader.readAsDataURL(file);
  });
}

async function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const saveMessage = document.getElementById('saveMessage');

  function setPhotoStatus(message) {
    if (saveMessage) {
      saveMessage.textContent = message;
    }

    updatePhotoUploadStatus(message);
  }

  if (window.photoUploadInProgress) {
    setPhotoStatus('Photo upload already in progress. Please wait.');
    event.target.value = '';
    return;
  }

  window.photoUploadInProgress = true;

  try {
    if (currentPhotos.length >= MAX_PHOTOS_PER_INSPECTION) {
      setPhotoStatus(
        `Photo limit reached (${MAX_PHOTOS_PER_INSPECTION} photos). Delete a photo before adding another.`
      );

      event.target.value = '';
      return;
    }

    if (!currentProjectId) {
      setPhotoStatus('Saving inspection first...');
      saveProject();

      if (!currentProjectId) {
        setPhotoStatus(
          'Inspection could not be saved. Complete the Premises / Site field and make sure you are logged in.'
        );

        event.target.value = '';
        return;
      }
    }

    setPhotoStatus('Preparing photo...');

    const localPhoto = await createLocalPhotoFallback(file);

    currentPhotos.push(localPhoto);

    const localPhotoId = localPhoto.id;

    renderPhotos();
    saveCurrentPhotosToOpenProject();

    const localProjectForUpload = getProjects().find(
      project => project.id === currentProjectId
    );

    if (localProjectForUpload) {
      uploadSingleInspection(localProjectForUpload)
        .catch(error => {
          console.warn('Photo local save upload failed:', error);
        });
    }

    setPhotoStatus('Photo added locally. Uploading to cloud...');

    try {
      const uploadedPhoto =
        await withPhotoTimeout(
          uploadPhotoToStorage(file, currentProjectId),
          30000
        );

      const photoIndex = currentPhotos.findIndex(
        photo => photo.id === localPhotoId
      );

      if (photoIndex !== -1) {
        const existingNote =
          currentPhotos[photoIndex].note || '';

        currentPhotos[photoIndex] = {
          ...uploadedPhoto,
          id: localPhotoId,
          note: existingNote,
          uploadFallback: false,
          uploadPending: false
        };

        renderPhotos();
        saveCurrentPhotosToOpenProject();

        const uploadedProjectForUpload = getProjects().find(
          project => project.id === currentProjectId
        );

        if (uploadedProjectForUpload) {
          uploadSingleInspection(uploadedProjectForUpload)
            .catch(error => {
              console.warn('Photo storage URL upload failed:', error);
            });
        }

        scheduleAutoSave();

        setPhotoStatus('Photo uploaded and added.');
      }

    } catch (uploadError) {
      console.error('Cloud photo upload failed. Local photo kept:', uploadError);

      const photoIndex = currentPhotos.findIndex(
        photo => photo.id === localPhotoId
      );

      if (photoIndex !== -1) {
        currentPhotos[photoIndex] = {
          ...currentPhotos[photoIndex],
          uploadFallback: true,
          uploadPending: false,
          uploadError:
            uploadError?.message ||
            'Cloud upload failed'
        };

        renderPhotos();
        saveCurrentPhotosToOpenProject();
        scheduleAutoSave();
      }

      setPhotoStatus(
        `Photo kept locally. Cloud upload failed: ${uploadError?.message || 'Unknown error'}`
      );
    }

  } catch (error) {
    console.error('Photo could not be added:', error);

    setPhotoStatus(
      `Photo could not be added: ${error?.message || 'Unknown error'}`
    );

  } finally {
    window.photoUploadInProgress = false;
    event.target.value = '';
  }
}

function getPhotoFileExtension(photo, fallback = 'jpg') {
  const src = String(photo?.src || '');

  if (src.startsWith('data:image/png')) return 'png';
  if (src.startsWith('data:image/webp')) return 'webp';
  if (src.startsWith('data:image/jpeg')) return 'jpg';
  if (src.startsWith('data:image/jpg')) return 'jpg';

  const cleanUrl = src.split('?')[0].split('#')[0];
  const match = cleanUrl.match(/\.(jpg|jpeg|png|webp)$/i);

  if (match) {
    return match[1].toLowerCase() === 'jpeg'
      ? 'jpg'
      : match[1].toLowerCase();
  }

  return fallback;
}

function getCurrentInspectionPhotoDownloadName(project, photo, index) {
  const projectName =
    project?.projectName ||
    [project?.organisationName, project?.siteName]
      .filter(Boolean)
      .join(' ') ||
    'Inspection';

  const inspectionNumber =
    project?.inspectionNumber ||
    'inspection';

  const photoNumber =
    String(index + 1).padStart(2, '0');

  const datePart =
    photo?.timestamp
      ? new Date(photo.timestamp).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const extension =
    getPhotoFileExtension(photo);

  return sanitizeFileName(
    `${inspectionNumber}_${projectName}_photo_${photoNumber}_${datePart}`,
    `inspection_photo_${photoNumber}`
  ) + `.${extension}`;
}

function triggerPhotoDownload(url, filename) {
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function downloadAllInspectionPhotos() {
  const projects = getProjects();

  const project =
    projects.find(p => p.id === currentProjectId);

  const photos =
    currentPhotos && currentPhotos.length > 0
      ? currentPhotos
      : project?.photos || [];

  if (!project) {
    alert('Open an inspection first before downloading photos.');
    return;
  }

  if (!photos || photos.length === 0) {
    alert('No photos found for this inspection.');
    return;
  }

  const confirmed = confirm(
    `Download ${photos.length} photo${photos.length === 1 ? '' : 's'} from this inspection?`
  );

  if (!confirmed) return;

  const saveMessage =
    document.getElementById('saveMessage');

  if (saveMessage) {
    saveMessage.textContent =
      `Preparing ${photos.length} photo download${photos.length === 1 ? '' : 's'}...`;
  }

  let downloaded = 0;
  let failed = 0;

  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index];

    if (!photo || !photo.src) {
      failed++;
      continue;
    }

    const filename =
      getCurrentInspectionPhotoDownloadName(project, photo, index);

    try {
      // Data URLs download directly.
      if (String(photo.src).startsWith('data:image/')) {
        triggerPhotoDownload(photo.src, filename);
        downloaded++;
      } else {
        // Try blob download first. This works best for cloud/public URLs.
        const response = await fetch(photo.src, {
          mode: 'cors'
        });

        if (!response.ok) {
          throw new Error(`Photo request failed: ${response.status}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        triggerPhotoDownload(blobUrl, filename);

        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 5000);

        downloaded++;
      }

      // Small delay helps browsers handle multiple downloads.
      await new Promise(resolve => setTimeout(resolve, 350));

    } catch (error) {
      console.warn('Photo download failed, using fallback link:', error);

      try {
        triggerPhotoDownload(photo.src, filename);
        downloaded++;
      } catch (fallbackError) {
        console.error('Fallback photo download failed:', fallbackError);
        failed++;
      }
    }
  }

  if (saveMessage) {
    saveMessage.textContent =
      `Photo download complete. Downloaded ${downloaded}. Failed ${failed}.`;
  }

  if (failed > 0) {
    alert(
      `${downloaded} photo${downloaded === 1 ? '' : 's'} downloaded. ${failed} could not be downloaded. Some browsers may block multiple downloads; allow downloads for this site and try again.`
    );
  }
}

async function downloadArchivedInspectionPhotos(projectId, historyIndex) {
  const projects = getProjects();

  const project =
    projects.find(p => p.id === projectId);

  if (!project) {
    alert('Project was not found.');
    return;
  }

  const inspection =
    (project.inspectionHistory || [])[historyIndex];

  if (!inspection) {
    alert('Archived inspection was not found.');
    return;
  }

  const photos = inspection.photos || [];

  if (!photos.length) {
    alert('No photos found for this archived inspection.');
    return;
  }

  const confirmed = confirm(
    `Download ${photos.length} archived photo${photos.length === 1 ? '' : 's'}?`
  );

  if (!confirmed) return;

  const saveMessage =
    document.getElementById('saveMessage') ||
    document.getElementById('syncStatus');

  if (saveMessage) {
    saveMessage.textContent =
      `Preparing ${photos.length} archived photo download${photos.length === 1 ? '' : 's'}...`;
  }

  let downloaded = 0;
  let failed = 0;

  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index];

    if (!photo || !photo.src) {
      failed++;
      continue;
    }

    const filename =
      getCurrentInspectionPhotoDownloadName(project, photo, index)
        .replace('_photo_', `_archived_${Number(historyIndex) + 1}_photo_`);

    try {
      if (String(photo.src).startsWith('data:image/')) {
        triggerPhotoDownload(photo.src, filename);
        downloaded++;
      } else {
        const response = await fetch(photo.src, {
          mode: 'cors'
        });

        if (!response.ok) {
          throw new Error(`Photo request failed: ${response.status}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        triggerPhotoDownload(blobUrl, filename);

        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 5000);

        downloaded++;
      }

      await new Promise(resolve => setTimeout(resolve, 350));

    } catch (error) {
      console.warn('Archived photo download failed, using fallback link:', error);

      try {
        triggerPhotoDownload(photo.src, filename);
        downloaded++;
      } catch (fallbackError) {
        console.error('Archived fallback photo download failed:', fallbackError);
        failed++;
      }
    }
  }

  if (saveMessage) {
    saveMessage.textContent =
      `Archived photo download complete. Downloaded ${downloaded}. Failed ${failed}.`;
  }

  if (failed > 0) {
    alert(
      `${downloaded} archived photo${downloaded === 1 ? '' : 's'} downloaded. ${failed} could not be downloaded. Your browser may have blocked multiple downloads.`
    );
  }
}

function renderPhotos() {
  const container = getEl('photoPreview');
  container.innerHTML = '';

  updatePhotoUploadStatus();

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

  <small class="photo-timestamp">
    Captured: ${photoTime}
  </small>

  <textarea
    class="photo-note"
    placeholder="Photo note..."
    oninput="updatePhotoNote(${index}, this.value)"
  >${escapeHtml(photo.note || '')}</textarea>

  <button
  class="photo-delete"
  type="button"
  onclick="deletePhoto(${index})"
>
  Delete
</button>
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
  updatePhotoUploadStatus();

  saveCurrentPhotosToOpenProject();

  const updatedProject = getProjects().find(
    project => project.id === currentProjectId
  );

  if (updatedProject) {
    uploadSingleInspection(updatedProject)
      .catch(error => {
        console.warn('Photo delete cloud upload failed:', error);
      });
  }

  const saveMessage = document.getElementById('saveMessage');

  if (saveMessage) {
    saveMessage.textContent = 'Photo deleted and sync update queued.';
  }
}

function updatePhotoNote(index, value) {
  if (!currentPhotos[index]) return;

  currentPhotos[index].note = value;
  scheduleAutoSave();
}

async function shareReport() {

  if (!canViewReports()) {
    alert(
      'Your company access does not allow sharing reports. Please contact your company admin or Fire-S support.'
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

  const inspectionDate =
  formatInspectionDate(
    getProjectInspectionDate(currentProject)
  );

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
`Fire-S Fire Safety Report

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
Inspection Date: ${inspectionDate}

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
        title: `Fire-S Report - ${projectName}`,
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


function expandAllSections() {
  document.querySelectorAll('.section-group').forEach(section => {
    section.classList.remove('hidden');
  });

  document.querySelectorAll('[id^="arrow_"]').forEach(arrow => {
    arrow.textContent = 'v';
  });

  document.querySelectorAll('.checklist-question-nav').forEach(nav => {
    nav.style.display = 'none';
  });

  document.querySelectorAll('.checklist-row').forEach(row => {
    row.classList.remove('question-hidden');
    row.classList.remove('active-checklist-question');
  });

  activeChecklistSectionIndex = null;
  activeChecklistQuestionPosition = 0;
}

function collapseAllSections() {
  closeAllChecklistSections();
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
    autoCloseSectionIfCompleted(selectEl);
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

function generateArchivedInspectionReport(projectId, historyIndex) {
  if (!canViewReports()) {
    alert(
      'Your company access does not allow viewing reports. Please contact your company admin or Fire-S support.'
    );
    return;
  }

  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);

  if (!project || !project.inspectionHistory) {
    alert('Archived inspection was not found.');
    return;
  }

  const inspection = project.inspectionHistory[historyIndex];

    if (!inspection) {
      alert('Archived inspection was not found.');
      return;
    }

    archivedReportContext = {
    projectId,
    historyIndex,
    inspectionNumber: inspection.inspectionNumber || '',
    projectName:
      inspection.projectName ||
      [inspection.organisationName, inspection.siteName]
        .filter(Boolean)
        .join(' ') ||
      project.projectName ||
      'Archived Inspection'
  };

  const checklist = getChecklistForProject(inspection);

  const projectName =
    inspection.projectName ||
    [inspection.organisationName, inspection.siteName]
      .filter(Boolean)
      .join(' ') ||
    project.projectName ||
    'Archived Inspection';

  const projectAddress =
    inspection.projectAddress ||
    combineStreetAddress(inspection.streetNumber, inspection.addressLine) ||
    '-';

  const inspectorName = inspection.inspectorName || '-';
  const occupancy = inspection.occupancy || '-';
  const inspectionType = inspection.inspectionType || '-';
  const productType = normalizeProductType(inspection.productType);
  const finalComments = inspection.finalComments || '';
  const inspectionNumber = inspection.inspectionNumber || '-';

  let yesCount = 0;
  let noCount = 0;
  let naCount = 0;
  let actionSections = {};
  let nonCompliance = {};
  let answersHtml = '';

  (inspection.answers || []).forEach(answer => {
    const item =
      checklist[answer.itemIndex] || {};

    const itemNumber =
      answer.itemNumber ||
      item["Item Number"] ||
      String((answer.itemIndex || 0) + 1);

    const itemText =
      item["Checklist Item"] ||
      `Checklist item ${itemNumber}`;

    const answerValue =
      answer.answer || 'Not answered';

    const answerLower =
      String(answerValue).trim().toLowerCase();

    if (answerLower === 'yes') yesCount++;
    if (answerLower === 'no') noCount++;
    if (answerLower === 'n/a') naCount++;

    const sectionName =
      item.Section || 'General';

    if (answerLower === 'no') {
      if (!actionSections[sectionName]) {
        actionSections[sectionName] = 0;
      }

      actionSections[sectionName]++;

      if (!nonCompliance[sectionName]) {
        nonCompliance[sectionName] = [];
      }

      nonCompliance[sectionName].push({
        itemNumber,
        checklistItem: itemText,
        text: item["Non Compliance Text"] || itemText,
        note: answer.note || '',
        reference: item["Reference"] || '',
        correctiveAction: item["Corrective Action"] || '',
        severity: item["Severity"] || 'Medium'
      });
    }

    const answerClass =
      answerLower === 'no'
        ? 'answer-no'
        : answerLower === 'yes'
        ? 'answer-yes'
        : answerLower === 'n/a'
        ? 'answer-na'
        : '';

    if (answerLower === 'no') {
        answersHtml += `
          <div class="report-answer ${answerClass}">
            <strong>${escapeHtml(itemNumber)}. ${escapeHtml(itemText)}</strong><br>

            <strong>Answer:</strong>
            ${escapeHtml(answerValue)}

            ${
              answer.note
                ? `<br><strong>Inspector Note:</strong> ${escapeHtml(answer.note)}`
                : ''
            }

            ${
              answer.expiryDate
                ? `<br><strong>Expiry Date:</strong> ${escapeHtml(answer.expiryDate)}`
                : ''
            }
          </div>
        `;
      }
  });

  const answeredCount = yesCount + noCount + naCount;

  let overallStatus = 'Compliant / Acceptable';
  let riskRating = 'LOW RISK';
  let riskComment = 'No significant fire safety risks identified.';

  if (noCount > 0) {
    overallStatus = 'Attention Required';
    riskRating = noCount >= 5 ? 'HIGH RISK' : 'MEDIUM RISK';
    riskComment =
      noCount >= 5
        ? 'Immediate attention required. Multiple fire safety non-compliances identified.'
        : 'Fire safety deficiencies identified. Corrective action required.';
  }

  let actionHtml = '';

  const sections =
    Object.keys(actionSections)
      .sort((a, b) => actionSections[b] - actionSections[a]);

  if (sections.length > 0) {
    actionHtml = sections.map(section => {
      const count = actionSections[section];
      const label = count === 1 ? 'item' : 'items';

      return `
        <div class="action-item">
          ${escapeHtml(section.toUpperCase())} — ${count} action ${count === 1 ? 'item' : 'items'}
        </div>
      `;
    }).join('');
  } else {
    actionHtml = `<div class="note">No action required.</div>`;
  }

  let nonComplianceHtml = '';

  const ncSections = Object.keys(nonCompliance);

  if (ncSections.length > 0) {
    ncSections.forEach(section => {
      nonComplianceHtml += `
        <div class="nc-section">
          <div class="nc-heading">${escapeHtml(section.toUpperCase())}</div>
      `;

      nonCompliance[section].forEach(item => {
        nonComplianceHtml += `
          <div class="nc-item nc-${escapeHtml(String(item.severity).toLowerCase())}">
            <div>
              <strong>Severity:</strong>
              ${escapeHtml(item.severity)}
            </div>

            <div>
              <strong>Finding:</strong>
              ${escapeHtml(item.text)}
            </div>

            ${
              item.note
                ? `
                  <div>
                    <strong>Inspector Note:</strong>
                    ${escapeHtml(item.note)}
                  </div>
                `
                : ''
            }

            ${
              item.reference
                ? `
                  <div class="note">
                    <strong>Reference:</strong>
                    ${escapeHtml(item.reference)}
                  </div>
                `
                : ''
            }

            ${
              item.correctiveAction
                ? `
                  <div>
                    <strong>Corrective Action:</strong>
                    ${escapeHtml(item.correctiveAction)}
                  </div>
                `
                : ''
            }
          </div>
        `;
      });

      nonComplianceHtml += `</div>`;
    });
  } else {
    nonComplianceHtml = `<div class="note">No non-compliances recorded.</div>`;
  }

  const photosHtml =
    (inspection.photos || []).length > 0
      ? `
        <div class="report-photo-page">
          <h2 class="appendix-title">
            APPENDIX A - PHOTO EVIDENCE
          </h2>

          <div class="report-photo-grid">
            ${(inspection.photos || []).map((photo, index) => `
              <div class="report-photo-card">
                <div class="report-photo-header">
                  Photo ${index + 1}
                </div>

                <div class="report-photo-time">
                  Captured:
                  ${
                    photo.timestamp
                      ? escapeHtml(new Date(photo.timestamp).toLocaleString())
                      : 'Not recorded'
                  }
                </div>

                <div class="report-photo-image-box">
                  <img
                    src="${photo.src || ''}"
                    class="report-photo-img"
                    alt="Archived inspection photo ${index + 1}"
                  >
                </div>

                <div class="report-photo-note">
                  <strong>Photo Note:</strong>
                  ${escapeHtml(photo.note || 'No note added.')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `
      : `
        <div class="report-photo-page">
          <h2 class="appendix-title">
            APPENDIX A - PHOTO EVIDENCE
          </h2>

          <div class="note">
            No photo evidence was added to this archived inspection.
          </div>
        </div>
      `;

  const reportContent = getEl('reportContent');

reportContent.innerHTML = `
    <div class="project-summary-actions">
      <button
        type="button"
        class="secondary-btn"
        onclick="exportReport()"
      >
        Export Archived PDF
      </button>
    </div>

    <div class="report-header report-client-header">
      <div class="report-client-brand">
        <img
          class="report-client-logo"
          src="${escapeHtml(project.companyLogo || 'icon-192.png')}"
          alt="Company logo"
        >

        <div>
          <h1>Fire-S</h1>

          <div class="report-subtitle">
            Archived Fire Safety Inspection Report
          </div>

          <div class="report-platform-note">
            Generated by Fire-S Fire Safety App | Version ${escapeHtml(APP_VERSION)}
          </div>
        </div>
      </div>

      <div class="report-meta-card">
        <div>
          <strong>Inspection No:</strong>
          ${escapeHtml(inspectionNumber)}
        </div>

        <div>
          <strong>Inspection Date:</strong>
          ${escapeHtml(formatInspectionDate(getProjectInspectionDate(inspection)))}
        </div>

        <div>
          <strong>Inspector:</strong>
          ${escapeHtml(inspectorName)}
        </div>

        <div>
          <strong>Premises / Site:</strong>
          ${escapeHtml(projectName)}
        </div>

        <div>
          <strong>Occupancy:</strong>
          ${escapeHtml(occupancy)}
        </div>

        <div>
          <strong>Inspection Type:</strong>
          ${escapeHtml(inspectionType)}
        </div>
      </div>
    </div>

    <div class="report-block">
      <h3>Premises Information</h3>

      <div class="report-line">
        <strong>Premises / Site:</strong>
        ${escapeHtml(projectName)}
      </div>

      <div class="report-line">
        <strong>Inspection Number:</strong>
        ${escapeHtml(inspectionNumber)}
      </div>

      <div class="report-line">
        <strong>Contact Person:</strong>
        ${escapeHtml(inspection.contactPerson || '-')}
      </div>

      <div class="report-line">
        <strong>Telephone:</strong>
        ${escapeHtml(inspection.contactTel || '-')}
      </div>

      <div class="report-line">
        <strong>Email:</strong>
        ${escapeHtml(inspection.contactEmail || '-')}
      </div>

      <div class="report-line">
        <strong>Compliance Area:</strong>
        ${escapeHtml(productType || '-')}
      </div>

      <div class="report-line">
        <strong>Inspection Type:</strong>
        ${escapeHtml(inspectionType)}
      </div>

      <div class="report-line">
        <strong>Address:</strong>
        ${escapeHtml(projectAddress)}
      </div>

      <div class="report-line">
        <strong>GPS:</strong>
        ${escapeHtml(inspection.gps || '-')}
      </div>

      <div class="report-line">
        <strong>Inspector Name:</strong>
        ${escapeHtml(inspectorName)}
      </div>

      <div class="report-line">
        <strong>Occupancy Classification:</strong>
        ${escapeHtml(occupancy)}
      </div>
    </div>

    <div class="report-block">
      <h3>Executive Inspection Summary</h3>

      <div class="report-line">
        <strong>Overall Status:</strong>
        <span class="${
          overallStatus === 'Compliant / Acceptable'
            ? 'status-good'
            : 'status-warning'
        }">
          ${escapeHtml(overallStatus)}
        </span>
      </div>

      <div class="report-line">
        <strong>Risk Rating:</strong>
        <span class="${
          riskRating === 'HIGH RISK'
            ? 'risk-high'
            : riskRating === 'MEDIUM RISK'
            ? 'risk-medium'
            : 'risk-low'
        }">
          ${escapeHtml(riskRating)}
        </span>
      </div>

      <div class="report-line note">
        ${escapeHtml(riskComment)}
      </div>

      <div class="report-summary-grid">
        <div class="report-summary-card">
          <span>Answered</span>
          <strong>${answeredCount}</strong>
        </div>

        <div class="report-summary-card">
          <span>Yes</span>
          <strong>${yesCount}</strong>
        </div>

        <div class="report-summary-card">
          <span>No</span>
          <strong>${noCount}</strong>
        </div>

        <div class="report-summary-card">
          <span>N/A</span>
          <strong>${naCount}</strong>
        </div>
      </div>
    </div>

    <div class="report-block">
      <h2>Priority Actions Required</h2>
      ${actionHtml}
    </div>

    <div class="report-block">
      <h3>Non-Compliance Details</h3>
      ${nonComplianceHtml}
    </div>

    <div class="report-block">
      <h3>Inspector Comments and Conclusion</h3>
      <div>${escapeHtml(finalComments || 'No comments provided.')}</div>
    </div>

    <div class="report-signoff">
      <div>
        <strong>Inspector:</strong>
        ${escapeHtml(inspectorName)}
      </div>

      <div>
        <strong>Report Date:</strong>
        ${new Date().toLocaleDateString()}
      </div>

      <div class="signature-line">
        Inspector Signature
      </div>

      <div class="report-disclaimer">
        This archived report records observations made at the time of the previous inspection. It should be read together with applicable fire safety legislation, standards, municipal by-laws, and competent professional judgement where required.
      </div>

      <div class="report-generated">
        Generated by Fire-S Fire Safety App | Version ${escapeHtml(APP_VERSION)}
      </div>
    </div>

    ${photosHtml}
  `;

  getEl('reportSection').style.display = 'block';

  reportContent.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function viewArchivedInspection(projectId, historyIndex) {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);

  if (!project || !project.inspectionHistory) return;

  const inspection = project.inspectionHistory[historyIndex];

  if (!inspection) return;

  const existing =
    document.getElementById('archivedInspectionDetailPanel');

  if (existing) {
    existing.remove();
  }

  const panel = document.createElement('div');
  panel.id = 'archivedInspectionDetailPanel';
  panel.className = 'site-history-panel';

  const checklist =
    getChecklistForProject(inspection);

  const answersHtml =
    (inspection.answers || []).length > 0
      ? (inspection.answers || []).map(answer => {
          const checklistItem =
            checklist[answer.itemIndex] || {};

          const itemText =
            checklistItem["Checklist Item"] ||
            `Checklist item ${answer.itemNumber || answer.itemIndex + 1}`;

          const answerValue =
            answer.answer || 'Not answered';

          const answerClass =
            String(answerValue).toLowerCase() === 'no'
              ? 'answer-no'
              : String(answerValue).toLowerCase() === 'yes'
              ? 'answer-yes'
              : String(answerValue).toLowerCase() === 'n/a'
              ? 'answer-na'
              : '';

          return `
            <div class="report-answer ${answerClass}">
              <strong>
                ${escapeHtml(answer.itemNumber || answer.itemIndex + 1)}.
                ${escapeHtml(itemText)}
              </strong><br>

              <strong>Answer:</strong>
              ${escapeHtml(answerValue)}

              ${
                answer.note
                  ? `<br><strong>Note:</strong> ${escapeHtml(answer.note)}`
                  : ''
              }

              ${
                answer.expiryDate
                  ? `<br><strong>Expiry Date:</strong> ${escapeHtml(answer.expiryDate)}`
                  : ''
              }
            </div>
          `;
        }).join('')
      : `<div class="note">No checklist answers archived.</div>`;
const photosHtml =
  (inspection.photos || []).length > 0
    ? `
        <div
          class="archived-photo-grid"
          style="
            display:grid;
            grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));
            gap:12px;
            margin-top:12px;
          "
        >
          ${(inspection.photos || []).map((photo, index) => `
            <div
              class="archived-photo-card"
              style="
                border:1px solid #d9e2ec;
                border-radius:10px;
                padding:8px;
                background:#fff;
                max-width:190px;
              "
            >
              <div style="font-weight:700; font-size:0.85rem;">
                Photo ${index + 1}
              </div>

              <div style="font-size:0.72rem; color:#607080; margin:4px 0 6px;">
                Captured:
                ${
                  photo.timestamp
                    ? escapeHtml(new Date(photo.timestamp).toLocaleString())
                    : 'Not recorded'
                }
              </div>

              <div
                style="
                  width:160px;
                  height:120px;
                  border:1px solid #e5eaf0;
                  border-radius:8px;
                  background:#f7f9fb;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  overflow:hidden;
                "
              >
                <img
                  src="${photo.src || ''}"
                  alt="Archived inspection photo ${index + 1}"
                  style="
                    width:160px;
                    height:120px;
                    max-width:160px;
                    max-height:120px;
                    object-fit:contain;
                    display:block;
                  "
                >
              </div>

              <div style="margin-top:6px; font-size:0.75rem; line-height:1.25;">
                <strong>Photo Note:</strong>
                ${escapeHtml(photo.note || 'No note added.')}
              </div>
            </div>
          `).join('')}
        </div>
      `
    : `<div class="note">No archived photos.</div>`;

  const businessName =
    inspection.projectName ||
    [inspection.organisationName, inspection.siteName]
      .filter(Boolean)
      .join(' ') ||
    project.projectName ||
    'Unnamed business / site';

  panel.innerHTML = `
    <div class="project-summary-actions">
      <button
        type="button"
        class="secondary-btn"
        onclick="closeArchivedInspectionDetail()"
      >
        Close Archived View
      </button>
    </div>

    <h3>Archived Inspection Detail</h3>

    <div class="report-block">
      <h3>Inspection Information</h3>

      <div class="report-line">
        <strong>Business / Site:</strong>
        ${escapeHtml(businessName)}
      </div>

      <div class="report-line">
        <strong>Inspection No:</strong>
        ${escapeHtml(inspection.inspectionNumber || '-')}
      </div>

      <div class="report-line">
        <strong>Date:</strong>
        ${
          inspection.lastSaved
            ? escapeHtml(new Date(inspection.lastSaved).toLocaleString())
            : '-'
        }
      </div>

      <div class="report-line">
        <strong>Inspector:</strong>
        ${escapeHtml(inspection.inspectorName || '-')}
      </div>

      <div class="report-line">
        <strong>Inspection Type:</strong>
        ${escapeHtml(inspection.inspectionType || '-')}
      </div>

      <div class="report-line">
        <strong>Occupancy:</strong>
        ${escapeHtml(inspection.occupancy || '-')}
      </div>

      <div class="report-line">
        <strong>Address:</strong>
        ${escapeHtml(
          inspection.projectAddress ||
          combineStreetAddress(inspection.streetNumber, inspection.addressLine) ||
          '-'
        )}
      </div>

      <div class="report-line">
        <strong>GPS:</strong>
        ${escapeHtml(inspection.gps || '-')}
      </div>
    </div>

    <div class="report-block">
      <h3>Inspector Comments</h3>
      <div>${escapeHtml(inspection.finalComments || 'No comments provided.')}</div>
    </div>

    <div class="report-block">
      <h3>Archived Photos</h3>
      ${photosHtml}
    </div>
  `;

  const archivePanel =
    document.getElementById('inspectionArchivePanel');

  if (archivePanel) {
    archivePanel.insertAdjacentElement('afterend', panel);
  } else {
    const form = document.getElementById('projectFormSection');
    if (form) form.prepend(panel);
  }

  panel.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function closeArchivedInspectionDetail() {
  const panel =
    document.getElementById('archivedInspectionDetailPanel');

  if (panel) {
    panel.remove();
  }
}

function prepareInspectionArchiveButton(project) {
  const existingLauncher =
    document.getElementById('inspectionArchiveLauncher');

  if (existingLauncher) {
    existingLauncher.remove();
  }

  const existingPanel =
    document.getElementById('inspectionArchivePanel');

  if (existingPanel) {
    existingPanel.remove();
  }

  const history =
    project?.inspectionHistory || [];

  if (history.length === 0) {
    return;
  }

  const quickActions =
    document.getElementById('inspectionQuickActions');

  const launcher = document.createElement('div');
  launcher.id = 'inspectionArchiveLauncher';
  launcher.className = 'inspection-archive-launcher';

  launcher.innerHTML = `
    <button
      type="button"
      class="secondary-btn archive-more-btn"
      onclick="openInspectionArchiveFromMore()"
    >
      More: Inspection History (${history.length})
    </button>
  `;

  if (quickActions) {
    quickActions.appendChild(launcher);
  } else {
    const form = document.getElementById('projectFormSection');

    if (form) {
      form.prepend(launcher);
    }
  }
}

function openInspectionArchiveFromMore() {
  const projects = getProjects();
  const project = projects.find(
    p => p.id === currentProjectId
  );

  if (!project) {
    alert('Open an inspection first.');
    return;
  }

  renderInspectionArchive(project);

  const panel =
    document.getElementById('inspectionArchivePanel');

  if (panel) {
    panel.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
}

function closeInspectionArchivePanel() {
  const panel =
    document.getElementById('inspectionArchivePanel');

  if (panel) {
    panel.remove();
  }
}

function renderInspectionArchive(project) {
  const existingArchive =
    document.getElementById('inspectionArchivePanel');

  if (existingArchive) {
    existingArchive.remove();
  }

  const history = project.inspectionHistory || [];

  if (history.length === 0) return;

  const panel = document.createElement('div');

  panel.id = 'inspectionArchivePanel';
  panel.className = 'site-history-panel';

  const sortedHistory = history
    .slice()
    .sort((a, b) => {
      const aTime = a.lastSaved ? new Date(a.lastSaved).getTime() : 0;
      const bTime = b.lastSaved ? new Date(b.lastSaved).getTime() : 0;

      return bTime - aTime;
    });

  const latestInspection = sortedHistory[0];
  const olderInspections = sortedHistory.slice(1, 5);

  function countAnswered(inspection) {
    return (inspection.answers || []).filter(answer =>
      ['yes', 'no', 'n/a'].includes(
        String(answer.answer || '').trim().toLowerCase()
      )
    ).length;
  }

  function countFindings(inspection) {
    return (inspection.answers || []).filter(answer =>
      String(answer.answer || '').trim().toLowerCase() === 'no'
    ).length;
  }

  function buildPhotoPreview(inspection) {
    const photos = (inspection.photos || []).slice(0, 4);

    if (photos.length === 0) {
      return `<div class="note">No archived photos.</div>`;
    }

    return `
      <div class="archive-photo-preview">
        ${photos.map((photo, index) => `
          <div class="archive-photo-thumb">
            <img
              src="${photo.src || ''}"
              alt="Archived photo ${index + 1}"
            >
            <small>
              ${
                photo.timestamp
                  ? escapeHtml(new Date(photo.timestamp).toLocaleString())
                  : 'No timestamp'
              }
            </small>
          </div>
        `).join('')}
      </div>
    `;
  }

  function buildArchiveCard(inspection, label, historyIndex) {
    const businessName =
      inspection.projectName ||
      [inspection.organisationName, inspection.siteName]
        .filter(Boolean)
        .join(' ') ||
      project.projectName ||
      [project.organisationName, project.siteName]
        .filter(Boolean)
        .join(' ') ||
      'Unnamed business / site';

    const archivedDate =
      inspection.lastSaved
        ? new Date(inspection.lastSaved).toLocaleString()
        : '-';

    const inspectionDate =
      formatInspectionDate(
        getProjectInspectionDate(inspection)
      );

    const answeredCount = countAnswered(inspection);
    const findingCount = countFindings(inspection);
    const photoCount = (inspection.photos || []).length;

    return `
      <div class="archive-inspection-card">
        <div>
          <strong>${escapeHtml(label)}</strong>
        </div>

        <div>
          <strong>Business / Site:</strong>
          ${escapeHtml(businessName)}
        </div>

        <div>
          <strong>Inspection No:</strong>
          ${escapeHtml(inspection.inspectionNumber || '-')}
        </div>

        <div>
          <strong>Inspection Date:</strong>
          ${escapeHtml(inspectionDate)}
        </div>

        <div>
          <strong>Archived / Last Saved:</strong>
          ${escapeHtml(archivedDate)}
        </div>

        <div>
          <strong>Inspector:</strong>
          ${escapeHtml(inspection.inspectorName || '-')}
        </div>

        <div>
          <strong>Answered items:</strong>
          ${answeredCount}
        </div>

        <div>
          <strong>Findings:</strong>
          ${findingCount}
        </div>

        <div>
          <strong>Photos:</strong>
          ${photoCount}
        </div>

        ${
          inspection.finalComments
            ? `
              <div>
                <strong>Final comments:</strong>
                ${escapeHtml(inspection.finalComments)}
              </div>
            `
            : ''
        }

        <div class="archive-actions">
          <button
            type="button"
            class="small-btn"
            onclick="viewArchivedInspection('${escapeHtml(project.id)}', ${historyIndex})"
          >
            View Details
          </button>

          <button
            type="button"
            class="small-btn primary-small-btn"
            onclick="generateArchivedInspectionReport('${escapeHtml(project.id)}', ${historyIndex})"
          >
            Generate Report
          </button>

          <button
            type="button"
            class="small-btn secondary-btn"
            onclick="downloadArchivedInspectionPhotos('${escapeHtml(project.id)}', ${historyIndex})"
          >
            Download Photos
          </button>
        </div>

      </div>
    `;
  }

  const olderHtml =
    olderInspections.length > 0
      ? `
        <details class="archive-more-details">
          <summary>
            Show older previous inspections (${olderInspections.length})
          </summary>

          <div class="archive-older-list">
            ${olderInspections.map((inspection, index) =>
              buildArchiveCard(
                inspection,
                `Older Finished Inspection ${index + 1}`,
                history.indexOf(inspection)
              )
            ).join('')}
          </div>
        </details>
      `
      : '';

  panel.innerHTML = `
    <div class="archive-panel-top">
      <h3>Inspection History</h3>

      <div class="archive-panel-actions">
        <button
          type="button"
          class="primary-small-btn archive-back-projects-btn"
          onclick="showProjectList()"
        >
          Back to Projects
        </button>

        <button
          type="button"
          class="small-btn"
          onclick="closeInspectionArchivePanel()"
        >
          Close Archive
        </button>
      </div>
    </div>

    <div class="note">
      <div class="note archive-history-note">
        Finished inspections for this site are listed below. Open an inspection to review the full Q&A, photos, comments and follow-up notes.
      </div>
    </div>

    ${buildArchiveCard(
      latestInspection,
      'Latest Finished Inspection',
      history.indexOf(latestInspection)
    )}

    ${olderHtml}
  `;

  const form =
    document.getElementById('projectFormSection');

  if (form) {
    form.prepend(panel);
  }
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
window.viewArchivedInspection = viewArchivedInspection;
window.closeArchivedInspectionDetail = closeArchivedInspectionDetail;
window.generateArchivedInspectionReport = generateArchivedInspectionReport;
window.downloadArchivedInspectionPhotos = downloadArchivedInspectionPhotos;
window.consolidateDuplicateSiteCards = consolidateDuplicateSiteCards;
window.scheduleAutoSave = scheduleAutoSave;
window.nextProjectPage = nextProjectPage;
window.previousProjectPage = previousProjectPage;
window.toggleChecklistSection = toggleChecklistSection;
window.toggleSection = toggleSection;
window.expandAllSections = expandAllSections;
window.collapseAllSections = collapseAllSections;
window.openChecklistSection = openChecklistSection;
window.closeChecklistSection = closeChecklistSection;
window.closeAllChecklistSections = closeAllChecklistSections;
window.nextChecklistQuestion = nextChecklistQuestion;
window.previousChecklistQuestion = previousChecklistQuestion;
window.handleSmartQuickLink = handleSmartQuickLink;
window.scrollBackToQuickLinks = scrollBackToQuickLinks;
window.dismissPostSiteSyncReminder = dismissPostSiteSyncReminder;
window.refreshSyncData = refreshSyncData;
window.addEventListener('online', () => {
  runBackgroundSync('online');
});

window.openInspectionArchiveFromMore = openInspectionArchiveFromMore;
window.closeInspectionArchivePanel = closeInspectionArchivePanel;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    runBackgroundSync('app visible');
  }
});
window.addEventListener('focus', () => {
  runBackgroundSync('window focus');
});

let fireyeAutoSyncTimer = null;

function startAutoSyncLoop() {
  if (fireyeAutoSyncTimer) return;

  fireyeAutoSyncTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!navigator.onLine) return;

    runBackgroundSync('auto interval');
  }, 20000);
}

startAutoSyncLoop();
window.addEventListener('online', resolvePendingGpsAddresses);
window.updatePhotoNote = updatePhotoNote;
window.nextProjectPage = nextProjectPage;
window.previousProjectPage = previousProjectPage;
window.openServiceRequestCard = openServiceRequestCard;
window.backToServiceRequestList = backToServiceRequestList;
window.markServiceRequestFollowedUp = markServiceRequestFollowedUp;
window.openProjectSummaryCard = openProjectSummaryCard;
window.closeProjectSummaryCard = closeProjectSummaryCard;
window.closeFinishSummaryBanner = closeFinishSummaryBanner;
window.downloadArchivedInspectionPhotos = downloadArchivedInspectionPhotos;
window.runBackgroundSync = runBackgroundSync;
window.clearProjectSearchAndFilter = clearProjectSearchAndFilter;
window.debugSyncCounts = debugSyncCounts;
window.addEventListener('offline', () => {
  setSyncStatusMessage('Offline mode active. You can continue working.');
});
window.addEventListener('online', async () => {
  setSyncStatusMessage('Signal restored. Updating GPS addresses...');

  await resolvePendingGpsAddresses();

  runBackgroundSync('signal restored');
});