// Note: one import registers every kit, model and the spire; models.js imports this file and fills ENV first.
import './landmarks/farm.js';
import './landmarks/craft.js';
import './landmarks/rare-a.js';
import './landmarks/rare-b.js';
import './landmarks/infra.js';
import './spire.js';
import './goods-models.js';
import './ships-models.js';

export { LANDMARK_KITS, GOOD_MODELS, SHIP_MODELS, SPIRE, ENV, DEED_INDEX } from './registry.js';
export { buildSpireStage, SPIRE_STAGES, SPIRE_HEIGHT } from './spire.js';
export * from './defs.js';
