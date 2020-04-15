#!/bin/bash

# goto rosi-client folder
cd ../

if [ -f ~/Projects/sign_webextension.sh ]; then

	echo "Building libs ..."
	cd scripts/
	bash _build_browser_libs.sh

	echo "Updating minor version ..."
	node _update_version.js
	cd ../
	
	# From here the scripts only works if the workstation is set up like the project creators ;)
	# .../Projects/rosi is the main project folder
	# .../Projects/audiostream is the demo page folder
	# .../Projects/sign_webextension.sh is a script where web-ext sign with valid user tokens is called.
	
	echo "Building and signing WebExtension ..."
	cd plugin/
	bash ~/Projects/sign_webextension.sh
	cd ../
	
	echo "Linking new audiostream plugin download files ..."
	mkdir -p ../rosi-audiostream/plugin/
	cp -u -l -f builds/* ../rosi-audiostream/plugin/
else
   echo "This script needs a valid sign command with mozilla API keys in ~/Projects/sign_webextension.sh!"
fi

# return to home
cd scripts/	

