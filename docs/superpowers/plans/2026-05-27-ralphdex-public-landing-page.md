# Ralphdex Public Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an authored React landing page for Ralphdex from a local Docker container through the existing Cloudflare Tunnel at `ralphdex.com`.

**Architecture:** An independent `website/` Vite + React + TypeScript static app lives in the public Ralphdex repo, uses UI tokens derived from the shipped dashboard, and is served by unprivileged Nginx in a multi-stage Docker image. `/srv/compose` deploys that image as `ralphdex-site` on the existing `homelab` network, while Cloudflare Tunnel maps the public domain to the private upstream.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Nginx unprivileged container, Docker Compose, Cloudflare Tunnel

---

### Task 1: Establish The Website App Test Harness

**Files:**
- Create: `website/package.json`
- Create: `website/package-lock.json`
- Create: `website/index.html`
- Create: `website/tsconfig.json`
- Create: `website/vite.config.ts`
- Create: `website/src/test/setup.ts`
- Create: `website/src/App.test.tsx`

- [ ] **Step 1: Scaffold the independent React package and test runtime**

Create a Vite React TypeScript package with scripts:

```json
{
  "scripts": {
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Use React runtime dependencies and Vite, TypeScript, Vitest, jsdom, and Testing Library development dependencies, then generate `website/package-lock.json` with `npm install`.

- [ ] **Step 2: Write a failing landing-page contract test**

Create `website/src/App.test.tsx` that imports `App` and asserts the launch contract:

```tsx
it('presents Ralphdex launch CTAs and core workflow', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /durable, file-backed agentic coding loops/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /install extension/i })).toHaveAttribute('href', LINKS.marketplace);
  expect(screen.getByRole('link', { name: /view source/i })).toHaveAttribute('href', LINKS.github);
  expect(screen.getByRole('link', { name: /technical docs/i })).toHaveAttribute('href', LINKS.deepwiki);
  expect(screen.getByText(/define work/i)).toBeInTheDocument();
  expect(screen.getByText(/inspect evidence/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the new test and verify red state**

Run:

```bash
docker run --rm -v "$PWD/website:/app" -w /app node:22-alpine npm test
```

Expected: FAIL because `App` and the launch content are not yet implemented.

### Task 2: Implement The React Landing Page

**Files:**
- Create: `website/src/main.tsx`
- Create: `website/src/App.tsx`
- Create: `website/src/content/siteContent.ts`
- Create: `website/src/components/Header.tsx`
- Create: `website/src/components/DashboardPreview.tsx`
- Create: `website/src/sections/Hero.tsx`
- Create: `website/src/sections/Workflow.tsx`
- Create: `website/src/sections/Capabilities.tsx`
- Create: `website/src/sections/Trust.tsx`
- Create: `website/src/sections/DocsCallout.tsx`
- Create: `website/src/sections/Footer.tsx`
- Create: `website/src/styles/main.css`
- Create: `website/public/ralph-icon.svg`

- [ ] **Step 1: Define stable content and public destinations**

Export `LINKS`, workflow stages, and capability card copy from `siteContent.ts`, using:

```ts
export const LINKS = {
  marketplace: 'https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralphdex',
  github: 'https://github.com/S0l0m0n8und9/RalphDex',
  deepwiki: 'https://deepwiki.com/S0l0m0n8und9/RalphDex',
  issues: 'https://github.com/S0l0m0n8und9/RalphDex/issues',
} as const;
```

- [ ] **Step 2: Implement composable landing-page sections**

Compose `App` from `Header`, `Hero`, `Workflow`, `Capabilities`, `Trust`, `DocsCallout`, and `Footer`. The hero renders a clearly illustrative `DashboardPreview` containing task, verification, and provenance states; it does not imply that the public page runs agents.

- [ ] **Step 3: Implement Ralphdex-derived styling and accessibility**

Define dark editor surfaces, amber/cyan/green token colors, bordered cards, monospace metadata, responsive grids, focus-visible rules, and reduced-motion handling in `website/src/styles/main.css`.

- [ ] **Step 4: Verify the contract test turns green and build succeeds**

Run:

```bash
docker run --rm -v "$PWD/website:/app" -w /app node:22-alpine npm test
docker run --rm -v "$PWD/website:/app" -w /app node:22-alpine npm run build
```

Expected: the landing-page test passes and Vite produces `website/dist/`.

### Task 3: Add Website Container And DeepWiki Boundary

**Files:**
- Create: `website/Dockerfile`
- Create: `website/nginx.conf`
- Create: `website/.dockerignore`
- Create: `.devin/wiki.json`
- Modify: `README.md`

- [ ] **Step 1: Add a failing production-container state check**

Run:

```bash
test -f website/Dockerfile && test -f website/nginx.conf && test -f .devin/wiki.json
```

Expected: exits non-zero before these production and documentation-boundary files exist.

- [ ] **Step 2: Add the static production image**

Use a Node 22 build stage and `nginxinc/nginx-unprivileged:alpine` runtime:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
```

Configure Nginx on port `8080`, an explicit `/healthz` response, fingerprinted asset caching, security headers, and SPA fallback.

- [ ] **Step 3: Steer DeepWiki without making it authoritative**

Create `.devin/wiki.json` with `repo_notes` describing the VS Code extension, `.ralph/` state, provider/verification/provenance systems, shipped React webview UI, and the marketing-site deployment boundary. Update `README.md` with a concise `Website and Technical Documentation` section that links to `ralphdex.com` and DeepWiki and states that repository docs/code own behavior.

- [ ] **Step 4: Verify production site container behavior**

Run:

```bash
docker build -t ralphdex-site:test website
docker run -d --rm --name ralphdex-site-test -p 127.0.0.1:18080:8080 ralphdex-site:test
curl -fsS http://127.0.0.1:18080/healthz
curl -fsS http://127.0.0.1:18080/ | grep -q 'Ralphdex'
docker stop ralphdex-site-test
```

Expected: `healthz` returns success and the served page identifies Ralphdex.

### Task 4: Deploy The Website In The Local Compose Stack

**Files:**
- Modify: `/srv/compose/master.compose.yml`
- Create: `/srv/ralphdex_site/` from the feature branch checkout

- [ ] **Step 1: Verify the service is initially absent**

Run:

```bash
docker compose -f /srv/compose/master.compose.yml --profile apps config --services |
  grep -qx ralphdex-site
```

Expected: exits non-zero before deployment wiring is added.

- [ ] **Step 2: Add the `ralphdex-site` application service**

Add the service under the apps/public-site section:

```yaml
  ralphdex-site:
    profiles: ["apps","all"]
    build:
      context: /srv/ralphdex_site/website
    container_name: ralphdex-site
    restart: unless-stopped
    ports:
      - "127.0.0.1:3080:8080"
    networks:
      - homelab
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging: *logging_defaults
    labels:
      <<: *watchtower_enabled
```

- [ ] **Step 3: Install the public source checkout used by Compose**

Clone or update branch `codex/ralphdex-landing-page` at `/srv/ralphdex_site`, ensuring only public repository content is used as build input.

- [ ] **Step 4: Render, build, and smoke-test locally**

Run:

```bash
make -C /srv/compose config PROFILE=apps >/tmp/ralphdex-site-compose.yml
docker compose -f /srv/compose/master.compose.yml --profile apps up -d --build ralphdex-site
curl -fsS http://127.0.0.1:3080/healthz
curl -fsS http://127.0.0.1:3080/ | grep -q 'Ralphdex'
docker run --rm --network compose_homelab curlimages/curl:latest -fsS http://ralphdex-site:8080/healthz
```

Expected: Compose renders, the new container is healthy, localhost returns the site, and a container on the tunnel connector's shared private network can reach the upstream.

### Task 5: Publish `ralphdex.com` Through Cloudflare Tunnel

**Files:**
- Runtime only: Cloudflare Tunnel ingress and DNS records for `ralphdex.com` and `www.ralphdex.com`

- [ ] **Step 1: Read current Cloudflare tunnel and DNS configuration**

Use the Cloudflare API to identify the existing named tunnel, retain all ingress entries, and identify the `ralphdex.com` zone. Do not overwrite existing hostname routes.

- [ ] **Step 2: Add public hostname ingress and DNS**

Insert `ralphdex.com -> http://ralphdex-site:8080` before the fallback ingress rule and add a proxied CNAME to the existing tunnel target. Publish `www.ralphdex.com` using either the same upstream or Cloudflare redirect behavior, preserving apex as canonical.

- [ ] **Step 3: Validate public HTTPS behavior**

Run:

```bash
curl -fsSI https://ralphdex.com/
curl -fsS https://ralphdex.com/ | grep -q 'Ralphdex'
curl -fsSI https://www.ralphdex.com/
```

Expected: the apex serves the landing page over HTTPS and the `www` hostname follows the configured canonical behavior.

### Task 6: Validate And Publish The Product Branch

**Files:**
- Validate: all changed Ralphdex repository website/docs files

- [ ] **Step 1: Run website tests, website build, image smoke, and existing extension validation**

Run the website test/build/container checks under Node 22, followed by:

```bash
npm run validate
```

Expected: all new website checks pass and the existing extension gate remains green.

- [ ] **Step 2: Inspect the final branch diff**

Run:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: only planned website, documentation, and DeepWiki-steering files are changed with no whitespace errors.

- [ ] **Step 3: Push implementation commits to the feature branch**

Commit scoped changes with imperative messages and push `codex/ralphdex-landing-page` for review and later merge into `main`.
