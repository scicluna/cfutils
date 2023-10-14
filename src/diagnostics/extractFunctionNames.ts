export function extractFunctionNamesFromLine(line: string): Set<string> {
    const functionDefinitions = /function (\w+)\(/g;
    const functionCalls = /(\w+)\(/g;
    const functionNames = new Set<string>();
    let funcMatch;

    // Capture function names from definitions
    while (funcMatch = functionDefinitions.exec(line)) {
        functionNames.add(funcMatch[1]);
    }

    // Capture function names from calls
    while (funcMatch = functionCalls.exec(line)) {
        functionNames.add(funcMatch[1]);
    }

    return functionNames;
}