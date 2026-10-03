# Dot-source before working on Windows:  . .\scripts\env.ps1
# Keeps every cache, model, temp file and private data dir off C: (local machine policy).
$tools = if ($env:BROKEDATE_TOOLS) { $env:BROKEDATE_TOOLS } else { "D:\devtools" }
$repo = Split-Path -Parent $PSScriptRoot

$env:UV_CACHE_DIR = "$tools\uv-cache"
$env:UV_PYTHON_INSTALL_DIR = "$tools\uv-python"
$env:UV_PYTHON_PREFERENCE = "only-managed"
$env:UV_PYTHON_BIN_DIR = "$tools\uv-python\bin"
$env:UV_TOOL_DIR = "$tools\uv-tools"
$env:UV_TOOL_BIN_DIR = "$tools\uv-tools\bin"
$env:UV_NO_MODIFY_PATH = "1"
$env:HF_HOME = "$tools\hf"
$env:TABPFN_MODEL_CACHE_DIR = "$tools\tabpfn"
$env:TABPFN_NO_BROWSER = "1"
$env:TORCH_HOME = "$tools\torch"
$env:PLAYWRIGHT_BROWSERS_PATH = "$tools\ms-playwright"
$env:OLLAMA_MODELS = "$tools\ollama-models"
$env:npm_config_cache = "$tools\npm-cache"
$env:npm_config_store_dir = "$tools\pnpm-store"
$env:TEMP = "$tools\tmp"
$env:TMP = "$tools\tmp"
if (-not $env:BROKEDATE_DATA_DIR) { $env:BROKEDATE_DATA_DIR = Join-Path (Split-Path -Parent $repo) "brokedate-private" }

foreach ($d in @("$tools\uv", "$tools\entire", "$tools\ollama")) {
    if ((Test-Path $d) -and ($env:PATH -notlike "*$d*")) { $env:PATH = "$d;$env:PATH" }
}
