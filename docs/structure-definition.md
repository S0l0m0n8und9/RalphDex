# Structure Definition (`structure.d`)

Ralph supports a hand-editable repository structure definition file (also referred to as `structure.d`) that guides where generated changes should go.

Default path: `.ralph/structure.json`

Override setting: `ralphCodex.structureDefinitionPath`

Reference example: [docs/structure-definition-example.json](structure-definition-example.json)

## What It Is And Where It Lives

- Ralph reads this JSON file during iteration preparation.
- By default it is expected at `.ralph/structure.json`.
- `ralphCodex.structureDefinitionPath` can point to:
  - a workspace-relative path (resolved from workspace root), or
  - an absolute path.
- If the file is missing at preflight time, Ralph tries to generate a starter once.
- If the file already exists, Ralph does not overwrite it.

## JSON Format

`src/ralph/structureDefinition.ts` defines the contract:

- `version` (required): currently must be `1`.
- `directories` (required): array of `{ path, role, description? }`.
- `placementRules` (optional): array of `{ pattern, directory, description? }`.
- `namingConventions` (optional): array of `{ scope, convention, description? }`.
- `forbiddenPaths` (optional): array of `{ path, reason }`.

Supported directory roles:

- `source`, `test`, `docs`, `config`, `scripts`, `state`, `output`, `assets`, `other`

Prompt behavior:

- The `Repo Structure` prompt section is emitted only when a parsed definition exists and `directories` is non-empty.
- Placement and forbidden-path entries are included in that section when present.

## Inference And Generation Behavior

Inference is intentionally shallow and deterministic (`src/ralph/structureInference.ts`):

- It inspects top-level entries only (`fs.readdir(root, { withFileTypes: true })`).
- Directory role assignment is name-based via a fixed map (for example `src -> source`, `test/tests/spec -> test`, `docs -> docs`, `.ralph -> state`, `dist/out/build -> output`, `.github/.vscode -> config`).
- Unknown names map to `other`.
- If known config indicator files exist at repo root (for example `package.json`, `tsconfig.json`, `pyproject.toml`, `go.mod`), inference adds `{ path: ".", role: "config" }`.
- Inference generates `version` + `directories` only; it does not infer `placementRules`, `namingConventions`, or `forbiddenPaths`.

Generation semantics (`generateStructureDefinition` and `ensureStructureDefinitionForPreflight`):

- Runs during preflight preparation.
- Creates parent directories if needed.
- Write-once behavior: skips when target file already exists.
- Emits preflight info diagnostic `structure_definition_generated` when it writes a new file.

## Operator Controls And Overrides

- Primary control: set `ralphCodex.structureDefinitionPath` to your chosen file path.
- Recommended pattern: commit a curated structure file and hand-edit it over time.
- Because generation is no-overwrite, a committed file suppresses further inferred rewrites.
- There is no separate boolean “disable inference” flag today; the practical disable pattern is to point `structureDefinitionPath` to an existing file and keep that file present.

## Hand Editing Guidance

- Start from inference output, then add/adjust:
  - `placementRules` for expected file locations.
  - `namingConventions` for filename style expectations.
  - `forbiddenPaths` for protected runtime/generated zones.
- Keep paths workspace-relative for portability unless an absolute path is intentionally required.
- If the file is invalid JSON or unreadable, Ralph treats it as absent for prompt rendering.
