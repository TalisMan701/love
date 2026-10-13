(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const config = window.GIFT_CONFIG;
  const visited = new Set();
  let activeScreen = 'intro';
  let opening = false;
  let revealTimer;
  let soundOn = true;
  let soundAvailable = true;
  let experienceReady = !document.documentElement.classList.contains('is-loading');
  const music = $('#background-music');
  music.volume = .4;

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.hidden = screen.id !== `screen-${name}`;
    });
    activeScreen = name;
    const currentStep = name === 'intro' ? 0 : name === 'notes' ? 1 : 2;
    document.querySelectorAll('[data-step]').forEach((step) => {
      const index = Number(step.dataset.step);
      step.classList.toggle('is-current', index === currentStep);
      step.classList.toggle('is-complete', index < currentStep);
      if (index === currentStep) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
    $(`#${name}-title`).focus({ preventScroll: true });
  }

  function startStory() {
    if (opening || activeScreen !== 'intro') return;
    opening = true;
    $('#envelope-scene').classList.add('is-opening');
    $('#start-button').disabled = true;
    $('#envelope-button').disabled = true;
    window.setTimeout(() => {
      showScreen('notes');
      opening = false;
    }, reducedMotion ? 0 : 720);
  }

  function makeIcon(mark) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${mark}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.append(use);
    return svg;
  }

  function makeSymbol(mark) {
    const symbol = document.createElement('span');
    symbol.className = 'note-symbol';
    symbol.setAttribute('aria-hidden', 'true');
    const available = ['heart', 'flower', 'spark', 'sun', 'hearts', 'infinity'];
    symbol.append(makeIcon(available.includes(mark) ? mark : 'heart'));
    return symbol;
  }

  function span(className, text) {
    const element = document.createElement('span');
    element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  config.notes.forEach((note, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-card';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Открыть признание ${index + 1}: ${note.title}`);
    const inner = span('note-inner');
    const front = span('note-face note-front');
    const back = span('note-face note-back');
    front.setAttribute('aria-hidden', 'true');
    back.setAttribute('aria-hidden', 'true');
    front.append(span('note-number', `0${index + 1}`), makeSymbol(note.mark), span('note-name', note.title), span('note-open-hint', 'Коснись, чтобы открыть'));
    const readMark = span('note-read');
    readMark.append(makeIcon('heart'));
    back.append(span('note-name', note.title), span('note-text', note.text), readMark);
    inner.append(front, back);
    button.append(inner);
    button.addEventListener('click', () => {
      const isOpen = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(isOpen));
      button.setAttribute('aria-label', isOpen ? `${note.title}. ${note.text}` : `Открыть признание ${index + 1}: ${note.title}`);
      visited.add(index);
      $('#notes-progress').replaceChildren(document.createTextNode('Открыто '), Object.assign(document.createElement('strong'), { textContent: `${visited.size} из ${config.notes.length}` }), document.createTextNode(' признаний'));
      if (visited.size === config.notes.length) {
        $('#to-gift-button').disabled = false;
      }
    });
    $('#notes-grid').append(button);
  });

  function burstConfetti() {
    const container = $('#confetti');
    container.replaceChildren();
    if (reducedMotion) return;
    const colors = ['#a2606f', '#cfa7a1', '#bc9b69', '#e0bfb9', '#7d3747'];
    for (let index = 0; index < 36; index++) {
      const piece = span('confetti-piece');
      piece.style.setProperty('--x', `${Math.random() * 100}%`);
      piece.style.setProperty('--color', colors[index % colors.length]);
      piece.style.setProperty('--delay', `${Math.random() * .8}s`);
      piece.style.setProperty('--duration', `${2.5 + Math.random() * 2}s`);
      if (index % 3 === 0) piece.style.borderRadius = '50%';
      container.append(piece);
    }
    window.setTimeout(() => container.replaceChildren(), 5500);
  }

  function openGift() {
    if (activeScreen !== 'seal' || revealTimer) return;
    $('#reveal-seal').classList.add('is-unsealing');
    $('#reveal-seal').setAttribute('aria-busy', 'true');
    $('#hold-hint').textContent = 'Пусть поводов улыбаться будет ещё больше…';
    revealTimer = window.setTimeout(() => {
      showScreen('gift');
      burstConfetti();
      revealTimer = undefined;
      $('#reveal-seal').removeAttribute('aria-busy');
    }, reducedMotion ? 150 : 1550);
  }

  function setupCertificate() {
    const certificate = config.certificate;
    if (!certificate?.code || !certificate?.pin) return;
    const code = String(certificate.code);
    const pin = String(certificate.pin);
    $('#certificate-code').textContent = code;
    $('#certificate-pin').textContent = pin;
    $('#certificate-details').hidden = false;
    if (Number.isFinite(certificate.amount) && certificate.amount > 0) {
      const amount = new Intl.NumberFormat('ru-RU').format(certificate.amount);
      $('#certificate-amount').textContent = amount;
      $('.gift-card').setAttribute('aria-label', `Подарочный сертификат Lamoda на ${amount} рублей для любимой`);
    }

    document.querySelectorAll('[data-copy-certificate]').forEach((button) => {
      button.addEventListener('click', async () => {
        const field = button.dataset.copyCertificate;
        const value = field === 'pin' ? pin : code;
        try {
          await navigator.clipboard.writeText(value);
          $('#certificate-status').textContent = field === 'pin' ? 'PIN-код скопирован.' : 'Код сертификата скопирован.';
        } catch {
          // Local files or restricted browsers may not allow clipboard access.
          const range = document.createRange();
          range.selectNodeContents($(`#certificate-${field}`));
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          $('#certificate-status').textContent = 'Скопируй выделенное значение вручную.';
        }
      });
    });

    let url;
    try { url = new URL(certificate.activationUrl); }
    catch { return; }
    if (!['https:', 'http:'].includes(url.protocol)) return;
    const link = $('#certificate-activate');
    link.href = url.href;
    link.hidden = false;
  }

  function reflectSoundState() {
    $('#sound-toggle').setAttribute('aria-pressed', String(soundOn));
    $('#sound-toggle').dataset.playing = String(!music.paused && music.readyState >= 3);
    $('#sound-toggle').setAttribute('aria-label', soundOn ? 'Выключить музыку' : 'Включить музыку');
    $('#sound-toggle').title = `${soundOn ? 'Выключить' : 'Включить'} музыку · Эрик Сати — Гимнопедия № 1`;
    $('#sound-label').textContent = soundOn ? 'звук вкл.' : 'звук выкл.';
    if (!soundAvailable) {
      $('#sound-toggle').disabled = true;
      $('#sound-toggle').setAttribute('aria-label', 'Звук недоступен');
      $('#sound-toggle').title = 'Не удалось загрузить музыку. Попробуй обновить страницу';
      $('#sound-label').textContent = 'звук недоступен';
    }
  }

  function syncPlayback() {
    // A pending autoplay request can resolve after the visitor has muted the site.
    if (!experienceReady || !soundOn || document.hidden) music.pause();
    reflectSoundState();
  }

  function ensureAudioPlayback() {
    if (!experienceReady || !soundOn || !soundAvailable || document.hidden || !music.paused) return;
    // Autoplay may need a gesture. Preserve the preference and retry on a click.
    void music.play().then(syncPlayback).catch((error) => {
      if (error.name === 'NotSupportedError') {
        soundOn = false;
        soundAvailable = false;
      }
      syncPlayback();
    });
  }

  music.addEventListener('playing', syncPlayback);
  music.addEventListener('pause', reflectSoundState);
  music.addEventListener('waiting', reflectSoundState);
  music.addEventListener('error', () => {
    soundOn = false;
    soundAvailable = false;
    syncPlayback();
  });

  $('#sound-toggle').addEventListener('click', () => {
    soundOn = !soundOn;
    syncPlayback();
    if (soundOn) ensureAudioPlayback();
  });

  function startMusicOnInteraction(event) {
    if (event.target.closest?.('#sound-toggle')) return;
    if (event.type === 'keydown' && (event.repeat || event.ctrlKey || event.metaKey || event.altKey)) return;
    ensureAudioPlayback();
  }
  document.addEventListener('click', startMusicOnInteraction, { capture: true });
  document.addEventListener('keydown', startMusicOnInteraction, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) syncPlayback();
    else ensureAudioPlayback();
  });
  document.addEventListener('gift:ready', () => {
    experienceReady = true;
    ensureAudioPlayback();
  }, { once: true });

  $('#start-button').addEventListener('click', startStory);
  $('#envelope-button').addEventListener('click', startStory);
  $('#to-gift-button').addEventListener('click', () => {
    if (visited.size === config.notes.length) showScreen('seal');
  });
  // Native click commits on release and lets a cancelled pointer gesture abort.
  $('#reveal-seal').addEventListener('click', openGift);
  $('#replay-button').addEventListener('click', () => {
    window.clearTimeout(revealTimer);
    revealTimer = undefined;
    visited.clear();
    document.querySelectorAll('.note-card').forEach((button, index) => {
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `Открыть признание ${index + 1}: ${config.notes[index].title}`);
    });
    $('#notes-progress').innerHTML = 'Открыто <strong>0 из 6</strong> признаний';
    $('#to-gift-button').disabled = true;
    $('#start-button').disabled = false;
    $('#envelope-button').disabled = false;
    $('#envelope-scene').classList.remove('is-opening');
    $('#reveal-seal').classList.remove('is-unsealing');
    $('#hold-hint').textContent = 'Нажми на сердечко — и случится маленькое чудо.';
    $('#confetti').replaceChildren();
    $('#certificate-status').textContent = '';
    showScreen('intro');
  });
  setupCertificate();
  reflectSoundState();
  ensureAudioPlayback();
})();
