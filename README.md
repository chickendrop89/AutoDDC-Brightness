# AutoDDC-Brightness
A simple gnome extension to automatically adjust external monitor brightness via `DDC/CI` based on local sunrise and sunset times

# Features
- Multiple monitor support (not tested though!)
- Automatic location, and sunset/sunrise detection using `geoclue` with [sunrise-sunset.org](https://sunrise-sunset.org).
- Sunset/Sunrise toggles, and many configuration options

# Requirements
- Gnome 49+ (earlier versions were not tested)
- `ddcutil` installed, [and configured!](https://lexruee.ch/setting-i2c-permissions-for-non-root-users.html)

# Building
I have included the `build.sh` script for easier testing

However, this script counts that you are using `Wayland`, and `mutter-devkit` is installed
