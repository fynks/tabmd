// Toast notifications and clipboard helpers shared by every UI module.
import { elements, ui } from './state.js';

export function notify(message, type = 'success', duration = 3000) {
  window.clearTimeout(ui.notificationTimer);
  elements.notification.replaceChildren();
  if (type === 'success') {
    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✓';
    elements.notification.append(icon);
  }
  elements.notification.append(document.createTextNode(message));
  elements.notification.hidden = false;
  elements.notification.className = `notification notification-${type}`;
  elements.notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
  elements.notification.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  ui.notificationTimer = window.setTimeout(() => {
    elements.notification.hidden = true;
  }, duration);
}

export function copyUsingFallback(value) {
  const activeElement = document.activeElement;
  const temporary = document.createElement('textarea');
  temporary.value = value;
  temporary.setAttribute('readonly', '');
  temporary.setAttribute('aria-hidden', 'true');
  temporary.style.position = 'fixed';
  temporary.style.inset = '0 auto auto -10000px';
  temporary.style.opacity = '0';
  document.body.append(temporary);
  temporary.focus({ preventScroll: true });
  temporary.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  temporary.remove();
  if (activeElement instanceof HTMLElement) activeElement.focus({ preventScroll: true });
  return copied;
}

export async function copyText(value) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return copyUsingFallback(value);
  }
}

export function flashCopyButton(button, copied) {
  button.classList.toggle('is-success', copied);
  window.setTimeout(() => button.classList.remove('is-success'), 1400);
}
