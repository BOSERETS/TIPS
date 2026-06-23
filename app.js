// =========================
// Topo-Rando PWA — app.js
// =========================

// ---------- IndexedDB ----------
const DB_NAME = 'topo-rando-db';
const DB_VERSION = 1;
const STORE = 'parcours';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('lastOpened', 'lastOpened');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGet(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ---------- Helpers ----------
function escapeHTML(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Convertit le texte des puces en HTML enrichi :
// - *italique*  -> <em>italique</em>
// - ⚠️ à vérifier -> badge warn
// - [POI NN]    -> lien cliquable vers ce POI dans le parcours courant
// - (texte note en italique entre parenthèses dans la note de transparence) — pas auto-transformé : si l'auteur veut une note, il utilise *...* à l'intérieur des parenthèses
function renderText(raw, currentParcoursId) {
  let s = escapeHTML(raw);
  // Marqueur "à vérifier" (avant les autres transforms)
  s = s.replace(/⚠️\s*à vérifier/g, '<span class="warn">⚠️ à vérifier</span>');
  // Renvois [POI NN]
  s = s.replace(/\[POI\s*(\d{2})\]/g, (m, num) =>
    `<a href="#parcours/${encodeURIComponent(currentParcoursId)}/poi${num}" class="poi-ref" data-poi-ref="${num}">POI ${num}</a>`
  );
  // Italiques *...*
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return s;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- Validation JSON ----------
function validateParcours(obj) {
  if (!obj || typeof obj !== 'object') return 'JSON invalide.';
  if (typeof obj.version !== 'number') return 'Champ "version" manquant.';
  if (obj.version > 1) return `Version ${obj.version} non supportée par cette PWA.`;
  if (!obj.id || typeof obj.id !== 'string') return 'Champ "id" manquant ou invalide.';
  if (!obj.titre) return 'Champ "titre" manquant.';
  if (!Array.isArray(obj.pois) || obj.pois.length === 0) return 'Aucun POI dans le parcours.';
  for (const p of obj.pois) {
    if (!p.num || !p.titre) return `Un POI est mal formé (num/titre).`;
    if (!Array.isArray(p.puces)) return `POI ${p.num} : champ "puces" manquant.`;
  }
  return null; // OK
}

// ---------- État & navigation ----------
const state = {
  view: 'home', // 'home' | 'parcours'
  currentId: null
};

function setTopBar(opts = {}) {
  const back = document.getElementById('backBtn');
  const ttl = document.getElementById('topTitle');
  const toggleAll = document.getElementById('toggleAll');
  back.hidden = !opts.showBack;
  toggleAll.hidden = !opts.showToggleAll;
  ttl.textContent = opts.title || 'Topo-Rando';
}

function navigate(hash) {
  if (location.hash !== hash) location.hash = hash;
  else handleHashChange();
}

async function handleHashChange() {
  const h = location.hash || '#home';
  if (h === '#home' || h === '') {
    await renderHome();
    return;
  }
  // #parcours/<id>  ou  #parcours/<id>/poiNN
  const m = h.match(/^#parcours\/([^/]+)(?:\/poi(\d{2}))?$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const focusPoi = m[2] || null;
    await renderParcours(id, focusPoi);
    return;
  }
  // fallback
  await renderHome();
}

// ---------- Vue Accueil ----------
async function renderHome() {
  state.view = 'home';
  state.currentId = null;
  setTopBar({ title: 'Topo-Rando' });

  const view = document.getElementById('view');
  const all = await dbAll();
  // tri : dernière consultation en premier (lastOpened DESC),
  // les non-consultés en dernier (triés par date d'ajout DESC)
  all.sort((a, b) => {
    if (a.lastOpened && b.lastOpened) return b.lastOpened.localeCompare(a.lastOpened);
    if (a.lastOpened) return -1;
    if (b.lastOpened) return 1;
    return (b.addedAt || '').localeCompare(a.addedAt || '');
  });

  let html = `
    <section class="home-intro">
      <div class="kicker">Aide-mémoire de terrain</div>
      <h2>Mes parcours</h2>
      <p>${all.length === 0 ? 'Aucun parcours chargé pour le moment.' : all.length + ' parcours · trié par dernière consultation'}</p>
    </section>
  `;

  if (all.length === 0) {
    html += `
      <div class="empty">
        <div class="icon">🥾</div>
        <h3>Commencez par charger un parcours</h3>
        <p>Touchez le bouton « Charger un parcours » en bas de l'écran et choisissez un fichier <strong>.json</strong>.</p>
      </div>
    `;
  } else {
    html += '<div class="parcours-list">';
    for (const p of all) {
      const meta = [];
      if (p.lastOpened) meta.push('Ouvert le ' + formatDate(p.lastOpened));
      else if (p.addedAt) meta.push('Ajouté le ' + formatDate(p.addedAt));
      if (p.data && p.data.pois) meta.push(p.data.pois.length + ' POI');
      html += `
        <div class="parcours-card">
          <button class="parcours-card-main" data-open="${escapeHTML(p.id)}" type="button">
            <div class="parcours-card-title">${escapeHTML(p.data.titre || p.id)}</div>
            <div class="parcours-card-meta">${meta.join(' · ')}</div>
          </button>
          <button class="parcours-card-del" data-del="${escapeHTML(p.id)}" type="button" aria-label="Supprimer">✕</button>
        </div>
      `;
    }
    html += '</div>';
  }

  html += `
    <div class="fab">
      <button class="btn btn-primary" id="loadBtn" type="button">+ Charger un parcours</button>
    </div>
  `;

  view.innerHTML = html;

  // Handlers
  view.querySelectorAll('[data-open]').forEach(b => {
    b.addEventListener('click', () => navigate('#parcours/' + encodeURIComponent(b.dataset.open)));
  });
  view.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      askDelete(b.dataset.del);
    });
  });
  document.getElementById('loadBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
}

// ---------- Vue Parcours ----------
async function renderParcours(id, focusPoi) {
  const rec = await dbGet(id);
  if (!rec) {
    toast('Parcours introuvable');
    navigate('#home');
    return;
  }
  state.view = 'parcours';
  state.currentId = id;

  // Mettre à jour lastOpened (sans bloquer le rendu)
  rec.lastOpened = new Date().toISOString();
  dbPut(rec).catch(() => {});

  const d = rec.data;
  setTopBar({ title: d.titre || id, showBack: true, showToggleAll: true });

  const view = document.getElementById('view');
  let html = `
    <section class="parcours-intro">
      <div class="kicker">Topo-guide · aide-mémoire</div>
      <h2>${escapeHTML(d.titre || '')}</h2>
      ${d.sous_titre ? `<p>${escapeHTML(d.sous_titre)}</p>` : ''}
      <div class="meta">${d.auteur ? escapeHTML(d.auteur) : ''}${d.date_generation ? ' · ' + escapeHTML(d.date_generation) : ''}</div>
    </section>

    <nav class="toc" aria-label="Sommaire">
      <ol>
        ${d.pois.map(p => `
          <li><a href="#parcours/${encodeURIComponent(id)}/poi${escapeHTML(p.num)}" data-poi-jump="${escapeHTML(p.num)}">
            <span class="toc-num">${escapeHTML(p.num)}</span><span class="toc-title">${escapeHTML(p.titre)}</span>
          </a></li>
        `).join('')}
      </ol>
    </nav>
  `;

  for (const p of d.pois) {
    const accroche = p.accroche ? `<div class="accroche">« ${escapeHTML(p.accroche)} »</div>` : '';
    const puces = (p.puces || []).map(pu => {
      const amorce = pu.amorce ? `<strong>${escapeHTML(pu.amorce)} :</strong> ` : '';
      const texte = renderText(pu.texte || '', id);
      return `<li>${amorce}${texte}</li>`;
    }).join('');
    html += `
      <details class="poi" id="poi${escapeHTML(p.num)}">
        <summary>
          <div class="poi-head">
            <span class="badge">${escapeHTML(p.num)}</span>
            <span class="poi-title">${escapeHTML(p.titre)}</span>
            <span class="chev">›</span>
          </div>
          ${accroche}
        </summary>
        <div class="poi-body"><ul>${puces}</ul></div>
      </details>
    `;
  }

  html += `<footer class="parcours-footer">CimeEnvie ASBL — Belgique${d.date_generation ? ' — ' + escapeHTML(d.date_generation) : ''}</footer>`;

  view.innerHTML = html;

  // Handlers du sommaire : ouvrir le POI cible
  view.querySelectorAll('[data-poi-jump]').forEach(a => {
    a.addEventListener('click', () => {
      const t = document.getElementById('poi' + a.dataset.poiJump);
      if (t) t.open = true;
      // Pas de preventDefault : le navigateur fait le saut d'ancre nativement
    });
  });

  // Handlers des renvois inter-POI [POI NN]
  view.querySelectorAll('[data-poi-ref]').forEach(a => {
    a.addEventListener('click', () => {
      const t = document.getElementById('poi' + a.dataset.poiRef);
      if (t) t.open = true;
    });
  });

  // Focus sur POI demandé via le hash
  if (focusPoi) {
    const t = document.getElementById('poi' + focusPoi);
    if (t) {
      t.open = true;
      setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }
}

// ---------- Chargement d'un fichier JSON ----------
async function handleFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    const err = validateParcours(obj);
    if (err) {
      toast('Erreur : ' + err);
      return;
    }
    const existing = await dbGet(obj.id);
    if (existing) {
      // Écrasement silencieux mais on garde lastOpened
      const record = {
        id: obj.id,
        data: obj,
        addedAt: existing.addedAt,
        lastOpened: existing.lastOpened,
        updatedAt: new Date().toISOString()
      };
      await dbPut(record);
      toast('Parcours mis à jour');
    } else {
      const record = {
        id: obj.id,
        data: obj,
        addedAt: new Date().toISOString(),
        lastOpened: null,
        updatedAt: new Date().toISOString()
      };
      await dbPut(record);
      toast('Parcours ajouté');
    }
    if (state.view === 'home') renderHome();
  } catch (e) {
    toast('Fichier illisible : ' + (e.message || e));
  }
}

// ---------- Suppression ----------
function askDelete(id) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Supprimer ce parcours ?</h3>
      <p>Le fichier original (.json) n'est pas affecté. Vous pourrez le recharger plus tard.</p>
      <div class="modal-actions">
        <button class="btn" data-cancel type="button">Annuler</button>
        <button class="btn btn-danger" data-confirm type="button">Supprimer</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('[data-cancel]').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('[data-confirm]').addEventListener('click', async () => {
    await dbDelete(id);
    backdrop.remove();
    toast('Parcours supprimé');
    if (state.view === 'home') renderHome();
    else navigate('#home');
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
}

// ---------- Thème ----------
function initTheme() {
  // Détection préférence système au premier lancement, pas de persistance
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDark) document.documentElement.setAttribute('data-theme', 'dark');
}

// ---------- Boutons globaux ----------
function bindGlobals() {
  document.getElementById('backBtn').addEventListener('click', () => navigate('#home'));
  document.getElementById('toggleTheme').addEventListener('click', () => {
    const root = document.documentElement;
    root.setAttribute('data-theme', root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  document.getElementById('toggleAll').addEventListener('click', () => {
    const items = document.querySelectorAll('details.poi');
    if (items.length === 0) return;
    const anyClosed = Array.from(items).some(d => !d.open);
    items.forEach(d => { d.open = anyClosed; });
  });
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    e.target.value = ''; // permettre de recharger le même fichier
  });
  window.addEventListener('hashchange', handleHashChange);
}

// ---------- Service Worker (cache hors-ligne) ----------
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {
      // Échec silencieux : l'app marche quand même en ligne
    });
  }
}

// ---------- Init ----------
initTheme();
bindGlobals();
registerSW();
handleHashChange();
