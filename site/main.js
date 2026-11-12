/* Bizora marketing site behaviour. No dependencies.
   Everything here degrades gracefully: with JavaScript off, the page still
   reads correctly and shows monthly prices. */

(function () {
  'use strict';

  var config = window.BIZORA || {};

  /* ---- header shadow on scroll ---- */
  var header = document.getElementById('header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
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

  /* ---- monthly / yearly toggle ---- */
  var cycleButtons = document.querySelectorAll('[data-cycle]');
  var cycleValues = document.querySelectorAll('[data-monthly], [data-yearly]');

  function setCycle(cycle) {
    cycleButtons.forEach(function (button) {
      var active = button.getAttribute('data-cycle') === cycle;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    cycleValues.forEach(function (node) {
      var isMatch = node.hasAttribute('data-' + cycle);
      // Hidden nodes are skipped so the yearly figures stay out of the
      // accessibility tree and out of a screen reader's reading order.
      if (isMatch) node.removeAttribute('hidden');
      else node.setAttribute('hidden', '');
    });
  }

  cycleButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setCycle(button.getAttribute('data-cycle'));
    });
  });

  /* ---- links that depend on config ---- */
  var signupUrl = config.signupUrl || config.appUrl || '#';
  var appUrl = config.appUrl || signupUrl;

  document.querySelectorAll('[data-signup]').forEach(function (link) {
    link.setAttribute('href', signupUrl);
  });
  document.querySelectorAll('[data-signin]').forEach(function (link) {
    link.setAttribute('href', appUrl);
  });

  // Plan buttons: a real payment link when one is configured, a trial
  // otherwise. Never a dead button.
  var checkout = config.checkout || {};
  document.querySelectorAll('[data-checkout]').forEach(function (link) {
    var plan = link.getAttribute('data-checkout');
    var url = (checkout[plan] || '').trim();
    link.setAttribute('href', url || signupUrl);
    if (url) link.setAttribute('data-paid-link', 'true');
  });

  if (config.supportEmail) {
    document.querySelectorAll('[data-support-email]').forEach(function (node) {
      node.setAttribute('href', 'mailto:' + config.supportEmail);
      node.textContent = config.supportEmail;
    });
  }

  if (config.city) {
    document.querySelectorAll('[data-city]').forEach(function (node) {
      node.textContent = config.city;
    });
  }

  if (config.statementDescriptor) {
    document.querySelectorAll('[data-descriptor]').forEach(function (node) {
      node.textContent = ' (' + config.statementDescriptor + ')';
    });
  }

  document.querySelectorAll('[data-year]').forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });
})();
