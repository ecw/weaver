import { describe, expect, it } from 'vitest';
import { MipModelBuilder } from '../../../../src/solvers/mip/mipModel.js';
import { writeLpFormat } from '../../../../src/solvers/mip/lpFormatWriter.js';

describe('writeLpFormat', () => {
  it('serializes a simple maximize model to CPLEX LP text', () => {
    const model = new MipModelBuilder();
    model.addBinaryVar('x1');
    model.addBinaryVar('x2');
    model.addToObjective('x1', 3);
    model.addToObjective('x2', 1);
    model.addConstraint(
      [
        { varName: 'x1', coef: 1 },
        { varName: 'x2', coef: 1 },
      ],
      '<=',
      1,
      'fulfill_r1',
    );

    const lp = writeLpFormat(model.build());
    expect(lp).toBe(
      ['Maximize', ' obj: 3 x1 + x2', 'Subject To', ' fulfill_r1: x1 + x2 <= 1', 'Binaries', ' x1 x2', 'End'].join(
        '\n',
      ),
    );
  });

  it('formats negative coefficients and equality constraints correctly', () => {
    const model = new MipModelBuilder();
    model.addBinaryVar('x1');
    model.addBinaryVar('x2');
    model.addConstraint(
      [
        { varName: 'x1', coef: 1 },
        { varName: 'x2', coef: -1 },
      ],
      '=',
      0,
      'link',
    );

    const lp = writeLpFormat(model.build());
    expect(lp).toContain('link: x1 - x2 = 0');
  });

  it('sanitizes constraint labels containing characters LP format disallows', () => {
    const model = new MipModelBuilder();
    model.addBinaryVar('x1');
    model.addConstraint([{ varName: 'x1', coef: 1 }], '<=', 1, 'cap_BIO-101-A');

    const lp = writeLpFormat(model.build());
    expect(lp).toContain('cap_BIO_101_A: x1 <= 1');
    expect(lp).not.toContain('BIO-101-A');
  });

  it('emits a "0" objective when there are no objective terms', () => {
    const model = new MipModelBuilder();
    model.addBinaryVar('x1');
    model.addConstraint([{ varName: 'x1', coef: 1 }], '<=', 1);

    const lp = writeLpFormat(model.build());
    expect(lp).toContain('obj: 0');
  });

  it('omits the Bounds/Binaries sections when there are no variables of that kind', () => {
    const model = new MipModelBuilder();
    model.addBinaryVar('x1');
    model.addConstraint([{ varName: 'x1', coef: 1 }], '<=', 1);
    const lp = writeLpFormat(model.build());
    expect(lp).not.toContain('Bounds');
    expect(lp).toContain('Binaries');
  });
});
