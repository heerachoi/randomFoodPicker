import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey,
  eligibleRestaurants,
  normalizeState,
  restoreState,
  validateState,
  encodeShare,
  decodeShare,
  randomIndex,
  restaurantCategories,
  isNewRestaurant,
  makeNickname,
  uniqueNickname,
  allExcluded,
} from '../lib.js';

const restaurants = [
  { id: 'a', name: '중식당', categories: ['중식'] },
  { id: 'b', name: '버거집', categories: ['햄버거'] },
  { id: 'c', name: '다른 중식당', categories: ['중식', '한식'] },
];
const categoryRecords = [
  { id: 'local:중식', name: '중식' },
  { id: 'local:햄버거', name: '햄버거' },
  { id: 'local:한식', name: '한식' },
];
const state = () => ({
  version: 4,
  day: '2026-11-03',
  categories: structuredClone(categoryRecords),
  restaurants: structuredClone(restaurants),
  participants: [{ id: 'me', nickname: '배고픈 김치찌개', excluded: ['중식'] }],
});

test('new badge applies only within three days of createdAt', () => {
  const now = new Date('2026-11-04T01:00:00Z');
  assert.equal(isNewRestaurant({ createdAt: '2026-11-03T12:00:00Z' }, now), true);
  assert.equal(isNewRestaurant({ createdAt: '2026-11-01T01:00:01Z' }, now), true);
  assert.equal(isNewRestaurant({ createdAt: '2026-11-01T01:00:00Z' }, now), false);
  assert.equal(isNewRestaurant({ createdAt: '2026-11-05T00:00:00Z' }, now), false);
  assert.equal(isNewRestaurant({}, now), false);
});

test('category choices exclude restaurants that include selected categories', () => {
  assert.deepEqual(eligibleRestaurants(restaurants, ['중식']).map(r => r.name), ['버거집']);
  assert.equal(eligibleRestaurants(restaurants, []).length, 3);
  assert.equal(eligibleRestaurants(restaurants, ['중식', '햄버거']).length, 0);
  assert.equal(eligibleRestaurants([], ['중식']).length, 0);
});

test('legacy single category field still works for eligibility', () => {
  const legacy = [{ id: 'x', name: '면집', category: '라멘' }];
  assert.deepEqual(restaurantCategories(legacy[0]), ['라멘']);
  assert.equal(eligibleRestaurants(legacy, ['라멘']).length, 0);
});

test('daily selections use the Korean calendar date and clear only exclusions', () => {
  assert.equal(dayKey(new Date('2026-11-02T14:59:59Z')), '2026-11-02');
  assert.equal(dayKey(new Date('2026-11-02T15:00:00Z')), '2026-11-03');
  const restored = restoreState(state(), restaurants, '2026-11-04');
  assert.deepEqual(restored.participants[0].excluded, []);
  assert.deepEqual(restored.restaurants, restaurants);
});

test('Korean restaurant names and category choices survive URL-safe sharing', () => {
  const original = state(); original.restaurants[0].name = '맛있는 중식당 🥟';
  const encoded = encodeShare(original);
  assert.match(encoded, /^[a-zA-Z0-9_-]+$/);
  assert.deepEqual(decodeShare(encoded), original);
});

test('legacy shared links migrate exclusions and discard names and restaurant URLs', () => {
  const legacy = { version: 1, day: '2026-11-03', restaurants: [
    { id: 'a', name: '중식당', category: '중식' },
    { id: 'b', name: '버거집', category: '햄버거' },
    { id: 'c', name: '다른 중식당', category: '중식' },
  ], participants: [
    { id: 'a', name: '희라', excluded: ['중식'] },
    { id: 'b', name: '동료', excluded: ['중식', '햄버거'] },
  ] };
  legacy.restaurants[0].url = 'https://example.com/old-restaurant';
  const expected = {
    version: 4,
    day: '2026-11-03',
    categories: [
      { id: 'local:중식', name: '중식' },
      { id: 'local:햄버거', name: '햄버거' },
    ],
    restaurants: [
      { id: 'a', name: '중식당', categories: ['중식'] },
      { id: 'b', name: '버거집', categories: ['햄버거'] },
      { id: 'c', name: '다른 중식당', categories: ['중식'] },
    ],
    participants: [
      { id: 'a', nickname: '희라', excluded: ['중식'] },
      { id: 'b', nickname: '동료', excluded: ['중식', '햄버거'] },
    ],
  };
  assert.equal(validateState(legacy), true);
  assert.deepEqual(normalizeState(legacy), expected);
  const bytes = new TextEncoder().encode(JSON.stringify(legacy));
  const oldLink = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  assert.deepEqual(decodeShare(oldLink), expected);
  assert.deepEqual(decodeShare(encodeShare(legacy)), expected);
});

test('version 3 shared exclusions become a legacy participant', () => {
  const legacy = {
    version: 3,
    day: '2026-11-03',
    categories: structuredClone(categoryRecords),
    restaurants: structuredClone(restaurants),
    excluded: ['중식', '햄버거'],
  };
  const normalized = normalizeState(legacy);
  assert.equal(normalized.version, 4);
  assert.deepEqual(normalized.participants, [
    { id: 'legacy-shared', nickname: '오늘의 선택', excluded: ['중식', '햄버거'] },
  ]);
  assert.deepEqual(allExcluded(normalized.participants), ['중식', '햄버거']);
});

test('default list updates preserve local additions and deletions and change categories', () => {
  const saved = state();
  saved.baseline = structuredClone(restaurants);
  saved.restaurants = [restaurants[0], restaurants[1], { id: 'local', name: '내 맛집', categories: ['한식'] }];
  const defaults = [{ ...restaurants[0], categories: ['한식'] }, restaurants[1], restaurants[2], { id: 'new', name: '새 맛집', categories: ['초밥'] }];
  const restored = restoreState(saved, defaults, saved.day);
  assert.deepEqual(restored.restaurants.map(r => r.id), ['a', 'b', 'local', 'new']);
  assert.deepEqual(restored.restaurants[0].categories, ['한식']);
  assert.deepEqual(restored.participants[0].excluded, []);
});

test('shared data rejects invalid restaurants, exclusions and duplicate identities', () => {
  const invalid = state(); invalid.restaurants[0].categories = [];
  assert.equal(validateState(invalid), false);
  assert.throws(() => encodeShare(invalid));
  const duplicate = state(); duplicate.restaurants.push(duplicate.restaurants[0]);
  assert.equal(validateState(duplicate), false);
  const invalidChoice = state(); invalidChoice.participants[0].excluded = [123];
  assert.equal(validateState(invalidChoice), false);
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

test('nickname maker returns adjective-food or phrase forms', () => {
  const combo = makeNickname(() => 0.5);
  assert.match(combo, /.+\s.+/);
  const phrase = makeNickname(() => 0.1);
  assert.equal(typeof phrase, 'string');
  assert.ok(phrase.length > 0);
});

test('unique nickname appends #n when taken', () => {
  assert.equal(uniqueNickname('배고픈 김치찌개', []), '배고픈 김치찌개');
  assert.equal(uniqueNickname('배고픈 김치찌개', ['배고픈 김치찌개']), '배고픈 김치찌개 #2');
  assert.equal(uniqueNickname('배고픈 김치찌개', ['배고픈 김치찌개', '배고픈 김치찌개 #2']), '배고픈 김치찌개 #3');
});

test('allExcluded unions participant choices', () => {
  assert.deepEqual(allExcluded([
    { excluded: ['중식'] },
    { excluded: ['중식', '라멘'] },
  ]), ['중식', '라멘']);
});
