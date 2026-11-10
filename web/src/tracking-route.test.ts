import { describe, expect, it } from 'vitest';
import { parseTrackingRoute } from './tracking-route';

describe('parseTrackingRoute', () => {
  it('opens the customer page for a tracking path', () => {
    expect(parseTrackingRoute('/track/abc123')).toEqual({ isTracking: true, token: 'abc123' });
  });

  it('opens the customer page without a token for the bare path', () => {
    expect(parseTrackingRoute('/track')).toEqual({ isTracking: true, token: '' });
  });

  it('decodes an escaped token', () => {
    expect(parseTrackingRoute('/track/a%2Fb')).toEqual({ isTracking: true, token: 'a/b' });
  });

  it('keeps the customer page usable when the escape is malformed', () => {
    expect(parseTrackingRoute('/track/%E0%A4%A')).toEqual({ isTracking: true, token: null });
  });

  it('leaves every other path on the workspace', () => {
    expect(parseTrackingRoute('/')).toEqual({ isTracking: false, token: null });
    expect(parseTrackingRoute('/orders')).toEqual({ isTracking: false, token: null });
    expect(parseTrackingRoute('/tracking/abc123')).toEqual({ isTracking: false, token: null });
  });
});
