import { workflowStages } from '../content/siteContent';

export function Workflow() {
  return (
    <section className="section container" id="workflow" aria-labelledby="workflow-heading">
      <div className="section-header">
        <p className="section-label">Workflow</p>
        <h2 id="workflow-heading">From intent to evidence.</h2>
        <p>Four explicit stages keep automated work understandable and recoverable.</p>
      </div>
      <div className="workflow-grid">
        {workflowStages.map((stage) => (
          <article className="workflow-card" key={stage.step}>
            <span className="mono number">{stage.step}</span>
            <h3>{stage.title}</h3>
            <p>{stage.text}</p>
            <code>{stage.artifact}</code>
          </article>
        ))}
      </div>
    </section>
  );
}
