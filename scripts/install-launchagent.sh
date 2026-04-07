#!/usr/bin/env bash
# Install a macOS LaunchAgent that:
#   1. Starts the Wiki on login (next start on port 3737)
#   2. Logs to ~/Library/Logs/llm-wiki.{out,err}.log
#
# After install, you can:
#   - launchctl unload ~/Library/LaunchAgents/com.user.wiki.plist     # stop
#   - launchctl load -w ~/Library/LaunchAgents/com.user.wiki.plist   # start
#
# To open in browser at login as well, see open-wiki.sh and the AppleScript section.

set -euo pipefail

WIKI_DIR="/Users/yinyiping/Desktop/Wiki"
NODE_BIN="$(which node)"
NPM_BIN="$(which npm)"
PORT=3737

if [ ! -d "$WIKI_DIR" ]; then
  echo "❌ $WIKI_DIR not found"; exit 1
fi
if [ -z "$NODE_BIN" ]; then
  echo "❌ node not found in PATH"; exit 1
fi

PLIST="$HOME/Library/LaunchAgents/com.user.wiki.plist"
LOG_DIR="$HOME/Library/Logs"
mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.user.wiki</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$WIKI_DIR/node_modules/.bin/next</string>
    <string>start</string>
    <string>-p</string>
    <string>$PORT</string>
  </array>
  <key>WorkingDirectory</key><string>$WIKI_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/llm-wiki.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/llm-wiki.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key><string>production</string>
  </dict>
</dict>
</plist>
EOF

# Load (replace if existing)
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"

echo "✅ installed: $PLIST"
echo "   wiki will auto-start on login at http://localhost:$PORT"
echo
echo "Build production bundle first if you haven't:"
echo "    cd $WIKI_DIR && npm run build"
echo
echo "Manage:"
echo "    launchctl unload $PLIST    # stop"
echo "    launchctl load -w $PLIST   # start"
echo "    tail -f $LOG_DIR/llm-wiki.out.log"
