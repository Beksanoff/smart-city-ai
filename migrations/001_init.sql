-- SmartCity Database Schema
-- PostgreSQL + PostGIS

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Weather data table
CREATE TABLE IF NOT EXISTS weather_data (
    id SERIAL PRIMARY KEY,
    temperature DECIMAL(5,2) NOT NULL,
    feels_like DECIMAL(5,2),
    humidity INTEGER,
    description VARCHAR(255),
    icon VARCHAR(10),
    wind_speed DECIMAL(5,2),
    visibility INTEGER,
    pressure INTEGER,
    aqi INTEGER,
    city VARCHAR(100) DEFAULT 'Almaty',
    country VARCHAR(10) DEFAULT 'KZ',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Traffic data table
CREATE TABLE IF NOT EXISTS traffic_data (
    id SERIAL PRIMARY KEY,
    congestion_index DECIMAL(5,2) NOT NULL,
    congestion_level VARCHAR(50),
    average_speed DECIMAL(5,2),
    free_flow_speed DECIMAL(5,2),
    incident_count INTEGER DEFAULT 0,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Heatmap points (stored as JSON for simplicity)
CREATE TABLE IF NOT EXISTS heatmap_snapshots (
    id SERIAL PRIMARY KEY,
    traffic_data_id INTEGER REFERENCES traffic_data(id),
    points JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Predictions log
CREATE TABLE IF NOT EXISTS prediction_logs (
    id SERIAL PRIMARY KEY,
    request_date DATE,
    request_temperature DECIMAL(5,2),
    request_query TEXT,
    prediction TEXT,
    confidence_score DECIMAL(3,2),
    aqi_prediction INTEGER,
    traffic_prediction DECIMAL(5,2),
    is_mock BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_weather_timestamp ON weather_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_timestamp ON traffic_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_date ON prediction_logs(request_date);
