// Note: theme name to layout function; each layout fills a RoomPlanner.

import { WORK } from './layouts-work.js';
import { LIFE } from './layouts-life.js';
import { PLANT } from './layouts-plant.js';

export const LAYOUTS = { ...WORK, ...LIFE, ...PLANT };
