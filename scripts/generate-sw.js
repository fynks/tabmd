import { generateSW } from 'workbox-build';
import config from '../workbox-config.js';

const { count, size, warnings } = await generateSW(config);

console.log(`Workbox generated dist/sw.js (${count} precached files, ${size} bytes).`);
for (const warning of warnings) {
  console.warn(`Workbox: ${warning}`);
}
