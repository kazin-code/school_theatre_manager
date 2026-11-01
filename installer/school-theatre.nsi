; School Theatre Manager: Windows installer (NSIS 3)
; Installs the app (a Node.js server that runs in the background plus a small launcher),
; brands it for the school, creates the database and data folders and the director account,
; adds shortcuts, an optional network rule, and an uninstaller that keeps the data by default.

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
!define APPNAME   "School Theatre Manager"
!define EXE       "SchoolTheatre.exe"
!define PUBLISHER "School Theatre Manager"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SchoolTheatreManager"
!define DATANAME  "School Theatre Manager"
!define TOOL      '"$INSTDIR\node\node.exe" "$INSTDIR\app\tools\stm-tool.cjs"'

Name "${APPNAME}"
OutFile "..\dist\School-Theatre-Manager-Setup.exe"
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
Var BrandIni
Var IsUpgrade
Var OldV2
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
Var DataChoice
Var DelOld
Var OldCopy
Var hKeep
Var hFresh
Var hDelOld

; ---------- pages ----------
!define MUI_WELCOMEPAGE_TITLE "Set up School Theatre Manager"
!define MUI_WELCOMEPAGE_TEXT "School Theatre Manager runs a school theatre program: plays and musicals with their cast, crew, pit, materials, photos and programs, plus the costume, prop and set inventory, show checkouts and rentals.$\r$\n$\r$\nSetup will ask for your school's name and logo so the program carries your school's branding.$\r$\n$\r$\nEverything is stored on this computer. No internet connection is needed.$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom ExistingPage ExistingLeave
!insertmacro MUI_PAGE_COMPONENTS
Page custom SchoolPage SchoolLeave
Page custom AccountPage AccountLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "$Program is ready"
!define MUI_FINISHPAGE_TEXT "Open it any time from the $ShortcutName shortcut on the desktop or in the Start menu. It opens in your web browser, but runs only on this computer.$\r$\n$\r$\nTip: in Settings > Backups & data, turn on Cloud backup to keep a copy in your school OneDrive or Google Drive."
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
  StrCpy $IsUpgrade "0"
  StrCpy $OldV2 "0"
  ${If} ${FileExists} "$DataDir\theatre.db"
    StrCpy $IsUpgrade "1"
  ${ElseIf} ${FileExists} "$DataDir\inventory.db"
    ; data from version 2 (the Go program) uses a different database; it is set aside, not converted
    StrCpy $OldV2 "1"
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "This computer has data from an earlier version (2.x) of School Theatre Manager.$\r$\n$\r$\nVersion ${VERSION} starts with a new database. The old data will be moved to a folder named $\"${DATANAME} (version 2 data)$\" in $APPDATA, so nothing is lost.$\r$\n$\r$\nContinue?" IDOK +2
    Abort
  ${EndIf}
  ; reinstalling: start from the school details already saved
  StrCpy $BrandIni "$DataDir\branding\branding.ini"
  ReadINIStr $School  "$BrandIni" "branding" "school"
  ReadINIStr $Program "$BrandIni" "branding" "program"
  ReadINIStr $Short   "$BrandIni" "branding" "short"
  ReadINIStr $Tagline "$BrandIni" "branding" "tagline"
  ClearErrors
  ${If} $IsUpgrade != "1"
    StrCpy $School ""
    StrCpy $Program ""
    StrCpy $Short ""
    StrCpy $Tagline ""
  ${EndIf}
  StrCpy $ShortcutName "${APPNAME}"
  StrCpy $DataChoice "keep"
  StrCpy $DelOld "0"
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

; ---------- existing data: keep it or start fresh ----------
Function ExistingPage
  ${If} $IsUpgrade != "1"
  ${AndIf} $DataChoice != "fresh"
    Abort ; nothing installed yet
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Existing data found" "School Theatre Manager has already been set up on this computer."
  nsDialogs::Create 1018
  Pop $Dlg
  ${If} $Dlg == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "This computer already has shows, inventory, users, photos and an activity history in $DataDir. What should Setup do with them?"
  Pop $0
  ${NSD_CreateRadioButton} 0 30u 100% 12u "Keep everything (recommended)"
  Pop $hKeep
  ${NSD_CreateLabel} 12u 43u 95% 18u "Update the program and keep all shows, inventory, photos, users, branding and history, as they are now."
  Pop $0
  ${NSD_CreateRadioButton} 0 66u 100% 12u "Start fresh"
  Pop $hFresh
  ${NSD_CreateLabel} 12u 79u 95% 26u "Set the program up as if it were new: an empty database, new school details and a new director account. The old data is moved to a folder named $\"${DATANAME} (old data, date)$\" so it can still be recovered."
  Pop $0
  ${NSD_CreateCheckbox} 12u 108u 95% 12u "Permanently delete the old data instead of keeping a copy"
  Pop $hDelOld
  ${If} $DataChoice == "fresh"
    ${NSD_Check} $hFresh
  ${Else}
    ${NSD_Check} $hKeep
    EnableWindow $hDelOld 0
  ${EndIf}
  ${If} $DelOld == "1"
    ${NSD_Check} $hDelOld
  ${EndIf}
  ${NSD_OnClick} $hKeep ExistingToggle
  ${NSD_OnClick} $hFresh ExistingToggle
  nsDialogs::Show
FunctionEnd

Function ExistingToggle
  ${NSD_GetState} $hFresh $0
  ${If} $0 == ${BST_CHECKED}
    EnableWindow $hDelOld 1
  ${Else}
    ${NSD_Uncheck} $hDelOld
    EnableWindow $hDelOld 0
  ${EndIf}
FunctionEnd

Function ExistingLeave
  ${NSD_GetState} $hFresh $0
  ${NSD_GetState} $hDelOld $1
  ${If} $0 != ${BST_CHECKED}
    StrCpy $DataChoice "keep"
    StrCpy $DelOld "0"
    StrCpy $IsUpgrade "1"
    ; back to the saved school details in case the person changed their mind
    ReadINIStr $School  "$BrandIni" "branding" "school"
    ReadINIStr $Program "$BrandIni" "branding" "program"
    ReadINIStr $Short   "$BrandIni" "branding" "short"
    ReadINIStr $Tagline "$BrandIni" "branding" "tagline"
    ClearErrors
    Return
  ${EndIf}
  ${If} $1 == ${BST_CHECKED}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Permanently delete all existing shows, inventory, rentals, photos, files, users and history on this computer?$\r$\n$\r$\nThis can't be undone. Cloud backup copies are not touched." IDYES +2
    Abort
    StrCpy $DelOld "1"
  ${Else}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Start fresh?$\r$\n$\r$\nThe existing data will be moved to a separate folder next to the new one, and the program will start empty." IDYES +2
    Abort
    StrCpy $DelOld "0"
  ${EndIf}
  StrCpy $DataChoice "fresh"
  StrCpy $IsUpgrade "0"   ; ask for school details and a new director account
  StrCpy $School ""
  StrCpy $Program ""
  StrCpy $Short ""
  StrCpy $Tagline ""
  StrCpy $LogoPath ""
FunctionEnd

; ---------- your school page ----------
Function SchoolPage
  ; keeping existing data: reuse the saved school details instead of asking again
  ${If} $IsUpgrade == "1"
  ${AndIf} $DataChoice != "fresh"
  ${AndIf} $School != ""
    Call NameFromSaved
    Abort
  ${EndIf}
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
  ${AndIf} $DataChoice != "fresh"
    ${NSD_CreateLabel} 36% 98u 64% 22u "Leave blank to keep the logo you already have. PNG, JPG, GIF or ICO; a square image looks best."
  ${Else}
    ${NSD_CreateLabel} 36% 98u 64% 22u "Optional. PNG, JPG, GIF or ICO; a square image looks best. Without one, a stage-curtain logo is used."
  ${EndIf}
  Pop $0
  ${NSD_SetFocus} $hSchool
  nsDialogs::Show
FunctionEnd

; Works out the shortcut name from the saved program name (used when the school page is skipped).
Function NameFromSaved
  StrCpy $LogoPath ""
  ${If} $Program == ""
    StrCpy $Program "$School Theatre"
  ${EndIf}
  StrCpy $R0 $Program
  Call SafeName
  ${If} $R0 == ""
    StrCpy $R0 "${APPNAME}"
  ${EndIf}
  StrCpy $ShortcutName $R0
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
Section "-Program" SecMain
  SetOutPath "$INSTDIR"
  ; stop the running app so its files can be replaced
  ${If} ${FileExists} "$INSTDIR\${EXE}"
    nsExec::Exec '"$INSTDIR\${EXE}" --stop'
    Pop $0
  ${EndIf}
  nsExec::Exec 'taskkill /IM ${EXE} /F'
  Pop $0
  nsExec::Exec `powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\*' } | Stop-Process -Force"`
  Pop $0
  Sleep 800
  ; shortcuts from an earlier install, which may have used another program name
  ReadRegStr $1 HKLM "${UNINSTKEY}" "ShortcutName"
  ${If} $1 != ""
    Delete "$DESKTOP\$1.lnk"
    Delete "$SMSTARTUP\$1.lnk"
  ${EndIf}
  RMDir /r "$SMPROGRAMS\${APPNAME}"

  ; version 2 data is set aside (this version uses a new database)
  ${If} $OldV2 == "1"
    StrCpy $OldCopy "$APPDATA\${DATANAME} (version 2 data)"
    ${If} ${FileExists} "$OldCopy\*.*"
      ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
      StrCpy $OldCopy "$APPDATA\${DATANAME} (version 2 data $2-$1-$0 $4$5)"
    ${EndIf}
    DetailPrint "Moving the version 2 data to $OldCopy…"
    Rename "$DataDir" "$OldCopy"
  ${EndIf}
  ; starting fresh: set the old data aside (or delete it) before creating a new database
  ${If} $DataChoice == "fresh"
  ${AndIf} ${FileExists} "$DataDir\*.*"
    ${If} $DelOld == "1"
      DetailPrint "Deleting the old data…"
      RMDir /r "$DataDir"
    ${Else}
      ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
      StrCpy $OldCopy "$APPDATA\${DATANAME} (old data $2-$1-$0 $4$5)"
      DetailPrint "Moving the old data to $OldCopy…"
      ClearErrors
      Rename "$DataDir" "$OldCopy"
      ${If} ${Errors}
        CreateDirectory "$OldCopy"
        CopyFiles /SILENT "$DataDir\*.*" "$OldCopy"
        RMDir /r "$DataDir"
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ; the program: launcher, Node.js runtime and the app (old app files are removed first)
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  File "..\dist\${EXE}"
  File "app.ico"
  File "README.txt"
  SetOutPath "$INSTDIR\node"
  File /r "..\dist\node\*.*"
  SetOutPath "$INSTDIR\app"
  File /r "..\dist\app\*.*"
  SetOutPath "$INSTDIR"

  ; data folder: created here so every Windows user on this computer can use the program
  CreateDirectory "$DataDir"
  nsExec::ExecToLog 'icacls "$DataDir" /grant *S-1-5-32-545:(OI)(CI)M /C /Q'
  Pop $0

  ${If} $LogoPath != ""
    DetailPrint "Preparing your logo…"
    nsExec::ExecToLog '"$INSTDIR\${EXE}" --prepare-logo "$LogoPath" "$DataDir\branding"'
    Pop $0
    ${If} $0 != "0"
      MessageBox MB_ICONEXCLAMATION "The logo couldn't be read, so the built-in stage logo is used for now.$\r$\n$\r$\nYou can add the logo later in Settings > School & branding."
    ${EndIf}
  ${EndIf}

  DetailPrint "Creating the database and saving your school's details…"
  ; passed through the environment so nothing appears on a command line
  ${If} $School != ""
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_SCHOOL", t "$School")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_PROGRAM", t "$Program")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_SHORT", t "$Short")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_TAGLINE", t "$Tagline")i'
  ${EndIf}
  ${If} $AdminUser != ""
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_ADMIN_USER", t "$AdminUser")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_ADMIN_NAME", t "$AdminName")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "STM_ADMIN_PASS", t "$AdminPass")i'
  ${EndIf}
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_MIGRATIONS", t "$INSTDIR\app\drizzle")i'
  nsExec::ExecToLog '${TOOL} init --data "$DataDir"'
  Pop $0
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_ADMIN_PASS", p 0)i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_ADMIN_USER", p 0)i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "STM_ADMIN_NAME", p 0)i'
  StrCpy $AdminPass ""
  ${If} $0 == "3"
    MessageBox MB_ICONEXCLAMATION "The database was created, but the director account couldn't be (the username may contain characters that aren't allowed).$\r$\n$\r$\nYou'll be asked to create the director account the first time you open $Program."
  ${ElseIf} $0 != "0"
    MessageBox MB_ICONSTOP "Setup couldn't create the database (error $0).$\r$\nCheck that $DataDir can be written to, then run Setup again."
  ${EndIf}
  ${If} $OldCopy != ""
    DetailPrint "Your previous data is kept in $OldCopy"
  ${EndIf}
  ; files the database step just created must be writable by everyone who uses the program
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
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Stop $ShortcutName.lnk" "$INSTDIR\${EXE}" "--stop" "$INSTDIR\app.ico" 0
  SetOutPath "$INSTDIR\app"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Reset Director Password.lnk" "$INSTDIR\node\node.exe" '"$INSTDIR\app\tools\stm-tool.cjs" reset-password --data "$DataDir"' "$INSTDIR\app.ico" 0
  SetOutPath "$INSTDIR"
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
  nsExec::ExecToLog '${TOOL} network on --data "$DataDir"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${APPNAME}"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${APPNAME}" dir=in action=allow program="$INSTDIR\node\node.exe" enable=yes profile=domain,private'
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
  nsExec::Exec '"$INSTDIR\${EXE}" --stop'
  Pop $0
  nsExec::Exec `powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\*' } | Stop-Process -Force"`
  Pop $0
  Sleep 800
  ReadRegStr $1 HKLM "${UNINSTKEY}" "ShortcutName"
  ${If} $1 != ""
    Delete "$DESKTOP\$1.lnk"
    Delete "$SMSTARTUP\$1.lnk"
  ${EndIf}
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
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
