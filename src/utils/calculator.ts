export function evaluateMath(expression: string): string | null {
    // Remove whitespace
    const cleanExpr = expression.replace(/\s+/g, '');

    // Check if it looks like a math expression
    // Allow numbers, operators (+, -, *, /, %, ^), parentheses, and decimals
    // Must contain at least one operator to be considered a calculation
    // const mathRegex = /^[\d\.\(\)]+[\+\-\*\/\%\^][\d\.\(\)\+\-\*\/\%\^]*$/; // Unused


    // Also allow simple expressions like "1+1" which might be caught above, 
    // but we want to be strict to avoid evaluating random text.
    // Let's use a broader regex for validation but ensure it's ONLY math chars.
    const validCharsRegex = /^[\d\+\-\*\/\%\^\(\)\.]+$/;

    if (!validCharsRegex.test(cleanExpr)) {
        return null;
    }

    // Must have at least one operator or be a single number (though single number usually doesn't need calc)
    if (!/[\+\-\*\/\%\^]/.test(cleanExpr)) {
        return null;
    }

    try {
        // Use Function constructor for evaluation (safer than eval, but still needs input sanitization which we did above)
        // Note: JS doesn't support ^ for power natively in this context without Math.pow, 
        // so we might need to replace ^ with ** if we want to support it, or just stick to basic arithmetic.
        // Let's replace ^ with **
        const jsExpr = cleanExpr.replace(/\^/g, '**');

        const func = new Function(`return ${jsExpr}`);
        const result = func();

        if (typeof result === 'number' && isFinite(result)) {
            // Format to avoid long decimals if possible, or just return as string
            return result.toString();
        }
    } catch (e) {
        // Syntax error or other issue
        return null;
    }

    return null;
}
