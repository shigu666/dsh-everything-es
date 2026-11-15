window.__ModuleLoader__.load({
id: 'dsh-everything-es',
factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const React = require("react");

//#region locales
/** Dictionary namespace owned by this page. */
const NS = "settings.everythingSearch";
/** English copy. */
const en = {
title: "Everything search",
description: "File-name lookup through Everything's es CLI: set where es.exe lives and how many paths one search may return.",
esPath: "es.exe path",
esPathHint: "For example C:/Program Files/Everything/es.exe. Leave empty to try the usual install folders and PATH, then the bundled es.exe.",
maxResults: "Results per search",
maxResultsHint: "Maximum number of paths the search_files tool returns in one call (1–1000).",
timeoutMs: "Search timeout (ms)",
timeoutMsHint: "How long one es query may run before it is treated as failed (1–120000 ms).",
overridden: "Overridden",
reset: "Reset to default",
readOnly: "This deployment stores settings read-only.",
unavailable: "This plugin is not loaded, so it cannot be configured right now.",
loading: "Loading settings…",
save: "Save",
saving: "Saving…",
discard: "Discard",
saveFailed: "The deployment did not accept these values; they were left for you to correct.",
invalidNumber: "Enter a whole number in the allowed range, or leave blank to use the default.",
applyHint: "Saved values apply to the running Agent on its next search; no restart is needed."
};
/** Simplified Chinese copy. */
const zh = {
title: "Everything 搜索",
description: "通过 Everything 的 es 命令行按文件名/路径查找；设置 es.exe 位置与单次返回上限。",
esPath: "es.exe 路径",
esPathHint: "例如 C:/Program Files/Everything/es.exe。留空则依次尝试常见安装目录、PATH，最后使用插件内置的 es.exe。",
maxResults: "单次返回数量",
maxResultsHint: "search_files 工具单次最多返回多少个路径（1–1000）。",
timeoutMs: "搜索超时（毫秒）",
timeoutMsHint: "单次 es 查询最多运行多久，超时视为失败（1–120000 毫秒）。",
overridden: "已覆盖",
reset: "恢复默认",
readOnly: "本部署的设置为只读。",
unavailable: "该插件当前未加载，暂时无法配置。",
loading: "正在加载设置…",
save: "保存",
saving: "保存中…",
discard: "放弃更改",
saveFailed: "本部署没有接受这些值，已保留供你修改。",
invalidNumber: "请填写范围内的整数；留空表示使用默认值。",
applyHint: "保存后 Agent 下一次搜索即生效，无需重启。"
};
//#endregion

//#region form
const h = React.createElement;
const FIELDS = [
{ name: "esPath", label: "esPath", hint: "esPathHint", kind: "text" },
{ name: "maxResults", label: "maxResults", hint: "maxResultsHint", kind: "number", min: 1, max: 1000 },
{ name: "timeoutMs", label: "timeoutMs", hint: "timeoutMsHint", kind: "number", min: 1, max: 120000 }
];
const FIELD_IDS = {
esPath: "plugin-config-everything-es-path",
maxResults: "plugin-config-everything-max-results",
timeoutMs: "plugin-config-everything-timeout"
};

/** Read one field as text for the controlled form. */
function fieldText(value, name) {
const field = value !== null && typeof value === "object" ? value[name] : undefined;
return field === undefined || field === null ? "" : String(field);
}

/** The set of fields the user layer explicitly overrides. */
function overriddenSet(user) {
return new Set(user !== null && typeof user === "object" ? Object.keys(user) : []);
}

/** Draft values from the latest accepted Host section. */
function draftFrom(value) {
return {
esPath: fieldText(value, "esPath"),
maxResults: fieldText(value, "maxResults"),
timeoutMs: fieldText(value, "timeoutMs")
};
}

/** Parse and validate one draft field. */
function parseField(field, text) {
const trimmed = text.trim();
if (trimmed === "") return { kind: "unset" };
if (field.kind === "text") return { kind: "set", value: trimmed };
const value = Number(trimmed);
if (!Number.isInteger(value) || value < field.min || value > field.max) return { kind: "invalid" };
return { kind: "set", value };
}

/**
 * Build one atomic settings mutation from the staged draft.
 *
 * Only fields the user touched are included. Resetting an overridden field
 * emits an unset; leaving a non-overridden field blank emits nothing.
 *
 * @param {object} snapshot accepted form snapshot
 * @param {Record<string, string>} draft current field text
 * @param {Record<string, { reset: boolean }>} touched fields edited in this draft
 * @param {Set<string>} overrides fields currently present in the user layer
 * @returns {{ invalid: boolean, ops: object[], effective: Record<string, string>, overrides: Set<string> }}
 */
function buildMutation(snapshot, draft, touched, overrides) {
const ops = [];
const effective = draftFrom(snapshot.value);
const remaining = new Set(overrides);
for (const field of FIELDS) {
const change = touched[field.name];
if (change === undefined) continue;
const parsed = parseField(field, draft[field.name]);
if (parsed.kind === "invalid") return { invalid: true, ops: [], effective, overrides: remaining };
const isOverridden = remaining.has(field.name);
const cleared = change.reset || parsed.kind === "unset";
if (cleared) {
if (isOverridden) {
ops.push({ op: "unset", path: [field.name] });
remaining.delete(field.name);
}
effective[field.name] = fieldText(snapshot.base, field.name);
continue;
}
effective[field.name] = String(parsed.value);
if (fieldText(snapshot.value, field.name) !== String(parsed.value) || isOverridden) {
ops.push({ op: "set", path: [field.name], value: parsed.value });
remaining.add(field.name);
}
}
return { invalid: false, ops, effective, overrides: remaining };
}

const inputStyle = {
width: "100%",
boxSizing: "border-box",
font: "inherit",
color: "inherit",
background: "transparent",
border: "1px solid var(--dsw-alias-border, currentColor)",
borderRadius: 6,
padding: "6px 8px"
};
const buttonStyle = {
font: "inherit",
color: "inherit",
background: "var(--dsw-alias-fill-secondary, transparent)",
border: "1px solid var(--dsw-alias-border, currentColor)",
borderRadius: 6,
padding: "5px 12px",
cursor: "pointer"
};

/** Render one labelled input row. */
function FieldRow({ t, form, snapshot, field, draft, touched, overrides, disabled, onEdit, onReset }) {
const value = draft[field.name];
const reset = overrides.has(field.name) && touched[field.name]?.reset !== true;
return h(
"div",
{ style: { display: "grid", gap: 4 } },
h(
"div",
{ style: { display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" } },
h("label", { htmlFor: FIELD_IDS[field.name], style: { fontWeight: 600 } }, t(field.label)),
reset && h(
"button",
{
type: "button",
style: { ...buttonStyle, padding: "1px 7px", fontSize: 12 },
disabled,
onClick: () => onReset(field.name)
},
t("reset")
)
),
h("input", {
id: FIELD_IDS[field.name],
type: "text",
inputMode: field.kind === "number" ? "numeric" : undefined,
value,
disabled,
style: inputStyle,
onChange: (event) => onEdit(field.name, event.currentTarget.value)
}),
h("div", { style: { fontSize: 12, opacity: 0.72 } }, t(field.hint)),
reset && h("div", { style: { fontSize: 12, opacity: 0.72 } }, t("overridden"))
);
}

/** Render the settings page or its one-line summary. */
function EverythingCard(props) {
const { t, form } = props;
const snapshot = form?.state;
const [draft, setDraft] = React.useState(() => draftFrom(snapshot?.value));
const [touched, setTouched] = React.useState({});
const [overrides, setOverrides] = React.useState(() => overriddenSet(snapshot?.user));
const [dirty, setDirty] = React.useState(false);
const [saving, setSaving] = React.useState(false);
const [failed, setFailed] = React.useState(false);
const [error, setError] = React.useState("");

React.useEffect(() => {
if (!dirty && snapshot?.status === "ready") {
setDraft(draftFrom(snapshot.value));
setOverrides(overriddenSet(snapshot.user));
}
}, [snapshot?.revision, snapshot?.status, dirty]);

if (props.view === "summary") return t("description");
if (snapshot === undefined) return h("p", { style: { margin: 0, opacity: 0.72 } }, t("unavailable"));
if (snapshot.status === "loading") return h("p", { style: { margin: 0, opacity: 0.72 } }, t("loading"));
if (snapshot.status === "unavailable") return h("p", { style: { margin: 0, opacity: 0.72 } }, t("unavailable"));

const disabled = !snapshot.writable || saving;

const edit = (name, text) => {
setDraft((previous) => ({ ...previous, [name]: text }));
setTouched((previous) => ({ ...previous, [name]: { reset: false } }));
setDirty(true);
setFailed(false);
setError("");
};

const save = async () => {
if (disabled || !dirty) return;
const mutation = buildMutation(snapshot, draft, touched, overrides);
if (mutation.invalid) {
setFailed(true);
setError(t("invalidNumber"));
return;
}
setSaving(true);
setFailed(false);
setError("");
try {
if (mutation.ops.length > 0) {
const accepted = await form.mutate(mutation.ops, snapshot.revision);
if (!accepted) {
setFailed(true);
setError(t("saveFailed"));
return;
}
}
setDraft(mutation.effective);
setOverrides(mutation.overrides);
setTouched({});
setDirty(false);
} catch (cause) {
setFailed(true);
setError(cause instanceof Error ? cause.message : t("saveFailed"));
} finally {
setSaving(false);
}
};

const discard = () => {
setDraft(draftFrom(snapshot.value));
setTouched({});
setOverrides(overriddenSet(snapshot.user));
setDirty(false);
setFailed(false);
setError("");
};

const resetField = (name) => {
setDraft((previous) => ({ ...previous, [name]: "" }));
setTouched((previous) => ({ ...previous, [name]: { reset: true } }));
setDirty(true);
setFailed(false);
setError("");
};

return h(
"div",
{ style: { display: "grid", gap: 12 } },
h("p", { style: { margin: 0, opacity: 0.75 } }, t("applyHint")),
...FIELDS.map((field) => h(FieldRow, {
key: field.name,
t,
form,
snapshot,
field,
draft,
touched,
overrides,
disabled,
onEdit: edit,
onReset: resetField
})),
h(
"div",
{ style: { display: "flex", gap: 8, alignItems: "center" } },
h("button", { type: "button", style: buttonStyle, disabled: disabled || !dirty, onClick: save }, saving ? t("saving") : t("save")),
h("button", { type: "button", style: buttonStyle, disabled: disabled || !dirty, onClick: discard }, t("discard"))
),
!snapshot.writable && h("p", { style: { margin: 0, opacity: 0.72 } }, t("readOnly")),
failed && h("p", { role: "alert", style: { margin: 0, color: "var(--dsw-alias-danger, inherit)" } }, error || t("saveFailed"))
);
}
//#endregion

//#region plugin
const inject = ["slots", "locale", "configForms"];
/** Loader entry id of the Host row; also the settings namespace. */
const ENTRY = "everything-search";
/** Package name is half of the row configuration key. */
const PACKAGE_NAME = "dsh-everything-es";
/** The Plugins page keys a row's form by `<package>#<row id>`. */
const ROW_CONFIG_KEY = `${PACKAGE_NAME}#${ENTRY}`;

/** Mount the row configuration while the Host serves its namespace. */
function apply(ctx) {
const t = ctx.locale.bind(NS);
ctx.effect(() => ctx.locale.register(NS, { zh, en }), "everything-search: dictionaries");
ctx.effect(
() =>
ctx.configForms.whileServed([ENTRY], () =>
ctx.slots.inject("plugins.row.config", () =>
ctx.slots.register(
{
name: "plugins.row.config",
key: ROW_CONFIG_KEY,
locale: NS,
inject: () => ({})
},
EverythingCard
)
)
),
"everything-search: row configuration"
);
}
//#endregion

exports.NS = NS;
exports.apply = apply;
exports.inject = inject;
exports.__test = { buildMutation, draftFrom, parseField };
return module.exports;
}
});
