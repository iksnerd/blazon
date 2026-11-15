import { describe, it, expect } from 'vitest';
import { hooksNotice } from './hooks-notice.js';

describe('hooksNotice', () => {
  it('says to run npm run hooks in a checkout without the hooks path', () => {
    expect(hooksNotice({ inCheckout: true, hooksPath: null })).toContain('npm run hooks');
    expect(hooksNotice({ inCheckout: true, hooksPath: '/elsewhere/hooks' })).toContain('npm run hooks');
  });

  it('is silent when the hooks path is .githooks', () => {
    expect(hooksNotice({ inCheckout: true, hooksPath: '.githooks' })).toBeNull();
    expect(hooksNotice({ inCheckout: true, hooksPath: '.githooks/' })).toBeNull();
  });

  it('is silent outside a checkout, whatever the hooks path', () => {
    expect(hooksNotice({ inCheckout: false, hooksPath: null })).toBeNull();
    expect(hooksNotice({ inCheckout: false, hooksPath: 'x' })).toBeNull();
  });
});
