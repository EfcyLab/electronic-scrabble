/**
 * Electronic Scrabble FFSc online word validator tests.
 *
 * The HTML fixtures mirror responses observed from the FFSc checker on
 * 2026-08-27. No ODS word list is bundled with these tests.
 *
 * @author Electronic Scrabble Project
 * @version 0.20.0
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    FfscWordCheckUnavailableError,
    createFfscWordValidator,
    parseFfscWordCheckResponse,
    requestFfscWordCheck
} = require('../game/ffsc-word-validator');

const VALID_RESPONSE = `
<style>
    .elementor.elementor-location-popup {
        background-color: #2DF454;
        color: black;
    }
</style><span class="answer right-answer">Le mot <b>"CHAT"</b> est valide
<img class="valid-invalid" src="check.png" />
<br>Le joueur qui a contesté reçoit une pénalité de 5 points</span>`;

const INVALID_RESPONSE = `
<style>
    .elementor.elementor-location-popup {
        background-color: #FF5959;
        color: black;
    }
</style><span class="answer wrong-answer">Le mot
<b><strike>"XYZQZ"</strike></b> est invalide
<img class="valid-invalid" src="close.png" />
<br>Le joueur qui est contesté reprend le mot qu'il a posé sur la grille</span>`;

/**
 * Creates a minimal Fetch API response stub.
 *
 * @param {string} body Response body.
 * @param {number} [status] HTTP status.
 *
 * @returns {Object} Fetch-compatible response stub.
 */
function createResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async text() {
            return body;
        }
    };
}

test('parses the current FFSc right-answer response as valid', () => {
    assert.equal(parseFfscWordCheckResponse(VALID_RESPONSE), true);
});

test('parses the current FFSc wrong-answer response as invalid', () => {
    assert.equal(parseFfscWordCheckResponse(INVALID_RESPONSE), false);
});

test('rejects unexpected FFSc response markup without guessing validity', () => {
    assert.throws(
        () => parseFfscWordCheckResponse('<span>Unknown response</span>'),
        FfscWordCheckUnavailableError
    );
});

test('sends the FFSc WordPress action, word and browser-like request headers', async () => {
    let capturedUrl = null;
    let capturedOptions = null;

    const valid = await requestFfscWordCheck('chat', {
        endpoint: 'https://www.ffscrabble.fr/wp-admin/admin-ajax.php',
        referer: 'https://www.ffscrabble.fr/verificateur-de-mots/',
        origin: 'https://www.ffscrabble.fr',
        timeoutMs: 5000,
        async fetchImpl(url, options) {
            capturedUrl = url;
            capturedOptions = options;
            return createResponse(VALID_RESPONSE);
        }
    });

    assert.equal(valid, true);
    assert.equal(
        capturedUrl,
        'https://www.ffscrabble.fr/wp-admin/admin-ajax.php'
    );
    assert.equal(capturedOptions.method, 'POST');
    assert.equal(
        capturedOptions.headers.Referer,
        'https://www.ffscrabble.fr/verificateur-de-mots/'
    );
    assert.equal(
        capturedOptions.headers.Origin,
        'https://www.ffscrabble.fr'
    );
    assert.equal(
        capturedOptions.headers['X-Requested-With'],
        'XMLHttpRequest'
    );

    const body = new URLSearchParams(capturedOptions.body);

    assert.equal(body.get('action'), 'verifier_mot');
    assert.equal(body.get('mot'), 'CHAT');
});

test('reports HTTP failures as provider unavailability', async () => {
    await assert.rejects(
        () => requestFfscWordCheck('CHAT', {
            endpoint: 'https://example.invalid/ajax',
            referer: 'https://example.invalid/checker',
            origin: 'https://example.invalid',
            timeoutMs: 5000,
            async fetchImpl() {
                return createResponse('Service unavailable', 503);
            }
        }),
        (error) => (
            error instanceof FfscWordCheckUnavailableError &&
            error.code === 'WORD_CHECK_UNAVAILABLE'
        )
    );
});

test('caches FFSc results and avoids duplicate requests for the same word', async () => {
    let requestCount = 0;
    const validator = createFfscWordValidator({
        async fetchImpl() {
            requestCount += 1;
            return createResponse(VALID_RESPONSE);
        }
    });

    assert.equal(await validator.isValidAsync('CHAT'), true);
    assert.equal(await validator.isValidAsync('chat'), true);
    assert.equal(requestCount, 1);
});

test('validates several words sequentially and returns only invalid words', async () => {
    const validator = createFfscWordValidator({
        async fetchImpl(url, options) {
            const body = new URLSearchParams(options.body);
            const word = body.get('mot');

            return createResponse(word === 'CHAT' ? VALID_RESPONSE : INVALID_RESPONSE);
        }
    });

    assert.deepEqual(
        await validator.findInvalidWordsAsync(['CHAT', 'XYZQZ', 'chat']),
        ['XYZQZ']
    );
});
