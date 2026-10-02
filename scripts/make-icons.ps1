Add-Type -AssemblyName System.Drawing

function Pt([float]$x, [float]$y, [float]$s) {
    return (New-Object System.Drawing.PointF(([single]($x * $s)), ([single]($y * $s))))
}

function Make-Icon([int]$size, [string]$path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $s = $size / 512.0

    # 深蓝海底背景
    $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 10, 61, 92))
    $g.FillRectangle($bg, 0, 0, $size, $size)

    # 气泡
    $bubble = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 140, 210, 232))
    $g.FillEllipse($bubble, $(90 * $s), $(90 * $s), $(46 * $s), $(46 * $s))
    $g.FillEllipse($bubble, $(140 * $s), $(150 * $s), $(26 * $s), $(26 * $s))
    $g.FillEllipse($bubble, $(70 * $s), $(180 * $s), $(16 * $s), $(16 * $s))

    # 鱼身（青色）
    $fish = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 126, 216, 255))
    $g.FillEllipse($fish, $(150 * $s), $(200 * $s), $(240 * $s), $(130 * $s))

    # 尾鳍
    $tail = [System.Drawing.PointF[]]@(Pt 170 262 $s; Pt 80 195 $s; Pt 95 330 $s)
    $g.FillPolygon($fish, $tail)

    # 背鳍
    $fin = [System.Drawing.PointF[]]@(Pt 230 205 $s; Pt 280 140 $s; Pt 310 205 $s)
    $g.FillPolygon($fish, $fin)

    # 眼睛
    $g.FillEllipse([System.Drawing.Brushes]::White, $(330 * $s), $(232 * $s), $(34 * $s), $(34 * $s))
    $g.FillEllipse([System.Drawing.Brushes]::Black, $(342 * $s), $(240 * $s), $(16 * $s), $(16 * $s))

    # 嘴（弧线）
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 4, 38, 63), ([single](5 * $s)))
    $g.DrawArc($pen, $(360 * $s), $(280 * $s), $(34 * $s), $(24 * $s), 300, 120)

    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

Make-Icon 512 'D:\Files\coding\ai_code\fish\public\icon-512.png'
Make-Icon 192 'D:\Files\coding\ai_code\fish\public\icon-192.png'
Write-Host 'icons created'
