//! Database module for Tauri standalone
//! SQLite persistence with migrations matching WebUI Dexie schema

use rusqlite::{Connection, Result, params, OptionalExtension};
use std::sync::{Arc, Mutex};
use chrono::Utc;
use dirs;
use uuid::Uuid;

/// Database connection wrapper with thread-safe access
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Open or create the database at the app data directory
    pub fn open() -> Result<Self> {
        let app_dir = dirs::data_dir()
            .ok_or_else(|| rusqlite::Error::InvalidQuery)? // Use anyhow::Error instead?
            .join("ABDBankManager");
        
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(14),
                Some(format!("Failed to create app data dir {}: {}", app_dir.display(), e)),
            ))?;
        let db_path = app_dir.join("abd_bank_manager.db");
        
        let conn = Connection::open(&db_path)?;
        
        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        
        // Run migrations
        db.migrate()?;
        
        Ok(db)
    }
    
    /// Run schema migrations
    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        // Create migrations table if not exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS __migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // Get current version
        let current_version: i32 = conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM __migrations",
            [],
            |row| row.get(0),
        )?;
        
        // Migration 1: Initial schema (v1)
        if current_version < 1 {
            Self::migration_v1(&conn)?;
            conn.execute(
                "INSERT INTO __migrations (version, applied_at) VALUES (1, ?)",
                params![Utc::now().to_rfc3339()],
            )?;
        }
        
        // Migration 2: Add category to patches (v2)
        if current_version < 2 {
            Self::migration_v2(&conn)?;
            conn.execute(
                "INSERT INTO __migrations (version, applied_at) VALUES (2, ?)",
                params![Utc::now().to_rfc3339()],
            )?;
        }
        
        // Migration 3: Add tags M:N (v3)
        if current_version < 3 {
            Self::migration_v3(&conn)?;
            conn.execute(
                "INSERT INTO __migrations (version, applied_at) VALUES (3, ?)",
                params![Utc::now().to_rfc3339()],
            )?;
        }
        
        // Migration 4: Add creationDate to banks/patches, purge settings (v4)
        if current_version < 4 {
            Self::migration_v4(&conn)?;
            conn.execute(
                "INSERT INTO __migrations (version, applied_at) VALUES (4, ?)",
                params![Utc::now().to_rfc3339()],
            )?;
        }
        
        Ok(())
    }
    
    fn migration_v1(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE banks (
                dbId INTEGER PRIMARY KEY AUTOINCREMENT,
                id TEXT NOT NULL UNIQUE,
                modelId TEXT NOT NULL,
                name TEXT NOT NULL,
                isFactory INTEGER NOT NULL DEFAULT 0,
                isLocked INTEGER NOT NULL DEFAULT 0,
                source TEXT,
                hardwareIds TEXT NOT NULL DEFAULT '[]',
                manufacturer TEXT NOT NULL DEFAULT '',
                creationDate TEXT NOT NULL,
                modifiedDate TEXT NOT NULL
            );
            
            CREATE TABLE patches (
                dbId INTEGER PRIMARY KEY AUTOINCREMENT,
                id TEXT NOT NULL UNIQUE,
                bankId TEXT NOT NULL,
                "index" INTEGER NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'Other',
                author TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                notes TEXT NOT NULL DEFAULT '',
                rawData BLOB,
                hardwareIds TEXT NOT NULL DEFAULT '[]',
                parameters TEXT NOT NULL DEFAULT '{}',
                fingerprint TEXT,
                isFavorite INTEGER NOT NULL DEFAULT 0,
                rating INTEGER NOT NULL DEFAULT 0,
                versionNumber INTEGER NOT NULL DEFAULT 1,
                previousVersionId TEXT,
                creationDate TEXT NOT NULL,
                modifiedDate TEXT NOT NULL
            );
            
            CREATE INDEX idx_patches_bankId ON patches(bankId);
            CREATE INDEX idx_patches_bankId_index ON patches(bankId, "index");
            CREATE INDEX idx_patches_name ON patches(name);
            CREATE INDEX idx_patches_fingerprint ON patches(fingerprint);
            CREATE INDEX idx_patches_isFavorite ON patches(isFavorite);
            
            CREATE TABLE history (
                dbId INTEGER PRIMARY KEY AUTOINCREMENT,
                patchId TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                rawData BLOB
            );
            
            CREATE INDEX idx_history_patchId ON history(patchId);
            
            CREATE TABLE tags (
                dbId INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );
            
            CREATE TABLE patchTags (
                dbId INTEGER PRIMARY KEY AUTOINCREMENT,
                patchId TEXT NOT NULL,
                tagId INTEGER NOT NULL,
                UNIQUE(patchId, tagId)
            );
            
            CREATE INDEX idx_patchTags_patchId ON patchTags(patchId);
            CREATE INDEX idx_patchTags_tagId ON patchTags(tagId);
            
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )?;
        Ok(())
    }
    
    fn migration_v2(_conn: &Connection) -> Result<()> {
        // Category was added in v1 schema; this migration exists for upgrade path
        // from databases created before v1 included it.
        // Note: ALTER TABLE ADD COLUMN fails if column already exists,
        // so this is intentionally a no-op for fresh installs.
        Ok(())
    }
    
    fn migration_v3(_conn: &Connection) -> Result<()> {
        // Tags and patchTags already created in v1
        Ok(())
    }
    
    fn migration_v4(_conn: &Connection) -> Result<()> {
        // Add creationDate to banks if not exists (already in v1)
        // Add creationDate to patches (already in v1)
        // Purge legacy settings table - we already have it but it's separate
        // The settings table already exists from v1, but we mark it for legacy
        // In WebUI, settings: null in v4 removes it
        // Here we just keep it for compatibility
        
        // Ensure creationDate exists on banks and patches
        // (already added in v1)
        
        Ok(())
    }
    
    // Get a connection for running queries
    pub fn with_conn<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&mut Connection) -> Result<T>,
    {
        let mut conn = self.conn.lock().unwrap();
        f(&mut conn)
    }
    
    // Bank operations
    pub fn create_bank(&self, bank: Bank) -> Result<Bank> {
        let mut bank = bank;
        bank.id = Uuid::new_v4().to_string();
        bank.creationDate = Utc::now().to_rfc3339();
        bank.modifiedDate = Utc::now().to_rfc3339();
        
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO banks (id, modelId, name, isFactory, isLocked, source, creationDate, modifiedDate, hardwareIds, manufacturer)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    bank.id,
                    bank.modelId,
                    bank.name,
                    bank.isFactory as i32,
                    bank.isLocked as i32,
                    bank.source,
                    bank.creationDate,
                    bank.modifiedDate,
                    serde_json::to_string(&bank.hardwareIds).unwrap(),
                    bank.manufacturer
                ],
            )?;
            Ok(bank)
        })
    }
    
    pub fn get_bank(&self, bank_id: &str) -> Result<Option<Bank>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, modelId, name, isFactory, isLocked, source, creationDate, modifiedDate, hardwareIds, manufacturer
                 FROM banks WHERE id = ?1"
            )?;
            let bank = stmt.query_row(params![bank_id], |row| {
                Ok(Bank {
                    id: row.get(0)?,
                    modelId: row.get(1)?,
                    name: row.get(2)?,
                    isFactory: row.get::<_, i32>(3)? == 1,
                    isLocked: row.get::<_, i32>(4)? == 1,
                    source: row.get(5)?,
                    creationDate: row.get(6)?,
                    modifiedDate: row.get(7)?,
                    hardwareIds: serde_json::from_str(&row.get::<_, String>(8)?).unwrap_or_default(),
                    manufacturer: row.get(9)?,
                    patches: vec![],
                })
            }).optional()?;
            Ok(bank)
        })
    }
    
    pub fn get_all_banks(&self) -> Result<Vec<Bank>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, modelId, name, isFactory, isLocked, source, creationDate, modifiedDate, hardwareIds, manufacturer
                 FROM banks ORDER BY creationDate"
            )?;
            let banks = stmt.query_map([], |row| {
                Ok(Bank {
                    id: row.get(0)?,
                    modelId: row.get(1)?,
                    name: row.get(2)?,
                    isFactory: row.get::<_, i32>(3)? == 1,
                    isLocked: row.get::<_, i32>(4)? == 1,
                    source: row.get(5)?,
                    creationDate: row.get(6)?,
                    modifiedDate: row.get(7)?,
                    hardwareIds: serde_json::from_str(&row.get::<_, String>(8)?).unwrap_or_default(),
                    manufacturer: row.get(9)?,
                    patches: vec![],
                })
            })?.collect::<Result<Vec<_>>>()?;
            Ok(banks)
        })
    }
    
    pub fn update_bank(&self, bank_id: &str, changes: serde_json::Value) -> Result<()> {
        self.with_conn(|conn| {
            let now = Utc::now().to_rfc3339();

            if let Some(name) = changes.get("name") {
                let name = name.as_str().unwrap_or_default();
                conn.execute(
                    "UPDATE banks SET name = ?1, modifiedDate = ?2 WHERE id = ?3",
                    params![name, now, bank_id],
                )?;
            }
            if let Some(is_locked) = changes.get("isLocked") {
                let val = if is_locked.as_bool().unwrap_or(false) { 1 } else { 0 };
                conn.execute(
                    "UPDATE banks SET isLocked = ?1, modifiedDate = ?2 WHERE id = ?3",
                    params![val, now, bank_id],
                )?;
            }
            if let Some(model_id) = changes.get("modelId") {
                let val = model_id.as_str().unwrap_or_default();
                conn.execute(
                    "UPDATE banks SET modelId = ?1, modifiedDate = ?2 WHERE id = ?3",
                    params![val, now, bank_id],
                )?;
            }
            if let Some(manufacturer) = changes.get("manufacturer") {
                let val = manufacturer.as_str().unwrap_or_default();
                conn.execute(
                    "UPDATE banks SET manufacturer = ?1, modifiedDate = ?2 WHERE id = ?3",
                    params![val, now, bank_id],
                )?;
            }
            if let Some(source) = changes.get("source") {
                let val = source.as_str();
                conn.execute(
                    "UPDATE banks SET source = ?1, modifiedDate = ?2 WHERE id = ?3",
                    params![val, now, bank_id],
                )?;
            }
            if let Some(hw_ids) = changes.get("hardwareIds") {
                let val = serde_json::to_string(hw_ids).unwrap_or_default();
                conn.execute(
                    "UPDATE banks SET hardwareIds = ?1, modifiedDate = ?2 WHERE id = ?3",
                    params![val, now, bank_id],
                )?;
            }
            Ok(())
        })
    }
    
    pub fn delete_bank(&self, bank_id: &str) -> Result<()> {
        self.with_conn(|conn| {
            let tx = conn.transaction()?;
            tx.execute("DELETE FROM patches WHERE bankId = ?1", params![bank_id])?;
            tx.execute("DELETE FROM banks WHERE id = ?1", params![bank_id])?;
            tx.commit()?;
            Ok(())
        })
    }

    /// Full library (banks with nested patches, ordered), used by the WebUI bridge.
    pub fn load_library(&self) -> Result<Vec<LibraryBank>> {
        let banks = self.get_all_banks()?;
        let mut result = Vec::with_capacity(banks.len());
        for bank in banks {
            let patches = self.get_patches_for_bank(&bank.id)?;
            result.push(LibraryBank {
                id: bank.id,
                modelId: bank.modelId,
                name: bank.name,
                isFactory: bank.isFactory,
                isLocked: bank.isLocked,
                source: bank.source,
                creationDate: bank.creationDate,
                modifiedDate: bank.modifiedDate,
                hardwareIds: bank.hardwareIds,
                manufacturer: bank.manufacturer,
                patches,
            });
        }
        Ok(result)
    }

    /// Replace the whole library in one transaction, preserving every entity id.
    pub fn save_library(&self, library: &[LibraryBank]) -> Result<()> {
        self.with_conn(|conn| {
            let tx = conn.transaction()?;
            tx.execute("DELETE FROM patchTags", [])?;
            tx.execute("DELETE FROM history", [])?;
            tx.execute("DELETE FROM patches", [])?;
            tx.execute("DELETE FROM banks", [])?;
            for bank in library {
                tx.execute(
                    "INSERT INTO banks (id, modelId, name, isFactory, isLocked, source, hardwareIds, manufacturer, creationDate, modifiedDate)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        bank.id,
                        bank.modelId,
                        bank.name,
                        bank.isFactory as i32,
                        bank.isLocked as i32,
                        bank.source,
                        serde_json::to_string(&bank.hardwareIds).unwrap_or_default(),
                        bank.manufacturer,
                        bank.creationDate,
                        bank.modifiedDate,
                    ],
                )?;
                for patch in &bank.patches {
                    tx.execute(
                        r#"INSERT INTO patches (
                            id, bankId, "index", name, category, author, tags, notes, rawData,
                            hardwareIds, parameters, fingerprint, isFavorite, rating,
                            versionNumber, previousVersionId, creationDate, modifiedDate
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)"#,
                        params![
                            patch.id,
                            patch.bankId,
                            patch.index,
                            patch.name,
                            patch.category,
                            patch.author,
                            serde_json::to_string(&patch.tags).unwrap_or_default(),
                            patch.notes,
                            patch.rawData,
                            serde_json::to_string(&patch.hardwareIds).unwrap_or_default(),
                            serde_json::to_string(&patch.parameters).unwrap_or_default(),
                            patch.fingerprint,
                            patch.isFavorite as i32,
                            patch.rating,
                            patch.versionNumber,
                            patch.previousVersionId,
                            patch.creationDate,
                            patch.modifiedDate,
                        ],
                    )?;
                }
            }
            tx.commit()?;
            Ok(())
        })
    }
    
    // Patch operations
    pub fn create_patch(&self, patch: Patch) -> Result<Patch> {
        let mut patch = patch;
        patch.id = Uuid::new_v4().to_string();
        patch.creationDate = Utc::now().to_rfc3339();
        patch.modifiedDate = Utc::now().to_rfc3339();
        
        self.with_conn(|conn| {
            conn.execute(
                r#"INSERT INTO patches (
                    id, bankId, index, name, category, author, tags, notes, rawData,
                    hardwareIds, parameters, fingerprint, isFavorite, rating,
                    versionNumber, previousVersionId, creationDate, modifiedDate
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)"#,
                params![
                    patch.id,
                    patch.bankId,
                    patch.index,
                    patch.name,
                    patch.category,
                    patch.author,
                    serde_json::to_string(&patch.tags).unwrap(),
                    patch.notes,
                    patch.rawData,
                    serde_json::to_string(&patch.hardwareIds).unwrap(),
                    serde_json::to_string(&patch.parameters).unwrap(),
                    patch.fingerprint,
                    patch.isFavorite as i32,
                    patch.rating,
                    patch.versionNumber,
                    patch.previousVersionId,
                    patch.creationDate,
                    patch.modifiedDate
                ],
            )?;
            Ok(patch)
        })
    }
    
pub fn get_patches_for_bank(&self, bank_id: &str) -> Result<Vec<Patch>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, bankId, \"index\", name, category, author, tags, notes, rawData,
                        hardwareIds, parameters, fingerprint, isFavorite, rating,
                        versionNumber, previousVersionId, creationDate, modifiedDate
                 FROM patches WHERE bankId = ?1 ORDER BY \"index\""
            )?;
            let patches = stmt.query_map(&[&bank_id], |row| {
                Ok(Patch {
                    id: row.get(0)?,
                    bankId: row.get(1)?,
                    index: row.get(2)?,
                    name: row.get(3)?,
                    category: row.get(4)?,
                    author: row.get(5)?,
                    tags: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
                    notes: row.get(7)?,
                    rawData: row.get(8)?,
                    hardwareIds: serde_json::from_str(&row.get::<_, String>(9)?).unwrap_or_default(),
                    parameters: serde_json::from_str(&row.get::<_, String>(10)?).unwrap_or_default(),
                    fingerprint: row.get(11)?,
                    isFavorite: row.get::<_, i32>(12)? == 1,
                    rating: row.get(13)?,
                    versionNumber: row.get(14)?,
                    previousVersionId: row.get(15)?,
                    creationDate: row.get(16)?,
                    modifiedDate: row.get(17)?,
                })
            })?.collect::<Result<Vec<_>>>()?;
            Ok(patches)
        })
    }
    
pub fn get_patch(&self, patch_id: &str) -> Result<Option<Patch>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, bankId, \"index\", name, category, author, tags, notes, rawData,
                        hardwareIds, parameters, fingerprint, isFavorite, rating,
                        versionNumber, previousVersionId, creationDate, modifiedDate
                 FROM patches WHERE id = ?1"
            )?;
            let patch = stmt.query_row(&[&patch_id], |row| {
                Ok(Patch {
                    id: row.get(0)?,
                    bankId: row.get(1)?,
                    index: row.get(2)?,
                    name: row.get(3)?,
                    category: row.get(4)?,
                    author: row.get(5)?,
                    tags: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
                    notes: row.get(7)?,
                    rawData: row.get(8)?,
                    hardwareIds: serde_json::from_str(&row.get::<_, String>(9)?).unwrap_or_default(),
                    parameters: serde_json::from_str(&row.get::<_, String>(10)?).unwrap_or_default(),
                    fingerprint: row.get(11)?,
                    isFavorite: row.get::<_, i32>(12)? == 1,
                    rating: row.get(13)?,
                    versionNumber: row.get(14)?,
                    previousVersionId: row.get(15)?,
                    creationDate: row.get(16)?,
                    modifiedDate: row.get(17)?,
                })
            }).optional()?;
            Ok(patch)
        })
    }
    
    pub fn update_patch(&self, _patch_id: &str, _changes: serde_json::Value) -> Result<()> {
        // Similar to update_bank - implement as needed
        Ok(())
    }
    
    pub fn delete_patch(&self, patch_id: &str) -> Result<()> {
        self.with_conn(|conn| {
            let tx = conn.transaction()?;
            tx.execute("DELETE FROM patchTags WHERE patchId = ?1", params![patch_id])?;
            tx.execute("DELETE FROM history WHERE patchId = ?1", params![patch_id])?;
            tx.execute("DELETE FROM patches WHERE id = ?1", params![patch_id])?;
            tx.commit()?;
            Ok(())
        })
    }
    
    // Stats
    pub fn get_database_stats(&self) -> Result<DatabaseStats> {
        self.with_conn(|conn| {
            let bank_count: i64 = conn.query_row("SELECT COUNT(*) FROM banks", [], |r| r.get(0))?;
            let patch_count: i64 = conn.query_row("SELECT COUNT(*) FROM patches", [], |r| r.get(0))?;
            let fav_count: i64 = conn.query_row("SELECT COUNT(*) FROM patches WHERE isFavorite = 1", [], |r| r.get(0))?;
            Ok(DatabaseStats {
                bankCount: bank_count as usize,
                patchCount: patch_count as usize,
                favCount: fav_count as usize,
            })
        })
    }
}

/// Full library bank — like `Bank` but carries its patches over the bridge
/// (`Bank.patches` is `#[serde(skip)]`, so it cannot round-trip through JSON).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LibraryBank {
    pub id: String,
    pub modelId: String,
    pub name: String,
    pub isFactory: bool,
    pub isLocked: bool,
    pub source: Option<String>,
    pub creationDate: String,
    pub modifiedDate: String,
    pub hardwareIds: Vec<String>,
    pub manufacturer: String,
    pub patches: Vec<Patch>,
}

/// Bank model
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Bank {
    pub id: String,
    pub modelId: String,
    pub name: String,
    pub isFactory: bool,
    pub isLocked: bool,
    pub source: Option<String>,
    pub creationDate: String,
    pub modifiedDate: String,
    pub hardwareIds: Vec<String>,
    pub manufacturer: String,
    #[serde(skip)]
    pub patches: Vec<Patch>,
}

/// Patch model
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Patch {
    pub id: String,
    pub bankId: String,
    pub index: i32,
    pub name: String,
    pub category: String,
    pub author: String,
    pub tags: Vec<String>,
    pub notes: String,
    pub rawData: Option<Vec<u8>>,
    pub hardwareIds: Vec<String>,
    pub parameters: serde_json::Value,
    pub fingerprint: Option<String>,
    pub isFavorite: bool,
    pub rating: i32,
    pub versionNumber: i32,
    pub previousVersionId: Option<String>,
    pub creationDate: String,
    pub modifiedDate: String,
}

/// Database stats
#[derive(Debug, serde::Serialize)]
pub struct DatabaseStats {
    pub bankCount: usize,
    pub patchCount: usize,
    pub favCount: usize,
}

impl Default for Bank {
    fn default() -> Self {
        Self {
            id: String::new(),
            modelId: String::new(),
            name: String::new(),
            isFactory: false,
            isLocked: false,
            source: None,
            creationDate: Utc::now().to_rfc3339(),
            modifiedDate: Utc::now().to_rfc3339(),
            hardwareIds: Vec::new(),
            manufacturer: String::new(),
            patches: Vec::new(),
        }
    }
}

impl Default for Patch {
    fn default() -> Self {
        Self {
            id: String::new(),
            bankId: String::new(),
            index: 0,
            name: String::new(),
            category: "Other".to_string(),
            author: String::new(),
            tags: Vec::new(),
            notes: String::new(),
            rawData: None,
            hardwareIds: Vec::new(),
            parameters: serde_json::json!({}),
            fingerprint: None,
            isFavorite: false,
            rating: 0,
            versionNumber: 1,
            previousVersionId: None,
            creationDate: Utc::now().to_rfc3339(),
            modifiedDate: Utc::now().to_rfc3339(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    /// Database anclado a un fichero SQLite temporal (sin tocar el app-data real).
    fn temp_db(filename: &str) -> Database {
        let dir = std::env::temp_dir().join(format!("abdbm-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(filename);
        let _ = std::fs::remove_file(&path);
        let conn = Connection::open(&path).unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();
        let db = Database { conn: Arc::new(Mutex::new(conn)) };
        db.migrate().unwrap();
        db
    }

    fn sample_patch(bank_id: &str, index: i32, name: &str) -> Patch {
        let mut p = Patch::default();
        p.id = format!("patch-{}-{}", bank_id, index);
        p.bankId = bank_id.to_string();
        p.index = index;
        p.name = name.to_string();
        p.rawData = Some(vec![0xF0, 0x43, index as u8, 0xF7]);
        p
    }

    #[test]
    fn save_and_load_library_roundtrip_preserves_ids_and_raw_data() {
        let db = temp_db("roundtrip.db");

        let mut bank_a = LibraryBank {
            id: "bank-A".to_string(),
            modelId: "behringer-pro800".to_string(),
            name: "A".to_string(),
            isFactory: false,
            isLocked: true,
            source: None,
            creationDate: "2026-01-01T00:00:00Z".to_string(),
            modifiedDate: "2026-01-02T00:00:00Z".to_string(),
            hardwareIds: vec!["hw-1".to_string()],
            manufacturer: "Behringer".to_string(),
            patches: vec![
                sample_patch("bank-A", 0, "Lead"),
                sample_patch("bank-A", 1, "Pad"),
            ],
        };
        let mut bank_b = LibraryBank {
            id: "bank-B".to_string(),
            modelId: "korg-ms2000".to_string(),
            name: "B".to_string(),
            isFactory: false,
            isLocked: false,
            source: Some("import".to_string()),
            creationDate: "2026-02-01T00:00:00Z".to_string(),
            modifiedDate: "2026-02-02T00:00:00Z".to_string(),
            hardwareIds: Vec::new(),
            manufacturer: "Korg".to_string(),
            patches: Vec::new(),
        };
        bank_a.patches[1].isFavorite = true;
        bank_b.patches = Vec::new();

        db.save_library(&[bank_a, bank_b.clone()]).unwrap();

        let loaded = db.load_library().unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "bank-A");
        assert_eq!(loaded[0].patches.len(), 2);
        assert_eq!(loaded[0].patches[0].id, "patch-bank-A-0");
        assert_eq!(loaded[0].patches[1].id, "patch-bank-A-1");
        assert_eq!(loaded[0].patches[1].isFavorite, true);
        assert_eq!(
            loaded[0].patches[1].rawData,
            Some(vec![0xF0, 0x43, 1, 0xF7])
        );
        assert_eq!(loaded[1].modelId, "korg-ms2000");
        assert_eq!(loaded[1].patches.len(), 0);

        // Reemplazo total: los ids antiguos deben desaparecer.
        db.save_library(&[bank_b.clone()]).unwrap();
        let loaded2 = db.load_library().unwrap();
        assert_eq!(loaded2.len(), 1);
        assert_eq!(loaded2[0].id, "bank-B");
        assert_eq!(loaded2[0].patches.len(), 0);
    }
}