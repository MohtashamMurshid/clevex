# Contributing to clevex

Thanks for helping out. Bug reports, docs fixes, new templates and features are
all welcome.

## Before you start

- **Bugs:** search [existing issues](../../issues) first. If yours isn't there,
  open one with steps to reproduce, what you expected, and your browser and OS.
- **Features:** for anything bigger than a small fix, open an issue or
  discussion first so we can agree on the approach before you write it.
- **Security issues:** don't open a public issue. Follow
  [SECURITY.md](SECURITY.md).

## Development setup

Follow [docs/getting-started.md](docs/getting-started.md). In short:

```bash
pnpm install
npx convex dev          # terminal 1: keeps convex/ in sync with your dev deployment
pnpm dev                # terminal 2: http://localhost:3000
```

Use your own Convex dev deployment. You'll never need production credentials to
contribute.

> **Note:** this project uses **Next.js 16**, which changed some APIs. For
> example, `middleware.ts` is now `proxy.ts`. Check the docs bundled in
> `node_modules/next/dist/docs/` before relying on older Next.js patterns.

## Before opening a pull request

Run these and make sure they all pass:

```bash
pnpm lint
pnpm exec next typegen && pnpm typecheck
pnpm test
pnpm build
```

CI runs the same steps (`.github/workflows/ci.yml`).

Then:

- **Try your change in the browser.** For UI changes, include a screenshot or a
  short recording in the PR.
- **Add tests** for logic in `src/lib/`, such as parsers or edit application.
  Tests live in `tests/` and use Node's built-in `node:test`.
- **Update the docs** in `docs/` or the README if behavior or configuration
  changes.

## Code guidelines

- **TypeScript everywhere.** Avoid `any`; if you need an escape hatch, use a
  narrow cast.
- **Keep server routes stateless.** Never persist a user's ChatGPT or Claude
  credentials on the server or in Convex. They belong in the browser.
- **Authorize in Convex.** Every new query or mutation must call
  `requireUserId` or `requireProject` from `convex/lib.ts`. `src/proxy.ts` is
  only a convenience check.
- **Keep it deployable on Vercel.** Don't assume a writable filesystem outside
  the temp directory, long-lived processes, or local binaries. Anything
  local-only must check `isLocalRequest()`.
- **UI:** use the coss ui components in `src/components/ui/`. Add new ones with
  `pnpm dlx shadcn@latest add @coss/<name>`. Use the design tokens from
  `globals.css` instead of hard-coded colors.
- **Comments** explain *why*, not *what*. Keep them short.
- **Small, focused PRs** get reviewed faster than large ones.

## Commit and PR conventions

- Write commit subjects in the imperative mood, such as "Add Beamer template" or
  "Fix ⌘K on Firefox".
- In the PR description, say what changed and why, how you tested it, and
  include screenshots for UI work.
- By contributing, you agree that your contributions are licensed under the
  [MIT License](LICENSE).

## Good first contributions

- New project templates in `src/lib/templates.ts`
- Better LaTeX log parsing in `src/lib/latex/log.ts`, with tests
- More autocomplete entries in `src/components/workspace/latex-editor.tsx`
- Accessibility and keyboard navigation improvements
- Clearer docs wherever something tripped you up

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Be kind and
assume good intent.
