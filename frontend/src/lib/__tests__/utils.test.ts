import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn', () => {
  it('deve combinar classes CSS', () => {
    const result = cn('class1', 'class2');
    expect(result).toContain('class1');
    expect(result).toContain('class2');
  });

  it('deve mesclar classes do Tailwind corretamente', () => {
    const result = cn('p-4', 'p-2');
    // Tailwind merge deve manter apenas p-2 (última classe)
    expect(result).toBe('p-2');
  });

  it('deve lidar com classes condicionais', () => {
    const isActive = true;
    const result = cn('base-class', isActive && 'active-class');
    expect(result).toContain('base-class');
    expect(result).toContain('active-class');
  });

  it('deve lidar com arrays de classes', () => {
    const result = cn(['class1', 'class2'], 'class3');
    expect(result).toContain('class1');
    expect(result).toContain('class2');
    expect(result).toContain('class3');
  });

  it('deve remover valores falsy', () => {
    const result = cn('class1', false && 'class2', null, undefined, 'class3');
    expect(result).not.toContain('false');
    expect(result).not.toContain('null');
    expect(result).not.toContain('undefined');
    expect(result).toContain('class1');
    expect(result).toContain('class3');
  });
});

