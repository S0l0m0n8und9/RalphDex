import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
import { LINKS } from './content/siteContent';

describe('Ralphdex landing page', () => {
  it('presents launch CTAs and the core workflow', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /durable, file-backed agentic coding loops/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /install extension/i })).toHaveAttribute(
      'href',
      LINKS.marketplace,
    );
    expect(screen.getByRole('link', { name: /view source/i })).toHaveAttribute(
      'href',
      LINKS.github,
    );
    expect(screen.getByRole('link', { name: /technical docs/i })).toHaveAttribute(
      'href',
      LINKS.deepwiki,
    );
    expect(screen.getByText(/define work/i)).toBeInTheDocument();
    expect(screen.getByText(/inspect evidence/i)).toBeInTheDocument();
  });
});
