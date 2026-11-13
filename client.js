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
esPathHint: "For example D:/Program Files/Everything/es.exe. Leave empty to try the usual install folders and then PATH.",
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
esPathHint: "例如 D:/Program Files/Everything/es.exe。留空则依次尝试常见安装目录和 PATH。",
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

/** Whether the user layer explicitly overrides one field. */
function overridden(snapshot, name) {
const user = snapshot.user;
return user !== null && typeof user === "object" && Object.prototype.hasOwnProperty.call(user, name);
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
function FieldRow({ t, form, snapshot, field, draft, disabled, onEdit, onReset }) {
const value = draft[field.name];
const reset = overridden(snapshot, field.name);
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

/** Render the settings card or its one-line summary. */
function EverythingCard(props) {
const { t, form } = props;
const subscribe = React.useMemo(() => form.subscribe.bind(form), [form]);
const getSnapshot = React.useMemo(() => form.getSnapshot.bind(form), [form]);
const snapshot = React.useSyncExternalStore(subscribe, getSnapshot);
const [draft, setDraft] = React.useState(() => draftFrom(undefined));
const [dirty, setDirty] = React.useState(false);
const [saving, setSaving] = React.useState(false);
const [failed, setFailed] = React.useState(false);
const [error, setError] = React.useState("");

React.useEffect(() => {
if (!dirty && snapshot.status === "ready") setDraft(draftFrom(snapshot.value));
}, [snapshot.revision, snapshot.status, dirty]);

if (props.view === "summary") return t("description");
if (snapshot.status === "loading") return h("p", { style: { margin: 0, opacity: 0.72 } }, t("loading"));
if (snapshot.status === "unavailable") return h("p", { style: { margin: 0, opacity: 0.72 } }, t("unavailable"));

const disabled = !snapshot.writable || saving;

const edit = (name, text) => {
setDraft((previous) => ({ ...previous, [name]: text }));
setDirty(true);
setFailed(false);
setError("");
};

const save = async () => {
if (disabled || !dirty) return;
const parsed = FIELDS.map((field) => ({ field, result: parseField(field, draft[field.name]) }));
if (parsed.some(({ result }) => result.kind === "invalid")) {
setFailed(true);
setError(t("invalidNumber"));
return;
}
setSaving(true);
setFailed(false);
setError("");
try {
for (const { field, result } of parsed) {
const accepted = result.kind === "unset"
? await form.unset(field.name)
: await form.set(field.name, result.value);
if (!accepted) {
setFailed(true);
setError(t("saveFailed"));
return;
}
}
setDirty(false);
} catch (cause) {
setFailed(true);
setError(cause instanceof Error ? cause.message : t("saveFailed"));
} finally {
setSaving(false);
}
};

const discard = () => {
setDraft(draftFrom(form.getSnapshot().value));
setDirty(false);
setFailed(false);
setError("");
};

const resetField = async (name) => {
setSaving(true);
setFailed(false);
setError("");
try {
const accepted = await form.unset(name);
if (!accepted) {
setFailed(true);
setError(t("saveFailed"));
return;
}
const current = form.getSnapshot();
setDraft((previous) => ({ ...previous, [name]: fieldText(current.value, name) }));
} catch (cause) {
setFailed(true);
setError(cause instanceof Error ? cause.message : t("saveFailed"));
} finally {
setSaving(false);
}
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
/** Plugins-page card id. */
const CARD_ID = "everything-search";

/** Mount the settings card while the Host serves its namespace. */
function apply(ctx) {
const t = ctx.locale.bind(NS);
ctx.effect(() => ctx.locale.register(NS, { zh, en }), "everything-search: dictionaries");
const form = ctx.configForms.get(ENTRY);
ctx.effect(() => () => { void form.dispose(); }, "everything-search: form subscription");
ctx.effect(
() =>
ctx.configForms.whileServed([ENTRY], () =>
ctx.slots.inject("plugins.item", () =>
ctx.slots.register(
{
name: "plugins.item",
id: CARD_ID,
order: 60,
label: () => t("title"),
locale: NS,
inject: () => ({ form })
},
EverythingCard
)
)
),
"everything-search: card"
);
}
//#endregion

exports.NS = NS;
exports.apply = apply;
exports.inject = inject;
return module.exports;
}
});