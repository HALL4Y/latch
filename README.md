# Latch

Latch is a **local web interface** for users who need fine-grained control over [Proton Pass CLI](https://protonpass.github.io/pass-cli/) (`pass-cli`). It is an independent client and is **not affiliated with Proton AG**.

## Install location

Clone and run Latch at:

```text
~/dev/h4ll4y/latch
```

Do **not** put the project at the root of your home directory (`~/latch`).

## Zero trust

- Latch does **not** store vault items, passwords, tokens, PATs, or session secrets.
- It attaches to your **already installed, already logged-in** `pass-cli` on the same machine.
- Nothing is sent to a remote backend; command composition and optional local execution stay on your computer.
- Latch **never** runs `pass-cli` via `sudo` or as root.

## What Latch is for

- **Governance**: PATs scoped to vaults or items, agents, vault members, shares, and access inspection (only what the official CLI documents).
- **Command mastery**: spec-driven forms for documented flags, multi-step **groups**, and POSIX `sh` scripts (not zsh) with bindings to earlier step metadata (IDs, roles, expiry — not secret values).
- Latch is **not** an item browser: it does not retrieve item payloads or surface passwords/secrets in the UI.

Official documentation is cited in the app. The offline command spec ships as `spec-snapshot.part1.json` … `part4.json` (regenerated together by `npm run fetch-spec`). **Refresh** in the app re-fetches the published docs.

## Requirements

- Node.js 20+
- npm 11.10+ recommended (for `min-release-age` in `.npmrc`; older npm ignores unknown keys)
- `pass-cli` on your `PATH` (optional for composing scripts; required for in-app version check and local run of non-secret commands)

## npm install hardening (2025–2026 supply chain)

This repo stays on **npm** (not pnpm/yarn/bun). [npmx.dev](https://npmx.dev) is a **registry browser**, not an installer — it does not replace npm.

Project `.npmrc`:

- `ignore-scripts=true` — dependency lifecycle scripts do not run on install (aligns with npm 12 defaults).
- `min-release-age=7` — only package versions published at least 7 days ago resolve (npm 11.10+).

**Preferred install in CI and clean machines:**

```bash
cd ~/dev/h4ll4y/latch
npm ci
```

For local development when `package-lock.json` changes:

```bash
npm install
npm run fetch-spec   # optional; part snapshots are committed
npm run dev
```

Open **http://127.0.0.1:4317**.

## Build

```bash
npm run build
npm run preview
```

## macOS keychain (`-25308`)

If `pass-cli` was ever run with `sudo`, macOS may refuse keychain access (`User interaction is not allowed`) because `sudo` gives root ownership of the local database. Use only your normal GUI user for `pass-cli`. Latch never runs or suggests `sudo`, and will not offer a `sudo` “fix” for keychain errors.

## License

MIT (see repository defaults).
