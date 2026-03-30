import type { Router } from 'express';
import sql from '../db.ts';
import { hashPassword, verifyPassword, signToken, authMiddleware, createRefreshToken, validateRefreshToken, revokeRefreshToken, revokeAllUserTokens, type AuthenticatedRequest } from '../auth.ts';
import { validate, signupSchema, loginSchema, oauthSchema, setPasswordSchema } from '../validation.ts';
import { verifyOAuthToken } from '../oauth.ts';
import { isAdminUser } from '../admin.ts';
import { sendEmail, buildOwnerWelcomeEmail } from '../email.ts';

export default function authRoutes(router: Router): void {
  router.post('/auth/signup', validate(signupSchema), async (req, res) => {
    const { email, password, name } = req.body;

    const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    const passwordHash = hashPassword(password);
    const [user] = await sql`
      INSERT INTO users (email, password_hash, name, roles, approval_status)
      VALUES (${email}, ${passwordHash}, ${name}, ${['owner']}, ${'approved'})
      RETURNING id, email, name, roles, bio, avatar_url, lat, lng, approval_status
    `;
    const token = signToken({ userId: user.id });
    const refreshToken = await createRefreshToken(user.id);

    const welcomeEmail = buildOwnerWelcomeEmail({ ownerName: name });
    sendEmail({ to: email, ...welcomeEmail }).catch(() => {});

    res.status(201).json({ user, token, refreshToken });
  });

  router.post('/auth/login', validate(loginSchema), async (req, res) => {
    const { email, password } = req.body;

    const [user] = await sql`SELECT id, email, name, roles, bio, avatar_url, lat, lng, password_hash, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, approval_status, approval_rejected_reason FROM users WHERE email = ${email}`;
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.password_hash) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (user.approval_status === 'banned') {
      res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
      return;
    }

    const token = signToken({ userId: user.id });
    const refreshToken = await createRefreshToken(user.id);
    const { password_hash: _, ...safeUser } = user;
    res.json({ user: safeUser, token, refreshToken });
  });

  router.post('/auth/oauth', validate(oauthSchema), async (req, res) => {
    const { provider, token } = req.body;

    const profile = await verifyOAuthToken(provider, token);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sql.begin(async (tx: any) => {
      // Check for existing OAuth link
      const [existingOAuth] = await tx`
        SELECT user_id FROM oauth_accounts
        WHERE provider = ${profile.provider} AND provider_id = ${profile.providerId}
      `;

      if (existingOAuth) {
        const [user] = await tx`
          SELECT id, email, name, roles, bio, avatar_url FROM users WHERE id = ${existingOAuth.user_id}
        `;
        return { user, isNewUser: false };
      }

      // Check for existing user by email (only auto-link if provider verified the email)
      if (profile.email && profile.emailVerified) {
        const [existingUser] = await tx`
          SELECT id, email, name, roles, bio, avatar_url FROM users WHERE email = ${profile.email}
        `;

        if (existingUser) {
          await tx`
            INSERT INTO oauth_accounts (user_id, provider, provider_id, email, name, avatar_url)
            VALUES (${existingUser.id}, ${profile.provider}, ${profile.providerId}, ${profile.email}, ${profile.name}, ${profile.avatarUrl})
          `;
          return { user: existingUser, isNewUser: false };
        }
      }

      // Require email for new account creation
      if (!profile.email) {
        throw new Error('Email is required. Please grant email permission and try again.');
      }

      // Create new user
      const [newUser] = await tx`
        INSERT INTO users (email, password_hash, name, roles, email_verified)
        VALUES (${profile.email}, ${null}, ${profile.name || 'User'}, ${['owner']}, ${profile.emailVerified})
        RETURNING id, email, name, roles, bio, avatar_url
      `;

      await tx`
        INSERT INTO oauth_accounts (user_id, provider, provider_id, email, name, avatar_url)
        VALUES (${newUser.id}, ${profile.provider}, ${profile.providerId}, ${profile.email}, ${profile.name}, ${profile.avatarUrl})
      `;

      return { user: newUser, isNewUser: true };
    });

    if (!result.isNewUser) {
      const [fullUser] = await sql`SELECT approval_status FROM users WHERE id = ${result.user.id}`;
      if (fullUser?.approval_status === 'banned') {
        res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
        return;
      }
    }

    const jwtToken = signToken({ userId: result.user.id });
    const refreshToken = await createRefreshToken(result.user.id);

    if (result.isNewUser) {
      const welcomeEmail = buildOwnerWelcomeEmail({ ownerName: result.user.name || 'there' });
      sendEmail({ to: result.user.email, ...welcomeEmail }).catch(() => {});
    }

    res.json({ user: result.user, token: jwtToken, refreshToken, isNewUser: result.isNewUser });
  });

  router.get('/auth/linked-accounts', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const accounts = await sql`
      SELECT provider, email, created_at FROM oauth_accounts WHERE user_id = ${req.userId}
    `;
    res.json({ accounts });
  });

  router.delete('/auth/linked-accounts/:provider', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const { provider } = req.params;
    const validProviders = ['google', 'apple', 'facebook'];
    if (!validProviders.includes(provider)) {
      res.status(400).json({ error: 'Invalid provider' });
      return;
    }

    const [user] = await sql`SELECT password_hash FROM users WHERE id = ${req.userId}`;
    const otherAccounts = await sql`
      SELECT id FROM oauth_accounts WHERE user_id = ${req.userId} AND provider != ${provider}
    `;

    if (!user.password_hash && otherAccounts.length === 0) {
      res.status(400).json({ error: 'Cannot unlink the last authentication method. Set a password first.' });
      return;
    }

    const result = await sql`
      DELETE FROM oauth_accounts WHERE user_id = ${req.userId} AND provider = ${provider}
    `;

    if (result.count === 0) {
      res.status(404).json({ error: 'Linked account not found' });
      return;
    }

    res.json({ message: 'Account unlinked' });
  });

  router.post('/auth/set-password', authMiddleware, validate(setPasswordSchema), async (req: AuthenticatedRequest, res) => {
    const { password } = req.body;

    const [user] = await sql`SELECT password_hash FROM users WHERE id = ${req.userId}`;
    if (user.password_hash) {
      res.status(400).json({ error: 'Password already set. Use profile settings to change it.' });
      return;
    }

    const hashedPassword = hashPassword(password);
    await sql`UPDATE users SET password_hash = ${hashedPassword} WHERE id = ${req.userId}`;

    res.json({ message: 'Password set successfully' });
  });

  router.post('/auth/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'refreshToken is required' });
      return;
    }

    const userId = await validateRefreshToken(refreshToken);
    if (!userId) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    // Rotate: revoke old, issue new pair
    await revokeRefreshToken(refreshToken);
    const newToken = signToken({ userId });
    const newRefreshToken = await createRefreshToken(userId);

    res.json({ token: newToken, refreshToken: newRefreshToken });
  });

  router.post('/auth/logout', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    res.json({ message: 'Logged out' });
  });

  router.post('/auth/logout-all', authMiddleware, async (req: AuthenticatedRequest, res) => {
    await revokeAllUserTokens(req.userId!);
    res.json({ message: 'All sessions logged out' });
  });

  router.get('/auth/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`
      SELECT id, email, name, roles, bio, avatar_url, lat, lng, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, approval_status, approval_rejected_reason FROM users WHERE id = ${req.userId}
    `;
    if (user) {
      res.json({ user: { ...user, is_admin: isAdminUser(user.email, user.roles) } });
    } else {
      res.status(401).json({ error: 'User not found' });
    }
  });
}
