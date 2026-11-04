import { DEFAULT_CATEGORIES, DEFAULT_RESTAURANTS } from './restaurants.js';
import {
  dayKey,
  eligibleRestaurants,
  restoreState,
  decodeShare,
  randomIndex,
  restaurantCategories,
  isNewRestaurant,
  makeNickname,
  uniqueNickname,
  allExcluded,
} from './lib.js';
import {
  isConfigured,
  fetchState,
  createCategory,
  removeCategory,
  createRestaurant,
  removeRestaurant,
  updateRestaurantCategories,
  upsertParticipant,
  replaceParticipantExcluded,
  subscribeToChanges,
  describeError,
} from './db.js';

const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'lunchmate.v4';
const IDENTITY_KEY = 'lunchmate.identity';
const COLORS = ['#f4dc9f', '#f4b597', '#d2dfc3', '#e8c8ac', '#d1e3de', '#efd1b7'];
const clone = value => JSON.parse(JSON.stringify(value));
const id = () => crypto.randomUUID();
let state = freshState();
let identity = readStoredIdentity() || createIdentity();
let spinTimer, toastTimer, rotation = 0, spinning = false, confirmAction;
let manageCategory = null;
let listCategory = null;
let syncing = false;
let suppressPersist = false;
let remoteReady = false;
let editingRestaurantId = null;
let manageTab = 'restaurants';

function setManageTab(tab) {
  manageTab = tab === 'categories' ? 'categories' : 'restaurants';
  const isRestaurants = manageTab === 'restaurants';
  $('#tab-restaurants').setAttribute('aria-selected', String(isRestaurants));
  $('#tab-categories').setAttribute('aria-selected', String(!isRestaurants));
  $('#panel-restaurants').hidden = !isRestaurants;
  $('#panel-categories').hidden = isRestaurants;
  $('#settings-title').textContent = isRestaurants ? '음식점 관리' : '카테고리 관리';
}

function openSettings(tab = 'restaurants', focusSelector) {
  setManageTab(tab);
  $('#settings-dialog').showModal();
  if (focusSelector) $(focusSelector)?.focus();
}

function freshState() {
  return {
    version: 4,
    day: dayKey(),
    categories: DEFAULT_CATEGORIES.map(name => ({ id: `local:${name}`, name })),
    restaurants: clone(DEFAULT_RESTAURANTS),
    participants: [],
  };
}

function readStoredIdentity() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved && typeof saved.id === 'string' && typeof saved.nickname === 'string' && saved.nickname.trim()) {
      return { id: saved.id, nickname: saved.nickname.trim() };
    }
  } catch { /* fall through */ }
  return null;
}

function persistIdentity(next = identity) {
  identity = next;
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch { /* Ignore quota / private-mode write failures. */ }
}

function createIdentity() {
  const created = { id: id(), nickname: makeNickname() };
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(created));
  } catch { /* Ignore quota / private-mode write failures. */ }
  return created;
}

function takenNicknames(exceptId = identity.id) {
  return state.participants
    .filter(person => person.id !== exceptId)
    .map(person => person.nickname);
}

function ensureSelfParticipant() {
  const nickname = uniqueNickname(identity.nickname, takenNicknames());
  if (nickname !== identity.nickname) persistIdentity({ ...identity, nickname });
  const existing = state.participants.find(person => person.id === identity.id);
  if (existing) {
    if (existing.nickname !== identity.nickname) existing.nickname = identity.nickname;
    return existing;
  }
  const self = { id: identity.id, nickname: identity.nickname, excluded: [] };
  state.participants = [...state.participants, self];
  return self;
}

function myExcluded() {
  return ensureSelfParticipant().excluded;
}

function setMyExcluded(excluded) {
  ensureSelfParticipant().excluded = [...new Set(excluded)];
}

function teamExcluded() {
  return allExcluded(state.participants);
}

function foodEmoji(category) {
  const match = [['쌀국수|국수|면|우동|라멘', '🍜'], ['햄버거|버거', '🍔'], ['중식|마라|짜장', '🥟'], ['순대국|국밥', '🍲'], ['한식|백반|찌개', '🍚'], ['돈까츠|돈가스|돈까스', '🍱'], ['일식|초밥', '🍣'], ['양식|파스타', '🍝'], ['피자', '🍕'], ['치킨|닭', '🍗'], ['분식|떡볶이', '🍢'], ['건강식|샐러드', '🥗'], ['샌드위치', '🥪'], ['고기|삼겹|구이', '🥩']].find(([pattern]) => new RegExp(pattern).test(category));
  return match?.[1] || '🍽️';
}

function primaryCategory(restaurant) {
  return restaurantCategories(restaurant)[0] || '기타';
}

function categoryLabel(restaurant) {
  return restaurantCategories(restaurant).join(' · ') || '미분류';
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function toast(message) {
  clearTimeout(toastTimer);
  const el = $('#toast');
  // dialog top-layer covers body toasts; mount inside the open modal so it stays visible
  const openDialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  (openDialog || document.body).append(el);
  el.textContent = message;
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, 4300);
}

function fieldErrorEl(input) {
  const id = typeof input === 'string' ? input.replace(/^#/, '') : input?.id;
  return id ? document.getElementById(`${id}-error`) : null;
}

function showFieldError(inputSelector, message) {
  const input = $(inputSelector);
  const error = fieldErrorEl(input);
  if (!input || !error) return toast(message);
  error.textContent = message;
  error.hidden = false;
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}

function clearFieldError(inputSelector) {
  const input = $(inputSelector);
  const error = fieldErrorEl(input);
  if (!input || !error) return;
  error.textContent = '';
  error.hidden = true;
  input.removeAttribute('aria-invalid');
}

function restore(saved) {
  return restoreState(saved, DEFAULT_RESTAURANTS);
}

try {
  const saved = localStorage.getItem(STORAGE_KEY)
    || localStorage.getItem('lunchmate.v3')
    || localStorage.getItem('lunchmate.v2')
    || localStorage.getItem('lunchmate.v1');
  if (saved) state = restore(JSON.parse(saved));
} catch {
  toast('저장된 내용을 읽지 못해 기본 목록으로 열었어요.');
}
ensureSelfParticipant();
{
  const legacy = state.participants.find(person => person.id === 'legacy-shared');
  if (legacy) {
    const self = ensureSelfParticipant();
    if (!self.excluded.length && legacy.excluded.length) self.excluded = [...legacy.excluded];
    state.participants = state.participants.filter(person => person.id !== 'legacy-shared');
  }
}

function setBadge(text, online = true) {
  const badge = $('.storage-badge');
  if (!badge) return;
  badge.lastChild.textContent = ` ${text}`;
  badge.firstElementChild.style.background = online ? '#8ba47e' : '#c4a15c';
}

function persist() {
  if (suppressPersist) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, baseline: DEFAULT_RESTAURANTS }));
  } catch {
    /* Ignore quota / private-mode write failures. */
  }
  if (isConfigured && remoteReady) setBadge(syncing ? '팀 목록 동기화 중…' : '팀 공유 저장 중', true);
  else if (isConfigured) setBadge('팀 목록 연결 중…', true);
  else setBadge('이 브라우저에 저장 중 · Supabase 미연결', false);
}

function cancelSpin() {
  clearTimeout(spinTimer);
  spinning = false;
  rotation = 0;
  $('#wheel').style.transition = 'none';
  $('#wheel').style.transform = 'rotate(0deg)';
}

function clearResult() {
  const result = $('#result');
  result.replaceChildren();
  result.classList.remove('is-ready');
}

function naverMapSearchUrl(name) {
  return `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
}

function naverMapLink(name) {
  const link = element('a', 'naver-map-link');
  link.href = naverMapSearchUrl(name);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${name} 네이버 지도에서 검색`);
  link.title = '네이버 지도에서 검색';
  link.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>`;
  return link;
}

function showResult(restaurant) {
  const result = $('#result');
  const title = element('strong', 'result-title');
  title.append(
    document.createTextNode(`${foodEmoji(primaryCategory(restaurant))} 오늘은 ${restaurant.name}!`),
    naverMapLink(restaurant.name),
  );
  result.replaceChildren(
    title,
    element('p', '', `${categoryLabel(restaurant)} 먹으러 가요. 맛있는 점심 되세요!`),
  );
  result.classList.add('is-ready');
}

function hasResult() {
  return $('#result').classList.contains('is-ready');
}

function setSpinButton(label) {
  $('#spin').replaceChildren(
    element('span', '', '↻'),
    document.createTextNode(label),
    element('span', '', '↗'),
  );
}

function categories() {
  return state.categories.map(category => category.name);
}

function categoryIdByName(name) {
  return state.categories.find(category => category.name === name)?.id;
}

function update() {
  cancelSpin();
  clearResult();
  persist();
  render();
}

function ensureToday() {
  if (state.day === dayKey()) return;
  state.day = dayKey();
  state.participants = state.participants
    .filter(person => person.id === identity.id)
    .map(person => ({ ...person, excluded: [] }));
  ensureSelfParticipant();
  update();
  if (isConfigured && remoteReady) syncParticipant();
  toast('새로운 날이에요! 오늘의 제외 선택을 초기화했어요.');
}

function confirm(title, description, action, label = '확인') {
  $('#confirm-title').textContent = title;
  $('#confirm-description').textContent = description;
  $('#confirm-action').textContent = label;
  confirmAction = action;
  $('#confirm-dialog').showModal();
}

async function withSync(action) {
  if (!isConfigured || !remoteReady) return action();
  syncing = true;
  persist();
  try {
    return await action();
  } catch (error) {
    toast(describeError(error));
    await refreshFromRemote();
    throw error;
  } finally {
    syncing = false;
    persist();
  }
}

async function syncParticipant() {
  if (!isConfigured || !remoteReady) return;
  const self = ensureSelfParticipant();
  const ids = self.excluded.map(categoryIdByName).filter(Boolean);
  await withSync(async () => {
    try {
      await upsertParticipant(state.day, { id: self.id, nickname: self.nickname });
    } catch (error) {
      if (error.code !== '23505') throw error;
      const nickname = uniqueNickname(makeNickname(), takenNicknames());
      persistIdentity({ ...identity, nickname });
      self.nickname = nickname;
      await upsertParticipant(state.day, { id: self.id, nickname });
    }
    await replaceParticipantExcluded(state.day, self.id, ids);
  });
}

async function refreshFromRemote() {
  if (!isConfigured) return;
  const remote = await fetchState(dayKey());
  const mine = state.participants.find(person => person.id === identity.id);
  suppressPersist = true;
  state = {
    version: 4,
    day: dayKey(),
    categories: remote.categories,
    restaurants: remote.restaurants,
    participants: remote.participants,
  };
  const remoteSelf = state.participants.find(person => person.id === identity.id);
  if (remoteSelf) {
    if (remoteSelf.nickname !== identity.nickname) persistIdentity({ ...identity, nickname: remoteSelf.nickname });
  } else if (mine) {
    state.participants = [...state.participants, {
      id: identity.id,
      nickname: uniqueNickname(identity.nickname, takenNicknames()),
      excluded: mine.excluded,
    }];
    const self = state.participants.find(person => person.id === identity.id);
    if (self.nickname !== identity.nickname) persistIdentity({ ...identity, nickname: self.nickname });
  } else {
    ensureSelfParticipant();
  }
  remoteReady = true;
  suppressPersist = false;
  cancelSpin();
  clearResult();
  persist();
  render();
}

function renderIdentity() {
  $('#my-nickname').textContent = identity.nickname;
}

function revealNickname() {
  const el = $('#my-nickname');
  el.textContent = identity.nickname;
  el.classList.remove('nickname-appear');
  void el.offsetWidth;
  el.classList.add('nickname-appear');
}

function renderTodayVotes() {
  const container = $('#today-votes');
  container.replaceChildren();
  const voters = state.participants
    .filter(person => person.excluded.length)
    .sort((a, b) => {
      if (a.id === identity.id) return -1;
      if (b.id === identity.id) return 1;
      return a.nickname.localeCompare(b.nickname, 'ko');
    });
  container.append(element('p', 'today-votes-heading', 'TODAY’S VOTES'));
  if (!voters.length) {
    container.append(element('p', 'today-votes-empty', '아직 제외한 사람이 없어요. 카테고리를 골라 보세요.'));
    return;
  }
  voters.forEach(person => {
    const row = element('div', person.id === identity.id ? 'today-vote is-me' : 'today-vote');
    const name = element('div', 'today-vote-name', person.nickname);
    if (person.id === identity.id) name.append(element('span', 'me-tag', '나'));
    row.append(name, element('div', 'today-vote-picks', person.excluded.join(' · ')));
    container.append(row);
  });
}

function renderCategories() {
  const container = $('#category-choices');
  container.replaceChildren();
  const selectedSet = new Set(myExcluded());
  categories().forEach(category => {
    const selected = selectedSet.has(category);
    const count = state.restaurants.filter(restaurant => restaurantCategories(restaurant).includes(category)).length;
    const button = element('button', 'category-chip');
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${category} 제외`);
    const emoji = element('span', 'category-emoji', foodEmoji(category));
    emoji.setAttribute('aria-hidden', 'true');
    button.append(emoji, element('span', 'category-name', category), element('span', 'category-count', `${count}곳`), element('span', 'chip-indicator', selected ? '✓' : ''));
    button.onclick = async () => {
      ensureToday();
      const current = myExcluded();
      setMyExcluded(current.includes(category)
        ? current.filter(item => item !== category)
        : [...current, category]);
      update();
      [...container.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === `${category} 제외`)?.focus({ preventScroll: true });
      try { await syncParticipant(); } catch { /* toast already shown */ }
    };
    container.append(button);
  });
  if (!categories().length) container.append(element('p', 'empty-people', '카테고리를 추가하면 여기에 표시돼요.'));
}

function renderWheel(candidates) {
  const wheel = $('#wheel');
  wheel.replaceChildren();
  const count = candidates.length;
  if (!count) {
    wheel.style.background = '#dfe4d5';
    return;
  }
  wheel.style.background = `conic-gradient(${candidates.map((_, i) => `${COLORS[i % COLORS.length]} ${i * 100 / count}% ${(i + 1) * 100 / count}%`).join(',')})`;
  if (count > 12) {
    const label = element('span', 'wheel-label');
    label.style.transform = 'translateY(-85px)';
    label.append(element('span', 'food-emoji', '🍽️'), element('span', 'wheel-name', `${count}곳의 맛집`));
    wheel.append(label);
  } else candidates.forEach((restaurant, i) => {
    const angle = (i + .5) * 360 / count;
    const label = element('span', 'wheel-label');
    const radius = window.innerWidth <= 370 || (window.innerWidth > 760 && window.innerWidth <= 1000) ? 78 : 90;
    label.style.transform = `rotate(${angle}deg) translateY(-${radius}px) rotate(${-angle}deg)`;
    label.append(element('span', 'food-emoji', foodEmoji(primaryCategory(restaurant))), element('span', 'wheel-name', restaurant.name));
    wheel.append(label);
  });
}

function renderCategoryFilters(filters, selectedCategory, listId, onChange) {
  filters.replaceChildren();
  [null, ...categories()].forEach(category => {
    const button = element('button', 'manage-filter');
    const label = category ?? '전체';
    const count = category === null
      ? state.restaurants.length
      : state.restaurants.filter(restaurant => restaurantCategories(restaurant).includes(category)).length;
    const accessibleLabel = `${label} ${listId === 'manage-list' ? '음식점' : '점심 리스트'} 보기`;
    button.setAttribute('aria-label', accessibleLabel);
    button.setAttribute('aria-pressed', String(category === selectedCategory));
    button.setAttribute('aria-controls', listId);
    button.append(element('span', '', label), element('span', 'manage-filter-count', count));
    button.onclick = () => {
      onChange(category);
      [...filters.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === accessibleLabel)?.focus({ preventScroll: true });
    };
    filters.append(button);
  });
}

function restaurantsUsingCategory(categoryName) {
  return state.restaurants.filter(restaurant => restaurantCategories(restaurant).includes(categoryName));
}

async function addCategoryByName(name, { autoSelectForEdit = false } = {}) {
  const trimmed = name.trim();
  if (!trimmed) {
    toast('카테고리 이름을 입력해 주세요.');
    return null;
  }
  if (state.categories.length >= 100) {
    toast('카테고리는 최대 100개까지 추가할 수 있어요.');
    return null;
  }
  if (state.categories.some(category => category.name === trimmed)) {
    toast('이미 존재합니다');
    return null;
  }
  let category = { id: id(), name: trimmed };
  if (isConfigured && remoteReady) {
    category = await withSync(() => createCategory(trimmed));
  }
  state.categories = [...state.categories, category].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  update();
  if (autoSelectForEdit && $('#edit-restaurant-dialog').open) {
    const selected = new Set(selectedCategoriesFrom('#edit-restaurant-category-picker').categoryNames);
    selected.add(category.name);
    renderEditCategoryPicker([...selected]);
  }
  toast(`${trimmed} 카테고리를 추가했어요.`);
  return category;
}

function requestDeleteCategory(category) {
  const linked = restaurantsUsingCategory(category.name);
  const warning = linked.length
    ? `「${category.name}」카테고리가 지정된 음식점이 ${linked.length}곳 있어요.\n삭제하면 해당 음식점들에서 이 카테고리만 제거됩니다. 음식점 자체는 삭제되지 않아요.\n그래도 삭제할까요?`
    : `「${category.name}」카테고리를 삭제할까요?`;
  confirm('카테고리를 삭제할까요?', warning, async () => {
    try {
      if (isConfigured && remoteReady) {
        await withSync(() => removeCategory(category.id));
        await refreshFromRemote();
      } else {
        state.categories = state.categories.filter(item => item.id !== category.id);
        state.restaurants = state.restaurants.map(restaurant => ({
          ...restaurant,
          categories: restaurantCategories(restaurant).filter(name => name !== category.name),
          categoryIds: (restaurant.categoryIds || []).filter(categoryId => categoryId !== category.id),
        }));
        state.participants = state.participants.map(person => ({
          ...person,
          excluded: person.excluded.filter(name => name !== category.name),
        }));
        if (manageCategory === category.name) manageCategory = null;
        if (listCategory === category.name) listCategory = null;
        update();
      }
      toast('카테고리를 삭제했어요.');
    } catch { /* toast already shown */ }
  }, '삭제하기');
}

function renderCategoryManager() {
  const list = $('#category-manage-list');
  list.replaceChildren();
  state.categories.forEach(category => {
    const row = element('div', 'manage-row category-manage-row');
    const meta = element('div');
    const count = restaurantsUsingCategory(category.name).length;
    meta.append(element('strong', '', category.name), element('small', '', `${count}곳의 음식점`));
    const remove = element('button', 'text-button', '삭제');
    remove.setAttribute('aria-label', `${category.name} 카테고리 삭제`);
    remove.onclick = () => requestDeleteCategory(category);
    row.append(element('span', 'food-tile', foodEmoji(category.name)), meta, remove);
    list.append(row);
  });
  if (!state.categories.length) list.append(element('div', 'empty-people', '아직 등록된 카테고리가 없어요.'));
}

function fillCategoryPicker(picker, inputName, selectedNames = []) {
  picker.replaceChildren();
  if (!state.categories.length) {
    picker.append(element('p', 'empty-people', '먼저 카테고리를 추가해 주세요.'));
    return;
  }
  state.categories.forEach(category => {
    const label = element('label', 'category-option');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = inputName;
    input.value = category.id;
    input.checked = selectedNames.includes(category.name);
    label.append(input, element('span', 'category-option-name', category.name));
    picker.append(label);
  });
}

function renderCategoryPicker(selectedNames = []) {
  fillCategoryPicker($('#restaurant-category-picker'), 'restaurant-categories', selectedNames);
}

function renderEditCategoryPicker(selectedNames = []) {
  fillCategoryPicker($('#edit-restaurant-category-picker'), 'edit-restaurant-categories', selectedNames);
}

function selectedCategoriesFrom(pickerSelector) {
  const selected = [...document.querySelectorAll(`${pickerSelector} input:checked`)];
  const categoryIds = selected.map(input => input.value);
  const categoryNames = selected
    .map(input => state.categories.find(category => category.id === input.value)?.name)
    .filter(Boolean);
  return { categoryIds, categoryNames };
}

function openEditRestaurant(restaurant) {
  editingRestaurantId = restaurant.id;
  $('#edit-restaurant-title').textContent = '카테고리 수정';
  $('#edit-restaurant-name').textContent = restaurant.name;
  $('#edit-category-name').value = '';
  clearFieldError('#edit-category-name');
  renderEditCategoryPicker(restaurantCategories(restaurant));
  $('#edit-restaurant-dialog').showModal();
}

function renderManageList() {
  if (manageCategory !== null && !categories().includes(manageCategory)) manageCategory = null;
  renderCategoryFilters($('#manage-filters'), manageCategory, 'manage-list', category => {
    manageCategory = category;
    renderManageList();
  });
  const manage = $('#manage-list');
  manage.replaceChildren();
  state.restaurants
    .filter(restaurant => manageCategory === null || restaurantCategories(restaurant).includes(manageCategory))
    .forEach(restaurant => {
      const row = element('div', 'manage-row');
      const rowMeta = element('div');
      rowMeta.append(element('strong', '', restaurant.name), element('small', '', categoryLabel(restaurant)));
      const actions = element('div', 'manage-actions');
      const edit = element('button', 'text-button edit', '수정');
      edit.setAttribute('aria-label', `${restaurant.name} 카테고리 수정`);
      edit.onclick = () => openEditRestaurant(restaurant);
      const remove = element('button', 'text-button', '삭제');
      remove.setAttribute('aria-label', `${restaurant.name} 음식점 삭제`);
      remove.onclick = () => confirm('음식점을 삭제할까요?', `${restaurant.name}을(를) 팀 점심 목록에서 삭제해요.`, async () => {
        try {
          if (isConfigured && remoteReady) await withSync(() => removeRestaurant(restaurant.id));
          state.restaurants = state.restaurants.filter(item => item.id !== restaurant.id);
          update();
          toast('음식점을 삭제했어요.');
        } catch { /* toast already shown */ }
      }, '삭제하기');
      actions.append(edit, remove);
      row.append(element('span', 'food-tile', foodEmoji(primaryCategory(restaurant))), rowMeta, actions);
      manage.append(row);
    });
  if (!state.restaurants.length) manage.append(element('div', 'empty-people', '아직 등록된 음식점이 없어요.'));
}

function renderRestaurantList() {
  if (listCategory !== null && !categories().includes(listCategory)) listCategory = null;
  renderCategoryFilters($('#restaurant-filters'), listCategory, 'restaurant-list', category => {
    listCategory = category;
    renderRestaurantList();
  });
  const list = $('#restaurant-list');
  const visible = state.restaurants.filter(restaurant => listCategory === null || restaurantCategories(restaurant).includes(listCategory));
  list.replaceChildren();
  visible.forEach(restaurant => {
    const row = element('article', 'restaurant-item');
    const isNew = isNewRestaurant(restaurant);
    row.setAttribute('aria-label', `${isNew ? '신규, ' : ''}${restaurant.name}, ${categoryLabel(restaurant)}`);
    const title = element('h3', '');
    if (isNew) {
      const badge = element('span', 'new-badge', 'N');
      badge.setAttribute('aria-hidden', 'true');
      title.append(badge, document.createTextNode(restaurant.name));
    } else {
      title.textContent = restaurant.name;
    }
    const tags = element('div', 'restaurant-categories');
    restaurantCategories(restaurant).forEach(category => tags.append(element('span', 'restaurant-category', category)));
    row.append(title, tags);
    list.append(row);
  });
  if (!state.restaurants.length) list.append(element('div', 'empty-restaurants', '점심 리스트가 비어 있어요. 첫 번째 맛집을 추가해 주세요!'));
  $('#restaurant-count').textContent = listCategory === null ? state.restaurants.length : `${visible.length} / ${state.restaurants.length}`;
}

function renderRestaurants() {
  renderRestaurantList();
  renderManageList();
  renderCategoryManager();
  renderCategoryPicker();
}

function render() {
  ensureSelfParticipant();
  const candidates = eligibleRestaurants(state.restaurants, teamExcluded());
  $('#today').textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  $('#today').dateTime = state.day;
  renderIdentity();
  renderCategories();
  renderTodayVotes();
  renderWheel(candidates);
  renderRestaurants();
  $('#picker-title').textContent = candidates.length ? '오늘의 맛있는 운명은?' : '잠깐, 먹을 곳이 없어요!';
  $('#candidate-count').textContent = candidates.length ? `${candidates.length}곳의 음식점이 기다리고 있어요` : state.restaurants.length ? '제외한 카테고리를 하나만 풀어볼까요?' : '우리 팀의 첫 번째 음식점을 추가해 주세요.';
  if (!spinning) {
    $('#spin').disabled = !candidates.length;
    setSpinButton(
      hasResult() ? '한 번 더 돌리기'
        : candidates.length === 1 ? '남은 음식점으로 결정하기'
          : '점심 메뉴 돌리기',
    );
  }
}

$('#category-name').addEventListener('input', () => clearFieldError('#category-name'));
$('#edit-category-name').addEventListener('input', () => clearFieldError('#edit-category-name'));
$('#restaurant-name').addEventListener('input', () => clearFieldError('#restaurant-name'));

$('#category-form').onsubmit = async event => {
  event.preventDefault();
  try {
    const created = await addCategoryByName($('#category-name').value, { errorTarget: '#category-name' });
    if (!created) return;
    $('#category-form').reset();
    clearFieldError('#category-name');
    $('#category-name').focus();
  } catch { /* toast already shown */ }
};

$('#edit-category-form').onsubmit = async event => {
  event.preventDefault();
  try {
    const created = await addCategoryByName($('#edit-category-name').value, {
      autoSelectForEdit: true,
      errorTarget: '#edit-category-name',
    });
    if (!created) return;
    $('#edit-category-name').value = '';
    clearFieldError('#edit-category-name');
    $('#edit-category-name').focus();
  } catch { /* toast already shown */ }
};

$('#restaurant-form').onsubmit = async event => {
  event.preventDefault();
  const name = $('#restaurant-name').value.trim();
  const { categoryIds, categoryNames } = selectedCategoriesFrom('#restaurant-category-picker');
  if (!name) return showFieldError('#restaurant-name', '음식점 이름을 입력해 주세요.');
  if (!categoryNames.length) return toast('카테고리를 하나 이상 선택해 주세요.');
  if (state.restaurants.length >= 100) return toast('음식점은 최대 100곳까지 추가할 수 있어요.');
  if (state.restaurants.some(restaurant => restaurant.name === name)) {
    return showFieldError('#restaurant-name', '이미 등록된 음식점 이름이에요.');
  }
  clearFieldError('#restaurant-name');
  try {
    let restaurantId = id();
    let createdAt = new Date().toISOString();
    if (isConfigured && remoteReady) {
      const created = await withSync(() => createRestaurant(name, categoryIds));
      restaurantId = created.id;
      createdAt = created.createdAt || createdAt;
    }
    state.restaurants.push({ id: restaurantId, name, categories: categoryNames, categoryIds, createdAt });
    manageCategory = categoryNames[0];
    $('#restaurant-form').reset();
    clearFieldError('#restaurant-name');
    renderCategoryPicker();
    update();
    toast(`${name}, 점심 리스트에 추가했어요!`);
    $('#restaurant-name').focus();
  } catch { /* toast already shown */ }
};

$('#edit-restaurant-form').onsubmit = async event => {
  event.preventDefault();
  const restaurant = state.restaurants.find(item => item.id === editingRestaurantId);
  if (!restaurant) {
    $('#edit-restaurant-dialog').close();
    return toast('음식점을 찾지 못했어요.');
  }
  const { categoryIds, categoryNames } = selectedCategoriesFrom('#edit-restaurant-category-picker');
  if (!categoryNames.length) return toast('카테고리를 하나 이상 선택해 주세요.');
  try {
    if (isConfigured && remoteReady) {
      await withSync(() => updateRestaurantCategories(restaurant.id, categoryIds));
    }
    restaurant.categories = categoryNames;
    restaurant.categoryIds = categoryIds;
    if (manageCategory !== null && !categoryNames.includes(manageCategory)) manageCategory = categoryNames[0];
    $('#edit-restaurant-dialog').close();
    editingRestaurantId = null;
    update();
    toast(`${restaurant.name} 카테고리를 수정했어요.`);
  } catch { /* toast already shown */ }
};

$('#reroll-nickname').onclick = async () => {
  ensureToday();
  const nickname = uniqueNickname(makeNickname(), takenNicknames());
  persistIdentity({ ...identity, nickname });
  ensureSelfParticipant().nickname = nickname;
  update();
  revealNickname();
  try {
    await syncParticipant();
    toast(`오늘은 ${nickname}!`);
  } catch { /* toast already shown */ }
};

$('#spin').onclick = () => {
  ensureToday();
  if (spinning) return;
  const candidates = eligibleRestaurants(state.restaurants, teamExcluded());
  if (!candidates.length) return;
  spinning = true;
  const selectedIndex = randomIndex(candidates.length);
  const selected = candidates[selectedIndex];
  clearResult();
  $('#spin').disabled = true;
  $('#spin').textContent = '맛있는 운명을 고르는 중…';
  const target = (360 - (selectedIndex + .5) * 360 / candidates.length) % 360;
  const delta = ((target - rotation % 360) + 360) % 360;
  rotation += 360 * 6 + delta;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('#wheel').style.transition = reduced ? 'none' : 'transform 3.6s cubic-bezier(.13,.65,.12,1)';
  $('#wheel').style.transform = `rotate(${rotation}deg)`;
  spinTimer = setTimeout(() => {
    spinning = false;
    showResult(selected);
    $('#spin').disabled = false;
    setSpinButton('한 번 더 돌리기');
  }, reduced ? 100 : 3650);
};

document.querySelectorAll('[data-manage-tab]').forEach(button => {
  button.onclick = () => setManageTab(button.dataset.manageTab);
});
$('#settings-open').onclick = () => openSettings(manageTab);
$('#add-restaurant-open').onclick = () => openSettings('restaurants', '#restaurant-name');
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(`#${button.dataset.close}`).close(); });
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
});
$('#confirm-action').onclick = () => { $('#confirm-dialog').close(); const action = confirmAction; confirmAction = undefined; action?.(); };

function importShare() {
  if (!location.hash.startsWith('#lunch=')) return;
  if (isConfigured) {
    toast('팀 공유 저장을 쓰는 중이라 공유 링크 가져오기는 건너뛰어요.');
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  try {
    const shared = decodeShare(location.hash.slice(7));
    const oldDay = shared.day !== dayKey();
    confirm('동료의 점심 리스트가 도착했어요', `음식점 ${shared.restaurants.length}곳과 제외 카테고리 선택으로 이 브라우저의 내용을 교체해요.\n${oldDay ? '지난 날짜의 제외 선택은 비우고 가져와요.' : '오늘의 제외 카테고리도 함께 가져와요.'}\n링크를 만든 뒤의 변경 사항은 자동으로 반영되지 않아요.`, () => {
      state = restore(shared);
      update();
      history.replaceState(null, '', location.pathname + location.search);
      toast('공유받은 목록과 선택을 가져왔어요.');
    }, '가져오기');
  } catch {
    toast('공유 링크를 읽을 수 없어요. 동료에게 새 링크를 요청해 주세요.');
  }
}

window.addEventListener('hashchange', importShare);
window.addEventListener('storage', event => {
  if (isConfigured) return;
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try { state = restore(JSON.parse(event.newValue)); cancelSpin(); clearResult(); render(); } catch { /* Invalid data never replaces the current list. */ }
});
window.addEventListener('focus', ensureToday);
window.addEventListener('resize', () => { if (!spinning) renderWheel(eligibleRestaurants(state.restaurants, teamExcluded())); });
setInterval(ensureToday, 30000);
persist();
render();
importShare();

if (isConfigured) {
  refreshFromRemote()
    .then(async () => {
      toast(`팀 점심 목록에 연결했어요. 음식점 ${state.restaurants.length}곳`);
      try { await syncParticipant(); } catch { /* toast already shown */ }
      subscribeToChanges(() => {
        if (syncing || spinning) return;
        refreshFromRemote().catch(() => {});
      });
    })
    .catch(error => {
      remoteReady = false;
      setBadge('팀 목록 연결 실패 · 로컬 저장', false);
      console.error(error);
      toast(describeError(error));
    });
}
