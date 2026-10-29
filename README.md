This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Subscription safeguards

`POST /api/subscribe` normalizes addresses and applies these limits:

- Five requests per client in ten minutes, including invalid requests.
- Twenty admitted subscription attempts globally per minute.
- At most three admitted attempts per email per hour, with a sixty-second cooldown.
- Contact creation and welcome delivery share a ten-second deadline. Timeout returns `504` with `Retry-After`, aborts the provider request, and releases the lock. Expired leases are also recovered on incoming requests; late responses cannot mutate or unlock a newer attempt. A timed-out provider may already have accepted work, so welcome retries retain the same idempotency key.
- Concurrent attempts for the same email return `409`; throttled requests return `429` with `Retry-After`.
- Successful subscriptions are cached for twenty-four hours. Email retries reuse a stable Resend idempotency key, including after a process restart. Resend retains these keys for twenty-four hours: https://resend.com/docs/dashboard/emails/idempotency-keys.
- A failed welcome email can be retried without re-creating the contact in the same process.

Client, email cooldown/hourly, and global provider-admission quotas use atomic Lua operations on a single shared Upstash Redis primary. They apply across Vercel function instances and regions, including concurrent requests. The existing bounded process caches supplement these quotas with completion caching, partial progress and lease recovery; these caches are not distributed. Welcome email idempotency remains provider-backed. A completed subscription handled by a different process may receive a cooldown response rather than the process-local cached success.

The production integration supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN`; only these two values are used by the app. Initialization is lazy, so builds do not require Redis credentials. Missing credentials or Redis failures return a controlled `503` without contacting Resend. Redis requests have a three-second deadline and no automatic retries (an ambiguous counter mutation must not be repeated). Production, preview and development use separate key namespaces. Production credentials are not connected to preview deployments. Outside Vercel, forwarding headers remain untrusted and requests share a conservative client bucket.

Run the normal suite with `node --test tests/*.test.mjs`. Run real multi-instance Redis checks with `node --env-file=.env.local --test tests/subscription-distributed.integration.mjs`; these use unique `investradar:test:*` namespaces and delete only their own test keys. Production build and browser tests remain required after route changes.

No raw emails or IP addresses are retained in these caches. New clients or email entries are rejected when the bounded cache is full rather than evicting active protection.

## Production reconciliation

The working files reconcile production commit `fbc7a2b3d33d1bd4678343abe3ed59e7e3617f39`, including the four homepage redesign commits after `9a8948ee4b2263280c4dd7736e256b0d3a109b1a`. The new editorial grid, Market Pulse dashboard, typography, account controls and removal of the breaking banner from the shared layout are retained. Local search request ordering/cancellation, safe shared HTML decoding, friendly AI/news errors, direct image/fallback handling and independent AI rendering are carried into the new homepage. The new dashboard uses bounded requests, ignores cancelled/late responses, validates quote/sector rows, reports partial data and keeps missing changes distinct from real zero. Existing API Redis quotas, request deadlines, subscription safeguards, modal retry/timeout, Markets tab isolation/mobile handling, nullable Market Buzz formatting and dependency patches remain intact. No new commit or deployment is part of reconciliation; local edits remain unstaged.

The production wildcard image proxy configuration is intentionally superseded by the existing direct (`unoptimized`) Next Image handling; arbitrary feed images continue to work without enabling a proxy for every HTTP/HTTPS host. `.env.example` is documentation copied from production; active environment files and credentials are unchanged.

### Newsletter sender

Welcome emails use `InvestRadar <newsletter@investradar.live>` instead of Resend's test sender. The domain must be verified in Resend before releasing this change; no additional environment variable is required. Receiving email is not enabled by this sending-domain setup.

The welcome idempotency namespace is `newsletter-welcome/v2`: changing the sender changes the request payload, so reusing v1 keys could cause Resend idempotency conflicts for 24 hours. Retries and process restarts retain the same v2 key. A recipient previously sent a v1 welcome could receive one additional v2 welcome if they subscribe again after the local success cache expires.

## AI summary safeguards

`GET /api/briefs` runs only in Vercel production. The entire operation (Redis admission, news fetch, AI request and body reading) has a twelve-second deadline. A timeout aborts upstream requests and returns a generic `504`; late news or Redis responses cannot start an AI request.

Atomic Redis admission allows five requests per client per minute, ten globally per minute, and one hundred globally per hour. These are fixed windows beginning with the first admitted request, shared across function instances using a separate `investradar:briefs:v1:<environment>` namespace. Query parameters, including `debug`, share the same quotas. Only Vercel's platform IP header is trusted; other hosts use a conservative shared client bucket. IPs are hashed. Existing `KV_REST_API_URL` and `KV_REST_API_TOKEN` are reused; no additional environment variables are required. Redis uses a three-second deadline and no retries; missing or unavailable Redis returns `503` before any news or AI request.

Rate limits return `429` with `Retry-After`. All responses are non-cacheable and the route is dynamic so cached responses cannot bypass admission. Successful responses still use the configured Groq model. The homepage displays a friendly unavailable, timeout or busy message rather than silently treating failure as an empty digest.


### Source-bound AI briefs

The model selects and ranks article IDs; it does not supply displayed prose or citations. Each brief uses one validated HTTP(S) source URL, the original headline and the original description (or the headline if the description is missing or oversized). This preserves source uncertainty and attribution without relying on model paraphrasing or merging unrelated stories. Descriptions are included in the selection prompt as untrusted JSON data. Unknown IDs and duplicate selections cannot add citations; a response with no valid selections returns a generic non-cacheable error. Source text itself is not independently fact-checked, and these are AI-selected excerpts rather than multi-source generated summaries. Existing model configuration, request deadline, admission limits and response fields remain intact.

If a nonempty news pool contains no valid articles, the briefs endpoint returns a generic non-cacheable `502` before calling the AI provider, including in debug mode. A genuinely empty news pool remains a successful empty result; mixed pools retain their valid articles.

## News promotion filtering

The shared `/api/news` pool excludes coupon/code shopping destinations and titles that combine explicit coupon/code language or a shopping guide/call-to-action format with savings offers. Generic deal, offer, sale and savings words alone are insufficient: merger cost savings, bond coupon savings and reporting on retail price wars remain available. Filtering runs before search, deduplication and output limits, so homepage and AI news selection use the same filtered pool. Healthy promotion-only sources produce a successful empty result; provider failures retain the existing error and partial-result behavior. This conservative rule-based filter is not a general relevance classifier.

## Market and social request deadlines

Finnhub quotes/news/profiles, CoinGecko, Yahoo, Reddit and Stocktwits requests have a five-second limit including JSON body reading. Multi-stage market, trending and Stocktwits stream requests share an eight-second budget; expired work cannot start another provider request. Healthy partial quotes/streams remain available using the existing partial-result signals. Provider failures retain generic responses and do not generate replacement prices or conversations.

Markets, Market Pulse, Stocktwits conversations, headline stock pills and the ticker also bound their browser requests to twelve seconds, including JSON reading. Timeout rejects even when a transport ignores abort; closing/unmounting cancels the request and clears its timer. Markets preserves previous quotes and the successful-update timestamp on failure, and Refresh allows retry. Existing news-modal timeouts remain unchanged.

## Shared market and news admission

Public market, ETF, penny, sector, crypto, trending and Stocktwits endpoints share a weighted Redis window: 240 units per client and 1,200 globally per minute. A quote costs one unit per symbol; the default watchlist costs 11, index/ETF lists 30, penny 15, sectors 10, single quote+profile 2, trending 14 and Stocktwits streams 4. Crypto and Stocktwits symbol lists cost 1. News, global-news, topic-news, breaking-news and company-news requests share a separate window of 30 requests per client and 300 globally per minute. These are fixed windows starting at first admission, not provider-specific quota guarantees.

Atomic Lua checks both budgets before incrementing either. Endpoint and query changes do not create new buckets. Only Vercel's platform IP header is trusted; other hosts use one conservative client bucket. IP addresses are hashed. Production, preview and development namespaces are separate. Existing `KV_REST_API_URL` and `KV_REST_API_TOKEN` are reused without additional configuration. Redis errors, missing credentials or a three-second admission deadline return a generic non-cacheable `503` before provider access. Limits return `429` with `Retry-After`; routes are dynamic so cached endpoint responses cannot bypass admission. Upstream response caching is preserved.

`/api/market` accepts at most 30 comma-separated symbols (5 for `multi-quote`), 15 characters per symbol and 479 characters for the complete decoded list. Empty/malformed entries, repeated symbol parameters and ambiguous single-symbol/list combinations return non-cacheable `400` before admission/provider calls. Lists normalize to uppercase and deduplicate. Oversized lists are rejected rather than silently truncated.

Run isolated real Redis admission tests with `node --env-file=.env.local --test tests/data-rate-limit-distributed.integration.mjs`. They use unique `investradar:test:data-limits:*` keys and delete only those keys.

## Detail-page provider admission

Stock and crypto server-rendered detail pages share the same market/news Redis budgets as the API routes. Stock quote + profile admission costs two market units; crypto admission costs one. A page's NewsAPI request requires a separate news unit. Market rejection or Redis failure stops all provider calls for that detail; news rejection keeps admitted market data visible and displays a friendly message. Pages remain navigable server-rendered documents rather than returning the API's JSON error response.

`lib/detailRequests.ts` reads the platform client-IP header through Next's request-time `headers()` API. Its React `cache` is scoped to the current render: crypto metadata and page rendering share one market admission and one CoinGecko result, while a subsequent visitor/request must be admitted again. No process-wide success/admission cache is used. The pages explicitly render dynamically; provider fetch cache settings and the existing shared provider deadline remain intact. Credentials and limiter configuration reuse existing environment variables.

All Redis limiter clients (data, AI and subscriptions) explicitly set `retry: { retries: 0 }`: the installed SDK treats `retry: false` as two network attempts. A regression test exercises the installed SDK to ensure an ambiguous admission write is never automatically retried.

## News provider availability

News, global-news, topic-news and breaking-news distinguish confirmed empty results from unavailable providers. HTTP errors, deadline failures, provider error envelopes and invalid article lists are failures. Complete outages return generic `503` JSON with `Cache-Control: no-store` and `Retry-After: 30`; missing credentials cannot generate a successful empty response. Valid empty lists and searches with no matches remain successful. Healthy partial results, including breaking-news fallback recovery, retain `200` and signal unavailable sources with `X-News-Data-Partial: true` and `Cache-Control: no-store`. Existing response arrays, rate limits and request deadlines are preserved.

### Global news regions

`global-news` performs three parallel GNews Search requests, one per Americas/Europe/Asia bucket, with regional subject terms AND business/economy/markets/finance terms searched in article titles and descriptions. Publisher country is not used as article geography. Each response stays in its requested region and is capped at three articles; an empty or failed region is never filled from another region. These are keyword-based regional business searches, not exhaustive geographic classification; a cross-region story may legitimately match multiple queries. Each source retains its five-second deadline and thirty-minute upstream cache. Three provider requests replace the previous single global request; the existing news admission limit remains unchanged. Healthy partial regions return `200` with `X-News-Data-Partial: true`; a complete outage remains a generic `503`.

## GitHub Actions CI

`.github/workflows/ci.yml` runs on pull requests, every branch push, and manual dispatch. Four independent Node.js 24 jobs install the lockfile with `npm ci`, then run lint, `npm run typecheck`, `npm test`, and `npm run build`. The build script explicitly runs `next build --webpack`, so local builds, CI and Vercel's default npm build path use the same bundler. Typecheck generates Next.js route types before checking a clean checkout. The test glob excludes external Redis integration tests, which remain explicit manual checks. CI does not require application secrets or deploy anything.

Actions are pinned to commit SHAs, repository permission is read-only, checkout credentials are not persisted, and outdated runs are cancelled. `CI gate` succeeds only when every matrix check succeeds; it can be selected as a required branch-protection check once this workflow has run on GitHub. Adding the workflow does not itself change repository protection rules. All new source and test files must be included in the eventual commit so a fresh checkout can run the full suite.

### Trending availability

`GET /api/trending` reports `availability.trending`, `availability.reddit`, and `availability.coins` as `ok` or `unavailable`. A total Yahoo/Reddit/CoinGecko outage returns generic `503` JSON with empty arrays, `Cache-Control: no-store` and `Retry-After: 30`. Invalid provider response containers are failures too. A valid empty provider list remains a successful result. Healthy partial results retain `200` and `X-Market-Data-Partial: true`; missing enrichment prices remain `null`. Existing shared admission and provider deadlines still apply. Reddit fallback recovery remains available without fabricating posts.

### CI-only branch pushes

`vercel.json` disables automatic Vercel Git deployments for both `mobile-fixes` and `main`. GitHub Actions still runs on pushes and pull requests. The `main` rule takes effect when this configuration reaches `main`, preventing the merge from automatically publishing a new production deployment. The existing production deployment stays in place. Other branches retain Vercel's default Git deployment behavior; manual deployments still require explicit approval.
