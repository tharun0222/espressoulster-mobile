import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyCompliments} from '../lib/daily-compliments.ts';
import {birthdayWishes} from '../lib/birthday-wishes.ts';
import {cafeDay, dailyGreeting, nextCafeDay} from '../lib/daily-greeting.ts';

const today = cafeDay(Date.parse('2026-11-19T12:00:00+05:30'));

test('each audience receives all 50 approved greetings without repeats during a cycle', () => {
  for (const gender of ['male', 'female']) {
    const lines = Array.from({length: 50}, (_, offset) => dailyGreeting(gender, today + offset, 'customer-123'));
    assert.equal(new Set(lines).size, 50);
    assert.deepEqual(new Set(lines), new Set(dailyCompliments[gender]));
    assert.equal(dailyGreeting(gender, today + 50, 'customer-123'), lines[0]);
  }
});

test('greeting is stable within the Bengaluru day and changes at local midnight', () => {
  const before = Date.parse('2026-11-19T23:59:59.999+05:30');
  const after = Date.parse('2026-11-20T00:00:00.000+05:30');
  assert.equal(nextCafeDay(before), after);
  for (const gender of ['male', 'female', undefined]) {
    assert.equal(dailyGreeting(gender, cafeDay(before), 'customer-123'), dailyGreeting(gender, today, 'customer-123'));
    assert.notEqual(dailyGreeting(gender, cafeDay(before), 'customer-123'), dailyGreeting(gender, cafeDay(after), 'customer-123'));
  }
});

test('user identity offsets the daily rotation consistently', () => {
  for (const gender of ['male', 'female']) {
    const first = dailyGreeting(gender, today, 'customer-123');
    assert.equal(first, dailyGreeting(gender, today, 'customer-123'));
    assert.notEqual(first, dailyGreeting(gender, today, 'customer-124'));
  }
});

test('missing, skipped or unrecognised gender receives the neutral rotation', () => {
  const neutral = dailyGreeting(undefined, today, 'customer-123');
  for (const gender of ['', null, 'undisclosed', 'nonbinary', 'unknown']) {
    assert.equal(dailyGreeting(gender, today, 'customer-123'), neutral);
  }
  assert.ok(!Object.values(dailyCompliments).flat().includes(neutral));
});

test('existing birthday wishes take priority only on the birthday', () => {
  for (const gender of ['male', 'female', undefined]) {
    const birthday = dailyGreeting(gender, today, 'customer-123', '1995-11-19');
    assert.equal(birthday, dailyGreeting(gender, cafeDay(Date.parse('2026-11-19T23:59:59+05:30')), 'customer-123', '1995-11-19'));
    assert.equal(dailyGreeting(gender, today + 1, 'customer-123', '1995-11-19'), dailyGreeting(gender, today + 1, 'customer-123'));
    assert.notEqual(birthday, dailyGreeting(gender, today, 'customer-123'));
  }
});

test('both birthday collections contain 50 distinct approved wishes', () => {
  for (const gender of ['male', 'female']) {
    assert.equal(birthdayWishes[gender].length, 50);
    assert.equal(new Set(birthdayWishes[gender]).size, 50);
    const selected = Array.from({length: 50}, (_, offset) => dailyGreeting(
      gender, cafeDay(Date.parse(`${2026 + offset}-11-19T12:00:00+05:30`)), 'customer-123', '1995-11-19',
    ));
    assert.deepEqual(new Set(selected), new Set(birthdayWishes[gender]));
  }
});

test('a birthday wish stays identical through the entire local birthday', () => {
  for (const gender of ['male', 'female', 'undisclosed']) {
    const wishes = ['00:00:00', '06:00:00', '12:30:00', '23:59:59.999'].map(time => dailyGreeting(
      gender, cafeDay(Date.parse(`2026-11-19T${time}+05:30`)), 'customer-123', '1995-11-19',
    ));
    assert.equal(new Set(wishes).size, 1);
  }
});

test('normal greeting returns precisely at midnight after a year-end birthday', () => {
  const midnight = Date.parse('2027-01-01T00:00:00+05:30');
  for (const gender of ['male', 'female', 'undisclosed']) {
    const lastWish = dailyGreeting(gender, cafeDay(midnight - 1), 'customer-123', '1995-12-31');
    const firstGreeting = dailyGreeting(gender, cafeDay(midnight), 'customer-123', '1995-12-31');
    assert.notEqual(lastWish, firstGreeting);
    assert.equal(firstGreeting, dailyGreeting(gender, cafeDay(midnight), 'customer-123'));
    assert.equal(nextCafeDay(midnight - 1), midnight);
  }
});

test('skipped gender keeps the birthday wish neutral', () => {
  for (const gender of ['', undefined, null, 'undisclosed']) {
    assert.equal(dailyGreeting(gender, today, 'customer-123', '1995-11-19'), 'Happy birthday! Enjoy your day.');
  }
});
