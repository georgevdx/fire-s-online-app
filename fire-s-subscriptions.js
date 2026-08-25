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
  var SEAT_PRICE_MONTHLY = 349;
  var SEAT_PRICE_ANNUAL = 3490;
  var PLAN_IDS = ['standard', 'seat', 'field', 'operations', 'executive', 'enterprise'];
  var INTERVALS = [
    {
      id: 'monthly',
      name: 'Monthly · R349 per email',
      summary: 'R349 every month, per email. The owner pays. Inspectors do not pay. Same email on phone and desktop is one login.'
    },
    {
      id: 'annual',
      name: 'Annual · R3 490 per email',
      summary: 'R3 490 once a year, per email (2 months free). The owner pays. Inspectors do not pay. Same email on phone and desktop is one login.'
    }
  ];

  const PLANS = [
    {
      id: 'standard',
      name: 'Fire-S seat',
      audience: 'Every email',
      seats: 'One subscription per email, paid by the owner',
      summary: 'R349 per month or R3 490 per year, per email. The owner pays for every subscribed email. Inspectors and other staff do not pay.',
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
      return formatRand(SEAT_PRICE_ANNUAL) + ' per email per year';
    }
    return formatRand(SEAT_PRICE_MONTHLY) + ' per email per month';
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
      ' is already a subscription the owner pays for. That person logs in on phone and desktop with the same email. Do not enter it again.'
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
    duplicateSeatMessage: duplicateSeatMessage,
    formatRand: formatRand,
    priceFor: priceFor,
    priceLabel: priceLabel,
    monthlyPrice: SEAT_PRICE_MONTHLY,
    annualPrice: SEAT_PRICE_ANNUAL,
    defaultPlanId: DEFAULT_PLAN,
    defaultIntervalId: DEFAULT_INTERVAL,
    note: 'The owner pays R349 per month or R3 490 per year for every subscribed email. Inspectors and other staff do not pay. Each new email is a new subscription, invoiced to the owner. No VAT — Company S is not VAT-registered. Phone and desktop share that login. The app does not take a card yet; Company S invoices the owner.',
    billingNote: 'The owner pays R349 / month or R3 490 / year for each subscribed email. Inspectors do not pay. No VAT. Phone and desktop share that login. No card is taken in Fire-S yet.'
  };
})(window);
