/**
 * 輸入驗證工具模組
 */

/**
 * 驗證數字範圍
 */
function validateNumber(value, min = -Infinity, max = Infinity) {
    const num = Number(value);

    if (isNaN(num)) {
        return { valid: false, error: '請輸入有效的數字' };
    }

    if (num < min || num > max) {
        return { valid: false, error: `數字必須在 ${min} 到 ${max} 之間` };
    }

    return { valid: true, value: num };
}

/**
 * 驗證字串長度
 */
function validateString(value, minLength = 0, maxLength = Infinity) {
    if (typeof value !== 'string') {
        return { valid: false, error: '請輸入文字' };
    }

    const trimmed = value.trim();

    if (trimmed.length < minLength) {
        return { valid: false, error: `至少需要 ${minLength} 個字元` };
    }

    if (trimmed.length > maxLength) {
        return { valid: false, error: `最多 ${maxLength} 個字元` };
    }

    return { valid: true, value: trimmed };
}

/**
 * 驗證是否為正整數
 */
function validatePositiveInteger(value, max = Infinity) {
    const result = validateNumber(value, 1, max);

    if (!result.valid) return result;

    if (!Number.isInteger(result.value)) {
        return { valid: false, error: '請輸入整數' };
    }

    return result;
}

/**
 * 清理用戶輸入（防止 XSS）
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * 驗證日期格式 (YYYY-MM-DD)
 */
function validateDate(value) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (!dateRegex.test(value)) {
        return { valid: false, error: '日期格式錯誤，請使用 YYYY-MM-DD' };
    }

    const date = new Date(value);

    if (isNaN(date.getTime())) {
        return { valid: false, error: '無效的日期' };
    }

    return { valid: true, value: date };
}

module.exports = {
    validateNumber,
    validateString,
    validatePositiveInteger,
    sanitizeInput,
    validateDate
};
