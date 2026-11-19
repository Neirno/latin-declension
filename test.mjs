import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// Compile the entire browser script; run the dictionary and rules without a DOM.
new vm.Script(script, { filename: 'index.html' });
const logic = script.slice(0, script.indexOf('    const form = document.'));
const { searchWord, classify, dictionary } = vm.runInNewContext(
  `${logic}\n({ searchWord, classify, dictionary })`,
);

function lookup(query, expected, fromDictionary = true) {
  const found = searchWord(query);
  assert.equal(found.error, undefined, query);
  assert.equal(found.fromDictionary, fromDictionary, query);
  assert.deepEqual(Array.from(found.matches, entry => [entry.gen, classify(entry).kind]), expected, query);
}

test('учебная схема: пять результатов', () => {
  lookup('animal', [['animalis', 'vocalic']]);
  lookup('pubes', [['pubis', 'mixedB']]);
  lookup('dens', [['dentis', 'mixedA']]);
  lookup('index', [['indicis', 'consonant']]);
  lookup('larynx', [['laryngis', 'exception']]);
  lookup('hepar', [['hepatis', 'exception']]);
  lookup('vas', [['vasis', 'exception']]);
  lookup('canis, canis f', [['canis', 'exception']]);
  const larynx = classify(searchWord('larynx').matches[0]);
  assert.match(larynx.steps.at(-2), /-ng.*смешанный А/);
  assert.match(larynx.steps.at(-1), /laryngum/);
  const hepar = classify(searchWord('hepar').matches[0]);
  assert.match(hepar.steps.at(-2), /гласный тип/);
  assert.match(hepar.steps.at(-1), /hepatum/);
});

test('регистр, диакритика, сокращения и омонимы', () => {
  lookup('FŎRĀMĔN, -ĬNĬS n.', [['foraminis', 'consonant']]);
  lookup('  cor   cordis   n  ', [['cordis', 'mixedA']]);
  lookup('pelvis, is, f.', [['pelvis', 'mixedB']]);
  lookup('larynx, ngis m', [['laryngis', 'exception']]);
  lookup('aër, aëris m', [['aeris', 'consonant']]);
  lookup('œdema', [['oedematis', 'consonant']]);
  lookup('os', [['oris', 'consonant'], ['ossis', 'mixedA']]);
  lookup('OS, OSSIS N', [['ossis', 'mixedA']]);
  lookup('os, oris', [['oris', 'consonant']]);
  lookup('fauces', [['faucium', 'plural']]);
  lookup('manus', [['manus', 'other']]);
  lookup('rosa, ae f', [['rosae', 'other']]);
});

test('полная форма слова вне словаря', () => {
  lookup('pāstor, pāstōris m', [['pastoris', 'consonant']], false);
  lookup('ovile, ovilis n', [['ovilis', 'vocalic']], false);
  lookup('navis, navis f', [['navis', 'mixedB']], false);
  lookup('nox, noctis f', [['noctis', 'mixedA']], false);
  lookup('onyx, onychis m', [['onychis', 'consonant']], false);
  lookup('aqua, aquae f', [['aquae', 'other']], false);
  lookup('imber, imbris m', [['imbris', 'mixedA']], false);
});

test('некорректные и неполные запросы', () => {
  for (const [query, error] of [
    ['', 'Введите слово'],
    ['зуб', 'Проверьте написание'],
    ['<img src=x>', 'Проверьте написание'],
    ['os, is n', 'Формы не совпали со словарём'],
    ['dens, dentis f', 'Формы не совпали со словарём'],
    ['nox', 'Нужна полная словарная форма'],
    ['nox, noctis', 'Нужна полная словарная форма'],
    ['nox, -ctis f', 'Нужна полная словарная форма'],
    ['clamor, oris m', 'Нужна полная словарная форма'],
    ['aqua, dentis f', 'Нужна полная словарная форма'],
  ]) {
    assert.equal(searchWord(query).error, error, query);
  }
});

test('во внешний поиск идут только незнакомые одиночные слова', () => {
  assert.equal(searchWord(' ŌNYX ').remote, 'onyx');
  assert.equal(searchWord('onyx, onychis m').remote, undefined);
  assert.equal(searchWord('onyx, onychis').remote, null);
  assert.equal(searchWord('ulcus').remote, undefined);
  assert.equal(searchWord('foramen').remote, undefined);
  assert.equal(searchWord('не латынь').remote, undefined);
});

test('словарные формы из обоих учебников находятся без сети', () => {
  lookup('anthelix, icis f', [['anthelicis', 'consonant']]);
  lookup('Bronchītis, idis f', [['bronchitidis', 'consonant']]);
  lookup('perionyx', [['perionychis', 'consonant']]);
  lookup('raphe, es f', [['raphes', 'other']]);
  lookup('asthma, atis n', [['asthmatis', 'consonant']]);
  lookup('cochlear', [['cochlearis', 'vocalic']]);
  lookup('metastasis', [['metastasis', 'mixedB']]);
  lookup('pulvis, eris m', [['pulveris', 'consonant']]);
  lookup('vulnus', [['vulneris', 'consonant']]);
  assert.equal(searchWord('bronchitis').matches[0].source, 'Бондаренко, 2005');
  assert.equal(searchWord('metastasis').matches[0].source, 'Чернявский и др., 1989');
});

test('тип склонения, исключение по роду и особые падежные формы не смешиваются', () => {
  const result = query => classify(searchWord(query).matches[0]);
  assert.equal(result('cor').kind, 'mixedA');
  assert.match(result('cor').notes[0], /Исключение по роду.*средний.*мужской/);
  assert.equal(result('pulvis').kind, 'consonant');
  assert.match(result('pulvis').notes[0], /Исключение по роду.*мужской.*женский/);
  assert.equal(result('salpinx').kind, 'exception');
  assert.match(result('salpinx').steps.at(-1), /Бондаренко.*salpingum/);
  assert.match(result('larynx').notes[0], /Исключение по роду/);
  assert.match(result('vas').steps.at(-1), /vasorum/);
  assert.equal(result('dosis').kind, 'mixedB');
  assert.match(result('dosis').notes[0], /dosim.*dosi/);
  assert.match(result('pelvis').notes[0], /pelvim.*pelvi/);
  assert.equal(result('fauces, ium f').kind, 'plural');
  assert.match(result('ile').notes[0], /ilium/);
});

test('каждая встроенная форма находится и разбирается однозначно', () => {
  for (const entries of dictionary.values()) {
    for (const entry of entries) {
      const query = `${entry.nom}, ${entry.gen} ${entry.gender[0]}`;
      const found = searchWord(query);
      assert.equal(found.matches?.length, 1, query);
      assert.equal(found.matches[0], entry, query);
      assert.notEqual(classify(entry).kind, 'uncertain', query);
    }
  }
});
