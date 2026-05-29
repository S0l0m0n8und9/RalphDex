# Confirm your AI provider

Ralphdex runs iterations by shelling out to a provider you choose in settings (`ralphCodex.cliProvider`):

- **`claude`** — the Claude CLI (`claude -p`)
- **`codex`** — the Codex CLI (`codex exec`)
- **`copilot`** / **`copilot-foundry`** — GitHub Copilot CLI
- **`gemini`** — the Gemini CLI
- **`azure-foundry`** — a direct Azure AI Foundry HTTPS endpoint

Make sure your chosen provider's CLI is installed and authenticated (or, for Azure, that the endpoint and credentials are configured).

Open **Show Status** and check the **First-Run Readiness** card — the *Provider ready* row tells you whether Ralphdex can reach your provider before you start a run.
