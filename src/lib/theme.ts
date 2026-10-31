/**
 * Light and dark mode. The page follows the device setting until the visitor picks a mode with the header
 * toggle; that choice is kept in localStorage and applied as data-theme on <html> before the first paint.
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "theme";

/**
 * The page background (--chalk) in each mode, for the browser bar colour, which has to be a literal.
 * tests/theme.test.ts keeps these equal to the stylesheet.
 */
export const THEME_COLOR = { light: "#f1f0eb", dark: "#131518" } as const;

/** A stored value, if it is a valid choice. Anything else (missing, cleared, tampered) means "follow the device". */
export function storedTheme(value: string | null): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** The mode the page is showing: the visitor's choice if they made one, otherwise the device's. */
export function effectiveTheme(choice: Theme | null, deviceDark: boolean): Theme {
  return choice ?? (deviceDark ? "dark" : "light");
}

/**
 * Inline script run before the page paints, so a saved choice never flashes the other mode first. Kept tiny and
 * self-contained; storage can throw (private mode, blocked site data), in which case the device setting applies.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
