// Note: the duel fills the window the way the breach does: the largest box of the arena's shape that fits, centred, with the rest left black.
export const fitBox = (width, height, aspect) => {
  const w = Math.max(1, Math.floor(Math.min(width, height * aspect)));
  return { width: w, height: w / aspect };
};

// Note: sizes el to the window now and after every resize, then tells onFit(box, dpr, { width, height }) what the stage box is and what the window is; dispose() takes the listener off.
export function bindFit(win, el, aspect, onFit = null) {
  const refit = () => {
    const box = fitBox(win.innerWidth, win.innerHeight, aspect);
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
    if (onFit) onFit(box, win.devicePixelRatio || 1, { width: win.innerWidth, height: win.innerHeight });
    return box;
  };
  refit();
  win.addEventListener('resize', refit);
  return {
    refit,
    dispose() {
      win.removeEventListener('resize', refit);
    },
  };
}

// Note: the box of the aim is a square of half the window's shorter side, at the middle of the window; it knows nothing of the stage, the camera or the zoom.
export const VIEW_SHARE = 0.5;
export function viewBox(width, height) {
  const side = VIEW_SHARE * Math.min(width, height);
  return { left: (width - side) / 2, top: (height - side) / 2, side };
}
