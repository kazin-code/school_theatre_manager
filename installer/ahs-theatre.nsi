; AHS Theatre Inventory — Windows installer (NSIS 3)
; Installs the program, creates the database and data folders, the director account,
; shortcuts, an optional firewall rule, and an uninstaller.

Unicode true
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define APPNAME   "AHS Theatre Inventory"
!define EXE       "TheatreInventory.exe"
!define PUBLISHER "Alton High School Theatre"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\AHSTheatreInventory"
!define DATANAME  "AHS Theatre Inventory"

Name "${APPNAME}"
OutFile "..\dist\AHS-Theatre-Inventory-Setup-${VERSION}.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
InstallDirRegKey HKLM "${UNINSTKEY}" "InstallLocation"
RequestExecutionLevel admin
BrandingText "${PUBLISHER}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "${PUBLISHER}"

!define MUI_ICON   "..\app.ico"
!define MUI_UNICON "..\app.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP   "welcome.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_ABORTWARNING

Var DataDir
Var IsUpgrade
Var Dlg
Var hName
Var hUser
Var hPass
Var hPass2
Var AdminName
Var AdminUser
Var AdminPass

; ---------- pages ----------
!define MUI_WELCOMEPAGE_TITLE "Set up the AHS Theatre Inventory"
!define MUI_WELCOMEPAGE_TEXT "This installs the inventory program for Alton High School Theatre: costumes, props, furniture and set pieces, show checkouts and rentals.$\r$\n$\r$\nEverything is stored on this computer, in a database Setup creates for you. No internet connection is needed.$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
Page custom AccountPage AccountLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "The inventory is ready"
!define MUI_FINISHPAGE_TEXT "Open it any time from the AHS Theatre Inventory shortcut. It runs in your web browser, but only on this computer.$\r$\n$\r$\nTip: in Settings, turn on Cloud backup to keep a copy in your school OneDrive or Google Drive."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open AHS Theatre Inventory now"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---------- init ----------
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "AHS Theatre Inventory needs 64-bit Windows 10 or 11."
    Abort
  ${EndIf}
  SetRegView 64
  SetShellVarContext all
  StrCpy $DataDir "$APPDATA\${DATANAME}"   ; C:\ProgramData\AHS Theatre Inventory
  StrCpy $IsUpgrade "0"
  ${If} ${FileExists} "$DataDir\inventory.db"
    StrCpy $IsUpgrade "1"
  ${EndIf}
FunctionEnd

Function un.onInit
  SetRegView 64
  SetShellVarContext all
FunctionEnd

; ---------- director account page ----------
Function AccountPage
  ${If} $IsUpgrade == "1"
    Abort ; existing database: keep its accounts
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Director account" "This sign-in protects the inventory. Keep the password somewhere safe."
  nsDialogs::Create 1018
  Pop $Dlg
  ${If} $Dlg == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 20u "Create the director's account. The director can add accounts for assistants and stage managers later, from Settings."
  Pop $0
  ${NSD_CreateLabel} 0 28u 32% 12u "Your name"
  Pop $0
  ${NSD_CreateText} 34% 26u 66% 13u "$AdminName"
  Pop $hName
  ${NSD_CreateLabel} 0 46u 32% 12u "Username"
  Pop $0
  ${NSD_CreateText} 34% 44u 66% 13u "$AdminUser"
  Pop $hUser
  ${NSD_CreateLabel} 0 64u 32% 12u "Password"
  Pop $0
  ${NSD_CreatePassword} 34% 62u 66% 13u ""
  Pop $hPass
  ${NSD_CreateLabel} 0 82u 32% 12u "Confirm password"
  Pop $0
  ${NSD_CreatePassword} 34% 80u 66% 13u ""
  Pop $hPass2
  ${NSD_CreateLabel} 0 102u 100% 30u "Username: 3 or more letters, numbers, dots, dashes or underscores.$\r$\nPassword: at least 8 characters."
  Pop $0
  ${NSD_SetFocus} $hName
  nsDialogs::Show
FunctionEnd

Function AccountLeave
  ${NSD_GetText} $hName $AdminName
  ${NSD_GetText} $hUser $AdminUser
  ${NSD_GetText} $hPass $AdminPass
  ${NSD_GetText} $hPass2 $1
  StrLen $0 $AdminUser
  ${If} $0 < 3
    MessageBox MB_ICONEXCLAMATION "Choose a username with at least 3 characters."
    Abort
  ${EndIf}
  StrLen $0 $AdminPass
  ${If} $0 < 8
    MessageBox MB_ICONEXCLAMATION "The password needs at least 8 characters."
    Abort
  ${EndIf}
  ${If} $AdminPass != $1
    MessageBox MB_ICONEXCLAMATION "The two passwords don't match. Type them again."
    ${NSD_SetText} $hPass ""
    ${NSD_SetText} $hPass2 ""
    Abort
  ${EndIf}
FunctionEnd

; ---------- sections ----------
Section "-Program" SecMain
  SetOutPath "$INSTDIR"
  ; stop a running copy so its files can be replaced
  nsExec::Exec 'taskkill /IM ${EXE} /F'
  Pop $0
  Sleep 600

  File "..\dist\${EXE}"
  File "..\app.ico"
  File "README.txt"

  ; data folder: created here so every Windows user on this computer can use the inventory
  CreateDirectory "$DataDir"
  nsExec::ExecToLog 'icacls "$DataDir" /grant *S-1-5-32-545:(OI)(CI)M /C /Q'
  Pop $0

  DetailPrint "Creating the inventory database…"
  ${If} $AdminUser != ""
    ; passed through the environment so the password never appears on a command line
    System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_USER", t "$AdminUser")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_NAME", t "$AdminName")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_PASS", t "$AdminPass")i'
  ${EndIf}
  nsExec::ExecToLog '"$INSTDIR\${EXE}" --init-db --data "$DataDir"'
  Pop $0
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_USER", p 0)i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_NAME", p 0)i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_PASS", p 0)i'
  StrCpy $AdminPass ""
  ${If} $0 == "3"
    MessageBox MB_ICONEXCLAMATION "The database was created, but the director account couldn't be (the username may contain characters that aren't allowed).$\r$\n$\r$\nYou'll be asked to create the director account the first time you open the inventory."
  ${ElseIf} $0 != "0"
    MessageBox MB_ICONSTOP "Setup couldn't create the inventory database (error $0).$\r$\nCheck that $DataDir can be written to, then run Setup again."
  ${Else}
    DetailPrint "Database ready: $DataDir\inventory.db"
  ${EndIf}
  ; make sure files the database step just created can be written by everyone who uses the app
  nsExec::ExecToLog 'icacls "$DataDir" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
  Pop $0

  ; Start menu
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\app.ico" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Reset Director Password.lnk" "$INSTDIR\${EXE}" "--reset-password" "$INSTDIR\app.ico" 0
  ; mark the reset shortcut "Run as administrator" (SLDF_RUNAS_USER)
  FileOpen $1 "$SMPROGRAMS\${APPNAME}\Reset Director Password.lnk" a
  ${IfNot} ${Errors}
    FileSeek $1 0x15 SET
    FileReadByte $1 $2
    IntOp $2 $2 | 0x20
    FileSeek $1 0x15 SET
    FileWriteByte $1 $2
    FileClose $1
  ${EndIf}
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Inventory data folder.lnk" "$DataDir"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"

  ; uninstaller and Apps & Features entry
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

Section "Desktop shortcut" SecDesktop
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\app.ico" 0
SectionEnd

Section /o "Start with Windows" SecStartup
  CreateShortcut "$SMSTARTUP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "--no-browser" "$INSTDIR\app.ico" 0
SectionEnd

Section /o "Share on the school network" SecNetwork
  nsExec::ExecToLog '"$INSTDIR\${EXE}" --init-db --network on --data "$DataDir"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${APPNAME}"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${APPNAME}" dir=in action=allow program="$INSTDIR\${EXE}" enable=yes profile=domain,private'
  Pop $0
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Put an AHS Theatre Inventory shortcut on the desktop."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStartup} "Start the inventory in the background when anyone signs in to this computer, so it's always ready."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecNetwork} "Let other computers on the school network (for example a laptop in the costume room) open the inventory from this computer. Everyone still signs in. Leave this off unless you need it."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Function LaunchApp
  ; start without administrator rights, as the signed-in user
  Exec '"$WINDIR\explorer.exe" "$INSTDIR\${EXE}"'
FunctionEnd

; ---------- uninstaller ----------
Section "Uninstall"
  nsExec::Exec 'taskkill /IM ${EXE} /F'
  Pop $0
  Sleep 600
  Delete "$INSTDIR\${EXE}"
  Delete "$INSTDIR\app.ico"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMSTARTUP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${APPNAME}"'
  Pop $0
  DeleteRegKey HKLM "${UNINSTKEY}"

  IfSilent keepdata
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete the inventory database, photos and backups?$\r$\n$\r$\nChoose No to keep them (recommended). Reinstalling will pick up right where you left off." IDNO keepdata
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "This permanently erases every item, show, rental and photo stored on this computer. Cloud backup copies are not touched.$\r$\n$\r$\nDelete the inventory data?" IDNO keepdata
  RMDir /r "$APPDATA\${DATANAME}"
  keepdata:
SectionEnd
