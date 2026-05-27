import { LINKS } from '../content/siteContent';
import ralphIconUrl from '../assets/ralph-icon.svg';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="brand footer-brand">
          <img src={ralphIconUrl} alt="" />
          <span>Ralphdex</span>
        </div>
        <p>Durable agentic coding loops for VS Code.</p>
        <nav aria-label="Footer navigation">
          <a href={LINKS.marketplace}>Marketplace</a>
          <a href={LINKS.github}>GitHub</a>
          <a href={LINKS.deepwiki}>DeepWiki</a>
          <a href={LINKS.issues}>Issues</a>
          <a href={LINKS.license}>MIT License</a>
        </nav>
      </div>
    </footer>
  );
}
