import { createHmac } from 'crypto';
import { isValidMobile, namesMatch, normalizePhone, verifyLineSignature } from './line.util';

describe('verifyLineSignature', () => {
  const secret = 'test-secret';
  const body = Buffer.from(JSON.stringify({ events: [] }));
  const good = createHmac('sha256', secret).update(body).digest('base64');

  it('accepts a correct signature', () => {
    expect(verifyLineSignature(body, good, secret)).toBe(true);
  });

  it('rejects a wrong signature, wrong secret, or missing values', () => {
    expect(verifyLineSignature(body, createHmac('sha256', 'other').update(body).digest('base64'), secret)).toBe(false);
    expect(verifyLineSignature(Buffer.from('{"events":[1]}'), good, secret)).toBe(false);
    expect(verifyLineSignature(body, undefined, secret)).toBe(false);
    expect(verifyLineSignature(body, good, '')).toBe(false);
    expect(verifyLineSignature(body, 'short', secret)).toBe(false);
  });
});

describe('normalizePhone / isValidMobile', () => {
  it.each([
    ['0912-345-678', '0912345678'],
    ['0912 345 678', '0912345678'],
    ['+886912345678', '0912345678'],
    ['886-912-345-678', '0912345678'],
    [null, ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('validates Taiwan mobile numbers', () => {
    expect(isValidMobile('0912345678')).toBe(true);
    expect(isValidMobile('091234567')).toBe(false);
    expect(isValidMobile('0212345678')).toBe(false);
  });
});

describe('namesMatch', () => {
  it('ignores whitespace but is otherwise exact', () => {
    expect(namesMatch('王 小明', '王小明')).toBe(true);
    expect(namesMatch('王小明', '王小名')).toBe(false);
    expect(namesMatch('', '')).toBe(false);
  });
});
