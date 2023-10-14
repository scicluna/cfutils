import * as vscode from 'vscode';

//Extract function definition info
export function extractFunctionDefinitionInfo(documentText: string): {
    functionReturnTypes: { [key: string]: string },
    functionArguments: { [key: string]: { [argName: string]: string } }
} {
    const functionRegex = /public (\w+) function (\w+)\(([^)]*)\)/g;
    const functionReturnTypes: { [key: string]: string } = {};
    const functionArguments: { [key: string]: { [argName: string]: string } } = {};
    let match;

    while (match = functionRegex.exec(documentText)) {
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

    return {
        functionReturnTypes,
        functionArguments
    };
}

//Get Info for Arugments
export function getHoverInfoForArgument(documentText: string, word: string, functionArguments: { [key: string]: { [argName: string]: string } }): vscode.Hover | undefined {
    const functionBodyRegex = /function \w+\(([^)]*)\)\s*{([\s\S]*?)}/g;
    let match;

    while (match = functionBodyRegex.exec(documentText)) {
        const args = match[1];
        const body = match[2].split('\n'); // Split the body into lines

        for (const line of body) {
            if (line.includes(word)) {
                const argNames = args.split(',').map(arg => arg.trim().split(' ')[1]);
                if (argNames.includes(word)) {
                    for (const functionName in functionArguments) {
                        if (functionArguments[functionName][word]) {
                            return new vscode.Hover(`Argument: **${word}** : _${functionArguments[functionName][word]}_`);
                        }
                    }
                }
            }
        }
    }
}