.PHONY: setup setup-backend setup-mobile run-backend run-mobile dev stop restart

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

dev:
	xcrun simctl boot "iPhone 16 Plus" 2>/dev/null || true
	cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | tee /tmp/backend.log &
	cd mobile && REACT_NATIVE_PACKAGER_HOSTNAME=$$(ipconfig getifaddr en0) npx expo start --lan

stop:
	-lsof -ti :8000 -ti :8081 -ti :19000 -ti :19001 | xargs kill -9 2>/dev/null
	-pkill -f "uvicorn|expo start|metro" 2>/dev/null
	-xcrun simctl shutdown all 2>/dev/null
	@echo "✅ Stopped"

restart: stop
	@sleep 1
	$(MAKE) dev
