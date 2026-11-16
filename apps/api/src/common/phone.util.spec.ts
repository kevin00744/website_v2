import { formatPhoneDisplay, normalizePhone, normalizePhoneOrNull, phoneVariants } from './phone.util';

describe('phone.util', () => {
  it.each([
    ['0981-675-415', '0981675415'],
    ['0981 675 415', '0981675415'],
    ['0981675415', '0981675415'],
    ['+886981675415', '0981675415'],
    ['886-981-675-415', '0981675415'],
    ['(02) 2345-6789', '0223456789'],
    [null, ''],
    [undefined, ''],
  ])('normalizePhone(%s) → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('normalizePhoneOrNull turns empty into null', () => {
    expect(normalizePhoneOrNull('')).toBeNull();
    expect(normalizePhoneOrNull(' - ')).toBeNull();
    expect(normalizePhoneOrNull('0912-345-678')).toBe('0912345678');
  });

  it('phoneVariants covers digits and legacy dashed storage', () => {
    expect(phoneVariants('0981675415')).toEqual(['0981675415', '0981-675-415']);
    expect(phoneVariants('0223456789')).toEqual(['0223456789', '0223-456-789']);
    expect(phoneVariants('12345')).toEqual(['12345']);
  });

  it('formatPhoneDisplay adds dashes only to mobile numbers', () => {
    expect(formatPhoneDisplay('0981675415')).toBe('0981-675-415');
    expect(formatPhoneDisplay('0223456789')).toBe('0223456789');
    expect(formatPhoneDisplay(null)).toBeNull();
  });
});
