#!/bin/zsh
# Install Lumi on the connected iPad. Same signing path as the phone; see
# install-iphone.sh for the prerequisites (unlock, trust, Developer Mode).
exec "$(cd "$(dirname "$0")" && pwd)/install-iphone.sh" iPad
