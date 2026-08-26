/**
 * Electronic Scrabble QR code renderer.
 *
 * Uses the local qrencode executable so Raspberry Pi console mode remains
 * fully offline and does not depend on a remote QR-code service.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const DEFAULT_QRENCODE_PATH = 'qrencode';
const MAX_PAYLOAD_LENGTH = 2048;

/**
 * Renders a QR code payload as inline SVG.
 *
 * @param {string} payload QR code payload.
 * @param {Object} options Rendering options.
 * @param {string} options.executable qrencode executable path.
 *
 * @returns {Promise<string>} Rendered SVG.
 */
async function renderQrSvg(
    payload,
    { executable = process.env.ELECTRONIC_SCRABBLE_QRENCODE_PATH || DEFAULT_QRENCODE_PATH } = {}
) {
    if (typeof payload !== 'string' || payload.length === 0) {
        throw new Error('A QR code payload is required.');
    }

    if (payload.length > MAX_PAYLOAD_LENGTH) {
        throw new Error('The QR code payload is too long.');
    }

    const { stdout } = await execFileAsync(executable, [
        '-t', 'SVG',
        '--inline',
        '--svg-path',
        '-m', '2',
        '-o', '-',
        payload
    ], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: 3000,
        windowsHide: true
    });

    if (!stdout.includes('<svg')) {
        throw new Error('qrencode did not return SVG output.');
    }

    return stdout;
}

module.exports = {
    DEFAULT_QRENCODE_PATH,
    MAX_PAYLOAD_LENGTH,
    renderQrSvg
};
