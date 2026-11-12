/* The signup form.
   Calls the API's public endpoints and nothing else. No framework, no bundle.

   The account is created and activated by the API, and this page then hands
   the owner over to the app to sign in. It deliberately does not try to carry
   the session across: the API issues bearer tokens, which belong in the app's
   own origin, and putting one in a URL is how tokens end up in browser
   history and referrer logs. One extra click is a fair price. */

(function () {
  'use strict';

  var config = window.BIZORA || {};
  var apiBase = (config.apiBaseUrl || '').replace(/\/+$/, '');

  var form = document.getElementById('signupForm');
  var templateSelect = document.getElementById('templateKey');
  var planSelect = document.getElementById('planId');
  var errorBox = document.getElementById('formError');
  var submitButton = document.getElementById('submitButton');
  var donePanel = document.getElementById('signupDone');
  var doneSummary = document.getElementById('doneSummary');
  var doneNote = document.getElementById('doneNote');
  var signInLink = document.getElementById('signInLink');

  var templates = [];
  var plans = [];

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function money(amount, currency) {
    var formatted = Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return (currency === 'PKR' ? 'Rs ' : currency ? currency + ' ' : '') + formatted;
  }

  async function loadOptions() {
    if (!apiBase) {
      templateSelect.innerHTML = '<option value="">Set apiBaseUrl in config.js</option>';
      planSelect.innerHTML = '<option value="">Set apiBaseUrl in config.js</option>';
      showError('This page needs apiBaseUrl in config.js to talk to the API.');
      submitButton.disabled = true;
      return;
    }

    var [templateResponse, planResponse] = await Promise.all([
      fetch(apiBase + '/api/v1/public/templates'),
      fetch(apiBase + '/api/v1/public/plans'),
    ]);
    if (!templateResponse.ok || !planResponse.ok) {
      throw new Error('Could not load templates and plans from the API');
    }

    var templateBody = await templateResponse.json();
    var planBody = await planResponse.json();
    templates = templateBody.data.items;
    plans = planBody.data.items;

    templateSelect.innerHTML = templates.map(function (template) {
      return '<option value="' + template.key + '">' + template.name
        + (template.description ? ' — ' + template.description : '') + '</option>';
    }).join('');

    planSelect.innerHTML = plans.map(function (plan) {
      return '<option value="' + plan.id + '">' + plan.name + ' — '
        + money(plan.monthlyPrice, plan.currency) + ' / month'
        + (plan.trialDays ? ' (' + plan.trialDays + '-day trial)' : '') + '</option>';
    }).join('');

    // Prefer the platform's default plan, which the API sorts first.
    if (plans.length > 0) planSelect.value = plans[0].id;
  }

  function describeFailure(status, body) {
    var code = body && body.error && body.error.code;
    if (status === 403 && code === 'SELF_SIGNUP_DISABLED') {
      return 'New sign-ups are not open on this platform right now. Please email us and we will set you up.';
    }
    if (status === 409 && code === 'DUPLICATE_USER') {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (status === 409 && code === 'DUPLICATE_SIGNUP') {
      return 'That business name or email is already taken. Please try another.';
    }
    if (status === 429) {
      return 'Too many sign-ups from this network. Please wait a while and try again.';
    }
    if (status === 400 && code === 'VALIDATION_ERROR') {
      var details = body.error.details && body.error.details.fieldErrors;
      if (details && details.password) return 'Password: ' + details.password[0];
      if (details && details.templateKey) return 'Please choose a business type.';
      return 'Please check the details you entered and try again.';
    }
    return 'Something went wrong on our side. Please try again, or email us.';
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearError();

    var payload = {
      businessName: document.getElementById('businessName').value.trim(),
      templateKey: templateSelect.value,
      ownerName: document.getElementById('ownerName').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };

    if (payload.password.length < 12) {
      showError('Please choose a password of at least 12 characters.');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Creating your workspace…';

    try {
      var response = await fetch(apiBase + '/api/v1/public/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      var body = await response.json().catch(function () { return null; });

      if (!response.ok) {
        submitButton.disabled = false;
        submitButton.textContent = 'Create my workspace';
        showError(describeFailure(response.status, body));
        return;
      }

      var data = body.data;
      form.hidden = true;
      donePanel.hidden = false;
      doneSummary.textContent = data.business.name + ' is ready'
        + (data.trial ? '. Your ' + data.trial.trialDays + '-day trial runs until '
            + new Date(data.trial.endsAt).toLocaleDateString() + '.' : '.');
      doneNote.textContent = 'Sign in with ' + data.owner.email + ' and the password you just chose.';
      signInLink.setAttribute('href', config.appUrl || '#');
      donePanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = 'Create my workspace';
      showError('Could not reach the API. Check apiBaseUrl in config.js, and that the API allows this site’s origin in CORS_ORIGINS.');
    }
  });

  var signinLinks = document.querySelectorAll('[data-signin]');
  signinLinks.forEach(function (link) {
    link.setAttribute('href', config.appUrl || '#');
  });

  loadOptions().catch(function (error) {
    showError(error && error.message
      ? error.message + '. Check apiBaseUrl in config.js, and that the API allows this site’s origin in CORS_ORIGINS.'
      : 'Could not load the signup options.');
    submitButton.disabled = true;
  });
})();
