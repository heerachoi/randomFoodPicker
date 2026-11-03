import { DEFAULT_RESTAURANTS } from './restaurants.js';
import { dayKey, eligibleRestaurants, safeUrl, validateState, encodeShare, decodeShare, randomIndex } from './lib.js';

const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'lunchmate.v1';
const COLORS = ['#f4dc9f', '#f4b597', '#d2dfc3', '#e8c8ac', '#d1e3de', '#efd1b7'];
const clone = value => JSON.parse(JSON.stringify(value));
const id = () => crypto.randomUUID();
let state = freshState();
let spinTimer, toastTimer, rotation = 0, spinning = false, confirmAction;
let storageAvailable = true;

function freshState() {
  return { version: 1, day: dayKey(), restaurants: clone(DEFAULT_RESTAURANTS), participants: [{ id: id(), name: '나', excluded: [] }] };
}

function foodEmoji(category) {
  const match = [['쌀국수|국수|면|우동|라멘', '🍜'], ['햄버거|버거', '🍔'], ['중식|마라|짜장', '🥟'], ['한식|백반|찌개|국밥', '🍚'], ['일식|초밥|돈가스|돈까스', '🍣'], ['양식|파스타', '🍝'], ['피자', '🍕'], ['치킨|닭', '🍗'], ['분식|떡볶이', '🍢'], ['샐러드', '🥗'], ['고기|삼겹|구이', '🥩']].find(([pattern]) => new RegExp(pattern).test(category));
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
  if (!validateState(saved)) throw new Error('저장한 내용을 읽을 수 없습니다.');
  // Apply new source defaults without losing local additions and removals.
  if (Array.isArray(saved.baseline) && saved.baseline.every(r => r && typeof r.id === 'string')) {
    const baseline = new Map(saved.baseline.map(r => [r.id, r]));
    const current = new Map(saved.restaurants.map(r => [r.id, r]));
    const defaults = new Map(DEFAULT_RESTAURANTS.map(r => [r.id, r]));
    const merged = [];
    for (const restaurant of saved.restaurants) {
      const old = baseline.get(restaurant.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(restaurant)) merged.push(restaurant);
      else if (defaults.has(restaurant.id)) merged.push(clone(defaults.get(restaurant.id)));
    }
    for (const restaurant of DEFAULT_RESTAURANTS) {
      if (!baseline.has(restaurant.id) && !current.has(restaurant.id)) merged.push(clone(restaurant));
    }
    if (merged.length <= 100) saved.restaurants = merged;
  }
  delete saved.baseline;
  if (saved.day !== dayKey()) {
    saved.day = dayKey();
    saved.participants = saved.participants.map(person => ({ ...person, excluded: [] }));
  }
  return saved;
}

try {
  const saved = localStorage.getItem(STORAGE_KEY);
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
    toast('브라우저 저장 공간을 사용할 수 없어요. 닫기 전에 공유 링크를 보관해 주세요.');
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
  state.participants.forEach(person => { person.excluded = []; });
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

function renderPeople() {
  const container = $('#participants');
  container.replaceChildren();
  if (!state.participants.length) {
    container.append(element('div', 'empty-people', '함께 먹을 팀원을 추가해 주세요.\n제외할 메뉴가 없다면 바로 돌려도 좋아요!'));
  }
  state.participants.forEach((person, index) => {
    const article = element('article', 'participant');
    const heading = element('div', 'participant-heading');
    heading.append(element('span', 'avatar', person.name.slice(0, 1)), element('span', 'participant-name', person.name), element('span', 'participant-label', '오늘의 취향'));
    const remove = element('button', 'icon-button', '×');
    remove.setAttribute('aria-label', `${person.name} 팀원 삭제`);
    remove.onclick = () => { state.participants = state.participants.filter(p => p.id !== person.id); update(); };
    heading.append(remove);
    const chips = element('div', 'category-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', `${person.name}의 제외 카테고리`);
    categories().forEach(category => {
      const selected = person.excluded.includes(category);
      const button = element('button', 'category-chip');
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${person.name}: ${category} 제외`);
      button.append(element('span', 'chip-indicator', selected ? '✓' : ''), element('span', '', category));
      button.onclick = () => {
        ensureToday();
        person.excluded = selected ? person.excluded.filter(c => c !== category) : [...person.excluded, category];
        update();
        const next = [...$('#participants').querySelectorAll('.participant')][index]?.querySelector(`[aria-label="${CSS.escape(`${person.name}: ${category} 제외`)}"]`);
        next?.focus({ preventScroll: true });
      };
      chips.append(button);
    });
    if (!categories().length) chips.append(element('span', 'participant-label', '음식점을 추가하면 카테고리가 표시돼요.'));
    article.append(heading, chips);
    container.append(article);
  });
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

function renderRestaurants(candidates) {
  const eligibleIds = new Set(candidates.map(r => r.id));
  const grid = $('#restaurant-list');
  const manage = $('#manage-list');
  grid.replaceChildren();
  manage.replaceChildren();
  state.restaurants.forEach(restaurant => {
    const eligible = eligibleIds.has(restaurant.id);
    const card = element('a', `restaurant-card${eligible ? '' : ' excluded'}`);
    card.href = safeUrl(restaurant.url);
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.setAttribute('aria-label', `${restaurant.name}, ${restaurant.category}, ${eligible ? '오늘의 후보' : '오늘 제외'}, 음식점 링크 새 창으로 열기`);
    const tile = element('span', 'food-tile', foodEmoji(restaurant.category));
    tile.setAttribute('aria-hidden', 'true');
    const meta = element('div', 'restaurant-meta');
    meta.append(element('span', 'category-tag', restaurant.category), element('h3', '', restaurant.name), element('span', 'restaurant-status', eligible ? '오늘의 후보' : '오늘은 쉬어가요'));
    card.append(tile, meta, element('span', 'card-arrow', '↗'));
    grid.append(card);
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
  if (!state.restaurants.length) {
    grid.append(element('div', 'empty-restaurants', '점심 리스트가 비어 있어요. 첫 번째 맛집을 추가해 주세요!'));
    manage.append(element('div', 'empty-people', '아직 등록된 음식점이 없어요.'));
  }
  $('#restaurant-count').textContent = state.restaurants.length;
  $('#category-options').replaceChildren(...categories().map(category => {
    const option = element('option'); option.value = category; return option;
  }));
}

function render() {
  const candidates = eligibleRestaurants(state.restaurants, state.participants);
  $('#today').textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  $('#today').dateTime = state.day;
  renderPeople();
  renderWheel(candidates);
  renderRestaurants(candidates);
  const excluded = categories().filter(category => state.participants.some(p => p.excluded.includes(category)));
  $('#excluded-label').textContent = excluded.length ? `${excluded.join(' · ')} 제외했어요` : '모든 카테고리가 열려 있어요';
  $('#excluded-description').textContent = excluded.length ? `한 명이라도 선택한 카테고리는 빼고, ${candidates.length}곳에서 골라요.` : '제외할 메뉴가 없다면 바로 돌려도 좋아요.';
  $('#picker-title').textContent = candidates.length ? '오늘의 맛있는 운명은?' : '잠깐, 먹을 곳이 없어요!';
  $('#candidate-count').textContent = candidates.length ? `${candidates.length}곳의 음식점이 기다리고 있어요` : state.restaurants.length ? '제외한 카테고리를 하나만 풀어볼까요?' : '우리 팀의 첫 번째 음식점을 추가해 주세요.';
  $('#spin').disabled = !candidates.length;
  $('#spin').replaceChildren(element('span', '', '↻'), document.createTextNode(candidates.length === 1 ? '남은 음식점으로 결정하기' : '점심 메뉴 돌리기'), element('span', '', '↗'));
  $('#reset-preferences').disabled = !state.participants.some(p => p.excluded.length);
  $('#picker-footnote').textContent = candidates.length ? '모두의 제외 카테고리를 반영해서 공평하게 뽑아요.' : '아래 목록에서 후보를 확인하고 제외 선택을 조정해 주세요.';
}

$('#person-form').onsubmit = event => {
  event.preventDefault();
  ensureToday();
  const input = $('#person-name');
  const name = input.value.trim();
  if (!name) { input.setCustomValidity('이름을 입력해 주세요.'); input.reportValidity(); return; }
  if (state.participants.length >= 50) return toast('팀원은 최대 50명까지 추가할 수 있어요.');
  if (state.participants.some(p => p.name === name)) return toast('이미 등록한 이름이에요. 다른 닉네임을 사용해 주세요.');
  state.participants.push({ id: id(), name, excluded: [] });
  input.value = '';
  update();
  input.focus();
};
$('#person-name').oninput = event => event.target.setCustomValidity('');

$('#reset-preferences').onclick = () => confirm('오늘의 제외 선택을 비울까요?', '팀원 이름은 유지하고 모든 팀원의 제외 카테고리를 초기화해요.', () => {
  state.participants.forEach(p => { p.excluded = []; });
  update();
  toast('모든 카테고리를 다시 열었어요.');
}, '초기화하기');

$('#restaurant-form').onsubmit = event => {
  event.preventDefault();
  const name = $('#restaurant-name').value.trim();
  const category = $('#restaurant-category').value.trim();
  const url = safeUrl($('#restaurant-url').value.trim());
  if (!name || !category || !url) return toast('이름, 카테고리, 올바른 http(s) 링크를 입력해 주세요.');
  if (state.restaurants.length >= 100) return toast('음식점은 최대 100곳까지 추가할 수 있어요.');
  if (state.restaurants.some(r => r.name === name)) return toast('이미 등록된 음식점 이름이에요.');
  state.restaurants.push({ id: id(), name, category, url });
  $('#restaurant-form').reset();
  update();
  toast(`${name}, 점심 리스트에 추가했어요!`);
  $('#restaurant-name').focus();
};

$('#spin').onclick = () => {
  ensureToday();
  if (spinning) return;
  const candidates = eligibleRestaurants(state.restaurants, state.participants);
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
    const link = element('a', '', '음식점 보러 가기 ↗');
    link.href = safeUrl(selected.url);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    result.replaceChildren(element('strong', '', `${foodEmoji(selected.category)} 오늘은 ${selected.name}!`), element('p', '', `${selected.category} 먹으러 가요. 맛있는 점심 되세요!`), link);
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

$('#export-list').onclick = () => {
  const source = `// 점심메이트 기본 음식점 목록\nexport const DEFAULT_RESTAURANTS = ${JSON.stringify(state.restaurants, null, 2)};\n`;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript;charset=utf-8' }));
  const link = element('a');
  link.href = url;
  link.download = 'restaurants.js';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('파일을 GitHub의 restaurants.js와 교체하면 기본 목록에 반영돼요.');
};

$('#share').onclick = () => {
  ensureToday();
  const url = new URL(location.href);
  url.hash = `lunch=${encodeShare(state)}`;
  if (url.href.length > 60000) return toast('공유할 내용이 너무 많아요. 음식점이나 팀원 수를 줄여 주세요.');
  $('#share-url').value = url.href;
  $('#share-dialog').showModal();
};
$('#copy-share').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('#share-url').value);
    $('#share-dialog').close();
    toast('공유 링크를 복사했어요. 동료에게 보내주세요!');
  } catch {
    $('#share-url').focus();
    $('#share-url').select();
    toast('링크를 선택했어요. 복사해서 전달해 주세요.');
  }
};

function importShare() {
  if (!location.hash.startsWith('#lunch=')) return;
  try {
    const shared = decodeShare(location.hash.slice(7));
    const oldDay = shared.day !== dayKey();
    confirm('동료의 점심 리스트가 도착했어요', `음식점 ${shared.restaurants.length}곳과 팀원 ${shared.participants.length}명의 선택으로 이 브라우저의 내용을 교체해요.\n${oldDay ? '지난 날짜의 제외 선택은 비우고 가져와요.' : '오늘의 제외 카테고리도 함께 가져와요.'}\n링크를 만든 뒤의 변경 사항은 자동으로 반영되지 않아요.`, () => {
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
window.addEventListener('resize', () => { if (!spinning) renderWheel(eligibleRestaurants(state.restaurants, state.participants)); });
setInterval(ensureToday, 30000);
persist();
render();
importShare();
