export function isBuiltInScope(word: string) {
    const builtInScopes = new Set(['form', 'CGI', 'session', 'application', 'variables', 'request', 'cgi', 'cookie', 'url', 'this', 'arguments']);
    return builtInScopes.has(word.toLowerCase());
}