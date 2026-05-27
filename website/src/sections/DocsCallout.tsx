import { LINKS } from '../content/siteContent';

export function DocsCallout() {
  return (
    <section className="docs container" aria-labelledby="docs-heading">
      <div>
        <p className="section-label">Documentation</p>
        <h2 id="docs-heading">Start here. Go deep when needed.</h2>
        <p>
          The repository README owns install and first-run guidance. DeepWiki provides
          generated architectural exploration grounded in the public source. Curated
          onboarding docs will grow here as the product evolves.
        </p>
      </div>
      <div className="docs-actions">
        <a className="button secondary" href={`${LINKS.github}#readme`}>
          Read Getting Started
        </a>
        <a className="button primary" href={LINKS.deepwiki}>
          Open DeepWiki
        </a>
      </div>
    </section>
  );
}
