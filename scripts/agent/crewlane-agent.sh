#!/usr/bin/env bash
# Crewlane device discovery agent (macOS and Linux).
# Reports hardware, disk health and installed software to Crewlane.
#
#   CREWLANE_URL=https://acme.crewlane.app CREWLANE_TOKEN=cla_xxx ./crewlane-agent.sh
#
# Schedule it daily with cron or launchd. Needs: bash, curl, python3.
set -euo pipefail

: "${CREWLANE_URL:?set CREWLANE_URL to your tenant address}"
: "${CREWLANE_TOKEN:?set CREWLANE_TOKEN to an agent token from Settings > Integrations}"

os="$(uname -s)"
host="$(hostname)"
user="${SUDO_USER:-${USER:-}}"

if [[ "$os" == "Darwin" ]]; then
  hw="$(system_profiler SPHardwareDataType 2>/dev/null)"
  serial="$(awk -F': ' '/Serial Number/{print $2; exit}' <<<"$hw")"
  model="$(awk -F': ' '/Model Name/{print $2; exit}' <<<"$hw")"
  manufacturer="Apple"
  cpu="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || awk -F': ' '/Chip/{print $2; exit}' <<<"$hw")"
  ram_gb="$(( $(sysctl -n hw.memsize) / 1073741824 ))"
  disk_gb="$(df -g / | awk 'NR==2{print $2}')"
  os_name="macOS $(sw_vers -productVersion)"
  chassis="desktop"; [[ "$model" == *Book* ]] && chassis="laptop"
  disk_health="$(diskutil info disk0 2>/dev/null | awk -F': *' '/SMART Status/{print $2; exit}')"
  software="$(ls /Applications 2>/dev/null | sed 's/\.app$//')"
else
  serial="$(cat /sys/class/dmi/id/product_serial 2>/dev/null || true)"
  [[ -z "$serial" ]] && serial="$(cat /etc/machine-id 2>/dev/null || hostname)"
  model="$(cat /sys/class/dmi/id/product_name 2>/dev/null || echo unknown)"
  manufacturer="$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null || echo unknown)"
  cpu="$(awk -F': ' '/model name/{print $2; exit}' /proc/cpuinfo)"
  ram_gb="$(awk '/MemTotal/{printf "%d", $2/1048576}' /proc/meminfo)"
  disk_gb="$(df -BG / | awk 'NR==2{gsub("G","",$2); print $2}')"
  os_name="$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -sr)"
  ct="$(cat /sys/class/dmi/id/chassis_type 2>/dev/null || echo 3)"
  chassis="desktop"; [[ "$ct" =~ ^(8|9|10|14|31|32)$ ]] && chassis="laptop"
  disk_health="unknown"
  if command -v dpkg-query >/dev/null; then software="$(dpkg-query -W -f='${Package}\n' 2>/dev/null)";
  elif command -v rpm >/dev/null; then software="$(rpm -qa --qf '%{NAME}\n' 2>/dev/null)";
  else software=""; fi
fi

payload="$(SERIAL="$serial" HOST="$host" MODEL="$model" MAKER="$manufacturer" CPU="$cpu" RAM="$ram_gb" DISK="$disk_gb" \
  OSN="$os_name" CHASSIS="$chassis" HEALTH="$disk_health" LUSER="$user" SOFTWARE="$software" python3 - <<'PY'
import json, os
sw = [s for s in os.environ.get("SOFTWARE", "").splitlines() if s.strip()][:2000]
print(json.dumps({
  "hostname": os.environ["HOST"], "serial": os.environ["SERIAL"].strip(), "manufacturer": os.environ["MAKER"],
  "model": os.environ["MODEL"], "chassis": os.environ["CHASSIS"], "os": os.environ["OSN"], "cpu": os.environ["CPU"],
  "ramGb": int(os.environ["RAM"] or 0), "diskGb": int(os.environ["DISK"] or 0), "diskHealth": os.environ["HEALTH"],
  "loggedInUser": os.environ.get("LUSER", ""), "software": sw,
}))
PY
)"

curl -fsS -X POST "${CREWLANE_URL%/}/api/agent/report" \
  -H "Authorization: Bearer ${CREWLANE_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$payload"
echo
