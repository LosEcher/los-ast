// Utils module for mini-js sample

function unusedFunction() {
  console.log('This function is never called');
}

function processData(data) {
  console.log('Processing:', data);
  return data.toUpperCase();
}

module.exports = { processData };
