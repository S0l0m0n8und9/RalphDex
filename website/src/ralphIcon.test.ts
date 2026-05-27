import { describe, expect, it } from 'vitest';
import iconSource from '../public/ralph-icon.svg?raw';

describe('Ralphdex website icon', () => {
  it('carries explicit high-contrast colors when embedded as an image', () => {
    expect(iconSource).not.toContain('currentColor');
    expect(iconSource).toContain('#e4e4e8');
    expect(iconSource).toContain('#f5b041');
  });
});
