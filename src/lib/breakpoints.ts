/**
 * Below this width the shelf switches to the phone layout with a bottom tab bar.
 * The same number has to stay in step with the `@media (max-width: 719px)` blocks
 * in index.css, shelf.css, and cover.css.
 */
export const PHONE_MAX_WIDTH = 719

export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`
