#!/usr/bin/env bash
#
# Electronic Scrabble Raspberry Pi console installer.
#
# Installs systemd services for the WebSocket and static web servers, enables
# desktop autologin, configures the current Raspberry Pi OS Labwc autostart
# file for Chromium kiosk mode, and grants the service account narrowly scoped
# reboot/power-off permissions.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this installer with sudo." >&2
    exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SERVICE_USER="${ELECTRONIC_SCRABBLE_USER:-${SUDO_USER:-}}"
DATA_DIR="${ELECTRONIC_SCRABBLE_DATA_DIR:-/var/lib/electronic-scrabble/games}"
CONFIGURE_AUTOLOGIN="${ELECTRONIC_SCRABBLE_CONFIGURE_AUTOLOGIN:-1}"
CONFIGURE_ACCESS_POINT="${ELECTRONIC_SCRABBLE_CONFIGURE_ACCESS_POINT:-0}"

if [[ -z "${SERVICE_USER}" || "${SERVICE_USER}" == "root" ]]; then
    echo "Unable to determine the non-root Raspberry Pi desktop user." >&2
    echo "Set ELECTRONIC_SCRABBLE_USER before running the installer." >&2
    exit 1
fi

if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
    echo "Unknown service user: ${SERVICE_USER}" >&2
    exit 1
fi

SERVICE_GROUP="$(id -gn "${SERVICE_USER}")"
SERVICE_HOME="$(getent passwd "${SERVICE_USER}" | cut -d: -f6)"
NODE_PATH="$(command -v node || true)"
NPM_PATH="$(command -v npm || true)"
SYSTEMCTL_PATH="$(command -v systemctl || true)"
SUDO_PATH="$(command -v sudo || true)"

if [[ -z "${NODE_PATH}" ]]; then
    echo "Node.js is required before installing Electronic Scrabble." >&2
    exit 1
fi

if [[ -z "${SYSTEMCTL_PATH}" || -z "${SUDO_PATH}" ]]; then
    echo "systemctl and sudo are required." >&2
    exit 1
fi

if [[ ! -f "${PROJECT_DIR}/server/server.js" ]]; then
    echo "Electronic Scrabble server.js was not found in ${PROJECT_DIR}." >&2
    exit 1
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v qrencode >/dev/null 2>&1; then
    apt-get update
    apt-get install -y curl qrencode
fi

if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1; then
    apt-get update
    if ! apt-get install -y chromium; then
        apt-get install -y chromium-browser
    fi
fi

if [[ -n "${NPM_PATH}" && -f "${PROJECT_DIR}/server/package-lock.json" ]]; then
    sudo -u "${SERVICE_USER}" "${NPM_PATH}" --prefix "${PROJECT_DIR}/server" ci --omit=dev
elif [[ -n "${NPM_PATH}" && -f "${PROJECT_DIR}/server/package.json" ]]; then
    sudo -u "${SERVICE_USER}" "${NPM_PATH}" --prefix "${PROJECT_DIR}/server" install --omit=dev
else
    echo "Warning: server/package.json or npm was not found; existing Node.js dependencies are left unchanged." >&2
fi

install -d -m 0755 /etc/electronic-scrabble
install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0700 "${DATA_DIR}"
touch /etc/electronic-scrabble/environment

set_environment_value() {
    local key="$1"
    local value="$2"
    local environment_file=/etc/electronic-scrabble/environment

    if grep -q "^${key}=" "${environment_file}"; then
        sed -i "s|^${key}=.*$|${key}=${value}|" "${environment_file}"
    else
        printf '%s=%s\n' "${key}" "${value}" >> "${environment_file}"
    fi
}

set_environment_value ELECTRONIC_SCRABBLE_DATA_DIR "${DATA_DIR}"
set_environment_value ELECTRONIC_SCRABBLE_CONSOLE_CONTROL 1
set_environment_value ELECTRONIC_SCRABBLE_HTTP_HOST 0.0.0.0
set_environment_value ELECTRONIC_SCRABBLE_HTTP_PORT 8000
set_environment_value ELECTRONIC_SCRABBLE_SYSTEMCTL_PATH "${SYSTEMCTL_PATH}"
set_environment_value ELECTRONIC_SCRABBLE_SUDO_PATH "${SUDO_PATH}"
set_environment_value ELECTRONIC_SCRABBLE_QRENCODE_PATH "$(command -v qrencode)"

chmod 0640 /etc/electronic-scrabble/environment
chown root:"${SERVICE_GROUP}" /etc/electronic-scrabble/environment

render_service() {
    local source_file="$1"
    local target_file="$2"

    sed \
        -e "s|__SERVICE_USER__|${SERVICE_USER}|g" \
        -e "s|__SERVICE_GROUP__|${SERVICE_GROUP}|g" \
        -e "s|__PROJECT_DIR__|${PROJECT_DIR}|g" \
        -e "s|__NODE_PATH__|${NODE_PATH}|g" \
        -e "s|__DATA_DIR__|${DATA_DIR}|g" \
        "${source_file}" > "${target_file}"
}

render_service \
    "${SCRIPT_DIR}/electronic-scrabble-server.service.in" \
    /etc/systemd/system/electronic-scrabble-server.service
render_service \
    "${SCRIPT_DIR}/electronic-scrabble-web.service.in" \
    /etc/systemd/system/electronic-scrabble-web.service

install -m 0755 \
    "${SCRIPT_DIR}/electronic-scrabble-kiosk" \
    /usr/local/bin/electronic-scrabble-kiosk
install -m 0755 \
    "${SCRIPT_DIR}/configure-access-point.sh" \
    /usr/local/sbin/electronic-scrabble-configure-access-point

cat > /etc/sudoers.d/electronic-scrabble <<SUDOEOF
${SERVICE_USER} ALL=(root) NOPASSWD: ${SYSTEMCTL_PATH} reboot, ${SYSTEMCTL_PATH} poweroff
SUDOEOF
chmod 0440 /etc/sudoers.d/electronic-scrabble
visudo -cf /etc/sudoers.d/electronic-scrabble >/dev/null

LABWC_DIRECTORY="${SERVICE_HOME}/.config/labwc"
LABWC_AUTOSTART="${LABWC_DIRECTORY}/autostart"
install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0755 "${LABWC_DIRECTORY}"
touch "${LABWC_AUTOSTART}"
chown "${SERVICE_USER}:${SERVICE_GROUP}" "${LABWC_AUTOSTART}"

if ! grep -q '^# BEGIN Electronic Scrabble kiosk$' "${LABWC_AUTOSTART}"; then
    cat >> "${LABWC_AUTOSTART}" <<'AUTOSTARTEOF'

# BEGIN Electronic Scrabble kiosk
/usr/local/bin/electronic-scrabble-kiosk &
# END Electronic Scrabble kiosk
AUTOSTARTEOF
fi

if [[ "${CONFIGURE_AUTOLOGIN}" == "1" ]] && command -v raspi-config >/dev/null 2>&1; then
    raspi-config nonint do_boot_behaviour B4
fi

if [[ "${CONFIGURE_ACCESS_POINT}" == "1" ]]; then
    "${SCRIPT_DIR}/configure-access-point.sh"
fi

systemctl daemon-reload
systemctl enable --now electronic-scrabble-server.service
systemctl enable --now electronic-scrabble-web.service

cat <<SUMMARY

Electronic Scrabble Raspberry Pi console installed.

Project:        ${PROJECT_DIR}
Service user:   ${SERVICE_USER}
Game data:      ${DATA_DIR}
Shared screen:  http://127.0.0.1:8000/screen/?console=1
Administration: http://<raspberry-pi-ip>:8000/admin/
Players:        http://<raspberry-pi-ip>:8000/player/

Autonomous Wi-Fi can be configured separately with:

    sudo /usr/local/sbin/electronic-scrabble-configure-access-point

or during installation with ELECTRONIC_SCRABBLE_CONFIGURE_ACCESS_POINT=1.

The Chromium kiosk starts when the Raspberry Pi desktop session starts.
Reboot once to validate the complete boot-to-kiosk sequence:

    sudo reboot

Service diagnostics:

    systemctl status electronic-scrabble-server.service
    systemctl status electronic-scrabble-web.service
    journalctl -u electronic-scrabble-server.service -f

SUMMARY
