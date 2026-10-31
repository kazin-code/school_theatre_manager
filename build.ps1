# Builds the program and the installer on Windows.
# Needs: Go 1.24+ (https://go.dev/dl/), NSIS 3 (https://nsis.sourceforge.io/), and rsrc:
#   go install github.com/akavel/rsrc@v0.10.2
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$version = (Select-String -Path main.go -Pattern 'appVersion = "([^"]+)"').Matches[0].Groups[1].Value
$makensis = if ($env:MAKENSIS) { $env:MAKENSIS } else { "${env:ProgramFiles(x86)}\NSIS\makensis.exe" }
New-Item -ItemType Directory -Force dist | Out-Null
& rsrc -ico app.ico -manifest installer\app.manifest -arch amd64 -o rsrc_windows_amd64.syso
$env:GOOS = "windows"; $env:GOARCH = "amd64"; $env:CGO_ENABLED = "0"
go build -trimpath -ldflags "-H windowsgui -s -w" -o dist\TheatreInventory.exe .
Remove-Item rsrc_windows_amd64.syso
& $makensis -V2 "-DVERSION=$version" installer\ahs-theatre.nsi
Get-ChildItem dist
