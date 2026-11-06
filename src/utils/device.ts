

export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
};

export const getTileSize = (): number => {
  if (typeof window === 'undefined') return 110;

  // Use the live viewport, not physical screen dimensions or user-agent strings.
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  if (shortSide < 480) return 60;
  if (window.innerWidth < 768 || shortSide < 768) return 70;
  return 110;
};
