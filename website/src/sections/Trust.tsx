import { LINKS } from '../content/siteContent';

export function Trust() {
  return (
    <section className="section container trust" id="trust" aria-labelledby="trust-heading">
      <div>
        <p className="section-label">Trust and provenance</p>
        <h2 id="trust-heading">Evidence first, completion second.</h2>
        <p className="trust-copy">
          Ralphdex records selected tasks, generated prompts, provider results,
          verifier output, stop reasons, and provenance bundles so an operator can
          inspect why a loop advanced or stopped.
        </p>
        <a className="text-link" href={LINKS.deepwiki}>
          Explore technical documentation
        </a>
      </div>
      <div className="evidence-panel">
        <p className="mono evidence-title">LATEST PROVENANCE</p>
        <div className="evidence-row">
          <span>prompt-evidence.json</span>
          <span className="pill ok">hashed</span>
        </div>
        <div className="evidence-row">
          <span>verification.json</span>
          <span className="pill ok">passed</span>
        </div>
        <div className="evidence-row">
          <span>stop_reason</span>
          <span className="pill cyan">explicit</span>
        </div>
      </div>
    </section>
  );
}
