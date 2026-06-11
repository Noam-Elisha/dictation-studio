import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test, eq, ok } from './harness.mjs';
import { parseKern } from '../kern-parser.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const chor001 = readFileSync(path.join(dir, 'fixtures', 'chor001.krn'), 'utf8');

const S = 0, A = 1, T = 2, B = 3;

function mini(rows) {
  // build a small 4-spine kern file: rows of [bass, tenor, alto, soprano]
  const head = [
    '**kern\t**kern\t**kern\t**kern',
    '*Ibass\t*Itenor\t*Ialto\t*Isoprn',
    '*clefF4\t*clefGv2\t*clefG2\t*clefG2',
    '*k[]\t*k[]\t*k[]\t*k[]',
    '*C:\t*C:\t*C:\t*C:',
    '*M4/4\t*M4/4\t*M4/4\t*M4/4',
  ];
  const tail = ['*-\t*-\t*-\t*-'];
  return head.concat(rows.map((r) => r.join('\t')), tail).join('\n');
}

suite('kern parser: chor001', () => {
  const c = parseKern(chor001, 'chor001');

  test('metadata', () => {
    eq(c.id, 'chor001');
    eq(c.bwv, '269');
    eq(c.title, 'From the Depths of My Heart');
    eq(c.key, { tonic: { step: 4, alter: 0 }, mode: 'major' });
    eq([c.num, c.den], [3, 4]);
  });

  test('pickup and measure length', () => {
    eq(c.mlen, 144);
    eq(c.pickup, 48);
  });

  test('voice order is S,A,T,B with correct first notes', () => {
    const first = c.voices.map((v) => v[0]);
    eq(first[S], { step: 4, alter: 0, oct: 4, dur: 48, tick: 0, flags: 0 }); // g4
    eq(first[B], { step: 4, alter: 0, oct: 2, dur: 48, tick: 0, flags: 0 }); // G2
    eq(first[A], { step: 1, alter: 0, oct: 4, dur: 48, tick: 0, flags: 0 }); // d4
    eq(first[T], { step: 6, alter: 0, oct: 3, dur: 48, tick: 0, flags: 0 }); // B3
  });

  test('soprano measure 1: half + quarter after pickup', () => {
    eq(c.voices[S][1], { step: 4, alter: 0, oct: 4, dur: 96, tick: 48, flags: 0 }); // 2g
    eq(c.voices[S][2], { step: 1, alter: 0, oct: 5, dur: 48, tick: 144, flags: 0 }); // 4dd
  });

  test('dotted rhythm and accidental spelling', () => {
    // m2 soprano: 4.b 8a 4g -> dotted quarter b4
    eq(c.voices[S][3].dur, 72);
    // tenor m3 has f# spelled as sharp (alter +1) somewhere in alto m3
    const fSharps = c.voices[A].filter((n) => n.step === 3 && n.alter === 1);
    ok(fSharps.length > 0, 'alto contains f#');
  });

  test('fermatas at first phrase end (m4) in all voices', () => {
    for (const v of c.voices) {
      const f = v.find((n) => n.flags & 4);
      ok(f, 'voice has a fermata');
      eq(f.tick, 48 + 3 * 144, 'fermata chord starts at downbeat of m4');
      eq(f.dur, 96);
    }
  });

  test('voices align in total duration', () => {
    const totals = c.voices.map((v) => v.reduce((s, n) => s + n.dur, 0));
    eq(totals[0], totals[1]);
    eq(totals[0], totals[2]);
    eq(totals[0], totals[3]);
  });

  test('beam letters are not part of pitch', () => {
    for (const v of c.voices) for (const n of v) ok(n.step >= 0 && n.step <= 6, 'valid step');
  });
});

suite('kern parser: token details', () => {
  test('ties set flags on start and end', () => {
    const c = parseKern(
      mini([
        ['[2C', '[2c', '[2e', '[2g'],
        ['2C]', '2c]', '2e]', '2g]'],
      ]),
      'ties'
    );
    eq(c.voices[S][0].flags & 1, 1, 'tieStart');
    eq(c.voices[S][1].flags & 2, 2, 'tieEnd');
    eq(c.voices[S][0].tick, 0);
    eq(c.voices[S][1].tick, 96);
  });

  test('rests parse with step -1', () => {
    const c = parseKern(mini([['2C', '2c', '2e', '2r'], ['2C', '2c', '2e', '2g']]), 'rest');
    eq(c.voices[S][0].step, -1);
    eq(c.voices[S][0].dur, 96);
  });

  test('triplet durations are exact ticks', () => {
    const c = parseKern(
      mini([
        ['2C', '2c', '2e', '12g'],
        ['.', '.', '.', '12a'],
        ['.', '.', '.', '12b'],
        ['2C', '2c', '2e', '4g'],
        ['.', '.', '.', '2g'],
      ]),
      'triplet'
    );
    eq(c.voices[S][0].dur, 16);
    eq(c.voices[S][2].tick, 32);
  });

  test('flats and naturals (kern uses - for flat)', () => {
    const c = parseKern(mini([['2C', '2c', '2e-', '2b-'], ['2C', '2c', '2en', '2bn']]), 'flats');
    eq(c.voices[A][0].alter, -1);
    eq(c.voices[A][1].alter, 0);
    eq(c.voices[S][0], { step: 6, alter: -1, oct: 4, dur: 96, tick: 0, flags: 0 });
  });

  test('duration mismatch across spines rejects the chorale', () => {
    let err = null;
    try {
      parseKern(mini([['2C', '2c', '2e', '4g'], ['=1', '=1', '=1', '=1'], ['1C', '1c', '1e', '1g']]), 'bad');
    } catch (e) {
      err = e;
    }
    ok(err, 'expected rejection');
  });

  test('spine split rejects', () => {
    let err = null;
    try {
      parseKern(mini([['*^', '*', '*', '*'], ['2C\t2E', '2c', '2e', '2g']]), 'split');
    } catch (e) {
      err = e;
    }
    ok(err, 'expected rejection');
  });

  test('modal key designations parse (dorian -> tonal minor)', () => {
    const src = mini([['2C', '2c', '2e', '2g'], ['2C', '2c', '2e', '2g']]).replace(
      '*C:\t*C:\t*C:\t*C:',
      '*a:dor\t*a:dor\t*a:dor\t*a:dor'
    );
    const c = parseKern(src, 'modal');
    eq(c.key, { tonic: { step: 5, alter: 0 }, mode: 'minor' });
    eq(c.modal, 'dor');
  });

  test('grace note rejects', () => {
    let err = null;
    try {
      parseKern(mini([['2C', '2c', '2e', 'gq'], ['2C', '2c', '2e', '2g']]), 'grace');
    } catch (e) {
      err = e;
    }
    ok(err, 'expected rejection');
  });
});
