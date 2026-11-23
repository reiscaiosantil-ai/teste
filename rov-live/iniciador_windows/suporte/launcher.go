// ROV Live launcher: use the same console entry point validated on the PC.
package main

import (
    "fmt"
    "os"
    "path/filepath"
    "syscall"
    "unsafe"
)

func message(body string) {
    title, _ := syscall.UTF16PtrFromString("ROV Live IA")
    text, _ := syscall.UTF16PtrFromString(body)
    syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(
        0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), 0x40)
}

func run() error {
    exe, err := os.Executable()
    if err != nil { return err }
    root := filepath.Dir(exe)
    for _, relative := range []string{"INICIAR_PORTATIL.cmd", "runtime/python.exe", "app/app.py"} {
        if _, err := os.Stat(filepath.Join(root, relative)); err != nil {
            return fmt.Errorf("Arquivo ausente: %s\nMantenha o EXE, o CMD e as pastas app e runtime juntos.", relative)
        }
    }
    systemRoot := os.Getenv("SystemRoot")
    if systemRoot == "" { return fmt.Errorf("O Windows não informou SystemRoot.") }
    shell := filepath.Join(systemRoot, "System32", "cmd.exe")
    application, err := syscall.UTF16PtrFromString(shell)
    if err != nil { return err }
    // The current directory is passed separately; no user path enters CMD syntax.
    line, err := syscall.UTF16PtrFromString(`cmd.exe /d /c INICIAR_PORTATIL.cmd`)
    if err != nil { return err }
    directory, err := syscall.UTF16PtrFromString(root)
    if err != nil { return err }
    startup := syscall.StartupInfo{}
    startup.Cb = uint32(unsafe.Sizeof(startup))
    process := syscall.ProcessInformation{}
    // No STARTF_USESTDHANDLES: the new console receives real console handles,
    // so startup errors and the script's pause remain visible to the user.
    const createNewConsole = 0x00000010
    err = syscall.CreateProcess(application, line, nil, nil, false,
        createNewConsole, nil, directory, &startup, &process)
    if err != nil { return fmt.Errorf("Não foi possível iniciar o CMD: %w", err) }
    defer syscall.CloseHandle(process.Process)
    defer syscall.CloseHandle(process.Thread)
    if _, err = syscall.WaitForSingleObject(process.Process, syscall.INFINITE); err != nil {
        return err
    }
    var code uint32
    if err = syscall.GetExitCodeProcess(process.Process, &code); err != nil { return err }
    if code != 0 {
        return fmt.Errorf("A execução terminou com código %d. Confira a mensagem na janela do CMD.", code)
    }
    return nil
}

func main() {
    if err := run(); err != nil { message(err.Error()) }
}
