import type { UnitSystem } from "./types";

/**
 * Pounds, feet and inches for the form, and nothing else (Part 12, R39).
 *
 * The server takes and stores metric and works every target out in it, so this is the one place a
 * conversion happens. It is display only: nothing here decides a target.
 */
export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;

/** Round to a number of decimal places, away from the float noise a conversion leaves. */
export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export const lbToKg = (pounds: number): number => pounds * KG_PER_LB;
export const kgToLb = (kilograms: number): number => kilograms / KG_PER_LB;

export function feetAndInchesToCm(feet: number, inches: number): number {
  return (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH;
}

/** Whole feet and inches to one decimal, carrying so that 5 ft 12 in never appears. */
export function cmToFeetAndInches(centimetres: number): { feet: number; inches: number } {
  const totalInches = roundTo(centimetres / CM_PER_INCH, 1);
  let feet = Math.floor(totalInches / INCHES_PER_FOOT);
  let inches = roundTo(totalInches - feet * INCHES_PER_FOOT, 1);

  if (inches >= INCHES_PER_FOOT) {
    feet += 1;
    inches = 0;
  }

  return { feet, inches };
}

/** A number as short as it can be: "165", not "165.0", and "82.5" when it is. */
function trimmed(value: number, places: number): string {
  return String(roundTo(value, places));
}

export function formatWeight(kilograms: number, units: UnitSystem): string {
  return units === "imperial" ? `${trimmed(kgToLb(kilograms), 1)} lb` : `${trimmed(kilograms, 1)} kg`;
}

export function formatHeight(centimetres: number, units: UnitSystem): string {
  if (units === "metric") return `${trimmed(centimetres, 1)} cm`;

  const { feet, inches } = cmToFeetAndInches(centimetres);
  return `${feet} ft ${trimmed(inches, 1)} in`;
}

/**
 * A number out of a text box, or null when it is not one. Rejects what `Number()` would let through:
 * an empty box is not zero, and "12abc" is not 12.
 */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim();
  if (cleaned === "" || !/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
