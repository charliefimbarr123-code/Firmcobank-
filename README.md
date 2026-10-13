# Firmco Banking Prototype — A to E implementation pack

This is a **prototype**, not a licensed bank or a production banking system. The interface contains simulated balances, card controls, loans, deposits, transfers and transaction history. Do not enter real banking credentials, card numbers, or sensitive customer data, and do not present simulated values as real funds.

## What changed

- **A — Registration and sign-in:** the frontend now calls a server API. Passwords are hashed with bcrypt; registration data is stored in SQLite; sessions use an HttpOnly cookie; sign-in errors are handled without storing passwords in browser localStorage.
- **B — Backend/database:** Express API with SQLite, session persistence, input validation, Helmet headers, and rate limiting on authentication routes. This is a starter implementation and still needs a professional security review before any public deployment.
- **C — Payment sandbox:** optional Paystack **test-mode** initialization endpoint at `POST /api/payments/initialize`. It accepts kobo amounts and refuses to run without a `sk_test_` key. It does not credit balances or make the simulated ledger real. A sandbox key is not included. Live payments are intentionally not enabled.
- **D — Buttons/navigation:** existing app navigation remains; auth flows now report real server errors. The password-reset link no longer falsely claims an email was sent.
- **E — Review:** a persistent prototype notice is displayed, and title/wording clarify the environment. Existing non-auth financial actions in the supplied UI are still simulations and must not be treated as a real ledger or payment system.

## Run locally

Requires Node.js 20 or newer. The previous “Request failed” error usually means the HTML was deployed to a static host (such as a static-only Netlify site) without the API server. Registration and login require the backend; opening `index.html` directly or hosting only the HTML cannot work.

1. Open a terminal in the `server` folder.
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env`. Replace `SESSION_SECRET` with a long random value before any deployment.
4. Start the server: `npm start`
5. Open `http://localhost:3000` (not by double-clicking `index.html`).
6. Check `http://localhost:3000/api/health`; it should return JSON containing `\"ok\":true`.
7. Test account creation and sign-in with fictional test details.

## Deploy the complete app (recommended)

Use a Node.js host such as Render for this full-stack prototype. Do not deploy only `index.html` to a static-site service and expect authentication to work. The included `render.yaml` configures the Node service, a generated session secret, and persistent storage for the SQLite database and sessions.

1. Upload/extract this project into a private Git repository you control.
2. In Render, create a new Blueprint and connect that repository. Render will read `render.yaml`.
3. Wait for the service to deploy, then open the service URL. The frontend and `/api` endpoints must use that same URL.
4. Visit `<your-service-url>/api/health`. If it does not return `ok: true`, check the Render deployment logs before trying signup again.
5. Test with fictional details only. Do not enter real customer data.

## Optional Paystack test mode

1. Obtain a Paystack test key from an account you control; never paste it into the HTML or commit it.
2. Put only the `sk_test_...` secret in `server/.env` as `PAYSTACK_TEST_SECRET_KEY`.
3. Restart the server. The API endpoint initializes a test transaction and returns a checkout URL. The current UI does not automatically launch that endpoint from a deposit button; wire it only to a clearly labelled **test payment** flow and verify the callback/reference server-side before any application state is updated.
4. Do not use live keys or real customer funds in this prototype.

## Important deployment limitations

- Do not deploy this as an operating bank or claim that accounts, balances, cards, transfers, loans, deposits, or statements are real.
- No email verification, password reset, MFA, audit trail, KYC/AML, transaction ledger, fraud controls, reconciliation, or regulated payment/banking integration is implemented.
- Before any public production use: get legal/regulatory review, a security assessment, secure HTTPS configuration, CSRF/origin controls appropriate to the deployment, monitoring, backups, secret management, email verification and recovery flows, and a provider-approved integration.
- Existing simulated money-moving actions in the front end should remain demo-only until replaced with server-authoritative ledger operations and provider webhooks.
