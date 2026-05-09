import type { WebviewReadinessModel } from '../viewModel';

interface ReadinessSummaryProps {
  readiness: WebviewReadinessModel;
  workspaceName: string;
  loopState: string;
}

export function ReadinessSummary({ readiness, workspaceName, loopState }: ReadinessSummaryProps) {
  return (
    <section className={`rdx-section readiness ${readiness.kind}`} aria-labelledby="readiness-title">
      <div className="rdx-section-header">
        <h2 id="readiness-title">{readiness.title}</h2>
        <span className="rdx-state">{workspaceName} · {loopState}</span>
      </div>
      <p>{readiness.detail}</p>
    </section>
  );
}
