// Lean icon layer: Lucide icon nodes are imported one file at a time (never the
// package index) and rendered with a small SVG factory. Same shapes and stroke
// language as before, without the createIcons runtime or the full icon index.

import Activity from 'lucide/dist/esm/icons/activity.mjs';
import ArrowDownAZ from 'lucide/dist/esm/icons/arrow-down-a-z.mjs';
import ChevronDown from 'lucide/dist/esm/icons/chevron-down.mjs';
import ChevronLeft from 'lucide/dist/esm/icons/chevron-left.mjs';
import ChevronRight from 'lucide/dist/esm/icons/chevron-right.mjs';
import ChevronUp from 'lucide/dist/esm/icons/chevron-up.mjs';
import Columns3 from 'lucide/dist/esm/icons/columns-3.mjs';
import Copy from 'lucide/dist/esm/icons/copy.mjs';
import EllipsisVertical from 'lucide/dist/esm/icons/ellipsis-vertical.mjs';
import GripVertical from 'lucide/dist/esm/icons/grip-vertical.mjs';
import Import from 'lucide/dist/esm/icons/import.mjs';
import Moon from 'lucide/dist/esm/icons/moon.mjs';
import Plus from 'lucide/dist/esm/icons/plus.mjs';
import Redo2 from 'lucide/dist/esm/icons/redo-2.mjs';
import Rows3 from 'lucide/dist/esm/icons/rows-3.mjs';
import Sun from 'lucide/dist/esm/icons/sun.mjs';
import Table2 from 'lucide/dist/esm/icons/table-2.mjs';
import Trash from 'lucide/dist/esm/icons/trash.mjs';
import Undo2 from 'lucide/dist/esm/icons/undo-2.mjs';

// data-lucide name → icon node.
export const icons = Object.freeze({
  activity: Activity,
  'arrow-down-a-z': ArrowDownAZ,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'columns-3': Columns3,
  copy: Copy,
  'ellipsis-vertical': EllipsisVertical,
  'grip-vertical': GripVertical,
  import: Import,
  moon: Moon,
  'more-vertical': EllipsisVertical,
  plus: Plus,
  'redo-2': Redo2,
  'rows-3': Rows3,
  sun: Sun,
  'table-2': Table2,
  trash: Trash,
  'trash-2': Trash,
  'undo-2': Undo2,
});

const SVG_DEFAULTS = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.8,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

function createSVGElement(node) {
  const [tag, attrs = {}, children = []] = node;
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, String(value));
  }
  for (const child of children) element.append(createSVGElement(child));
  return element;
}

// Builds an <svg> for an icon node (an array of [tag, attrs] shapes).
export function createIcon(node, customAttrs = {}) {
  return createSVGElement(['svg', { ...SVG_DEFAULTS, ...customAttrs }, node]);
}

// Replaces <i data-lucide="…"> placeholders (used in index.html) in place.
export function renderIcons(root = document) {
  root.querySelectorAll('i[data-lucide]').forEach((placeholder) => {
    const node = icons[placeholder.getAttribute('data-lucide')];
    if (!node) return;
    const attrs = { 'aria-hidden': 'true' };
    if (placeholder.className) attrs.class = placeholder.className;
    placeholder.replaceWith(createIcon(node, attrs));
  });
}
