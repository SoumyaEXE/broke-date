"""Money is integer paise everywhere. Rupees appear only at the UI edge (SPEC 5)."""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

Paise = int

_AMOUNT_CLEAN = re.compile(r"[,\s₹]|INR|Rs\.?", re.IGNORECASE)


def parse_amount(text: str | float | int | None) -> Paise | None:
    """Parse a statement amount ('1,23,456.78', '₹ 50', '12.5 Cr'?) into paise. Empty -> None."""
    if text is None:
        return None
    if isinstance(text, int):
        return text * 100
    if isinstance(text, float):
        return int(Decimal(repr(text)).scaleb(2).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    s = _AMOUNT_CLEAN.sub("", str(text)).strip()
    if s in ("", "-", "--"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    suffix = s[-2:].upper()
    if suffix in ("CR", "DR"):
        s = s[:-2]
        neg = neg or suffix == "DR"
    try:
        value = int(Decimal(s).scaleb(2).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    except InvalidOperation as e:
        raise ValueError(f"not an amount: {text!r}") from e
    return -value if neg else value


def group_indian(n: int) -> str:
    """12345678 -> '1,23,45,678'."""
    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return ("-" if n < 0 else "") + s


def format_inr(paise: Paise, decimals: bool | None = None, symbol: str = "₹") -> str:
    """Format paise as rupees with Indian grouping. decimals=None shows paise only when non-zero."""
    if not isinstance(paise, int):
        raise TypeError("paise must be int")
    neg = paise < 0
    rupees, p = divmod(abs(paise), 100)
    show = (p != 0) if decimals is None else decimals
    body = group_indian(rupees) + (f".{p:02d}" if show else "")
    return ("-" if neg else "") + symbol + body


def rupees_to_paise(r: float | int) -> Paise:
    return int(round(float(r) * 100))


def paise_to_rupees(p: Paise) -> float:
    return p / 100.0
