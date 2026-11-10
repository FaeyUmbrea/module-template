import type { ActorValueGroup } from '@faeyumbrea/obs-utils-api-types';
import { resolveResourceIndex } from '../../load-resources.js';
import index from './index.json' with { type: 'json' };

export default resolveResourceIndex<ActorValueGroup>(index, {});
