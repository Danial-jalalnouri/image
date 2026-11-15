import { SignIn } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <Suspense>
        <SignIn appearance={{ theme: dark }} />
      </Suspense>
    </div>
  );
}
