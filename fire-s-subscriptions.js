/* ============================================================
   Fire-S subscriber plans
   Shared by Access, Home, User manual and Play Store listing.
   Card payment is not taken in the app yet. The chosen plan is stored
   on the company so Company S can bill later.
   ============================================================ */
(function fireSSubscriptions(root) {
  'use strict';

  var DEFAULT_PLAN = 'executive';
  var PLAN_IDS = ['field', 'operations', 'executive', 'enterprise'];

  const PLANS = [
    {
      id: 'field',
      name: 'Fire-S Field',
      audience: 'Inspectors',
      seats: 'Inspector seats',
      summary: 'Phone and tablet field work: find a site, fill Q&A, take photos, make the client PDF.',
      includes: [
        'Inspection Gateway',
        'Checklist Q&A and Expand',
        'Photo evidence and GPS',
        'Client PDF for that inspection',
        'User manual download'
      ],
      excludes: [
        'Personnel',
        'Company details / letterhead edit',
        'Management dashboard',
        'Test samples'
      ]
    },
    {
      id: 'operations',
      name: 'Fire-S Operations',
      audience: 'Managers',
      seats: 'Manager seats + Field',
      summary: 'Day-to-day control of the field team: actions, overdue work, schedule and reports.',
      includes: [
        'Everything in Field',
        'Operations Centre Home',
        'Inspectors board and compare',
        'Schedule and follow-ups',
        'Findings / premises requiring action',
        'Personnel (add Inspectors and Managers)',
        'Company details for the client PDF',
        'Management dashboard (tablet / PC)'
      ],
      excludes: [
        'Enterprise support hours'
      ]
    },
    {
      id: 'executive',
      name: 'Fire-S Executive',
      audience: 'Owners',
      seats: 'Owner seat + Operations + Field',
      summary: 'Company-wide control: letterhead, people, compliance graphs and Power BI data export.',
      includes: [
        'Everything in Operations',
        'Executive Command Centre',
        'Management dashboard on tablet, laptop and PC',
        'Power BI-style graphs from live inspection data',
        'CSV download for Microsoft Power BI Desktop',
        'Company logo and letterhead on client PDFs'
      ],
      excludes: []
    },
    {
      id: 'enterprise',
      name: 'Fire-S Enterprise',
      audience: 'Larger companies',
      seats: 'Extra Owner / Manager / Inspector seats',
      summary: 'Executive plus extra seats, test samples for training, and support.',
      includes: [
        'Everything in Executive',
        'Extra Inspector, Manager and Owner seats',
        'Test samples (load and later delete training inspections)',
        'Services / Support requests',
        'Priority help from Company S'
      ],
      excludes: []
    }
  ];

  const ROLES = [
    {
      id: 'inspector',
      name: 'Inspector',
      plan: 'Field',
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
      plan: 'Operations',
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
      plan: 'Executive',
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
      plan: 'Add-on (read only)',
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
    if (PLAN_IDS.indexOf(raw) >= 0) return raw;
    if (raw === 'development' || raw === 'local' || raw === 'trial' || raw === 'owner') {
      return DEFAULT_PLAN;
    }
    return DEFAULT_PLAN;
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

  async function persistCompanyPlan(planId) {
    var id = rememberPlan(planId);
    var sb = getSb();
    var cid = companyId();
    if (!sb || !cid) return { ok: true, local: true, plan: id };

    try {
      var rpc = await sb.rpc('fire_s_set_company_plan', { p_plan: id });
      if (!rpc || !rpc.error) return { ok: true, plan: id, source: 'rpc' };
    } catch (_) {}

    try {
      var updated = await sb.from('companies').update({ plan: id }).eq('id', cid);
      if (!updated || !updated.error) return { ok: true, plan: id, source: 'update' };
      return { ok: false, plan: id, error: updated && updated.error };
    } catch (err) {
      return { ok: false, plan: id, error: err };
    }
  }

  root.fireSSubscriptionCatalog = {
    plans: plans,
    roles: roles,
    planById: planById,
    normalizePlanId: normalizePlanId,
    currentPlanId: currentPlanId,
    rememberPlan: rememberPlan,
    renderPlanPicker: renderPlanPicker,
    selectedPlanFrom: selectedPlanFrom,
    persistCompanyPlan: persistCompanyPlan,
    defaultPlanId: DEFAULT_PLAN,
    note: 'Choose a package when you subscribe. Price is confirmed by Company S. The app does not take a card yet.',
    billingNote: 'No card is taken in Fire-S yet. Company S confirms the price and invoices the owner.'
  };
})(window);
