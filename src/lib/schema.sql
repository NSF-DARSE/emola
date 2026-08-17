-- Prototype store. One row per ingested notification, one row per human
-- decision, one row per precedent, one row per generated artifact.

CREATE TABLE IF NOT EXISTS notifications (
  id                TEXT PRIMARY KEY,
  received_at       TEXT NOT NULL,
  body              TEXT NOT NULL,
  synthetic         INTEGER NOT NULL DEFAULT 0,
  synthetic_reason  TEXT,
  gold_primary      TEXT,
  gold_secondary    TEXT NOT NULL DEFAULT '[]',
  gold_status       TEXT,
  holdout           INTEGER NOT NULL DEFAULT 0,

  -- Model output. Displayed to reviewers as context; never treated as truth.
  model_primary     TEXT NOT NULL,
  model_secondary   TEXT NOT NULL DEFAULT '[]',
  model_status      TEXT NOT NULL,
  model_confidence  REAL NOT NULL,
  model_reasoning   TEXT NOT NULL,
  model_engine      TEXT NOT NULL,

  extracted_json    TEXT NOT NULL,
  safety_json       TEXT NOT NULL,

  route             TEXT NOT NULL,
  route_reasons     TEXT NOT NULL DEFAULT '[]',
  review_state      TEXT NOT NULL DEFAULT 'pending',
  thread_parent_id  TEXT REFERENCES notifications(id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id             TEXT NOT NULL REFERENCES notifications(id),
  decision                    TEXT NOT NULL,       -- approve | reject
  human_primary               TEXT NOT NULL,
  human_secondary             TEXT NOT NULL DEFAULT '[]',
  human_status                TEXT NOT NULL,
  reason                      TEXT NOT NULL,       -- required, non-empty
  reviewer                    TEXT NOT NULL,
  created_at                  TEXT NOT NULL,
  -- Snapshot for override-rate reporting only.
  model_primary_at_decision   TEXT NOT NULL,
  model_status_at_decision    TEXT NOT NULL,
  model_confidence_at_decision REAL NOT NULL
);

-- Only human rulings land here. The model's guess, confidence, and reasoning
-- are deliberately absent: they are context for a reviewer, not ground truth.
CREATE TABLE IF NOT EXISTS precedents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id TEXT REFERENCES notifications(id),
  phrase          TEXT NOT NULL,
  human_primary   TEXT NOT NULL,
  human_status    TEXT NOT NULL,
  decision        TEXT NOT NULL,
  reason          TEXT NOT NULL,
  reviewer        TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  seeded          INTEGER NOT NULL DEFAULT 0,
  -- Reserved for the embedding vector once a model is chosen.
  embedding       BLOB
);

CREATE TABLE IF NOT EXISTS artifacts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id TEXT NOT NULL REFERENCES notifications(id),
  kind            TEXT NOT NULL,       -- infographic | exec_summary
  payload         TEXT NOT NULL,
  approval_state  TEXT NOT NULL DEFAULT 'draft',
  approved_by     TEXT,
  approved_at     TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_route ON notifications(route, review_state);
CREATE INDEX IF NOT EXISTS idx_decisions_notification ON decisions(notification_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_notification ON artifacts(notification_id, kind);
