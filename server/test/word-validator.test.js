/**
 * Electronic Scrabble word validator tests.
 *
 * @author Electronic Scrabble Project
 * @version 0.9.0
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    WordValidationError,
    createDisabledWordValidator,
    createWordValidator,
    getPublicWordValidationState,
    loadConfiguredWordValidator,
    loadWordSet,
    validateMoveWords
} = require('../game/word-validator');

const FIXTURE_PATH = path.join(
    __dirname,
    'fixtures',
    'sample-dictionary.txt'
);

test('loads a plain-text dictionary while ignoring comments and blank lines', () => {
    const words = loadWordSet(FIXTURE_PATH);

    assert.equal(words.has('ARBRE'), true);
    assert.equal(words.has('CHAT'), true);
    assert.equal(words.size, 11);
});

test('validates words case-insensitively after normalization', () => {
    const validator = createWordValidator({
        words: new Set(['ARBRE', 'CHAT']),
        name: 'Test dictionary'
    });

    assert.equal(validator.isValid('arbre'), true);
    assert.equal(validator.isValid('CHAT'), true);
    assert.equal(validator.isValid('CHIEN'), false);
});

test('returns unique invalid words from a move', () => {
    const validator = createWordValidator({
        words: new Set(['ARBRE']),
        name: 'Test dictionary'
    });

    assert.deepEqual(
        validator.findInvalidWords(['ARBRE', 'XYZ', 'xyz']),
        ['XYZ']
    );
});

test('rejects a move when at least one formed word is absent', () => {
    const validator = createWordValidator({
        words: new Set(['ARBRE']),
        name: 'Test dictionary'
    });

    assert.throws(
        () => validateMoveWords(
            [
                { text: 'ARBRE' },
                { text: 'XYZ' }
            ],
            validator
        ),
        (error) => (
            error instanceof WordValidationError &&
            error.code === 'INVALID_WORD' &&
            error.invalidWords.length === 1 &&
            error.invalidWords[0] === 'XYZ'
        )
    );
});

test('disabled validation accepts structurally valid move words', () => {
    const validator = createDisabledWordValidator('optional');

    assert.doesNotThrow(() => validateMoveWords(
        [{ text: 'XYZ' }],
        validator
    ));
});

test('loads an optional validator from environment configuration', () => {
    const validator = loadConfiguredWordValidator({
        ELECTRONIC_SCRABBLE_DICTIONARY_MODE: 'optional',
        ELECTRONIC_SCRABBLE_DICTIONARY_PATH: FIXTURE_PATH,
        ELECTRONIC_SCRABBLE_DICTIONARY_NAME: 'Development fixture'
    });

    assert.equal(validator.enabled, true);
    assert.equal(validator.name, 'Development fixture');
    assert.equal(validator.isValid('JEU'), true);
});

test('required mode refuses to start without a dictionary path', () => {
    assert.throws(
        () => loadConfiguredWordValidator({
            ELECTRONIC_SCRABBLE_DICTIONARY_MODE: 'required'
        }),
        /DICTIONARY_PATH/
    );
});

test('public validator state never exposes a local file path', () => {
    const validator = loadConfiguredWordValidator({
        ELECTRONIC_SCRABBLE_DICTIONARY_MODE: 'optional',
        ELECTRONIC_SCRABBLE_DICTIONARY_PATH: FIXTURE_PATH,
        ELECTRONIC_SCRABBLE_DICTIONARY_NAME: 'Development fixture'
    });

    const publicState = getPublicWordValidationState(validator);
    const serialized = JSON.stringify(publicState);

    assert.equal(publicState.dictionaryName, 'Development fixture');
    assert.equal(serialized.includes(FIXTURE_PATH), false);
});
