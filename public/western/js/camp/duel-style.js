// Note: the style of every duel screen, one sheet under one root class; colours, fonts and buttons come from the campaign's variables and the .btn plaque, and nothing is fetched.
export const DUEL_ROOT = 'duel-ui';
export const DUEL_STYLE_ID = 'duel-view-style';

export const DUEL_CSS = `
.duel-ui {
  --d-ink: var(--ink, #2a1c0f);
  --d-soft: var(--ink-soft, #5a4430);
  --d-gold: var(--gold, #d9a441);
  --d-gold-l: var(--gold-l, #ecd27a);
  --d-bone: var(--bone, #e8dcc0);
  --d-wood: var(--wood-d, #3d2c1e);
  --d-plank: var(--wood, #5c4129);
  --d-red: var(--red, #9a3a2a);
  --d-red-d: var(--red-d, #6b2a20);
  --d-green: var(--green-d, #2f3a26);
  --d-display: var(--display, Georgia, serif);
  --d-serif: var(--serif, Georgia, serif);
  --d-type: var(--type, 'Courier New', monospace);
  --d-paper: linear-gradient(#f3e6c3, #e2cf9f);
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
  padding-bottom: 12px;
  color: var(--d-ink);
  font-family: var(--d-serif);
}
.duel-ui :focus-visible { outline: 3px solid #ffe08a; outline-offset: 2px; }
.duel-ui .duel-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

.duel-ui.is-away { display: block; padding: 12px; font: italic 1rem var(--d-serif); color: var(--d-soft); }

/* Note: the exchange takes over the window like the breach: a black page, and the arena the largest box of its shape that fits, centred; the pointer is hidden over all of it until a sheet or the menu needs it. */
.duel-ui.is-exchange { position: fixed; inset: 0; z-index: 1000; display: block; height: auto; padding: 0; gap: 0; background: #000; font-size: 16px; user-select: none; cursor: none; }
.duel-ui.is-exchange.is-over, .duel-ui.is-exchange.is-over *, .duel-ui.is-exchange.is-menu, .duel-ui.is-exchange.is-menu * { cursor: default; }
.duel-ui.is-exchange.is-over .btn, .duel-ui.is-exchange.is-menu .btn { cursor: pointer; }
.duel-ui .duel-view { position: absolute; inset: 0; margin: 0; }
.duel-ui .duel-view:focus, .duel-ui .duel-view:focus-visible { outline: none; }
.duel-ui .duel-field { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 100vw; height: 56vw; overflow: hidden; line-height: 0; background: #000; transition: filter 240ms ease-out; }
.duel-ui .duel-canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; background: #a67d50; image-rendering: auto; cursor: none; touch-action: none; }
.duel-ui .duel-aim { position: fixed; pointer-events: none; cursor: none; image-rendering: auto; }
.duel-ui .duel-inset { position: fixed; border-radius: 50%; pointer-events: none; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.55)); }
.duel-ui .duel-aim[hidden], .duel-ui .duel-inset[hidden], .duel-ui .duel-menu[hidden], .duel-ui .duel-controls[hidden] { display: none; }
.duel-ui.is-over .duel-field { filter: brightness(0.6) saturate(0.8); }
.duel-ui.is-menu .duel-field { filter: brightness(0.45) saturate(0.7); }
.duel-ui.is-menu .duel-aim, .duel-ui.is-menu .duel-inset { visibility: hidden; }

/* Note: the result is a nailed poster like the breach report: aged paper, a double rule inside, a nail in each corner, and an inked rubber stamp. */
.duel-ui .duel-sheet { position: fixed; left: 50%; top: 50%; z-index: 2; isolation: isolate; width: min(31rem, 92vw); max-height: 94vh; overflow: auto; transform: translate(-50%, -50%); padding: 30px 38px 26px; text-align: center; color: var(--d-ink); background: radial-gradient(ellipse at 10% 6%, rgba(120, 78, 28, 0.3), transparent 34%), radial-gradient(circle at 92% 90%, rgba(110, 66, 26, 0.34), transparent 28%), radial-gradient(ellipse at 50% 40%, #eddcb4 0%, #dfcb9c 62%, #c9ae7a 100%); box-shadow: inset 0 0 3.4rem rgba(98, 56, 18, 0.5), inset 0 0 0.4rem rgba(70, 40, 12, 0.7), 0 1.1rem 1.6rem rgba(0, 0, 0, 0.7); }
.duel-ui .duel-sheet::before { content: ''; position: absolute; inset: 12px; z-index: -1; pointer-events: none; border: 3px double rgba(70, 44, 20, 0.5); }
.duel-ui .duel-sheet::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: var(--nail, none) left 7px top 7px / 15px 15px no-repeat, var(--nail, none) right 7px top 7px / 15px 15px no-repeat, var(--nail, none) left 7px bottom 7px / 15px 15px no-repeat, var(--nail, none) right 7px bottom 7px / 15px 15px no-repeat; }
.duel-ui .duel-stamp { display: inline-block; margin: 2px 0 12px; padding: 2px 18px 0; font: 900 2.1rem / 1.1 var(--d-display); letter-spacing: 0.14em; text-transform: uppercase; color: var(--d-ink); border: 0.28rem solid currentColor; outline: 0.1rem solid currentColor; outline-offset: 0.18rem; transform: rotate(-6deg); mix-blend-mode: multiply; opacity: 0.9; }
.duel-ui .duel-sheet.is-win .duel-stamp { color: var(--d-green); }
.duel-ui .duel-sheet.is-loss .duel-stamp { color: var(--d-red); }
.duel-ui .duel-verdict { margin: 4px 0 12px; font: 900 1.35rem / 1.2 var(--d-display); letter-spacing: 0.03em; color: var(--d-ink); text-shadow: 1px 1px 0 rgba(142, 52, 32, 0.35); }
.duel-ui .duel-tally { display: grid; gap: 4px; margin: 0 0 18px; padding: 8px 0 0; list-style: none; border-top: 2px solid rgba(70, 44, 20, 0.45); font: 0.8rem / 1.4 var(--d-type); color: #3b2c1c; }
.duel-ui .duel-tally li { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.8fr) minmax(0, 1fr); gap: 10px; text-align: left; white-space: nowrap; }
.duel-ui .duel-tally b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 800 0.95rem var(--d-serif); }
.duel-ui .duel-tally li > span:last-child { text-align: right; }
.duel-ui .duel-sheet .duel-buttons { justify-content: center; gap: 12px; }

/* Note: the menu is the breach's pause sign: a plank board hung on two ropes, PAUSED in bone letters, the plaques stacked, the controls chalked on the wood. */
.duel-ui .duel-menu { position: fixed; left: 50%; top: 50%; z-index: 2; width: min(32rem, 94vw); max-height: 92vh; overflow: visible; transform: translate(-50%, -50%); padding: 30px 32px 32px; text-align: center; color: var(--d-bone); border: 0.3rem solid #24180d; border-radius: 0.3rem; box-shadow: 0 1.4rem 2rem rgba(0, 0, 0, 0.65), inset 0 0 2.6rem rgba(0, 0, 0, 0.55); background: var(--nail, none) left 10px top 10px / 16px 16px no-repeat, var(--nail, none) right 10px top 10px / 16px 16px no-repeat, var(--nail, none) left 10px bottom 10px / 16px 16px no-repeat, var(--nail, none) right 10px bottom 10px / 16px 16px no-repeat, repeating-linear-gradient(180deg, transparent 0 5.4rem, rgba(0, 0, 0, 0.6) 5.4rem calc(5.4rem + 2px), rgba(255, 220, 160, 0.12) calc(5.4rem + 2px) calc(5.4rem + 4px)), linear-gradient(90deg, #5c4129, #6a4b2d 35%, #523a24 70%, #5c4129); }
.duel-ui .duel-menu::before, .duel-ui .duel-menu::after { content: ''; position: absolute; bottom: calc(100% + 0.3rem); width: 0.5rem; height: 60vh; background: repeating-linear-gradient(60deg, #c1a46a 0 4px, #7d6538 4px 8px); box-shadow: 0 0 0 1px rgba(30, 20, 8, 0.6); }
.duel-ui .duel-menu::before { left: 2.2rem; transform: rotate(9deg); transform-origin: 50% 100%; }
.duel-ui .duel-menu::after { right: 2.2rem; transform: rotate(-9deg); transform-origin: 50% 100%; }
.duel-ui .duel-menu-h { margin: 0 0 18px; font: 900 2.6rem / 1 var(--d-display); letter-spacing: 0.22em; text-indent: 0.22em; text-transform: uppercase; color: var(--d-bone); text-shadow: 2px 3px 0 #1b120a, 0 0 0.5rem rgba(0, 0, 0, 0.5); }
.duel-ui .duel-menu-buttons { display: grid; gap: 12px; width: min(17rem, 100%); margin: 0 auto; }
.duel-ui .duel-menu-buttons .btn { width: 100%; font-size: 0.9rem; padding: 0.85rem 1rem; }
.duel-ui .duel-menu .duel-controls:not([hidden]) { display: block; margin-top: 18px; max-height: 40vh; overflow: auto; color: var(--d-bone); }
.duel-ui .duel-menu .duel-controls caption { color: var(--d-gold-l); opacity: 1; padding-bottom: 6px; border-bottom: 1px solid rgba(236, 210, 122, 0.4); }
.duel-ui .duel-menu .duel-controls th, .duel-ui .duel-menu .duel-controls td { border-bottom-color: rgba(236, 210, 122, 0.16); padding-top: 3px; padding-bottom: 3px; }
.duel-ui .duel-menu .duel-controls thead th { color: var(--d-gold-l); }
.duel-ui .duel-menu .duel-controls tbody th { width: 100%; white-space: normal; }

.duel-ui .duel-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
/* Note: items 356, 357, 359: the choice over a fallen opponent, a small plank board low in the picture. */
.duel-ui .duel-choice:not([hidden]) { position: fixed; left: 50%; bottom: 12vh; z-index: 2; transform: translateX(-50%); padding: 14px 20px; text-align: center; color: var(--d-bone); border: 0.25rem solid #24180d; border-radius: 0.3rem; box-shadow: 0 0.8rem 1.4rem rgba(0, 0, 0, 0.6); background: linear-gradient(90deg, #5c4129, #6a4b2d 35%, #523a24 70%, #5c4129); }
.duel-ui .duel-choice-h { margin: 0 0 10px; font: 900 1.3rem / 1 var(--d-display); letter-spacing: 0.18em; text-transform: uppercase; text-shadow: 2px 2px 0 #1b120a; }
.duel-ui .duel-choice .duel-buttons { justify-content: center; gap: 12px; }
.duel-ui .duel-choice-say { margin: 8px 0 0; font: 0.8rem var(--d-type); }
.duel-ui .duel-controls { width: 100%; border-collapse: collapse; font: 0.72rem / 1.2 var(--d-type); color: inherit; text-align: left; }
.duel-ui .duel-controls caption { padding: 0 0 3px; font: 800 0.7rem var(--d-display); letter-spacing: 0.24em; text-transform: uppercase; text-align: left; opacity: 0.85; }
.duel-ui .duel-controls th, .duel-ui .duel-controls td { padding: 1px 6px 1px 0; border-bottom: 1px solid rgba(128, 100, 60, 0.35); font-weight: 400; vertical-align: baseline; white-space: nowrap; }
.duel-ui .duel-controls thead th { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.8; }
.duel-ui .duel-controls tbody th { padding-right: 10px; }
.duel-ui .duel-controls kbd { display: inline-block; min-width: 1.6em; padding: 0 5px; font: 700 0.72rem / 1.45 var(--d-type); text-align: center; color: var(--d-ink); background: var(--d-bone); border: 1px solid #1a1008; border-radius: 3px; box-shadow: 0 1px 0 #1a1008; }

.duel-ui.is-poster { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); gap: 22px; align-items: stretch; padding: 2px 12px 14px 2px; }
.duel-ui .duel-poster { position: relative; display: flex; flex-direction: column; justify-content: center; min-height: 0; padding: 18px 30px; text-align: center; background: radial-gradient(ellipse at 10% 6%, rgba(120, 78, 28, 0.26), transparent 34%), radial-gradient(circle at 92% 90%, rgba(110, 66, 26, 0.3), transparent 28%), radial-gradient(ellipse at 50% 40%, #f0e1bc 0%, #e2cfa2 62%, #ccb17e 100%); border: 3px double rgba(70, 44, 20, 0.6); box-shadow: 0 4px 10px rgba(40, 24, 8, 0.4), inset 0 0 2.6rem rgba(98, 56, 18, 0.4); }
.duel-ui .duel-poster::before { content: ''; position: absolute; inset: 6px; pointer-events: none; background: var(--nail, none) 0 0 / 14px 14px no-repeat, var(--nail, none) 100% 0 / 14px 14px no-repeat, var(--nail, none) 0 100% / 14px 14px no-repeat, var(--nail, none) 100% 100% / 14px 14px no-repeat; }
.duel-ui .duel-kicker { margin: 0; font: 800 0.74rem var(--d-display); letter-spacing: 0.3em; text-transform: uppercase; color: var(--d-red-d); }
.duel-ui .duel-name { margin: 6px 0 2px; font: 900 2rem / 1.1 var(--d-display); letter-spacing: 0.04em; text-transform: uppercase; color: var(--d-ink); text-shadow: 2px 2px 0 rgba(142, 52, 32, 0.4); overflow-wrap: anywhere; }
.duel-ui .duel-against { margin: 0; font: italic 1rem var(--d-serif); color: var(--d-soft); }
.duel-ui .duel-rule { height: 0; margin: 10px 18% 8px; border: 0; border-top: 3px double rgba(70, 44, 20, 0.55); }
.duel-ui .duel-quote { margin: 0 0 8px; font: italic 1.1rem / 1.35 var(--d-serif); color: #2b2012; }
.duel-ui .duel-facts { display: grid; gap: 2px 14px; grid-template-columns: auto minmax(0, 1fr); margin: 6px auto 0; text-align: left; font: 0.8rem / 1.4 var(--d-type); }
.duel-ui .duel-facts dt { color: var(--d-soft); text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.7rem; padding-top: 2px; }
.duel-ui .duel-facts dd { margin: 0; color: #2b2012; }
.duel-ui .duel-lane { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; margin: 10px 0 2px; font: 0.76rem var(--d-type); color: var(--d-soft); }
.duel-ui .duel-lane i { height: 0; border-top: 3px dotted rgba(70, 44, 20, 0.6); }
.duel-ui .duel-lane b { width: 12px; height: 12px; border-radius: 50%; background: var(--d-ink); box-shadow: 0 0 0 3px rgba(70, 44, 20, 0.3); }
.duel-ui .duel-lane b.is-foe { background: var(--d-red); }

.duel-ui .duel-answer { display: flex; flex-direction: column; justify-content: center; gap: 14px; min-height: 0; overflow: hidden; padding: 18px 22px; color: var(--d-bone); background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.16) 0 2px, transparent 2px 7.5rem), linear-gradient(var(--d-plank), var(--d-wood)); border: 3px solid #1a1008; border-radius: 4px; box-shadow: inset 0 0 22px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 210, 150, 0.2), 0 4px 10px rgba(0, 0, 0, 0.45); }
.duel-ui .duel-answer-h { margin: 0; font: 800 0.74rem var(--d-display); letter-spacing: 0.24em; text-transform: uppercase; color: var(--d-gold-l); text-shadow: 0 1px 0 #1b120a; border-bottom: 1px solid rgba(236, 210, 122, 0.4); padding-bottom: 4px; }
.duel-ui .duel-lead { margin: 0; font: 1rem / 1.45 var(--d-serif); color: var(--d-bone); }
.duel-ui .duel-answer .duel-buttons { flex: none; flex-direction: column; align-items: stretch; gap: 12px; }
.duel-ui .duel-answer .duel-buttons .btn { width: 100%; height: 46px; font-size: 0.88rem; letter-spacing: 0.14em; }
/* Note: on the wood the controls are chalked in bone and gold, as in the menu, and scroll between the lead and the plaque. */
.duel-ui .duel-answer .duel-controls { display: block; flex: 0 1 auto; min-height: 0; overflow: auto; color: var(--d-bone); }
.duel-ui .duel-answer .duel-controls caption { color: var(--d-gold-l); opacity: 1; }
.duel-ui .duel-answer .duel-controls th, .duel-ui .duel-answer .duel-controls td { border-bottom-color: rgba(236, 210, 122, 0.16); padding-top: 3px; padding-bottom: 3px; }
.duel-ui .duel-answer .duel-controls thead th { color: var(--d-gold-l); }
.duel-ui .duel-answer .duel-controls tbody th { width: 100%; white-space: normal; }

@media (prefers-reduced-motion: no-preference) {
  .duel-ui .duel-sheet { animation: duel-sheet-in 260ms ease-out both; }
  .duel-ui .duel-stamp { animation: duel-stamp-in 420ms 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  .duel-ui .duel-menu:not([hidden]) { animation: duel-swing 700ms ease-out both; transform-origin: 50% -30vh; }
}
@media (prefers-reduced-motion: reduce) {
  .duel-ui .duel-field { transition: none; }
}
@keyframes duel-sheet-in { from { opacity: 0; transform: translate(-50%, -46%); } to { opacity: 1; transform: translate(-50%, -50%); } }
@keyframes duel-stamp-in { from { opacity: 0; transform: rotate(-6deg) scale(1.8); } to { opacity: 0.9; transform: rotate(-6deg) scale(1); } }
@keyframes duel-swing { 0% { transform: translate(-50%, -50%) rotate(-3deg); } 45% { transform: translate(-50%, -50%) rotate(1.6deg); } 75% { transform: translate(-50%, -50%) rotate(-0.6deg); } 100% { transform: translate(-50%, -50%) rotate(0deg); } }
`;

// Note: the sheet goes into the page once; a second call finds it by its id and does nothing.
export function injectDuelStyle(doc = globalThis.document) {
  if (!doc || doc.getElementById(DUEL_STYLE_ID)) return false;
  const style = doc.createElement('style');
  style.setAttribute('id', DUEL_STYLE_ID);
  style.textContent = DUEL_CSS;
  doc.head.append(style);
  return true;
}
