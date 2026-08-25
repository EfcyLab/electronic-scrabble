/**
 * Electronic Scrabble theme manager.
 *
 * Applies a shared user-selected theme to every application page.
 * Themes are implemented with CSS custom properties and can be added
 * without modifying the page-specific layouts.
 *
 * @version 0.1.0
 */

(() => {
    const STORAGE_KEY = 'electronic-scrabble-theme';
    const DEFAULT_THEME = 'classic';
    const SUPPORTED_THEMES = new Set([
        'classic',
        'midnight',
        'forest'
    ]);

    /**
     * Returns a validated theme name.
     *
     * @param {string|null} theme Requested theme name.
     *
     * @returns {string} Valid theme name.
     */
    function normalizeTheme(theme) {
        return SUPPORTED_THEMES.has(theme)
            ? theme
            : DEFAULT_THEME;
    }

    /**
     * Applies a theme to the current document.
     *
     * @param {string} theme Theme name.
     *
     * @returns {void}
     */
    function applyTheme(theme) {
        const normalizedTheme = normalizeTheme(theme);

        document.documentElement.dataset.theme = normalizedTheme;

        document.querySelectorAll('[data-theme-picker]').forEach((picker) => {
            picker.value = normalizedTheme;
        });
    }

    /**
     * Stores and applies a selected theme.
     *
     * @param {string} theme Theme name.
     *
     * @returns {void}
     */
    function selectTheme(theme) {
        const normalizedTheme = normalizeTheme(theme);

        localStorage.setItem(STORAGE_KEY, normalizedTheme);
        applyTheme(normalizedTheme);
    }

    /**
     * Initializes all theme selectors present on the page.
     *
     * @returns {void}
     */
    function initializeThemePickers() {
        document.querySelectorAll('[data-theme-picker]').forEach((picker) => {
            picker.addEventListener('change', () => {
                selectTheme(picker.value);
            });
        });
    }

    const storedTheme = localStorage.getItem(STORAGE_KEY);

    applyTheme(storedTheme);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeThemePickers, {
            once: true
        });
    } else {
        initializeThemePickers();
    }

    window.ElectronicScrabbleTheme = Object.freeze({
        applyTheme,
        selectTheme
    });
})();
