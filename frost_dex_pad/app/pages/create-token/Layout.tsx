import { Outlet, useLocation } from "react-router-dom";
import { Scaffold } from "@orderly.network/ui-scaffold";
import { useOrderlyConfig } from "@/utils/config";
import { useNav } from "@/hooks/useNav";

export default function CreateTokenLayout() {
  const config = useOrderlyConfig();
  const { onRouteChange } = useNav();
  const location = useLocation();

  return (
    <Scaffold
      mainNavProps={{
        ...config.scaffold.mainNavProps,
        initialMenu: "/create-token",
      }}
      footerProps={config.scaffold.footerProps}
      routerAdapter={{
        onRouteChange,
        currentPath: location.pathname,
      }}
      bottomNavProps={config.scaffold.bottomNavProps}
    >
      <Outlet />
    </Scaffold>
  );
}
