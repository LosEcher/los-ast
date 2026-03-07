// Cantool Sample - Small Rust project for los-ast validation

fn main() {
    let config = load_config();
    println!("Starting cantool with config: {:?}", config);

    let result = process_data("input");
    println!("Result: {}", result);
}

fn load_config() -> String {
    // TODO: Add proper error handling
    let config = std::fs::read_to_string("config.toml").unwrap();
    config
}

fn process_data(input: &str) -> String {
    let data = input.to_string();
    data.to_uppercase()
}

fn unused_helper() {
    println!("This function is not used");
}

// Intentional issues for testing:
// 1. unwrap() usage (should trigger no-unwrap rule)
// 2. println! usage (if detected)
// 3. Unused function
