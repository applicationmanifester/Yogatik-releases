$root = 'C:\Users\bharg_4mtuttl\Desktop\BGK_Applications\AI ChatBot\frontend\src'
$files = Get-ChildItem -Recurse $root -Include *.ts,*.tsx
Write-Output ("TOTAL FILES: " + $files.Count)
Write-Output ("TOTAL KB: " + [math]::Round(($files | Measure-Object Length -Sum).Sum/1KB))
Write-Output "---LARGEST---"
$files | Sort-Object Length -Descending | Select-Object -First 40 | ForEach-Object {
  '{0,7} KB  {1}' -f [math]::Round($_.Length/1KB), $_.FullName.Replace($root + '\','')
}
Write-Output "---BY DIR---"
$files | Group-Object { Split-Path $_.FullName -Parent } | Sort-Object Count -Descending | ForEach-Object { '{0,4}  {1}' -f $_.Count, $_.Name.Replace($root,'.') }
