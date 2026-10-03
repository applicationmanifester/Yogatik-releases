Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "..\frontend\public\icon-1024.png"
if (-not (Test-Path $sourcePath)) {
    Write-Error "Source icon not found at $sourcePath"
    exit 1
}

$srcImg = [System.Drawing.Image]::FromFile($sourcePath)

function Resize-Image {
    param(
        [System.Drawing.Image]$source,
        [int]$width,
        [int]$height,
        [string]$destPath,
        [bool]$centerPad = $false,
        [float]$padRatio = 0.65
    )
    $destDir = Split-Path $destPath
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    $bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($centerPad) {
        $iconW = [int]($width * $padRatio)
        $iconH = [int]($height * $padRatio)
        $offsetX = [int](($width - $iconW) / 2)
        $offsetY = [int](($height - $iconH) / 2)
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($source, $offsetX, $offsetY, $iconW, $iconH)
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($source, 0, 0, $width, $height)
    }

    $g.Dispose()
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created: $destPath ($width x $height)"
}

function Create-Splash {
    param(
        [System.Drawing.Image]$source,
        [int]$width,
        [int]$height,
        [string]$destPath
    )
    $destDir = Split-Path $destPath
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    $bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    # Dark background #0a0e14
    $bgColor = [System.Drawing.ColorTranslator]::FromHtml("#0a0e14")
    $g.Clear($bgColor)

    # Icon size: 28% of shortest edge
    $minDim = [Math]::Min($width, $height)
    $iconDim = [Math]::Max(72, [int]($minDim * 0.32))
    $offsetX = [int](($width - $iconDim) / 2)
    $offsetY = [int](($height - $iconDim) / 2)

    $g.DrawImage($source, $offsetX, $offsetY, $iconDim, $iconDim)
    $g.Dispose()
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created Splash: $destPath ($width x $height)"
}

$resDir = Join-Path $PSScriptRoot "..\frontend\android\app\src\main\res"

# 1. Android Mipmaps
$mipmaps = @{
    "mipmap-mdpi"    = @{ icon = 48;  fg = 108 }
    "mipmap-hdpi"    = @{ icon = 72;  fg = 162 }
    "mipmap-xhdpi"   = @{ icon = 96;  fg = 216 }
    "mipmap-xxhdpi"  = @{ icon = 144; fg = 324 }
    "mipmap-xxxhdpi" = @{ icon = 192; fg = 432 }
}

foreach ($density in $mipmaps.Keys) {
    $sizes = $mipmaps[$density]
    $dir = Join-Path $resDir $density

    # Standard launcher icon
    Resize-Image $srcImg $sizes.icon $sizes.icon (Join-Path $dir "ic_launcher.png")
    # Round launcher icon
    Resize-Image $srcImg $sizes.icon $sizes.icon (Join-Path $dir "ic_launcher_round.png")
    # Foreground adaptive icon (padded)
    Resize-Image $srcImg $sizes.fg $sizes.fg (Join-Path $dir "ic_launcher_foreground.png") -centerPad $true -padRatio 0.65
}

# 2. Android Splash screens
$splashes = @{
    "drawable"             = @{ w = 480;  h = 800 }
    "drawable-port-mdpi"   = @{ w = 320;  h = 480 }
    "drawable-port-hdpi"   = @{ w = 480;  h = 800 }
    "drawable-port-xhdpi"  = @{ w = 720;  h = 1280 }
    "drawable-port-xxhdpi" = @{ w = 960;  h = 1600 }
    "drawable-port-xxxhdpi"= @{ w = 1280; h = 1920 }
    "drawable-land-mdpi"   = @{ w = 480;  h = 320 }
    "drawable-land-hdpi"   = @{ w = 800;  h = 480 }
    "drawable-land-xhdpi"  = @{ w = 1280; h = 720 }
    "drawable-land-xxhdpi" = @{ w = 1600; h = 960 }
    "drawable-land-xxxhdpi"= @{ w = 1920; h = 1280 }
}

foreach ($drawDir in $splashes.Keys) {
    $s = $splashes[$drawDir]
    $path = Join-Path (Join-Path $resDir $drawDir) "splash.png"
    Create-Splash $srcImg $s.w $s.h $path
}

# 3. iOS Assets
$iosAppIcon = Join-Path $PSScriptRoot "..\frontend\ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png"
Resize-Image $srcImg 1024 1024 $iosAppIcon

$iosSplash = Join-Path $PSScriptRoot "..\frontend\ios\App\App\Assets.xcassets\Splash.imageset"
if (Test-Path $iosSplash) {
    Create-Splash $srcImg 1284 2778 (Join-Path $iosSplash "splash-2778x1284.png")
    Create-Splash $srcImg 2778 1284 (Join-Path $iosSplash "splash-2778x1284-1.png")
    Create-Splash $srcImg 1284 2778 (Join-Path $iosSplash "splash-2778x1284-2.png")
}

$srcImg.Dispose()
Write-Host "All Android and iOS icons and splash assets successfully generated from Yogatik icon-1024.png!"
