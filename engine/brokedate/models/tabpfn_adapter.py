"""The ONLY module that imports tabpfn (SPEC 9.1). Verified against tabpfn 9.1.0 (docs/NOTES.md)."""

from __future__ import annotations

import logging
import os
import time
import warnings
from typing import Any

import numpy as np

log = logging.getLogger(__name__)

QS = np.linspace(0.01, 0.99, 99)


class DistRegressor:
    """Distributional regressor interface: fit, then quantiles(X, qs) -> (n, len(qs)), monotone in q."""

    name = "base"
    version = ""

    def fit(self, X: np.ndarray, y: np.ndarray) -> DistRegressor:
        raise NotImplementedError

    def quantiles(self, X: np.ndarray, qs: np.ndarray) -> np.ndarray:
        raise NotImplementedError

    def exceed_prob(self, X: np.ndarray, y: np.ndarray) -> np.ndarray:
        """P(Y > y) per row. Default: read off 99 quantiles, so it cannot see past the 1st/99th (0 beyond them)."""
        Q = self.quantiles(X, QS)
        return np.array([1.0 - float(np.interp(v, q, QS, left=0.0, right=1.0)) for v, q in zip(y, Q, strict=True)])


class TabPFNDist(DistRegressor):
    name = "tabpfn"

    def __init__(self, n_estimators: int = 2, model_version: str = "v2", fit_mode: str = "fit_with_cache",
                 device: str = "cpu", seed: int = 0) -> None:
        self.n_estimators = n_estimators
        self.model_version = model_version
        self.fit_mode = fit_mode
        self.device = device
        self.seed = seed
        self._m: Any = None
        self.fit_seconds = 0.0
        self.predict_seconds = 0.0
        self.predict_rows = 0

    @property
    def version(self) -> str:  # type: ignore[override]
        import tabpfn

        return f"tabpfn {getattr(tabpfn, '__version__', '?')} model {self.model_version}"

    def fit(self, X: np.ndarray, y: np.ndarray) -> TabPFNDist:
        os.environ.setdefault("TABPFN_NO_BROWSER", "1")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            from tabpfn import TabPFNRegressor
            from tabpfn.constants import ModelVersion

            self._m = TabPFNRegressor.create_default_for_version(
                ModelVersion(self.model_version), device=self.device, n_estimators=self.n_estimators,
                fit_mode=self.fit_mode, random_state=self.seed,
            )
            t = time.perf_counter()
            self._m.fit(np.asarray(X, dtype=np.float32), np.asarray(y, dtype=np.float32))
            self.fit_seconds = time.perf_counter() - t
        return self

    def quantiles(self, X: np.ndarray, qs: np.ndarray, batch: int = 2000) -> np.ndarray:
        if self._m is None:
            raise RuntimeError("fit first")
        out = []
        t = time.perf_counter()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            for s in range(0, len(X), batch):
                res = self._m.predict(np.asarray(X[s:s + batch], dtype=np.float32), output_type="quantiles",
                                      quantiles=[float(q) for q in qs])
                out.append(np.stack([np.asarray(r, dtype=float) for r in res], axis=1))
        self.predict_seconds += time.perf_counter() - t
        self.predict_rows += len(X)
        Q = np.concatenate(out, axis=0) if out else np.zeros((0, len(qs)))
        return np.maximum.accumulate(Q, axis=1)

    def exceed_prob(self, X: np.ndarray, y: np.ndarray, batch: int = 2000) -> np.ndarray:
        """Exact P(Y > y) from TabPFN's full predicted distribution (predict(output_type="full") -> criterion.cdf).
        Unlike 99 quantiles, this includes the distribution's half-normal tails, so a 1-in-100 and a 1-in-10,000
        value are told apart. y is in the same space the model was fit on."""
        if self._m is None:
            raise RuntimeError("fit first")
        import torch

        out = []
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            for s in range(0, len(X), batch):
                res = self._m.predict(np.asarray(X[s:s + batch], dtype=np.float32), output_type="full")
                logits = res["logits"]
                ys = torch.as_tensor(np.asarray(y[s:s + batch], dtype=np.float64), dtype=logits.dtype).reshape(-1, 1)
                cdf = res["criterion"].cdf(logits, ys.to(logits.device))
                out.append(1.0 - cdf.detach().cpu().numpy().reshape(-1))
        return np.clip(np.concatenate(out), 0.0, 1.0) if out else np.zeros(0)

    def embed(self, X: np.ndarray) -> np.ndarray:
        """TabPFN's own representation of each row (get_embeddings, test tokens), averaged over estimators.
        Used only by scripts/experiment_similar_embeddings.py (a negative result: not used by the app)."""
        if self._m is None:
            raise RuntimeError("fit first")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            E = np.asarray(self._m.get_embeddings(np.asarray(X, dtype=np.float32), data_source="test"), dtype=float)
        return E.mean(axis=0) if E.ndim == 3 else E


class LGBMQuantileDist(DistRegressor):
    """B3 baseline: one LightGBM per quantile, fixed (pre-registered) hyperparameters."""

    name = "lightgbm"

    def __init__(self, qs: np.ndarray | None = None, n_estimators: int = 200, learning_rate: float = 0.05,
                 num_leaves: int = 15, min_data_in_leaf: int = 10, seed: int = 0) -> None:
        self.grid = np.round(np.arange(0.1, 0.91, 0.1), 2) if qs is None else qs
        self.params: dict[str, Any] = dict(n_estimators=n_estimators, learning_rate=learning_rate, num_leaves=num_leaves,
                           min_child_samples=min_data_in_leaf, random_state=seed, verbose=-1)
        self.models: list[Any] = []

    @property
    def version(self) -> str:  # type: ignore[override]
        import lightgbm

        return f"lightgbm {lightgbm.__version__}"

    def fit(self, X: np.ndarray, y: np.ndarray) -> LGBMQuantileDist:
        import lightgbm as lgb

        self.models = []
        for q in self.grid:
            m = lgb.LGBMRegressor(objective="quantile", alpha=float(q), **self.params)
            m.fit(X, y)
            self.models.append(m)
        return self

    def quantiles(self, X: np.ndarray, qs: np.ndarray) -> np.ndarray:
        own = np.stack([m.predict(X) for m in self.models], axis=1)
        own = np.maximum.accumulate(np.maximum(own, 0), axis=1)
        # map own grid -> requested qs (flat extrapolation at the ends)
        return np.stack([np.interp(qs, self.grid, row) for row in own], axis=0)


class TabPFNClf:
    """TabPFN classifier (categorizer stage). fit(X, labels) then proba(X) -> (n, k) aligned with .classes_."""

    def __init__(self, n_estimators: int = 2, model_version: str = "v2", device: str = "cpu", seed: int = 0) -> None:
        self.n_estimators, self.model_version, self.device, self.seed = n_estimators, model_version, device, seed
        self._m: Any = None
        self.classes_: np.ndarray = np.array([])

    def fit(self, X: np.ndarray, labels: np.ndarray) -> TabPFNClf:
        os.environ.setdefault("TABPFN_NO_BROWSER", "1")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            from tabpfn import TabPFNClassifier
            from tabpfn.constants import ModelVersion

            self._m = TabPFNClassifier.create_default_for_version(
                ModelVersion(self.model_version), device=self.device, n_estimators=self.n_estimators,
                random_state=self.seed)
            # encode labels ourselves: columns of predict_proba are then exactly codes 0..k-1 -> self.classes_
            self.classes_, codes = np.unique(np.asarray(labels).astype(str), return_inverse=True)
            self._m.fit(np.asarray(X, dtype=np.float32), codes.astype(np.int64))
        return self

    def proba(self, X: np.ndarray) -> np.ndarray:
        if self._m is None:
            raise RuntimeError("fit first")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return np.asarray(self._m.predict_proba(np.asarray(X, dtype=np.float32)), dtype=float)


def make_tabpfn_clf(cfg: Any, seed: int) -> TabPFNClf:
    t = cfg.tabpfn
    return TabPFNClf(t.n_estimators, t.model_version, t.device, seed)


def make_tabpfn(cfg: Any, seed: int) -> TabPFNDist:
    t = cfg.tabpfn
    return TabPFNDist(t.n_estimators, t.model_version, t.fit_mode, t.device, seed)
