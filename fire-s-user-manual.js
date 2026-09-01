/* ============================================================
   Fire-S User manual
   Downloadable guide for subscribers: first screen to last action,
   roles, and future subscription plans.
   ============================================================ */
(function fireSUserManual() {
  'use strict';

  const WORKSPACE_IDS = [
    'homeSection',
    'servicesSection',
    'projectListSection',
    'projectFormSection',
    'findingsCentreSection',
    'companyTeamSection',
    'companyLetterheadSection',
    'testSamplesSection',
    'inspectorBoardSection',
    'managementDashboardSection',
    'fireSSubscribeSection',
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
    }[ch]));
  }

  function currentRole() {
    try {
      if (typeof window.resolveFireSHomeRole === 'function') {
        return text(window.resolveFireSHomeRole());
      }
    } catch (_) {}
    return text(window.currentUserProfile?.role);
  }

  function showFees() {
    const role = currentRole().toLowerCase();
    return [
      'company_owner',
      'owner',
      'super_admin',
      'manager'
    ].includes(role);
  }

  function isInspectorManual() {
    const role = currentRole().toLowerCase();
    return role === 'inspector' || role === 'viewer' || role === 'field_inspector';
  }

  function canOpen() {
    const role = currentRole().toLowerCase();
    return [
      'inspector',
      'manager',
      'company_owner',
      'owner',
      'super_admin',
      'viewer'
    ].includes(role);
  }

  function companyName() {
    return (
      text(window.currentUserProfile?.companyName) ||
      text(window.currentCompanyAccess?.name) ||
      'Your company'
    );
  }

  function catalog() {
    return window.fireSSubscriptionCatalog || { plans: () => [], roles: () => [], note: '' };
  }

  function setMessage(message, isError) {
    const el = byId('userManualMessage');
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

  function roleTableHtml() {
    const rows = catalog().roles().map(role => `
      <tr>
        <td><strong>${esc(role.name)}</strong><br><small>${esc(role.plan)}</small></td>
        <td><ul>${role.can.map(item => `<li>${esc(item)}</li>`).join('')}</ul></td>
        <td>${
          role.cannot.length
            ? `<ul>${role.cannot.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`
            : '—'
        }</td>
      </tr>
    `).join('');
    return `
      <div class="user-manual-table-wrap">
        <table class="user-manual-table">
          <thead>
            <tr><th>Level</th><th>Can do</th><th>Cannot do</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function planTableHtml() {
    const rows = catalog().plans().map(plan => `
      <tr>
        <td><strong>${esc(plan.name)}</strong><br><small>${esc(plan.audience)}</small></td>
        <td>${esc(plan.seats)}</td>
        <td>${esc(plan.summary)}</td>
        <td><ul>${plan.includes.map(item => `<li>${esc(item)}</li>`).join('')}</ul></td>
      </tr>
    `).join('');
    return `
      <div class="user-manual-table-wrap">
        <table class="user-manual-table">
          <thead>
            <tr><th>Subscription</th><th>Seats</th><th>What it is</th><th>Includes</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function manualHtml() {
    const today = new Date().toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return `
      <div class="user-manual-cover">
        <div class="user-manual-kicker">${isInspectorManual() ? 'Inspector guide' : 'Subscriber guide'}</div>
        <h1>Fire-S User Manual</h1>
        <p>From the first screen you see, to the last action you can take.</p>
        <div class="user-manual-meta">
          ${esc(companyName())} · ${esc(today)}${showFees() ? ' · ' + esc(catalog().note || '') : ' · Your owner pays. You do not Subscribe and you do not see the fees.'}
        </div>
      </div>

      <div class="user-manual-toc">
        <strong>Contents</strong>
        <ol>
          <li>First visual — Loading</li>
          <li>Access — Login, create password, register company</li>
          <li>Home for each level</li>
          <li>Inspection Gateway</li>
          <li>Fill an inspection (first to last action)</li>
          <li>Client PDF and sharing</li>
          <li>Findings, schedule and reports</li>
          <li>Company details, people and inspectors</li>
          <li>Management dashboard (tablet / PC)</li>
          <li>Levels — what each person can do</li>
          <li>${showFees() ? 'Subscriptions' : 'Who pays'}</li>
          <li>Download this manual</li>
        </ol>
      </div>

      <article class="user-manual-chapter">
        <h2>1. First visual — Loading</h2>
        <p>When you open Fire-S you first see a dark screen: <strong>Fire-S · Loading</strong>.</p>
        <p>Wait until Home appears. Do not tap around during Loading.</p>
      </article>

      <article class="user-manual-chapter">
        <h2>2. Access — the first working screen</h2>
        <p>If you are not signed in, Home shows one <strong>Access</strong> page. There is no separate Login page after that. On Access you:</p>
        <ol>
          <li>Type your email and password, then tap <strong>Login</strong>.</li>
          <li>Or tap <strong>First time? Create password</strong> if your owner already added your email.</li>
          <li>Or tap <strong>Subscribing New Company</strong> if you are a new business owner.</li>
          <li>Or tap <strong>Additional services</strong>, then tap a service such as <strong>Fire Safety Consultancy</strong>, <strong>Rational Fire Design Support</strong>, or <strong>Fire Plan Assistance (Assist with approval from Local Government)</strong> and send the request. After Login, the super user sees those requests under Additional Services → View Saved Service Requests.</li>
        </ol>
        <h3>Login</h3>
        <ol>
          <li>On Access, type your email and password.</li>
          <li>Tap <strong>Login</strong>.</li>
          <li>Only one instrument at a time may use that subscribed email. If you Login on a second phone or computer, the first one is signed out. Same email is still one paid subscription — do not Subscribe twice.</li>
          <li>If you forgot the password, type your email, then tap <strong>Forgot password</strong>.</li>
          <li>Check Inbox and Junk. The email is often from Supabase. Outlook and Live hide it.</li>
          <li>Open the link in that email. Fire-S opens on <strong>Choose a new password</strong>.</li>
          <li>Wait one minute before you tap Forgot password again.</li>
          <li>Type a new password twice, tap <strong>Save</strong>, then <strong>Login</strong>.</li>
        </ol>
        <h3>Create password (staff, first time)</h3>
        <p>Inspectors and managers never Subscribe. The owner already paid when they tapped Subscribe this email on the subscription page.</p>
        <ol>
          <li>Your owner adds your email in <strong>Personnel</strong> as Inspector or Manager. That is the subscription. The owner pays.</li>
          <li>You can be anywhere. Open Fire-S on your phone.</li>
          <li>On Access tap <strong>First time? Create password</strong>.</li>
          <li>Type that same email and choose a password.</li>
          <li>Tap <strong>Create password</strong>, then <strong>Login</strong>.</li>
          <li>Do <strong>not</strong> tap Subscribe. Subscribe is only for a new company owner.</li>
        </ol>
        <h3>Subscribe (Owner only)</h3>
        ${
          showFees()
            ? `<ol>
          <li>On Access tap <strong>Subscribing New Company</strong>.</li>
          <li>Type the company name, your email and a password. You pay R250 / month (or R2 500 / year) for that subscription. The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S.</li>
          <li>Tap <strong>Monthly</strong> or <strong>Annual</strong>.</li>
          <li>Tick the box that you agree to the Terms and the Privacy policy.</li>
          <li>Tap <strong>Subscribe</strong>.</li>
          <li>If you are already signed in, type the company name, choose Monthly or Annual, tick the box, then tap <strong>Subscribe</strong>.</li>
        </ol>
        <p>No card is taken in the app yet. Company S invoices the owner R250 per subscription per month, or R2 500 per year. The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. No VAT is added. A second phone uses Login with the same email — do not Subscribe again.</p>
        <p>Read the <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a> and the <a href="terms.html" target="_blank" rel="noopener">Terms and conditions</a> before you subscribe.</p>`
            : `<p>Inspectors never open Subscribe. If you see it on Access, go back and use Login or Create password. Your owner pays. You do not see the subscription fees.</p>`
        }
        <h3>Waiting</h3>
        <p>After Create password you should land on Inspector Home. If you see Almost ready, tap <strong>Check again</strong>. Do not tap Subscribe. Your owner already paid when they added your email.</p>
      </article>

      <article class="user-manual-chapter">
        <h2>3. Home for each level</h2>
        <p>After Access, Home changes to match your level.</p>
        <ul>
          <li><strong>Owner</strong> — Executive Command Centre. Same as Manager, plus company control. Home shows a desktop address. On a computer that address opens the Management dashboard.</li>
          <li><strong>Manager</strong> — Operations Centre. Stats, inspections, people, company details, dashboard. Home shows the same desktop address.</li>
          <li><strong>Inspector</strong> — Home shows <strong>Scheduled priority</strong>: every inspection you booked or that was assigned to you, soonest date first. Finish and finalise one and it leaves this list. Open <strong>Inspection Gateway</strong> to see the company's inspections.</li>
          <li><strong>Viewer</strong> — Review only. Reports and status, no editing of people or inspections.</li>
        </ul>
        <p>Top stats (Owner / Manager): Compliant Sites, Premises Requiring Action, Overdue Inspections, Inspections This Month. Tap a number to open that list.</p>
        <p>Home has a <strong>Reports</strong> button. It opens completed inspections. Open one, then tap Export PDF.</p>
      </article>

      <article class="user-manual-chapter">
        <h2>4. Inspection Gateway</h2>
        <ol>
          <li>On Home tap <strong>Inspection Gateway</strong>.</li>
          <li>Search by site, address, inspector, number or date.</li>
          <li>Use filters such as overdue, this month, or completed.</li>
          <li>Tap a card to open that inspection.</li>
          <li>Use <strong>Schedule</strong> when you must book a new site or follow-up. Owner and Manager pick the inspector who must visit. That inspector gets an email with the premises details.</li>
        </ol>
      </article>

      <article class="user-manual-chapter">
        <h2>5. Fill an inspection — first action to last action</h2>
        <p>Open a site (or start a new one). Work top to bottom:</p>
        <ol>
          <li><strong>Inspection Information</strong> — site name, address, occupancy, inspector, date.</li>
          <li><strong>GPS</strong> — capture the map pin so the street number can fill in.</li>
          <li><strong>Occupancy Requirements</strong> — read what that occupancy needs.</li>
          <li><strong>Q&amp;A Checklist</strong> — tap <strong>Expand</strong> to open the questions. Tap Compliant, Action Required or N/A. Action Required becomes a finding.</li>
          <li><strong>Photo Evidence</strong> — take or choose pictures. Add a short note on each photo.</li>
          <li><strong>Inspector Comments / Conclusion</strong> — write the close-out note.</li>
          <li><strong>Schedule Next Inspection</strong> — follow-up date or recurring cycle if needed.</li>
          <li>Save. The last action on an inspection is the <strong>client PDF</strong> (next chapter).</li>
        </ol>
        <p>The Passport / Workspace strip stays hidden while you fill, so the questions stay on screen.</p>
      </article>

      <article class="user-manual-chapter">
        <h2>6. Client PDF and sharing — last action on a job</h2>
        <ol>
          <li>Open the inspection.</li>
          <li>Tap <strong>Report</strong> or <strong>PDF</strong>.</li>
          <li>The PDF starts with the company letterhead: company logo top-left, Fire-S reminder top-right.</li>
          <li>Photos print in an appendix.</li>
          <li>Share the file, or save it on the phone.</li>
        </ol>
        <p>The Fire-S picture on the PDF is only a reminder that the report was prepared with Fire-S. It is not the company logo.</p>
      </article>

      <article class="user-manual-chapter">
        <h2>7. Findings, schedule and reports</h2>
        <ul>
          <li><strong>Premises Requiring Action</strong> — sites with No answers or open actions.</li>
          <li><strong>Overdue Inspections</strong> — booked work that is late.</li>
          <li><strong>Schedule</strong> — Owner/Manager: book a new site, pick the inspector who must visit, Save. That inspector gets an email with the premises details and sees the booking on Home under Scheduled priority. If they have more than one, Home shows the list. Finish and finalise an inspection and it leaves that list. If it is not assigned to them, they use Inspection Gateway.</li>
          <li><strong>Reports</strong> — Home → Reports. This list is completed inspections. Open one, then tap Export PDF.</li>
          <li><strong>Support</strong> — request help or send a review request.</li>
        </ul>
      </article>

      <article class="user-manual-chapter">
        <h2>8. Company details, people and inspectors</h2>
        <p>Owner and Manager only.</p>
        <h3>Company details</h3>
        <ol>
          <li>Home → <strong>Company details</strong>.</li>
          <li>Type name, address, telephone, cell and email.</li>
          <li>Tap <strong>Choose logo picture</strong>, or <strong>Sit sample Company S logo in</strong>.</li>
          <li>Tap <strong>Save company details</strong>.</li>
        </ol>
        <h3>Personnel</h3>
        <p>Adding a person is a subscription you (the owner) place. The inspector or manager does not Subscribe and does not pay. They can work remotely.</p>
        <ol>
          <li>Home → <strong>Personnel</strong> / <strong>People</strong>.</li>
          <li>Tap <strong>Add inspector / manager</strong>. That opens the subscription page.</li>
          <li>Type their email, choose Inspector or Manager, then tap <strong>Subscribe this email</strong>. Company S invoices you, not them.</li>
          <li>Tell them: Open Fire-S → <strong>2. Create password</strong> → same email → choose a password → Login. They must not tap Subscribe on Access.</li>
          <li>To send someone to a premises: Home → <strong>Schedule</strong> → fill the site → <strong>Assign to inspector</strong> → Save. They get an email with the address and date.</li>
          <li>A second phone or a desktop uses <strong>Login</strong> with that same email. Do not add the email again.</li>
        </ol>
        <h3>Inspectors board</h3>
        <p>Select one inspector, view the whole team, or Compare.</p>
        <h3>Test samples</h3>
        <p>Test samples is a training tool. It is hidden on Home so clients do not see it.</p>
      </article>

      <article class="user-manual-chapter">
        <h2>9. Management dashboard (tablet / PC)</h2>
        <p>Owner and Manager: Home → <strong>Management dashboard</strong>.</p>
        <p>On a computer, type the desktop address from Home. After login, Fire-S opens the Management dashboard in a wide layout. Inspectors keep the phone layout. Access (login) still shows first if you are not signed in.</p>
        <p>Turn a tablet sideways, or open Fire-S on a laptop / PC. The first screen is a short management view, not a wall of graphs. Tap a number or a coloured graph piece to open the exact premises or Action Items underneath.</p>
        <ul>
          <li>Four cards: portfolio compliance %, Critical/High open items, overdue inspections, due this week</li>
          <li>Compliance status and the 12-month compliance trend</li>
          <li>Open Action Items by priority and age (0–7, 8–30, 31–60, 61–90, more than 90 days)</li>
          <li>Worst performing premises and recurring findings across sites</li>
          <li>Activity list at the bottom</li>
          <li><strong>Download Power BI data</strong> — CSV files for Microsoft Power BI Desktop</li>
        </ul>
      </article>

      <article class="user-manual-chapter">
        <h2>10. Levels — what each person can do</h2>
        ${roleTableHtml()}
      </article>

      <article class="user-manual-chapter">
        <h2>11. ${showFees() ? 'Subscriptions' : 'Who pays'}</h2>
        ${
          showFees()
            ? `<p>Fire-S is a paid subscription: <strong>R250 per month</strong> or <strong>R2 500 per year</strong> (2 months free), per subscription. The main subscriber (owner) may invite inspectors to subscribe under the main company. Phone and desktop share that login — do not enter the same email twice.</p>
        <p>Fire-S, the screens and the question list belong to Company S. You may use the app. You may not copy it or feed it to an AI to make a look-alike product.</p>
        <p>New companies: only the owner taps <strong>3. Subscribe</strong> on Access. Inspectors and managers never Subscribe. When the owner adds an email in Personnel, that tap is the new subscription for that person. Company S invoices the owner. No VAT is added. No card is taken in the app yet.</p>
        <p>Owners open Home → <strong>Subscription</strong> to choose monthly or annual (annual is 2 months free). An annual subscription renews automatically until you cancel.</p>
        <p>Seven days before the expiry date, Owner Home shows a reminder. Tap <strong>Renew</strong> to keep this login, or <strong>Cancel subscription</strong> to stop. Close hides the reminder until the next expiry date.</p>
        <p>To cancel: only the Owner opens Home → <strong>Subscription</strong>, reads the numbered steps, taps <strong>Cancel subscription</strong>, and confirms. Invoices for the next period stop. The login stays until the expiry date already shown. Cancelling does not delete the company name or inspections — that data stays in the cloud.</p>
        <p>To subscribe again: Login with the <strong>same owner email</strong>. Do not tap Subscribe on Access and do not type a new company name. Open Home → <strong>Subscription</strong>, choose Monthly or Annual, tap <strong>Subscribe again</strong>. Company S invoices you. Inspections stay in this same company.</p>
        ${planTableHtml()}
        <div class="user-manual-note">
          ${esc(catalog().note || '')}
          Roles (Inspector, Manager, Owner, Viewer) change what the person can do. They do not change who pays: the owner pays.
        </div>`
            : `<p>Your owner pays for Fire-S. Inspectors and other staff do not pay and never Subscribe. You never see the subscription fees. Phone and desktop share your login — do not enter the same email twice.</p>
        <p>If your owner added your email, use <strong>Create password</strong> then <strong>Login</strong>. Do not tap Subscribe.</p>`
        }
        <h3>Install Fire-S on a phone</h3>
        <ol>
          <li>Open Fire-S in Chrome.</li>
          <li>On Access tap <strong>Install on this phone</strong>, or Chrome menu → Add to Home screen.</li>
          <li>Google Play Store listing is a separate Company S upload. Until that listing is live, the home-screen icon is the download.</li>
        </ol>
      </article>

      <article class="user-manual-chapter">
        <h2>12. Download this manual</h2>
        <ol>
          <li>On Home tap <strong>User manual</strong>.</li>
          <li>Tap <strong>Download PDF</strong> (or <strong>Download HTML</strong> if PDF is blocked).</li>
          <li>Open the file from your Downloads folder, or share it with staff.</li>
        </ol>
      </article>
    `;
  }

  function paint() {
    const root = byId('userManualPrintRoot');
    if (root) root.innerHTML = manualHtml();
    const kicker = document.querySelector('.user-manual-intro .user-manual-kicker');
    const copy = document.querySelector('.user-manual-intro p');
    if (kicker) kicker.textContent = isInspectorManual() ? 'Inspector guide' : 'Subscriber guide';
    if (copy) {
      copy.textContent = showFees()
        ? 'This is the subscriber manual. Download it from the app as a PDF. It covers every level, every main action, and the subscription packages.'
        : 'This is the Fire-S inspector guide. Download it as a PDF. It covers inspection work. Your owner pays — you do not see the fees.';
    }
  }

  function goHome() {
    const section = byId('userManualSection');
    if (section) section.style.display = 'none';
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
  }

  function openManual() {
    if (!canOpen()) {
      alert('Sign in first. The User manual is for subscribers (Inspector, Manager, Owner or Viewer).');
      return;
    }
    hideOtherSections();
    const section = byId('userManualSection');
    if (section) section.style.display = 'block';
    paint();
    setMessage('Scroll the guide, then tap Download PDF to save it on this device.');
    try {
      if (typeof window.updateFloatingBackButton === 'function') {
        window.updateFloatingBackButton();
      }
    } catch (_) {}
  }

  function downloadHtml() {
    const root = byId('userManualPrintRoot');
    if (!root) return;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Fire-S User Manual</title>
      <style>body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#111}h1,h2{color:#b71c1c}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;vertical-align:top}th{background:#111;color:#fff}</style>
      </head><body>${root.innerHTML}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Fire-S-User-Manual.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setMessage('HTML copy saved. Open it from Downloads.');
  }

  async function downloadPdf() {
    const root = byId('userManualPrintRoot');
    if (!root) return;
    setMessage('Preparing PDF…');
    if (typeof html2pdf !== 'function') {
      downloadHtml();
      setMessage('PDF tool is not available. An HTML copy was saved instead.', true);
      return;
    }
    try {
      await html2pdf()
        .set({
          margin: [12, 12, 14, 12],
          filename: 'Fire-S-User-Manual.pdf',
          image: { type: 'jpeg', quality: 0.92 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['.user-manual-chapter'] }
        })
        .from(root)
        .save();
      setMessage('PDF saved. Open it from Downloads or share it with staff.');
    } catch (error) {
      downloadHtml();
      setMessage('PDF failed. An HTML copy was saved instead.', true);
    }
  }

  function bind() {
    const back = byId('userManualBackBtn');
    const pdf = byId('userManualPdfBtn');
    const html = byId('userManualHtmlBtn');
    if (back && !back.__fireSBound) {
      back.__fireSBound = true;
      back.addEventListener('click', goHome);
    }
    if (pdf && !pdf.__fireSBound) {
      pdf.__fireSBound = true;
      pdf.addEventListener('click', () => {
        downloadPdf().catch(() => downloadHtml());
      });
    }
    if (html && !html.__fireSBound) {
      html.__fireSBound = true;
      html.addEventListener('click', downloadHtml);
    }
  }

  function boot() {
    bind();
    const btn = byId('cmdUserManualBtn');
    if (btn && !btn.__fireSBound) {
      btn.__fireSBound = true;
      btn.addEventListener('click', event => {
        if (event) event.preventDefault();
        openManual();
      });
    }
  }

  window.fireSOpenUserManual = openManual;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
