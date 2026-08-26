# Raspberry Pi Console Mode

Electronic Scrabble can run as a dedicated Raspberry Pi console connected to a television or monitor over HDMI.

The console deployment has four parts:

1. the WebSocket game server, managed by `systemd`;
2. the restricted static web server, managed by `systemd`;
3. Chromium in kiosk mode on the Raspberry Pi desktop;
4. administrator-only reboot and power-off controls.

## Recommended Platform

Use Raspberry Pi OS (64-bit) with Desktop on a Raspberry Pi 3 or newer.

The current Raspberry Pi kiosk documentation uses the Labwc desktop autostart file at:

```text
~/.config/labwc/autostart
```

Electronic Scrabble follows that mechanism for Chromium because the browser must start inside the graphical desktop session. The game and static web servers themselves are system services and start independently at boot.

## Install

From the project repository:

```bash
sudo bash deploy/raspberry-pi/install.sh
```

The installer:

- detects the non-root desktop user;
- installs missing `curl` and Chromium packages when required;
- installs Node dependencies when `server/package.json` is available;
- creates `/var/lib/electronic-scrabble/games` with private permissions;
- writes `/etc/electronic-scrabble/environment`;
- installs and enables two `systemd` services;
- installs the Chromium kiosk launcher;
- adds the kiosk launcher to Labwc autostart;
- configures Raspberry Pi OS desktop autologin with `raspi-config B4`;
- creates a narrowly scoped sudoers rule for reboot and power-off.

Then reboot:

```bash
sudo reboot
```

## Services

### Game server

```bash
systemctl status electronic-scrabble-server.service
```

The WebSocket server listens on port `8080`.

### Static web server

```bash
systemctl status electronic-scrabble-web.service
```

The static web server listens on port `8000` and serves only:

```text
/admin/
/player/
/screen/
/shared/
```

It intentionally refuses access to server source, dictionaries, tests, deployment files, and persistent game data.

## Dedicated HDMI Screen

The kiosk opens:

```text
http://127.0.0.1:8000/screen/?console=1
```

Console mode does not require a game code in the URL.

When the screen connects:

- if an active game exists, the most recently updated active game is selected;
- otherwise the screen waits for a game;
- creating a new game automatically switches the dedicated console screen to that game;
- after a Raspberry Pi reboot, the screen reconnects automatically to the persisted game.

A normal game-specific shared screen still works:

```text
http://raspberry-pi:8000/screen/?game=ABCD
```

## Chromium Kiosk

The launcher is installed as:

```text
/usr/local/bin/electronic-scrabble-kiosk
```

It waits until the local web server responds, then launches Chromium with kiosk flags.

The Labwc autostart block is:

```text
# BEGIN Electronic Scrabble kiosk
/usr/local/bin/electronic-scrabble-kiosk &
# END Electronic Scrabble kiosk
```

## Desktop Autologin

The installer runs the Raspberry Pi OS non-interactive configuration equivalent of:

```bash
sudo raspi-config nonint do_boot_behaviour B4
```

`B4` means boot to the desktop and log in automatically.

To leave autologin unchanged during installation:

```bash
sudo ELECTRONIC_SCRABBLE_CONFIGURE_AUTOLOGIN=0 \
    bash deploy/raspberry-pi/install.sh
```

## Administrator Power Controls

When console control is enabled, the administration interface displays:

```text
Restart console
Power off console
```

Only a client authenticated with the private administrator token can request these actions.

The server accepts only two fixed commands:

```text
systemctl reboot
systemctl poweroff
```

No arbitrary shell command can be supplied by the browser.

The installer creates a sudoers rule limited to those two commands for the Electronic Scrabble service account.

Before either command is requested, all in-memory games are persisted.

## Configuration

The deployment environment file is:

```text
/etc/electronic-scrabble/environment
```

Default values:

```text
ELECTRONIC_SCRABBLE_DATA_DIR=/var/lib/electronic-scrabble/games
ELECTRONIC_SCRABBLE_CONSOLE_CONTROL=1
ELECTRONIC_SCRABBLE_HTTP_HOST=0.0.0.0
ELECTRONIC_SCRABBLE_HTTP_PORT=8000
```

After editing it, restart the services:

```bash
sudo systemctl restart electronic-scrabble-server.service
sudo systemctl restart electronic-scrabble-web.service
```

## Logs

Game server:

```bash
journalctl -u electronic-scrabble-server.service -f
```

Static web server:

```bash
journalctl -u electronic-scrabble-web.service -f
```

Recent boot logs:

```bash
journalctl -b \
    -u electronic-scrabble-server.service \
    -u electronic-scrabble-web.service
```

## Safe Upgrade Workflow

Before upgrading:

```bash
git switch main
git pull --ff-only origin main
```

Install Node dependencies if they changed:

```bash
cd server
npm install
npm test
cd ..
```

Then restart both backend services:

```bash
sudo systemctl restart electronic-scrabble-server.service
sudo systemctl restart electronic-scrabble-web.service
```

The HDMI browser normally does not need to be restarted because the application resources use versioned URLs and the static web server uses `Cache-Control: no-cache`.

To restart Chromium, reboot the console or terminate Chromium and let the desktop autostart launch it on the next login.

## Uninstall Console Integration

```bash
sudo bash deploy/raspberry-pi/uninstall.sh
```

The uninstaller deliberately preserves persistent game data.

Remove it manually only when you are certain it is no longer required:

```bash
sudo rm -rf /var/lib/electronic-scrabble
```

## Security Notes

- Never expose port `8000` or `8080` directly to the public Internet without an authenticated reverse proxy and transport security.
- Persistent snapshots contain private racks and recovery tokens.
- Authorized dictionary files must remain outside the public static directories.
- The static web server deliberately exposes only browser-facing directories.
- The application server must run as a non-root user.
- Do not broaden the generated sudoers rule to arbitrary `systemctl` or shell commands.
