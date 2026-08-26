/* ============================================================
   Fire-S subscriber plans
   Shared by Access, Home, User manual and Play Store listing.
   Card payment is not taken in the app yet. The chosen plan is stored
   on the company so Company S can bill later.
   ============================================================ */
(function fireSSubscriptions(root) {
  'use strict';

  var DEFAULT_PLAN = 'standard';
  var DEFAULT_INTERVAL = 'monthly';
  var SEAT_PRICE_MONTHLY = 250;
  var SEAT_PRICE_ANNUAL = 2500;
  var PLAN_IDS = ['standard', 'seat', 'field', 'operations', 'executive', 'enterprise'];
  var INTERVALS = [
    {
      id: 'monthly',
      name: 'Monthly · R250 per month per login',
      summary: 'Subscription per month per login is R250. Phone and desktop with the same email count as one login.'
    },
    {
      id: 'annual',
      name: 'Annual · R2 500 per year per login · 2 months free',
      summary: 'Subscription per year per login is R2 500. That is 2 months free (you save R500). Phone and desktop with the same email count as one login.'
    }
  ];

  const PLANS = [
    {
      id: 'standard',
      name: 'Fire-S seat',
      audience: 'Every email',
      seats: 'One subscription, paid by the owner',
      summary: 'Subscription per month per login is R250, or R2 500 per year per login. Phone and desktop with the same email count as one login. Each extra person is another subscription.',
      includes: [
        'One login on phone and desktop',
        'Inspection Gateway, Q&A, photos, GPS and client PDF',
        'Home, reports and the work that matches your role',
        'User manual download'
      ],
      excludes: []
    }
  ];

  const ROLES = [
    {
      id: 'inspector',
      name: 'Inspector',
      plan: 'Fire-S seat',
      can: [
        'Login with the email the owner added',
        'Open Inspection Gateway',
        'Start, continue and complete inspections',
        'Fill Q&A, photos, GPS and comments',
        'Make and share the client PDF for their work',
        'Download the User manual'
      ],
      cannot: [
        'Add or remove people',
        'Change company logo or letterhead',
        'Open the Management dashboard',
        'Load test samples'
      ]
    },
    {
      id: 'manager',
      name: 'Manager',
      plan: 'Fire-S seat',
      can: [
        'Everything an Inspector can do',
        'See all company inspections',
        'Track overdue work and findings',
        'Schedule follow-ups',
        'Add Inspectors and Managers',
        'Edit company details for the PDF',
        'Open Inspectors board and compare',
        'Open the Management dashboard on tablet or PC'
      ],
      cannot: [
        'Remove the Owner'
      ]
    },
    {
      id: 'company_owner',
      name: 'Owner',
      plan: 'Fire-S seat',
      can: [
        'Everything a Manager can do',
        'Subscribe and register the company',
        'Set the company name, address, logo and numbers',
        'Add, change or remove staff',
        'Use the Executive dashboard and Power BI export',
        'Load or delete test samples'
      ],
      cannot: []
    },
    {
      id: 'viewer',
      name: 'Viewer',
      plan: 'Fire-S seat',
      can: [
        'Open Inspection Gateway in review mode',
        'Read reports and compliance numbers',
        'Download the User manual'
      ],
      cannot: [
        'Edit inspections',
        'Change people or company details',
        'Open the Management dashboard'
      ]
    }
  ];

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function plans() {
    return PLANS.slice();
  }

  function roles() {
    return ROLES.slice();
  }

  function planById(id) {
    var key = normalizePlanId(id);
    return PLANS.find(function (plan) { return plan.id === key; }) || PLANS.find(function (plan) { return plan.id === DEFAULT_PLAN; });
  }

  function normalizePlanId(id) {
    var raw = text(id).toLowerCase();
    if (raw === 'standard' || raw === 'seat') return 'standard';
    if (
      raw === 'field' ||
      raw === 'operations' ||
      raw === 'executive' ||
      raw === 'enterprise' ||
      raw === 'development' ||
      raw === 'local' ||
      raw === 'trial' ||
      raw === 'owner'
    ) {
      return 'standard';
    }
    return DEFAULT_PLAN;
  }

  function formatRand(amount) {
    var n = Math.round(Number(amount) || 0);
    var digits = String(n);
    var withSpaces = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return 'R' + withSpaces;
  }

  function priceFor(interval) {
    return normalizeInterval(interval) === 'annual' ? SEAT_PRICE_ANNUAL : SEAT_PRICE_MONTHLY;
  }

  function priceLabel(interval) {
    if (normalizeInterval(interval) === 'annual') {
      return formatRand(SEAT_PRICE_ANNUAL) + ' per year per login';
    }
    return formatRand(SEAT_PRICE_MONTHLY) + ' per month per login';
  }

  function normalizeInterval(id) {
    var raw = text(id).toLowerCase();
    if (raw === 'annual' || raw === 'yearly' || raw === 'year') return 'annual';
    return DEFAULT_INTERVAL;
  }

  function rememberPlan(planId) {
    var id = normalizePlanId(planId);
    try {
      localStorage.setItem('fireS.companyPlan', id);
    } catch (_) {}
    try {
      if (root.currentCompanyAccess) root.currentCompanyAccess.plan = id;
    } catch (_) {}
    return id;
  }

  function rememberInterval(intervalId) {
    var id = normalizeInterval(intervalId);
    try {
      localStorage.setItem('fireS.billingInterval', id);
    } catch (_) {}
    try {
      if (root.currentCompanyAccess) root.currentCompanyAccess.billingInterval = id;
    } catch (_) {}
    return id;
  }

  function currentIntervalId() {
    try {
      var live = root.currentCompanyAccess && root.currentCompanyAccess.billingInterval;
      if (live) return normalizeInterval(live);
    } catch (_) {}
    try {
      return normalizeInterval(localStorage.getItem('fireS.billingInterval'));
    } catch (_) {}
    return DEFAULT_INTERVAL;
  }

  function duplicateSeatMessage(email) {
    var addr = text(email).toLowerCase() || 'This email';
    return (
      addr +
      ' already belongs to a company. One person is one company. Only that Owner can remove them under Personnel. Then they can Subscribe under another company. Do not enter it again.'
    );
  }

  function currentPlanId() {
    try {
      var live = root.currentCompanyAccess && root.currentCompanyAccess.plan;
      if (live) return normalizePlanId(live);
    } catch (_) {}
    try {
      return normalizePlanId(localStorage.getItem('fireS.companyPlan'));
    } catch (_) {}
    return DEFAULT_PLAN;
  }

  var STARTED_KEY = 'fireS.billingStartedOn';
  var RENEWS_KEY = 'fireS.billingRenewsOn';
  var DISMISS_KEY = 'fireS.expiryReminderDismissed';

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function todayKey(value) {
    var d = value ? new Date(value) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function addInterval(dateKey, interval) {
    var parts = String(dateKey || todayKey()).split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) d = new Date();
    if (normalizeInterval(interval) === 'annual') {
      d.setFullYear(d.getFullYear() + 1);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    return todayKey(d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()));
  }

  function formatLongDate(dateKey) {
    var parts = String(dateKey || '').split('-');
    if (parts.length < 3) return dateKey || '';
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return dateKey || '';
    try {
      return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
      return dateKey;
    }
  }

  function readStored(key) {
    try {
      return text(localStorage.getItem(key));
    } catch (_) {
      return '';
    }
  }

  function rememberStartedOn(dateKey) {
    var key = todayKey(dateKey);
    try {
      localStorage.setItem(STARTED_KEY, key);
    } catch (_) {}
    return key;
  }

  function rememberRenewsOn(dateKey) {
    var key = todayKey(dateKey);
    try {
      localStorage.setItem(RENEWS_KEY, key);
    } catch (_) {}
    try {
      if (root.currentCompanyAccess) root.currentCompanyAccess.billingRenewsOn = key;
    } catch (_) {}
    return key;
  }

  function currentRenewsOn() {
    try {
      var live = root.currentCompanyAccess && root.currentCompanyAccess.billingRenewsOn;
      if (live) return todayKey(live);
    } catch (_) {}
    var stored = readStored(RENEWS_KEY);
    return stored ? todayKey(stored) : '';
  }

  function startBillingPeriod(intervalId) {
    var interval = normalizeInterval(intervalId || currentIntervalId());
    var start = todayKey();
    rememberStartedOn(start);
    return rememberRenewsOn(addInterval(start, interval));
  }

  function ensureRenewsOn(intervalId) {
    var interval = normalizeInterval(intervalId || currentIntervalId());
    var today = todayKey();
    var started = readStored(STARTED_KEY) || today;
    if (!readStored(STARTED_KEY)) rememberStartedOn(started);
    var renews = currentRenewsOn() || addInterval(started, interval);
    var guard = 0;
    while (renews < today && guard < 48) {
      renews = addInterval(renews, interval);
      guard += 1;
    }
    return rememberRenewsOn(renews);
  }

  function daysUntilRenewal(intervalId) {
    var renews = ensureRenewsOn(intervalId);
    var today = todayKey();
    var a = new Date(today + 'T00:00:00');
    var b = new Date(renews + 'T00:00:00');
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function shouldShowExpiryReminder(intervalId) {
    var days = daysUntilRenewal(intervalId);
    if (days > 31) return false;
    var renews = currentRenewsOn();
    return readStored(DISMISS_KEY) !== renews;
  }

  function dismissExpiryReminder() {
    try {
      localStorage.setItem(DISMISS_KEY, currentRenewsOn());
    } catch (_) {}
  }

  function bothPriceLines(selectedId) {
    var selected = normalizeInterval(selectedId || currentIntervalId());
    return {
      monthly: 'Monthly · ' + formatRand(SEAT_PRICE_MONTHLY) + ' per month per login',
      annual: 'Annual · ' + formatRand(SEAT_PRICE_ANNUAL) + ' per year per login · 2 months free',
      selected: selected,
      saveNote: 'Annual saves R500 (2 months free).'
    };
  }

  function getSb() {
    try {
      if (root.supabaseClient) return root.supabaseClient;
    } catch (_) {}
    return null;
  }

  function companyId() {
    try {
      return text(root.currentUserProfile && root.currentUserProfile.companyId);
    } catch (_) {}
    return '';
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function renderPlanPicker(container, selectedId) {
    if (!container) return;
    var selected = normalizePlanId(selectedId || currentPlanId());
    var name = container.getAttribute('data-plan-name') || 'fireSPlanChoice';
    container.innerHTML = PLANS.map(function (plan) {
      var checked = plan.id === selected ? ' checked' : '';
      var selectedClass = plan.id === selected ? ' is-selected' : '';
      return (
        '<label class="fire-s-plan-card' + selectedClass + '">' +
          '<input type="radio" name="' + escapeHtml(name) + '" value="' + escapeHtml(plan.id) + '"' + checked + '>' +
          '<span>' +
            '<strong>' + escapeHtml(plan.name) + '</strong>' +
            '<small>' + escapeHtml(plan.audience) + ' · ' + escapeHtml(plan.summary) + '</small>' +
          '</span>' +
        '</label>'
      );
    }).join('');
    container.querySelectorAll('.fire-s-plan-card').forEach(function (card) {
      card.addEventListener('click', function () {
        container.querySelectorAll('.fire-s-plan-card').forEach(function (el) {
          el.classList.remove('is-selected');
        });
        card.classList.add('is-selected');
      });
    });
  }

  function selectedPlanFrom(container) {
    if (!container) return currentPlanId();
    var checked = container.querySelector('input[type="radio"]:checked');
    return normalizePlanId(checked && checked.value);
  }

  function renderBillingPicker(container, selectedId) {
    if (!container) return;
    var selected = normalizeInterval(selectedId || currentIntervalId());
    var name = container.getAttribute('data-interval-name') || 'fireSBillingChoice';
    container.innerHTML = INTERVALS.map(function (item) {
      var checked = item.id === selected ? ' checked' : '';
      var selectedClass = item.id === selected ? ' is-selected' : '';
      return (
        '<label class="fire-s-plan-card' + selectedClass + '">' +
          '<input type="radio" name="' + escapeHtml(name) + '" value="' + escapeHtml(item.id) + '"' + checked + '>' +
          '<span>' +
            '<strong>' + escapeHtml(item.name) + '</strong>' +
            '<small>' + escapeHtml(item.summary) + '</small>' +
          '</span>' +
        '</label>'
      );
    }).join('');
    container.querySelectorAll('.fire-s-plan-card').forEach(function (card) {
      card.addEventListener('click', function () {
        container.querySelectorAll('.fire-s-plan-card').forEach(function (el) {
          el.classList.remove('is-selected');
        });
        card.classList.add('is-selected');
      });
    });
  }

  function selectedIntervalFrom(container) {
    if (!container) return currentIntervalId();
    var checked = container.querySelector('input[type="radio"]:checked');
    return normalizeInterval(checked && checked.value);
  }

  async function persistCompanyPlan(planId, intervalId) {
    var id = rememberPlan(planId);
    var interval = rememberInterval(intervalId);
    startBillingPeriod(interval);
    var sb = getSb();
    var cid = companyId();
    if (!sb || !cid) return { ok: true, local: true, plan: id, interval: interval };

    try {
      var rpc = await sb.rpc('fire_s_set_company_plan', {
        p_plan: id,
        p_interval: interval
      });
      if (!rpc || !rpc.error) return { ok: true, plan: id, interval: interval, source: 'rpc' };
    } catch (_) {}

    try {
      var withInterval = await sb
        .from('companies')
        .update({ plan: id, billing_interval: interval })
        .eq('id', cid);
      if (!withInterval || !withInterval.error) {
        return { ok: true, plan: id, interval: interval, source: 'update' };
      }
      var updated = await sb.from('companies').update({ plan: id }).eq('id', cid);
      if (!updated || !updated.error) return { ok: true, plan: id, interval: interval, source: 'update-plan' };
      return { ok: false, plan: id, interval: interval, error: updated && updated.error };
    } catch (err) {
      return { ok: false, plan: id, interval: interval, error: err };
    }
  }

  root.fireSSubscriptionCatalog = {
    plans: plans,
    roles: roles,
    planById: planById,
    normalizePlanId: normalizePlanId,
    normalizeInterval: normalizeInterval,
    currentPlanId: currentPlanId,
    currentIntervalId: currentIntervalId,
    rememberPlan: rememberPlan,
    rememberInterval: rememberInterval,
    renderPlanPicker: renderPlanPicker,
    renderBillingPicker: renderBillingPicker,
    selectedPlanFrom: selectedPlanFrom,
    selectedIntervalFrom: selectedIntervalFrom,
    persistCompanyPlan: persistCompanyPlan,
    startBillingPeriod: startBillingPeriod,
    ensureRenewsOn: ensureRenewsOn,
    currentRenewsOn: currentRenewsOn,
    daysUntilRenewal: daysUntilRenewal,
    shouldShowExpiryReminder: shouldShowExpiryReminder,
    dismissExpiryReminder: dismissExpiryReminder,
    formatLongDate: formatLongDate,
    bothPriceLines: bothPriceLines,
    duplicateSeatMessage: duplicateSeatMessage,
    formatRand: formatRand,
    priceFor: priceFor,
    priceLabel: priceLabel,
    monthlyPrice: SEAT_PRICE_MONTHLY,
    annualPrice: SEAT_PRICE_ANNUAL,
    defaultPlanId: DEFAULT_PLAN,
    defaultIntervalId: DEFAULT_INTERVAL,
    note: 'Subscription per month per login is R250. Per year per login is R2 500. Phone and desktop with the same email count as one login. Each extra person is another subscription, paid by the owner on PayFast. Card details stay with PayFast.',
    billingNote: 'Subscription per month per login is R250. Per year per login is R2 500. Phone and desktop with the same email count as one login. Each extra person is another subscription. After Subscribe, pay on PayFast. Card details stay with PayFast.'
  };
})(window);
