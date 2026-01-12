#!/bin/bash

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
