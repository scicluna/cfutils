export function stringCheck(line: string, match: RegExpMatchArray) {
    // Check if the variable is inside a doublequote string literal
    if (line.slice(0, match.index).split('"').length % 2 === 0 && line.slice(match.index).split('"').length % 2 === 0) {
        return false;
    }
    // Check if the variable is inside a singlequote string literal
    if (line.slice(0, match.index).split("'").length % 2 === 0 && line.slice(match.index).split("'").length % 2 === 0) {
        return false;
    }
    return true;
}

export function numericCheck(line: string, match: RegExpMatchArray) {
    // Check if the variable is a number
    if (/^\d+$/.test(match[1])) {
        return false;
    } else if (/^\d+\.\d+$/.test(match[1])) {
        return false;
    }
    return true;
}

export function cfCheck(variable: string) {
    const cfKeywords = new Set([
        'public', 'return', 'function', 'numeric', 'string', 'boolean', 'void', 'private', 'component', 'property', 'if', 'else', 'for', 'while', 'do', 'var', 'local',
        'parameterexists', 'preservesinglequotes', 'quotedvaluelist', 'valuelist', 'now', 'hash', 'form', 'session', 'neq', 'is',
        'default', 'switch', 'case', 'continue', 'import', 'finally', 'interface', 'pageencoding', 'try', 'catch', 'in', 'break',
        'true', 'false', 'final', 'abstract', 'null', 'cfimport', 'httpResult', 'cfhttp', 'cfhttpparam', 'cfquery', 'cfqueryparam', 'form', 'variables', 'AND', 'OR',
        'cfscript', 'cfoutput', 'cfset', 'cfif', 'cfelseif', 'cfelse', 'cfreturn', 'cfbreak', 'cfcontinue', 'cffunction', 'cffunction', 'cfargument', 'cfcomponent', 'cfproperty',
        'CGI', 'session', 'application', 'request', 'cookie', 'url', 'this', 'arguments', 'super', 'include', 'abort', 'try', 'catch', 'finally', 'throw', 'rethrow', 'transaction', 'new'
    ]);

    let test = true;
    // If the variable starts with a ColdFusion keyword followed by a period, ignore it
    for (const keyword of cfKeywords) {
        if (variable.startsWith(keyword + '.') || variable === keyword) {
            test = false;
        }
    }
    return test;
}

