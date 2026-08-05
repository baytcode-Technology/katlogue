import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { env } from '../../../config/env.js'
import {
  ensureEmbeddedSignupSession,
  parseEmbeddedSignupState,
} from '../services/embedded-signup-session.service.js'
import { WHATSAPP_APP_AUTH_REDIRECT_URI } from '../services/embedded-signup.service.js'

function buildEmbeddedSignupBridgeHtml(input: {
  appId: string
  configId: string
  apiVersion: string
  state: string
  apiBaseUrl: string
  appRedirectUri: string
}): string {
  const safe = (value: string) =>
    JSON.stringify(value).replace(/<\//g, '<\\/')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect WhatsApp — AiShopy</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f6f7f8; color: #111; }
    .card { max-width: 420px; margin: 40px auto; padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { font-size: 14px; line-height: 1.5; color: #555; margin: 0 0 16px; }
    .status { font-size: 13px; color: #333; min-height: 20px; }
    .error { color: #b00020; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect WhatsApp Business</h1>
    <p>Complete Meta Embedded Signup. If you use an existing WhatsApp Business app number, enter the verification code on your phone when prompted.</p>
    <div id="status" class="status">Loading Meta signup…</div>
  </div>
  <script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js"></script>
  <script>
    (function () {
      var STATE = ${safe(input.state)};
      var APP_ID = ${safe(input.appId)};
      var CONFIG_ID = ${safe(input.configId)};
      var API_VERSION = ${safe(input.apiVersion)};
      var API_BASE = ${safe(input.apiBaseUrl)};
      var APP_REDIRECT = ${safe(input.appRedirectUri)};
      var statusEl = document.getElementById('status');

      function setStatus(text, isError) {
        statusEl.textContent = text;
        statusEl.className = isError ? 'status error' : 'status';
      }

      function postEsEvent(payload) {
        return fetch(API_BASE + '/api/whatsapp/embedded-signup/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: STATE, event: payload })
        }).catch(function () { /* best-effort */ });
      }

      window.addEventListener('message', function (event) {
        if (event.origin !== 'https://www.facebook.com') return;
        try {
          var data = JSON.parse(event.data);
          if (data && data.type === 'WA_EMBEDDED_SIGNUP') {
            console.log('[ES]', data.event, data);
            setStatus('Signup step: ' + (data.event || 'unknown'));
            void postEsEvent(data);
          }
        } catch (e) { /* ignore non-JSON */ }
      });

      function redirectToApp(params) {
        var qs = new URLSearchParams(params);
        qs.set('state', STATE);
        window.location.href = APP_REDIRECT + '?' + qs.toString();
      }

      function startEmbeddedSignup() {
        setStatus('Opening Meta Embedded Signup…');
        FB.login(function (response) {
          if (response.authResponse && response.authResponse.code) {
            setStatus('Success — returning to AiShopy…');
            redirectToApp({ code: response.authResponse.code });
            return;
          }
          var msg = response.status === 'not_authorized'
            ? 'Authorization was not granted'
            : 'Signup was cancelled';
          setStatus(msg, true);
          redirectToApp({ error: 'access_denied', error_reason: response.status || 'unknown' });
        }, {
          config_id: CONFIG_ID,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: 'whatsapp_business_app_onboarding',
            sessionInfoVersion: '3'
          }
        });
      }

      window.fbAsyncInit = function () {
        FB.init({
          appId: APP_ID,
          cookie: true,
          xfbml: false,
          version: API_VERSION
        });
        startEmbeddedSignup();
      };

      if (window.FB) {
        window.fbAsyncInit();
      }
    })();
  </script>
</body>
</html>`
}

/** Serves Meta Embedded Signup JS SDK bridge (FB.login + WA_EMBEDDED_SIGNUP postMessage). */
export const embeddedSignupPage = asyncHandler(async (req: Request, res: Response) => {
  const state = String(req.query.state ?? '').trim()
  if (!state) {
    throw new AppError(400, 'state query parameter is required', 'ES_STATE_REQUIRED')
  }

  const parsed = parseEmbeddedSignupState(state)
  if (!parsed) {
    throw new AppError(400, 'Invalid embedded signup state', 'ES_INVALID_STATE')
  }

  if (!env.META.APP_ID || !env.META.EMBEDDED_SIGNUP_CONFIG_ID) {
    throw new AppError(
      503,
      'Meta Embedded Signup is not configured on this server',
      'META_ES_NOT_CONFIGURED'
    )
  }

  ensureEmbeddedSignupSession(state, parsed.storeId, parsed.nonce)

  const apiBaseUrl =
    env.API_PUBLIC_URL?.replace(/\/$/, '') ??
    `${req.protocol}://${req.get('host') ?? 'localhost'}`

  console.info('[whatsapp][embedded-signup] bridge page served', {
    storeId: parsed.storeId,
    apiBaseUrl,
  })

  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .send(
      buildEmbeddedSignupBridgeHtml({
        appId: env.META.APP_ID,
        configId: env.META.EMBEDDED_SIGNUP_CONFIG_ID,
        apiVersion: env.WHATSAPP.API_VERSION,
        state,
        apiBaseUrl,
        appRedirectUri: WHATSAPP_APP_AUTH_REDIRECT_URI,
      })
    )
})
