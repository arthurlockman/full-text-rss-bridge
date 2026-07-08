/*
 * Drives passkey (WebAuthn) registration and authentication using the vendored
 * @simplewebauthn/browser bundle (exposed as window.SimpleWebAuthnBrowser).
 *
 * Buttons opt in via data attributes:
 *   #passkey-register / #passkey-add  -> registration flow
 *   #passkey-login                    -> authentication flow
 * Each carries:
 *   data-endpoint-options  POST endpoint returning WebAuthn options JSON
 *   data-endpoint-verify   POST endpoint that verifies the browser response
 *   data-name-input        (optional) id of an <input> supplying a passkey name
 */
(function () {
  var swa = window.SimpleWebAuthnBrowser;
  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrf = csrfMeta ? csrfMeta.getAttribute('content') : '';

  var errorEl = document.getElementById('passkey-error');
  var unsupportedEl = document.getElementById('passkey-unsupported');

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function clearError() {
    if (errorEl) errorEl.hidden = true;
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
      },
      credentials: 'same-origin',
      body: JSON.stringify(body || {}),
    });
  }

  async function readError(res) {
    try {
      var data = await res.json();
      return data && data.error ? data.error : 'Request failed';
    } catch {
      return 'Request failed';
    }
  }

  function bindRegister(btn) {
    btn.addEventListener('click', async function () {
      clearError();
      btn.disabled = true;
      try {
        var optRes = await postJSON(btn.dataset.endpointOptions, {});
        if (!optRes.ok) throw new Error(await readError(optRes));
        var optionsJSON = await optRes.json();

        var attResp = await swa.startRegistration({ optionsJSON: optionsJSON });

        var body = { response: attResp };
        var nameInputId = btn.dataset.nameInput;
        if (nameInputId) {
          var nameEl = document.getElementById(nameInputId);
          if (nameEl && nameEl.value) body.name = nameEl.value;
        }

        var verRes = await postJSON(btn.dataset.endpointVerify, body);
        if (!verRes.ok) throw new Error(await readError(verRes));
        var result = await verRes.json();
        window.location = result.redirect || window.location.href;
      } catch (err) {
        showError(friendly(err));
        btn.disabled = false;
      }
    });
  }

  function bindLogin(btn) {
    btn.addEventListener('click', async function () {
      clearError();
      btn.disabled = true;
      try {
        var optRes = await postJSON(btn.dataset.endpointOptions, {});
        if (!optRes.ok) throw new Error(await readError(optRes));
        var optionsJSON = await optRes.json();

        var authResp = await swa.startAuthentication({ optionsJSON: optionsJSON });

        var verRes = await postJSON(btn.dataset.endpointVerify, { response: authResp });
        if (!verRes.ok) throw new Error(await readError(verRes));
        var result = await verRes.json();
        window.location = result.redirect || '/';
      } catch (err) {
        showError(friendly(err));
        btn.disabled = false;
      }
    });
  }

  function friendly(err) {
    if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
      return 'Passkey prompt was cancelled or timed out.';
    }
    return (err && err.message) || 'Something went wrong.';
  }

  if (!swa || !swa.browserSupportsWebAuthn || !swa.browserSupportsWebAuthn()) {
    if (unsupportedEl) unsupportedEl.hidden = false;
    ['passkey-register', 'passkey-login', 'passkey-add'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = true;
    });
    return;
  }

  ['passkey-register', 'passkey-add'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) bindRegister(el);
  });
  var loginBtn = document.getElementById('passkey-login');
  if (loginBtn) bindLogin(loginBtn);
})();
