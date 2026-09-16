.PHONY: setup setup-backend setup-backend-local setup-mobile run-backend run-mobile llm-token

setup: setup-backend setup-mobile

setup-backend:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -r requirements.txt
	@echo "✅ Backend ready"

# Adds the Azure Key Vault packages needed for LLM_USE_GATEWAY=true (local only).
setup-backend-local:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -r requirements-local.txt
	@echo "✅ Backend ready (with local LLM gateway support)"

# Fetch the LLM gateway key and send a test message through the gateway.
llm-token:
	cd backend && .venv/bin/python -m app.llm.gateway_token --ping

setup-mobile:
	cd mobile && npm install
	@echo "✅ Mobile ready"

run-backend:
	cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

run-mobile:
	cd mobile && REACT_NATIVE_PACKAGER_HOSTNAME=$$(ipconfig getifaddr en0) npx expo start --lan
