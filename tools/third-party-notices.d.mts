import type { Plugin } from 'vite';

/** Creates the build plugin that writes bundled dependencies' original notices into dist. */
export function thirdPartyNotices(root?: string): Plugin;
