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
			const line = document.lineAt(position).text;

			// Check if the word is a valid ColdFusion variable
			const isValidVariable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(word);
			if (!isValidVariable) {
				return;
			}

			// Extract function return types
			const functionRegex = /public (\w+) function (\w+)\(/g;
			let match;
			const functionReturnTypes: { [key: string]: string } = {};

			while (match = functionRegex.exec(document.getText())) {
				const returnType = match[1];
				const functionName = match[2];
				functionReturnTypes[functionName] = returnType;
			}

			// Check for function calls in variable assignments
			const functionCallRegex = new RegExp(`${word}\\s*=\\s*(\\w+)\\(`);
			const functionCallMatch = functionCallRegex.exec(line);

			if (functionCallMatch) {
				const calledFunction = functionCallMatch[1];
				const inferredType = functionReturnTypes[calledFunction];
				if (inferredType) {
					return new vscode.Hover(`Variable: **${word}** : _${inferredType}_`);
				}
			}

			// Check position relative to equals sign
			const equalsPos = line.indexOf('=');
			const wordPos = line.indexOf(word);
			if (wordPos > equalsPos) {
				return;
			}

			if (line.includes(`${word} =`)) {
				const assignedValue = line.split(`${word} =`)[1].trim();

				// Check for different types of assignments
				if (/^["']/.test(assignedValue)) {
					return new vscode.Hover(`Variable: **${word}** : _string_`);;
				} else if (/^\d+$/.test(assignedValue)) {
					return new vscode.Hover(`Variable: **${word}** : _numeric_`);
				} else if (/^\d+\.\d+$/.test(assignedValue)) {
					return new vscode.Hover(`Variable: **${word}** : _numeric_`);
				} else if (/^(true|false)$/.test(assignedValue)) {
					return new vscode.Hover(`Variable: **${word}** : _boolean_`);
				} else if (/^createObject\("java"/.test(assignedValue)) {
					return new vscode.Hover(`Variable: **${word}** : _Java Object_`);
				} else if (/^structNew\(\)/.test(assignedValue) || /^\{.*\}$/.test(assignedValue)) {
					return new vscode.Hover(`Variable: **${word}** : _struct_`);
				} else if (/^arrayNew\(\d\)/.test(assignedValue) || /^\[.*\]$/.test(assignedValue)) {
					return new vscode.Hover(`Variable: **${word}** : _array_`);
				} else if (/^createObject\("component"/.test(assignedValue) || /\.cfc$/.test(assignedValue)) {
					return new vscode.Hover(`Variable: **${word}** : _CFC_`);
				} else {
					return new vscode.Hover(`Variable: ${word} (Type: unknown)`);
				}
			} else {
				return new vscode.Hover(`BROKEN`);
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
	const functionDefinitions = /function (\w+)\(([^)]*)\)/g;
	while (match = functionDefinitions.exec(text)) {
		const functionName = match[1];
		allVariables.add(functionName); // Add the function name to known identifiers

		const args = match[1].split(',').map(arg => {
			const parts = arg.trim().split(' ');
			return parts.length > 1 ? parts[1] : parts[0];
		});
		args.forEach(arg => allVariables.add(arg));
	}

	const diagnostics: vscode.Diagnostic[] = [];
	const variableUsage = /\b(\w+)\b/g; // Capture words
	while (match = variableUsage.exec(text)) {
		const variable = match[1];
		const precedingChar = text[match.index - 1];
		const followingChar = text[match.index + variable.length];


		// Check if the word is a function call
		const isFunctionCall = followingChar === '(';

		// Check if the word is inside a function call
		const isInsideFunctionCall = followingChar === ',' || followingChar === ')';

		// Check if the word is a number or string
		const isLiteral = /^[0-9]+$/.test(variable) || /^["']/.test(followingChar);

		if (!allVariables.has(variable) && !cfKeywords.has(variable.toLowerCase()) && !isFunctionCall && precedingChar !== '<' && !isInsideFunctionCall && !isLiteral) {
			const range = new vscode.Range(document.positionAt(match.index), document.positionAt(match.index + variable.length));
			const diagnostic = new vscode.Diagnostic(range, `The variable "${variable}" is not defined.`, vscode.DiagnosticSeverity.Error);
			diagnostics.push(diagnostic);
		}
	}

	collection.set(document.uri, diagnostics);
}

// This method is called when your extension is deactivated
export function deactivate() {
	cfmlDiagnostics.dispose();
}
