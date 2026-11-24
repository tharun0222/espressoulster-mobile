(() => {
  if (window.__espressoulsterShowcaseInstalled) return;
  window.__espressoulsterShowcaseInstalled = true;

  const playbackControls = document.createElement('style');
  playbackControls.textContent = `
    .espresso-showcase button:is([aria-label^="Pause" i], [aria-label^="Play" i],
      [title^="Pause" i], [title^="Play" i]) { display: none !important; }
  `;
  document.head.append(playbackControls);

  // React owns autoplay and touch motion. A second native timer previously
  // polled layout four times a second and could advance the same wheel again
  // after a slow frame, causing skips on mobile devices.
})();
