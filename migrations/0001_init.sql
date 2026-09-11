-- The fan list. One row per email, because a fan who comes back in week 9 is
-- the same fan, not a second one.
--
-- What is deliberately NOT here: no photograph, no filename, no image bytes of
-- any kind, and no raw IP address. A fan's own photo never leaves their device
-- (see CLAUDE.md) and nothing in this schema gives it anywhere to land.
CREATE TABLE IF NOT EXISTS fans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  -- The exact sentence the fan agreed to, stored with the row. Consent wording
  -- gets edited over a season; without this you cannot say what any given fan
  -- actually agreed to, which is the only question that matters later.
  consent_text  TEXT    NOT NULL,
  consent_at    TEXT    NOT NULL,
  -- Which game they were on when they signed up, from gameday.json.
  game          TEXT,
  section       TEXT,
  -- 1 only when they entered the code shown in the stadium: a claim of being
  -- there, not a guess from an IP address.
  attended      INTEGER NOT NULL DEFAULT 0,
  source        TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS fans_created ON fans (created_at);
CREATE INDEX IF NOT EXISTS fans_game    ON fans (game);

-- Abuse throttle. Keyed by a salted SHA-256 of the caller's IP: enough to stop
-- one script filling the list, not enough to identify anyone, and the raw
-- address is never written down. Rows older than the window are pruned on
-- write, so this table stays small on its own.
CREATE TABLE IF NOT EXISTS throttle (
  ip_hash      TEXT    PRIMARY KEY,
  hits         INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
