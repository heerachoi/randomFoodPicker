import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, eligibleRestaurants, normalizeState, restoreState, validateState, encodeShare, decodeShare, randomIndex } from '../lib.js';

const restaurants = [
  { id: 'a', name: '중식당', category: '중식' },
  { id: 'b', name: '버거집', category: '햄버거' },
  { id: 'c', name: '다른 중식당', category: '중식' },
];
const state = () => ({ version: 2, day: '2026-11-03', restaurants: structuredClone(restaurants), excluded: ['중식'] });

test('category choices exclude every restaurant in selected categories', () => {
  assert.deepEqual(eligibleRestaurants(restaurants, ['중식']).map(r => r.name), ['버거집']);
  assert.equal(eligibleRestaurants(restaurants, []).length, 3);
  assert.equal(eligibleRestaurants(restaurants, ['중식', '햄버거']).length, 0);
  assert.equal(eligibleRestaurants([], ['중식']).length, 0);
});

test('daily selections use the Korean calendar date and clear only exclusions', () => {
  assert.equal(dayKey(new Date('2026-11-02T14:59:59Z')), '2026-11-02');
  assert.equal(dayKey(new Date('2026-11-02T15:00:00Z')), '2026-11-03');
  const restored = restoreState(state(), restaurants, '2026-11-04');
  assert.deepEqual(restored.excluded, []);
  assert.deepEqual(restored.restaurants, restaurants);
});

test('Korean restaurant names and category choices survive URL-safe sharing', () => {
  const original = state(); original.restaurants[0].name = '맛있는 중식당 🥟';
  const encoded = encodeShare(original);
  assert.match(encoded, /^[a-zA-Z0-9_-]+$/);
  assert.deepEqual(decodeShare(encoded), original);
});

test('legacy shared links migrate exclusions and discard names and restaurant URLs', () => {
  const legacy = { version: 1, day: '2026-11-03', restaurants: structuredClone(restaurants), participants: [
    { id: 'a', name: '희라', excluded: ['중식'] },
    { id: 'b', name: '동료', excluded: ['중식', '햄버거'] },
  ] };
  legacy.restaurants[0].url = 'https://example.com/old-restaurant';
  const expected = { ...state(), excluded: ['중식', '햄버거'] };
  assert.equal(validateState(legacy), true);
  assert.deepEqual(normalizeState(legacy), expected);
  const bytes = new TextEncoder().encode(JSON.stringify(legacy));
  const oldLink = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  assert.deepEqual(decodeShare(oldLink), expected);
  assert.deepEqual(decodeShare(encodeShare(legacy)), expected);
});

test('default list updates preserve local additions and deletions and change categories', () => {
  const saved = state();
  saved.baseline = structuredClone(restaurants);
  saved.restaurants = [restaurants[0], restaurants[1], { id: 'local', name: '내 맛집', category: '한식' }];
  const defaults = [{ ...restaurants[0], category: '한식' }, restaurants[1], restaurants[2], { id: 'new', name: '새 맛집', category: '초밥' }];
  const restored = restoreState(saved, defaults, saved.day);
  assert.deepEqual(restored.restaurants.map(r => r.id), ['a', 'b', 'local', 'new']);
  assert.equal(restored.restaurants[0].category, '한식');
  assert.deepEqual(restored.excluded, []);
});

test('shared data rejects invalid restaurants, exclusions and duplicate identities', () => {
  const invalid = state(); invalid.restaurants[0].category = '';
  assert.equal(validateState(invalid), false);
  assert.throws(() => encodeShare(invalid));
  const duplicate = state(); duplicate.restaurants.push(duplicate.restaurants[0]);
  assert.equal(validateState(duplicate), false);
  const invalidChoice = state(); invalidChoice.excluded = [123];
  assert.equal(validateState(invalidChoice), false);
  assert.throws(() => decodeShare('bad link'));
  assert.throws(() => decodeShare('x'.repeat(100001)));
});

test('empty lists remain valid for sharing and show no candidates', () => {
  const empty = state(); empty.restaurants = []; empty.excluded = [];
  assert.deepEqual(decodeShare(encodeShare(empty)), empty);
});

test('random draw rejects modulo bias and supports a single candidate', () => {
  const values = [0xffffffff, 4];
  assert.equal(randomIndex(3, array => { array[0] = values.shift(); }), 1);
  assert.equal(values.length, 0);
  assert.equal(randomIndex(1, array => { array[0] = 99; }), 0);
  assert.throws(() => randomIndex(0));
  assert.throws(() => randomIndex(101));
});
