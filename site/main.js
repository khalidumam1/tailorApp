/* Page behaviour: the two pricing toggles, the mobile menu, and wiring the
   values from config.js into the markup. No dependencies.

   Everything degrades: with JavaScript off the page shows monthly prices in
   PKR, every trial button still points at the signup form, and the workspace
   recreation stays on the tailor template. */

(function () {
  'use strict';

  var config = window.BIZORA || {};

  /* ---- header shadow ---- */
  var header = document.getElementById('header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- mobile navigation ---- */
  var toggle = document.getElementById('navToggle');
  var mobileNav = document.getElementById('mobileNav');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      mobileNav.hidden = open;
    });
    mobileNav.addEventListener('click', function (event) {
      if (event.target.tagName === 'A') {
        toggle.setAttribute('aria-expanded', 'false');
        mobileNav.hidden = true;
      }
    });
  }

  /* ---- pricing: period and currency ---- */
  var state = { cycle: 'monthly', currency: 'PKR' };

  function applyPricing() {
    var want = 'data-' + state.currency.toLowerCase() + '-' + state.cycle.charAt(0);

    document.querySelectorAll('.amount').forEach(function (amount) {
      Array.prototype.forEach.call(amount.children, function (node) {
        if (node.hasAttribute(want)) node.removeAttribute('hidden');
        else node.setAttribute('hidden', '');
      });
    });

    document.querySelectorAll('[data-cycle-label]').forEach(function (node) {
      if (node.getAttribute('data-cycle-label') === state.cycle) node.removeAttribute('hidden');
      else node.setAttribute('hidden', '');
    });

    document.querySelectorAll('[data-cur]').forEach(function (node) {
      node.textContent = state.currency;
    });

    document.querySelectorAll('[data-cycle]').forEach(function (button) {
      var active = button.getAttribute('data-cycle') === state.cycle;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    document.querySelectorAll('[data-currency]').forEach(function (button) {
      var active = button.getAttribute('data-currency') === state.currency;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  document.querySelectorAll('[data-cycle]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.cycle = button.getAttribute('data-cycle');
      applyPricing();
    });
  });
  document.querySelectorAll('[data-currency]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.currency = button.getAttribute('data-currency');
      applyPricing();
    });
  });

  /* ---- links that depend on config ---- */
  var signupUrl = config.signupUrl || 'signup.html';
  var appUrl = config.appUrl || '#';

  document.querySelectorAll('[data-signup]').forEach(function (link) {
    link.setAttribute('href', signupUrl);
  });
  document.querySelectorAll('[data-signin]').forEach(function (link) {
    link.setAttribute('href', appUrl);
  });

  // Plan buttons: a real payment link when one is configured, otherwise the
  // signup form with that plan preselected. Never a dead button.
  var checkout = config.checkout || {};
  document.querySelectorAll('[data-checkout]').forEach(function (link) {
    var plan = link.getAttribute('data-checkout');
    var url = (checkout[plan] || '').trim();
    link.setAttribute('href', url || (signupUrl + '?plan=' + encodeURIComponent(plan)));
  });

  if (config.supportEmail) {
    document.querySelectorAll('[data-support-email]').forEach(function (node) {
      node.setAttribute('href', 'mailto:' + config.supportEmail);
      node.textContent = config.supportEmail;
    });
  }
  if (config.city) {
    document.querySelectorAll('[data-city]').forEach(function (node) { node.textContent = config.city; });
  }
  if (config.statementDescriptor) {
    document.querySelectorAll('[data-descriptor]').forEach(function (node) {
      node.textContent = ' (' + config.statementDescriptor + ')';
    });
  }
  document.querySelectorAll('[data-year]').forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });

  applyPricing();
})();
