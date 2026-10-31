; School Theatre Manager — Windows installer (NSIS 3)
; Installs the program, brands it for the school (name, program name, logo), creates the
; database and data folders, the director account, shortcuts, an optional firewall rule,
; and an uninstaller.

Unicode true
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

!ifndef VERSION
  !define VERSION "2.0.0"
!endif
!define APPNAME   "School Theatre Manager"
!define EXE       "SchoolTheatre.exe"
!define PUBLISHER "School Theatre Manager"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SchoolTheatreManager"
!define DATANAME  "School Theatre Manager"
; earlier versions, built for Alton High School, used these names
!define OLDKEY1   "Software\Microsoft\Windows\CurrentVersion\Uninstall\AHSTheatreApplication"
!define OLDKEY2   "Software\Microsoft\Windows\CurrentVersion\Uninstall\AHSTheatreInventory"
!define OLDDATA1  "AHS Theatre Application"
!define OLDDATA2  "AHS Theatre Inventory"
!define OLDEXE1   "AHSTheatre.exe"
!define OLDEXE2   "TheatreInventory.exe"

Name "${APPNAME}"
OutFile "..\dist\School-Theatre-Manager-Setup-${VERSION}.exe"
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

!define MUI_ICON   "..\app.ico"
!define MUI_UNICON "..\app.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP   "welcome.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_ABORTWARNING

Var DataDir
Var BrandIni
Var IsUpgrade
Var Dlg
Var School
Var Program
Var Short
Var Tagline
Var LogoPath
Var ShortcutName
Var LinkIcon
Var hSchool
Var hProgram
Var hShort
Var hTagline
Var hLogo
Var hName
Var hUser
Var hPass
Var hPass2
Var AdminName
Var AdminUser
Var AdminPass

; ---------- pages ----------
!define MUI_WELCOMEPAGE_TITLE "Set up School Theatre Manager"
!define MUI_WELCOMEPAGE_TEXT "School Theatre Manager runs a school theatre program: plays and musicals with their cast, crew, pit, materials and photos, plus the costume, prop and set inventory, show checkouts and rentals.$\r$\n$\r$\nSetup will ask for your school's name and logo so the program carries your school's branding.$\r$\n$\r$\nEverything is stored on this computer. No internet connection is needed.$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
Page custom SchoolPage SchoolLeave
Page custom AccountPage AccountLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "$Program is ready"
!define MUI_FINISHPAGE_TEXT "Open it any time from the $ShortcutName shortcut on the desktop or in the Start menu. It runs in your web browser, but only on this computer.$\r$\n$\r$\nTip: in Settings, turn on Cloud backup to keep a copy in your school OneDrive or Google Drive. You can change the school name, logo and colors there too."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open $ShortcutName now"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---------- init ----------
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "School Theatre Manager needs 64-bit Windows 10 or 11."
    Abort
  ${EndIf}
  SetRegView 64
  SetShellVarContext all
  StrCpy $DataDir "$APPDATA\${DATANAME}"   ; C:\ProgramData\School Theatre Manager
  ; carry the data folder over from earlier versions
  ${IfNot} ${FileExists} "$DataDir\inventory.db"
    nsExec::Exec 'taskkill /IM ${OLDEXE1} /F'
    Pop $0
    nsExec::Exec 'taskkill /IM ${OLDEXE2} /F'
    Pop $0
    ${If} ${FileExists} "$APPDATA\${OLDDATA1}\inventory.db"
      Sleep 800
      Rename "$APPDATA\${OLDDATA1}" "$DataDir"
    ${ElseIf} ${FileExists} "$APPDATA\${OLDDATA2}\inventory.db"
      Sleep 800
      Rename "$APPDATA\${OLDDATA2}" "$DataDir"
    ${EndIf}
  ${EndIf}
  StrCpy $IsUpgrade "0"
  ${If} ${FileExists} "$DataDir\inventory.db"
    StrCpy $IsUpgrade "1"
  ${EndIf}
  ; reinstalling: start from the school details already saved
  StrCpy $BrandIni "$DataDir\branding\branding.ini"
  ReadINIStr $School  "$BrandIni" "branding" "school"
  ReadINIStr $Program "$BrandIni" "branding" "program"
  ReadINIStr $Short   "$BrandIni" "branding" "short"
  ReadINIStr $Tagline "$BrandIni" "branding" "tagline"
  ClearErrors
  StrCpy $ShortcutName "${APPNAME}"
FunctionEnd

Function un.onInit
  SetRegView 64
  SetShellVarContext all
FunctionEnd

; ---------- helpers ----------
; Sets $0 to 1 if the single character in $R5 appears in $R6 (case-sensitive).
!macro CharInFn prefix
Function ${prefix}CharIn
  StrCpy $0 0
  StrLen $R8 $R6
  StrCpy $R7 0
  ci_loop:
    IntCmp $R7 $R8 ci_done
    StrCpy $R9 $R6 1 $R7
    StrCmpS $R9 $R5 0 +3
      StrCpy $0 1
      Goto ci_done
    IntOp $R7 $R7 + 1
    Goto ci_loop
  ci_done:
FunctionEnd
!macroend
!insertmacro CharInFn ""

; Checks $AdminPass. $R1 = 1 if it has a capital letter, $R2 = 1 if it has a special character.
Function CheckPassword
  StrCpy $R1 0
  StrCpy $R2 0
  StrLen $R3 $AdminPass
  StrCpy $R4 0
  pw_loop:
    IntCmp $R4 $R3 pw_done
    StrCpy $R5 $AdminPass 1 $R4
    StrCpy $R6 "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    Call CharIn
    ${If} $0 == 1
      StrCpy $R1 1
    ${EndIf}
    StrCpy $R6 "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 "
    Call CharIn
    ${If} $0 == 0
      StrCpy $R2 1
    ${EndIf}
    IntOp $R4 $R4 + 1
    Goto pw_loop
  pw_done:
FunctionEnd

; Makes $R0 safe to use as a shortcut file name.
Function SafeName
  StrCpy $R1 ""
  StrLen $R3 $R0
  StrCpy $R4 0
  sn_loop:
    IntCmp $R4 $R3 sn_done
    StrCpy $R5 $R0 1 $R4
    StrCpy $R6 '\/:*?"<>|'
    Call CharIn
    ${If} $0 == 0
      StrCpy $R1 "$R1$R5"
    ${EndIf}
    IntOp $R4 $R4 + 1
    Goto sn_loop
  sn_done:
  StrCpy $R0 $R1
FunctionEnd

; ---------- your school page ----------
Function SchoolPage
  !insertmacro MUI_HEADER_TEXT "Your school" "These details brand the program for your theatre. You can change them later in Settings."
  nsDialogs::Create 1018
  Pop $Dlg
  ${If} $Dlg == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 2u 34% 12u "School name *"
  Pop $0
  ${NSD_CreateText} 36% 0 64% 13u "$School"
  Pop $hSchool
  ${NSD_CreateLabel} 0 20u 34% 12u "Theatre program name"
  Pop $0
  ${NSD_CreateText} 36% 18u 64% 13u "$Program"
  Pop $hProgram
  ${NSD_CreateLabel} 36% 32u 64% 10u "e.g. AHS Theatre, Lincoln Drama Club. Blank = school name + Theatre."
  Pop $0
  ${NSD_CreateLabel} 0 46u 34% 12u "Short name or initials"
  Pop $0
  ${NSD_CreateText} 36% 44u 30% 13u "$Short"
  Pop $hShort
  SendMessage $hShort ${EM_LIMITTEXT} 12 0
  ${NSD_CreateLabel} 0 64u 34% 12u "Motto or tagline"
  Pop $0
  ${NSD_CreateText} 36% 62u 64% 13u "$Tagline"
  Pop $hTagline
  ${NSD_CreateLabel} 0 84u 34% 12u "School or theatre logo"
  Pop $0
  ${NSD_CreateText} 36% 82u 46% 13u "$LogoPath"
  Pop $hLogo
  ${NSD_CreateBrowseButton} 84% 81u 16% 15u "Browse…"
  Pop $0
  ${NSD_OnClick} $0 BrowseLogo
  ${If} ${FileExists} "$DataDir\branding\logo.png"
    ${NSD_CreateLabel} 36% 98u 64% 22u "Leave blank to keep the logo you already have. PNG, JPG, GIF or ICO; a square image looks best."
  ${Else}
    ${NSD_CreateLabel} 36% 98u 64% 22u "Optional. PNG, JPG, GIF or ICO; a square image looks best. Without one, a stage-curtain logo is used."
  ${EndIf}
  Pop $0
  ${NSD_SetFocus} $hSchool
  nsDialogs::Show
FunctionEnd

Function BrowseLogo
  nsDialogs::SelectFileDialog open "" "Images (*.png;*.jpg;*.jpeg;*.gif;*.ico)|*.png;*.jpg;*.jpeg;*.gif;*.ico|All files|*.*"
  Pop $0
  ${If} $0 != ""
  ${AndIf} $0 != "error"
    ${NSD_SetText} $hLogo $0
  ${EndIf}
FunctionEnd

Function SchoolLeave
  ${NSD_GetText} $hSchool $School
  ${NSD_GetText} $hProgram $Program
  ${NSD_GetText} $hShort $Short
  ${NSD_GetText} $hTagline $Tagline
  ${NSD_GetText} $hLogo $LogoPath
  StrLen $0 $School
  ${If} $0 < 2
    MessageBox MB_ICONEXCLAMATION "Enter your school's name."
    Abort
  ${EndIf}
  ${If} $Program == ""
    StrCpy $Program "$School Theatre"
  ${EndIf}
  ${If} $LogoPath != ""
  ${AndIfNot} ${FileExists} "$LogoPath"
    MessageBox MB_ICONEXCLAMATION "The logo file can't be found. Choose it again with Browse, or leave the box empty."
    Abort
  ${EndIf}
  StrCpy $R0 $Program
  Call SafeName
  ${If} $R0 == ""
    StrCpy $R0 "${APPNAME}"
  ${EndIf}
  StrCpy $ShortcutName $R0
FunctionEnd

; ---------- director account page ----------
Function AccountPage
  ${If} $IsUpgrade == "1"
    Abort ; existing database: keep its accounts
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Director account" "This sign-in protects $Program. Keep the password somewhere safe."
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
  ${NSD_CreateLabel} 0 102u 100% 30u "Username: 3 or more letters, numbers, dots, dashes or underscores.$\r$\nPassword: at least 8 characters, including a capital letter and a special character such as ! @ # $$ % &."
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
  Call CheckPassword
  ${If} $R1 == 0
    MessageBox MB_ICONEXCLAMATION "The password needs at least one capital letter (A–Z)."
    Abort
  ${EndIf}
  ${If} $R2 == 0
    MessageBox MB_ICONEXCLAMATION "The password needs at least one special character, such as ! @ # $$ % & * ?"
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
!macro RemoveOld KEY
  ReadRegStr $1 HKLM "${KEY}" "InstallLocation"
  ${If} $1 != ""
  ${AndIf} ${FileExists} "$1\Uninstall.exe"
    DetailPrint "Removing the earlier version from $1 (your data is kept)…"
    ExecWait '"$1\Uninstall.exe" /S _?=$1'
    Delete "$1\Uninstall.exe"
    RMDir "$1"
  ${EndIf}
  DeleteRegKey HKLM "${KEY}"
!macroend

Section "-Program" SecMain
  SetOutPath "$INSTDIR"
  ; stop running copies so their files can be replaced
  nsExec::Exec 'taskkill /IM ${EXE} /F'
  Pop $0
  nsExec::Exec 'taskkill /IM ${OLDEXE1} /F'
  Pop $0
  nsExec::Exec 'taskkill /IM ${OLDEXE2} /F'
  Pop $0
  Sleep 600
  ; earlier versions' uninstallers keep the data when run silently
  !insertmacro RemoveOld "${OLDKEY1}"
  !insertmacro RemoveOld "${OLDKEY2}"
  ; shortcuts from an earlier install of this version, which may have used another program name
  ReadRegStr $1 HKLM "${UNINSTKEY}" "ShortcutName"
  ${If} $1 != ""
    Delete "$DESKTOP\$1.lnk"
    Delete "$SMSTARTUP\$1.lnk"
  ${EndIf}
  RMDir /r "$SMPROGRAMS\${APPNAME}"

  File "..\dist\${EXE}"
  File "..\app.ico"
  File "README.txt"

  ; data folder: created here so every Windows user on this computer can use the program
  CreateDirectory "$DataDir"
  nsExec::ExecToLog 'icacls "$DataDir" /grant *S-1-5-32-545:(OI)(CI)M /C /Q'
  Pop $0

  DetailPrint "Creating the database and saving your school's details…"
  ; passed through the environment so nothing appears on a command line
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_SCHOOL", t "$School")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_PROGRAM", t "$Program")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_SHORT", t "$Short")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_TAGLINE", t "$Tagline")i'
  ${If} $LogoPath != ""
    System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_LOGO", t "$LogoPath")i'
  ${EndIf}
  ${If} $AdminUser != ""
    System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_USER", t "$AdminUser")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_NAME", t "$AdminName")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_PASS", t "$AdminPass")i'
  ${EndIf}
  nsExec::ExecToLog '"$INSTDIR\${EXE}" --init-db --data "$DataDir"'
  Pop $0
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_PASS", p 0)i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_USER", p 0)i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_ADMIN_NAME", p 0)i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "ATI_LOGO", p 0)i'
  StrCpy $AdminPass ""
  ${If} $0 == "3"
    MessageBox MB_ICONEXCLAMATION "The database was created, but the director account couldn't be (the username may contain characters that aren't allowed).$\r$\n$\r$\nYou'll be asked to create the director account the first time you open $Program."
  ${ElseIf} $0 == "4"
    MessageBox MB_ICONEXCLAMATION "The logo couldn't be read, so the built-in stage logo is used for now.$\r$\n$\r$\nYou can add the logo later in Settings → School & branding."
  ${ElseIf} $0 != "0"
    MessageBox MB_ICONSTOP "Setup couldn't create the database (error $0).$\r$\nCheck that $DataDir can be written to, then run Setup again."
  ${Else}
    DetailPrint "Database ready: $DataDir\inventory.db"
  ${EndIf}
  ; make sure files the database step just created can be written by everyone who uses the program
  nsExec::ExecToLog 'icacls "$DataDir" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
  Pop $0

  ; shortcuts carry the school's logo and program name
  StrCpy $LinkIcon "$INSTDIR\app.ico"
  ${If} ${FileExists} "$DataDir\branding\logo.ico"
    CopyFiles /SILENT "$DataDir\branding\logo.ico" "$INSTDIR\school.ico"
    StrCpy $LinkIcon "$INSTDIR\school.ico"
  ${EndIf}
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\$ShortcutName.lnk" "$INSTDIR\${EXE}" "" "$LinkIcon" 0
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
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Data folder.lnk" "$DataDir"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"

  ; uninstaller and Apps & Features entry
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayName" "${APPNAME} ($Program)"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "Publisher" "$School"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayIcon" "$LinkIcon"
  WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTKEY}" "ShortcutName" "$ShortcutName"
  WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${UNINSTKEY}" "EstimatedSize" "$0"
SectionEnd

Section "Desktop shortcut" SecDesktop
  CreateShortcut "$DESKTOP\$ShortcutName.lnk" "$INSTDIR\${EXE}" "" "$LinkIcon" 0
SectionEnd

Section /o "Start with Windows" SecStartup
  CreateShortcut "$SMSTARTUP\$ShortcutName.lnk" "$INSTDIR\${EXE}" "--no-browser" "$LinkIcon" 0
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
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Put a shortcut with your school's logo on the desktop."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStartup} "Start the program in the background when anyone signs in to this computer, so it's always ready."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecNetwork} "Let other computers on the school network (for example a laptop in the costume room) open the program from this computer. Everyone still signs in. Leave this off unless you need it."
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
  ReadRegStr $1 HKLM "${UNINSTKEY}" "ShortcutName"
  ${If} $1 != ""
    Delete "$DESKTOP\$1.lnk"
    Delete "$SMSTARTUP\$1.lnk"
  ${EndIf}
  Delete "$INSTDIR\${EXE}"
  Delete "$INSTDIR\app.ico"
  Delete "$INSTDIR\school.ico"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${APPNAME}"'
  Pop $0
  DeleteRegKey HKLM "${UNINSTKEY}"

  IfSilent keepdata
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete the database, photos, show files, branding and backups?$\r$\n$\r$\nChoose No to keep them (recommended). Reinstalling will pick up right where you left off." IDNO keepdata
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "This permanently erases every show, item, rental, photo and file stored on this computer. Cloud backup copies are not touched.$\r$\n$\r$\nDelete all School Theatre Manager data?" IDNO keepdata
  RMDir /r "$APPDATA\${DATANAME}"
  keepdata:
SectionEnd
