/**
 * Electronic Scrabble Raspberry Pi deployment contract tests.
 *
 * Verifies that deployment files configure systemd services, current Labwc
 * kiosk autostart, desktop autologin, and narrowly scoped power privileges.
 *
 * @author Electronic Scrabble Project
 * @version 1.0.0
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const deploymentDirectory = path.resolve(__dirname, '../../deploy/raspberry-pi');
const installer = fs.readFileSync(
    path.join(deploymentDirectory, 'install.sh'),
    'utf8'
);
const accessPointConfigurator = fs.readFileSync(
    path.join(deploymentDirectory, 'configure-access-point.sh'),
    'utf8'
);
const kiosk = fs.readFileSync(
    path.join(deploymentDirectory, 'electronic-scrabble-kiosk'),
    'utf8'
);
const gameService = fs.readFileSync(
    path.join(deploymentDirectory, 'electronic-scrabble-server.service.in'),
    'utf8'
);
const webService = fs.readFileSync(
    path.join(deploymentDirectory, 'electronic-scrabble-web.service.in'),
    'utf8'
);

test('installer configures Raspberry Pi desktop autologin and Labwc kiosk autostart', () => {
    assert.match(installer, /raspi-config nonint do_boot_behaviour B4/);
    assert.match(installer, /\.config\/labwc/);
    assert.match(installer, /electronic-scrabble-kiosk &/);
});

test('kiosk waits for local web service and starts Chromium in kiosk mode', () => {
    assert.match(kiosk, /screen\/\?console=1/);
    assert.match(kiosk, /curl --fail/);
    assert.match(kiosk, /--kiosk/);
    assert.match(kiosk, /--no-first-run/);
});

test('deployment installs separate systemd game and web services', () => {
    assert.match(gameService, /ExecStart=.*server\.js/);
    assert.match(gameService, /Restart=on-failure/);
    assert.match(webService, /ExecStart=.*static-web-server\.js/);
    assert.match(webService, /NoNewPrivileges=true/);
});

test('installer limits passwordless sudo to reboot and poweroff commands', () => {
    assert.match(
        installer,
        /NOPASSWD: \$\{SYSTEMCTL_PATH\} reboot, \$\{SYSTEMCTL_PATH\} poweroff/
    );
    assert.doesNotMatch(installer, /NOPASSWD:\s+ALL/);
});


test('installer provides offline QR rendering and an optional autonomous Wi-Fi setup', () => {
    assert.match(installer, /apt-get install -y curl qrencode/);
    assert.match(installer, /ELECTRONIC_SCRABBLE_CONFIGURE_ACCESS_POINT/);
    assert.match(installer, /configure-access-point\.sh/);
});

test('access-point configurator uses NetworkManager shared IPv4 mode and boot autoconnect', () => {
    assert.match(accessPointConfigurator, /nmcli connection add/);
    assert.match(accessPointConfigurator, /802-11-wireless\.mode ap/);
    assert.match(accessPointConfigurator, /ipv4\.method shared/);
    assert.match(accessPointConfigurator, /connection\.autoconnect yes/);
    assert.match(accessPointConfigurator, /10\.42\.0\.1\/24/);
    assert.match(accessPointConfigurator, /ELECTRONIC_SCRABBLE_PUBLIC_BASE_URL/);
});

test('access-point configurator does not activate Wi-Fi unless explicitly requested', () => {
    assert.match(accessPointConfigurator, /ACTIVATE=0/);
    assert.match(accessPointConfigurator, /if \[\[ "\$\{ACTIVATE\}" == "1" \]\]/);
});
