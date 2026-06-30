/* =====================================================
   FIRE-S Sprint 108.1
   Intelligent Risk Engine v1.0
   Safe add-on module: weighted compliance + health + risk.
   ===================================================== */
(function () {
  'use strict';

  const DEFAULT_WEIGHT = 3;

  const ITEM_RULES = {
    '1': { category: 'Fire Equipment', weight: 7, critical: false },
    '2': { category: 'Means of Escape', weight: 10, critical: true },
    '3': { category: 'Means of Escape', weight: 6, critical: false },
    '4': { category: 'Housekeeping', weight: 5, critical: false },
    '5': { category: 'Hazardous Processes', weight: 9, critical: true }
  };

  const CATEGORY_WEIGHTS = {
    'Means of Escape': 10,
    'Fire Detection': 10,
    'Sprinklers': 10,
    'Smoke Control': 9,
    'Hazardous Processes': 9,
    'Fire Doors': 8,
    'Emergency Lighting': 8,
    'Fire Equipment': 7,
    'Hydrants': 7,
    'Fire Water Supply': 7,
    'Electrical': 6,
    'Housekeeping': 5,
    'Documentation': 3,
    'Administration': 2
  };

  function normaliseAnswer(value) {
    return String(value || '').trim().toLowerCase();
  }

  function inferRule(answer) {
    const itemNumber = String(answer?.itemNumber || answer?.['Item Number'] || '').trim();
    if (ITEM_RULES[itemNumber]) return ITEM_RULES[itemNumber];

    const text = String(
      answer?.question ||
      answer?.checklistItem ||
      answer?.text ||
      answer?.['Checklist Item'] ||
      ''
    ).toLowerCase();

    if (/escape|exit|egress|route/.test(text)) return { category: 'Means of Escape', weight: 10, critical: /blocked|obstruct/.test(text) };
    if (/sprinkler/.test(text)) return { category: 'Sprinklers', weight: 10, critical: true };
    if (/alarm|detection|detector/.test(text)) return { category: 'Fire Detection', weight: 10, critical: true };
    if (/smoke/.test(text)) return { category: 'Smoke Control', weight: 9, critical: true };
    if (/door/.test(text)) return { category: 'Fire Doors', weight: 8, critical: /fire/.test(text) };
    if (/emergency light|lighting/.test(text)) return { category: 'Emergency Lighting', weight: 8, critical: false };
    if (/extinguisher|hose reel|equipment/.test(text)) return { category: 'Fire Equipment', weight: 7, critical: false };
    if (/hydrant|water|pump|tank/.test(text)) return { category: 'Fire Water Supply', weight: 7, critical: /pump|tank|water supply/.test(text) };
    if (/electrical|db|distribution board/.test(text)) return { category: 'Electrical', weight: 6, critical: false };
    if (/storage|housekeeping|combustible|waste/.test(text)) return { category: 'Housekeeping', weight: 5, critical: false };
    if (/document|certificate|coc|service record|maintenance/.test(text)) return { category: 'Documentation', weight: 3, critical: false };

    return { category: 'Administration', weight: DEFAULT_WEIGHT, critical: false };
  }

  function getHealthRating(score) {
    if (score === null || score === undefined) return 'No scored data';
    if (score >= 96) return 'Excellent';
    if (score >= 90) return 'Very Good';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Needs Attention';
    if (score >= 60) return 'Poor';
    return 'Critical';
  }

  function getRiskLevel(score, criticalFailures) {
    if (criticalFailures >= 2) return 'Critical';
    if (criticalFailures >= 1) return 'High';
    if (score === null || score === undefined) return 'Unknown';
    if (score >= 90) return 'Low';
    if (score >= 75) return 'Medium';
    if (score >= 60) return 'High';
    return 'Critical';
  }

  function getRiskClass(riskLevel) {
    const value = String(riskLevel || '').toLowerCase();
    if (value === 'low') return 'compliance-strong';
    if (value === 'medium') return 'compliance-watch';
    if (value === 'high') return 'compliance-risk';
    if (value === 'critical') return 'compliance-critical';
    return 'compliance-unknown';
  }

  function calculateProjectRisk(project) {
    const answers = Array.isArray(project?.answers) ? project.answers : [];

    let yes = 0;
    let no = 0;
    let na = 0;
    let unanswered = 0;
    let maxScore = 0;
    let achievedScore = 0;
    let criticalFailures = 0;

    const categories = {};

    answers.forEach(answer => {
      const value = normaliseAnswer(answer?.answer);
      const rule = inferRule(answer);
      const category = rule.category || 'Administration';
      const weight = Number(rule.weight || CATEGORY_WEIGHTS[category] || DEFAULT_WEIGHT);

      if (!categories[category]) {
        categories[category] = {
          category,
          maxScore: 0,
          achievedScore: 0,
          yes: 0,
          no: 0,
          na: 0,
          unanswered: 0,
          percentage: null
        };
      }

      if (value === 'yes') {
        yes += 1;
        maxScore += weight;
        achievedScore += weight;
        categories[category].yes += 1;
        categories[category].maxScore += weight;
        categories[category].achievedScore += weight;
      } else if (value === 'no') {
        no += 1;
        maxScore += weight;
        categories[category].no += 1;
        categories[category].maxScore += weight;
        if (rule.critical) criticalFailures += 1;
      } else if (value === 'n/a' || value === 'na' || value === 'not applicable') {
        na += 1;
        categories[category].na += 1;
      } else {
        unanswered += 1;
        categories[category].unanswered += 1;
      }
    });

    Object.values(categories).forEach(category => {
      category.percentage = category.maxScore > 0
        ? Math.round((category.achievedScore / category.maxScore) * 100)
        : null;
    });

    const compliancePercentage = maxScore > 0
      ? Math.round((achievedScore / maxScore) * 100)
      : null;

    const healthRating = getHealthRating(compliancePercentage);
    const riskLevel = getRiskLevel(compliancePercentage, criticalFailures);

    return {
      yes,
      no,
      na,
      unanswered,
      scoredTotal: yes + no,
      maxScore,
      achievedScore,
      percentage: compliancePercentage,
      compliancePercentage,
      healthRating,
      riskLevel,
      riskClass: getRiskClass(riskLevel),
      criticalFailures,
      categories: Object.values(categories)
    };
  }

  function calculatePortfolioRisk(projects) {
    const safeProjects = Array.isArray(projects) ? projects : [];
    let yes = 0;
    let no = 0;
    let na = 0;
    let unanswered = 0;
    let maxScore = 0;
    let achievedScore = 0;
    let criticalFailures = 0;

    safeProjects.forEach(project => {
      const risk = calculateProjectRisk(project);
      yes += risk.yes;
      no += risk.no;
      na += risk.na;
      unanswered += risk.unanswered;
      maxScore += risk.maxScore;
      achievedScore += risk.achievedScore;
      criticalFailures += risk.criticalFailures;
    });

    const compliancePercentage = maxScore > 0
      ? Math.round((achievedScore / maxScore) * 100)
      : null;

    const healthRating = getHealthRating(compliancePercentage);
    const riskLevel = getRiskLevel(compliancePercentage, criticalFailures);

    return {
      yes,
      no,
      na,
      unanswered,
      scoredTotal: yes + no,
      maxScore,
      achievedScore,
      percentage: compliancePercentage,
      compliancePercentage,
      healthRating,
      riskLevel,
      riskClass: getRiskClass(riskLevel),
      criticalFailures
    };
  }

  function decorateExecutiveDashboard() {
    const projects = typeof window.fsExecutiveGetProjects === 'function'
      ? window.fsExecutiveGetProjects()
      : (typeof window.getProjects === 'function' ? window.getProjects() : []);

    const portfolio = calculatePortfolioRisk(projects);

    const scoreEl = document.getElementById('cmdComplianceScore');
    const labelEl = document.getElementById('cmdComplianceScoreLabel');
    const heroCard = document.getElementById('complianceHeroCard');

    if (scoreEl) scoreEl.textContent = portfolio.compliancePercentage === null ? '--%' : `${portfolio.compliancePercentage}%`;
    if (labelEl) labelEl.textContent = portfolio.compliancePercentage === null ? 'No scored data yet' : `${portfolio.healthRating} · Risk ${portfolio.riskLevel}`;

    if (heroCard) {
      heroCard.classList.remove('compliance-unknown', 'compliance-strong', 'compliance-watch', 'compliance-risk', 'compliance-critical');
      heroCard.classList.add(portfolio.riskClass);

      let riskStrip = document.getElementById('fireSRiskStrip');
      if (!riskStrip) {
        riskStrip = document.createElement('div');
        riskStrip.id = 'fireSRiskStrip';
        riskStrip.className = 'fire-s-risk-strip';
        const scoreButton = document.getElementById('cmdComplianceBtn');
        if (scoreButton && scoreButton.parentNode) {
          scoreButton.parentNode.insertBefore(riskStrip, scoreButton.nextSibling);
        } else {
          heroCard.appendChild(riskStrip);
        }
      }

      riskStrip.innerHTML = `
        <span><strong>Building Health</strong> ${portfolio.healthRating}</span>
        <span><strong>Overall Risk</strong> ${portfolio.riskLevel}</span>
        <span><strong>Critical</strong> ${portfolio.criticalFailures}</span>
      `;
    }
  }

  function installCompatibilityOverrides() {
    window.getProjectComplianceStats = function getProjectComplianceStats(project) {
      return calculateProjectRisk(project);
    };

    if (typeof window.renderHomeCommandCentre === 'function' && !window.renderHomeCommandCentre.fireSRiskWrapped) {
      const originalRenderHomeCommandCentre = window.renderHomeCommandCentre;
      window.renderHomeCommandCentre = function renderHomeCommandCentreWithRisk() {
        originalRenderHomeCommandCentre.apply(this, arguments);
        decorateExecutiveDashboard();
      };
      window.renderHomeCommandCentre.fireSRiskWrapped = true;
    }
  }

  window.FireSRiskEngine = {
    calculateProjectRisk,
    calculatePortfolioRisk,
    getHealthRating,
    getRiskLevel,
    decorateExecutiveDashboard
  };

  installCompatibilityOverrides();

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      installCompatibilityOverrides();
      decorateExecutiveDashboard();
    }, 450);
  });

  window.addEventListener('load', () => {
    setTimeout(decorateExecutiveDashboard, 700);
  });
})();
