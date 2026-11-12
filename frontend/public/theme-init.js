// Apply the saved theme (light or dark) before the page paints, so there is no flash of the wrong theme; without one the device setting applies.
(function applySavedTheme() {
  try {
    var saved = window.localStorage.getItem('crewline-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (error) {
    // Storage can be blocked (private mode); the system setting applies.
  }
})();
