# Linux/macOS/CI. On Windows use: .\scripts\dev.ps1 <target>
UV := uv --project engine
BD := $(UV) run brokedate
OFFLINE := --disable-socket --allow-hosts=127.0.0.1,localhost,::1

.PHONY: setup sim lint types test offline check engine web demo pocket bench backtest post-numbers

setup:
	$(UV) sync
	cp scripts/hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
	cd web && pnpm install

sim:
	$(UV) run python scripts/simulate_statement.py --seed 13 --out data/sim

lint:
	$(UV) run ruff check engine scripts/hooks

types:
	$(UV) run mypy engine/brokedate

test:
	$(UV) run pytest engine/tests

offline:
	$(UV) run pytest engine/tests $(OFFLINE)

check: lint types
	$(UV) run pytest engine/tests -m "not slow and not ollama" $(OFFLINE)
	cd web && pnpm run typecheck && pnpm run test

engine:
	$(BD) serve

web:
	cd web && pnpm run dev

demo:
	$(BD) export-demo
	cd web && pnpm run build:demo

pocket:
	$(BD) export-pocket

bench:
	$(BD) bench

backtest:
	$(BD) backtest

post-numbers:
	$(BD) post-numbers
