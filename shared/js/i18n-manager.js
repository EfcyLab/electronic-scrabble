/**
 * Electronic Scrabble internationalization manager.
 *
 * Applies resource-bundle translations, persists the selected language,
 * and exposes interpolation and pluralization helpers to application pages.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */
(function initializeI18nManager(root) {
    const STORAGE_KEY = 'electronicScrabble.language';
    const DEFAULT_LANGUAGE = 'en';
    const locales = root.ElectronicScrabbleLocales || {};

    /**
     * Returns a supported language code.
     *
     * @param {string|null|undefined} language Requested language.
     *
     * @returns {string} Supported language code.
     */
    function normalizeLanguage(language) {
        return Object.prototype.hasOwnProperty.call(locales, language)
            ? language
            : DEFAULT_LANGUAGE;
    }

    /**
     * Interpolates named placeholders in a translated string.
     *
     * @param {string} value Resource value.
     * @param {Object} parameters Named parameters.
     *
     * @returns {string} Interpolated value.
     */
    function interpolate(value, parameters = {}) {
        return String(value).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => {
            return Object.prototype.hasOwnProperty.call(parameters, name)
                ? String(parameters[name])
                : match;
        });
    }

    /**
     * Returns the current language code.
     *
     * @returns {string} Current language.
     */
    function getLanguage() {
        return normalizeLanguage(
            document.documentElement.dataset.language ||
            localStorage.getItem(STORAGE_KEY) ||
            DEFAULT_LANGUAGE
        );
    }

    /**
     * Translates a resource key.
     *
     * Missing translations fall back to English, then to the key itself.
     *
     * @param {string} key Resource key.
     * @param {Object} parameters Named interpolation parameters.
     *
     * @returns {string} Translated string.
     */
    function translate(key, parameters = {}) {
        const language = getLanguage();
        const value = locales[language]?.[key] ?? locales[DEFAULT_LANGUAGE]?.[key] ?? key;

        return interpolate(value, parameters);
    }

    /**
     * Translates a singular/plural resource pair.
     *
     * @param {string} keyBase Resource key without the plural suffix.
     * @param {number} count Item count.
     * @param {Object} parameters Additional interpolation parameters.
     *
     * @returns {string} Translated pluralized string.
     */
    function translatePlural(keyBase, count, parameters = {}) {
        const suffix = Number(count) === 1 ? 'one' : 'other';

        return translate(`${keyBase}.${suffix}`, {
            ...parameters,
            count
        });
    }

    /**
     * Applies translations to declarative DOM attributes.
     *
     * @param {ParentNode} rootElement Translation root.
     *
     * @returns {void}
     */
    function translateDom(rootElement = document) {
        rootElement.querySelectorAll('[data-i18n]').forEach((element) => {
            element.textContent = translate(element.dataset.i18n);
        });

        rootElement.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
            element.setAttribute('aria-label', translate(element.dataset.i18nAriaLabel));
        });

        rootElement.querySelectorAll('[data-i18n-title]').forEach((element) => {
            element.setAttribute('title', translate(element.dataset.i18nTitle));
        });

        document.title = translate(document.body?.dataset.i18nPageTitle || 'common.game');
    }

    /**
     * Applies and persists a language selection.
     *
     * @param {string} language Requested language.
     *
     * @returns {void}
     */
    function setLanguage(language) {
        const normalizedLanguage = normalizeLanguage(language);

        localStorage.setItem(STORAGE_KEY, normalizedLanguage);
        document.documentElement.dataset.language = normalizedLanguage;
        document.documentElement.lang = normalizedLanguage;

        document.querySelectorAll('[data-language-picker]').forEach((picker) => {
            picker.value = normalizedLanguage;
        });

        translateDom();

        document.dispatchEvent(new CustomEvent('electronic-scrabble:language-changed', {
            detail: {
                language: normalizedLanguage
            }
        }));
    }

    /**
     * Initializes language selectors and initial translations.
     *
     * @returns {void}
     */
    function initialize() {
        const storedLanguage = normalizeLanguage(localStorage.getItem(STORAGE_KEY));

        document.documentElement.dataset.language = storedLanguage;
        document.documentElement.lang = storedLanguage;

        document.querySelectorAll('[data-language-picker]').forEach((picker) => {
            picker.value = storedLanguage;
            picker.addEventListener('change', () => {
                setLanguage(picker.value);
            });
        });

        translateDom();

        document.dispatchEvent(new CustomEvent('electronic-scrabble:language-changed', {
            detail: {
                language: storedLanguage
            }
        }));
    }

    const initialLanguage = normalizeLanguage(localStorage.getItem(STORAGE_KEY));
    document.documentElement.dataset.language = initialLanguage;
    document.documentElement.lang = initialLanguage;

    root.ElectronicScrabbleI18n = Object.freeze({
        getLanguage,
        setLanguage,
        t: translate,
        tp: translatePlural,
        translateDom
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})(window);
