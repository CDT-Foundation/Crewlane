# Crewlane device discovery agent (Windows).
#   $env:CREWLANE_URL = "https://acme.crewlane.app"; $env:CREWLANE_TOKEN = "cla_xxx"; .\crewlane-agent.ps1
# Schedule daily with Task Scheduler (run as SYSTEM).
$ErrorActionPreference = "Stop"
if (-not $env:CREWLANE_URL -or -not $env:CREWLANE_TOKEN) { throw "Set CREWLANE_URL and CREWLANE_TOKEN" }

$bios = Get-CimInstance Win32_BIOS
$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$enclosure = (Get-CimInstance Win32_SystemEnclosure).ChassisTypes
$laptop = @(8, 9, 10, 14, 31, 32) | Where-Object { $enclosure -contains $_ }
$health = try { (Get-PhysicalDisk | Select-Object -First 1).HealthStatus } catch { "unknown" }

$keys = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
$software = Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object DisplayName | Select-Object -ExpandProperty DisplayName -Unique | Select-Object -First 2000

$body = @{
  hostname     = $env:COMPUTERNAME
  serial       = $bios.SerialNumber.Trim()
  manufacturer = $cs.Manufacturer
  model        = $cs.Model
  chassis      = $(if ($laptop) { "laptop" } else { "desktop" })
  os           = "$($os.Caption) $($os.Version)"
  cpu          = $cpu
  ramGb        = [int]($cs.TotalPhysicalMemory / 1GB)
  diskGb       = [int]($disk.Size / 1GB)
  diskHealth   = "$health"
  loggedInUser = $cs.UserName
  software     = @($software)
} | ConvertTo-Json -Depth 3

Invoke-RestMethod -Method Post -Uri "$($env:CREWLANE_URL.TrimEnd('/'))/api/agent/report" `
  -Headers @{ Authorization = "Bearer $($env:CREWLANE_TOKEN)" } -ContentType "application/json" -Body $body
