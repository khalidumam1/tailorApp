import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessibleTextColor,
  applicationBrandingSchema,
  DEFAULT_APPLICATION_BRANDING,
} from '../shared/src/index.js';

function branding(overrides: Record<string, unknown> = {}) {
  return { ...DEFAULT_APPLICATION_BRANDING, ...overrides };
}

test('application branding defaults satisfy the shared contract', () => {
  assert.deepEqual(applicationBrandingSchema.parse(DEFAULT_APPLICATION_BRANDING), DEFAULT_APPLICATION_BRANDING);
});

test('application branding accepts HTTPS and same-origin image assets but rejects unsafe URLs', () => {
  assert.equal(applicationBrandingSchema.safeParse(branding({ logoUrl: 'https://cdn.example.com/brand.svg' })).success, true);
  assert.equal(applicationBrandingSchema.safeParse(branding({ logoUrl: '/assets/brand.svg' })).success, true);
  assert.equal(applicationBrandingSchema.safeParse(branding({ logoUrl: 'http://cdn.example.com/brand.svg' })).success, false);
  assert.equal(applicationBrandingSchema.safeParse(branding({ logoUrl: '//cdn.example.com/brand.svg' })).success, false);
  assert.equal(applicationBrandingSchema.safeParse(branding({ supportUrl: 'javascript:alert(1)' })).success, false);
});

test('application branding rejects invalid colors, emails, and unknown fields', () => {
  assert.equal(applicationBrandingSchema.safeParse(branding({ primaryColor: 'green' })).success, false);
  assert.equal(applicationBrandingSchema.safeParse(branding({ supportEmail: 'not-an-email' })).success, false);
  assert.equal(applicationBrandingSchema.safeParse(branding({ injected: true })).success, false);
});

test('configured brand text chooses the higher-contrast foreground', () => {
  assert.equal(accessibleTextColor('#117a5c'), '#ffffff');
  assert.equal(accessibleTextColor('#f5d76e'), '#0e1a16');
});
