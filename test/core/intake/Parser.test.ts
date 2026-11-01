import { describe, it, expect } from 'vitest';
import { LEGACY_DRIVE_FILENAME_PATTERNS } from '../../../src/core/intake/Parser';
import { padSubmittalNumber } from '../../../src/core/intake/DocumentPipeline';

describe('Parser - ArchitectureStandard pattern & padSubmittalNumber', () => {
  const archPattern = LEGACY_DRIVE_FILENAME_PATTERNS.find(p => p.id === 'ArchitectureStandard');

  it('padSubmittalNumber pads numeric strings with leading zeros to 3 digits', () => {
    expect(padSubmittalNumber('1')).toBe('001');
    expect(padSubmittalNumber('12')).toBe('012');
    expect(padSubmittalNumber('123')).toBe('123');
    expect(padSubmittalNumber('1234')).toBe('1234');
    expect(padSubmittalNumber('A')).toBe('A');
    expect(padSubmittalNumber('')).toBe('');
  });

  it('pads single-digit submittal number in legacy Architecture filename pattern', () => {
    expect(archPattern).toBeDefined();
    const filename = '033000-1-01 Foundation Walls - 240501.pdf';
    const match = filename.match(archPattern!.regex);
    expect(match).not.toBeNull();

    const data = archPattern!.extract(match!) as any;
    expect(data.discipline).toBe('Architecture');
    expect(data.section).toBe('033000');
    expect(data.number).toBe('001');
    expect(data.revision).toBe('01');
    expect(data.title).toBe('Foundation Walls');
    expect(data.date).toBe('240501');
  });

  it('preserves already padded submittal number', () => {
    const filename = '081100-002-A Steel Doors - 240502.pdf';
    const match = filename.match(archPattern!.regex);
    expect(match).not.toBeNull();

    const data = archPattern!.extract(match!) as any;
    expect(data.section).toBe('081100');
    expect(data.number).toBe('002');
  });
});
