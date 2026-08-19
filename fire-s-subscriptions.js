/* ============================================================
   Fire-S subscriber plans (future catalogue)
   Shared by the User manual and Management dashboard.
   These plans are not billed in the app yet.
   ============================================================ */
(function fireSSubscriptions(root) {
  'use strict';

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
        'Register the company',
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

  function plans() {
    return PLANS.slice();
  }

  function roles() {
    return ROLES.slice();
  }

  function planById(id) {
    return PLANS.find(plan => plan.id === id) || null;
  }

  root.fireSSubscriptionCatalog = {
    plans,
    roles,
    planById,
    note: 'Future subscriber catalogue. The live app is not billing these plans yet.'
  };
})(window);
