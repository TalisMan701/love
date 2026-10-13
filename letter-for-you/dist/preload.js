(() => {
  'use strict';
  const loader = window.GIFT_LOADER;
  if (!loader || loader.signal.aborted) return;
  const { signal } = loader;

  // Cached, failed and timed-out resources all settle without blocking forever.
  function waitForAsset(element, isReady, events) {
    if (signal.aborted || isReady()) return Promise.resolve();
    return new Promise((resolve) => {
      function done() {
        events.forEach((event) => element.removeEventListener(event, done));
        signal.removeEventListener('abort', done);
        resolve();
      }
      events.forEach((event) => element.addEventListener(event, done, { once: true }));
      signal.addEventListener('abort', done, { once: true });
    });
  }

  async function waitForFonts() {
    await Promise.all(Array.from(document.querySelectorAll('[data-preload-style]'), (link) =>
      waitForAsset(link, () => link.sheet || link.dataset.failed === 'true', ['load', 'error'])
    ));
    if (signal.aborted || !document.fonts) return;
    // Include faces used on the later screens, including Cyrillic and numerals.
    const sample = 'Любимой, с любовью Love 1234567890';
    const faces = [
      '500 16px Lora', '600 16px Lora',
      'italic 500 16px Lora', 'italic 600 16px Lora',
      '500 16px Nunito', '600 16px Nunito', '700 16px Nunito', '800 16px Nunito',
    ];
    await Promise.allSettled(faces.map((face) => document.fonts.load(face, sample)));
    await document.fonts.ready;
  }

  async function waitForImage(image) {
    image.loading = 'eager';
    await waitForAsset(image, () => image.complete, ['load', 'error']);
    if (!signal.aborted && image.naturalWidth && image.decode) {
      await image.decode().catch(() => {});
    }
  }

  const music = document.querySelector('#background-music');
  const audioReady = music
    ? waitForAsset(music, () => music.readyState >= 4 || music.error, ['canplaythrough', 'error'])
    : Promise.resolve();

  const preloader = document.querySelector('#preloader');
  const reflectVisibility = () => preloader.classList.toggle('is-paused', document.hidden);
  document.addEventListener('visibilitychange', reflectVisibility, { signal });
  reflectVisibility();

  Promise.allSettled([
    waitForFonts(),
    ...Array.from(document.images, waitForImage),
    audioReady,
  ]).then(loader.finish);
})();
