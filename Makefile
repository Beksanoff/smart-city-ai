# Smart City AI Core - Management Commands

.PHONY: up down restart logs clean status env-setup

# Default: Start usually
up:
	@echo "🚀 Starting Smart City System..."
	sudo docker compose up -d --build
	@echo "✅ System started! Access at http://localhost:3000"

# Stop everything
down:
	@echo "🛑 Stopping all services..."
	sudo docker compose down
	@echo "✅ Services stopped."

# Restart (Stop -> Start)
restart: down up

# View logs
logs:
	sudo docker compose logs -f

# Clean start (Remove volumes + Force kill) - Use if stuck
clean:
	@echo "🧹 Cleaning up Docker environment..."
	sudo docker compose down -v --remove-orphans
	@echo "✅ Cleanup complete."

# Check status
status:
	sudo docker compose ps

# First time setup helper
env-setup:
	cp .env.example .env
	@echo "📝 .env file created from example."
