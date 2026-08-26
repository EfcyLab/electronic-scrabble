/**
 * Electronic Scrabble reconnecting WebSocket client.
 *
 * Wraps the browser WebSocket API with bounded automatic reconnection while
 * preserving the EventTarget, readyState, and send interfaces used by the
 * application pages.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

(function registerReconnectingWebSocket(root) {
    const NativeWebSocket = root.WebSocket;

    /**
     * Reconnecting WebSocket wrapper.
     */
    class ElectronicScrabbleReconnectingWebSocket extends EventTarget {
        /**
         * Creates a reconnecting WebSocket.
         *
         * @param {string} url WebSocket endpoint.
         * @param {Object} options Reconnection options.
         */
        constructor(url, options = {}) {
            super();

            this.url = url;
            this.minimumDelayMs = options.minimumDelayMs ?? 500;
            this.maximumDelayMs = options.maximumDelayMs ?? 5000;
            this.backoffFactor = options.backoffFactor ?? 1.8;
            this.socket = null;
            this.reconnectTimer = null;
            this.reconnectAttempt = 0;
            this.manuallyClosed = false;

            this.connect();
        }

        /**
         * Returns the current native WebSocket ready state.
         *
         * @returns {number} Native WebSocket ready state.
         */
        get readyState() {
            return this.socket?.readyState ?? NativeWebSocket.CONNECTING;
        }

        /**
         * Opens a native WebSocket connection.
         *
         * @returns {void}
         */
        connect() {
            if (this.manuallyClosed) {
                return;
            }

            const socket = new NativeWebSocket(this.url);

            this.socket = socket;

            socket.addEventListener('open', () => {
                this.reconnectAttempt = 0;
                this.dispatchEvent(new Event('open'));
            });

            socket.addEventListener('message', (event) => {
                this.dispatchEvent(new MessageEvent('message', {
                    data: event.data,
                    origin: event.origin,
                    lastEventId: event.lastEventId
                }));
            });

            socket.addEventListener('error', () => {
                this.dispatchEvent(new Event('error'));
            });

            socket.addEventListener('close', (event) => {
                this.dispatchEvent(new CloseEvent('close', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean
                }));

                if (!this.manuallyClosed) {
                    this.scheduleReconnect();
                }
            });
        }

        /**
         * Schedules a bounded exponential reconnect attempt.
         *
         * @returns {void}
         */
        scheduleReconnect() {
            if (this.reconnectTimer !== null || this.manuallyClosed) {
                return;
            }

            const delay = Math.min(
                this.maximumDelayMs,
                this.minimumDelayMs * (this.backoffFactor ** this.reconnectAttempt)
            );

            this.reconnectAttempt += 1;

            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.connect();
            }, delay);
        }

        /**
         * Sends data through the active native WebSocket.
         *
         * @param {string|ArrayBuffer|Blob|ArrayBufferView} data Outgoing data.
         *
         * @returns {void}
         */
        send(data) {
            if (this.socket?.readyState !== NativeWebSocket.OPEN) {
                throw new Error('WebSocket connection is not open.');
            }

            this.socket.send(data);
        }

        /**
         * Permanently closes the wrapper and disables reconnection.
         *
         * @param {number} code WebSocket close code.
         * @param {string} reason Close reason.
         *
         * @returns {void}
         */
        close(code, reason) {
            this.manuallyClosed = true;

            if (this.reconnectTimer !== null) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            this.socket?.close(code, reason);
        }
    }

    root.ElectronicScrabbleReconnectingWebSocket =
        ElectronicScrabbleReconnectingWebSocket;
})(window);
