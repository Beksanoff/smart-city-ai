# Smart City AI Core - Management Commands

.PHONY: up down restart logs clean status env-setup test lint

# Default: Start all services
up:
	@echo "Starting Smart City System..."
	docker compose up -d --build
	@echo "System started! Access at http://localhost:3000"

# Stop everything
down:
	@echo "Stopping all services..."
	docker compose down
	@echo "Services stopped."

# Restart (Stop -> Start)
restart: down up

# View logs
logs:
	docker compose logs -f

# Clean start (Remove volumes + Force kill) - Use if stuck
clean:
	@echo "Cleaning up Docker environment..."
	docker compose down -v --remove-orphans
	@echo "Cleanup complete."

# Check status
status:
	docker compose ps

# Run all tests
test:
	@echo "Running Go tests..."
	docker compose exec backend-go go test ./... -v 2>/dev/null || (cd backend-go && go test ./... -v)
	@echo "Running Python tests..."
	docker compose exec ml-python python -m pytest tests/ -v 2>/dev/null || (cd ml-python && python -m pytest tests/ -v)
	@echo "Running Frontend tests..."
	cd frontend-react && npx vitest run

# Lint all services
lint:
	@echo "Linting Frontend..."
	cd frontend-react && npx eslint src/ && npx tsc --noEmit
	@echo "Linting Go..."
	cd backend-go && go vet ./...
	@echo "All lint checks passed!"

# First time setup helper
env-setup:
	cp .env.example .env
	@echo ".env file created from example. Fill in your API keys."
