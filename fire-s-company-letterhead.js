/* ============================================================
   Fire-S Company details (letterhead)
   Owner / Manager can set name, address, logo and contact numbers.
   That information is printed on the client PDF.
   The Fire-S logo stays on the PDF as an app reminder.
   ============================================================ */
(function fireSCompanyLetterheadModule() {
  'use strict';

  const STORAGE_KEY = 'fireS.companyLetterhead.v1';
  const FIRE_S_LOGO = 'icon-192.png';
  const SAMPLE_COMPANY_S_LOGO =
    'sample-company-s-logo.svg';
  const WORKSPACE_IDS = [
    'homeSection',
    'servicesSection',
    'projectListSection',
    'projectFormSection',
    'findingsCentreSection',
    'companyTeamSection',
    'testSamplesSection',
    'inspectorBoardSection',
    'reportSection'
  ];

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value || '').trim();
  }

  function esc(value) {
    return text(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }

  function isGenericName(name) {
    const n = text(name).toLowerCase();
    return (
      !n ||
      n === 'fire-s' ||
      n === 'fires' ||
      n === 'your company' ||
      n === 'your new company' ||
      n === 'local workspace' ||
      n === 'local / personal workspace' ||
      n === 'fire-s company'
    );
  }

  function isFireSAppLogo(src) {
    const s = String(src || '').toLowerCase();
    return (
      !s ||
      s.indexOf('icon-192') !== -1 ||
      s.indexOf('icon-512') !== -1 ||
      s.indexOf('fire-s-logo') !== -1
    );
  }

  function companyKey() {
    return text(window.currentUserProfile?.companyId) || 'local';
  }

  function emptyRecord() {
    return {
      name: '',
      address: '',
      phone: '',
      mobile: '',
      email: '',
      logo: ''
    };
  }

  function cleanRecord(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const logo = isFireSAppLogo(src.logo) ? '' : text(src.logo);
    return {
      name: text(src.name),
      address: text(src.address),
      phone: text(src.phone),
      mobile: text(src.mobile),
      email: text(src.email),
      logo
    };
  }

  function readStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
      console.warn('Could not keep company details on this phone:', error);
    }
  }

  function profileName() {
    return (
      text(window.currentUserProfile?.companyName) ||
      text(window.currentCompanyAccess?.companyName)
    );
  }

  function getLetterhead() {
    const store = readStore();
    const key = companyKey();
    const saved = cleanRecord(store[key] || store.local || {});
    const fromProfile = cleanRecord(window.currentUserProfile?.companyLetterhead);
    const merged = {
      name: saved.name || fromProfile.name || profileName(),
      address: saved.address || fromProfile.address,
      phone: saved.phone || fromProfile.phone,
      mobile: saved.mobile || fromProfile.mobile,
      email: saved.email || fromProfile.email,
      logo: saved.logo || fromProfile.logo
    };
    if (isGenericName(merged.name)) merged.name = 'Company S';
    return merged;
  }

  function rememberName(name) {
    const companyId = text(window.currentUserProfile?.companyId);
    if (!companyId || isGenericName(name)) return;
    try {
      if (typeof window.fireSApplyCompanyNameToUi === 'function') {
        window.fireSApplyCompanyNameToUi(companyId, name);
      } else if (typeof window.fireSApplyUserProfilePatch === 'function') {
        window.fireSApplyUserProfilePatch({
          companyId,
          companyName: name,
          companyLetterhead: getLetterhead()
        });
      }
    } catch (_) {}
  }

  function persistLocal(record) {
    const store = readStore();
    const key = companyKey();
    store[key] = record;
    if (key !== 'local') store.local = record;
    writeStore(store);
    try {
      if (typeof window.fireSApplyUserProfilePatch === 'function') {
        window.fireSApplyUserProfilePatch({
          companyName: record.name,
          companyLetterhead: record
        });
      } else if (window.currentUserProfile) {
        window.currentUserProfile.companyName = record.name;
        window.currentUserProfile.companyLetterhead = record;
      }
    } catch (_) {}
    rememberName(record.name);
  }

  async function persistCloud(record) {
    const companyId = text(window.currentUserProfile?.companyId);
    if (!companyId || typeof supabaseClient === 'undefined' || !supabaseClient) {
      return { ok: false, skipped: true };
    }
    try {
      const rpc = await supabaseClient.rpc('fire_s_update_company_letterhead', {
        p_name: record.name || null,
        p_address: record.address || null,
        p_phone: record.phone || null,
        p_mobile: record.mobile || null,
        p_email: record.email || null,
        p_logo_data: record.logo || null
      });
      if (!rpc?.error) return { ok: true };
    } catch (_) {}
    try {
      const updated = await supabaseClient
        .from('companies')
        .update({
          name: record.name,
          address: record.address,
          phone: record.phone,
          mobile: record.mobile,
          email: record.email,
          logo_data: record.logo
        })
        .eq('id', companyId);
      if (!updated?.error) return { ok: true };
      const nameOnly = await supabaseClient
        .from('companies')
        .update({ name: record.name })
        .eq('id', companyId);
      if (!nameOnly?.error) return { ok: true, nameOnly: true };
    } catch (_) {}
    return { ok: false };
  }

  async function loadFromCloud() {
    const companyId = text(window.currentUserProfile?.companyId);
    if (!companyId || typeof supabaseClient === 'undefined' || !supabaseClient) {
      return null;
    }
    try {
      const result = await supabaseClient
        .from('companies')
        .select('name, address, phone, mobile, email, logo_data')
        .eq('id', companyId)
        .maybeSingle();
      if (result?.error || !result?.data) return null;
      return cleanRecord({
        name: result.data.name,
        address: result.data.address,
        phone: result.data.phone,
        mobile: result.data.mobile,
        email: result.data.email,
        logo: result.data.logo_data
      });
    } catch (_) {
      return null;
    }
  }

  function canEdit() {
    try {
      if (typeof window.canEditCompanyDetails === 'function') {
        return !!window.canEditCompanyDetails();
      }
    } catch (_) {}
    const role = text(
      (typeof window.getCurrentUserRole === 'function'
        ? window.getCurrentUserRole()
        : window.currentUserProfile?.role) || ''
    ).toLowerCase();
    return (
      role === 'super_admin' ||
      role === 'company_owner' ||
      role === 'owner' ||
      role === 'manager'
    );
  }

  function setMessage(message, isError) {
    const el = byId('companyLetterheadMessage');
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

  function hideOtherSections() {
    WORKSPACE_IDS.forEach(id => {
      const el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function readForm() {
    return cleanRecord({
      name: byId('companyLetterheadName')?.value,
      address: byId('companyLetterheadAddress')?.value,
      phone: byId('companyLetterheadPhone')?.value,
      mobile: byId('companyLetterheadMobile')?.value,
      email: byId('companyLetterheadEmail')?.value,
      logo: byId('companyLetterheadLogoData')?.value
    });
  }

  function fillForm(record) {
    const data = cleanRecord(record);
    const name = byId('companyLetterheadName');
    const address = byId('companyLetterheadAddress');
    const phone = byId('companyLetterheadPhone');
    const mobile = byId('companyLetterheadMobile');
    const email = byId('companyLetterheadEmail');
    const logoData = byId('companyLetterheadLogoData');
    if (name) name.value = isGenericName(data.name) ? 'Company S' : data.name;
    if (address) address.value = data.address;
    if (phone) phone.value = data.phone;
    if (mobile) mobile.value = data.mobile;
    if (email) email.value = data.email;
    if (logoData) logoData.value = data.logo;
    paintLogoPreview(data.logo);
    paintLivePreview();
  }

  function paintLogoPreview(src) {
    const box = byId('companyLetterheadLogoPreview');
    if (!box) return;
    if (src && !isFireSAppLogo(src)) {
      box.classList.remove('is-empty');
      box.innerHTML = `<img src="${esc(src)}" alt="Company logo preview">`;
    } else {
      box.classList.add('is-empty');
      box.textContent = 'No logo yet';
    }
  }

  async function applyLogoDataUrl(dataUrl, message) {
    const hidden = byId('companyLetterheadLogoData');
    if (hidden) hidden.value = dataUrl;
    paintLogoPreview(dataUrl);
    paintLivePreview();
    setMessage(message || 'Logo ready. Tap Save company details to keep it.');
  }

  async function loadSampleLogo() {
    setMessage('Loading sample Company S logo…');
    const res = await fetch(SAMPLE_COMPANY_S_LOGO);
    if (!res.ok) {
      throw new Error('The sample logo file is missing.');
    }
    const blob = await res.blob();
    const file = new File([blob], 'sample-company-s-logo.svg', { type: 'image/svg+xml' });
    const dataUrl = await resizeLogoFile(file);
    await applyLogoDataUrl(dataUrl, 'Sample Company S logo is in. Tap Save company details to keep it.');
  }

  function contactHtml(record) {
    const lines = [];
    if (record.address) {
      lines.push(`<div>${esc(record.address).replace(/\n/g, '<br>')}</div>`);
    }
    const numbers = [];
    if (record.phone) numbers.push(`Tel ${esc(record.phone)}`);
    if (record.mobile) numbers.push(`Cell ${esc(record.mobile)}`);
    if (numbers.length) lines.push(`<div>${numbers.join(' · ')}</div>`);
    if (record.email) lines.push(`<div>${esc(record.email)}</div>`);
    if (!lines.length) return '';
    return `<div class="report-company-contact">${lines.join('')}</div>`;
  }

  function letterheadPreviewHtml(record) {
    const data = cleanRecord(record);
    const name = isGenericName(data.name) ? 'Company S' : data.name;
    const logoHtml =
      data.logo && !isFireSAppLogo(data.logo)
        ? `<img class="report-client-logo" src="${esc(data.logo)}" alt="${esc(name)} logo">`
        : '';
    return `
      <div class="report-header report-client-header formal-letterhead">
        <div class="report-client-brand">
          ${logoHtml}
          <div>
            <h1>${esc(name)}</h1>
            <div class="report-subtitle">Fire Safety Inspection Report</div>
            ${contactHtml(data)}
          </div>
        </div>
        <div class="report-app-mark">
          <img src="${FIRE_S_LOGO}" alt="Fire-S">
          <span>Prepared with Fire-S</span>
        </div>
      </div>
    `;
  }

  function paintLivePreview() {
    const box = byId('companyLetterheadLivePreview');
    if (!box) return;
    box.innerHTML = letterheadPreviewHtml(readForm());
  }

  function setFormEnabled(enabled) {
    [
      'companyLetterheadName',
      'companyLetterheadAddress',
      'companyLetterheadPhone',
      'companyLetterheadMobile',
      'companyLetterheadEmail',
      'companyLetterheadLogoFile',
      'companyLetterheadSaveBtn',
      'companyLetterheadClearLogoBtn',
      'companyLetterheadChooseLogoBtn',
      'companyLetterheadSampleLogoBtn'
    ].forEach(id => {
      const el = byId(id);
      if (el) el.disabled = !enabled;
    });
  }

  function resizeLogoFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that picture.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('That file is not a usable picture.'));
        img.onload = () => {
          const max = 420;
          const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.84));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function onLogoPicked(event) {
    const file = event?.target?.files && event.target.files[0];
    if (!file) return;
    try {
      setMessage('Preparing logo…');
      const dataUrl = await resizeLogoFile(file);
      await applyLogoDataUrl(dataUrl, 'Logo ready. Tap Save company details to keep it.');
    } catch (error) {
      setMessage(error.message || 'Could not use that picture.', true);
    }
  }

  function clearLogo() {
    const hidden = byId('companyLetterheadLogoData');
    const file = byId('companyLetterheadLogoFile');
    if (hidden) hidden.value = '';
    if (file) file.value = '';
    paintLogoPreview('');
    paintLivePreview();
  }

  async function saveDetails() {
    if (!canEdit()) {
      setMessage('Only the owner or manager can change company details.', true);
      return;
    }
    const record = readForm();
    if (!record.name) record.name = 'Company S';
    persistLocal(record);
    setMessage('Saved on this phone. Putting a cloud copy up as well…');
    const cloud = await persistCloud(record);
    if (cloud.ok && !cloud.nameOnly) {
      setMessage('Saved. This will appear on the client PDF.');
    } else if (cloud.ok) {
      setMessage('Saved. Name is in the cloud. Address, logo and numbers are kept on this phone.');
    } else if (cloud.skipped) {
      setMessage('Saved on this phone. Sign in to also keep a cloud copy.');
    } else {
      setMessage('Saved on this phone. The PDF will use these details on this device.');
    }
    paintLivePreview();
    try {
      if (typeof window.fireSApplyCleanHomeRoles === 'function') {
        window.fireSApplyCleanHomeRoles();
      }
    } catch (_) {}
  }

  async function openLetterhead() {
    if (!canEdit()) {
      alert('Only the owner or manager can edit company details.');
      return;
    }
    hideOtherSections();
    const section = byId('companyLetterheadSection');
    if (section) section.style.display = 'block';
    try {
      if (typeof window.updateFloatingBackButton === 'function') {
        window.updateFloatingBackButton();
      }
    } catch (_) {}
    setFormEnabled(true);
    fillForm(getLetterhead());
    setMessage('Loading saved company details…');
    const cloud = await loadFromCloud();
    if (cloud) {
      const local = getLetterhead();
      fillForm({
        name: cloud.name || local.name,
        address: cloud.address || local.address,
        phone: cloud.phone || local.phone,
        mobile: cloud.mobile || local.mobile,
        email: cloud.email || local.email,
        logo: cloud.logo || local.logo
      });
    }
    setMessage('Change anything, then tap Save company details.');
  }

  function goHome() {
    const section = byId('companyLetterheadSection');
    if (section) section.style.display = 'none';
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
  }

  function bind() {
    const back = byId('companyLetterheadBackBtn');
    const save = byId('companyLetterheadSaveBtn');
    const choose = byId('companyLetterheadChooseLogoBtn');
    const sample = byId('companyLetterheadSampleLogoBtn');
    const logo = byId('companyLetterheadLogoFile');
    const clear = byId('companyLetterheadClearLogoBtn');
    if (back && !back.__fireSBound) {
      back.__fireSBound = true;
      back.addEventListener('click', goHome);
    }
    if (save && !save.__fireSBound) {
      save.__fireSBound = true;
      save.addEventListener('click', () => {
        saveDetails().catch(error => {
          setMessage(error.message || 'Could not save company details.', true);
        });
      });
    }
    if (choose && !choose.__fireSBound) {
      choose.__fireSBound = true;
      choose.addEventListener('click', () => {
        const file = byId('companyLetterheadLogoFile');
        if (file) file.click();
      });
    }
    if (sample && !sample.__fireSBound) {
      sample.__fireSBound = true;
      sample.addEventListener('click', () => {
        loadSampleLogo().catch(error => {
          setMessage(error.message || 'Could not load the sample logo.', true);
        });
      });
    }
    if (logo && !logo.__fireSBound) {
      logo.__fireSBound = true;
      logo.addEventListener('change', onLogoPicked);
    }
    if (clear && !clear.__fireSBound) {
      clear.__fireSBound = true;
      clear.addEventListener('click', clearLogo);
    }
    [
      'companyLetterheadName',
      'companyLetterheadAddress',
      'companyLetterheadPhone',
      'companyLetterheadMobile',
      'companyLetterheadEmail'
    ].forEach(id => {
      const el = byId(id);
      if (!el || el.__fireSPreviewBound) return;
      el.__fireSPreviewBound = true;
      el.addEventListener('input', paintLivePreview);
    });
  }

  function boot() {
    bind();
    const btn = byId('cmdCompanyDetailsBtn');
    if (btn && !btn.__fireSLetterheadBound) {
      btn.__fireSLetterheadBound = true;
      btn.addEventListener('click', event => {
        if (event) event.preventDefault();
        openLetterhead();
      });
    }
  }

  window.fireSGetCompanyLetterhead = getLetterhead;
  window.fireSOpenCompanyLetterhead = openLetterhead;
  window.fireSCompanyLetterheadPreviewHtml = letterheadPreviewHtml;
  window.FIRE_S_APP_LOGO = FIRE_S_LOGO;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
