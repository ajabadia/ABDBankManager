use tauri::{command, State};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use zip::ZipArchive;
use std::io::{Read, Cursor, Write};
use anyhow::Context;

#[derive(Serialize)]
pub struct BankInfo {
    pub id: String,
    pub name: String,
    pub model_id: String,
    pub is_factory: bool,
    pub patch_count: usize,
}

#[derive(Serialize)]
pub struct PatchInfo {
    pub id: String,
    pub name: String,
    pub category: String,
    pub is_favorite: bool,
}

#[derive(Deserialize)]
pub struct CreateBankArgs {
    pub name: String,
    pub model_id: String,
}

#[derive(Deserialize)]
pub struct CreatePatchArgs {
    pub bank_id: String,
    pub name: String,
    pub category: Option<String>,
    pub author: Option<String>,
    pub raw_data: Option<Vec<u8>>,
    pub index: Option<i32>,
}

#[derive(Deserialize)]
pub struct UpdateBankArgs {
    pub bank_id: String,
    pub changes: serde_json::Value,
}

#[derive(Deserialize)]
pub struct UpdatePatchArgs {
    pub patch_id: String,
    pub changes: serde_json::Value,
}

#[derive(Deserialize)]
pub struct MovePatchArgs {
    pub patch_id: String,
    pub new_bank_id: String,
    pub new_index: i32,
}

#[command]
pub async fn get_app_data_dir() -> Result<String, String> {
    let path = dirs::data_dir()
        .ok_or_else(|| "Could not determine app data directory".to_string())?
        .join("ABDBankManager");
    Ok(path.to_string_lossy().to_string())
}

#[command]
pub async fn list_banks(database: State<'_, crate::database::Database>) -> Result<Vec<BankInfo>, String> {
    let banks = database.get_all_banks().map_err(|e| e.to_string())?;
    let result = banks.into_iter().map(|b| {
        let patch_count = b.patches.len();
        BankInfo {
            id: b.id,
            name: b.name,
            model_id: b.modelId,
            is_factory: b.isFactory,
            patch_count,
        }
    }).collect();
    Ok(result)
}

/// WebUI bridge — full library (banks + nested patches).
#[command]
pub async fn load_library(
    database: State<'_, crate::database::Database>,
) -> Result<Vec<crate::database::LibraryBank>, String> {
    database.load_library().map_err(|e| e.to_string())
}

/// WebUI bridge — replace the whole library in one transaction (ids preserved).
#[command]
pub async fn save_library(
    database: State<'_, crate::database::Database>,
    library: Vec<crate::database::LibraryBank>,
) -> Result<(), String> {
    database.save_library(&library).map_err(|e| e.to_string())
}

#[command]
pub async fn create_bank(database: State<'_, crate::database::Database>, args: CreateBankArgs) -> Result<BankInfo, String> {
    use crate::database::Bank;
    use uuid::Uuid;
    
    let database = database.inner();
    
    let bank = Bank {
        id: Uuid::new_v4().to_string(),
        name: args.name,
        modelId: args.model_id,
        isFactory: false,
        isLocked: false,
        source: None,
        creationDate: chrono::Utc::now().to_rfc3339(),
        modifiedDate: chrono::Utc::now().to_rfc3339(),
        hardwareIds: vec![],
        manufacturer: String::new(),
        patches: vec![],
    };
    
    let created = database.create_bank(bank).map_err(|e| e.to_string())?;
    
    Ok(BankInfo {
        id: created.id,
        name: created.name,
        model_id: created.modelId,
        is_factory: created.isFactory,
        patch_count: 0,
    })
}

#[command]
pub async fn delete_bank(database: State<'_, crate::database::Database>, bank_id: String) -> Result<(), String> {
    let database = database.inner();
    database.delete_bank(&bank_id).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct ImportBankArgs {
    pub file_path: String,
    pub deduplication: Option<String>, // "skip" | "rename" | "overwrite"
}

#[derive(Deserialize)]
pub struct ExportBankArgs {
    pub bank_id: String,
    pub file_path: String,
    pub format: Option<String>, // "abdbank" | "json"
}

#[derive(Deserialize)]
pub struct ImportSysexArgs {
    pub file_path: String,
    pub model_id: Option<String>,
}

#[derive(Deserialize)]
pub struct ExportSysexArgs {
    pub bank_id: String,
    pub file_path: String,
}

#[command]
pub async fn import_bank(
    database: State<'_, crate::database::Database>,
    args: ImportBankArgs,
) -> Result<String, String> {
    let file_path = Path::new(&args.file_path);
    if !file_path.exists() {
        return Err("File not found".to_string());
    }

    let ext = file_path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let database = database.inner();

    match ext.as_str() {
        "abdbank" | "abdlibrary" => import_abdzip(&database, file_path, &ext, args.deduplication.as_deref()),
        "json" => import_json(&database, file_path),
        "syx" => import_sysex(&database, file_path, args.deduplication.as_deref()),
        _ => Err(format!("Unsupported format: .{}", ext)),
    }
}

#[command]
pub async fn export_bank(
    database: State<'_, crate::database::Database>,
    args: ExportBankArgs,
) -> Result<(), String> {
    let database = database.inner();
    let format = args.format.as_deref().unwrap_or("abdbank");

    // Load the bank with its patches
    let bank = database.get_bank(&args.bank_id).map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Bank not found: {}", args.bank_id))?;
    let patches = database.get_patches_for_bank(&args.bank_id).map_err(|e| e.to_string())?;

    match format {
        "abdbank" => export_abdbank(&bank, &patches, &args.file_path),
        "json" => export_json(&bank, &patches, &args.file_path),
        _ => Err(format!("Unsupported export format: {}", format)),
    }
}

#[command]
pub async fn import_sys_ex(
    database: State<'_, crate::database::Database>,
    args: ImportSysexArgs,
) -> Result<Vec<String>, String> {
    let file_path = Path::new(&args.file_path);
    if !file_path.exists() {
        return Err("File not found".to_string());
    }

    let database = database.inner();
    let bank_id = import_sysex(&database, file_path, None)?;
    Ok(vec![bank_id])
}

#[command]
pub async fn export_sys_ex(
    database: State<'_, crate::database::Database>,
    args: ExportSysexArgs,
) -> Result<(), String> {
    let database = database.inner();

    let bank = database.get_bank(&args.bank_id).map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Bank not found: {}", args.bank_id))?;
    let patches = database.get_patches_for_bank(&args.bank_id).map_err(|e| e.to_string())?;

    export_sysex(&bank, &patches, &args.file_path)
}

// Import/Export implementation functions

fn import_abdzip(
    database: &crate::database::Database,
    file_path: &Path,
    ext: &str,
    _deduplication: Option<&str>,
) -> Result<String, String> {
    let data = fs::read(file_path).map_err(|e| e.to_string())?;
    let cursor = Cursor::new(data);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    let manifest_file = archive.by_name("manifest.json")
        .map_err(|e| e.to_string())?;
    let manifest_text = std::io::read_to_string(manifest_file).map_err(|e| e.to_string())?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_text).map_err(|e| e.to_string())?;

    let mut bank_ids = Vec::new();

    if let Some(banks) = manifest.get("banks").and_then(|b| b.as_array()) {
        // Multi-bank format (.abdlibrary or legacy .abdbank v3)
        for entry in banks {
            let bank_id = import_bank_entry(database, &mut archive, entry)?;
            bank_ids.push(bank_id);
        }
    } else if let (Some(bank), Some(patches)) = (manifest.get("bank"), manifest.get("patches")) {
        // Single bank format (.abdbank v1/v2)
        let bank_id = import_bank_entry(database, &mut archive, &serde_json::json!({ "bank": bank, "patches": patches }))?;
        bank_ids.push(bank_id);
    } else {
        return Err("Invalid manifest: missing bank/banks".to_string());
    }

    Ok(bank_ids.join(","))
}

fn import_bank_entry(
    database: &crate::database::Database,
    archive: &mut ZipArchive<Cursor<Vec<u8>>>,
    entry: &serde_json::Value,
) -> Result<String, String> {
    let bank_data = entry.get("bank").ok_or("Missing bank in entry")?;
    let patches_data = entry.get("patches").and_then(|p| p.as_array()).ok_or("Missing patches in entry")?;

    // Parse bank
    let bank = crate::database::Bank {
        id: bank_data.get("id").and_then(|v| v.as_str()).unwrap_or(&uuid::Uuid::new_v4().to_string()).to_string(),
        modelId: bank_data.get("modelId").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
        name: bank_data.get("name").and_then(|v| v.as_str()).unwrap_or("Imported Bank").to_string(),
        isFactory: bank_data.get("isFactory").and_then(|v| v.as_bool()).unwrap_or(false),
        isLocked: bank_data.get("isLocked").and_then(|v| v.as_bool()).unwrap_or(false),
        source: bank_data.get("source").and_then(|v| v.as_str()).map(|s| s.to_string()),
        creationDate: bank_data.get("creationDate").and_then(|v| v.as_str()).unwrap_or(&chrono::Utc::now().to_rfc3339()).to_string(),
        modifiedDate: bank_data.get("modifiedDate").and_then(|v| v.as_str()).unwrap_or(&chrono::Utc::now().to_rfc3339()).to_string(),
        hardwareIds: bank_data.get("hardwareIds").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default(),
        manufacturer: bank_data.get("manufacturer").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        patches: vec![],
    };

    let bank_id = bank.id.clone();
    database.create_bank(bank).map_err(|e| e.to_string())?;

    // Parse patches
    for (i, patch_data) in patches_data.iter().enumerate() {
        let raw_data_file = patch_data.get("rawDataFile").and_then(|v| v.as_str()).unwrap_or("");
        let raw_data = if !raw_data_file.is_empty() {
            if let Ok(mut file) = archive.by_name(raw_data_file) {
                let mut buf = Vec::new();
                file.read_to_end(&mut buf).ok();
                if !buf.is_empty() { Some(buf) } else { None }
            } else { None }
        } else { None };

        let patch = crate::database::Patch {
            id: patch_data.get("id").and_then(|v| v.as_str()).unwrap_or(&uuid::Uuid::new_v4().to_string()).to_string(),
            bankId: bank_id.clone(),
            index: patch_data.get("index").and_then(|v| v.as_i64()).unwrap_or(i as i64) as i32,
            name: patch_data.get("name").and_then(|v| v.as_str()).unwrap_or(&format!("Patch {}", i)).to_string(),
            category: patch_data.get("category").and_then(|v| v.as_str()).unwrap_or("Other").to_string(),
            author: patch_data.get("author").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            tags: patch_data.get("tags").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default(),
            notes: patch_data.get("notes").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            rawData: raw_data,
            hardwareIds: patch_data.get("hardwareIds").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default(),
            parameters: patch_data.get("parameters").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_else(|| serde_json::json!({})),
            fingerprint: patch_data.get("fingerprint").and_then(|v| v.as_str()).map(|s| s.to_string()),
            isFavorite: patch_data.get("isFavorite").and_then(|v| v.as_bool()).unwrap_or(false),
            rating: patch_data.get("rating").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            versionNumber: patch_data.get("versionNumber").and_then(|v| v.as_i64()).unwrap_or(1) as i32,
            previousVersionId: patch_data.get("previousVersionId").and_then(|v| v.as_str()).map(|s| s.to_string()),
            creationDate: patch_data.get("creationDate").and_then(|v| v.as_str()).unwrap_or(&chrono::Utc::now().to_rfc3339()).to_string(),
            modifiedDate: patch_data.get("modifiedDate").and_then(|v| v.as_str()).unwrap_or(&chrono::Utc::now().to_rfc3339()).to_string(),
        };

        database.create_patch(patch).map_err(|e| e.to_string())?;
    }

    Ok(bank_id)
}

fn import_json(
    database: &crate::database::Database,
    file_path: &Path,
) -> Result<String, String> {
    let text = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    let model_id = data.get("modelId").or_else(|| data.get("bank").and_then(|b| b.get("modelId")))
        .and_then(|v| v.as_str()).unwrap_or("unknown");
    let bank_name = data.get("name").or_else(|| data.get("bank").and_then(|b| b.get("name")))
        .and_then(|v| v.as_str()).unwrap_or("Imported Bank");

    let bank = crate::database::Bank {
        id: data.get("id").or_else(|| data.get("bank").and_then(|b| b.get("id")))
            .and_then(|v| v.as_str()).unwrap_or(&uuid::Uuid::new_v4().to_string()).to_string(),
        modelId: model_id.to_string(),
        name: bank_name.to_string(),
        isFactory: false,
        isLocked: false,
        source: Some(file_path.file_name().unwrap().to_string_lossy().to_string()),
        creationDate: chrono::Utc::now().to_rfc3339(),
        modifiedDate: chrono::Utc::now().to_rfc3339(),
        hardwareIds: data.get("hardwareIds").or_else(|| data.get("bank").and_then(|b| b.get("hardwareIds")))
            .and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default(),
        manufacturer: data.get("manufacturer").or_else(|| data.get("bank").and_then(|b| b.get("manufacturer")))
            .and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
        patches: vec![],
    };

    let bank_id = bank.id.clone();
    database.create_bank(bank).map_err(|e| e.to_string())?;

    let patches_data = data.get("patches").or_else(|| data.get("bank").and_then(|b| b.get("patches")))
        .and_then(|v| v.as_array()).ok_or("JSON must contain patches array")?;

    for (i, patch_data) in patches_data.iter().enumerate() {
        let raw_data = patch_data.get("rawData")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|n| n.as_u64().map(|b| b as u8)).collect());

        let patch = crate::database::Patch {
            id: patch_data.get("id").and_then(|v| v.as_str()).unwrap_or(&uuid::Uuid::new_v4().to_string()).to_string(),
            bankId: bank_id.clone(),
            index: patch_data.get("index").and_then(|v| v.as_i64()).unwrap_or(i as i64) as i32,
            name: patch_data.get("name").and_then(|v| v.as_str()).unwrap_or(&format!("Patch {}", i)).to_string(),
            category: patch_data.get("category").and_then(|v| v.as_str()).unwrap_or("Other").to_string(),
            author: patch_data.get("author").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            tags: patch_data.get("tags").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default(),
            notes: patch_data.get("notes").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            rawData: raw_data,
            hardwareIds: patch_data.get("hardwareIds").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default(),
            parameters: patch_data.get("parameters").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_else(|| serde_json::json!({})),
            fingerprint: patch_data.get("fingerprint").and_then(|v| v.as_str()).map(|s| s.to_string()),
            isFavorite: patch_data.get("isFavorite").and_then(|v| v.as_bool()).unwrap_or(false),
            rating: patch_data.get("rating").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            versionNumber: patch_data.get("versionNumber").and_then(|v| v.as_i64()).unwrap_or(1) as i32,
            previousVersionId: patch_data.get("previousVersionId").and_then(|v| v.as_str()).map(|s| s.to_string()),
            creationDate: chrono::Utc::now().to_rfc3339(),
            modifiedDate: chrono::Utc::now().to_rfc3339(),
        };

        database.create_patch(patch).map_err(|e| e.to_string())?;
    }

    Ok(bank_id)
}

fn import_sysex(
    database: &crate::database::Database,
    file_path: &Path,
    _deduplication: Option<&str>,
) -> Result<String, String> {
    let data = fs::read(file_path).map_err(|e| e.to_string())?;
    let messages = split_sysex_messages(&data);

    if messages.is_empty() {
        return Err("No valid SysEx messages found (F0...F7)".to_string());
    }

    // Determine model from first message
    let (model_id, manufacturer) = identify_sysex_model(&messages[0]).unwrap_or(("unknown", "Unknown"));

    let bank = crate::database::Bank {
        id: uuid::Uuid::new_v4().to_string(),
        modelId: model_id.to_string(),
        name: file_path.file_stem().unwrap().to_string_lossy().to_string(),
        isFactory: false,
        isLocked: false,
        source: Some(file_path.file_name().unwrap().to_string_lossy().to_string()),
        creationDate: chrono::Utc::now().to_rfc3339(),
        modifiedDate: chrono::Utc::now().to_rfc3339(),
        hardwareIds: vec![],
        manufacturer: manufacturer.to_string(),
        patches: vec![],
    };

    let bank_id = bank.id.clone();
    database.create_bank(bank).map_err(|e| e.to_string())?;

    for (i, msg) in messages.iter().enumerate() {
        let raw_data = Some(msg.to_vec());
        let patch = crate::database::Patch {
            id: uuid::Uuid::new_v4().to_string(),
            bankId: bank_id.clone(),
            index: i as i32,
            name: format!("Patch {}", i + 1),
            category: "Other".to_string(),
            author: "".to_string(),
            tags: vec![],
            notes: "".to_string(),
            rawData: raw_data,
            hardwareIds: vec![],
            parameters: serde_json::json!({}),
            fingerprint: None,
            isFavorite: false,
            rating: 0,
            versionNumber: 1,
            previousVersionId: None,
            creationDate: chrono::Utc::now().to_rfc3339(),
            modifiedDate: chrono::Utc::now().to_rfc3339(),
        };

        database.create_patch(patch).map_err(|e| e.to_string())?;
    }

    Ok(bank_id)
}

fn split_sysex_messages(data: &[u8]) -> Vec<Vec<u8>> {
    let mut messages = Vec::new();
    let mut start = 0;

    for (i, &byte) in data.iter().enumerate() {
        if byte == 0xF0 {
            start = i;
        } else if byte == 0xF7 && start < i {
            messages.push(data[start..=i].to_vec());
            start = i + 1;
        }
    }

    messages
}

fn identify_sysex_model(msg: &[u8]) -> Option<(&'static str, &'static str)> {
    // Minimal manufacturer/model identification
    if msg.len() >= 3 {
        match (msg[1], msg[2]) {
            (0x00, 0x20) if msg.len() > 4 && msg[3] == 0x32 => {
                // Behringer: 0x00 0x20 0x32
                match msg.get(4) {
                    Some(0x10) => Some(("behringer-pro800", "Behringer")), // Pro-800
                    Some(0x20) => Some(("behringer-deepmind12", "Behringer")), // DeepMind 12
                    _ => Some(("behringer", "Behringer")),
                }
            }
            (0x43, _) => Some(("yamaha-dx7", "Yamaha")), // Yamaha (DX7, etc.)
            (0x41, _) => Some(("roland", "Roland")), // Roland
            (0x42, _) => Some(("korg", "Korg")), // Korg
            _ => None,
        }
    } else {
        None
    }
}

fn export_abdbank(
    bank: &crate::database::Bank,
    patches: &[crate::database::Patch],
    file_path: &str,
) -> Result<(), String> {
    let path = Path::new(file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut zip = zip::ZipWriter::new(fs::File::create(path).map_err(|e| e.to_string())?);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(6));

    // Write patch blobs
    for (i, patch) in patches.iter().enumerate() {
        if let Some(raw) = &patch.rawData {
            if !raw.is_empty() {
                let filename = format!("patch_{:03}.bin", i);
                zip.start_file(&filename, options).map_err(|e| e.to_string())?;
                zip.write_all(raw).map_err(|e| e.to_string())?;
            }
        }
    }

    // Write manifest
    let patch_entries: Vec<serde_json::Value> = patches.iter().enumerate().map(|(i, p)| {
        serde_json::json!({
            "index": p.index,
            "name": p.name,
            "address": format!("0:{}", i),
            "category": p.category,
            "author": p.author,
            "tags": p.tags,
            "notes": p.notes,
            "isFavorite": p.isFavorite,
            "rating": p.rating,
            "rawDataFile": format!("patch_{:03}.bin", i),
            "parameters": p.parameters,
            "fingerprint": p.fingerprint,
            "versionNumber": p.versionNumber,
            "previousVersionId": p.previousVersionId,
        })
    }).collect();

    let manifest = serde_json::json!({
        "version": 1,
        "format": "abdbank",
        "bank": {
            "id": bank.id,
            "name": bank.name,
            "modelId": bank.modelId,
            "hardwareIds": bank.hardwareIds,
            "manufacturer": bank.manufacturer,
            "isFactory": bank.isFactory,
            "isLocked": bank.isLocked,
            "creationDate": bank.creationDate,
            "modifiedDate": bank.modifiedDate,
            "patchCount": patches.len(),
            "source": bank.source,
            "description": "",
            "bankAuthor": "",
            "license": "",
            "tags": [],
            "bankNotes": "",
            "firmwareCompat": "",
            "knownIssues": "",
            "imageUrl": null
        },
        "patches": patch_entries,
        "contract": {
            "modelId": bank.modelId,
            "patchDataSize": patches.first().and_then(|p| p.rawData.as_ref().map(|d| d.len())).unwrap_or(0),
            "bankCapacity": patches.len(),
            "banksCount": 1,
            "programsPerBank": patches.len()
        }
    });

    zip.start_file("manifest.json", options).map_err(|e| e.to_string())?;
    zip.write_all(serde_json::to_string_pretty(&manifest).unwrap().as_bytes()).map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;

    Ok(())
}

fn export_json(
    bank: &crate::database::Bank,
    patches: &[crate::database::Patch],
    file_path: &str,
) -> Result<(), String> {
    let path = Path::new(file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let data = serde_json::json!({
        "bank": {
            "id": bank.id,
            "name": bank.name,
            "modelId": bank.modelId,
            "hardwareIds": bank.hardwareIds,
            "manufacturer": bank.manufacturer,
            "creationDate": bank.creationDate
        },
        "patches": patches.iter().map(|p| {
            serde_json::json!({
                "name": p.name,
                "category": p.category,
                "author": p.author,
                "tags": p.tags,
                "notes": p.notes,
                "rawData": p.rawData.as_ref().map(|d| d.iter().map(|b| *b as u64).collect::<Vec<_>>()).unwrap_or_default(),
                "parameters": p.parameters,
                "fingerprint": p.fingerprint,
                "isFavorite": p.isFavorite,
                "rating": p.rating,
                "versionNumber": p.versionNumber
            })
        }).collect::<Vec<_>>()
    });

    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;

    Ok(())
}

fn export_sysex(
    bank: &crate::database::Bank,
    patches: &[crate::database::Patch],
    file_path: &str,
) -> Result<(), String> {
    let path = Path::new(file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut sysex_parts = Vec::new();

    for (i, patch) in patches.iter().enumerate() {
        if let Some(raw) = &patch.rawData {
            if !raw.is_empty() {
                // If rawData already looks like a SysEx message (starts with F0, ends with F7), use as-is
                // Otherwise wrap it in a basic SysEx wrapper
                if raw.len() >= 2 && raw[0] == 0xF0 && raw[raw.len() - 1] == 0xF7 {
                    sysex_parts.push(raw.clone());
                } else {
                    // Wrap in a basic single-voice SysEx (generic format)
                    let mut msg = Vec::with_capacity(raw.len() + 6);
                    msg.push(0xF0);
                    msg.push(0x43); // Yamaha as default manufacturer
                    msg.push(0x10); // Device ID
                    msg.push(0x00); // Model ID placeholder
                    msg.push(i as u8); // Patch number
                    msg.extend_from_slice(raw);
                    msg.push(0xF7);
                    sysex_parts.push(msg);
                }
            }
        }
    }

    if sysex_parts.is_empty() {
        return Err("No SysEx data to export".to_string());
    }

    let total_size: usize = sysex_parts.iter().map(|v| v.len()).sum();
    let mut combined = Vec::with_capacity(total_size);
    for part in sysex_parts {
        combined.extend_from_slice(&part);
    }

    fs::write(path, combined).map_err(|e| e.to_string())?;

    Ok(())
}

// MIDI commands
#[derive(Serialize)]
pub struct MidiPort {
    pub id: String,
    pub name: String,
    pub is_input: bool,
    pub is_output: bool,
}

#[command]
pub async fn get_midi_ports() -> Result<Vec<MidiPort>, String> {
    match midir::MidiInput::new("ABD Bank Manager") {
        Ok(midi_in) => {
            let ports = midi_in.ports();
            let mut result = Vec::new();
            for (i, port) in ports.iter().enumerate() {
                let name = midi_in.port_name(port).unwrap_or_else(|_| format!("Port {}", i));
                result.push(MidiPort {
                    id: format!("in_{}", i),
                    name,
                    is_input: true,
                    is_output: false,
                });
            }
            if let Ok(midi_out) = midir::MidiOutput::new("ABD Bank Manager") {
                for (i, port) in midi_out.ports().iter().enumerate() {
                    let name = midi_out.port_name(port).unwrap_or_else(|_| format!("Port {}", i));
                    result.push(MidiPort {
                        id: format!("out_{}", i),
                        name,
                        is_input: false,
                        is_output: true,
                    });
                }
            }
            Ok(result)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub async fn open_midi_port(port_id: String, is_input: bool) -> Result<(), String> {
    println!("Opening MIDI port: {} (input: {})", port_id, is_input);
    Ok(())
}

#[command]
pub async fn close_midi_port(_port_id: String) -> Result<(), String> {
    Ok(())
}

#[derive(Deserialize)]
pub struct SendSysexArgs {
    pub port_id: String,
    pub data: Vec<u8>,
}

#[command]
pub async fn send_sysex(args: SendSysexArgs) -> Result<(), String> {
    if let Some(idx_str) = args.port_id.strip_prefix("out_") {
        if let Ok(idx) = idx_str.parse::<usize>() {
            if let Ok(midi_out) = midir::MidiOutput::new("ABD Bank Manager") {
                let ports = midi_out.ports();
                if idx < ports.len() {
                    let mut conn = midi_out.connect(&ports[idx], "ABD Bank Manager")
                        .map_err(|e| e.to_string())?;
                    conn.send(&args.data).map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }
        }
    }
    Err("Invalid output port".to_string())
}

#[derive(Deserialize)]
pub struct RequestSysexDumpArgs {
    pub port_id: String,
    pub model_id: String,
    pub slot: u8,
}

#[command]
pub async fn request_sysex_dump(args: RequestSysexDumpArgs) -> Result<Vec<u8>, String> {
    let dump_request = match args.model_id.as_str() {
        "behringer-pro800" => build_pro800_dump_request(args.slot),
        "behringer-deepmind12" => build_dm12_dump_request(args.slot),
        "yamaha-dx7" => build_dx7_dump_request(args.slot),
        _ => return Err("Unsupported model for dump request".to_string()),
    };
    
    if let Some(idx_str) = args.port_id.strip_prefix("out_") {
        if let Ok(idx) = idx_str.parse::<usize>() {
            if let Ok(midi_out) = midir::MidiOutput::new("ABD Bank Manager") {
                let ports = midi_out.ports();
                if idx < ports.len() {
                    let mut conn = midi_out.connect(&ports[idx], "ABD Bank Manager")
                        .map_err(|e| e.to_string())?;
                    conn.send(&dump_request).map_err(|e| e.to_string())?;
                    return Ok(vec![]);
                }
            }
        }
    }
    Err("Invalid output port".to_string())
}

// Model-specific dump request builders
fn build_pro800_dump_request(slot: u8) -> Vec<u8> {
    vec![0xF0, 0x00, 0x20, 0x32, 0x10, 0x01, 0x10, slot, 0xF7]
}

fn build_dm12_dump_request(slot: u8) -> Vec<u8> {
    vec![0xF0, 0x00, 0x20, 0x32, 0x20, 0x01, 0x02, 0x00, slot, 0xF7]
}

fn build_dx7_dump_request(_slot: u8) -> Vec<u8> {
    vec![0xF0, 0x43, 0x10, 0x09, 0x20, 0x00, 0xF7]
}