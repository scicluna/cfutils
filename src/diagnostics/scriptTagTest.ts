export function checkCfScript(line: string, currentState: boolean): boolean {
    if (line.includes('<cfscript>')) {
        return true;
    } else if (line.includes('</cfscript>')) {
        return false;
    }

    return currentState;
}

export function checkCfOutput(line: string, currentState: boolean): boolean {
    if (line.includes('<cfoutput')) {
        return true;
    } else if (line.includes('</cfoutput')) {
        return false;
    }
    return currentState;
}