/**
 * Electronic Scrabble FFSc online word validator.
 *
 * Queries the Fédération Française de Scrabble online ODS 9 checker
 * through its WordPress AJAX endpoint. The remote endpoint is not treated
 * as a public API contract, so response parsing is intentionally strict
 * and failures never classify a word as invalid.
 *
 * @author Electronic Scrabble Project
 * @version 0.20.0
 */

const DEFAULT_ENDPOINT = 'https://www.ffscrabble.fr/wp-admin/admin-ajax.php';
const DEFAULT_REFERER = 'https://www.ffscrabble.fr/verificateur-de-mots/';
const DEFAULT_ORIGIN = 'https://www.ffscrabble.fr';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CACHE_SIZE = 2048;

class FfscWordCheckUnavailableError extends Error {
    /**
     * Creates an FFSc word-check availability error.
     *
     * @param {string} message Human-readable error message.
     * @param {Object} [options] Error options.
     * @param {Error} [options.cause] Original error.
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'FfscWordCheckUnavailableError';
        this.code = 'WORD_CHECK_UNAVAILABLE';
    }
}

/**
 * Normalizes a playable word for the remote checker.
 *
 * @param {string} word Word to normalize.
 *
 * @returns {string} Uppercase playable word.
 */
function normalizeFfscWord(word) {
    return typeof word === 'string'
        ? word.trim().toUpperCase()
        : '';
}

/**
 * Returns whether an HTML class attribute contains a class token.
 *
 * @param {string} html HTML response.
 * @param {string} className Class token to find.
 *
 * @returns {boolean} True when the class token is present.
 */
function responseHasClass(html, className) {
    const classAttributePattern = /class\s*=\s*["']([^"']*)["']/gi;
    let match;

    while ((match = classAttributePattern.exec(html)) !== null) {
        const classNames = match[1].split(/\s+/).filter(Boolean);

        if (classNames.includes(className)) {
            return true;
        }
    }

    return false;
}

/**
 * Parses the FFSc checker HTML response.
 *
 * The current checker marks accepted words with `right-answer` and rejected
 * words with `wrong-answer`. Text content is deliberately ignored because it
 * can change with wording or localization.
 *
 * @param {string} html FFSc HTML fragment.
 *
 * @returns {boolean} True for a valid word, false for an invalid word.
 *
 * @throws {FfscWordCheckUnavailableError} When the response cannot be parsed.
 */
function parseFfscWordCheckResponse(html) {
    if (typeof html !== 'string' || html.trim() === '') {
        throw new FfscWordCheckUnavailableError(
            'The FFSc word checker returned an empty response.'
        );
    }

    const valid = responseHasClass(html, 'right-answer');
    const invalid = responseHasClass(html, 'wrong-answer');

    if (valid === invalid) {
        throw new FfscWordCheckUnavailableError(
            'The FFSc word checker returned an unexpected response format.'
        );
    }

    return valid;
}

/**
 * Requests one word from the FFSc online checker.
 *
 * @param {string} word Word to validate.
 * @param {Object} options Request options.
 * @param {Function} options.fetchImpl Fetch implementation.
 * @param {string} options.endpoint FFSc AJAX endpoint.
 * @param {string} options.referer FFSc checker page URL.
 * @param {string} options.origin FFSc origin URL.
 * @param {number} options.timeoutMs Request timeout in milliseconds.
 *
 * @returns {Promise<boolean>} True when the word is valid.
 */
async function requestFfscWordCheck(word, options) {
    const normalizedWord = normalizeFfscWord(word);

    if (!/^[A-Z]{2,15}$/.test(normalizedWord)) {
        return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, options.timeoutMs);

    const body = new URLSearchParams({
        action: 'verifier_mot',
        mot: normalizedWord
    });

    try {
        const response = await options.fetchImpl(options.endpoint, {
            method: 'POST',
            headers: {
                Accept: 'text/html, */*; q=0.01',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Origin: options.origin,
                Referer: options.referer,
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: body.toString(),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new FfscWordCheckUnavailableError(
                `The FFSc word checker returned HTTP ${response.status}.`
            );
        }

        return parseFfscWordCheckResponse(await response.text());
    } catch (error) {
        if (error instanceof FfscWordCheckUnavailableError) {
            throw error;
        }

        const reason = error?.name === 'AbortError'
            ? 'The FFSc word checker timed out.'
            : 'The FFSc word checker is unavailable.';

        throw new FfscWordCheckUnavailableError(reason, {
            cause: error
        });
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Creates an FFSc online validator with bounded in-memory caching.
 *
 * @param {Object} [options] Validator options.
 * @param {Function} [options.fetchImpl] Fetch implementation.
 * @param {string} [options.endpoint] FFSc AJAX endpoint.
 * @param {string} [options.referer] FFSc checker page URL.
 * @param {string} [options.origin] FFSc origin URL.
 * @param {number} [options.timeoutMs] Request timeout in milliseconds.
 * @param {number} [options.cacheSize] Maximum cached word count.
 * @param {string} [options.name] Public provider label.
 *
 * @returns {Object} Asynchronous word validator.
 */
function createFfscWordValidator(options = {}) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;

    if (typeof fetchImpl !== 'function') {
        throw new Error('The FFSc validator requires a Fetch API implementation.');
    }

    const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    const referer = options.referer ?? DEFAULT_REFERER;
    const origin = options.origin ?? DEFAULT_ORIGIN;
    const timeoutMs = Number.isFinite(options.timeoutMs)
        ? Math.max(1000, options.timeoutMs)
        : DEFAULT_TIMEOUT_MS;
    const cacheSize = Number.isInteger(options.cacheSize)
        ? Math.max(1, options.cacheSize)
        : DEFAULT_CACHE_SIZE;
    const cache = new Map();
    const inFlight = new Map();

    /**
     * Stores a word result while respecting the cache size limit.
     *
     * @param {string} word Normalized word.
     * @param {boolean} valid Validation result.
     *
     * @returns {void}
     */
    function cacheResult(word, valid) {
        if (cache.has(word)) {
            cache.delete(word);
        }

        cache.set(word, valid);

        while (cache.size > cacheSize) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
        }
    }

    /**
     * Validates one word, reusing cached and in-flight requests.
     *
     * @param {string} word Word to validate.
     *
     * @returns {Promise<boolean>} True when the word is valid.
     */
    async function isValidAsync(word) {
        const normalizedWord = normalizeFfscWord(word);

        if (!/^[A-Z]{2,15}$/.test(normalizedWord)) {
            return false;
        }

        if (cache.has(normalizedWord)) {
            return cache.get(normalizedWord);
        }

        if (inFlight.has(normalizedWord)) {
            return inFlight.get(normalizedWord);
        }

        const promise = requestFfscWordCheck(normalizedWord, {
            fetchImpl,
            endpoint,
            referer,
            origin,
            timeoutMs
        }).then((valid) => {
            cacheResult(normalizedWord, valid);
            return valid;
        }).finally(() => {
            inFlight.delete(normalizedWord);
        });

        inFlight.set(normalizedWord, promise);

        return promise;
    }

    return Object.freeze({
        enabled: true,
        mode: 'ffsc',
        provider: 'ffsc',
        name: options.name ?? 'FFSc ODS 9 online',
        wordCount: null,
        online: true,
        requiresInternet: true,
        isValidAsync,

        /**
         * Returns invalid words from a collection.
         *
         * Requests are performed sequentially to avoid unnecessary bursts
         * against the remote FFSc service.
         *
         * @param {Array<string>} wordsToValidate Words to validate.
         *
         * @returns {Promise<Array<string>>} Unique invalid words.
         */
        async findInvalidWordsAsync(wordsToValidate) {
            const uniqueWords = Array.from(new Set(
                wordsToValidate
                    .map(normalizeFfscWord)
                    .filter((word) => word !== '')
            ));
            const invalidWords = [];

            for (const word of uniqueWords) {
                if (!await isValidAsync(word)) {
                    invalidWords.push(word);
                }
            }

            return invalidWords;
        }
    });
}

module.exports = {
    DEFAULT_ENDPOINT,
    DEFAULT_ORIGIN,
    DEFAULT_REFERER,
    FfscWordCheckUnavailableError,
    createFfscWordValidator,
    normalizeFfscWord,
    parseFfscWordCheckResponse,
    requestFfscWordCheck
};
