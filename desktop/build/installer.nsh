!include "nsProcess.nsh"

!macro customCheckAppRunning
  !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    DetailPrint `Closing running "${PRODUCT_NAME}"...`

    # Try a graceful close first so Electron can stop its child services.
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R1
    Sleep 2500

    StrCpy $R1 0

    loop:
      IntOp $R1 $R1 + 1
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 == 0
        ${if} $R1 > 2
          nsExec::Exec `%SYSTEMROOT%\System32\taskkill.exe /f /t /im "${APP_EXECUTABLE_FILENAME}"`
          Sleep 1500
        ${else}
          Sleep 1500
        ${endIf}

        !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
        ${if} $R0 == 0
          ${if} $R1 > 4
            MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY loop
            Quit
          ${else}
            Goto loop
          ${endIf}
        ${endIf}
      ${endIf}
  ${endIf}
!macroend

!macro customInit
  # productName 已改为 "橙AI-无限画布"，electron-builder 会自动把安装目录名退回 sanitized 包名。
  # 这里固定回原来的 ASCII 目录名，保持升级时覆盖到同一目录、不残留旧目录。
  StrCpy $INSTDIR "$LocalAppData\Programs\Infinite Canvas"
!macroend
