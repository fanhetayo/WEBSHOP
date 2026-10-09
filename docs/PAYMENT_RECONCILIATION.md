# Backend audit fixes 4, 5, 10

## Deployment

- New empty database: run `supabase-setup.sql`; it includes these function fixes.
- Existing schema: apply ONLY `supabase/migrations/202610100002_payment_reconciliation.sql` through the SQL Editor or your reviewed migration deployment. It replaces three functions atomically and preserves existing ACLs. Do not rerun initial setup as an upgrade and do not deploy unrelated pending migrations without review.
- Deploy both `rapid-api` and `midtrans-webhook` Edge Functions AFTER SQL. Both bundle the changed shared validation/server code. Existing secrets and JWT configuration remain unchanged.
- Run `supabase/tests/database-smoke.sql` and `supabase/tests/payment-reconciliation.sql` on staging. Both roll back fixtures. Check payment retries and signed webhooks in Midtrans sandbox before production.
- Resync previously paid orders with known reversals/disputes using the authenticated `sync-admin` action. Migration does not guess historical provider status or rewrite old orders.

## Financial and inventory semantics

- Authoritative GET `deny`/`failure` can change paid to failed. Failed orders contribute no dashboard revenue and cannot advance fulfillment. Unshipped pending/paid reservations are restored once. Shipped/completed goods are never automatically restocked.
- `chargeback` maps to existing `refunded`, with the full total in `refund_amount`. `partial_chargeback` maps to existing `partial_refund` only with a valid positive cumulative `refund_amount` below gross amount. Dashboard net revenue is total minus cumulative amount, not a sum of webhook deltas. Raw `gateway_state` preserves dispute identity; fulfillment is blocked even for partial chargebacks. No frontend type changes.
- Missing/invalid partial chargeback amounts map to failed and retain previously recorded refunds. This is an explicit reconciliation hold: revenue excludes the whole order until a subsequent verified status supplies a usable amount. It is NOT an assertion that the entire payment was refunded. The inventory note explains this, and stock is not released. Confirm account/channel chargeback amount semantics with Midtrans; do not invent a amount or sum overlapping refund and chargeback totals. Product ranking revenue remains gross item sales, not allocated net refund accounting.
- Repeated statuses do not duplicate events/restocking; earlier paid/pending snapshots cannot undo a recorded dispute/reversal. Full refund remains terminal. Monetary corrections or dispute wins require an explicitly reviewed reconciliation workflow, not blind rollback to paid.
- Existing row locks, version checks and ordered product locks remain. Fulfillment already shipped before a reversal commits requires operational recovery, not rewriting shipment history.

## Expiration blocker (fix 5 partially addressed)

Core GET 404 is documented for an unused but payable Snap token. Token age, elapsed local payment lock, and even an HTTP timeout during token creation are NOT proof that payment is impossible. The SQL cancellation guard now rejects any recorded payment claim (`payment_lock_id`), including an expired claim with no saved token. It still permits an authenticated administrator to cancel an old, never-attempted order after provider 404, with version and row-lock checks.

No automatic token-plus-404 stock release is implemented. This remains a blocker: existing tokens have no persisted, provider-enforced expiry contract in this application. A safe complete implementation needs verified Snap token invalidation/expiry across enabled payment methods, handling of already-created payment instructions, and sandbox race tests. Do not assume Core expire/cancel 404 invalidates Snap. Do not clear claim IDs, reuse order IDs, or directly set expired to recover stock.

For transactions visible in Core, cancel/expire through Midtrans's supported dashboard/API and use `sync-admin` (or verified webhook) to reconcile the resulting authoritative terminal state. If status is still pending/404, retain stock and escalate to provider support; provider expiry timestamps alone do not authorize release. Monitor old pending orders and ambiguous claims operationally. No scheduler or automatic provider cancellation has been added.

## Quota

The existing `checkout:global` quota (250/minute) is charged only after checkout input validation, request/checkout actor quotas, phone quota, and payment-method/configuration checks. Invalid input and actor/phone-rejected requests cannot consume this shared checkout capacity. No new broad request-global limit is added to receipt, payment, or admin actions. Database-only rejection (for example, unavailable stock) can still consume checkout capacity; upstream abuse controls remain necessary.

## Continuation validation (2026-10-10)

- Real `C:\Program Files\nodejs\node.exe` v24.14.0 and bundled VS Code TypeScript 6.0.3 compiler API emitted fresh test modules: 100 tests passed, zero failed/skipped. TypeScript 6 required an in-memory `ignoreDeprecations: '6.0'` override for the repository's legacy module resolution; project configuration was not changed.
- All 30 repository TS/TSX files parsed without syntax errors (including Edge Functions); local file/import checks and `git diff --check` passed. These are not a Deno runtime check or a full application typecheck.
- Real npm install with engine enforcement stopped with EBADENGINE: project requires Node >=22 <23, installed Node is 24. No forced install or Node installation was performed.
- Full application compiler diagnostics remain blocked by missing dependencies/types (1405 app diagnostics, 3 config diagnostics). Real npm build, with the actual Node/npm directory first on PATH, exited 1 at missing `tsc`; Vite bundling did not run. No no-op binary result counts as validation.
- Setup and migration function identity passed for all three replacement functions. SQL staging tests now cover repeated/increasing/decreasing chargebacks, missing-amount retention, stale ordinary refunds, and fulfillment holds. PostgreSQL/Supabase execution and Midtrans sandbox race tests were NOT run; no local psql/Supabase CLI was found.
- Ordinary partial-refund snapshots cannot clear a recorded dispute/reversal hold. No frontend files were edited during this continuation. Token-plus-404 expiration remains explicitly unresolved as described above.

## Provider references

- https://docs.midtrans.com/reference/transaction-status-cycle (settlement-to-deny reversal; Snap 404 before method selection)
- https://docs.midtrans.com/reference/get-transaction-status (cumulative refund amount)
- https://docs.midtrans.com/reference/expire-transaction (Core expiry is not proof of unused Snap token invalidation)