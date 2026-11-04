import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js?v=20261104-20';

export const isConfigured = Boolean(SUPABASE_URL?.trim() && SUPABASE_ANON_KEY?.trim());

const base = () => SUPABASE_URL.trim().replace(/\/$/, '');
const key = () => SUPABASE_ANON_KEY.trim();

function headers(extra = {}) {
  return {
    apikey: key(),
    Authorization: `Bearer ${key()}`,
    Accept: 'application/json',
    ...extra,
  };
}

async function rest(path, options = {}) {
  const response = await fetch(`${base()}/rest/v1/${path}`, {
    ...options,
    headers: headers(options.headers),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    const error = new Error(body?.message || body?.error_description || `Supabase 요청 실패 (${response.status})`);
    error.code = body?.code;
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

function mapRestaurant(row) {
  const categories = (row.restaurant_categories || [])
    .map(link => link.categories)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at || undefined,
    categories: categories.map(category => category.name),
    categoryIds: categories.map(category => category.id),
  };
}

export async function fetchState(day) {
  const [categories, restaurants, participants, exclusions] = await Promise.all([
    rest('categories?select=id,name&order=name'),
    rest('restaurants?select=id,name,created_at,restaurant_categories(categories(id,name))&order=name'),
    rest(`daily_participants?select=participant_id,nickname&day=eq.${encodeURIComponent(day)}&order=updated_at`),
    rest(`daily_exclusions?select=participant_id,category_id,categories(name)&day=eq.${encodeURIComponent(day)}`),
  ]);

  const nameById = new Map(categories.map(category => [category.id, category.name]));
  const excludedByParticipant = new Map();
  for (const row of exclusions) {
    const name = nameById.get(row.category_id) || row.categories?.name;
    if (!name) continue;
    const list = excludedByParticipant.get(row.participant_id) || [];
    list.push(name);
    excludedByParticipant.set(row.participant_id, list);
  }

  return {
    categories,
    restaurants: restaurants.map(mapRestaurant),
    participants: participants.map(person => ({
      id: person.participant_id,
      nickname: person.nickname,
      excluded: [...new Set(excludedByParticipant.get(person.participant_id) || [])],
    })),
  };
}

export async function createCategory(name) {
  const rows = await rest('categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ name }),
  });
  return rows[0];
}

export async function removeCategory(categoryId) {
  const linked = await rest(`restaurant_categories?select=restaurant_id&category_id=eq.${categoryId}`);
  if (linked.length) {
    const restaurantIds = [...new Set(linked.map(row => row.restaurant_id))];
    const remaining = await rest(
      `restaurant_categories?select=restaurant_id,category_id&restaurant_id=in.(${restaurantIds.join(',')})`,
    );
    const onlyThis = restaurantIds.filter(id =>
      remaining.filter(row => row.restaurant_id === id).every(row => row.category_id === categoryId));
    if (onlyThis.length) {
      throw new Error('이 카테고리만 가진 음식점이 있어 삭제할 수 없어요. 먼저 다른 카테고리를 붙이거나 음식점을 삭제해 주세요.');
    }
    await rest(`restaurant_categories?category_id=eq.${categoryId}`, { method: 'DELETE' });
  }
  await rest(`categories?id=eq.${categoryId}`, { method: 'DELETE' });
}

export async function createRestaurant(name, categoryIds) {
  if (!categoryIds?.length) throw new Error('카테고리를 하나 이상 선택해 주세요.');
  const rows = await rest('restaurants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ name }),
  });
  const restaurant = rows[0];
  try {
    await rest('restaurant_categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(categoryIds.map(categoryId => ({
        restaurant_id: restaurant.id,
        category_id: categoryId,
      }))),
    });
  } catch (error) {
    await rest(`restaurants?id=eq.${restaurant.id}`, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
  return { id: restaurant.id, createdAt: restaurant.created_at };
}

export async function removeRestaurant(restaurantId) {
  await rest(`restaurants?id=eq.${restaurantId}`, { method: 'DELETE' });
}

export async function updateRestaurantCategories(restaurantId, categoryIds) {
  if (!categoryIds?.length) throw new Error('카테고리를 하나 이상 선택해 주세요.');
  await rest(`restaurant_categories?restaurant_id=eq.${restaurantId}`, { method: 'DELETE' });
  await rest('restaurant_categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(categoryIds.map(categoryId => ({
      restaurant_id: restaurantId,
      category_id: categoryId,
    }))),
  });
}

export async function upsertParticipant(day, { id, nickname }) {
  await rest('daily_participants?on_conflict=day,participant_id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      day,
      participant_id: id,
      nickname,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function replaceParticipantExcluded(day, participantId, categoryIds) {
  await rest(
    `daily_exclusions?day=eq.${encodeURIComponent(day)}&participant_id=eq.${participantId}`,
    { method: 'DELETE' },
  );
  if (!categoryIds.length) return;
  await rest('daily_exclusions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(categoryIds.map(categoryId => ({
      day,
      participant_id: participantId,
      category_id: categoryId,
    }))),
  });
}

export function subscribeToChanges(onChange) {
  if (!isConfigured) return () => {};
  const timer = setInterval(onChange, 8000);
  const onFocus = () => onChange();
  window.addEventListener('focus', onFocus);
  return () => {
    clearInterval(timer);
    window.removeEventListener('focus', onFocus);
  };
}

export function describeError(error) {
  if (!error) return '알 수 없는 오류가 발생했어요.';
  if (error.code === '23505') return '이미 존재합니다';
  if (error.message) return error.message;
  return '저장에 실패했어요. 잠시 후 다시 시도해 주세요.';
}
