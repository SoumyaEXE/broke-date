"""Configuration: one TOML file, every tunable in one place (SPEC 20)."""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLE_CONFIG = REPO_ROOT / "config" / "brokedate.example.toml"


@dataclass
class ForecastCfg:
    broke_line_rupees: int = 150
    risk_tolerance: float = 0.10
    n_futures: int = 500
    n_futures_interactive: int = 250
    seed: int = 20261002
    quantile_grid: int = 99
    anchor_to_direct_model: bool = True
    calibration_k_min: float = 0.7
    calibration_k_max: float = 1.6
    safe_spend_precision_rupees: int = 10
    runway_extension_days: int = 21


@dataclass
class TabPFNCfg:
    device: str = "cpu"
    n_estimators: int = 2
    model_version: str = "v2"
    fit_mode: str = "fit_with_cache"
    lattice_bal_points: int = 11
    lattice_s3_points: int = 3
    lattice_s14_points: int = 4
    # TabPFN categorizer stage between the regex rules and Gemma (enrich/tabpfn_cat.py)
    classifier: bool = True
    classifier_min_prob: float = 0.6
    classifier_min_train: int = 40


@dataclass
class GemmaCfg:
    enabled: bool = True
    model: str = "gemma3:1b"  # lightest by default; heavier only by choice and only when RAM is free
    ollama_url: str = "http://127.0.0.1:11434"
    batch_size: int = 20
    temperature: float = 0.0
    confidence_threshold: float = 0.6
    letter_language: str = "English"
    letter_max_attempts: int = 3
    # chat replies: "auto" picks gemma3:4b when RAM allows and it is installed, else gemma3:1b (low-end laptops)
    chat_model: str = "auto"
    timeout_s: float = 240.0


@dataclass
class SubjectCfg:
    anchor_mode: str = "allowance"
    anchor_sender_pattern: str = ""
    irregular_min_income_rupees: int = 0
    exams: list[list[str]] = field(default_factory=list)


@dataclass
class EvalCfg:
    stride_days: int = 2
    n_futures_eval: int = 200
    bootstrap_reps: int = 2000
    min_history_days: int = 60


@dataclass
class Config:
    timezone: str = "Asia/Kolkata"
    data_dir: Path = Path.home() / ".brokedate"
    festivals_file: Path = REPO_ROOT / "config" / "festivals_kolkata.toml"
    forecast: ForecastCfg = field(default_factory=ForecastCfg)
    tabpfn: TabPFNCfg = field(default_factory=TabPFNCfg)
    gemma: GemmaCfg = field(default_factory=GemmaCfg)
    eval: EvalCfg = field(default_factory=EvalCfg)
    subjects: dict[str, SubjectCfg] = field(default_factory=dict)

    @property
    def broke_line_paise(self) -> int:
        return self.forecast.broke_line_rupees * 100

    def subject(self, name: str) -> SubjectCfg:
        return self.subjects.get(name, SubjectCfg())

    @property
    def db_path(self) -> Path:
        return self.data_dir / "brokedate.sqlite"


def _fill(obj: Any, values: dict[str, Any]) -> None:
    for k, v in values.items():
        if hasattr(obj, k):
            setattr(obj, k, v)


def load_config(path: Path | None = None) -> Config:
    """Load config. Order: explicit path, $BROKEDATE_CONFIG, <data_dir>/config.toml, example config."""
    cfg = Config()
    candidates = [path, Path(p) if (p := os.environ.get("BROKEDATE_CONFIG")) else None]
    data_dir_env = os.environ.get("BROKEDATE_DATA_DIR")
    if data_dir_env:
        candidates.append(Path(data_dir_env) / "config.toml")
    candidates.append(EXAMPLE_CONFIG)
    raw: dict[str, Any] = {}
    for c in candidates:
        if c is not None and c.is_file():
            raw = tomllib.loads(c.read_text(encoding="utf-8"))
            break
    g = raw.get("general", {})
    cfg.timezone = g.get("timezone", cfg.timezone)
    if "data_dir" in g:
        cfg.data_dir = Path(os.path.expanduser(g["data_dir"]))
    _fill(cfg.forecast, raw.get("forecast", {}))
    _fill(cfg.tabpfn, raw.get("tabpfn", {}))
    _fill(cfg.gemma, raw.get("gemma", {}))
    _fill(cfg.eval, raw.get("eval", {}))
    fest = raw.get("calendar", {}).get("festivals_file")
    if fest:
        fp = Path(str(fest))
        cfg.festivals_file = fp if fp.is_absolute() else REPO_ROOT / fp
    for name, vals in raw.get("subject", {}).items():
        sc = SubjectCfg()
        _fill(sc, vals)
        cfg.subjects[name] = sc
    if data_dir_env:
        cfg.data_dir = Path(data_dir_env)
    if os.environ.get("BROKEDATE_GEMMA") == "0":
        cfg.gemma.enabled = False
    if os.environ.get("BROKEDATE_TABPFN_CAT") == "0":
        cfg.tabpfn.classifier = False
    return cfg
