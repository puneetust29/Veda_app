.PHONY: setup setup-backend setup-mobile run-backend run-mobile

setup: setup-backend setup-mobile

setup-backend:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -r requirements.txt
	@echo "✅ Backend ready"

setup-mobile:
	cd mobile && npm install
	@echo "✅ Mobile ready"

run-backend:
	cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

run-mobile:
	cd mobile && REACT_NATIVE_PACKAGER_HOSTNAME=$$(ipconfig getifaddr en0) npx expo start --lan
