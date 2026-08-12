import { describe, expect, it } from 'vitest';
import { VariableIndex } from '../../../../src/solvers/mip/variableIndex.js';

describe('VariableIndex', () => {
  it('assigns a stable, unique variable name per (student, section) pair', () => {
    const vars = new VariableIndex();
    const name1 = vars.varName('s1', 'sec1');
    const name2 = vars.varName('s1', 'sec1');
    expect(name1).toBe(name2);
  });

  it('assigns distinct names for distinct pairs', () => {
    const vars = new VariableIndex();
    const a = vars.varName('s1', 'sec1');
    const b = vars.varName('s1', 'sec2');
    const c = vars.varName('s2', 'sec1');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('reports hasVar correctly before and after creation', () => {
    const vars = new VariableIndex();
    expect(vars.hasVar('s1', 'sec1')).toBe(false);
    vars.varName('s1', 'sec1');
    expect(vars.hasVar('s1', 'sec1')).toBe(true);
  });

  it('recovers the original (student, section) pair from a variable name', () => {
    const vars = new VariableIndex();
    const name = vars.varName('s1', 'sec1');
    expect(vars.pairFor(name)).toEqual({ studentId: 's1', sectionId: 'sec1' });
  });

  it('lists all sections a student has variables for', () => {
    const vars = new VariableIndex();
    vars.varName('s1', 'secA');
    vars.varName('s1', 'secB');
    vars.varName('s2', 'secA');
    expect(vars.sectionsForStudent('s1').sort()).toEqual(['secA', 'secB']);
    expect(vars.sectionsForStudent('s2')).toEqual(['secA']);
    expect(vars.sectionsForStudent('ghost')).toEqual([]);
  });

  it('lists all students that have any variable', () => {
    const vars = new VariableIndex();
    vars.varName('s1', 'secA');
    vars.varName('s2', 'secA');
    expect(vars.allStudentIds().sort()).toEqual(['s1', 's2']);
  });

  it('lists every variable name created', () => {
    const vars = new VariableIndex();
    const a = vars.varName('s1', 'secA');
    const b = vars.varName('s1', 'secB');
    expect(vars.allVarNames().sort()).toEqual([a, b].sort());
  });
});
