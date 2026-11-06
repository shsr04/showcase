// Note: the single ironman save slot; the game state is plain JSON so this only guards storage access.

import { SAVE_KEY } from './config.js';

// Note: version 2 came with the true-scale sites, whose entities no longer match version 1 saves.
export const SAVE_VERSION = 2;

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.v === SAVE_VERSION && s.seed ? s : null;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, v: SAVE_VERSION, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Note: nothing to delete when storage is blocked.
  }
}

export function saveSummary(s) {
  const miles = Math.round(s.stats?.miles || 0);
  return `${s.name} · act ${s.act || 1} · day ${s.day} · ${miles} mi · seed ${s.seed}`;
}

// Note: deep copy through JSON so a snapshot never shares objects with the live game.
export function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}
