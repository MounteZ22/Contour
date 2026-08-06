import { describe, expect, it } from 'vitest';
import { loopbackUrl, normalizeWindowState, shouldHideOnClose } from '../lifecycle.js';

describe('desktop lifecycle helpers', () => {
  it('clamps persisted window dimensions and drops invalid values', () => {
    expect(normalizeWindowState({ x: 12.4, y: 18.6, width: 200, height: 5000 }))
      .toEqual({ x: 12, y: 19, width: 900, height: 2160 });
    expect(normalizeWindowState({ width: 'wide', height: 800 })).toBeUndefined();
  });

  it('builds only valid loopback URLs', () => {
    expect(loopbackUrl(4321)).toBe('http://127.0.0.1:4321');
    expect(() => loopbackUrl(0)).toThrow('Invalid loopback port');
  });

  it('hides closes until an explicit quit', () => {
    expect(shouldHideOnClose(false)).toBe(true);
    expect(shouldHideOnClose(true)).toBe(false);
  });
});
