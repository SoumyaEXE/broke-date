import pytest
from hypothesis import given
from hypothesis import strategies as st

from brokedate.money import format_inr, group_indian, parse_amount


def test_indian_grouping():
    assert group_indian(0) == "0"
    assert group_indian(999) == "999"
    assert group_indian(1000) == "1,000"
    assert group_indian(123456) == "1,23,456"
    assert group_indian(12345678) == "1,23,45,678"


def test_format_inr():
    assert format_inr(12345678) == "₹1,23,456.78"
    assert format_inr(42000) == "₹420"
    assert format_inr(42000, decimals=True) == "₹420.00"
    assert format_inr(-15050) == "-₹150.50"
    with pytest.raises(TypeError):
        format_inr(1.5)  # type: ignore[arg-type]


def test_parse_amount():
    assert parse_amount("1,23,456.78") == 12345678
    assert parse_amount("₹ 50") == 5000
    assert parse_amount("") is None
    assert parse_amount(None) is None
    assert parse_amount("33.00") == 3300
    assert parse_amount("0.1") == 10
    assert parse_amount("120.00 Dr") == -12000
    assert parse_amount("(5.00)") == -500
    assert parse_amount(12.34) == 1234
    with pytest.raises(ValueError):
        parse_amount("abc")


@given(st.integers(min_value=-(10**12), max_value=10**12))
def test_roundtrip(paise):
    s = format_inr(paise, decimals=True).replace("₹", "")
    assert parse_amount(s) == paise
