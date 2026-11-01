/** Shared button and surface styles, so the visual language stays in one place. */

export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";

export const BTN_OUTLINE = `inline-flex items-center justify-center gap-1.5 rounded-full border border-hairline bg-white px-3.5 py-1.5 text-sm font-medium text-navy transition-colors hover:border-blue hover:text-blue ${FOCUS_RING}`;

/** Add-ingredient: blue, the palette's key-action colour. Fills on hover. */
export const BTN_BLUE = `inline-flex items-center justify-center gap-1.5 rounded-full border border-blue/40 bg-blue/5 px-3.5 py-1.5 text-sm font-semibold text-blue transition-colors hover:bg-blue hover:text-white hover:border-blue ${FOCUS_RING}`;

/** Add-meal: purple, the palette's submit/primary colour. Fills on hover. */
export const BTN_PURPLE = `inline-flex items-center justify-center gap-1.5 rounded-full border border-purple/40 bg-purple/5 px-3.5 py-1.5 text-sm font-semibold text-purple transition-colors hover:bg-purple hover:text-white hover:border-purple ${FOCUS_RING}`;

export const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-full bg-purple px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple/25 transition-colors hover:bg-purple/90 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;

export const BTN_GHOST = `inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-navy ${FOCUS_RING}`;

export const BTN_ICON = `inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-canvas hover:text-navy focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 ${FOCUS_RING}`;

export const CARD = "rounded-2xl border border-hairline bg-white shadow-sm";
