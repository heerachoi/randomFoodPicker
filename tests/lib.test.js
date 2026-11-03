import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RESTAURANTS } from '../restaurants.js';
import { dayKey, eligibleRestaurants, removeRestaurantLinks, validateState, encodeShare, decodeShare, randomIndex } from '../lib.js';

const state = () => ({ version: 1, day: '2026-11-03', restaurants: structuredClone(DEFAULT_RESTAURANTS), participants: [{ id: 'a', name: '희라', excluded: ['중식'] }] });

test('any participant vetoes a category for every restaurant in that category', () => {
  const restaurants = [...DEFAULT_RESTAURANTS, { id: 'another', name: '또 다른 중식집', category: '중식' }];
  const people = [{ excluded: ['중식'] }, { excluded: ['쌀국수'] }];
  assert.deepEqual(eligibleRestaurants(restaurants, people).map(r => r.name), ['파파이스']);
  assert.equal(eligibleRestaurants(restaurants, []).length, 4);
  assert.equal(eligibleRestaurants(restaurants, [...people, { excluded: ['햄버거'] }]).length, 0);
  assert.equal(eligibleRestaurants([], people).length, 0);
});

test('daily selections use the Korean calendar date at midnight', () => {
  assert.equal(dayKey(new Date('2026-11-02T14:59:59Z')), '2026-11-02');
  assert.equal(dayKey(new Date('2026-11-02T15:00:00Z')), '2026-11-03');
});

test('Korean names and emoji survive URL-safe sharing', () => {
  const original = state(); original.participants[0].name = '희라 🍚';
  const encoded = encodeShare(original);
  assert.match(encoded, /^[a-zA-Z0-9_-]+$/);
  assert.deepEqual(decodeShare(encoded), original);
});

test('legacy saved lists and shared links retain restaurants but discard URLs', () => {
  const legacy = state(); legacy.restaurants[0].url = 'https://example.com/old-restaurant';
  assert.equal(validateState(legacy), true);
  assert.deepEqual(removeRestaurantLinks(legacy), state());
  assert.deepEqual(decodeShare(encodeShare(legacy)), state());
  const bytes = new TextEncoder().encode(JSON.stringify(legacy));
  const oldLink = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  assert.deepEqual(decodeShare(oldLink), state());
});

test('shared data rejects invalid restaurants and duplicate identities', () => {
  const invalid = state(); invalid.restaurants[0].category = '';
  assert.equal(validateState(invalid), false);
  assert.throws(() => encodeShare(invalid));
  const duplicate = state(); duplicate.restaurants.push(duplicate.restaurants[0]);
  assert.equal(validateState(duplicate), false);
  const duplicatePerson = state(); duplicatePerson.participants.push(duplicatePerson.participants[0]);
  assert.equal(validateState(duplicatePerson), false);
  const huge = state(); huge.participants[0].name = '가'.repeat(21);
  assert.equal(validateState(huge), false);
  assert.throws(() => decodeShare('bad link'));
  assert.throws(() => decodeShare('x'.repeat(100001)));
});

test('empty lists remain valid for sharing and show no candidates', () => {
  const empty = state(); empty.restaurants = []; empty.participants = [];
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
