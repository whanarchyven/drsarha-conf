import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

// Capture additional fields at sign up and store them in users
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params, _ctx) {
        const p = params as any;
        const result: Record<string, any> = { email: p.email };
        if (typeof p.fullName === "string" && p.fullName.length > 0) result.fullName = p.fullName;
        if (typeof p.phone === "string" && p.phone.length > 0) result.phone = p.phone;
        if (typeof p.specialization === "string" && p.specialization.length > 0) result.specialization = p.specialization;
        return result as any;
      },
    }),
  ],
});
