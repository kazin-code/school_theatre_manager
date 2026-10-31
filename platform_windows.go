//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	user32      = syscall.NewLazyDLL("user32.dll")
	messageBoxW = user32.NewProc("MessageBoxW")
)

func defaultDataDir() string {
	pd := os.Getenv("ProgramData")
	if pd == "" {
		pd = `C:\ProgramData`
	}
	return filepath.Join(pd, "AHS Theatre Inventory")
}

func hidden(cmd *exec.Cmd) *exec.Cmd {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd
}

func openBrowser(url string) {
	hidden(exec.Command("rundll32", "url.dll,FileProtocolHandler", url)).Start()
}

func openFolder(dir string) {
	exec.Command("explorer.exe", dir).Start()
}

func showMessage(title, text string) {
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	messageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x40) // MB_ICONINFORMATION
}
