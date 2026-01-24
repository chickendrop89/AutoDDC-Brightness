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

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';
import Geoclue from 'gi://Geoclue';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class AutoDDCExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._httpSession = new Soup.Session();
        this._timerId = null;
        this._transitionLoopId = null;
        this._hotplugId = null;
        this._initialCheckTimeId = null;
        this._isTransitioning = false;
        this._ddcBusy = false;
        this._monitorStates = {};
        this._signals = [];
        this._geoclueClient = null;
        this._geoclueLocationSignalId = null;
        this._updateSunsetTimeId = null;
        
        this._ddcutilPath = GLib.find_program_in_path('ddcutil');
        if (!this._ddcutilPath)
            console.error("[AutoDDC-Brightness] 'ddcutil' not found in PATH.");

        this._signals.push(this._settings.connect('changed', (_settings, key) => {
            const internalKeys = [
                'cached-sunrise-time',
                'cached-sunset-time',
                'last-error',
            ];

            if (internalKeys.includes(key)) 
                return;

            this._reload();
        }));

        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            if (this._settings?.get_boolean('extension-enabled')) {
                this._checkTime();

                const now = GLib.DateTime.new_now_local();
                if (now.get_hour() === 3 && now.get_minute() === 0)
                    this._updateSunsetTime();
            }
            return GLib.SOURCE_CONTINUE;
        });

        this._setupMonitorListener();

        if (this._settings.get_boolean('extension-enabled') && this._ddcutilPath) {
            this._setupGeoclue(); 
            this._updateSunsetTime();
            this._initialCheckTimeId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, 2, () => this._checkTime(),
            );
        }
    }

    disable() {
        if (!this._isReloading && this._settings?.get_boolean('reset-on-exit') && this._ddcutilPath) {
            for (const id in this._monitorStates)
                this._setBrightness(id, 100).catch(() => {});
        }

        if (this._timerId) 
            GLib.source_remove(this._timerId);
        if (this._transitionLoopId) 
            GLib.source_remove(this._transitionLoopId);
        if (this._hotplugId) 
            GLib.source_remove(this._hotplugId);
        if (this._initialCheckTimeId)
            GLib.source_remove(this._initialCheckTimeId);
        if (this._updateSunsetTimeId)
            GLib.source_remove(this._updateSunsetTimeId);
        
        if (this._monitorsChangedId && global.backend.get_monitor_manager()) {
            global.backend.get_monitor_manager().disconnect(this._monitorsChangedId);
        }

        if (this._geoclueClient && this._geoclueLocationSignalId) {
            this._geoclueClient.disconnect(this._geoclueLocationSignalId);
            this._geoclueLocationSignalId = null;
        }

        this._signals.forEach(id => this._settings.disconnect(id));
        this._signals = [];
        
        this._geoclueClient = null;
        this._httpSession = null;
    }

    _reload() {
        this._isReloading = true;
        this.disable();
        this._isReloading = false;
        this.enable();
    }

    _setupMonitorListener() {
        const monitorManager = global.backend.get_monitor_manager();

        if (monitorManager) {
            this._monitorsChangedId = monitorManager.connect('monitors-changed', () => {
                if (this._hotplugId) 
                    GLib.source_remove(this._hotplugId);

                this._hotplugId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
                    this._checkTime(); 
                    this._hotplugId = null;
                    return GLib.SOURCE_REMOVE;
                });
            });
        }
    }

    async _setupGeoclue() {
        if (!this._settings.get_boolean('use-automatic-location')) 
            return;

        try {
            this._geoclueClient = await new Promise((resolve, reject) => {
                Geoclue.Simple.new('org.gnome.Shell', Geoclue.AccuracyLevel.CITY, null, (_obj, res) => {
                    try { 
                        resolve(Geoclue.Simple.new_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            this._geoclueLocationSignalId = this._geoclueClient.connect(
                'notify::location', () => this._updateSunsetTime(),
            );
            
            if (this._geoclueClient.location) this._updateSunsetTime();
        } catch (e) {
            console.error(`[AutoDDC-Brightness] Geoclue Error: ${e.message}`);
        }
    }

    _checkTime() {
        if (!this._settings || !this._settings.get_boolean('extension-enabled') || this._isTransitioning)
            return;

        if (!this._ddcutilPath) 
            return;

        const now = GLib.DateTime.new_now_local();
        const nowMins = now.get_hour() * 60 + now.get_minute();
        const nowSecs = now.get_second();

        const getMins = (prefix) => {
            if (this._settings.get_boolean('use-automatic-location')) {
                const cached = this._settings.get_string(`cached-${prefix}-time`);

                if (!cached)
                    return null;

                const parts = cached.split(':');
                const hour = parseInt(parts[0]);
                const minute = parseInt(parts[1]);
                
                if (isNaN(hour) || isNaN(minute))
                    return null;
                
                return hour * 60 + minute;
            }
            return this._settings.get_int(`${prefix}-hour`) * 60 + this._settings.get_int(`${prefix}-minute`);
        };

        const sunriseMins = getMins('sunrise');
        const sunsetMins = getMins('sunset');

        if (sunriseMins === null || sunsetMins === null || isNaN(sunriseMins) || isNaN(sunsetMins))
            return;

        const isDaytime = (nowMins >= sunriseMins && nowMins < sunsetMins);
        const catchUpSunrise = this._settings.get_boolean('catch-up-sunrise');
        const catchUpSunset = this._settings.get_boolean('catch-up-sunset');

        const isNearMinute = (targetMins) => {
            return nowMins === targetMins || (nowMins === targetMins + 1 && nowSecs >= 30);
        };

        if (this._settings.get_boolean('auto-brighten-sunrise') && isNearMinute(sunriseMins)) {
            this._startTransition(true);
        } else if (this._settings.get_boolean('auto-dim-sunset') && isNearMinute(sunsetMins)) {
            this._startTransition(false);
        } else if (isDaytime && catchUpSunrise && this._settings.get_boolean('auto-brighten-sunrise')) {
            this._startTransition(true);
        } else if (!isDaytime && catchUpSunset && this._settings.get_boolean('auto-dim-sunset')) {
            this._startTransition(false);
        }
    }

    async _startTransition(isBrightening) {
        if (this._transitionLoopId)
            GLib.source_remove(this._transitionLoopId);

        if (!this._ddcutilPath) 
            return;

        this._isTransitioning = true;
        this._currentDirectionIsBrightening = isBrightening;

        const monitors = await this._scanAndFilterMonitors();
        const monitorSet = new Set(monitors);

        for (const id in this._monitorStates) {
            if (!monitorSet.has(id))
                delete this._monitorStates[id];
        }
        for (const id of monitors) {
            if (this._monitorStates[id] === undefined)
                this._monitorStates[id] = await this._getBrightness(id);
        }

        const stepDelay = Math.max(1, this._settings.get_int('dim-step-delay'));

        this._transitionLoopId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, stepDelay, () => {
            if (!this._isTransitioning)
                return GLib.SOURCE_REMOVE;
            
            this._stepAll(this._currentDirectionIsBrightening).then(workDone => {
                if (!workDone) {
                    this._isTransitioning = false;
                    this._transitionLoopId = null;
                }
            }).catch(() => {
                this._isTransitioning = false;
            });
            
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _scanAndFilterMonitors() {
        if (!this._ddcutilPath)
            return [];

        const disabled = this._settings.get_strv('disabled-monitors');
        const output = await this._runDdcUtilWithDefaults(['detect', '--brief']);

        if (!output)
            return [];

        const regex = /Display\s+(\d+)/g;
        const validIds = [];
        let match;

        while ((match = regex.exec(output)) !== null) {
            const id = match[1];

            if (!disabled.includes(id))
                validIds.push(id);
        }
        return validIds;
    }

    async _stepAll(isBrightening) {
        if (this._ddcBusy || !this._ddcutilPath)
            return false;
        
        const knownMonitors = Object.keys(this._monitorStates);
        const target = isBrightening ? this._settings.get_int('max-brightness') : this._settings.get_int('min-brightness');
        let anyWorkDone = false;

        for (const id of knownMonitors) {
            const current = await this._getBrightness(id);

            if (current === null) 
                continue;
            if (this._monitorStates[id] !== undefined && Math.abs(current - this._monitorStates[id]) > 10)
                continue;

            if (isBrightening ? current < target : current > target) {
                const next = isBrightening ? Math.min(target, current + 5) : Math.max(target, current - 5);
                await this._setBrightness(id, next);

                this._monitorStates[id] = next;
                anyWorkDone = true;
            }
        }
        return anyWorkDone;
    }

    _runDdcUtilWithDefaults(args, displayId = null) {
        const enhancedArgs = [...args, '--maxtries', '15,15,15'];
        
        if (displayId !== null)
            enhancedArgs.push('--display', displayId);
        
        return this._runDdcUtil(enhancedArgs);
    }

    async _runDdcUtil(args) {
        if (this._ddcBusy || !this._ddcutilPath)
            return null;

        this._ddcBusy = true;

        try {
            const proc = new Gio.Subprocess({ 
                argv: [this._ddcutilPath, ...args], 
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

            this._ddcBusy = false;
            return (proc.get_successful() && stdout) ? stdout.trim() : null;
        } catch {
            this._ddcBusy = false; 
            return null; 
        }
    }

    async _getBrightness(displayId) {
        const output = await this._runDdcUtilWithDefaults(['getvcp', '10', '--brief'], displayId);

        if (!output) 
            return null;

        const parts = output.split(/\s+/);
        const idx = parts.indexOf('10');

        return (idx !== -1 && parts[idx+1] === 'C') ? parseInt(parts[idx+2]) : null;
    }

    async _setBrightness(displayId, val) { 
        await this._runDdcUtilWithDefaults(['setvcp', '10', val.toString()], displayId); 
    }

    _updateSunsetTime() {
        if (!this._settings.get_boolean('use-automatic-location') || !this._geoclueClient?.location)
            return;
        
        if (this._updateSunsetTimeId)
            GLib.source_remove(this._updateSunsetTimeId);
        
        this._updateSunsetTimeId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._updateSunsetTimeId = null;
            this._doUpdateSunsetTime();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _doUpdateSunsetTime() {
        if (!this._settings?.get_boolean('use-automatic-location') || !this._geoclueClient?.location)
            return;
        
        const lat = this._geoclueClient.location.latitude;
        const lng = this._geoclueClient.location.longitude;

        try {
            const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0`;
            const message = Soup.Message.new('GET', url);
            const bytes = await this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
            
            if (!bytes || bytes.get_size() === 0)
                return;
            
            const decodedStr = new TextDecoder().decode(bytes.toArray());
            if (!decodedStr || decodedStr.trim().length === 0)
                return;
            
            const response = JSON.parse(decodedStr);
            
            if (response.status === 'OK') {
                const format = (iso) => {
                    const dt = GLib.DateTime.new_from_iso8601(iso, null).to_local();
                    return `${dt.get_hour().toString().padStart(2, '0')}:${dt.get_minute().toString().padStart(2, '0')}`;
                };
                this._settings.set_string(
                    'cached-sunset-time',
                    format(response.results.sunset),
                );
                this._settings.set_string(
                    'cached-sunrise-time',
                    format(response.results.sunrise),
                );
            }
        } catch (e) {
            console.error(`[AutoDDC-Brightness] API Error: ${e.message}`);
        }
    }
}
