# codex-ctx

Switch Codex CLI auth contexts with `codex ctx work`.

`codex-ctx` installs a tiny `codex` wrapper. The wrapper handles only
`codex ctx ...` commands and forwards everything else to the real Codex CLI.

It switches only `~/.codex/auth.json`. Your Codex sessions, config, logs,
caches, and history stay shared in `~/.codex`.

## Install

```sh
npm install -g codex-ctx
codex-ctx install
```

Make sure `~/.local/bin` appears before the real Codex CLI in your `PATH`:

```sh
export PATH="$HOME/.local/bin:$PATH"
hash -r
```

Add that export to your shell config if needed.

## Usage

```sh
codex ctx
codex ctx list

codex ctx work
codex login

codex ctx personal
codex login

codex ctx work
codex
```

When you switch contexts, the current `~/.codex/auth.json` is saved under the
previous context, then the selected context's auth file is restored. If the
selected context has no saved auth yet, Codex becomes logged out until you run
`codex login`.

## Storage

Shared Codex home:

```text
~/.codex/
  auth.json
  config.toml
  sessions/
  log/
  cache/
```

Auth contexts:

```text
~/.codex-auth-contexts/
  work/auth.json
  personal/auth.json
```

Wrapper state:

```text
~/.codex-ctx/
  current
  real_codex
```

## Commands

```sh
codex ctx                 # show current auth context
codex ctx list            # list known auth contexts
codex ctx <name>          # switch auth context
codex ctx home [name]     # print auth storage path

codex-ctx install         # install ~/.local/bin/codex wrapper
codex-ctx doctor          # diagnose PATH and wrapper setup
codex-ctx uninstall       # remove wrapper
```

## Troubleshooting

If `codex ctx` starts Codex instead of printing context status, your shell is
still resolving `codex` to the real Codex CLI. Run:

```sh
export PATH="$HOME/.local/bin:$PATH"
hash -r
type -a codex
```

The first `codex` should be `~/.local/bin/codex`.

If the installer cannot find the real Codex CLI:

```sh
codex-ctx install --real-codex /path/to/codex
```

## Security

`codex-ctx` copies Codex auth files on your local machine. It does not upload
credentials or talk to a network service. Treat `~/.codex-auth-contexts` with
the same care as `~/.codex/auth.json`.
