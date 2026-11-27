!macro NSIS_HOOK_POSTINSTALL
  ; Compile-time checks. Tauri signs the app before MakeNSIS and registers its uninstaller signer
  ; before expanding this hook. NSIS ignores that signer's exit code unless a check is added.
  !system '"$%TAURI_WINDOWS_SIGNTOOL_PATH%" verify /pa /tw "${MAINBINARYSRCPATH}"' = 0
  !uninstfinalize '"$%TAURI_WINDOWS_SIGNTOOL_PATH%" verify /pa /tw "%1"' = 0
!macroend
