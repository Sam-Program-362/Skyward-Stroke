/**
 * Identity of the application.
 *
 * Everything that shows the name, or that needs a stable per-app key, reads it from here so the
 * product can be renamed in one place instead of across the codebase.
 */
export const APP_NAME = 'Skyward Stroke';
/** The name as a single unbroken token: shows in the menu background tiles and in logs. */
export const APP_CODE_NAME = 'SKYWARDSTROKE';
/** The name split per word, so animated titles can wrap cleanly on narrow screens. */
export const APP_NAME_WORDS = APP_NAME.toUpperCase().split(' ');
export const APP_TAGLINE = 'Type the path. Find your flow.';
export const APP_DESCRIPTION =
  'A typing adventure across floating worlds. Type the path, ride the flow, and leave a ghost of your best run behind.';
/** Version of the saved-progress format. Bump it when the shape of Stats changes. */
export const APP_VERSION = '0.1.0';
/** localStorage key for saved progress, namespaced to this application. */
export const STORAGE_KEY = 'skyward-stroke-v1';
