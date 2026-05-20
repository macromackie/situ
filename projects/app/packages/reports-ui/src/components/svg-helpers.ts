export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    return trimTrailingZeros(value.toFixed(1));
  }
  if (absolute >= 1) {
    return trimTrailingZeros(value.toFixed(3));
  }
  return trimTrailingZeros(value.toPrecision(4));
}

function trimTrailingZeros(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(max - 1, 1))}…`;
}
