Option Explicit

Dim oShell, oFSO
Set oShell = CreateObject("WScript.Shell")
Set oFSO   = CreateObject("Scripting.FileSystemObject")

Dim stopScript
stopScript = "C:\Users\jhyou\task-manager\stop.bat"

If Not oFSO.FileExists(stopScript) Then
    MsgBox "stop.bat 파일을 찾을 수 없습니다." & vbCrLf & _
           "경로: " & stopScript, vbCritical, "FlowDesk"
    WScript.Quit 1
End If

Dim answer
answer = MsgBox("FlowDesk 서버를 종료하시겠습니까?", _
                vbQuestion + vbYesNo, "FlowDesk 종료")

If answer = vbYes Then
    oShell.Run "cmd /c " & Chr(34) & stopScript & Chr(34), 1, True
End If

Set oShell = Nothing
Set oFSO   = Nothing
