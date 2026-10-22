// Frozen AI readings for the analysis tests: what AiProvider.readAnalysis returns for a report.
import type { AnalysisResponse } from '../../src/ai/anthropic'

/** A complete hösilage analysis, with a horse energy value and a ruminant-only protein to convert. */
export const READING: AnalysisResponse = {
  arAnalys: true,
  typ: 'hosilage',
  labb: 'Labb A',
  provdatum: '2026-06-10',
  tsProcent: 39.7,
  askaGPerKgTs: 71,
  perKgTs: {
    energi: 10.2,
    energiIdisslare: null,
    smbRp: null,
    raprotein: 150,
    ca: 5.3,
    p: 2.66,
    mg: 1.71,
    na: 0.83,
    fe: 180,
    mn: 58,
    cu: 6,
    zn: 32,
    co: null,
    jod: null,
    se: 0.03,
    socker: 61,
    starkelse: null,
  },
  anmarkningar: ['Selen svårläst'],
}

/** The smallest file of each accepted type: its magic bytes and a little more. */
export const PDF = new TextEncoder().encode('%PDF-1.4\n% a test report\n')
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
export const WEBP = new Uint8Array([
  ...new TextEncoder().encode('RIFF'),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode('WEBP'),
])
