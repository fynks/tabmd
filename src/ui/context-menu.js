// Contextual row/column menu: positioning, item visibility, and keyboard
// navigation only. Menu actions are performed by the caller (table.js).
import { elements } from './state.js';

let menuState = { trigger: null, scope: null, index: -1, focusTarget: null };

export function menuContext() {
  return menuState;
}

export function contextMenuItems() {
  return Array.from(elements.contextMenu.querySelectorAll('.context-item'));
}

export function closeContextMenu({ restoreFocus = false } = {}) {
  if (elements.contextMenu.hidden) return;
  elements.contextMenu.hidden = true;
  const { trigger, focusTarget } = menuState;
  if (trigger instanceof HTMLElement) {
    trigger.classList.remove('is-menu-anchor');
    trigger.closest('tr, th')?.classList.remove('is-menu-anchor');
  }
  menuState = { trigger: null, scope: null, index: -1, focusTarget: null };
  if (restoreFocus && focusTarget instanceof HTMLElement) {
    focusTarget.focus({ preventScroll: true });
  }
}

function positionContextMenu(anchor) {
  const menu = elements.contextMenu;
  const anchorRect = (anchor instanceof HTMLElement ? anchor : elements.viewport).getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  const left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - menuRect.width - margin));
  let top = anchorRect.bottom + 4;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = Math.max(margin, anchorRect.top - menuRect.height - 4);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

export function openContextMenu({ scope, index, anchor, count, allowDelete = true }) {
  if (!(anchor instanceof HTMLElement)) return;
  if (!Number.isInteger(index) || index < 0 || index >= count) return;

  const activeElement = document.activeElement;
  const focusTarget = activeElement instanceof HTMLElement && elements.tableHost.contains(activeElement)
    ? activeElement
    : (anchor.querySelector('.cell-text') || anchor);

  closeContextMenu();
  menuState = { trigger: anchor, scope, index, focusTarget };
  anchor.classList.add('is-menu-anchor');
  anchor.closest('tr, th')?.classList.add('is-menu-anchor');
  elements.contextMenu.setAttribute('aria-label', scope === 'row' ? 'Row actions' : 'Column actions');

  contextMenuItems().forEach((item) => {
    item.hidden = item.dataset.scope !== scope;
    item.disabled = false;
  });
  const prev = elements.contextMenu.querySelector(`[data-action="move-prev"][data-scope="${scope}"]`);
  const next = elements.contextMenu.querySelector(`[data-action="move-next"][data-scope="${scope}"]`);
  const remove = elements.contextMenu.querySelector(`[data-action="delete"][data-scope="${scope}"]`);
  if (prev) prev.disabled = index <= 0;
  if (next) next.disabled = index >= count - 1;
  if (remove) remove.disabled = !allowDelete;

  elements.contextMenu.hidden = false;
  positionContextMenu(anchor);
  contextMenuItems().find((item) => !item.hidden && !item.disabled)?.focus({ preventScroll: true });
}

export function onContextMenuKeydown(event) {
  const items = contextMenuItems().filter((item) => !item.hidden && !item.disabled);
  const current = items.indexOf(document.activeElement);

  if (event.key === 'Escape') {
    event.preventDefault();
    closeContextMenu({ restoreFocus: true });
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(current + step + items.length) % items.length]?.focus({ preventScroll: true });
  } else if (event.key === 'Home') {
    event.preventDefault();
    items[0]?.focus({ preventScroll: true });
  } else if (event.key === 'End') {
    event.preventDefault();
    items[items.length - 1]?.focus({ preventScroll: true });
  } else if (event.key === 'Tab') {
    closeContextMenu();
  }
}

export function bindContextMenu({ onAction }) {
  elements.contextMenu.addEventListener('click', (event) => {
    const item = event.target instanceof Element ? event.target.closest('.context-item') : null;
    if (item && !item.disabled) onAction(item);
  });
  elements.contextMenu.addEventListener('keydown', onContextMenuKeydown);
  document.addEventListener('pointerdown', (event) => {
    if (elements.contextMenu.hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#contextMenu, [data-menu-trigger], .gutter-cell')) return;
    closeContextMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (elements.contextMenu.hidden) return;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeContextMenu({ restoreFocus: true });
  });
  window.addEventListener('resize', () => closeContextMenu());
  document.addEventListener('scroll', () => closeContextMenu(), true);
}
