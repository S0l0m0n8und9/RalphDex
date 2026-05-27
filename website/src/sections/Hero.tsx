import { DashboardPreview } from '../components/DashboardPreview';
import { LINKS } from '../content/siteContent';

export function Hero() {
  return (
    <main>
      <section className="hero container">
        <div className="hero-copy">
          <p className="kicker">
            <span className="pulse" /> VS Code extension for reviewable agent workflows
          </p>
          <h1>Durable, file-backed agentic coding loops for VS Code.</h1>
          <p className="lead">
            Ralphdex keeps objectives, task graphs, prompts, verification, and provenance
            on disk under <code>.ralph/</code>, so every new session can resume from
            inspectable evidence instead of vanished context.
          </p>
          <div className="actions">
            <a className="button primary" href={LINKS.marketplace}>
              Install Extension
            </a>
            <a className="button secondary" href={LINKS.github}>
              View Source
            </a>
          </div>
          <a className="sub-link" href={LINKS.deepwiki}>
            Explore the architecture on DeepWiki <span aria-hidden="true">-&gt;</span>
          </a>
        </div>
        <DashboardPreview />
      </section>
    </main>
  );
}
