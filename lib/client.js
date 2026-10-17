window.__ModuleLoader__.load({ id: "dsh-workspace-folders", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var React = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/locales.ts
var NS = "workspaceFolders";
var en = {
  button: "Working directories",
  count: "+{count}",
  title: "Working directories",
  close: "Close",
  description: "Additional directories are shared by every session in this workspace and apply from the next turn.",
  primary: "Workspace",
  global: "All workspaces",
  missing: "Missing",
  readWrite: "Read & write",
  readOnly: "Read only",
  remove: "Remove {path}",
  empty: "No additional directories yet.",
  placeholder: "Absolute path, or ~/path",
  add: "Add",
  choose: "Choose folder\u2026",
  useFolder: "Use this folder",
  showHidden: "Show hidden folders",
  noSubfolders: "No subfolders here.",
  truncated: "Too many folders; only the first ones are shown.",
  browseFailed: "Cannot read this folder: {message}",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving\u2026",
  loading: "Loading\u2026",
  error: "Error: {message}",
  invalid: "Some directories could not be saved:",
  problemMissing: "{path} is not an existing directory",
  problemInside: "{path} is already inside the workspace",
  autoApprove: "File edits in read & write directories are approved automatically; shell commands that write there still ask.",
  readOnlyMode: "This session is read only, so additional directories are read only as well.",
  noAutoApprove: "Edits outside the workspace ask for approval each time."
};
var zh = {
  button: "\u5DE5\u4F5C\u76EE\u5F55",
  count: "+{count}",
  title: "\u5DE5\u4F5C\u76EE\u5F55",
  close: "\u5173\u95ED",
  description: "\u989D\u5916\u76EE\u5F55\u5BF9\u672C\u5DE5\u4F5C\u533A\u7684\u6240\u6709\u4F1A\u8BDD\u751F\u6548\uFF0C\u4ECE\u4E0B\u4E00\u8F6E\u5BF9\u8BDD\u8D77\u751F\u6548\u3002",
  primary: "\u5DE5\u4F5C\u533A",
  global: "\u6240\u6709\u5DE5\u4F5C\u533A",
  missing: "\u4E0D\u5B58\u5728",
  readWrite: "\u8BFB\u5199",
  readOnly: "\u53EA\u8BFB",
  remove: "\u79FB\u9664 {path}",
  empty: "\u8FD8\u6CA1\u6709\u989D\u5916\u76EE\u5F55\u3002",
  placeholder: "\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u6216 ~/\u8DEF\u5F84",
  add: "\u6DFB\u52A0",
  choose: "\u9009\u62E9\u6587\u4EF6\u5939\u2026",
  useFolder: "\u4F7F\u7528\u6B64\u6587\u4EF6\u5939",
  showHidden: "\u663E\u793A\u9690\u85CF\u6587\u4EF6\u5939",
  noSubfolders: "\u8FD9\u91CC\u6CA1\u6709\u5B50\u6587\u4EF6\u5939\u3002",
  truncated: "\u6587\u4EF6\u5939\u8FC7\u591A\uFF0C\u4EC5\u663E\u793A\u524D\u9762\u7684\u90E8\u5206\u3002",
  browseFailed: "\u65E0\u6CD5\u8BFB\u53D6\u8BE5\u6587\u4EF6\u5939\uFF1A{message}",
  cancel: "\u53D6\u6D88",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  loading: "\u6B63\u5728\u8BFB\u53D6\u2026",
  error: "\u51FA\u9519\u4E86\uFF1A{message}",
  invalid: "\u4EE5\u4E0B\u76EE\u5F55\u65E0\u6CD5\u4FDD\u5B58\uFF1A",
  problemMissing: "{path} \u4E0D\u662F\u5DF2\u5B58\u5728\u7684\u76EE\u5F55",
  problemInside: "{path} \u5DF2\u5728\u5DE5\u4F5C\u533A\u5185",
  autoApprove: "\u8BFB\u5199\u76EE\u5F55\u4E2D\u7684\u6587\u4EF6\u7F16\u8F91\u4F1A\u81EA\u52A8\u6279\u51C6\uFF1B\u7EC8\u7AEF\u547D\u4EE4\u5199\u5165\u4ECD\u4F1A\u8BF7\u6C42\u786E\u8BA4\u3002",
  readOnlyMode: "\u5F53\u524D\u4F1A\u8BDD\u4E3A\u53EA\u8BFB\u6A21\u5F0F\uFF0C\u989D\u5916\u76EE\u5F55\u540C\u6837\u53EA\u8BFB\u3002",
  noAutoApprove: "\u5DE5\u4F5C\u533A\u4E4B\u5916\u7684\u7F16\u8F91\u6BCF\u6B21\u90FD\u4F1A\u8BF7\u6C42\u786E\u8BA4\u3002"
};

// src/client/index.tsx
var DESKTOP_DIRECTORY_PICKER_GLOBAL = "__DSH_DIRECTORY_PICKER__";
function desktopDirectoryPicker() {
  const bridge = globalThis[DESKTOP_DIRECTORY_PICKER_GLOBAL];
  if (typeof bridge !== "object" || bridge === null) return void 0;
  const pick = bridge.pick;
  if (typeof pick !== "function") return void 0;
  return () => pick.call(bridge);
}
var ApiError = class extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
};
async function api(path, init) {
  const response = await fetch(new URL(`api/workspace-folders/${path}`, document.baseURI), {
    cache: "no-store",
    credentials: "same-origin",
    ...init
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`HTTP ${response.status}`, []);
  }
  if (!response.ok || payload?.ok !== true) {
    throw new ApiError(payload?.error ?? `HTTP ${response.status}`, payload?.details ?? []);
  }
  return payload.data;
}
var postJson = (body) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});
var STYLE = `
.wsf-body{display:flex;flex-direction:column;gap:12px;max-height:min(60vh,560px);overflow:auto}
.wsf-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.wsf-error{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}
.wsf-error ul{margin:4px 0 0;padding-left:18px}
.wsf-list{display:flex;flex-direction:column;gap:2px}
.wsf-row{display:flex;align-items:center;gap:8px;min-height:32px;padding:4px 8px;border-radius:var(--dsw-radius-md)}
.wsf-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.wsf-path{flex:1;min-width:0;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.wsf-tag{flex:none;font-size:11px;line-height:18px;padding:0 6px;border-radius:999px;color:var(--dsw-alias-label-secondary);border:0.5px solid var(--dsw-alias-border-l2)}
.wsf-tag.wsf-warn{color:var(--dsw-alias-state-warn-primary)}
.wsf-access{flex:none;display:inline-flex;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);overflow:hidden}
.wsf-access button{border:none;background:transparent;padding:2px 8px;font-size:12px;line-height:18px;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.wsf-access button[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:600}
.wsf-remove{flex:none;border:none;background:transparent;cursor:pointer;width:24px;height:24px;border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:24px}
.wsf-remove:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.wsf-add{display:flex;gap:8px;align-items:center}
.wsf-add > span{flex:1;min-width:0}
.wsf-add > button{flex:none;white-space:nowrap}
.wsf-dialog{width:min(600px,calc(100vw - 48px))!important;max-width:none!important}
.wsf-empty{font-size:13px;color:var(--dsw-alias-label-tertiary);padding:4px 8px}
.wsf-footer{display:flex;justify-content:flex-end;gap:8px}
.wsf-browser{display:flex;flex-direction:column;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);overflow:hidden}
.wsf-crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:6px 8px;border-bottom:0.5px solid var(--dsw-alias-border-l2);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px;color:var(--dsw-alias-label-tertiary)}
.wsf-crumbs button{border:none;background:transparent;padding:1px 4px;border-radius:var(--dsw-radius-sm,4px);cursor:pointer;font:inherit;color:var(--dsw-alias-label-secondary)}
.wsf-crumbs button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.wsf-crumbs button[aria-current="location"]{color:var(--dsw-alias-label-primary);font-weight:600}
.wsf-entries{display:flex;flex-direction:column;max-height:220px;min-height:64px;overflow:auto;padding:4px}
.wsf-entry{display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;text-align:left;padding:4px 8px;border-radius:var(--dsw-radius-md);cursor:pointer;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.wsf-entry:hover{background:var(--dsw-alias-interactive-bg-hover)}
.wsf-entry.wsf-dim{color:var(--dsw-alias-label-tertiary)}
.wsf-entry svg{flex:none;color:var(--dsw-alias-label-tertiary)}
.wsf-browser-footer{display:flex;align-items:center;gap:8px;padding:6px 8px;border-top:0.5px solid var(--dsw-alias-border-l2)}
.wsf-browser-footer > button{flex:none;white-space:nowrap}
.wsf-hidden-toggle{display:flex;align-items:center;gap:6px;margin-right:auto;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
`;
function PathText({ path }) {
  return /* @__PURE__ */ React.createElement("span", { className: "wsf-path", title: path }, /* @__PURE__ */ React.createElement("bdi", { dir: "ltr" }, path));
}
function FolderIcon() {
  return /* @__PURE__ */ React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" }), /* @__PURE__ */ React.createElement("path", { d: "M8 7v4M6 9h4" }));
}
function PlainFolderIcon() {
  return /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" }));
}
function FolderBrowser({ sessionId, onPick, onCancel, t }) {
  const [listing, setListing] = React.useState();
  const [target, setTarget] = React.useState();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState();
  const [showHidden, setShowHidden] = React.useState(false);
  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(void 0);
    const query = target === void 0 ? `sessionId=${encodeURIComponent(sessionId)}` : `path=${encodeURIComponent(target)}`;
    api(`browse?${query}`, { signal: controller.signal }).then(
      (next) => {
        setListing(next);
        setLoading(false);
      },
      (cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      }
    );
    return () => controller.abort();
  }, [sessionId, target]);
  const entries = listing?.entries.filter((entry) => showHidden || !entry.hidden) ?? [];
  return /* @__PURE__ */ React.createElement("div", { className: "wsf-browser" }, /* @__PURE__ */ React.createElement("div", { className: "wsf-crumbs" }, listing?.crumbs.map((crumb, index) => /* @__PURE__ */ React.createElement(React.Fragment, { key: crumb.path }, index > 1 && /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true" }, "/"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      "aria-current": crumb.path === listing.path ? "location" : void 0,
      onClick: () => setTarget(crumb.path)
    },
    crumb.name
  )))), /* @__PURE__ */ React.createElement("div", { className: "wsf-entries", role: "list" }, loading && /* @__PURE__ */ React.createElement("div", { className: "wsf-empty" }, t("loading")), !loading && error !== void 0 && /* @__PURE__ */ React.createElement("div", { className: "wsf-error", role: "alert" }, t("browseFailed", { message: error })), !loading && error === void 0 && entries.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "wsf-empty" }, t("noSubfolders")), !loading && error === void 0 && entries.map((entry) => /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      role: "listitem",
      key: entry.path,
      className: entry.hidden ? "wsf-entry wsf-dim" : "wsf-entry",
      title: entry.path,
      onClick: () => setTarget(entry.path)
    },
    /* @__PURE__ */ React.createElement(PlainFolderIcon, null),
    entry.name
  )), !loading && listing?.truncated === true && /* @__PURE__ */ React.createElement("div", { className: "wsf-note" }, t("truncated"))), /* @__PURE__ */ React.createElement("div", { className: "wsf-browser-footer" }, /* @__PURE__ */ React.createElement("label", { className: "wsf-hidden-toggle" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: showHidden, onChange: (event) => setShowHidden(event.currentTarget.checked) }), t("showHidden")), /* @__PURE__ */ React.createElement(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", onClick: onCancel }, t("cancel")), /* @__PURE__ */ React.createElement(
    import_dsh_client_ui_primitives.Button,
    {
      variant: "primary",
      size: "sm",
      disabled: listing === void 0 || loading || error !== void 0,
      onClick: () => {
        if (listing !== void 0) onPick(listing.path);
      }
    },
    t("useFolder")
  )));
}
function loadState(sessionId, signal) {
  return api(`state?sessionId=${encodeURIComponent(sessionId)}`, signal === void 0 ? void 0 : { signal });
}
function AccessToggle({ value, onChange, t }) {
  return /* @__PURE__ */ React.createElement("span", { className: "wsf-access", role: "group" }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": value === "read-write", onClick: () => onChange("read-write") }, t("readWrite")), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-pressed": value === "read-only", onClick: () => onChange("read-only") }, t("readOnly")));
}
function FoldersDialog({ sessionId, state, onClose, onSaved, t }) {
  const own = state.directories.filter((folder) => folder.source === "workspace");
  const inherited = state.directories.filter((folder) => folder.source === "global");
  const [draft, setDraft] = React.useState(own);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState();
  const [browsing, setBrowsing] = React.useState(false);
  const desktopPick = React.useMemo(desktopDirectoryPicker, []);
  const chooser = desktopPick !== void 0 ? "desktop" : state.picker;
  const append = (path) => {
    const trimmed = path.trim();
    if (trimmed === "") return;
    setDraft((rows) => [...rows.filter((row) => row.path !== trimmed), { path: trimmed, access: "read-write", source: "workspace", exists: true }]);
    setInput("");
  };
  const run = async (operation) => {
    setBusy(true);
    setFailure(void 0);
    try {
      await operation();
    } catch (cause) {
      setFailure({
        message: cause instanceof Error ? cause.message : String(cause),
        details: cause instanceof ApiError ? cause.details : []
      });
    } finally {
      setBusy(false);
    }
  };
  const choose = () => {
    if (chooser === "browse") {
      setBrowsing((open) => !open);
      return Promise.resolve();
    }
    return run(async () => {
      const path = desktopPick !== void 0 ? await desktopPick() : (await api("pick", postJson({}))).path;
      if (path !== null) append(path);
    });
  };
  const save = () => run(async () => {
    const pending = input.trim() === "" ? draft : [...draft, { path: input.trim(), access: "read-write" }];
    const next = await api("save", postJson({
      sessionId,
      directories: pending.map(({ path, access }) => ({ path, access }))
    }));
    onSaved(next);
  });
  const note = state.sandboxMode === "read-only" ? t("readOnlyMode") : state.sandboxMode === "workspace-write" ? state.autoApproveWrites ? t("autoApprove") : t("noAutoApprove") : void 0;
  return /* @__PURE__ */ React.createElement(
    import_dsh_client_ui_primitives.Modal,
    {
      open: true,
      onClose,
      title: t("title"),
      closeLabel: t("close"),
      description: t("description"),
      className: "wsf-dialog",
      footer: /* @__PURE__ */ React.createElement("div", { className: "wsf-footer" }, /* @__PURE__ */ React.createElement(import_dsh_client_ui_primitives.Button, { variant: "outline", onClick: onClose, disabled: busy }, t("cancel")), /* @__PURE__ */ React.createElement(import_dsh_client_ui_primitives.Button, { variant: "primary", onClick: () => void save(), disabled: busy }, busy ? t("saving") : t("save")))
    },
    /* @__PURE__ */ React.createElement("div", { className: "wsf-body" }, /* @__PURE__ */ React.createElement("div", { className: "wsf-list" }, /* @__PURE__ */ React.createElement("div", { className: "wsf-row" }, /* @__PURE__ */ React.createElement(PathText, { path: state.workspace }), /* @__PURE__ */ React.createElement("span", { className: "wsf-tag" }, t("primary"))), inherited.map((folder) => /* @__PURE__ */ React.createElement("div", { className: "wsf-row", key: `global:${folder.path}` }, /* @__PURE__ */ React.createElement(PathText, { path: folder.path }), !folder.exists && /* @__PURE__ */ React.createElement("span", { className: "wsf-tag wsf-warn" }, t("missing")), /* @__PURE__ */ React.createElement("span", { className: "wsf-tag" }, folder.access === "read-write" ? t("readWrite") : t("readOnly")), /* @__PURE__ */ React.createElement("span", { className: "wsf-tag" }, t("global")))), draft.map((folder) => /* @__PURE__ */ React.createElement("div", { className: "wsf-row", key: folder.path }, /* @__PURE__ */ React.createElement(PathText, { path: folder.path }), !folder.exists && /* @__PURE__ */ React.createElement("span", { className: "wsf-tag wsf-warn" }, t("missing")), /* @__PURE__ */ React.createElement(
      AccessToggle,
      {
        value: folder.access,
        t,
        onChange: (access) => setDraft((rows) => rows.map((row) => row.path === folder.path ? { ...row, access } : row))
      }
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "wsf-remove",
        "aria-label": t("remove", { path: folder.path }),
        title: t("remove", { path: folder.path }),
        onClick: () => setDraft((rows) => rows.filter((row) => row.path !== folder.path))
      },
      "\xD7"
    ))), draft.length === 0 && inherited.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "wsf-empty" }, t("empty"))), /* @__PURE__ */ React.createElement("div", { className: "wsf-add" }, /* @__PURE__ */ React.createElement(
      import_dsh_client_ui_primitives.Input,
      {
        value: input,
        placeholder: t("placeholder"),
        spellCheck: false,
        "data-modal-autofocus": "",
        onChange: (event) => setInput(event.currentTarget.value),
        onKeyDown: (event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            append(input);
          }
        }
      }
    ), /* @__PURE__ */ React.createElement(import_dsh_client_ui_primitives.Button, { variant: "outline", onClick: () => append(input), disabled: busy || input.trim() === "" }, t("add")), chooser !== null && /* @__PURE__ */ React.createElement(import_dsh_client_ui_primitives.Button, { variant: "outline", onClick: () => void choose(), disabled: busy, "aria-expanded": chooser === "browse" ? browsing : void 0 }, t("choose"))), browsing && /* @__PURE__ */ React.createElement(
      FolderBrowser,
      {
        sessionId,
        t,
        onCancel: () => setBrowsing(false),
        onPick: (path) => {
          append(path);
          setBrowsing(false);
        }
      }
    ), note !== void 0 && /* @__PURE__ */ React.createElement("div", { className: "wsf-note" }, note), failure !== void 0 && /* @__PURE__ */ React.createElement("div", { className: "wsf-error", role: "alert" }, failure.details.length > 0 ? t("invalid") : t("error", { message: failure.message }), failure.details.length > 0 && /* @__PURE__ */ React.createElement("ul", null, failure.details.map((detail) => /* @__PURE__ */ React.createElement("li", { key: `${detail.code}:${detail.path}` }, t(detail.code === "missing" ? "problemMissing" : "problemInside", { path: detail.path }))))))
  );
}
function FoldersControl({ sessionId, t }) {
  const [state, setState] = React.useState();
  const [unavailable, setUnavailable] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const controller = new AbortController();
    setState(void 0);
    setUnavailable(false);
    setOpen(false);
    loadState(sessionId, controller.signal).then(setState, () => {
      if (!controller.signal.aborted) setUnavailable(true);
    });
    return () => controller.abort();
  }, [sessionId]);
  if (unavailable) return null;
  const count = state?.directories.length ?? 0;
  const openDialog = () => {
    loadState(sessionId).then((next) => {
      setState(next);
      setOpen(true);
    }, () => setOpen(true));
  };
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    import_dsh_client_ui_primitives.Button,
    {
      variant: "ghost",
      size: "sm",
      icon: /* @__PURE__ */ React.createElement(FolderIcon, null),
      "aria-label": t("button"),
      title: t("button"),
      disabled: state === void 0,
      onClick: openDialog
    },
    count > 0 ? t("count", { count }) : null
  ), open && state !== void 0 && /* @__PURE__ */ React.createElement(
    FoldersDialog,
    {
      sessionId,
      state,
      t,
      onClose: () => setOpen(false),
      onSaved: (next) => {
        setState(next);
        setOpen(false);
      }
    }
  ));
}
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "workspace-folders: copy");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.owner = "dsh-workspace-folders";
    style.textContent = STYLE;
    document.head.appendChild(style);
    return () => style.remove();
  }, "workspace-folders: styles");
  ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
    name: "conversation.input.left",
    id: "dsh-workspace-folders.control",
    order: 900,
    locale: NS,
    inject: (sessionId) => ({ sessionId })
  }, FoldersControl));
}
return module.exports; } });
