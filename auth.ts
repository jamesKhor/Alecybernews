import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const validUsername = process.env.ADMIN_USERNAME;
        // Support both hashed (ADMIN_PASSWORD_HASH) and legacy plaintext (ADMIN_PASSWORD)
        const passwordHash = process.env.ADMIN_PASSWORD_HASH;
        const legacyPassword = process.env.ADMIN_PASSWORD;

        if (!validUsername || (!passwordHash && !legacyPassword)) return null;
        if (credentials.username !== validUsername) return null;

        const password = String(credentials.password);

        if (passwordHash) {
          const valid = await bcrypt.compare(password, passwordHash);
          if (!valid) return null;
        } else if (legacyPassword) {
          if (password !== legacyPassword) return null;
        } else {
          return null;
        }

        return { id: "1", name: "Admin" };
      },
    }),
  ],
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  // Do NOT add an `authorized` callback here — it would block all public routes.
  // Route protection is handled selectively in proxy.ts for /admin/** only.
});
