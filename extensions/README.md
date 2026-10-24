# Extensions

Pi extensions that I use day to day. Each directory is a self-contained extension: a TypeScript file that registers tools, commands, or event handlers with [pi](https://github.com/earendil-works/pi).

| Extension | What it does |
|---|---|
| [`openapi-bridge/`](openapi-bridge/) | Turns any OpenAPI 3.x spec into two tools — `api_ops` to search/document operations and `api_call` to run them — driven from `codemode` so a 500-operation API costs a constant ~1.8 KB of context instead of one tool per endpoint. |

## Installing

Pi loads extensions from `~/.pi/agent/extensions/*.ts` (user level, every session) or `.pi/extensions/` in a project. Copy the extension file, add its config if it needs one, then run `/reload`:

```bash
cp openapi-bridge/openapi-tool.ts ~/.pi/agent/extensions/
cp openapi-bridge/openapi-tools.example.json ~/.pi/agent/openapi-tools.json
```

Extensions can also be loaded for a single run with `pi -e ./path/to/extension.ts`.

## Writing your own

Extensions are plain modules with a default export that receives the extension API:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone",
    parameters: Type.Object({ name: Type.String() }),
    async execute(_id, params) {
      return { content: [{ type: "text", text: `hi ${params.name}` }], details: undefined };
    },
  });
}
```

Useful knobs, all used by `openapi-bridge`: `exposure: "codemode"` (callable from scripts, not declared to the model), `namespace` (groups tools in codemode listings), `outputSchema` + `structuredContent` (scripts get data, the model gets text), and `promptGuidelines`.

Docs: [extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), [codemode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md).
