/**
 * Electronic Scrabble word-validation registry.
 *
 * Exposes the validation providers available to administrators and resolves
 * the validator and policy stored with each game. Remote FFSc validation is
 * selectable but never mandatory.
 *
 * @author Electronic Scrabble Project
 * @version 0.21.0
 */

const {
    createDisabledWordValidator,
    getPublicWordValidationState,
    loadConfiguredWordValidator
} = require('./word-validator');
const {
    createFfscWordValidator
} = require('./ffsc-word-validator');

const PROVIDER_STRUCTURAL = 'structural';
const PROVIDER_LOCAL = 'local';
const PROVIDER_FFSC = 'ffsc';
const POLICY_STRUCTURAL = 'structural';
const POLICY_AUTOMATIC = 'automatic';
const POLICY_CHALLENGE = 'challenge';
const SUPPORTED_ACTIVE_POLICIES = new Set([
    POLICY_AUTOMATIC,
    POLICY_CHALLENGE
]);

class WordValidationConfigurationError extends Error {
    /**
     * Creates a word-validation configuration error.
     *
     * @param {string} message Human-readable error message.
     */
    constructor(message) {
        super(message);
        this.name = 'WordValidationConfigurationError';
        this.code = 'INVALID_WORD_VALIDATION_CONFIGURATION';
    }
}

/**
 * Returns whether an environment flag is enabled.
 *
 * @param {string|undefined} value Raw environment value.
 * @param {boolean} defaultValue Value used when the variable is absent.
 *
 * @returns {boolean} Parsed flag.
 */
function parseEnvironmentFlag(value, defaultValue) {
    if (typeof value !== 'string' || value.trim() === '') {
        return defaultValue;
    }

    return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

/**
 * Creates the local dictionary validator independently from the default mode.
 *
 * @param {Object} environment Environment variables.
 *
 * @returns {Object} Local validator or a disabled validator.
 */
function createLocalValidator(environment) {
    const dictionaryPath = environment.ELECTRONIC_SCRABBLE_DICTIONARY_PATH?.trim();

    if (!dictionaryPath) {
        return createDisabledWordValidator('optional');
    }

    return loadConfiguredWordValidator({
        ...environment,
        ELECTRONIC_SCRABBLE_DICTIONARY_MODE: 'required'
    });
}

/**
 * Creates the FFSc validator from environment overrides.
 *
 * @param {Object} environment Environment variables.
 *
 * @returns {Object} FFSc validator.
 */
function createRemoteFfscValidator(environment) {
    const configuredTimeout = Number.parseInt(
        environment.ELECTRONIC_SCRABBLE_FFSC_TIMEOUT_MS ?? '',
        10
    );

    return createFfscWordValidator({
        endpoint: environment.ELECTRONIC_SCRABBLE_FFSC_ENDPOINT?.trim() || undefined,
        referer: environment.ELECTRONIC_SCRABBLE_FFSC_REFERER?.trim() || undefined,
        timeoutMs: Number.isFinite(configuredTimeout) ? configuredTimeout : undefined,
        name: environment.ELECTRONIC_SCRABBLE_FFSC_NAME?.trim()
            || (environment.ELECTRONIC_SCRABBLE_DICTIONARY_MODE?.trim().toLowerCase() === PROVIDER_FFSC
                ? environment.ELECTRONIC_SCRABBLE_DICTIONARY_NAME?.trim()
                : '')
            || 'FFSc ODS 9 online'
    });
}

/**
 * Creates a registry of selectable validation providers.
 *
 * @param {Object} environment Environment variables.
 *
 * @returns {Object} Provider registry.
 */
function createWordValidationRegistry(environment = process.env) {
    const structuralValidator = createDisabledWordValidator('off');
    const localValidator = createLocalValidator(environment);
    const ffscEnabled = parseEnvironmentFlag(
        environment.ELECTRONIC_SCRABBLE_FFSC_PROVIDER_ENABLED,
        true
    );
    const ffscValidator = ffscEnabled
        ? createRemoteFfscValidator(environment)
        : null;
    const providers = new Map([
        [PROVIDER_STRUCTURAL, structuralValidator]
    ]);

    if (localValidator.enabled) {
        providers.set(PROVIDER_LOCAL, localValidator);
    }

    if (ffscValidator !== null) {
        providers.set(PROVIDER_FFSC, ffscValidator);
    }

    const configuredMode = (
        environment.ELECTRONIC_SCRABBLE_DICTIONARY_MODE || 'optional'
    ).trim().toLowerCase();
    let defaultProvider = PROVIDER_STRUCTURAL;

    if (configuredMode === PROVIDER_FFSC && providers.has(PROVIDER_FFSC)) {
        defaultProvider = PROVIDER_FFSC;
    } else if (
        ['required', 'optional'].includes(configuredMode)
        && providers.has(PROVIDER_LOCAL)
    ) {
        defaultProvider = PROVIDER_LOCAL;
    }

    const configuredPolicy = (
        environment.ELECTRONIC_SCRABBLE_WORD_VALIDATION_POLICY || POLICY_AUTOMATIC
    ).trim().toLowerCase();
    const defaultPolicy = defaultProvider === PROVIDER_STRUCTURAL
        ? POLICY_STRUCTURAL
        : (SUPPORTED_ACTIVE_POLICIES.has(configuredPolicy)
            ? configuredPolicy
            : POLICY_AUTOMATIC);

    /**
     * Normalizes and validates a per-game configuration.
     *
     * @param {Object} configuration Requested configuration.
     * @param {string} configuration.provider Provider identifier.
     * @param {string} configuration.policy Validation policy.
     *
     * @returns {Object} Normalized configuration.
     */
    function normalizeConfiguration(configuration = {}) {
        const provider = typeof configuration.provider === 'string'
            ? configuration.provider.trim().toLowerCase()
            : defaultProvider;

        if (!providers.has(provider)) {
            throw new WordValidationConfigurationError(
                `Word-validation provider is unavailable: ${provider}.`
            );
        }

        if (provider === PROVIDER_STRUCTURAL) {
            return Object.freeze({
                provider: PROVIDER_STRUCTURAL,
                policy: POLICY_STRUCTURAL
            });
        }

        const policy = typeof configuration.policy === 'string'
            ? configuration.policy.trim().toLowerCase()
            : defaultPolicy;

        if (!SUPPORTED_ACTIVE_POLICIES.has(policy)) {
            throw new WordValidationConfigurationError(
                `Unsupported word-validation policy: ${policy}.`
            );
        }

        return Object.freeze({
            provider,
            policy
        });
    }

    /**
     * Resolves a persisted configuration with a safe fallback.
     *
     * @param {Object|null} configuration Persisted configuration.
     *
     * @returns {Object} Valid configuration.
     */
    function restoreConfiguration(configuration) {
        try {
            return normalizeConfiguration(
                configuration && typeof configuration === 'object'
                    ? configuration
                    : {
                        provider: defaultProvider,
                        policy: defaultPolicy
                    }
            );
        } catch (error) {
            if (!(error instanceof WordValidationConfigurationError)) {
                throw error;
            }

            return Object.freeze({
                provider: PROVIDER_STRUCTURAL,
                policy: POLICY_STRUCTURAL
            });
        }
    }

    /**
     * Returns the validator assigned to a game configuration.
     *
     * @param {Object} configuration Normalized configuration.
     *
     * @returns {Object} Validator instance.
     */
    function getValidator(configuration) {
        const normalized = normalizeConfiguration(configuration);

        return providers.get(normalized.provider);
    }

    /**
     * Returns safe public validation information for a game.
     *
     * @param {Object} configuration Game validation configuration.
     *
     * @returns {Object} Public state.
     */
    function getPublicState(configuration) {
        const normalized = normalizeConfiguration(configuration);
        const validator = providers.get(normalized.provider);

        return {
            ...getPublicWordValidationState(validator),
            provider: normalized.provider,
            policy: normalized.policy
        };
    }

    /**
     * Returns the options safe to expose to administrator clients.
     *
     * @returns {Object} Public configuration options.
     */
    function getPublicOptions() {
        return {
            defaultProvider,
            defaultPolicy,
            providers: Array.from(providers.entries()).map(([id, validator]) => ({
                id,
                name: validator.name,
                wordCount: validator.wordCount,
                online: validator.online === true,
                requiresInternet: validator.requiresInternet === true
            })),
            policies: [POLICY_AUTOMATIC, POLICY_CHALLENGE]
        };
    }

    return Object.freeze({
        defaultConfiguration: Object.freeze({
            provider: defaultProvider,
            policy: defaultPolicy
        }),
        getPublicOptions,
        getPublicState,
        getValidator,
        normalizeConfiguration,
        restoreConfiguration
    });
}

module.exports = {
    POLICY_AUTOMATIC,
    POLICY_CHALLENGE,
    POLICY_STRUCTURAL,
    PROVIDER_FFSC,
    PROVIDER_LOCAL,
    PROVIDER_STRUCTURAL,
    WordValidationConfigurationError,
    createWordValidationRegistry,
    parseEnvironmentFlag
};
