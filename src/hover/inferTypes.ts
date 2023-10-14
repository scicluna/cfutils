import * as vscode from 'vscode';

export function inferVariableTypes(documentText: string, document: vscode.TextDocument, functionReturnTypes: { [key: string]: string }): { [key: string]: { type: string, position: vscode.Position }[] } {
    const variableAssignments = /(\w+)\s*=\s*([^;\n]+)/g;
    const variableTypes: { [key: string]: { type: string, position: vscode.Position }[] } = {};
    let match;

    while (match = variableAssignments.exec(documentText)) {
        const variableName = match[1];
        const assignedValue = match[2].trim();
        const assignmentPosition = document.positionAt(match.index);

        // Check for function calls in variable assignments
        const functionCallRegex = /(\w+)\(/;
        const functionCallMatch = functionCallRegex.exec(assignedValue);

        let inferredType = 'any';
        if (functionCallMatch) {
            const calledFunction = functionCallMatch[1];
            inferredType = functionReturnTypes[calledFunction] || inferredType;
        } else {
            if (/^["']/.test(assignedValue)) {
                inferredType = 'string';
            } else if (/^\d+$/.test(assignedValue)) {
                inferredType = 'numeric';
            } else if (/^\d+\.\d+$/.test(assignedValue)) {
                inferredType = 'numeric';
            } else if (/^(true|false)$/.test(assignedValue)) {
                inferredType = 'boolean';
            } else if (/^createObject\("java",/.test(assignedValue)) {
                inferredType = 'Java Object';
            } else if (/^structNew\(\)/.test(assignedValue) || /^\{.*\}$/.test(assignedValue)) {
                inferredType = 'struct';
            } else if (/^arrayNew\(\d\)/.test(assignedValue) || /^\[.*\]$/.test(assignedValue)) {
                inferredType = 'array';
            } else if (/^createObject\("component"/.test(assignedValue) || /\.cfc$/.test(assignedValue)) {
                inferredType = 'CFC';
            } else if (/^queryNew\(/.test(assignedValue)) {
                inferredType = 'query';
            } else if (/^dateAdd\(/.test(assignedValue) || /^now\(\)/.test(assignedValue)) {
                inferredType = 'date/time';
            } else if (/^createUUID\(\)/.test(assignedValue)) {
                inferredType = 'UUID';
            } // ... (other type checks)
        }

        if (!variableTypes[variableName]) {
            variableTypes[variableName] = [];
        }
        variableTypes[variableName].push({ type: inferredType, position: assignmentPosition });
    }

    return variableTypes;
}