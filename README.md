# Latch

Latch is a **local web interface** for users who need fine-grained control over [Proton Pass CLI](https://protonpass.github.io/pass-cli/) (`pass-cli`). It is an independent client and is **not affiliated with Proton AG**.

## Zero trust

- Latch does **not** store vault items, passwords, tokens, PATs, or session secrets.
- It attaches to your **already installed, already logged-in** `pass-cli` on the same machine.
- Nothing is sent to a remote backend; command composition and optional local execution stay on your computer.

## What Latch is for

- **Governance**: PATs scoped to vaults or items, agents, vault members, shares, and access inspection (only what the official CLI documents).
- **Command mastery**: spec-driven forms for documented flags, multi-step **groups**, and POSIX `sh` scripts (not zsh) with bindings to earlier step metadata (IDs, roles, expiry — not secret values).
- Latch is **not** an item browser: it does not retrieve item payloads or surface passwords/secrets in the UI.

Official documentation is cited in the app. The offline command spec ships as `spec-snapshot.part1.json` … `part4.json` (regenerated together by `npm run fetch-spec`). **Refresh** in the app re-fetches the published docs.

## Requirements

- Node.js 20+
- `pass-cli` on your `PATH` (optional for composing scripts; required for in-app version check and local run of non-secret commands)

## Run locally

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

## License

MIT (see repository defaults).
