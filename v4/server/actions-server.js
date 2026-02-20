/**
 * Server-side action runner for reasoning/description results.
 * Similar to lib/actions.js but runs functions with description as parameter.
 */

/**
 * Runs action functions with the reasoning result description
 * @param {string} description - Reasoning result description (e.g. from OpenAI)
 * @param {Array<Function>} actionFunctions - Array of functions to execute, each receiving description as parameter
 * @returns {Promise<Array>} Results from all action functions
 */
async function serverAction(description, actionFunctions = []) {
  if (!Array.isArray(actionFunctions) || actionFunctions.length === 0) {
    return [];
  }

  if (description == null || typeof description !== 'string') {
    console.warn('serverAction: description is missing or not a string');
    return [];
  }

  const results = [];

  for (const actionFn of actionFunctions) {
    if (typeof actionFn !== 'function') {
      console.warn('serverAction: skipping non-function item in actionFunctions array');
      continue;
    }

    try {
      const result = await Promise.resolve(actionFn(description));
      results.push(result);
    } catch (error) {
      console.error('Error executing description action function:', error);
      results.push({ error: error.message });
    }
  }

  return results;
}

export { serverAction };
