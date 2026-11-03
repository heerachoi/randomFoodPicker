export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function eligibleRestaurants(restaurants, participants) {
  const excluded = new Set(participants.flatMap(person => person.excluded));
  return restaurants.filter(restaurant => !excluded.has(restaurant.category));
}

export function validateRestaurant(value) {
  return value && typeof value.id === 'string' && value.id.length <= 100 &&
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 40 &&
    typeof value.category === 'string' && value.category.trim().length > 0 && value.category.length <= 20;
}

// Keep old saved lists and shared links compatible, without retaining restaurant URLs.
export function removeRestaurantLinks(state) {
  return { ...state, restaurants: state.restaurants.map(({ id, name, category }) => ({ id, name, category })) };
}

export function validateState(value) {
  return value && value.version === 1 && typeof value.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.day) &&
    Array.isArray(value.restaurants) && value.restaurants.length <= 100 && value.restaurants.every(validateRestaurant) &&
    new Set(value.restaurants.map(r => r.id)).size === value.restaurants.length &&
    Array.isArray(value.participants) && value.participants.length <= 50 && value.participants.every(person =>
      person && typeof person.id === 'string' && person.id.length <= 100 &&
      typeof person.name === 'string' && person.name.trim().length > 0 && person.name.length <= 20 &&
      Array.isArray(person.excluded) && person.excluded.length <= 100 &&
      person.excluded.every(category => typeof category === 'string' && category.length <= 20)) &&
    new Set(value.participants.map(p => p.id)).size === value.participants.length;
}

export function encodeShare(state) {
  if (!validateState(state)) throw new Error('공유할 내용을 확인해 주세요.');
  const bytes = new TextEncoder().encode(JSON.stringify(removeRestaurantLinks(state)));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeShare(encoded) {
  if (encoded.length > 100000) throw new Error('공유 링크가 너무 깁니다.');
  const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!validateState(state)) throw new Error('올바른 공유 링크가 아닙니다.');
  return removeRestaurantLinks(state);
}

// Rejection sampling keeps every candidate equally likely.
export function randomIndex(length, fill = array => crypto.getRandomValues(array)) {
  if (!Number.isInteger(length) || length < 1 || length > 100) throw new Error('추첨할 음식점이 없습니다.');
  const limit = Math.floor(0x100000000 / length) * length;
  const buffer = new Uint32Array(1);
  do { fill(buffer); } while (buffer[0] >= limit);
  return buffer[0] % length;
}
