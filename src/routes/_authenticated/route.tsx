import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      const path = location.pathname;
      // Route unauthed visitors to the correct sign-in surface for what they tried to reach.
      let to: "/auth" | "/owner-login" | "/student-login" = "/owner-login";
      if (path.startsWith("/super-admin")) to = "/auth";
      else if (path.startsWith("/student")) to = "/student-login";
      throw redirect({ to });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
