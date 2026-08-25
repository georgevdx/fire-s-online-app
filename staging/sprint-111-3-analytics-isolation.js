/* FIRE-S Sprint 111.3 - Analytics Isolation Hard Fix
   Keeps operational inspection pages clean by removing statistical / management panels
   from the normal inspection flow. Analytics is opened only as a separate overlay workspace. */
(function () {
  'use strict';

  const VERSION = '111.3-analytics-isolation-hard-fix';

  const ANALYTICS_PANEL_IDS = [
    'sprint109HistoryPanel',
    'sprint1092ComparisonPanel',
    'sprint1093TrendPanel',
    'sprint110AiAssistPanel'
  ];

  const ANALYTICS_SELECTORS = [
    '#sprint109HistoryPanel',
    '#sprint1092ComparisonPanel',
    '#sprint1093TrendPanel',
    '#sprint110AiAssistPanel',
    '.s109-history-panel',
    '.s1092-comparison-panel',
    '.s1093-trend-panel',
    '.s110-ai-panel',
    '.s110-1-consolidated'
  ];

  function analyticsSection() {
    return document.getElementById('analyticsSection');
  }

  function isInsideAnalytics(node) {
    const section = analyticsSection();
    return !!(section && node && section.contains(node));
  }

  function removeOperationalAnalyticsPanels() {
    ANALYTICS_SELECTORS.forEach(selector => {
      document.querySelectorAll(selector).forEach(node => {
        if (!isInsideAnalytics(node)) {
          node.remove();
        }
      });
    });
  }

  function isolateAnalyticsWorkspace() {
    const section = analyticsSection();
    if (!section) return;

    if (section.parentElement !== document.body) {
      document.body.appendChild(section);
    }

    section.classList.add('fire-s-analytics-overlay');
    if (!document.body.classList.contains('fire-s-analytics-open')) {
      section.style.display = 'none';
    }
  }

  function showAnalyticsOverlay() {
    isolateAnalyticsWorkspace();
    removeOperationalAnalyticsPanels();

    const section = analyticsSection();
    if (!section) return;

    document.body.classList.add('fire-s-analytics-open');
    section.style.display = 'block';

    if (typeof window.fireSRenderAnalytics === 'function') {
      try { window.fireSRenderAnalytics(); } catch (error) { console.warn('Analytics refresh failed:', error); }
    }

    const content = document.getElementById('analyticsContent');
    if (content) content.scrollTop = 0;
  }

  function hideAnalyticsOverlay() {
    const section = analyticsSection();
    document.body.classList.remove('fire-s-analytics-open');
    if (section) section.style.display = 'none';
    removeOperationalAnalyticsPanels();
  }

  function bindAnalyticsButtons() {
    ['analyticsBtn', 'analyticsMenuBtn', 'refreshAnalyticsBtn'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn || btn.__fireSAnalyticsIsolated) return;
      btn.__fireSAnalyticsIsolated = true;
      btn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        showAnalyticsOverlay();
      }, true);
    });

    const closeBtn = document.getElementById('closeAnalyticsBtn');
    if (closeBtn && !closeBtn.__fireSAnalyticsIsolated) {
      closeBtn.__fireSAnalyticsIsolated = true;
      closeBtn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        hideAnalyticsOverlay();
      }, true);
    }
  }

  function addStartNewInspectionToMoreMenu() {
    const menu = document.getElementById('actionDropdown');
    if (!menu || document.getElementById('startNewInspectionMoreBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'startNewInspectionMoreBtn';
    btn.type = 'button';
    btn.textContent = 'Start New Inspection';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const project = window.currentProject || null;
      if (typeof window.startNewInspectionForPremises === 'function' && project?.id) {
        window.startNewInspectionForPremises(project.id);
      } else if (typeof window.startNewInspectionForPremises === 'function') {
        window.startNewInspectionForPremises();
      } else {
        alert('Start New Inspection is not available on this screen yet.');
      }
    });

    menu.insertBefore(btn, menu.firstChild);
  }

  function installStyles() {
    if (document.getElementById('sprint1113AnalyticsIsolationStyles')) return;

    const style = document.createElement('style');
    style.id = 'sprint1113AnalyticsIsolationStyles';
    style.textContent = `
      /* Hide management/statistical panels in the operational inspection flow. */
      body:not(.fire-s-analytics-open) #sprint109HistoryPanel,
      body:not(.fire-s-analytics-open) #sprint1092ComparisonPanel,
      body:not(.fire-s-analytics-open) #sprint1093TrendPanel,
      body:not(.fire-s-analytics-open) #sprint110AiAssistPanel,
      body:not(.fire-s-analytics-open) .s109-history-panel,
      body:not(.fire-s-analytics-open) .s1092-comparison-panel,
      body:not(.fire-s-analytics-open) .s1093-trend-panel,
      body:not(.fire-s-analytics-open) .s110-ai-panel,
      body:not(.fire-s-analytics-open) .s110-1-consolidated {
        display: none !important;
      }

      #analyticsSection.fire-s-analytics-overlay {
        position: fixed !important;
        inset: 12px !important;
        z-index: 99999 !important;
        max-width: 1180px !important;
        width: calc(100vw - 24px) !important;
        height: calc(100vh - 24px) !important;
        margin: 0 auto !important;
        overflow: auto !important;
        background: #ffffff !important;
        border: 2px solid #cbd5e1 !important;
        border-radius: 18px !important;
        box-shadow: 0 24px 80px rgba(15,23,42,.35) !important;
        padding: 18px !important;
      }

      body.fire-s-analytics-open::before {
        content: '';
        position: fixed;
        inset: 0;
        z-index: 99998;
        background: rgba(15,23,42,.48);
        backdrop-filter: blur(2px);
      }

      body.fire-s-analytics-open {
        overflow: hidden;
      }

      #analyticsSection .analytics-header {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #ffffff;
        padding-bottom: 12px;
        border-bottom: 1px solid #e2e8f0;
      }

      #startNewInspectionMoreBtn {
        background: #b91c1c !important;
        color: #fff !important;
        font-weight: 800 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function watchForReinsertedPanels() {
    if (window.__fireSAnalyticsIsolationObserver) return;

    const observer = new MutationObserver(() => {
      isolateAnalyticsWorkspace();
      removeOperationalAnalyticsPanels();
      bindAnalyticsButtons();
      addStartNewInspectionToMoreMenu();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__fireSAnalyticsIsolationObserver = observer;
  }

  function wrapOpenProject() {
    const original = window.openProject;
    if (typeof original !== 'function' || original.__s1113Wrapped) return;

    const wrapped = function () {
      hideAnalyticsOverlay();
      const result = original.apply(this, arguments);
      setTimeout(removeOperationalAnalyticsPanels, 100);
      setTimeout(removeOperationalAnalyticsPanels, 500);
      setTimeout(removeOperationalAnalyticsPanels, 1200);
      setTimeout(addStartNewInspectionToMoreMenu, 1200);
      return result;
    };

    wrapped.__s1113Wrapped = true;
    window.openProject = wrapped;
  }

  function install() {
    installStyles();
    isolateAnalyticsWorkspace();
    removeOperationalAnalyticsPanels();
    bindAnalyticsButtons();
    addStartNewInspectionToMoreMenu();
    watchForReinsertedPanels();
    wrapOpenProject();

    window.FireSAnalyticsIsolation1113 = {
      version: VERSION,
      show: showAnalyticsOverlay,
      hide: hideAnalyticsOverlay,
      cleanup: removeOperationalAnalyticsPanels
    };

    console.log('Fire-S Sprint 111.3 installed:', VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(install, 700));
  } else {
    setTimeout(install, 700);
  }
})();
