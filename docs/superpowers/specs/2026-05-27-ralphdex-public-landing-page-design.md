# Ralphdex Public Landing Page Design

**Date:** 2026-05-27
**Status:** Approved
**Primary URL:** `https://ralphdex.com`

---

## Goal

Build a public landing page for Ralphdex that explains the VS Code extension, sends visitors to the VS Code Marketplace and GitHub repository, and establishes a stable front-end foundation for curated documentation later. The first release is a marketing and onboarding surface, not a duplicate technical manual or a hosted extension backend.

## Scope

### Included

- A React landing page within this public repository.
- Original product copy for the hero, workflow, capabilities, trust/provenance message, and future documentation callout.
- Visual design derived from the shipped Ralphdex dashboard/sidebar UI.
- Prominent links to install the extension, inspect the GitHub source, and explore the Ralphdex DeepWiki.
- A Docker production build suitable for local hosting.
- Deployment wiring in the homelab Compose repository and public publication through the existing Cloudflare Tunnel connector.
- DeepWiki steering metadata so generated technical documentation covers the important Ralphdex systems and the new website boundary.

### Excluded From The First Release

- A full authored documentation portal.
- A CMS, analytics, accounts, authentication, or dynamic backend.
- Runtime connection between the landing page and users' `.ralph/` workspaces.
- Cloudflare Pages or Workers hosting; hosting is explicitly local Docker behind Cloudflare Tunnel.

## Architecture

### Repository Boundary

The website source lives in this repository under `website/`, next to the extension it describes. This keeps website messaging, release links, screenshots/assets, and later documentation work aligned with product changes.

The local homelab repository at `/srv/compose` owns deployment only:

- it runs the website container on the existing `homelab` Docker network;
- it provides a localhost-only recovery/testing port;
- its existing `cloudflared` container publishes the approved hostname to the private container upstream.

No Cloudflare Tunnel token, DNS credential, or hosting-specific secret belongs in this public repository.

### React Application

`website/` is an independent Vite + React + TypeScript application. It starts as a static single-page site, structured around reusable content and layout components rather than one monolithic component:

```text
website/
  src/
    components/       # navigation, buttons, cards, mock dashboard panels
    sections/         # hero, workflow, capabilities, trust, docs callout, footer
    content/          # authored marketing/link data and stable copy
    styles/           # Ralphdex-derived tokens and responsive layout rules
    App.tsx
    main.tsx
  public/             # Ralph icon and static presentation assets
  Dockerfile
  nginx.conf
```

The application does not implement a documentation router in the first release. Navigation reserves a documentation destination through DeepWiki now, and the component/content structure leaves room for a later curated `/docs` route without restructuring the landing page.

### Production Container

A multi-stage Docker build compiles the static Vite output and serves it from an unprivileged Nginx runtime on port `8080`. Nginx supplies:

- static asset caching for fingerprinted assets;
- an HTML fallback for future React client-side routes;
- a simple health/request path usable from Compose validation.

The public repository owns this image definition because it is part of the website release artifact. `/srv/compose` supplies only local orchestration and ingress.

### Cloudflare Publication

The homelab already runs a remotely managed `cloudflared` connector on the shared `homelab` Docker network. Deployment adds a `ralphdex-site` service to that same network and configures Cloudflare Tunnel public hostnames:

| Public hostname | Tunnel upstream |
|---|---|
| `ralphdex.com` | `http://ralphdex-site:8080` |
| `www.ralphdex.com` | redirect to the apex domain, or the same upstream if redirect setup is unavailable |

The container publishes only a localhost recovery/testing port on the host. Normal public requests reach the website through Cloudflare Tunnel, not through an Internet-facing Docker port or Nginx Proxy Manager.

## Visual System

The website should look like the public presentation of the shipped Ralphdex UI, not an unrelated SaaS template.

### Source Cues

The design is based on the production React/webview implementation under `src/webview-ui/` and its documented UI boundary in `docs/architecture.md`. `UXrefresh/` may be consulted as historical design material, but is not the production source.

### Tokens And Motifs

| Purpose | Direction |
|---|---|
| Background | dark editor-like charcoal surfaces (`#1a1a1f` / `#1e1e22` family) |
| Primary action | Ralphdex amber (`#f5b041`) |
| Successful/evidence state | green (`#5bd69c`) |
| Informational/technical highlight | cyan (`#6fc3df`) |
| Failure/warning illustration | restrained orange/red only where needed |
| Typography | readable UI sans for prose, monospace for task IDs/status/evidence labels |
| Components | bordered panels, status pills, task rows, progress lanes, artifact/provenance badges |

### Landing Page Presentation

The hero includes a composed, non-interactive dashboard-style preview illustrating the Ralphdex workflow: an active task, verification state, artifact trace, and bounded iteration status. This is product illustration based on real product concepts; it must not suggest live execution on the website.

The site will be responsive and accessible: semantic sections, keyboard-visible focus styles, sufficient contrast, reduced-motion handling for any subtle activity indicators, and clear CTA labels.

## Information Architecture And Content

### Header

- Ralphdex icon and wordmark.
- Anchor navigation for `Workflow`, `Capabilities`, and `Trust`.
- `Technical Docs` link to DeepWiki.
- Primary `Install Extension` action to the VS Code Marketplace.

### Hero

Positioning statement:

> Durable, file-backed agentic coding loops for VS Code.

Supporting message explains that Ralphdex persists objectives, task graphs, prompts, verification, and provenance under `.ralph/` so work can be inspected and resumed beyond one chat session.

Actions:

- Primary: install from VS Code Marketplace.
- Secondary: view source on GitHub.
- Tertiary link: explore technical documentation on DeepWiki.

### Workflow

A four-stage workflow presents only stable, user-relevant behavior:

1. Define work through a PRD and task graph.
2. Execute with a supported CLI provider or IDE handoff.
3. Verify with deterministic checks and explicit stop conditions.
4. Inspect durable artifacts and provenance.

### Capability Cards

- File-backed state.
- Multiple supported CLI backends.
- Deterministic loop control and verification.
- Inspectable artifacts and provenance.

Claims in these cards must be consistent with `README.md`, `docs/workflows.md`, `docs/verifier.md`, `docs/provenance.md`, and the actual shipped command/settings surface.

### Trust And Evidence

This section differentiates Ralphdex from opaque automation: task state, prompts, verification results, stop reasons, and provenance artifacts are written for operator review. It links to DeepWiki for architectural exploration and to repository docs/source for canonical behavior.

### Documentation Callout

The first release does not create duplicate detailed documentation pages. It states:

- install/get-started guidance is maintained in the repository and Marketplace-facing README;
- technical exploration and generated architecture navigation are available through DeepWiki;
- a curated documentation area is planned for `ralphdex.com` as onboarding needs grow.

### Footer

Links to the VS Code Marketplace, GitHub repository, DeepWiki, MIT license, and issue tracker.

## Documentation And DeepWiki Strategy

### Source Of Truth

DeepWiki is not the canonical definition of Ralphdex behavior. The authoritative sources remain:

1. shipped extension code and `package.json` for runnable functionality and command/settings surfaces;
2. focused repository documents such as `docs/architecture.md`, `docs/workflows.md`, `docs/verifier.md`, `docs/provenance.md`, and `docs/security.md`;
3. `README.md` for public overview, installation, and release-facing orientation.

DeepWiki is the public technical exploration layer generated from those sources. The landing page links to it rather than reproducing large technical explanations that would become another maintenance surface.

### DeepWiki Steering

Add `.devin/wiki.json` to the public repository with guidance that:

- identifies Ralphdex as a VS Code extension and file-backed orchestration harness, not a general agent platform;
- prioritizes the extension architecture, durable `.ralph/` state, execution/provider paths, verifier/provenance model, shipped React webview UI, and the website/deployment boundary;
- instructs the wiki to distinguish canonical repository docs from the public marketing landing page.

The initial implementation should prefer `repo_notes` without an explicit page list. DeepWiki's official guidance recommends notes as the lower-maintenance steering mechanism and using an explicit complete page list only when required coverage remains missing.

### Copy Maintenance Rule

Website marketing text may summarize stable benefits. It must not become the sole owner of configuration defaults, command inventories, provider maturity, verifier semantics, or security boundaries. When a landing-page claim changes due to product behavior, update the owning repository document and website copy together.

## Deployment And Security

- Store Cloudflare Tunnel credentials only in the local hosting environment; never in this repository.
- Serve a static application with no form submission, cookies, or client secrets in release one.
- Do not expose the container publicly through a host port; any mapped port is bound to `127.0.0.1` for local diagnosis only.
- Use the already running outbound `cloudflared` connector and Cloudflare-managed HTTPS/DNS at the public edge.
- Link to public source/docs; do not copy `.ralph/` runtime artifacts or private workspace data into the site.

## Testing And Acceptance

### Website Repository

- React component tests verify that the key CTA destinations and launch sections render.
- The production build completes from `website/`.
- Docker builds the website image and its HTTP response contains the Ralphdex landing-page identity.
- Link targets use the correct public Marketplace, GitHub, and DeepWiki locations.

### Hosting Repository

- `make config PROFILE=<selected-profile>` renders the new service without exposing secrets.
- The `ralphdex-site` container starts on the shared Docker network and returns HTML through its localhost-only recovery port.
- `cloudflared` can reach `http://ralphdex-site:8080` on the Compose network.

### Public Publication

- Cloudflare public hostname routing is configured for `ralphdex.com`.
- HTTPS requests to `https://ralphdex.com` return the landing page.
- `www.ralphdex.com` follows the selected canonical-host behavior.

## Future Extension

A later documentation release can add curated onboarding pages under `/docs` in the same React project. Those pages should focus on installation, first-run workflows, and task-oriented guides that benefit from editorial control, while detailed code architecture remains sourced through version-controlled repository docs and exposed for exploration through DeepWiki.
