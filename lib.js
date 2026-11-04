export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export const NICKNAME_ADJECTIVES = [
  '배고픈', '졸린', '매운맛', '야근한', '월요일의', '눈치보는',
  '웨이팅 싫은', '퇴사 직전', '점심 노리는', '국물 마시는',
  '밥심 충전한', '법카 쓰고 싶은', '숟가락 든', '탕수육 훔쳐먹는', '12시 땡',
];

export const NICKNAME_FOODS = [
  '김치찌개', '돈까스', '쫄면', '라면', '제육', '순대국',
  '칼국수', '떡볶이', '하이에나', '너구리', '펭귄', '곰',
  '대리', '과장', '인턴', '사원', '요정',
];

export const NICKNAME_PHRASES = [
  '구내식당 탈주범', '점심 담당 과장', '곱빼기 요정', '국물 감별사',
  '면치기 장인', '단무지 수호자', '라스트 한입',
];

function pick(list, random = Math.random) {
  return list[Math.floor(random() * list.length)];
}

export function makeNickname(random = Math.random) {
  if (random() < 0.22) return pick(NICKNAME_PHRASES, random);
  return `${pick(NICKNAME_ADJECTIVES, random)} ${pick(NICKNAME_FOODS, random)}`;
}

export function uniqueNickname(base, takenNames = []) {
  const taken = new Set([...takenNames].map(name => name.trim()).filter(Boolean));
  const root = String(base || '').trim() || makeNickname();
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root} #${n}`)) n += 1;
  return `${root} #${n}`;
}

export function validateNickname(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 40;
}

export function allExcluded(participants) {
  return [...new Set((participants || []).flatMap(person => person.excluded || []))];
}

export function restaurantCategories(restaurant) {
  if (Array.isArray(restaurant?.categories) && restaurant.categories.length) {
    return restaurant.categories.map(category => category.trim()).filter(Boolean);
  }
  if (typeof restaurant?.category === 'string' && restaurant.category.trim()) {
    return [restaurant.category.trim()];
  }
  return [];
}

export function eligibleRestaurants(restaurants, excludedCategories) {
  const excluded = new Set(excludedCategories);
  return restaurants.filter(restaurant => !restaurantCategories(restaurant).some(category => excluded.has(category)));
}

const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function isNewRestaurant(restaurant, now = new Date()) {
  const raw = restaurant?.createdAt;
  if (typeof raw !== 'string' || !raw) return false;
  const created = Date.parse(raw);
  if (!Number.isFinite(created)) return false;
  const elapsed = now.getTime() - created;
  return elapsed >= 0 && elapsed < NEW_WINDOW_MS;
}

export function validateCategoryName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 20;
}

export function validateRestaurant(value) {
  const categories = restaurantCategories(value);
  return value && typeof value.id === 'string' && value.id.length <= 100 &&
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 40 &&
    categories.length >= 1 && categories.length <= 10 &&
    categories.every(validateCategoryName) &&
    new Set(categories).size === categories.length;
}

export function validateParticipant(person, validCategories) {
  return person && typeof person.id === 'string' && person.id.length <= 100 &&
    validateNickname(person.nickname ?? person.name) &&
    validCategories(person.excluded);
}

export function validateState(value) {
  const validCategories = categories => Array.isArray(categories) && categories.length <= 100 && categories.every(validateCategoryName);
  const validCategoryRecords = records => Array.isArray(records) && records.length <= 100 && records.every(category =>
    category && typeof category.id === 'string' && category.id.length <= 100 && validateCategoryName(category.name)) &&
    new Set(records.map(category => category.id)).size === records.length &&
    new Set(records.map(category => category.name)).size === records.length;
  const validParticipants = participants => Array.isArray(participants) && participants.length <= 50 &&
    participants.every(person => validateParticipant(person, validCategories)) &&
    new Set(participants.map(person => person.id)).size === participants.length;

  if (!value || ![1, 2, 3, 4].includes(value.version) || typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day)) return false;
  if (!Array.isArray(value.restaurants) || value.restaurants.length > 100 || !value.restaurants.every(validateRestaurant)) return false;
  if (new Set(value.restaurants.map(restaurant => restaurant.id)).size !== value.restaurants.length) return false;

  if (value.version === 4) {
    return validCategoryRecords(value.categories) && validParticipants(value.participants);
  }
  if (value.version === 3) {
    return validCategoryRecords(value.categories) && validCategories(value.excluded);
  }
  if (value.version === 2) return validCategories(value.excluded);
  return validParticipants(value.participants);
}

export function normalizeRestaurant(restaurant) {
  const createdAt = typeof restaurant.createdAt === 'string' && Number.isFinite(Date.parse(restaurant.createdAt))
    ? restaurant.createdAt
    : undefined;
  return {
    id: restaurant.id,
    name: restaurant.name,
    categories: [...new Set(restaurantCategories(restaurant))],
    ...(Array.isArray(restaurant.categoryIds) ? { categoryIds: [...restaurant.categoryIds] } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

export function normalizeParticipant(person) {
  return {
    id: person.id,
    nickname: String(person.nickname ?? person.name).trim(),
    excluded: [...new Set(person.excluded || [])],
  };
}

export function normalizeState(value) {
  if (!validateState(value)) throw new Error('저장한 내용을 읽을 수 없습니다.');
  const restaurants = value.restaurants.map(normalizeRestaurant);
  const categories = value.version === 3 || value.version === 4
    ? value.categories.map(({ id, name }) => ({ id, name }))
    : [...new Set(restaurants.flatMap(restaurant => restaurant.categories))]
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map(name => ({ id: `local:${name}`, name }));

  let participants;
  if (value.version === 4 || value.version === 1) {
    participants = value.participants.map(normalizeParticipant);
  } else {
    const excluded = [...new Set(value.excluded || [])];
    participants = excluded.length
      ? [{ id: 'legacy-shared', nickname: '오늘의 선택', excluded }]
      : [];
  }

  return { version: 4, day: value.day, categories, restaurants, participants };
}

export function restoreState(saved, defaults, today = dayKey()) {
  const restored = normalizeState(saved);
  if (Array.isArray(saved.baseline) && saved.baseline.every(validateRestaurant)) {
    const baseline = new Map(saved.baseline.map(restaurant => [restaurant.id, normalizeRestaurant(restaurant)]));
    const current = new Map(restored.restaurants.map(restaurant => [restaurant.id, restaurant]));
    const source = new Map(defaults.map(restaurant => [restaurant.id, normalizeRestaurant(restaurant)]));
    const merged = [];
    for (const restaurant of restored.restaurants) {
      const old = baseline.get(restaurant.id);
      const same =
        old &&
        old.name === restaurant.name &&
        old.categories.length === restaurant.categories.length &&
        old.categories.every((category, index) => category === restaurant.categories[index]);
      if (!same) merged.push(restaurant);
      else if (source.has(restaurant.id)) merged.push({ ...source.get(restaurant.id) });
    }
    for (const restaurant of defaults) {
      if (!baseline.has(restaurant.id) && !current.has(restaurant.id)) merged.push(normalizeRestaurant(restaurant));
    }
    if (merged.length <= 100) restored.restaurants = merged;
  }
  const known = new Set(restored.categories.map(category => category.name));
  for (const name of restored.restaurants.flatMap(restaurant => restaurant.categories)) {
    if (!known.has(name)) {
      restored.categories.push({ id: `local:${name}`, name });
      known.add(name);
    }
  }
  restored.categories.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const keepChoices = restored.day === today;
  restored.participants = keepChoices
    ? restored.participants.map(person => ({
      ...person,
      excluded: person.excluded.filter(category =>
        restored.restaurants.some(restaurant => restaurant.categories.includes(category))),
    }))
    : restored.participants.map(person => ({ ...person, excluded: [] }));
  restored.day = today;
  return restored;
}

export function encodeShare(state) {
  if (!validateState(state)) throw new Error('공유할 내용을 확인해 주세요.');
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeState(state)));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeShare(encoded) {
  if (encoded.length > 100000) throw new Error('공유 링크가 너무 깁니다.');
  const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!validateState(state)) throw new Error('올바른 공유 링크가 아닙니다.');
  return normalizeState(state);
}

// Rejection sampling keeps every candidate equally likely.
export function randomIndex(length, fill = array => crypto.getRandomValues(array)) {
  if (!Number.isInteger(length) || length < 1 || length > 100) throw new Error('추첨할 음식점이 없습니다.');
  const limit = Math.floor(0x100000000 / length) * length;
  const buffer = new Uint32Array(1);
  do { fill(buffer); } while (buffer[0] >= limit);
  return buffer[0] % length;
}
