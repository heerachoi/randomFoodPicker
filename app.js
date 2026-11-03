import { DEFAULT_RESTAURANTS } from './restaurants.js';
import { dayKey, eligibleRestaurants, restoreState, decodeShare, randomIndex } from './lib.js';

const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'lunchmate.v2';
const COLORS = ['#f4dc9f', '#f4b597', '#d2dfc3', '#e8c8ac', '#d1e3de', '#efd1b7'];
const clone = value => JSON.parse(JSON.stringify(value));
const id = () => crypto.randomUUID();
let state = freshState();
let spinTimer, toastTimer, rotation = 0, spinning = false, confirmAction;
let storageAvailable = true;
let manageCategory = null;
let listCategory = null;

function freshState() {
  return { version: 2, day: dayKey(), restaurants: clone(DEFAULT_RESTAURANTS), excluded: [] };
}

function foodEmoji(category) {
  const match = [['쌀국수|국수|면|우동|라멘', '🍜'], ['햄버거|버거', '🍔'], ['중식|마라|짜장', '🥟'], ['순대국|국밥', '🍲'], ['한식|백반|찌개', '🍚'], ['돈까츠|돈가스|돈까스', '🍱'], ['일식|초밥', '🍣'], ['양식|파스타', '🍝'], ['피자', '🍕'], ['치킨|닭', '🍗'], ['분식|떡볶이', '🍢'], ['건강식|샐러드', '🥗'], ['샌드위치', '🥪'], ['고기|삼겹|구이', '🥩']].find(([pattern]) => new RegExp(pattern).test(category));
  return match?.[1] || '🍽️';
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4300);
}

function restore(saved) {
  return restoreState(saved, DEFAULT_RESTAURANTS);
}

try {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('lunchmate.v1');
  if (saved) state = restore(JSON.parse(saved));
} catch {
  toast('저장된 내용을 읽지 못해 기본 목록으로 열었어요.');
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, baseline: DEFAULT_RESTAURANTS }));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
    toast('브라우저 저장 공간을 사용할 수 없어 이번 화면에서만 유지돼요.');
  }
  $('.storage-badge').lastChild.textContent = storageAvailable ? ' 이 브라우저에 저장 중' : ' 이번 화면에서만 유지 중';
}

function cancelSpin() {
  clearTimeout(spinTimer);
  spinning = false;
  rotation = 0;
  $('#wheel').style.transition = 'none';
  $('#wheel').style.transform = 'rotate(0deg)';
}

function update() {
  cancelSpin();
  $('#result').hidden = true;
  persist();
  render();
}

function ensureToday() {
  if (state.day === dayKey()) return;
  state.day = dayKey();
  state.excluded = [];
  update();
  toast('새로운 날이에요! 오늘의 제외 선택을 초기화했어요.');
}

function confirm(title, description, action, label = '확인') {
  $('#confirm-title').textContent = title;
  $('#confirm-description').textContent = description;
  $('#confirm-action').textContent = label;
  confirmAction = action;
  $('#confirm-dialog').showModal();
}

function categories() { return [...new Set(state.restaurants.map(r => r.category))]; }

function renderCategories() {
  const container = $('#category-choices');
  container.replaceChildren();
  categories().forEach(category => {
    const selected = state.excluded.includes(category);
    const count = state.restaurants.filter(r => r.category === category).length;
    const button = element('button', 'category-chip');
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${category} 제외`);
    const emoji = element('span', 'category-emoji', foodEmoji(category));
    emoji.setAttribute('aria-hidden', 'true');
    button.append(emoji, element('span', 'category-name', category), element('span', 'category-count', `${count}곳`), element('span', 'chip-indicator', selected ? '✓' : ''));
    button.onclick = () => {
      ensureToday();
      state.excluded = state.excluded.includes(category) ? state.excluded.filter(c => c !== category) : [...state.excluded, category];
      update();
      [...container.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === `${category} 제외`)?.focus({ preventScroll: true });
    };
    container.append(button);
  });
  if (!categories().length) container.append(element('p', 'empty-people', '음식점을 추가하면 카테고리가 표시돼요.'));
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
    label.append(element('span', 'food-emoji', foodEmoji(restaurant.category)), element('span', 'wheel-name', restaurant.name));
    wheel.append(label);
  });
}

function renderCategoryFilters(filters, selectedCategory, listId, onChange) {
  filters.replaceChildren();
  [null, ...categories()].forEach(category => {
    const button = element('button', 'manage-filter');
    const label = category ?? '전체';
    const count = category === null ? state.restaurants.length : state.restaurants.filter(r => r.category === category).length;
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

function renderManageList() {
  if (manageCategory !== null && !categories().includes(manageCategory)) manageCategory = null;
  renderCategoryFilters($('#manage-filters'), manageCategory, 'manage-list', category => {
    manageCategory = category;
    renderManageList();
  });
  const manage = $('#manage-list');
  manage.replaceChildren();
  state.restaurants.filter(r => manageCategory === null || r.category === manageCategory).forEach(restaurant => {
    const row = element('div', 'manage-row');
    const rowMeta = element('div');
    rowMeta.append(element('strong', '', restaurant.name), element('small', '', restaurant.category));
    const remove = element('button', 'text-button', '삭제');
    remove.setAttribute('aria-label', `${restaurant.name} 음식점 삭제`);
    remove.onclick = () => confirm('음식점을 삭제할까요?', `${restaurant.name}을(를) 이 브라우저의 점심 목록에서 삭제해요.`, () => {
      state.restaurants = state.restaurants.filter(r => r.id !== restaurant.id);
      update();
      toast('음식점을 삭제했어요.');
    }, '삭제하기');
    row.append(element('span', 'food-tile', foodEmoji(restaurant.category)), rowMeta, remove);
    manage.append(row);
  });
  if (!state.restaurants.length) manage.append(element('div', 'empty-people', '아직 등록된 음식점이 없어요.'));
}

function renderRestaurantList(candidates) {
  if (listCategory !== null && !categories().includes(listCategory)) listCategory = null;
  renderCategoryFilters($('#restaurant-filters'), listCategory, 'restaurant-list', category => {
    listCategory = category;
    renderRestaurantList(eligibleRestaurants(state.restaurants, state.excluded));
  });
  const eligibleIds = new Set(candidates.map(r => r.id));
  const list = $('#restaurant-list');
  const visible = state.restaurants.filter(r => listCategory === null || r.category === listCategory);
  list.replaceChildren();
  visible.forEach(restaurant => {
    const eligible = eligibleIds.has(restaurant.id);
    const row = element('article', `restaurant-item${eligible ? '' : ' excluded'}`);
    row.setAttribute('aria-label', `${restaurant.name}, ${restaurant.category}, ${eligible ? '오늘의 후보' : '오늘 제외'}`);
    const status = element('span', 'restaurant-status-dot');
    status.setAttribute('aria-hidden', 'true');
    row.append(status, element('h3', '', restaurant.name), element('span', 'restaurant-category', restaurant.category));
    list.append(row);
  });
  if (!state.restaurants.length) list.append(element('div', 'empty-restaurants', '점심 리스트가 비어 있어요. 첫 번째 맛집을 추가해 주세요!'));
  $('#restaurant-count').textContent = listCategory === null ? state.restaurants.length : `${visible.length} / ${state.restaurants.length}`;
}

function renderRestaurants(candidates) {
  renderRestaurantList(candidates);
  renderManageList();
  $('#category-options').replaceChildren(...categories().map(category => {
    const option = element('option'); option.value = category; return option;
  }));
}

function render() {
  const candidates = eligibleRestaurants(state.restaurants, state.excluded);
  $('#today').textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  $('#today').dateTime = state.day;
  renderCategories();
  renderWheel(candidates);
  renderRestaurants(candidates);
  $('#picker-title').textContent = candidates.length ? '오늘의 맛있는 운명은?' : '잠깐, 먹을 곳이 없어요!';
  $('#candidate-count').textContent = candidates.length ? `${candidates.length}곳의 음식점이 기다리고 있어요` : state.restaurants.length ? '제외한 카테고리를 하나만 풀어볼까요?' : '우리 팀의 첫 번째 음식점을 추가해 주세요.';
  $('#spin').disabled = !candidates.length;
  $('#spin').replaceChildren(element('span', '', '↻'), document.createTextNode(candidates.length === 1 ? '남은 음식점으로 결정하기' : '점심 메뉴 돌리기'), element('span', '', '↗'));
}

$('#restaurant-form').onsubmit = event => {
  event.preventDefault();
  const name = $('#restaurant-name').value.trim();
  const category = $('#restaurant-category').value.trim();
  if (!name || !category) return toast('음식점 이름과 카테고리를 입력해 주세요.');
  if (state.restaurants.length >= 100) return toast('음식점은 최대 100곳까지 추가할 수 있어요.');
  if (state.restaurants.some(r => r.name === name)) return toast('이미 등록된 음식점 이름이에요.');
  state.restaurants.push({ id: id(), name, category });
  manageCategory = category;
  $('#restaurant-form').reset();
  update();
  toast(`${name}, 점심 리스트에 추가했어요!`);
  $('#restaurant-name').focus();
};

$('#spin').onclick = () => {
  ensureToday();
  if (spinning) return;
  const candidates = eligibleRestaurants(state.restaurants, state.excluded);
  if (!candidates.length) return;
  spinning = true;
  const selectedIndex = randomIndex(candidates.length);
  const selected = candidates[selectedIndex];
  $('#result').hidden = true;
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
    const result = $('#result');
    result.replaceChildren(element('strong', '', `${foodEmoji(selected.category)} 오늘은 ${selected.name}!`), element('p', '', `${selected.category} 먹으러 가요. 맛있는 점심 되세요!`));
    result.hidden = false;
    $('#spin').disabled = false;
    $('#spin').replaceChildren(element('span', '', '↻'), document.createTextNode('한 번 더 돌리기'), element('span', '', '↗'));
  }, reduced ? 100 : 3650);
};

$('#settings-open').onclick = () => $('#settings-dialog').showModal();
$('#add-restaurant-open').onclick = () => { $('#settings-dialog').showModal(); $('#restaurant-name').focus(); };
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
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try { state = restore(JSON.parse(event.newValue)); cancelSpin(); $('#result').hidden = true; render(); } catch { /* Invalid data never replaces the current list. */ }
});
window.addEventListener('focus', ensureToday);
window.addEventListener('resize', () => { if (!spinning) renderWheel(eligibleRestaurants(state.restaurants, state.excluded)); });
setInterval(ensureToday, 30000);
persist();
render();
importShare();
