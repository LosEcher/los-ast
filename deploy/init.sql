-- los-ast PostgreSQL initialization

-- Config deployments table
CREATE TABLE IF NOT EXISTS config_deployments (
    id SERIAL PRIMARY KEY,
    bundle_id VARCHAR(64) UNIQUE NOT NULL,
    version VARCHAR(32) NOT NULL,
    scope JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_by VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deployed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_config_deployments_status ON config_deployments(status);
CREATE INDEX IF NOT EXISTS idx_config_deployments_created_at ON config_deployments(created_at);

-- Rollback history table
CREATE TABLE IF NOT EXISTS config_rollback_history (
    id SERIAL PRIMARY KEY,
    from_bundle_id VARCHAR(64) NOT NULL,
    to_bundle_id VARCHAR(64) NOT NULL,
    reason TEXT,
    rolled_back_by VARCHAR(128),
    rolled_back_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Approval requests table
CREATE TABLE IF NOT EXISTS approval_requests (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    request_type VARCHAR(32) NOT NULL,
    context JSONB NOT NULL,
    requested_by VARCHAR(128) NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    decided_by VARCHAR(128),
    decided_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_job_id ON approval_requests(job_id);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    actor_id VARCHAR(128),
    scope JSONB,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
