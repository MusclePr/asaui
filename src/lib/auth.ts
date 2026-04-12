import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { createHash, timingSafeEqual } from "node:crypto";

type RoleUser = {
  id: string;
  name: string;
  role: "admin" | "simple";
};

function getRoleFromUser(user: unknown): string | undefined {
  if (typeof user !== "object" || user === null || !("role" in user)) return undefined;
  const role = (user as { role?: unknown }).role;
  return typeof role === "string" ? role : undefined;
}

function timingSafePasswordEquals(input: string | undefined, expected: string | undefined): boolean {
  if (!input || !expected) return false;
  const inputDigest = createHash("sha256").update(input, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(inputDigest, expectedDigest);
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (timingSafePasswordEquals(credentials?.password, process.env.ASAUI_PASSWORD)) {
          const user: RoleUser = { id: "admin", name: "Administrator", role: "admin" };
          return user;
        }
        if (timingSafePasswordEquals(credentials?.password, process.env.ASAUI_SIMPLE_PASSWORD)) {
          const user: RoleUser = { id: "simple", name: "Viewer", role: "simple" };
          return user;
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const role = getRoleFromUser(user);
      if (role) {
        token.role = role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = typeof token.role === "string" ? token.role : undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
