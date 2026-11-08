.PHONY: start dev setup reset help

PORT ?= 3000

help: ## Muestra los comandos disponibles
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-8s %s\n", $$1, $$2}'

setup: ## Crea .env a partir de .env.example si no existe
	@test -f .env || (cp .env.example .env && echo "Creado .env: completa NANOGPT_API_KEY")

start: setup ## Inicia el servidor en http://localhost:$(PORT)
	PORT=$(PORT) node server.js

dev: setup ## Inicia con recarga automática del servidor al cambiar código
	PORT=$(PORT) node --watch server.js

reset: ## Borra el progreso guardado (state/session.json)
	rm -f state/session.json
