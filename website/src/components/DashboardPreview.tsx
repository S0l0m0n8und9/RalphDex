export function DashboardPreview() {
  return (
    <div className="preview" aria-label="Illustration of the Ralphdex dashboard workflow">
      <div className="preview-bar">
        <span className="dot" />
        <span className="preview-label">RALPHDEX / ACTIVE LOOP</span>
        <span className="pill active">RUNNING</span>
      </div>
      <div className="preview-body">
        <div className="task-card">
          <div className="task-header">
            <span className="eyebrow">Current task</span>
            <span className="mono accent">T-0042</span>
          </div>
          <h3>Publish verified feature branch</h3>
          <p>Durable objective, bounded execution, evidence on disk.</p>
          <div className="progress-track">
            <span />
          </div>
          <div className="progress-meta mono">
            <span>ITER 07 / 20</span>
            <span className="ok">verify</span>
          </div>
        </div>
        <div className="trace">
          <div className="trace-row complete">
            <span className="status-dot" />
            <span>PRD + task graph</span>
            <code>ready</code>
          </div>
          <div className="trace-row active">
            <span className="status-dot" />
            <span>Verifier pass</span>
            <code>running</code>
          </div>
          <div className="trace-row">
            <span className="status-dot" />
            <span>Provenance bundle</span>
            <code>queued</code>
          </div>
        </div>
      </div>
      <p className="preview-note mono">Illustrative dashboard preview / no agents run on this site</p>
    </div>
  );
}
