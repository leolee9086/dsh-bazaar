window.__ModuleLoader__.load({
	id: "dsh-bazaar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const toKebabCase = (string) => string?.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toLucideIconData.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		function toLucideIconData(iconName, iconNode, aliases = []) {
			if (iconNode == null) throw new Error("[lucide]: iconNode is required when icon name is used");
			return {
				name: toKebabCase(iconName),
				size: 24,
				node: iconNode,
				...aliases.length > 0 ? { aliases } : {}
			};
		}
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const toCamelCase = (string) => {
			let out = "";
			let upperNext = false;
			for (const ch of string) {
				if (ch === "-" || ch === "_" || ch <= " ") {
					upperNext = out.length > 0;
					continue;
				}
				if (out.length === 0) out += ch.toLowerCase();
				else out += upperNext ? ch.toUpperCase() : ch;
				upperNext = false;
			}
			return out;
		};
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const toPascalCase = (string) => {
			const camelCase = toCamelCase(string);
			return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
		};
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const mergeClasses = (...classes) => classes.filter((className, index, array) => {
			return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
		}).join(" ").trim();
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/build/defaultAttributes.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const defaultAttributes = {
			xmlns: "http://www.w3.org/2000/svg",
			width: 24,
			height: 24,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": 2,
			"stroke-linecap": "round",
			"stroke-linejoin": "round"
		};
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/build/buildLucideIconNode.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		function isDefined(value) {
			return value !== null && value !== void 0;
		}
		function buildLucideIconNode(icon, params = {}) {
			const attributeNames = params.attributeNames ?? {};
			const getAttributeName = (attributeName) => attributeNames[attributeName] ?? attributeName;
			const viewBoxWidth = icon.size ?? icon.width ?? defaultAttributes["width"];
			const viewBoxHeight = icon.size ?? icon.height ?? defaultAttributes["height"];
			const aliasClassNames = icon.aliases?.filter((alias) => typeof alias === "string" && alias.trim() !== "").map((alias) => `lucide-${alias}`) ?? [];
			const iconClassNames = [...icon.name ? [`lucide-${icon.name}`] : [], ...aliasClassNames];
			const classNamesFromClassName = params.className?.split(" ").filter(Boolean) ?? [];
			const className = params.includeDefaultClasses === false ? mergeClasses(...classNamesFromClassName) : mergeClasses("lucide", ...iconClassNames, ...classNamesFromClassName);
			const calculatedStrokeWidth = params.absoluteStrokeWidth ? Number(params.strokeWidth ?? defaultAttributes["stroke-width"]) * Number(icon.size ?? icon.width ?? defaultAttributes["width"]) / Number(params.size ?? params.width ?? defaultAttributes["width"]) : params.strokeWidth ?? defaultAttributes["stroke-width"];
			return [
				"svg",
				{
					...Object.entries(defaultAttributes).reduce((attrs, [attrName, value]) => {
						attrs[getAttributeName(attrName)] = value;
						return attrs;
					}, {}),
					..."color" in params && params.color && { [getAttributeName("stroke")]: params.color },
					..."size" in params && isDefined(params.size) && {
						[getAttributeName("width")]: params.size,
						[getAttributeName("height")]: params.size
					},
					..."width" in params && isDefined(params.width) && { [getAttributeName("width")]: params.width },
					..."height" in params && isDefined(params.height) && { [getAttributeName("height")]: params.height },
					[getAttributeName("stroke-width")]: calculatedStrokeWidth,
					...className && { [getAttributeName("class")]: className },
					[getAttributeName("viewBox")]: `0 0 ${viewBoxWidth} ${viewBoxHeight}`,
					...params.hasA11yProp === false ? { [getAttributeName("aria-hidden")]: "true" } : {},
					..."attributes" in params && params.attributes
				},
				icon.node.map((child) => {
					const [name, attrs, children] = child;
					const nextAttrs = params.nonScalingStroke ? {
						[getAttributeName("vector-effect")]: "non-scaling-stroke",
						...attrs
					} : attrs;
					return children ? [
						name,
						nextAttrs,
						children
					] : [name, nextAttrs];
				})
			];
		}
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/build/buildLucideIconForReact.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		function buildLucideIconForReact(icon, params = {}) {
			return buildLucideIconNode(icon, {
				...params,
				attributeNames: {
					...params.attributeNames,
					class: "className",
					"stroke-width": "strokeWidth",
					"stroke-linecap": "strokeLinecap",
					"stroke-linejoin": "strokeLinejoin",
					"vector-effect": "vectorEffect"
				}
			});
		}
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const hasA11yProp = (props) => {
			for (const prop in props) if (prop.startsWith("aria-") || prop === "role" || prop === "title") return true;
			return false;
		};
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/context.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const LucideContext = (0, react.createContext)({});
		const useLucideContext = () => (0, react.useContext)(LucideContext);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const Icon = (0, react.forwardRef)(({ color, size, width, height, strokeWidth, absoluteStrokeWidth, nonScalingStroke, className = "", children, iconNode = [], icon = {
			node: iconNode,
			aliases: [],
			size: 24
		}, ...rest }, ref) => {
			const { size: contextSize = 24, strokeWidth: contextStrokeWidth = 2, absoluteStrokeWidth: contextAbsoluteStrokeWidth = false, nonScalingStroke: contextNonScalingStroke = false, color: contextColor = "currentColor", className: contextClass = "" } = useLucideContext() ?? {};
			const hasAccessibleProp = Boolean(children) || hasA11yProp(rest);
			const [name, svgAttributes, builtIconNode = []] = buildLucideIconForReact(icon, {
				color: color ?? contextColor,
				width: width ?? size ?? contextSize,
				height: height ?? size ?? contextSize,
				strokeWidth: strokeWidth ?? contextStrokeWidth,
				absoluteStrokeWidth: absoluteStrokeWidth ?? contextAbsoluteStrokeWidth,
				nonScalingStroke: nonScalingStroke ?? contextNonScalingStroke,
				className: mergeClasses(contextClass, className),
				hasA11yProp: hasAccessibleProp,
				attributes: rest
			});
			return (0, react.createElement)(name, {
				ref,
				...svgAttributes
			}, [...builtIconNode.map(([tag, attrs]) => (0, react.createElement)(tag, attrs)), ...Array.isArray(children) ? children : [children]]);
		});
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		function createLucideIcon(iconDataOrName, iconNode = [], aliases = []) {
			const iconData = typeof iconDataOrName === "string" ? toLucideIconData(iconDataOrName, iconNode, aliases) : iconDataOrName;
			const Component = (0, react.forwardRef)(({ className, ...props }, ref) => (0, react.createElement)(Icon, {
				ref,
				icon: iconData,
				className,
				...props
			}));
			if (iconData.name) Component.displayName = toPascalCase(iconData.name);
			return Component;
		}
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-left.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData$10 = {
			name: "chevron-left",
			size: 24,
			node: [["path", {
				d: "m15 18-6-6 6-6",
				key: "1wnfg3"
			}]]
		};
		__iconData$10.node;
		const ChevronLeft = createLucideIcon(__iconData$10);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-right.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData$9 = {
			name: "chevron-right",
			size: 24,
			node: [["path", {
				d: "m9 18 6-6-6-6",
				key: "mthhwq"
			}]]
		};
		__iconData$9.node;
		const ChevronRight = createLucideIcon(__iconData$9);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/circle-alert.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData$8 = {
			name: "circle-alert",
			size: 24,
			node: [
				["circle", {
					cx: "12",
					cy: "12",
					r: "10",
					key: "1mglay"
				}],
				["line", {
					x1: "12",
					x2: "12",
					y1: "8",
					y2: "12",
					key: "1pkeuh"
				}],
				["line", {
					x1: "12",
					x2: "12.01",
					y1: "16",
					y2: "16",
					key: "4dfq90"
				}]
			],
			aliases: ["alert-circle"]
		};
		__iconData$8.node;
		const CircleAlert = createLucideIcon(__iconData$8);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/download.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData$7 = {
			name: "download",
			size: 24,
			node: [
				["path", {
					d: "M12 15V3",
					key: "m9g1x1"
				}],
				["path", {
					d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
					key: "ih7n3h"
				}],
				["path", {
					d: "m7 10 5 5 5-5",
					key: "brsn70"
				}]
			]
		};
		__iconData$7.node;
		const Download = createLucideIcon(__iconData$7);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/external-link.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData$6 = {
			name: "external-link",
			size: 24,
			node: [
				["path", {
					d: "M15 3h6v6",
					key: "1q9fwt"
				}],
				["path", {
					d: "M10 14 21 3",
					key: "gplh6r"
				}],
				["path", {
					d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
					key: "a6xqqp"
				}]
			]
		};
		__iconData$6.node;
		const ExternalLink = createLucideIcon(__iconData$6);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/git-fork.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData$5 = {
			name: "git-fork",
			size: 24,
			node: [
				["circle", {
					cx: "12",
					cy: "18",
					r: "3",
					key: "1mpf1b"
				}],
				["circle", {
					cx: "6",
					cy: "6",
					r: "3",
					key: "1lh9wr"
				}],
				["circle", {
					cx: "18",
					cy: "6",
					r: "3",
					key: "1h7g24"
				}],
				["path", {
					d: "M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9",
					key: "1uq4wg"
				}],
				["path", {
					d: "M12 12v3",
					key: "158kv8"
				}]
			]
		};
		__iconData$5.node;
		const GitFork = createLucideIcon(__iconData$5);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/refresh-cw.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData$4 = {
			name: "refresh-cw",
			size: 24,
			node: [
				["path", {
					d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
					key: "v9h5vc"
				}],
				["path", {
					d: "M21 3v5h-5",
					key: "1q7to0"
				}],
				["path", {
					d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
					key: "3uifl3"
				}],
				["path", {
					d: "M8 16H3v5",
					key: "1cv678"
				}]
			]
		};
		__iconData$4.node;
		const RefreshCw = createLucideIcon(__iconData$4);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/search.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData$3 = {
			name: "search",
			size: 24,
			node: [["path", {
				d: "m21 21-4.34-4.34",
				key: "14j7rj"
			}], ["circle", {
				cx: "11",
				cy: "11",
				r: "8",
				key: "4ej97u"
			}]]
		};
		__iconData$3.node;
		const Search = createLucideIcon(__iconData$3);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/star.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData$2 = {
			name: "star",
			size: 24,
			node: [["path", {
				d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
				key: "r04s7s"
			}]]
		};
		__iconData$2.node;
		const Star = createLucideIcon(__iconData$2);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/store.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData$1 = {
			name: "store",
			size: 24,
			node: [
				["path", {
					d: "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5",
					key: "slp6dd"
				}],
				["path", {
					d: "M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244",
					key: "o0xfot"
				}],
				["path", {
					d: "M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05",
					key: "wn3emo"
				}]
			]
		};
		__iconData$1.node;
		const Store = createLucideIcon(__iconData$1);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.49.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/x.mjs
		/**
		* @license lucide-react v1.49.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const __iconData = {
			name: "x",
			size: 24,
			node: [["path", {
				d: "M18 6 6 18",
				key: "1bl5f8"
			}], ["path", {
				d: "m6 6 12 12",
				key: "d8bk6v"
			}]]
		};
		__iconData.node;
		const X = createLucideIcon(__iconData);
		//#endregion
		//#region src/client/locales.js
		const text = {
			title: "集市",
			search: "搜索",
			searchLabel: "搜索仓库",
			searchPlaceholder: "仓库名、描述或话题",
			refresh: "刷新",
			sort: "排序",
			stars: "Star 数量",
			updated: "最近更新",
			install: "安装",
			forkInstall: "Fork 安装",
			installed: "已安装",
			installSource: "安装来源",
			sourcePlaceholder: "包名、路径、压缩包或 Git 地址",
			githubAccount: "GitHub 账号",
			enterSource: "请输入安装来源",
			submitting: "正在提交安装",
			statusChecking: "正在确认安装状态",
			statusUnconfirmed: "安装状态未确认",
			installationBusy: "已有安装任务正在进行",
			capabilityChecking: "正在读取安装能力",
			managerUnavailable: "官方包管理器不可用",
			previous: "上一页",
			next: "下一页",
			pagination: "分页",
			loading: "正在读取",
			empty: "没有匹配的仓库",
			topic: "话题",
			archived: "已归档",
			fork: "Fork",
			pushed: "最近推送",
			subscriptions: "订阅来源",
			subscriptionRepos: "订阅仓库",
			partial: "GitHub 返回了不完整的搜索结果",
			capped: "GitHub 搜索最多提供前 1000 条结果",
			catalogError: "仓库读取失败",
			capabilityError: "安装能力读取失败",
			connectionError: "任务连接中断，安装状态尚未确认",
			bundleError: "已安装列表读取失败",
			retry: "重试",
			tasks: "安装任务",
			taskHistory: "任务历史",
			latest: "最新任务",
			requested: "请求来源",
			actual: "实际来源",
			package: "安装包",
			requestId: "请求编号",
			taskSession: "会话",
			diagnostics: "诊断",
			output: "安装输出",
			noOutput: "暂无输出",
			logTruncated: "仅保留输出尾部",
			cancel: "取消任务",
			cancelling: "正在取消",
			tooLate: "已进入应用阶段，无法取消",
			pendingBuilds: "待单独授权的构建脚本",
			warnings: "包管理器提示",
			inspecting: "正在核对安装状态",
			notInstalled: "包管理器未确认已安装",
			enabled: "已启用",
			disabled: "未启用",
			changed: "已变更",
			unchanged: "未变更",
			managerResult: "包管理器结果",
			journalError: "任务记录保存失败，重启后可能无法恢复",
			hostProtocolError: "集市接口不兼容；若刚更新插件，请重启 Harness 后重试"
		};
		const phases = {
			"awaiting-session": "等待会话执行",
			"awaiting-approval": "等待审批",
			forking: "正在 Fork",
			installing: "正在安装",
			applying: "正在应用",
			cancelling: "正在取消",
			applied: "已应用",
			"restart-required": "已安装，需重启",
			overridden: "已安装，配置被覆盖",
			"awaiting-build-approval": "构建脚本待授权",
			failed: "失败",
			cancelled: "已取消",
			rejected: "审批已拒绝",
			"approval-unavailable": "审批不可用",
			interrupted: "执行中断，结果未确认",
			"unknown-result": "包管理器结果未确认"
		};
		const t = (key) => text[key] ?? key;
		const phaseLabel = (phase) => phases[phase] ?? phase;
		const countLabel = (total) => `共 ${total} 个仓库`;
		const pageLabel = (page) => `第 ${page} 页`;
		function ghHint(gh) {
			switch (gh.status) {
				case "ready": return `Fork 到 ${gh.login}`;
				case "missing": return "需要 CLI 工具支持";
				case "auth-required": return "GitHub CLI 尚未登录";
				case "permission-denied": return "GitHub CLI 权限不足";
				case "network-error": return "GitHub 网络连接失败";
				case "probing": return "正在检测 GitHub CLI";
				default: return "GitHub CLI 状态暂不可用";
			}
		}
		//#endregion
		//#region src/protocol.js
		/** Ownership affects the Fork action, never discovery or direct installation. */
		function isOwnRepository(repo, login) {
			return typeof repo === "string" && repo.includes("/") && typeof login === "string" && login.length > 0 && repo.split("/")[0].toLowerCase() === login.toLowerCase();
		}
		//#endregion
		//#region src/client/panel.jsx
		const css = `
.bazaar { box-sizing:border-box; height:100%; min-height:0; min-width:0; overflow:auto; padding:18px; color:inherit; font-size:13px; letter-spacing:0; }
.bazaar * { box-sizing:border-box; letter-spacing:0; }
.bazaar h2 { font-size:18px; margin:0; font-weight:600; }
.bazaar h3 { font-size:14px; margin:0; font-weight:600; }
.bazaar-header,.bazaar-controls,.bazaar-actions,.bazaar-pagination { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.bazaar-header { justify-content:space-between; margin-bottom:14px; }
.bazaar-controls { margin-bottom:12px; }
.bazaar input,.bazaar select,.bazaar button { font:inherit; color:inherit; border:1px solid var(--dsw-alias-border-secondary); background:var(--dsw-alias-bg-layer-1,transparent); border-radius:6px; min-height:34px; }
.bazaar input { flex:1 1 200px; min-width:0; padding:7px 10px; }
.bazaar select { max-width:100%; min-width:0; padding:5px 8px; }
.bazaar button { display:inline-flex; gap:6px; align-items:center; justify-content:center; padding:6px 10px; cursor:pointer; flex-shrink:0; }
.bazaar button svg { width:15px; height:15px; flex-shrink:0; }
.bazaar .bazaar-icon { width:34px; height:34px; padding:0; }
.bazaar button[disabled],.bazaar button[aria-disabled=true] { opacity:.45; cursor:not-allowed; }
.bazaar button:not([disabled]):not([aria-disabled=true]):hover { background:var(--dsw-alias-bg-layer-2); }
.bazaar :focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }
.bazaar .bazaar-primary { color:var(--dsw-alias-brand-primary); }
.bazaar a { color:var(--dsw-alias-brand-primary); text-decoration:none; overflow-wrap:anywhere; }
.bazaar a:hover { text-decoration:underline; }
.bazaar-muted { opacity:.65; font-size:12px; }
.bazaar-notice { margin:8px 0; display:flex; align-items:flex-start; gap:8px; color:var(--dsw-alias-text-error,inherit); overflow-wrap:anywhere; }
.bazaar-notice svg { flex-shrink:0; width:16px; height:16px; }
.bazaar-card { display:flex; flex-wrap:wrap; align-items:flex-start; gap:12px; padding:13px; margin:10px 0; border:1px solid var(--dsw-alias-border-secondary); border-radius:8px; background:var(--dsw-alias-bg-layer-1,transparent); }
.bazaar-card-main { flex:1 1 220px; min-width:0; }
.bazaar-repo { font-weight:600; font-size:14px; }
.bazaar-repo svg { width:12px; height:12px; margin-left:5px; }
.bazaar-description { margin:5px 0 8px; line-height:1.6; overflow-wrap:anywhere; }
.bazaar-meta { display:flex; gap:12px; flex-wrap:wrap; font-size:12px; opacity:.7; }
.bazaar-meta span { display:inline-flex; align-items:center; gap:4px; }
.bazaar-meta svg { width:12px; height:12px; }
.bazaar-hint { position:relative; display:inline-flex; }
.bazaar-hint-text { display:none; position:absolute; bottom:calc(100% + 6px); right:0; z-index:3; padding:7px 10px; border:1px solid var(--dsw-alias-border-secondary); border-radius:6px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-text-primary); width:max-content; max-width:220px; box-shadow:0 2px 8px var(--dsw-alias-border-secondary); }
.bazaar-hint:hover .bazaar-hint-text,.bazaar-hint:focus-within .bazaar-hint-text { display:block; }
.bazaar-band { border-top:1px solid var(--dsw-alias-border-secondary); padding-top:14px; margin-top:16px; }
.bazaar-pagination { justify-content:flex-end; padding-top:8px; }
.bazaar-task-head { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:space-between; }
.bazaar-task-head select { flex:0 1 400px; }
.bazaar-task dl { display:grid; grid-template-columns:90px minmax(0,1fr); gap:6px 12px; margin:12px 0; }
.bazaar-task dt { opacity:.65; }
.bazaar-task dd { margin:0; overflow-wrap:anywhere; }
.bazaar-task pre { font:12px/1.55 ui-monospace,monospace; white-space:pre-wrap; overflow-wrap:anywhere; margin:8px 0; max-height:220px; overflow:auto; }
.bazaar-task details { margin:10px 0; }
.bazaar-subscriptions { display:flex; gap:8px 20px; flex-wrap:wrap; margin:10px 0; }
@media(max-width:500px) { .bazaar { padding:12px; } .bazaar-card-main { flex-basis:100%; } .bazaar-task dl { grid-template-columns:72px minmax(0,1fr); } }
`;
		async function request(path, { signal, ...options } = {}) {
			const response = await fetch(`/dsh-bazaar/${path}`, {
				...options,
				signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(9e4)]) : AbortSignal.timeout(9e4),
				headers: {
					accept: "application/json",
					...options.body ? { "content-type": "application/json" } : {}
				}
			});
			const endpoint = path.split("?")[0];
			let body;
			try {
				body = await response.json();
			} catch {
				throw new Error(response.ok ? `${t("hostProtocolError")} (${endpoint}: JSON)` : `HTTP ${response.status} (${endpoint})`);
			}
			if (!response.ok) {
				const error = new Error(body?.error ?? `HTTP ${response.status} (${endpoint})`);
				error.requestId = body?.requestId;
				throw error;
			}
			const valid = {
				"install-status": () => Array.isArray(body?.tasks) && Object.hasOwn(body, "install") && Object.hasOwn(body, "busy"),
				capabilities: () => typeof body?.gh?.status === "string" && typeof body?.installation === "boolean" && body?.approval === "agent-only",
				installed: () => Array.isArray(body?.bundles),
				list: () => Array.isArray(body?.items) && Array.isArray(body?.subscriptions) && Array.isArray(body?.subscribed)
			}[endpoint];
			if (valid && !valid()) throw new Error(`${t("hostProtocolError")} (${endpoint})`);
			return body;
		}
		function Notice({ label, error, retry }) {
			return error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "bazaar-notice",
				role: "alert",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CircleAlert, { "aria-hidden": "true" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						label,
						": ",
						error
					] }),
					retry && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: retry,
						children: t("retry")
					})
				]
			}) : null;
		}
		/** aria-disabled preserves keyboard focus so the precise capability hint is accessible. */
		function ForkButton({ gh, disabled, disabledReason, onClick }) {
			const hint = disabledReason || ghHint(gh);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "bazaar-hint",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					"aria-disabled": disabled || gh.status !== "ready",
					title: hint,
					"aria-label": `${t("forkInstall")}: ${hint}`,
					onClick: () => {
						if (!disabled && gh.status === "ready") onClick();
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GitFork, { "aria-hidden": "true" }), t("forkInstall")]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bazaar-hint-text",
					role: "tooltip",
					children: hint
				})]
			});
		}
		function RepoCard({ item, gh, disabledReason, onInstall, installed }) {
			const disabled = !!disabledReason;
			const ownRepository = gh.status === "ready" && isOwnRepository(item.repo, gh.login);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
				className: "bazaar-card",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "bazaar-card-main",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
							className: "bazaar-repo",
							href: item.url,
							target: "_blank",
							rel: "noreferrer",
							children: [item.repo, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExternalLink, { "aria-hidden": "true" })]
						}),
						item.description && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "bazaar-description",
							children: item.description
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "bazaar-meta",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Star, { "aria-hidden": "true" }), item.stars] }),
								item.pushedAt && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									t("pushed"),
									" ",
									item.pushedAt.slice(0, 10)
								] }),
								item.archived && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("archived") }),
								item.fork && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("fork") }),
								installed && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									t("installed"),
									" · ",
									installed
								] })
							]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "bazaar-actions",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: "bazaar-primary",
						type: "button",
						disabled,
						title: disabledReason || void 0,
						onClick: () => onInstall(`github:${item.repo}`, "direct"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Download, { "aria-hidden": "true" }), t("install")]
					}), !ownRepository && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ForkButton, {
						gh,
						disabled,
						disabledReason,
						onClick: () => onInstall(`github:${item.repo}`, "fork")
					})]
				})]
			});
		}
		function TaskDetail({ task, bundles, onCancel, cancelling }) {
			if (!task) return null;
			const bundleName = task.result?.bundle;
			const bundle = bundles?.find((row) => row.name === bundleName);
			const result = task.result;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "bazaar-task",
				"aria-label": t("tasks"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "bazaar-task-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							role: "status",
							children: phaseLabel(task.phase)
						}), !task.done && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							disabled: cancelling || task.phase === "applying",
							onClick: () => onCancel(task.requestId),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(X, { "aria-hidden": "true" }), cancelling ? t("cancelling") : t("cancel")]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("requested") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: task.requestedSpec }),
						task.spec !== task.requestedSpec && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("actual") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: task.spec })] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("requestId") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: task.requestId }),
						task.sessionId && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("taskSession") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: task.sessionId })] }),
						bundleName && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("package") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: [
							bundleName,
							" · ",
							bundles === null ? t("inspecting") : bundle?.installed ? `${t("installed")} · ${bundle.enabled ? t("enabled") : t("disabled")}` : t("notInstalled")
						] })] }),
						result && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("managerResult") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: [
							result.application,
							" · ",
							result.changed ? t("changed") : t("unchanged")
						] })] })
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Notice, {
						label: t("diagnostics"),
						error: task.error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Notice, {
						label: t("journalError"),
						error: task.journalError
					}),
					result?.pendingBuilds?.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						t("pendingBuilds"),
						": ",
						result.pendingBuilds.join(", ")
					] }),
					result?.warnings?.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						t("warnings"),
						": ",
						result.warnings.join("\n")
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						open: !task.done || !!task.error,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [t("output"), task.logTruncated ? ` · ${t("logTruncated")}` : ""] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: task.log?.map((row) => row.text).join("") || result?.packageResult?.output || t("noOutput") }),
							result?.packageResult?.logPath && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: result.packageResult.logPath })
						]
					}),
					result && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("diagnostics") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: JSON.stringify(result, null, 2) })] })
				]
			});
		}
		/** Local display state never invents package success; the host journal is authoritative. */
		function BazaarPanel() {
			const [draft, setDraft] = (0, react.useState)("");
			const [query, setQuery] = (0, react.useState)("");
			const [sort, setSort] = (0, react.useState)("stars");
			const [page, setPage] = (0, react.useState)(1);
			const [revision, setRevision] = (0, react.useState)(0);
			const [data, setData] = (0, react.useState)(null);
			const [catalogError, setCatalogError] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const catalogSequence = (0, react.useRef)(0);
			const catalogRefresh = (0, react.useRef)(0);
			const [capability, setCapability] = (0, react.useState)({
				gh: { status: "probing" },
				installation: false
			});
			const [capabilityError, setCapabilityError] = (0, react.useState)(null);
			const [source, setSource] = (0, react.useState)("");
			const [selectedTask, setSelectedTask] = (0, react.useState)("");
			const [task, setTask] = (0, react.useState)(null);
			const [tasks, setTasks] = (0, react.useState)([]);
			const [busy, setBusy] = (0, react.useState)(null);
			const [statusReady, setStatusReady] = (0, react.useState)(false);
			const [statusError, setStatusError] = (0, react.useState)(null);
			const [submitError, setSubmitError] = (0, react.useState)(null);
			const [submitting, setSubmitting] = (0, react.useState)(false);
			const submissionGate = (0, react.useRef)(false);
			const [statusRevision, setStatusRevision] = (0, react.useState)(0);
			const [cancelling, setCancelling] = (0, react.useState)(false);
			const [bundles, setBundles] = (0, react.useState)(null);
			const [bundleError, setBundleError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				const abort = new AbortController();
				const sequence = ++catalogSequence.current;
				setLoading(true);
				setCatalogError(null);
				setData(null);
				const force = revision !== catalogRefresh.current;
				catalogRefresh.current = revision;
				request(`list?${new URLSearchParams({
					q: query,
					sort,
					page: String(page),
					...force ? { refresh: "1" } : {}
				})}`, { signal: abort.signal }).then((value) => {
					if (!abort.signal.aborted && sequence === catalogSequence.current) setData(value);
				}).catch((error) => {
					if (!abort.signal.aborted && sequence === catalogSequence.current) setCatalogError(error.message);
				}).finally(() => {
					if (!abort.signal.aborted && sequence === catalogSequence.current) setLoading(false);
				});
				return () => abort.abort();
			}, [
				query,
				sort,
				page,
				revision
			]);
			(0, react.useEffect)(() => {
				const abort = new AbortController();
				setCapabilityError(null);
				setCapability({
					gh: { status: "probing" },
					installation: false
				});
				request(`capabilities${revision ? "?refresh=1" : ""}`, { signal: abort.signal }).then((value) => {
					if (!abort.signal.aborted) setCapability(value);
				}).catch((error) => {
					if (!abort.signal.aborted) {
						setCapability({
							gh: { status: "unavailable" },
							installation: false
						});
						setCapabilityError(error.message);
					}
				});
				return () => abort.abort();
			}, [revision]);
			(0, react.useEffect)(() => {
				const abort = new AbortController();
				let timer;
				setStatusReady(false);
				const poll = async () => {
					try {
						const value = await request(`install-status${selectedTask ? `?requestId=${encodeURIComponent(selectedTask)}` : ""}`, { signal: abort.signal });
						if (abort.signal.aborted) return;
						if (selectedTask && value.install?.requestId !== selectedTask) throw new Error("Installation request identity mismatch");
						setTask(value.install);
						setTasks(value.tasks);
						setBusy(value.busy);
						setStatusError(null);
						setStatusReady(true);
					} catch (error) {
						if (abort.signal.aborted) return;
						setStatusError(error.message);
						setStatusReady(false);
					} finally {
						if (!abort.signal.aborted) timer = setTimeout(poll, 1500);
					}
				};
				poll();
				return () => {
					abort.abort();
					clearTimeout(timer);
				};
			}, [selectedTask, statusRevision]);
			const resultIdentity = `${task?.requestId ?? ""}:${task?.done ?? false}:${task?.phase ?? ""}`;
			(0, react.useEffect)(() => {
				const abort = new AbortController();
				setBundles(null);
				setBundleError(null);
				request("installed", { signal: abort.signal }).then((value) => {
					if (!abort.signal.aborted) setBundles(value.bundles);
				}).catch((error) => {
					if (!abort.signal.aborted) setBundleError(error.message);
				});
				return () => abort.abort();
			}, [resultIdentity, revision]);
			const install = (0, react.useCallback)(async (spec, mode) => {
				if (submissionGate.current || !statusReady || busy || !capability.installation) return;
				submissionGate.current = true;
				setSubmitting(true);
				setSubmitError(null);
				try {
					const value = await request(mode === "fork" ? "fork-install" : "install", {
						method: "POST",
						body: JSON.stringify({ spec })
					});
					if (typeof value.requestId !== "string" || value.install?.requestId !== value.requestId) throw new Error("Installation request identity missing");
					setSelectedTask(value.requestId);
					setTask(value.install);
					setBusy(value.install.done ? null : value.requestId);
				} catch (error) {
					setSubmitError(error.message);
					if (error.requestId) setSelectedTask(error.requestId);
				} finally {
					setStatusReady(false);
					setStatusRevision((previous) => previous + 1);
					setSubmitting(false);
					submissionGate.current = false;
				}
			}, [
				statusReady,
				busy,
				capability.installation
			]);
			const cancel = async (requestId) => {
				setCancelling(true);
				setSubmitError(null);
				try {
					if ((await request("cancel-install", {
						method: "POST",
						body: JSON.stringify({ requestId })
					})).status === "too-late") setSubmitError(t("tooLate"));
				} catch (error) {
					setSubmitError(error.message);
				} finally {
					setCancelling(false);
					setStatusRevision((previous) => previous + 1);
				}
			};
			const disabledReason = submitting ? t("submitting") : !statusReady ? t(statusError ? "statusUnconfirmed" : "statusChecking") : busy ? t("installationBusy") : !capability.installation ? t(capabilityError ? "capabilityError" : capability.gh.status === "probing" ? "capabilityChecking" : "managerUnavailable") : "";
			const disabled = !!disabledReason;
			const items = data?.items ?? [];
			const confirmedPackage = (spec) => {
				const completed = [...tasks].reverse().find((row) => row.requestedSpec === spec && row.result?.bundle);
				return bundles?.some((row) => row.name === completed?.result.bundle && row.installed) ? completed.result.bundle : null;
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "bazaar",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: css }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "bazaar-header",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "bazaar-muted",
							children: [
								t("topic"),
								": dsh-plugin",
								data?.total != null ? ` · ${countLabel(data.total)}` : ""
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: "bazaar-controls",
						onSubmit: (event) => {
							event.preventDefault();
							setPage(1);
							setQuery(draft.trim());
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								value: draft,
								"aria-label": t("searchLabel"),
								placeholder: t("searchPlaceholder"),
								onChange: (event) => setDraft(event.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								className: "bazaar-icon",
								"aria-label": t("search"),
								title: t("search"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Search, { "aria-hidden": "true" })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								"aria-label": t("sort"),
								value: sort,
								onChange: (event) => {
									setPage(1);
									setSort(event.target.value);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "stars",
									children: t("stars")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "updated",
									children: t("updated")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "bazaar-icon",
								type: "button",
								title: t("refresh"),
								"aria-label": t("refresh"),
								onClick: () => {
									setRevision((value) => value + 1);
									setStatusRevision((value) => value + 1);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefreshCw, { "aria-hidden": "true" })
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "bazaar-controls",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "bazaar-muted",
							title: capability.gh?.diagnostic,
							children: capability.gh.status === "ready" ? `${t("githubAccount")}: ${capability.gh.login}` : ghHint(capability.gh)
						}), disabledReason && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "bazaar-muted",
							role: "status",
							children: disabledReason
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: "bazaar-controls",
						onSubmit: (event) => {
							event.preventDefault();
							install(source, "direct");
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							"aria-label": t("installSource"),
							placeholder: t("sourcePlaceholder"),
							value: source,
							onChange: (event) => setSource(event.target.value)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "submit",
							disabled: disabled || !source.trim(),
							title: disabledReason || (!source.trim() ? t("enterSource") : void 0),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Download, { "aria-hidden": "true" }), t("install")]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Notice, {
						label: t("capabilityError"),
						error: capabilityError
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Notice, {
						label: t("catalogError"),
						error: catalogError || data?.topicError,
						retry: () => setRevision((value) => value + 1)
					}),
					data?.incomplete && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bazaar-muted",
						children: t("partial")
					}),
					data?.capped && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bazaar-muted",
						children: t("capped")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						"aria-label": t("searchLabel"),
						"aria-busy": loading,
						children: [
							loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								role: "status",
								children: t("loading")
							}),
							!loading && !catalogError && !data?.topicError && items.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("empty") }),
							items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RepoCard, {
								item,
								gh: capability.gh,
								disabledReason,
								onInstall: install,
								installed: confirmedPackage(`github:${item.repo}`)
							}, item.repo))
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
						className: "bazaar-pagination",
						"aria-label": t("pagination"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "bazaar-muted",
								children: pageLabel(page)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "bazaar-icon",
								type: "button",
								disabled: loading || page === 1,
								title: t("previous"),
								"aria-label": t("previous"),
								onClick: () => setPage((value) => value - 1),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronLeft, { "aria-hidden": "true" })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "bazaar-icon",
								type: "button",
								disabled: loading || !data?.nextPage,
								title: t("next"),
								"aria-label": t("next"),
								onClick: () => setPage(data.nextPage),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronRight, { "aria-hidden": "true" })
							})
						]
					}),
					(data?.subscribed?.length > 0 || data?.subscriptions?.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "bazaar-band",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("subscriptions") }),
							data.subscriptions.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: row.url,
									target: "_blank",
									rel: "noreferrer",
									children: row.url
								}),
								" · ",
								row.count,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Notice, {
									label: t("subscriptions"),
									error: row.error
								})
							] }, row.url)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "bazaar-subscriptions",
								children: data.subscribed.map((repo) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: `https://github.com/${repo}`,
									target: "_blank",
									rel: "noreferrer",
									children: repo
								}, repo))
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "bazaar-band",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "bazaar-task-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("tasks") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": t("taskHistory"),
									value: selectedTask,
									onChange: (event) => {
										setSelectedTask(event.target.value);
										setTask(null);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("latest")
									}), [...tasks].reverse().map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: row.requestId,
										children: [
											phaseLabel(row.phase),
											" · ",
											row.requestedSpec
										]
									}, row.requestId))]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Notice, {
								label: t("connectionError"),
								error: statusError,
								retry: () => setStatusRevision((value) => value + 1)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Notice, {
								label: t("diagnostics"),
								error: submitError
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Notice, {
								label: t("bundleError"),
								error: bundleError
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TaskDetail, {
								task,
								bundles,
								onCancel: cancel,
								cancelling
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.jsx
		const PANEL_ID = "bazaar";
		function BazaarIcon({ size }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Store, {
				size,
				"aria-hidden": "true"
			});
		}
		const inject = ["slots"];
		/** The matching sidebar id and main key replace the conversation/right sidebar. */
		function apply(ctx) {
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID
			}, BazaarPanel));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 30,
				label: () => t("title")
			}, BazaarIcon));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map