import type { LoaderFunctionArgs } from "@vercel/remix";
import { authenticator } from "~/services/auth.server";
import { getRedirectTo } from "~/services/redirectTo.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const redirectTo = await getRedirectTo(request);

  await authenticator.authenticate("email-link", request, {
    successRedirect: redirectTo ?? "/",
    failureRedirect: "/login/magic",
  });
}
