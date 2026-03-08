// Library module for cantool sample

pub fn parse_input(input: &str) -> Result<Vec<String>, String> {
    if input.is_empty() {
        return Err("Empty input".to_string());
    }

    let parts: Vec<String> = input
        .split(',')
        .map(|s| s.trim().to_string())
        .collect();

    Ok(parts)
}

pub fn validate_config(config: &str) -> bool {
    config.contains("version")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_input() {
        let result = parse_input("a, b, c").unwrap();
        assert_eq!(result, vec!["a", "b", "c"]);
    }
}
