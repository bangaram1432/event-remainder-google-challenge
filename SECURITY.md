# Security

## Scope and trust boundaries
Jubilee has no accounts, database or payments. The only secrets are `GEMINI_API_KEY` and, optionally, the Upstash token,
both held in server environment variables. The browser talks only to this origin; the server talks to the Gemini API
(and optionally Upstash).

| Boundary | Untrusted data | Controls |
|---|---|---|
| Browser → `/api/plan`, `/api/enhance` | Whole request body and headers | Same-origin check, `application/json` only, per-endpoint rate limit, streaming 8 KB cap, allow-list validation that builds a fresh object, Unicode and control-character sanitising, plan recomputed server-side |
| Server → Gemini | Notes and city | Redaction of emails, phones, keys and Luhn-valid cards; injection heuristics skip the AI step; system/user role separation; user data as escaped JSON; `store: false`; 12 s timeout; one retry only on invalid output; `max_output_tokens` cap |
| Gemini → server | Model output | Schema-constrained, canary-checked, re-validated, length-capped, links and HTML stripped, unknown categories dropped; AI ideas are flagged `source: "ai"` |
| Server → browser | Plan JSON | Rendered as text by React (no HTML sinks), nonce CSP, `no-store`, generic error messages |

## OWASP Top 10 for LLM Applications (2026 edition)
- **LLM01 Prompt Injection:** role separation, escaped JSON data, schema-constrained output, heuristic tripwire that skips the AI step.
- **LLM02 Sensitive Information Disclosure:** redaction before the model, `store: false`, no user text in logs, generic errors.
- **LLM03 Excessive Agency:** not applicable by construction. The model has no tools, network or write access.
- **LLM04 Supply Chain:** four runtime dependencies, lockfile, `npm audit` and CodeQL in CI.
- **LLM05 Data and Model Poisoning:** not applicable. There is no fine-tuning, retrieval corpus or user-contributed training data.
- **LLM06 Unbounded Consumption:** request and field caps, rate limits, timeout, retry cap, token cap, cache.
- **Hidden Context Exposure:** no secrets in prompts; per-request canary detects extraction.
- **LLM10 Improper Output Handling:** validation, sanitising, plain-text rendering, nonce CSP.

## Other threats considered
- **XSS and injection:** no HTML sinks; CSP blocks inline and third-party script; `__proto__` and unknown keys are never copied.
- **CSRF:** JSON-only content type forces a CORS preflight, plus an explicit Origin/Host check; no cookies are used.
- **Denial of service and cost abuse:** see LLM06; model-backed requests have a stricter limit than planning requests.
- **Secrets in the repository:** `.gitignore` excludes env files; `npm run preflight` scans files **and git history**, and CI runs the same scan.
- **Privacy:** notes and city are never stored or logged; client identifiers sent to the shared rate-limit store are SHA-256 hashed.

## Known limitations
- The injection heuristics and canary are tripwires, not boundaries; a determined attacker can phrase around regexes. That is why the real controls do not depend on them.
- Without the Upstash variables, rate limits and cache are per instance. With them, limits hold across instances using a fixed window.
- Client identification uses `x-forwarded-for`, which is trustworthy on Vercel; elsewhere ensure your proxy overwrites the header.
- No authentication by design; add it before storing any personal data.
- Dependabot is intentionally not enabled because it opens pull-request branches, which conflicts with the hackathon's single-branch rule. Run `npm audit` before submission.

## Reporting
Please open a private security advisory on the repository rather than a public issue.
