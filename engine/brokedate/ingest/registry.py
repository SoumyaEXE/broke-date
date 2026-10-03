from __future__ import annotations

from pathlib import Path

from brokedate.ingest.base import Adapter, ParsedStatement
from brokedate.ingest.csv_generic import GenericCsvAdapter
from brokedate.ingest.pdf_bank import PdfBankAdapter


def parse_statement(path: Path, subject: str, password: str | None = None,
                    adapter: str | None = None) -> ParsedStatement:
    adapters: list[Adapter] = [GenericCsvAdapter(), PdfBankAdapter(password)]
    if adapter:
        chosen = next((a for a in adapters if a.name == adapter), None)
        if chosen is None:
            raise ValueError(f"unknown adapter {adapter!r}")
        return chosen.parse(path, subject)
    scored = sorted(((a.sniff(path), a) for a in adapters), key=lambda x: -x[0])
    score, best = scored[0]
    if score < 0.6:
        raise ValueError(f"no adapter is confident about {path.name} (best {best.name}={score:.2f}); "
                         "pass --adapter or run `brokedate inspect`")
    return best.parse(path, subject)
