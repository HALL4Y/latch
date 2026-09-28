# Latch

A desktop app to search, unlock, and copy Proton Pass items without living in the terminal.

Latch is a desktop client for Proton Pass. Every vault operation goes through Proton's official `pass-cli`. Latch does not talk to Proton's servers on its own, and it does not keep a second copy of the vault.

This is an independent project. It is not affiliated with Proton AG, and it is not endorsed by Proton.

## Status

This repository has just been opened. The app has not been started.

There is no source tree, no installer, and no release. This README is the only file in the repository.

## Requirements

Latch expects `pass-cli` to already be set up on the same machine:

- `pass-cli` is installed.
- You are already logged in with `pass-cli`.
- Your Proton account and session stay on your machine.

This repository does not ship Proton credentials, tokens, or session files. Do not commit them here.

## What it is for

The app, once it exists, is meant for the parts of Proton Pass that are awkward to do from a shell prompt:

- Search items you already store in Proton Pass.
- Unlock the vault through the existing `pass-cli` session.
- Copy a username, password, or one-time code, then go back to the window you were using.

Until that work starts, none of the above is implemented.

## What it is not

- Not an official Proton product.
- Not a password store of its own.
- Not a place to paste secrets, export files, or account recovery data.
