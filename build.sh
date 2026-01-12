#!/bin/bash

#  Sync external monitor brightness with daylight cycles via DDC/CI.
#  Copyright (C) 2026 chickendrop89

#  This program is free software: you can redistribute it and/or modify
#  it under the terms of the GNU General Public License as published by
#  the Free Software Foundation, either version 3 of the License, or
#  (at your option) any later version.
#
#  This program is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU General Public License for more details.

echo "Building ..."
echo "Make sure you have dbus daemon, and mutter-devkit installed" 
echo 

if [ -f "schemas/gschemas.compiled" ]; 
    then 
        echo "Found old compiled schema, removing ..."
        rm schemas/gschemas.compiled
fi

if [ -d "schemas" ]; 
    then
        echo "Compiling new schema ..." 
        glib-compile-schemas schemas/
    else
        echo "No \"schemas\" directory found, did you clone correctly?"
        exit 1
fi

echo "Creating ZIP package ..."
zip -r /tmp/test.zip . -x "*.zip" "node_modules/" 1>/dev/null

echo "Installing extension ..."
gnome-extensions install /tmp/test.zip --force

echo "Running new wayland shell instance for testing ..."
sleep 3
dbus-run-session gnome-shell --devkit --wayland

exit 0
