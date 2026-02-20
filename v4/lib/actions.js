/**
 * Action module for executing action functions with recognition results
 */

/**
 * Runs action functions with recognition results
 * @param {Array} recognitionResults - Recognition results array from recognize() function
 * @param {Array<Function>} actionFunctions - Array of functions to execute, each receiving recognitionResults as parameter
 * @returns {Promise<Array>} Results from all action functions
 */
export async function action(recognitionResults, actionFunctions = []) {
    if (!Array.isArray(actionFunctions) || actionFunctions.length === 0) {
        return [];
    }

    if (!Array.isArray(recognitionResults)) {
        console.warn('action: recognitionResults is not an array');
        return [];
    }

    const results = [];
    
    for (const actionFn of actionFunctions) {
        if (typeof actionFn !== 'function') {
            console.warn('action: skipping non-function item in actionFunctions array');
            continue;
        }

        try {
            const result = await Promise.resolve(actionFn(recognitionResults));
            results.push(result);
        } catch (error) {
            console.error('Error executing action function:', error);
            results.push({ error: error.message });
        }
    }

    return results;
}
