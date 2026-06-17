Option Explicit

Dim oShell, oFSO
Set oShell = CreateObject("WScript.Shell")
Set oFSO   = CreateObject("Scripting.FileSystemObject")

Dim projectPath, batScript
projectPath = "C:\Users\jhyou\task-manager"
batScript   = projectPath & "\restart.bat"

' ── 포트 확인 (netstat 기반) ─────────────────────────────────
Function IsPortUp(port)
    Dim tmp, cmd
    tmp = oShell.ExpandEnvironmentStrings("%TEMP%") & "\fd_" & port & ".txt"
    cmd = "cmd /c netstat -an | findstr LISTENING | findstr :" & port & " > " & _
          Chr(34) & tmp & Chr(34) & " 2>&1"
    oShell.Run cmd, 0, True
    If oFSO.FileExists(tmp) Then
        IsPortUp = (oFSO.GetFile(tmp).Size > 0)
        oFSO.DeleteFile tmp
    Else
        IsPortUp = False
    End If
End Function

' ── 이미 실행 중이면 브라우저만 열기 ─────────────────────────
If IsPortUp(3000) Then
    oShell.Run "cmd /c start http://localhost:3000", 0, False
    WScript.Quit
End If

' ── restart.bat 존재 확인 ────────────────────────────────────
If Not oFSO.FileExists(batScript) Then
    MsgBox "restart.bat 파일을 찾을 수 없습니다." & vbCrLf & _
           "경로: " & batScript, vbCritical, "FlowDesk"
    WScript.Quit 1
End If

' ── 서버 시작 (CMD 창 표시, 완료 후 Enter 누르면 브라우저 오픈) ─
oShell.Run "cmd /c " & Chr(34) & batScript & Chr(34), 1, True

' ── 브라우저 열기 ────────────────────────────────────────────
oShell.Run "cmd /c start http://localhost:3000", 0, False

Set oShell = Nothing
Set oFSO   = Nothing
