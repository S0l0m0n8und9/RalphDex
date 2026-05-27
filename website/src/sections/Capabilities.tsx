import { capabilities } from '../content/siteContent';

export function Capabilities() {
  return (
    <section
      className="section container"
      id="capabilities"
      aria-labelledby="capabilities-heading"
    >
      <div className="section-header narrow">
        <p className="section-label">Capabilities</p>
        <h2 id="capabilities-heading">Built for operators who inspect the work.</h2>
      </div>
      <div className="capability-grid">
        {capabilities.map((capability) => (
          <article className={`capability-card ${capability.tone}`} key={capability.title}>
            <span className="capability-mark" />
            <h3>{capability.title}</h3>
            <p>{capability.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
