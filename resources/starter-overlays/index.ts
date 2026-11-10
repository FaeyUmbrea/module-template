import type { OverlayData } from '@faeyumbrea/obs-utils-api-types';
import { resolveResourceIndex } from '../../load-resources.js';
import index from './index.json' with { type: 'json' };

export default resolveResourceIndex<OverlayData>(index, {});
