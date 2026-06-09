//! Codama IDL build script. The IDL is only generated under the `idl` feature,
//! so non-IDL builds (including verified SBF builds) don't pull in codama.

fn main() {
    println!("cargo:rerun-if-changed=src/");
    println!("cargo:rerun-if-env-changed=GENERATE_IDL");

    #[cfg(feature = "idl")]
    if let Err(e) = generate_idl() {
        println!("cargo:warning=Failed to generate IDL: {e}");
    }
}

#[cfg(feature = "idl")]
fn generate_idl() -> Result<(), Box<dyn std::error::Error>> {
    use {
        codama::Codama,
        std::{env, fs, path::Path},
    };

    let manifest_dir = env::var("CARGO_MANIFEST_DIR")?;
    let crate_path = Path::new(&manifest_dir);
    let codama = Codama::load(crate_path)?;
    let idl_json = codama.get_json_idl()?;

    let parsed: serde_json::Value = serde_json::from_str(&idl_json)?;
    let mut formatted_json = serde_json::to_string_pretty(&parsed)?;
    formatted_json.push('\n');

    let project_root = crate_path.parent().unwrap();
    let idl_dir = project_root.join("idl");
    fs::create_dir_all(&idl_dir)?;
    let idl_path = idl_dir.join("crypto_primitives.json");
    fs::write(&idl_path, formatted_json)?;

    println!("cargo:warning=IDL written to: {}", idl_path.display());
    Ok(())
}
