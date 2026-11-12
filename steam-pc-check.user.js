// ==UserScript==
// @name         Steam PC Check — совместимость и прогноз FPS
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Сравнивает ваш ПК с системными требованиями игры в Steam и даёт оценочный прогноз FPS (с указанием погрешности).
// @author       Frolov Andrey
// @match        https://store.steampowered.com/app/*
// @icon         https://store.steampowered.com/favicon.ico
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  /* ======================================================================
   * 0. КОНСТАНТЫ И ХРАНИЛИЩЕ
   * ====================================================================== */
  const KEY_HW = 'scp_hw';
  const KEY_SEEN = 'scp_seen_setup';
  const KEY_REQ = (id) => 'scp_req_' + id;
  const REQ_TTL = 24 * 3600 * 1000;

  const Store = {
    get(k, d) { try { return typeof GM_getValue === 'function' ? GM_getValue(k, d) : d; } catch (e) { return d; } },
    set(k, v) { try { GM_setValue(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { GM_deleteValue(k); } catch (e) { /* ignore */ } },
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ======================================================================
   * 1. БАЗА ПРОИЗВОДИТЕЛЬНОСТИ ВИДЕОКАРТ
   * Относительный индекс игровой производительности (растеризация, ~1080p),
   * GTX 1060 6GB = 100. Значения ПРИБЛИЗИТЕЛЬНЫЕ, собраны по публичным
   * сводным рейтингам (TechPowerUp relative performance, PassMark G3D и т.п.)
   * и округлены. Это НЕ результаты собственных замеров.
   * Формат: [название, индекс, (1 = встроенная графика)]
   * Новые/отсутствующие модели можно добавить в настройках (раздел «Свои значения»).
   * ====================================================================== */
  const GPU_DB = [
    // NVIDIA — старые
    ['GeForce GTS 450', 15], ['GeForce GTX 550 Ti', 15], ['GeForce GTX 460', 22], ['GeForce GTX 560 Ti', 32],
    ['GeForce GTX 570', 38], ['GeForce GTX 580', 45], ['GeForce GT 630', 6], ['GeForce GT 640', 12],
    ['GeForce GT 710', 5], ['GeForce GT 730', 9], ['GeForce GTX 650', 22], ['GeForce GTX 650 Ti', 30],
    ['GeForce GTX 660', 42], ['GeForce GTX 660 Ti', 50], ['GeForce GTX 670', 55], ['GeForce GTX 680', 62],
    ['GeForce GTX 750', 32], ['GeForce GTX 750 Ti', 38], ['GeForce GTX 760', 52], ['GeForce GTX 770', 62],
    ['GeForce GTX 780', 80], ['GeForce GTX 780 Ti', 95], ['GeForce GTX 950', 52], ['GeForce GTX 960', 62],
    ['GeForce GTX 970', 105], ['GeForce GTX 980', 125], ['GeForce GTX 980 Ti', 160],
    // NVIDIA — GTX 10 / 16
    ['GeForce GT 1030', 30], ['GeForce GTX 1050', 62], ['GeForce GTX 1050 Ti', 78], ['GeForce GTX 1060 3GB', 90],
    ['GeForce GTX 1060', 100], ['GeForce GTX 1070', 135], ['GeForce GTX 1070 Ti', 160], ['GeForce GTX 1080', 180],
    ['GeForce GTX 1080 Ti', 230], ['GeForce GTX 1630', 55], ['GeForce GTX 1650', 82], ['GeForce GTX 1650 Super', 110],
    ['GeForce GTX 1660', 118], ['GeForce GTX 1660 Super', 135], ['GeForce GTX 1660 Ti', 140],
    // NVIDIA — RTX 20/30/40/50
    ['GeForce RTX 2060', 160], ['GeForce RTX 2060 Super', 185], ['GeForce RTX 2070', 190], ['GeForce RTX 2070 Super', 210],
    ['GeForce RTX 2080', 225], ['GeForce RTX 2080 Super', 235], ['GeForce RTX 2080 Ti', 285],
    ['GeForce RTX 3050 6GB', 110], ['GeForce RTX 3050', 135], ['GeForce RTX 3060', 185], ['GeForce RTX 3060 Ti', 240],
    ['GeForce RTX 3070', 285], ['GeForce RTX 3070 Ti', 305], ['GeForce RTX 3080', 370], ['GeForce RTX 3080 Ti', 420],
    ['GeForce RTX 3090', 440], ['GeForce RTX 3090 Ti', 480],
    ['GeForce RTX 4060', 215], ['GeForce RTX 4060 Ti', 255], ['GeForce RTX 4070', 320], ['GeForce RTX 4070 Super', 375],
    ['GeForce RTX 4070 Ti', 410], ['GeForce RTX 4070 Ti Super', 450], ['GeForce RTX 4080', 520],
    ['GeForce RTX 4080 Super', 540], ['GeForce RTX 4090', 700],
    ['GeForce RTX 5060', 235], ['GeForce RTX 5060 Ti', 280], ['GeForce RTX 5070', 355], ['GeForce RTX 5070 Ti', 450],
    ['GeForce RTX 5080', 560], ['GeForce RTX 5090', 800],
    // NVIDIA — ноутбучные
    ['GeForce MX150', 25, 0], ['GeForce MX250', 30], ['GeForce MX350', 35], ['GeForce MX450', 45], ['GeForce MX550', 50],
    ['GeForce GTX 1050 Laptop', 50], ['GeForce GTX 1050 Ti Laptop', 62], ['GeForce GTX 1060 Laptop', 90],
    ['GeForce GTX 1070 Laptop', 120], ['GeForce GTX 1080 Laptop', 160], ['GeForce GTX 1650 Laptop', 65],
    ['GeForce GTX 1650 Ti Laptop', 75], ['GeForce GTX 1650 Ti', 75], ['GeForce GTX 1660 Ti Laptop', 115],
    ['GeForce RTX 2060 Laptop', 140], ['GeForce RTX 2070 Laptop', 160], ['GeForce RTX 2080 Laptop', 190],
    ['GeForce RTX 3050 Laptop', 95], ['GeForce RTX 3050 Ti Laptop', 110], ['GeForce RTX 3060 Laptop', 150],
    ['GeForce RTX 3070 Laptop', 185], ['GeForce RTX 3070 Ti Laptop', 205], ['GeForce RTX 3080 Laptop', 230],
    ['GeForce RTX 3080 Ti Laptop', 270],
    ['GeForce RTX 4050 Laptop', 150], ['GeForce RTX 4060 Laptop', 185], ['GeForce RTX 4070 Laptop', 225],
    ['GeForce RTX 4080 Laptop', 330], ['GeForce RTX 4090 Laptop', 400],
    ['GeForce RTX 5050 Laptop', 170], ['GeForce RTX 5060 Laptop', 200], ['GeForce RTX 5070 Laptop', 245],
    ['GeForce RTX 5070 Ti Laptop', 300], ['GeForce RTX 5080 Laptop', 380], ['GeForce RTX 5090 Laptop', 470],
    // AMD — старые
    ['Radeon HD 5770', 30], ['Radeon HD 6850', 40], ['Radeon HD 6870', 50], ['Radeon HD 7750', 28], ['Radeon HD 7770', 38],
    ['Radeon HD 7790', 50], ['Radeon HD 7850', 55], ['Radeon HD 7870', 70], ['Radeon HD 7950', 75], ['Radeon HD 7970', 90],
    ['Radeon R7 250', 25], ['Radeon R7 260X', 50], ['Radeon R7 370', 55], ['Radeon R9 270', 62], ['Radeon R9 270X', 70],
    ['Radeon R9 280', 80], ['Radeon R9 280X', 90], ['Radeon R9 285', 90], ['Radeon R9 290', 115], ['Radeon R9 290X', 125],
    ['Radeon R9 380', 85], ['Radeon R9 380X', 95], ['Radeon R9 390', 130], ['Radeon R9 390X', 140],
    ['Radeon R9 Fury', 150], ['Radeon R9 Fury X', 160],
    // AMD — RX
    ['Radeon RX 550', 35], ['Radeon RX 560', 50], ['Radeon RX 460', 55], ['Radeon RX 470', 95], ['Radeon RX 480', 110],
    ['Radeon RX 570', 100], ['Radeon RX 580', 115], ['Radeon RX 590', 125], ['Radeon RX Vega 56', 150], ['Radeon RX Vega 64', 170],
    ['Radeon RX 5500 XT', 95], ['Radeon RX 5600 XT', 150], ['Radeon RX 5700', 175], ['Radeon RX 5700 XT', 195],
    ['Radeon RX 6400', 75], ['Radeon RX 6500 XT', 80], ['Radeon RX 6600', 190], ['Radeon RX 6600 XT', 215],
    ['Radeon RX 6650 XT', 225], ['Radeon RX 6700 XT', 290], ['Radeon RX 6750 XT', 305], ['Radeon RX 6800', 370],
    ['Radeon RX 6800 XT', 420], ['Radeon RX 6900 XT', 460], ['Radeon RX 6950 XT', 490],
    ['Radeon RX 7600', 220], ['Radeon RX 7600 XT', 245], ['Radeon RX 7700 XT', 320], ['Radeon RX 7800 XT', 380],
    ['Radeon RX 7900 GRE', 430], ['Radeon RX 7900 XT', 470], ['Radeon RX 7900 XTX', 540],
    ['Radeon RX 9060 XT', 300], ['Radeon RX 9070', 410], ['Radeon RX 9070 XT', 470],
    // AMD — ноутбучные
    ['Radeon RX 560X', 50], ['Radeon RX 5500M', 85], ['Radeon RX 5600M', 130], ['Radeon RX 6600M', 175],
    ['Radeon RX 6700M', 220], ['Radeon RX 6800M', 290], ['Radeon RX 7600M XT', 200],
    // Intel Arc
    ['Arc A380', 55], ['Arc A580', 150], ['Arc A750', 190], ['Arc A770', 215], ['Arc B570', 215], ['Arc B580', 235],
    // Встроенная графика
    ['Intel HD Graphics 2000', 4, 1], ['Intel HD Graphics 3000', 5, 1], ['Intel HD Graphics 4000', 7, 1],
    ['Intel HD Graphics 4400', 9, 1], ['Intel HD Graphics 4600', 10, 1], ['Intel HD Graphics 5000', 12, 1],
    ['Intel HD Graphics 520', 14, 1], ['Intel HD Graphics 530', 18, 1], ['Intel HD Graphics 620', 16, 1],
    ['Intel HD Graphics 630', 18, 1], ['Intel UHD Graphics 620', 16, 1], ['Intel UHD Graphics 630', 19, 1],
    ['Intel UHD Graphics 730', 30, 1], ['Intel UHD Graphics 770', 34, 1], ['Intel UHD Graphics', 18, 1],
    ['Intel Iris Plus', 32, 1], ['Intel Iris Pro 580', 40, 1], ['Intel Iris Xe', 38, 1], ['Intel Arc Graphics', 70, 1],
    ['Radeon Vega 3', 12, 1], ['Radeon Vega 6', 24, 1], ['Radeon Vega 7', 28, 1], ['Radeon Vega 8', 30, 1],
    ['Radeon Vega 10', 33, 1], ['Radeon Vega 11', 38, 1], ['Radeon 610M', 18, 1], ['Radeon 660M', 45, 1],
    ['Radeon 680M', 58, 1], ['Radeon 740M', 40, 1], ['Radeon 760M', 50, 1], ['Radeon 780M', 72, 1], ['Radeon 890M', 95, 1],
  ];

  /* ======================================================================
   * 2. НОРМАЛИЗАЦИЯ ТЕКСТА, ПОИСК ПО БАЗЕ
   * ====================================================================== */
  const H = {
    norm(s) {
      return String(s || '').toLowerCase()
        .replace(/\(r\)|\(tm\)|[®™]/g, ' ')
        .replace(/\(0x[0-9a-f]+\)/g, ' ')
        .replace(/max-?q( design)?|mobile|notebook|laptop( gpu)?/g, ' laptop ')
        .replace(/[^a-z0-9.]+/g, ' ')
        .replace(/\b(nvidia|geforce|radeon|amd|intel|ati|corporation)\b/g, ' ')
        .replace(/([a-z])(\d)/g, '$1 $2')
        .replace(/(\d)(xtx|xt|ti|gre|super|x)\b/g, '$1 $2')
        .replace(/(\d)\s+gb\b/g, '$1gb')
        .replace(/\s+/g, ' ').trim();
    },
  };

  let _gpuTable = null;
  const CUSTOM = { gpu: [], cpu: [] };
  function gpuTable() {
    if (!_gpuTable) {
      _gpuTable = GPU_DB.map(([n, s, ig]) => ({ k: H.norm(n), s, ig: !!ig })).sort((a, b) => b.k.length - a.k.length);
    }
    return _gpuTable;
  }
  function loadCustom(raw) {
    CUSTOM.gpu = []; CUSTOM.cpu = [];
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      for (const t of ['gpu', 'cpu']) {
        for (const [k, v] of Object.entries(j[t] || {})) {
          if (typeof v === 'number' && v > 0) CUSTOM[t].push({ k: H.norm(k), s: v, ig: false });
        }
        CUSTOM[t].sort((a, b) => b.k.length - a.k.length);
      }
      return null;
    } catch (e) { return 'Неверный JSON в «Своих значениях»: ' + e.message; }
  }

  function splitAlt(s) {
    return String(s || '')
      .replace(/\b(or equivalent|or better|or higher|or newer|or similar|equivalent|или лучше|или аналог|или выше|или новее|oder besser)\b/gi, ' ')
      .split(/\s*(?:\/|\||;|\bor\b|\bили\b|\boder\b)\s*/i)
      .map((x) => x.trim()).filter(Boolean);
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

  function gpuScore(text, opts = {}) {
    const parts = opts.first ? splitAlt(text).slice(0, 1) : splitAlt(text);
    const found = [];
    for (const p of parts) {
      const t = ' ' + H.norm(p) + ' ';
      let hit = CUSTOM.gpu.find((c) => t.includes(' ' + c.k + ' '));
      if (!hit) hit = gpuTable().find((e) => t.includes(' ' + e.k + ' '));
      if (!hit) continue;
      let s = hit.s, adj = false, sib = false;
      if (opts.laptop && !hit.ig && !t.includes(' laptop ') && !hit.k.includes('laptop')) {
        const sibling = gpuTable().find((e) => e.k === hit.k + ' laptop');
        if (sibling) { s = sibling.s; sib = true; } else { s *= 0.7; adj = true; }
      }
      found.push({ name: hit.k, s, adj, sib });
    }
    if (!found.length) return null;
    return { score: avg(found.map((f) => f.s)), names: found.map((f) => f.name), adj: found.some((f) => f.adj), sib: found.some((f) => f.sib) };
  }

  /* ======================================================================
   * 3. ОЦЕНКА ПРОЦЕССОРОВ (эвристика по поколению и классу)
   * Индекс игровой производительности, Core i5-8400 ≈ 105.
   * Это грубая оценка по формуле «поколение × класс × суффикс», а не таблица замеров.
   * ====================================================================== */
  const INTEL_GEN = { 1: 50, 2: 60, 3: 66, 4: 72, 5: 76, 6: 84, 7: 90, 8: 105, 9: 115, 10: 130, 11: 145, 12: 180, 13: 215, 14: 220 };
  const INTEL_TIER = { 3: 0.78, 5: 1, 7: 1.14, 9: 1.24 };
  const RYZEN_SERIES = { 1: 80, 2: 95, 3: 118, 4: 125, 5: 160, 6: 170, 7: 210, 8: 215, 9: 245 };
  const RYZEN_TIER = { 3: 0.78, 5: 1, 7: 1.1, 9: 1.2 };

  function intelSuffix(s) {
    if (s.includes('y')) return 0.4;
    if (s.includes('u')) return 0.55;
    if (/^g\d/.test(s)) return 0.6;
    if (s.includes('hx')) return 1;
    if (s.includes('h') || s.includes('q') || s.includes('m')) return 0.88;
    if (s.includes('p')) return 0.8;
    if (s.includes('t')) return 0.88;
    if (s.includes('k')) return 1.04;
    return 1;
  }

  function cpuOne(raw) {
    const t = String(raw).toLowerCase().replace(/[®™]/g, '').replace(/\(r\)|\(tm\)/g, '');
    let m;
    if ((m = t.match(/core\s*ultra\s*([3579])\s*-?\s*(\d{3})([a-z]*)/))) {
      const suf = m[3];
      let f = INTEL_TIER[m[1]] || 1;
      if (suf.includes('u')) f *= 0.6; else if (suf.includes('hx')) f *= 1; else if (suf.includes('h')) f *= 0.9;
      return 225 * f;
    }
    if ((m = t.match(/\bi([3579])[\s-]*(\d{3,5})([a-z]{0,3}\d?)/))) {
      const d = m[2];
      let gen;
      if (d.length === 5) gen = +d.slice(0, 2);
      else if (d.length === 4 && +d.slice(0, 2) >= 10 && +d.slice(0, 2) <= 14) gen = +d.slice(0, 2);
      else if (d.length === 4) gen = +d[0];
      else gen = 1;
      const base = INTEL_GEN[gen];
      if (!base) return null;
      return base * (INTEL_TIER[m[1]] || 1) * intelSuffix(m[3]);
    }
    if ((m = t.match(/ryzen\s*(?:ai\s*)?([3579])\s*(?:pro\s*)?(\d{4})([a-z0-9]*)/))) {
      const ser = RYZEN_SERIES[Math.floor(+m[2] / 1000)];
      if (!ser) return null;
      const s = m[3];
      let f = RYZEN_TIER[m[1]] || 1;
      if (s.includes('x3d')) f *= 1.22;
      else if (s.startsWith('u')) f *= 0.55;
      else if (s.startsWith('hx')) f *= 1;
      else if (s.startsWith('h')) f *= 0.88;
      else if (s.startsWith('g')) f *= 0.9;
      return ser * f;
    }
    if ((m = t.match(/\bfx[\s-]*(\d)\d{3}/))) return { 4: 40, 6: 50, 8: 60, 9: 62 }[m[1]] || 50;
    if ((m = t.match(/phenom.*?x\s*(\d)/))) return { 2: 30, 3: 35, 4: 45, 6: 55 }[m[1]] || 40;
    if (/athlon.*x\s*4/.test(t)) return 45;
    if (/core\s*2\s*quad/.test(t)) return 40;
    if (/core\s*2\s*duo/.test(t)) return 25;
    if (/pentium\s*(gold|g[4-7]\d{3})/.test(t)) return 70;
    if (/pentium/.test(t)) return 35;
    if (/celeron/.test(t)) return 25;
    if ((m = t.match(/apple\s*m(\d)\s*(pro|max|ultra)?/))) return ({ 1: 150, 2: 175, 3: 200, 4: 230 }[m[1]] || 150) * (m[2] ? 1.15 : 1);
    return null;
  }

  function cpuScore(text, opts = {}) {
    const parts = opts.first ? splitAlt(text).slice(0, 1) : splitAlt(text);
    const found = [];
    for (const p of parts) {
      const t = ' ' + H.norm(p) + ' ';
      const c = CUSTOM.cpu.find((x) => t.includes(' ' + x.k + ' '));
      const s = c ? c.s : cpuOne(p);
      if (s) found.push(s);
    }
    return found.length ? { score: avg(found) } : null;
  }

  /* ======================================================================
   * 4. РАЗБОР СИСТЕМНЫХ ТРЕБОВАНИЙ
   * ====================================================================== */
  const LABELS = [
    ['dx', /directx/i],
    ['vram', /video\s*memory|видеопамят|vram|grafikspeicher/i],
    ['gpu', /graphics|видеокарт|графическ|grafik|graphiques|gráficos|video\s*card|显卡|显示/i],
    ['ram', /memory|памят|оператив|arbeitsspeicher|mémoire|memoria|内存|\bram\b/i],
    ['cpu', /processor|процессор|prozessor|processeur|procesador|\bcpu\b|处理器/i],
    ['os', /^\s*(os|ос|операционн|betriebssystem|système|sistema operativo|系统|操作系统)/i],
    ['storage', /storage|disk|drive|место|накопител|speicher|festplatte|stockage|almacenamiento|存储|硬盘/i],
    ['notes', /additional|notes|примеч|дополнит|hinweis|remarques|notas|附加/i],
  ];

  function parseReqHtml(html) {
    const out = { os: '', cpu: '', ram: '', gpu: '', vram: '', dx: '', storage: '', notes: [] };
    if (!html) return out;
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    doc.querySelectorAll('li').forEach((li) => {
      const strong = li.querySelector('strong');
      let label = strong ? strong.textContent.replace(/[:：]\s*$/, '').trim() : '';
      let value = li.textContent.trim();
      if (strong) value = value.replace(strong.textContent, '').replace(/^\s*[:：]?\s*/, '').trim();
      if (!label) { if (value) out.notes.push(value); return; }
      const hit = LABELS.find(([, re]) => re.test(label));
      if (!hit) { out.notes.push(label + ': ' + value); return; }
      const key = hit[0];
      if (key === 'notes') out.notes.push(value);
      else if (!out[key]) out[key] = value;
    });
    return out;
  }

  const hasAny = (r) => !!(r && (r.os || r.cpu || r.ram || r.gpu || r.vram || r.dx || r.storage));

  function splitMinRec(html) {
    // API отдаёт minimum и recommended отдельными полями; для DOM-фолбэка — аналогично.
    return html;
  }

  function parseGB(s) {
    const m = String(s || '').match(/(\d+(?:[.,]\d+)?)\s*(tb|gb|gib|mb|mib|гб|мб|гбайт|мбайт)/i);
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.'));
    const u = m[2].toLowerCase();
    if (u === 'tb') return v * 1024;
    if (/^(mb|mib|мб|мбайт)$/.test(u)) return v / 1024;
    return v;
  }

  const WIN_VER = { xp: 5.1, vista: 6.0, '7': 6.1, '8': 6.2, '8.1': 6.3, '10': 10, '11': 11 };
  const OS_VER = { win11: 11, win10: 10, win81: 6.3, win7: 6.1 };
  const OS_NAMES = { win11: 'Windows 11', win10: 'Windows 10', win81: 'Windows 8.1', win7: 'Windows 7', mac: 'macOS', linux: 'Linux' };

  function minWinVersion(s) {
    const re = /win(?:dows)?\s*(?:®\s*)?(xp|vista|11|10|8\.1|8|7)\b/gi;
    let m; let best = null;
    while ((m = re.exec(s))) { const v = WIN_VER[m[1].toLowerCase()]; if (best == null || v < best) best = v; }
    return best;
  }

  /* ======================================================================
   * 5. ПОЛУЧЕНИЕ ДАННЫХ ОБ ИГРЕ
   * ====================================================================== */
  function getAppId() {
    const m = location.pathname.match(/\/app\/(\d+)/);
    return m ? m[1] : null;
  }

  async function fetchGameData(appId, force) {
    const cached = Store.get(KEY_REQ(appId), null);
    if (!force && cached && Date.now() - cached.ts < REQ_TTL) return { ...cached.data, fromCache: true, ts: cached.ts };
    let data = null; let err = null;
    try {
      const r = await fetch('/api/appdetails?appids=' + appId + '&l=english', { credentials: 'omit' });
      const j = await r.json();
      const e = j && j[appId];
      if (e && e.success && e.data) {
        const d = e.data;
        const pick = (x) => (x && !Array.isArray(x) ? x : {});
        data = {
          name: d.name,
          pc: { min: parseReqHtml(pick(d.pc_requirements).minimum), rec: parseReqHtml(pick(d.pc_requirements).recommended) },
          mac: { min: parseReqHtml(pick(d.mac_requirements).minimum), rec: parseReqHtml(pick(d.mac_requirements).recommended) },
          linux: { min: parseReqHtml(pick(d.linux_requirements).minimum), rec: parseReqHtml(pick(d.linux_requirements).recommended) },
          source: 'Steam API (en)',
        };
      } else err = 'Steam API не вернул данные по игре (возможно, возрастное ограничение или региональный запрет).';
    } catch (e) { err = 'Не удалось обратиться к Steam API: ' + e.message; }
    if (!data || !(hasAny(data.pc.min) || hasAny(data.pc.rec) || hasAny(data.mac.min) || hasAny(data.linux.min))) {
      const dom = parseDomRequirements();
      if (dom) data = { name: (data && data.name) || domGameName(), ...dom, source: 'страница Steam (DOM)' };
    }
    if (!data) return { error: err || 'Системные требования не найдены на странице.' };
    Store.set(KEY_REQ(appId), { ts: Date.now(), data });
    return { ...data, ts: Date.now() };
  }

  function domGameName() {
    const el = document.querySelector('#appHubAppName');
    return el ? el.textContent.trim() : document.title.replace(/\s+on Steam.*$/i, '');
  }

  function parseDomRequirements() {
    const result = { pc: { min: parseReqHtml(''), rec: parseReqHtml('') }, mac: { min: parseReqHtml(''), rec: parseReqHtml('') }, linux: { min: parseReqHtml(''), rec: parseReqHtml('') } };
    let any = false;
    document.querySelectorAll('.game_area_sys_req').forEach((box) => {
      const os = (box.getAttribute('data-os') || 'win').toLowerCase();
      const key = os === 'mac' ? 'mac' : os === 'linux' ? 'linux' : 'pc';
      const l = box.querySelector('.game_area_sys_req_leftCol');
      const r = box.querySelector('.game_area_sys_req_rightCol');
      const full = box.querySelector('.game_area_sys_req_full');
      if (l) { result[key].min = parseReqHtml(l.innerHTML); if (r) result[key].rec = parseReqHtml(r.innerHTML); }
      else if (full) result[key].min = parseReqHtml(full.innerHTML);
      if (hasAny(result[key].min) || hasAny(result[key].rec)) any = true;
    });
    return any ? result : null;
  }

  /* ======================================================================
   * 6. ОПРЕДЕЛЕНИЕ ХАРАКТЕРИСТИК ПК (в рамках возможностей браузера)
   * ====================================================================== */
  function cleanRenderer(s) {
    s = String(s || '');
    const m = s.match(/^ANGLE \((?:[^,]*),\s*(.+?)(?:\s*\(0x[0-9a-f]+\))?\s*(?:Direct3D|OpenGL|Vulkan|Metal|vs_)/i);
    if (m) s = m[1];
    return s.replace(/\(0x[0-9a-f]+\)/gi, '').replace(/\s+/g, ' ').trim();
  }

  async function detectHardware() {
    const out = {}; const hints = [];
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        const g = cleanRenderer(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
        if (g && !/^(swiftshader|llvmpipe|microsoft basic)/i.test(g)) out.gpu = g;
      }
      if (!out.gpu) hints.push('Браузер скрыл модель видеокарты — укажите её вручную.');
    } catch (e) { hints.push('WebGL недоступен — видеокарту нужно указать вручную.'); }

    try {
      const uad = navigator.userAgentData;
      if (uad && uad.getHighEntropyValues) {
        const hv = await uad.getHighEntropyValues(['platformVersion', 'architecture', 'bitness']);
        const plat = (uad.platform || '').toLowerCase();
        if (plat.includes('windows')) { out.os = parseInt(hv.platformVersion, 10) >= 13 ? 'win11' : 'win10'; }
        else if (plat.includes('mac')) out.os = 'mac';
        else if (plat.includes('linux')) out.os = 'linux';
        if (hv.bitness) out.bit64 = hv.bitness === '64';
      } else {
        const ua = navigator.userAgent;
        if (/Windows NT 10/.test(ua)) { out.os = 'win10'; hints.push('Браузер не различает Windows 10 и 11 — выбрана Windows 10, проверьте.'); }
        else if (/Windows NT 6\.3/.test(ua)) out.os = 'win81';
        else if (/Windows NT 6\.1/.test(ua)) out.os = 'win7';
        else if (/Mac OS X/.test(ua)) out.os = 'mac';
        else if (/Linux/.test(ua)) out.os = 'linux';
        if (/Win64|x64|WOW64|x86_64/.test(ua)) out.bit64 = true;
      }
    } catch (e) { /* ignore */ }

    const dpr = window.devicePixelRatio || 1;
    out.resW = Math.round(screen.width * dpr); out.resH = Math.round(screen.height * dpr);
    if (navigator.hardwareConcurrency) hints.push('Логических потоков процессора: ' + navigator.hardwareConcurrency + '. Модель CPU браузер не сообщает — укажите вручную.');
    else hints.push('Модель процессора недоступна браузеру — укажите вручную.');
    if (navigator.deviceMemory) hints.push('Браузер сообщает объём ОЗУ ≈ ' + navigator.deviceMemory + ' ГБ, но значение округлено и ограничено сверху 8 ГБ — укажите реальный объём вручную.');
    hints.push('Объём видеопамяти и тип устройства (ПК/ноутбук) браузеру недоступны. Если в ноутбуке две видеокарты, браузер мог показать встроенную.');
    return { out, hints };
  }

  /* ======================================================================
   * 7. СРАВНЕНИЕ С ТРЕБОВАНИЯМИ
   * ====================================================================== */
  const DOT = { ok: '🟢', warn: '🟡', bad: '🔴', na: '⚪' };

  function ratioStatus(u, r) {
    if (u == null || r == null) return 'na';
    const x = u / r;
    return x >= 0.95 ? 'ok' : x >= 0.75 ? 'warn' : 'bad';
  }

  function hwLaptop(hw) { return hw.device === 'laptop'; }

  function compareOne(hw, req) {
    const rows = [];
    const NA = 'Не указано';

    // ОС
    {
      const r = req.os; let st = 'na'; let note = ''; const have = (OS_NAMES[hw.os] || NA) + (hw.bit64 === false ? ' 32-bit' : hw.bit64 ? ' 64-bit' : '');
      if (r && hw.os) {
        if (hw.os.startsWith('win')) {
          const need = minWinVersion(r);
          if (need == null) { st = /mac|linux|steamos|ubuntu/i.test(r) && !/windows/i.test(r) ? 'bad' : 'na'; note = 'Версию Windows в требованиях определить не удалось.'; }
          else st = OS_VER[hw.os] >= need ? 'ok' : 'bad';
          if (st === 'ok' && /64[\s-]?bit|x64|64-разряд/i.test(r) && hw.bit64 === false) { st = 'bad'; note = 'Требуется 64-разрядная ОС.'; }
        } else { st = 'na'; note = 'Для macOS/Linux версию ОС сверьте вручную.'; }
      } else if (r) note = 'Укажите вашу ОС в настройках.';
      rows.push({ label: 'ОС', req: r || NA, have, st, note });
    }
    // CPU
    {
      const r = req.cpu; const u = hw.cpu ? cpuScore(hw.cpu, { first: true }) : null; const q = r ? cpuScore(r) : null;
      let st = ratioStatus(u && u.score, q && q.score); let note = '';
      if (!r) note = '';
      else if (!hw.cpu) note = 'Укажите модель процессора.';
      else if (!u) note = 'Ваш процессор не распознан — добавьте его в «Свои значения».';
      else if (!q) note = 'Процессор из требований не распознан (возможно, указаны только ГГц/ядра).';
      else note = 'Оценка: ' + Math.round((u.score / q.score) * 100) + '% от производительности из требований.';
      rows.push({ label: 'Процессор', req: r || NA, have: hw.cpu || NA, st, note });
    }
    // RAM
    {
      const r = parseGB(req.ram); const u = hw.ram ? +hw.ram : null;
      let st = 'na'; let note = '';
      if (r != null && u != null) { st = u >= r ? 'ok' : u >= r * 0.75 ? 'warn' : 'bad'; if (st === 'warn') note = 'Чуть меньше требуемого.'; }
      else if (r != null) note = 'Укажите объём ОЗУ.';
      rows.push({ label: 'Оперативная память', req: req.ram || NA, have: u != null ? u + ' ГБ' : NA, st, note });
    }
    // GPU
    {
      const r = req.gpu; const u = hw.gpu ? gpuScore(hw.gpu, { first: true, laptop: hwLaptop(hw) }) : null; const q = r ? gpuScore(r) : null;
      let st = ratioStatus(u && u.score, q && q.score); let note = '';
      if (!r) note = '';
      else if (!hw.gpu) note = 'Укажите видеокарту.';
      else if (!u) note = 'Ваша видеокарта не распознана — добавьте её в «Свои значения».';
      else if (!q) note = 'Видеокарта из требований не распознана (например, указано «DirectX 11-совместимая»).';
      else {
        note = 'Оценка: ' + Math.round((u.score / q.score) * 100) + '% от производительности из требований.';
        if (u.adj) { note += ' Для ноутбука применена поправка −30% к настольному аналогу.'; if (st === 'ok') st = 'warn'; }
      }
      rows.push({ label: 'Видеокарта', req: r || NA, have: hw.gpu || NA, st, note });
    }
    // VRAM
    {
      const rv = parseGB(req.vram) != null ? parseGB(req.vram) : (req.gpu ? vramFromGpuText(req.gpu) : null);
      const u = hw.vram ? +hw.vram : null;
      let st = 'na'; let note = '';
      if (rv != null && u != null) st = u >= rv ? 'ok' : u >= rv * 0.75 ? 'warn' : 'bad';
      else if (rv != null) note = 'Укажите объём видеопамяти.';
      rows.push({ label: 'Видеопамять', req: rv != null ? rv + ' ГБ' : NA, have: u != null ? u + ' ГБ' : NA, st, note });
    }
    // DirectX
    {
      const m = String(req.dx || '').match(/(\d+(?:\.\d+)?)/); const r = m ? parseFloat(m[1]) : null;
      let st = 'na'; let note = 'Поддержку DirectX видеокартой браузер проверить не может.';
      if (r != null && hw.os && hw.os.startsWith('win')) {
        const max = { win11: 12, win10: 12, win81: 11.2, win7: 11 }[hw.os];
        if (r > max) { st = 'bad'; note = 'Эта версия DirectX недоступна в вашей ОС.'; }
        else st = r >= 12 ? 'warn' : 'ok';
        if (st === 'warn') note = 'ОС поддерживает, но нужна и поддержка DirectX 12 видеокартой.';
        else if (st === 'ok') note = 'Совместимость ОС подтверждена; поддержка видеокартой — по её поколению.';
      }
      rows.push({ label: 'DirectX', req: req.dx || NA, have: hw.os && hw.os.startsWith('win') ? 'зависит от ОС и GPU' : NA, st, note });
    }
    // Диск
    {
      rows.push({ label: 'Место на диске', req: req.storage || NA, have: 'Неизвестно', st: 'na', note: 'Свободное место на диске браузер определить не может — проверьте вручную.' });
    }
    return rows;
  }

  function vramFromGpuText(s) {
    const m = String(s).match(/(\d+(?:[.,]\d+)?)\s*(gb|mb|гб|мб)\b/i);
    return m ? parseGB(m[0]) : null;
  }

  function summarize(rows, kind) {
    const checked = rows.filter((r) => r.req && r.req !== 'Не указано');
    if (!checked.length) return { st: 'na', text: 'Разработчик не указал ' + (kind === 'min' ? 'минимальные' : 'рекомендуемые') + ' требования.' };
    const important = checked.filter((r) => ['ОС', 'Процессор', 'Оперативная память', 'Видеокарта', 'Видеопамять'].includes(r.label));
    const bad = important.filter((r) => r.st === 'bad').map((r) => r.label.toLowerCase());
    const warn = important.filter((r) => r.st === 'warn').map((r) => r.label.toLowerCase());
    const na = important.filter((r) => r.st === 'na').length;
    if (bad.length) return { st: 'bad', text: 'Не соответствует по параметрам: ' + bad.join(', ') + '.' };
    if (warn.length) return { st: 'warn', text: 'Соответствует частично (на границе): ' + warn.join(', ') + '.' };
    if (na) return { st: 'warn', text: 'Явных несоответствий нет, но часть параметров не удалось проверить.' };
    return { st: 'ok', text: 'Соответствует по всем проверенным параметрам.' };
  }

  /* ======================================================================
   * 8. ПРОГНОЗ FPS
   * Метод: «якорная» модель. Требования разработчика считаются опорными точками:
   *   - рекомендуемое железо ≈ 60 FPS на «Высоких», 1080p;
   *   - минимальное железо ≈ 30 FPS на «Низких», 1080p.
   * От якоря FPS масштабируется по отношению индексов GPU, затем ограничивается
   * по CPU (мягкий минимум), потом применяются множители пресета и разрешения
   * и штрафы за нехватку ОЗУ/VRAM. Это модель с широкой погрешностью,
   * а не результаты реальных замеров конкретной игры.
   * ====================================================================== */
  const MODEL = {
    anchorRecFps: 60, anchorMinFps: 30, anchorMinPreset: 1.7, anchorMinCpuFps: 35,
    resExp: 0.85, softK: 4, lowRatio: 0.72,
  };
  const ROWS = [
    { preset: 'Минимальные', res: '720p', w: 1280, h: 720, mul: 2.1, vram: 0.4, rv: 0.8 },
    { preset: 'Низкие', res: '1080p', w: 1920, h: 1080, mul: 1.7, vram: 0.5, rv: 1 },
    { preset: 'Средние', res: '1080p', w: 1920, h: 1080, mul: 1.3, vram: 0.7, rv: 1 },
    { preset: 'Высокие', res: '1080p', w: 1920, h: 1080, mul: 1.0, vram: 1.0, rv: 1 },
    { preset: 'Ультра', res: '1080p', w: 1920, h: 1080, mul: 0.78, vram: 1.3, rv: 1 },
    { preset: 'Ультра', res: '1440p', w: 2560, h: 1440, mul: 0.78, vram: 1.3, rv: 1.3 },
    { preset: 'Ультра', res: '4K', w: 3840, h: 2160, mul: 0.78, vram: 1.3, rv: 2.0 },
  ];

  const PRESET_MUL = { minimum: 2.1, lowest: 2.1, low: 1.7, medium: 1.3, high: 1.0, ultra: 0.78, max: 0.78, maximum: 0.78 };
  // Ищет в примечаниях разработчика цели вида «Low Settings, 60 FPS @ 1080p»
  function devAnchor(notes) {
    for (const n of notes || []) {
      const m = String(n).match(/\b(minimum|lowest|low|medium|high|ultra|maximum|max)\b[^0-9\n]{0,20}?(\d{2,3})\s*fps(?:\s*(?:@|at)\s*(720p|1080p|1440p|4k|2160p))?/i);
      if (!m) continue;
      const px = { '720p': 1280 * 720, '1080p': 1920 * 1080, '1440p': 2560 * 1440, '4k': 3840 * 2160, '2160p': 3840 * 2160 }[(m[3] || '1080p').toLowerCase()];
      return { fps: +m[2], mul: PRESET_MUL[m[1].toLowerCase()], resF: Math.pow(px / (1920 * 1080), MODEL.resExp), text: m[0] };
    }
    return null;
  }

  function predictFps(hw, d) {
    const R = { ok: false, rows: [], notes: [], conf: null };
    if (!hw.gpu) { R.reason = 'Не указана видеокарта.'; return R; }
    const gU = gpuScore(hw.gpu, { first: true, laptop: hwLaptop(hw) });
    if (!gU) { R.reason = 'Ваша видеокарта не найдена в базе. Добавьте её индекс в «Свои значения» (настройки).'; return R; }
    const gMin = d.min.gpu ? gpuScore(d.min.gpu) : null;
    const gRec = d.rec.gpu ? gpuScore(d.rec.gpu) : null;
    if (!gMin && !gRec) { R.reason = 'Видеокарты из требований игры не распознаны — опорных точек для расчёта нет.'; return R; }

    const dRec = devAnchor(d.rec.notes); const dMin = devAnchor(d.min.notes);
    const recBase = dRec ? (dRec.fps * dRec.resF) / dRec.mul : MODEL.anchorRecFps;
    const minBase = dMin ? (dMin.fps * dMin.resF) / dMin.mul : MODEL.anchorMinFps / MODEL.anchorMinPreset;
    if (dRec || dMin) R.notes.push('Использованы цели FPS из примечаний разработчика: ' + [dMin && '«' + dMin.text + '» (минимум)', dRec && '«' + dRec.text + '» (рекомендуемые)'].filter(Boolean).join(', ') + '. Это заявления разработчика, а не замеры.');
    if (gU.sib) R.notes.push('Видеокарта заменена на ноутбучный вариант из базы (указан тип «ноутбук»).');
    const anchors = [];
    if (gRec) anchors.push(recBase * (gU.score / gRec.score));
    if (gMin && !(gRec && gMin.score >= gRec.score)) anchors.push(minBase * (gU.score / gMin.score));
    const base = Math.exp(avg(anchors.map(Math.log))); // FPS на «Высоких» 1080p по GPU

    const cU = hw.cpu ? cpuScore(hw.cpu, { first: true }) : null;
    const cMin = d.min.cpu ? cpuScore(d.min.cpu) : null;
    const cRec = d.rec.cpu ? cpuScore(d.rec.cpu) : null;
    const cAnch = [];
    if (cU && cRec) cAnch.push((dRec ? dRec.fps : MODEL.anchorRecFps) * (cU.score / cRec.score));
    if (cU && cMin && !(cRec && cMin.score >= cRec.score)) cAnch.push((dMin ? dMin.fps : MODEL.anchorMinCpuFps) * (cU.score / cMin.score));
    const cpuCap = cAnch.length ? Math.exp(avg(cAnch.map(Math.log))) : null;
    if (!cpuCap) R.notes.push('Процессор не учтён в расчёте (не указан/не распознан или нет опорных данных в требованиях) — реальный FPS может быть ниже.');

    let u = anchors.length === 2 ? 0.2 : 0.3;
    if (hwLaptop(hw)) { u += 0.05; R.notes.push('Ноутбук: из-за лимитов энергопотребления и охлаждения разброс результатов больше.'); }
    if (gU.adj) { u += 0.05; R.notes.push('Ноутбучная модель GPU оценена по настольной с поправкой −30%.'); }
    if (!cpuCap) u += 0.05;
    u = Math.min(u, 0.45);
    R.conf = u <= 0.22 ? 'Средняя' : 'Низкая';

    const ramMin = parseGB(d.min.ram); const ramRec = parseGB(d.rec.ram); const ram = hw.ram ? +hw.ram : null;
    let ramMul = 1; let ramFlag = null;
    if (ram != null && ramMin != null && ram < ramMin) { ramMul = 0.5; ramFlag = 'ОЗУ ниже минимальных требований'; }
    else if (ram != null && ramRec != null && ram < ramRec) { ramMul = 0.92; ramFlag = 'ОЗУ ниже рекомендуемой'; }
    if (ramFlag) R.notes.push(ramFlag + ' — возможны подгрузки и просадки.');

    const gv = (parseGB(d.rec.vram) != null ? parseGB(d.rec.vram) : vramFromGpuText(d.rec.gpu || '')) ||
      (parseGB(d.min.vram) != null ? parseGB(d.min.vram) * 1.5 : null) || (vramFromGpuText(d.min.gpu || '') ? vramFromGpuText(d.min.gpu) * 1.5 : null);
    const vram = hw.vram ? +hw.vram : null;
    if (gv && !vram) R.notes.push('Объём видеопамяти не указан — её нехватка в расчёте не учтена.');

    R.rows = ROWS.map((row) => {
      const resF = Math.pow((row.w * row.h) / (1920 * 1080), MODEL.resExp);
      const gpuFps = (base * row.mul) / resF;
      let fps = cpuCap ? Math.pow(Math.pow(gpuFps, -MODEL.softK) + Math.pow(cpuCap, -MODEL.softK), -1 / MODEL.softK) : gpuFps;
      fps *= ramMul;
      let vramIssue = false;
      if (gv && vram) {
        const need = gv * row.vram * row.rv;
        if (vram < need * 0.7) { fps *= 0.5; vramIssue = true; }
        else if (vram < need * 0.95) { fps *= 0.75; vramIssue = true; }
      }
      fps = Math.min(fps, 999);
      const lo = fps * (1 - u); const hi = fps * (1 + u);
      const low1 = fps * MODEL.lowRatio * (ramFlag ? 0.85 : 1) * (vramIssue ? 0.7 : 1);
      const cpuBound = cpuCap ? cpuCap < gpuFps : false;
      let stab = 'Стабильно';
      if (vramIssue || ramMul < 0.9 || fps < 30) stab = 'Нестабильно';
      else if (fps < 45 || cpuBound && fps < 70 || u > 0.3) stab = 'Возможны просадки';
      return { ...row, avg: fps, lo, hi, low1, stab, vramIssue, cpuBound };
    });
    R.ok = true;
    return R;
  }

  /* ======================================================================
   * 9. РЕКОМЕНДАЦИИ
   * ====================================================================== */
  function buildAdvice(hw, d, minRows, recRows, fps) {
    const adv = [];
    if (fps.ok) {
      const r1080 = fps.rows.filter((r) => r.res === '1080p');
      const best60 = [...r1080].reverse().find((r) => r.avg >= 60 && r.stab !== 'Нестабильно');
      const best30 = [...r1080].reverse().find((r) => r.avg >= 30);
      if (best60) adv.push('По оценке, комфортные 60+ FPS возможны в 1080p на настройках «' + best60.preset + '».');
      else if (best30) adv.push('60 FPS в 1080p вряд ли достижимы; играбельные ≥30 FPS ожидаются на настройках «' + best30.preset + '» (1080p).');
      else adv.push('Даже на минимальных настройках в 1080p прогноз ниже 30 FPS — рассмотрите 720p или апгрейд.');
      if (fps.rows.some((r) => r.cpuBound && r.avg < 60)) adv.push('Процессор, вероятно, ограничивает FPS: снижение графики даст меньший прирост, чем обычно.');
      if (fps.rows.some((r) => r.vramIssue)) adv.push('Видеопамяти может не хватать на высоких настройках/разрешениях — снизьте качество текстур.');
      adv.push('Включите DLSS/FSR/XeSS, если игра их поддерживает: это может заметно поднять FPS (в расчёте не учитывается).');
    }
    if (hwLaptop(hw)) adv.push('На ноутбуке подключите зарядное устройство, включите режим высокой производительности и убедитесь, что игра использует дискретную видеокарту.');
    const missing = [];
    if (!hw.cpu) missing.push('процессор'); if (!hw.gpu) missing.push('видеокарту'); if (!hw.ram) missing.push('ОЗУ'); if (!hw.vram) missing.push('видеопамять');
    if (missing.length) adv.push('Для более точного результата укажите: ' + missing.join(', ') + '.');
    if ([...minRows, ...recRows].some((r) => r.note && /не распознан/.test(r.note))) adv.push('Часть оборудования не распознана базой скрипта — добавьте нужные индексы в «Свои значения».');
    adv.push('Перед покупкой проверьте независимые обзоры/бенчмарки именно этой игры на вашей (или близкой) конфигурации.');
    return adv;
  }

  /* ======================================================================
   * 10. ИНТЕРФЕЙС
   * ====================================================================== */
  const CSS = `
  #scp-panel{margin:0 0 16px;background:linear-gradient(135deg,rgba(27,40,56,.95),rgba(23,29,37,.95));border:1px solid #2a475e;border-radius:3px;color:#c6d4df;font-family:"Motiva Sans",Arial,sans-serif;font-size:13px;box-shadow:0 0 8px rgba(0,0,0,.5)}
  #scp-panel h2{margin:0;padding:10px 14px;font-size:16px;font-weight:400;color:#fff;background:rgba(0,0,0,.25);border-bottom:1px solid #2a475e;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
  #scp-panel h3{margin:14px 0 6px;font-size:14px;font-weight:500;color:#66c0f4}
  #scp-panel .scp-body{padding:10px 14px 14px}
  #scp-panel table{width:100%;border-collapse:collapse;margin:4px 0}
  #scp-panel th{font-weight:500;text-align:left;color:#8f98a0;font-size:11px;text-transform:uppercase;padding:4px 6px;border-bottom:1px solid #2a475e}
  #scp-panel td{padding:5px 6px;border-bottom:1px solid rgba(42,71,94,.5);vertical-align:top}
  #scp-panel .scp-note{color:#8f98a0;font-size:12px}
  #scp-panel .scp-verdict{padding:8px 10px;border-left:3px solid #66c0f4;background:rgba(0,0,0,.2);margin:6px 0}
  #scp-panel .scp-verdict.ok{border-color:#5ba32b}#scp-panel .scp-verdict.warn{border-color:#e0b020}#scp-panel .scp-verdict.bad{border-color:#c0392b}#scp-panel .scp-verdict.na{border-color:#8f98a0}
  #scp-panel .scp-btn,.scp-modal .scp-btn{display:inline-block;padding:4px 12px;border-radius:2px;border:0;cursor:pointer;color:#fff;font-size:12px;background:linear-gradient(to right,#47bfff 5%,#1a44c2 95%);margin-left:4px}
  #scp-panel .scp-btn.sec,.scp-modal .scp-btn.sec{background:rgba(103,193,245,.2);color:#67c1f5}
  #scp-panel .scp-btn:hover,.scp-modal .scp-btn:hover{filter:brightness(1.15)}
  #scp-panel .fps-ok{color:#8bd05a}#scp-panel .fps-warn{color:#e8c547}#scp-panel .fps-bad{color:#e05a4a}
  #scp-panel ul{margin:4px 0 0 18px;padding:0}#scp-panel li{margin:3px 0}
  #scp-panel .scp-warnbox{background:rgba(224,176,32,.12);border:1px solid rgba(224,176,32,.4);padding:6px 10px;margin:8px 0;font-size:12px}
  .scp-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center}
  .scp-modal{background:#1b2838;color:#c6d4df;border:1px solid #2a475e;width:560px;max-width:94vw;max-height:92vh;overflow:auto;padding:16px 18px;font:13px "Motiva Sans",Arial,sans-serif;border-radius:3px}
  .scp-modal h3{margin:0 0 10px;color:#fff;font-weight:400;font-size:17px}
  .scp-modal label{display:block;margin:8px 0 2px;color:#8f98a0;font-size:12px}
  .scp-modal input[type=text],.scp-modal input[type=number],.scp-modal select,.scp-modal textarea{width:100%;box-sizing:border-box;background:#316282;color:#fff;border:1px solid #000;padding:5px 7px;border-radius:2px}
  .scp-modal textarea{height:70px;font-family:monospace}
  .scp-modal .row{display:flex;gap:10px}.scp-modal .row>div{flex:1}
  .scp-modal .hints{font-size:12px;color:#e0b020;margin:8px 0;white-space:pre-line}
  .scp-modal .foot{margin-top:14px;text-align:right}`;

  function addStyle(css) {
    if (typeof GM_addStyle === 'function') GM_addStyle(css);
    else { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
  }

  const fmtDate = (ts) => new Date(ts).toLocaleString('ru-RU');
  const fpsCls = (v) => (v >= 60 ? 'fps-ok' : v >= 30 ? 'fps-warn' : 'fps-bad');

  function hwSummaryHtml(hw) {
    const dev = hw.device === 'laptop' ? 'Ноутбук' : hw.device === 'desktop' ? 'Настольный ПК' : 'Не указано';
    const res = hw.resW && hw.resH ? hw.resW + '×' + hw.resH : 'Не указано';
    const item = (k, v) => '<tr><td style="width:170px;color:#8f98a0">' + k + '</td><td>' + esc(v || 'Не указано') + '</td></tr>';
    return '<table>' + item('Тип устройства', dev) + item('Процессор', hw.cpu) + item('Видеокарта', hw.gpu) + item('Видеопамять', hw.vram ? hw.vram + ' ГБ' : '') +
      item('Оперативная память', hw.ram ? hw.ram + ' ГБ' : '') + item('ОС', hw.os ? OS_NAMES[hw.os] + (hw.bit64 === false ? ' (32-bit)' : hw.bit64 ? ' (64-bit)' : '') : '') + item('Разрешение экрана', res) + '</table>';
  }

  function compareTableHtml(rows) {
    return '<table><tr><th></th><th>Параметр</th><th>Требуется</th><th>У вас</th><th>Комментарий</th></tr>' +
      rows.map((r) => '<tr><td>' + DOT[r.st] + '</td><td>' + esc(r.label) + '</td><td>' + esc(r.req) + '</td><td>' + esc(r.have) + '</td><td class="scp-note">' + esc(r.note || '') + '</td></tr>').join('') + '</table>';
  }

  function fpsTableHtml(fps) {
    return '<table><tr><th>Настройки</th><th>Разрешение</th><th>Диапазон FPS</th><th>Среднее</th><th>1% Low (оценка)</th><th>Стабильность</th></tr>' +
      fps.rows.map((r) => '<tr><td>' + r.preset + '</td><td>' + r.res + '</td><td class="' + fpsCls(r.avg) + '">' + Math.round(r.lo) + '–' + Math.round(r.hi) + '</td><td>≈ ' + Math.round(r.avg) + '</td><td>≈ ' + Math.round(r.low1) + '</td><td>' + r.stab + '</td></tr>').join('') + '</table>';
  }

  let STATE = { appId: null, busy: false };

  function ensurePanel() {
    let p = document.getElementById('scp-panel');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'scp-panel';
    const anchor = document.querySelector('#aboutThisGame') || document.querySelector('#game_area_description') || document.querySelector('.game_area_description') || document.querySelector('.leftcol') || document.querySelector('.page_content');
    if (!anchor) return null;
    if (anchor.classList.contains('leftcol') || anchor.classList.contains('page_content')) anchor.insertBefore(p, anchor.firstChild);
    else anchor.parentNode.insertBefore(p, anchor);
    p.addEventListener('click', (e) => {
      const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'recheck') run(false);
      else if (act === 'refresh') run(true);
      else if (act === 'settings') openSettings();
    });
    return p;
  }

  function headerHtml(name, ts) {
    return '<h2><span>Проверка совместимости ПК' + (name ? ' — ' + esc(name) : '') + '</span><span>' +
      '<button class="scp-btn" data-act="recheck">Проверить совместимость</button>' +
      '<button class="scp-btn sec" data-act="refresh">Обновить требования</button>' +
      '<button class="scp-btn sec" data-act="settings">Изменить характеристики ПК</button></span></h2>';
  }

  async function run(force) {
    const appId = getAppId();
    if (!appId) return;
    STATE.appId = appId;
    const panel = ensurePanel();
    if (!panel) return;
    panel.innerHTML = headerHtml('', 0) + '<div class="scp-body">Анализ…</div>';
    try {
      const hw = Store.get(KEY_HW, null);
      const cerr = hw ? loadCustom(hw.custom) : null;
      const game = await fetchGameData(appId, force);
      if (game.error) { panel.innerHTML = headerHtml('', 0) + '<div class="scp-body"><div class="scp-verdict bad">' + esc(game.error) + '</div><div class="scp-note">Попробуйте «Обновить требования» или проверьте, что на странице есть раздел системных требований.</div></div>'; return; }
      const name = game.name || domGameName();
      if (!hw) {
        panel.innerHTML = headerHtml(name, 0) + '<div class="scp-body"><div class="scp-verdict">Укажите характеристики вашего ПК, чтобы увидеть сравнение и прогноз FPS.</div><p><button class="scp-btn" data-act="settings">Указать характеристики</button></p></div>';
        if (!Store.get(KEY_SEEN, false)) { Store.set(KEY_SEEN, true); openSettings(); }
        return;
      }
      const set = hw.os === 'mac' ? game.mac : hw.os === 'linux' ? game.linux : game.pc;
      if (!hasAny(set.min) && !hasAny(set.rec)) {
        panel.innerHTML = headerHtml(name, 0) + '<div class="scp-body"><div class="scp-verdict bad">Для вашей ОС (' + esc(OS_NAMES[hw.os] || '—') + ') разработчик не указал системные требования — вероятно, версии игры для неё нет.</div></div>';
        return;
      }
      const minRows = compareOne(hw, set.min);
      const recRows = hasAny(set.rec) ? compareOne(hw, set.rec) : null;
      const sMin = summarize(minRows, 'min');
      const sRec = recRows ? summarize(recRows, 'rec') : { st: 'na', text: 'Разработчик не указал рекомендуемые требования.' };
      const fps = predictFps(hw, { min: set.min, rec: set.rec });
      const adv = buildAdvice(hw, set, minRows, recRows || [], fps);

      let verdict;
      if (sMin.st === 'bad') verdict = 'К сожалению, ваш компьютер не соответствует минимальным требованиям игры. ' + sMin.text;
      else if (sMin.st === 'ok') verdict = 'Ваш компьютер соответствует минимальным системным требованиям игры.';
      else verdict = 'Явного несоответствия минимальным требованиям нет, но часть параметров проверить не удалось или они на границе. ' + sMin.text;
      if (sMin.st !== 'bad') {
        if (sRec.st === 'ok') verdict += ' Рекомендуемым требованиям он тоже соответствует.';
        else if (sRec.st === 'bad') verdict += ' Рекомендуемым требованиям он не соответствует — на высоких настройках возможны проблемы.';
        else if (sRec.st === 'warn') verdict += ' Соответствие рекомендуемым требованиям не гарантировано.';
      }
      const vst = sMin.st === 'bad' ? 'bad' : (sMin.st === 'ok' && (sRec.st === 'ok' || sRec.st === 'na') ? 'ok' : 'warn');

      let html = headerHtml(name, game.ts) + '<div class="scp-body">';
      if (cerr) html += '<div class="scp-warnbox">' + esc(cerr) + '</div>';
      html += '<h3>Результат проверки</h3><div class="scp-verdict ' + vst + '">' + esc(verdict) + '</div>';
      html += '<h3>Характеристики вашего ПК</h3>' + hwSummaryHtml(hw);
      html += '<h3>Минимальные требования</h3>' + compareTableHtml(minRows);
      html += '<h3>Рекомендуемые требования</h3>' + (recRows ? compareTableHtml(recRows) : '<div class="scp-note">Не указано разработчиком.</div>');
      html += '<h3>Прогноз производительности</h3>';
      if (fps.ok) {
        html += '<div class="scp-warnbox"><b>Это модельная оценка, а не результат тестирования.</b> Достоверность прогноза: <b>' + fps.conf + '</b>. Расчёт опирается на системные требования игры и относительные индексы железа; реальный FPS может заметно отличаться (особенно в играх с нестандартной оптимизацией, при DLSS/FSR, разных драйверах и охлаждении). Игра может не поддерживать часть пресетов/разрешений — скрипт этого не знает.</div>';
        html += fpsTableHtml(fps);
        if (fps.notes.length) html += '<ul class="scp-note">' + fps.notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>';
      } else html += '<div class="scp-verdict na">Прогноз FPS недоступен: ' + esc(fps.reason) + '</div>';
      html += '<h3>Дополнительные рекомендации</h3><ul>' + adv.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul>';
      const notes = [...(set.min.notes || []), ...(set.rec.notes || [])];
      if (notes.length) html += '<h3>Примечания разработчика</h3><ul class="scp-note">' + notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>';
      html += '<p class="scp-note">Последний анализ: ' + fmtDate(Date.now()) + ' · Требования: ' + esc(game.source || 'кэш') + (game.fromCache ? ' (кэш от ' + fmtDate(game.ts) + ')' : '') + '</p></div>';
      panel.innerHTML = html;
    } catch (e) {
      console.error('[Steam PC Check]', e);
      panel.innerHTML = headerHtml('', 0) + '<div class="scp-body"><div class="scp-verdict bad">Ошибка при анализе: ' + esc(e.message) + '</div></div>';
    }
  }

  /* ---------- Окно настроек ---------- */
  function openSettings() {
    if (document.querySelector('.scp-modal-bg')) return;
    const hw = Store.get(KEY_HW, {}) || {};
    const bg = document.createElement('div');
    bg.className = 'scp-modal-bg';
    const opt = (v, t, cur) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + t + '</option>';
    bg.innerHTML = '<div class="scp-modal"><h3>Характеристики вашего ПК</h3>' +
      '<div class="hints" id="scp-hints">Браузер не сообщает модель процессора, объём ОЗУ и видеопамяти. Нажмите «Определить автоматически» для того, что доступно, и дополните остальное вручную.</div>' +
      '<label>Тип устройства</label><select id="scp-device">' + opt('', '— выберите —', hw.device || '') + opt('desktop', 'Настольный ПК', hw.device) + opt('laptop', 'Ноутбук', hw.device) + '</select>' +
      '<label>Процессор (например, Intel Core i5-12400F или AMD Ryzen 5 5600)</label><input type="text" id="scp-cpu" value="' + esc(hw.cpu || '') + '">' +
      '<label>Видеокарта (например, GeForce RTX 3060 или RTX 4060 Laptop)</label><input type="text" id="scp-gpu" value="' + esc(hw.gpu || '') + '">' +
      '<div class="row"><div><label>Видеопамять, ГБ</label><input type="number" step="0.5" min="0" id="scp-vram" value="' + esc(hw.vram || '') + '"></div>' +
      '<div><label>ОЗУ, ГБ</label><input type="number" step="1" min="0" id="scp-ram" value="' + esc(hw.ram || '') + '"></div></div>' +
      '<div class="row"><div><label>Операционная система</label><select id="scp-os">' + opt('', '— выберите —', hw.os || '') + Object.keys(OS_NAMES).map((k) => opt(k, OS_NAMES[k], hw.os)).join('') + '</select></div>' +
      '<div><label>Разрядность ОС</label><select id="scp-bit">' + opt('', '— неизвестно —', hw.bit64 == null ? '' : hw.bit64 ? '64' : '32') + opt('64', '64-bit', hw.bit64 ? '64' : '') + opt('32', '32-bit', hw.bit64 === false ? '32' : '') + '</select></div></div>' +
      '<div class="row"><div><label>Ширина экрана, px</label><input type="number" id="scp-rw" value="' + esc(hw.resW || '') + '"></div><div><label>Высота экрана, px</label><input type="number" id="scp-rh" value="' + esc(hw.resH || '') + '"></div></div>' +
      '<label>Свои значения индексов (необязательно, JSON). GTX 1060 6GB = 100; для CPU i5-8400 ≈ 105.</label>' +
      '<textarea id="scp-custom" placeholder=\'{"gpu":{"rtx 5090":800},"cpu":{"ryzen 9 9950x3d":340}}\'>' + esc(hw.custom || '') + '</textarea>' +
      '<div class="foot"><button class="scp-btn sec" id="scp-auto">Определить автоматически</button><button class="scp-btn sec" id="scp-cancel">Отмена</button><button class="scp-btn" id="scp-save">Сохранить</button></div></div>';
    document.body.appendChild(bg);
    const $ = (id) => bg.querySelector('#' + id);
    $('scp-cancel').onclick = () => bg.remove();
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) bg.remove(); });
    $('scp-auto').onclick = async () => {
      const { out, hints } = await detectHardware();
      if (out.gpu) $('scp-gpu').value = out.gpu;
      if (out.os) $('scp-os').value = out.os;
      if (out.bit64 != null) $('scp-bit').value = out.bit64 ? '64' : '32';
      if (out.resW) { $('scp-rw').value = out.resW; $('scp-rh').value = out.resH; }
      $('scp-hints').textContent = 'Определено автоматически: ' + Object.keys(out).filter((k) => out[k] != null).join(', ') + '.\n' + hints.join('\n');
    };
    $('scp-save').onclick = () => {
      const num = (id) => { const v = parseFloat($(id).value.replace(',', '.')); return isFinite(v) && v > 0 ? v : null; };
      const custom = $('scp-custom').value.trim();
      const err = loadCustom(custom);
      if (err) { $('scp-hints').textContent = err; return; }
      const b = $('scp-bit').value;
      Store.set(KEY_HW, {
        device: $('scp-device').value || null, cpu: $('scp-cpu').value.trim(), gpu: $('scp-gpu').value.trim(),
        vram: num('scp-vram'), ram: num('scp-ram'), os: $('scp-os').value || null, bit64: b === '' ? null : b === '64',
        resW: num('scp-rw'), resH: num('scp-rh'), custom,
      });
      bg.remove();
      run(false);
    };
  }

  /* ======================================================================
   * 11. ЗАПУСК, ОТСЛЕЖИВАНИЕ ПЕРЕХОДОВ И ДИНАМИЧЕСКОЙ ЗАГРУЗКИ
   * ====================================================================== */
  function start() {
    addStyle(CSS);
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Steam PC Check: характеристики ПК', openSettings);
      GM_registerMenuCommand('Steam PC Check: сбросить характеристики', () => { Store.del(KEY_HW); run(false); });
    }
    const hw = Store.get(KEY_HW, null);
    if (hw) loadCustom(hw.custom);
    run(false);
    // Steam может подменять содержимое страницы без перезагрузки: следим за URL и наличием панели.
    let lastUrl = location.href; let timer = null;
    const check = () => {
      const id = getAppId();
      if (!id) return;
      const gone = !document.getElementById('scp-panel');
      if (location.href !== lastUrl || (gone && !STATE.busy)) {
        lastUrl = location.href;
        if (id !== STATE.appId || gone) run(false);
      }
    };
    setInterval(check, 1500);
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check, 400); }).observe(document.body, { childList: true, subtree: false });
  }

  if (typeof document !== 'undefined' && typeof GM_getValue !== 'undefined') start();

  // Для тестов в Node (в Tampermonkey блок не выполняется)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { H, gpuScore, cpuScore, cpuOne, parseGB, minWinVersion, predictFps, compareOne, loadCustom, cleanRenderer };
  }
})();
