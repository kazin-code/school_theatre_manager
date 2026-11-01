; School Theatre Manager Server: Windows installer (NSIS 3), for a school's IT team.
; Installs the server API alone (no screens): Node.js, the server, its setup tool and the database
; migrations. It asks for the school's PostgreSQL database, tests the connection, saves the settings
; in a folder only administrators can open, creates the first director account, and runs the server
; at start-up as a background task (SYSTEM) with firewall rules for the school network only.
;
; Silent install (all optional except the database ones on a first install):
;   School-Theatre-Manager-Server-Setup.exe /S /DBHOST=db.school.local /DBPORT=5432 /DBNAME=theatre
;     /DBUSER=theatre /DBPASS=secret [/DBSSL=1] [/PORT=8417] [/FILES=D:\TheatreFiles]
;     [/ADMINUSER=rivera /ADMINNAME="Ms. Rivera" /ADMINPASS=...] [/NOFIREWALL]

Unicode true
SetCompressor /SOLID lzma
ManifestDPIAware true

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

!ifndef VERSION
  !define VERSION "3.0.0"
!endif
!define APPNAME   "School Theatre Manager Server"
!define PUBLISHER "School Theatre Manager"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SchoolTheatreManagerServer"
!define TASKPS    '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\app\tools\server-task.ps1"'

Name "${APPNAME}"
OutFile "..\dist\School-Theatre-Manager-Server-Setup.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
InstallDirRegKey HKLM "${UNINSTKEY}" "InstallLocation"
RequestExecutionLevel admin
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "${PUBLISHER}"

!define MUI_ICON   "app.ico"
!define MUI_UNICON "app.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP   "welcome.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_ABORTWARNING

Var DataDir
Var IsUpgrade
Var Dlg
Var DbHost
Var DbPort
Var DbName
Var DbUser
Var DbPass
Var DbSsl
Var AppPort
Var FilesDir
Var Firewall
Var AdminName
Var AdminUser
Var AdminPass
Var KitReady
Var hHost
Var hPort
Var hName
Var hUser
Var hPass
Var hSsl
Var hAppPort
Var hFiles
Var hFirewall
Var hAName
Var hAUser
Var hAPass
Var hAPass2
Var Computer

; ---------- pages ----------
!define MUI_WELCOMEPAGE_TITLE "Set up the School Theatre Manager Server"
!define MUI_WELCOMEPAGE_TEXT "This installs the server that lets several computers share one set of School Theatre Manager records over the school network. It has no screens of its own: people use the School Theatre Manager app on their computers, which connects to this server.$\r$\n$\r$\nYou need a PostgreSQL database for it (version 14 or newer), with an account that owns the database. See School Network Setup (for IT) in the Start menu after installing, or ask for it before you start.$\r$\n$\r$\nNothing here uses the internet.$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom DatabasePage DatabaseLeave
Page custom OptionsPage OptionsLeave
Page custom AccountPage AccountLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "The server is running"
!define MUI_FINISHPAGE_TEXT "It starts by itself whenever Windows starts.$\r$\n$\r$\nOn each computer with the School Theatre Manager app, open Settings > School network and click Search the school network, or connect to:$\r$\n$\r$\n      http://$Computer:$AppPort$\r$\n$\r$\nClassroom computers can also be connected while installing the app: School-Theatre-Manager-Setup.exe /SERVER=http://$Computer:$AppPort"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---------- init ----------
; a command-line option such as /DBHOST=… into a variable
!macro Opt name var
  ClearErrors
  ${GetOptions} $R0 "/${name}=" $0
  ${IfNot} ${Errors}
    StrCpy ${var} $0
  ${EndIf}
!macroend

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "The School Theatre Manager Server needs 64-bit Windows (Windows Server 2016 or newer, or Windows 10/11)."
    Abort
  ${EndIf}
  SetRegView 64
  SetShellVarContext all
  StrCpy $DataDir "$APPDATA\${APPNAME}"   ; C:\ProgramData\School Theatre Manager Server
  StrCpy $IsUpgrade "0"
  ${If} ${FileExists} "$DataDir\server.json"
    StrCpy $IsUpgrade "1"   ; keep the database settings already saved
  ${EndIf}
  ReadEnvStr $Computer COMPUTERNAME
  StrCpy $DbPort "5432"
  StrCpy $AppPort "8417"
  StrCpy $DbName "theatre"
  StrCpy $DbUser "theatre"
  StrCpy $DbSsl "0"
  StrCpy $Firewall "1"
  StrCpy $KitReady "0"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/DBHOST=" $0
  ${IfNot} ${Errors}
    StrCpy $DbHost $0
  ${EndIf}
  !insertmacro Opt "DBPORT" $DbPort
  !insertmacro Opt "DBNAME" $DbName
  !insertmacro Opt "DBUSER" $DbUser
  !insertmacro Opt "DBPASS" $DbPass
  !insertmacro Opt "DBSSL" $DbSsl
  !insertmacro Opt "PORT" $AppPort
  !insertmacro Opt "FILES" $FilesDir
  !insertmacro Opt "ADMINUSER" $AdminUser
  !insertmacro Opt "ADMINNAME" $AdminName
  !insertmacro Opt "ADMINPASS" $AdminPass
  ClearErrors
  ${GetOptions} $R0 "/NOFIREWALL" $0
  ${IfNot} ${Errors}
    StrCpy $Firewall "0"
  ${EndIf}
  ${If} ${Silent}
  ${AndIf} $IsUpgrade == "0"
  ${AndIf} $DbHost == ""
    MessageBox MB_ICONSTOP "A silent install needs the database settings: /DBHOST= /DBNAME= /DBUSER= /DBPASS=" /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
FunctionEnd

Function un.onInit
  SetRegView 64
  SetShellVarContext all
  StrCpy $DataDir "$APPDATA\${APPNAME}"
FunctionEnd

; The tool is unpacked to a temporary folder so the database settings can be tested before installing.
Function UnpackKit
  ${If} $KitReady == "1"
    Return
  ${EndIf}
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\kit\node"
  File "..\dist\node\node.exe"
  SetOutPath "$PLUGINSDIR\kit\app"
  File /r "..\dist\server-app\*.*"
  SetOutPath "$PLUGINSDIR"
  StrCpy $KitReady "1"
FunctionEnd

!macro DbEnv
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_DB_HOST", t "$DbHost")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_DB_PORT", t "$DbPort")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_DB_NAME", t "$DbName")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_DB_USER", t "$DbUser")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_DB_PASSWORD", t "$DbPass")i'
  ${If} $DbSsl == "1"
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_DB_SSL", t "require")i'
  ${Else}
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_DB_SSL", t "")i'
  ${EndIf}
!macroend
!macro ClearEnv
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_DB_PASSWORD", p 0)i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_ADMIN_PASS", p 0)i'
!macroend

; ---------- the database ----------
Function DatabasePage
  ${If} $IsUpgrade == "1"
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "The school's PostgreSQL database" "The records are kept in a PostgreSQL database on a database server."
  nsDialogs::Create 1018
  Pop $Dlg
  ${If} $Dlg == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 20u "Ask your database administrator for these. The account must own the database: the server creates and updates its own tables."
  Pop $0
  ${NSD_CreateLabel} 0 26u 32% 12u "Database server"
  Pop $0
  ${NSD_CreateText} 34% 24u 46% 13u "$DbHost"
  Pop $hHost
  ${NSD_CreateLabel} 82% 26u 7% 12u "Port"
  Pop $0
  ${NSD_CreateNumber} 89% 24u 11% 13u "$DbPort"
  Pop $hPort
  ${NSD_CreateLabel} 0 44u 32% 12u "Database name"
  Pop $0
  ${NSD_CreateText} 34% 42u 66% 13u "$DbName"
  Pop $hName
  ${NSD_CreateLabel} 0 62u 32% 12u "Username"
  Pop $0
  ${NSD_CreateText} 34% 60u 66% 13u "$DbUser"
  Pop $hUser
  ${NSD_CreateLabel} 0 80u 32% 12u "Password"
  Pop $0
  ${NSD_CreatePassword} 34% 78u 66% 13u "$DbPass"
  Pop $hPass
  ${NSD_CreateCheckbox} 34% 96u 66% 12u "Require an encrypted connection (TLS)"
  Pop $hSsl
  ${If} $DbSsl == "1"
    ${NSD_Check} $hSsl
  ${EndIf}
  ${NSD_CreateLabel} 0 116u 100% 24u "Example: server db01.school.local, database theatre, username theatre. When you click Next, Setup checks that it can connect."
  Pop $0
  ${NSD_SetFocus} $hHost
  nsDialogs::Show
FunctionEnd

Function DatabaseLeave
  ${NSD_GetText} $hHost $DbHost
  ${NSD_GetText} $hPort $DbPort
  ${NSD_GetText} $hName $DbName
  ${NSD_GetText} $hUser $DbUser
  ${NSD_GetText} $hPass $DbPass
  ${NSD_GetState} $hSsl $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DbSsl "1"
  ${Else}
    StrCpy $DbSsl "0"
  ${EndIf}
  ${If} $DbHost == ""
  ${OrIf} $DbName == ""
  ${OrIf} $DbUser == ""
    MessageBox MB_ICONEXCLAMATION "Fill in the database server, database name and username."
    Abort
  ${EndIf}
  Call CheckDatabase
  ${If} $0 != "0"
    Abort
  ${EndIf}
FunctionEnd

; $0 = 0 when the settings work; otherwise shows why
Function CheckDatabase
  ${IfNot} ${Silent}
    Banner::show /NOUNLOAD "Checking the database connection…"
  ${EndIf}
  Call UnpackKit
  !insertmacro DbEnv
  nsExec::ExecToStack '"$PLUGINSDIR\kit\node\node.exe" "$PLUGINSDIR\kit\app\tools\stm-tool.cjs" check-db'
  Pop $0
  Pop $1
  ${IfNot} ${Silent}
    Banner::destroy
  ${EndIf}
  ${If} $0 != "0"
    MessageBox MB_ICONEXCLAMATION "Setup couldn't use that database:$\r$\n$\r$\n$1" /SD IDOK
  ${EndIf}
FunctionEnd

; ---------- port, files, firewall ----------
Function OptionsPage
  ${If} $IsUpgrade == "1"
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Network and files" "Where computers reach the server, and where photos and show files are kept."
  nsDialogs::Create 1018
  Pop $Dlg
  ${If} $Dlg == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 2u 32% 12u "Port for the app"
  Pop $0
  ${NSD_CreateNumber} 34% 0 20% 13u "$AppPort"
  Pop $hAppPort
  ${NSD_CreateLabel} 0 22u 100% 12u "Photos, show files and backups folder (leave empty to keep them in $DataDir):"
  Pop $0
  ${NSD_CreateText} 0 36u 100% 13u "$FilesDir"
  Pop $hFiles
  ${NSD_CreateLabel} 0 52u 100% 20u "A local folder, or a network share (\\server\share\theatre) that this server's computer account can write to. Back it up with the school's usual backups."
  Pop $0
  ${NSD_CreateCheckbox} 0 80u 100% 12u "Allow the app through Windows Firewall on the school network (TCP $AppPort and UDP 8418, domain and private networks only)"
  Pop $hFirewall
  ${If} $Firewall == "1"
    ${NSD_Check} $hFirewall
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function OptionsLeave
  ${NSD_GetText} $hAppPort $AppPort
  ${NSD_GetText} $hFiles $FilesDir
  ${NSD_GetState} $hFirewall $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $Firewall "1"
  ${Else}
    StrCpy $Firewall "0"
  ${EndIf}
  ${If} $AppPort < 1
  ${OrIf} $AppPort > 65535
    MessageBox MB_ICONEXCLAMATION "The port must be a number between 1 and 65535 (8417 unless something else uses it)."
    Abort
  ${EndIf}
FunctionEnd

; ---------- the first director ----------
Function AccountPage
  ${If} $IsUpgrade == "1"
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "The theatre director's account" "The first account on the server. The director adds everyone else from the app."
  nsDialogs::Create 1018
  Pop $Dlg
  ${If} $Dlg == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 20u "Leave these empty if the database already has School Theatre Manager accounts, or if the director will copy the records from their computer (they then sign in with their own accounts)."
  Pop $0
  ${NSD_CreateLabel} 0 28u 32% 12u "Director's name"
  Pop $0
  ${NSD_CreateText} 34% 26u 66% 13u "$AdminName"
  Pop $hAName
  ${NSD_CreateLabel} 0 46u 32% 12u "Username"
  Pop $0
  ${NSD_CreateText} 34% 44u 66% 13u "$AdminUser"
  Pop $hAUser
  ${NSD_CreateLabel} 0 64u 32% 12u "Password"
  Pop $0
  ${NSD_CreatePassword} 34% 62u 66% 13u ""
  Pop $hAPass
  ${NSD_CreateLabel} 0 82u 32% 12u "Confirm password"
  Pop $0
  ${NSD_CreatePassword} 34% 80u 66% 13u ""
  Pop $hAPass2
  ${NSD_CreateLabel} 0 102u 100% 30u "Password: at least 8 characters, including a capital letter and a special character such as ! @ # $$ % &. The director is asked to choose their own password the first time they sign in."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function AccountLeave
  ${NSD_GetText} $hAName $AdminName
  ${NSD_GetText} $hAUser $AdminUser
  ${NSD_GetText} $hAPass $AdminPass
  ${NSD_GetText} $hAPass2 $1
  ${If} $AdminUser == ""
    StrCpy $AdminPass ""
    Return
  ${EndIf}
  ${If} $AdminPass != $1
    MessageBox MB_ICONEXCLAMATION "The two passwords don't match. Type them again."
    ${NSD_SetText} $hAPass ""
    ${NSD_SetText} $hAPass2 ""
    Abort
  ${EndIf}
  StrLen $0 $AdminPass
  ${If} $0 < 8
    MessageBox MB_ICONEXCLAMATION "The password needs at least 8 characters, a capital letter and a special character."
    Abort
  ${EndIf}
FunctionEnd

; ---------- install ----------
Section "-Server" SecMain
  SetOutPath "$INSTDIR"
  ; a running server is stopped before its files are replaced
  ${If} ${FileExists} "$INSTDIR\app\tools\server-task.ps1"
    nsExec::ExecToLog '${TASKPS} stop -InstallDir "$INSTDIR" -DataDir "$DataDir"'
    Pop $0
  ${EndIf}
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  File "app.ico"
  File /oname=README.txt "..\dist\INTRANET-SETUP.txt"
  File /oname=School-Network-Setup.txt "..\dist\INTRANET-SETUP.txt"
  SetOutPath "$INSTDIR\node"
  File /r "..\dist\node\*.*"
  SetOutPath "$INSTDIR\app"
  File /r "..\dist\server-app\*.*"
  SetOutPath "$INSTDIR"

  ${If} $IsUpgrade == "0"
    ; configure checks the database again (and is the only check in a silent install)
    !insertmacro DbEnv
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_PORT", t "$AppPort")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_FILES_DIR", t "$FilesDir")i'
    ${If} $AdminUser != ""
      System::Call 'Kernel32::SetEnvironmentVariable(t "STM_ADMIN_USER", t "$AdminUser")i'
      System::Call 'Kernel32::SetEnvironmentVariable(t "STM_ADMIN_NAME", t "$AdminName")i'
      System::Call 'Kernel32::SetEnvironmentVariable(t "STM_ADMIN_PASS", t "$AdminPass")i'
    ${EndIf}
    CreateDirectory "$DataDir"
    nsExec::ExecToLog '"$INSTDIR\node\node.exe" "$INSTDIR\app\tools\stm-tool.cjs" configure --data "$DataDir"'
    Pop $0
    !insertmacro ClearEnv
    StrCpy $AdminPass ""
    StrCpy $DbPass ""
    ${If} $0 == "3"
      MessageBox MB_ICONEXCLAMATION "The server is set up, but the director account couldn't be created (the username or password isn't allowed). The first person to connect from the app will be asked to create it." /SD IDOK
    ${ElseIf} $0 != "0"
      MessageBox MB_ICONSTOP "Setup couldn't prepare the database (error $0). See the details above, fix the settings and run Setup again." /SD IDOK
      SetErrorLevel 4
      Abort
    ${EndIf}
  ${Else}
    ; keep the saved settings; just read the port for the task and the finish page
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "(Get-Content -Raw '$DataDir\server.json' | ConvertFrom-Json).port"`
    Pop $0
    Pop $1
    ${If} $0 == "0"
    ${AndIf} $1 != ""
      StrCpy $AppPort $1 5
      IntOp $AppPort $AppPort + 0
    ${EndIf}
  ${EndIf}

  ; the background task, firewall rules, and a data folder only administrators can open
  ${If} $Firewall == "1"
    nsExec::ExecToLog '${TASKPS} install -InstallDir "$INSTDIR" -DataDir "$DataDir" -Port $AppPort'
  ${Else}
    nsExec::ExecToLog '${TASKPS} install -InstallDir "$INSTDIR" -DataDir "$DataDir" -Port $AppPort -NoFirewall'
  ${EndIf}
  Pop $0
  ${If} $0 != "0"
    MessageBox MB_ICONEXCLAMATION "The server is installed but didn't start. Its log is in $DataDir\logs\server.log." /SD IDOK
    SetErrorLevel 5
  ${EndIf}

  ; Start menu: for the people who look after the server
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  WriteINIStr "$SMPROGRAMS\${APPNAME}\Server status.url" "InternetShortcut" "URL" "http://localhost:$AppPort/api/v1/server-info"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\School Network Setup (for IT).lnk" "$INSTDIR\School-Network-Setup.txt"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Restart the server.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\app\tools\server-task.ps1" restart -DataDir "$DataDir" -Port $AppPort' "$INSTDIR\app.ico" 0
  Push "$SMPROGRAMS\${APPNAME}\Restart the server.lnk"
  Call RunAsAdmin
  SetOutPath "$INSTDIR\app"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Reset Director Password.lnk" "$INSTDIR\node\node.exe" '"$INSTDIR\app\tools\stm-tool.cjs" reset-password --data "$DataDir"' "$INSTDIR\app.ico" 0
  SetOutPath "$INSTDIR"
  Push "$SMPROGRAMS\${APPNAME}\Reset Director Password.lnk"
  Call RunAsAdmin
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Server log.lnk" "$WINDIR\notepad.exe" '"$DataDir\logs\server.log"'
  Push "$SMPROGRAMS\${APPNAME}\Server log.lnk"
  Call RunAsAdmin
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${UNINSTKEY}" "EstimatedSize" "$0"
SectionEnd

; mark a shortcut "Run as administrator" (SLDF_RUNAS_USER); the shortcut path is on the stack
Function RunAsAdmin
  Exch $9
  FileOpen $1 "$9" a
  ${IfNot} ${Errors}
    FileSeek $1 0x15 SET
    FileReadByte $1 $2
    IntOp $2 $2 | 0x20
    FileSeek $1 0x15 SET
    FileWriteByte $1 $2
    FileClose $1
  ${EndIf}
  Pop $9
FunctionEnd

; ---------- uninstall ----------
Section "Uninstall"
  nsExec::ExecToLog '${TASKPS} uninstall -InstallDir "$INSTDIR" -DataDir "$DataDir"'
  Pop $0
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  Delete "$INSTDIR\app.ico"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\School-Network-Setup.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "${UNINSTKEY}"
  ; the records are in the school's database; the settings, photos, files and backups stay unless asked
  MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION "Also delete the server's settings, photos, show files and backups in $DataDir?$\r$\n$\r$\nThe records in the PostgreSQL database are not touched either way." /SD IDNO IDNO keep
    RMDir /r "$DataDir"
  keep:
SectionEnd
