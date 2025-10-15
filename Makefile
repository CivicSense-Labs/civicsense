# CivicSense Development Makefile

.PHONY: help install setup dev test clean dashboard seed

help: ## Show this help message
	@echo "CivicSense - AI-Powered 311 & Property Issue Reporter"
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	@echo "📦 Installing Node.js dependencies..."
	npm install
	@echo "📦 Installing Python dependencies for dashboard..."
	@command -v python3 >/dev/null 2>&1 || { echo >&2 "Python 3 is required but not installed. Please install Python 3."; exit 1; }
	@echo "Creating Python virtual environment..."
	cd dashboard && python3 -m venv venv || true
	@echo "Installing Python packages in virtual environment..."
	cd dashboard && source venv/bin/activate && pip install -r requirements.txt || echo "⚠️  Python packages installation skipped. Run 'make setup-python' manually if needed."
	@echo "✅ Node.js dependencies installed!"

setup: install ## Full setup: install deps, setup database, seed data
	@echo "🔧 Setting up CivicSense..."
	@if [ ! -f .env.local ]; then \
		echo "📄 Creating .env.local from template..."; \
		cp .env.example .env.local; \
		echo "⚠️  Please edit .env.local with your API keys!"; \
	fi
	@echo "🗄️  Setting up Supabase..."
	supabase start
	@echo "📊 Running database migrations..."
	supabase db reset
	@echo "🌱 Seeding demo data..."
	npm run demo:seed
	@echo "✅ Setup complete!"

dev: ## Start development servers (API + Dashboard)
	@echo "🚀 Starting development environment..."
	@echo "Starting API server on port 3000..."
	npm run dev &
	@if [ -f dashboard/venv/bin/activate ]; then \
		echo "Starting Streamlit dashboard on port 8501..."; \
		cd dashboard && source venv/bin/activate && streamlit run app.py --server.port 8501 & \
		echo "✅ Development servers started!"; \
		echo "📊 Dashboard: http://localhost:8501"; \
		echo "🔗 API: http://localhost:3000"; \
	else \
		echo "⚠️  Dashboard not started. Run 'make setup-python' first for dashboard support."; \
		echo "🔗 API: http://localhost:3000"; \
	fi
	@echo "Press Ctrl+C to stop all servers"

api-dev: ## Start only the API server
	@echo "🚀 Starting API server..."
	npm run dev

setup-python: ## Setup Python virtual environment for dashboard
	@echo "🐍 Setting up Python environment for dashboard..."
	cd dashboard && python3 -m venv venv
	cd dashboard && source venv/bin/activate && pip install -r requirements.txt
	@echo "✅ Python environment ready!"
	@echo "To use: cd dashboard && source venv/bin/activate"

dashboard-dev: ## Start only the dashboard
	@echo "📊 Starting Streamlit dashboard..."
	@if [ -f dashboard/venv/bin/activate ]; then \
		cd dashboard && source venv/bin/activate && streamlit run app.py; \
	else \
		echo "⚠️  Python virtual environment not found. Run 'make setup-python' first."; \
		echo "Or install manually: cd dashboard && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"; \
	fi

test: ## Run test workflow
	@echo "🧪 Running workflow tests..."
	node scripts/test-workflow.js

seed: ## Seed demo data
	@echo "🌱 Seeding demo data..."
	node scripts/seed-demo.js

db-reset: ## Reset database with fresh schema
	@echo "🗄️ Resetting database..."
	supabase db reset

db-migrate: ## Run database migrations
	@echo "📊 Running migrations..."
	supabase migration up

func-serve: ## Serve Supabase Edge Functions locally
	@echo "⚡ Serving Edge Functions..."
	supabase functions serve --env-file .env.local

build: ## Build the project
	@echo "🔨 Building project..."
	npm run build

clean: ## Clean build artifacts and node_modules
	@echo "🧹 Cleaning..."
	rm -rf dist/ node_modules/ .next/
	cd dashboard && rm -rf __pycache__/

demo: setup ## Quick demo setup
	@echo "🎯 Setting up demo environment..."
	@echo "✅ Demo ready!"
	@echo ""
	@echo "🎭 Demo Scenario:"
	@echo "1. SMS Reports: Text from +15551234567 and +15559876543"
	@echo "2. Sample reports about potholes at 'Broad & Market'"
	@echo "3. System will auto-merge similar reports"
	@echo "4. View results in dashboard at http://localhost:8501"
	@echo ""
	@echo "📱 Test SMS endpoint: POST http://localhost:3000/webhooks/sms"
	@echo "📊 Dashboard API: GET http://localhost:3000/dashboard/<org-id>"
	@echo ""
	@echo "🚀 Start with: make dev"

status: ## Show service status
	@echo "📋 CivicSense Status:"
	@echo "API Server: $(shell curl -s http://localhost:3000/health > /dev/null && echo '✅ Running' || echo '❌ Not running')"
	@echo "Dashboard: $(shell curl -s http://localhost:8501 > /dev/null && echo '✅ Running' || echo '❌ Not running')"
	@echo "Supabase: $(shell supabase status | grep -q 'supabase local development setup is running' && echo '✅ Running' || echo '❌ Not running')"

logs: ## Show application logs
	@echo "📋 Application Logs:"
	@echo "Use 'docker logs' or check console outputs from development servers"

stop: ## Stop all services
	@echo "🛑 Stopping services..."
	@pkill -f "node src/server" || true
	@pkill -f "streamlit run" || true
	supabase stop || true
	@echo "✅ Services stopped"

# Default target
default: help