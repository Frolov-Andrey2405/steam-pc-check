'use strict';
// Запуск: node tests/run-tests.js (Node 18+, без зависимостей)
const path = require('path');
const m = require(path.join(__dirname, '..', 'steam-pc-check.user.js'));

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' ожидалось ' + b + ', получено ' + a); }
function near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error((msg || '') + ' ожидалось ≈' + b + ' (±' + tol + '), получено ' + a); }
function truthy(v, msg) { if (!v) throw new Error(msg || 'ожидалось истинное значение'); }

console.log('Видеокарты');
test('GTX 1060 6GB = 100', () => eq(Math.round(m.gpuScore('NVIDIA GeForce GTX 1060 6GB').score), 100));
test('GTX 1060 3 GB отличается от 6GB', () => eq(Math.round(m.gpuScore('GTX 1060 3 GB').score), 90));
test('вендор-слова не мешают (RX 580, R9 290X)', () => {
  truthy(m.gpuScore('RX 580')); truthy(m.gpuScore('R9 290X'));
});
test('несколько вариантов усредняются', () => near(m.gpuScore('RX 580 or GTX 1060').score, 108, 1));
test('«DirectX 11 compatible» не распознаётся', () => eq(m.gpuScore('DirectX 11 compatible'), null));
test('Ti/XT/Super различаются', () => {
  truthy(m.gpuScore('RTX 3060 Ti').score > m.gpuScore('RTX 3060').score);
  truthy(m.gpuScore('RX 5700 XT').score > m.gpuScore('RX 5700').score);
});
test('ноутбучный аналог при типе «ноутбук»', () => {
  const r = m.gpuScore('GeForce GTX 1650', { laptop: true, first: true });
  eq(Math.round(r.score), 65); truthy(r.sib, 'sib');
});
test('поправка −30% для карты без ноутбучного аналога', () => {
  const r = m.gpuScore('RTX 3060 Ti', { laptop: true, first: true });
  near(r.score, 240 * 0.7, 0.01); truthy(r.adj, 'adj');
});
test('очистка строки WebGL-рендерера', () => eq(
  m.cleanRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560) Direct3D11 vs_5_0 ps_5_0, D3D11)'),
  'NVIDIA GeForce RTX 3060 Laptop GPU'));

console.log('Процессоры');
test('Core i5-8400 = 105', () => eq(Math.round(m.cpuScore('Intel Core i5-8400').score), 105));
test('Ryzen 5 5600 = 160', () => eq(Math.round(m.cpuScore('Ryzen 5 5600').score), 160));
test('мобильные суффиксы снижают оценку', () => truthy(m.cpuScore('i7-1165G7').score < m.cpuScore('i7-11700').score));
test('новые поколения быстрее старых', () => truthy(m.cpuScore('i5-12400F').score > m.cpuScore('i5-8400').score));
test('«2.4 GHz Quad core» не распознаётся', () => eq(m.cpuScore('2.4 GHz Quad core'), null));

console.log('Разбор значений');
test('parseGB', () => { eq(m.parseGB('8 GB RAM'), 8); eq(m.parseGB('2048 MB'), 2); eq(m.parseGB('нет'), null); });
test('minWinVersion', () => { eq(m.minWinVersion('Windows 7 SP1 / 8 / 10 64-bit'), 6.1); eq(m.minWinVersion('Windows 11'), 11); });

console.log('Прогноз FPS');
const mk = (o) => Object.assign({ os: '', cpu: '', ram: '', gpu: '', vram: '', dx: '', storage: '', notes: [] }, o);
const game = {
  min: mk({ cpu: 'Intel Core i5-2300 2.8 GHz / AMD FX-6300, 3.5 GHz', gpu: 'GeForce GTX 460, 1 GB / Radeon HD 6870, 1 GB', ram: '6 GB RAM', notes: ['Low Settings, 60 FPS @ 1080p'] }),
  rec: mk({ cpu: 'Intel Core i5-4570 3.2 GHz / AMD FX-8350 4.2 GHz', gpu: 'GeForce GTX 660, 2 GB / Radeon HD 7870, 2 GB', ram: '8 GB RAM', notes: ['High Settings, 60 FPS @ 1080p'] }),
};
test('прогноз строится, 7 режимов, цели разработчика учтены', () => {
  const r = m.predictFps({ gpu: 'GeForce GTX 1650', cpu: 'Intel Core i5-10300H', ram: 8, vram: 4, device: 'laptop' }, game);
  truthy(r.ok, 'ok'); eq(r.rows.length, 7);
  truthy(r.notes.some((n) => /примечаний разработчика/.test(n)), 'нет заметки про цели разработчика');
  const ultra = r.rows[4];
  truthy(ultra.avg > 40 && ultra.avg < 65, 'Ультра 1080p вне ожидаемых 40–65, получено ' + ultra.avg);
});
test('FPS убывает с ростом пресета и разрешения', () => {
  const r = m.predictFps({ gpu: 'GeForce RTX 3060', cpu: 'Ryzen 5 5600', ram: 16, vram: 12, device: 'desktop' }, game);
  for (let i = 1; i < 7; i++) truthy(r.rows[i].avg <= r.rows[i - 1].avg + 0.001, 'строка ' + i + ' быстрее предыдущей');
});
test('диапазон содержит среднее', () => {
  const r = m.predictFps({ gpu: 'GeForce RTX 3060', cpu: 'Ryzen 5 5600', ram: 16, device: 'desktop' }, game);
  r.rows.forEach((x) => truthy(x.lo < x.avg && x.avg < x.hi));
});
test('нехватка ОЗУ снижает FPS и ухудшает стабильность', () => {
  const hw = { gpu: 'GeForce RTX 3060', cpu: 'Ryzen 5 5600', vram: 12, device: 'desktop' };
  const ok = m.predictFps({ ...hw, ram: 16 }, game); const low = m.predictFps({ ...hw, ram: 4 }, game);
  truthy(low.rows[3].avg < ok.rows[3].avg); eq(low.rows[3].stab, 'Нестабильно');
});
test('неизвестная видеокарта → прогноза нет', () => {
  const r = m.predictFps({ gpu: 'Unknown GPU 9000', cpu: 'Ryzen 5 5600', device: 'desktop' }, game);
  eq(r.ok, false); truthy(r.reason);
});
test('нет видеокарты у игры → прогноза нет', () => {
  const r = m.predictFps({ gpu: 'GeForce RTX 3060', device: 'desktop' }, { min: mk({}), rec: mk({}) });
  eq(r.ok, false);
});
test('пользовательские значения подхватываются', () => {
  eq(m.loadCustom('{"gpu":{"rtx 9999":900}}'), null);
  eq(Math.round(m.gpuScore('RTX 9999').score), 900);
  truthy(typeof m.loadCustom('{bad json') === 'string', 'ожидалась ошибка JSON');
  m.loadCustom('');
});

console.log(failed ? '\nПровалено тестов: ' + failed : '\nВсе тесты пройдены');
process.exit(failed ? 1 : 0);
