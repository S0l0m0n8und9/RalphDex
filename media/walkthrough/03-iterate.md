# Run your first iteration

**Run Single Iteration** executes one deterministic Ralph cycle:

1. **Preflight** — checks the workspace, provider, and task graph are ready.
2. **Prompt** — builds a prompt from your durable `.ralph/` state.
3. **Execute** — hands the prompt to your provider.
4. **Verify** — runs your validation command and inspects the result.
5. **Reconcile** — updates task state from the provider's completion report and writes provenance evidence.

Start with a single iteration to see the full cycle and its stop reason. Once you trust it, **Run Loop** repeats iterations until a task is done or a stop condition is hit.
