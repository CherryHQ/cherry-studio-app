<#
.SYNOPSIS
    Upgrade Ninja build tool to fix Windows long path issues in Expo/React Native Android builds.

.DESCRIPTION
    This script automatically downloads and replaces the Ninja build tool in Android SDK's CMake
    installations to fix the "Filename longer than 260 characters" error that occurs during
    Android builds on Windows.

    The issue is caused by Ninja < 1.12 not supporting Windows long paths. This script upgrades
    Ninja to 1.12.1+ which includes proper long path support.

.PARAMETER NinjaVersion
    The version of Ninja to install. Default: 1.12.1

.PARAMETER AndroidSdkPath
    Custom path to Android SDK. If not specified, the script will auto-detect from environment
    variables (ANDROID_HOME, ANDROID_SDK_ROOT) or common installation locations.

.PARAMETER Force
    Skip confirmation prompts and force upgrade even if current version is already >= target version.

.PARAMETER Restore
    Restore the original ninja.exe from backup (ninja.exe.bak).

.EXAMPLE
    .\upgrade-ninja.ps1
    # Auto-detect Android SDK and upgrade Ninja to 1.12.1

.EXAMPLE
    .\upgrade-ninja.ps1 -NinjaVersion "1.12.1" -AndroidSdkPath "D:\Android\Sdk"
    # Use custom Android SDK path

.EXAMPLE
    .\upgrade-ninja.ps1 -Restore
    # Restore original ninja.exe from backup

.NOTES
    Author: Cherry Studio
    Repository: https://github.com/anthropics/cherry-studio-app
    Related Issue: https://github.com/expo/expo/issues/36274
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$NinjaVersion = "1.12.1",

    [Parameter(Mandatory = $false)]
    [string]$AndroidSdkPath,

    [Parameter(Mandatory = $false)]
    [switch]$Force,

    [Parameter(Mandatory = $false)]
    [switch]$Restore
)

$ErrorActionPreference = "Stop"

# Minimum ninja version that supports long paths
$MinRequiredVersion = [version]"1.12.0"

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Get-AndroidSdkPath {
    param([string]$CustomPath)

    # If custom path provided, use it
    if ($CustomPath -and (Test-Path $CustomPath)) {
        return $CustomPath
    }

    # Common Android SDK locations (ordered by priority)
    $possiblePaths = @(
        # Environment variables (most reliable)
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        $env:ANDROID_SDK,
        # Windows default locations
        "$env:LOCALAPPDATA\Android\Sdk",
        "$env:USERPROFILE\AppData\Local\Android\Sdk",
        # Android Studio default locations
        "$env:PROGRAMFILES\Android\Sdk",
        "${env:PROGRAMFILES(x86)}\Android\Sdk",
        # Common custom locations
        "C:\Android\Sdk",
        "D:\Android\Sdk",
        "E:\Android\Sdk",
        # Chocolatey installation
        "C:\tools\android-sdk"
    ) | Where-Object { $_ -and $_.Trim() -ne "" }

    foreach ($path in $possiblePaths) {
        $cmakePath = Join-Path $path "cmake"
        if (Test-Path $cmakePath) {
            return $path
        }
    }

    return $null
}

function Get-CmakeInstallations {
    param([string]$SdkPath)

    $cmakePath = Join-Path $SdkPath "cmake"

    if (-not (Test-Path $cmakePath)) {
        return @()
    }

    return Get-ChildItem -Path $cmakePath -Directory | Where-Object {
        Test-Path (Join-Path $_.FullName "bin\ninja.exe")
    }
}

function Get-NinjaVersion {
    param([string]$NinjaPath)

    try {
        $versionOutput = & $NinjaPath --version 2>$null
        if ($versionOutput -match "(\d+\.\d+\.\d+)") {
            return [version]$Matches[1]
        }
    } catch {
        # Ignore errors
    }
    return $null
}

function Test-NinjaUpgradeNeeded {
    param([version]$CurrentVersion)

    if (-not $CurrentVersion) {
        return $true
    }
    return $CurrentVersion -lt $MinRequiredVersion
}

function Restore-OriginalNinja {
    param([array]$CmakeVersions)

    $restoredCount = 0

    foreach ($ver in $CmakeVersions) {
        $ninjaPath = Join-Path $ver.FullName "bin\ninja.exe"
        $backupPath = Join-Path $ver.FullName "bin\ninja.exe.bak"

        if (Test-Path $backupPath) {
            Write-ColorOutput "  Restoring cmake $($ver.Name)..." "Cyan"
            Copy-Item $backupPath $ninjaPath -Force
            $restoredVersion = Get-NinjaVersion $ninjaPath
            Write-ColorOutput "    Restored to ninja $restoredVersion" "Green"
            $restoredCount++
        } else {
            Write-ColorOutput "  cmake $($ver.Name): No backup found" "Yellow"
        }
    }

    return $restoredCount
}

# ============================================
# Main Script
# ============================================

Write-ColorOutput "`n========================================" "Cyan"
Write-ColorOutput "  Ninja Upgrade Tool for Expo Android  " "Cyan"
Write-ColorOutput "========================================`n" "Cyan"

# Find Android SDK
Write-ColorOutput "Searching for Android SDK..." "Yellow"
$sdkPath = Get-AndroidSdkPath -CustomPath $AndroidSdkPath

if (-not $sdkPath) {
    Write-ColorOutput "Error: Could not find Android SDK" "Red"
    Write-ColorOutput "`nPlease either:" "White"
    Write-ColorOutput "  1. Set ANDROID_HOME or ANDROID_SDK_ROOT environment variable" "Gray"
    Write-ColorOutput "  2. Use -AndroidSdkPath parameter to specify the SDK location" "Gray"
    Write-ColorOutput "`nExample: .\upgrade-ninja.ps1 -AndroidSdkPath 'C:\Android\Sdk'" "Gray"
    exit 1
}

Write-ColorOutput "Found Android SDK: $sdkPath" "Green"

# Find CMake installations
$cmakeVersions = Get-CmakeInstallations -SdkPath $sdkPath

if ($cmakeVersions.Count -eq 0) {
    Write-ColorOutput "Error: No CMake installations with ninja.exe found in SDK" "Red"
    Write-ColorOutput "CMake path checked: $(Join-Path $sdkPath 'cmake')" "Gray"
    exit 1
}

# Display current status
Write-ColorOutput "`nFound CMake installations:" "Cyan"
$needsUpgrade = $false

foreach ($ver in $cmakeVersions) {
    $ninjaPath = Join-Path $ver.FullName "bin\ninja.exe"
    $currentVersion = Get-NinjaVersion $ninjaPath
    $status = if (Test-NinjaUpgradeNeeded $currentVersion) {
        $needsUpgrade = $true
        "[NEEDS UPGRADE]"
    } else {
        "[OK]"
    }
    $statusColor = if ($status -eq "[OK]") { "Green" } else { "Yellow" }
    Write-ColorOutput "  - cmake $($ver.Name): ninja $currentVersion $status" $statusColor
}

# Handle restore mode
if ($Restore) {
    Write-ColorOutput "`nRestoring original ninja.exe from backups..." "Yellow"
    $restoredCount = Restore-OriginalNinja -CmakeVersions $cmakeVersions
    if ($restoredCount -gt 0) {
        Write-ColorOutput "`nRestored $restoredCount installation(s)" "Green"
    } else {
        Write-ColorOutput "`nNo backups found to restore" "Yellow"
    }
    exit 0
}

# Check if upgrade is needed
if (-not $needsUpgrade -and -not $Force) {
    Write-ColorOutput "`nAll Ninja installations are already >= $MinRequiredVersion" "Green"
    Write-ColorOutput "No upgrade needed. Use -Force to upgrade anyway." "Gray"
    exit 0
}

# Confirm upgrade
if (-not $Force) {
    Write-ColorOutput "`nThis will upgrade Ninja to version $NinjaVersion" "Yellow"
    $confirm = Read-Host "Continue? (Y/n)"
    if ($confirm -and $confirm.ToLower() -ne "y") {
        Write-ColorOutput "Upgrade cancelled" "Yellow"
        exit 0
    }
}

# Download Ninja
$tempDir = Join-Path $env:TEMP "ninja-upgrade-$(Get-Date -Format 'yyyyMMddHHmmss')"
$ninjaUrl = "https://github.com/ninja-build/ninja/releases/download/v$NinjaVersion/ninja-win.zip"
$zipFile = Join-Path $tempDir "ninja-win.zip"

Write-ColorOutput "`nDownloading Ninja $NinjaVersion..." "Yellow"
Write-ColorOutput "  URL: $ninjaUrl" "Gray"

try {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    # Set TLS 1.2 for GitHub
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # Download with progress
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $ninjaUrl -OutFile $zipFile -UseBasicParsing

    Write-ColorOutput "  Download complete!" "Green"
} catch {
    Write-ColorOutput "Error downloading Ninja: $_" "Red"
    Write-ColorOutput "`nPlease check your internet connection or download manually from:" "Yellow"
    Write-ColorOutput "  $ninjaUrl" "Gray"
    exit 1
}

# Extract Ninja
Write-ColorOutput "`nExtracting..." "Yellow"
try {
    Expand-Archive -Path $zipFile -DestinationPath $tempDir -Force
} catch {
    Write-ColorOutput "Error extracting archive: $_" "Red"
    exit 1
}

$newNinja = Join-Path $tempDir "ninja.exe"
if (-not (Test-Path $newNinja)) {
    Write-ColorOutput "Error: ninja.exe not found in downloaded archive" "Red"
    exit 1
}

# Verify downloaded version
$downloadedVersion = Get-NinjaVersion $newNinja
Write-ColorOutput "  Downloaded ninja version: $downloadedVersion" "Green"

# Replace Ninja in each CMake installation
Write-ColorOutput "`nUpgrading Ninja in CMake installations..." "Yellow"
$upgradedCount = 0

foreach ($ver in $cmakeVersions) {
    $ninjaPath = Join-Path $ver.FullName "bin\ninja.exe"
    $backupPath = Join-Path $ver.FullName "bin\ninja.exe.bak"

    Write-ColorOutput "  Processing cmake $($ver.Name)..." "Cyan"

    try {
        # Backup original (only if no backup exists or if current is different from backup)
        if (Test-Path $ninjaPath) {
            if (-not (Test-Path $backupPath)) {
                Copy-Item $ninjaPath $backupPath
                Write-ColorOutput "    Created backup: ninja.exe.bak" "Gray"
            } else {
                Write-ColorOutput "    Backup already exists" "Gray"
            }
        }

        # Copy new ninja
        Copy-Item $newNinja $ninjaPath -Force

        # Verify installation
        $installedVersion = Get-NinjaVersion $ninjaPath
        Write-ColorOutput "    Upgraded to ninja $installedVersion" "Green"
        $upgradedCount++
    } catch {
        Write-ColorOutput "    Error: $_" "Red"
    }
}

# Cleanup
Write-ColorOutput "`nCleaning up temporary files..." "Yellow"
try {
    Remove-Item -Path $tempDir -Recurse -Force
} catch {
    Write-ColorOutput "  Warning: Could not remove temp directory: $tempDir" "Yellow"
}

# Summary
Write-ColorOutput "`n========================================" "Cyan"
Write-ColorOutput "  Upgrade Complete!" "Green"
Write-ColorOutput "========================================" "Cyan"
Write-ColorOutput "`nSummary:" "White"
Write-ColorOutput "  - Upgraded: $upgradedCount installation(s)" "Green"
Write-ColorOutput "  - Ninja version: $downloadedVersion" "Green"
Write-ColorOutput "`nNext steps:" "Yellow"
Write-ColorOutput "  1. Clean previous build cache (recommended):" "White"
Write-ColorOutput "     Remove-Item -Recurse -Force android\.cxx, android\app\.cxx, android\.gradle" "Gray"
Write-ColorOutput "  2. Run your build:" "White"
Write-ColorOutput "     npx expo run:android" "Gray"
Write-ColorOutput "`nTo restore original ninja:" "Yellow"
Write-ColorOutput "  .\upgrade-ninja.ps1 -Restore" "Gray"
