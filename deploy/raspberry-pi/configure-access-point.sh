#!/usr/bin/env bash
#
# Electronic Scrabble autonomous Wi-Fi access-point configurator.
#
# Creates or updates a NetworkManager access-point profile with a fixed
# private address, DHCP/NAT through IPv4 shared mode, and boot autoconnect.
# The profile is not activated unless --activate is requested so a remote SSH
# installation is not disconnected unexpectedly.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this configurator with sudo." >&2
    exit 1
fi

ENVIRONMENT_FILE="/etc/electronic-scrabble/environment"
CONNECTION_NAME="${ELECTRONIC_SCRABBLE_WIFI_CONNECTION:-electronic-scrabble-ap}"
INTERFACE="${ELECTRONIC_SCRABBLE_WIFI_INTERFACE:-wlan0}"
ADDRESS_CIDR="${ELECTRONIC_SCRABBLE_WIFI_ADDRESS:-10.42.0.1/24}"
HTTP_PORT="${ELECTRONIC_SCRABBLE_HTTP_PORT:-8000}"
AUTOCONNECT_PRIORITY="${ELECTRONIC_SCRABBLE_WIFI_AUTOCONNECT_PRIORITY:-100}"
SSID_ARGUMENT=""
PASSWORD_ARGUMENT=""
COUNTRY_ARGUMENT=""
PASSWORD_ARGUMENT_SET=0
ACTIVATE=0

read_environment_value() {
    local key="$1"

    if [[ ! -f "${ENVIRONMENT_FILE}" ]]; then
        return 0
    fi

    grep -m1 "^${key}=" "${ENVIRONMENT_FILE}" | cut -d= -f2- || true
}

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

print_usage() {
    cat <<'USAGE'
Usage: configure-access-point.sh [options]

Options:
  --ssid NAME         Access-point SSID.
  --password VALUE    WPA-PSK password (8-63 characters).
  --country CODE      Two-letter regulatory country code.
  --activate          Activate the profile immediately after saving.
  --help              Show this help.

When --password is omitted, the current configured password is preserved. If
no previous password exists, a random password is generated for manual setup.
USAGE
}

while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --ssid)
            [[ "$#" -ge 2 ]] || { echo "Missing value for --ssid." >&2; exit 1; }
            SSID_ARGUMENT="$2"
            shift 2
            ;;
        --password)
            [[ "$#" -ge 2 ]] || { echo "Missing value for --password." >&2; exit 1; }
            PASSWORD_ARGUMENT="$2"
            PASSWORD_ARGUMENT_SET=1
            shift 2
            ;;
        --country)
            [[ "$#" -ge 2 ]] || { echo "Missing value for --country." >&2; exit 1; }
            COUNTRY_ARGUMENT="${2^^}"
            shift 2
            ;;
        --activate)
            ACTIVATE=1
            shift
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            print_usage >&2
            exit 1
            ;;
    esac
done

if ! command -v nmcli >/dev/null 2>&1; then
    echo "NetworkManager/nmcli is required for autonomous Wi-Fi mode." >&2
    exit 1
fi

if ! nmcli -t -f DEVICE,TYPE device status | grep -q "^${INTERFACE}:wifi$"; then
    echo "Wi-Fi interface ${INTERFACE} was not found." >&2
    exit 1
fi

CURRENT_CONNECTION_NAME="$(read_environment_value ELECTRONIC_SCRABBLE_WIFI_CONNECTION)"
CURRENT_INTERFACE="$(read_environment_value ELECTRONIC_SCRABBLE_WIFI_INTERFACE)"
CURRENT_ADDRESS_CIDR="$(read_environment_value ELECTRONIC_SCRABBLE_WIFI_ADDRESS)"
CURRENT_HTTP_PORT="$(read_environment_value ELECTRONIC_SCRABBLE_HTTP_PORT)"
CURRENT_SSID="$(read_environment_value ELECTRONIC_SCRABBLE_WIFI_SSID)"
CURRENT_PASSWORD="$(read_environment_value ELECTRONIC_SCRABBLE_WIFI_PASSWORD)"
CURRENT_COUNTRY="$(read_environment_value ELECTRONIC_SCRABBLE_WIFI_COUNTRY)"

CONNECTION_NAME="${ELECTRONIC_SCRABBLE_WIFI_CONNECTION:-${CURRENT_CONNECTION_NAME:-${CONNECTION_NAME}}}"
INTERFACE="${ELECTRONIC_SCRABBLE_WIFI_INTERFACE:-${CURRENT_INTERFACE:-${INTERFACE}}}"
ADDRESS_CIDR="${ELECTRONIC_SCRABBLE_WIFI_ADDRESS:-${CURRENT_ADDRESS_CIDR:-${ADDRESS_CIDR}}}"
HTTP_PORT="${ELECTRONIC_SCRABBLE_HTTP_PORT:-${CURRENT_HTTP_PORT:-${HTTP_PORT}}}"

SSID="${SSID_ARGUMENT:-${ELECTRONIC_SCRABBLE_WIFI_SSID:-${CURRENT_SSID:-ElectronicScrabble}}}"

if [[ "${PASSWORD_ARGUMENT_SET}" == "1" ]]; then
    PASSWORD="${PASSWORD_ARGUMENT}"
else
    PASSWORD="${ELECTRONIC_SCRABBLE_WIFI_PASSWORD:-${CURRENT_PASSWORD:-}}"
fi

WIFI_COUNTRY="${COUNTRY_ARGUMENT:-${ELECTRONIC_SCRABBLE_WIFI_COUNTRY:-${CURRENT_COUNTRY:-}}}"

if [[ -z "${PASSWORD}" ]]; then
    PASSWORD="$(od -An -N7 -tx1 /dev/urandom | tr -d ' \n')"
fi

if [[ -z "${SSID}" ]] || (( $(printf '%s' "${SSID}" | wc -c) > 32 )); then
    echo "The Wi-Fi SSID must contain between 1 and 32 bytes." >&2
    exit 1
fi

if (( ${#PASSWORD} < 8 || ${#PASSWORD} > 63 )); then
    echo "The Wi-Fi password must contain between 8 and 63 characters." >&2
    exit 1
fi

if [[ "${SSID}" == *$'\n'* || "${SSID}" == *$'\r'* || "${PASSWORD}" == *$'\n'* || "${PASSWORD}" == *$'\r'* ]]; then
    echo "SSID and password must not contain line breaks." >&2
    exit 1
fi

if [[ "${PASSWORD}" =~ [[:space:]#=] ]]; then
    echo "For safe unattended configuration, use a Wi-Fi password without spaces, #, or =." >&2
    exit 1
fi

if [[ -n "${WIFI_COUNTRY}" && ! "${WIFI_COUNTRY}" =~ ^[A-Z]{2}$ ]]; then
    echo "The Wi-Fi country must be a two-letter regulatory code." >&2
    exit 1
fi

ADDRESS="${ADDRESS_CIDR%%/*}"
PUBLIC_BASE_URL="http://${ADDRESS}:${HTTP_PORT}"

install -d -m 0755 /etc/electronic-scrabble
touch "${ENVIRONMENT_FILE}"

if [[ -n "${WIFI_COUNTRY}" ]] && command -v raspi-config >/dev/null 2>&1; then
    raspi-config nonint do_wifi_country "${WIFI_COUNTRY}"
fi

if nmcli -t -f NAME connection show | grep -Fxq "${CONNECTION_NAME}"; then
    nmcli connection modify "${CONNECTION_NAME}" \
        connection.interface-name "${INTERFACE}" \
        connection.autoconnect yes \
        connection.autoconnect-priority "${AUTOCONNECT_PRIORITY}" \
        802-11-wireless.ssid "${SSID}" \
        802-11-wireless.mode ap \
        802-11-wireless.band bg \
        wifi-sec.key-mgmt wpa-psk \
        wifi-sec.psk "${PASSWORD}" \
        ipv4.method shared \
        ipv4.addresses "${ADDRESS_CIDR}" \
        ipv6.method disabled
else
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
fi

set_environment_value ELECTRONIC_SCRABBLE_WIFI_ACCESS_POINT 1
set_environment_value ELECTRONIC_SCRABBLE_WIFI_CONNECTION "${CONNECTION_NAME}"
set_environment_value ELECTRONIC_SCRABBLE_WIFI_INTERFACE "${INTERFACE}"
set_environment_value ELECTRONIC_SCRABBLE_WIFI_SSID "${SSID}"
set_environment_value ELECTRONIC_SCRABBLE_WIFI_PASSWORD "${PASSWORD}"
set_environment_value ELECTRONIC_SCRABBLE_WIFI_ADDRESS "${ADDRESS_CIDR}"
set_environment_value ELECTRONIC_SCRABBLE_PUBLIC_BASE_URL "${PUBLIC_BASE_URL}"

if [[ -n "${WIFI_COUNTRY}" ]]; then
    set_environment_value ELECTRONIC_SCRABBLE_WIFI_COUNTRY "${WIFI_COUNTRY}"
fi

chmod 0640 "${ENVIRONMENT_FILE}"

if [[ "${ACTIVATE}" == "1" ]]; then
    if systemctl is-active --quiet electronic-scrabble-web.service 2>/dev/null; then
        systemctl restart electronic-scrabble-web.service
    fi

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
To apply changed settings immediately, run with --activate.

SUMMARY
