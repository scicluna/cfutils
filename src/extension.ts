// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { extractFunctionDefinitionInfo, getHoverInfoForArgument } from './hover/functionvalidators';
import { inferVariableTypes } from './hover/inferTypes';
import { isBuiltInScope } from './hover/scopes';
import { isValidCfVariable } from './hover/validators';


const cfmlDiagnostics = vscode.languages.createDiagnosticCollection('cfml');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.languages.registerHoverProvider(['cfml', 'cfc'], {
		provideHover(document, position, token) {
			const text = document.getText();
			const range = document.getWordRangeAtPosition(position);
			const word = document.getText(range);

			// Check if the word is a valid ColdFusion variable
			if (!isValidCfVariable(word)) {
				return;
			}

			// Check if the word is a ColdFusion scope
			if (isBuiltInScope(word)) {
				return new vscode.Hover(`Scope: **${word}**`);
			}

			// Extract function definitions to get return types and arguments
			const { functionReturnTypes, functionArguments } = extractFunctionDefinitionInfo(text);

			// Check if the hovered word is an argument inside a function
			const hoverInfoForArg = getHoverInfoForArgument(text, word, functionArguments);
			if (hoverInfoForArg) {
				return hoverInfoForArg;
			}

			// Infer variable types using the function return types
			const inferredTypes = inferVariableTypes(text, document, functionReturnTypes);

			// Provide hover information for the variable
			if (inferredTypes[word]) {
				// Find the most recent assignment before the hover position
				let recentType: string | null = null;
				for (let i = inferredTypes[word].length - 1; i >= 0; i--) {
					if (inferredTypes[word][i].position.isBefore(position)) {
						recentType = inferredTypes[word][i].type;
						break;
					}
				}

				if (recentType) {
					return new vscode.Hover(`Variable: **${word}** : _${recentType}_`);
				}
			}
		}
	}));

	//add listeners for diagnostics
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

//Handle diagnostics
function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
	const text = document.getText();
	const allVariables = new Set<string>();

	// List of ColdFusion keywords to exclude
	const cfKeywords = new Set([
		'public', 'return', 'function', 'numeric', 'string', 'boolean', 'void', 'private', 'component', 'property', 'if', 'else', 'for', 'while', 'do', 'var', 'local',
		'parameterexists', 'preservesinglequotes', 'quotedvaluelist', 'valuelist', 'now', 'hash', 'form', 'session', 'neq', 'is',
		'default', 'switch', 'case', 'continue', 'import', 'finally', 'interface', 'pageencoding', 'try', 'catch', 'in', 'break',
		'true', 'false', 'final', 'abstract', 'null', 'cfimport', 'httpResult', 'cfhttp', 'cfhttpparam', 'cfquery', 'cfqueryparam', 'form', 'variables', 'AND', 'OR',
	]);

	// Capture variable assignments
	const variableAssignments = /(\w+)\s*=\s*[^;]+\;?/g;
	let match;
	while (match = variableAssignments.exec(text)) {
		allVariables.add(match[1]);
	}

	// Capture function names and arguments
	const functionDefinitions = /function \w+\(([^)]*)\)/g;
	while (match = functionDefinitions.exec(text)) {
		const args = match[1].split(',').map(arg => {
			const parts = arg.trim().split(' ');
			return parts.length > 1 ? parts[1] : parts[0];
		});
		args.forEach(arg => allVariables.add(arg));
	}

	// Capture function calls and their arguments
	// Capture function calls and their arguments
	const functionCalls = /(\w+)\(([^)]*)\)/g;
	while (match = functionCalls.exec(text)) {
		const functionName = match[1];
		allVariables.add(functionName);  // Add function name to known variables

		const args = match[2].split(',').map(arg => arg.trim());
		args.forEach(arg => {
			// Only add the argument if it's not a string
			if (!arg.startsWith('"') && !arg.startsWith("'")) {
				allVariables.add(arg);
			}
		});
	}

	const diagnostics: vscode.Diagnostic[] = [];
	const variableUsage = /\b(\w+(\.\w+)*)\b/g; // Capture words and properties like form.city
	const tagPattern = /<[^>]+>/g;

	for (let lineNo = 0; lineNo < document.lineCount; lineNo++) {
		const line = document.lineAt(lineNo).text;

		if (line.trim().startsWith('//')) {
			continue;
		}

		// Remove content inside tags
		let processedLine = line.replace(tagPattern, '');

		// If the processed line is empty, skip to the next line
		if (!processedLine.trim()) {
			continue;
		}

		while (match = variableUsage.exec(line)) {
			const variable = match[1];

			// Split the variable into parts to check for object properties
			const parts = variable.split('.');
			const baseVariable = parts[0];

			// If the variable is inside a doublequote string literal, ignore it
			if (line.slice(0, match.index).split('"').length % 2 === 0 && line.slice(match.index).split('"').length % 2 === 0) {
				continue;
			}

			// If the variable is inside a singlequote string literal, ignore it
			if (line.slice(0, match.index).split("'").length % 2 === 0 && line.slice(match.index).split("'").length % 2 === 0) {
				continue;
			}

			// If the variable is a ColdFusion keyword, ignore it
			if (cfKeywords.has(variable.toLowerCase())) {
				continue;
			}


			// Check if the base variable is a known variable or a ColdFusion keyword
			if (!allVariables.has(baseVariable) && !cfKeywords.has(baseVariable.toLowerCase())) {
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
