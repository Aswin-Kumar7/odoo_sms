// All money is integer minor units (paise). Percentages are basis points (1800 = 18%).

/** Round half away from zero to an integer. */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** amount × bp / 10000, rounded half-up to whole minor units. */
export function applyBp(amount: number, bp: number): number {
  return roundHalfUp((amount * bp) / 10000);
}

/** Convert a major-unit decimal (e.g. 560.50) entered by a user into minor units. */
export function toMinor(major: number): number {
  return roundHalfUp(major * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}
