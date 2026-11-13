window.__ModuleLoader__.load({
	id: 'dsh-everything-es',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");

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
			maxResultsHint: "Maximum number of paths the search_files tool returns in one call.",
			timeoutMs: "Search timeout (ms)",
			timeoutMsHint: "How long one es query may run before it is treated as failed.",
			overridden: "Overridden",
			reset: "Reset to default",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			invalidNumber: "Enter a number, or leave blank to use the default.",
			applyHint: "Saved values apply to the running Agent on its next search; no restart is needed."
		};
		/** Simplified Chinese copy. */
		const zh = {
			title: "Everything 搜索",
			description: "通过 Everything 的 es 命令行按文件名/路径查找；设置 es.exe 位置与单次返回上限。",
			esPath: "es.exe 路径",
			esPathHint: "例如 D:/Program Files/Everything/es.exe。留空则依次尝试常见安装目录和 PATH。",
			maxResults: "单次返回数量",
			maxResultsHint: "search_files 工具单次最多返回多少个路径。",
			timeoutMs: "搜索超时（毫秒）",
			timeoutMsHint: "单次 es 查询最多运行多久，超时视为失败。",
			overridden: "已覆盖",
			reset: "恢复默认",
			readOnly: "本部署的设置为只读。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
			invalidNumber: "请填数字；留空表示使用默认值。",
			applyHint: "保存后 Agent 下一次搜索即生效，无需重启。"
		};

		/** The form frame's copy. */
		function formLabels(t) {
			return {
				unavailable: t("unavailable"),
				readOnly: t("readOnly"),
				saveFailed: t("saveFailed"),
				save: t("save"),
				saving: t("saving")
			};
		}
		//#endregion

		//#region card
		const h = React.createElement;
		const FIELD_IDS = {
			esPath: "plugin-config-everything-es-path",
			maxResults: "plugin-config-everything-max-results",
			timeoutMs: "plugin-config-everything-timeout"
		};

		/** Render the card summary or the settings form. */
		function EverythingCard(props) {
			const { t } = props;
			const state = props.useEverythingCard((snapshot) => snapshot);
			if (props.view === "summary") return t("description");
			const disabled = !state.writable;
			return h(
				primitives.SettingsForm,
				{
					labels: formLabels(t),
					state,
					onSave: props.save,
					onDiscard: props.discard
				},
				h("p", { style: { margin: 0, opacity: 0.75 } }, t("applyHint")),
				h(primitives.SettingsValueField, {
					id: FIELD_IDS.esPath,
					label: t("esPath"),
					hint: t("esPathHint"),
					overriddenLabel: t("overridden"),
					resetLabel: t("reset"),
					disabled,
					...state.esPath,
					onEdit: (text) => props.edit("esPath", text),
					onReset: () => props.resetField("esPath")
				}),
				h(primitives.SettingsValueField, {
					id: FIELD_IDS.maxResults,
					label: t("maxResults"),
					hint: t("maxResultsHint"),
					overriddenLabel: t("overridden"),
					resetLabel: t("reset"),
					invalidLabel: t("invalidNumber"),
					numeric: true,
					disabled,
					...state.maxResults,
					onEdit: (text) => props.edit("maxResults", text),
					onReset: () => props.resetField("maxResults")
				}),
				h(primitives.SettingsValueField, {
					id: FIELD_IDS.timeoutMs,
					label: t("timeoutMs"),
					hint: t("timeoutMsHint"),
					overriddenLabel: t("overridden"),
					resetLabel: t("reset"),
					invalidLabel: t("invalidNumber"),
					numeric: true,
					disabled,
					...state.timeoutMs,
					onEdit: (text) => props.edit("timeoutMs", text),
					onReset: () => props.resetField("timeoutMs")
				})
			);
		}
		//#endregion

		//#region controller
		/** Staged form over the plugin's volatile config namespace. */
		var EverythingCardController = class {
			form;
			store;
			constructor(scope) {
				this.form = new primitives.SettingsFormModel(scope, [
					primitives.settingsTextField("esPath"),
					primitives.settingsNumberField("maxResults"),
					primitives.settingsNumberField("timeoutMs")
				]);
				this.store = this.form.bind(() => this.projection());
			}
			projection() {
				return {
					...this.form.shell(),
					esPath: this.form.field("esPath"),
					maxResults: this.form.field("maxResults"),
					timeoutMs: this.form.field("timeoutMs")
				};
			}
			inject() {
				return {
					hooks: { everythingCard: this.store },
					...this.form.actions()
				};
			}
			dispose() {
				this.form.dispose();
			}
		};
		//#endregion

		//#region plugin
		const inject = ["slots", "locale", "configForms"];
		/** Loader entry id of the Host row; also the settings namespace. */
		const ENTRY = "everything-search";
		/** Plugins-page card id. */
		const CARD_ID = "everything-search";

		/** Mount the settings card under Plugins → Built-in plugin settings. */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "everything-search: dictionaries");
			const controller = new EverythingCardController(ctx.configForms.get(ENTRY));
			ctx.effect(() => () => controller.dispose(), "everything-search: form subscription");
			ctx.effect(
				() =>
					ctx.slots.inject("plugins.item", () =>
						ctx.slots.register(
							{
								name: "plugins.item",
								id: CARD_ID,
								order: 60,
								label: () => t("title"),
								locale: NS,
								inject: () => controller.inject()
							},
							EverythingCard
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
