# =============================================================================
# build.ps1 —— dsh-desktop 的 Windows 分发包打包脚本 (T17)
#
# 作用: 把 dsh-desktop 打包成可分发的 Windows 产物:
#   1. npm run build                         —— electron-vite 三段构建 (dist/main +
#                                               dist/preload + dist/renderer)
#   2. 构建并打包 @dsh-desktop/client 插件    —— tsc → lib/, npm pack → resources/plugins/*.tgz
#   3. 安装捆绑的 DeepSeek Harness 运行时    —— 便携版 npm 把 @deepseek-ai/dsh@0.1.0-rc.6
#                                              装进 runtime/node_modules (固定版本)
#   4. electron-builder --win nsis zip       —— NSIS 安装器 .exe + win zip
#   5. 便携版 (必得产物)                     —— 打包 win-unpacked (已注入 node.exe)
#                                              为 7-Zip zip, 免安装、双击即用
#
# 复用 dsh-launcher (v0.1) 沉淀的经验:
#   * 便携版 Node v24.19.0 下载 + 缓存 (幂等, 重复构建秒级跳过)
#   * 7-Zip 压缩 (-mx=1 最快档); 绝不用 PowerShell Compress-Archive
#   * $PSScriptRoot 在「相对路径 + -File」调用下可能为空 → $MyInvocation 回退,
#     兼容中文路径下直接用 `powershell -File build.ps1` 调用
#   * Unicode 安全地调用 7z: Push-Location 切目录 + 纯 ASCII 相对路径 +
#     PowerShell cmdlet 处理最终文件重命名 (PS 5.1 把含中文参数按 ANSI 传给原生 exe 会乱码)
#
# 用法:
#   powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1               # 完整构建
#   powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1 -SkipInstaller # 只出便携 zip
#   powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1 -SkipZip       # 只组装不压缩
#   powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1 -Force         # 强制重装运行时
# =============================================================================

[CmdletBinding()]
param(
    # 版本号: 不传则从 VERSION 文件读取 (去除首尾空白)。
    [string]$Version,

    # 便携版 Node.js 版本。固定不动: 此版本自带 npm, 可用于"自举"安装 dsh 运行时。
    [string]$NodeVersion = 'v24.19.0',

    # 捆绑的 @deepseek-ai/dsh 运行时版本。必须精确固定, 禁止范围写法,
    # 否则可能装到不兼容的新版, 导致启动行为不一致、难以复现。
    [string]$DshVersion = '0.1.0-rc.6',

    # 产物输出目录: win-unpacked / NSIS exe / zip 都放在这里。
    # 默认值在 param 之后解析: $PSScriptRoot 在 PS 5.1 相对路径 -File 调用下可能为空。
    [string]$OutDir = '',

    # 缓存目录: Node 压缩包与解压结果存放在此, 重复构建无需重新下载。
    [string]$CacheDir = '',

    # 跳过 electron-builder (NSIS 安装器 + win zip), 只做 npm 构建 + 便携 zip。
    # 用于 CI 上不便下载 NSIS 工具链, 或快速迭代便携包。
    [switch]$SkipInstaller,

    # 只组装便携目录、跳过压缩, 用于快速迭代调试打包脚本本身。
    [switch]$SkipZip,

    # 跳过"已安装则跳过"的快速路径, 强制重新执行运行时 npm install。
    [switch]$Force
)

# =============================================================================
# 解析脚本自身所在目录 (构建脚本的"根目录")。
# 为什么不能只用 $PSScriptRoot: Windows PowerShell 5.1 通过「相对路径 + -File」
# 调用脚本时 (如 `powershell -File build.ps1`), $PSScriptRoot / $PSCommandPath
# 可能为空, 导致 $OutDir 被解析成 "\dist" (写到盘符根目录, 例如 E:\dist)。
# 这里用 $MyInvocation.MyCommand.Path 回退, 并把相对路径补全为绝对路径。
# =============================================================================
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot }
             elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path }
             else { '' }
# 若回退后仍为空 (例如脚本以裸文件名调用、无父目录), 退化为当前工作目录
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
# 相对路径补全为绝对路径
if (-not [System.IO.Path]::IsPathRooted($ScriptDir)) {
    $ScriptDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $ScriptDir))
}

# 补全 param 中依赖脚本目录的默认值 (避免在默认值里直接引用可能为空的 $PSScriptRoot)
if (-not $OutDir)   { $OutDir   = Join-Path $ScriptDir 'release' }
if (-not $CacheDir) { $CacheDir = Join-Path $ScriptDir '.cache' }

# 全局错误策略: 任何未捕获异常立即终止脚本并走统一出口, 避免"吞错后继续"
# 生成一个不完整的包。
$ErrorActionPreference = 'Stop'

# 最终退出码: 0 成功, 1 失败 (供 CI 判断)。安装器步骤失败不致命 —— 便携 zip 是必得产物。
$ExitCode = 0

# 解析 7-Zip 可执行文件路径: 依次检查两个默认安装位置, 最后退回 PATH 中的
# "7z" 命令。返回找到的完整路径。
# 为什么必须用 7z: Compress-Archive 是 .NET 托管实现、单线程且把整个压缩包在内存中
# 组装, 压缩几百 MB 的 node_modules 时极慢甚至卡死; 7z 是原生 C 多线程实现,
# 同样任务快 10~100 倍, 内存占用可忽略。
function Get-7zPath {
    foreach ($candidate in @(
        'C:\Program Files\7-Zip\7z.exe',
        'C:\Program Files (x86)\7-Zip\7z.exe'
    )) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }
    $cmd = Get-Command '7z' -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }
    return $null
}

# ============================================================================
# 统一 7-Zip 压缩入口 (Unicode 安全):
#   进入 outDir → 再进 stageDir → 用 ASCII 临时名压缩顶层内容 → 由 PowerShell
#   cmdlet 重命名为最终文件名。全程传给 7z 的参数都是纯 ASCII, 避免 PS 5.1
#   把含中文参数按 ANSI 代码页编码后 7z 把 zip 写到错误位置。
# ============================================================================
function Invoke-SevenZipZip {
    param(
        [string]$OutDir,
        [string]$StageDirName,
        [string]$ZipPath
    )
    $sevenZip = Get-7zPath
    if (-not $sevenZip) {
        throw "未找到 7-Zip (7z.exe)。本脚本必须用 7-Zip 压缩, 请安装 https://www.7-zip.org/ 后重试。"
    }
    $tmpZipName = 'dsh-portable-tmp.zip'
    Push-Location -LiteralPath $OutDir
    try {
        if (Test-Path -LiteralPath $tmpZipName) {
            Remove-Item -LiteralPath $tmpZipName -Force
        }
        Push-Location -LiteralPath $StageDirName
        try {
            # '*': 压缩暂存目录的顶层内容 (不嵌套一层父目录)
            & $sevenZip a -tzip -mx=1 "..\$tmpZipName" '*'
        } finally {
            Pop-Location
        }
        if ($LASTEXITCODE -ne 0) {
            throw "7-Zip 压缩失败, 退出码: $LASTEXITCODE"
        }
        # PowerShell cmdlet 处理 Unicode 文件名安全
        Move-Item -LiteralPath (Join-Path $OutDir $tmpZipName) -Destination $ZipPath -Force
    } finally {
        Pop-Location
    }
    $item = Get-Item -LiteralPath $ZipPath
    if ($item.Length -eq 0) {
        throw '压缩产物为空, 压缩失败'
    }
}

# ============================================================================
# 手工便携目录组装 (仅当 electron-builder 完全失败、没有 win-unpacked 时兜底):
#   <stage>\                       —— node_modules\electron\dist 的内容 (electron.exe + dll + resources)
#   <stage>\node.exe               —— 便携版 Node (spawn "node" 用)
#   <stage>\resources\app\         —— 应用载荷: package.json + dist + resources + packages
#   <stage>\resources\app\node_modules\ —— 捆绑的 dsh 运行时 (+ koffi)
# ============================================================================
function New-ManualPortableStage {
    param(
        [string]$OutDir,
        [string]$RepoRoot,
        [string]$NodeExe,
        [string]$Version
    )
    $stage = Join-Path $OutDir "dsh-desktop-portable-v$Version"
    if (Test-Path -LiteralPath $stage) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
    $electronDist = Join-Path $RepoRoot 'node_modules\electron\dist'
    if (-not (Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe'))) {
        throw "缺少 electron 发行版: $electronDist (请先 npm install)"
    }
    Copy-Item -LiteralPath $electronDist -Destination $stage -Recurse -Force

    $appDir = Join-Path $stage 'resources\app'
    New-Item -ItemType Directory -Path $appDir -Force | Out-Null
    foreach ($item in @('package.json', 'dist', 'resources', 'packages')) {
        $src = Join-Path $RepoRoot $item
        if (Test-Path -LiteralPath $src) {
            Copy-Item -LiteralPath $src -Destination $appDir -Recurse -Force
        }
    }
    Copy-Item -LiteralPath (Join-Path $RepoRoot 'runtime\node_modules') `
        -Destination (Join-Path $appDir 'node_modules') -Recurse -Force
    Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $stage 'node.exe') -Force
    return $stage
}

# ============================================================================
# 统一错误出口: 整段构建逻辑包在一个 try 中, 任何步骤抛错都会走到这里,
# 以中文信息写入 stderr 并返回退出码 1。各步骤内部再包一层 try/catch,
# 只为把错误信息补充上"是哪个步骤失败"。
# ============================================================================
try {

    # -------------------------------------------------------------------------
    # 步骤 1: 校验前置条件
    # -------------------------------------------------------------------------
    try {
        if ($PSVersionTable.PSVersion -lt [version]'5.1') {
            throw "需要 PowerShell 5.1 或更高版本, 当前版本为 $($PSVersionTable.PSVersion)。请升级后重试。"
        }
        # 系统 node/npm 用于 npm run build (electron-vite 工具链); 缺失时给出明确指引。
        $nodeCmd = Get-Command 'node' -ErrorAction SilentlyContinue
        if (-not $nodeCmd) {
            throw '未找到系统 node/npm, 请先安装 Node.js 22+ 并加入 PATH (用于 npm run build)'
        }
        # 7-Zip 是压缩的硬性要求 (本脚本不使用 Compress-Archive)
        if (-not (Get-7zPath)) {
            throw '未找到 7-Zip (7z.exe)。请安装 https://www.7-zip.org/ 后重试。'
        }
        Write-Host '==> 步骤 1/9  环境检查通过' -ForegroundColor Cyan
    } catch {
        throw "环境检查失败: $($_.Exception.Message)"
    }

    # -------------------------------------------------------------------------
    # 步骤 2: 解析版本号 (参数未指定时从 VERSION 文件读取)
    # -------------------------------------------------------------------------
    try {
        if ([string]::IsNullOrWhiteSpace($Version)) {
            $versionFile = Join-Path $ScriptDir 'VERSION'
            if (-not (Test-Path -LiteralPath $versionFile)) {
                throw "VERSION 文件不存在: $versionFile (且未通过 -Version 参数指定版本号)"
            }
            $Version = (Get-Content -LiteralPath $versionFile -Raw).Trim()
            if ([string]::IsNullOrWhiteSpace($Version)) {
                throw 'VERSION 文件内容为空, 请先写入版本号或使用 -Version 参数'
            }
        }
        # 版本号会进入目录名与文件名, 先排除会破坏路径的字符
        if ($Version -match '[\\/:*?"<>|]') {
            throw "版本号包含非法文件名字符: $Version"
        }
        Write-Host "==> 版本号: $Version (捆绑运行时 @deepseek-ai/dsh@$DshVersion)" -ForegroundColor Cyan
    } catch {
        throw "解析版本号失败: $($_.Exception.Message)"
    }

    # 关键路径提前算好, 后续步骤统一复用, 避免各处拼写不一致。
    $stageName    = 'win-unpacked'
    $unpackedDir  = Join-Path $OutDir $stageName
    $zipPath      = Join-Path $OutDir "dsh-desktop-portable-v$Version.zip"
    $nodeDir      = Join-Path $CacheDir "node-$NodeVersion-win-x64"
    $nodeZip      = Join-Path $CacheDir "node-$NodeVersion-win-x64.zip"
    $nodeExe      = Join-Path $nodeDir 'node.exe'
    $npmCli       = Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js'
    $runtimeDir   = Join-Path $ScriptDir 'runtime'
    $runtimeBin   = Join-Path $runtimeDir 'node_modules\@deepseek-ai\dsh\lib\bin.js'
    $buildDir     = Join-Path $ScriptDir 'build'
    $clientDir    = Join-Path $ScriptDir 'packages\@dsh-desktop\client'
    $pluginsDir   = Join-Path $ScriptDir 'resources\plugins'
    $nshPath      = Join-Path $buildDir 'installer.nsh'

    # -------------------------------------------------------------------------
    # 步骤 3: 准备便携版 Node.js (下载 + 解压, 幂等)
    # -------------------------------------------------------------------------
    try {
        New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null

        if (-not (Test-Path -LiteralPath $nodeExe)) {
            if (-not (Test-Path -LiteralPath $nodeZip)) {
                # PS 5.1 默认只协商 TLS 1.0/1.1, 而 nodejs.org 已拒绝这些旧协议;
                # 不显式启用 TLS 1.2 会直接握手失败, 因此下载前必须先开 TLS 1.2。
                [Net.ServicePointManager]::SecurityProtocol = `
                    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
                $url = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
                Write-Host "==> 步骤 3/9  下载便携版 Node.js: $url"
                # 关闭进度条: PS 5.1 的 Invoke-WebRequest 进度渲染会让大文件下载慢数倍
                $oldProgress = $ProgressPreference
                $ProgressPreference = 'SilentlyContinue'
                try {
                    Invoke-WebRequest -Uri $url -OutFile $nodeZip -UseBasicParsing
                } finally {
                    $ProgressPreference = $oldProgress
                }
                if (-not (Test-Path -LiteralPath $nodeZip)) {
                    throw "下载失败: $url"
                }
            } else {
                Write-Host "==> 步骤 3/9  使用已缓存的 Node.js 压缩包: $nodeZip"
            }

            Write-Host '正在解压便携版 Node.js ...'
            # -Force 允许覆盖不完整的解压残留, 保证 node.exe 一定就位
            Expand-Archive -LiteralPath $nodeZip -DestinationPath $CacheDir -Force
            if (-not (Test-Path -LiteralPath $nodeExe)) {
                throw "解压后未找到 $nodeExe"
            }
        } else {
            Write-Host "==> 步骤 3/9  便携版 Node.js 已就绪: $nodeExe"
        }
    } catch {
        throw "准备便携版 Node.js 失败: $($_.Exception.Message)"
    }

    # -------------------------------------------------------------------------
    # 步骤 4: npm run build —— electron-vite 三段构建 (main/preload/renderer)
    # -------------------------------------------------------------------------
    try {
        Write-Host '==> 步骤 4/9  npm run build (electron-vite) ...'
        Push-Location -LiteralPath $ScriptDir
        try {
            & npm run build
        } finally {
            Pop-Location
        }
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build 失败, 退出码: $LASTEXITCODE"
        }
        # 复查三段产物, 防止构建静默失败后打出空包
        foreach ($rel in @('dist\main\index.js', 'dist\preload\index.mjs', 'dist\renderer\index.html')) {
            if (-not (Test-Path -LiteralPath (Join-Path $ScriptDir $rel))) {
                throw "构建产物缺失: $rel"
            }
        }
        Write-Host '==> 步骤 4/9  electron-vite 构建完成 (dist/main + dist/preload + dist/renderer)'
    } catch {
        throw "npm run build 失败: $($_.Exception.Message)"
    }

    # -------------------------------------------------------------------------
    # 步骤 5: 构建并打包 @dsh-desktop/client 插件 → resources/plugins/*.tgz
    # -------------------------------------------------------------------------
    try {
        Write-Host '==> 步骤 5/9  构建并打包 @dsh-desktop/client 插件 ...'
        if (-not (Test-Path -LiteralPath $clientDir)) {
            throw "客户端插件目录不存在: $clientDir"
        }
        Push-Location -LiteralPath $clientDir
        try {
            & npm run build
        } finally {
            Pop-Location
        }
        if ($LASTEXITCODE -ne 0) {
            throw "client 构建失败, 退出码: $LASTEXITCODE"
        }
        if (-not (Test-Path -LiteralPath (Join-Path $clientDir 'lib\index.js'))) {
            throw 'client 构建后未找到 lib/index.js, 构建可能未生效'
        }
        # 先清掉旧 tgz, 再 npm pack (文件名带版本号, 同版本重复构建会残留旧包)
        New-Item -ItemType Directory -Path $pluginsDir -Force | Out-Null
        Get-ChildItem -LiteralPath $pluginsDir -Filter '*.tgz' -ErrorAction SilentlyContinue |
            Remove-Item -Force
        Push-Location -LiteralPath $clientDir
        try {
            & npm pack --pack-destination $pluginsDir
        } finally {
            Pop-Location
        }
        if ($LASTEXITCODE -ne 0) {
            throw "npm pack 失败, 退出码: $LASTEXITCODE"
        }
        $tgz = Get-ChildItem -LiteralPath $pluginsDir -Filter '*.tgz' | Select-Object -First 1
        if (-not $tgz) {
            throw 'npm pack 后未找到 .tgz 产物'
        }
        Write-Host "  插件打包产物: $($tgz.Name) ($([math]::Round($tgz.Length / 1KB, 1)) KB)"
    } catch {
        throw "打包客户端插件失败: $($_.Exception.Message)"
    }

    # -------------------------------------------------------------------------
    # 步骤 6: 安装捆绑的 DeepSeek Harness 运行时 (便携 npm 自举安装, 固定版本)
    # -------------------------------------------------------------------------
    try {
        # 快速路径 (除非 -Force): runtime 里已有同名 dsh 且入口 bin.js 存在则跳过,
        # 让重复构建从"分钟级"降到"秒级"。
        $needInstall = $Force
        if (-not $needInstall) {
            $rtPkgJson = Join-Path $runtimeDir 'node_modules\@deepseek-ai\dsh\package.json'
            if ((Test-Path -LiteralPath $rtPkgJson) -and (Test-Path -LiteralPath $runtimeBin)) {
                try {
                    $pkgInfo = Get-Content -LiteralPath $rtPkgJson -Raw | ConvertFrom-Json
                    # 版本不匹配 (可能被改过) 也视为需要重装
                    $needInstall = ($pkgInfo.version -ne $DshVersion)
                } catch {
                    $needInstall = $true
                }
            } else {
                $needInstall = $true
            }
        }

        if ($needInstall) {
            Write-Host "==> 步骤 6/9  安装 @deepseek-ai/dsh@$DshVersion (便携版 npm, --prefix runtime) ..."
            if (-not (Test-Path -LiteralPath $npmCli)) {
                throw "未找到便携版 npm: $npmCli"
            }
            New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
            # --prefix 使依赖全部落到 runtime 目录 (electron-builder 的 extraResources 源);
            # --omit=dev 剔除开发依赖, --no-audit / --no-fund 跳过联网审计与赞助提示
            & $nodeExe $npmCli install --prefix $runtimeDir "@deepseek-ai/dsh@$DshVersion" --omit=dev --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) {
                throw "npm install 失败, 退出码: $LASTEXITCODE"
            }
        } else {
            Write-Host "==> 步骤 6/9  @deepseek-ai/dsh@$DshVersion 已安装, 跳过安装 (-Force 可强制重装)"
        }

        # 安装完成后复查关键文件, 防止 npm 静默失败导致打出空包
        if (-not (Test-Path -LiteralPath $runtimeBin)) {
            throw '安装后未找到 node_modules/@deepseek-ai/dsh/lib/bin.js, 安装可能未生效'
        }
    } catch {
        throw "安装 @deepseek-ai/dsh 失败: $($_.Exception.Message)"
    }

    # -------------------------------------------------------------------------
    # 步骤 7: electron-builder --win nsis zip (安装器 + win zip)
    # 失败不致命: 便携 zip 是必得产物, 失败时仅告警并继续。
    # -------------------------------------------------------------------------
    if (-not $SkipInstaller) {
        try {
            Write-Host '==> 步骤 7/9  electron-builder --win nsis zip (首次运行需下载 NSIS 工具链, 可能较慢) ...'

            # 生成 installer.nsh: 把便携版 node.exe 放进安装目录, 使桌面应用 spawn 的
            # "node" 可被 CreateProcess 从 exe 所在目录解析到。NSIS 编译期读取, 为避免
            # 中文路径经 makensis 编码出错, 先把 node.exe 复制到纯 ASCII 的 %TEMP% 路径,
            # 再以绝对路径写进 nsh (脚本内容保持纯 ASCII)。
            $asciiNodeDir = Join-Path $env:TEMP 'dsh-build'
            New-Item -ItemType Directory -Path $asciiNodeDir -Force | Out-Null
            $asciiNodeExe = Join-Path $asciiNodeDir 'node.exe'
            Copy-Item -LiteralPath $nodeExe -Destination $asciiNodeExe -Force

            New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
            $nsh = @(
                '# 由 build.ps1 自动生成 (T17): 把便携版 node.exe 放入安装目录。',
                '# 桌面应用 spawn "node" 时, Windows CreateProcess 会先搜索 exe 所在目录。',
                '!macro customInstall',
                ("  File `"" + $asciiNodeExe + "`""),
                '!macroend'
            )
            Set-Content -LiteralPath $nshPath -Value $nsh -Encoding UTF8

            # 直接以系统 node 运行 electron-builder 的 CLI (配置自动读取 electron-builder.yml)
            $ebCli = Join-Path $ScriptDir 'node_modules\electron-builder\cli.js'
            if (-not (Test-Path -LiteralPath $ebCli)) {
                throw "未找到 electron-builder CLI: $ebCli (请先 npm install)"
            }
            & $nodeCmd.Source $ebCli --win nsis zip
            if ($LASTEXITCODE -ne 0) {
                throw "electron-builder 失败, 退出码: $LASTEXITCODE"
            }
            Write-Host '==> 步骤 7/9  electron-builder 完成 (NSIS 安装器 + win zip)'
        } catch {
            Write-Host "警告: electron-builder 步骤失败(不影响便携 zip): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    } else {
        Write-Host '==> 步骤 7/9  已跳过 electron-builder (-SkipInstaller)' -ForegroundColor Yellow
    }

    # -------------------------------------------------------------------------
    # 步骤 8: 组装便携目录 (win-unpacked 优先, 否则手工兜底), 注入 node.exe
    # -------------------------------------------------------------------------
    try {
        $portableSource = $null
        if (Test-Path -LiteralPath $unpackedDir) {
            # electron-builder 的 win-unpacked: dsh-desktop.exe + resources/ (含
            # app.asar、app.asar.unpacked、捆绑运行时的真实文件) —— 这就是便携目录。
            Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $unpackedDir 'node.exe') -Force
            $portableSource = $stageName
            Write-Host '==> 步骤 8/9  node.exe 已注入 win-unpacked'
        } else {
            Write-Host '警告: 未找到 win-unpacked (electron-builder 未成功), 转用手工便携组装' -ForegroundColor Yellow
            $manualStage = New-ManualPortableStage -OutDir $OutDir -RepoRoot $ScriptDir `
                -NodeExe $nodeExe -Version $Version
            $portableSource = Split-Path -Leaf $manualStage
            Write-Host "==> 步骤 8/9  手工便携目录已组装: $manualStage"
        }
        if (-not $portableSource) {
            throw '便携目录组装失败: 既无 win-unpacked 也无法手工组装'
        }
    } catch {
        throw "组装便携目录失败: $($_.Exception.Message)"
    }

    # -------------------------------------------------------------------------
    # 步骤 9: 压缩为便携 zip (7-Zip, -SkipZip 时跳过)
    # -------------------------------------------------------------------------
    if (-not $SkipZip) {
        try {
            # 先删旧包: 同版本重复构建时若不清除, 会残留旧内容、产生损坏的 zip
            if (Test-Path -LiteralPath $zipPath) {
                Remove-Item -LiteralPath $zipPath -Force
            }
            Write-Host "==> 步骤 9/9  正在压缩便携包: $zipPath"
            Invoke-SevenZipZip -OutDir $OutDir -StageDirName $portableSource -ZipPath $zipPath
        } catch {
            throw "压缩失败: $($_.Exception.Message)"
        }
    }

    # -------------------------------------------------------------------------
    # 汇总: 输出全部产物与大小
    # -------------------------------------------------------------------------
    try {
        Write-Host ''
        Write-Host '============================================================' -ForegroundColor Green
        Write-Host "  构建完成: dsh-desktop v$Version" -ForegroundColor Green
        Write-Host '------------------------------------------------------------' -ForegroundColor Green
        $all = @()
        if (Test-Path -LiteralPath $zipPath) {
            $all += [pscustomobject]@{ Path = $zipPath; SizeMB = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2) }
        }
        Get-ChildItem -LiteralPath $OutDir -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -in @('.exe', '.zip') -and $_.Name -ne (Split-Path -Leaf $zipPath) } |
            ForEach-Object {
                $all += [pscustomobject]@{ Path = $_.FullName; SizeMB = [math]::Round($_.Length / 1MB, 2) }
            }
        if (Test-Path -LiteralPath $unpackedDir) {
            $unpackedSizeMB = [math]::Round(((Get-ChildItem -LiteralPath $unpackedDir -Recurse -File | Measure-Object -Property Length -Sum).Sum) / 1MB, 2)
            $all += [pscustomobject]@{ Path = $unpackedDir; SizeMB = $unpackedSizeMB }
        }
        foreach ($a in $all) {
            Write-Host ("  {0,-68} {1,10} MB" -f $a.Path, $a.SizeMB) -ForegroundColor Green
        }
        Write-Host '============================================================' -ForegroundColor Green
        Write-Host '  便携包: 解压后双击 dsh-desktop.exe 即可使用。' -ForegroundColor Green
        Write-Host '  安装器: 双击 Setup exe 安装到 %LOCALAPPDATA%\Programs。' -ForegroundColor Green
    } catch {
        Write-Host "警告: 生成汇总信息失败: $($_.Exception.Message)" -ForegroundColor Yellow
    }

}
catch {
    # 统一错误出口: 中文错误写入 stderr, 退出码 1
    $errMsg = "【构建失败】$($_.Exception.Message)"
    $host.UI.WriteErrorLine($errMsg)
    Write-Host $errMsg -ForegroundColor Red
    $ExitCode = 1
}

exit $ExitCode
