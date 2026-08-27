/**
 * Electronic Scrabble word validator.
 *
 * Loads a plain-text word list and validates every word created by a move.
 * No copyrighted Scrabble dictionary is bundled with the project.
 *
 * @author Electronic Scrabble Project
 * @version 0.9.0
 */

const fs = require('node:fs');
const path = require('node:path');
const {
    FfscWordCheckUnavailableError,
    createFfscWordValidator
} = require('./ffsc-word-validator');

const DEFAULT_MODE = 'optional';
const SUPPORTED_MODES = new Set(['off', 'optional', 'required', 'ffsc']);

class WordValidationError extends Error {
    /**
     * Creates a word validation error.
     *
     * @param {string} code Stable protocol error code.
     * @param {string} message Human-readable validation message.
     * @param {Array<string>} invalidWords Invalid words detected in the move.
     */
    constructor(code, message, invalidWords = []) {
        super(message);
        this.name = 'WordValidationError';
        this.code = code;
        this.invalidWords = invalidWords;
    }
}

/**
 * Normalizes a playable Scrabble word.
 *
 * Board words are represented with the French Scrabble tile alphabet A-Z.
 * Dictionary files must therefore contain one playable A-Z form per line.
 *
 * @param {string} word Word to normalize.
 *
 * @returns {string} Normalized uppercase word.
 */
function normalizeWord(word) {
    return typeof word === 'string'
        ? word.trim().toUpperCase()
        : '';
}

/**
 * Loads and validates a plain-text dictionary file.
 *
 * Empty lines and lines beginning with # are ignored.
 *
 * @param {string} filePath Dictionary file path.
 *
 * @returns {Set<string>} Loaded playable words.
 */
function loadWordSet(filePath) {
    const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const words = new Set();

    content.split(/\r?\n/).forEach((line, index) => {
        const word = normalizeWord(line);

        if (word === '' || word.startsWith('#')) {
            return;
        }

        if (!/^[A-Z]{2,15}$/.test(word)) {
            throw new Error(
                `Invalid dictionary entry at line ${index + 1}: ${line}`
            );
        }

        words.add(word);
    });

    if (words.size === 0) {
        throw new Error('The dictionary file does not contain any playable words.');
    }

    return words;
}

/**
 * Creates a word validator from a set of playable words.
 *
 * @param {Object} options Validator options.
 * @param {Set<string>} options.words Playable word set.
 * @param {string} options.name Public dictionary label.
 * @param {string} options.mode Validation mode.
 *
 * @returns {Object} Word validator.
 */
function createWordValidator({ words, name, mode = DEFAULT_MODE }) {
    const wordSet = new Set(Array.from(words, normalizeWord));

    return Object.freeze({
        enabled: true,
        mode,
        name,
        wordCount: wordSet.size,

        /**
         * Returns whether a word exists in the loaded dictionary.
         *
         * @param {string} word Word to validate.
         *
         * @returns {boolean} True when the word is allowed.
         */
        isValid(word) {
            return wordSet.has(normalizeWord(word));
        },

        /**
         * Returns invalid words from a collection.
         *
         * @param {Array<string>} wordsToValidate Words to validate.
         *
         * @returns {Array<string>} Unique invalid words.
         */
        findInvalidWords(wordsToValidate) {
            return Array.from(new Set(
                wordsToValidate
                    .map(normalizeWord)
                    .filter((word) => word !== '' && !wordSet.has(word))
            ));
        },

        async isValidAsync(word) {
            return wordSet.has(normalizeWord(word));
        },

        async findInvalidWordsAsync(wordsToValidate) {
            return this.findInvalidWords(wordsToValidate);
        }
    });
}

/**
 * Creates a disabled word validator.
 *
 * @param {string} mode Configured validation mode.
 *
 * @returns {Object} Disabled validator.
 */
function createDisabledWordValidator(mode = DEFAULT_MODE) {
    return Object.freeze({
        enabled: false,
        mode,
        name: null,
        wordCount: 0,
        isValid() {
            return true;
        },
        findInvalidWords() {
            return [];
        },
        async isValidAsync() {
            return true;
        },
        async findInvalidWordsAsync() {
            return [];
        }
    });
}

/**
 * Loads the validator configured through environment variables.
 *
 * ELECTRONIC_SCRABBLE_DICTIONARY_MODE supports off, optional, or required.
 * ELECTRONIC_SCRABBLE_DICTIONARY_PATH points to a local licensed word list.
 * ELECTRONIC_SCRABBLE_DICTIONARY_NAME provides the public display label.
 *
 * @param {Object} environment Environment variable object.
 *
 * @returns {Object} Configured validator.
 */
function loadConfiguredWordValidator(environment = process.env) {
    const mode = normalizeWord(
        environment.ELECTRONIC_SCRABBLE_DICTIONARY_MODE || DEFAULT_MODE
    ).toLowerCase();

    if (!SUPPORTED_MODES.has(mode)) {
        throw new Error(
            `Unsupported dictionary mode: ${mode}. Expected off, optional, required, or ffsc.`
        );
    }

    if (mode === 'off') {
        return createDisabledWordValidator(mode);
    }

    if (mode === 'ffsc') {
        const configuredTimeout = Number.parseInt(
            environment.ELECTRONIC_SCRABBLE_FFSC_TIMEOUT_MS ?? '',
            10
        );

        return createFfscWordValidator({
            endpoint: environment.ELECTRONIC_SCRABBLE_FFSC_ENDPOINT?.trim() || undefined,
            referer: environment.ELECTRONIC_SCRABBLE_FFSC_REFERER?.trim() || undefined,
            timeoutMs: Number.isFinite(configuredTimeout) ? configuredTimeout : undefined,
            name: environment.ELECTRONIC_SCRABBLE_DICTIONARY_NAME?.trim() || 'FFSc ODS 9 online'
        });
    }

    const configuredPath = environment.ELECTRONIC_SCRABBLE_DICTIONARY_PATH?.trim();

    if (!configuredPath) {
        if (mode === 'required') {
            throw new Error(
                'Word validation is required but ELECTRONIC_SCRABBLE_DICTIONARY_PATH is not configured.'
            );
        }

        return createDisabledWordValidator(mode);
    }

    const absolutePath = path.resolve(configuredPath);
    const words = loadWordSet(absolutePath);
    const configuredName = environment.ELECTRONIC_SCRABBLE_DICTIONARY_NAME?.trim();
    const name = configuredName || path.basename(absolutePath);

    return createWordValidator({
        words,
        name,
        mode
    });
}

/**
 * Returns safe public information about the validator.
 *
 * The local dictionary path is intentionally never exposed.
 *
 * @param {Object} validator Word validator.
 *
 * @returns {Object} Public validator status.
 */
function getPublicWordValidationState(validator) {
    return {
        enabled: validator.enabled,
        mode: validator.mode,
        dictionaryName: validator.name,
        wordCount: validator.wordCount,
        provider: validator.provider ?? 'local',
        online: validator.online === true,
        requiresInternet: validator.requiresInternet === true
    };
}

/**
 * Validates all words created by a move.
 *
 * @param {Array<Object>} words Scored move words.
 * @param {Object} validator Configured word validator.
 *
 * @returns {void}
 *
 * @throws {WordValidationError} When at least one word is not allowed.
 */
function validateMoveWords(words, validator) {
    if (!validator.enabled) {
        return;
    }

    const invalidWords = validator.findInvalidWords(
        words.map((word) => word.text)
    );

    if (invalidWords.length === 0) {
        return;
    }

    const noun = invalidWords.length === 1 ? 'word' : 'words';

    throw new WordValidationError(
        'INVALID_WORD',
        `Invalid ${noun}: ${invalidWords.join(', ')}.`,
        invalidWords
    );
}


/**
 * Asynchronously validates all words created by a move.
 *
 * @param {Array<Object>} words Scored move words.
 * @param {Object} validator Configured word validator.
 *
 * @returns {Promise<void>} Resolves when every word is allowed.
 *
 * @throws {WordValidationError} When at least one word is not allowed.
 * @throws {FfscWordCheckUnavailableError} When the remote provider is unavailable.
 */
async function validateMoveWordsAsync(words, validator) {
    if (!validator.enabled) {
        return;
    }

    const invalidWords = typeof validator.findInvalidWordsAsync === 'function'
        ? await validator.findInvalidWordsAsync(words.map((word) => word.text))
        : validator.findInvalidWords(words.map((word) => word.text));

    if (invalidWords.length === 0) {
        return;
    }

    const noun = invalidWords.length === 1 ? 'word' : 'words';

    throw new WordValidationError(
        'INVALID_WORD',
        `Invalid ${noun}: ${invalidWords.join(', ')}.`,
        invalidWords
    );
}

module.exports = {
    FfscWordCheckUnavailableError,
    WordValidationError,
    createDisabledWordValidator,
    createWordValidator,
    getPublicWordValidationState,
    loadConfiguredWordValidator,
    loadWordSet,
    normalizeWord,
    validateMoveWords,
    validateMoveWordsAsync
};
