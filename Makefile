.PHONY: test build run

test:
	npm test

build:
	npm run build

run:
	npm run dev -- --host 0.0.0.0
