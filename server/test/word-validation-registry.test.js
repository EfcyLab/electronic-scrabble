/**
 * Electronic Scrabble per-game word-validation registry tests.
 *
 * Verifies provider availability, safe defaults, and policy normalization for
 * administrator-selectable word validation.
 *
 * @author Electronic Scrabble Project
 * @version 0.21.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    WordValidationConfigurationError,
    createWordValidationRegistry
} = require('../game/word-validation-registry');

test('registry exposes structural and optional FFSc providers without a local dictionary', () => {
    const registry = createWordValidationRegistry({
        ELECTRONIC_SCRABBLE_FFSC_PROVIDER_ENABLED: 'true'
    });
    const options = registry.getPublicOptions();

    assert.deepEqual(
        options.providers.map((provider) => provider.id),
        ['structural', 'ffsc']
    );
    assert.deepEqual(options.policies, ['automatic', 'challenge']);
});

test('registry exposes the local provider only when an authorized dictionary path exists', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'electronic-scrabble-dictionary-'));
    const dictionaryPath = path.join(directory, 'words.txt');

    fs.writeFileSync(dictionaryPath, 'CHAT\nTEST\n', 'utf8');

    try {
        const registry = createWordValidationRegistry({
            ELECTRONIC_SCRABBLE_DICTIONARY_PATH: dictionaryPath,
            ELECTRONIC_SCRABBLE_DICTIONARY_NAME: 'Authorized test dictionary',
            ELECTRONIC_SCRABBLE_FFSC_PROVIDER_ENABLED: 'false'
        });
        const options = registry.getPublicOptions();

        assert.deepEqual(
            options.providers.map((provider) => provider.id),
            ['structural', 'local']
        );
        assert.equal(options.providers[1].wordCount, 2);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('structural provider forces the structural policy', () => {
    const registry = createWordValidationRegistry({
        ELECTRONIC_SCRABBLE_FFSC_PROVIDER_ENABLED: 'true'
    });

    assert.deepEqual(
        registry.normalizeConfiguration({
            provider: 'structural',
            policy: 'challenge'
        }),
        {
            provider: 'structural',
            policy: 'structural'
        }
    );
});

test('FFSc provider accepts automatic and challenge policies independently per game', () => {
    const registry = createWordValidationRegistry({
        ELECTRONIC_SCRABBLE_FFSC_PROVIDER_ENABLED: 'true'
    });

    assert.equal(
        registry.normalizeConfiguration({
            provider: 'ffsc',
            policy: 'automatic'
        }).policy,
        'automatic'
    );
    assert.equal(
        registry.normalizeConfiguration({
            provider: 'ffsc',
            policy: 'challenge'
        }).policy,
        'challenge'
    );
});

test('unavailable providers are rejected and persisted invalid settings fall back safely', () => {
    const registry = createWordValidationRegistry({
        ELECTRONIC_SCRABBLE_FFSC_PROVIDER_ENABLED: 'false'
    });

    assert.throws(
        () => registry.normalizeConfiguration({
            provider: 'ffsc',
            policy: 'challenge'
        }),
        WordValidationConfigurationError
    );

    assert.deepEqual(
        registry.restoreConfiguration({
            provider: 'missing-provider',
            policy: 'automatic'
        }),
        {
            provider: 'structural',
            policy: 'structural'
        }
    );
});
