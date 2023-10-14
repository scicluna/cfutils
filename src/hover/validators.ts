// Check if the word is a valid ColdFusion variable
export function isValidCfVariable(word: string) {
    const isValid = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(word);
    return isValid;
}