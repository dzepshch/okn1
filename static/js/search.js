const API = '/api';

const state = {
  query:    '',
  adm_area: '',
  district: '',
  obj_type: '',
  category: '',
  year_built: '',
  year_period: '',
  photo: '',
  page:     1,
  per_page: 20,
  view:     'list',
  total:    0,
  total_pages: 1,
  year_start: '',
  year_end: '',
};

const searchInput   = document.getElementById('search-input');
const searchBtn     = document.getElementById('search-btn');
const filterAdm     = document.getElementById('filter-adm');
const filterType    = document.getElementById('filter-type');
const filterCat     = document.getElementById('filter-cat');
const filterReset   = document.getElementById('filter-reset');
const viewList      = document.getElementById('view-list');
const viewMap       = document.getElementById('view-map');
const resultsCount  = document.getElementById('results-count');
const objectsGrid   = document.getElementById('objects-grid');
const pagination    = document.getElementById('pagination');
const searchContent = document.getElementById('search-content');
const modalOverlay  = document.getElementById('modal-overlay');
const filterYearStart = document.getElementById('filter-year-start');
const filterYearEnd   = document.getElementById('filter-year-end');

let ymap = null;
let mapMarkers = [];

async function loadFilters() {
  try {
    const res  = await fetch(`${API}/filters`);
    const data = await res.json();

    fillSelect(filterAdm,  data.adm_areas,  'Все округа');
    fillSelect(filterType, data.obj_types,   'Все типы');
    fillSelect(filterCat,  data.categories,  'Все категории');

    const params = new URLSearchParams(window.location.search);
    if (params.get('adm_area')) { filterAdm.value  = params.get('adm_area'); state.adm_area = params.get('adm_area'); }
    if (params.get('obj_type')) { filterType.value = params.get('obj_type'); state.obj_type = params.get('obj_type'); }

    loadObjects();
  } catch (e) {
    console.error('Ошибка загрузки фильтров:', e);
    loadObjects();
  }
}

function fillSelect(el, values, placeholder) {
  el.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
}

async function loadObjects() {
  showLoading();

  const params = new URLSearchParams();
  if (state.query)    params.set('q',        state.query);
  if (state.adm_area) params.set('adm_area', state.adm_area);
  if (state.district) params.set('district', state.district);
  if (state.obj_type) params.set('obj_type', state.obj_type);
  if (state.category) params.set('category', state.category);
  if (state.year_built) params.set('year_built', state.year_built);
  if (state.year_period) params.set('year_period', state.year_period);
  if (state.obj_type) url += `&obj_type=${encodeURIComponent(state.obj_type)}`;
  if (state.category) url += `&category=${encodeURIComponent(state.category)}`;
  // Дописываем наши новые фильтры:
  if (state.year_start) url += `&year_start=${encodeURIComponent(state.year_start)}`;
  if (state.year_end)   url += `&year_end=${encodeURIComponent(state.year_end)}`;
  params.set('page',     state.page);
  params.set('per_page', state.per_page);

  try {
    const res  = await fetch(`${API}/objects?${params}`);
    const data = await res.json();

    state.total       = data.pagination.total;
    state.total_pages = data.pagination.total_pages;

    renderObjects(data.objects);
    renderPagination();
    updateCount();

    if (state.view === 'map') {
      renderMapMarkers(data.objects);
    }
  } catch (e) {
    showError();
    console.error('Ошибка загрузки объектов:', e);
  }
}

function renderObjectsList(objects) {
  if (!objectsGrid) return;
  if (objects.length === 0) {
    objectsGrid.innerHTML = '<div class="no-results">Ничего не найдено</div>';
    return;
  }

  objectsGrid.innerHTML = objects.map(obj => {
    // Безопасно проверяем данные, чтобы не вывело "null" или "undefined"
    const year = obj.year_built ? obj.year_built : '—';
    const period = obj.year_period ? obj.year_period : '—';
    const photoUrl = obj.photo ? obj.photo : '/static/images/placeholder.jpg';

    return `
      <div class="object-card" onclick="openModal(${obj.id})">
        <div class="card-img-wrap" style="height: 160px; overflow: hidden; background: #f0f0f0;">
          <img src="${photoUrl}" alt="${obj.name}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/static/images/placeholder.jpg'">
        </div>
        <div class="card-content">
          <span class="card-type">${obj.obj_type || 'Объект'}</span>
          <h3 class="card-title">${obj.name}</h3>
          <p class="card-address">${obj.address || ''}</p>
          
          <div class="card-years-info" style="margin-top: 8px; font-size: 0.85em; color: #666; display: flex; justify-content: space-between;">
            <span><strong>Год:</strong> ${year}</span>
            <span><strong>Период:</strong> ${period}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPagination() {
  if (state.total_pages <= 1) { pagination.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goPage(${state.page - 1})" ${state.page <= 1 ? 'disabled' : ''}>‹</button>`;

  const delta = 2;
  for (let i = 1; i <= state.total_pages; i++) {
    if (i === 1 || i === state.total_pages || (i >= state.page - delta && i <= state.page + delta)) {
      html += `<button class="page-btn ${i === state.page ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    } else if (i === state.page - delta - 1 || i === state.page + delta + 1) {
      html += `<span style="padding:0 4px;color:var(--ink-soft)">…</span>`;
    }
  }

  html += `<button class="page-btn" onclick="goPage(${state.page + 1})" ${state.page >= state.total_pages ? 'disabled' : ''}>›</button>`;
  pagination.innerHTML = html;
}

function goPage(page) {
  if (page < 1 || page > state.total_pages) return;
  state.page = page;
  loadObjects();
  window.scrollTo(0, 0);
}

function updateCount() {
  resultsCount.innerHTML = `Найдено: <span>${state.total}</span> объектов`;
}

function showLoading() {
  objectsGrid.innerHTML = `<div class="loading"><div class="spinner"></div> Загрузка...</div>`;
}

function showError() {
  objectsGrid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Ошибка загрузки. Проверьте соединение.</p></div>`;
}

function initYMap() {
  if (typeof ymaps === 'undefined') return;
  ymaps.ready(() => {
    ymap = new ymaps.Map('search-map', {
      center: [55.751244, 37.618423],
      zoom: 10,
      controls: ['zoomControl'],
    }, { suppressMapOpenBlock: true });
  });
}

function renderMapMarkers(objects) {
  if (!ymap) return;

  mapMarkers.forEach(m => ymap.geoObjects.remove(m));
  mapMarkers = [];

  const clusterer = new ymaps.Clusterer({
    preset: 'islands#greenClusterIcons',
    groupByCoordinates: false,
  });

  const placemarks = objects
    .filter(o => o.lat && o.lng)
    .map(o => {
      const pm = new ymaps.Placemark(
        [o.lat, o.lng],
        {
          hintContent: o.name,
          balloonContentHeader: o.name,
          balloonContentBody: `${o.obj_type} · ${o.district || o.adm_area}`,
          balloonContentFooter: o.address,
        },
        { preset: 'islands#greenDotIcon' }
      );
      pm.events.add('click', () => openModal(o.id));
      return pm;
    });

  clusterer.add(placemarks);
  ymap.geoObjects.add(clusterer);
  mapMarkers.push(clusterer);

  if (placemarks.length > 0) {
    ymap.setBounds(clusterer.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
  }
}

async function openModal(id) {
  try {
    const res = await fetch(`${API}/objects/${id}`);
    const obj = await res.json();

    document.getElementById('modal-type').textContent     = obj.obj_type || '—';
    document.getElementById('modal-name').textContent     = obj.name;
    document.getElementById('modal-adm').textContent      = obj.adm_area || '—';
    document.getElementById('modal-district').textContent = obj.district || '—';
    document.getElementById('modal-address').textContent  = obj.address || '—';
    document.getElementById('modal-category').textContent = obj.category || '—';
    document.getElementById('modal-id').value             = obj.id;
    document.getElementById('modal-year_built').value     = obj.year_built || '-';
    document.getElementById('modal-year_period').value    = obj.year_period || '-';
    
    const modalImg = document.getElementById('modal-photo-img'); // Твой ID из HTML
    if (modalImg) {
      modalImg.src = obj.photo ? obj.photo : '/static/images/placeholder.jpg';
    }

    modalOverlay.classList.add('open');
  } catch (e) {
    console.error('Ошибка загрузки объекта:', e);
  }
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

document.getElementById('modal-add-route').addEventListener('click', () => {
  const id   = parseInt(document.getElementById('modal-id').value);
  const name = document.getElementById('modal-name').textContent;

  const stored = JSON.parse(sessionStorage.getItem('route_objects') || '[]');
  if (!stored.find(o => o.id === id)) {
    stored.push({ id, name });
    sessionStorage.setItem('route_objects', JSON.stringify(stored));
    document.getElementById('modal-add-route').textContent = '✓ Добавлено';
    setTimeout(() => { document.getElementById('modal-add-route').textContent = 'Добавить в маршрут'; }, 1500);
  }
});

modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeModal();
});

viewList.addEventListener('click', () => {
  state.view = 'list';
  viewList.classList.add('active');
  viewMap.classList.remove('active');
  searchContent.className = 'search-content list-view';
});

viewMap.addEventListener('click', () => {
  state.view = 'map';
  viewMap.classList.add('active');
  viewList.classList.remove('active');
  searchContent.className = 'search-content map-view';
  if (!ymap) initYMap();
  renderMapMarkers([]);
  loadObjects();
});

searchBtn.addEventListener('click', () => {
  state.query = searchInput.value.trim();
  state.page  = 1;
  loadObjects();
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { state.query = searchInput.value.trim(); state.page = 1; loadObjects(); }
});

filterAdm.addEventListener('change',  () => { state.adm_area = filterAdm.value;  state.page = 1; loadObjects(); });
filterType.addEventListener('change', () => { state.obj_type = filterType.value; state.page = 1; loadObjects(); });
filterCat.addEventListener('change',  () => { state.category = filterCat.value;  state.page = 1; loadObjects(); });
filterYearStart.addEventListener('input', () => {
  state.year_start = filterYearStart.value;
  state.page = 1;
  loadObjects();
});

filterYearEnd.addEventListener('input', () => {
  state.year_end = filterYearEnd.value;
  state.page = 1;
  loadObjects();
});

filterReset.addEventListener('click', () => {
  state.query = ''; state.adm_area = ''; state.district = '';
  state.obj_type = ''; state.category = ''; state.page = 1;
  searchInput.value = '';
  filterAdm.value = ''; filterType.value = ''; filterCat.value = '';
  loadObjects();
});

document.getElementById('burger').addEventListener('click', () => {
  document.getElementById('mobileMenu').classList.toggle('open');
});

loadFilters();