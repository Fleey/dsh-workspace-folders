// src/approval.ts
import { resolve as resolve2 } from "node:path";

// src/paths.ts
import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
function resolveInput(raw, base) {
  let text = raw.trim();
  if (text.length >= 2 && (text[0] === '"' || text[0] === "'") && text.at(-1) === text[0]) {
    text = text.slice(1, -1);
  }
  if (text === "~") text = homedir();
  else if (text.startsWith("~/") || text.startsWith(`~${sep}`)) text = join(homedir(), text.slice(2));
  return isAbsolute(text) ? resolve(text) : resolve(base, text);
}
function trimTrailingSeparators(path) {
  const trimmed = path.replace(/[\\/]+$/u, "");
  return trimmed === "" ? path.slice(0, 1) : trimmed;
}
function canonicalDirectory(path) {
  const canonical = realpathSync.native(path);
  if (!statSync(canonical).isDirectory()) throw new Error(`not a directory: ${path}`);
  return canonical;
}
function canonicalTarget(path) {
  const missing = [];
  let current = resolve(path);
  for (; ; ) {
    try {
      const real = realpathSync.native(current);
      return missing.length === 0 ? real : join(real, ...missing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      missing.push(basename(current));
      current = parent;
    }
  }
}
function canonicalRoot(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}
function isWithin(child, parent) {
  if (child === parent) return true;
  const prefix = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(prefix);
}
function directoryExists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// src/folders.ts
function describeProblem(problem) {
  switch (problem.code) {
    case "missing":
      return `not an existing directory: ${problem.path}`;
    case "inside-workspace":
      return `already inside the workspace: ${problem.path}`;
    case "duplicate":
      return `already added: ${problem.path}`;
  }
}
var FILE_WRITE_TOOLS = /* @__PURE__ */ new Set(["write", "edit"]);
var FULL_ACCESS = "danger-full-access";
var WorkspaceFolders = class {
  constructor(store, config) {
    this.store = store;
    this.config = config;
  }
  /**
   * Folders in effect for a workspace: configured globals first, then the
   * workspace's own list; a workspace entry overrides a global entry for the
   * same path. Folders equal to or inside the workspace are omitted because
   * the workspace already covers them.
   * @param workspace - the Session's original project directory.
   * @returns the effective folders in display order.
   */
  effective(workspace) {
    const root = canonicalRoot(workspace);
    const merged = /* @__PURE__ */ new Map();
    for (const entry of this.config.globalDirectories) {
      merged.set(entry.path, { ...entry, source: "global", exists: directoryExists(entry.path) });
    }
    for (const entry of this.store.get(workspace)) {
      merged.delete(entry.path);
      merged.set(entry.path, { ...entry, source: "workspace", exists: directoryExists(entry.path) });
    }
    return [...merged.values()].filter((folder) => !isWithin(canonicalRoot(folder.path), root));
  }
  /**
   * The read-write folder that contains a write target, when the write may be
   * pre-approved: pre-approval is enabled, the standing sandbox mode is
   * `workspace-write`, and the canonical target lies under an existing
   * read-write folder.
   * @param workspace - the Session's original project directory.
   * @param mode - the Session's standing sandbox mode.
   * @param target - canonical absolute target path.
   * @returns the granting folder, or undefined when the user must decide.
   */
  writeGrant(workspace, mode, target) {
    if (!this.config.autoApproveWrites || mode !== "workspace-write") return void 0;
    return this.effective(workspace).find((folder) => folder.access === "read-write" && folder.exists && isWithin(target, canonicalRoot(folder.path)));
  }
  /**
   * Validate a complete requested list for one workspace: every path must be
   * an existing directory outside the workspace, listed once, and not one of
   * the global folders. An entry already stored under the same path is kept
   * while its directory is missing. Paths are compared canonically, so
   * different spellings of one directory (a trailing slash, `/tmp` and
   * `/private/tmp`, a symlink) are duplicates.
   * @param workspace - the workspace the list belongs to.
   * @param requested - absolute paths with their access.
   * @param stored - the workspace's current entries.
   * @returns the canonical entries, or every problem found.
   */
  validate(workspace, requested, stored = []) {
    const root = canonicalRoot(workspace);
    const storedPaths = new Set(stored.map((entry) => entry.path));
    const globalPaths = new Set(this.config.globalDirectories.map((entry) => entry.path));
    const errors = [];
    const entries = /* @__PURE__ */ new Map();
    for (const { path, access } of requested) {
      const spelled = trimTrailingSeparators(path);
      let key;
      if (storedPaths.has(spelled) && !directoryExists(spelled)) {
        key = spelled;
      } else {
        try {
          key = trimTrailingSeparators(canonicalDirectory(path));
        } catch {
          errors.push({ code: "missing", path });
          continue;
        }
        if (isWithin(key, root)) {
          errors.push({ code: "inside-workspace", path });
          continue;
        }
      }
      if (entries.has(key) || globalPaths.has(key)) {
        errors.push({ code: "duplicate", path });
        continue;
      }
      entries.set(key, { path: key, access });
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true, entries: [...entries.values()] };
  }
};
function renderFoldersContext(workspace, folders, mode, autoApproveWrites) {
  if (folders.length === 0) return "";
  const lines = [
    `Additional workspace directories: the user added these directories to this session's workspace, alongside ${JSON.stringify(workspace)}. Treat them as part of the project and refer to their files by absolute path.`
  ];
  for (const folder of folders) {
    const notes = [folder.access === "read-only" ? "read-only: do not modify files here" : "read-write"];
    if (!folder.exists) notes.push("currently missing");
    lines.push(`- ${JSON.stringify(folder.path)} (${notes.join("; ")})`);
  }
  const writable = folders.some((folder) => folder.access === "read-write" && folder.exists);
  if (writable && autoApproveWrites && mode === "workspace-write") {
    lines.push(`To create or change a file in a read-write directory with the write or edit tool, pass sandbox_permissions ${JSON.stringify(FULL_ACCESS)} with a justification on that call; this workspace's settings approve such calls without asking the user. Other operations that modify these directories follow the normal sandbox escalation flow.`);
  }
  return lines.join("\n");
}

// src/approval.ts
var FULL_ACCESS_REASON = `escalate sandbox to ${FULL_ACCESS}:`;
function trackable(exec) {
  if (exec.agent === void 0 || !FILE_WRITE_TOOLS.has(exec.name)) return void 0;
  const args = exec.arguments;
  if (typeof args !== "object" || args === null) return void 0;
  const { file_path: filePath, sandbox_permissions: requested } = args;
  if (requested !== FULL_ACCESS || typeof filePath !== "string" || filePath.trim() === "") return void 0;
  return { agent: exec.agent, toolName: exec.name, filePath };
}
var WriteApprover = class {
  constructor(deps) {
    this.deps = deps;
  }
  calls = /* @__PURE__ */ new Map();
  /** Number of calls currently tracked; zero whenever no tracked call is dispatching. */
  get pending() {
    return this.calls.size;
  }
  /**
   * `tools/execute` listener: remember an escalated write for exactly the
   * lifetime of its dispatch.
   * @param exec - the dispatching call.
   * @param next - the rest of the dispatch chain.
   * @returns the chain's result unchanged.
   */
  async aroundExecute(exec, next) {
    const call = trackable(exec);
    if (call === void 0) return next();
    this.calls.set(exec.callId, call);
    try {
      return await next();
    } finally {
      if (this.calls.get(exec.callId) === call) this.calls.delete(exec.callId);
    }
  }
  /**
   * `approval/request` listener: answer `allowed-once` for a tracked call
   * whose target lies under a read-write folder; delegate everything else.
   * @param request - the pending approval request.
   * @param next - the next answerer.
   * @returns the outcome.
   */
  async answer(request, next) {
    const call = request.callId === void 0 ? void 0 : this.calls.get(request.callId);
    if (call === void 0 || call.agent !== request.agent || call.toolName !== request.toolName) return next();
    if (request.reason?.startsWith(FULL_ACCESS_REASON) !== true) return next();
    const grant = this.grantFor(call);
    if (grant === void 0) return next();
    this.deps.logger.info("pre-approved %s of %s inside additional directory %s", call.toolName, grant.target, grant.folder);
    return "allowed-once";
  }
  grantFor(call) {
    const { session } = call.agent;
    const workspace = session.header.cwd;
    const policy = this.deps.sandboxPolicy();
    if (workspace === void 0 || policy === void 0) return void 0;
    let base = workspace;
    try {
      base = this.deps.workingDirectory()?.get(session) ?? workspace;
    } catch {
    }
    const target = canonicalTarget(resolve2(base, call.filePath));
    const folder = this.deps.folders.writeGrant(workspace, policy.resolve({ session }).mode, target);
    return folder === void 0 ? void 0 : { target, folder: folder.path };
  }
};

// src/commands.ts
var READ_ONLY_FLAGS = /* @__PURE__ */ new Set(["--read-only", "--ro"]);
function parseAddDirInput(rawInput) {
  const words = rawInput.trim().split(/\s+/u);
  let access = "read-write";
  while (words.length > 0 && READ_ONLY_FLAGS.has(words.at(-1) ?? "")) {
    words.pop();
    access = "read-only";
  }
  while (words.length > 0 && READ_ONLY_FLAGS.has(words[0] ?? "")) {
    words.shift();
    access = "read-only";
  }
  return { path: words.join(" ").trim(), access };
}
function describe(folder) {
  const notes = [folder.access];
  if (folder.source === "global") notes.push("global");
  if (!folder.exists) notes.push("missing");
  return `${folder.path} (${notes.join(", ")})`;
}
function folderCommands(deps) {
  const { folders } = deps;
  const workspaceOf = (invocation) => invocation.agent.session.header.cwd;
  const baseOf = (invocation, workspace) => {
    try {
      return deps.workingDirectory()?.get(invocation.agent.session) ?? workspace;
    } catch {
      return workspace;
    }
  };
  const noWorkspace = { kind: "error", text: "This session has no workspace directory." };
  return [
    {
      name: "add-dir",
      description: "Add a working directory to this workspace",
      input: { hint: "<path> [--read-only]" },
      handler: async (invocation) => {
        const workspace = workspaceOf(invocation);
        if (workspace === void 0) return noWorkspace;
        const { path, access } = parseAddDirInput(invocation.rawInput);
        if (path === "") return { kind: "error", text: "Usage: /add-dir <path> [--read-only]" };
        const requested = resolveInput(path, baseOf(invocation, workspace));
        const validation = folders.validate(workspace, [{ path: requested, access }]);
        if (!validation.ok) return { kind: "error", text: validation.errors.map(describeProblem).join("\n") };
        const [added] = validation.entries;
        const current = folders.store.get(workspace);
        const existing = current.find((entry) => entry.path === added.path);
        if (existing !== void 0) {
          return {
            kind: "error",
            text: `${describeProblem({ code: "duplicate", path: added.path })} (${existing.access}). Remove it first to change its access.`
          };
        }
        await folders.store.set(workspace, [...current, added]);
        deps.changed(workspace);
        return { kind: "success", text: `Added ${added.path} (${access}). It applies from the next turn.` };
      }
    },
    {
      name: "remove-dir",
      description: "Remove a working directory from this workspace",
      input: { hint: "<path>" },
      handler: async (invocation) => {
        const workspace = workspaceOf(invocation);
        if (workspace === void 0) return noWorkspace;
        const text = invocation.rawInput.trim();
        if (text === "") return { kind: "error", text: "Usage: /remove-dir <path>" };
        const requested = resolveInput(text, baseOf(invocation, workspace));
        const target = canonicalRoot(requested);
        const current = folders.store.get(workspace);
        const kept = current.filter((entry) => entry.path !== requested && entry.path !== target);
        if (kept.length === current.length) {
          const global = folders.config.globalDirectories.some((entry) => entry.path === requested || entry.path === target);
          return {
            kind: "error",
            text: global ? `${requested} comes from the plugin's globalDirectories configuration and cannot be removed per workspace.` : `${requested} is not an additional directory of this workspace.`
          };
        }
        await folders.store.set(workspace, kept);
        deps.changed(workspace);
        return { kind: "success", text: `Removed ${target}. It applies from the next turn.` };
      }
    },
    {
      name: "dirs",
      description: "List this workspace's working directories",
      handler: (invocation) => {
        const workspace = workspaceOf(invocation);
        if (workspace === void 0) return noWorkspace;
        const extra = folders.effective(workspace);
        const lines = [`Workspace: ${workspace}`];
        if (extra.length === 0) lines.push("No additional directories. Add one with /add-dir <path>.");
        else lines.push("Additional directories:", ...extra.map((folder) => `  ${describe(folder)}`));
        return { kind: "success", text: lines.join("\n") };
      }
    }
  ];
}

// src/config.ts
import { homedir as homedir2 } from "node:os";
import { isAbsolute as isAbsolute3, join as join3 } from "node:path";

// src/instructions.ts
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync as realpathSync2 } from "node:fs";
import { join as join2 } from "node:path";
var INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"];
var TRUNCATION_MARKER = "\n[Additional-directory instructions truncated here to fit the configured size limit.]";
var MIN_INSTRUCTION_BYTES = Buffer.byteLength(TRUNCATION_MARKER, "utf8");
var INTRO = "Instructions from additional workspace directories. Follow each one when working with files in its directory; the workspace's own instructions apply elsewhere. They do not override system, developer, or direct user instructions.";
var OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
function readContainedFile(path, root, limit) {
  let real;
  try {
    real = realpathSync2.native(path);
  } catch {
    return void 0;
  }
  if (!isWithin(real, root)) return void 0;
  let fd;
  try {
    fd = openSync(real, OPEN_FLAGS);
  } catch {
    return void 0;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return void 0;
    const buffer = Buffer.alloc(Math.min(limit, stat.size + 1));
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    return { text: buffer.subarray(0, length).toString("utf8"), whole: length < buffer.length };
  } catch {
    return void 0;
  } finally {
    closeSync(fd);
  }
}
function readFolderInstructions(folders, readLimit) {
  const found = [];
  let total = 0;
  for (const folder of folders) {
    if (!folder.exists || total >= readLimit) continue;
    const root = canonicalRoot(folder.path);
    for (const file of INSTRUCTION_FILES) {
      const read = readContainedFile(join2(folder.path, file), root, readLimit - total);
      if (read === void 0) continue;
      const text = read.whole ? read.text.trim() : read.text;
      if (text !== "") {
        found.push({ folder: folder.path, file, text });
        total += Buffer.byteLength(text, "utf8");
      }
      break;
    }
  }
  return found;
}
function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && ((bytes[end] ?? 0) & 192) === 128) end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}
function renderInstructionsContext(instructions, maxBytes) {
  if (instructions.length === 0) return "";
  const parts = [INTRO];
  for (const { folder, file, text } of instructions) {
    parts.push(`Instructions for the additional directory ${JSON.stringify(folder)} (from ${file}):

${text}`);
  }
  const full = parts.join("\n\n");
  if (Buffer.byteLength(full, "utf8") <= maxBytes) return full;
  return truncateUtf8(full, maxBytes - MIN_INSTRUCTION_BYTES) + TRUNCATION_MARKER;
}

// src/store.ts
import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname as dirname2, isAbsolute as isAbsolute2 } from "node:path";
var STORE_VERSION = 1;
function isFolderAccess(value) {
  return value === "read-write" || value === "read-only";
}
function parseFolderEntries(value, where) {
  if (!Array.isArray(value)) throw new TypeError(`${where} must be an array`);
  const entries = /* @__PURE__ */ new Map();
  value.forEach((item, index) => {
    const at = `${where}[${index}]`;
    if (typeof item !== "object" || item === null) throw new TypeError(`${at} must be an object`);
    const { path, access } = item;
    if (typeof path !== "string" || !isAbsolute2(path)) throw new TypeError(`${at}.path must be an absolute path`);
    if (!isFolderAccess(access)) throw new TypeError(`${at}.access must be "read-write" or "read-only"`);
    const key = trimTrailingSeparators(path);
    entries.set(key, { path: key, access });
  });
  return [...entries.values()];
}
function parseDocument(raw, file) {
  if (typeof raw !== "object" || raw === null) throw new TypeError(`${file} must contain a JSON object`);
  const { version, workspaces } = raw;
  if (version !== STORE_VERSION) throw new TypeError(`${file}: unsupported version ${JSON.stringify(version)}`);
  if (typeof workspaces !== "object" || workspaces === null || Array.isArray(workspaces)) {
    throw new TypeError(`${file}: "workspaces" must be an object`);
  }
  const parsed = {};
  for (const [path, entry] of Object.entries(workspaces)) {
    if (!isAbsolute2(path)) throw new TypeError(`${file}: workspace key ${JSON.stringify(path)} must be an absolute path`);
    const directories = parseFolderEntries(entry?.directories, `${file}: workspaces[${JSON.stringify(path)}].directories`);
    if (directories.length > 0) parsed[trimTrailingSeparators(path)] = { directories };
  }
  return { version: STORE_VERSION, workspaces: parsed };
}
var FolderStore = class {
  /**
   * Load the store file. A missing file is an empty store; an unreadable or
   * malformed file fails loudly so a later save cannot overwrite it.
   * @param file - absolute JSON file path.
   */
  constructor(file) {
    this.file = file;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw new Error(`workspace-folders: cannot read ${file}`, { cause: error });
    }
    try {
      this.document = parseDocument(JSON.parse(text), file);
    } catch (error) {
      throw new Error(`workspace-folders: ${file} is malformed; fix or remove it, then restart`, { cause: error });
    }
  }
  document = { version: STORE_VERSION, workspaces: {} };
  queue = Promise.resolve();
  /**
   * Directories configured for one workspace.
   * @param workspace - absolute workspace path.
   * @returns its entries, empty when none are configured.
   */
  get(workspace) {
    return this.document.workspaces[trimTrailingSeparators(workspace)]?.directories ?? [];
  }
  /**
   * Replace one workspace's directories and persist the whole store.
   * @param workspace - absolute workspace path.
   * @param directories - complete new list; empty removes the workspace record.
   * @returns resolution once this write is durable.
   */
  set(workspace, directories) {
    const key = trimTrailingSeparators(workspace);
    const parsed = parseFolderEntries(directories, "directories");
    const commit = async () => {
      const workspaces = { ...this.document.workspaces };
      if (parsed.length === 0) delete workspaces[key];
      else workspaces[key] = { directories: parsed };
      const next = { version: STORE_VERSION, workspaces };
      await mkdir(dirname2(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}
`, "utf8");
      await rename(temporary, this.file);
      this.document = next;
    };
    const done = this.queue.then(commit, commit);
    this.queue = done.catch(() => {
    });
    return done;
  }
};

// src/config.ts
var DEFAULT_MAX_INSTRUCTION_BYTES = 32768;
function defaultStoreFile(env = process.env) {
  const home = env.DSH_HOME?.trim();
  return join3(home !== void 0 && home !== "" ? home : join3(homedir2(), ".dsh"), "workspace-folders.json");
}
function parseConfig(raw, env = process.env) {
  const value = raw ?? {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("workspace-folders: config must be an object");
  const known = /* @__PURE__ */ new Set(["autoApproveWrites", "globalDirectories", "storeFile", "loadInstructions", "maxInstructionBytes"]);
  for (const key of Object.keys(value)) {
    if (!known.has(key)) throw new TypeError(`workspace-folders: unknown config key "${key}"`);
  }
  const {
    autoApproveWrites = true,
    globalDirectories = [],
    storeFile,
    loadInstructions = false,
    maxInstructionBytes = DEFAULT_MAX_INSTRUCTION_BYTES
  } = value;
  if (typeof autoApproveWrites !== "boolean") throw new TypeError("workspace-folders: autoApproveWrites must be a boolean");
  if (typeof loadInstructions !== "boolean") throw new TypeError("workspace-folders: loadInstructions must be a boolean");
  if (typeof maxInstructionBytes !== "number" || !Number.isSafeInteger(maxInstructionBytes) || maxInstructionBytes < MIN_INSTRUCTION_BYTES) {
    throw new TypeError(`workspace-folders: maxInstructionBytes must be an integer of at least ${MIN_INSTRUCTION_BYTES}`);
  }
  if (storeFile !== void 0 && (typeof storeFile !== "string" || !isAbsolute3(storeFile))) {
    throw new TypeError("workspace-folders: storeFile must be an absolute path");
  }
  if (!Array.isArray(globalDirectories)) throw new TypeError("workspace-folders: globalDirectories must be an array");
  const expanded = globalDirectories.map((item) => typeof item === "object" && item !== null && typeof item.path === "string" ? { ...item, path: canonicalRoot(resolveInput(item.path, homedir2())) } : item);
  return {
    autoApproveWrites,
    globalDirectories: parseFolderEntries(expanded, "workspace-folders: globalDirectories"),
    storeFile: storeFile ?? defaultStoreFile(env),
    loadInstructions,
    maxInstructionBytes
  };
}

// src/routes.ts
import { dirname as dirname3, isAbsolute as isAbsolute4 } from "node:path";
var API_PREFIX = "/api/workspace-folders";
var RouteError = class extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
};
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
async function handle(run) {
  try {
    return json(200, { ok: true, data: await run() });
  } catch (error) {
    if (error instanceof RouteError) {
      return json(error.status, { ok: false, error: error.message, ...error.details ? { details: error.details } : {} });
    }
    return json(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
async function readJson(request) {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new RouteError(415, "content type must be application/json");
  }
  let body;
  try {
    body = await request.json();
  } catch {
    throw new RouteError(400, "invalid JSON body");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new RouteError(400, "body must be a JSON object");
  return body;
}
function isNative(capability) {
  return capability?.kind === "native" && "pick" in capability;
}
function isBrowse(capability) {
  return capability?.kind === "browse" && "list" in capability;
}
function parseRequestedDirectories(value) {
  if (!Array.isArray(value)) throw new RouteError(400, '"directories" must be an array');
  return value.map((item, index) => {
    const { path, access } = typeof item === "object" && item !== null ? item : {};
    if (typeof path !== "string" || path.trim() === "") throw new RouteError(400, `directories[${index}].path must be a non-empty string`);
    if (!isFolderAccess(access)) throw new RouteError(400, `directories[${index}].access must be "read-write" or "read-only"`);
    return { path, access };
  });
}
function folderRoutes(deps) {
  const locate = (sessionId) => {
    if (typeof sessionId !== "string" || sessionId === "") throw new RouteError(400, "sessionId is required");
    const session = deps.sessions()?.get(sessionId);
    const workspace = session?.header.cwd ?? deps.workspaceRegistry()?.list().find((entry) => entry.sessionIds.includes(sessionId))?.path;
    if (workspace === void 0) throw new RouteError(404, "this session has no workspace directory");
    return { workspace, session };
  };
  const view = (workspace, session) => {
    const policy = deps.sandboxPolicy();
    return {
      workspace,
      directories: deps.folders.effective(workspace),
      sandboxMode: policy === void 0 || session === void 0 ? null : policy.resolve({ session }).mode,
      autoApproveWrites: deps.folders.config.autoApproveWrites,
      picker: pickerKind()
    };
  };
  const pickerKind = () => {
    const capability = deps.directoryPicker()?.capability();
    return isNative(capability) ? "native" : isBrowse(capability) ? "browse" : null;
  };
  const listLevel = async (capability, path, signal) => {
    try {
      return await capability.list(path, signal);
    } catch (error) {
      signal.throwIfAborted();
      throw new RouteError(400, error instanceof Error ? error.message : String(error));
    }
  };
  return [
    {
      path: `${API_PREFIX}/state`,
      methods: ["GET"],
      requestBody: "buffered",
      fetch: (request) => handle(async () => {
        const { workspace, session } = locate(new URL(request.url).searchParams.get("sessionId"));
        return view(workspace, session);
      })
    },
    {
      path: `${API_PREFIX}/save`,
      methods: ["POST"],
      requestBody: "buffered",
      fetch: (request) => handle(async () => {
        const body = await readJson(request);
        const { workspace, session } = locate(body.sessionId);
        const requested = parseRequestedDirectories(body.directories).map(({ path, access }) => ({ path: resolveInput(path, workspace), access }));
        const validation = deps.folders.validate(workspace, requested, deps.folders.store.get(workspace));
        if (!validation.ok) throw new RouteError(400, "some directories are invalid", validation.errors);
        await deps.folders.store.set(workspace, validation.entries);
        deps.changed(workspace);
        return view(workspace, session);
      })
    },
    {
      path: `${API_PREFIX}/pick`,
      methods: ["POST"],
      requestBody: "buffered",
      fetch: (request) => handle(async () => {
        const capability = deps.directoryPicker()?.capability();
        if (!isNative(capability)) throw new RouteError(409, "no native directory picker is available");
        return { path: await capability.pick(request.signal) };
      })
    },
    {
      path: `${API_PREFIX}/browse`,
      methods: ["GET"],
      requestBody: "buffered",
      fetch: (request) => handle(async () => {
        const capability = deps.directoryPicker()?.capability();
        if (!isBrowse(capability)) throw new RouteError(409, "no directory browser is available");
        const params = new URL(request.url).searchParams;
        const path = params.get("path");
        if (path !== null) {
          if (!isAbsolute4(path)) throw new RouteError(400, "path must be absolute");
          return listLevel(capability, path, request.signal);
        }
        const sessionId = params.get("sessionId");
        if (sessionId !== null) {
          const start = dirname3(locate(sessionId).workspace);
          try {
            return await listLevel(capability, start, request.signal);
          } catch (error) {
            if (!(error instanceof RouteError)) throw error;
          }
        }
        return listLevel(capability, void 0, request.signal);
      })
    },
    {
      // Checks one typed or picked path when it is added, before the list is
      // saved: its canonical spelling lets the dialog spot duplicates.
      path: `${API_PREFIX}/resolve`,
      methods: ["GET"],
      requestBody: "buffered",
      fetch: (request) => handle(async () => {
        const params = new URL(request.url).searchParams;
        const { workspace } = locate(params.get("sessionId"));
        const typed = params.get("path");
        if (typed === null || typed.trim() === "") throw new RouteError(400, "path is required");
        const validation = deps.folders.validate(workspace, [{ path: resolveInput(typed, workspace), access: "read-write" }]);
        if (!validation.ok) return { problem: { ...validation.errors[0], path: typed.trim() } };
        return { path: validation.entries[0].path };
      })
    }
  ];
}

// src/index.ts
var name = "dsh-workspace-folders";
function apply(ctx, rawConfig) {
  const config = parseConfig(rawConfig);
  const folders = new WorkspaceFolders(new FolderStore(config.storeFile), config);
  const changed = (workspace) => {
    ctx.logger.info("additional directories of %s: %o", workspace, folders.store.get(workspace).map((entry) => entry.path));
  };
  const sandboxPolicy = () => ctx.get("sandboxPolicy");
  const workingDirectory = () => ctx.get("workingDirectory");
  ctx.inject(["systemPrompt"], (scope) => {
    const order = scope.systemPrompt.getContextOrder("SANDBOX_POLICY") + 1;
    scope.systemPrompt.context({
      name: "workspace-folders",
      order,
      required: true,
      interpolate: false,
      text: (assembly) => {
        const session = assembly.agent?.session;
        const workspace = session?.header.cwd;
        if (session === void 0 || workspace === void 0) return "";
        return renderFoldersContext(
          workspace,
          folders.effective(workspace),
          sandboxPolicy()?.resolve({ session }).mode,
          config.autoApproveWrites
        );
      }
    });
    if (!config.loadInstructions) return;
    scope.systemPrompt.context({
      name: "workspace-folders:instructions",
      order: order + 1,
      required: true,
      interpolate: false,
      text: (assembly) => {
        const workspace = assembly.agent?.session.header.cwd;
        if (workspace === void 0) return "";
        const instructions = readFolderInstructions(folders.effective(workspace), config.maxInstructionBytes);
        return renderInstructionsContext(instructions, config.maxInstructionBytes);
      }
    });
  });
  const approver = new WriteApprover({ folders, logger: ctx.logger, sandboxPolicy, workingDirectory });
  ctx.on("tools/execute", (exec, next) => approver.aroundExecute(exec, next));
  ctx.on("approval/request", (request, next) => approver.answer(request, next), { prepend: true });
  ctx.inject(["commands"], (scope) => {
    for (const command of folderCommands({ folders, logger: ctx.logger, workingDirectory, changed })) {
      try {
        scope.commands.register(command);
      } catch (error) {
        ctx.logger.warn("cannot register /%s (another plugin may own it): %s", command.name, error);
      }
    }
  });
  ctx.inject(["connection"], (scope) => {
    const routes = folderRoutes({
      folders,
      changed,
      sandboxPolicy,
      sessions: () => ctx.get("sessions"),
      workspaceRegistry: () => ctx.get("workspaceRegistry"),
      directoryPicker: () => ctx.get("directoryPicker")
    });
    for (const route of routes) scope.connection.fetch.register(route);
  });
}
export {
  apply,
  name
};
