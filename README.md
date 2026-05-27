# codex-ctx

Switch Codex CLI auth contexts without wrapping the `codex` command.

`codex-ctx` switches only `~/.codex/auth.json`. Your Codex sessions, config,
logs, caches, and history stay shared in `~/.codex`.

## Install

```sh
npm install -g codex-ctx
```

## Usage

Initialize `codex-ctx` from your current Codex login:

```sh
codex-ctx init
```

Add another account:

```sh
codex-ctx create work
codex login
codex-ctx add work
```

Switch accounts before starting Codex:

```sh
codex-ctx use default
codex

codex-ctx use work
codex
```

List and inspect contexts:

```sh
codex-ctx list
codex-ctx current
codex-ctx doctor
```

Remove a context:

```sh
codex-ctx remove work
```

## Commands

```sh
codex-ctx init             # save current ~/.codex/auth.json as default
codex-ctx add <name>       # save current ~/.codex/auth.json as a context
codex-ctx create <name>    # create an empty context and clear active auth
codex-ctx use <name>       # restore a saved context to ~/.codex/auth.json
codex-ctx list             # list saved contexts
codex-ctx current          # show current context
codex-ctx remove <name>    # remove a saved context
codex-ctx doctor           # show storage and auth status
```

Aliases:

```text
init --force overwrites the saved default context with the current active auth.

save   -> add
new    -> create
switch -> use
ls     -> list
status -> current
rm     -> remove
delete -> remove
```

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
  personal/auth.json
  work/auth.json
```

State:

```text
~/.codex-ctx/
  current
```

## Notes

`codex-ctx` does not install a `codex` wrapper and does not modify your shell
`PATH`. Run `codex-ctx use <name>` before `codex`.

If you previously used the experimental `codex ctx` wrapper, remove it
manually if needed:

```sh
rm ~/.local/bin/codex
hash -r 2>/dev/null || rehash
```

Only remove that file if it is the `codex-ctx` wrapper.

## Security

`codex-ctx` copies Codex auth files on your local machine. It does not upload
credentials or talk to a network service. Treat `~/.codex-auth-contexts` with
the same care as `~/.codex/auth.json`.
