#!/usr/bin/env bash
#
# Electronic Scrabble Raspberry Pi console uninstaller.
#
# Stops and removes console services and kiosk integration. Persistent game
# data is deliberately preserved unless the administrator removes it manually.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this uninstaller with sudo." >&2
    exit 1
fi

SERVICE_USER="${ELECTRONIC_SCRABBLE_USER:-${SUDO_USER:-}}"

systemctl disable --now electronic-scrabble-server.service 2>/dev/null || true
systemctl disable --now electronic-scrabble-web.service 2>/dev/null || true
rm -f /etc/systemd/system/electronic-scrabble-server.service
rm -f /etc/systemd/system/electronic-scrabble-web.service
rm -f /etc/sudoers.d/electronic-scrabble
rm -f /usr/local/bin/electronic-scrabble-kiosk
rm -f /usr/local/sbin/electronic-scrabble-configure-access-point
systemctl daemon-reload

if [[ -n "${SERVICE_USER}" ]] && id "${SERVICE_USER}" >/dev/null 2>&1; then
    SERVICE_HOME="$(getent passwd "${SERVICE_USER}" | cut -d: -f6)"
    AUTOSTART="${SERVICE_HOME}/.config/labwc/autostart"

    if [[ -f "${AUTOSTART}" ]]; then
        sed -i \
            '/^# BEGIN Electronic Scrabble kiosk$/,/^# END Electronic Scrabble kiosk$/d' \
            "${AUTOSTART}"
    fi
fi

echo "Electronic Scrabble console integration removed."
echo "Persistent data under /var/lib/electronic-scrabble was preserved."
echo "Any NetworkManager access-point profile was preserved to avoid disconnecting this session."
