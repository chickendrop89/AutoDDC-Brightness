/*
 * Sync external monitor brightness with daylight cycles via DDC/CI.
 * Copyright (C) 2026 chickendrop89
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
*/

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class AutoDDCPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        
        const pageGeneral = new Adw.PreferencesPage({ 
            title: _('General'), 
            icon_name: 'preferences-system-symbolic',
        });
        const masterGroup = new Adw.PreferencesGroup({ 
            title: _('Master Control'),
        });
        const masterToggle = new Adw.SwitchRow({
            title: _('Enable AutoDDC Brightness'),
        });
        const monitorGroup = new Adw.PreferencesGroup({ 
            title: _('Monitors'), 
            description: _('Scanning for DDC/CI displays...'),
        });

        settings.bind(
            'extension-enabled', masterToggle, 'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        masterGroup.add(masterToggle);
        pageGeneral.add(masterGroup);
        pageGeneral.add(monitorGroup);

        const scanMonitors = async () => {
            const ddcutilPath = GLib.find_program_in_path('ddcutil');
            if (!ddcutilPath) {
                monitorGroup.set_description(_('Error: "ddcutil" executable not found in PATH. Please install it.'));
                return;
            }

            try {
                const proc = new Gio.Subprocess({
                    argv: [ddcutilPath, 'detect', '--brief'],
                    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
                });
                proc.init(null);

                const [stdout, _stderr] = await new Promise((resolve, reject) => {
                    proc.communicate_utf8_async(null, null, (p, res) => {
                        try {
                            const [_ok, out, err] = p.communicate_utf8_finish(res);
                            resolve([out, err]);
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                const outputString = String(stdout || '');
                const disabledList = settings.get_strv('disabled-monitors');
                const regex = /Display\s+(\d+)[\s\S]*?Monitor:\s*([^\r\n]+)/g;
                let found = false;
                let match;

                while ((match = regex.exec(outputString)) !== null) {
                    const id = match[1];
                    const model = match[2].trim().replace(/^Measure:\s*/i, '').replace(/:$/, '');

                    if (model.toLowerCase().includes('invalid'))
                        continue;

                    found = true;
                    const row = new Adw.SwitchRow({
                        title: model || `Display ${id}`, subtitle: `ID: ${id}`,
                    });
                    
                    row.active = !disabledList.includes(id);

                    row.connect('notify::active', () => {
                        let currentDisabled = settings.get_strv('disabled-monitors');

                        if (!row.active) {
                            if (!currentDisabled.includes(id)) currentDisabled.push(id);
                        } else {
                            currentDisabled = currentDisabled.filter(x => x !== id);
                        }
                        settings.set_strv('disabled-monitors', currentDisabled);
                    });

                    monitorGroup.add(row);
                }
                monitorGroup.set_description(found ? _('Managed Monitors') : _('No DDC/CI monitors found.'));
            } catch (e) {
                monitorGroup.set_description(_(`Scan error: ${e.message}`));
            }
        };
        scanMonitors();

        const locationGroup = new Adw.PreferencesGroup({
            title: _('Schedule'),
        });
        const autoToggle = new Adw.SwitchRow({
            title: _('Use Automatic Location'),
        });
        const statusLabel = new Gtk.Label({
            label: '...', xalign: 0,
        });
        const statusRow = new Adw.ActionRow({
            title: _('Solar Times'),
        });
        const configGroup = new Adw.PreferencesGroup({
            title: _('Configuration'),
        });
        const rowSpeed = new Adw.SpinRow({
            title: _('Step Delay (Seconds)'),
            adjustment: new Gtk.Adjustment({ 
                lower: 1, 
                upper: 600, 
                step_increment: 1,
            }),
        });
        const resetToggle = new Adw.SwitchRow({
            title: _('Reset Brightness on exit/disable'),
        });

        settings.bind(
            'use-automatic-location', autoToggle, 'active',
            Gio.SettingsBindFlags.DEFAULT,
        );

        settings.bind(
            'dim-step-delay', rowSpeed, 'value',
            Gio.SettingsBindFlags.DEFAULT,
        );

        settings.bind(
            'reset-on-exit', resetToggle, 'active',
            Gio.SettingsBindFlags.DEFAULT,
        );

        locationGroup.add(autoToggle);
        statusRow.add_suffix(statusLabel);
        locationGroup.add(statusRow);
        pageGeneral.add(locationGroup);
        configGroup.add(rowSpeed);
        configGroup.add(resetToggle);
        pageGeneral.add(configGroup);

        const createSolarPage = (isSunrise) => {
            const page = new Adw.PreferencesPage({ 
                title: isSunrise ? _('Sunrise') : _('Sunset'),
                icon_name: isSunrise ? 'weather-clear-symbolic' : 'weather-clear-night-symbolic',
            });
            const group = new Adw.PreferencesGroup({
                title: isSunrise ? _('Morning') : _('Evening'),
            });
            const toggle = new Adw.SwitchRow({
                title: _('Enable'),
            });
            const bri = new Adw.SpinRow({
                title: _('Target brightness %'),
                adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 5 }),
            });
            const hour = new Adw.SpinRow({
                title: _('Target hour'), 
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 23,
                    step_increment: 1,
                }),
            });
            const min = new Adw.SpinRow({
                title: _('Target minute'),
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 59,
                    step_increment: 1,
                }),
            });
            const catchUp = new Adw.SwitchRow({ 
                title: _('Catch Up'),
                subtitle: _('Start transition immediately if currently past target time'),
            });

            settings.bind(
                isSunrise ? 'auto-brighten-sunrise' : 'auto-dim-sunset',
                toggle, 'active', Gio.SettingsBindFlags.DEFAULT,
            );
            settings.bind(
                isSunrise ? 'max-brightness' : 'min-brightness', 
                bri, 'value', Gio.SettingsBindFlags.DEFAULT,
            );
            settings.bind(
                isSunrise ? 'sunrise-hour' : 'sunset-hour',
                hour, 'value', Gio.SettingsBindFlags.DEFAULT,
            );
            settings.bind(
                isSunrise ? 'sunrise-minute' : 'sunset-minute',
                min, 'value', Gio.SettingsBindFlags.DEFAULT,
            );
            settings.bind(
                isSunrise ? 'catch-up-sunrise' : 'catch-up-sunset',
                catchUp, 'active', Gio.SettingsBindFlags.DEFAULT,
            );

            group.add(toggle);
            group.add(bri);

            const updateSens = () => {
                const auto = settings.get_boolean('use-automatic-location');
                hour.set_sensitive(!auto); 
                min.set_sensitive(!auto);
            };
            settings.connect('changed::use-automatic-location', updateSens);
            updateSens();

            group.add(hour);
            group.add(min);
            group.add(catchUp); 

            page.add(group);
            return page;
        };

        const updateLabel = () => {
            statusLabel.set_text(`Rise: ${settings.get_string('cached-sunrise-time') || '--'} | Set: ${settings.get_string('cached-sunset-time') || '--'}`);
        };
        settings.connect('changed::cached-sunrise-time', updateLabel);
        updateLabel();

        window.add(pageGeneral);
        window.add(createSolarPage(true));
        window.add(createSolarPage(false));
    }
}
