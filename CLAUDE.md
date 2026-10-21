# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Yaak is a desktop API client (REST, GraphQL, gRPC, WebSocket, SSE) built as a combined Rust (Cargo workspace) + Node.js (npm workspaces) monorepo on Tauri and React.

## Hard rules

- Do not commit, push, or tag without explicit approval.
- Tag safety: app AND CLI releases both ship from `v*` tags (the CLI is version-locked to the app and publishes to npm on every app tag); `@yaakapp/api` uses `yaak-api-*` tags. Always confirm which is requested before retagging.
- Community PRs are limited to bug fixes (see `CONTRIBUTING.md`).

## Commands

Prerequisites: Node 24+, Rust, and the Vite+ `vp` CLI.

```sh
npm install && npm run bootstrap   # first-time setup (installs wasm-pack, builds all workspaces, vendors plugins/protoc/node)
npm start                          # run the desktop client in dev (alias for client:dev)
npm run proxy:dev                  # run the separate Yaak Proxy desktop app
YAAK_TARGET=web npm run dev --workspace @yaakapp/yaak-client   # run the client in a browser (IndexedDB host, no Rust)
npm run web:dev                    # browser app + the hosted send server

npm run lint                       # vp lint (oxlint, type-aware) + per-workspace `tsc --noEmit`
npm run format                     # vp fmt (oxfmt)
vp test                            # all JS tests (vitest)
vp test path/to/file.test.ts       # a single JS test file
npm test --workspace plugins/auth-basic   # one plugin's tests

cargo test --all --features yaak-app-client/wry   # all Rust tests (what CI runs)
cargo test -p yaak-models <test_name>             # a single Rust test
cargo run -p yaak-cli -- --help                   # the standalone CLI

npm run migration                  # create a new SQLite migration in crates/yaak-models/migrations
```

- Always run `npm run lint` after modifying TS/JS. A pre-commit hook runs `vp check --fix` on staged files.
- Run `npm run bootstrap` after changing plugin runtime or MCP server code (`packages/plugin-runtime`, `plugins-external/mcp-server`) so the vendored copies the app loads are rebuilt.
- CI also runs an OpenAPI import round-trip: `cargo build -p yaak-cli && node plugins/importer-openapi/tests/roundtrip.mjs`.

## Architecture

### Rust crates (by directory)

- `crates/` — host-agnostic core. **Must not depend on Tauri.** Notable ones:
  - `yaak-models` — SQLite models, migrations, query manager, and model change events. Supports `init_standalone()` for non-Tauri hosts (CLI).
  - `common/yaak-rpc-schema` — the single declaration of the frontend RPC surface: every command name, request, and response type. TS bindings are generated from it.
  - `yaak-commands` — command handler bodies written against a `Host` trait (`async fn(host, Req) -> Result<Res>`), so any host registers them without redeclaring. Handlers that need native desktop features (windows, updater, dialogs) remain in the Tauri app.
  - `yaak` — engine operations shared by hosts (sending requests, import, plugin event handling).
  - `yaak-plugins` — manages the Node plugin runtime sidecar and the plugin event protocol.
  - Protocol/feature crates: `yaak-http`, `yaak-grpc`, `yaak-ws`, `yaak-sse`, `yaak-templates` (template tag parser/renderer, also compiled to WASM), `yaak-git`, `yaak-sync` (filesystem mirroring), `yaak-crypto` (encrypted secrets), `yaak-mcp`, `yaak-proxy`.
- `crates-tauri/` — Tauri-specific code. `yaak-app-client` is the main desktop app (setup block initializes managers; Tauri commands); `yaak-app-proxy` is the proxy app; plus window/font/license utilities.
- `crates-cli/yaak-cli` — standalone CLI using the same database as the app.
- `crates-proxy/yaak-proxy-lib` — proxy app's data layer (its own migrations).
- `crates-server/` — `yaak-web`, the server backing the browser build's request sending; `yaak-playground`.

When moving logic out of a Tauri crate, the pattern is: move the handler into a `crates/` crate written against a host trait, initialize managers in the app's `.setup()`, and drop the Tauri plugin `init()`/dependency (also update `crates-tauri/yaak-app-client/capabilities/default.json`).

### Frontend

- `apps/yaak-client` — React app (TanStack Router/Query, CodeMirror, Tailwind). `apps/yaak-proxy` — proxy UI.
- `packages/platform` — the only way the app talks to a host. `index.ts` installs the Tauri host; browser builds resolve to `index.web.ts`, which installs a host in `src/web/` that serves commands from IndexedDB (`src/web/README.md` lists what it implements). Nothing else should import a host directly.
- `packages/model-store`, `packages/ui`, `packages/theme`, `packages/common-lib`, `packages/tailwind-config` — shared frontend libraries.

### Generated TypeScript bindings

Rust types are exported to TS with `ts-rs` into each crate's `bindings/` dir (e.g. `crates/yaak-models/bindings/gen_models.ts`, `crates/yaak-plugins/bindings/gen_events.ts`). Bindings are regenerated by running that crate's tests, e.g. `cargo test -p yaak-plugins`, after modifying Rust types. Don't hand-edit `bindings/` files.

### Plugin system

- Plugins run in a Node.js sidecar (`packages/plugin-runtime`) that connects to the app over a WebSocket (`HOST`/`PORT` env) and exchanges `InternalEvent`s defined in `yaak-plugins`. Plugin-facing types live in `packages/plugin-runtime-types` (published as `@yaakapp/api`).
- Built-in plugins are in `plugins/` (auth, importers, template functions, actions, themes); `plugins-external/` holds the MCP server, faker, and httpsnippet. Each builds with `yaakcli build` and tests with `vp test --run tests`.
- Backend constraints when handling plugin events:
  - Always use `UpdateSource::Plugin` when calling database methods from plugin events.
  - Never send `createdAt`/`updatedAt` from TypeScript — the Rust backend controls them. It uses `NaiveDateTime` (no timezone), so don't send ISO timestamp strings.
- The MCP server has no active window context: it cannot call `window.workspaceId()`; get the workspace ID from `workspaceCtx.yaak.workspace.list()` instead.

### Data

SQLite via `yaak-models`; migrations in `crates/yaak-models/migrations` apply on app start. Dev builds use a separate database location from production.
