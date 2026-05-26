#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const home = os.homedir();
const stateDir = path.join(home, ".codex-ctx");
const wrapperPath = path.join(home, ".local", "bin", "codex");
const realCodexPathFile = path.join(stateDir, "real_codex");
const wrapperTemplatePath = path.join(rootDir, "templates", "codex-wrapper.sh");
const wrapperMarker = "codex-ctx wrapper";

function usage() {
  console.log(`Usage:
  codex-ctx install [--real-codex <path>] [--force] [--no-modify-shell]
  codex-ctx doctor
  codex-ctx uninstall

Installs a small codex wrapper at ~/.local/bin/codex. The wrapper handles
"codex ctx ..." and forwards every other command to the real Codex CLI.`);
}

function fail(message, code = 1) {
  console.error(`codex-ctx: ${message}`);
  process.exit(code);
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExists(cmd) {
  const result = spawnSync("sh", ["-lc", `command -v ${quoteShell(cmd)}`], {
    encoding: "utf8"
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function codexCandidatesFromPath() {
  const seen = new Set();
  const candidates = [];

  for (const entry of (process.env.PATH || "").split(path.delimiter)) {
    if (!entry) continue;

    const candidate = path.resolve(entry, "codex");
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    if (isExecutable(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function quoteShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function isInstalledWrapper(file) {
  try {
    return fs.readFileSync(file, "utf8").includes(wrapperMarker);
  } catch {
    return false;
  }
}

function readRealCodexPath() {
  try {
    return fs.readFileSync(realCodexPathFile, "utf8").trim();
  } catch {
    return "";
  }
}

function resolveRealCodex(explicitPath) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!isExecutable(resolved)) {
      fail(`--real-codex is not executable: ${resolved}`);
    }
    return resolved;
  }

  const existing = readRealCodexPath();
  if (existing && isExecutable(existing) && path.resolve(existing) !== path.resolve(wrapperPath)) {
    return existing;
  }

  const found = commandExists("codex");
  if (found) {
    const resolved = path.resolve(found);
    if (resolved !== path.resolve(wrapperPath) && !isInstalledWrapper(resolved)) {
      return resolved;
    }
  }

  for (const candidate of codexCandidatesFromPath()) {
    if (candidate === path.resolve(wrapperPath)) continue;
    if (isInstalledWrapper(candidate)) continue;
    return candidate;
  }

  fail("could not find the real Codex CLI. Install @openai/codex first, or pass --real-codex <path>.");
}

function parseArgs(argv) {
  const args = [...argv];
  const opts = {
    command: args.shift() || "help",
    force: false,
    modifyShell: true,
    realCodex: ""
  };

  while (args.length) {
    const arg = args.shift();
    if (arg === "--force") {
      opts.force = true;
    } else if (arg === "--no-modify-shell") {
      opts.modifyShell = false;
    } else if (arg === "--real-codex") {
      opts.realCodex = args.shift() || "";
      if (!opts.realCodex) fail("--real-codex requires a path");
    } else if (arg === "-h" || arg === "--help") {
      opts.command = "help";
    } else {
      fail(`unknown argument: ${arg}`, 2);
    }
  }

  return opts;
}

function install(opts) {
  const realCodex = resolveRealCodex(opts.realCodex);

  if (fs.existsSync(wrapperPath) && !isInstalledWrapper(wrapperPath) && !opts.force) {
    fail(`${wrapperPath} already exists and was not installed by codex-ctx. Use --force to replace it.`);
  }

  mkdirp(stateDir);
  mkdirp(path.dirname(wrapperPath));

  fs.writeFileSync(realCodexPathFile, `${realCodex}\n`, { mode: 0o600 });

  let wrapper = fs.readFileSync(wrapperTemplatePath, "utf8");
  wrapper = wrapper.replaceAll("__CODEX_CTX_MARKER__", wrapperMarker);
  fs.writeFileSync(wrapperPath, wrapper, { mode: 0o755 });
  fs.chmodSync(wrapperPath, 0o755);

  console.log(`Installed codex-ctx wrapper: ${wrapperPath}`);
  console.log(`Real Codex CLI: ${realCodex}`);

  const shellConfig = opts.modifyShell ? ensureShellPath() : null;
  if (!shellConfig) {
    checkPathAdvice();
  }

  console.log("");
  console.log("Next steps:");
  if (shellConfig) {
    console.log(`  source ${shellConfig}`);
  } else {
    console.log('  export PATH="$HOME/.local/bin:$PATH"');
  }
  console.log("  hash -r 2>/dev/null || rehash");
  console.log("  type -a codex");
  console.log("  codex ctx");
  console.log("");
  console.log("The first `codex` from `type -a codex` must be:");
  console.log(`  ${wrapperPath}`);
}

function uninstall() {
  if (!fs.existsSync(wrapperPath)) {
    console.log("codex-ctx wrapper is not installed.");
    return;
  }

  if (!isInstalledWrapper(wrapperPath)) {
    fail(`${wrapperPath} exists but was not installed by codex-ctx; refusing to remove it.`);
  }

  fs.rmSync(wrapperPath);
  console.log(`Removed codex-ctx wrapper: ${wrapperPath}`);
  console.log(`Kept state in ${stateDir} and auth contexts in ~/.codex-auth-contexts.`);
}

function checkPathAdvice() {
  const pathEntries = (process.env.PATH || "").split(path.delimiter);
  const localBin = path.join(home, ".local", "bin");
  const wrapperIndex = pathEntries.indexOf(localBin);
  const codexPath = commandExists("codex");

  if (wrapperIndex === -1) {
    console.log("");
    console.log("Add this to your shell config so the wrapper is found first.");
    console.log("For zsh, put it near the end of ~/.zshrc, after nvm/homebrew setup:");
    console.log('  export PATH="$HOME/.local/bin:$PATH"');
    return;
  }

  if (codexPath && path.resolve(codexPath) !== path.resolve(wrapperPath)) {
    console.log("");
    console.log("Your current shell still resolves codex to:");
    console.log(`  ${codexPath}`);
    console.log("Run:");
    console.log('  export PATH="$HOME/.local/bin:$PATH"');
    console.log("  hash -r 2>/dev/null || rehash");
  }
}

function shellConfigPath() {
  const shell = process.env.SHELL || "";
  const shellName = path.basename(shell);

  if (shellName === "zsh") return path.join(home, ".zshrc");
  if (shellName === "bash") return path.join(home, ".bashrc");

  if (fs.existsSync(path.join(home, ".zshrc"))) return path.join(home, ".zshrc");
  if (fs.existsSync(path.join(home, ".bashrc"))) return path.join(home, ".bashrc");

  return "";
}

function ensureShellPath() {
  const configPath = shellConfigPath();
  if (!configPath) {
    console.log("");
    console.log("Could not detect a shell config file to update.");
    return null;
  }

  const block = [
    "",
    "# >>> codex-ctx >>>",
    'export PATH="$HOME/.local/bin:$PATH"',
    "# <<< codex-ctx <<<",
    ""
  ].join("\n");

  let existing = "";
  try {
    existing = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.log("");
      console.log(`Could not read ${configPath}: ${error.message}`);
      return null;
    }
  }

  if (existing.includes("# >>> codex-ctx >>>")) {
    console.log("");
    console.log(`Shell config already contains codex-ctx PATH setup: ${configPath}`);
    return configPath;
  }

  fs.appendFileSync(configPath, block, { mode: 0o644 });
  console.log("");
  console.log(`Updated shell config: ${configPath}`);
  return configPath;
}

function doctor() {
  const realCodex = readRealCodexPath();
  const codexPath = commandExists("codex");

  console.log("codex-ctx doctor");
  console.log(`wrapper: ${wrapperPath}`);
  console.log(`wrapper installed: ${isInstalledWrapper(wrapperPath) ? "yes" : "no"}`);
  console.log(`command -v codex: ${codexPath || "not found"}`);
  console.log(`real codex: ${realCodex || "not configured"}`);
  console.log(`real codex executable: ${realCodex && isExecutable(realCodex) ? "yes" : "no"}`);
  console.log(`state dir: ${stateDir}`);
  console.log(`auth contexts: ${path.join(home, ".codex-auth-contexts")}`);

  if (codexPath && path.resolve(codexPath) !== path.resolve(wrapperPath)) {
    console.log("");
    console.log("warning: codex does not resolve to the codex-ctx wrapper in this shell.");
    console.log(`expected first codex: ${wrapperPath}`);
  }
}

const opts = parseArgs(process.argv.slice(2));

switch (opts.command) {
  case "install":
    install(opts);
    break;
  case "uninstall":
    uninstall();
    break;
  case "doctor":
    doctor();
    break;
  case "help":
    usage();
    break;
  default:
    fail(`unknown command: ${opts.command}`, 2);
}
