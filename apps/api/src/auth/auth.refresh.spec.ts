import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

const SECRET = 'test-secret';

function setup(userActive = true) {
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '12h' } });
  const user = { id: 5, username: 'amy', email: null, name: 'Amy', role: 'staff', storeId: 1 };
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue(userActive ? user : null) },
    store: { findUnique: jest.fn().mockResolvedValue({ features: { pos: true } }) },
  };
  return { jwt, prisma, svc: new AuthService(prisma as never, jwt) };
}

describe('AuthService refresh tokens', () => {
  it('exchanges a refresh token for a new access token and a new refresh token', async () => {
    const { jwt, svc } = setup();
    const refreshToken = await svc.issueRefreshToken(5);
    const result = await svc.refresh(refreshToken);

    expect(result.user).toMatchObject({ id: 5, storeFeatures: { pos: true } });
    const access = await jwt.verifyAsync(result.accessToken);
    expect(access.sub).toBe(5);
    expect(access.typ).toBeUndefined();
    const next = await jwt.verifyAsync(result.refreshToken);
    expect(next).toMatchObject({ sub: 5, typ: 'refresh' });
    // 180 天（滑動延長）
    expect(next.exp - next.iat).toBe(180 * 86_400);
  });

  it('rejects an access token used as a refresh token', async () => {
    const { jwt, svc } = setup();
    const access = await jwt.signAsync({ sub: 5 });
    await expect(svc.refresh(access)).rejects.toMatchObject({ code: 'AUTH_SESSION_EXPIRED' });
  });

  it('rejects expired, forged or missing refresh tokens', async () => {
    const { jwt, svc } = setup();
    const expired = await jwt.signAsync({ sub: 5, typ: 'refresh' }, { expiresIn: -10 });
    const forged = await new JwtService({ secret: 'other' }).signAsync({ sub: 5, typ: 'refresh' });
    await expect(svc.refresh(expired)).rejects.toMatchObject({ code: 'AUTH_SESSION_EXPIRED' });
    await expect(svc.refresh(forged)).rejects.toMatchObject({ code: 'AUTH_SESSION_EXPIRED' });
    await expect(svc.refresh(undefined)).rejects.toMatchObject({ code: 'AUTH_SESSION_EXPIRED' });
  });

  it('rejects when the user has been deactivated', async () => {
    const { svc } = setup(false);
    const refreshToken = await svc.issueRefreshToken(5);
    await expect(svc.refresh(refreshToken)).rejects.toMatchObject({ code: 'AUTH_SESSION_EXPIRED' });
  });
});

describe('JwtStrategy', () => {
  it('refuses refresh tokens as API credentials', async () => {
    const prisma = { user: { findFirst: jest.fn() } };
    const strategy = new JwtStrategy(prisma as never);
    await expect(strategy.validate({ sub: 5, typ: 'refresh' })).rejects.toMatchObject({ code: 'AUTH_SESSION_EXPIRED' });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
