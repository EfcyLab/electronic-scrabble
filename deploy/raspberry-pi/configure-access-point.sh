#!/usr/bin/env bash
#
# Electronic Scrabble autonomous Wi-Fi access-point configurator.
#
# Creates a NetworkManager access-point profile with a fixed private address,
# DHCP/NAT through IPv4 shared mode, and autoconnect on boot. The profile is
# created without activation by default so an SSH installation over wlan0 is
# not interrupted unexpectedly.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this configurator with sudo." >&2
    exit 1
fi

CONNECTION_NAME="${ELECTRONIC_SCRABBLE_WIFI_CONNECTION:-electronic-scrabble-ap}"
INTERFACE="${ELECTRONIC_SCRABBLE_WIFI_INTERFACE:-wlan0}"
SSID="${ELECTRONIC_SCRABBLE_WIFI_SSID:-ElectronicScrabble}"
PASSWORD="${ELECTRONIC_SCRABBLE_WIFI_PASSWORD:-}"
ADDRESS_CIDR="${ELECTRONIC_SCRABBLE_WIFI_ADDRESS:-10.42.0.1/24}"
HTTP_PORT="${ELECTRONIC_SCRABBLE_HTTP_PORT:-8000}"
AUTOCONNECT_PRIORITY="${ELECTRONIC_SCRABBLE_WIFI_AUTOCONNECT_PRIORITY:-100}"
WIFI_COUNTRY="${ELECTRONIC_SCRABBLE_WIFI_COUNTRY:-}"
ACTIVATE=0
ENVIRONMENT_FILE="/etc/electronic-scrabble/environment"

if [[ "${1:-}" == "--activate" ]]; then
    ACTIVATE=1
elif [[ -n "${1:-}" ]]; then
    echo "Usage: sudo bash configure-access-point.sh [--activate]" >&2
    exit 1
fi

if ! command -v nmcli >/dev/null 2>&1; then
    echo "NetworkManager/nmcli is required for autonomous Wi-Fi mode." >&2
    exit 1
fi

if ! nmcli -t -f DEVICE,TYPE device status | grep -q "^${INTERFACE}:wifi$"; then
    echo "Wi-Fi interface ${INTERFACE} was not found." >&2
    exit 1
fi

if [[ -z "${PASSWORD}" ]]; then
    PASSWORD="$(od -An -N7 -tx1 /dev/urandom | tr -d ' \n')"
fi

if (( ${#PASSWORD} < 8 || ${#PASSWORD} > 63 )); then
    echo "The Wi-Fi password must contain between 8 and 63 characters." >&2
    exit 1
fi

if [[ "${SSID}" == *$'\n'* || "${PASSWORD}" == *$'\n'* ]]; then
    echo "SSID and password must not contain newline characters." >&2
    exit 1
fi

if [[ "${PASSWORD}" =~ [[:space:]#=] ]]; then
    echo "For safe unattended configuration, use a Wi-Fi password without spaces, #, or =." >&2
    exit 1
fi

ADDRESS="${ADDRESS_CIDR%%/*}"
PUBLIC_BASE_URL="http://${ADDRESS}:${HTTP_PORT}"

install -d -m 0755 /etc/electronic-scrabble
touch "${ENVIRONMENT_FILE}"

set_environment_value() {
    local key="$1"
    local value="$2"
    local temporary_file

    temporary_file="$(mktemp)"
    grep -v "^${key}=" "${ENVIRONMENT_FILE}" > "${temporary_file}" || true
    printf '%s=%s\n' "${key}" "${value}" >> "${temporary_file}"
    cat "${temporary_file}" > "${ENVIRONMENT_FILE}"
    rm -f "${temporary_file}"
}

if [[ -n "${WIFI_COUNTRY}" ]] && command -v raspi-config >/dev/null 2>&1; then
    raspi-config nonint do_wifi_country "${WIFI_COUNTRY}"
fi

if nmcli -t -f NAME connection show | grep -Fxq "${CONNECTION_NAME}"; then
    nmcli connection delete "${CONNECTION_NAME}" >/dev/null
fi

nmcli connection add \
    type wifi \
    ifname "${INTERFACE}" \
    con-name "${CONNECTION_NAME}" \
    autoconnect yes \
    ssid "${SSID}" >/dev/null

nmcli connection modify "${CONNECTION_NAME}" \
    802-11-wireless.mode ap \
    802-11-wireless.band bg \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "${PASSWORD}" \
    ipv4.method shared \
    ipv4.addresses "${ADDRESS_CIDR}" \
    ipv6.method disabled \
    connection.autoconnect yes \
    connection.autoconnect-priority "${AUTOCONNECT_PRIORITY}"

set_environment_value ELECTRONIC_SCRABBLE_WIFI_ACCESS_POINT 1
set_environment_value ELECTRONIC_SCRABBLE_WIFI_CONNECTION "${CONNECTION_NAME}"
set_environment_value ELECTRONIC_SCRABBLE_WIFI_INTERFACE "${INTERFACE}"
set_environment_value ELECTRONIC_SCRABBLE_WIFI_SSID "${SSID}"
set_environment_value ELECTRONIC_SCRABBLE_WIFI_PASSWORD "${PASSWORD}"
set_environment_value ELECTRONIC_SCRABBLE_WIFI_ADDRESS "${ADDRESS_CIDR}"
set_environment_value ELECTRONIC_SCRABBLE_PUBLIC_BASE_URL "${PUBLIC_BASE_URL}"

chmod 0640 "${ENVIRONMENT_FILE}"

if systemctl is-active --quiet electronic-scrabble-web.service 2>/dev/null; then
    systemctl restart electronic-scrabble-web.service
fi

if [[ "${ACTIVATE}" == "1" ]]; then
    echo "Activating ${CONNECTION_NAME} on ${INTERFACE}. Existing Wi-Fi/SSH connectivity may be interrupted."
    nmcli radio wifi on
    nmcli connection up "${CONNECTION_NAME}"
fi

cat <<SUMMARY

Electronic Scrabble autonomous Wi-Fi profile configured.

Connection: ${CONNECTION_NAME}
Interface:  ${INTERFACE}
SSID:       ${SSID}
Password:   ${PASSWORD}
Address:    ${ADDRESS}
Player URL: ${PUBLIC_BASE_URL}/player/
Admin URL:  ${PUBLIC_BASE_URL}/admin/

The profile will autoconnect at the next boot.
To activate it immediately (which may disconnect an SSH Wi-Fi session):

    sudo bash deploy/raspberry-pi/configure-access-point.sh --activate

SUMMARY
