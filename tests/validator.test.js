/**
 * Validator 測試
 */
const {
    validateNumber,
    validateString,
    validatePositiveInteger,
    sanitizeInput,
    validateDate
} = require('../utils/validator');

describe('Validator - validateNumber', () => {
    test('should validate valid numbers', () => {
        const result = validateNumber('123', 1, 200);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(123);
    });

    test('should reject non-numbers', () => {
        const result = validateNumber('abc');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('數字');
    });

    test('should reject numbers outside range', () => {
        const result = validateNumber('300', 1, 200);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('1');
        expect(result.error).toContain('200');
    });

    test('should accept numbers at boundaries', () => {
        expect(validateNumber('1', 1, 100).valid).toBe(true);
        expect(validateNumber('100', 1, 100).valid).toBe(true);
    });
});

describe('Validator - validatePositiveInteger', () => {
    test('should validate positive integers', () => {
        const result = validatePositiveInteger('10', 100);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(10);
    });

    test('should reject zero', () => {
        const result = validatePositiveInteger('0');
        expect(result.valid).toBe(false);
    });

    test('should reject negative numbers', () => {
        const result = validatePositiveInteger('-5');
        expect(result.valid).toBe(false);
    });

    test('should reject decimals', () => {
        const result = validatePositiveInteger('5.5');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('整數');
    });

    test('should respect max limit', () => {
        const result = validatePositiveInteger('150', 100);
        expect(result.valid).toBe(false);
    });
});

describe('Validator - validateString', () => {
    test('should validate and trim strings', () => {
        const result = validateString('   test   ', 2, 50);
        expect(result.valid).toBe(true);
        expect(result.value).toBe('test');
    });

    test('should reject too short strings', () => {
        const result = validateString('a', 3, 50);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('3');
    });

    test('should reject too long strings', () => {
        const result = validateString('a'.repeat(100), 1, 50);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('50');
    });

    test('should reject non-strings', () => {
        const result = validateString(123);
        expect(result.valid).toBe(false);
    });
});

describe('Validator - sanitizeInput', () => {
    test('should escape HTML characters', () => {
        const input = '<script>alert(1)</script>';
        const output = sanitizeInput(input);
        expect(output).not.toContain('<');
        expect(output).not.toContain('>');
        expect(output).toContain('&lt;');
        expect(output).toContain('&gt;');
    });

    test('should escape quotes', () => {
        const input = '"test" and \'test\'';
        const output = sanitizeInput(input);
        expect(output).toContain('&quot;');
        expect(output).toContain('&#x27;');
    });

    test('should return non-strings unchanged', () => {
        expect(sanitizeInput(123)).toBe(123);
        expect(sanitizeInput(null)).toBe(null);
    });
});

describe('Validator - validateDate', () => {
    test('should validate correct date format', () => {
        const result = validateDate('2026-01-02');
        expect(result.valid).toBe(true);
        expect(result.value).toBeInstanceOf(Date);
    });

    test('should reject invalid date format', () => {
        const result = validateDate('01/02/2026');
        expect(result.valid).toBe(false);
    });

    test('should reject invalid dates', () => {
        const result = validateDate('2026-13-45');
        expect(result.valid).toBe(false);
    });
});
