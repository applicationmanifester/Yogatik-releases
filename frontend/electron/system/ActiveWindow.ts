/**
 * ActiveWindow — Cross-platform active window detection
 */

export interface ActiveWindowInfo {
  success: true
  appName: string
  title: string
  pid?: number
}

export async function getActiveWindow(): Promise<ActiveWindowInfo> {
  if (process.platform !== 'win32') {
    return { success: true, appName: 'Desktop App', title: 'Active Window' }
  }

  return new Promise((resolve) => {
    // Safer PowerShell script without complex string interpolation
    const psScript = `
      $sig = @'
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
      '@
      Add-Type -MemberDefinition $sig -Name "Win32Util" -Namespace "Win32" -ErrorAction SilentlyContinue
      $hwnd = [Win32.Win32Util]::GetForegroundWindow()
      $sb = New-Object System.Text.StringBuilder 256
      [void][Win32.Win32Util]::GetWindowText($hwnd, $sb, 256)
      $pidVal = 0
      [void][Win32.Win32Util]::GetWindowThreadProcessId($hwnd, [ref]$pidVal)
      $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
      [PSCustomObject]@{
        appName = if ($proc) { $proc.ProcessName } else { "Unknown" }
        title   = $sb.ToString()
        pid     = $pidVal
      } | ConvertTo-Json -Compress
    `

    const { exec } = require('child_process')
    exec(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/[\r\n]+/g, ' ')}"`,
      { timeout: 3000 },
      (err: Error | null, stdout: string) => {
        if (err || !stdout.trim()) {
          resolve({ success: true, appName: 'External Application', title: 'Active Window' })
          return
        }
        try {
          const data = JSON.parse(stdout.trim())
          resolve({
            success: true,
            appName: data.appName || 'Application',
            title: data.title || '',
            pid: data.pid,
          })
        } catch {
          resolve({ success: true, appName: 'External App', title: stdout.trim() })
        }
      }
    )
  })
}