/* The signup form.
   Calls the API's public endpoints and nothing else. No framework, no bundle.

   After a successful signup the workspace already exists and is configured:
   the API created the business, the owner, an Owner role and the trial. This
   page then hands the owner to the app to sign in. It deliberately does not
   carry the session across — the API issues bearer tokens, which belong in the
   app's own origin, and a token in a URL ends up in browser history and
   referrer logs. One extra click is the fair price. */

(function () {
  'use strict';

  var config = window.BIZORA || {};
  var apiBase = (config.apiBaseUrl || '').replace(/\/+$/, '');

  var form = document.getElementById('signupForm');
  var formCard = document.getElementById('formCard');
  var templateSelect = document.getElementById('templateKey');
  var templateHint = document.getElementById('templateHint');
  var planSelect = document.getElementById('planId');
  var errorBox = document.getElementById('formError');
  var submitButton = document.getElementById('submitButton');
  var donePanel = document.getElementById('signupDone');
  var doneSummary = document.getElementById('doneSummary');
  var doneNote = document.getElementById('doneNote');
  var doneEmail = document.getElementById('doneEmail');
  var doneTemplate = document.getElementById('doneTemplate');
  var doneTrial = document.getElementById('doneTrial');
  var doneOwner = document.getElementById('doneOwner');
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

  function describeTemplate(template) {
    return template.description || 'A configured workspace for this trade.';
  }

  function updateTemplateHint() {
    var chosen = templates.filter(function (item) { return item.key === templateSelect.value; })[0];
    templateHint.textContent = chosen ? describeTemplate(chosen) : '';
  }

  /** The plan the visitor clicked on the pricing table, if any. */
  function requestedPlan() {
    var params = new URLSearchParams(window.location.search);
    return (params.get('plan') || '').toLowerCase();
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

    templates = (await templateResponse.json()).data.items;
    plans = (await planResponse.json()).data.items;

    templateSelect.innerHTML = templates.map(function (template) {
      return '<option value="' + template.key + '">' + template.name + '</option>';
    }).join('');

    planSelect.innerHTML = plans.map(function (plan) {
      return '<option value="' + plan.id + '">' + plan.name + ' — '
        + money(plan.monthlyPrice, plan.currency) + ' / month'
        + (plan.trialDays ? ' · ' + plan.trialDays + '-day trial' : '') + '</option>';
    }).join('');

    // The plan clicked on the pricing table wins; otherwise the platform's
    // default, which the API returns first.
    var wanted = requestedPlan();
    var match = wanted && plans.filter(function (plan) {
      return plan.name.toLowerCase() === wanted;
    })[0];
    if (match) planSelect.value = match.id;
    else if (plans.length > 0) planSelect.value = plans[0].id;

    updateTemplateHint();
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
    if (status === 400 && code === 'PLAN_NOT_FOUND') {
      return 'That plan is no longer available. Please choose another.';
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

  function showDone(data) {
    var template = templates.filter(function (item) { return item.key === data.templateKey; })[0];
    var plan = plans.filter(function (item) { return item.id === data.planId; })[0];

    formCard.hidden = true;
    donePanel.hidden = false;

    doneSummary.textContent = data.business.name + ' is set up and waiting for you.';
    doneTemplate.textContent = (template ? template.name : 'Your template') + ' applied — your words, stages and fields';
    doneTrial.textContent = data.trial
      ? data.trial.trialDays + '-day trial started, on the ' + data.trial.plan + ' plan'
      : 'Subscription started on the ' + (plan ? plan.name : 'default plan');
    doneOwner.textContent = 'Owner account created for ' + data.owner.email;
    doneEmail.textContent = data.owner.email;
    doneNote.textContent = 'Sign in with the password you just chose. Everything is already configured — there is nothing to set up.';
    signInLink.setAttribute('href', config.appUrl || '#');
    donePanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearError();

    var payload = {
      businessName: document.getElementById('businessName').value.trim(),
      templateKey: templateSelect.value,
      planId: planSelect.value,
      ownerName: document.getElementById('ownerName').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };

    if (payload.password.length < 12) {
      showError('Please choose a password of at least 12 characters.');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Building your workspace…';

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

      showDone(Object.assign({}, body.data, {
        templateKey: payload.templateKey,
        planId: payload.planId,
      }));
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = 'Create my workspace';
      showError('Could not reach the API. Check apiBaseUrl in config.js, and that the API allows this site’s origin in CORS_ORIGINS.');
    }
  });

  templateSelect.addEventListener('change', updateTemplateHint);

  document.querySelectorAll('[data-signin]').forEach(function (link) {
    link.setAttribute('href', config.appUrl || '#');
  });

  loadOptions().catch(function (error) {
    showError(error && error.message
      ? error.message + '. Check apiBaseUrl in config.js, and that the API allows this site’s origin in CORS_ORIGINS.'
      : 'Could not load the signup options.');
    submitButton.disabled = true;
  });
})();
