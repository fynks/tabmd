// Light/dark theme state, persisted in localStorage with a system fallback.
import { elements } from './state.js';

function readSavedTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be unavailable in private browsing or sandboxed documents.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme, persist = true) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
  const label = value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  elements.themeToggle.setAttribute('aria-label', label);
  elements.themeToggle.title = label;
  elements.themeToggle.querySelector('.visually-hidden').textContent = label;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    value === 'dark' ? '#0b101a' : '#f8fafc',
  );
  if (persist) {
    try {
      localStorage.setItem('theme', value);
    } catch {
      // The theme still applies for this page load when storage is unavailable.
    }
  }
}

export function initTheme() {
  setTheme(readSavedTheme(), false);
}
