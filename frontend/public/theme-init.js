// Apply the saved theme (light, dark or system) before the page paints, so there is no flash of the wrong theme.
(function applySavedTheme() {
  try {
    var saved = window.localStorage.getItem('crewline-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (error) {
    // Storage can be blocked (private mode); the system setting applies.
  }
})();
