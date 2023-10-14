// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { extractFunctionDefinitionInfo, getHoverInfoForArgument } from './hover/functionvalidators';
import { inferVariableTypes } from './hover/inferTypes';
import { isBuiltInScope } from './hover/scopes';
import { isValidCfVariable } from './hover/validators';
import { checkCfOutput, checkCfScript } from './diagnostics/scriptTagTest';
import { extractFunctionNamesFromLine } from './diagnostics/extractFunctionNames';
import { cfCheck, numericCheck, stringCheck } from './diagnostics/validate';


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

			//Check if its in tags

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
	const diagnostics: vscode.Diagnostic[] = [];
	const variableAssignments = /(\w+)\s*=\s*[^;\n]+[;\n]?/g;
	const variableUsage = /\b(\w+(\.\w+)*)\b(?![\s]*["'=])/g;
	const cfloopPattern = /<cfloop[^>]*index="(\w+)"[^>]*>/g;
	let insideCfScript = false;
	let insideCfOutput = false;
	let match;

	// List of ColdFusion keywords to exclude

	while (match = variableAssignments.exec(text)) {
		allVariables.add(match[1]);
	}

	while (match = cfloopPattern.exec(text)) {
		allVariables.add(match[1]);
	}

	for (let lineNo = 0; lineNo < document.lineCount; lineNo++) {
		const line = document.lineAt(lineNo).text;

		// Check for context
		insideCfScript = checkCfScript(line, insideCfScript);
		insideCfOutput = checkCfOutput(line, insideCfOutput);

		if (line.trim().startsWith('//')) {
			continue;
		}

		// Extract function names from the line
		const functionNames = extractFunctionNamesFromLine(line);

		// Check for variable usage
		while (match = variableUsage.exec(line)) {
			const variable = match[1];
			const rootVariable = variable.split('.')[0]; // Extract the root variable

			// If the root variable is known, skip the diagnostic
			if (allVariables.has(rootVariable)) {
				continue;
			}

			// If not inside cfscript or cfoutput, skip processing
			if (!insideCfScript && !insideCfOutput) {
				continue;
			}

			// If inside cfoutput but the variable is not wrapped with #, skip processing
			if (insideCfOutput && !line.includes('#' + variable + '#')) {
				continue;
			}

			// If its a string literal, skip processing
			if (!stringCheck(line, match)) {
				continue;
			}

			// If its a number, skip processing
			if (!numericCheck(line, match)) {
				continue;
			}

			// If the variable is a function name, ignore it
			if (functionNames.has(variable)) {
				continue;
			}

			if (!cfCheck(variable)) {
				continue;
			}

			// If the variable is not known, add a diagnostic
			if (!allVariables.has(variable)) {
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
