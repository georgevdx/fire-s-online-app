/* Fire-S RC 1.1.8 - Premises Terminology Patch
   Lightweight UI layer: renames user-facing "Projects" wording to "Premises"
   without changing internal project data keys or storage logic.
*/
(function () {
  'use strict';

  const VERSION = 'RC 1.1.8 - Premises Terminology Patch';

  const replacements = [
    [/\bProjects\b/g, 'Premises'],
    [/\bProject Details\b/g, 'Premises Details'],
    [/\bBack to Projects\b/g, 'Back to Premises'],
    [/\bNew Project\b/g, 'New Premises'],
    [/\bSearch projects\b/gi, 'Search premises'],
    [/\bproject list\b/gi, 'premises list'],
    [/\bproject card\b/gi, 'premises card']
  ];

  function replaceText(value) {
    let next = String(value || '');
    replacements.forEach(([from, to]) => { next = next.replace(from, to); });
    return next;
  }

  function updateNodeText(node) {
    if (!node || !node.nodeValue || !/Project|Projects|project/.test(node.nodeValue)) return;
    node.nodeValue = replaceText(node.nodeValue);
  }

  function walkTextNodes(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return /Project|Projects|project/.test(node.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(updateNodeText);
  }

  function updateAttributes(root) {
    (root || document).querySelectorAll('[placeholder], [title], [aria-label], input[value], button').forEach(el => {
      ['placeholder', 'title', 'aria-label', 'value'].forEach(attr => {
        if (!el.hasAttribute(attr)) return;
        const current = el.getAttribute(attr);
        if (/Project|Projects|project/.test(current || '')) el.setAttribute(attr, replaceText(current));
      });
    });
  }

  function applyPremisesTerminology(root) {
    walkTextNodes(root || document.body);
    updateAttributes(root || document);

    const search = document.getElementById('projectSearch');
    if (search && (!search.placeholder || /project/i.test(search.placeholder))) {
      search.placeholder = 'Search premises, address, contact or inspection number';
    }

    const version = document.getElementById('appVersion');
    if (version && !version.textContent.includes('1.1.8')) {
      version.textContent = `Version ${VERSION}`;
    }
  }

  function start() {
    applyPremisesTerminology(document.body);

    const observer = new MutationObserver(mutations => {
      let shouldApply = false;
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) updateNodeText(node);
          if (node.nodeType === Node.ELEMENT_NODE) shouldApply = true;
        });
      });
      if (shouldApply) window.requestAnimationFrame(() => applyPremisesTerminology(document.body));
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.FireSPremisesTerminology = { version: VERSION, apply: applyPremisesTerminology };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
