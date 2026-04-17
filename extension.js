import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const POLL_INTERVAL = 5;

export default class MullvadIndicator extends Extension {
    enable() {
        this._running = false;

        this._button = new PanelMenu.Button(0.0, 'Mullvad VPN Status', false);

        // top bar
        this._label = new St.Label({
            text: 'VPN',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 12px; padding: 0 6px;',
        });

        this._button.add_child(this._label);

        // menu items
        this._statusItem  = new PopupMenu.PopupMenuItem('', { reactive: false });
        this._countryItem = new PopupMenu.PopupMenuItem('', { reactive: false });
        this._serverItem  = new PopupMenu.PopupMenuItem('', { reactive: false });
        this._ipItem      = new PopupMenu.PopupMenuItem('', { reactive: false });

        this._button.menu.addMenuItem(this._statusItem);
        this._button.menu.addMenuItem(this._countryItem);
        this._button.menu.addMenuItem(this._serverItem);
        this._button.menu.addMenuItem(this._ipItem);
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._connectItem = new PopupMenu.PopupMenuItem('Connect');
        this._connectItem.connect('activate', () => this._toggleVPN());
        this._button.menu.addMenuItem(this._connectItem);

        Main.panel.addToStatusArea('mullvad-indicator', this._button);

        this._refresh();

        this._timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            POLL_INTERVAL,
            () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    disable() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = null;
        }

        this._button?.destroy();
        this._button = null;
        this._label = null;
    }

    _refresh() {
        if (this._running) return;
        this._running = true;

        try {
            const proc = Gio.Subprocess.new(
                ['mullvad', 'status'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            proc.communicate_utf8_async(null, null, (proc, res) => {
                this._running = false;

                try {
                    const [, stdout] = proc.communicate_utf8_finish(res);
                    this._parseAndUpdate(stdout.trim());
                } catch (e) {
                    this._setError();
                }
            });
        } catch (e) {
            this._running = false;
            this._setError();
        }
    }

    _parseAndUpdate(output) {
        if (!this._label) return;

        const lines = output.split('\n');
        const firstLine = (lines[0] || '').trim().toLowerCase();

        let server = '';
        let country = '';
        let city = '';
        let ip = '';

        // connecting
        if (firstLine.includes('connecting')) {
            this._label.set_text('VPN');
            this._statusItem.label.set_text('Status: Connecting…');
            this._countryItem.label.set_text('');
            this._serverItem.label.set_text('');
            this._ipItem.label.set_text('');
            this._connectItem.label.set_text('Disconnect');
            return;
        }

        // disconnected
        if (!firstLine.includes('connected')) {
            this._label.set_text('VPN');
            this._statusItem.label.set_text('Status: Disconnected');
            this._countryItem.label.set_text('');
            this._serverItem.label.set_text('');
            this._ipItem.label.set_text('');
            this._connectItem.label.set_text('Connect');
            return;
        }

        // parse
        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('Relay:')) {
                server = trimmed.replace('Relay:', '').trim();
            }

            if (trimmed.startsWith('Visible location:')) {
                const match = trimmed.match(
                    /Visible location:\s*(.+?),\s*(.+?)\.\s*IPv4:\s*(.+)/
                );

                if (match) {
                    country = match[1].trim();
                    city = match[2].trim();
                    ip = match[3].trim();
                }
            }
        }

        // top bar
        this._label.set_text(country || 'VPN');

        // menu
        this._statusItem.label.set_text('Status: Connected');
        this._countryItem.label.set_text(
            city && country ? `Location: ${city}, ${country}` : country ? `Country: ${country}` : ''
        );
        this._serverItem.label.set_text(server ? `Relay: ${server}` : '');
        this._ipItem.label.set_text(ip ? `IP: ${ip}` : '');

        this._connectItem.label.set_text('Disconnect');
    }

    _setError() {
        if (!this._label) return;

        this._label.set_text('VPN');
        this._statusItem.label.set_text('mullvad CLI not found');
        this._countryItem.label.set_text('');
        this._serverItem.label.set_text('');
        this._ipItem.label.set_text('');
    }

    _toggleVPN() {
        const disconnecting =
            this._connectItem.label.get_text() === 'Disconnect';

        const cmd = disconnecting
            ? ['mullvad', 'disconnect']
            : ['mullvad', 'connect'];

        try {
            Gio.Subprocess.new(cmd, Gio.SubprocessFlags.NONE);

            let attempts = 0;
            GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
                this._refresh();
                attempts++;
                return attempts < 5;
            });
        } catch (e) {}

        this._button.menu.close();
    }
}
