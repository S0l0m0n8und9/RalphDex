# UXrefresh Prototype Bundle

`UXrefresh/` is a reference-only prototype bundle captured during the dashboard/sidebar redesign.

It is not part of the shipped extension runtime:

- production webview infrastructure lives under `src/webview/`
- production dashboard/sidebar renderers and VS Code adapters live under `src/ui/`
- shipped regression coverage for those surfaces lives under `test/ui/` and `test/webview/`

Keep this directory only as historical design material. Do not wire commands, tests, or docs to it as if it were the live implementation path.
