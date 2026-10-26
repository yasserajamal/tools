const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_CONFIG, scaled, classify, MoodEngine } = require('../mood-engine.js');

function events(gaps, { start = 10, categories } = {}) {
  const times = [start];
  for (const g of gaps) times.push(times[times.length - 1] + g);
  return times.map((time, i) => ({ time, category: categories ? categories[i] : 'letter' }));
}
const rep = (v, n) => Array(n).fill(v);
const run = (ev, prior = null, config = DEFAULT_CONFIG) => classify(ev, prior, ev[ev.length - 1].time, config);

test('goose on backspaces', () => {
  const cats = rep('letter', 12);
  for (const i of [1, 3, 5, 7, 9]) cats[i] = 'backspace';
  assert.equal(run(events(rep(0.2, 11), { categories: cats }), 9.9).mood, 'goose');
});
test('goose on uppercase', () => {
  const cats = ['letterUppercase', 'letterUppercase', 'letterUppercase', 'letterUppercase', 'letter'];
  assert.equal(run(events(rep(0.3, 4), { categories: cats }), 9.9).mood, 'goose');
});
test('goose needs four keys', () => {
  assert.notEqual(run(events([0.2, 0.2], { categories: rep('backspace', 3) }), 9.9).mood, 'goose');
});
test('goose outranks cat', () => {
  assert.equal(run(events(rep(0.1, 4), { categories: rep('backspace', 5) })).mood, 'goose');
});
test('goose only looks at last twelve keys', () => {
  const cats = [...rep('backspace', 5), ...rep('letter', 12)];
  assert.notEqual(run(events(rep(0.3, 16), { categories: cats }), 9.9).mood, 'goose');
});
test('cat burst after pause', () => assert.equal(run(events(rep(0.15, 4)), 5).mood, 'cat'));
test('cat burst after pause inside window', () => assert.equal(run(events([3.0, 0.15, 0.15, 0.15])).mood, 'cat'));
test('cat needs pause', () => assert.equal(run(events(rep(0.1, 19)), 9.0).mood, 'mouse'));
test('cat needs quick gaps', () => assert.notEqual(run(events(rep(0.4, 3)), 5).mood, 'cat'));
test('cat needs three keys', () => assert.notEqual(run(events([0.1]), 5).mood, 'cat'));
test('cat capped at 25 keys', () => assert.equal(run(events(rep(0.1, 29)), 5).mood, 'mouse'));
test('mouse when fast', () => assert.equal(run(events(rep(0.1, 29)), 9.95).mood, 'mouse'));
test('wizard when slow', () => assert.equal(run(events([2, 2, 2]), 5).mood, 'wizard'));
test('robot when steady', () => {
  const r = run(events(rep(0.25, 19)), 9.75);
  assert.equal(r.mood, 'robot');
  assert.equal(r.reason, 'Steady rhythm');
});
test('robot fallback', () => {
  const gaps = Array.from({ length: 11 }, (_, i) => (i % 2 === 0 ? 0.18 : 0.42));
  const r = run(events(gaps), 9.8);
  assert.equal(r.mood, 'robot');
  assert.equal(r.reason, 'Settling into a groove');
});
test('owl on long gap', () => {
  assert.equal(run(events([0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.1]), 9.9).mood, 'owl');
});
test('owl on uneven rhythm without long gap', () => {
  const gaps = Array.from({ length: 9 }, (_, i) => (i % 2 === 0 ? 0.05 : 0.65));
  const r = run(events(gaps), 9.9);
  assert.equal(r.mood, 'owl');
  assert.equal(r.reason, 'Uneven rhythm');
});
test('high sensitivity lowers goose threshold', () => {
  const ev = events(rep(0.3, 3), { categories: ['letter', 'backspace', 'letter', 'letter'] });
  assert.notEqual(run(ev, 9.9).mood, 'goose');
  assert.equal(run(ev, 9.9, scaled(DEFAULT_CONFIG, 'high')).mood, 'goose');
});
test('low sensitivity raises mouse threshold', () => {
  const ev = events(rep(1 / 7, 20));
  assert.equal(run(ev, 9.9).mood, 'mouse');
  assert.notEqual(run(ev, 9.9, scaled(DEFAULT_CONFIG, 'low')).mood, 'mouse');
});

test('engine starts as robot', () => assert.equal(new MoodEngine().mood, 'robot'));
test('new mood must win for hysteresis period', () => {
  const e = new MoodEngine();
  assert.equal(e.record('letter', 0).didSwitch, false);
  assert.equal(e.record('letter', 2).didSwitch, false);
  const at4 = e.record('letter', 4);
  assert.equal(at4.didSwitch, false);
  assert.equal(at4.mood, 'robot');
  const at6 = e.record('letter', 6);
  assert.equal(at6.didSwitch, true);
  assert.equal(at6.mood, 'wizard');
  assert.equal(e.record('letter', 8).didSwitch, false);
});
test('candidate resets when another character wins', () => {
  const e = new MoodEngine();
  e.record('letter', 0); e.record('letter', 2); e.record('letter', 4); e.record('letter', 4.1);
  const u = e.record('letter', 4.2);
  assert.equal(u.didSwitch, false);
  assert.equal(u.mood, 'robot');
});
test('goose switches immediately', () => {
  const e = new MoodEngine();
  for (let i = 0; i < 3; i++) assert.equal(e.record('backspace', i * 0.1).didSwitch, false);
  const u = e.record('backspace', 0.3);
  assert.equal(u.didSwitch, true);
  assert.equal(u.mood, 'goose');
});
test('burst start flag', () => {
  const e = new MoodEngine();
  assert.equal(e.record('letter', 0).isBurstStart, true);
  assert.equal(e.record('letter', 0.5).isBurstStart, false);
  assert.equal(e.record('letter', 1.6).isBurstStart, true);
});

test('currentWPM measures the rolling window and excludes backspaces', () => {
  const e = new MoodEngine();
  for (let i = 0; i < 7; i++) e.record('letter', i * 0.5);            // 7 keys over 3s
  assert.equal(Math.round(e.currentWPM(3)), 28);                        // 7 / 3 * 12
  e.record('backspace', 3.1);
  assert.equal(Math.round(e.currentWPM(3.1)), 27);                      // 7 typed / 3.1s
  assert.equal(e.currentWPM(60), 0);                                    // everything aged out
  assert.equal(new MoodEngine().currentWPM(5), 0);
});
