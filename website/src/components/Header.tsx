import { LINKS } from '../content/siteContent';

import ralphIconUrl from '../assets/ralph-icon.svg';

export function Header() {
  return (
    <header className="site-header">
      <nav className="container nav" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Ralphdex home">
          <img src={ralphIconUrl} alt="" />
          <span>Ralphdex</span>
        </a>
        <div className="nav-links">
          <a href="#workflow">Workflow</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#trust">Trust</a>
          <a href={LINKS.deepwiki} target="_blank" rel="noreferrer">
            Technical Docs
          </a>
        </div>
        <a className="button small primary nav-action" href={LINKS.marketplace}>
          Marketplace
        </a>
      </nav>
    </header>
  );
}
