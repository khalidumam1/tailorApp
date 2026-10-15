import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessibleTextColor,
  applicationBrandingSchema,
  BRAND_LOGO_PRESETS,
  BRAND_LOGO_SHAPES,
  brandInitials,
  buildConfigurableLogoUrl,
  configurableLogoDataUri,
  DEFAULT_APPLICATION_BRANDING,
  parseConfigurableLogoUrl,
  renderConfigurableLogoSvg,
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

test('configurable logo URLs round-trip and pass applicationBrandingSchema validation', () => {
  const logoUrl = buildConfigurableLogoUrl({
    style: 'crest',
    shape: 'shield',
    monogram: 'KSH',
    primaryColor: '#1e3a8a',
    accentColor: '#d97706',
    showStitchRing: true,
  });
  assert.equal(applicationBrandingSchema.safeParse(branding({ logoUrl, faviconUrl: logoUrl })).success, true);

  const parsed = parseConfigurableLogoUrl(logoUrl, { fallbackName: 'Karachi Stitch House' });
  assert.equal(parsed.isConfigurablePreset, true);
  assert.equal(parsed.style, 'crest');
  assert.equal(parsed.shape, 'shield');
  assert.equal(parsed.monogram, 'KSH');
  assert.equal(parsed.primaryColor, '#1e3a8a');
  assert.equal(parsed.accentColor, '#d97706');
  assert.equal(parsed.showStitchRing, true);
});

test('parseConfigurableLogoUrl distinguishes external custom URLs from configurable presets', () => {
  const external = parseConfigurableLogoUrl('https://cdn.example.com/custom-logo.png', {
    fallbackName: 'Atelier Lahore',
  });
  assert.equal(external.isConfigurablePreset, false);
  assert.equal(external.monogram, 'AL');

  const empty = parseConfigurableLogoUrl('', {
    fallbackName: 'TailorApp',
    primaryColor: '#117a5c',
    accentColor: '#c08a33',
  });
  assert.equal(empty.isConfigurablePreset, true);
  assert.equal(empty.style, 'shears');
  assert.equal(empty.monogram, 'TA');
});

test('renderConfigurableLogoSvg generates valid SVG for every preset style and badge shape', () => {
  for (const preset of BRAND_LOGO_PRESETS) {
    for (const shape of BRAND_LOGO_SHAPES) {
      const svg = renderConfigurableLogoSvg({
        style: preset.key,
        shape: shape.key,
        monogram: brandInitials('Karachi Tailor Studio'),
        primaryColor: '#117a5c',
        accentColor: '#c08a33',
        showStitchRing: true,
      }, 'Karachi Tailor Studio');
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"/);
      assert.match(svg, /<\/svg>$/);
    }
  }
  const dataUri = configurableLogoDataUri({ style: 'monogram', monogram: 'KT' }, 'Karachi Tailors');
  assert.match(dataUri, /^data:image\/svg\+xml;utf8,/);
});

