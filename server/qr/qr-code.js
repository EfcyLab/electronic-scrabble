/**
 * Electronic Scrabble QR code renderer.
 *
 * Generates SVG QR codes directly in Node.js through the qrcode package.
 * The renderer is platform-independent and does not require a Raspberry Pi
 * or an operating-system QR utility.
 *
 * @author Electronic Scrabble Project
 * @version 2.0.0
 */

const MAX_PAYLOAD_LENGTH = 2048;

/**
 * Loads the QR code library dependency.
 *
 * @returns {Object} QR code library.
 *
 * @throws {Error} When the qrcode dependency is not installed.
 */
function loadQrLibrary() {
    try {
        return require('qrcode');
    } catch (error) {
        const dependencyError = new Error(
            'The qrcode Node.js dependency is unavailable. Run "npm install" in the server directory.'
        );

        dependencyError.code = 'QR_RENDERER_UNAVAILABLE';
        dependencyError.cause = error;

        throw dependencyError;
    }
}

/**
 * Renders a QR code payload as inline SVG.
 *
 * @param {string} payload QR code payload.
 * @param {Object} options Rendering options.
 * @param {Object|null} options.qrLibrary Optional injected QR library.
 *
 * @returns {Promise<string>} Rendered SVG.
 */
async function renderQrSvg(payload, { qrLibrary = null } = {}) {
    if (typeof payload !== 'string' || payload.length === 0) {
        throw new Error('A QR code payload is required.');
    }

    if (payload.length > MAX_PAYLOAD_LENGTH) {
        throw new Error('The QR code payload is too long.');
    }

    const renderer = qrLibrary ?? loadQrLibrary();

    if (!renderer || typeof renderer.toString !== 'function') {
        throw new Error('The configured QR code renderer is invalid.');
    }

    const svg = await renderer.toString(payload, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 2,
        color: {
            dark: '#000000',
            light: '#FFFFFFFF'
        }
    });

    if (typeof svg !== 'string' || !svg.includes('<svg')) {
        throw new Error('The QR code renderer did not return SVG output.');
    }

    return svg;
}

module.exports = {
    MAX_PAYLOAD_LENGTH,
    loadQrLibrary,
    renderQrSvg
};
