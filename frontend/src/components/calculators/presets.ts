/**
 * Industry presets (PAI-9 §6). One-click fill of typical defaults across
 * all four calculators. Stored shape is deliberately loose — each calc
 * pulls only the keys it cares about.
 */

export type PresetKey = 'saas' | 'd2c' | 'marketplace';

interface CACPaybackDefaults {
  cac: string;
  arpu: string;
  margin: string;
}

interface ROASDefaults {
  roas: string;
  cogs: string;
  fixed: string;
}

interface SampleSizeDefaults {
  baseline: string;
  mde: string;
}

interface BlendedRow {
  name: string;
  spend: string;
  conversions: string;
}

export interface Preset {
  label: string;
  description: string;
  cacPayback: CACPaybackDefaults;
  roasMargin: ROASDefaults;
  sampleSize: SampleSizeDefaults;
  blended: BlendedRow[];
}

export const PRESETS: Record<PresetKey, Preset> = {
  saas: {
    label: 'SaaS',
    description: 'Subscription software — high margin, low ARPU, longer payback tolerated.',
    cacPayback: { cac: '600', arpu: '50', margin: '80' },
    roasMargin: { roas: '3.0', cogs: '15', fixed: '20' },
    sampleSize: { baseline: '4.5', mde: '10' },
    blended: [
      { name: 'Google', spend: '25000', conversions: '120' },
      { name: 'LinkedIn', spend: '12000', conversions: '40' },
      { name: 'Content', spend: '8000', conversions: '60' },
    ],
  },
  d2c: {
    label: 'D2C',
    description: 'Direct-to-consumer brand — physical COGS, fast payback expectation.',
    cacPayback: { cac: '45', arpu: '60', margin: '40' },
    roasMargin: { roas: '2.5', cogs: '40', fixed: '15' },
    sampleSize: { baseline: '2.5', mde: '15' },
    blended: [
      { name: 'Meta', spend: '20000', conversions: '400' },
      { name: 'Google', spend: '10000', conversions: '180' },
      { name: 'TikTok', spend: '8000', conversions: '120' },
    ],
  },
  marketplace: {
    label: 'Marketplace',
    description: 'Two-sided marketplace — take-rate model, supply + demand acquisition.',
    cacPayback: { cac: '90', arpu: '15', margin: '70' },
    roasMargin: { roas: '2.2', cogs: '50', fixed: '20' },
    sampleSize: { baseline: '8.0', mde: '8' },
    blended: [
      { name: 'Google', spend: '40000', conversions: '600' },
      { name: 'Meta', spend: '15000', conversions: '200' },
      { name: 'Referrals', spend: '5000', conversions: '160' },
    ],
  },
};

export const PRESET_KEYS: PresetKey[] = ['saas', 'd2c', 'marketplace'];
