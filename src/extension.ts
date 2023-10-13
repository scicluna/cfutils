// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const cfmlDiagnostics = vscode.languages.createDiagnosticCollection('cfml');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.languages.registerHoverProvider(['cfml', 'cfc'], {
		provideHover(document, position, token) {
			const range = document.getWordRangeAtPosition(position);
			const word = document.getText(range);

			// Check if the word is a valid ColdFusion variable
			const isValidVariable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(word);
			if (!isValidVariable) {
				return;
			}

			const functionRegex = /public (\w+) function (\w+)\(([^)]*)\)/g;
			let match;
			const functionReturnTypes: { [key: string]: string } = {};
			const functionArguments: { [key: string]: { [argName: string]: string } } = {};

			while (match = functionRegex.exec(document.getText())) {
				const returnType = match[1];
				const functionName = match[2];
				functionReturnTypes[functionName] = returnType;

				const args = match[3].split(',').reduce((acc: any, arg) => {
					const [type, name] = arg.trim().split(' ');
					acc[name] = type;
					return acc;
				}, {});

				functionArguments[functionName] = args;
			}

			// Check if the hovered word is an argument inside a function
			const functionBodyRegex = /function \w+\(([^)]*)\)\s*{([\s\S]*?)}/g;
			while (match = functionBodyRegex.exec(document.getText())) {
				const args = match[1];
				const body = match[2].split('\n'); // Split the body into lines

				for (const line of body) {
					if (line.includes(word)) {
						const argNames = args.split(',').map(arg => arg.trim().split(' ')[1]);
						if (argNames.includes(word)) {
							for (const functionName in functionArguments) {
								console.log(functionArguments[functionName]);
								if (functionArguments[functionName][word]) {
									return new vscode.Hover(`Argument: **${word}** : _${functionArguments[functionName][word]}_`);
								}
							}
						}
					}
				}
			}


			const variableAssignments = /(\w+)\s*=\s*([^;\n]+)/g;
			const variableTypes: { [key: string]: { type: string, position: vscode.Position }[] } = {};

			while (match = variableAssignments.exec(document.getText())) {
				const variableName = match[1];
				const assignedValue = match[2].trim();
				const assignmentPosition = document.positionAt(match.index);

				// Check for function calls in variable assignments
				const functionCallRegex = /(\w+)\(/;
				const functionCallMatch = functionCallRegex.exec(assignedValue);

				let inferredType = 'unknown';
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
					} // ... (other type checks)
				}

				if (!variableTypes[variableName]) {
					variableTypes[variableName] = [];
				}
				variableTypes[variableName].push({ type: inferredType, position: assignmentPosition });
			}

			// Provide hover information for the variable
			if (variableTypes[word]) {
				// Find the most recent assignment before the hover position
				let recentType: string | null = null;
				for (let i = variableTypes[word].length - 1; i >= 0; i--) {
					if (variableTypes[word][i].position.isBefore(position)) {
						recentType = variableTypes[word][i].type;
						break;
					}
				}

				if (recentType) {
					return new vscode.Hover(`Variable: **${word}** : _${recentType}_`);
				}
			}
		}
	}));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
		if (event.document.languageId === 'cfml') {
			updateDiagnostics(event.document, cfmlDiagnostics);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => {
		if (document.languageId === 'cfml') {
			updateDiagnostics(document, cfmlDiagnostics);
		}
	}));

	// Clear diagnostics when a document is closed:
	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => cfmlDiagnostics.delete(document.uri)));

}

function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
	const text = document.getText();
	const allVariables = new Set<string>();

	// List of ColdFusion keywords to exclude
	const cfKeywords = new Set([
		'public', 'return', 'function', 'numeric', 'string', 'boolean', 'void', 'private', 'component', 'property', 'if', 'else', 'for', 'while', 'do', 'var', 'local',
		'parameterexists', 'preservesinglequotes', 'quotedvaluelist', 'valuelist', 'now', 'hash', 'form', 'session', 'neq', 'is',
		'default', 'switch', 'case', 'continue', 'import', 'finally', 'interface', 'pageencoding', 'try', 'catch', 'in', 'break',
		'true', 'false', 'final', 'abstract', 'null', 'cfimport'
	]);

	// Capture variable assignments
	const variableAssignments = /(\w+)\s*=\s*.+/g;
	let match;
	while (match = variableAssignments.exec(text)) {
		allVariables.add(match[1]);
	}

	// Capture function names and arguments
	const functionDefinitions = /function \w+\(([^)]*)\)/g;
	while (match = functionDefinitions.exec(text)) {
		const args = match[1].split(',').map(arg => {
			const parts = arg.trim().split(' ');
			return parts.length > 1 ? parts[1] : parts[0]; // If there's a type, get the second part; otherwise, get the first part
		});
		args.forEach(arg => allVariables.add(arg));
	}

	const diagnostics: vscode.Diagnostic[] = [];
	const variableUsage = /\b(\w+)\b/g; // Capture words

	let insideScriptBlock = false;
	let insideCfOutputBlock = false;

	for (let lineNo = 0; lineNo < document.lineCount; lineNo++) {
		const line = document.lineAt(lineNo).text;

		// Check if we're entering or exiting a <cfscript> block
		if (line.includes('<cfscript>')) {
			insideScriptBlock = true;
			continue;
		} else if (line.includes('</cfscript>')) {
			insideScriptBlock = false;
			continue;
		}

		// Check if we're entering or exiting a <cfoutput> block
		if (line.includes('<cfoutput>')) {
			insideCfOutputBlock = true;
		} else if (line.includes('</cfoutput>')) {
			insideCfOutputBlock = false;
		}

		while (match = variableUsage.exec(line)) {
			const variable = match[1];

			// Check if the word is a number or a string
			if (/^\d+$/.test(variable) || /["'].*["']/.test(variable)) {
				continue;
			}

			const precedingChar = line[match.index - 1];
			const followingChar = line[match.index + variable.length];

			// If we're outside a <cfscript> block and not inside a <cfoutput> block, ensure variable is enclosed within # #
			if (!insideScriptBlock && !insideCfOutputBlock && (precedingChar !== '#' || followingChar !== '#')) {
				continue;
			}

			// Check if the word is a function call
			const isFunctionCall = followingChar === '(';

			// If we're outside a <cfscript> block, ensure variable is enclosed within # #
			if (!insideScriptBlock && (precedingChar !== '#' || followingChar !== '#')) {
				continue;
			}

			// Check if the word is a ColdFusion keyword or a known variable
			if (!allVariables.has(variable) && !cfKeywords.has(variable.toLowerCase()) && !isFunctionCall) {
				const range = new vscode.Range(lineNo, match.index, lineNo, match.index + variable.length);
				const diagnostic = new vscode.Diagnostic(range, `The variable "${variable}" is not defined.`, vscode.DiagnosticSeverity.Error);
				diagnostics.push(diagnostic);
			}
		}
	}

	collection.set(document.uri, diagnostics);
}

// This method is called when your extension is deactivated
export function deactivate() {
	cfmlDiagnostics.dispose();
}
