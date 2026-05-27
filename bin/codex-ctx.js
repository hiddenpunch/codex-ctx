#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const home = os.homedir();
const codexHome = process.env.CODEX_HOME || path.join(home, ".codex");
const activeAuth = path.join(codexHome, "auth.json");
const stateDir = path.join(home, ".codex-ctx");
const currentFile = path.join(stateDir, "current");
const contextsDir = path.join(home, ".codex-auth-contexts");

function usage() {
  console.log(`Usage:
  codex-ctx init             Save current Codex auth as the default context
  codex-ctx add <name>       Save current Codex auth as a context
  codex-ctx create <name>    Create an empty context and clear active auth
  codex-ctx use <name>       Switch Codex auth to a saved context
  codex-ctx list             List saved contexts
  codex-ctx current          Show current context
  codex-ctx remove <name>    Remove a saved context
  codex-ctx doctor           Show storage and auth status

  Codex sessions, config, logs, and caches stay shared in ~/.codex.
Only ~/.codex/auth.json is switched.`);
}

function fail(message, code = 1) {
  console.error(`codex-ctx: ${message}`);
  process.exit(code);
}

function mkdirp(dir, mode = 0o700) {
  fs.mkdirSync(dir, { recursive: true, mode });
  try {
    fs.chmodSync(dir, mode);
  } catch {
    // Best effort: chmod can fail on some filesystems.
  }
}

function validContextName(name) {
  return /^[A-Za-z0-9._-]+$/.test(name);
}

function requireContextName(name) {
  if (!name) {
    fail("context name is required", 2);
  }
  if (!validContextName(name)) {
    fail("invalid context name; use only letters, numbers, dot, underscore, or dash", 2);
  }
}

function contextDir(name) {
  return path.join(contextsDir, name);
}

function contextAuth(name) {
  return path.join(contextDir(name), "auth.json");
}

function readCurrent() {
  try {
    const value = fs.readFileSync(currentFile, "utf8").trim();
    return value || "default";
  } catch {
    return "default";
  }
}

function writeCurrent(name) {
  mkdirp(stateDir);
  fs.writeFileSync(currentFile, `${name}\n`, { mode: 0o600 });
}

function hasActiveAuth() {
  return fs.existsSync(activeAuth);
}

function hasContext(name) {
  return fs.existsSync(contextAuth(name));
}

function copyFilePreservingMode(from, to) {
  fs.copyFileSync(from, to);
  try {
    fs.chmodSync(to, fs.statSync(from).mode & 0o777);
  } catch {
    fs.chmodSync(to, 0o600);
  }
}

function initDefault(options = {}) {
  if (hasContext("default") && !options.force) {
    writeCurrent("default");
    console.log("default context already exists");
    console.log("run: codex-ctx init --force to overwrite it with the current active auth");
    return;
  }

  if (!hasActiveAuth()) {
    fail(`no active Codex auth found at ${activeAuth}; run codex login first`);
  }

  mkdirp(contextDir("default"));
  copyFilePreservingMode(activeAuth, contextAuth("default"));
  writeCurrent("default");
  console.log("initialized default context from current Codex auth");
}

function saveActiveTo(name) {
  requireContextName(name);
  if (!hasActiveAuth()) {
    fail(`no active Codex auth found at ${activeAuth}; run codex login first`);
  }

  mkdirp(contextDir(name));
  copyFilePreservingMode(activeAuth, contextAuth(name));
  writeCurrent(name);
  console.log(`saved current Codex auth as context: ${name}`);
}

function createContext(name) {
  requireContextName(name);
  mkdirp(contextDir(name));
  try {
    fs.rmSync(contextAuth(name), { force: true });
    fs.rmSync(activeAuth, { force: true });
  } catch {
    // rmSync with force should not throw for missing files, but keep create best-effort.
  }
  writeCurrent(name);
  console.log(`created empty context: ${name}`);
  console.log("run: codex login");
  console.log(`then: codex-ctx add ${name}`);
}

function useContext(name) {
  requireContextName(name);
  if (!hasContext(name)) {
    fail(`context not found: ${name}\nrun: codex-ctx add ${name}`);
  }

  mkdirp(codexHome);
  copyFilePreservingMode(contextAuth(name), activeAuth);
  fs.chmodSync(activeAuth, 0o600);
  writeCurrent(name);
  console.log(`codex-ctx -> ${name}`);
}

function listContexts() {
  mkdirp(contextsDir);
  const current = readCurrent();
  const names = fs.readdirSync(contextsDir)
    .filter((name) => fs.statSync(contextDir(name)).isDirectory())
    .sort();

  if (names.length === 0) {
    console.log("no contexts saved");
    return;
  }

  for (const name of names) {
    const marker = name === current ? "*" : " ";
    const state = hasContext(name) ? "auth saved" : "not logged in";
    console.log(`${marker} ${name}\t${state}\t${contextDir(name)}`);
  }
}

function currentContext() {
  const current = readCurrent();
  const state = hasActiveAuth() ? "auth present" : "not logged in";
  console.log(`current: ${current}`);
  console.log(`active auth: ${activeAuth} (${state})`);
  console.log(`stored auth: ${contextAuth(current)}`);
}

function removeContext(name) {
  requireContextName(name);
  const dir = contextDir(name);
  if (!fs.existsSync(dir)) {
    fail(`context not found: ${name}`);
  }

  fs.rmSync(dir, { recursive: true, force: true });
  if (readCurrent() === name) {
    writeCurrent("default");
  }
  console.log(`removed context: ${name}`);
}

function doctor() {
  mkdirp(stateDir);
  mkdirp(contextsDir);
  console.log("codex-ctx doctor");
  console.log(`Codex home: ${codexHome}`);
  console.log(`active auth: ${activeAuth} (${hasActiveAuth() ? "present" : "missing"})`);
  console.log(`contexts dir: ${contextsDir}`);
  console.log(`state dir: ${stateDir}`);
  console.log(`current: ${readCurrent()}`);
  console.log(`saved contexts: ${fs.readdirSync(contextsDir).filter((name) => fs.statSync(contextDir(name)).isDirectory()).length}`);
  if (!hasContext("default")) {
    console.log("default context: missing");
    if (hasActiveAuth()) {
      console.log("run: codex-ctx init");
    } else {
      console.log("run: codex login, then codex-ctx init");
    }
  } else {
    console.log("default context: present");
  }
}

function parse(argv) {
  const [command, name, ...rest] = argv;
  const force = rest.includes("--force") || name === "--force";
  const extras = rest.filter((arg) => arg !== "--force");
  if (extras.length > 0) {
    fail(`unexpected argument: ${extras[0]}`, 2);
  }

  switch (command || "help") {
    case "init":
      initDefault({ force });
      break;
    case "add":
    case "save":
      if (force) fail("--force is only supported by init", 2);
      saveActiveTo(name);
      break;
    case "create":
    case "new":
      if (force) fail("--force is only supported by init", 2);
      createContext(name);
      break;
    case "use":
    case "switch":
      if (force) fail("--force is only supported by init", 2);
      useContext(name);
      break;
    case "list":
    case "ls":
      listContexts();
      break;
    case "current":
    case "status":
      currentContext();
      break;
    case "remove":
    case "rm":
    case "delete":
      if (force) fail("--force is only supported by init", 2);
      removeContext(name);
      break;
    case "doctor":
      doctor();
      break;
    case "-h":
    case "--help":
    case "help":
      usage();
      break;
    default:
      fail(`unknown command: ${command}`, 2);
  }
}

mkdirp(stateDir);
mkdirp(contextsDir);
parse(process.argv.slice(2));
