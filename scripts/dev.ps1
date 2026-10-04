# Windows task runner mirroring the Makefile:  .\scripts\dev.ps1 <target> [args...]
param([Parameter(Position = 0)][string]$Target = "help", [Parameter(ValueFromRemainingArguments = $true)]$Rest)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\env.ps1"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Uv { & uv --project engine @args; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
function Bd { Uv run brokedate @args }
function Web { Push-Location web; try { & pnpm @args; if ($LASTEXITCODE) { exit $LASTEXITCODE } } finally { Pop-Location } }

switch ($Target) {
    "setup" {
        Uv sync
        Copy-Item scripts/hooks/pre-commit .git/hooks/pre-commit -Force
        if (Test-Path web/package.json) { Web install }
    }
    "sim" { Uv run python scripts/simulate_statement.py --seed 13 --out data/sim }
    "sim-today" {
        # live mode: same persona, statement extended through yesterday so the app starts from today's date.
        # Written to the private data dir (changes daily, never committed); history before BASE_END is unchanged.
        $out = Join-Path $env:BROKEDATE_DATA_DIR "sim-live"
        $y = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
        Uv run python scripts/simulate_statement.py --seed 13 --out $out --end $y
        Bd import (Join-Path $out "statement.csv") -s sim --confirm-anchors
    }
    "lint" { Uv run ruff check engine scripts; Uv run ruff format --check engine scripts/hooks }
    "fmt" { Uv run ruff format engine scripts/hooks; Uv run ruff check --fix engine scripts/hooks }
    "types" { Uv run mypy --config-file engine/pyproject.toml engine/brokedate }
    "test" { Uv run pytest engine/tests @Rest }
    "offline" { Uv run pytest engine/tests --disable-socket --allow-hosts=127.0.0.1,localhost,::1 @Rest }
    "check" {
        Uv run ruff check engine scripts
        Uv run mypy --config-file engine/pyproject.toml engine/brokedate
        Uv run pytest engine/tests -m "not slow and not ollama" --disable-socket --allow-hosts=127.0.0.1,localhost,::1
        if (Test-Path web/package.json) { Web run typecheck; Web run test }
    }
    "engine" { Bd serve @Rest }
    "ollama" {
        # local Gemma server: loopback only; models, keys and cache all under D:\devtools\ollama (nothing on C:)
        $env:USERPROFILE = "D:\devtools\ollama\home"; $env:HOME = $env:USERPROFILE
        $env:OLLAMA_HOST = "127.0.0.1:11434"
        # never more than one model or one request in RAM at a time; unload after 5 idle minutes
        $env:OLLAMA_MAX_LOADED_MODELS = "1"; $env:OLLAMA_NUM_PARALLEL = "1"; $env:OLLAMA_KEEP_ALIVE = "5m"
        New-Item -ItemType Directory -Force $env:USERPROFILE, $env:OLLAMA_MODELS | Out-Null
        if ($Rest) { & ollama @Rest } else { & ollama serve }
    }
    "web" { Web run dev }
    "demo" { Bd export-demo @Rest; Web run build:demo }
    "pocket" { Bd export-pocket @Rest }
    "bench" { Bd bench @Rest }
    "backtest" { Bd backtest @Rest }
    "post-numbers" { Bd post-numbers @Rest }
    default { "targets: setup sim lint fmt types test offline check engine web demo pocket bench backtest post-numbers" }
}
