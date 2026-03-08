// Mini JS Sample - For quick validation of los-ast scan

function greet(name) {
  console.log(`Hello, ${name}!`);
}

function calculateSum(a, b) {
  return a + b;
}

const result = calculateSum(1, 2);
greet('World');

// Intentional issues for testing:
// 1. console.log usage
// 2. Unused variable 'result'
