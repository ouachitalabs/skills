/**
 * OpenAPI → tools bridge
 *
 * Reads one or more OpenAPI 3.x specs (JSON, local file or URL) and registers two
 * tools: `api_ops` (search/document operations) and `api_call` (do the HTTP call).
 * `api_call` is a single generic tool, so a 500-operation spec costs about the same
 * context as a 5-operation one. Designed to be driven from codemode scripts:
 *
 *   const [pets, one] = await Promise.allSettled([
 *     tools.api_call({ operationId: "list_pets", query: { limit: 100 } }),
 *     tools.api_call({ operationId: "get_pet", path: { pet_id: 7 } }),
 *   ]);
 *   text(pets.value.items.length)          // 100 items never reach the model
 *
 * Config: $OPENAPI_TOOLS_CONFIG, else ~/.pi/agent/openapi-tools.json
 * {
 *   "exposure": "codemode",                  // codemode | direct | deferred
 *   "specs": [{
 *     "name": "mock",
 *     "spec": "./mockapi/openapi.json",      // or https://host/openapi.json
 *     "baseUrl": "http://127.0.0.1:8077",    // optional override of servers[0]
 *     "credentials": {                       // keyed by the spec's securitySchemes names
 *       "HTTPBearer":  { "envVar": "MOCK_TOKEN" },
 *       "APIKeyHeader": { "envVar": "MOCK_API_KEY" },
 *       "BasicAuth":   { "userEnvVar": "USER", "passwordEnvVar": "PASS" }
 *     },
 *     "headers": { "X-Trace": "${TRACE_ID}" },
 *     "include": ["^list_", "^get_"],        // optional id/path regexes
 *     "exclude": ["^delete_"],
 *     "descriptionBudget": 1800,             // chars of op list in the tool description
 *     "timeoutMs": 30000,
 *     "maxModelChars": 6000
 *   }]
 * }
 *
 * Auth follows the spec, not the config: `components.securitySchemes` plus the
 * operation's (or root) `security` requirements. A requirement object is an AND of
 * schemes, the requirement list is an OR, and the first fully satisfiable requirement
 * wins — exactly what Swagger UI's Authorize dialog shows. Supported: http bearer,
 * http basic, apiKey in header/query/cookie, oauth2 and openIdConnect (bearer token
 * supplied by env). Connect these to environment variables only.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ---------------------------------------------------------------- config types

interface AuthConfig {
	type: "bearer" | "header" | "basic" | "query";
	name?: string;
	value?: string;
	envVar?: string;
	user?: string;
	userEnvVar?: string;
	password?: string;
	passwordEnvVar?: string;
}

/** Credentials for one declared security scheme, keyed by the scheme name in the spec. */
interface CredentialConfig {
	envVar?: string;
	value?: string;
	userEnvVar?: string;
	user?: string;
	passwordEnvVar?: string;
	password?: string;
	tokenType?: string;
}

type SecurityRequirement = Record<string, string[]>;

interface SpecConfig {
	name?: string;
	spec: string;
	baseUrl?: string;
	headers?: Record<string, string>;
	/** Explicit auth, used when the spec declares no security or as a shim for it. */
	auth?: AuthConfig;
	/** Credentials per security scheme name, e.g. { "bearerAuth": { "envVar": "API_TOKEN" } }. */
	credentials?: Record<string, CredentialConfig>;
	include?: string[];
	exclude?: string[];
	hideParams?: string[];
	descriptionBudget?: number;
	timeoutMs?: number;
	maxModelChars?: number;
	includeResponseHeaders?: boolean;
}

interface SpecRuntime {
	json: Json;
	cfg: SpecConfig;
	schemes: Map<string, Json>;
	rootSecurity: SecurityRequirement[];
}

interface BridgeConfig {
	exposure?: "codemode" | "direct" | "deferred" | "model-only";
	timeoutMs?: number;
	maxModelChars?: number;
	specs?: SpecConfig[];
}

type Json = any;

interface ParamDoc {
	name: string;
	in: "path" | "query" | "header";
	required: boolean;
	type: string;
	description?: string;
}

interface Op {
	spec: string;
	id: string;
	callId: string; // "spec:id" when more than one spec
	method: string;
	path: string;
	summary: string;
	tags: string[];
	pathParams: ParamDoc[];
	queryParams: ParamDoc[];
	headerParams: ParamDoc[];
	bodyProps: { name: string; type: string; required: boolean; description?: string }[];
	bodyType: string;
	baseUrl?: string;
	/** Effective security for this operation; undefined means "inherit the spec's root security". */
	security?: SecurityRequirement[];
}

// ------------------------------------------------------------------- utilities

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

function fail(message: string): never {
	throw new Error(message);
}

async function readJson(source: string, configDir: string): Promise<Json> {
	if (/^https?:\/\//i.test(source)) {
		try {
			const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
			if (!response.ok) fail(`spec ${source} returned HTTP ${response.status}`);
			return JSON.parse(await response.text());
		} catch (error) {
			fail(`cannot load remote spec ${source}: ${(error as Error).message}`);
		}
	}
	const p = isAbsolute(source) ? source : resolve(configDir, source);
	if (!existsSync(p)) fail(`spec not found: ${p}`);
	try {
		return JSON.parse(readFileSync(p, "utf-8"));
	} catch (error) {
		fail(`spec is not valid JSON: ${p} (${(error as Error).message})`);
	}
}

function formatValue(value: Json): string {
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

/** Resolve local "#/..." refs with a cycle guard; foreign refs are returned as-is. */
function deref(spec: Json, node: Json, seen: Set<string> = new Set(), depth = 0): Json {
	if (!node || typeof node !== "object" || depth > 12) return node;
	if (typeof node.$ref === "string") {
		const ref = node.$ref;
		if (!ref.startsWith("#/") || seen.has(ref)) return {};
		seen.add(ref);
		let target: Json = spec;
		for (const part of ref.slice(2).split("/")) {
			target = target?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
		}
		return target ? deref(spec, target, seen, depth + 1) : {};
	}
	return node;
}

function typeOf(spec: Json, schema: Json | undefined): string {
	if (!schema) return "any";
	if (typeof schema.$ref === "string") {
		const name = schema.$ref.split("/").pop() ?? "?";
		const target = deref(spec, schema);
		const t = target?.type;
		return t === "object" || target?.properties ? name : `${name}`;
	}
	if (Array.isArray(schema.enum)) return schema.enum.map((v: Json) => JSON.stringify(v)).join("|");
	if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
		return (schema.anyOf ?? schema.oneOf).map((s: Json) => typeOf(spec, s)).join("|");
	}
	if (schema.type === "array") return `${typeOf(spec, schema.items)}[]`;
	if (schema.type) return schema.type;
	if (schema.properties) return "object";
	return "any";
}

function expandEnv(value: string): string {
	return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => process.env[name] ?? "");
}

function applyServerVariables(url: string, server: Json | undefined): string {
	if (!server?.variables) return url;
	let out = url;
	for (const [name, variable] of Object.entries<Json>(server.variables)) {
		out = out.replace(new RegExp(`\\{${name}\\}`, "g"), String(variable?.default ?? ""));
	}
	return out;
}

function baseUrlFor(spec: Json, cfg: SpecConfig, pathItem: Json, operation: Json): string | undefined {
	if (cfg.baseUrl) return cfg.baseUrl.replace(/\/+$/, "");
	const server = operation?.servers?.[0] ?? pathItem?.servers?.[0] ?? spec.servers?.[0];
	if (!server?.url) return undefined;
	return applyServerVariables(server.url, server).replace(/\/+$/, "");
}

function matchAny(patterns: string[] | undefined, value: string): boolean {
	if (!patterns?.length) return false;
	return patterns.some((pattern) => {
		try {
			return new RegExp(pattern, "i").test(value);
		} catch {
			return value.toLowerCase().includes(pattern.toLowerCase());
		}
	});
}

// --------------------------------------------------------------- op extraction

function buildOps(specName: string, spec: Json, cfg: SpecConfig, schemes: Map<string, Json>, rootSecurity: SecurityRequirement[]): Op[] {
	const ops: Op[] = [];
	// Header/query params a declared apiKey scheme injects; undocumented to avoid double-entry.
	const schemeHeaders = new Set(
		[...schemes.values()].filter((s) => s.type === "apiKey" && s.in === "header" && s.name).map((s) => String(s.name).toLowerCase()),
	);
	const schemeQuery = new Set(
		[...schemes.values()].filter((s) => s.type === "apiKey" && s.in === "query" && s.name).map((s) => String(s.name).toLowerCase()),
	);
	for (const [rawPath, rawItem] of Object.entries<Json>(spec.paths ?? {})) {
		const pathItem = deref(spec, rawItem);
		const shared: Json[] = (pathItem.parameters ?? []).map((p: Json) => deref(spec, p));
		for (const [method, rawOp] of Object.entries<Json>(pathItem)) {
			if (!HTTP_METHODS.has(method)) continue;
			const operation = deref(spec, rawOp);
			const id = String(operation.operationId ?? `${method}_${rawPath}`).replace(/[^A-Za-z0-9_.-]+/g, "_");
			const key = `${method.toUpperCase()} ${rawPath}`;
			if (cfg.include?.length && !matchAny(cfg.include, id) && !matchAny(cfg.include, key)) continue;
			if (matchAny(cfg.exclude, id) || matchAny(cfg.exclude, key)) continue;

			const params = new Map<string, ParamDoc>();
			// Params the bridge fills in itself (auth + configured headers) are not documented.
			const autoHeaders = new Set([
				"authorization",
				...(cfg.auth?.type === "header" ? [String(cfg.auth.name ?? "X-Api-Key").toLowerCase()] : []),
				...Object.keys(cfg.headers ?? {}).map((key) => key.toLowerCase()),
				...schemeHeaders,
			]);
			const autoQuery = new Set([
				...(cfg.auth?.type === "query" ? [String(cfg.auth.name ?? "api_key").toLowerCase()] : []),
				...schemeQuery,
			]);
			// hideParams entries are "name" or "in:name", for specs that document noisy params.
			const hidden = new Set((cfg.hideParams ?? []).map((entry) => entry.toLowerCase()));
			for (const rawParam of [...shared, ...(operation.parameters ?? []).map((p: Json) => deref(spec, p))]) {
				const param = deref(spec, rawParam);
				if (!param?.name || !param.in) continue;
				const target = param.in === "path" ? "path" : param.in === "query" ? "query" : param.in === "header" ? "header" : undefined;
				if (param.in === "header" && autoHeaders.has(String(param.name).toLowerCase())) continue;
				if (param.in === "query" && autoQuery.has(String(param.name).toLowerCase())) continue;
				const lowerName = String(param.name).toLowerCase();
				if (hidden.has(lowerName) || hidden.has(`${param.in}:${lowerName}`)) continue;
				const doc: ParamDoc = {
					name: param.name,
					in: param.in,
					required: param.in === "path" ? true : Boolean(param.required),
					type: typeOf(spec, param.schema),
					description: param.description,
				};
				if (target) params.set(`${param.in}:${param.name}`, doc);
			}

			const media = operation.requestBody ? deref(spec, operation.requestBody) : undefined;
			const jsonSchema = media?.content?.["application/json"]?.schema
				? deref(spec, media.content["application/json"].schema)
				: undefined;
			const resolvedBody = jsonSchema ? deref(spec, jsonSchema) : undefined;
			const bodyProps = Object.entries<Json>(resolvedBody?.properties ?? {}).map(([name, raw]) => {
				const schema = deref(spec, raw);
				return {
					name,
					type: typeOf(spec, schema),
					required: (resolvedBody?.required ?? []).includes(name),
					description: schema?.description,
				};
			});

			const values = [...params.values()];
			ops.push({
				spec: specName,
				id,
				callId: id,
				method: method.toUpperCase(),
				path: rawPath,
				summary: String(operation.summary ?? operation.description ?? "").split("\n")[0].slice(0, 90),
				tags: (operation.tags ?? []).map(String),
				pathParams: values.filter((p) => p.in === "path"),
				queryParams: values.filter((p) => p.in === "query"),
				headerParams: values.filter((p) => p.in === "header"),
				bodyProps,
				bodyType: jsonSchema ? typeOf(spec, jsonSchema) : media ? "non-json" : "none",
				baseUrl: baseUrlFor(spec, cfg, pathItem, operation),
				security: operation.security ?? pathItem.security ?? (rootSecurity.length ? rootSecurity : undefined),
			});
		}
	}
	return ops;
}

function opLine(op: Op): string {
	const summary = op.summary ? ` — ${op.summary}` : "";
	return `${op.callId}  ${op.method} ${op.path}${summary}`;
}

function opDetail(op: Op, authNote?: string): string {
	const lines = [`${op.callId}  ${op.method} ${op.path}`, op.summary ? `  ${op.summary}` : "", `  base: ${op.baseUrl ?? "(none)"}`];
	if (authNote) lines.push(`  security: ${authNote} — injected automatically when configured`);
	const params = [...op.pathParams, ...op.queryParams, ...op.headerParams];
	if (params.length) {
		lines.push("  params:");
		for (const p of params) {
			const meta = [p.in, p.required ? "required" : "optional", p.type].join(", ");
			const note = p.description ? ` — ${p.description}` : "";
			lines.push(`    ${p.name} (${meta})${note}`);
		}
	}
	if (op.bodyType !== "none") {
		lines.push(`  body (${op.bodyType}):`);
		if (op.bodyProps.length === 0) lines.push("    (free-form; pass any JSON)");
		for (const p of op.bodyProps) {
			const meta = [p.required ? "required" : "optional", p.type].join(", ");
			const note = p.description ? ` — ${p.description}` : "";
			lines.push(`    ${p.name} (${meta})${note}`);
		}
	}
	return lines.filter((line) => line !== "").join("\n");
}

function scoreOp(op: Op, query: string): number {
	const q = query.toLowerCase();
	const id = op.id.toLowerCase();
	let score = 0;
	if (id === q || op.callId.toLowerCase() === q) score += 100;
	if (id.startsWith(q)) score += 40;
	if (id.includes(q)) score += 25;
	if (op.path.toLowerCase().includes(q)) score += 15;
	if (op.summary.toLowerCase().includes(q)) score += 10;
	if (op.tags.some((tag) => tag.toLowerCase().includes(q))) score += 5;
	const words = q.split(/\s+/).filter(Boolean);
	if (words.length > 1) {
		const haystack = `${id} ${op.path} ${op.summary} ${op.tags.join(" ")}`.toLowerCase();
		if (words.every((word) => haystack.includes(word))) score += 20;
	}
	return score;
}

// ----------------------------------------------------------------- auth/headers

interface AuthApplication {
	headers: Record<string, string>;
	query: Record<string, string>;
	cookies: Record<string, string>;
}

const EMPTY_APP: AuthApplication = { headers: {}, query: {}, cookies: {} };

type SchemeResult = { ok: true; applied: AuthApplication; source: string } | { ok: false; reason: string };

/** OAS3 securitySchemes, or OAS2 securityDefinitions normalised to the OAS3 shape. */
function loadSchemes(spec: Json): Map<string, Json> {
	const raw = spec.components?.securitySchemes ?? spec.securityDefinitions ?? {};
	const schemes = new Map<string, Json>();
	for (const [name, value] of Object.entries<Json>(raw)) {
		const scheme = deref(spec, value) ?? {};
		if (scheme.type === "basic") schemes.set(name, { ...scheme, type: "http", scheme: "basic" });
		else schemes.set(name, scheme);
	}
	return schemes;
}

/**
 * Map the legacy top-level `auth` block onto a declared scheme, so configs written
 * before scheme support keep working. Same-type only: bearer→http/bearer,
 * header→apiKey/header, query→apiKey/query, basic→http/basic.
 */
function legacyCredential(scheme: Json | undefined, legacy: AuthConfig | undefined): CredentialConfig | undefined {
	if (!legacy || !scheme) return undefined;
	const kind = String(scheme.type ?? "");
	const httpScheme = String(scheme.scheme ?? "").toLowerCase();
	if (kind === "http" && httpScheme === "bearer" && legacy.type === "bearer") return { envVar: legacy.envVar, value: legacy.value };
	if (kind === "http" && httpScheme === "basic" && legacy.type === "basic") return legacy;
	if (kind === "apiKey" && scheme.in === "header" && legacy.type === "header") return { envVar: legacy.envVar, value: legacy.value };
	if (kind === "apiKey" && scheme.in === "query" && legacy.type === "query") return { envVar: legacy.envVar, value: legacy.value };
	if ((kind === "oauth2" || kind === "openIdConnect") && legacy.type === "bearer") return { envVar: legacy.envVar, value: legacy.value };
	return undefined;
}

function lookupSecret(
	cred: CredentialConfig | undefined,
	envKey: "envVar" | "userEnvVar" | "passwordEnvVar",
	literalKey: "value" | "user" | "password",
	schemeName: string,
	specName: string,
): { ok: true; value: string; source: string } | { ok: false; reason: string } {
	if (!cred) {
		return { ok: false, reason: `not configured (add specs[].credentials["${schemeName}"].${envKey})` };
	}
	const envVar = (cred as Json)[envKey];
	const literal = (cred as Json)[literalKey];
	if (envVar) {
		const value = process.env[envVar];
		if (!value) return { ok: false, reason: `env var ${envVar} is not set` };
		return { ok: true, value, source: `$${envVar}` };
	}
	if (literal !== undefined) return { ok: true, value: expandEnv(String(literal)), source: "config value" };
	return { ok: false, reason: `scheme "${schemeName}" has no ${envKey} or ${literalKey} configured (spec "${specName}")` };
}

function applyScheme(schemeName: string, scheme: Json, rt: SpecRuntime): SchemeResult {
	const cred = rt.cfg.credentials?.[schemeName] ?? legacyCredential(scheme, rt.cfg.auth);
	const specName = rt.cfg.name ?? "spec";
	switch (String(scheme.type ?? "")) {
		case "http": {
			const kind = String(scheme.scheme ?? "").toLowerCase();
			if (kind === "bearer") {
				const secret = lookupSecret(cred, "envVar", "value", schemeName, specName);
				if (!secret.ok) return secret;
				const prefix = cred?.tokenType ?? "Bearer";
				return { ok: true, applied: { ...EMPTY_APP, headers: { Authorization: `${prefix} ${secret.value}` } }, source: secret.source };
			}
			if (kind === "basic") {
				const user = lookupSecret(cred, "userEnvVar", "user", schemeName, specName);
				if (!user.ok) return user;
				const password = lookupSecret(cred, "passwordEnvVar", "password", schemeName, specName);
				if (!password.ok) return password;
				const token = Buffer.from(`${user.value}:${password.value}`).toString("base64");
				return { ok: true, applied: { ...EMPTY_APP, headers: { Authorization: `Basic ${token}` } }, source: `${user.source}/${password.source}` };
			}
			return { ok: false, reason: `http auth scheme "${kind}" (scheme "${schemeName}") is not supported` };
		}
		case "apiKey": {
			const secret = lookupSecret(cred, "envVar", "value", schemeName, specName);
			if (!secret.ok) return secret;
			const where = String(scheme.in ?? "header");
			const name = String(scheme.name ?? schemeName);
			if (where === "query") return { ok: true, applied: { ...EMPTY_APP, query: { [name]: secret.value } }, source: secret.source };
			if (where === "cookie") return { ok: true, applied: { ...EMPTY_APP, cookies: { [name]: secret.value } }, source: secret.source };
			return { ok: true, applied: { ...EMPTY_APP, headers: { [name]: secret.value } }, source: secret.source };
		}
		case "oauth2":
		case "openIdConnect": {
			const secret = lookupSecret(cred, "envVar", "value", schemeName, specName);
			if (!secret.ok) return secret;
			return { ok: true, applied: { ...EMPTY_APP, headers: { Authorization: `Bearer ${secret.value}` } }, source: secret.source };
		}
		case "mutualTLS":
			return { ok: false, reason: `mutualTLS (scheme "${schemeName}") is not supported` };
		default:
			return { ok: false, reason: `security scheme type "${String(scheme.type)}" (scheme "${schemeName}") is not supported` };
	}
}

/**
 * A requirement object is an AND of schemes; the list of requirement objects is an OR.
 * The first requirement that can be fully satisfied wins. `[]` in the spec means optional.
 */
function resolveAuth(op: Op, rt: SpecRuntime): AuthApplication & { note?: string } {
	const requirements = op.security ?? rt.rootSecurity ?? [];
	if (!requirements.length) return { ...EMPTY_APP };

	const alternatives: string[] = [];
	for (const requirement of requirements) {
		const names = Object.keys(requirement ?? {});
		if (names.length === 0) return { ...EMPTY_APP };
		const combined: AuthApplication = { headers: {}, query: {}, cookies: {} };
		const used: string[] = [];
		const problems: string[] = [];
		for (const name of names) {
			const scheme = rt.schemes.get(name);
			if (!scheme) {
				problems.push(`${name}: not declared in securitySchemes`);
				break;
			}
			const result = applyScheme(name, scheme, rt);
			if (!result.ok) {
				problems.push(`${name}: ${result.reason}`);
				break;
			}
			Object.assign(combined.headers, result.applied.headers);
			Object.assign(combined.query, result.applied.query);
		Object.assign(combined.cookies, result.applied.cookies);
			used.push(`${name} via ${result.source}`);
		}
		if (problems.length === 0) return { ...combined, note: used.join(" + ") };
		alternatives.push(problems.join("; "));
	}
	fail(`no usable credentials. The spec accepts any of:\n  ${alternatives.join("\n  ")}`);
}

/** Human-readable security summary for api_ops({ operationId }). */
function describeAuth(op: Op, rt: SpecRuntime | undefined): string | undefined {
	if (!rt) return undefined;
	const requirements = op.security ?? rt.rootSecurity ?? [];
	if (!requirements.length) return undefined;
	return requirements
		.map((requirement) => {
			const names = Object.keys(requirement ?? {});
			if (names.length === 0) return "none required";
			return names
				.map((name) => {
					const scheme = rt.schemes.get(name);
					const kind = scheme ? [scheme.type, scheme.scheme, scheme.in].filter(Boolean).join("/") : "undeclared";
					const cred = rt.cfg.credentials?.[name] ?? legacyCredential(scheme, rt.cfg.auth);
					return `${name} (${kind}${cred ? ", configured" : ", NOT configured"})`;
				})
				.join(" + ");
		})
		.join(" | ");
}

// ------------------------------------------------------------------- registration

export default async function openApiBridge(pi: ExtensionAPI) {
	const configPath = process.env.OPENAPI_TOOLS_CONFIG || resolve(homedir(), ".pi/agent/openapi-tools.json");
	if (!existsSync(configPath)) return;

	let config: BridgeConfig;
	try {
		config = JSON.parse(readFileSync(configPath, "utf-8"));
	} catch (error) {
		throw new Error(`openapi-tools: cannot read ${configPath}: ${(error as Error).message}`);
	}
	const configDir = dirname(configPath);
	const specs = (config.specs ?? []).filter((s) => s?.spec);
	if (specs.length === 0) return;

	const exposure = config.exposure ?? "codemode";
	const timeoutDefault = config.timeoutMs ?? 30000;
	const maxModelCharsDefault = config.maxModelChars ?? 6000;
	const budgetDefault = 1800;

	// spec name -> parsed spec, config, declared security schemes, root security
	const specByName = new Map<string, SpecRuntime>();
	const ops: Op[] = [];
	for (const [index, cfg] of specs.entries()) {
		const name = cfg.name ?? `spec${index + 1}`;
		if (specByName.has(name)) fail(`openapi-tools: duplicate spec name "${name}"`);
		const json = await readJson(cfg.spec, configDir);
		const runtime: SpecRuntime = { json, cfg: { ...cfg, name }, schemes: loadSchemes(json), rootSecurity: json.security ?? [] };
		specByName.set(name, runtime);
		const built = buildOps(name, json, runtime.cfg, runtime.schemes, runtime.rootSecurity);
		if (built.length === 0) continue;
		ops.push(...built);
	}
	if (ops.length === 0) return;

	if (specByName.size > 1) for (const op of ops) op.callId = `${op.spec}:${op.id}`;
	const byCallId = new Map<string, Op>();
	const byId = new Map<string, Op[]>();
	for (const op of ops) {
		byCallId.set(op.callId.toLowerCase(), op);
		byId.set(op.id.toLowerCase(), [...(byId.get(op.id.toLowerCase()) ?? []), op]);
	}

	function lookup(operationId: string): Op {
		const raw = operationId.trim();
		const direct = byCallId.get(raw.toLowerCase());
		if (direct) return direct;
		// "spec:id" is accepted even when only one spec is configured.
		const colon = raw.indexOf(":");
		if (colon > 0) {
			const prefix = raw.slice(0, colon);
			const rest = raw.slice(colon + 1).toLowerCase();
			if (specByName.has(prefix)) {
				const scoped = byId.get(rest)?.find((op) => op.spec === prefix);
				if (scoped) return scoped;
				fail(`unknown operationId "${raw}": spec "${prefix}" has no "${raw.slice(colon + 1)}". Use api_ops({ spec: "${prefix}" }) to list it.`);
			}
		}
		const bare = byId.get(raw.toLowerCase());
		if (bare?.length === 1) return bare[0];
		if (bare && bare.length > 1) {
			fail(`"${raw}" exists in several specs: ${bare.map((op) => op.callId).join(", ")}`);
		}
		// "GET /pets" form
		const byRoute = ops.find((op) => `${op.method} ${op.path}`.toLowerCase() === raw.toLowerCase());
		if (byRoute) return byRoute;
		const near = ops
			.map((op) => ({ op, score: scoreOp(op, raw) }))
			.filter((c) => c.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 5)
			.map((c) => c.op.callId);
		fail(`unknown operationId "${raw}".${near.length ? ` Close matches: ${near.join(", ")}` : " Use api_ops to list operations."}`);
	}

	function authNoteFor(op: Op): string | undefined {
		return describeAuth(op, specByName.get(op.spec));
	}

	// description: compact op list, trimmed to a char budget
	const budget = Math.max(200, Math.min(...specs.map((s) => s.descriptionBudget ?? budgetDefault), budgetDefault));
	const shown: string[] = [];
	let used = 0;
	for (const op of ops.sort((a, b) => a.callId.localeCompare(b.callId))) {
		const line = opLine(op);
		if (used + line.length + 1 > budget) {
			shown.push(`... ${ops.length - shown.length} more operations, use api_ops({query}) to find them`);
			break;
		}
		shown.push(line);
		used += line.length + 1;
	}
	const description = [
		"Call an HTTP operation described by a configured OpenAPI spec. Returns the parsed JSON body with its status.",
		`Operations (${ops.length}) from ${[...specByName.keys()].join(", ")}:`,
		...shown,
		"api_ops({query}) searches operations; api_ops({operationId}) shows parameters and body fields.",
	].join("\n");

	const callSchema = Type.Object({
		operationId: Type.String({ description: "Operation id from the list, 'spec:id' when several specs apply, or 'GET /path'" }),
		path: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Path template values, e.g. {\"pet_id\": 7}" })),
		query: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Query string parameters; arrays repeat the key" })),
		body: Type.Optional(Type.Any({ description: "JSON request body" })),
		headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "Extra request headers" })),
		timeoutMs: Type.Optional(Type.Number({ description: "Per-call timeout in milliseconds" })),
		includeResponseHeaders: Type.Optional(Type.Boolean({ description: "Include response headers in the result" })),
	});

	const callOutput = Type.Object(
		{
			spec: Type.String(),
			operationId: Type.String(),
			ok: Type.Boolean(),
			status: Type.Number(),
			statusText: Type.String(),
			method: Type.String(),
			url: Type.String(),
			durationMs: Type.Number(),
			data: Type.Optional(Type.Any()),
			text: Type.Optional(Type.String()),
			headers: Type.Optional(Type.Record(Type.String(), Type.String())),
			error: Type.Optional(Type.String()),
		},
		{ additionalProperties: true },
	);

	function buildRequest(op: Op, params: Json, signal: AbortSignal | undefined) {
		const runtime = specByName.get(op.spec) ?? fail(`openapi-tools: lost spec ${op.spec}`);
		const cfg = runtime.cfg;
		const pathValues = (params.path ?? {}) as Record<string, Json>;

		let pathname = op.path.replace(/\{([^}]+)\}/g, (_m, name: string) => {
			const value = pathValues[name] ?? pathValues[name.replace(/_/g, "")];
			if (value === undefined || value === null) {
				const missing = op.pathParams.map((p) => p.name).filter((n) => pathValues[n] === undefined);
				fail(`missing path parameter${missing.length > 1 ? "s" : ""} for ${op.callId}: ${missing.join(", ")} (pass path: { ... })`);
			}
			return encodeURIComponent(String(value));
		});
		if (!pathname.startsWith("/")) pathname = `/${pathname}`;

		const base = op.baseUrl ?? "";
		if (!base) fail(`no server/baseUrl configured for spec "${op.spec}"`);
		const url = new URL(base + pathname);

		// Credentials come from the spec's declared security schemes; OR-of-requirements resolved.
		const auth = resolveAuth(op, runtime);
		const query: Record<string, Json> = { ...(params.query ?? {}), ...auth.query };
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null) continue;
			if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, formatValue(item));
			else url.searchParams.set(key, formatValue(value));
		}

		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(cfg.headers ?? {})) headers[key] = expandEnv(String(value));
		Object.assign(headers, auth.headers);
		const cookiePairs = Object.entries(auth.cookies).map(([name, value]) => `${name}=${value}`);
		if (cookiePairs.length) headers.Cookie = [headers.Cookie, ...cookiePairs].filter(Boolean).join("; ");
		Object.assign(headers, params.headers ?? {});
		headers.Accept ??= "application/json";

		let body: string | undefined;
		if (params.body !== undefined && params.body !== null && op.method !== "GET" && op.method !== "HEAD") {
			body = typeof params.body === "string" ? params.body : JSON.stringify(params.body);
			headers["Content-Type"] ??= "application/json";
		}

		const timeoutMs = Number(params.timeoutMs ?? cfg.timeoutMs ?? timeoutDefault);
		const signals = [AbortSignal.timeout(Math.max(1, timeoutMs))];
		if (signal) signals.push(signal);
		const combined = typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : AbortSignal.timeout(Math.max(1, timeoutMs));

		return { url, method: op.method, headers, body, signal: combined, cfg, maxModelChars: cfg.maxModelChars ?? maxModelCharsDefault };
	}

	pi.registerTool({
		name: "api_ops",
		label: "API operations",
		description:
			"Search or document the operations of the configured OpenAPI specs. Without arguments it lists every operation; with query it ranks matches; with operationId it prints parameters, body fields, and the resolved base URL.",
		promptSnippet: "Search OpenAPI operations: api_ops({query}) or api_ops({operationId}) for parameter docs",
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Substring/word match on operation id, path, summary, or tags" })),
			operationId: Type.Optional(Type.String({ description: "Print full docs for one operation" })),
			spec: Type.Optional(Type.String({ description: "Restrict the listing to one spec name" })),
		}),
		exposure,
		namespace: { name: "openapi", description: "REST operations from configured OpenAPI specs", aliases: ["api"] },
		async execute(_toolCallId, params) {
			const { query, operationId, spec } = params as Json;
			if (operationId) {
				const op = lookup(String(operationId));
				const text = opDetail(op, authNoteFor(op));
				return { content: [{ type: "text", text }], details: { operationId: op.callId } } as Json;
			}
			let pool = spec ? ops.filter((op) => op.spec === spec) : ops;
			if (query) {
				pool = pool
					.map((op) => ({ op, score: scoreOp(op, String(query)) }))
					.filter((c) => c.score > 0)
					.sort((a, b) => b.score - a.score)
					.map((c) => c.op);
			} else {
				pool = [...pool].sort((a, b) => a.callId.localeCompare(b.callId));
			}
			const text = pool.length
				? pool.map(opLine).join("\n")
				: `no operations matched "${query}"${spec ? ` in spec ${spec}` : ""}; ${ops.length} total`;
			return { content: [{ type: "text", text }], details: { count: pool.length } } as Json;
		},
	});

	pi.registerTool({
		name: "api_call",
		label: "API call",
		description,
		promptSnippet: "Call a REST operation from a configured OpenAPI spec by operationId",
		promptGuidelines: [
			"Use api_ops first when you are unsure which operation to call or which parameters it needs.",
			"api_call returns structured { ok, status, data } — branch on ok/status instead of parsing error text.",
			"In codemode scripts, run independent calls with Promise.allSettled() and print only the fields you need.",
		],
		parameters: callSchema,
		outputSchema: callOutput,
		exposure,
		namespace: { name: "openapi", description: "REST operations from configured OpenAPI specs", aliases: ["api"] },
		annotations: { openWorldHint: true },
		async execute(_toolCallId, rawParams, signal) {
			const params = rawParams as Json;
			const op = lookup(String(params.operationId ?? ""));
			const started = Date.now();
			let request: ReturnType<typeof buildRequest>;
			try {
				request = buildRequest(op, params, signal);
			} catch (error) {
				throw new Error(`${op.callId}: ${(error as Error).message}`);
			}

			let response: Response;
			try {
				response = await fetch(request.url, {
					method: request.method,
					headers: request.headers,
					body: request.body,
					signal: request.signal,
					redirect: "follow",
				});
			} catch (error) {
				const name = (error as Error).name;
				const why =
					name === "TimeoutError" ? "timed out" : name === "AbortError" ? "aborted" : (error as Error).message;
				throw new Error(`${op.callId}: request failed (${why}) ${request.method} ${request.url.toString()}`);
			}

			const durationMs = Date.now() - started;
			const contentType = response.headers.get("content-type") ?? "";
			const rawText = await response.text();
			let data: Json = undefined;
			let text: string | undefined;
			if (contentType.includes("json") || /^[[{]/.test(rawText.trim())) {
				try {
					data = rawText ? JSON.parse(rawText) : undefined;
				} catch {
					text = rawText;
				}
			} else {
				text = rawText;
			}

			const headers = params.includeResponseHeaders || request.cfg.includeResponseHeaders
				? Object.fromEntries(response.headers.entries())
				: undefined;
			const structured: Json = {
				spec: op.spec,
				operationId: op.callId,
				ok: response.ok,
				status: response.status,
				statusText: response.statusText,
				method: request.method,
				url: request.url.toString(),
				durationMs,
				...(data !== undefined ? { data } : {}),
				...(text !== undefined ? { text: text.slice(0, request.maxModelChars) } : {}),
				...(headers ? { headers } : {}),
			};
			if (!response.ok) structured.error = errorMessage(response.status, data ?? text);

			const bodyForModel = data !== undefined ? JSON.stringify(data, null, 2) : (text ?? "");
			const trimmed =
				bodyForModel.length > request.maxModelChars
					? `${bodyForModel.slice(0, request.maxModelChars)}\n… ${bodyForModel.length - request.maxModelChars} chars omitted (codemode scripts get the full structuredContent)`
					: bodyForModel;
			const header = `HTTP ${response.status} ${response.statusText} ${request.method} ${request.url.toString()} (${durationMs}ms)`;
			const content = [{ type: "text" as const, text: trimmed ? `${header}\n${trimmed}` : header }];

			return {
				content,
				structuredContent: structured,
				details: { operationId: op.callId, status: response.status, durationMs, url: request.url.toString() },
				...(response.ok ? {} : { isError: true }),
			} as Json;
		},
	});
}

function errorMessage(status: number, payload: Json): string {
	const detail =
		typeof payload === "string"
			? payload.slice(0, 300)
			: payload?.detail ?? payload?.message ?? payload?.error ?? JSON.stringify(payload)?.slice(0, 300);
	return `HTTP ${status}${detail ? `: ${detail}` : ""}`;
}
