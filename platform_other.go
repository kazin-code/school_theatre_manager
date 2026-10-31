//go:build !windows

package main

import (
	"fmt"
	"os/exec"
)

func defaultDataDir() string         { return "./data" }
func openBrowser(url string)         { exec.Command("xdg-open", url).Start() }
func openFolder(dir string)          { exec.Command("xdg-open", dir).Start() }
func showMessage(title, text string) { fmt.Println(title + ": " + text) }
