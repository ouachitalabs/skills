# openapi-bridge — one tool for any OpenAPI spec

A [pi](https://github.com/earendil-works/pi) extension that turns any OpenAPI 3.x spec into two tools, designed to be driven from `codemode`:

- **`api_ops`** — search, list, or document operations (params, body fields, base URL, declared security).
- **`api_call`** — perform the HTTP call and return `{ ok, status, data }`.

Both register with `exposure: "codemode"`, so they are never declared to the model. A 500-operation API costs a constant ~1.8 KB description instead of one tool per endpoint, and a script can run calls in parallel and print only what matters — a 200-item response can become one line of output.

## Why not one tool per endpoint

| Approach | Tools declared to the model | Cost per spec |
|---|---|---|
| MCP codegen from spec | N | grows with the API |
| **this bridge** | 0 (codemode-only) | ~1.8 KB, constant |

```js
// inside codemode
const [pets, one] = await Promise.allSettled([
  tools.api_call({ operationId: "list_pets", query: { limit: 200 } }),
  tools.api_call({ operationId: "get_pet", path: { pet_id: 7 } }),
]);
text(`${pets.value.data.items.length} pets`);   // 200 items never reach the model
text(one.value.data.name);
```

## Install

```bash
cp openapi-tool.ts ~/.pi/agent/extensions/
cp openapi-tools.example.json ~/.pi/agent/openapi-tools.json
```

Then run `/reload` in pi. Config is read at load time, so `/reload` after every edit. `OPENAPI_TOOLS_CONFIG` overrides the config path; `pi -e ./openapi-tool.ts` loads the extension for a single run.

## Config

```jsonc
{
  "exposure": "codemode",        // codemode (default) | direct | deferred | model-only
  "timeoutMs": 15000,            // default per-call timeout
  "maxModelChars": 6000,         // cap on response text shown to the model
  "specs": [
    {
      "name": "mock",            // prefix for operationIds when you configure >1 spec
      "spec": "https://host/openapi.json",   // URL or local path (relative to this file)
      "baseUrl": "http://127.0.0.1:8077",    // optional, overrides servers[0]
      "headers": { "X-Trace": "${TRACE_ID}" },
      "credentials": { "HTTPBearer": { "envVar": "MOCK_TOKEN" } },
      "include": ["^list_"],     // optional regexes on operationId or "METHOD /path"
      "exclude": ["^delete_"],
      "hideParams": ["header:x-api-key"],    // spec params the bridge fills itself
      "descriptionBudget": 1200,             // chars of operation list in the tool description
      "maxModelChars": 4000,
      "includeResponseHeaders": false
    }
  ]
}
```

## Auth follows the spec, not the config

Schemes come from `components.securitySchemes` (OAS 2 `securityDefinitions` also works); requirements come from the operation's `security`, falling back to the spec's root `security`. A requirement object is an **AND** of schemes, the requirement list is an **OR**, and the first fully satisfiable requirement wins — exactly what Swagger UI's Authorize dialog shows.

You only map scheme names to environment variables:

```jsonc
"credentials": {
  "HTTPBearer":   { "envVar": "API_TOKEN" },
  "APIKeyHeader": { "envVar": "API_KEY" },
  "APIKeyQuery":  { "envVar": "API_KEY" },
  "BasicAuth":    { "userEnvVar": "USER", "passwordEnvVar": "PASS" },
  "OAuth":        { "envVar": "ACCESS_TOKEN", "tokenType": "Bearer" }
}
```

Supported: `http`/bearer, `http`/basic, `apiKey` in header/query/cookie, `oauth2` and `openIdConnect` (bearer token from env). `mutualTLS` is rejected by name. Credentials resolve per operation, so an operation with `security: []` gets no auth even when its siblings need it. Passed-in `headers` cannot bypass a declared requirement — a missing credential fails before the request is sent.

`value`, `user`, and `password` accept literals and `${ENV}` expansion, but prefer `envVar`. The older top-level `auth` block still works as a same-type shim (bearer→http/bearer, header→apiKey/header, query→apiKey/query, basic→http/basic).

## Tools

`api_ops({ query?, operationId?, spec? })` — list, search, or document operations.

```js
await tools.api_ops({ query: "pets" });          // ranked search
await tools.api_ops({ operationId: "create_pet" });  // params, body, base URL, security
```

`api_call({ operationId, path?, query?, body?, headers?, timeoutMs?, includeResponseHeaders? })`

- `operationId` accepts `id`, `spec:id`, or `"GET /pets"`.
- Arrays in `query` repeat the key; objects are JSON-encoded. Arrays in `path` are not supported (path params are scalar).
- Returns `structuredContent: { spec, operationId, ok, status, statusText, method, url, durationMs, data | text, headers?, error? }`.
- Non-2xx returns `isError: true` **with** structured data, so scripts branch on `ok`/`status` instead of parsing text.
- Failures name every alternative scheme and what is missing:

```
list_pets: no usable credentials. The spec accepts any of:
  HTTPBearer: env var API_TOKEN is not set
  APIKeyHeader: not configured (add specs[].credentials["APIKeyHeader"].envVar)
```

## Mock server

`mockapi/app.py` is a FastAPI service used to test the bridge: 9 operations, 250 seeded pets, declared `HTTPBearer` / `APIKeyHeader` / `APIKeyQuery` schemes (all three are OR alternatives on each protected operation), a `security: []` health probe, a 500 endpoint, and a slow endpoint for timeout tests.

```bash
cd extensions/openapi-bridge
python3 -m venv .venv && .venv/bin/pip install -r mockapi/requirements.txt
.venv/bin/uvicorn mockapi.app:app --host 127.0.0.1 --port 8077   # spec at /openapi.json
export MOCK_TOKEN=test-token MOCK_API_KEY=key-123
```

## Verified behavior

| Case | Result |
|---|---|
| all three schemes configured | `200`, `["HTTPBearer:valid"]` (first satisfiable requirement) |
| only `APIKeyHeader` configured | `200`, `["APIKeyHeader:valid"]` |
| only `APIKeyQuery` configured | `200`, `["APIKeyQuery:valid"]` |
| legacy `auth` block | `200`, `["HTTPBearer:valid"]` (shim) |
| operation with `security: []` | `200`, no credentials sent |
| no credentials configured | error names all three schemes and the config key to add |
| env var unset | `HTTPBearer: env var … is not set` alongside the other alternatives |
| wrong token | `ok=false status=401 HTTP 401: invalid or missing credential` |
| missing path param | `missing path parameter for get_pet: pet_id (pass path: { ... })` |
| timeout (`timeoutMs: 400` on a 3s op) | `request failed (timed out)` |
| 404 with body | `isError: true` **and** `{ ok: false, status: 404, error }` in structuredContent |
| 200-item response | reduced to one line in-script; 14.5 KB never reached the model |
| spec by URL | loads at startup, same behavior as a local file |

## Limits

- JSON specs only (no YAML); OpenAPI 3.x shape assumed, OAS 2 security definitions normalised.
- Local `#/...` `$ref`s are resolved for docs; remote/cross-file refs are shown by name.
- The spec drives discovery, not enforcement: no request/response schema validation.
- One HTTP request per call; no retries, pagination, or token refresh. `oauth2` takes a bearer token from the environment — if you need a real `clientCredentials` flow, that's a token-fetch-and-cache layer this doesn't have yet.
