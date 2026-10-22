# Engineering conventions

These mirror the habits of large engineering organisations (Google's engineering practices, trunk-based development,
readability review) at hackathon scale.

## Workflow
- **One branch, `main`.** Land small, atomic changes directly on trunk. No long-lived feature branches.
- **Every change ships with its tests** in the same commit. `npm run verify` must pass before you commit.
- **Commit messages** follow Conventional Commits: `type(scope): imperative summary`
  (`feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `chore`). Explain *why* in the body when it is not obvious.

## Code
- Strict TypeScript, no `any`. Names state domain intent (`allocateBudget`, not `process`).
- Comments explain **why** a decision was made, never what the code does. If a "what" comment is needed, extract a function.
- Keep modules single-purpose. Depend on small interfaces (`PlanEnhancer`, `RateLimiter`, `GeminiTransport`, `Logger`);
  only `server/container.ts` knows concrete implementations. Do not add an abstraction until a second implementation exists.
- Pure logic lives in `src/domain`, with no I/O, no clock and no framework imports. Pass the date in.

## Testing
- Prefer **state testing** with small fakes over interaction testing with mocks: inject a fake `GeminiTransport`
  and assert on returned state.
- Cover the normal path, boundaries and hostile input. Use table-driven cases (`it.each`) so a failure names the case.

## Security checklist for reviewers
- Does any new input pass through `parsePlanInput` or `sanitizeFreeText`?
- Is any model output rendered as anything other than plain text? (It must not be.)
- Could a log line contain user free text or a secret? (It must not.)
- Does the change add a dependency? Justify it; the runtime set is deliberately tiny.

## Accessibility checklist for reviewers
- Every control has a visible label; errors are linked with `aria-describedby`; focus moves sensibly.
- Status changes go through the pre-mounted live region. Colour is never the only signal.

## Before submitting
Run `npm run verify`, then `npm run preflight` (secrets, repository size, single branch), and after deploying,
`npm run preflight -- --only live --url https://your-app.vercel.app`.
