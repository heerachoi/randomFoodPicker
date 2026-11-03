export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function eligibleRestaurants(restaurants, excludedCategories) {
  const excluded = new Set(excludedCategories);
  return restaurants.filter(restaurant => !excluded.has(restaurant.category));
}

export function validateRestaurant(value) {
  return value && typeof value.id === 'string' && value.id.length <= 100 &&
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 40 &&
    typeof value.category === 'string' && value.category.trim().length > 0 && value.category.length <= 20;
}

export function validateState(value) {
  const validCategories = categories => Array.isArray(categories) && categories.length <= 100 && categories.every(category => typeof category === 'string' && category.length <= 20);
  return value && [1, 2].includes(value.version) && typeof value.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.day) &&
    Array.isArray(value.restaurants) && value.restaurants.length <= 100 && value.restaurants.every(validateRestaurant) &&
    new Set(value.restaurants.map(r => r.id)).size === value.restaurants.length &&
    (value.version === 2 ? validCategories(value.excluded) :
    Array.isArray(value.participants) && value.participants.length <= 50 && value.participants.every(person =>
      person && typeof person.id === 'string' && person.id.length <= 100 &&
      typeof person.name === 'string' && person.name.trim().length > 0 && person.name.length <= 20 &&
      validCategories(person.excluded)) &&
    new Set(value.participants.map(p => p.id)).size === value.participants.length);
}

export function normalizeState(value) {
  if (!validateState(value)) throw new Error('저장한 내용을 읽을 수 없습니다.');
  return {
    version: 2,
    day: value.day,
    restaurants: value.restaurants.map(({ id, name, category }) => ({ id, name, category })),
    excluded: [...new Set(value.version === 1 ? value.participants.flatMap(person => person.excluded) : value.excluded)],
  };
}

export function restoreState(saved, defaults, today = dayKey()) {
  const restored = normalizeState(saved);
  if (Array.isArray(saved.baseline) && saved.baseline.every(validateRestaurant)) {
    const baseline = new Map(saved.baseline.map(r => [r.id, r]));
    const current = new Map(restored.restaurants.map(r => [r.id, r]));
    const source = new Map(defaults.map(r => [r.id, r]));
    const merged = [];
    for (const restaurant of restored.restaurants) {
      const old = baseline.get(restaurant.id);
      if (!old || old.name !== restaurant.name || old.category !== restaurant.category) merged.push(restaurant);
      else if (source.has(restaurant.id)) merged.push({ ...source.get(restaurant.id) });
    }
    for (const restaurant of defaults) {
      if (!baseline.has(restaurant.id) && !current.has(restaurant.id)) merged.push({ ...restaurant });
    }
    if (merged.length <= 100) restored.restaurants = merged;
  }
  restored.excluded = restored.day === today ? restored.excluded.filter(category => restored.restaurants.some(r => r.category === category)) : [];
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
