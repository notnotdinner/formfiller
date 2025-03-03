# 下载Chrome扩展图标
$url = "https://raw.githubusercontent.com/google/material-design-icons/master/png/action/extension/materialicons/48dp/2x/baseline_extension_black_48dp.png"
$output16 = "images/icon16.png"
$output48 = "images/icon48.png" 
$output128 = "images/icon128.png"

# 创建WebClient对象
$wc = New-Object System.Net.WebClient

# 下载图标
Write-Host "Downloading icons..."
$wc.DownloadFile($url, $output48)

# 复制同一个图标用于不同尺寸(实际项目中应使用适当尺寸的图标)
Copy-Item $output48 $output16
Copy-Item $output48 $output128

Write-Host "Icons downloaded successfully!" 